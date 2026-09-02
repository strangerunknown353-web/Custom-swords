/**
 * Ember Blade — the collection's fast, close-range ember weapon.
 *
 * This item began life as the framework's diagnostic Test Blade, whose four
 * bindings existed to exercise every activation method rather than to play
 * well. It is now a finished sword with a single coherent identity, and the
 * project ships no diagnostic item; `isTestItem` remains in the data model for
 * future use.
 *
 * ## Identity, and how it differs from Inferno
 *
 * Both are fire-themed, and they are meant to be told apart instantly:
 *
 * | | Ember Blade | Inferno Sword |
 * |---|---|---|
 * | Fantasy | ember-forged duelling blade | a weapon that ends things |
 * | Rarity | Uncommon | Epic |
 * | Melee | 6 | 9 |
 * | Swing | 0.22s — the fastest in the collection | 0.40s |
 * | Active | `ember_burst`, 3-block radius, 3.5s | `cleave`, 110° cone at 5 blocks, 7s |
 * | Damage source | heat banked by landing hits | a large flat number |
 * | Passive | banks heat, 1 chip damage | 3s ignite |
 *
 * The mechanical difference is the point. Inferno rewards picking a moment;
 * Ember Blade rewards staying in contact — it opens weak and gets dangerous
 * only once the wielder has been fighting. A player who swaps between them
 * should have to play differently, not just watch bigger numbers.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const emberBlade = {
    id: 'custom_swords:ember_blade',
    name: 'Ember Blade',
    rarity: 'uncommon',
    description: 'Quenched while still glowing. The forge never fully left the steel.',
    texture: 'ember_blade',

    item: {
        // 6 effective melee — below every Rare in the collection, which is
        // correct for an Uncommon and correct for a sword whose damage is
        // meant to come from its mechanic rather than its stat line.
        attackDamage: 5,
        durability: 500,
        enchantValue: 12,
        repairItems: ['minecraft:copper_ingot'],
        // The fastest swing shipped. This is the stat that sells "light and
        // quick" before the player has read a single tooltip.
        swingDuration: 0.22,
    },

    // Uncommon: two copper on a blaze-rod hilt. The cheapest sword in the
    // collection to make, matching its place at the base of the curve.
    recipe: {
        pattern: [' X ', ' X ', ' I '],
        key: { X: 'minecraft:copper_ingot', I: 'minecraft:blaze_rod' },
        unlockedBy: 'minecraft:blaze_rod',
    },

    abilities: [
        {
            // EMBER BURST — spend banked heat in a tight ring around the
            // wielder. Short range and a short cooldown, so it is a rhythm
            // ability rather than an opener.
            //
            // Re-priced in the final balance pass. At a 3.5s cooldown and a
            // 11.5 ceiling this sword produced more sustained damage across a
            // crowd than anything else in the collection — including three
            // Legendaries — while being the cheapest thing in it to craft. The
            // ceiling was reachable, too: five landed hits at the passive's own
            // 0.6s cadence is three seconds, which fits inside the old window
            // with time to spare. That is a progression inversion, not a
            // strong starter, so both halves moved: a slightly longer rhythm
            // and a ceiling that no longer tops an Epic's flat damage. It is
            // still the fastest active in the collection.
            activation: 'use',
            visual: 'ember',
            label: 'Ember Burst',
            abilityId: 'custom_swords:ember_burst',
            cooldownTicks: 90,
            hudCategory: 'custom_swords_ember_blade',
            targeting: { type: 'area', range: 3, maxTargets: 6 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.5, vertical: 0.25, mode: 'away' },
            particles: [
                { id: 'minecraft:redstone_torch_dust_particle', count: 14, spread: 1, at: 'caster' },
                { id: 'minecraft:candle_flame_particle', count: 4, spread: 0.35, at: 'target' },
            ],
            sounds: { cast: 'ember_cast', impact: 'ember_impact' },
            params: {
                damage: 4,
                damagePerCharge: 1.2,
                igniteSeconds: 2,
                igniteSecondsPerCharge: 0.5,
                chargeKey: 'ember_heat',
                cause: 'fire',
                ringPoints: 12,
            },
        },
        {
            // EMBER EDGE — the passive that feeds the burst. Nearly free on its
            // own; its whole purpose is the counter it builds.
            activation: 'attack',
            visual: 'ember',
            label: 'Ember Edge',
            abilityId: 'custom_swords:ember_edge',
            // A cooldown on the passive is what stops the fastest sword in the
            // collection from filling its own meter in one flurry.
            cooldownTicks: 12,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            particles: [{ id: 'minecraft:redstone_torch_dust_particle', count: 5, spread: 0.3, at: 'target' }],
            params: {
                damage: 1,
                cause: 'fire',
                chargeGain: 1,
                maxCharges: 5,
                chargeKey: 'ember_heat',
                igniteSeconds: 1,
            },
        },
    ],
};
