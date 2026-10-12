/**
 * What the world is doing, for abilities that care.
 *
 * The framework's services have so far all answered questions about *entities*
 * — where they are, how hurt they are, what they are suffering. This one
 * answers questions about the **world the fight is happening in**, which is a
 * category of condition no sword could previously read at all.
 *
 * ## Why this is a service and not two lines in an ability
 *
 * Abilities never import `@minecraft/server`; `world.getTimeOfDay()` lives
 * behind the engine boundary, so reaching it needs a service. Putting it here
 * rather than on `EffectService` keeps the layering honest — effects are about
 * entities, this is about everything else — and gives the obvious home to the
 * world reads a later sword will want: weather for a storm blade, depth for a
 * deep-earth one.
 *
 * ## Cost
 *
 * One engine call per activation, at most. Nothing here polls, caches or
 * subscribes: an ability asks at the moment it fires and never again, which is
 * the same event-driven shape as every other read in the framework.
 */

import { world } from '@minecraft/server';

/** @typedef {import('@minecraft/server').Dimension} Dimension */

/**
 * Ticks in a Minecraft day. `getTimeOfDay` returns 0-23999, with 0 at sunrise
 * and 6000 at noon.
 */
const DAY_TICKS = 24000;
const NOON = 6000;

/**
 * Dimensions the sun reaches. The Nether and the End have a sky but no sun, and
 * a solar weapon that worked identically in the Nether would be a solar weapon
 * in name only.
 */
const SUNLIT_DIMENSIONS = Object.freeze(new Set(['minecraft:overworld']));

export class EnvironmentService {
    /**
     * @param {typeof import('../core/log.js').log} log
     * @param {{ getTimeOfDay: () => number }} [clock] Injectable for tests; defaults to the engine world.
     */
    constructor(log, clock = world) {
        /** @private @readonly */
        this.log = log;
        /** @private @readonly */
        this.clock = clock;
    }

    /**
     * How high the sun stands, as 1 at noon falling to 0 at and around
     * midnight.
     *
     * A cosine over the day rather than a step at dusk: a sword that switched
     * off at a fixed hour would be a rule to memorise, while one that fades
     * through the evening is something a player feels. Clamped at 0 so the
     * whole night reads as "no sun" instead of going negative.
     *
     * Returns 0 outside a sunlit dimension, whatever the clock says.
     *
     * Never throws. An unreadable clock reports **0** — no sun — which fails
     * towards *withholding* the bonus, matching every other conditional read in
     * the framework.
     *
     * @param {Dimension} [dimension] Omit to ignore the dimension check.
     * @returns {number} 0..1
     */
    daylight(dimension) {
        if (dimension !== undefined && !this.isSunlit(dimension)) return 0;
        try {
            const time = this.clock.getTimeOfDay();
            if (!Number.isFinite(time)) return 0;
            // cos peaks at noon and troughs at midnight; the clamp flattens the
            // whole night to zero rather than letting it run to -1.
            const phase = ((time - NOON) / DAY_TICKS) * Math.PI * 2;
            return Math.max(0, Math.cos(phase));
        } catch (error) {
            this.log.debug('environment.daylight failed:', error);
            return 0;
        }
    }

    /**
     * Whether the sun reaches this dimension at all.
     *
     * @param {Dimension} dimension
     * @returns {boolean}
     */
    isSunlit(dimension) {
        try {
            return SUNLIT_DIMENSIONS.has(dimension?.id);
        } catch {
            return false;
        }
    }
}
