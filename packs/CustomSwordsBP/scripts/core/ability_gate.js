/**
 * The validation gate: everything that must be true before an ability runs.
 *
 * The checks are an ordered, named chain rather than a pile of inline `if`s so
 * that the order is visible, each step is individually testable, and a refusal
 * always carries a machine-readable reason plus a player-facing message.
 *
 * Order matters, and is cheapest-and-most-fundamental first:
 *
 *   1. player   — is the caster still a valid, live handle?
 *   2. ability  — is the bound ability actually registered?
 *   3. equipped — is the caster still holding this sword?
 *   4. limits   — do the binding's declared restrictions allow it?
 *   5. rate    — is this player activating faster than the anti-spam floor?
 *   6. cooldown — has the timer elapsed?
 *
 * The cooldown is checked LAST of the pre-execution checks so that a refusal
 * for any other reason never shows the player a misleading cooldown message.
 *
 * Nothing here mutates anything. A failed gate leaves the world exactly as it
 * was: no cooldown started, no durability spent, no particles, no sound.
 */

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */
/** @typedef {import('./types.js').AbilityBinding} AbilityBinding */
/** @typedef {import('./types.js').RestrictionSpec} RestrictionSpec */

/**
 * @typedef {Object} GateResult
 * @property {boolean} ok
 * @property {string} [reason] Machine-readable, e.g. `cooldown`, `restricted_health`.
 * @property {string} [message] Player-facing explanation, when one is useful.
 * @property {number} [remainingTicks] Set when `reason` is `cooldown`.
 */

const PASS = Object.freeze({ ok: true });

/** Cooldown key backing the per-player activation rate limit. */
const RATE_KEY = 'rate:activation';

export class AbilityGate {
    /**
     * @param {object} deps
     * @param {import('./ability_registry.js').AbilityRegistry} deps.abilities
     * @param {import('./item_identifier.js').ItemIdentifier} deps.identifier
     * @param {import('./cooldown_manager.js').CooldownManager} deps.cooldowns
     * @param {typeof import('../config.js').CONFIG} deps.config
     * @param {typeof import('./log.js').log} deps.log
     */
    constructor({ abilities, identifier, cooldowns, config, log }) {
        /** @private @readonly */
        this.config = config;
        /** @private @readonly */
        this.abilities = abilities;
        /** @private @readonly */
        this.identifier = identifier;
        /** @private @readonly */
        this.cooldowns = cooldowns;
        /** @private @readonly */
        this.log = log;
    }

    /**
     * Runs the full chain.
     *
     * @param {object} request
     * @param {import('@minecraft/server').Player} request.player
     * @param {SwordDefinition} request.sword
     * @param {AbilityBinding} request.binding
     * @param {string} request.cooldownKey
     * @returns {GateResult}
     */
    check({ player, sword, binding, cooldownKey }) {
        const playerCheck = this.checkPlayer(player);
        if (!playerCheck.ok) return playerCheck;

        const abilityCheck = this.checkAbility(sword, binding);
        if (!abilityCheck.ok) return abilityCheck;

        const equippedCheck = this.checkEquipped(player, sword);
        if (!equippedCheck.ok) return equippedCheck;

        const restrictionCheck = this.checkRestrictions(player, binding.restrictions);
        if (!restrictionCheck.ok) return restrictionCheck;

        const rateCheck = this.checkRate(player.id);
        if (!rateCheck.ok) return rateCheck;

        return this.checkCooldown(player.id, cooldownKey);
    }

    /**
     * @param {import('@minecraft/server').Player} player
     * @returns {GateResult}
     */
    checkPlayer(player) {
        if (player === undefined || player === null) return { ok: false, reason: 'no_player' };
        try {
            if (!player.isValid) return { ok: false, reason: 'invalid_player' };
        } catch {
            return { ok: false, reason: 'invalid_player' };
        }
        return PASS;
    }

