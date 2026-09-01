/**
 * Blink — a short, validated dash along the caster's view.
 *
 * The collection's first mobility ability, and the first whose *point* is not
 * damage. Everything else in the framework acts on targets; this one acts on
 * the caster's position, and the small strike on arrival is a garnish rather
 * than the meal.
 *
 * All the dangerous work — destination selection, block checks, fall
 * tolerance, lava refusal, the engine's collision test — lives in
 * `systems/movement.js`, so any future dash, charge or recall ability inherits
 * it rather than reimplementing it. This ability only decides *how far*, what
 * it looks like, and what happens on arrival.
 *
 * ## Failing to move is a normal outcome
 *
 * Facing a wall, standing in a corridor, or aiming over a drop all end with
 * `{ ok: false }` and a sentence explaining why. That is deliberate: the gate
 * charges no cooldown for a refused ability, so a blink that could not find
 * anywhere safe costs the player nothing but the click. Forcing the move would
 * be worse than declining it.
 *
 * ## The combo mark
 *
 * A successful blink stamps a life-scoped mark. `opportunist` reads it to know
 * the wielder has just repositioned. The two abilities never reference each
 * other — they share a key, which is what lets a future sword pair either one
 * with something else.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const blink = {
    id: 'custom_swords:blink',
    name: 'Blink',
    description: 'Steps through the dark to a place close by.',

    defaults: {
        /** Blocks to attempt. Clamped by `config.movement.maxDashDistance`. */
        distance: 6,
        /** Shortest hop worth taking rather than refusing. */
        minDistance: 2,
        /** Fall tolerated at the destination, in blocks. */
        maxDrop: 4,
        /** Land in water? Lava is refused regardless. */
        allowLiquid: false,
        /** Damage dealt to anything standing at the arrival point. */
        arrivalDamage: 4,
        /** How far from the arrival point that strike reaches. */
        arrivalRadius: 2.5,
        /** Entities the arrival strike may hit. */
        arrivalMaxTargets: 3,
        cause: 'magic',
        /** Particles drawn along the path travelled. */
        trailPoints: 10,
        /** Mark other abilities can read to detect a recent blink. */
        markKey: 'shadow_step',
    },

    /**
     * @param {Record<string, any>} params
     * @returns {string[]}
     */
    validateParams(params) {
        /** @type {string[]} */
        const problems = [];
        if (typeof params.distance !== 'number' || params.distance <= 0 || params.distance > 10) {
            problems.push("'distance' must be greater than 0 and at most 10.");
        }
        if (typeof params.minDistance !== 'number' || params.minDistance < 1 || params.minDistance > params.distance) {
            problems.push("'minDistance' must be at least 1 and no greater than 'distance'.");
        }
        if (typeof params.maxDrop !== 'number' || params.maxDrop < 0 || params.maxDrop > 16) {
            problems.push("'maxDrop' must be between 0 and 16.");
        }
        if (typeof params.arrivalDamage !== 'number' || params.arrivalDamage < 0) {
            problems.push("'arrivalDamage' must be a non-negative number.");
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

        const result = services.movement.dash(ctx, {
            maxDistance: params.distance,
            minDistance: params.minDistance,
            maxDrop: params.maxDrop,
            allowLiquid: params.allowLiquid,
        });

        if (!result.ok) return { ok: false, message: result.reason ?? 'Nowhere to step.' };

        // Cast visuals are emitted here rather than before the dash, so a
        // refused blink leaves no smoke where the player did not go.
        services.combat.playCast(ctx);

        const trail = ctx.visual?.trail ?? 'minecraft:basic_smoke_particle';
        services.particles.line(ctx.dimension, { id: trail }, result.from, result.to, params.trailPoints);
        services.particles.emit(ctx.dimension, { id: trail, count: 10, spread: 0.6 }, result.from);
        services.particles.emit(ctx.dimension, { id: trail, count: 10, spread: 0.6 }, result.to);

        services.state.mark(ctx.playerId, params.markKey, ctx.currentTick);

        // A small strike on arrival — enough that stepping *into* a fight is a
        // real option, nowhere near enough to make this a damage ability.
        let struck = 0;
        if (params.arrivalDamage > 0) {
            const nearby = services.targeting.around(ctx, result.to, params.arrivalRadius, params.arrivalMaxTargets);
            const report = services.combat.strike(ctx, nearby, {
                damage: params.arrivalDamage,
                damageCause: params.cause,
                knockback: ctx.knockback,
            });
            struck = report.damaged;
        }

        return {
            ok: true,
            message: struck > 0 ? `${result.distance}m · ${struck} caught` : `${result.distance}m`,
        };
    },
};
