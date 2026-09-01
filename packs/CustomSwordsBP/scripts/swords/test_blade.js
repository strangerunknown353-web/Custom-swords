/**
 * Test Blade — a DIAGNOSTIC item, not part of the final sword collection.
 *
 * It exists so the framework can be verified end to end in a real world, and it
 * is the worked example of the data model: no code, no conditionals, no engine
 * calls. Its four bindings run four different abilities on four different
 * inputs, which is the fastest way to confirm the whole engine is wired up.
 *
 * `isTestItem: true` keeps it out of the shipped collection counts.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const testBlade = {
    id: 'custom_swords:test_blade',
    name: 'Test Blade',
    rarity: 'uncommon',
    description: 'Framework diagnostic sword. Every activation exercises a different subsystem.',
    texture: 'test_blade',
    isTestItem: true,

    item: {
        attackDamage: 6, // 7 effective melee damage; abilities are configured separately
        durability: 250,
        enchantValue: 10,
        repairItems: ['minecraft:iron_ingot'],
    },

    abilities: [
        {
            // Test B — area damage with falloff.
            activation: 'use',
            abilityId: 'custom_swords:burst',
            cooldownTicks: 60,
            hudCategory: 'custom_swords_test_blade',
            targeting: { type: 'area', range: 4, maxTargets: 8 },
            allowedTargets: ['hostile'],
            knockback: { horizontal: 0.8, vertical: 0.35 },
            effects: [{ effect: 'slowness', durationTicks: 40 }],
            particles: [{ id: 'minecraft:critical_hit_emitter', count: 12, spread: 1.2, at: 'caster' }],
            sounds: { cast: 'ability_cast', impact: 'impact_light' },
            params: { damage: 4, edgeDamageFactor: 0.5 },
        },
        {
            // Test A — single-target damage with an execute bonus.
            activation: 'sneak_use',
            abilityId: 'custom_swords:strike',
            cooldownTicks: 100,
            hudCategory: 'custom_swords_test_blade',
            targeting: { type: 'single', range: 7 },
            knockback: { horizontal: 1.2, vertical: 0.15 },
            effects: [{ effect: 'weakness', durationTicks: 60 }],
            particles: [{ id: 'minecraft:basic_crit_particle', count: 8, spread: 0.3, at: 'target' }],
            sounds: { cast: 'ability_ready', impact: 'impact_heavy' },
            restrictions: { requireGrounded: true },
            params: { damage: 9, executeMultiplier: 1.5 },
        },
        {
            // Test D — status effects applied on a melee hit.
            activation: 'attack',
            abilityId: 'custom_swords:brand',
            cooldownTicks: 40,
            targeting: { type: 'single', range: 4 },
            allowedTargets: ['mob', 'player'],
            effects: [{ effect: 'poison', durationTicks: 60 }],
            particles: [{ id: 'minecraft:villager_happy', count: 4, spread: 0.4, at: 'target' }],
            params: { damage: 1 },
        },
        {
            // Test C + E — a directional sweep that throws targets back.
            activation: 'sneak_attack',
            abilityId: 'custom_swords:cleave',
            cooldownTicks: 80,
            targeting: { type: 'cone', range: 5, angleDegrees: 100, maxTargets: 6 },
            knockback: { horizontal: 1.6, vertical: 0.3 },
            sounds: { cast: 'impact_heavy' },
            params: { damage: 5, edgeDamageFactor: 0.6 },
        },
    ],
};
