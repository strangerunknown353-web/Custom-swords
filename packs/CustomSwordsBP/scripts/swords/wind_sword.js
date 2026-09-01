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
        enchantValue: 20,
        repairItems: ['minecraft:phantom_membrane'],
    },

    abilities: [
        {
            // WIND BURST — a radial shove. Force is clamped by the combat
            // system, so nobody leaves the map.
            activation: 'use',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 100,
            hudCategory: 'custom_swords_wind',
            targeting: { type: 'area', range: 5, maxTargets: 12 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 2.2, vertical: 0.55, mode: 'away' },
            particles: [{ id: 'minecraft:wind_explosion_emitter', count: 3, spread: 0.6, at: 'caster' }],
            sounds: { cast: 'wind_cast', impact: 'wind_impact' },
            params: { damage: 2, trailPoints: 4, trailParticle: 'minecraft:sculk_soul_particle' },
        },
        {
            // Passive: momentum after a connecting blow.
            activation: 'attack',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 120,
            targeting: { type: 'self' },
            effects: [{ effect: 'speed', durationTicks: 80, amplifier: 1 }],
            particles: [{ id: 'minecraft:sculk_soul_particle', count: 6, spread: 0.5, at: 'caster' }],
            params: { heal: 0, extinguish: false },
        },
    ],
};
