/**
 * Validation for ability and sword definitions.
 *
 * Runs in two places, which is the point:
 *   1. At world load, so a broken definition is reported in the content log
 *      instead of failing silently mid-combat.
 *   2. In `tools/validate.mjs` and the unit tests, so it is caught before the
 *      .mcaddon is ever built.
 *
 * Engine-free on purpose.
 */

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */
/** @typedef {import('./types.js').AbilityDefinition} AbilityDefinition */
/** @typedef {import('./types.js').AbilityBinding} AbilityBinding */

export const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']);

/** Matches `namespace:local_name` with lower-case ASCII, digits and underscores. */
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {AbilityDefinition} ability
 * @returns {string[]} Problems found; empty means valid.
 */
export function validateAbilityDefinition(ability) {
    /** @type {string[]} */
    const problems = [];
    const label = isPlainObject(ability) && typeof ability.id === 'string' ? ability.id : '(unnamed ability)';

    if (!isPlainObject(ability)) return [`Ability definition must be an object.`];
    if (typeof ability.id !== 'string' || !IDENTIFIER_PATTERN.test(ability.id)) {
        problems.push(`${label}: 'id' must match namespace:local_name.`);
    }
    if (typeof ability.name !== 'string' || ability.name.length === 0) {
        problems.push(`${label}: 'name' is required.`);
    }
    if (typeof ability.execute !== 'function') {
        problems.push(`${label}: 'execute' must be a function.`);
    }
    if (ability.defaults !== undefined && !isPlainObject(ability.defaults)) {
        problems.push(`${label}: 'defaults' must be an object when present.`);
    }
    if (ability.validateParams !== undefined && typeof ability.validateParams !== 'function') {
        problems.push(`${label}: 'validateParams' must be a function when present.`);
    }
    return problems;
}

/**
 * @param {AbilityBinding | undefined} binding
 * @param {string} label Where the binding lives, e.g. `custom_swords:x .active`.
 * @param {(id: string) => boolean} abilityExists
 * @returns {string[]}
 */
export function validateBinding(binding, label, abilityExists) {
    if (binding === undefined) return [];
    /** @type {string[]} */
    const problems = [];
    if (!isPlainObject(binding)) return [`${label}: binding must be an object.`];

    if (typeof binding.abilityId !== 'string' || !IDENTIFIER_PATTERN.test(binding.abilityId)) {
        problems.push(`${label}: 'abilityId' must match namespace:local_name.`);
    } else if (!abilityExists(binding.abilityId)) {
        problems.push(`${label}: references unregistered ability '${binding.abilityId}'.`);
    }
    if (binding.cooldownTicks !== undefined) {
        if (!Number.isInteger(binding.cooldownTicks) || binding.cooldownTicks < 0) {
            problems.push(`${label}: 'cooldownTicks' must be a non-negative integer.`);
        }
    }
    if (binding.cooldownKey !== undefined && typeof binding.cooldownKey !== 'string') {
        problems.push(`${label}: 'cooldownKey' must be a string when present.`);
    }
    if (binding.hudCategory !== undefined && typeof binding.hudCategory !== 'string') {
        problems.push(`${label}: 'hudCategory' must be a string when present.`);
    }
    if (binding.params !== undefined && !isPlainObject(binding.params)) {
        problems.push(`${label}: 'params' must be an object when present.`);
    }
    return problems;
}

/**
 * @param {SwordDefinition} sword
 * @param {(id: string) => boolean} abilityExists
 * @returns {string[]}
 */
export function validateSwordDefinition(sword, abilityExists) {
    if (!isPlainObject(sword)) return ['Sword definition must be an object.'];

    /** @type {string[]} */
    const problems = [];
    const label = typeof sword.id === 'string' ? sword.id : '(unnamed sword)';

    if (typeof sword.id !== 'string' || !IDENTIFIER_PATTERN.test(sword.id)) {
        problems.push(`${label}: 'id' must match namespace:local_name.`);
    }
    if (typeof sword.name !== 'string' || sword.name.length === 0) {
        problems.push(`${label}: 'name' is required.`);
    }
    if (typeof sword.description !== 'string' || sword.description.length === 0) {
        problems.push(`${label}: 'description' is required.`);
    }
    if (!RARITIES.includes(/** @type {any} */ (sword.rarity))) {
        problems.push(`${label}: 'rarity' must be one of ${RARITIES.join(', ')}.`);
    }
    if (sword.texture !== undefined && !/^[a-z][a-z0-9_]*$/.test(sword.texture)) {
        problems.push(`${label}: 'texture' must be a lower-case shortname.`);
    }

    const stats = sword.item;
    if (!isPlainObject(stats)) {
        problems.push(`${label}: 'item' stats block is required.`);
    } else {
        if (!Number.isInteger(stats.attackDamage) || stats.attackDamage < 0 || stats.attackDamage > 32767) {
            problems.push(`${label}: 'item.attackDamage' must be an integer in 0..32767.`);
        }
        if (!Number.isInteger(stats.durability) || stats.durability < 1) {
            problems.push(`${label}: 'item.durability' must be a positive integer.`);
        }
        if (stats.enchantValue !== undefined && (!Number.isInteger(stats.enchantValue) || stats.enchantValue < 0)) {
            problems.push(`${label}: 'item.enchantValue' must be a non-negative integer when present.`);
        }
        if (stats.repairItems !== undefined && !Array.isArray(stats.repairItems)) {
            problems.push(`${label}: 'item.repairItems' must be an array when present.`);
        }
    }

    if (sword.active === undefined && sword.passive === undefined) {
        problems.push(`${label}: needs at least one of 'active' or 'passive'.`);
    }
    problems.push(...validateBinding(sword.active, `${label}.active`, abilityExists));
    problems.push(...validateBinding(sword.passive, `${label}.passive`, abilityExists));

    if (sword.tags !== undefined && !Array.isArray(sword.tags)) {
        problems.push(`${label}: 'tags' must be an array when present.`);
    }
    return problems;
}
