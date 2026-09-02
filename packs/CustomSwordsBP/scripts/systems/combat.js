/**
 * The Combat System — the one place an ability turns intent into consequences.
 *
 * Nearly every sword ability ends the same way: find targets, check they are
 * legal, hurt them, push them, apply effects, draw particles, play a sound.
 * Written per ability that block drifts; written once it stays consistent, and
 * every safety rule applies to sword #26 automatically.
 *
 * An ability decides *who* and *how hard*. This decides *what actually
 * happens*, and owns the ordering:
 *
 *   validate → damage → target particles → impact sound → effects → ignite →
 *   knockback
 *
 * Damage lands before knockback so a dying target is not pointlessly launched,
 * and particles are drawn at the target's position before it is moved.
 *
 * ## Hit protection
 *
 * Two layers, because they solve different problems:
 *
 *  - **Per execution (always on).** A `Set` of entity ids scoped to one
 *    `strike` call. A target appearing twice in a target list — which happens
 *    when an ability combines a raycast with an area sweep — is damaged once.
 *    Costs one `Set` per activation and nothing between activations.
 *  - **Per player, across executions (configurable).** After a hit, that
 *    attacker cannot damage that target again for
 *    `config.combat.hitProtectionTicks`. This is what stops a held right-click
 *    from grinding a mob down at 20 hits a second. It reuses the existing
 *    `CooldownManager` under a `hit:` key namespace, so it inherits the
 *    per-player isolation, lazy expiry and sweeping already proven there — no
 *    new subsystem, and no tick loop.
 *
 * All state is either execution-local or keyed by `player.id`. Nothing is
 * shared between players, and no "current attacker" or "current target" is ever
 * stored on the service.
 */

/** @typedef {import('@minecraft/server').Entity} Entity */
/** @typedef {import('../core/types.js').AbilityContext} AbilityContext */
/** @typedef {import('./damage.js').KnockbackSpec} KnockbackSpec */

/**
 * @typedef {Object} StrikeSpec
 * @property {number} [damage] Hit points before the global multiplier.
 * @property {string} [damageCause] An `EntityDamageCause` value. Defaults to `entityAttack`.
 * @property {KnockbackSpec} [knockback] Push applied to each target.
 * @property {number} [igniteSeconds] Sets each target alight.
 * @property {import('../util/vec3.js').Vec3} [origin] Knockback origin and cast anchor. Defaults to the caster's feet.
 * @property {(target: Entity, index: number) => number} [damageScale]
 *   Optional per-target multiplier, for falloff or conditional bonuses. Returning
 *   0 skips damage for that target without skipping its effects.
 * @property {boolean} [applyBindingEffects] Apply `ctx.effects`. Defaults to true.
 * @property {boolean} [applyBindingParticles] Draw `ctx.particles` marked `at: 'target'`. Defaults to true.
 * @property {boolean} [playImpactSound] Play `ctx.sounds.impact` at each target. Defaults to true.
 * @property {boolean} [allowSelf] Permit hitting the caster. Defaults to false.
 * @property {boolean} [ignoreHitProtection] Bypass the cross-execution window. Defaults to false.
 */

/**
 * @typedef {Object} StrikeReport
 * @property {number} considered Targets handed in.
 * @property {number} damaged Targets that actually took damage.
 * @property {number} knockedBack
 * @property {number} effectsApplied
 * @property {number} ignited
 * @property {number} totalDamage Hit points dealt in total.
 * @property {Record<string, number>} refusals Refusal reason -> count, for diagnostics.
 */

/** Key namespace for per-target hit protection inside the cooldown store. */
const HIT_KEY_PREFIX = 'hit:';

export class CombatSystem {
    /**
     * @param {object} deps
     * @param {typeof import('../config.js').CONFIG} deps.config
     * @param {import('./damage.js').DamageService} deps.damage
     * @param {import('./effects.js').EffectService} deps.effects
     * @param {import('./particles.js').ParticleService} deps.particles
     * @param {import('./sounds.js').SoundService} deps.sounds
     * @param {import('../core/cooldown_manager.js').CooldownManager} deps.cooldowns
     */
    constructor({ config, damage, effects, particles, sounds, cooldowns }) {
        /** @private @readonly */
        this.config = config;
        /** @private @readonly */
        this.damage = damage;
        /** @private @readonly */
        this.effects = effects;
        /** @private @readonly */
        this.particles = particles;
        /** @private @readonly */
        this.sounds = sounds;
        /** @private @readonly */
        this.cooldowns = cooldowns;
    }

