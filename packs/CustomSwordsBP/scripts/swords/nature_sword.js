/**
 * Nature Sword — attrition. The only blade here that gives something back.
 *
 * Identity: sustain. A precise single-target strike that leaves poison behind,
 * paired with a passive trickle of regeneration. It wins long fights against
 * one dangerous thing and is the weakest option against a crowd — the exact
 * inverse of the Earth Sword.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const natureSword = {
    id: 'custom_swords:nature_sword',
    name: 'Nature Sword',
    rarity: 'rare',
    description: 'Still growing. New shoots close over every notch the blade takes.',

    item: {
        attackDamage: 6,
        durability: 1000,
        swingDuration: 0.3,
        enchantValue: 17,
        repairItems: ['minecraft:moss_block'],
    },

    abilities: [
        {
            // NATURE'S WRATH — a committed strike that finishes wounded prey,
            // and leaves poison in anything that survives.
            activation: 'use',
            visual: 'grove',
            abilityId: 'custom_swords:strike',
            cooldownTicks: 110,
            hudCategory: 'custom_swords_nature',
            targeting: { type: 'single', range: 6 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.5, vertical: 0.1 },
            effects: [
                { effect: 'poison', durationTicks: 140, amplifier: 1 },
                { effect: 'slowness', durationTicks: 80 },
            ],
            particles: [
                { id: 'minecraft:villager_happy', count: 12, spread: 1, at: 'caster' },
                { id: 'minecraft:villager_happy', count: 6, spread: 0.4, at: 'target' },
            ],
            sounds: { cast: 'nature_cast', impact: 'nature_impact' },
            params: { damage: 8, executeMultiplier: 1.6, executeThreshold: 0.4, cause: 'magic' },
        },
        {
            // Passive: the blade feeds its wielder a little of what it takes.
            activation: 'attack',
            visual: 'grove',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 140,
            targeting: { type: 'self' },
            effects: [{ effect: 'regeneration', durationTicks: 80 }],
            particles: [{ id: 'minecraft:villager_happy', count: 4, spread: 0.4, at: 'caster' }],
            params: { heal: 0, extinguish: false },
        },
    ],
};
