/**
 * FX — short particle animations that give every power a shape and a motion.
 *
 * The particle service draws one frame: a burst, a ring, a line. This layer
 * plays *sequences* of frames — a shockwave that grows outward, a slash that
 * sweeps across the wielder's front, a pulse that travels down a beam, an aura
 * that spirals up the body, a trail that follows a leap through the air.
 *
 * ## One recipe per shape, chosen automatically
 *
 * {@link FxService#forAbility} picks the animation from what the power *is*
 * — its targeting shape, whether it pulls or pushes, whether it moves the
 * wielder — and takes its colours from the binding's visual profile. All 121
 * powers in the collection are animated without one line of per-binding FX
 * authoring, and sword #21 is animated the moment it is defined.
 *
 * ## Cost
 *
 * Animations are chains of `system.runTimeout`, one per frame, never a
 * recurring interval: nothing runs while nobody is casting. Every animation
 * is short (at most ~20 frames, one second), and the number running at once
 * is capped by `config.fx.maxActiveAnimations`. Past the cap a new animation
 * plays only its first frame, so a crowded fight degrades to the pre-2.0
 * look instead of to a slower server. `config.fx.enabled` turns all of it off.
 *
 * FX are purely visual. They never damage, target or move anything, and a
 * failure inside one is swallowed: an animation can never break an ability.
 */

import { system } from '@minecraft/server';

import * as Vec3 from '../util/vec3.js';
import { rarityOf } from '../core/rarity.js';

/** @typedef {import('../util/vec3.js').Vec3} Vec3Like */
/** @typedef {import('../core/visual_profiles.js').VisualProfile} VisualProfile */

const TAU = Math.PI * 2;

/** Used when a binding has no profile. */
const NEUTRAL = Object.freeze({
    caster: 'minecraft:critical_hit_emitter',
    target: 'minecraft:evoker_spell',
    trail: 'minecraft:critical_hit_emitter',
    accent: 'minecraft:evoker_spell',
});

/** Abilities that move the wielder, and so get a trail rather than a cast. */
const MOVES_WIELDER = new Set(['custom_swords:blink', 'custom_swords:leap']);

export class FxService {
    /**
     * @param {typeof import('../config.js').CONFIG} config
     * @param {import('./particles.js').ParticleService} particles
     * @param {typeof import('../core/log.js').log} log
     * @param {{ schedule?: (callback: () => void, delayTicks: number) => unknown }} [options]
     */
    constructor(config, particles, log, options = {}) {
        /** @private @readonly */
        this.config = config;
        /** @private @readonly */
        this.particles = particles;
        /** @private @readonly */
        this.log = log;
        /** @private @readonly */
        this.schedule = options.schedule ?? ((callback, delay) => system.runTimeout(callback, delay));
        /** Animations currently playing. */
        this.active = 0;
    }

    // ------------------------------------------------------------------
    // Animation runner
    // ------------------------------------------------------------------

    /**
     * Plays `frames` frames, calling `draw(frame, t)` once per frame where `t`
     * runs 0 → 1. Frame 0 is drawn immediately, so the first frame lands on the
     * same tick as the cast that caused it.
     *
     * @param {number} frames
     * @param {(frame: number, t: number) => void} draw
     * @returns {boolean} Whether the full animation was scheduled.
     */
    animate(frames, draw) {
        if (!this.config.fx.enabled) return false;
        const total = Math.max(1, Math.min(Math.floor(frames), this.config.fx.maxFrames));
        const run = (frame) => {
            try {
                draw(frame, total === 1 ? 1 : frame / (total - 1));
            } catch (error) {
                this.log.debug('fx frame skipped:', error);
            }
        };

        run(0);
        if (total === 1) return true;
        if (this.active >= this.config.fx.maxActiveAnimations) return false;

        this.active++;
        const step = this.config.fx.frameTicks;
        const next = (frame) => {
            if (frame >= total) {
                this.active--;
                return;
            }
            try {
                this.schedule(() => {
                    run(frame);
                    next(frame + 1);
                }, step);
            } catch (error) {
                this.active--;
                this.log.debug('fx scheduling failed:', error);
            }
        };
        next(1);
        return true;
    }

    /**
     * Runs `callback` once, `ticks` from now, through the same scheduler the
     * animations use. Errors are swallowed.
     *
     * @param {() => void} callback
     * @param {number} ticks
     */
    later(callback, ticks) {
        try {
            this.schedule(() => {
                try {
                    callback();
                } catch (error) {
                    this.log.debug('fx.later callback failed:', error);
                }
            }, Math.max(1, Math.ceil(ticks)));
        } catch (error) {
            this.log.debug('fx.later scheduling failed:', error);
        }
    }

