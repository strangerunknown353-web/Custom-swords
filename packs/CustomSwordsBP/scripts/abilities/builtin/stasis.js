import { round1 } from '../support.js';

/**
 * Stasis — an ability that is worth more the longer you have not used it.
 *
 * Every other active in the collection is worth exactly the same whenever you
 * press it. The only question they ask is "is the cooldown up?", and the only
 * correct answer is always "then press it". This one asks a second question:
 * **how long have you been holding it?**
 *
 * The freeze it lays is short if spent the instant the cooldown lifts, and full
 * length if the sword has been carried, unused, for the better part of a
 * minute. That makes the button a decision — spend it now on the mob in front
 * of you, or bank it for the fight you can see coming — which is a kind of
 * decision nothing else here offers.
 *
 * | Ability | The question it asks |
 * |---|---|
 * | every other active | is the cooldown up? |
 * | `ember_burst` | how many hits have I landed? |
 * | **`stasis`** | **how long have I been waiting?** |
 *
 * ## Why this is not a tick loop, and needs no cleanup
 *
 * "Freeze an entity and restore it afterwards" invites a timer per frozen
 * entity and a bookkeeping map to expire them. That is the single easiest way
 * to leak memory in this addon, and it is unnecessary: **the freeze is a vanilla
 * status effect, and the engine expires it.**
 *
 * `slowness` at a high amplifier reduces movement to near nothing, which is the
 * honest Bedrock rendering of "frozen"; `weakness` and `mining_fatigue` blunt
 * what a stopped mob can still do. All three come off on their own schedule with
 * no code involved, so there is nothing to restore, nothing to clean up, and
 * nothing left behind if the world reloads mid-freeze.
 *
 * The charge is one number under one key per player, read and rewritten once per
 * activation. The addon still schedules exactly one interval in total, and it is
 * the store sweep that has existed since v0.1.0.
 *
 * ## What it does not touch
 *
 * The world clock. `world.setTimeOfDay` would be the literal reading of "time
 * manipulation" and it is a global mutation on a shared world — one player's
 * sword changing everyone's sky, permanently, with no way to put it back. The
 * time this sword manipulates is its own.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const stasis = {
    id: 'custom_swords:stasis',
    name: 'Stasis',
    description: 'Holds everything nearby still, for as long as it has been saved up.',

    defaults: {
        /** Damage to each target. Low — the hold is the payload, not the hit. */
        damage: 3,
        cause: 'magic',
        /** Freeze duration with no charge banked at all, in ticks. */
        minFreezeTicks: 40,
        /** Freeze duration at full charge, in ticks. */
        maxFreezeTicks: 160,
        /**
         * Ticks of waiting that buy a full charge, measured from the last cast.
         * Sixty seconds: long enough that banking is a real commitment, short
         * enough that a patient player is rewarded within one fight.
         */
        fullChargeTicks: 1200,
        /**
         * Amplifier of the holding effect. 5 is slowness VI — movement reduced
         * to almost nothing, which is as close to "frozen" as Bedrock gets
         * without stopping the entity's AI, which no supported API does.
         */
        holdAmplifier: 5,
        /** The effect used to hold a target. */
        holdEffect: 'slowness',
        /** Key the charge clock is stored under. */
        chargeKey: 'temporal_charge',
        /** Points in the ring drawn at the field's edge. 0 disables it. */
        ringPoints: 20,
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
        if (!Number.isInteger(params.minFreezeTicks) || params.minFreezeTicks < 1) {
            problems.push("'minFreezeTicks' must be a positive integer.");
        }
        if (!Number.isInteger(params.maxFreezeTicks) || params.maxFreezeTicks < 1) {
            problems.push("'maxFreezeTicks' must be a positive integer.");
        }
        if (Number.isInteger(params.minFreezeTicks) && Number.isInteger(params.maxFreezeTicks)) {
            if (params.maxFreezeTicks < params.minFreezeTicks) {
                problems.push("'maxFreezeTicks' must be at least 'minFreezeTicks' — charging cannot shorten the hold.");
            }
            if (params.maxFreezeTicks > 400) {
                problems.push("'maxFreezeTicks' must be 400 or less. A hold longer than twenty seconds is a removal, not a freeze.");
            }
        }
        if (!Number.isInteger(params.fullChargeTicks) || params.fullChargeTicks < 1) {
            problems.push("'fullChargeTicks' must be a positive integer.");
        }
        if (!Number.isInteger(params.holdAmplifier) || params.holdAmplifier < 0 || params.holdAmplifier > 9) {
            problems.push("'holdAmplifier' must be an integer between 0 and 9.");
        }
        if (typeof params.holdEffect !== 'string' || params.holdEffect.length === 0) {
            problems.push("'holdEffect' must be a non-empty effect name.");
        }
        if (typeof params.chargeKey !== 'string' || params.chargeKey.length === 0) {
            problems.push("'chargeKey' must be a non-empty string.");
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

        // Not life-scoped: the charge belongs to the sword, not to the body
        // carrying it. A life-scoped clock would read as *absent* after a death
        // and hand back a full charge, which would make dying a way to reload.
        const waited = services.state.sinceMark(ctx.playerId, params.chargeKey, ctx.currentTick, {
            lifeScoped: false,
        });
        const charge = chargeFrom(waited, params.fullChargeTicks);

        services.combat.playCast(ctx);

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) {
            // No charge is spent on a miss, and no cooldown either — the whole
            // point of banking is lost if a mistimed click empties the meter.
            return { ok: false, message: 'Nothing close enough to hold.' };
        }

        if (params.ringPoints > 0) {
            services.particles.ring(
                ctx.dimension,
                { id: ctx.visual?.trail ?? 'minecraft:redstone_repeater_dust_particle' },
                ctx.player.location,
                ctx.targeting.range ?? 5,
                params.ringPoints,
            );
        }

        const holdTicks = Math.round(
            params.minFreezeTicks + (params.maxFreezeTicks - params.minFreezeTicks) * charge,
        );

        // Struck one at a time rather than as a list, because the hold must land
        // on exactly what the combat layer agreed to damage.
        //
        // The first draft used a single `strike` over the whole list and then
        // applied the hold to every target in a second pass. That is a filter
        // bypass: a target the damage layer refused — outside the binding's
        // allowed categories, or inside another player's hit-protection window —
        // would still have been frozen by an ability that never touched it.
        // `nova` established this shape for the same reason.
        //
        // `resolve` returns the result of one engine query, so the list cannot
        // contain the same entity twice and per-target striking loses nothing.
        let held = 0;
        const scaled = ctx.effects.map((effect) => ({ ...effect, durationTicks: holdTicks }));

        for (const target of targets) {
            const report = services.combat.strikeOne(ctx, target, {
                damage: params.damage,
                damageCause: params.cause,
                // No knockback: a hold that shoves its targets away is not a
                // hold. Effects are applied below at the computed duration
                // rather than at the binding's fixed one.
                applyBindingEffects: false,
            });
            if (!report.damaged) continue;

            if (
                services.effects.apply(target, {
                    effect: params.holdEffect,
                    durationTicks: holdTicks,
                    amplifier: params.holdAmplifier,
                })
            ) {
                held++;
            }
            // Anything else the binding wants on a held target — weakness,
            // mining fatigue — rides the same computed duration, so a long hold
            // is long in every respect rather than only in its slowness.
            services.effects.applyMany(target, scaled);
        }

        if (held === 0) return { ok: false, message: 'The moment would not catch.' };

        // Spend the charge only once something was actually held.
        services.state.mark(ctx.playerId, params.chargeKey, ctx.currentTick, { lifeScoped: false });

        return {
            ok: true,
            message: `${held} held ${round1(holdTicks / 20)}s · charge ${Math.round(charge * 100)}%`,
        };
    },
};

/**
 * How much charge a wait is worth, as 0 for no wait at all rising to 1 at
 * `fullChargeTicks`.
 *
 * `sinceMark` reports `Infinity` when the sword has never been fired, which is
 * correct here rather than a special case: a sword picked up for the first time
 * arrives fully wound.
 *
 * @param {number} waited Ticks since the last cast.
 * @param {number} fullChargeTicks
 * @returns {number} 0..1
 */
function chargeFrom(waited, fullChargeTicks) {
    if (!(fullChargeTicks > 0)) return 1;
    if (waited === Number.POSITIVE_INFINITY) return 1;
    if (!Number.isFinite(waited) || waited < 0) return 0;
    return Math.max(0, Math.min(1, waited / fullChargeTicks));
}
