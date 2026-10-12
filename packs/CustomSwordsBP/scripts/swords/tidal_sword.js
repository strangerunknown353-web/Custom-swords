/**
 * Ocean Sword — direction. It shares an ability with the Wind Sword and plays
 * nothing like it.
 *
 * Identity: a wave. Where the Wind Sword shoves outward in every direction,
 * this sweeps a cone and drives everything in it the *same* way — along the
 * wielder's line of sight. That turns a scattered group into a single mass
 * moving off a ledge, which is a completely different tool from "get away from
 * me". The difference is one field in the binding: `knockback.mode: 'forward'`.
 *
 * ## Why the identifier still says `tidal_sword`
 *
 * This shipped as "Tidal Sword" from v0.7.0 through v1.0.0 and is renamed here
 * to match the roster it was always meant to fill. The **identifier does not
 * move**: an item id is a save-file key, and changing it would orphan every
 * copy already crafted, in every world, with no migration path. The display
 * name is what a player reads; the id is what the world file remembers. Its
 * ability keeps the name Tidal Wave, which is what the wave itself is called.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const tidalSword = {
    id: 'custom_swords:tidal_sword',
    name: 'Ocean Sword',
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
            activation: 'use',
            visual: 'tide',
            label: 'Water Jet',
            abilityId: 'custom_swords:beam',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_tidal',
            targeting: { type: 'ray', range: 14 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.2, vertical: 0.2, mode: 'forward' },
            params: {
                damage: 6,
                pierceFalloff: 0.8,
                maxPierce: 5,
                cause: 'magic',
                igniteSeconds: 0,
                linePoints: 18,
            },
        },
        {
            activation: 'use',
            visual: 'tide',
            label: 'Whirlpool',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_tidal',
            targeting: { type: 'area', range: 7, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.6, vertical: 0.1, pull: true },
            effects: [{ effect: 'slowness', durationTicks: 80, amplifier: 1 }],
            params: { damage: 3, trailPoints: 5 },
        },
        {
            activation: 'use',
            visual: 'tide',
            label: 'Riptide Leap',
            abilityId: 'custom_swords:leap',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_tidal',
            targeting: { type: 'self' },
            effects: [{ effect: 'speed', durationTicks: 100 }],
            params: { horizontal: 2.2, vertical: 0.6, pitchLift: 0.5, burstCount: 12 },
        },
        {
            activation: 'use',
            visual: 'tide',
            label: 'Tidal Blessing',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 400,
            hudCategory: 'custom_swords_tidal',
            targeting: { type: 'self' },
            effects: [
                { effect: 'regeneration', durationTicks: 100 },
                { effect: 'water_breathing', durationTicks: 600 },
            ],
            params: { heal: 3, extinguish: true },
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
            // Water puts fire out. `bolster` has always been able to do this
            // and nothing asked it to, which left four swords sharing a passive
            // that differed only in which buff it named. This one now does
            // something the other three cannot.
            params: { heal: 0, extinguish: true },
        },
    ],
};
