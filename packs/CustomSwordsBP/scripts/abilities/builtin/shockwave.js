/**
 * Shockwave — the Ability Engine's first real ability, and the reference
 * implementation every future ability should be read against.
 *
 * It strikes whatever the binding's targeting spec selects, hurts it, pushes it
 * away from the caster, and applies whatever the binding declared. That is
 * deliberately generic: the *feel* comes from the envelope, not from this file.
 * The same ability is a wide crowd-clearing burst on one binding and a focused
 * single-target thrust on another, with no new code.
 *
 * What it demonstrates, in order:
 *
 *   activation -> validation gate -> cooldown -> targeting -> damage
 *   -> knockback -> status effects -> particles -> sound -> feedback
 *
 * The rules it follows, which every ability must:
 *
 *  - no `@minecraft/server` import; everything goes through `ctx.services`
 *  - no module-level mutable state; per-player data belongs in `services.state`
 *  - targeting, effects, particles and sounds are read from `ctx`, never
 *    hard-coded, so the ability stays reusable
 *  - `params` holds only numbers this ability itself understands
 *  - returns `{ ok: false }` rather than throwing when there is nothing to do,
 *    so a whiffed swing does not consume the player's cooldown
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const shockwave = {
    id: 'custom_swords:shockwave',
    name: 'Shockwave',
    description: 'Strikes everything the binding targets, driving it away from the caster.',

    defaults: {
        /** Hit points before the global damage multiplier. */
        damage: 4,
        /** Horizontal force applied away from the caster. */
        knockback: 0.8,
        /** Vertical knockback strength. */
        lift: 0.3,
        /** Seconds of burning applied to each target. 0 disables. */
        igniteSeconds: 0,
        /** Particles in the outline ring drawn at the edge of an area hit. 0 disables. */
        ringPoints: 16,
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
        if (typeof params.knockback !== 'number' || params.knockback < 0) {
            problems.push("'knockback' must be a non-negative number.");
        }
        if (typeof params.lift !== 'number' || params.lift < 0) {
            problems.push("'lift' must be a non-negative number.");
        }
        if (typeof params.igniteSeconds !== 'number' || params.igniteSeconds < 0) {
            problems.push("'igniteSeconds' must be a non-negative number.");
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
        const origin = ctx.player.location;

        // Cast visuals fire before targeting, so the player always gets
        // confirmation that the input registered even on a whiff.
        services.outcome.playCast(ctx, origin);

        // An area hit gets a ring marking its actual reach, which doubles as a
        // readable tell for anyone standing nearby.
        if (params.ringPoints > 0 && ctx.targeting.type === 'area' && ctx.targeting.range !== undefined) {
            services.particles.ring(
                ctx.dimension,
                { id: 'minecraft:basic_smoke_particle' },
                origin,
                ctx.targeting.range,
                params.ringPoints,
            );
        }

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) {
            // Not a bug and not the player's fault — but it must not consume
            // the cooldown either.
            return { ok: false, message: 'Nothing in range.' };
        }

        const report = services.outcome.applyToTargets(ctx, targets, {
            damage: params.damage,
            knockback: params.knockback,
            lift: params.lift,
            igniteSeconds: params.igniteSeconds,
            origin,
        });

        return { ok: true, message: `${report.damaged} hit` };
    },
};
