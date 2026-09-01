/**
 * Diagnostic Pulse — the foundation milestone's only ability.
 *
 * Its job is not to be fun; it is to exercise every subsystem in one call so a
 * single right-click proves the whole pipeline is wired up:
 *
 *   targeting -> damage -> knockback -> effects -> particles -> sounds ->
 *   feedback -> cooldown
 *
 * It is also the reference implementation for how abilities are written:
 *   - pure data in, service calls out
 *   - no `@minecraft/server` import
 *   - no module-level mutable state
 *   - returns `{ ok: false }` rather than throwing when it has nothing to do
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const diagnosticPulse = {
    id: 'custom_swords:diagnostic_pulse',
    name: 'Diagnostic Pulse',
    description: 'Damages and pushes back nearby hostiles, proving every subsystem is reachable.',

    defaults: {
        /** Blocks. */
        radius: 4,
        /** Hit points before the global multiplier. */
        damage: 3,
        /** Horizontal knockback force. */
        knockback: 0.6,
        /** Vertical knockback strength. */
        lift: 0.35,
        /** Ticks of slowness applied to each target. 0 disables. */
        slownessTicks: 40,
        /** Particle emitted at the caster's feet. */
        particle: 'minecraft:critical_hit_emitter',
        /** Sound played at the caster's location. */
        sound: 'ability_cast',
        /** Maximum entities affected. */
        maxTargets: 8,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.radius !== 'number' || params.radius <= 0) {
            problems.push("'radius' must be a positive number.");
        }
        if (typeof params.damage !== 'number' || params.damage < 0) {
            problems.push("'damage' must be a non-negative number.");
        }
        if (typeof params.maxTargets !== 'number' || params.maxTargets < 1) {
            problems.push("'maxTargets' must be at least 1.");
        }
        return problems;
    },

    /**
     * @param {import('../../core/types.js').AbilityContext} ctx
     * @returns {import('../../core/types.js').AbilityResult}
     */
    execute(ctx) {
        const { params, services } = ctx;
        const feetLocation = ctx.player.location;

        // Visuals and audio fire regardless of whether anything was hit, so the
        // player always gets confirmation that the input registered.
        services.particles.emit(ctx.dimension, { id: params.particle, count: 12, spread: 1.2 }, feetLocation);
        services.particles.ring(
            ctx.dimension,
            { id: 'minecraft:basic_smoke_particle' },
            feetLocation,
            params.radius,
            16,
        );
        services.sounds.playAt(ctx.dimension, params.sound, feetLocation);

        const targets = services.targeting.sphere(ctx, {
            range: params.radius,
            maxTargets: params.maxTargets,
            origin: feetLocation,
        });

        if (targets.length === 0) {
            // Not a failure the player caused a bug with — but it should not
            // consume the cooldown either.
            return { ok: false, message: 'No targets in range.' };
        }

        let hits = 0;
        for (const target of targets) {
            if (services.damage.apply(ctx, target, params.damage)) hits++;
            services.damage.knockback(target, feetLocation, params.knockback, params.lift);
            if (params.slownessTicks > 0) {
                services.effects.apply(target, {
                    effect: 'slowness',
                    durationTicks: params.slownessTicks,
                    amplifier: 0,
                });
            }
        }

        return { ok: true, message: `${hits} hit` };
    },
};
