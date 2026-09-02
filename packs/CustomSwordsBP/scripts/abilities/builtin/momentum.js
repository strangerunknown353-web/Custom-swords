import { scaleKnockback } from '../support.js';

/**
 * Momentum — the sword pays the wielder in the currency its own active spends.
 *
 * Storm Sword's `surge` is scaled by how fast its wielder is moving. This is
 * what supplies that: a landed hit grants a brief `speed`, and the knockback the
 * hit itself delivers scales with the motion the wielder already had.
 *
 * The loop is the point. Hit something while moving, move faster, surge harder,
 * keep moving. A wielder who stands and trades blows gets a weak passive and a
 * weak active; one who fights on the run gets both at full strength.
 *
 * ## How it differs from `bolster`
 *
 * `bolster` also grants the caster the binding's effects, and Wind, Earth and
 * Tidal all use it. The difference is that `bolster` is an **active** that
 * points inward and grants a flat buff on a cooldown. This is a **passive** that
 * fires on contact and whose knockback output is conditional on the wielder's
 * state — so the same buff means something different depending on what the
 * player was doing when they landed the hit.
 *
 * It is also the only ability in the collection where the *caster's* condition
 * decides how hard the **target** is thrown. `ward` reads the caster's health
 * and acts on the caster; this reads the caster's motion and acts on the enemy.
 *
 * ## Balance
 *
 * The speed granted is brief and low-amplitude, and the knockback bonus is
 * bounded by `config.combat.maxKnockbackHorizontal` like every other push in the
 * framework — so a mis-authored binding cannot turn a swing into a launch.
 *
 * No tick loop, no timer: the speed is a vanilla effect the engine expires.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const momentum = {
    id: 'custom_swords:momentum',
    name: 'Momentum',
    description: 'Rewards a wielder who never stops moving, and throws harder for it.',

    defaults: {
        /**
         * Damage on the hit. At least 1 — this ability learns that its blow
         * landed from `StrikeReport.damaged`, and the damage layer refuses a
         * strike that resolves to zero.
         */
        damage: 1,
        cause: 'entityAttack',
        /** Share of the binding's knockback delivered from a standstill. */
        stillKnockbackFactor: 0.5,
        /**
         * Extra knockback multiplier at full momentum, beyond full strength. A
         * running hit throws harder than a standing one by this much again.
         */
        momentumKnockbackBonus: 0.6,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.damage !== 'number' || params.damage < 1) {
            problems.push(
                "'damage' must be at least 1 — the boost is granted on a landed hit, and a zero-damage strike is refused.",
            );
        }
        if (
            typeof params.stillKnockbackFactor !== 'number' ||
            params.stillKnockbackFactor < 0 ||
            params.stillKnockbackFactor > 1
        ) {
            problems.push("'stillKnockbackFactor' must be between 0 and 1.");
        }
        if (typeof params.momentumKnockbackBonus !== 'number' || params.momentumKnockbackBonus < 0) {
            problems.push("'momentumKnockbackBonus' must be a non-negative number.");
        }
        return problems;
    },

    /**
     * @param {import('../../core/types.js').AbilityContext} ctx
     * @returns {import('../../core/types.js').AbilityResult}
     */
    execute(ctx) {
        const { params, services } = ctx;

        const target = services.targeting.resolve(ctx)[0];
        if (target === undefined) return { ok: false, message: 'No contact.' };

        const moving = services.movement.momentumOf(ctx.player);
        const factor =
            params.stillKnockbackFactor +
            (1 - params.stillKnockbackFactor + params.momentumKnockbackBonus) * moving;

        const report = services.combat.strikeOne(ctx, target, {
            damage: params.damage,
            damageCause: params.cause,
            knockback: scaleKnockback(ctx.knockback, factor),
            // The binding's effects are the wielder's boost, applied below.
            // Letting the combat system place them would hand the enemy Speed.
            applyBindingEffects: false,
        });

        if (!report.damaged) return { ok: false, message: 'The blow glanced off.' };

        const granted = services.effects.applyMany(ctx.player, ctx.effects);
        if (granted === 0) return { ok: true, message: 'strike' };

        return { ok: true, message: moving > 0 ? 'momentum' : 'gathering' };
    },
};
