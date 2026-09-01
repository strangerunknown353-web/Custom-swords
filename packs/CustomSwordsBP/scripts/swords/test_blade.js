/**
 * Test Blade — a DIAGNOSTIC item, not part of the final 20-25 sword collection.
 *
 * It exists so the framework can be verified end to end in a real world:
 * behaviour pack loads, resource pack loads, script loads, the custom component
 * attaches, the registry recognises the item, the identification system tells it
 * apart from vanilla swords, the ability pipeline runs, and the cooldown is
 * player-scoped.
 *
 * It is also the worked example of the data model. Note what is NOT here: no
 * code, no conditionals, no engine calls. Targeting, effects, particles and
 * sounds are declared as data and interpreted by the framework, which is why a
 * second sword binding the same ability with a different envelope needs no new
 * code at all.
 *
 * `isTestItem: true` keeps it out of the shipped collection counts;
 * `tools/validate.mjs` reports diagnostic items separately so it can never be
 * miscounted as one of the 20-25.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const testBlade = {
    // --- Identity -----------------------------------------------------------
    id: 'custom_swords:test_blade',
    name: 'Test Blade',
    rarity: 'uncommon',
    description: 'Framework diagnostic sword. Use it to confirm every subsystem is wired up.',
    texture: 'test_blade',
    isTestItem: true,

    // --- Vanilla item statistics -------------------------------------------
    // These are the single source of truth; the item JSON is generated from them.
    item: {
        attackDamage: 6, // 7 effective melee damage, comparable to a diamond sword
        durability: 250,
        enchantValue: 10,
        repairItems: ['minecraft:iron_ingot'],
    },

    // --- Active ability: right-click / long-press ---------------------------
    active: {
        abilityId: 'custom_swords:diagnostic_pulse',
        cooldownTicks: 60,
        hudCategory: 'custom_swords_test_blade',

        targeting: {
            type: 'area',
            range: 4,
            maxTargets: 8,
        },

        effects: [{ effect: 'slowness', durationTicks: 40, amplifier: 0 }],

        particles: [
            { id: 'minecraft:critical_hit_emitter', count: 12, spread: 1.2, at: 'caster' },
            { id: 'minecraft:basic_crit_particle', count: 4, spread: 0.4, at: 'target' },
        ],

        sounds: { cast: 'ability_cast', impact: 'impact_light' },

        params: { damage: 3 },
    },
};
