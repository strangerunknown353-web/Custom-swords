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
        enchantValue: 10,
        repairItems: ['minecraft:deepslate'],
    },

    abilities: [
        {
            // EARTHQUAKE — heavy area damage, upward force, no block damage.
            activation: 'use',
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
            // Passive: the stone steadies its wielder.
            activation: 'attack',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 160,
            targeting: { type: 'self' },
            effects: [{ effect: 'resistance', durationTicks: 100, amplifier: 0 }],
            particles: [{ id: 'minecraft:basic_smoke_particle', count: 5, spread: 0.4, at: 'caster' }],
            params: { heal: 0, extinguish: false },
        },
    ],
};