    /**
     * @param {SwordDefinition} sword
     * @param {AbilityBinding} binding
     * @returns {GateResult}
     */
    checkAbility(sword, binding) {
        if (this.abilities.has(binding.abilityId)) return PASS;
        // Bootstrap validation should have caught this; this is the backstop.
        this.log.error(`Sword '${sword.id}' binds unregistered ability '${binding.abilityId}'.`);
        return { ok: false, reason: 'unknown_ability' };
    }

    /**
     * Confirms the caster is still holding the sword that triggered this.
     *
     * The engine hands us the stack that fired the event, but by the time the
     * handler runs the player may have swapped slots or the stack may have
     * broken. Re-reading the main hand is one component read on a
     * player-initiated action, which is a cheap price for never running a
     * sword's ability from an empty hand.
     *
     * @param {import('@minecraft/server').Player} player
     * @param {SwordDefinition} sword
     * @returns {GateResult}
     */
    checkEquipped(player, sword) {
        const held = this.identifier.heldSword(player);
        if (held === undefined) return { ok: false, reason: 'not_equipped' };
        if (held.sword.id !== sword.id) return { ok: false, reason: 'wrong_sword' };
        return PASS;
    }

    /**
     * @param {import('@minecraft/server').Player} player
     * @param {RestrictionSpec | undefined} restrictions
     * @returns {GateResult}
     */
    checkRestrictions(player, restrictions) {
        if (restrictions === undefined) return PASS;

        try {
            if (restrictions.minHealth !== undefined) {
                const health = player.getComponent('minecraft:health');
                const current = /** @type {any} */ (health)?.currentValue;
                if (typeof current === 'number' && current < restrictions.minHealth) {
                    return {
                        ok: false,
                        reason: 'restricted_health',
                        message: `Needs ${restrictions.minHealth} health.`,
                    };
                }
            }
            if (restrictions.requireGrounded === true && !player.isOnGround) {
                return { ok: false, reason: 'restricted_airborne', message: 'Must be on the ground.' };
            }
            if (restrictions.forbidInWater === true && player.isInWater) {
                return { ok: false, reason: 'restricted_water', message: 'Not while swimming.' };
            }
            if (restrictions.dimensions !== undefined && !restrictions.dimensions.includes(player.dimension.id)) {
                return { ok: false, reason: 'restricted_dimension', message: 'Not in this dimension.' };
            }
        } catch (error) {
            // A restriction we cannot evaluate must not silently pass, but it
            // must also not crash the handler.
            this.log.warn('Restriction check failed; refusing the activation:', error);
            return { ok: false, reason: 'restriction_error' };
        }
        return PASS;
    }

    /**
     * Anti-spam floor beneath the gameplay cooldowns.
     *
     * A held right-click re-fires every tick; without a floor, an ability with
     * no cooldown would run twenty times a second per player. This is not a
     * balance mechanism — it is the budget guard that keeps one player from
     * dominating a busy server's tick.
     *
     * It is silent: a refusal here produces no message, because the player did
     * not do anything wrong and a burst of "too fast!" text would be worse than
     * the spam it prevents.
     *
     * @param {string} playerId
     * @returns {GateResult}
     */
    checkRate(playerId) {
        const minimum = this.config.combat.minActivationIntervalTicks;
        if (minimum <= 0) return PASS;
        if (!this.cooldowns.isReady(playerId, RATE_KEY)) return { ok: false, reason: 'rate_limited' };
        this.cooldowns.start(playerId, RATE_KEY, minimum);
        return PASS;
    }

    /**
     * @param {string} playerId
     * @param {string} cooldownKey
     * @returns {GateResult}
     */
    checkCooldown(playerId, cooldownKey) {
        const remaining = this.cooldowns.remaining(playerId, cooldownKey);
        if (remaining > 0) return { ok: false, reason: 'cooldown', remainingTicks: remaining };
        return PASS;
    }
}
