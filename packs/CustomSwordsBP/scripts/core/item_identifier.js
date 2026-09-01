/**
 * Item identification: "which of our swords is this, if any?"
 *
 * Every path into the framework asks this module rather than touching the
 * registry directly, so the safety rules live in exactly one place:
 *
 *  - **Never throws.** Every method returns `undefined` or a neutral answer for
 *    bad input: a missing stack, a removed player, a malformed id, a `null`.
 *    Identification runs inside engine event handlers, and a throw there costs
 *    the rest of the handler.
 *  - **Never touches vanilla.** A `minecraft:*` id is rejected on the namespace
 *    check before any lookup, so vanilla swords keep their stock behaviour.
 *  - **Silent on a miss.** An unknown item is an ordinary, expected answer, not
 *    a warning — this is called on hits and uses, so logging every miss would
 *    flood the content log.
 */

import { EquipmentSlot } from '@minecraft/server';

import { isOwnedIdentifier } from './identifiers.js';

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */
/** @typedef {import('@minecraft/server').ItemStack} ItemStack */
/** @typedef {import('@minecraft/server').Player} Player */

/**
 * What an inspected item turned out to be. `kind` lets callers and diagnostics
 * distinguish the four cases the framework must handle differently.
 *
 * @typedef {Object} ItemDescription
 * @property {'custom_sword' | 'vanilla_sword' | 'other_item' | 'empty'} kind
 * @property {string | undefined} typeId
 * @property {SwordDefinition | undefined} sword Present only when `kind` is `custom_sword`.
 */

/** Vanilla tag carried by every stock sword; also applied to ours. */
const VANILLA_SWORD_TAG = 'minecraft:is_sword';

export class ItemIdentifier {
    /**
     * @param {object} deps
     * @param {import('./sword_registry.js').SwordRegistry} deps.swords
     */
    constructor({ swords }) {
        /** @private @readonly */
        this.swords = swords;
    }

    /**
     * @param {unknown} typeId
     * @returns {SwordDefinition | undefined}
     */
    fromTypeId(typeId) {
        if (!isOwnedIdentifier(typeId)) return undefined;
        return this.swords.get(/** @type {string} */ (typeId));
    }

    /**
     * @param {ItemStack | undefined | null} itemStack
     * @returns {SwordDefinition | undefined}
     */
    fromItemStack(itemStack) {
        if (itemStack === undefined || itemStack === null) return undefined;
        try {
            return this.fromTypeId(itemStack.typeId);
        } catch {
            // An ItemStack handle can be invalidated between the event firing
            // and this read; that is a miss, not an error.
            return undefined;
        }
    }

    /**
     * @param {ItemStack | undefined | null} itemStack
     * @returns {boolean}
     */
    isCustomSword(itemStack) {
        return this.fromItemStack(itemStack) !== undefined;
    }

    /**
     * The custom sword a player is currently holding in their main hand, with
     * the stack it came from.
     *
     * Reads the equippable component on demand — no polling, no cached handles.
     * Callers should treat the result as valid only for the current tick.
     *
     * @param {Player | undefined | null} player
     * @returns {{ sword: SwordDefinition, itemStack: ItemStack } | undefined}
     */
    heldSword(player) {
        const itemStack = this.mainhandItem(player);
        const sword = this.fromItemStack(itemStack);
        if (sword === undefined || itemStack === undefined) return undefined;
        return { sword, itemStack };
    }

    /**
     * @param {Player | undefined | null} player
     * @returns {ItemStack | undefined}
     */
    mainhandItem(player) {
        if (player === undefined || player === null) return undefined;
        try {
            if (!player.isValid) return undefined;
            const equippable = player.getComponent('minecraft:equippable');
            if (equippable === undefined) return undefined;
            return /** @type {import('@minecraft/server').EntityEquippableComponent} */ (equippable).getEquipment(
                EquipmentSlot.Mainhand,
            );
        } catch {
            return undefined;
        }
    }

    /**
     * Classifies any item. Used by diagnostics and by the `swordinfo` script
     * event; kept here so the four-way distinction is defined once.
     *
     * @param {ItemStack | undefined | null} itemStack
     * @returns {ItemDescription}
     */
    describe(itemStack) {
        if (itemStack === undefined || itemStack === null) {
            return { kind: 'empty', typeId: undefined, sword: undefined };
        }
        /** @type {string | undefined} */
        let typeId;
        try {
            typeId = itemStack.typeId;
        } catch {
            return { kind: 'empty', typeId: undefined, sword: undefined };
        }

        const sword = this.fromTypeId(typeId);
        if (sword !== undefined) return { kind: 'custom_sword', typeId, sword };

        let isVanillaSword = false;
        try {
            isVanillaSword = itemStack.hasTag(VANILLA_SWORD_TAG);
        } catch {
            isVanillaSword = false;
        }
        return { kind: isVanillaSword ? 'vanilla_sword' : 'other_item', typeId, sword: undefined };
    }
}
