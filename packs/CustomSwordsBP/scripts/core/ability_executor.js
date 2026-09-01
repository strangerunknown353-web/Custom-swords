/**
 * The ability pipeline.
 *
 * Every ability invocation in the addon — active or passive, sword #1 or sword
 * #26 — goes through `invoke()`. That single funnel is what makes the framework
 * scale: adding a sword adds data, never another code path.
 *
 * Pipeline order:
 *
 *   resolve ability -> build context -> cooldown check -> execute (guarded)
 *   -> start cooldown on success -> player feedback
 *
 * Two decisions worth calling out:
 *
 *  - The cooldown starts only AFTER a successful execution. An ability that
 *    reports `{ ok: false }` (no target found, wrong dimension, ...) does not
 *    burn the player's cooldown.
 *  - `execute` is wrapped in try/catch. One throwing ability is contained to
 *    that invocation; it can never take down the event handler and with it
 *    every other sword in the world.
 */

/** @typedef {import('./types.js').AbilityBinding} AbilityBinding */
/** @typedef {import('./types.js').AbilityContext} AbilityContext */
/** @typedef {import('./types.js').AbilityDefinition} AbilityDefinition */
/** @typedef {import('./types.js').AbilityResult} AbilityResult */
/** @typedef {import('./types.js').AbilityTrigger} AbilityTrigger */
/** @typedef {import('./types.js').ServiceContainer} ServiceContainer */
/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */

/**
 * @typedef {Object} InvokeRequest
 * @property {import('@minecraft/server').Player} player
 * @property {SwordDefinition} sword
 * @property {AbilityBinding} binding
 * @property {AbilityTrigger} trigger
 * @property {import('@minecraft/server').ItemStack} [itemStack]
 * @property {import('@minecraft/server').Entity} [target]
 */

export class AbilityExecutor {
    /**
     * @param {object} deps
     * @param {import('./registry.js').Registry<AbilityDefinition>} deps.abilities
     * @param {ServiceContainer} deps.services
     * @param {() => number} deps.clock Returns the current tick.
     */
    constructor({ abilities, services, clock }) {
        /** @private @readonly */
        this.abilities = abilities;
        /** @private @readonly */
        this.services = services;
        /** @private @readonly */
        this.clock = clock;
    }

    /**
     * Cooldown key for a binding. Defaults to the sword id so each sword has an
     * independent cooldown; a binding can opt into a shared key to make a set of
     * swords (or a sword's two abilities) share one timer.
     *
     * @param {SwordDefinition} sword
     * @param {AbilityBinding} binding
     * @param {AbilityTrigger} trigger
     * @returns {string}
     */
    static cooldownKey(sword, binding, trigger) {
        return binding.cooldownKey ?? `${sword.id}#${trigger}`;
    }

    /**
     * @param {InvokeRequest} request
     * @returns {AbilityResult}
     */
    invoke(request) {
        const { player, sword, binding, trigger } = request;
        const services = this.services;

        const ability = this.abilities.get(binding.abilityId);
        if (ability === undefined) {
            // Caught at bootstrap validation too; this is the runtime backstop.
            services.log.error(`Sword '${sword.id}' binds unknown ability '${binding.abilityId}'.`);
            return { ok: false, reason: 'unknown_ability' };
        }

        if (!player.isValid) return { ok: false, reason: 'invalid_player' };

        const playerId = player.id;
        const key = AbilityExecutor.cooldownKey(sword, binding, trigger);
        const remaining = services.cooldowns.remaining(playerId, key);
        if (remaining > 0) {
            services.feedback.onCooldown(player, ability.name, remaining);
            return { ok: false, reason: 'cooldown' };
        }

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
            this.startCooldown(player, playerId, key, binding);
            if (trigger === 'use') {
                services.feedback.abilityUsed(player, ability.name, result.message);
            }
        } else if (trigger === 'use') {
            services.feedback.denied(player, result.message ?? 'Nothing happened.');
        }

        return result;
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
        const { player, sword, binding, trigger, itemStack, target } = request;
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
            trigger,
            target,
            params: { ...(ability.defaults ?? {}), ...(binding.params ?? {}) },
            services: this.services,
        };
    }
}
