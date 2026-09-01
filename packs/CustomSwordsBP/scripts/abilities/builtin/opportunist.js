/**
 * Opportunist — a strike that hits far harder inside a window opened by
 * something else.
 *
 * The passive half of a mobility sword. An ordinary swing is almost nothing; a
 * swing in the seconds after a blink is the sword's real damage, and heals the
 * wielder for part of it. That makes positioning the cost of the damage rather
 * than a bonus on top of it.
 *
 * ## The third shape of player state
 *
 * The framework now stores three different things per player, and this is the
 * newest:
 *
 * | Shape | Read by | Example |
 * |---|---|---|
 * | Resource | the player, deliberately | Ember Blade's heat |
 * | Counter | itself, on a rhythm | Thunder's static charge |
 * | **Window** | another ability, for a time | this |
 *
 * It never references `blink` by name — it reads a mark under a shared key. A
 * future sword could open the same window with a leap, a feint or a kill, and
 * this ability would not change.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const opportunist = {
    id: 'custom_swords:opportunist',
    name: 'Opportunist',
    description: 'Strikes hardest in the moment after a reposition.',

    defaults: {
        /** Damage on an ordinary hit. */
        damage: 1,
        /** Extra damage inside the window. */
        empoweredDamage: 6,
        /** How long the window stays open, in ticks. */
        windowTicks: 80,
        /** Mark to watch. Must match the opening ability's `markKey`. */
        markKey: 'shadow_step',
        /** Health returned to the wielder on an empowered hit. */
        lifesteal: 2,
        cause: 'magic',
        /** Particles on an empowered hit only. */
        empoweredParticleCount: 10,
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.damage !== 'number' || params.damage < 1) {
            problems.push(
                "'damage' must be at least 1 — the window is checked on a landed hit, and a zero-damage strike is refused.",
            );
        }
        if (typeof params.empoweredDamage !== 'number' || params.empoweredDamage < 0) {
            problems.push("'empoweredDamage' must be a non-negative number.");
        }
        if (!Number.isInteger(params.windowTicks) || params.windowTicks < 1 || params.windowTicks > 400) {
            problems.push("'windowTicks' must be an integer between 1 and 400.");
        }
        if (typeof params.lifesteal !== 'number' || params.lifesteal < 0) {
            problems.push("'lifesteal' must be a non-negative number.");
        }
        if (typeof params.markKey !== 'string' || params.markKey.length === 0) {
            problems.push("'markKey' must be a non-empty string.");
        }
        return problems;
    },

    /**
     * @param {import('../../core/types.js').AbilityContext} ctx
     * @returns {import('../../core/types.js').AbilityResult}
     */
    execute(ctx) {
        const { params, services } = ctx;

        const target = services.targeting.resolve(ctx)[0];
        if (target === undefined) return { ok: false, message: 'No contact.' };

        const elapsed = services.state.sinceMark(ctx.playerId, params.markKey, ctx.currentTick);
        const empowered = elapsed <= params.windowTicks;

        const report = services.combat.strikeOne(ctx, target, {
            damage: params.damage + (empowered ? params.empoweredDamage : 0),
            damageCause: params.cause,
            // The debuff belongs to the empowered hit, not to every swing.
            applyBindingEffects: empowered,
        });

        if (!report.damaged) return { ok: false, message: 'The blow glanced off.' };
        if (!empowered) return { ok: true, message: 'strike' };

        if (params.lifesteal > 0) services.effects.heal(ctx.player, params.lifesteal);
        services.particles.emit(
            ctx.dimension,
            { id: ctx.visual?.target ?? 'minecraft:basic_smoke_particle', count: params.empoweredParticleCount, spread: 0.5 },
            target.location,
        );

        return { ok: true, message: 'from the dark' };
    },
};
