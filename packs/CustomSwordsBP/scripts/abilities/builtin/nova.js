import { distanceTo, spanFraction } from '../support.js';

/**
 * Nova — a radial burst whose control scales with proximity, and whose damage
 * scales with what the target is already suffering.
 *
 * Two axes, and both are new to the collection:
 *
 *  1. **Proximity-scaled control.** Effect *duration* falls off with distance
 *     rather than damage doing so. Something caught at the caster's feet is
 *     locked down; something at the rim is merely inconvenienced. `burst`
 *     already scales damage with distance, so scaling the effect instead makes
 *     this a control ability rather than a second damage ability.
 *  2. **A shatter bonus.** A target that already carries `shatterEffect` takes
 *     extra damage. That turns a passive which applies the marker into a setup
 *     for the active, so the sword rewards a sequence rather than a button.
 *
 * Contrast with the other radial abilities: `burst` is damage with distance
 * falloff; `ember_burst` is damage scaled by the caster's banked heat. This one
 * is control scaled by distance and damage scaled by *target state*. Three
 * different questions, three different swords.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const nova = {
    id: 'custom_swords:nova',
    name: 'Nova',
    description: 'Bursts outward, gripping hardest at its centre.',

    defaults: {
        /** Base damage. Modest — the effects are the payload. */
        damage: 4,
        cause: 'magic',
        /** Effect duration at the rim, as a fraction of the binding's duration. */
        edgeDurationFactor: 0.4,
        /** The effect a target must already carry for the shatter bonus. */
        shatterEffect: 'slowness',
        /** Extra damage dealt to an already-affected target. */
        shatterBonus: 5,
        /** Points in the expanding ring drawn at the burst's edge. */
        ringPoints: 20,
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
        if (typeof params.edgeDurationFactor !== 'number' || params.edgeDurationFactor < 0 || params.edgeDurationFactor > 1) {
            problems.push("'edgeDurationFactor' must be between 0 and 1.");
        }
        if (typeof params.shatterEffect !== 'string' || params.shatterEffect.length === 0) {
            problems.push("'shatterEffect' must be a non-empty effect name.");
        }
        if (typeof params.shatterBonus !== 'number' || params.shatterBonus < 0) {
            problems.push("'shatterBonus' must be a non-negative number.");
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
        if (targets.length === 0) return { ok: false, message: 'Nothing near enough to freeze.' };

        const origin = ctx.player.location;
        const range = ctx.targeting.range ?? 5;

        // The ring marks the reach, so a target just outside it reads as a miss
        // the player can learn from rather than as the ability misbehaving.
        services.particles.ring(
            ctx.dimension,
            { id: ctx.visual?.trail ?? 'minecraft:snowflake_particle' },
            origin,
            range,
            params.ringPoints,
        );

        let shattered = 0;
        let held = 0;

        for (const target of targets) {
            // Read the target's state *before* striking, so the effects this
            // very activation applies cannot themselves trigger the bonus.
            const alreadyAffected = services.effects.has(target, params.shatterEffect);
            if (alreadyAffected) shattered++;

            const report = services.combat.strikeOne(ctx, target, {
                damage: params.damage + (alreadyAffected ? params.shatterBonus : 0),
                damageCause: params.cause,
                knockback: ctx.knockback,
                // Effects are applied below so the duration can be scaled per
                // target; the combat system would apply them uniformly.
                applyBindingEffects: false,
            });
            if (!report.damaged) continue;

            const nearness = nearnessOf(origin, target, range);
            const factor = params.edgeDurationFactor + (1 - params.edgeDurationFactor) * nearness;

            held += services.effects.applyMany(
                target,
                ctx.effects.map((effect) => ({
                    ...effect,
                    durationTicks: Math.max(1, Math.round(effect.durationTicks * factor)),
                })),
            );
        }

        if (held === 0 && shattered === 0) return { ok: false, message: 'The cold did not take.' };

        return {
            ok: true,
            message: shattered > 0 ? `${targets.length} frozen · ${shattered} shattered` : `${targets.length} frozen`,
        };
    },
};

/**
 * How close a target is to the caster, as 1 at the centre falling to 0 at the
 * rim — the inverse of the fraction `burst` ramps damage over, which is why
 * both now read the same measurement from `abilities/support.js`.
 *
 * @param {{ x: number, y: number, z: number }} origin
 * @param {import('@minecraft/server').Entity} target
 * @param {number} range
 * @returns {number} 0..1
 */
function nearnessOf(origin, target, range) {
    // A handle that went invalid between the strike and this read is treated as
    // a centre hit rather than abandoning the target's effects.
    return 1 - (spanFraction(distanceTo(origin, target), range) ?? 0);
}
