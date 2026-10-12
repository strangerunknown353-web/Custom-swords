/**
 * Dragon Sword — the End's apex, as a blade.
 *
 * The second Mythic, and the collection's widest kit: seven selectable
 * abilities, every one of them big. Breath, wings, a crushing descent and a
 * roar, with a guard passive that hardens the wielder the lower they get.
 *
 * | Crouch to select | Ability | Job |
 * |---|---|---|
 * | 1 | Dragon Breath | burning cone in front |
 * | 2 | Wing Gust | hurls everything nearby away |
 * | 3 | Ender Flame | detonates where the wielder is looking |
 * | 4 | Dragon Dash | the longest blink in the collection |
 * | 5 | Dragon Roar | weakens and slows the whole area |
 * | 6 | Sky Crush | drags flyers down, hits harder the higher they were |
 * | 7 | Draconic Fury | strength, resistance and fire resistance |
 * | passive | Dragon Scale | resistance when the wielder is hurt |
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const dragonSword = {
    id: 'custom_swords:dragon_sword',
    name: 'Dragon Sword',
    rarity: 'mythic',
    description: 'Cut from the last scale of the last dragon. It still breathes.',

    item: {
        attackDamage: 9,
        durability: 2000,
        swingDuration: 0.36,
        enchantValue: 22,
        repairItems: ['minecraft:dragon_breath'],
        glint: true,
    },

    recipe: {
        pattern: [' B ', 'BHB', ' N '],
        key: {
            B: 'minecraft:dragon_breath',
            H: 'minecraft:dragon_head',
            N: 'minecraft:netherite_ingot',
        },
        unlockedBy: 'minecraft:dragon_head',
    },

    abilities: [
        {
            activation: 'use',
            visual: 'dragon',
            label: 'Dragon Breath',
            abilityId: 'custom_swords:cleave',
            cooldownTicks: 140,
            targeting: { type: 'cone', range: 7, angleDegrees: 90, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.6, vertical: 0.2 },
            params: {
                damage: 9,
                edgeDamageFactor: 0.6,
                igniteSeconds: 6,
                cause: 'fire',
                arcPoints: 18,
                arcParticle: 'minecraft:dragon_breath_trail',
            },
        },
        {
            activation: 'use',
            visual: 'dragon',
            label: 'Wing Gust',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 140,
            targeting: { type: 'area', range: 6, maxTargets: 12 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 3, vertical: 0.6, mode: 'away' },
            params: { damage: 4, trailPoints: 6, trailParticle: 'minecraft:campfire_smoke_particle' },
        },
        {
            activation: 'use',
            visual: 'dragon',
            label: 'Ender Flame',
            abilityId: 'custom_swords:rift',
            cooldownTicks: 180,
            targeting: { type: 'point', range: 14 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.8, vertical: 0.4, mode: 'away' },
            effects: [{ effect: 'weakness', durationTicks: 80 }],
            params: {
                nearDamage: 7,
                reachBonus: 5,
                radius: 4,
                maxTargets: 8,
                cause: 'magic',
                ringPoints: 20,
                tetherPoints: 10,
            },
        },
        {
            activation: 'use',
            visual: 'dragon',
            label: 'Dragon Dash',
            abilityId: 'custom_swords:blink',
            cooldownTicks: 140,
            targeting: { type: 'self' },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.8, vertical: 0.3, mode: 'away' },
            params: {
                distance: 9,
                minDistance: 2,
                maxDrop: 5,
                allowLiquid: false,
                arrivalDamage: 6,
                arrivalRadius: 3,
                arrivalMaxTargets: 5,
                cause: 'magic',
                trailPoints: 14,
                markKey: 'dragon_dash',
            },
        },
        {
            activation: 'use',
            visual: 'dragon',
            label: 'Dragon Roar',
            abilityId: 'custom_swords:nova',
            cooldownTicks: 200,
            targeting: { type: 'area', range: 8, maxTargets: 12 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.5, vertical: 0.2, mode: 'away' },
            effects: [
                { effect: 'weakness', durationTicks: 140, amplifier: 1 },
                { effect: 'slowness', durationTicks: 100, amplifier: 1 },
            ],
            params: {
                damage: 5,
                cause: 'magic',
                edgeDurationFactor: 0.5,
                shatterEffect: 'weakness',
                shatterBonus: 6,
                ringPoints: 24,
            },
        },
        {
            activation: 'use',
            visual: 'dragon',
            label: 'Sky Crush',
            abilityId: 'custom_swords:crush',
            cooldownTicks: 220,
            targeting: { type: 'area', range: 7, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.4, vertical: -0.6, pull: true },
            params: { groundDamage: 6, heightBonus: 8, fullHeight: 6, cause: 'entityAttack', ringPoints: 22 },
        },
        {
            activation: 'use',
            visual: 'dragon',
            label: 'Draconic Fury',
            abilityId: 'custom_swords:bolster',
            cooldownTicks: 600,
            targeting: { type: 'self' },
            effects: [
                { effect: 'strength', durationTicks: 200, amplifier: 1 },
                { effect: 'resistance', durationTicks: 200, amplifier: 0 },
                { effect: 'fire_resistance', durationTicks: 400, amplifier: 0 },
            ],
            params: { heal: 4, extinguish: true },
        },
        {
            activation: 'attack',
            visual: 'dragon',
            label: 'Dragon Scale',
            abilityId: 'custom_swords:ward',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'resistance', durationTicks: 100 }],
            particles: [{ id: 'minecraft:lava_particle', count: 6, spread: 0.6, at: 'caster' }],
            params: {
                damage: 2,
                cause: 'entityAttack',
                guardThreshold: 0.6,
                deepThreshold: 0.3,
                maxAmplifier: 1,
                guardIntervalTicks: 120,
                markKey: 'dragon_scale',
            },
        },
    ],
};
