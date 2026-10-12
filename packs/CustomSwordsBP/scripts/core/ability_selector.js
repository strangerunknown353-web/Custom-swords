/**
 * Ability selection — which of a sword's abilities right-click casts.
 *
 * A sword carries an ordered list of selectable abilities: every binding whose
 * activation is `use`. The player cycles through them by crouching and casts
 * the selected one with use. The on-hit passive (`attack`) is never selected;
 * it is always on.
 *
 * Selection is remembered per player *per sword*, so switching Frost to its
 * third ability does not move Inferno off its first. It is held in memory for
 * speed and mirrored to a player dynamic property so it survives a relog. Both
 * the read and the write are guarded: a world or engine that refuses dynamic
 * properties still gets working, session-only selection.
 *
 * Nothing here schedules work or subscribes to events.
 */

import { NAMESPACE, localNameOf } from './identifiers.js';

/** Prefix of the per-sword dynamic property that stores the selected index. */
export const MODE_PROPERTY_PREFIX = `${NAMESPACE}:mode_`;

/**
 * @typedef {Object} SelectionResult
 * @property {import('./types.js').AbilityBinding} binding The newly selected binding.
 * @property {number} index Zero-based position of that binding.
 * @property {number} count How many selectable abilities the sword has.
 */

export class AbilitySelector {
    /**
     * @param {{ swords: import('./sword_registry.js').SwordRegistry, log: typeof import('./log.js').log }} deps
     */
    constructor({ swords, log }) {
        this.swords = swords;
        this.log = log;
        /** @type {Map<string, Map<string, number>>} playerId -> swordId -> index */
        this.byPlayer = new Map();
    }

    /**
     * @param {string} swordId
     * @returns {readonly import('./types.js').AbilityBinding[]}
     */
    modes(swordId) {
        return this.swords.getUseBindings(swordId);
    }

    /**
     * @param {import('@minecraft/server').Player} player
     * @param {string} swordId
     * @returns {number}
     */
    index(player, swordId) {
        const count = this.modes(swordId).length;
        if (count <= 1) return 0;

        let bucket = this.byPlayer.get(player.id);
        let stored = bucket?.get(swordId);
        if (stored === undefined) {
            stored = this.load(player, swordId);
            if (bucket === undefined) {
                bucket = new Map();
                this.byPlayer.set(player.id, bucket);
            }
            bucket.set(swordId, stored);
        }
        // A sword that lost abilities in an update must not index past its end.
        return stored >= 0 && stored < count ? stored : 0;
    }

    /**
     * @param {import('@minecraft/server').Player} player
     * @param {string} swordId
     * @returns {import('./types.js').AbilityBinding | undefined}
     */
    current(player, swordId) {
        return this.modes(swordId)[this.index(player, swordId)];
    }

    /**
     * Moves to the next selectable ability, wrapping at the end.
     *
     * @param {import('@minecraft/server').Player} player
     * @param {string} swordId
     * @returns {SelectionResult | undefined} Undefined when there is nothing to switch between.
     */
    cycle(player, swordId) {
        const modes = this.modes(swordId);
        if (modes.length <= 1) return undefined;
        const next = (this.index(player, swordId) + 1) % modes.length;
        this.select(player, swordId, next);
        return { binding: modes[next], index: next, count: modes.length };
    }

    /**
     * @param {import('@minecraft/server').Player} player
     * @param {string} swordId
     * @param {number} index
     */
    select(player, swordId, index) {
        let bucket = this.byPlayer.get(player.id);
        if (bucket === undefined) {
            bucket = new Map();
            this.byPlayer.set(player.id, bucket);
        }
        bucket.set(swordId, index);
        try {
            player.setDynamicProperty(propertyFor(swordId), index);
        } catch (error) {
            this.log.debug('Saving the selected ability failed; keeping it for this session only:', error);
        }
    }

    /**
     * @param {import('@minecraft/server').Player} player
     * @param {string} swordId
     * @returns {number}
     */
    load(player, swordId) {
        try {
            const value = player.getDynamicProperty(propertyFor(swordId));
            return typeof value === 'number' && Number.isInteger(value) ? value : 0;
        } catch {
            return 0;
        }
    }

    /** @param {string} playerId */
    clearPlayer(playerId) {
        this.byPlayer.delete(playerId);
    }

    /**
     * @param {Iterable<string>} livePlayerIds
     * @returns {number} Buckets dropped.
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
}

/**
 * @param {string} swordId
 * @returns {string}
 */
export function propertyFor(swordId) {
    return `${MODE_PROPERTY_PREFIX}${localNameOf(swordId)}`;
}
