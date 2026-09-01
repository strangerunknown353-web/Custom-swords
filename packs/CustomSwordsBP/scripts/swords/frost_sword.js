/**
 * Frost Sword — control. The lowest ability damage in the set, and the reason
 * to carry it anyway.
 *
 * Identity: it does not kill things, it stops them. A wide, long-lasting field
 * of slowness and mining fatigue turns a charging group into a walking one,
 * which is worth more than damage when the wielder is outnumbered.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const frostSword = {
    id: 'custom_swords:frost_sword',
    name: 'Frost Sword',
    rarity: 'rare',
    description: 'Grown, not forged. The air around the blade never quite thaws.',

    item: {
        attackDamage: 6,
        durability: 900,
        enchantValue: 16,
        repairItems: ['minecraft:packed_ice'],
    },

    abilities: [
        {
            // FROZEN STRIKE — a chilling field. Effects are the payload.
            activation: 'use',
            abilityId: 'custom_swords:brand',
            cooldownTicks: 120,
            hudCategory: 'custom_swords_frost',
            targeting: { type: 'area', range: 6, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            effects: [
                { effect: 'slowness', durationTicks: 140, amplifier: 2 },
                { effect: 'mining_fatigue', durationTicks: 120, amplifier: 1 },
            ],
            particles: [
                { id: 'minecraft:snowflake_particle', count: 20, spread: 2, at: 'caster' },
                { id: 'minecraft:ice_evaporation_emitter', count: 3, spread: 0.4, at: 'target' },
            ],
            sounds: { cast: 'frost_cast', impact: 'frost_impact' },
            params: { damage: 3, cause: 'magic', focusedDurationBonus: 1.6 },
        },
        {
            // Passive: contact chills, briefly.
            activation: 'attack',
            abilityId: 'custom_swords:brand',
            cooldownTicks: 50,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'slowness', durationTicks: 40 }],
            particles: [{ id: 'minecraft:snowflake_particle', count: 5, spread: 0.3, at: 'target' }],
            params: { damage: 0, focusedDurationBonus: 1 },
        },
    ],
};
