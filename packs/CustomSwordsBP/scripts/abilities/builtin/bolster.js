/**
 * Bolster — applies the binding's effects to the caster instead of to enemies.
 *
 * Every other ability points outward. This one points inward, which is what
 * passive-feeling buffs need: a brief surge of speed after a hit, a moment of
 * resistance, a trickle of regeneration. Because the effects come entirely from
 * the binding, one implementation serves a wind sword's haste, an earth sword's
 * resistance and a nature sword's regeneration.
 *
 * It uses `self` targeting, which resolves to no entities by design — the
 * ability applies to `ctx.player` directly rather than searching for anything.
 * That makes it the cheapest ability in the framework: no entity query at all.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const bolster = {
    id: 'custom_swords:bolster',
    name: 'Bolster',
    description: 'Steeps the wielder in the blade’s own energy.',

    defaults: {
        /** Hit points restored to the caster. 0 disables healing. */
        heal: 0,
        /** Extinguish the caster if they are alight. */
        extinguish: false,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.heal !== 'number' || params.heal < 0) {
            problems.push("'heal' must be a non-negative number.");
        }
        if (typeof params.extinguish !== 'boolean') {
            problems.push("'extinguish' must be a boolean.");
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

        const applied = services.effects.applyMany(ctx.player, ctx.effects);
        const healed = params.heal > 0 ? services.effects.heal(ctx.player, params.heal) : 0;
        if (params.extinguish) services.effects.extinguish(ctx.player);

        if (applied === 0 && healed === 0 && !params.extinguish) {
            return { ok: false, message: 'Nothing to draw on.' };
        }
        return { ok: true, message: healed > 0 ? `+${Math.round(healed)} health` : 'empowered' };
    },
};
