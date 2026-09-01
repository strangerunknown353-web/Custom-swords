/**
 * Ember Burst — a tight, fast release of stored heat.
 *
 * The deliberate contrast with `cleave` (which Inferno binds): cleave is a wide
 * destructive sweep that hits hardest at its centre and costs a long cooldown.
 * Ember Burst is short-ranged, cheap and frequent, and its damage comes from
 * what the wielder has *built up* rather than from a big base number. Played
 * well it out-damages a single cleave; opened cold it is a light tap.
 *
 * That difference is mechanical, not cosmetic: this is the first ability in the
 * project whose output depends on per-player state carried between activations.
 * It reads the heat stacks that `ember_edge` lays down on melee hits, spends
 * them all, and scales damage and burn duration by how many there were.
 *
 * Stacks live in the `life:` scope, so dying resets them. Everything is keyed
 * by `ctx.playerId`, so two players' heat can never mix.
 *
 * @type {import('../../core/types.js').AbilityDefinition}
 */
export const emberBurst = {
    id: 'custom_swords:ember_burst',
    name: 'Ember Burst',
    description: 'Releases stored heat in a tight burst around the wielder.',

    defaults: {
        /** Damage with no heat banked. Deliberately modest. */
        damage: 4,
        /** Extra damage per heat stack spent. */
        damagePerCharge: 1.5,
        /** Name of the counter shared with the passive. */
        chargeKey: 'ember_heat',
        /** Seconds of burn at zero stacks. */
        igniteSeconds: 2,
        /** Extra burn seconds per stack, rounded down at the end. */
        igniteSecondsPerCharge: 0.5,
        cause: 'fire',
        /** Ring drawn to show the burst's reach. */
        ringPoints: 12,
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
        if (typeof params.damagePerCharge !== 'number' || params.damagePerCharge < 0) {
            problems.push("'damagePerCharge' must be a non-negative number.");
        }
        if (typeof params.chargeKey !== 'string' || params.chargeKey.length === 0) {
            problems.push("'chargeKey' must be a non-empty string.");
        }
        if (typeof params.igniteSeconds !== 'number' || params.igniteSeconds < 0) {
            problems.push("'igniteSeconds' must be a non-negative number.");
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
        if (targets.length === 0) {
            // No target means no spend: the heat stays banked for the next
            // swing. A missed burst must not cost the player their build-up,
            // and the gate already declines to start a cooldown on `ok: false`.
            return { ok: false, message: 'Nothing close enough to scorch.' };
        }

        // Spend everything. Reading and clearing in one step means two rapid
        // activations cannot both claim the same stacks.
        const charges = services.state.spendCharges(ctx.playerId, params.chargeKey);

        const damage = params.damage + charges * params.damagePerCharge;
        const igniteSeconds = Math.floor(params.igniteSeconds + charges * params.igniteSecondsPerCharge);

        // A ring at the burst's edge, so the short range reads as deliberate
        // rather than as the ability under-performing.
        const range = ctx.targeting.range ?? 3;
        services.particles.ring(
            ctx.dimension,
            { id: ctx.visual?.trail ?? 'minecraft:obsidian_glow_dust_particle' },
            ctx.player.location,
            range,
            params.ringPoints,
        );

        const report = services.combat.strike(ctx, targets, {
            damage,
            damageCause: params.cause,
            igniteSeconds,
            knockback: ctx.knockback,
        });

        if (report.damaged === 0) return { ok: false, message: 'The burst found nothing.' };

        return {
            ok: true,
            message: charges > 0 ? `${report.damaged} hit · ${charges} heat` : `${report.damaged} hit`,
        };
    },
};
