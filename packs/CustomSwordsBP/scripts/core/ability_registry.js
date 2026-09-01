/**
 * The Ability Registry — the central source of truth for ability behaviour,
 * and the index of which swords use which ability.
 *
 * Its shape deliberately mirrors {@link SwordRegistry}: same lookup semantics,
 * same sealing, same "ask the registry, never hard-code" rule. There is no
 * `switch` over ability ids anywhere in the addon.
 *
 * The reverse index is what makes reuse visible. `swordsUsing('custom_swords:shockwave')`
 * answers "which swords would I affect if I changed this ability?" — a question
 * that becomes essential once 25 swords share a dozen abilities.
 *
 * Engine-free.
 */

import { Registry } from './registry.js';

/** @typedef {import('./types.js').AbilityDefinition} AbilityDefinition */
/** @typedef {import('./activation.js').ActivationMethod} ActivationMethod */

/**
 * @typedef {Object} AbilityUsage
 * @property {string} swordId
 * @property {ActivationMethod} activation
 */

/**
 * Recursively freezes an ability so its defaults cannot be mutated at runtime.
 * `execute` and `validateParams` are functions and are left alone.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const key of Object.getOwnPropertyNames(value)) {
        deepFreeze(/** @type {any} */ (value)[key]);
    }
    return Object.freeze(value);
}

export class AbilityRegistry {
    constructor() {
        /** @private @readonly @type {Registry<AbilityDefinition>} */
        this.registry = new Registry('ability');
        /** @private @type {Map<string, AbilityUsage[]>} abilityId -> swords binding it */
        this.usage = new Map();
    }

    /**
     * @param {AbilityDefinition} ability Must already have passed validation.
     * @throws {Error} On a duplicate id or after sealing.
     */
    register(ability) {
        // Only the data half is frozen; `execute` must stay callable.
        if (ability.defaults !== undefined) deepFreeze(ability.defaults);
        this.registry.register(ability.id, ability);
    }

    /**
     * Records that a sword binds this ability on a given activation. Called by
     * the bootstrap once every sword has been validated.
     *
     * @param {string} abilityId
     * @param {string} swordId
     * @param {ActivationMethod} activation
     */
    link(abilityId, swordId, activation) {
        const existing = this.usage.get(abilityId);
        const entry = { swordId, activation };
        if (existing === undefined) this.usage.set(abilityId, [entry]);
        else existing.push(entry);
    }

    /**
     * @param {string} id
     * @returns {AbilityDefinition | undefined}
     */
    get(id) {
        return this.registry.get(id);
    }

    /**
     * @param {string} id
     * @returns {AbilityDefinition}
     * @throws {Error} When the id is not registered.
     */
    require(id) {
        return this.registry.require(id);
    }

    /**
     * @param {string} id
     * @returns {boolean}
     */
    has(id) {
        return this.registry.has(id);
    }

    /**
     * Every sword/activation pair that binds this ability.
     *
     * @param {string} abilityId
     * @returns {readonly AbilityUsage[]}
     */
    swordsUsing(abilityId) {
        return this.usage.get(abilityId) ?? [];
    }

    /**
     * Abilities registered but bound by no sword. Dead behaviour is worth
     * surfacing rather than silently shipping.
     *
     * @returns {string[]}
     */
    unused() {
        return this.ids().filter((id) => this.swordsUsing(id).length === 0);
    }

    /**
     * Presentation metadata for one ability.
     *
     * @param {string} id
     * @returns {{ id: string, name: string, description: string, usedBy: readonly AbilityUsage[] } | undefined}
     */
    describe(id) {
        const ability = this.registry.get(id);
        if (ability === undefined) return undefined;
        return {
            id: ability.id,
            name: ability.name,
            description: ability.description ?? '',
            usedBy: this.swordsUsing(id),
        };
    }

    /** @returns {string[]} */
    ids() {
        return this.registry.ids();
    }

    /** @returns {AbilityDefinition[]} */
    all() {
        return this.registry.values();
    }

    /** @returns {number} */
    get size() {
        return this.registry.size;
    }

    /** Closes the registry to further registration. */
    seal() {
        this.registry.seal();
    }

    /** @returns {boolean} */
    get isSealed() {
        return this.registry.isSealed;
    }
}
