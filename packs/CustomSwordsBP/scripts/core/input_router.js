/**
 * The single entry point from the game engine into the framework.
 *
 * Input arrives through ONE registered item custom component,
 * `custom_swords:sword`, which every generated sword item declares. That choice
 * matters:
 *
 *  - It is item-scoped. Handlers fire only for our swords, so there is no global
 *    `entityHitEntity` listener running for every zombie punch in the world.
 *  - There is exactly one subscription for the whole addon regardless of how
 *    many swords exist, so no duplicated event handling and no per-sword
 *    listeners to leak.
 *  - There are no tick loops at all. Input is purely event-driven.
 *
 * Requires `@minecraft/server` 2.0.0+ (Custom Components V2). See
 * docs/API_NOTES.md for the version contract.
 */

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */

/** Component id declared by every generated sword item JSON. */
export const SWORD_COMPONENT_ID = 'custom_swords:sword';

export class InputRouter {
    /**
     * @param {object} deps
     * @param {import('./registry.js').Registry<SwordDefinition>} deps.swords
     * @param {import('./ability_executor.js').AbilityExecutor} deps.executor
     * @param {import('../systems/combat.js').CombatSystem} deps.combat
     * @param {typeof import('./log.js').log} deps.log
     */
    constructor({ swords, executor, combat, log }) {
        /** @private @readonly */
        this.swords = swords;
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
        const sword = this.resolveSword(event.itemStack?.typeId);
        if (sword === undefined) return;
        if (sword.active === undefined) return;

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
        const sword = this.resolveSword(event.itemStack?.typeId);
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

    /**
     * O(1) registry lookup — no scanning, no switch statement over sword ids.
     *
     * @private
     * @param {string | undefined} typeId
     * @returns {SwordDefinition | undefined}
     */
    resolveSword(typeId) {
        if (typeId === undefined) return undefined;
        const sword = this.swords.get(typeId);
        if (sword === undefined) {
            // The component is on an item we have no definition for. That means
            // the item JSON and the script definitions have drifted apart.
            this.log.warn(`Item '${typeId}' uses '${SWORD_COMPONENT_ID}' but has no sword definition.`);
        }
        return sword;
    }
}
