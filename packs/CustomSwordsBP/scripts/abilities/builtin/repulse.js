/**
 * Repulse — controlled displacement, with damage as an afterthought.
 *
 * A crowd-control tool rather than a damage tool: it exists to create space, or
 * with `pull` to close it. Knockback is clamped by the combat system, so even a
 * mis-authored binding cannot launch anyone out of the world.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const repulse = {
    id: 'custom_swords:repulse',
    name: 'Repulse',
    description: 'Throws everything nearby away from the caster.',

    defaults: {
        /** Usually small or zero — this ability is about movement, not damage. */
        damage: 2,
        cause: 'entityAttack',
        /** Particle trail drawn between the caster and each target. 0 disables. */
        trailPoints: 4,
        trailParticle: 'minecraft:basic_smoke_particle',
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
        if (!Number.isInteger(params.trailPoints) || params.trailPoints < 0) {
            problems.push("'trailPoints' must be a non-negative integer.");
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
        services.combat.playCast(ctx, origin);

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'Nothing to push.' };

        // The binding decides the force; without one, a sensible default so the
        // ability is never a no-op.
        const knockback = ctx.knockback ?? { horizontal: 1.4, vertical: 0.4 };

        for (const target of targets) {
            drawTrail(ctx, origin, target, params);
        }

        const report = services.combat.strike(ctx, targets, {
            damage: params.damage,
            damageCause: params.cause,
            knockback,
            origin,
        });

        const moved = report.knockedBack;
        if (moved === 0 && report.damaged === 0) return { ok: false, message: 'Nothing was moved.' };
        return { ok: true, message: `${moved} thrown back` };
    },
};

/**
 * Draws a short particle trail from the caster toward a target, so the push
 * reads as a directed force rather than entities randomly sliding.
 *
 * @param {import('../../core/types.js').AbilityContext} ctx
 * @param {{x: number, y: number, z: number}} origin
 * @param {import('@minecraft/server').Entity} target
 * @param {Record<string, any>} params
 */
function drawTrail(ctx, origin, target, params) {
    if (params.trailPoints <= 0) return;
    try {
        const to = target.location;
        for (let step = 1; step <= params.trailPoints; step++) {
            const t = step / (params.trailPoints + 1);
            ctx.services.particles.emit(
                ctx.dimension,
                { id: params.trailParticle, count: 1 },
                {
                    x: origin.x + (to.x - origin.x) * t,
                    y: origin.y + 1 + (to.y - origin.y) * t,
                    z: origin.z + (to.z - origin.z) * t,
                },
            );
        }
    } catch {
        // A target that vanished mid-draw is not worth aborting the ability for.
    }
}
