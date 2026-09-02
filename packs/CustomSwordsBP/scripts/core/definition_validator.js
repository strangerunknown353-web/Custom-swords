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
import { ACTIVATION_METHODS, isActivationMethod } from './activation.js';
import { TARGET_CATEGORY_IDS, isTargetCategory } from './target_categories.js';
import { isVanillaEffect, suggestEffect } from './effect_catalogue.js';
import { explainParticle } from './particle_catalogue.js';
import { isVanillaDamageCause, suggestDamageCause } from './damage_cause_catalogue.js';
import { isVisualProfile, PROFILE_NAMES } from './visual_profiles.js';
import { SOUND_PRESETS } from '../systems/sounds.js';

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */
/** @typedef {import('./types.js').AbilityDefinition} AbilityDefinition */
/** @typedef {import('./types.js').AbilityBinding} AbilityBinding */

/** Re-exported so callers that only need these lists have one import. */
export { RARITIES, ACTIVATION_METHODS, TARGET_CATEGORY_IDS };

/** Targeting shapes the framework knows how to resolve. */
export const TARGETING_TYPES = Object.freeze(['self', 'single', 'area', 'cone', 'ray', 'point']);

/** Targeting types that act on entities or a location and therefore need a range. */
const RANGED_TARGETING_TYPES = Object.freeze(['single', 'area', 'cone', 'ray', 'point']);

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
    } else if (ability.defaults !== undefined) {
        // Both halves of the merge are checked: a binding that overrides
        // `cause` above, and the default it would otherwise inherit here.
        // Checking only one leaves the other free to be wrong.
        problems.push(...validateDamageCause(ability.defaults.cause, `${label}.defaults`));
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
/**
 * The longest a sword may leave anything on an entity, in ticks (30 seconds).
 *
 * The collection's real maximum is 300 — Ocean Sword's water breathing, on its
 * own wielder — so this is a guard rail rather than a constraint anyone is
 * working against.
 */
const MAX_EFFECT_TICKS = 600;

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
        } else if (!isVanillaEffect(effect.effect)) {
            // A typo here would load fine and then silently do nothing, which
            // reads as "this sword is weak" rather than "this sword is broken".
            const suggestion = suggestEffect(effect.effect);
            problems.push(
                `${where}: '${effect.effect}' is not a vanilla effect` +
                    `${suggestion === undefined ? '' : ` (did you mean '${suggestion}'?)`}.`,
            );
        }
        if (!isPositiveNumber(effect.durationTicks)) {
            problems.push(`${where}: 'durationTicks' must be a positive number.`);
        } else if (Number(effect.durationTicks) > MAX_EFFECT_TICKS) {
            // Nothing a sword does should outlive the fight it was used in.
            // There is no API to hand a player a permanent effect by accident,
            // but a definition asking for twenty minutes of Slowness IV is the
            // same thing from the receiving end.
            problems.push(
                `${where}: 'durationTicks' is ${effect.durationTicks} ` +
                    `(${Number(effect.durationTicks) / 20}s). The ceiling is ${MAX_EFFECT_TICKS / 20}s — ` +
                    'an effect that outlasts the fight is a curse, not an ability.',
            );
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
        } else {
            // Shape was never the problem. v0.5.1 shipped five well-formed
            // identifiers that render nothing — two nonexistent, three needing
            // Molang context from a host entity. Existence is checked here.
            const complaint = explainParticle(particle.id);
            if (complaint !== undefined) problems.push(`${where}: ${complaint}`);
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
 * A damage cause the engine will actually recognise.
 *
 * Bedrock accepts an unknown cause without complaint and applies the damage
 * anyway, so a typo here is invisible in play: the hit lands, but every
 * cause-specific mitigation and message stops matching it. See
 * `core/damage_cause_catalogue.js` for why this is the fourth gate of its kind.
 *
 * @param {unknown} cause
 * @param {string} label
 * @returns {string[]}
 */
export function validateDamageCause(cause, label) {
    if (cause === undefined) return [];
    if (typeof cause !== 'string') {
        return [`${label}: 'params.cause' must be a string when present.`];
    }
    if (isVanillaDamageCause(cause)) return [];
    const suggestion = suggestDamageCause(cause);
    return [
        `${label}: 'params.cause' is '${cause}', which is not an EntityDamageCause` +
            `${suggestion === undefined ? '.' : ` — did you mean '${suggestion}'?`}`,
    ];
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
        if (typeof value === 'string' && !SOUND_PRESETS.includes(value)) {
            problems.push(
                `${label}.sounds.${slot}: '${value}' is not a preset in SOUND_LIBRARY. ` +
                    `Add it there, or pass an explicit { id } spec. Known presets: ${SOUND_PRESETS.join(', ')}.`,
            );
        }
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
 * @param {unknown} knockback
 * @param {string} label
 * @returns {string[]}
 */
export function validateKnockback(knockback, label) {
    if (knockback === undefined) return [];
    if (!isPlainObject(knockback)) return [`${label}.knockback: must be an object.`];

    /** @type {string[]} */
    const problems = [];
    const known = ['horizontal', 'vertical', 'mode', 'from', 'direction', 'pull'];
    if (knockback.mode !== undefined && knockback.mode !== 'away' && knockback.mode !== 'forward') {
        problems.push(`${label}.knockback: 'mode' must be 'away' or 'forward' when present.`);
    }

    for (const field of ['horizontal', 'vertical']) {
        const value = knockback[field];
        if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
            problems.push(`${label}.knockback: '${field}' must be a finite number when present.`);
        }
    }
    if (knockback.pull !== undefined && typeof knockback.pull !== 'boolean') {
        problems.push(`${label}.knockback: 'pull' must be a boolean when present.`);
    }
    for (const field of ['from', 'direction']) {
        const value = knockback[field];
        if (value === undefined) continue;
        if (!isPlainObject(value) || !['x', 'y', 'z'].every((axis) => Number.isFinite(value[axis]))) {
            problems.push(`${label}.knockback: '${field}' must be a finite {x, y, z} vector when present.`);
        }
    }
    for (const key of Object.keys(knockback)) {
        if (!known.includes(key)) {
            problems.push(`${label}.knockback: unknown field '${key}'. Valid: ${known.join(', ')}.`);
        }
    }
    return problems;
}

/**
 * @param {unknown} allowedTargets
 * @param {string} label
 * @returns {string[]}
 */
export function validateAllowedTargets(allowedTargets, label) {
    if (allowedTargets === undefined) return [];
    if (!Array.isArray(allowedTargets) || allowedTargets.length === 0) {
        return [`${label}.allowedTargets: must be a non-empty array when present.`];
    }
    /** @type {string[]} */
    const problems = [];
    for (const category of allowedTargets) {
        if (!isTargetCategory(category)) {
            problems.push(
                `${label}.allowedTargets: unknown category '${category}'. ` +
                    `Valid: ${TARGET_CATEGORY_IDS.join(', ')}.`,
            );
        }
    }
    return problems;
}

/**
 * @param {unknown} restrictions
 * @param {string} label
 * @returns {string[]}
 */
export function validateRestrictions(restrictions, label) {
    if (restrictions === undefined) return [];
    if (!isPlainObject(restrictions)) return [`${label}.restrictions: must be an object.`];

    /** @type {string[]} */
    const problems = [];
    const known = ['minHealth', 'requireGrounded', 'forbidInWater', 'dimensions'];

    if (restrictions.minHealth !== undefined && !isPositiveNumber(restrictions.minHealth)) {
        problems.push(`${label}.restrictions: 'minHealth' must be a positive number.`);
    }
    for (const flag of ['requireGrounded', 'forbidInWater']) {
        if (restrictions[flag] !== undefined && typeof restrictions[flag] !== 'boolean') {
            problems.push(`${label}.restrictions: '${flag}' must be a boolean when present.`);
        }
    }
    if (restrictions.dimensions !== undefined) {
        if (!Array.isArray(restrictions.dimensions) || restrictions.dimensions.length === 0) {
            problems.push(`${label}.restrictions: 'dimensions' must be a non-empty array when present.`);
        } else if (!restrictions.dimensions.every((d) => typeof d === 'string' && IDENTIFIER_PATTERN.test(d))) {
            problems.push(`${label}.restrictions: every dimension must be a namespaced id, e.g. 'minecraft:nether'.`);
        }
    }
    for (const key of Object.keys(restrictions)) {
        if (!known.includes(key)) {
            problems.push(`${label}.restrictions: unknown restriction '${key}'. Valid: ${known.join(', ')}.`);
        }
    }
    return problems;
}

/**
 * @param {AbilityBinding | undefined} binding
 * @param {string} label Where the binding lives, e.g. `custom_swords:x[use]`.
 * @param {(id: string) => boolean} abilityExists
 * @returns {string[]}
 */
export function validateBinding(binding, label, abilityExists) {
    if (binding === undefined) return [];
    if (!isPlainObject(binding)) return [`${label}: binding must be an object.`];

    /** @type {string[]} */
    const problems = [];

    if (!isActivationMethod(binding.activation)) {
        problems.push(`${label}: 'activation' must be one of ${ACTIVATION_METHODS.join(', ')}.`);
    }
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
    } else if (binding.params !== undefined) {
        // `params.cause` is the one parameter the framework itself consumes:
        // the damage layer hands it straight to `applyDamage`. Checked here
        // rather than in each ability's own `validateParams` because every
        // ability that deals damage takes it, and 25 copies of the same check
        // is 25 chances to leave one out.
        problems.push(...validateDamageCause(binding.params.cause, label));
    }

    problems.push(...validateTargeting(binding.targeting, label));
    problems.push(...validateEffects(binding.effects, label));
    problems.push(...validateParticles(binding.particles, label));
    problems.push(...validateSounds(binding.sounds, label));

    if (binding.label !== undefined && (typeof binding.label !== 'string' || binding.label.trim().length === 0)) {
        problems.push(`${label}.label: must be a non-empty string when present.`);
    }

    if (binding.visual !== undefined && !isVisualProfile(binding.visual)) {
        problems.push(
            `${label}.visual: '${binding.visual}' is not a visual profile. ` +
                `Known profiles: ${PROFILE_NAMES.join(', ')}.`,
        );
    }
    problems.push(...validateKnockback(binding.knockback, label));
    problems.push(...validateAllowedTargets(binding.allowedTargets, label));
    problems.push(...validateRestrictions(binding.restrictions, label));

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
    if (
        stats.swingDuration !== undefined &&
        (typeof stats.swingDuration !== 'number' ||
            !Number.isFinite(stats.swingDuration) ||
            stats.swingDuration <= 0 ||
            stats.swingDuration > 2)
    ) {
        problems.push(`${label}.item.swingDuration: must be a number in seconds, greater than 0 and at most 2.`);
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

    if (!Array.isArray(sword.abilities)) {
        problems.push(`${label}: 'abilities' must be an array of bindings.`);
    } else if (sword.abilities.length === 0) {
        problems.push(`${label}: needs at least one ability binding.`);
    } else {
        /** @type {Set<string>} */
        const seenActivations = new Set();
        sword.abilities.forEach((binding, index) => {
            const activation = isPlainObject(binding) ? String(binding.activation) : `#${index}`;
            problems.push(...validateBinding(binding, `${label}[${activation}]`, abilityExists));
            // Two bindings on one activation would make dispatch ambiguous.
            if (isPlainObject(binding) && isActivationMethod(binding.activation)) {
                if (seenActivations.has(binding.activation)) {
                    problems.push(`${label}: binds '${binding.activation}' more than once.`);
                }
                seenActivations.add(binding.activation);
            }
        });
    }

    if (sword.tags !== undefined && !Array.isArray(sword.tags)) {
        problems.push(`${label}: 'tags' must be an array when present.`);
    }
    if (sword.isTestItem !== undefined && typeof sword.isTestItem !== 'boolean') {
        problems.push(`${label}: 'isTestItem' must be a boolean when present.`);
    }
    return problems;
}
