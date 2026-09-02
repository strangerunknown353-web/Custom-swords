/**
 * Pure helpers shared by abilities.
 *
 * Abilities receive every capability through `ctx.services` and import nothing
 * from the engine — that rule is what keeps them testable, and
 * `tools/validate.mjs` enforces it. This module is the one exception the rule
 * always allowed: **plain functions over plain numbers**, importing nothing at
 * all, engine included.
 *
 * ## Why it exists
 *
 * By the fourteenth sword, five abilities had each written their own version of
 * "measure how far this target is, and do not throw if its handle has gone
 * stale":
 *
 * | Ability | Was called | Measured |
 * |---|---|---|
 * | `burst` | `falloff` | distance, mapped to a damage ramp |
 * | `cleave` | `angleFalloff` | angle, mapped to the same ramp |
 * | `nova` | `nearnessOf` | distance, inverted |
 * | `rift` | `reachFraction` | distance, as a fraction of reach |
 * | `chain` | `safeLocation` | the guarded read on its own |
 *
 * Five names, five try/catch blocks, one idea. The duplication was not the
 * expensive part — the *guard* was. Each copy independently decided what a
 * dead entity handle means, and getting that wrong throws out of the middle of
 * combat resolution and abandons every remaining target.
 *
 * So the **measurement** is shared here and the **meaning** stays with each
 * ability: `distanceTo` returns `undefined` for an unreadable target and every
 * caller still chooses what that should imply, because "no bonus" and "full
 * bonus" are genuinely different right answers depending on which way the
 * mechanic fails safe.
 *
 * Nothing here allocates per target beyond a single object in `locationOf`, and
 * nothing here queries anything.
 */

/** @typedef {{ x: number, y: number, z: number }} Point */

/**
 * An entity's position, or `undefined` if the handle has gone invalid.
 *
 * The one guarded read in the ability layer. `Entity.location` throws once the
 * entity is removed, and an ability that reads it bare will abandon the rest of
 * its target list when a mob dies mid-sweep — which is common, not exotic.
 *
 * @param {import('@minecraft/server').Entity | undefined | null} entity
 * @param {number} [yOffset] Blocks to raise the point by, for chest-height visuals.
 * @returns {Point | undefined}
 */
export function locationOf(entity, yOffset = 0) {
    if (entity === undefined || entity === null) return undefined;
    try {
        const { x, y, z } = entity.location;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
        return { x, y: y + yOffset, z };
    } catch {
        return undefined;
    }
}

/**
 * Straight-line distance between two points, or `undefined` if either is not
 * finite.
 *
 * @param {Point | undefined} from
 * @param {Point | undefined} to
 * @returns {number | undefined}
 */
export function distanceBetween(from, to) {
    if (from === undefined || to === undefined) return undefined;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Number.isFinite(distance) ? distance : undefined;
}

/**
 * Distance from a point to an entity, guarded. `undefined` means the target
 * could not be measured — the caller decides what that implies.
 *
 * @param {Point} origin
 * @param {import('@minecraft/server').Entity} target
 * @returns {number | undefined}
 */
export function distanceTo(origin, target) {
    return distanceBetween(origin, locationOf(target));
}

/**
 * How far along a span a distance sits, as 0 at the origin rising to 1 at
 * `span` and clamped there.
 *
 * @param {number | undefined} distance
 * @param {number} span
 * @returns {number | undefined} `undefined` when the distance is unmeasurable.
 */
export function spanFraction(distance, span) {
    if (distance === undefined) return undefined;
    if (!(span > 0)) return 0;
    return Math.max(0, Math.min(1, distance / span));
}

/**
 * The collection's standard falloff ramp: full strength at `t = 0` easing
 * linearly to `edgeFactor` at `t = 1`.
 *
 * Shared because `burst` ramps it over distance and `cleave` over angle, and a
 * blast that fades differently from a swing that fades would be a bug nobody
 * would notice.
 *
 * @param {number} t 0..1.
 * @param {number} edgeFactor Strength retained at the rim, 0..1.
 * @returns {number}
 */
export function taper(t, edgeFactor) {
    if (edgeFactor >= 1) return 1;
    return 1 - Math.max(0, Math.min(1, t)) * (1 - edgeFactor);
}

/**
 * One decimal place, without a trailing `.0`. For action-bar messages, where
 * "drained 1.7" reads and "drained 1.7000000000000002" does not.
 *
 * @param {number} value
 * @returns {string}
 */
export function round1(value) {
    return String(Math.round(value * 10) / 10);
}
