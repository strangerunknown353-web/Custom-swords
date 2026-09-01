/**
 * Test Blade — a DIAGNOSTIC item, not part of the final 20-25 sword collection.
 *
 * It exists so the foundation can be verified end to end in a real world:
 * behaviour pack loads, resource pack loads, script loads, the custom component
 * is attached, the ability pipeline runs, the cooldown is player-scoped.
 *
 * `isTestItem: true` marks it for removal (or gating behind a debug flag) once
 * the real collection lands. `tools/validate.mjs` reports it separately so it
 * can never be miscounted as one of the shipped swords.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const testBlade = {
    id: 'custom_swords:test_blade',
    name: 'Test Blade',
    rarity: 'common',
    description: 'Foundation diagnostic sword. Use it to confirm the framework is wired up.',
    texture: 'test_blade',
    isTestItem: true,

    item: {
        attackDamage: 6,
        durability: 250,
        enchantValue: 10,
        repairItems: ['minecraft:iron_ingot'],
    },

    active: {
        abilityId: 'custom_swords:diagnostic_pulse',
        cooldownTicks: 60,
        hudCategory: 'custom_swords_test_blade',
        params: {
            radius: 4,
            damage: 3,
        },
    },
};
