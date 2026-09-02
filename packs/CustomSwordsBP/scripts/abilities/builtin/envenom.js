/**
 * Envenom — every hit makes the poison already in there one tier worse.
 *
 * ## The fourth shape of state, and the first that is not the player's
 *
 * The framework stores three shapes of per-player state, all in
 * `PlayerStateStore` and all keyed by `player.id`: resources (Ember's heat),
 * counters (Thunder's static charge) and windows (Shadow Step's combo). Each is
 * something the *wielder* carries between swings.
 *
 * This is a fourth, and it belongs to nobody: the venom lives **on the target**,
 * and it is stored in the game itself. `services.effects.amplifierOf` reads what
 * poison the target already carries, and the next hit applies the same effect
 * one amplifier higher.
 *
 * That is worth doing carefully rather than cleverly, because the obvious
 * alternative — a `Map` of entity id to stack count — is a memory leak wearing a
 * hat. Entities die, despawn, unload with their chunk, and cross dimensions;
 * every one of those is a key nothing will ever remove. Using the effect as the
 * store means the count expires exactly when the venom does, cleans itself up
 * when the mob dies, survives nothing it should not, and costs zero bytes
 * between activations.
 *
 * | Shape | Lives on | Cleared by |
 * |---|---|---|
 * | Resource / counter / window | the player | death, disconnect, the sweep |
 * | **Venom stacks** | **the target** | **the effect's own expiry** |
 *
 * ## How it differs from `afflict`
 *
 * Frost's passive also cares about a target that is already afflicted, and the
 * two are not the same mechanic. `afflict` asks a yes-or-no question — is the
 * marker present? — and pays a flat bonus. This one reads a *number* and raises
 * it, so the fifth hit on one target is meaningfully worse than the second. One
 * is a condition; this is an accumulator.
 *
 * The stacks are also worth something on their own: Poison Sword's active
 * (`rupture`) spends them. Building venom is not flavour, it is the sword's
 * resource loop — with the resource banked on the enemy rather than the wielder,
 * which is what makes it Poison Sword's and not Ember Blade's.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const envenom = {
    id: 'custom_swords:envenom',
    name: 'Envenom',
    description: 'Works the venom deeper with every blow.',

    defaults: {
        /**
         * Damage on the hit. At least 1 — this ability learns that its blow
         * landed from `StrikeReport.damaged`, and the damage layer refuses a
         * strike that resolves to zero. Deliberately low: the venom is the
         * damage, delivered later by the effect itself.
         */
        damage: 1,
        cause: 'magic',
        /** The effect used as the venom store. */
        venomEffect: 'poison',
        /** Ticks the venom lasts, refreshed by every hit that deepens it. */
        venomTicks: 100,
        /**
         * Highest amplifier a hit may build to. Poison II is already 1 HP per
         * 12 ticks; III on an endlessly refreshed timer would kill anything
         * given patience, which is not a weapon, it is a wait.
         */
        maxAmplifier: 2,
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
                "'damage' must be at least 1 — the venom is applied on a landed hit, and a zero-damage strike is refused.",
            );
        }
        if (typeof params.venomEffect !== 'string' || params.venomEffect.length === 0) {
            problems.push("'venomEffect' must be a non-empty effect name.");
        }
        if (!Number.isInteger(params.venomTicks) || params.venomTicks < 1) {
            problems.push("'venomTicks' must be a positive integer.");
        }
        if (!Number.isInteger(params.maxAmplifier) || params.maxAmplifier < 0 || params.maxAmplifier > 4) {
            problems.push("'maxAmplifier' must be an integer between 0 and 4.");
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

        // Read before striking, so this hit's own venom cannot count towards
        // the tier this hit is deciding. Same ordering rule `nova`, `afflict`
        // and `drain` follow.
        const carried = services.effects.amplifierOf(target, params.venomEffect);

        const report = services.combat.strikeOne(ctx, target, {
            damage: params.damage,
            damageCause: params.cause,
            // The venom is applied below at a computed amplifier; the binding's
            // own effects would land at a fixed one.
            applyBindingEffects: false,
        });
        if (!report.damaged) return { ok: false, message: 'The blow glanced off.' };

        // -1 means "carries none", so a fresh target starts at 0.
        const next = Math.min(carried + 1, params.maxAmplifier);
        const applied = services.effects.apply(target, {
            effect: params.venomEffect,
            durationTicks: params.venomTicks,
            amplifier: next,
        });

        // Anything the binding declares beyond the venom itself still lands, so
        // a sword can add weakness or nausea on top without touching this code.
        if (ctx.effects.length > 0) services.effects.applyMany(target, ctx.effects);

        if (!applied) return { ok: true, message: 'strike' };
        return { ok: true, message: next >= params.maxAmplifier ? 'venom (full)' : `venom ${next + 1}` };
    },
};
