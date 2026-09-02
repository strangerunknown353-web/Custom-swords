/**
 * Weigh — a blow that costs more the heavier the thing it lands on.
 *
 * The passive half of the gravity sword, and the only ability in the collection
 * that reads a target's **maximum** health rather than its current health.
 * Those are two genuinely different questions:
 *
 * | Reads | Asks | Ability |
 * |---|---|---|
 * | current / max | how hurt is it? | `drain`, `ward` |
 * | **max** | **how much of it is there?** | this |
 *
 * Bedrock exposes no mass, and maximum health is the closest available proxy:
 * an iron golem has 100, a ravager 100, a zombie 20, a bat 6. That ordering is
 * exactly the one a gravity weapon wants, so the sword hits hardest against the
 * things that are hardest to move — which is also, usefully, the things worth
 * hitting.
 *
 * ## Why it presses down instead of pushing away
 *
 * Vanilla melee knocks a target backwards. This binding sends the force
 * *downward* instead, with no horizontal component, so a target hit with the
 * Gravity Sword stays where it is and stays on the ground. That is the
 * mechanical read of "heavy" and it is genuinely useful: it keeps a crowd
 * gathered for the next `crush` rather than scattering it, which is how the
 * sword's two halves are meant to be played together.
 *
 * ## Balance
 *
 * `maxBonus` is a hard ceiling, and it is reached well before the extremes: at
 * the shipped 0.05 per point it caps at 60 maximum health, so an iron golem, a
 * ravager, a warden and the dragon are all worth the same bonus. Without that
 * cap the sword would scale into a boss-killer by accident, which is the sort
 * of thing that only shows up in a fight nobody tested.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const weigh = {
    id: 'custom_swords:weigh',
    name: 'Weigh',
    description: 'Presses its target into the ground, and the heavy feel it most.',

    defaults: {
        /**
         * Damage before the mass bonus. At least 1 — this ability learns that
         * its blow landed from `StrikeReport.damaged`, and the damage layer
         * refuses a strike that resolves to zero.
         */
        damage: 1,
        cause: 'entityAttack',
        /** Extra damage per point of the target's maximum health. */
        bonusPerMaxHealth: 0.05,
        /**
         * Ceiling on the mass bonus. The one number keeping this from scaling
         * into a boss-killer — see the module comment.
         */
        maxBonus: 3,
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
                "'damage' must be at least 1 — the bonus is computed from a landed hit, and a zero-damage strike is refused.",
            );
        }
        if (typeof params.bonusPerMaxHealth !== 'number' || params.bonusPerMaxHealth < 0) {
            problems.push("'bonusPerMaxHealth' must be a non-negative number.");
        }
        if (typeof params.maxBonus !== 'number' || params.maxBonus < 0) {
            problems.push("'maxBonus' must be a non-negative number.");
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

        // One component read. `maxHealth` reports 0 for anything without a
        // health component, so a bonus computed from it becomes 0 rather than
        // NaN, and the swing still lands its base damage.
        const mass = services.effects.maxHealth(target);
        const bonus = Math.min(mass * params.bonusPerMaxHealth, params.maxBonus);

        const report = services.combat.strikeOne(ctx, target, {
            damage: params.damage + bonus,
            damageCause: params.cause,
            // The binding's knockback is straight down with no horizontal
            // component, which is what pins the target instead of throwing it.
            knockback: ctx.knockback,
        });

        if (!report.damaged) return { ok: false, message: 'The blow glanced off.' };
        return { ok: true, message: bonus > 0 ? 'weighed' : 'strike' };
    },
};