    /**
     * Draws the binding's caster-side particles and plays its cast sound.
     *
     * Called at the moment of activation, whether or not anything is hit, so
     * the player always gets confirmation that their input registered.
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

    /**
     * Applies an offensive outcome to a set of targets.
     *
     * @param {AbilityContext} ctx
     * @param {readonly Entity[]} targets
     * @param {StrikeSpec} [spec]
     * @returns {StrikeReport}
     */
    strike(ctx, targets, spec = {}) {
        const origin = spec.origin ?? ctx.player.location;
        /** @type {StrikeReport} */
        const report = {
            considered: targets.length,
            damaged: 0,
            knockedBack: 0,
            effectsApplied: 0,
            ignited: 0,
            totalDamage: 0,
            refusals: {},
        };

        // Execution-scoped, so it cannot leak between activations or players.
        /** @type {Set<string>} */
        const struck = new Set();
        let index = -1;

        for (const target of targets) {
            index++;
            const id = this.identify(target);
            if (id === undefined) {
                this.countRefusal(report, 'invalid_target');
                continue;
            }
            if (struck.has(id)) {
                this.countRefusal(report, 'duplicate_in_execution');
                continue;
            }
            if (!spec.ignoreHitProtection && this.isProtected(ctx.playerId, id)) {
                this.countRefusal(report, 'hit_protected');
                continue;
            }
            struck.add(id);

            const scale = spec.damageScale === undefined ? 1 : spec.damageScale(target, index);
            const requested = (spec.damage ?? 0) * (Number.isFinite(scale) ? scale : 0);

            let didDamage = false;
            if (requested > 0) {
                const result = this.damage.apply(ctx, target, requested, {
                    cause: spec.damageCause,
                    allowSelf: spec.allowSelf,
                    allowedCategories: ctx.allowedTargets,
                });
                if (result.ok) {
                    report.damaged++;
                    report.totalDamage += result.amount;
                    didDamage = true;
                } else {
                    this.countRefusal(report, result.reason ?? 'refused');
                    // A target we may not damage must not receive the rest of
                    // the outcome either — that would be a filter bypass.
                    if (result.reason === 'target_not_permitted' || result.reason === 'invalid_target') continue;
                }
            }

            // Particles and sound at the target's current position, before any
            // knockback moves it out from under them.
            //
            // Read once, and guarded, because the damage above may have just
            // killed this target: `Entity.location` throws on a handle the
            // engine has already released, and a throw here escapes `strike`
            // entirely, abandoning every target still in the list. Drawing the
            // blow that killed something is the most common moment in the game,
            // so this is the worst possible place to read bare.
            const at = this.positionOf(target);
            if (at !== undefined) {
                if (spec.applyBindingParticles !== false) {
                    for (const particle of ctx.particles) {
                        if (particle.at === 'target') this.particles.emit(ctx.dimension, particle, at);
                    }
                }
                if (spec.playImpactSound !== false && ctx.sounds.impact !== undefined) {
                    this.sounds.playAt(ctx.dimension, ctx.sounds.impact, at);
                }
            }

            if (spec.applyBindingEffects !== false && ctx.effects.length > 0) {
                report.effectsApplied += this.effects.applyMany(target, ctx.effects);
            }
            if ((spec.igniteSeconds ?? 0) > 0 && this.effects.ignite(target, /** @type {number} */ (spec.igniteSeconds))) {
                report.ignited++;
            }
            if (spec.knockback !== undefined && this.damage.knockback(target, this.resolveKnockback(ctx, spec.knockback), origin)) {
                report.knockedBack++;
            }

            if (didDamage) this.protect(ctx.playerId, id);
        }

        return report;
    }

    /**
     * Convenience for single-target abilities: strike exactly one entity.
     *
     * @param {AbilityContext} ctx
     * @param {Entity | undefined} target
     * @param {StrikeSpec} [spec]
     * @returns {StrikeReport}
     */
    strikeOne(ctx, target, spec = {}) {
        return this.strike(ctx, target === undefined ? [] : [target], spec);
    }

    /**
     * Resolves a binding's knockback into a concrete spec.
     *
     * `mode: 'forward'` means "along the caster's view", which only the runtime
     * knows — so the binding declares the intent and this fills in the vector.
     * Everything else passes through untouched.
     *
     * @private
     * @param {AbilityContext} ctx
     * @param {KnockbackSpec} spec
     * @returns {KnockbackSpec}
     */
    resolveKnockback(ctx, spec) {
        if (spec.mode !== 'forward' || spec.direction !== undefined) return spec;
        return { ...spec, direction: ctx.viewDirection };
    }

    /**
     * An entity's position, or `undefined` when the handle can no longer be
     * read — which is what a target that died a moment ago looks like.
     *
     * The systems-layer twin of `abilities/support.js`'s `locationOf`. They are
     * deliberately not shared: `abilities/` sits above `systems/` in the
     * dependency order, and inverting that arrow to save six lines would cost
     * the layering rule `tools/validate.mjs` enforces.
     *
     * @private
     * @param {Entity} entity
     * @returns {import('../util/vec3.js').Vec3 | undefined}
     */
    positionOf(entity) {
        try {
            const { x, y, z } = entity.location;
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
            return { x, y, z };
        } catch {
            return undefined;
        }
    }

    /**
     * Reads an entity's id, treating a handle that throws as gone.
     *
     * @private
     * @param {Entity | undefined | null} entity
     * @returns {string | undefined}
     */
    identify(entity) {
        if (entity === undefined || entity === null) return undefined;
        try {
            return entity.isValid ? entity.id : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * @private
     * @param {StrikeReport} report
     * @param {string} reason
     */
    countRefusal(report, reason) {
        report.refusals[reason] = (report.refusals[reason] ?? 0) + 1;
    }

    /**
     * @private
     * @param {string} playerId
     * @param {string} targetId
     * @returns {boolean}
     */
    isProtected(playerId, targetId) {
        if (this.config.combat.hitProtectionTicks <= 0) return false;
        return !this.cooldowns.isReady(playerId, `${HIT_KEY_PREFIX}${targetId}`);
    }

    /**
     * @private
     * @param {string} playerId
     * @param {string} targetId
     */
    protect(playerId, targetId) {
        const ticks = this.config.combat.hitProtectionTicks;
        if (ticks <= 0) return;
        this.cooldowns.start(playerId, `${HIT_KEY_PREFIX}${targetId}`, ticks);
    }
}
