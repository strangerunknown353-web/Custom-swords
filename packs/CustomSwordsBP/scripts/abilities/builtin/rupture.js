import { round1 } from '../support.js';

/**
 * Rupture — spends the venom the wielder has been working in.
 *
 * The other half of Poison Sword's loop, and the reason `envenom` builds a
 * number rather than a flag. Every target caught in the burst is struck for
 * damage scaled by **the venom it is already carrying**, and that venom is then
 * consumed — stripped from the target and replaced with a short, fresh dose.
 *
 * ## Banked on the enemy, not on the wielder
 *
 * `ember_burst` is the closest relative and the contrast is the point:
 *
 * | | Ember Burst | Rupture |
 * |---|---|---|
 * | The meter is on | the **wielder** | each **target** |
 * | Filled by | swinging at anything | swinging at *that* target |
 * | Spending it | one button, all at once | per target, whatever each holds |
 * | Losing it | dying | that target dying, or the venom timing out |
 *
 * A wielder with a full Ember meter carries it into the next fight. A wielder
 * who has spent thirty seconds working venom into one troll and then kills a
 * different mob has banked nothing. That makes Poison Sword a sword about
 * *commitment to a target*, which is a decision no other sword in the
 * collection asks for.
 *
 * ## Why the venom is consumed
 *
 * If the burst read the stacks without spending them, the optimal play would be
 * to build to the cap once and then press the button on cooldown forever. Taking
 * the stacks makes each rupture a real choice about timing — and it is the
 * reason `services.effects.remove` exists, as the target-side counterpart to
 * `spendCharges`.
 *
 * A small residual dose is reapplied afterwards, so a rupture leaves its targets
 * poisoned rather than cleansed. Curing an enemy would be a strange thing for a
 * poison sword to do.
 *
 * ## Bounded, and over when it returns
 *
 * One entity query in a small radius, one strike, no blocks touched, no entity
 * spawned, no cloud left behind. The lingering damage is the vanilla `poison`
 * effect, which the engine expires on its own — there is no tick loop here and
 * no timer to leak.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const rupture = {
    id: 'custom_swords:rupture',
    name: 'Rupture',
    description: 'Bursts the venom already worked into everything nearby.',

    defaults: {
        /** Damage to a target carrying no venom at all. */
        damage: 4,
        cause: 'magic',
        /** The effect that counts as venom. Must match the passive's `venomEffect`. */
        venomEffect: 'poison',
        /** Extra damage per amplifier tier the target was carrying. */
        damagePerTier: 3,
        /** Residual venom left behind, in ticks. 0 leaves the target clean. */
        residualTicks: 60,
        /** Points in the ring drawn at the burst's reach. 0 disables it. */
        ringPoints: 18,
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
        if (typeof params.venomEffect !== 'string' || params.venomEffect.length === 0) {
            problems.push("'venomEffect' must be a non-empty effect name.");
        }
        if (typeof params.damagePerTier !== 'number' || params.damagePerTier < 0) {
            problems.push("'damagePerTier' must be a non-negative number.");
        }
        if (!Number.isInteger(params.residualTicks) || params.residualTicks < 0) {
            problems.push("'residualTicks' must be a non-negative integer.");
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
        if (targets.length === 0) return { ok: false, message: 'No one to burst.' };

        if (params.ringPoints > 0) {
            services.particles.ring(
                ctx.dimension,
                { id: ctx.visual?.trail ?? 'minecraft:llama_spit_smoke' },
                ctx.player.location,
                ctx.targeting.range ?? 4,
                params.ringPoints,
            );
        }

        // Read every target's venom BEFORE anything is struck, so the burst
        // cannot count venom it applies itself, and so the tiers are measured
        // against one consistent moment rather than drifting as the loop runs.
        /** @type {Map<string, number>} entity id -> tiers carried */
        const carried = new Map();
        let spent = 0;
        for (const target of targets) {
            const tiers = services.effects.amplifierOf(target, params.venomEffect) + 1;
            if (tiers <= 0) continue;
            const id = idOf(target);
            if (id === undefined) continue;
            carried.set(id, tiers);
            spent += tiers;
        }

        const report = services.combat.strike(ctx, targets, {
            damage: params.damage,
            damageCause: params.cause,
            knockback: ctx.knockback,
            damageScale: (target) => {
                const tiers = carried.get(idOf(target) ?? '') ?? 0;
                return 1 + (tiers * params.damagePerTier) / params.damage;
            },
        });

        if (report.damaged === 0) return { ok: false, message: 'The venom found no purchase.' };

        // Spend what was read, then leave a residual dose. Done after the strike
        // so a target that the combat layer refused keeps its venom rather than
        // being quietly cleansed by an ability that never touched it.
        for (const target of targets) {
            const id = idOf(target);
            if (id === undefined || !carried.has(id)) continue;
            services.effects.remove(target, params.venomEffect);
            if (params.residualTicks > 0) {
                services.effects.apply(target, {
                    effect: params.venomEffect,
                    durationTicks: params.residualTicks,
                    amplifier: 0,
                });
            }
        }

        return {
            ok: true,
            message: spent > 0 ? `${report.damaged} burst · ${round1(spent)} venom spent` : `${report.damaged} burst`,
        };
    },
};

/**
 * An entity's id, or `undefined` if the handle has gone invalid. Local because
 * abilities import only pure helpers, and this one is about engine handles
 * rather than numbers.
 *
 * @param {import('@minecraft/server').Entity} entity
 * @returns {string | undefined}
 */
function idOf(entity) {
    try {
        return entity.isValid ? entity.id : undefined;
    } catch {
        return undefined;
    }
}
