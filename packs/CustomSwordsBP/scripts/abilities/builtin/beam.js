/**
 * Beam — a straight line that goes through everything in it.
 *
 * `chain` and `brand` on `ray` targeting stop at the first body. This one
 * pierces: every permitted entity along the caster's aim is struck, nearest
 * first, each for a little less than the one before. It rewards lining enemies
 * up in a corridor or a doorway, which no other ability asks for.
 *
 * Damage, effects and knockback all come from the combat system, so a beam is
 * validated, hit-protected and PvP-filtered exactly like every other strike.
 * Nothing is spawned; the line is particles.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */

import { project } from '../../util/vec3.js';

export const beam = {
    id: 'custom_swords:beam',
    name: 'Beam',
    description: 'A straight line through everything in front of you.',

    defaults: {
        /** Damage to the first entity in the line. */
        damage: 6,
        /** Multiplier applied for each entity already pierced (0..1). */
        pierceFalloff: 0.8,
        /** Most entities the line may pass through. */
        maxPierce: 5,
        cause: 'magic',
        /** Burn applied to each struck entity, in seconds. */
        igniteSeconds: 0,
        /** Particles drawn along the full length of the beam. */
        linePoints: 16,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.damage !== 'number' || params.damage < 0) problems.push("'damage' must be a non-negative number.");
        if (typeof params.pierceFalloff !== 'number' || params.pierceFalloff < 0 || params.pierceFalloff > 1) {
            problems.push("'pierceFalloff' must be between 0 and 1.");
        }
        if (!Number.isInteger(params.maxPierce) || params.maxPierce < 1 || params.maxPierce > 16) {
            problems.push("'maxPierce' must be an integer from 1 to 16.");
        }
        if (typeof params.igniteSeconds !== 'number' || params.igniteSeconds < 0) {
            problems.push("'igniteSeconds' must be a non-negative number.");
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

        const range = ctx.targeting.range ?? 12;
        const end = project(ctx.origin, ctx.viewDirection, range);
        const lineParticle = ctx.visual?.trail ?? 'minecraft:endrod';
        services.particles.line(ctx.dimension, { id: lineParticle }, ctx.origin, end, params.linePoints);

        const targets = services.targeting.raycastAll(ctx, {
            range,
            maxTargets: params.maxPierce,
            includePlayers: ctx.targeting.includePlayers,
            allowedCategories: ctx.allowedTargets,
        });
        if (targets.length === 0) return { ok: false, message: 'The beam found nothing.' };

        const report = services.combat.strike(ctx, targets, {
            damage: params.damage,
            damageCause: params.cause,
            damageScale: (_target, index) => params.pierceFalloff ** index,
            igniteSeconds: params.igniteSeconds,
            knockback: ctx.knockback,
        });

        if (report.damaged === 0) return { ok: false, message: 'The beam found nothing.' };
        return { ok: true, message: report.damaged === 1 ? '1 pierced' : `${report.damaged} pierced` };
    },
};
