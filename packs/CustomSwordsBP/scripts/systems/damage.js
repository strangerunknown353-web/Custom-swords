/**
 * Damage and knockback application.
 *
 * Centralised so that the global damage multiplier, the per-hit ceiling, the
 * PvP rule and the "never hurt the caster" rule are enforced in exactly one
 * place. Abilities describe intent ("hit for 6"); this decides what actually
 * lands.
 */

import { EntityDamageCause } from '@minecraft/server';
import * as Vec3 from '../util/vec3.js';
import { clamp } from '../util/mathx.js';

/** @typedef {import('@minecraft/server').Entity} Entity */

/**
 * @typedef {Object} DamageOptions
 * @property {string} [cause] An `EntityDamageCause` value. Defaults to `entityAttack`.
 * @property {boolean} [attributeToPlayer] Credit the kill to the caster. Defaults to true.
 * @property {boolean} [bypassMultiplier] Skip `config.combat.abilityDamageMultiplier`.
 */

export class DamageService {
    /**
     * @param {typeof import('../config.js').CONFIG} config
     * @param {import('./targeting.js').TargetingService} targeting
     * @param {typeof import('../core/log.js').log} log
     */
    constructor(config, targeting, log) {
        /** @private @readonly */
        this.config = config;
        /** @private @readonly */
        this.targeting = targeting;
        /** @private @readonly */
        this.log = log;
    }

    /**
     * Resolves the number of hit points an ability request actually deals.
     * Pure; separated out so it can be unit tested without the engine.
     *
     * @param {number} requested
     * @param {boolean} [bypassMultiplier]
     * @returns {number}
     */
    resolveAmount(requested, bypassMultiplier = false) {
        if (!Number.isFinite(requested) || requested <= 0) return 0;
        const scaled = bypassMultiplier ? requested : requested * this.config.combat.abilityDamageMultiplier;
        return clamp(scaled, 0, this.config.combat.maxAbilityDamagePerHit);
    }

    /**
     * @param {import('../core/types.js').AbilityContext} ctx
     * @param {Entity} target
     * @param {number} amount
     * @param {DamageOptions} [options]
     * @returns {boolean} True when damage was applied.
     */
    apply(ctx, target, amount, options = {}) {
        if (
            !this.targeting.isTargetable(target, {
                casterId: ctx.playerId,
                includeCaster: false,
            })
        ) {
            return false;
        }

        const resolved = this.resolveAmount(amount, options.bypassMultiplier);
        if (resolved <= 0) return false;

        try {
            return target.applyDamage(resolved, {
                cause: /** @type {any} */ (options.cause ?? EntityDamageCause.entityAttack),
                damagingEntity: (options.attributeToPlayer ?? true) ? ctx.player : undefined,
            });
        } catch (error) {
            // A target can be removed between the query and this call; that is
            // expected in multiplayer and must not abort the whole ability.
            this.log.debug('damage.apply skipped:', error);
            return false;
        }
    }

    /**
     * Applies damage to a list of targets, returning how many actually took it.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     * @param {Entity[]} targets
     * @param {number} amount
     * @param {DamageOptions} [options]
     * @returns {number}
     */
    applyToAll(ctx, targets, amount, options = {}) {
        let hits = 0;
        for (const target of targets) {
            if (this.apply(ctx, target, amount, options)) hits++;
        }
        return hits;
    }

    /**
     * Pushes a target away from (or toward, with a negative force) a point.
     *
     * `Entity.applyKnockback` takes a horizontal `VectorXZ` whose magnitude is
     * the force, plus a separate vertical strength — that is the 2.x signature,
     * not the 1.x four-argument form.
     *
     * @param {Entity} target
     * @param {import('../util/vec3.js').Vec3} from Point to push away from.
     * @param {number} horizontalForce
     * @param {number} verticalStrength
     * @returns {boolean}
     */
    knockback(target, from, horizontalForce, verticalStrength) {
        if (target === undefined || !target.isValid) return false;
        const away = Vec3.subtract(target.location, from);
        const horizontal = Vec3.horizontalForce(away, horizontalForce);
        if (horizontal.x === 0 && horizontal.z === 0 && verticalStrength === 0) return false;
        try {
            target.applyKnockback(horizontal, verticalStrength);
            return true;
        } catch (error) {
            this.log.debug('damage.knockback skipped:', error);
            return false;
        }
    }
}
