/**
 * Wind Sword — space. Almost no ability damage; it exists to move things.
 *
 * Identity: mobility and disengagement. A radial shove clears the ground around
 * the wielder in every direction, and connecting in melee grants a moment of
 * speed. It is the escape tool of the set, and nearly useless as a finisher.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const windSword = {
    id: 'custom_swords:wind_sword',
    name: 'Wind Sword',
    rarity: 'rare',
    description: 'Light as a held breath. The air folds away from the edge before it arrives.',

    item: {
        attackDamage: 5,
        durability: 800,
        swingDuration: 0.25,
        enchantValue: 20,
        repairItems: ['minecraft:phantom_membrane'],
    },

    // Rare: phantom membrane stretched over a breeze rod. The lightest
    // materials in the game, for the lightest sword in the collection.
    recipe: {
        pattern: [' P ', ' P ', ' B '],
        key: { P: 'minecraft:phantom_membrane', B: 'minecraft:breeze_rod' },
        unlockedBy: 'minecraft:breeze_rod',
    },

    abilities: [
        {
            // WIND BURST — a radial shove. Force is clamped by the combat
            // system, so nobody leaves the map.
            activation: 'use',
            visual: 'gale',
            label: 'Wind Burst',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 100,
            hudCategory: 'custom_swords_wind',
            targeting: { type: 'area', range: 5, maxTargets: 12 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 2.2, vertical: 0.55, mode: 'away' },
            particles: [{ id: 'minecraft:knockback_roar_particle', count: 3, spread: 0.6, at: 'caster' }],
            sounds: { cast: 'wind_cast', impact: 'wind_impact' },
            params: { damage: 2, trailPoints: 4, trailParticle: 'minecraft:spore_blossom_ambient_particle' },
        },
        {
            activation: 'use',
            visual: 'gale',
            label: 'Updraft',
            abilityId: 'custom_swords:leap',
            cooldownTicks: 120,
            hudCategory: 'custom_swords_wind',
            targeting: { type: 'self' },
            effects: [{ effect: 'slow_falling', durationTicks: 100 }],
            params: { horizontal: 1.0, vertical: 1.2, pitchLift: 0.3, burstCount: 12 },
        },
        {
            activation: 'use',
            visual: 'gale',
            label: 'Gale Lance',
            abilityId: 'custom_swords:beam',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_wind',
            targeting: { type: 'ray', range: 12 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.6, vertical: 0.3, mode: 'forward' },
            params: {
                damage: 4,
                pierceFalloff: 0.8,
                maxPierce: 5,
                cause: 'magic',
                igniteSeconds: 0,
                linePoints: 18,
            },
        },
        {
            activation: 'use',
            visual: 'gale',
            label: 'Tailwind',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 400,
            hudCategory: 'custom_swords_wind',
            targeting: { type: 'self' },
            effects: [
                { effect: 'speed', durationTicks: 160, amplifier: 1 },
                { effect: 'jump_boost', durationTicks: 160, amplifier: 1 },
            ],
            params: { heal: 0, extinguish: false },
        },
        {
            // Passive: momentum after a connecting blow.
            activation: 'attack',
            visual: 'gale',
            label: 'Wind Momentum',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 120,
            targeting: { type: 'self' },
            effects: [{ effect: 'speed', durationTicks: 80, amplifier: 1 }],
            particles: [{ id: 'minecraft:spore_blossom_ambient_particle', count: 6, spread: 0.5, at: 'caster' }],
            params: { heal: 0, extinguish: false },
        },
    ],
};
