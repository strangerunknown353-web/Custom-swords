/**
 * Target detection and filtering.
 *
 * Every ability that needs entities goes through here, so the safety rules —
 * range ceiling, target-count ceiling, PvP toggle, never-target list,
 * stale-handle rejection, category filtering — are written once and cannot be
 * forgotten by sword #26.
 *
 * ## Query strategy
 *
 * All queries are one-shot and event-driven; nothing here polls. Each query
 * delegates the expensive work to the engine's own spatial index via
 * `getEntities({ location, maxDistance, ... })`, so the framework never walks
 * the entity list of a dimension itself. Category constraints are pushed down
 * into that same query whenever it is provably safe to do so (see
 * `core/target_categories.js`), and applied per entity otherwise.
 *
 * Range is clamped to `config.targeting.maxRange` and the result count to
 * `config.targeting.maxTargets` on every path, so no definition — however
 * mis-authored — can ask the engine for a thousand-block sweep.
 */

import * as Vec3 from '../util/vec3.js';
import { clamp } from '../util/mathx.js';
import { DEFAULT_CATEGORIES, matchesCategories, queryFor } from '../core/target_categories.js';

/** @typedef {import('@minecraft/server').Entity} Entity */
/** @typedef {import('../util/vec3.js').Vec3} Vec3Like */

