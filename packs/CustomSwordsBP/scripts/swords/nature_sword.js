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

    // Rare: living moss grown over an emerald, on an oak haft.
    recipe: {
        pattern: [' M ', ' E ', ' L '],
        key: { M: 'minecraft:moss_block', E: 'minecraft:emerald', L: 'minecraft:oak_log' },
        unlockedBy: 'minecraft:moss_block',
    },

    abilities: [
        {
            // NATURE'S WRATH — a committed strike that finishes wounded prey,
            // and leaves poison in anything that survives.
            activation: 'use',
            visual: 'grove',
            label: "Nature's Grasp",
            abilityId: 'custom_swords:entangle',
            cooldownTicks: 110,
            hudCategory: 'custom_swords_nature',
            targeting: { type: 'area', range: 5, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            // Deliberately no knockback: roots hold, they do not shove.
            effects: [
                { effect: 'slowness', durationTicks: 100, amplifier: 2 },
                { effect: 'weakness', durationTicks: 100 },
            ],
            particles: [
                { id: 'minecraft:villager_happy', count: 14, spread: 1.4, at: 'caster' },
                { id: 'minecraft:spore_blossom_shower_particle', count: 5, spread: 0.4, at: 'target' },
            ],
            sounds: { cast: 'nature_cast', impact: 'nature_impact' },
            params: { damage: 3, cause: 'magic', healPerTarget: 1, maxHeal: 6, ringPoints: 18 },
        },
        {
            activation: 'use',
            visual: 'grove',
            label: 'Thorn Burst',
            abilityId: 'custom_swords:burst',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_nature',
            targeting: { type: 'area', range: 4.5, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.6, vertical: 0.25, mode: 'away' },
            effects: [{ effect: 'poison', durationTicks: 60 }],
            params: { damage: 5, edgeDamageFactor: 0.5, igniteSeconds: 0, cause: 'magic', ringPoints: 20 },
        },
        {
            activation: 'use',
            visual: 'grove',
            label: 'Vine Lash',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_nature',
            targeting: { type: 'area', range: 8, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.4, vertical: 0.2, pull: true },
            effects: [{ effect: 'slowness', durationTicks: 60, amplifier: 1 }],
            params: { damage: 2, trailPoints: 5 },
        },
        {
            activation: 'use',
            visual: 'grove',
            label: 'Bloom',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 400,
            hudCategory: 'custom_swords_nature',
            targeting: { type: 'self' },
            effects: [{ effect: 'regeneration', durationTicks: 100, amplifier: 1 }],
            params: { heal: 3, extinguish: false },
        },
        {
            // Passive: the blade feeds its wielder a little of what it takes.
            activation: 'attack',
            visual: 'grove',
            label: "Nature's Vitality",
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 140,
            targeting: { type: 'self' },
            effects: [{ effect: 'regeneration', durationTicks: 80 }],
            particles: [{ id: 'minecraft:villager_happy', count: 4, spread: 0.4, at: 'caster' }],
            // A point of health on the hit, on top of the regeneration. Small
            // — one HP against a 7s cooldown — but it is what separates
            // "vitality" from the three other swords that also buff themselves.
            params: { heal: 1, extinguish: false },
        },
    ],
};
