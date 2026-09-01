/**
 * Per-player scratch storage for abilities (combo counters, charge levels,
 * "last target" memory, and similar).
 *
 * The rule this enforces: abilities never keep module-level mutable state. Any
 * state they need is stored here under the acting player's id, so two players
 * using the same sword at the same time can never collide.
 *
 * State is deliberately in-memory only. It is rebuilt from nothing on world
 * reload, which is the correct behaviour for transient combat state; anything
 * that must survive a restart belongs in dynamic properties instead (see
 * TODO.md).
 *
 * ## Lifecycle
 *
 * Keys are namespaced by scope so the framework can clear the right subset at
 * the right moment:
 *
 * | Scope | Cleared on | Use for |
 * |---|---|---|
 * | `life:*`  | death and disconnect | charge levels, combo counters, in-flight ability state |
 * | (other)   | disconnect only      | anything that should survive a respawn |
 *
 * A player who dies mid-combo should not respawn still holding it, and an
 * ability that was winding up when its caster died must not resume. Cooldowns
 * are deliberately NOT in the `life:` scope: dying to reset a long cooldown
 * would be an exploit.
 */

/**
 * Prefix marking a key as valid only for the player's current life.
 * Use {@link lifeKey} rather than writing it out.
 */
export const LIFE_SCOPE = 'life:';

/**
 * Builds a life-scoped key, cleared automatically on death and respawn.
 *
 * @param {string} name
 * @returns {string}
 */
export function lifeKey(name) {
    return `${LIFE_SCOPE}${name}`;
}

export class PlayerStateStore {
    constructor() {
        /** @private @type {Map<string, Map<string, unknown>>} */
        this.byPlayer = new Map();
    }

    /**
     * @template T
     * @param {string} playerId
     * @param {string} key
     * @param {T} fallback Returned (and NOT stored) when the key is unset.
     * @returns {T}
     */
    get(playerId, key, fallback) {
        const bucket = this.byPlayer.get(playerId);
        if (bucket === undefined) return fallback;
        const value = bucket.get(key);
        return value === undefined ? fallback : /** @type {T} */ (value);
    }

    /**
     * @param {string} playerId
     * @param {string} key
     * @param {unknown} value
     */
    set(playerId, key, value) {
        let bucket = this.byPlayer.get(playerId);
        if (bucket === undefined) {
            bucket = new Map();
            this.byPlayer.set(playerId, bucket);
        }
        bucket.set(key, value);
    }

    /**
     * Read-modify-write helper, so abilities do not have to hand-roll it.
     *
     * @template T
     * @param {string} playerId
     * @param {string} key
     * @param {T} fallback
     * @param {(current: T) => T} updater
     * @returns {T} The new value.
     */
    update(playerId, key, fallback, updater) {
        const next = updater(this.get(playerId, key, fallback));
        this.set(playerId, key, next);
        return next;
    }

    /**
     * @param {string} playerId
     * @param {string} key
     */
    delete(playerId, key) {
        const bucket = this.byPlayer.get(playerId);
        if (bucket === undefined) return;
        bucket.delete(key);
        if (bucket.size === 0) this.byPlayer.delete(playerId);
    }

    /** @param {string} playerId */
    clearPlayer(playerId) {
        this.byPlayer.delete(playerId);
    }

    /**
     * Drops only the life-scoped keys for a player, leaving everything else.
     * Called when a player dies or respawns.
     *
     * @param {string} playerId
     * @returns {number} Number of keys dropped.
     */
    clearLifeScope(playerId) {
        const bucket = this.byPlayer.get(playerId);
        if (bucket === undefined) return 0;
        let removed = 0;
        for (const key of [...bucket.keys()]) {
            if (key.startsWith(LIFE_SCOPE)) {
                bucket.delete(key);
                removed++;
            }
        }
        if (bucket.size === 0) this.byPlayer.delete(playerId);
        return removed;
    }

    clearAll() {
        this.byPlayer.clear();
    }

    /**
     * Drops state for every player not in `livePlayerIds`. Safety net for the
     * rare case where a `playerLeave` event is missed.
     *
     * @param {Iterable<string>} livePlayerIds
     * @returns {number} Number of players dropped.
     */
    retainOnly(livePlayerIds) {
        const live = new Set(livePlayerIds);
        let removed = 0;
        for (const playerId of [...this.byPlayer.keys()]) {
            if (!live.has(playerId)) {
                this.byPlayer.delete(playerId);
                removed++;
            }
        }
        return removed;
    }

    /** @returns {number} */
    get trackedPlayerCount() {
        return this.byPlayer.size;
    }
}
