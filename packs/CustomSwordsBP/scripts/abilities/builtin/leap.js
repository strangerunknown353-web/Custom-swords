/**
 * Leap — the wielder throws themselves along their aim.
 *
 * `blink` relocates the wielder instantly and validates the destination block
 * by block. A leap is physical instead: an impulse along the view, so the
 * player arcs through the air, can be steered by where they look, and lands
 * wherever the game's own physics puts them. That makes it the answer to gaps,
 * ledges and closing distance on something that is running away.
 *
 * The binding's effects go on the wielder (slow falling is the usual one, so a
 * leap off a cliff is not a death sentence). A leap aimed at the floor still
 * goes up: `vertical` is a floor on the lift, never pushed below it.
 *
 * Forces are capped well below the combat layer's knockback ceilings' reach
 * into "launch across the map" territory; see `validateParams`.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */

import { horizontalForce } from '../../util/vec3.js';

export const leap = {
    id: 'custom_swords:leap',
    name: 'Leap',
    description: 'Throws you forward along your aim.',

    defaults: {
        /** Horizontal launch strength along the view. */
        horizontal: 2,
        /** Minimum upward lift, whatever the pitch. */
        vertical: 0.6,
        /** Extra lift per unit of upward view pitch (0..1). */
        pitchLift: 0.5,
        /** Particles drawn at the take-off point. */
        burstCount: 10,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.horizontal !== 'number' || params.horizontal < 0 || params.horizontal > 4) {
            problems.push("'horizontal' must be between 0 and 4.");
        }
        if (typeof params.vertical !== 'number' || params.vertical < 0 || params.vertical > 1.5) {
            problems.push("'vertical' must be between 0 and 1.5.");
        }
        if (typeof params.pitchLift !== 'number' || params.pitchLift < 0 || params.pitchLift > 1) {
            problems.push("'pitchLift' must be between 0 and 1.");
        }
        return problems;
    },

    /**
     * @param {import('../../core/types.js').AbilityContext} ctx
     * @returns {import('../../core/types.js').AbilityResult}
     */
    execute(ctx) {
        const { params, services } = ctx;
        const push = horizontalForce(ctx.viewDirection, params.horizontal);
        const lift = Math.min(1.5, params.vertical + Math.max(0, ctx.viewDirection.y) * params.pitchLift);

        if (!services.effects.impulse(ctx.player, { x: push.x, y: lift, z: push.z })) {
            return { ok: false, message: "Can't leap right now." };
        }

        services.combat.playCast(ctx);
        const puff = ctx.visual?.trail ?? 'minecraft:basic_smoke_particle';
        services.particles.emit(ctx.dimension, { id: puff, count: params.burstCount, spread: 0.6 }, ctx.player.location);
        services.effects.applyMany(ctx.player, ctx.effects);
        return { ok: true };
    },
};
