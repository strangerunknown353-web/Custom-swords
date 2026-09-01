/**
 * Cleave — a directional sweep in front of the caster.
 *
 * Where `burst` is omnidirectional and rewards being surrounded, `cleave`
 * rewards facing. Damage falls off with angle rather than distance: a target
 * dead ahead takes full force, one at the edge of the arc takes least. That
 * makes aim matter and gives a wide arc a real cost.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const cleave = {
    id: 'custom_swords:cleave',
    name: 'Cleave',
    description: 'Sweeps everything in a wide arc ahead of the caster.',

    defaults: {
        damage: 7,
        /** Damage retained at the edge of the arc, 0..1. 1 disables falloff. */
        edgeDamageFactor: 0.6,
        igniteSeconds: 0,
        cause: 'entityAttack',
        /** Particles drawn along the arc. 0 disables. */
        arcPoints: 12,
        /** Falls back to the binding's visual profile trail; see visual_profiles.js. */
        arcParticle: undefined,
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
        if (typeof params.edgeDamageFactor !== 'number' || params.edgeDamageFactor < 0 || params.edgeDamageFactor > 1) {
            problems.push("'edgeDamageFactor' must be between 0 and 1.");
        }
        if (!Number.isInteger(params.arcPoints) || params.arcPoints < 0) {
            problems.push("'arcPoints' must be a non-negative integer.");
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
        services.combat.playCast(ctx, origin);

        const range = ctx.targeting.range ?? 0;
        const halfAngle = ((ctx.targeting.angleDegrees ?? 90) * Math.PI) / 360;
        drawArc(ctx, origin, range, halfAngle, params);

        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'Nothing in the arc.' };

        const forward = ctx.viewDirection;
        const report = services.combat.strike(ctx, targets, {
            damage: params.damage,
            damageCause: params.cause,
            igniteSeconds: params.igniteSeconds,
            knockback: ctx.knockback,
            origin,
            damageScale: (target) => angleFalloff(origin, forward, target, halfAngle, params.edgeDamageFactor),
        });

        if (report.damaged === 0) return { ok: false, message: 'The sweep connected with nothing.' };
        return { ok: true, message: `${report.damaged} cleaved` };
    },
};

/**
 * @param {import('../../core/types.js').AbilityContext} ctx
 * @param {{x: number, y: number, z: number}} origin
 * @param {number} range
 * @param {number} halfAngle Radians.
 * @param {Record<string, any>} params
 */
function drawArc(ctx, origin, range, halfAngle, params) {
    if (params.arcPoints <= 0 || range <= 0) return;
    const forward = ctx.viewDirection;
    const baseAngle = Math.atan2(forward.z, forward.x);
    for (let i = 0; i < params.arcPoints; i++) {
        const t = params.arcPoints === 1 ? 0.5 : i / (params.arcPoints - 1);
        const angle = baseAngle - halfAngle + t * halfAngle * 2;
        ctx.services.particles.emit(
            ctx.dimension,
            { id: params.arcParticle ?? ctx.visual?.trail ?? 'minecraft:critical_hit_emitter', count: 1 },
            {
                x: origin.x + Math.cos(angle) * range * 0.7,
                y: origin.y + 1,
                z: origin.z + Math.sin(angle) * range * 0.7,
            },
        );
    }
}

/**
 * Full damage dead ahead, `edgeFactor` at the edge of the arc.
 *
 * @param {{x: number, y: number, z: number}} origin
 * @param {{x: number, y: number, z: number}} forward
 * @param {import('@minecraft/server').Entity} target
 * @param {number} halfAngle Radians.
 * @param {number} edgeFactor
 * @returns {number}
 */
function angleFalloff(origin, forward, target, halfAngle, edgeFactor) {
    if (edgeFactor >= 1 || halfAngle <= 0) return 1;
    try {
        const dx = target.location.x - origin.x;
        const dz = target.location.z - origin.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        const forwardLength = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
        if (length === 0 || forwardLength === 0) return 1;
        const cos = (dx * forward.x + dz * forward.z) / (length * forwardLength);
        const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
        return 1 - Math.min(angle / halfAngle, 1) * (1 - edgeFactor);
    } catch {
        return 1;
    }
}
