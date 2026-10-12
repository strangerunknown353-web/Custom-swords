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
 *    many swords or activation methods exist, so no duplicated event handling
 *    and no per-sword listeners to leak.
 *  - There are no tick loops at all. Input is purely event-driven, so the addon
 *    costs nothing while nobody is swinging a sword.
 *
 * The router's only job is translation: turn an engine event plus the player's
 * sneak state into an activation method, find the binding for it, and hand the
 * rest to the executor.
 *
 * ## Switching abilities (v2.0)
 *
 * A sword may carry several `use` bindings. Use casts the *selected* one, and
 * the player changes the selection by crouching:
 *
 *  - **Tap crouch** while holding the sword: press and release sneak within
 *    `CONFIG.switching.tapMaxTicks`. Holding sneak to creep along a ledge does
 *    not switch. Needs the `playerButtonInput` event; bootstrap turns this on
 *    with {@link InputRouter#enableTapSwitching} when the engine has it.
 *  - **Crouch + use** is the fallback where that event does not exist, so
 *    every supported version can still switch. It contains no sword knowledge and no ability knowledge,
 * so adding sword #26 does not touch this file.
 *
 * Requires `@minecraft/server` 2.0.0+ (Custom Components V2). See
 * docs/API_NOTES.md for the version contract.
 */

import { SWORD_COMPONENT_ID } from './identifiers.js';
import { activationFor, resolutionOrder } from './activation.js';

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */
/** @typedef {import('./activation.js').ActivationMethod} ActivationMethod */

export { SWORD_COMPONENT_ID };

export class InputRouter {
    /**
     * @param {object} deps
     * @param {import('./item_identifier.js').ItemIdentifier} deps.identifier
     * @param {import('./sword_registry.js').SwordRegistry} deps.swords
     * @param {import('./ability_executor.js').AbilityExecutor} deps.executor
     * @param {import('./ability_selector.js').AbilitySelector} deps.selector
     * @param {import('../systems/feedback.js').FeedbackService} deps.feedback
     * @param {() => number} deps.clock
     * @param {typeof import('../config.js').CONFIG} deps.config
     * @param {typeof import('./log.js').log} deps.log
     */
    constructor({ identifier, swords, executor, selector, feedback, clock, config, log }) {
        /** @private @readonly */
        this.identifier = identifier;
        /** @private @readonly */
        this.swords = swords;
        /** @private @readonly */
        this.executor = executor;
        /** @private @readonly */
        this.selector = selector;
        /** @private @readonly */
        this.feedback = feedback;
        /** @private @readonly */
        this.clock = clock;
        /** @private @readonly */
        this.config = config;
        /** @private @readonly */
        this.log = log;
        /**
         * True once tap-crouch switching is live; until then crouch + use
         * switches instead.
         */
        this.tapSwitching = false;
        /** @private @type {Map<string, number>} playerId -> tick sneak was pressed */
        this.sneakPressedAt = new Map();
    }

    /** Called by bootstrap once the sneak-button event is subscribed. */
    enableTapSwitching() {
        this.tapSwitching = true;
    }

    /**
     * Sneak pressed or released. A short press-and-release while holding a
     * sword with more than one ability selects the next one.
     *
     * @param {import('@minecraft/server').Player} player
     * @param {boolean} pressed
     */
    handleSneakButton(player, pressed) {
        let playerId;
        try {
            playerId = player.id;
        } catch {
            return;
        }
        if (pressed) {
            this.sneakPressedAt.set(playerId, this.clock());
            return;
        }
        const pressedAt = this.sneakPressedAt.get(playerId);
        this.sneakPressedAt.delete(playerId);
        if (pressedAt === undefined) return;
        if (this.clock() - pressedAt > this.config.switching.tapMaxTicks) return;

        const held = this.identifier.heldSword(player);
        if (held === undefined) return;
        this.switchAbility(player, held.sword);
    }

    /**
     * @param {import('@minecraft/server').Player} player
     * @param {SwordDefinition} sword
     * @returns {boolean} Whether the selection changed.
     */
    switchAbility(player, sword) {
        const result = this.selector.cycle(player, sword.id);
        if (result === undefined) return false;
        const remaining = this.executor.remainingCooldown(player, sword, result.binding);
        this.feedback.abilitySelected(player, {
            label: result.binding.label ?? this.executor.abilityName(result.binding),
            index: result.index,
            count: result.count,
            remainingTicks: remaining,
        });
        return true;
    }

    /** @param {string} playerId */
    forgetPlayer(playerId) {
        this.sneakPressedAt.delete(playerId);
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
        if (sword === undefined) return;
        this.dispatch({
            player: event.source,
            sword,
            hook: 'use',
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
        if (!event.hitEntity?.isValid) return;

        this.dispatch({
            player: /** @type {import('@minecraft/server').Player} */ (/** @type {unknown} */ (attacker)),
            sword,
            hook: 'attack',
            itemStack: event.itemStack,
            target: event.hitEntity,
        });
    }

    /**
     * Resolves the activation method and runs the matching binding, if any.
     *
     * @private
     * @param {object} request
     * @param {import('@minecraft/server').Player} request.player
     * @param {SwordDefinition} request.sword
     * @param {'use' | 'attack'} request.hook
     * @param {import('@minecraft/server').ItemStack} [request.itemStack]
     * @param {import('@minecraft/server').Entity} [request.target]
     */
    dispatch({ player, sword, hook, itemStack, target }) {
        const sneaking = this.isSneaking(player);
        const activation = activationFor(hook, sneaking);

        if (hook === 'use') {
            // Fallback switching: no sneak-button event, so crouch + use cycles.
            if (sneaking && !this.tapSwitching && this.selector.modes(sword.id).length > 1) {
                this.switchAbility(player, sword);
                return;
            }
            const exact = sneaking ? this.swords.getBinding(sword.id, 'sneak_use') : undefined;
            const binding = exact ?? this.selector.current(player, sword.id);
            if (binding === undefined) return;
            this.executor.invoke({
                player,
                sword,
                binding,
                activation: exact === undefined ? 'use' : 'sneak_use',
                itemStack,
                target,
            });
            return;
        }

        // Try the exact activation, then its non-sneaking base, so a sword that
        // binds only `attack` still responds while the player happens to crouch.
        for (const candidate of resolutionOrder(activation)) {
            const binding = this.swords.getBinding(sword.id, candidate);
            if (binding === undefined) continue;
            this.executor.invoke({
                player,
                sword,
                binding,
                activation: candidate,
                itemStack,
                target,
            });
            return;
        }
    }

    /**
     * @private
     * @param {import('@minecraft/server').Player} player
     * @returns {boolean}
     */
    isSneaking(player) {
        try {
            return player.isSneaking === true;
        } catch {
            // A player handle can go stale between the event and this read.
            return false;
        }
    }
}
