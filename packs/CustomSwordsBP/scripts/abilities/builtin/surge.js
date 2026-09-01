/**
 * Surge — a point-targeted detonation at range.
 *
 * The only ability that acts somewhere other than where the caster stands. It
 * resolves the block the player is looking at, then bursts there, which is the
 * shape every future meteor, ground-slam or thrown-explosive ability needs.
 * `point` targeting finds no entities by itself, so the ability does its own
 * sphere query around the resolved location.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const surge = {
    id: 'custom_swords:surge',
    name: 'Surge',
    description: 'Detonates at the spot the caster is looking at.',

    defaults: {
        damage: 7,
        /** Blast radius around the impact point. */
        blastRadius: 3.5,
        edgeDamageFactor: 0.5,
        igniteSeconds: 0,
        cause: 'entityAttack',
        /** Particles at the impact point. */
        impactParticle: 'minecraft:basic_smoke_particle',
        impactCount: 14,
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
        if (typeof params.blastRadius !== 'number' || params.blastRadius <= 0) {
            problems.push("'blastRadius' must be a positive number.");
        }
        if (typeof params.edgeDamageFactor !== 'number' || params.edgeDamageFactor < 0 || params.edgeDamageFactor > 1) {
            problems.push("'edgeDamageFactor' must be between 0 and 1.");
        }
        return problems;
    },

    /**
     * @param {import('../../core/types.js').AbilityContext} ctx
     * @returns {import('../../core/types.js').AbilityResult}
     */
    execute(ctx) {
        const { params, services } = ctx;

        // Where the caster is looking, clamped to the binding's range.
        const impact = services.targeting.resolvePoint(ctx);
        services.combat.playCast(ctx, impact);
        services.particles.emit(
            ctx.dimension,
            { id: params.impactParticle, count: params.impactCount, spread: 1 },
            impact,
        );
        if (params.ringPoints > 0) {
            services.particles.ring(
                ctx.dimension,
                { id: params.impactParticle },
                impact,
                params.blastRadius,
                params.ringPoints,
            );
        }

        // `point` targeting resolves a location, not entities, so the blast
        // does its own sweep around the impact site.
        const targets = services.targeting.sphere(ctx, {
            range: params.blastRadius,
            origin: impact,
            maxTargets: ctx.targeting.maxTargets,
            allowedCategories: ctx.allowedTargets,
        });
        if (targets.length === 0) return { ok: false, message: 'The impact hit nothing.' };

        const report = services.combat.strike(ctx, targets, {
            damage: params.damage,
            damageCause: params.cause,
            igniteSeconds: params.igniteSeconds,
            knockback: ctx.knockback,
            origin: impact,
            damageScale: (target) => radialFalloff(impact, target, params.blastRadius, params.edgeDamageFactor),
        });

        if (report.damaged === 0) return { ok: false, message: 'The impact hit nothing.' };
        return { ok: true, message: `${report.damaged} caught` };
    },
};

/**
 * @param {{x: number, y: number, z: number}} origin
 * @param {import('@minecraft/server').Entity} target
 * @param {number} radius
 * @param {number} edgeFactor
 * @returns {number}
 */
function radialFalloff(origin, target, radius, edgeFactor) {
    if (radius <= 0 || edgeFactor >= 1) return 1;
    try {
        const dx = target.location.x - origin.x;
        const dy = target.location.y - origin.y;
        const dz = target.location.z - origin.z;
        const distance = Math.min(Math.sqrt(dx * dx + dy * dy + dz * dz), radius);
        return 1 - (distance / radius) * (1 - edgeFactor);
    } catch {
        return 1;
    }
}
