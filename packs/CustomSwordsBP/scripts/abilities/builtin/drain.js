/**
 * Drain — the void is paid in what is nearest to gone.
 *
 * A passive that returns health to the wielder on a landed hit, scaled not by
 * the damage dealt but by **how little the target had left**. A full-health
 * enemy returns almost nothing; one down to its last few hit points returns the
 * cap. The lower the target, the more the void takes.
 *
 * ## Why the target's health, and not the wielder's or the damage
 *
 * Lifesteal as a flat fraction of damage dealt is the obvious version, and it
 * is the one that breaks. The best thing to do with it is find the tankiest
 * thing in the world and hit it forever: high health means high damage
 * absorbed, which means a healing loop bounded only by patience. `opportunist`
 * avoids that by paying out only inside a window another ability opens; this
 * avoids it from the other side.
 *
 * Reading the *target's* remaining fraction inverts the incentive completely.
 * The payout is largest exactly when the target is about to die and stop being
 * a source at all, so there is nothing to farm: sustaining on this means
 * finishing things, and a finished thing pays nothing more.
 *
 * It also reads as void rather than as vampirism. This is not blood; it is a
 * hole taking what has almost stopped existing.
 *
 * ## Four separate limits, because one is never enough
 *
 *  1. **The hit must land.** Healing is computed from `StrikeReport.damaged`,
 *     so a blocked, filtered, hit-protected or refused strike pays nothing.
 *  2. **The fraction is read before the strike.** Otherwise this ability's own
 *     damage would inflate its own payout, and a big enough hit would pay twice
 *     for one blow.
 *  3. **`maxHeal` caps a single hit.** Set low; the drain is a trickle by
 *     design.
 *  4. **The binding's cooldown caps the rate**, and the combat layer's hit
 *     protection independently stops one target being drained many times a
 *     second. Both are per player, so a crowd of wielders cannot pool them.
 *
 * There is no per-tick processing: the payout is computed on the swing that
 * earned it and never again.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const drain = {
    id: 'custom_swords:drain',
    name: 'Drain',
    description: 'Takes back most from what has least left.',

    defaults: {
        /**
         * Damage on the hit. At least 1 — like `ward` and `discharge`, this
         * ability learns that its blow landed from the strike report, and the
         * damage layer refuses a zero-damage strike.
         */
        damage: 2,
        cause: 'magic',
        /**
         * Health returned when the target is at death's door. Scaled down
         * linearly by whatever fraction of its health the target still holds,
         * so a full-health target returns nothing.
         */
        maxHeal: 3,
        /**
         * Fraction at or above which nothing is drained at all. Keeps the
         * trickle from being a permanent background heal against fresh enemies.
         */
        emptyThreshold: 0.85,
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
                "'damage' must be at least 1 — the drain is computed from a landed hit, and a zero-damage strike is refused.",
            );
        }
        if (typeof params.maxHeal !== 'number' || params.maxHeal < 0) {
            problems.push("'maxHeal' must be a non-negative number.");
        }
        if (typeof params.emptyThreshold !== 'number' || params.emptyThreshold <= 0 || params.emptyThreshold > 1) {
            problems.push("'emptyThreshold' must be between 0 (exclusive) and 1.");
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

        // Read before striking: this ability's own damage must not raise its own
        // payout. Same rule `nova` follows for its shatter check.
        const fraction = services.effects.healthFraction(target);

        const report = services.combat.strikeOne(ctx, target, {
            damage: params.damage,
            damageCause: params.cause,
        });
        if (!report.damaged) return { ok: false, message: 'The blow glanced off.' };

        if (fraction >= params.emptyThreshold) return { ok: true, message: 'strike' };

        // Ramp from 0 at the threshold to the full cap at zero health, so there
        // is no cliff at the boundary.
        const emptiness = (params.emptyThreshold - fraction) / params.emptyThreshold;
        const healed = services.effects.heal(ctx.player, params.maxHeal * emptiness);
        if (healed <= 0) return { ok: true, message: 'strike' };

        return { ok: true, message: `drained ${round1(healed)}` };
    },
};

/**
 * One decimal place, without a trailing `.0`. Inlined because abilities import
 * nothing — every dependency arrives through `ctx.services`.
 *
 * @param {number} value
 * @returns {string}
 */
function round1(value) {
    return String(Math.round(value * 10) / 10);
}