    /**
     * A small sparkle ring around the wielder: "this power is ready again".
     *
     * @param {import('@minecraft/server').Player} player
     * @param {VisualProfile | undefined} profile
     */
    ready(player, profile) {
        if (!this.config.fx.enabled) return;
        const at = safeLocation(player);
        if (at === undefined) return;
        const look = profile ?? NEUTRAL;
        try {
            this.particles.ring(player.dimension, { id: look.accent ?? look.trail }, { x: at.x, y: at.y + 1, z: at.z }, 0.6, 8);
        } catch (error) {
            this.log.debug('fx.ready skipped:', error);
        }
    }

    // ------------------------------------------------------------------
    // Recipes
    // ------------------------------------------------------------------

    /**
     * A ring that grows (or, with `inward`, collapses) over time, with a
     * second, fainter ring trailing it.
     *
     * @param {any} dimension
     * @param {VisualProfile} look
     * @param {Vec3Like} center
     * @param {number} radius
     * @param {{ inward?: boolean, frames?: number, points?: number }} [options]
     */
    shockwave(dimension, look, center, radius, options = {}) {
        const frames = options.frames ?? 7;
        const points = options.points ?? 24;
        const base = { x: center.x, y: center.y + 0.15, z: center.z };
        return this.animate(frames, (frame, t) => {
            const progress = options.inward ? 1 - t : t;
            const r = Math.max(0.3, radius * easeOut(progress));
            // Each frame turns a little, so the wave swirls instead of spoking.
            const phase = (frame * Math.PI) / points;
            this.particles.ring(dimension, { id: look.trail }, base, r, points, phase);
            if (r > 1) {
                const inner = { x: base.x, y: base.y + 0.35, z: base.z };
                this.particles.ring(dimension, { id: look.accent }, inner, r * 0.6, Math.ceil(points / 3), -phase * 2);
            }
        });
    }

    /**
     * A crescent sweeping across the wielder's front, left to right.
     *
     * @param {any} dimension
     * @param {VisualProfile} look
     * @param {Vec3Like} origin Chest height.
     * @param {Vec3Like} direction
     * @param {number} radius
     * @param {number} angleDegrees
     */
    slash(dimension, look, origin, direction, radius, angleDegrees) {
        const yaw = Math.atan2(direction.z, direction.x);
        const half = ((Math.min(angleDegrees, 180) * Math.PI) / 180) / 2;
        const frames = 5;
        const perFrame = 7;
        return this.animate(frames, (frame) => {
            const from = -half + (2 * half * frame) / frames;
            const to = -half + (2 * half * (frame + 1)) / frames;
            for (let i = 0; i < perFrame; i++) {
                const a = yaw + from + ((to - from) * i) / perFrame;
                // Two layers: the blade edge at full reach, a wake behind it.
                for (const [reach, id] of [
                    [radius, look.trail],
                    [radius * 0.65, look.accent],
                ]) {
                    const lift = Math.sin(((a - yaw + half) / (2 * half || 1)) * Math.PI) * 0.4;
                    this.dot(dimension, id, {
                        x: origin.x + Math.cos(a) * reach,
                        y: origin.y - 0.3 + lift,
                        z: origin.z + Math.sin(a) * reach,
                    });
                }
            }
        });
    }

    /**
     * A bright pulse travelling from `from` to `to`, leaving a faint line.
     *
     * @param {any} dimension
     * @param {VisualProfile} look
     * @param {Vec3Like} from
     * @param {Vec3Like} to
     */
    pulse(dimension, look, from, to) {
        const frames = 6;
        const span = Vec3.subtract(to, from);
        this.particles.line(dimension, { id: look.trail }, from, to, Math.min(24, Math.ceil(Vec3.length(span) * 1.5)));
        return this.animate(frames, (_frame, t) => {
            const head = Vec3.add(from, Vec3.scale(span, t));
            this.particles.emit(dimension, { id: look.accent, count: 3, spread: 0.15 }, head);
            if (t === 1) this.burst(dimension, look.target, head, 0.8, 10);
        });
    }

