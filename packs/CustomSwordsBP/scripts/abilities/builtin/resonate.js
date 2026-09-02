/**
 * Resonate — a lattice struck once, ringing louder for every body it finds.
 *
 * The collection now has five abilities that hit a ring of enemies around the
 * caster, and each one exists because it answers a *different* question about
 * what an area attack should scale with:
 *
 * | Ability | Damage scales with |
 * |---|---|
 * | `burst` | distance from the centre — the edge is safer |
 * | `nova` | what the target already suffers — set-up is rewarded |
 * | `ember_burst` | heat the caster banked — commitment is rewarded |
 * | `repulse` | nothing; it is a push, not a hit |
 * | `entangle` | how many were caught, paid to the **caster** as healing |
 * | **`resonate`** | **how many were caught, paid to every target as damage** |
 *
 * The last two rows are the interesting pair. `entangle` turns a crowd into
 * sustain for the wielder; this turns a crowd into constructive interference —
 * each additional body caught in the lattice adds to the damage taken by *all*
 * of them, not just itself. One enemy is a poor use of the cooldown. Four is
 * the sword.
 *
 * That inverts the usual balance of an area ability, where a wide radius is
 * strictly better and a crowd is simply more total damage spread thinner. Here
 * a crowd is worth more per head, which is a real decision: hold the button
 * until the mob closes, and accept being surrounded to do it.
 *
 * ## Why the bonus is capped, and capped low
 *
 * `resonanceBonus` compounds across every target, so an uncapped version scales
 * quadratically — twelve skeletons in a spawner room would each take a
 * one-shot. `maxResonance` is a hard ceiling on the *bonus*, reached at five or
 * six bodies with the shipped numbers, after which extra targets add reach but
 * not power. Total output still rises with the crowd; the per-head figure stops.
 *
 * ## Nothing is placed in the world
 *
 * The lattice is particles and effects. No blocks are set, no entities are
 * spawned, nothing persists past the activation — so there is no terrain to
 * restore and no crystal left standing in somebody's build.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const resonate = {
    id: 'custom_swords:resonate',
    name: 'Resonate',
    description: 'Rings through a crowd, and grows louder for every body in it.',

    defaults: {
        /** Damage every caught target takes before resonance. */
        damage: 5,
        cause: 'magic',
        /**
         * Extra damage added to *every* target for each target beyond the
         * first. Two targets means +1 each with the shipped value, three means
         * +2 each, and so on until the cap.
         */
        resonanceBonus: 1,
        /**
         * Ceiling on the resonance bonus, in hit points. The single number that
         * keeps a crowd from turning this into an instant kill — see the module
         * comment.
         */
        maxResonance: 4,
        /** Points in the ring drawn at the lattice's reach. 0 disables it. */
        ringPoints: 20,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.damage !== 'number' || params.damage <= 0) {
            problems.push("'damage' must be a positive number.");
        }
        if (typeof params.resonanceBonus !== 'number' || params.resonanceBonus < 0) {
            problems.push("'resonanceBonus' must be a non-negative number.");
        }
        if (typeof params.maxResonance !== 'number' || params.maxResonance < 0) {
            problems.push("'maxResonance' must be a non-negative number.");
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
        services.combat.playCast(ctx);

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'Nothing for the lattice to catch.' };

        if (params.ringPoints > 0) {
            services.particles.ring(
                ctx.dimension,
                { id: ctx.visual?.trail ?? 'minecraft:lab_table_misc_mystical_particle' },
                ctx.player.location,
                ctx.targeting.range ?? 4,
                params.ringPoints,
            );
        }

        // Resonance is computed once, from the whole target list, and applied
        // uniformly. Doing it per target inside the loop would make the damage
        // depend on iteration order, which is not something a player can see or
        // learn from.
        const resonance = Math.min(params.resonanceBonus * (targets.length - 1), params.maxResonance);

        const report = services.combat.strike(ctx, targets, {
            damage: params.damage + resonance,
            damageCause: params.cause,
            knockback: ctx.knockback,
        });

        if (report.damaged === 0) return { ok: false, message: 'The lattice found no purchase.' };

        return {
            ok: true,
            message:
                resonance > 0
                    ? `${report.damaged} caught · resonance +${round1(resonance)}`
                    : `${report.damaged} caught`,
        };
    },
};

/**
 * One decimal place, without a trailing `.0`. Inlined rather than imported
 * because abilities import nothing — every dependency arrives through
 * `ctx.services`, which is what keeps them engine-free and trivially testable.
 *
 * @param {number} value
 * @returns {string}
 */
function round1(value) {
    return String(Math.round(value * 10) / 10);
}
