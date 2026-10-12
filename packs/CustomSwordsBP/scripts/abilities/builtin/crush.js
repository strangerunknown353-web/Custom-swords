import { locationOf, round1 } from '../support.js';

/**
 * Crush — a well that drags everything inward and then puts it on the ground.
 *
 * ## The axis nothing else uses: height
 *
 * Every distance in this framework so far has been measured in a straight line
 * from A to B, with up and down treated exactly like sideways. This one cares
 * about **one** direction. Damage scales with how far above the caster a target
 * is, so a phantom overhead or a skeleton on a ledge takes the full crush while
 * something standing on the same floor takes the floor of it.
 *
 * That is the whole sword. It is the collection's answer to flying and elevated
 * enemies, which nine of the other thirteen swords handle badly and none
 * handles deliberately.
 *
 * ## Pull, then crush — in one activation
 *
 * The binding's knockback is applied from the well's centre with `pull: true`
 * and a **negative vertical**, so targets are dragged inward *and* downward
 * rather than scattered: the framework clamps vertical knockback to
 * `config.combat.maxKnockbackVertical` in both directions, which is what makes
 * a downward slam expressible at all.
 *
 * Both halves resolve in the same tick, and that is deliberate rather than a
 * shortcut. A genuine two-stage ability — pull now, detonate in forty ticks —
 * needs state that survives across ticks and cancellation on death, disconnect
 * and dimension change, which is a whole milestone's worth of machinery
 * (ROADMAP step 8) and not something to smuggle in under one sword. What ships
 * here reads as a single implosion, which is honest about what it is.
 *
 * ## What it does not do
 *
 * No blocks move. "Gravity" in a Minecraft add-on invites turning terrain into
 * falling blocks, and that is a promise nothing can keep — a falling block that
 * lands somewhere else has permanently edited someone's build. The force here
 * acts on entities only, and nothing outlives the activation.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const crush = {
    id: 'custom_swords:crush',
    name: 'Crush',
    description: 'Collapses a small well of force, and hits hardest what was highest.',

    defaults: {
        /** Damage to something standing level with the caster. */
        groundDamage: 5,
        /** Extra damage at `fullHeight` blocks above the caster, on a linear ramp. */
        heightBonus: 7,
        /** Height at which the bonus is maximal. Above this it is capped, not extrapolated. */
        fullHeight: 6,
        cause: 'entityAttack',
        /** Points in the collapsing ring drawn at the well's edge. 0 disables it. */
        ringPoints: 20,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.groundDamage !== 'number' || params.groundDamage <= 0) {
            problems.push("'groundDamage' must be a positive number.");
        }
        if (typeof params.heightBonus !== 'number' || params.heightBonus < 0) {
            problems.push("'heightBonus' must be a non-negative number.");
        }
        if (typeof params.fullHeight !== 'number' || params.fullHeight <= 0) {
            problems.push("'fullHeight' must be a positive number.");
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
        services.combat.playCast(ctx);

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'Nothing caught in the well.' };

        const origin = ctx.player.location;

        if (params.ringPoints > 0) {
            services.particles.ring(
                ctx.dimension,
                { id: ctx.visual?.trail ?? 'minecraft:mycelium_dust_particle' },
                origin,
                ctx.targeting.range ?? 5,
                params.ringPoints,
            );
        }

        let highest = 0;

        const report = services.combat.strike(ctx, targets, {
            damage: params.groundDamage + params.heightBonus,
            damageCause: params.cause,
            // Applied from the caster's feet with `pull` and a negative
            // vertical: everything is dragged in and pressed down.
            knockback: ctx.knockback,
            // The height read happens per target, here, rather than as a second
            // pass — one measurement each, no extra query.
            damageScale: (target) => {
                const share = heightShare(origin, target, params.fullHeight);
                if (share > highest) highest = share;
                const floor = params.groundDamage / (params.groundDamage + params.heightBonus);
                return floor + (1 - floor) * share;
            },
        });

        if (report.damaged === 0) return { ok: false, message: 'The well found no purchase.' };

        return {
            ok: true,
            message: highest > 0 ? `${report.damaged} crushed · ${round1(highest * 100)}% fall` : `${report.damaged} crushed`,
        };
    },
};

/**
 * How far above the caster a target sits, as 0 at or below the caster's feet
 * rising to 1 at `fullHeight` and clamped there.
 *
 * Only the vertical component is measured — a target twenty blocks sideways is
 * outside the binding's range and never reaches this function, while a target
 * directly overhead is the one the ability exists for.
 *
 * An unmeasurable target reports 0, so a handle that goes stale mid-sweep costs
 * the bonus rather than granting it.
 *
 * @param {{ x: number, y: number, z: number }} origin
 * @param {import('@minecraft/server').Entity} target
 * @param {number} fullHeight
 * @returns {number} 0..1
 */
function heightShare(origin, target, fullHeight) {
    const point = locationOf(target);
    if (point === undefined || !(fullHeight > 0)) return 0;
    return Math.max(0, Math.min(1, (point.y - origin.y) / fullHeight));
}