    /**
     * Two strands spiralling up around an entity.
     *
     * @param {any} dimension
     * @param {VisualProfile} look
     * @param {import('@minecraft/server').Entity} entity
     */
    helix(dimension, look, entity) {
        const frames = 12;
        const height = 2.2;
        const radius = 0.8;
        return this.animate(frames, (frame, t) => {
            const at = safeLocation(entity);
            if (at === undefined) return;
            for (let strand = 0; strand < 2; strand++) {
                for (let k = 0; k < 2; k++) {
                    const u = (frame * 2 + k) / (frames * 2);
                    const a = u * TAU * 2 + strand * Math.PI;
                    this.dot(dimension, strand === 0 ? look.trail : look.accent, {
                        x: at.x + Math.cos(a) * radius,
                        y: at.y + u * height,
                        z: at.z + Math.sin(a) * radius,
                    });
                }
            }
            if (t === 1) this.burst(dimension, look.accent, { x: at.x, y: at.y + height, z: at.z }, 0.5, 8);
        });
    }

    /**
     * A column of light rising from a point, with a ring collapsing into it.
     *
     * @param {any} dimension
     * @param {VisualProfile} look
     * @param {Vec3Like} base
     * @param {number} radius
     */
    pillar(dimension, look, base, radius) {
        const frames = 8;
        const height = 4;
        this.shockwave(dimension, look, base, radius, { inward: true, frames: 6, points: 20 });
        return this.animate(frames, (_frame, t) => {
            const y = base.y + height * easeOut(t);
            this.particles.emit(dimension, { id: look.trail, count: 4, spread: 0.25 }, { x: base.x, y, z: base.z });
            this.particles.emit(dimension, { id: look.accent, count: 2, spread: 0.5 }, { x: base.x, y: y - 0.5, z: base.z });
        });
    }

    /**
     * Particles left behind an entity as it moves — a leap's arc, a dash.
     *
     * @param {any} dimension
     * @param {VisualProfile} look
     * @param {import('@minecraft/server').Entity} entity
     * @param {number} frames
     */
    follow(dimension, look, entity, frames) {
        return this.animate(frames, (frame) => {
            const at = safeLocation(entity);
            if (at === undefined) return;
            this.particles.emit(dimension, { id: look.trail, count: 3, spread: 0.3 }, { x: at.x, y: at.y + 0.6, z: at.z });
            if (frame % 3 === 0) this.particles.emit(dimension, { id: look.accent, count: 2, spread: 0.4 }, at);
        });
    }

    /**
     * Energy drawn into the hand: a small ring shrinking onto the wielder's
     * chest over three frames.
     *
     * @param {any} dimension
     * @param {VisualProfile} look
     * @param {Vec3Like} chest
     */
    charge(dimension, look, chest) {
        return this.animate(3, (_frame, t) => {
            this.particles.ring(dimension, { id: look.caster }, chest, 1.4 * (1 - t) + 0.2, 10);
        });
    }

