/**
 * Tempo — a hit that winds the sword.
 *
 * Time Sword's active (`stasis`) is worth more the longer it has been held
 * back. That alone would make the sword a waiting game, and waiting is not
 * gameplay. This is the other half: every landed hit **advances the charge
 * clock**, so fighting winds the sword faster than standing around with it.
 *
 * The sword therefore rewards a patient *fighter* rather than a patient
 * bystander, which is the version worth playing.
 *
 * ## How it advances the clock without a second store
 *
 * `stasis` measures its charge as "ticks since the last cast", stored as one
 * mark. Rather than keeping a separate counter and adding the two together,
 * this pushes the mark **further into the past** — an advance of forty ticks is
 * written as "you last fired forty ticks earlier than you actually did".
 *
 * That is worth doing because the alternative is a second piece of per-player
 * state that has to be kept in step with the first, and two clocks that must
 * agree are two clocks that will eventually disagree. One number, two writers.
 *
 * ## Why it is not a random chance
 *
 * The brief drag this leaves on its target is applied on **every** landed hit,
 * not on a roll. `discharge` established the argument and it holds here: a
 * percentage is worse in three ways — the player cannot learn it, a bad streak
 * feels broken rather than unlucky, and it cannot be tested deterministically.
 * A small certain effect beats a large uncertain one at the same average.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const tempo = {
    id: 'custom_swords:tempo',
    name: 'Tempo',
    description: 'Every blow winds the blade a little further.',

    defaults: {
        /**
         * Damage on the hit. At least 1 — this ability learns that its blow
         * landed from `StrikeReport.damaged`, and the damage layer refuses a
         * strike that resolves to zero.
         */
        damage: 2,
        cause: 'magic',
        /** Ticks of charge a landed hit is worth. */
        chargePerHit: 60,
        /**
         * Ceiling on how far ahead of real time the clock may be pushed, as a
         * multiple of `chargePerHit`. Without it a long fight against a wall of
         * zombies would bank an unbounded charge, and the active's own cap
         * would be the only thing standing between that and a permanent
         * full-strength freeze on demand.
         */
        maxBankedHits: 8,
        /** Key the charge clock is stored under. Must match the active's. */
        chargeKey: 'temporal_charge',
        /** Ticks of charge the active needs for a full meter. Must match the active's. */
        fullChargeTicks: 1200,
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
                "'damage' must be at least 1 — the charge is advanced on a landed hit, and a zero-damage strike is refused.",
            );
        }
        if (!Number.isInteger(params.chargePerHit) || params.chargePerHit < 1) {
            problems.push("'chargePerHit' must be a positive integer.");
        }
        if (!Number.isInteger(params.maxBankedHits) || params.maxBankedHits < 1) {
            problems.push("'maxBankedHits' must be a positive integer.");
        }
        if (typeof params.chargeKey !== 'string' || params.chargeKey.length === 0) {
            problems.push("'chargeKey' must be a non-empty string.");
        }
        if (!Number.isInteger(params.fullChargeTicks) || params.fullChargeTicks < 1) {
            problems.push("'fullChargeTicks' must be a positive integer.");
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

        const report = services.combat.strikeOne(ctx, target, {
            damage: params.damage,
            damageCause: params.cause,
        });
        if (!report.damaged) return { ok: false, message: 'The blow glanced off.' };

        // Not life-scoped, matching the active: the clock belongs to the sword.
        const waited = services.state.sinceMark(ctx.playerId, params.chargeKey, ctx.currentTick, {
            lifeScoped: false,
        });

        // Already at or past a full meter: nothing to add, and no write, so a
        // long fight costs one read per swing and no more.
        if (waited >= params.fullChargeTicks) return { ok: true, message: 'strike' };

        // Push the mark backwards, capped so a swing cannot bank more than the
        // meter can hold plus the deliberate overshoot allowance.
        const ceiling = params.fullChargeTicks + params.chargePerHit * params.maxBankedHits;
        const advanced = Math.min(waited + params.chargePerHit, ceiling);
        services.state.mark(ctx.playerId, params.chargeKey, ctx.currentTick - advanced, { lifeScoped: false });

        const meter = Math.min(advanced / params.fullChargeTicks, 1);
        return { ok: true, message: `wound ${Math.round(meter * 100)}%` };
    },
};
