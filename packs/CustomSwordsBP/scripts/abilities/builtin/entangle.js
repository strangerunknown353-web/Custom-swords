/**
 * Entangle — roots a group in place and lets the growth feed the caster.
 *
 * The distinguishing question from every other area ability in the collection:
 * this one asks **how many** it caught, and pays the caster back per target.
 * A single rooted enemy is a poor trade; a crowd is a heal and a lockdown at
 * once.
 *
 * | Ability | Area effect scales with |
 * |---|---|
 * | `burst` | distance from the centre |
 * | `nova` | what the target already suffers |
 * | `repulse` | nothing — everything is thrown equally |
 * | `entangle` | **how many were caught**, paid back to the caster |
 *
 * The roots are effects, not blocks. Nothing is placed in the world, so there
 * is nothing to clean up, no terrain to restore, and no chance of leaving vines
 * behind in someone's build — which is the failure mode a block-based
 * implementation would have.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const entangle = {
    id: 'custom_swords:entangle',
    name: 'Entangle',
    description: 'Roots everything nearby, and feeds on what it holds.',

    defaults: {
        /** Damage per rooted target. Low — the roots are the point. */
        damage: 3,
        cause: 'magic',
        /** Health returned to the caster per target rooted. */
        healPerTarget: 1,
        /** Ceiling on total healing, however large the crowd. */
        maxHeal: 6,
        /** Points in the ring of growth drawn at the ability's reach. */
        ringPoints: 18,
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
        if (typeof params.healPerTarget !== 'number' || params.healPerTarget < 0) {
            problems.push("'healPerTarget' must be a non-negative number.");
        }
        if (typeof params.maxHeal !== 'number' || params.maxHeal < 0) {
            problems.push("'maxHeal' must be a non-negative number.");
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
        if (targets.length === 0) return { ok: false, message: 'Nothing for the roots to hold.' };

        services.particles.ring(
            ctx.dimension,
            { id: ctx.visual?.trail ?? 'minecraft:villager_happy' },
            ctx.player.location,
            ctx.targeting.range ?? 5,
            params.ringPoints,
        );

        // No knockback: roots hold things where they are. Passing the binding's
        // knockback here would undo the ability's whole point.
        const report = services.combat.strike(ctx, targets, {
            damage: params.damage,
            damageCause: params.cause,
        });

        if (report.damaged === 0) return { ok: false, message: 'The roots found no purchase.' };

        // The caster is fed by what the roots hold, capped so a large crowd is
        // rewarding rather than a full heal.
        const healed = Math.min(report.damaged * params.healPerTarget, params.maxHeal);
        if (healed > 0) services.effects.heal(ctx.player, healed);

        return { ok: true, message: `${report.damaged} rooted` };
    },
};
