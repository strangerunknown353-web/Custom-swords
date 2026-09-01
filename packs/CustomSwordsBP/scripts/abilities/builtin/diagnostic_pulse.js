/**
 * Diagnostic Pulse — the foundation milestone's only ability.
 *
 * Its job is not to be fun; it is to exercise every subsystem in one call so a
 * single right-click proves the whole pipeline is wired up:
 *
 *   identification -> registry -> cooldown -> targeting -> damage -> effects
 *   -> particles -> sounds -> feedback
 *
 * It is also the reference implementation for how abilities are written:
 *   - targeting, effects, particles and sounds come from the sword's binding as
 *     DATA (`ctx.targeting`, `ctx.effects`, ...), not from hard-coded values,
 *     so binding it twice with different envelopes yields two different-feeling
 *     swords with no new code;
 *   - `params` carries only numbers the ability itself understands;
 *   - no `@minecraft/server` import — everything goes through `ctx.services`;
 *   - no module-level mutable state;
 *   - returns `{ ok: false }` rather than throwing when there is nothing to do,
 *     so a whiffed ability does not consume the player's cooldown.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const diagnosticPulse = {
    id: 'custom_swords:diagnostic_pulse',
    name: 'Diagnostic Pulse',
    description: 'Damages and pushes back everything the binding targets, proving every subsystem is reachable.',

    defaults: {
        /** Hit points before the global multiplier. */
        damage: 3,
        /** Horizontal knockback force. */
        knockback: 0.6,
        /** Vertical knockback strength. */
        lift: 0.35,
        /** Particle count for the outline ring drawn at the edge of the area. */
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

        // Visuals and audio fire regardless of whether anything was hit, so the
        // player always gets confirmation that the input registered.
        for (const particle of ctx.particles) {
            if ((particle.at ?? 'caster') === 'caster') {
                services.particles.emit(ctx.dimension, particle, origin);
            }
        }
        if (params.ringPoints > 0 && ctx.targeting.range !== undefined) {
            services.particles.ring(
                ctx.dimension,
                { id: 'minecraft:basic_smoke_particle' },
                origin,
                ctx.targeting.range,
                params.ringPoints,
            );
        }
        if (ctx.sounds.cast !== undefined) {
            services.sounds.playAt(ctx.dimension, ctx.sounds.cast, origin);
        }

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) {
            // Not a bug, and not the player's fault — but it must not consume
            // the cooldown either.
            return { ok: false, message: 'No targets in range.' };
        }

        let hits = 0;
        for (const target of targets) {
            if (services.damage.apply(ctx, target, params.damage)) hits++;
            services.damage.knockback(target, origin, params.knockback, params.lift);
            services.effects.applyMany(target, ctx.effects);

            for (const particle of ctx.particles) {
                if (particle.at === 'target') services.particles.emit(ctx.dimension, particle, target.location);
            }
            if (ctx.sounds.impact !== undefined) {
                services.sounds.playAt(ctx.dimension, ctx.sounds.impact, target.location);
            }
        }

        return { ok: true, message: `${hits} hit` };
    },
};
