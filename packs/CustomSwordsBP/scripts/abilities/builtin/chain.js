/**
 * Chain — a precise strike on one target that arcs to nearby others.
 *
 * The collection's other reaching ability, `surge`, detonates at a *point* the
 * caster is looking at and damages everything in a sphere around it. This one
 * picks a single entity and jumps between entities, which is a different shape
 * of decision: `surge` rewards aiming at a cluster's centre, `chain` rewards
 * finding a line of enemies.
 *
 * ## Why this does not spawn a lightning bolt
 *
 * `Dimension.spawnEntity('minecraft:lightning_bolt', …)` is the obvious way to
 * make this look right, and it is the wrong one. A real bolt sets fires, turns
 * creepers into charged creepers, pigs into zombified piglins and villagers
 * into witches, damages anything nearby including the caster, and does all of
 * that outside the combat layer's validation, hit protection and PvP rules.
 *
 * The arc is therefore drawn with particles and sound, and every point of
 * damage goes through `combat.strikeOne` like any other ability. The sword
 * looks like lightning and behaves like the rest of the framework. This is a
 * deliberate trade of visual fidelity for predictability; see
 * `docs/API_NOTES.md`.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const chain = {
    id: 'custom_swords:chain',
    name: 'Chain',
    description: 'Strikes one foe, then arcs to those beside it.',

    defaults: {
        /** Damage to the first target. */
        damage: 9,
        cause: 'lightning',
        /** Additional targets after the first. */
        maxJumps: 3,
        /** How far the arc may reach from one target to the next. */
        jumpRange: 5,
        /** Damage retained per jump: 0.6 means each link hits for 60% of the last. */
        jumpFalloff: 0.6,
        /** Particles drawn along each arc. */
        arcPoints: 8,
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
        if (!Number.isInteger(params.maxJumps) || params.maxJumps < 0 || params.maxJumps > 8) {
            problems.push("'maxJumps' must be an integer between 0 and 8.");
        }
        if (typeof params.jumpRange !== 'number' || params.jumpRange <= 0 || params.jumpRange > 16) {
            problems.push("'jumpRange' must be greater than 0 and at most 16.");
        }
        if (typeof params.jumpFalloff !== 'number' || params.jumpFalloff <= 0 || params.jumpFalloff > 1) {
            problems.push("'jumpFalloff' must be greater than 0 and at most 1.");
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

        // The binding's targeting picks the first link — `single` or `ray`, so
        // the player chooses who gets hit rather than the ability guessing.
        const primary = services.targeting.resolve(ctx)[0];
        if (primary === undefined) return { ok: false, message: 'No target in the storm.' };

        // Candidates for the remaining links. One query, bounded by the reach
        // the chain could possibly cover, rather than one query per jump.
        const reach = params.jumpRange * (params.maxJumps + 1);
        const candidates = services.targeting.around(ctx, primary.location, reach);

        const struck = [];
        const visited = new Set();
        let current = primary;
        let damage = params.damage;
        const arcParticle = ctx.visual?.trail ?? 'minecraft:endrod';

        for (let link = 0; link <= params.maxJumps; link++) {
            if (current === undefined) break;

            let id;
            try {
                id = current.id;
            } catch {
                break; // handle went invalid mid-chain
            }
            if (visited.has(id)) break;
            visited.add(id);

            if (link > 0) {
                // Draw the arc from the previous link before striking, so the
                // visual survives even if the strike is refused.
                const from = struck.at(-1);
                if (from !== undefined) {
                    services.particles.line(ctx.dimension, { id: arcParticle }, from, safeLocation(current), params.arcPoints);
                }
            }

            const report = services.combat.strikeOne(ctx, current, {
                damage,
                damageCause: params.cause,
                knockback: link === 0 ? ctx.knockback : undefined,
            });
            if (report.damaged) struck.push(safeLocation(current));

            damage *= params.jumpFalloff;
            current = nearestUnvisited(candidates, current, visited, params.jumpRange);
        }

        if (struck.length === 0) return { ok: false, message: 'The bolt earthed itself.' };
        return { ok: true, message: struck.length === 1 ? '1 struck' : `${struck.length} struck` };
    },
};

/**
 * @param {import('@minecraft/server').Entity} entity
 * @returns {{ x: number, y: number, z: number }}
 */
function safeLocation(entity) {
    try {
        const { x, y, z } = entity.location;
        return { x, y: y + 1, z };
    } catch {
        return { x: 0, y: 0, z: 0 };
    }
}

/**
 * The closest candidate to `from` that has not been struck yet and is inside
 * `range`. Linear over an already-bounded candidate list — no second engine
 * query, and no world scan.
 *
 * @param {readonly import('@minecraft/server').Entity[]} candidates
 * @param {import('@minecraft/server').Entity} from
 * @param {Set<string>} visited
 * @param {number} range
 * @returns {import('@minecraft/server').Entity | undefined}
 */
function nearestUnvisited(candidates, from, visited, range) {
    let origin;
    try {
        origin = from.location;
    } catch {
        return undefined;
    }

    let best;
    let bestDistance = range * range;
    for (const candidate of candidates) {
        try {
            if (!candidate.isValid || visited.has(candidate.id)) continue;
            const { x, y, z } = candidate.location;
            const dx = x - origin.x;
            const dy = y - origin.y;
            const dz = z - origin.z;
            const squared = dx * dx + dy * dy + dz * dz;
            if (squared <= bestDistance) {
                bestDistance = squared;
                best = candidate;
            }
        } catch {
            // Skip a candidate whose handle died; the chain continues.
        }
    }
    return best;
}
