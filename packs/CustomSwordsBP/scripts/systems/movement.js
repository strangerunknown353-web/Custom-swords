/**
 * Movement — safe repositioning of an entity, with destination validation.
 *
 * The framework's first ability that moves the *caster* rather than the target,
 * and the one place where a mistake does something a player cannot undo: a
 * teleport into stone suffocates, a teleport over a ravine kills, a teleport
 * into lava does both. So the rule here is the inverse of the rest of the
 * combat layer — **when in doubt, do not move.**
 *
 * ## How a destination is chosen
 *
 * ```
 * caster position + view direction
 *        │
 *        ▼  candidates at maxDistance, maxDistance-1, … minDistance
 *        │  (furthest first: the player asked to go as far as possible)
 *        ▼  for each candidate, in order:
 *        │    1. finite coordinates?
 *        │    2. feet and head blocks passable?
 *        │    3. not standing in lava?
 *        │    4. ground within `maxDrop` below?
 *        │    5. engine agrees — `tryTeleport` with collision checking
 *        ▼
 *   first candidate that passes, or a refusal with a named reason
 * ```
 *
 * Steps 1–4 are a pre-screen; **step 5 is the authority.** `Entity.tryTeleport`
 * runs the engine's own collision test and returns false rather than throwing,
 * which makes it the only check that cannot disagree with the game. The
 * pre-screen exists because `tryTeleport` alone would happily drop a player off
 * a cliff or into lava — it tests geometry, not survivability.
 *
 * ## Why every block read is wrapped
 *
 * `Block.isAir`, `.isLiquid` and `.typeId` all throw
 * `LocationInUnloadedChunkError` and `LocationOutOfWorldBoundariesError`. A
 * player standing at a chunk edge, at world height, or at bedrock is an
 * ordinary situation, not an error — so an unreadable block counts as *not
 * passable*, and the candidate is skipped rather than the ability failing.
 *
 * `Block.isSolid` would be the natural check and is deliberately not used: it
 * is still marked pre-release. `isAir || isLiquid` is the stable equivalent.
 */

/** @typedef {import('@minecraft/server').Dimension} Dimension */
/** @typedef {import('@minecraft/server').Entity} Entity */
/** @typedef {import('../util/vec3.js').Vec3} Vec3 */
/** @typedef {import('../core/types.js').AbilityContext} AbilityContext */

/**
 * @typedef {Object} DashSpec
 * @property {number} maxDistance Blocks to attempt, at most.
 * @property {number} [minDistance] Shortest acceptable hop. Defaults to 1.
 * @property {number} [maxDrop] Blocks of fall tolerated below the destination. Defaults to 4.
 * @property {boolean} [allowLiquid] Permit landing in water. Lava is never permitted. Defaults to false.
 * @property {boolean} [horizontal] Flatten the view direction so looking up does not launch. Defaults to true.
 */

/**
 * @typedef {Object} DashResult
 * @property {boolean} ok
 * @property {Vec3} [from] Where the entity stood before moving.
 * @property {Vec3} [to] Where it ended up.
 * @property {number} [distance] Blocks actually travelled.
 * @property {string} [reason] Why it refused — a player-facing sentence.
 */

/** Blocks a dash will never land in, whatever else is true. */
const LETHAL_BLOCKS = Object.freeze(new Set(['minecraft:lava', 'minecraft:flowing_lava', 'minecraft:fire', 'minecraft:soul_fire']));

export class MovementService {
    /**
     * @param {typeof import('../config.js').CONFIG} config
     * @param {typeof import('../core/log.js').log} log
     */
    constructor(config, log) {
        /** @private @readonly */
        this.config = config;
        /** @private @readonly */
        this.log = log;
    }

    /**
     * How much motion the caster is carrying, as 0 standing still rising to 1
     * at a full run through the air.
     *
     * The framework's one read of the caster's **movement state**, and the axis
     * Storm Sword is built on. It is a small set of booleans rather than a
     * velocity vector on purpose:
     *
     * | Considered | Why not the obvious alternative |
     * |---|---|
     * | `isSprinting`, `isFalling`, `isOnGround` | documented `Player` properties, stable frame to frame |
     * | ~~`getVelocity()`~~ | a scalar would read better, but server-side player velocity in Bedrock is jittery and can report near-zero for a player who is plainly moving — a headline mechanic cannot rest on that |
     *
     * Each contributing state is worth `1 / stateCount`, so the scale is even
     * and a sword can decide for itself how much the difference is worth.
     *
     * Never throws. An unreadable player reports **0** — no momentum — which
     * fails towards withholding the bonus, matching every other conditional
     * read in the framework.
     *
     * @param {import('@minecraft/server').Player} player
     * @returns {number} 0..1
     */
    momentumOf(player) {
        if (player === undefined || player === null) return 0;
        try {
            if (!player.isValid) return 0;
            let states = 0;
            // Running with the storm.
            if (player.isSprinting === true) states++;
            // Off the ground: falling, leaping, or riding a knockback. Read via
            // `isOnGround` as well so a player standing still on flat ground can
            // never accidentally score the airborne point.
            if (player.isFalling === true || player.isOnGround === false) states++;
            return Math.max(0, Math.min(1, states / 2));
        } catch (error) {
            this.log.debug('movement.momentumOf failed:', error);
            return 0;
        }
    }

