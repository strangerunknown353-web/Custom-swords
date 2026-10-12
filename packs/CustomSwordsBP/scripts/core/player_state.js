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

/**
 * The storage key for a mark, in whichever scope it was written.
 *
 * @param {string} name
 * @param {boolean} lifeScoped
 * @returns {string}
 */
function markKey(name, lifeScoped) {
    return lifeScoped ? lifeKey(name) : `mark:${name}`;
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
     * Adds to a life-scoped stacking counter and returns the new total, clamped
     * to `max`. The generic "this sword builds something up as you fight it"
     * primitive.
     *
     * Life-scoped deliberately: a combo or heat meter should not survive death.
     * Clamping here rather than in each ability means no ability can leak an
     * unbounded counter, and the clamp is tested once instead of per sword.
     *
     * @param {string} playerId
     * @param {string} name Bare name; the `life:` prefix is applied here.
     * @param {number} [amount] Defaults to 1.
     * @param {number} [max] Defaults to 10.
     * @returns {number} The new total.
     */
    addCharge(playerId, name, amount = 1, max = 10) {
        if (!Number.isFinite(amount) || !Number.isFinite(max) || max < 0) return this.charges(playerId, name);
        return this.update(playerId, lifeKey(name), 0, (current) => {
            const total = (Number.isFinite(current) ? current : 0) + amount;
            return Math.max(0, Math.min(max, total));
        });
    }

    /**
     * Reads a stacking counter without changing it.
     *
     * @param {string} playerId
     * @param {string} name
     * @returns {number}
     */
    charges(playerId, name) {
        const value = this.get(playerId, lifeKey(name), 0);
        return Number.isFinite(value) ? value : 0;
    }

    /**
     * Reads a stacking counter and resets it to zero — the "spend what you have
     * built up" half of the primitive.
     *
     * @param {string} playerId
     * @param {string} name
     * @returns {number} The value before the reset.
     */
    spendCharges(playerId, name) {
        const value = this.charges(playerId, name);
        this.delete(playerId, lifeKey(name));
        return value;
    }

    /**
     * Records that something happened, at a tick.
     *
     * The third shape of per-player state the framework needs, after resources
     * (`addCharge`) and counters: a **combo window**. One ability marks, another
     * asks how long ago — which is how Shadow Sword's passive knows the wielder
     * has just blinked without the two abilities referring to each other.
     *
     * Life-scoped, so a window cannot survive the death that ended the combo.
     *
     * ## Surviving death
     *
     * Life-scoped by default, so a window cannot outlast the death that ended
     * the combo. Pass `lifeScoped: false` for a mark that should survive
     * respawning — Time Sword's temporal charge does, because it belongs to the
     * sword rather than to the body holding it, and because a life-scoped
     * version would read as *absent* after a death and so grant a full charge.
     * Dying to recharge a weapon is the exact shape of exploit cooldowns are
     * deliberately not life-scoped to avoid.
     *
     * @param {string} playerId
     * @param {string} name
     * @param {number} tick
     * @param {{ lifeScoped?: boolean }} [options]
     */
    mark(playerId, name, tick, options = {}) {
        if (!Number.isFinite(tick)) return;
        this.set(playerId, markKey(name, options.lifeScoped !== false), tick);
    }

    /**
     * Ticks elapsed since a mark, or `Infinity` when it was never set.
     *
     * `Infinity` rather than `-1` or `undefined` so the natural comparison —
     * `sinceMark(...) <= windowTicks` — is false for an absent mark without the
     * caller having to special-case it.
     *
     * Must be given the same `lifeScoped` value the mark was written with, or it
     * will read a different key and report `Infinity`.
     *
     * @param {string} playerId
     * @param {string} name
     * @param {number} tick
     * @param {{ lifeScoped?: boolean }} [options]
     * @returns {number}
     */
    sinceMark(playerId, name, tick, options = {}) {
        const at = this.get(playerId, markKey(name, options.lifeScoped !== false), undefined);
        if (!Number.isFinite(at) || !Number.isFinite(tick)) return Number.POSITIVE_INFINITY;
        const elapsed = tick - /** @type {number} */ (at);
        // A clock that appears to run backwards means the world reloaded under
        // us; treat the mark as gone rather than as infinitely fresh.
        return elapsed < 0 ? Number.POSITIVE_INFINITY : elapsed;
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
