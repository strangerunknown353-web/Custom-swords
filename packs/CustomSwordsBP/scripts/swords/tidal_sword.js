/**
 * Tidal Sword — direction. It shares an ability with the Wind Sword and plays
 * nothing like it.
 *
 * Identity: a wave. Where the Wind Sword shoves outward in every direction,
 * this sweeps a cone and drives everything in it the *same* way — along the
 * wielder's line of sight. That turns a scattered group into a single mass
 * moving off a ledge, which is a completely different tool from "get away from
 * me". The difference is one field in the binding: `knockback.mode: 'forward'`.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const tidalSword = {
    id: 'custom_swords:tidal_sword',
    name: 'Tidal Sword',
    rarity: 'epic',
    description: 'Drawn from a trench that has never seen light. The pull comes with it.',

    item: {
        attackDamage: 7,
        durability: 1200,
        swingDuration: 0.38,
        enchantValue: 15,
        repairItems: ['minecraft:prismarine_shard'],
    },

    // Epic: prismarine around a heart of the sea — the one recipe requiring a
    // genuine ocean-exploration item.
    recipe: {
        pattern: [' P ', ' H ', ' C '],
        key: {
            P: 'minecraft:prismarine_shard',
            H: 'minecraft:heart_of_the_sea',
            C: 'minecraft:prismarine_crystals',
        },
        unlockedBy: 'minecraft:heart_of_the_sea',
    },

    abilities: [
        {
            // TIDAL WAVE — a directional surge. Everything caught is driven the
            // same way rather than scattered.
            activation: 'use',
            visual: 'tide',
            label: 'Tidal Wave',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 150,
            hudCategory: 'custom_swords_tidal',
            targeting: { type: 'cone', range: 7, angleDegrees: 80, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 2.6, vertical: 0.35, mode: 'forward' },
            effects: [{ effect: 'slowness', durationTicks: 60 }],
            particles: [{ id: 'minecraft:water_splash_particle_manual', count: 20, spread: 1.5, at: 'caster' }],
            sounds: { cast: 'tidal_cast', impact: 'tidal_impact' },
            params: { damage: 6, trailPoints: 5, trailParticle: 'minecraft:water_splash_particle_manual' },
        },
        {
            // Passive: the sea keeps its own.
            activation: 'attack',
            visual: 'tide',
            label: 'Aqua Affinity',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 200,
            targeting: { type: 'self' },
            effects: [{ effect: 'water_breathing', durationTicks: 300 }],
            particles: [{ id: 'minecraft:water_splash_particle_manual', count: 4, spread: 0.4, at: 'caster' }],
            params: { heal: 0, extinguish: false },
        },
    ],
};
