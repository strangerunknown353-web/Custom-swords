/**
 * The ability pipeline — the heart of the Ability Engine.
 *
 * Every ability invocation in the addon, on any activation, for any sword, goes
 * through `invoke()`. That single funnel is what lets the collection scale:
 * adding a sword adds data, never another code path.
 *
 * Pipeline:
 *
 *   activation -> resolve ability -> VALIDATION GATE -> build context
 *   -> execute (guarded) -> start cooldown on success -> player feedback
 *
 * Three decisions worth calling out:
 *
 *  - **Validation happens before anything is spent.** The gate
 *    (`core/ability_gate.js`) runs every pre-execution check in a fixed order.
 *    A failed gate leaves the world untouched: no cooldown, no particles, no
 *    sound, no damage.
 *  - **The cooldown starts only after a successful execution.** An ability that
 *    reports `{ ok: false }` (no target found, conditions unmet) does not burn
 *    the player's cooldown.
 *  - **`execute` is wrapped in try/catch.** One throwing ability is contained to
 *    that invocation; it can never take down the event handler and with it
 *    every other sword in the world.
 */

import { resolvePresentation } from './visual_profiles.js';

/** @typedef {import('./types.js').AbilityBinding} AbilityBinding */
/** @typedef {import('./types.js').AbilityContext} AbilityContext */
/** @typedef {import('./types.js').AbilityDefinition} AbilityDefinition */
/** @typedef {import('./types.js').AbilityResult} AbilityResult */
/** @typedef {import('./types.js').ServiceContainer} ServiceContainer */
/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */
/** @typedef {import('./activation.js').ActivationMethod} ActivationMethod */

/**
 * @typedef {Object} InvokeRequest
 * @property {import('@minecraft/server').Player} player
 * @property {SwordDefinition} sword
 * @property {AbilityBinding} binding
 * @property {ActivationMethod} activation
 * @property {import('@minecraft/server').ItemStack} [itemStack]
 * @property {import('@minecraft/server').Entity} [target]
 */

/**
 * Shared, frozen defaults for a binding's optional declarative fields.
 * Allocated once rather than per invocation, and frozen so an ability cannot
 * accidentally mutate the default that every other invocation also sees.
 */
const DEFAULT_TARGETING = Object.freeze(/** @type {import('./types.js').TargetingSpec} */ ({ type: 'self' }));
const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});
const DEFAULT_TARGETS = Object.freeze(['any']);

/** Activations that are player-initiated and therefore deserve visible feedback. */
const FEEDBACK_ACTIVATIONS = new Set(['use', 'sneak_use']);

export class AbilityExecutor {
    /**
     * @param {object} deps
     * @param {import('./ability_registry.js').AbilityRegistry} deps.abilities
     * @param {import('./ability_gate.js').AbilityGate} deps.gate
     * @param {ServiceContainer} deps.services
     * @param {() => number} deps.clock Returns the current tick.
     */
    constructor({ abilities, gate, services, clock }) {
        /** @private @readonly */
        this.abilities = abilities;
        /** @private @readonly */
        this.gate = gate;
        /** @private @readonly */
        this.services = services;
        /** @private @readonly */
        this.clock = clock;
    }

    /**
     * Cooldown key for a binding. Defaults to sword + activation so each sword
     * and each of its activations has an independent timer; a binding can set
     * `cooldownKey` to deliberately share one across abilities or swords.
     *
     * @param {SwordDefinition} sword
     * @param {AbilityBinding} binding
     * @returns {string}
     */
    static cooldownKey(sword, binding) {
        if (binding.cooldownKey !== undefined) return binding.cooldownKey;
        // Each selectable ability cools down on its own. The first keeps the
        // pre-2.0 key so a cooldown running across an upgrade is honoured.
        if (binding.activation === 'use') {
            let slot = 0;
            for (const candidate of sword.abilities) {
                if (candidate === binding) break;
                if (candidate.activation === 'use') slot++;
            }
            if (slot > 0) return `${sword.id}#use:${slot}`;
        }
        return `${sword.id}#${binding.activation}`;
    }

    /**
     * @param {AbilityBinding} binding
     * @returns {string}
     */
    abilityName(binding) {
        return this.abilities.get(binding.abilityId)?.name ?? 'Ability';
    }

    /**
     * Ticks until `binding` can be cast again by `player`; 0 when ready.
     *
     * @param {import('@minecraft/server').Player} player
     * @param {SwordDefinition} sword
     * @param {AbilityBinding} binding
     * @returns {number}
     */
    remainingCooldown(player, sword, binding) {
        return this.services.cooldowns.remaining(player.id, AbilityExecutor.cooldownKey(sword, binding));
    }

