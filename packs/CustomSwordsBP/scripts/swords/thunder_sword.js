/**
 * Thunder Sword — reach. The only blade in the set that strikes somewhere the
 * wielder is not standing.
 *
 * Identity: burst damage at range. It calls a strike down on the spot the
 * wielder is looking at, which makes it the answer to an archer on a ledge and
 * the worst choice in a melee scrum, where its long cooldown bites.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const thunderSword = {
    id: 'custom_swords:thunder_sword',
    name: 'Thunder Sword',
    rarity: 'legendary',
    description: 'Storm-iron, quenched in a lightning strike. It still remembers the sky.',

    item: {
        attackDamage: 8,
        durability: 1400,
        swingDuration: 0.38,
        enchantValue: 18,
        repairItems: ['minecraft:copper_ingot'],
        glint: true,
    },

    abilities: [
        {
            // THUNDER STRIKE — a bolt lands where the wielder looks.
            activation: 'use',
            visual: 'storm',
            abilityId: 'custom_swords:surge',
            cooldownTicks: 200,
            hudCategory: 'custom_swords_thunder',
            targeting: { type: 'point', range: 16, maxTargets: 6 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.9, vertical: 0.5 },
            effects: [{ effect: 'weakness', durationTicks: 100 }],
            particles: [{ id: 'minecraft:endrod', count: 20, spread: 0.8, at: 'caster' }],
            sounds: { cast: 'thunder_cast', impact: 'thunder_impact' },
            params: { damage: 12, blastRadius: 3, edgeDamageFactor: 0.4, impactParticle: 'minecraft:endrod', impactCount: 24, ringPoints: 18 },
        },
        {
            // Passive: a static shock that leaves the target briefly reeling.
            activation: 'attack',
            visual: 'storm',
            abilityId: 'custom_swords:brand',
            cooldownTicks: 80,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'weakness', durationTicks: 40 }],
            particles: [{ id: 'minecraft:endrod', count: 6, spread: 0.3, at: 'target' }],
            params: { damage: 0, focusedDurationBonus: 1 },
        },
    ],
};
