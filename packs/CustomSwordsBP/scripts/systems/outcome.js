/**
 * Outcome composition: "do the usual things to these targets".
 *
 * Nearly every sword ability ends with the same block — damage each target,
 * knock it back, apply the binding's status effects, spray the binding's
 * particles, play the binding's impact sound. Retyping that in twenty-five
 * abilities is how per-sword drift and per-sword bugs get in.
 *
 * `applyToTargets` performs that block once, driven entirely by the binding's
 * declarative envelope plus a small per-call spec. An ability decides *who* to
 * hit and *how hard*; this decides *what happens* to them, consistently.
 *
 * The service owns the ordering too: damage lands before knockback, so a target
 * that dies is not pointlessly launched, and particles are drawn at the target's
 * position before it is moved.
 */

/** @typedef {import('@minecraft/server').Entity} Entity */
/** @typedef {import('../core/types.js').AbilityContext} AbilityContext */

/**
 * @typedef {Object} OutcomeSpec
 * @property {number} [damage] Hit points before the global multiplier.
 * @property {string} [damageCause] An `EntityDamageCause` value. Defaults to `entityAttack`.
 * @property {number} [knockback] Horizontal force, away from `origin`.
 * @property {number} [lift] Vertical knockback strength.
 * @property {number} [igniteSeconds] Sets each target alight.
 * @property {import('../util/vec3.js').Vec3} [origin] Knockback origin. Defaults to the caster's feet.
 * @property {boolean} [applyBindingEffects] Apply `ctx.effects` to each target. Defaults to true.
 * @property {boolean} [applyBindingParticles] Draw `ctx.particles` marked `at: 'target'`. Defaults to true.
 * @property {boolean} [playImpactSound] Play `ctx.sounds.impact` at each target. Defaults to true.
 */

/**
 * @typedef {Object} OutcomeReport
 * @property {number} targets How many targets were considered.
 * @property {number} damaged How many actually took damage.
 * @property {number} knockedBack
 * @property {number} effectsApplied
 * @property {number} ignited
 */

export class OutcomeService {
    /**
     * @param {object} deps
     * @param {import('./damage.js').DamageService} deps.damage
     * @param {import('./effects.js').EffectService} deps.effects
     * @param {import('./particles.js').ParticleService} deps.particles
     * @param {import('./sounds.js').SoundService} deps.sounds
     */
    constructor({ damage, effects, particles, sounds }) {
        /** @private @readonly */
        this.damage = damage;
        /** @private @readonly */
        this.effects = effects;
        /** @private @readonly */
        this.particles = particles;
        /** @private @readonly */
        this.sounds = sounds;
    }

    /**
     * @param {AbilityContext} ctx
     * @param {readonly Entity[]} targets
     * @param {OutcomeSpec} [spec]
     * @returns {OutcomeReport}
     */
    applyToTargets(ctx, targets, spec = {}) {
        const origin = spec.origin ?? ctx.player.location;
        const report = { targets: targets.length, damaged: 0, knockedBack: 0, effectsApplied: 0, ignited: 0 };

        for (const target of targets) {
            // Damage first: a target that dies here should not also be launched.
            if (spec.damage !== undefined && spec.damage > 0) {
                if (this.damage.apply(ctx, target, spec.damage, { cause: spec.damageCause })) report.damaged++;
            }

            // Particles and sound at the target's current position, before any
            // knockback moves it out from under them.
            if (spec.applyBindingParticles !== false) {
                for (const particle of ctx.particles) {
                    if (particle.at === 'target') this.particles.emit(ctx.dimension, particle, target.location);
                }
            }
            if (spec.playImpactSound !== false && ctx.sounds.impact !== undefined) {
                this.sounds.playAt(ctx.dimension, ctx.sounds.impact, target.location);
            }

            if (spec.applyBindingEffects !== false && ctx.effects.length > 0) {
                report.effectsApplied += this.effects.applyMany(target, ctx.effects);
            }
            if (spec.igniteSeconds !== undefined && spec.igniteSeconds > 0) {
                if (this.effects.ignite(target, spec.igniteSeconds)) report.ignited++;
            }
            if ((spec.knockback ?? 0) > 0 || (spec.lift ?? 0) > 0) {
                if (this.damage.knockback(target, origin, spec.knockback ?? 0, spec.lift ?? 0)) report.knockedBack++;
            }
        }
        return report;
    }

    /**
     * Draws the binding's caster-side particles and plays its cast sound. The
     * other half of the pattern: every ability wants this at the moment of
     * activation, whether or not it finds a target.
     *
     * @param {AbilityContext} ctx
     * @param {import('../util/vec3.js').Vec3} [at] Defaults to the caster's feet.
     */
    playCast(ctx, at) {
        const origin = at ?? ctx.player.location;
        for (const particle of ctx.particles) {
            if ((particle.at ?? 'caster') === 'caster') this.particles.emit(ctx.dimension, particle, origin);
        }
        if (ctx.sounds.cast !== undefined) {
            this.sounds.playAt(ctx.dimension, ctx.sounds.cast, origin);
        }
    }
}
