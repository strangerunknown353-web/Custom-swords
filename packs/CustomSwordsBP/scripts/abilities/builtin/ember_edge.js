/**
 * Ember Edge — the passive half of the heat mechanic.
 *
 * Every connecting melee hit banks one stack of heat and puts a few sparks on
 * the target. On its own it is almost nothing: a point of fire damage and a
 * visual. Its value is entirely in what `ember_burst` does with the stacks.
 *
 * Two deliberate limits keep it from becoming a permanent power increase:
 *
 *  - stacks are capped by `maxCharges`, so heat cannot be banked indefinitely
 *    before a fight;
 *  - the counter is life-scoped, so dying empties it.
 *
 * The binding's own cooldown throttles how fast stacks accrue, which is what
 * stops a fast weapon from filling the meter in a single flurry.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const emberEdge = {
    id: 'custom_swords:ember_edge',
    name: 'Ember Edge',
    description: 'Banks a little heat with every blow that lands.',

    defaults: {
        /** Chip damage on top of the sword's normal melee. */
        damage: 1,
        cause: 'fire',
        /** Stacks banked per connecting hit. */
        chargeGain: 1,
        /** Ceiling on banked stacks. */
        maxCharges: 5,
        /** Must match the active ability's `chargeKey`. */
        chargeKey: 'ember_heat',
        /** Brief scorch, mostly so the hit reads as hot. */
        igniteSeconds: 1,
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
        if (!Number.isInteger(params.maxCharges) || params.maxCharges < 1) {
            problems.push("'maxCharges' must be a positive integer.");
        }
        if (typeof params.chargeGain !== 'number' || params.chargeGain <= 0) {
            problems.push("'chargeGain' must be a positive number.");
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

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'No contact.' };

        const report = services.combat.strike(ctx, targets, {
            damage: params.damage,
            damageCause: params.cause,
            igniteSeconds: params.igniteSeconds,
        });

        // Bank heat only for a blow that actually landed, so hitting a
        // protected or invalid target does not feed the meter.
        if (report.damaged === 0) return { ok: false, message: 'The blow glanced off.' };

        const total = services.state.addCharge(ctx.playerId, params.chargeKey, params.chargeGain, params.maxCharges);
        return { ok: true, message: `heat ${total}/${params.maxCharges}` };
    },
};
