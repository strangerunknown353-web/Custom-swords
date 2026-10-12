/**
 * Blood Sword — every wound it opens pays the wielder back.
 *
 * Built for trading blows. Its five selectable abilities (Epic's limit) open
 * wounds, drag enemies in and feed the wielder's own aggression, and its
 * passive turns every landed hit into a little healing — most when the target
 * is nearly finished.
 *
 * | Crouch to select | Ability | Job |
 * |---|---|---|
 * | 1 | Crimson Cleave | wide frontal sweep that weakens |
 * | 2 | Hemorrhage | one aimed wound that keeps bleeding (wither) |
 * | 3 | Blood Burst | ring of damage around the wielder |
 * | 4 | Blood Pull | drags everything nearby to the blade |
 * | 5 | Bloodlust | strength and speed for the wielder |
 * | passive | Vampiric Edge | heals more the closer the target is to death |
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const bloodSword = {
    id: 'custom_swords:blood_sword',
    name: 'Blood Sword',
    rarity: 'epic',
    description: 'Every wound it opens is a debt, and the blade always collects.',

    item: {
        attackDamage: 7,
        durability: 1100,
        swingDuration: 0.3,
        enchantValue: 18,
        repairItems: ['minecraft:redstone_block'],
    },

    recipe: {
        pattern: [' F ', 'RDR', ' C '],
        key: {
            F: 'minecraft:fermented_spider_eye',
            R: 'minecraft:redstone_block',
            D: 'minecraft:diamond',
            C: 'minecraft:crimson_stem',
        },
        unlockedBy: 'minecraft:fermented_spider_eye',
    },

    abilities: [
        {
            activation: 'use',
            visual: 'blood',
            label: 'Crimson Cleave',
            abilityId: 'custom_swords:cleave',
            cooldownTicks: 120,
            hudCategory: 'custom_swords_blood',
            targeting: { type: 'cone', range: 5, angleDegrees: 110, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.5, vertical: 0.2 },
            effects: [{ effect: 'weakness', durationTicks: 80 }],
            params: {
                damage: 7,
                edgeDamageFactor: 0.6,
                igniteSeconds: 0,
                cause: 'entityAttack',
                arcPoints: 14,
                arcParticle: 'minecraft:redstone_wire_dust_particle',
            },
        },
        {
            activation: 'use',
            visual: 'blood',
            label: 'Hemorrhage',
            abilityId: 'custom_swords:brand',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_blood',
            targeting: { type: 'ray', range: 10, maxTargets: 1 },
            allowedTargets: ['mob', 'player'],
            effects: [
                { effect: 'wither', durationTicks: 100, amplifier: 1 },
                { effect: 'slowness', durationTicks: 60 },
            ],
            params: { damage: 5, cause: 'magic', igniteSeconds: 0, focusedDurationBonus: 1.5 },
        },
        {
            activation: 'use',
            visual: 'blood',
            label: 'Blood Burst',
            abilityId: 'custom_swords:burst',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_blood',
            targeting: { type: 'area', range: 5, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.7, vertical: 0.3, mode: 'away' },
            params: {
                damage: 8,
                edgeDamageFactor: 0.45,
                igniteSeconds: 0,
                cause: 'entityAttack',
                ringPoints: 20,
                ringParticle: 'minecraft:redstone_wire_dust_particle',
            },
        },
        {
            activation: 'use',
            visual: 'blood',
            label: 'Blood Pull',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_blood',
            targeting: { type: 'area', range: 8, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.6, vertical: 0.2, pull: true },
            effects: [{ effect: 'slowness', durationTicks: 40 }],
            params: { damage: 2, trailPoints: 5, trailParticle: 'minecraft:redstone_wire_dust_particle' },
        },
        {
            activation: 'use',
            visual: 'blood',
            label: 'Bloodlust',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 500,
            hudCategory: 'custom_swords_blood',
            targeting: { type: 'self' },
            effects: [
                { effect: 'strength', durationTicks: 160, amplifier: 0 },
                { effect: 'speed', durationTicks: 160, amplifier: 0 },
            ],
            params: { heal: 0, extinguish: false },
        },
        {
            activation: 'attack',
            visual: 'blood',
            label: 'Vampiric Edge',
            abilityId: 'custom_swords:drain',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            particles: [{ id: 'minecraft:redstone_wire_dust_particle', count: 6, spread: 0.3, at: 'target' }],
            sounds: { impact: 'blood_drain' },
            params: { damage: 2, cause: 'magic', maxHeal: 3, emptyThreshold: 0.85 },
        },
    ],
};
