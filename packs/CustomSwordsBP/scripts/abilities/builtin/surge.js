import { round1, scaleKnockback } from '../support.js';

/**
 * Surge — a storm front that is only as strong as the wielder's own motion.
 *
 * The last scaling axis the framework was missing: **the caster's movement
 * state**. A surge thrown standing still is a shove. The same surge thrown mid-
 * sprint, or falling into a fight from above, is the hardest cone in the
 * collection.
 *
 * | Ability | Scales with |
 * |---|---|
 * | `flare` | the world's clock |
 * | `crush` | the target's altitude |
 * | `weigh` | the target's mass |
 * | `stasis` | how long the caster waited |
 * | **`surge`** | **how fast the caster is moving** |
 *
 * That is the opposite decision to `stasis`, deliberately: one sword rewards
 * standing still with it for a minute, the other rewards never standing still
 * at all. They are the two ends of the same question about time and motion, and
 * they are the collection's last two swords.
 *
 * ## Why it is not Thunder Sword, and not Wind Sword
 *
 * Both already exist and both are near neighbours, so the three are separated
 * on what they *do* rather than on what they look like:
 *
 * | | `surge` (Storm) | `chain` (Thunder) | `repulse` (Wind) |
 * |---|---|---|---|
 * | Shape | a cone the caster runs into | entity to entity, along a line | a radial scatter |
 * | Damage | scales with the caster's motion | falls off per jump | almost none — it is a push |
 * | Payload | knockback **and** slow, together | a hard single strike | knockback alone |
 * | Decision | when am I moving fastest? | where is the line of enemies? | am I surrounded? |
 *
 * ## No real lightning, on purpose
 *
 * `Dimension.spawnEntity('minecraft:lightning_bolt', …)` is the obvious way to
 * make a storm sword look right, and `chain` already documented why it is the
 * wrong one: a real bolt starts fires, charges creepers, turns pigs into
 * zombified piglins and villagers into witches, hurts the caster, and does all
 * of it outside the combat layer's validation, hit protection and PvP rules.
 *
 * So the lightning here is a particle line drawn across the cone's face, and
 * every point of damage goes through `combat.strike` like any other ability.
 * Nothing is spawned, no weather changes, no block is touched, and the whole
 * effect is gone by the time `execute` returns.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const surge = {
    id: 'custom_swords:surge',
    name: 'Surge',
    description: 'Throws the weather forward, and carries the wielder’s own speed into it.',

    defaults: {
        /** Damage thrown from a standing start. */
        stillDamage: 4,
        /** Extra damage at full momentum, on a linear ramp. */
        momentumBonus: 7,
        cause: 'entityAttack',
        /**
         * Share of the binding's knockback applied at a standing start. The
         * wind is always there; momentum decides how much of it lands.
         */
        stillKnockbackFactor: 0.4,
        /** Points in the discharge drawn across the cone's face. 0 disables it. */
        arcPoints: 12,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.stillDamage !== 'number' || params.stillDamage <= 0) {
            problems.push("'stillDamage' must be a positive number.");
        }
        if (typeof params.momentumBonus !== 'number' || params.momentumBonus < 0) {
            problems.push("'momentumBonus' must be a non-negative number.");
        }
        if (
            typeof params.stillKnockbackFactor !== 'number' ||
            params.stillKnockbackFactor < 0 ||
            params.stillKnockbackFactor > 1
        ) {
            problems.push("'stillKnockbackFactor' must be between 0 and 1.");
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

        // One read of the caster's motion state, once per activation.
        const momentum = services.movement.momentumOf(ctx.player);

        services.combat.playCast(ctx);

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'The wind found nothing.' };

        if (params.arcPoints > 0) {
            const origin = ctx.player.location;
            const range = ctx.targeting.range ?? 5;
            services.particles.line(
                ctx.dimension,
                { id: ctx.visual?.trail ?? 'minecraft:blue_flame_particle' },
                origin,
                {
                    x: origin.x + ctx.viewDirection.x * range,
                    y: origin.y + ctx.viewDirection.y * range,
                    z: origin.z + ctx.viewDirection.z * range,
                },
                params.arcPoints,
            );
        }

        const report = services.combat.strike(ctx, targets, {
            damage: params.stillDamage + params.momentumBonus * momentum,
            damageCause: params.cause,
            knockback: scaleKnockback(ctx.knockback, factorFor(params.stillKnockbackFactor, momentum)),
        });

        if (report.damaged === 0) return { ok: false, message: 'The front broke on nothing.' };

        return {
            ok: true,
            message:
                momentum > 0
                    ? `${report.damaged} swept · momentum ${round1(momentum * 100)}%`
                    : `${report.damaged} swept`,
        };
    },
};

/**
 * How much of the binding's knockback a given momentum delivers: `stillFactor`
 * at a standstill rising to full strength at full momentum.
 *
 * @param {number} stillFactor
 * @param {number} momentum 0..1
 * @returns {number}
 */
function factorFor(stillFactor, momentum) {
    return stillFactor + (1 - stillFactor) * Math.max(0, Math.min(1, momentum));
}
