/**
 * Earth Sword — weight. The heaviest hit in the set and the slowest to recover.
 *
 * Identity: raw area damage. A quake centred on the wielder that throws
 * everything upward and hits hardest at the centre, so it rewards being
 * surrounded — the exact situation every other sword here tries to escape.
 *
 * It deliberately modifies no blocks. An "earthquake" that cratered the world
 * would be unusable on a shared server, so the effect is entirely on entities.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const earthSword = {
    id: 'custom_swords:earth_sword',
    name: 'Earth Sword',
    rarity: 'epic',
    description: 'More monolith than blade. The ground answers when it lands.',

    item: {
        attackDamage: 9,
        durability: 1500,
        swingDuration: 0.55,
        enchantValue: 10,
        repairItems: ['minecraft:deepslate'],
    },

    // Epic: a slab of deepslate over an emerald core. Heavy, and it costs the
    // most raw blocks of any recipe — which suits the heaviest blade.
    recipe: {
        pattern: [' D ', 'DED', ' I '],
        key: { D: 'minecraft:deepslate', E: 'minecraft:emerald', I: 'minecraft:stick' },
        unlockedBy: 'minecraft:deepslate',
    },

    abilities: [
        {
            // EARTHQUAKE — heavy area damage, upward force, no block damage.
            activation: 'use',
            visual: 'stone',
            label: 'Earth Shock',
            abilityId: 'custom_swords:burst',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_earth',
            targeting: { type: 'area', range: 6, maxTargets: 12 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.0, vertical: 1.1, mode: 'away' },
            effects: [{ effect: 'slowness', durationTicks: 60, amplifier: 1 }],
            particles: [{ id: 'minecraft:basic_smoke_particle', count: 16, spread: 1.6, at: 'caster' }],
            sounds: { cast: 'earth_cast', impact: 'earth_impact' },
            params: { damage: 11, edgeDamageFactor: 0.35, ringPoints: 24, ringParticle: 'minecraft:basic_smoke_particle' },
        },
        {
            activation: 'use',
            visual: 'stone',
            label: 'Boulder Toss',
            abilityId: 'custom_swords:beam',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_earth',
            targeting: { type: 'ray', range: 12 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.2, vertical: 0.4 },
            params: {
                damage: 8,
                pierceFalloff: 0.6,
                maxPierce: 2,
                cause: 'entityAttack',
                igniteSeconds: 0,
                linePoints: 18,
            },
        },
        {
            activation: 'use',
            visual: 'stone',
            label: 'Seismic Slam',
            abilityId: 'custom_swords:crush',
            cooldownTicks: 200,
            hudCategory: 'custom_swords_earth',
            targeting: { type: 'area', range: 6, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.2, vertical: -0.5, pull: true },
            params: {
                groundDamage: 7,
                heightBonus: 4,
                fullHeight: 5,
                cause: 'entityAttack',
                ringPoints: 20,
            },
        },
        {
            activation: 'use',
            visual: 'stone',
            label: 'Quake Pull',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_earth',
            targeting: { type: 'area', range: 8, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.4, vertical: 0.1, pull: true },
            effects: [{ effect: 'slowness', durationTicks: 60, amplifier: 1 }],
            params: { damage: 3, trailPoints: 5 },
        },
        {
            activation: 'use',
            visual: 'stone',
            label: 'Stone Skin',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 500,
            hudCategory: 'custom_swords_earth',
            targeting: { type: 'self' },
            effects: [{ effect: 'resistance', durationTicks: 160, amplifier: 1 }],
            params: { heal: 2, extinguish: false },
        },
        {
            // Passive: the stone steadies its wielder.
            activation: 'attack',
            visual: 'stone',
            label: 'Stone Guard',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 160,
            targeting: { type: 'self' },
            effects: [{ effect: 'resistance', durationTicks: 100, amplifier: 0 }],
            particles: [{ id: 'minecraft:basic_smoke_particle', count: 5, spread: 0.4, at: 'caster' }],
            params: { heal: 0, extinguish: false },
        },
    ],
};
