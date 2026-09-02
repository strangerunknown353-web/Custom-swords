import { distanceTo, spanFraction, taper } from '../support.js';

/**
 * Burst — area damage around the caster, falling off with distance.
 *
 * The workhorse for explosive and shockwave-style abilities. Falloff is what
 * distinguishes it from a flat area hit: standing at the edge of a blast should
 * hurt less than standing on top of it, which makes positioning matter and
 * keeps a wide radius from being strictly better than a narrow one.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const burst = {
    id: 'custom_swords:burst',
    name: 'Burst',
    description: 'Detonates around the caster, hitting hardest at the centre.',

    defaults: {
        damage: 6,
        /** Damage retained at the very edge of the radius, 0..1. 1 disables falloff. */
        edgeDamageFactor: 0.5,
        igniteSeconds: 0,
        cause: 'entityAttack',
        /** Particles in the outline ring marking the blast radius. 0 disables. */
        ringPoints: 20,
        /** Particle drawn in the ring. */
        /** Falls back to the binding's visual profile trail; see visual_profiles.js. */
        ringParticle: undefined,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.damage !== 'number' || params.damage < 0) {
            problems.push("'damage' must be a non-negative number.");
        }
        if (typeof params.edgeDamageFactor !== 'number' || params.edgeDamageFactor < 0 || params.edgeDamageFactor > 1) {
            problems.push("'edgeDamageFactor' must be between 0 and 1.");
        }
        if (!Number.isInteger(params.ringPoints) || params.ringPoints < 0) {
            problems.push("'ringPoints' must be a non-negative integer.");
        }
        return problems;
    },

    /**
     * @param {import('../../core/types.js').AbilityContext} ctx
     * @returns {import('../../core/types.js').AbilityResult}
     */
    execute(ctx) {
        const { params, services } = ctx;
        const origin = ctx.player.location;
        const radius = ctx.targeting.range ?? 0;

        services.combat.playCast(ctx, origin);
        if (params.ringPoints > 0 && radius > 0) {
            services.particles.ring(
                ctx.dimension,
                { id: params.ringParticle ?? ctx.visual?.trail ?? 'minecraft:critical_hit_emitter' },
                origin,
                radius,
                params.ringPoints,
            );
        }

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'Nothing in range.' };

        const report = services.combat.strike(ctx, targets, {
            damage: params.damage,
            damageCause: params.cause,
            igniteSeconds: params.igniteSeconds,
            knockback: ctx.knockback,
            origin,
            damageScale: (target) => falloff(origin, target, radius, params.edgeDamageFactor),
        });

        if (report.damaged === 0) return { ok: false, message: 'Nothing was hit.' };
        return { ok: true, message: `${report.damaged} caught in the blast` };
    },
};

/**
 * Linear falloff from full damage at the centre to `edgeFactor` at the rim.
 *
 * @param {{x: number, y: number, z: number}} origin
 * @param {import('@minecraft/server').Entity} target
 * @param {number} radius
 * @param {number} edgeFactor
 * @returns {number}
 */
function falloff(origin, target, radius, edgeFactor) {
    if (radius <= 0 || edgeFactor >= 1) return 1;
    // An unmeasurable target is treated as a centre hit rather than dropped:
    // the alternative silently softens a blast when a mob dies mid-sweep.
    return taper(spanFraction(distanceTo(origin, target), radius) ?? 0, edgeFactor);
}
