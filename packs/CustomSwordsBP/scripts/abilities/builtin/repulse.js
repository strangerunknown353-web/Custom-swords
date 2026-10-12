/**
 * Repulse — controlled displacement, with damage as an afterthought.
 *
 * A crowd-control tool rather than a damage tool: it exists to create space, or
 * with `pull` to close it. Knockback is clamped by the combat system, so even a
 * mis-authored binding cannot launch anyone out of the world.
 *
 * ## Two swords, and why they do not feel alike
 *
 * Wind and Tidal both bind this as their **active**, which is the only place in
 * the collection two swords share a headline ability. They are separated
 * entirely by the envelope, and separated far enough that a player would not
 * guess they run the same forty lines:
 *
 * | | Wind Burst | Tidal Wave |
 * |---|---|---|
 * | Shape | radial, 5 blocks, up to 12 | 80° cone, 7 blocks, up to 10 |
 * | Direction | away from the caster | along the caster's view |
 * | Damage | 2 — the push *is* the ability | 6 |
 * | Payload | knockback alone | knockback and slowness |
 * | Cooldown | 5s | 7.5s |
 * | Question | am I surrounded? | where do I want them? |
 *
 * One clears a circle you are standing in; the other drives a line of enemies
 * somewhere. That is the case for the invocation envelope in miniature: the
 * shared part is the arithmetic, and none of what a player notices is shared.
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
        /** Falls back to the binding's visual profile trail; see visual_profiles.js. */
        trailParticle: undefined,
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
                { id: params.trailParticle ?? ctx.visual?.trail ?? 'minecraft:critical_hit_emitter', count: 1 },
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
