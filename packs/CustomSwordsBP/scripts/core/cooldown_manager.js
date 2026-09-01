/**
 * Centralised, player-scoped ability cooldowns.
 *
 * Design notes that matter for multiplayer correctness:
 *
 *  - Everything is keyed by `player.id` (a stable string), never by a `Player`
 *    object. Entity handles go stale across dimension changes and relogs; ids
 *    do not. This is what guarantees player A's cooldown can never be read or
 *    written as player B's.
 *  - Time comes from an injected clock (`system.currentTick` in game, a fake in
 *    tests). `currentTick` is a single server-side monotonic counter, so every
 *    player is measured against the same clock with no drift and no per-player
 *    tick loops.
 *  - Nothing here ticks. Expiry is computed lazily on read. The only recurring
 *    work is `sweep()`, which the bootstrap calls every 30s purely to release
 *    memory for players who have gone offline.
 */

/** @typedef {() => number} Clock */

export class CooldownManager {
    /**
     * @param {Clock} clock Returns the current tick.
     */
    constructor(clock) {
        /** @private @readonly @type {Clock} */
        this.clock = clock;
        /** @private @type {Map<string, Map<string, number>>} playerId -> (key -> expiry tick) */
        this.byPlayer = new Map();
    }

    /**
     * Starts (or restarts) a cooldown.
     *
     * @param {string} playerId
     * @param {string} key Cooldown key, normally the sword id.
     * @param {number} ticks Duration. Values <= 0 are treated as "no cooldown".
     */
    start(playerId, key, ticks) {
        if (!Number.isFinite(ticks) || ticks <= 0) return;
        let keys = this.byPlayer.get(playerId);
        if (keys === undefined) {
            keys = new Map();
            this.byPlayer.set(playerId, keys);
        }
        keys.set(key, this.clock() + Math.ceil(ticks));
    }

    /**
     * @param {string} playerId
     * @param {string} key
     * @returns {number} Ticks remaining, 0 when ready.
     */
    remaining(playerId, key) {
        const keys = this.byPlayer.get(playerId);
        if (keys === undefined) return 0;
        const expiry = keys.get(key);
        if (expiry === undefined) return 0;
        const left = expiry - this.clock();
        if (left <= 0) {
            // Lazy expiry: drop the entry the moment anyone notices it is done.
            keys.delete(key);
            if (keys.size === 0) this.byPlayer.delete(playerId);
            return 0;
        }
        return left;
    }

    /**
     * @param {string} playerId
     * @param {string} key
     * @returns {boolean}
     */
    isReady(playerId, key) {
        return this.remaining(playerId, key) === 0;
    }

    /**
     * @param {string} playerId
     * @param {string} key
     */
    clear(playerId, key) {
        const keys = this.byPlayer.get(playerId);
        if (keys === undefined) return;
        keys.delete(key);
        if (keys.size === 0) this.byPlayer.delete(playerId);
    }

    /**
     * Drops every cooldown for one player. Called on `playerLeave` so that a
     * disconnected player leaves no residue behind.
     *
     * @param {string} playerId
     */
    clearPlayer(playerId) {
        this.byPlayer.delete(playerId);
    }

    /** Drops every cooldown for every player. Test/administrative use. */
    clearAll() {
        this.byPlayer.clear();
    }

    /**
     * Removes expired entries and empty player buckets.
     *
     * @returns {number} Number of entries removed.
     */
    sweep() {
        const now = this.clock();
        let removed = 0;
        for (const [playerId, keys] of this.byPlayer) {
            for (const [key, expiry] of keys) {
                if (expiry - now <= 0) {
                    keys.delete(key);
                    removed++;
                }
            }
            if (keys.size === 0) this.byPlayer.delete(playerId);
        }
        return removed;
    }

    /** @returns {number} Number of players with at least one live cooldown. */
    get trackedPlayerCount() {
        return this.byPlayer.size;
    }

    /**
     * @param {string} playerId
     * @returns {number} Number of live cooldown keys for that player.
     */
    keyCountFor(playerId) {
        return this.byPlayer.get(playerId)?.size ?? 0;
    }
}
