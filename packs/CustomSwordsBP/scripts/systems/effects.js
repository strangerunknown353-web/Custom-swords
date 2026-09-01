/**
 * Status-effect application.
 *
 * Wraps `Entity.addEffect` so that durations are expressed in ticks everywhere
 * in the framework (the engine also takes ticks) and so a removed entity never
 * throws out of an ability.
 */

/** @typedef {import('@minecraft/server').Entity} Entity */
/** @typedef {import('../util/vec3.js').Vec3} Vec3 */

/**
 * @typedef {Object} EffectSpec
 * @property {string} effect Effect type id, e.g. `speed` or `minecraft:speed`.
 * @property {number} durationTicks
 * @property {number} [amplifier] 0-based, like the engine. Defaults to 0.
 * @property {boolean} [showParticles] Defaults to true.
 */

export class EffectService {
    /**
     * @param {typeof import('../core/log.js').log} log
     */
    constructor(log) {
        /** @private @readonly */
        this.log = log;
    }

    /**
     * @param {Entity} target
     * @param {EffectSpec} spec
     * @returns {boolean}
     */
    apply(target, spec) {
        if (target === undefined || !target.isValid) return false;
        if (!Number.isFinite(spec.durationTicks) || spec.durationTicks <= 0) return false;
        try {
            target.addEffect(spec.effect, Math.ceil(spec.durationTicks), {
                amplifier: spec.amplifier ?? 0,
                showParticles: spec.showParticles ?? true,
            });
            return true;
        } catch (error) {
            // Unknown effect ids and removed entities both land here.
            this.log.warn(`effects.apply failed for '${spec.effect}':`, error);
            return false;
        }
    }

    /**
     * @param {Entity[]} targets
     * @param {EffectSpec} spec
     * @returns {number} Number of targets the effect was applied to.
     */
    applyToAll(targets, spec) {
        let applied = 0;
        for (const target of targets) {
            if (this.apply(target, spec)) applied++;
        }
        return applied;
    }

    /**
     * @param {Entity} target
     * @param {readonly EffectSpec[]} specs
     * @returns {number}
     */
    applyMany(target, specs) {
        let applied = 0;
        for (const spec of specs) {
            if (this.apply(target, spec)) applied++;
        }
        return applied;
    }

    /**
     * Whether a target currently carries an effect.
     *
     * The read half of the effect system, and the primitive behind every
     * "conditional on what the target is already suffering" mechanic: Frost's
     * shatter bonus, its escalating frostbite, and anything later that wants to
     * reward setting a target up before hitting it.
     *
     * Never throws. `getEffect` raises on an unknown effect id and on an
     * invalidated entity handle, and this runs inside combat resolution where a
     * throw would abandon the remaining targets. An unreadable target is
     * reported as "not affected", which fails towards *not* granting a bonus.
     *
     * @param {Entity} target
     * @param {string} effectId Vanilla effect identifier, e.g. `slowness`.
     * @returns {boolean}
     */
    has(target, effectId) {
        if (target === undefined || target === null) return false;
        try {
            if (!target.isValid) return false;
            return target.getEffect(effectId) !== undefined;
        } catch (error) {
            this.log.debug('effects.has failed:', error);
            return false;
        }
    }

    /**
     * The remaining duration of an effect in ticks, or 0 when absent.
     *
     * @param {Entity} target
     * @param {string} effectId
     * @returns {number}
     */
    remaining(target, effectId) {
        if (target === undefined || target === null) return 0;
        try {
            if (!target.isValid) return 0;
            const effect = target.getEffect(effectId);
            const duration = effect?.duration;
            return typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0;
        } catch (error) {
            this.log.debug('effects.remaining failed:', error);
            return 0;
        }
    }

    /**
     * Restores health, clamped to the entity's maximum.
     *
     * Uses the health attribute component directly rather than an instant-health
     * effect, so the amount healed is exact and undead targets are not harmed by
     * accident.
     *
     * @param {Entity} target
     * @param {number} amount Hit points.
     * @returns {number} Health actually restored.
     */
    heal(target, amount) {
        if (target === undefined || !target.isValid) return 0;
        if (!Number.isFinite(amount) || amount <= 0) return 0;
        try {
            const health = target.getComponent('minecraft:health');
            if (health === undefined) return 0;
            const component = /** @type {import('@minecraft/server').EntityHealthComponent} */ (health);
            const before = component.currentValue;
            const capped = Math.min(before + amount, component.effectiveMax);
            if (capped <= before) return 0;
            component.setCurrentValue(capped);
            return capped - before;
        } catch (error) {
            this.log.debug('effects.heal skipped:', error);
            return 0;
        }
    }

    /**
     * Sets a target alight.
     *
     * @param {Entity} target
     * @param {number} seconds
     * @param {boolean} [useEffects] Play the vanilla ignition effects. Defaults to true.
     * @returns {boolean}
     */
    ignite(target, seconds, useEffects = true) {
        if (target === undefined || !target.isValid) return false;
        if (!Number.isFinite(seconds) || seconds <= 0) return false;
        try {
            return target.setOnFire(Math.ceil(seconds), useEffects);
        } catch (error) {
            this.log.debug('effects.ignite skipped:', error);
            return false;
        }
    }

    /**
     * @param {Entity} target
     * @returns {boolean}
     */
    extinguish(target) {
        if (target === undefined || !target.isValid) return false;
        try {
            return target.extinguishFire(true);
        } catch (error) {
            this.log.debug('effects.extinguish skipped:', error);
            return false;
        }
    }

    /**
     * Moves an entity. `checkForBlocks` defaults to true so an ability can never
     * teleport a target inside terrain.
     *
     * @param {Entity} target
     * @param {Vec3} location
     * @param {{ checkForBlocks?: boolean, keepVelocity?: boolean, facingLocation?: Vec3 }} [options]
     * @returns {boolean}
     */
    teleport(target, location, options = {}) {
        if (target === undefined || !target.isValid) return false;
        if (!Number.isFinite(location?.x) || !Number.isFinite(location?.y) || !Number.isFinite(location?.z)) {
            this.log.warn('effects.teleport refused a non-finite destination.');
            return false;
        }
        try {
            target.teleport(location, {
                checkForBlocks: options.checkForBlocks ?? true,
                keepVelocity: options.keepVelocity ?? false,
                ...(options.facingLocation === undefined ? {} : { facingLocation: options.facingLocation }),
            });
            return true;
        } catch (error) {
            this.log.debug('effects.teleport skipped:', error);
            return false;
        }
    }

    /**
     * Pushes an entity along a vector.
     *
     * `Entity.applyImpulse` throws when called on a Player — that is documented
     * engine behaviour, not a bug we can work around — so players are routed to
     * `applyKnockback` instead, which is the supported equivalent. Callers get
     * one method that works on anything.
     *
     * @param {Entity} target
     * @param {Vec3} vector
     * @returns {boolean}
     */
    impulse(target, vector) {
        if (target === undefined || !target.isValid) return false;
        if (!Number.isFinite(vector?.x) || !Number.isFinite(vector?.y) || !Number.isFinite(vector?.z)) return false;
        try {
            if (target.typeId === 'minecraft:player') {
                const horizontal = Math.hypot(vector.x, vector.z);
                /** @type {any} */ (target).applyKnockback({ x: vector.x, z: vector.z }, vector.y);
                return horizontal > 0 || vector.y !== 0;
            }
            target.applyImpulse(vector);
            return true;
        } catch (error) {
            this.log.debug('effects.impulse skipped:', error);
            return false;
        }
    }
}
