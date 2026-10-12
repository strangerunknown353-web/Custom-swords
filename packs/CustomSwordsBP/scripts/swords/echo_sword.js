/**
 * Echo Sword — the Deep Dark, carried in one hand.
 *
 * Sculk and sound. Its six selectable abilities (Legendary's limit) include the
 * collection's longest-reaching strike — a sonic boom along the wielder's aim
 * that arcs to whatever stands nearby — and the darkness the Warden brings.
 *
 * | Crouch to select | Ability | Job |
 * |---|---|---|
 * | 1 | Sonic Boom | long aimed blast that arcs onward |
 * | 2 | Shriek | darkness and slow around the wielder |
 * | 3 | Resonance | ring that hits harder for every body caught |
 * | 4 | Vibration Rift | detonates where the wielder is looking |
 * | 5 | Echo Step | short blink |
 * | 6 | Sculk Shockwave | throws everything nearby away |
 * | passive | Reverberate | every fourth hit releases a sonic pulse |
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const echoSword = {
    id: 'custom_swords:echo_sword',
    name: 'Echo Sword',
    rarity: 'legendary',
    description: 'Forged where nothing makes a sound. It makes up for it.',

    item: {
        attackDamage: 8,
        durability: 1500,
        swingDuration: 0.34,
        enchantValue: 20,
        repairItems: ['minecraft:echo_shard'],
        glint: true,
    },

    recipe: {
        pattern: [' E ', 'ECE', ' N '],
        key: {
            E: 'minecraft:echo_shard',
            C: 'minecraft:sculk_catalyst',
            N: 'minecraft:netherite_ingot',
        },
        unlockedBy: 'minecraft:sculk_catalyst',
    },

    abilities: [
        {
            activation: 'use',
            visual: 'echo',
            label: 'Sonic Boom',
            abilityId: 'custom_swords:chain',
            cooldownTicks: 200,
            hudCategory: 'custom_swords_echo',
            targeting: { type: 'ray', range: 20, maxTargets: 1 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1.4, vertical: 0.4 },
            params: {
                damage: 12,
                cause: 'sonicBoom',
                maxJumps: 2,
                jumpRange: 4,
                jumpFalloff: 0.5,
                arcPoints: 14,
            },
        },
        {
            activation: 'use',
            visual: 'echo',
            label: 'Shriek',
            abilityId: 'custom_swords:nova',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_echo',
            targeting: { type: 'area', range: 7, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.3, vertical: 0.1, mode: 'away' },
            effects: [
                { effect: 'darkness', durationTicks: 160 },
                { effect: 'slowness', durationTicks: 100, amplifier: 1 },
            ],
            params: {
                damage: 4,
                cause: 'sonicBoom',
                edgeDurationFactor: 0.5,
                shatterEffect: 'darkness',
                shatterBonus: 5,
                ringPoints: 22,
            },
        },
        {
            activation: 'use',
            visual: 'echo',
            label: 'Resonance',
            abilityId: 'custom_swords:resonate',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_echo',
            targeting: { type: 'area', range: 5, maxTargets: 8 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.6, vertical: 0.15, mode: 'away' },
            params: { damage: 5, resonanceBonus: 1.2, maxResonance: 4.8, cause: 'sonicBoom', ringPoints: 20 },
        },
        {
            activation: 'use',
            visual: 'echo',
            label: 'Vibration Rift',
            abilityId: 'custom_swords:rift',
            cooldownTicks: 180,
            hudCategory: 'custom_swords_echo',
            targeting: { type: 'point', range: 12 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 1, vertical: 0.3, mode: 'away' },
            params: {
                nearDamage: 6,
                reachBonus: 4,
                radius: 3.5,
                maxTargets: 6,
                cause: 'sonicBoom',
                ringPoints: 18,
                tetherPoints: 10,
            },
        },
        {
            activation: 'use',
            visual: 'echo',
            label: 'Echo Step',
            abilityId: 'custom_swords:blink',
            cooldownTicks: 140,
            hudCategory: 'custom_swords_echo',
            targeting: { type: 'self' },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 0.4, vertical: 0.2, mode: 'away' },
            params: {
                distance: 7,
                minDistance: 2,
                maxDrop: 4,
                allowLiquid: false,
                arrivalDamage: 4,
                arrivalRadius: 2.5,
                arrivalMaxTargets: 4,
                cause: 'sonicBoom',
                trailPoints: 12,
                markKey: 'echo_step',
            },
        },
        {
            activation: 'use',
            visual: 'echo',
            label: 'Sculk Shockwave',
            abilityId: 'custom_swords:repulse',
            cooldownTicks: 160,
            hudCategory: 'custom_swords_echo',
            targeting: { type: 'area', range: 6, maxTargets: 10 },
            allowedTargets: ['mob', 'player'],
            knockback: { horizontal: 2.4, vertical: 0.5, mode: 'away' },
            params: { damage: 4, trailPoints: 5, trailParticle: 'minecraft:sculk_sensor_redstone_particle' },
        },
        {
            activation: 'attack',
            visual: 'echo',
            label: 'Reverberate',
            abilityId: 'custom_swords:discharge',
            cooldownTicks: 10,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'darkness', durationTicks: 60 }],
            particles: [{ id: 'minecraft:sculk_sensor_redstone_particle', count: 4, spread: 0.3, at: 'target' }],
            params: {
                damage: 1,
                cause: 'sonicBoom',
                interval: 4,
                dischargeDamage: 7,
                chargeKey: 'echo_charge',
                dischargeParticleCount: 14,
            },
        },
    ],
};
