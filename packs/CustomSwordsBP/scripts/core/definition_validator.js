/**
 * Validation for ability and sword definitions.
 *
 * Runs in three places, which is the point:
 *   1. At world load, so a broken definition is reported in the content log and
 *      that definition is refused registration instead of half-working.
 *   2. In `tools/validate.mjs`, so it fails the build before packaging.
 *   3. In the unit tests.
 *
 * Identifier rules come from `identifiers.js` and rarity tiers from
 * `rarity.js`, so this module never restates either.
 *
 * Engine-free on purpose.
 */

import { IDENTIFIER_PATTERN, isValidIdentifier, isValidLocalName } from './identifiers.js';
import { RARITIES, isRarity } from './rarity.js';

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */
/** @typedef {import('./types.js').AbilityDefinition} AbilityDefinition */
/** @typedef {import('./types.js').AbilityBinding} AbilityBinding */

/** Re-exported so callers that only need the tier list have one import. */
export { RARITIES };

/** Targeting shapes the framework knows how to resolve. */
export const TARGETING_TYPES = Object.freeze(['self', 'single', 'area', 'cone', 'ray']);

/** Targeting types that act on entities and therefore need a range. */
const RANGED_TARGETING_TYPES = Object.freeze(['single', 'area', 'cone', 'ray']);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPositiveNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * @param {AbilityDefinition} ability
 * @returns {string[]} Problems found; empty means valid.
 */
