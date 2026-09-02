import { round1 } from '../support.js';

/**
 * Flare — a lance of light whose strength is borrowed from the sky.
 *
 * The collection's first ability that reads the **world** rather than the
 * caster, the target or the fight. Every other scaling axis so far has been
 * something one of the participants is or has:
 *
 * | Ability | Asks about |
 * |---|---|
 * | `burst`, `nova`, `rift` | where the target is standing |
 * | `ember_burst`, `ward` | the caster's own state |
 * | `resonate`, `entangle` | how many are present |
 * | `drain`, `afflict` | the target's condition |
 * | **`flare`** | **what time it is, and which dimension this is** |
 *
 * At noon in the Overworld it is the hardest-hitting cone in the collection. At
 * midnight it is a nuisance. In the Nether or the End it is a nuisance at every
 * hour, because there is no sun there to draw on.
 *
 * ## Why light and not fire
 *
 * The obvious solar sword sets things alight, and that is the fire swords'
 * territory — Inferno and Ember Blade already own ignition, and a third burning
 * sword would be a recolour with a bigger number. So this one never ignites
 * anything and never touches a block. Its payload is `blindness`: light does
 * not burn a thing, it *dazzles* it. That is also why the ability is a cone —
 * light travels the way you point it.
 *
 * ## The condition is the design, not a nerf
 *
 * A sword that is strong for half of every day is a scheduling decision, which
 * is a kind of decision nothing else in the collection asks for. It pairs with
 * `radiance`, the passive, which is gated on the same clock — so Solar Sword is
 * a coherent daytime weapon rather than a sword with an inconvenience bolted
 * on, and a player who takes it into a cave has made a real mistake rather than
 * a small one.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const flare = {
    id: 'custom_swords:flare',
    name: 'Flare',
    description: 'Draws on the sun overhead, and is only as bright as the hour.',

    defaults: {
        /** Damage at midnight, or anywhere the sun does not reach. */
        nightDamage: 3,
        /** Extra damage at noon under an Overworld sky, on a linear ramp. */
        sunBonus: 8,
        cause: 'magic',
        /**
         * Daylight at or below which the binding's effects are not applied at
         * all. A flare with no sun behind it still stings, but it cannot dazzle.
         */
        dazzleThreshold: 0.35,
        /** Points in the arc drawn across the cone's face. 0 disables it. */
        arcPoints: 14,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.nightDamage !== 'number' || params.nightDamage <= 0) {
            problems.push("'nightDamage' must be a positive number.");
        }
        if (typeof params.sunBonus !== 'number' || params.sunBonus < 0) {
            problems.push("'sunBonus' must be a non-negative number.");
        }
        if (typeof params.dazzleThreshold !== 'number' || params.dazzleThreshold < 0 || params.dazzleThreshold > 1) {
            problems.push("'dazzleThreshold' must be between 0 and 1.");
        }
        if (!Number.isInteger(params.arcPoints) || params.arcPoints < 0) {
            problems.push("'arcPoints' must be a non-negative integer.");
        }
        return problems;
    },

    /**
     * @param {import('../../core/types.js').AbilityContext} ctx
     * @returns {import('../../core/types.js').AbilityResult}
     */
    execute(ctx) {
        const { params, services } = ctx;

        // One world read, once per activation. The dimension is passed so the
        // Nether and the End report no sun whatever the clock says.
        const sun = services.environment.daylight(ctx.dimension);

        services.combat.playCast(ctx);

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'The light found nothing.' };

        if (params.arcPoints > 0) {
            const origin = ctx.player.location;
            services.particles.line(
                ctx.dimension,
                { id: ctx.visual?.trail ?? 'minecraft:totem_particle' },
                origin,
                {
                    x: origin.x + ctx.viewDirection.x * (ctx.targeting.range ?? 5),
                    y: origin.y + ctx.viewDirection.y * (ctx.targeting.range ?? 5),
                    z: origin.z + ctx.viewDirection.z * (ctx.targeting.range ?? 5),
                },
                params.arcPoints,
            );
        }

        const report = services.combat.strike(ctx, targets, {
            damage: params.nightDamage + params.sunBonus * sun,
            damageCause: params.cause,
            knockback: ctx.knockback,
            // Blindness is the sun in the eyes. Without a sun there is nothing
            // to be blinded by, so a night flare does damage and nothing else.
            applyBindingEffects: sun > params.dazzleThreshold,
        });

        if (report.damaged === 0) return { ok: false, message: 'The light did not land.' };

        // The message names the condition, because a player whose sword just
        // did a third of its usual damage deserves to know why rather than
        // suspecting a bug.
        return {
            ok: true,
            message:
                sun > params.dazzleThreshold
                    ? `${report.damaged} seared · sun ${round1(sun * 100)}%`
                    : `${report.damaged} struck · no sun`,
        };
    },
};