    /**
     * @param {InvokeRequest} request
     * @returns {AbilityResult}
     */
    invoke(request) {
        const { player, sword, binding, activation } = request;
        const services = this.services;
        const cooldownKey = AbilityExecutor.cooldownKey(sword, binding);

        const gateResult = this.gate.check({ player, sword, binding, cooldownKey });
        if (!gateResult.ok) {
            this.reportRefusal(request, gateResult);
            return { ok: false, reason: gateResult.reason };
        }

        // Safe now: the gate has confirmed the ability is registered.
        const ability = this.abilities.require(binding.abilityId);

        /** @type {AbilityContext} */
        let ctx;
        try {
            ctx = this.buildContext(request, ability);
        } catch (error) {
            services.log.error(`Failed to build context for '${ability.id}':`, error);
            return { ok: false, reason: 'context_error' };
        }

        /** @type {AbilityResult} */
        let result;
        try {
            result = ability.execute(ctx) ?? { ok: true };
        } catch (error) {
            services.log.error(`Ability '${ability.id}' threw during execute:`, error);
            services.feedback.internalError(player);
            return { ok: false, reason: 'ability_error' };
        }

        if (result.ok) {
            this.startCooldown(player, player.id, cooldownKey, binding);
            if (FEEDBACK_ACTIVATIONS.has(activation)) {
                services.feedback.abilityUsed(player, binding.label ?? ability.name, result.message);
            }
        } else if (FEEDBACK_ACTIVATIONS.has(activation)) {
            services.feedback.denied(player, result.message ?? 'Nothing happened.');
        }

        return result;
    }

    /**
     * Tells the player why an activation was refused — but only for activations
     * they deliberately made, and only when there is something useful to say.
     * A melee swing that silently fails its gate must not spam the action bar.
     *
     * @private
     * @param {InvokeRequest} request
     * @param {import('./ability_gate.js').GateResult} gateResult
     */
    reportRefusal(request, gateResult) {
        if (!FEEDBACK_ACTIVATIONS.has(request.activation)) return;
        const { player, binding } = request;
        const ability = this.abilities.get(binding.abilityId);
        const name = binding.label ?? ability?.name ?? 'Ability';

        if (gateResult.reason === 'cooldown') {
            this.services.feedback.onCooldown(player, name, gateResult.remainingTicks ?? 0);
            return;
        }
        if (gateResult.message !== undefined) {
            this.services.feedback.denied(player, gateResult.message);
        }
    }

    /**
     * @private
     * @param {import('@minecraft/server').Player} player
     * @param {string} playerId
     * @param {string} key
     * @param {AbilityBinding} binding
     */
    startCooldown(player, playerId, key, binding) {
        const ticks = binding.cooldownTicks ?? 0;
        if (ticks <= 0) return;
        this.services.cooldowns.start(playerId, key, ticks);

        // Optional: mirror onto the vanilla item-cooldown HUD sweep so the
        // player gets the familiar overlay. Purely cosmetic — the script
        // cooldown above remains the single source of truth.
        if (this.services.config.cooldown.mirrorToItemHud && binding.hudCategory !== undefined) {
            try {
                player.startItemCooldown(binding.hudCategory, ticks);
            } catch (error) {
                this.services.log.debug('startItemCooldown mirror failed:', error);
            }
        }
    }

    /**
     * @private
     * @param {InvokeRequest} request
     * @param {AbilityDefinition} ability
     * @returns {AbilityContext}
     */
    buildContext(request, ability) {
        const { player, sword, binding, activation, itemStack, target } = request;
        const presentation = resolvePresentation(binding);

        return {
            player,
            playerId: player.id,
            sword,
            binding,
            itemStack,
            dimension: player.dimension,
            origin: player.getHeadLocation(),
            viewDirection: player.getViewDirection(),
            currentTick: this.clock(),
            activation,
            target,
            // The binding's declarative fields are surfaced directly on the
            // context with safe defaults, so an ability never has to write
            // `ctx.binding.targeting?.range ?? something` — it reads `ctx`.
            targeting: binding.targeting ?? DEFAULT_TARGETING,
            effects: binding.effects ?? EMPTY_ARRAY,
            // Presentation comes from the binding's visual profile, with
            // anything the binding stated explicitly taking precedence. Resolved
            // once per activation, not per target.
            particles: presentation.particles,
            sounds: presentation.sounds,
            visual: presentation.profile,
            allowedTargets: binding.allowedTargets ?? DEFAULT_TARGETS,
            knockback: binding.knockback,
            params: { ...(ability.defaults ?? {}), ...(binding.params ?? {}) },
            services: this.services,
        };
    }
}
