/**
 * Afflict — an on-hit effect that deepens on a target already suffering it.
 *
 * The passive counterpart to `nova`, and the difference from `brand` is the
 * whole point. `brand` applies the same affliction every time. This one asks
 * what the target is already carrying:
 *
 *  - **First contact** applies the binding's effects normally.
 *  - **A target that already carries `markerEffect`** takes bonus damage and
 *    the escalation effects on top, so staying on one enemy is worth more than
 *    spreading hits around.
 *
 * That makes it a setup tool: it lays the marker that `nova` later shatters,
 * and it rewards a player who commits to a target rather than one who flails.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const afflict = {
    id: 'custom_swords:afflict',
    name: 'Afflict',
    description: 'Bites deeper into a foe already suffering.',

    defaults: {
        /** Chip damage on a first hit. */
        damage: 0,
        cause: 'magic',
        /** The effect whose presence marks a target as already afflicted. */
        markerEffect: 'slowness',
        /** Extra damage against an already-marked target. */
        escalationDamage: 3,
        /** Effects added only on an escalated hit. */
        escalationEffects: [],
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
        if (typeof params.markerEffect !== 'string' || params.markerEffect.length === 0) {
            problems.push("'markerEffect' must be a non-empty effect name.");
        }
        if (typeof params.escalationDamage !== 'number' || params.escalationDamage < 0) {
            problems.push("'escalationDamage' must be a non-negative number.");
        }
        if (!Array.isArray(params.escalationEffects)) {
            problems.push("'escalationEffects' must be an array of effect specs.");
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

        let escalated = 0;
        let touched = 0;

        for (const target of targets) {
            // Read before striking: the effects this hit applies must not count
            // as the target having been marked beforehand.
            const marked = services.effects.has(target, params.markerEffect);

            const report = services.combat.strikeOne(ctx, target, {
                damage: params.damage + (marked ? params.escalationDamage : 0),
                damageCause: params.cause,
                knockback: ctx.knockback,
            });
            if (!report.damaged && ctx.effects.length === 0) continue;
            touched++;

            if (marked && params.escalationEffects.length > 0) {
                services.effects.applyMany(target, params.escalationEffects);
                escalated++;
            }
        }

        if (touched === 0) return { ok: false, message: 'The blow glanced off.' };
        return { ok: true, message: escalated > 0 ? `${escalated} deepened` : `${touched} chilled` };
    },
};
