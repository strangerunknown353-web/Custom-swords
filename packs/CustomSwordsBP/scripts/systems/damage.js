/**
 * Damage and knockback application.
 *
 * Abilities describe *intent* ("hit this for 6"); this module decides what
 * actually lands, and is the only place that can hurt anything. Centralising it
 * means the global multiplier, the per-hit ceiling, the PvP rule, the
 * never-target list and the self-damage rule are enforced once and cannot be
 * forgotten by sword #26.
 *
 * ## Validation
 *
 * Every request runs the full chain before a single hit point is dealt:
 *
 *   1. attacker exists and is still valid
 *   2. target exists
 *   3. target handle is still valid (not removed)
 *   4. target is alive
 *   5. amount is a finite, positive number
 *   6. target is permitted (not the caster, not on the never-target list,
 *      PvP allowed)
 *
 * A refusal returns a reason rather than throwing, so a partially-applied area
 * ability continues with its remaining targets instead of aborting.
 */

import { EntityDamageCause } from '@minecraft/server';

import * as Vec3 from '../util/vec3.js';
import { clamp } from '../util/mathx.js';

/** @typedef {import('@minecraft/server').Entity} Entity */
/** @typedef {import('../util/vec3.js').Vec3} Vec3Like */

/**
 * @typedef {Object} DamageOptions
 * @property {string} [cause] An `EntityDamageCause` value. Defaults to `entityAttack`.
 * @property {boolean} [attributeToAttacker] Credit the kill to the caster. Defaults to true.
 * @property {boolean} [bypassMultiplier] Skip `config.combat.abilityDamageMultiplier`.
 * @property {boolean} [allowSelf] Permit damaging the caster. Defaults to false.
 * @property {readonly string[]} [allowedCategories] Category ids the target must satisfy.
 */

/**
 * @typedef {Object} DamageResult
 * @property {boolean} ok
 * @property {number} amount Hit points actually applied; 0 when refused.
 * @property {string} [reason] Machine-readable refusal reason.
 */

/** @type {DamageResult} */
const REFUSED_TEMPLATE = { ok: false, amount: 0 };

/**
 * @param {string} reason
 * @returns {DamageResult}
 */
function refuse(reason) {
    return { ...REFUSED_TEMPLATE, reason };
}

