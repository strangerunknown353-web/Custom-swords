/**
 * The Sword Registry — the central source of truth for sword metadata.
 *
 * Everything that needs to know something about a sword asks this object.
 * Nothing anywhere else in the addon hard-codes a sword id, a stat, or a
 * rarity; there is no `switch` over sword ids and there never will be, because
 * every question a caller could ask is answered here in O(1).
 *
 * It wraps the generic {@link Registry} rather than reimplementing it, adding
 * only sword-specific vocabulary. Registered definitions are deep-frozen: the
 * same object is handed to every player on every invocation, so it must be
 * impossible for one ability to mutate a sword out from under another. That is
 * the immutability half of the multiplayer rule — the mutable half lives in
 * `PlayerStateStore`, keyed per player.
 *
 * Engine-free, so the build tools and unit tests use the real implementation.
 */

import { Registry } from './registry.js';
import { isOwnedIdentifier } from './identifiers.js';
import { colorize, rarityOf, compareRarity } from './rarity.js';

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */
/** @typedef {import('./types.js').SwordItemStats} SwordItemStats */
/** @typedef {import('./types.js').AbilityBinding} AbilityBinding */

/**
 * Recursively freezes a definition so shared metadata cannot be mutated at
 * runtime. Cheap: it runs once per sword at world load, never during play.
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

export class SwordRegistry {
    constructor() {
        /** @private @readonly @type {Registry<SwordDefinition>} */
        this.registry = new Registry('sword');
    }

    /**
     * @param {SwordDefinition} sword Must already have passed validation.
     * @throws {Error} On a duplicate id or after sealing.
     */
    register(sword) {
        this.registry.register(sword.id, deepFreeze(sword));
    }

    /**
     * @param {string} id
     * @returns {SwordDefinition | undefined}
     */
    get(id) {
        return this.registry.get(id);
    }

    /**
     * @param {string} id
     * @returns {SwordDefinition}
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
     * Is this item type one of ours?
     *
     * Deliberately checks the namespace first: a vanilla `minecraft:*` id or
     * another add-on's id is rejected without a map lookup, and any non-string
     * input answers `false` instead of throwing.
     *
     * @param {unknown} typeId
     * @returns {boolean}
     */
    isCustomSword(typeId) {
        return isOwnedIdentifier(typeId) && this.registry.has(/** @type {string} */ (typeId));
    }

    /**
     * @param {string} id
     * @returns {SwordItemStats | undefined}
     */
    getStats(id) {
        return this.registry.get(id)?.item;
    }

    /**
     * Both ability bindings for a sword. Always returns an object so callers
     * can destructure without a null check.
     *
     * @param {string} id
     * @returns {{ active: AbilityBinding | undefined, passive: AbilityBinding | undefined }}
     */
    getAbilities(id) {
        const sword = this.registry.get(id);
        return { active: sword?.active, passive: sword?.passive };
    }

    /**
     * The binding for one trigger, or undefined when the sword does not bind
     * that trigger.
     *
     * @param {string} id
     * @param {import('./types.js').AbilityTrigger} trigger
     * @returns {AbilityBinding | undefined}
     */
    getBinding(id, trigger) {
        const sword = this.registry.get(id);
        if (sword === undefined) return undefined;
        return trigger === 'use' ? sword.active : sword.passive;
    }

    /**
     * Presentation metadata, assembled consistently so every surface (action
     * bar, future codex UI, generated `.lang`, documentation) shows the same
     * thing.
     *
     * @param {string} id
     * @returns {{ id: string, name: string, coloredName: string, description: string, rarity: import('./rarity.js').RarityTier | undefined } | undefined}
     */
    getDisplay(id) {
        const sword = this.registry.get(id);
        if (sword === undefined) return undefined;
        return {
            id: sword.id,
            name: sword.name,
            coloredName: colorize(sword.rarity, sword.name),
            description: sword.description,
            rarity: rarityOf(sword.rarity),
        };
    }

    /** @returns {SwordDefinition[]} Every registered sword. */
    all() {
        return this.registry.values();
    }

    /** @returns {SwordDefinition[]} Swords intended for players, rarest last. */
    shipped() {
        return this.all()
            .filter((sword) => sword.isTestItem !== true)
            .sort((a, b) => compareRarity(a.rarity, b.rarity) || a.id.localeCompare(b.id));
    }

    /** @returns {SwordDefinition[]} Diagnostic items, which are not part of the collection. */
    testItems() {
        return this.all().filter((sword) => sword.isTestItem === true);
    }

    /** @returns {string[]} */
    ids() {
        return this.registry.ids();
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