export function validateAbilityDefinition(ability) {
    if (!isPlainObject(ability)) return ['Ability definition must be an object.'];

    /** @type {string[]} */
    const problems = [];
    const label = typeof ability.id === 'string' ? ability.id : '(unnamed ability)';

    if (!isValidIdentifier(ability.id)) {
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
 * @param {unknown} targeting
 * @param {string} label
 * @returns {string[]}
 */
export function validateTargeting(targeting, label) {
    if (targeting === undefined) return [];
    if (!isPlainObject(targeting)) return [`${label}.targeting: must be an object.`];

    /** @type {string[]} */
    const problems = [];
    const type = targeting.type;

    if (typeof type !== 'string' || !TARGETING_TYPES.includes(type)) {
        problems.push(`${label}.targeting: 'type' must be one of ${TARGETING_TYPES.join(', ')}.`);
    } else if (RANGED_TARGETING_TYPES.includes(type) && !isPositiveNumber(targeting.range)) {
        // A ranged shape with no range silently finds nothing, which is the
        // most confusing possible failure: the ability appears to do nothing.
        problems.push(`${label}.targeting: type '${type}' requires a positive 'range'.`);
    }

    if (targeting.maxTargets !== undefined) {
        if (!Number.isInteger(targeting.maxTargets) || Number(targeting.maxTargets) < 1) {
            problems.push(`${label}.targeting: 'maxTargets' must be an integer of at least 1.`);
        }
    }
    if (targeting.angleDegrees !== undefined) {
        const angle = targeting.angleDegrees;
        if (typeof angle !== 'number' || angle <= 0 || angle > 360) {
            problems.push(`${label}.targeting: 'angleDegrees' must be greater than 0 and at most 360.`);
        }
    }
    if (type === 'cone' && targeting.angleDegrees === undefined) {
        problems.push(`${label}.targeting: type 'cone' requires 'angleDegrees'.`);
    }
    for (const flag of ['includeCaster', 'includePlayers']) {
        if (targeting[flag] !== undefined && typeof targeting[flag] !== 'boolean') {
            problems.push(`${label}.targeting: '${flag}' must be a boolean when present.`);
        }
    }
    return problems;
}

/**
 * @param {unknown} effects
 * @param {string} label
 * @returns {string[]}
 */
export function validateEffects(effects, label) {
    if (effects === undefined) return [];
    if (!Array.isArray(effects)) return [`${label}.effects: must be an array.`];

    /** @type {string[]} */
    const problems = [];
    effects.forEach((effect, index) => {
        const where = `${label}.effects[${index}]`;
        if (!isPlainObject(effect)) {
            problems.push(`${where}: must be an object.`);
            return;
        }
        if (typeof effect.effect !== 'string' || effect.effect.length === 0) {
            problems.push(`${where}: 'effect' must be a non-empty effect id.`);
        }
        if (!isPositiveNumber(effect.durationTicks)) {
            problems.push(`${where}: 'durationTicks' must be a positive number.`);
        }
        if (effect.amplifier !== undefined && (!Number.isInteger(effect.amplifier) || Number(effect.amplifier) < 0)) {
            problems.push(`${where}: 'amplifier' must be a non-negative integer when present.`);
        }
        if (effect.showParticles !== undefined && typeof effect.showParticles !== 'boolean') {
            problems.push(`${where}: 'showParticles' must be a boolean when present.`);
        }
    });
    return problems;
}

/**
 * @param {unknown} particles
 * @param {string} label
 * @returns {string[]}
 */
export function validateParticles(particles, label) {
    if (particles === undefined) return [];
    if (!Array.isArray(particles)) return [`${label}.particles: must be an array.`];

    /** @type {string[]} */
    const problems = [];
    particles.forEach((particle, index) => {
        const where = `${label}.particles[${index}]`;
        if (!isPlainObject(particle)) {
            problems.push(`${where}: must be an object.`);
            return;
        }
        if (typeof particle.id !== 'string' || particle.id.length === 0) {
            problems.push(`${where}: 'id' must be a non-empty particle identifier.`);
        }
        if (particle.count !== undefined && (!Number.isInteger(particle.count) || Number(particle.count) < 1)) {
            problems.push(`${where}: 'count' must be an integer of at least 1 when present.`);
        }
        if (particle.spread !== undefined && (typeof particle.spread !== 'number' || Number(particle.spread) < 0)) {
            problems.push(`${where}: 'spread' must be a non-negative number when present.`);
        }
        if (particle.at !== undefined && particle.at !== 'caster' && particle.at !== 'target') {
            problems.push(`${where}: 'at' must be 'caster' or 'target' when present.`);
        }
    });
    return problems;
}

/**
 * @param {unknown} sounds
 * @param {string} label
 * @returns {string[]}
 */
export function validateSounds(sounds, label) {
    if (sounds === undefined) return [];
    if (!isPlainObject(sounds)) return [`${label}.sounds: must be an object.`];

    /** @type {string[]} */
    const problems = [];
    for (const slot of ['cast', 'impact']) {
        const value = sounds[slot];
        if (value !== undefined && (typeof value !== 'string' || value.length === 0)) {
            problems.push(`${label}.sounds.${slot}: must be a non-empty string when present.`);
        }
    }
    for (const key of Object.keys(sounds)) {
        if (key !== 'cast' && key !== 'impact') {
            problems.push(`${label}.sounds: unknown slot '${key}'. Valid slots: cast, impact.`);
        }
    }
    return problems;
}

/**
 * @param {AbilityBinding | undefined} binding
 * @param {string} label Where the binding lives, e.g. `custom_swords:x.active`.
 * @param {(id: string) => boolean} abilityExists
 * @returns {string[]}
 */
export function validateBinding(binding, label, abilityExists) {
    if (binding === undefined) return [];
    if (!isPlainObject(binding)) return [`${label}: binding must be an object.`];

    /** @type {string[]} */
    const problems = [];

    if (!isValidIdentifier(binding.abilityId)) {
        problems.push(`${label}: 'abilityId' must match namespace:local_name.`);
    } else if (!abilityExists(/** @type {string} */ (binding.abilityId))) {
        problems.push(`${label}: references unregistered ability '${binding.abilityId}'.`);
    }
    if (binding.cooldownTicks !== undefined) {
        if (!Number.isInteger(binding.cooldownTicks) || Number(binding.cooldownTicks) < 0) {
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

    problems.push(...validateTargeting(binding.targeting, label));
    problems.push(...validateEffects(binding.effects, label));
    problems.push(...validateParticles(binding.particles, label));
    problems.push(...validateSounds(binding.sounds, label));

    return problems;
}

/**
 * @param {unknown} stats
 * @param {string} label
 * @returns {string[]}
 */
function validateItemStats(stats, label) {
    if (!isPlainObject(stats)) return [`${label}: 'item' stats block is required.`];

    /** @type {string[]} */
    const problems = [];
    // 0..32767 is the range `minecraft:damage` accepts from format_version 1.26.0.
    if (!Number.isInteger(stats.attackDamage) || Number(stats.attackDamage) < 0 || Number(stats.attackDamage) > 32767) {
        problems.push(`${label}: 'item.attackDamage' must be an integer in 0..32767.`);
    }
    if (!Number.isInteger(stats.durability) || Number(stats.durability) < 1) {
        problems.push(`${label}: 'item.durability' must be a positive integer.`);
    }
    if (stats.enchantValue !== undefined && (!Number.isInteger(stats.enchantValue) || Number(stats.enchantValue) < 0)) {
        problems.push(`${label}: 'item.enchantValue' must be a non-negative integer when present.`);
    }
    if (stats.repairItems !== undefined) {
        if (!Array.isArray(stats.repairItems)) {
            problems.push(`${label}: 'item.repairItems' must be an array when present.`);
        } else if (!stats.repairItems.every((item) => typeof item === 'string' && IDENTIFIER_PATTERN.test(item))) {
            problems.push(`${label}: every 'item.repairItems' entry must be a namespaced item identifier.`);
        }
    }
    if (stats.glint !== undefined && typeof stats.glint !== 'boolean') {
        problems.push(`${label}: 'item.glint' must be a boolean when present.`);
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

    if (!isValidIdentifier(sword.id)) {
        problems.push(`${label}: 'id' must match namespace:local_name.`);
    }
    if (typeof sword.name !== 'string' || sword.name.length === 0) {
        problems.push(`${label}: 'name' is required.`);
    }
    if (typeof sword.description !== 'string' || sword.description.length === 0) {
        problems.push(`${label}: 'description' is required.`);
    }
    if (!isRarity(sword.rarity)) {
        problems.push(`${label}: 'rarity' must be one of ${RARITIES.join(', ')}.`);
    }
    if (sword.texture !== undefined && !isValidLocalName(sword.texture)) {
        problems.push(`${label}: 'texture' must be a lower-case shortname.`);
    }

    problems.push(...validateItemStats(sword.item, label));

    if (sword.active === undefined && sword.passive === undefined) {
        problems.push(`${label}: needs at least one of 'active' or 'passive'.`);
    }
    problems.push(...validateBinding(sword.active, `${label}.active`, abilityExists));
    problems.push(...validateBinding(sword.passive, `${label}.passive`, abilityExists));

    if (sword.tags !== undefined && !Array.isArray(sword.tags)) {
        problems.push(`${label}: 'tags' must be an array when present.`);
    }
    if (sword.isTestItem !== undefined && typeof sword.isTestItem !== 'boolean') {
        problems.push(`${label}: 'isTestItem' must be a boolean when present.`);
    }
    return problems;
}