    /**
     * Moves the caster forward along their view, as far as is safe.
     *
     * Never throws, never moves an entity into a place that would kill it, and
     * never moves further than `maxDistance`. A refusal leaves the world
     * untouched and names its reason, so the ability can decline the cooldown.
     *
     * @param {AbilityContext} ctx
     * @param {DashSpec} spec
     * @returns {DashResult}
     */
    dash(ctx, spec) {
        const player = ctx.player;
        if (player === undefined || !player.isValid) return { ok: false, reason: 'Nowhere to step.' };

        /** @type {Vec3} */
        let from;
        try {
            from = { ...player.location };
        } catch {
            return { ok: false, reason: 'Nowhere to step.' };
        }

        const direction = this.stepDirection(ctx, spec.horizontal !== false);
        if (direction === undefined) return { ok: false, reason: 'Nowhere to step.' };

        const maxDistance = clamp(spec.maxDistance, 0, this.config.movement.maxDashDistance);
        const minDistance = Math.max(1, Math.min(spec.minDistance ?? 1, maxDistance));
        if (maxDistance < minDistance) return { ok: false, reason: 'Nowhere to step.' };

        // Furthest first: the player asked to go as far as possible, and a
        // shorter hop is the fallback rather than the goal.
        for (let distance = Math.floor(maxDistance); distance >= minDistance; distance--) {
            const candidate = {
                x: from.x + direction.x * distance,
                y: from.y + direction.y * distance,
                z: from.z + direction.z * distance,
            };
            if (!this.isSafeDestination(ctx.dimension, candidate, spec)) continue;

            // The engine's own collision test, and the authority. Returns false
            // rather than throwing when the destination intersects blocks or
            // sits in an unloaded chunk.
            let moved = false;
            try {
                moved = player.tryTeleport(candidate, { checkForBlocks: true, keepVelocity: false });
            } catch (error) {
                this.log.debug('movement.dash tryTeleport threw:', error);
                moved = false;
            }
            if (!moved) continue;

            return { ok: true, from, to: candidate, distance };
        }

        return { ok: false, reason: 'The shadows are blocked that way.' };
    }

    /**
     * The caster's view as a unit vector, optionally flattened.
     *
     * Flattening is the default because a player looking at their feet or at
     * the sky should still step *forward* — a dash that follows pitch is how
     * mobility abilities launch people into the ceiling.
     *
     * @private
     * @param {AbilityContext} ctx
     * @param {boolean} flatten
     * @returns {Vec3 | undefined}
     */
    stepDirection(ctx, flatten) {
        let view;
        try {
            view = ctx.viewDirection ?? ctx.player.getViewDirection();
        } catch {
            return undefined;
        }
        if (view === undefined) return undefined;

        const x = view.x;
        const y = flatten ? 0 : view.y;
        const z = view.z;
        const length = Math.sqrt(x * x + y * y + z * z);
        if (!Number.isFinite(length) || length < 1e-6) return undefined;
        return { x: x / length, y: y / length, z: z / length };
    }

    /**
     * The survivability pre-screen. Geometry is `tryTeleport`'s job; this asks
     * whether the player would still be alive afterwards.
     *
     * @private
     * @param {Dimension} dimension
     * @param {Vec3} location
     * @param {DashSpec} spec
     * @returns {boolean}
     */
    isSafeDestination(dimension, location, spec) {
        if (!Number.isFinite(location.x) || !Number.isFinite(location.y) || !Number.isFinite(location.z)) return false;

        const feet = this.readBlock(dimension, location);
        const head = this.readBlock(dimension, { ...location, y: location.y + 1 });
        if (feet === undefined || head === undefined) return false;

        if (feet.lethal || head.lethal) return false;
        if (!feet.passable || !head.passable) return false;
        if (!spec.allowLiquid && (feet.liquid || head.liquid)) return false;

        return this.hasFooting(dimension, location, spec.maxDrop ?? 4);
    }

    /**
     * Whether there is ground within `maxDrop` blocks below the destination.
     *
     * Without this the ability is a way to walk off cliffs quickly. A landing
     * in liquid counts as footing — water breaks a fall.
     *
     * @private
     * @param {Dimension} dimension
     * @param {Vec3} location
     * @param {number} maxDrop
     * @returns {boolean}
     */
    hasFooting(dimension, location, maxDrop) {
        const depth = Math.max(0, Math.floor(maxDrop));
        for (let step = 1; step <= depth + 1; step++) {
            const below = this.readBlock(dimension, { ...location, y: location.y - step });
            if (below === undefined) return false; // unreadable: refuse rather than guess
            if (below.lethal) return false;
            if (!below.passable) return true; // solid ground
            if (below.liquid) return true; // water breaks the fall
        }
        return false;
    }

    /**
     * Reads a block into a plain summary, or `undefined` when it cannot be read.
     *
     * Every property access here throws on an unloaded chunk or a location
     * outside world bounds, both of which are ordinary at a chunk edge or at
     * world height.
     *
     * @private
     * @param {Dimension} dimension
     * @param {Vec3} location
     * @returns {{ passable: boolean, liquid: boolean, lethal: boolean } | undefined}
     */
    readBlock(dimension, location) {
        try {
            const block = dimension.getBlock(location);
            if (block === undefined || block === null) return undefined;
            const typeId = block.typeId;
            const liquid = block.isLiquid === true;
            return {
                // `isSolid` is still pre-release; air-or-liquid is the stable
                // way to ask "can something stand here?".
                passable: block.isAir === true || liquid,
                liquid,
                lethal: LETHAL_BLOCKS.has(typeId),
            };
        } catch (error) {
            this.log.debug('movement.readBlock failed:', error);
            return undefined;
        }
    }
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}