/**
 * @typedef {Object} TargetQuery
 * @property {number} range Blocks. Clamped to `config.targeting.maxRange`.
 * @property {number} [maxTargets] Clamped to `config.targeting.maxTargets`.
 * @property {Vec3Like} [origin] Defaults to the caster's head location.
 * @property {boolean} [includeCaster] Defaults to false.
 * @property {boolean} [includePlayers] Defaults to `config.combat.allowPlayerVersusPlayer`.
 * @property {readonly string[]} [allowedCategories] Category ids; defaults to `['any']`.
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
     * The type families an entity belongs to, or an empty list when it declares
     * none (a foreign add-on's entity may not use `minecraft:type_family`).
     *
     * @param {Entity} entity
     * @returns {string[]}
     */
    familiesOf(entity) {
        try {
            const component = entity.getComponent('minecraft:type_family');
            if (component === undefined) return [];
            return /** @type {import('@minecraft/server').EntityTypeFamilyComponent} */ (component).getTypeFamilies();
        } catch {
            return [];
        }
    }

    /**
     * True when an entity handle is still usable AND allowed to be targeted.
     *
     * `isValid` is checked first because acting on a removed entity throws, and
     * a throw inside an ability aborts the rest of it.
     *
     * @param {Entity | undefined | null} entity
     * @param {{
     *   casterId?: string,
     *   includeCaster?: boolean,
     *   includePlayers?: boolean,
     *   allowedCategories?: readonly string[],
     * }} [options]
     * @returns {boolean}
     */
    isTargetable(entity, options = {}) {
        if (entity === undefined || entity === null) return false;
        try {
            if (!entity.isValid) return false;
        } catch {
            return false;
        }

        if (this.neverTarget.has(entity.typeId)) return false;

        // Self-damage protection: the caster is excluded unless an ability
        // deliberately opts in.
        if (!options.includeCaster && options.casterId !== undefined && entity.id === options.casterId) return false;

        if (entity.typeId === 'minecraft:player') {
            const allowPlayers = options.includePlayers ?? this.config.combat.allowPlayerVersusPlayer;
            if (!allowPlayers) return false;
        }

        const categories = options.allowedCategories ?? DEFAULT_CATEGORIES;
        if (categories.length > 0 && !categories.includes('any')) {
            if (!matchesCategories(entity.typeId, this.familiesOf(entity), categories)) return false;
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
     * @returns {Entity[]} Empty for `self` and `point`, which act on no entities.
     */
    resolve(ctx, spec = ctx.targeting) {
        const range = spec.range ?? 0;
        /** @type {TargetQuery} */
        const query = {
            range,
            maxTargets: spec.maxTargets,
            includeCaster: spec.includeCaster,
            includePlayers: spec.includePlayers,
            allowedCategories: ctx.allowedTargets,
        };

        switch (spec.type) {
            case 'self':
            case 'point':
                // Both act on a location rather than a set of entities; an
                // ability wanting entities near the point asks for them itself.
                return [];
            case 'area':
                // Area abilities originate at the caster's feet, not their head,
                // so a burst does not clip through the floor or ceiling.
                return this.sphere(ctx, { ...query, origin: ctx.player.location });
            case 'cone':
                return this.cone(ctx, { ...query, coneAngleDegrees: spec.angleDegrees ?? 60 });
            case 'single':
            case 'ray': {
                const hit = this.raycast(ctx, {
                    range,
                    includePlayers: spec.includePlayers,
                    allowedCategories: ctx.allowedTargets,
                });
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
     * The world point a `point`-targeted ability should act on: where the
     * caster is looking, or the end of their reach if nothing is in the way.
     *
     * This is the anchor future projectile-style and ground-targeted abilities
     * need (a meteor's impact site, an area placed at range). It resolves to a
     * location only — no entity search — so it costs one block raycast.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     * @param {number} [range] Defaults to the binding's targeting range.
     * @returns {Vec3Like} Always finite, always within the range ceiling.
     */
    resolvePoint(ctx, range = ctx.targeting.range ?? 0) {
        const capped = clamp(range, 0, this.config.targeting.maxRange);
        const fallback = Vec3.project(ctx.origin, ctx.viewDirection, capped);
        if (capped <= 0) return ctx.origin;

        try {
            const hit = ctx.dimension.getBlockFromRay(ctx.origin, ctx.viewDirection, { maxDistance: capped });
            if (hit?.block !== undefined) {
                // Centre of the struck block's top face reads better than its
                // corner for anything that lands on the ground.
                return { x: hit.block.x + 0.5, y: hit.block.y + 1, z: hit.block.z + 0.5 };
            }
        } catch (error) {
            this.log.debug('targeting.resolvePoint raycast failed:', error);
        }
        return fallback;
    }

    /**
     * Entities in a sphere around a point.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     * Targetable entities within `range` of an arbitrary point.
     *
     * A thin, explicit front door onto {@link sphere} for abilities that need
     * candidates around somewhere other than the caster — a chain's next link,
     * a projectile's impact, a summoned effect. It keeps the binding's target
     * filters and the caster exclusion, so an ability cannot widen its own
     * permissions by choosing a different origin.
     *
     * One engine query, bounded by `range` and by `config.targeting` ceilings.
     *
     * @param {AbilityContext} ctx
     * @param {Vec3Like} origin
     * @param {number} range
     * @param {number} [maxTargets]
     * @returns {Entity[]}
     */
    around(ctx, origin, range, maxTargets) {
        return this.sphere(ctx, {
            origin,
            range,
            maxTargets,
            allowedCategories: ctx.allowedTargets,
        });
    }

    /**
     * @param {TargetQuery} query
     * @returns {Entity[]}
     */
    sphere(ctx, query) {
        const origin = query.origin ?? ctx.origin;
        const range = clamp(query.range, 0, this.config.targeting.maxRange);
        const limit = clamp(query.maxTargets ?? this.config.targeting.maxTargets, 1, this.config.targeting.maxTargets);
        if (range <= 0) return [];

        const categories = query.allowedCategories ?? DEFAULT_CATEGORIES;

        /** @type {Entity[]} */
        let candidates;
        try {
            candidates = ctx.dimension.getEntities({
                location: origin,
                maxDistance: range,
                excludeTypes: [...this.neverTarget],
                // Pushed down to the engine when a single category makes it
                // unambiguous; otherwise the union is applied below.
                ...queryFor(categories),
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
                    allowedCategories: categories,
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
        const cosLimit = Math.cos((clamp(query.coneAngleDegrees, 1, 360) * (Math.PI / 180)) / 2);

        return this.sphere(ctx, query).filter((entity) => {
            const toTarget = Vec3.subtract(entity.location, origin);
            if (Vec3.lengthSquared(toTarget) === 0) return true;
            return Vec3.dot(Vec3.normalize(toTarget), axis) >= cosLimit;
        });
    }

    /**
     * First permitted entity along the caster's view vector.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     * @param {{ range: number, includePlayers?: boolean, allowedCategories?: readonly string[] }} query
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
                        allowedCategories: query.allowedCategories,
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
