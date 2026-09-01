/**
 * Strike — single-target damage with an optional execute bonus.
 *
 * The building block for precise, committed attacks: it hits exactly what the
 * caster is looking at, and hits harder when the target is already hurt. That
 * conditional is the point — it is a behaviour an envelope alone cannot express,
 * so it justifies being its own ability rather than a binding variation.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const strike = {
    id: 'custom_swords:strike',
    name: 'Strike',
    description: 'A committed single-target blow that bites deeper into a wounded foe.',

    defaults: {
        /** Hit points before the global multiplier. */
        damage: 8,
        /** Extra multiplier applied when the target is below `executeThreshold`. */
        executeMultiplier: 1,
        /** Fraction of maximum health below which the bonus applies. */
        executeThreshold: 0.35,
        /** Seconds of burning applied on hit. 0 disables. */
        igniteSeconds: 0,
        /** `EntityDamageCause` for the hit. */
        cause: 'entityAttack',
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
        if (typeof params.executeMultiplier !== 'number' || params.executeMultiplier < 1) {
            problems.push("'executeMultiplier' must be at least 1.");
        }
        if (typeof params.executeThreshold !== 'number' || params.executeThreshold <= 0 || params.executeThreshold > 1) {
            problems.push("'executeThreshold' must be between 0 and 1.");
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

        const [target] = services.targeting.resolve(ctx);
        if (target === undefined) return { ok: false, message: 'No target in front of you.' };

        const report = services.combat.strikeOne(ctx, target, {
            damage: params.damage,
            damageCause: params.cause,
            igniteSeconds: params.igniteSeconds,
            knockback: ctx.knockback,
            damageScale: () => (isWounded(ctx, target, params.executeThreshold) ? params.executeMultiplier : 1),
        });

        if (report.damaged === 0) return { ok: false, message: 'The blow found nothing.' };
        return { ok: true, message: `${Math.round(report.totalDamage)} damage` };
    },
};

/**
 * @param {import('../../core/types.js').AbilityContext} ctx
 * @param {import('@minecraft/server').Entity} target
 * @param {number} threshold
 * @returns {boolean}
 */
function isWounded(ctx, target, threshold) {
    try {
        const health = target.getComponent('minecraft:health');
        if (health === undefined) return false;
        const component = /** @type {any} */ (health);
        if (!(component.effectiveMax > 0)) return false;
        return component.currentValue / component.effectiveMax <= threshold;
    } catch {
        // Unknown health is not a bonus — fail to the ordinary case.
        return false;
    }
}
