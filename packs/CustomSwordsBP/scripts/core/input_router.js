/**
 * The single entry point from the game engine into the framework.
 *
 * Input arrives through ONE registered item custom component,
 * `custom_swords:sword`, which every generated sword item declares. That choice
 * matters:
 *
 *  - It is item-scoped. Handlers fire only for our swords, so there is no global
 *    `entityHitEntity` listener running for every zombie punch in the world, and
 *    vanilla swords are never touched by this addon.
 *  - There is exactly one subscription for the whole addon regardless of how
 *    many swords exist, so no duplicated event handling and no per-sword
 *    listeners to leak.
 *  - There are no tick loops at all. Input is purely event-driven, so the addon
 *    costs nothing while nobody is swinging a sword.
 *
 * The router deliberately contains no sword knowledge: it asks
 * {@link ItemIdentifier} what it is holding and asks the executor to run
 * whatever the definition declared. Adding sword #26 does not touch this file.
 *
 * Requires `@minecraft/server` 2.0.0+ (Custom Components V2). See
 * docs/API_NOTES.md for the version contract.
 */

import { SWORD_COMPONENT_ID } from './identifiers.js';

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */

export { SWORD_COMPONENT_ID };

export class InputRouter {
    /**
     * @param {object} deps
     * @param {import('./item_identifier.js').ItemIdentifier} deps.identifier
     * @param {import('./ability_executor.js').AbilityExecutor} deps.executor
     * @param {import('../systems/combat.js').CombatSystem} deps.combat
     * @param {typeof import('./log.js').log} deps.log
     */
    constructor({ identifier, executor, combat, log }) {
        /** @private @readonly */
        this.identifier = identifier;
        /** @private @readonly */
        this.executor = executor;
        /** @private @readonly */
        this.combat = combat;
        /** @private @readonly */
        this.log = log;
    }

    /**
     * Registers the custom component. Must be called during
     * `system.beforeEvents.startup` (early execution), before item JSON loads.
     *
     * @param {import('@minecraft/server').ItemComponentRegistry} registry
     */
    register(registry) {
        registry.registerCustomComponent(SWORD_COMPONENT_ID, {
            onUse: (event) => this.handleUse(event),
            onHitEntity: (event) => this.handleHitEntity(event),
        });
        this.log.info(`Registered item component '${SWORD_COMPONENT_ID}'.`);
    }

    /**
     * @private
     * @param {import('@minecraft/server').ItemComponentUseEvent} event
     */
    handleUse(event) {
        const sword = this.identifier.fromItemStack(event.itemStack);
        if (sword?.active === undefined) return;

        this.executor.invoke({
            player: event.source,
            sword,
            binding: sword.active,
            trigger: 'use',
            itemStack: event.itemStack,
        });
    }

    /**
     * @private
     * @param {import('@minecraft/server').ItemComponentHitEntityEvent} event
     */
    handleHitEntity(event) {
        const sword = this.identifier.fromItemStack(event.itemStack);
        if (sword === undefined) return;

        // Only players drive sword abilities. A mob wielding a custom sword
        // would otherwise reach code that assumes a Player.
        const attacker = event.attackingEntity;
        if (attacker === undefined || attacker.typeId !== 'minecraft:player') return;

        this.combat.onHitEntity({
            player: /** @type {import('@minecraft/server').Player} */ (/** @type {unknown} */ (attacker)),
            target: event.hitEntity,
            sword,
            itemStack: event.itemStack,
        });
    }
}
