/**
 * Brand — status effects as the payload, damage as the delivery.
 *
 * Where the other abilities are about hit points, this one is about what
 * happens afterwards: poison, slowness, weakness, a lingering burn. The
 * effects themselves come entirely from the binding, so one implementation
 * serves a frost sword, a plague sword and a curse sword.
 *
 * It also scales effect duration with how many targets were caught, so a
 * single-target application lands longer than a crowd sweep — otherwise an
 * area brand would simply be strictly better.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const brand = {
    id: 'custom_swords:brand',
    name: 'Brand',
    description: 'Marks its targets with lingering afflictions.',

    defaults: {
        /** Usually modest — the effects are the payload. */
        damage: 3,
        cause: 'magic',
        igniteSeconds: 0,
        /** Extra multiplier on effect duration when only one target is caught. */
        focusedDurationBonus: 1.5,
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
        if (typeof params.focusedDurationBonus !== 'number' || params.focusedDurationBonus < 1) {
            problems.push("'focusedDurationBonus' must be at least 1.");
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
        if (targets.length === 0) return { ok: false, message: 'Nothing to mark.' };

        // A single target takes a longer affliction than a crowd, so focus is
        // rewarded and an area binding is not strictly superior.
        const bonus = targets.length === 1 ? params.focusedDurationBonus : 1;

        const report = services.combat.strike(ctx, targets, {
            damage: params.damage,
            damageCause: params.cause,
            igniteSeconds: params.igniteSeconds,
            knockback: ctx.knockback,
            // Effects are applied here rather than by the combat system so the
            // duration bonus can be folded in.
            applyBindingEffects: false,
        });

        let applied = 0;
        for (const target of targets) {
            applied += services.effects.applyMany(
                target,
                ctx.effects.map((effect) => ({ ...effect, durationTicks: Math.round(effect.durationTicks * bonus) })),
            );
        }

        if (applied === 0 && report.damaged === 0) return { ok: false, message: 'The mark did not take.' };
        return { ok: true, message: `${targets.length} marked` };
    },
};
