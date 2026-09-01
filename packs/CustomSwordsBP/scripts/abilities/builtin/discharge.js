/**
 * Discharge — a passive that builds silently and releases on a fixed rhythm.
 *
 * Every landing hit adds a charge. On the Nth, it discharges: bonus damage, the
 * binding's effects, and a visible burst. Charges then reset to zero.
 *
 * ## Why a counter rather than a random chance
 *
 * A percentage roll is the obvious way to write "sometimes the sword shocks
 * them", and it is worse in three ways: the player cannot learn it, a bad
 * streak feels broken rather than unlucky, and it cannot be tested
 * deterministically. A fixed interval is legible — the third hit always
 * crackles — testable, and gives the same average output.
 *
 * ## How this differs from Ember Blade's heat
 *
 * Both use the same `PlayerStateStore` charge primitive, and they are the two
 * halves of what it is for. Ember Blade banks heat and the *player* spends it
 * with a button; the meter is a resource. Here the charge spends *itself* the
 * moment it fills; the counter is a metronome. Same primitive, opposite
 * feel — which is the argument for the primitive existing.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const discharge = {
    id: 'custom_swords:discharge',
    name: 'Discharge',
    description: 'Builds with every blow and lets go on the beat.',

    defaults: {
        /**
         * Chip damage on a hit that does not discharge.
         *
         * Must be at least 1, and that is a real constraint rather than a
         * style choice: this ability learns whether its blow landed from
         * `StrikeReport.damaged`, and the damage layer refuses a strike that
         * resolves to zero. A 0-damage build-up would therefore never
         * advance its own counter — which is exactly the bug this default
         * and the validation below exist to prevent.
         */
        damage: 1,
        cause: 'lightning',
        /** Hits required per discharge. */
        interval: 3,
        /** Damage added on the discharging hit. */
        dischargeDamage: 6,
        /** Distinguishes this counter from any other the player carries. */
        chargeKey: 'static_charge',
        /** Particles on the discharging hit only. */
        dischargeParticleCount: 12,
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
                "'damage' must be at least 1 — the counter advances on a landed hit, and a zero-damage strike is refused.",
            );
        }
        if (!Number.isInteger(params.interval) || params.interval < 2 || params.interval > 10) {
            problems.push("'interval' must be an integer between 2 and 10.");
        }
        if (typeof params.dischargeDamage !== 'number' || params.dischargeDamage < 0) {
            problems.push("'dischargeDamage' must be a non-negative number.");
        }
        if (typeof params.chargeKey !== 'string' || params.chargeKey.length === 0) {
            problems.push("'chargeKey' must be a non-empty string.");
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

        // Look before stepping: the counter only advances on a hit that lands,
        // so a refused or filtered target never moves the metronome.
        const banked = services.state.charges(ctx.playerId, params.chargeKey);
        const willDischarge = banked + 1 >= params.interval;

        const report = services.combat.strikeOne(ctx, target, {
            damage: params.damage + (willDischarge ? params.dischargeDamage : 0),
            damageCause: params.cause,
            knockback: willDischarge ? ctx.knockback : undefined,
            // Effects belong to the discharge, not to every swing.
            applyBindingEffects: willDischarge,
        });

        if (!report.damaged) return { ok: false, message: 'The blow glanced off.' };

        if (!willDischarge) {
            const total = services.state.addCharge(ctx.playerId, params.chargeKey, 1, params.interval);
            return { ok: true, message: `charge ${total}/${params.interval}` };
        }

        services.state.spendCharges(ctx.playerId, params.chargeKey);
        services.particles.emit(
            ctx.dimension,
            { id: ctx.visual?.target ?? 'minecraft:critical_hit_emitter', count: params.dischargeParticleCount, spread: 0.5 },
            target.location,
        );
        return { ok: true, message: 'discharge' };
    },
};
