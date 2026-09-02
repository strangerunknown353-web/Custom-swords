/**
 * Ward — a defensive layer that forms only once its wielder is actually losing.
 *
 * The framework's first passive that points at the caster's own condition. Its
 * predecessors all read something about the fight: `ember_edge` counts hits,
 * `discharge` counts them on a rhythm, `afflict` and `opportunist` read the
 * target and the clock. This one reads the wielder.
 *
 * On a landed hit it does almost nothing — chip damage, no more. But when the
 * wielder's own health has fallen to `guardThreshold` or below, the same swing
 * closes the binding's effects around *them* instead, and closes them harder
 * the further past `deepThreshold` they are.
 *
 * ## Why "only when wounded" is the whole design
 *
 * A defensive buff on every swing is uptime, and uptime on a defensive buff is
 * just a bigger health bar with extra steps: the player never chooses anything
 * and never notices it. Gating on health inverts that. The guard cannot be
 * pre-stacked before a fight, cannot be maintained by swinging at a pig, and is
 * worth the most in exactly the situation the player would have wanted it —
 * which also means it is worth nothing in the situation where it would be
 * oppressive to fight against.
 *
 * ## Why the guard has its own clock
 *
 * The binding's `cooldownTicks` throttles the *whole* ability, chip damage
 * included, which is the wrong lever here: a swing thrown at full health would
 * start it, and the guard would then be unavailable for the seconds after the
 * wielder drops low — precisely backwards. So the guard is rate-limited by its
 * own mark under `markKey`, using the same window primitive `opportunist` reads,
 * and the binding cooldown is left free to do nothing but stop swing spam.
 *
 * Life-scoped like every other mark, so dying does not leave a stale guard
 * timer behind, and keyed by `ctx.playerId`, so one player's guard has no
 * bearing on another's.
 *
 * ## No tick loop
 *
 * Nothing here polls. The health read happens on the swing that might form the
 * guard and at no other time, and the guard itself is an ordinary status effect
 * the engine expires on its own. The addon still schedules exactly one interval
 * in total, and it is the store sweep that already existed.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const ward = {
    id: 'custom_swords:ward',
    name: 'Ward',
    description: 'Closes a defensive layer around a wielder who is losing.',

    defaults: {
        /**
         * Chip damage on the hit.
         *
         * Must be at least 1, and for the same reason `discharge` and
         * `opportunist` carry the same floor: this ability learns whether its
         * blow landed from `StrikeReport.damaged`, and the damage layer refuses
         * a strike that resolves to zero. A 0-damage passive would never see a
         * hit land and so could never form its guard.
         */
        damage: 1,
        cause: 'entityAttack',
        /** Health fraction at or below which the guard may form. */
        guardThreshold: 0.6,
        /** Health fraction at or below which the guard forms one tier stronger. */
        deepThreshold: 0.3,
        /**
         * Ceiling on the amplifier the guard may reach, however deep the wound
         * and whatever the binding declares. The single number standing between
         * "a defensive benefit" and "unkillable".
         */
        maxAmplifier: 1,
        /** Minimum ticks between two guards forming, per player. */
        guardIntervalTicks: 120,
        /** Mark used for that interval. */
        markKey: 'crystal_guard',
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
                "'damage' must be at least 1 — the guard is checked on a landed hit, and a zero-damage strike is refused.",
            );
        }
        if (typeof params.guardThreshold !== 'number' || params.guardThreshold <= 0 || params.guardThreshold > 1) {
            problems.push("'guardThreshold' must be between 0 (exclusive) and 1.");
        }
        if (typeof params.deepThreshold !== 'number' || params.deepThreshold < 0 || params.deepThreshold > 1) {
            problems.push("'deepThreshold' must be between 0 and 1.");
        }
        if (typeof params.deepThreshold === 'number' && typeof params.guardThreshold === 'number') {
            if (params.deepThreshold > params.guardThreshold) {
                problems.push("'deepThreshold' must not be above 'guardThreshold' — the deeper tier would be unreachable.");
            }
        }
        if (!Number.isInteger(params.maxAmplifier) || params.maxAmplifier < 0 || params.maxAmplifier > 3) {
            problems.push("'maxAmplifier' must be an integer between 0 and 3.");
        }
        if (!Number.isInteger(params.guardIntervalTicks) || params.guardIntervalTicks < 1) {
            problems.push("'guardIntervalTicks' must be a positive integer.");
        }
        if (typeof params.markKey !== 'string' || params.markKey.length === 0) {
            problems.push("'markKey' must be a non-empty string.");
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
            // The binding's effects are the guard, and the guard is the
            // wielder's. Letting the combat system apply them here would hand
            // the enemy a defensive buff for being hit.
            applyBindingEffects: false,
        });
        if (!report.damaged) return { ok: false, message: 'The blow glanced off.' };

        const fraction = services.effects.healthFraction(ctx.player);
        if (fraction > params.guardThreshold) return { ok: true, message: 'strike' };

        // The guard's own rhythm, independent of the binding cooldown.
        if (services.state.sinceMark(ctx.playerId, params.markKey, ctx.currentTick) <= params.guardIntervalTicks) {
            return { ok: true, message: 'strike' };
        }
        services.state.mark(ctx.playerId, params.markKey, ctx.currentTick);

        const bonus = fraction <= params.deepThreshold ? 1 : 0;
        let applied = 0;
        for (const effect of ctx.effects) {
            const amplifier = Math.min((effect.amplifier ?? 0) + bonus, params.maxAmplifier);
            if (services.effects.apply(ctx.player, { ...effect, amplifier })) applied++;
        }

        if (applied === 0) return { ok: true, message: 'strike' };

        // The wielder's own cue that the guard closed. `attack` activations get
        // no action-bar feedback by design, so the particles and the cast sound
        // are the whole signal — which is why this fires here and not on every
        // swing.
        services.combat.playCast(ctx);

        return { ok: true, message: bonus > 0 ? 'guard (deep)' : 'guard' };
    },
};
