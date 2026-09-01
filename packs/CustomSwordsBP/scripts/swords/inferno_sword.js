/**
 * Inferno Sword — fire, sustained through burning rather than raw impact.
 *
 * Identity: damage over time. Its slash hurts less on contact than the Earth
 * Sword's quake, but everything it touches keeps burning, so it wins drawn-out
 * fights and struggles against anything it cannot set alight.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const infernoSword = {
    id: 'custom_swords:inferno_sword',
    name: 'Inferno Sword',
    rarity: 'epic',
    description: 'Forged in a caldera. Its edge never cools, and neither does anything it touches.',

    item: {
        attackDamage: 8,
        durability: 1100,
        enchantValue: 14,
        repairItems: ['minecraft:blaze_rod'],
        glint: true,
    },

    abilities: [
        {
            // INFERNO SLASH — a sweeping arc of fire in front of the wielder.
            activation: 'use',
            abilityId: 'custom_swords:cleave',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_inferno',
            targeting: { type: 'cone', range: 5, angleDegrees: 110, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.6, vertical: 0.2 },
            effects: [{ effect: 'weakness', durationTicks: 80 }],
            particles: [
                { id: 'minecraft:basic_flame_particle', count: 18, spread: 1.4, at: 'caster' },
                { id: 'minecraft:lava_particle', count: 5, spread: 0.5, at: 'target' },
            ],
            sounds: { cast: 'inferno_cast', impact: 'inferno_impact' },
            params: { damage: 7, edgeDamageFactor: 0.65, igniteSeconds: 6, cause: 'fire', arcPoints: 14, arcParticle: 'minecraft:basic_flame_particle' },
        },
        {
            // Passive: contact leaves embers. Brief, and on its own short timer
            // so it cannot proc on every swing of a fast attack.
            activation: 'attack',
            abilityId: 'custom_swords:brand',
            cooldownTicks: 60,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            particles: [{ id: 'minecraft:basic_flame_particle', count: 4, spread: 0.3, at: 'target' }],
            params: { damage: 0, igniteSeconds: 3, focusedDurationBonus: 1 },
        },
    ],
};
