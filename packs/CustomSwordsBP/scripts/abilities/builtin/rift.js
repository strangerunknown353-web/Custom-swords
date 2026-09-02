import { distanceBetween, spanFraction } from '../support.js';

/**
 * Rift — a collapse torn open somewhere the caster is only *looking*.
 *
 * Every other offensive ability in the collection originates at the wielder's
 * body: `burst`, `nova`, `entangle`, `resonate` and `ember_burst` all expand
 * from their feet; `cleave` is a cone off their arm; `chain` starts on whatever
 * they are pointing at and walks outward; `repulse` throws from where they
 * stand. Not one of them can affect a place the caster is not standing in.
 *
 * This is the first that can, and it is the framework capability that
 * `targeting.resolvePoint` was built for and nothing had yet used: resolve the
 * block the wielder is looking at, up to the binding's range, and detonate
 * *there*.
 *
 * ## Two consequences, and both are the ability
 *
 *  1. **It is aimed, and aiming pays.** Damage scales with how far the rift was
 *     torn from the caster: `nearDamage` at arm's length rising to
 *     `nearDamage + reachBonus` at maximum reach. That is the exact inverse of
 *     `burst`'s distance falloff, and it is why the two are different abilities
 *     rather than one with a sign flipped — `burst` punishes an enemy for
 *     standing close to you, this rewards a wielder for placing a collapse
 *     accurately at range.
 *  2. **It pulls.** The binding's knockback is applied from the rift's centre
 *     with `pull: true`, so everything caught is dragged inward rather than
 *     scattered. A rift torn behind a fleeing group drags them back into reach;
 *     an area ability that scattered them would do the opposite.
 *
 * Together those give the void sword a gameplay identity with nothing in common
 * with Shadow Sword's: Shadow Step moves *the wielder* and its damage comes
 * from the swing that follows, while this moves *the enemy* and never touches
 * the wielder's position at all. Two swords, two answers to "displacement",
 * neither a teleport in the other's sense.
 *
 * ## What it deliberately does not do
 *
 * Nothing is placed, broken, spawned or persisted. The rift is a location, a
 * particle sphere and one call into the combat layer; when `execute` returns,
 * every trace of it is already gone. In particular it sets no blocks — a real
 * hole in the world is not something an ability can honestly promise to put
 * back, and `entangle` established the rule that this framework's "terrain"
 * effects are effects.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const rift = {
    id: 'custom_swords:rift',
    name: 'Rift',
    description: 'Tears a collapse open at range and drags everything into it.',

    defaults: {
        /** Damage when the rift opens at the caster's feet. */
        nearDamage: 5,
        /** Extra damage at maximum reach, added on a linear ramp. */
        reachBonus: 4,
        cause: 'magic',
        /**
         * Radius of the collapse around the resolved point. Deliberately
         * independent of the binding's `targeting.range`, which is *reach*, not
         * blast size — conflating the two would make a long-ranged rift
         * automatically a wide one.
         */
        radius: 3.5,
        /** Ceiling on how many entities one rift may affect. */
        maxTargets: 6,
        /** Particles drawn in the rift's outline. 0 disables it. */
        ringPoints: 18,
        /** Particles drawn along the line from the caster to the rift. 0 disables it. */
        tetherPoints: 8,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.nearDamage !== 'number' || params.nearDamage <= 0) {
            problems.push("'nearDamage' must be a positive number.");
        }
        if (typeof params.reachBonus !== 'number' || params.reachBonus < 0) {
            problems.push("'reachBonus' must be a non-negative number.");
        }
        if (typeof params.radius !== 'number' || params.radius <= 0) {
            problems.push("'radius' must be a positive number.");
        }
        if (!Number.isInteger(params.maxTargets) || params.maxTargets < 1) {
            problems.push("'maxTargets' must be a positive integer.");
        }
        if (!Number.isInteger(params.ringPoints) || params.ringPoints < 0) {
            problems.push("'ringPoints' must be a non-negative integer.");
        }
        if (!Number.isInteger(params.tetherPoints) || params.tetherPoints < 0) {
            problems.push("'tetherPoints' must be a non-negative integer.");
        }
        return problems;
    },

    /**
     * @param {import('../../core/types.js').AbilityContext} ctx
     * @returns {import('../../core/types.js').AbilityResult}
     */
    execute(ctx) {
        const { params, services } = ctx;

        // One block raycast, bounded by the binding's range and by
        // `config.targeting.maxRange`. This is the ability's only lookup that is
        // not the single entity query below.
        const centre = services.targeting.resolvePoint(ctx);
        const reach = ctx.targeting.range ?? 0;

        // Caster-side particles and the cast sound play at the wielder, so the
        // input is always confirmed even when the rift opens on empty ground.
        services.combat.playCast(ctx);

        if (params.tetherPoints > 0) {
            services.particles.line(
                ctx.dimension,
                { id: ctx.visual?.trail ?? 'minecraft:end_chest' },
                ctx.origin,
                centre,
                params.tetherPoints,
            );
        }
        if (params.ringPoints > 0) {
            services.particles.ring(
                ctx.dimension,
                { id: ctx.visual?.caster ?? 'minecraft:dragon_breath_trail' },
                centre,
                params.radius,
                params.ringPoints,
            );
        }

        // `around` keeps the binding's target filters and the caster exclusion,
        // so opening the rift somewhere else cannot widen what this may hit.
        const targets = services.targeting.around(ctx, centre, params.radius, params.maxTargets);
        if (targets.length === 0) return { ok: false, message: 'The rift closed on nothing.' };

        const damage = params.nearDamage + params.reachBonus * reachFraction(ctx.origin, centre, reach);

        const report = services.combat.strike(ctx, targets, {
            damage,
            damageCause: params.cause,
            // The rift, not the wielder, is what everything is pulled towards.
            origin: centre,
            knockback: ctx.knockback,
        });

        if (report.damaged === 0) return { ok: false, message: 'Nothing the rift could take.' };

        return { ok: true, message: `${report.damaged} pulled in` };
    },
};

/**
 * How far the rift was torn, as 0 at the caster rising to 1 at the binding's
 * full reach.
 *
 * @param {{ x: number, y: number, z: number }} origin
 * @param {{ x: number, y: number, z: number }} centre
 * @param {number} reach
 * @returns {number} 0..1
 */
function reachFraction(origin, centre, reach) {
    return spanFraction(distanceBetween(origin, centre), reach) ?? 0;
}
