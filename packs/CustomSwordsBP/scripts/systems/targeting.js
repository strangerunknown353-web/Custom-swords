/**
 * Target detection.
 *
 * Every ability that needs to find entities goes through here, which means the
 * safety rules (range ceiling, target ceiling, PvP toggle, never-target list,
 * stale-handle rejection) are written once and cannot be forgotten by sword #26.
 *
 * All queries are event-driven and one-shot. Nothing here polls.
 */

import * as Vec3 from '../util/vec3.js';
import { clamp } from '../util/mathx.js';

/** @typedef {import('@minecraft/server').Entity} Entity */
/** @typedef {import('@minecraft/server').Dimension} Dimension */
/** @typedef {import('../util/vec3.js').Vec3} Vec3Like */

/**
 * @typedef {Object} TargetQuery
 * @property {number} range Blocks. Clamped to `config.targeting.maxRange`.
 * @property {number} [maxTargets] Clamped to `config.targeting.maxTargets`.
 * @property {Vec3Like} [origin] Defaults to the caster's head location.
 * @property {boolean} [includeCaster] Defaults to false.
 * @property {boolean} [includePlayers] Defaults to `config.combat.allowPlayerVersusPlayer`.
 * @property {number} [coneAngleDegrees] When set, restricts hits to a forward cone.
 * @property {Vec3Like} [direction] Cone axis. Defaults to the caster's view direction.
 */

export class TargetingService {
    /**
     * @param {typeof import('../config.js').CONFIG} config
     * @param {typeof import('../core/log.js').log} log
     */
    constructor(config, log) {
        /** @private @readonly */
        this.config = config;
        /** @private @readonly */
        this.log = log;
        /** @private @readonly @type {Set<string>} */
        this.neverTarget = new Set(config.combat.neverTarget);
    }

    /**
     * True when an entity handle is still usable AND allowed to be targeted.
     *
     * `isValid` is checked first because acting on a removed entity throws, and
     * a thrown error inside an ability aborts the rest of that ability.
     *
     * @param {Entity | undefined} entity
     * @param {{ casterId?: string, includeCaster?: boolean, includePlayers?: boolean }} [options]
     * @returns {boolean}
     */
    isTargetable(entity, options = {}) {
        if (entity === undefined) return false;
        if (!entity.isValid) return false;
        if (this.neverTarget.has(entity.typeId)) return false;
        if (!options.includeCaster && options.casterId !== undefined && entity.id === options.casterId) return false;
        if (entity.typeId === 'minecraft:player') {
            const allowPlayers = options.includePlayers ?? this.config.combat.allowPlayerVersusPlayer;
            if (!allowPlayers) return false;
        }
        return true;
    }

    /**
     * Resolves a declarative {@link TargetingSpec} into a concrete entity list.
     *
     * This is what lets targeting be data. An ability calls
     * `services.targeting.resolve(ctx)` and gets whatever the sword's binding
     * declared — a cone on one sword, a wide area on another — without knowing
     * or caring which.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     * @param {import('../core/types.js').TargetingSpec} [spec] Defaults to `ctx.targeting`.
     * @returns {Entity[]} Empty for `self`, which acts on the caster only.
     */
    resolve(ctx, spec = ctx.targeting) {
        const range = spec.range ?? 0;
        /** @type {TargetQuery} */
        const query = {
            range,
            maxTargets: spec.maxTargets,
            includeCaster: spec.includeCaster,
            includePlayers: spec.includePlayers,
        };

        switch (spec.type) {
            case 'self':
                return [];
            case 'area':
                // Area abilities originate at the caster's feet, not their head,
                // so a burst does not clip through the floor or ceiling.
                return this.sphere(ctx, { ...query, origin: ctx.player.location });
            case 'cone':
                return this.cone(ctx, { ...query, coneAngleDegrees: spec.angleDegrees ?? 60 });
            case 'single':
            case 'ray': {
                const hit = this.raycast(ctx, { range, includePlayers: spec.includePlayers });
                return hit === undefined ? [] : [hit];
            }
            default:
                // An unknown type is a definition bug that validation should
                // have caught. Fail closed rather than guessing.
                this.log.warn(`targeting.resolve: unknown targeting type '${String(spec.type)}'.`);
                return [];
        }
    }

    /**
     * Entities in a sphere around a point.
     *
     * Uses the engine's own `getEntities` spatial query with `location` +
     * `maxDistance`, so the engine does the culling. We never iterate every
     * entity in the dimension ourselves.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     * @param {TargetQuery} query
     * @returns {Entity[]}
     */
    sphere(ctx, query) {
        const origin = query.origin ?? ctx.origin;
        const range = clamp(query.range, 0, this.config.targeting.maxRange);
        const limit = clamp(query.maxTargets ?? this.config.targeting.maxTargets, 1, this.config.targeting.maxTargets);
        if (range <= 0) return [];

        /** @type {Entity[]} */
        let candidates;
        try {
            candidates = ctx.dimension.getEntities({
                location: origin,
                maxDistance: range,
                excludeTypes: [...this.neverTarget],
            });
        } catch (error) {
            this.log.warn('targeting.sphere query failed:', error);
            return [];
        }

        /** @type {Entity[]} */
        const results = [];
        for (const entity of candidates) {
            if (results.length >= limit) break;
            if (
                !this.isTargetable(entity, {
                    casterId: ctx.playerId,
                    includeCaster: query.includeCaster,
                    includePlayers: query.includePlayers,
                })
            ) {
                continue;
            }
            results.push(entity);
        }
        return results;
    }

    /**
     * Entities inside a forward cone. Built on {@link sphere} plus a dot-product
     * test, which is cheaper than any per-entity raycast.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     * @param {TargetQuery & { coneAngleDegrees: number }} query
     * @returns {Entity[]}
     */
    cone(ctx, query) {
        const axis = Vec3.normalize(query.direction ?? ctx.viewDirection);
        const origin = query.origin ?? ctx.origin;
        const cosLimit = Math.cos(clamp(query.coneAngleDegrees, 1, 180) * (Math.PI / 180) / 2);

        return this.sphere(ctx, query).filter((entity) => {
            const toTarget = Vec3.subtract(entity.location, origin);
            const lengthSquared = Vec3.lengthSquared(toTarget);
            if (lengthSquared === 0) return true;
            return Vec3.dot(Vec3.normalize(toTarget), axis) >= cosLimit;
        });
    }

    /**
     * First entity along the caster's view vector.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     * @param {{ range: number, includePlayers?: boolean }} query
     * @returns {Entity | undefined}
     */
    raycast(ctx, query) {
        const range = clamp(query.range, 0, this.config.targeting.maxRange);
        if (range <= 0) return undefined;
        try {
            const hits = ctx.dimension.getEntitiesFromRay(ctx.origin, ctx.viewDirection, {
                maxDistance: range,
                excludeTypes: [...this.neverTarget],
            });
            for (const hit of hits) {
                if (
                    this.isTargetable(hit.entity, {
                        casterId: ctx.playerId,
                        includePlayers: query.includePlayers,
                    })
                ) {
                    return hit.entity;
                }
            }
        } catch (error) {
            this.log.warn('targeting.raycast query failed:', error);
        }
        return undefined;
    }
}
