/**
 * Soul Sword — a blade that burns blue and takes a little of everything it cuts.
 *
 * The collection's soul-fire sword. Four selectable abilities (Rare's limit)
 * cover the four jobs a duelling blade needs — damage, control, movement and
 * survival — and its passive quietly feeds the wielder on every hit.
 *
 * | Crouch to select | Ability | Job |
 * |---|---|---|
 * | 1 | Soul Flame | blue-fire ring around the wielder |
 * | 2 | Soul Snare | roots a group, heals per soul caught |
 * | 3 | Soul Dash | short blink, a small strike on arrival |
 * | 4 | Soul Ward | absorption and speed for the wielder |
 * | passive | Soul Siphon | heals more the closer the target is to death |
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const soulSword = {
    id: 'custom_swords:soul_sword',
    name: 'Soul Sword',
    rarity: 'rare',
    description: 'It burns cold and blue, and keeps a little of everything it cuts.',

    item: {
        attackDamage: 6,
        durability: 950,
        swingDuration: 0.3,
        enchantValue: 17,
        repairItems: ['minecraft:soul_sand'],
    },

    recipe: {
        pattern: [' L ', 'SDS', ' B '],
        key: {
            L: 'minecraft:soul_lantern',
            S: 'minecraft:soul_sand',
            D: 'minecraft:diamond',
            B: 'minecraft:bone',
        },
        unlockedBy: 'minecraft:soul_lantern',
    },

    abilities: [
        {
            activation: 'use',
            visual: 'soul',
            label: 'Soul Flame',
            abilityId: 'custom_swords:burst',
            cooldownTicks: 120,
            hudCategory: 'custom_swords_soul',
            targeting: { type: 'area', range: 4.5, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.5, vertical: 0.2, mode: 'away' },
            params: {
                damage: 5,
                edgeDamageFactor: 0.5,
                igniteSeconds: 4,
                cause: 'fire',
                ringPoints: 18,
                ringParticle: 'minecraft:blue_flame_particle',
            },
        },
        {
            activation: 'use',
            visual: 'soul',
            label: 'Soul Snare',
            abilityId: 'custom_swords:entangle',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_soul',
            targeting: { type: 'area', range: 5, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'slowness', durationTicks: 80, amplifier: 2 }],
            params: { damage: 2, cause: 'magic', healPerTarget: 1, maxHeal: 5, ringPoints: 18 },
        },
        {
            activation: 'use',
            visual: 'soul',
            label: 'Soul Dash',
            abilityId: 'custom_swords:blink',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_soul',
            targeting: { type: 'self' },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.4, vertical: 0.2, mode: 'away' },
            params: {
                distance: 6,
                minDistance: 2,
                maxDrop: 4,
                allowLiquid: false,
                arrivalDamage: 3,
                arrivalRadius: 2.5,
                arrivalMaxTargets: 3,
                cause: 'magic',
                trailPoints: 10,
                markKey: 'soul_dash',
            },
        },
        {
            activation: 'use',
            visual: 'soul',
            label: 'Soul Ward',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 400,
            hudCategory: 'custom_swords_soul',
            targeting: { type: 'self' },
            effects: [
                { effect: 'absorption', durationTicks: 200, amplifier: 0 },
                { effect: 'speed', durationTicks: 120, amplifier: 0 },
            ],
            params: { heal: 2, extinguish: false },
        },
        {
            activation: 'attack',
            visual: 'soul',
            label: 'Soul Siphon',
            abilityId: 'custom_swords:drain',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            particles: [{ id: 'minecraft:blue_flame_particle', count: 5, spread: 0.3, at: 'target' }],
            sounds: { impact: 'soul_siphon' },
            params: { damage: 1, cause: 'magic', maxHeal: 2, emptyThreshold: 0.85 },
        },
    ],
};