    /**
     * A sphere of points, drawn in one frame (Fibonacci lattice, so it is even
     * at any count).
     *
     * @param {any} dimension
     * @param {string} id
     * @param {Vec3Like} center
     * @param {number} radius
     * @param {number} points
     */
    burst(dimension, id, center, radius, points) {
        const n = Math.max(1, Math.min(points, this.config.particles.maxPerEmit));
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < n; i++) {
            const y = 1 - (2 * (i + 0.5)) / n;
            const r = Math.sqrt(1 - y * y);
            const a = golden * i;
            this.dot(dimension, id, {
                x: center.x + Math.cos(a) * r * radius,
                y: center.y + y * radius,
                z: center.z + Math.sin(a) * r * radius,
            });
        }
    }

    // ------------------------------------------------------------------
    // What to play for a given power
    // ------------------------------------------------------------------

    /**
     * Plays the animation for a power that just succeeded.
     *
     * @param {import('../core/types.js').AbilityContext} ctx
     */
    forAbility(ctx) {
        if (!this.config.fx.enabled) return;
        try {
            if (ctx.activation === 'attack' || ctx.activation === 'sneak_attack') {
                this.onHit(ctx);
            } else {
                this.onCast(ctx);
            }
        } catch (error) {
            this.log.debug('fx.forAbility skipped:', error);
        }
    }

    /**
     * @private
     * @param {import('../core/types.js').AbilityContext} ctx
     */
    onCast(ctx) {
        const look = lookOf(ctx);
        const { dimension, player, targeting } = ctx;
        const feet = safeLocation(player);
        if (feet === undefined) return;
        const chest = { x: feet.x, y: feet.y + 1.1, z: feet.z };
        const abilityId = ctx.binding.abilityId;
        const range = targeting.range ?? 4;

        if (MOVES_WIELDER.has(abilityId)) {
            this.follow(dimension, look, player, abilityId === 'custom_swords:leap' ? 16 : 8);
            this.shockwave(dimension, look, feet, 1.8, { frames: 4, points: 14 });
            return;
        }

        this.charge(dimension, look, chest);

        // Legendary and Mythic powers announce themselves: a crown of the
        // sword's colour bursting above the wielder's head.
        if ((rarityOf(ctx.sword.rarity)?.order ?? 0) >= 4) {
            const crown = { x: feet.x, y: feet.y + 2.4, z: feet.z };
            this.burst(dimension, look.caster, crown, 0.6, 12);
            this.particles.ring(dimension, { id: look.accent }, crown, 1.1, 12);
        }

        switch (targeting.type) {
            case 'self':
                this.helix(dimension, look, player);
                this.shockwave(dimension, look, feet, 1.5, { frames: 5, points: 16 });
                return;
            case 'cone':
                this.slash(dimension, look, ctx.origin, ctx.viewDirection, Math.min(range, 6), targeting.angleDegrees ?? 90);
                return;
            case 'ray':
            case 'single': {
                const end = Vec3.project(ctx.origin, ctx.viewDirection, Math.min(range, 24));
                this.pulse(dimension, look, ctx.origin, end);
                return;
            }
            case 'point': {
                const point = ctx.services.targeting.resolvePoint(ctx, range);
                this.pillar(dimension, look, point, Number(ctx.params.radius) || 3);
                return;
            }
            case 'area':
            default: {
                const inward = ctx.knockback?.pull === true;
                this.shockwave(dimension, look, feet, Math.min(range, 10), { inward });
                // A second, later wave for the big ones.
                if (!inward && range >= 6) {
                    this.shockwave(dimension, look, feet, range * 0.7, { frames: 9, points: 18 });
                }
                this.burst(dimension, look.accent, chest, 1.2, 14);
            }
        }
    }

    /**
     * A quick spark on whatever a passive just struck.
     *
     * @private
     * @param {import('../core/types.js').AbilityContext} ctx
     */
    onHit(ctx) {
        const at = ctx.target === undefined ? undefined : safeLocation(ctx.target);
        if (at === undefined) return;
        const look = lookOf(ctx);
        this.burst(ctx.dimension, look.accent, { x: at.x, y: at.y + 1, z: at.z }, 0.6, 8);
    }

    /**
     * The flourish when the wielder switches ability: a ring of the new
     * power's colour around them.
     *
     * @param {import('@minecraft/server').Player} player
     * @param {VisualProfile | undefined} profile
     */
    abilitySwitched(player, profile) {
        if (!this.config.fx.enabled) return;
        try {
            const at = safeLocation(player);
            if (at === undefined) return;
            const look = profile ?? NEUTRAL;
            const dimension = player.dimension;
            this.animate(4, (_frame, t) => {
                this.particles.ring(dimension, { id: look.accent ?? look.trail }, { x: at.x, y: at.y + 0.2 + t * 1.6, z: at.z }, 0.7, 10);
            });
        } catch (error) {
            this.log.debug('fx.abilitySwitched skipped:', error);
        }
    }

    // ------------------------------------------------------------------

    /**
     * @private
     * @param {any} dimension
     * @param {string} id
     * @param {Vec3Like} point
     */
    dot(dimension, id, point) {
        this.particles.emit(dimension, { id, count: 1 }, point);
    }
}

/**
 * @param {import('../core/types.js').AbilityContext} ctx
 * @returns {VisualProfile}
 */
function lookOf(ctx) {
    const profile = ctx.visual;
    if (profile === undefined) return /** @type {any} */ (NEUTRAL);
    return /** @type {any} */ ({ ...NEUTRAL, ...profile, accent: profile.accent ?? profile.trail });
}

/** @param {number} t */
function easeOut(t) {
    return 1 - (1 - t) * (1 - t);
}

/**
 * @param {import('@minecraft/server').Entity | undefined} entity
 * @returns {Vec3Like | undefined}
 */
function safeLocation(entity) {
    try {
        if (entity === undefined || !entity.isValid) return undefined;
        const { x, y, z } = entity.location;
        return { x, y, z };
    } catch {
        return undefined;
    }
}