/**
 * Knockback direction modes.
 *
 * @typedef {Object} KnockbackSpec
 * @property {number} [horizontal] Horizontal force. Clamped by config.
 * @property {number} [vertical] Upward strength. Clamped by config.
 * @property {'away' | 'forward'} [mode]
 *   `away` (the default) pushes each target radially away from the origin —
 *   an explosion. `forward` pushes every target along one shared vector, so a
 *   whole group is swept the same way — a wave. The two produce very different
 *   fights from the same ability, which is why it is binding data.
 * @property {Vec3Like} [from] Point to push away from. Defaults to the caster's feet.
 * @property {Vec3Like} [direction] Explicit vector; required by `forward`, overrides `from`.
 * @property {boolean} [pull] Reverse the direction, dragging the target inward.
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
     * Resolves the hit points an ability request actually deals.
     *
     * Pure, so the multiplier and ceiling behaviour is unit tested without the
     * engine. Non-finite and non-positive inputs collapse to 0 rather than
     * reaching `applyDamage`, which is what stops a NaN in a sword definition
     * from becoming a NaN in the engine.
     *
     * @param {number} requested
     * @param {boolean} [bypassMultiplier]
     * @returns {number}
     */
    resolveAmount(requested, bypassMultiplier = false) {
        if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) return 0;
        const scaled = bypassMultiplier ? requested : requested * this.config.combat.abilityDamageMultiplier;
        if (!Number.isFinite(scaled)) return 0;
        return clamp(scaled, 0, this.config.combat.maxAbilityDamagePerHit);
    }

    /**
     * True when the entity is not known to be dead.
     *
     * An entity with no health component (an armour stand, a foreign add-on's
     * marker) cannot be shown to be dead, so it counts as alive; the
     * never-target list and category filters are what keep those out.
     *
     * @param {Entity} entity
     * @returns {boolean}
     */
    isAlive(entity) {
        try {
            const health = entity.getComponent('minecraft:health');
            if (health === undefined) return true;
            const current = /** @type {import('@minecraft/server').EntityHealthComponent} */ (health).currentValue;
            return typeof current !== 'number' || current > 0;
        } catch {
            // A handle that throws on a component read is gone, not alive.
            return false;
        }
    }

    /**
     * Runs the full validation chain without applying anything.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     * @param {Entity | undefined | null} target
     * @param {number} amount
     * @param {DamageOptions} [options]
     * @returns {DamageResult} `ok` means the request would be applied.
     */
    validate(ctx, target, amount, options = {}) {
        if (ctx?.player === undefined) return refuse('no_attacker');
        try {
            if (!ctx.player.isValid) return refuse('invalid_attacker');
        } catch {
            return refuse('invalid_attacker');
        }

        if (target === undefined || target === null) return refuse('no_target');
        try {
            if (!target.isValid) return refuse('invalid_target');
        } catch {
            return refuse('invalid_target');
        }
        if (!this.isAlive(target)) return refuse('target_dead');

        const resolved = this.resolveAmount(amount, options.bypassMultiplier);
        if (resolved <= 0) return refuse('invalid_amount');

        if (
            !this.targeting.isTargetable(target, {
                casterId: ctx.playerId,
                includeCaster: options.allowSelf === true,
                allowedCategories: options.allowedCategories,
            })
        ) {
            return refuse('target_not_permitted');
        }

        return { ok: true, amount: resolved };
    }

    /**
     * Validates, then applies.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     * @param {Entity} target
     * @param {number} amount
     * @param {DamageOptions} [options]
     * @returns {DamageResult}
     */
    apply(ctx, target, amount, options = {}) {
        const validation = this.validate(ctx, target, amount, options);
        if (!validation.ok) return validation;

        try {
            const landed = target.applyDamage(validation.amount, {
                cause: /** @type {any} */ (options.cause ?? EntityDamageCause.entityAttack),
                damagingEntity: (options.attributeToAttacker ?? true) ? ctx.player : undefined,
            });
            return landed ? validation : refuse('absorbed');
        } catch (error) {
            // A target can be removed between validation and this call; that is
            // expected in multiplayer and must not abort the whole ability.
            this.log.debug('damage.apply skipped:', error);
            return refuse('apply_failed');
        }
    }

    /**
     * Pushes a target around.
     *
     * `Entity.applyKnockback` takes a horizontal `VectorXZ` whose magnitude is
     * the force, plus a separate vertical strength — the 2.x signature, not the
     * four-argument 1.x form. Both components are clamped by config so a
     * mis-authored definition cannot fling a player out of the world.
     *
     * @param {Entity} target
     * @param {KnockbackSpec} spec
     * @param {Vec3Like} [defaultFrom] Used when the spec gives neither `from` nor `direction`.
     * @returns {boolean} True when a push was actually applied.
     */
    knockback(target, spec, defaultFrom) {
        if (target === undefined || target === null) return false;
        try {
            if (!target.isValid) return false;
        } catch {
            return false;
        }

        const limits = this.config.combat;
        const horizontalForce = clamp(
            Number.isFinite(spec.horizontal) ? /** @type {number} */ (spec.horizontal) : 0,
            0,
            limits.maxKnockbackHorizontal,
        );
        const verticalForce = clamp(
            Number.isFinite(spec.vertical) ? /** @type {number} */ (spec.vertical) : 0,
            -limits.maxKnockbackVertical,
            limits.maxKnockbackVertical,
        );
        if (horizontalForce === 0 && verticalForce === 0) return false;

        let direction = spec.direction;
        if (direction === undefined) {
            const from = spec.from ?? defaultFrom;
            if (from === undefined) return false;
            direction = Vec3.subtract(target.location, from);
        }
        // `forward` with no explicit vector is a definition bug; falling back to
        // radial keeps the ability working rather than silently doing nothing.
        if (!Vec3.isFinite3(direction)) return false;
        if (spec.pull === true) direction = Vec3.scale(direction, -1);

        const horizontal = Vec3.horizontalForce(direction, horizontalForce);
        if (horizontal.x === 0 && horizontal.z === 0 && verticalForce === 0) return false;

        try {
            target.applyKnockback(horizontal, verticalForce);
            return true;
        } catch (error) {
            this.log.debug('damage.knockback skipped:', error);
            return false;
        }
    }
}
