/**
 * Status-effect application.
 *
 * Wraps `Entity.addEffect` so that durations are expressed in ticks everywhere
 * in the framework (the engine also takes ticks) and so a removed entity never
 * throws out of an ability.
 */

/** @typedef {import('@minecraft/server').Entity} Entity */

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
     * @param {EffectSpec[]} specs
     * @returns {number}
     */
    applyMany(target, specs) {
        let applied = 0;
        for (const spec of specs) {
            if (this.apply(target, spec)) applied++;
        }
        return applied;
    }
}
