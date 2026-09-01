/**
 * Particle emission.
 *
 * Two jobs: give sword definitions a compact declarative shape for visuals, and
 * enforce a hard particle budget. A single mis-authored ability spawning
 * thousands of particles is one of the easiest ways to make an addon unplayable
 * on low-end devices, so the ceiling lives here rather than in each ability.
 *
 * Only vanilla particle identifiers are used by the foundation build; custom
 * particle JSON is a resource-pack addition planned for a later milestone
 * (see ROADMAP.md).
 */

import { MolangVariableMap } from '@minecraft/server';
import * as Vec3 from '../util/vec3.js';
import { clamp, randomFloat } from '../util/mathx.js';

/** @typedef {import('@minecraft/server').Dimension} Dimension */
/** @typedef {import('../util/vec3.js').Vec3} Vec3Like */

/**
 * @typedef {Object} ParticleSpec
 * @property {string} id Particle identifier, e.g. `minecraft:basic_flame_particle`.
 * @property {number} [count] How many to spawn. Defaults to 1, clamped by config.
 * @property {number} [spread] Random offset radius in blocks. Defaults to 0.
 * @property {{ r: number, g: number, b: number, a?: number }} [color] Sets the `variable.color` Molang variable.
 */

export class ParticleService {
    /**
     * @param {typeof import('../config.js').CONFIG} config
     * @param {typeof import('../core/log.js').log} log
     */
    constructor(config, log) {
        /** @private @readonly */
        this.config = config;
        /** @private @readonly */
        this.log = log;
    }

    /**
     * @param {Dimension} dimension
     * @param {ParticleSpec} spec
     * @param {Vec3Like} location
     * @returns {number} Number of particles actually spawned.
     */
    emit(dimension, spec, location) {
        const count = clamp(Math.floor(spec.count ?? 1), 0, this.config.particles.maxPerEmit);
        if (count === 0) return 0;
        if (!Vec3.isFinite3(location)) {
            this.log.warn(`particles.emit refused a non-finite location for '${spec.id}'.`);
            return 0;
        }

        const molang = this.buildMolang(spec);
        const spread = Math.max(0, spec.spread ?? 0);
        let spawned = 0;

        for (let i = 0; i < count; i++) {
            const point =
                spread === 0
                    ? location
                    : {
                          x: location.x + randomFloat(-spread, spread),
                          y: location.y + randomFloat(-spread, spread),
                          z: location.z + randomFloat(-spread, spread),
                      };
            try {
                dimension.spawnParticle(spec.id, point, molang);
                spawned++;
            } catch (error) {
                // An unknown particle id or an unloaded chunk. Report once, then
                // stop trying rather than spamming the log `count` times.
                this.log.warn(`particles.emit failed for '${spec.id}':`, error);
                break;
            }
        }
        return spawned;
    }

    /**
     * Draws a ring of particles on the horizontal plane. Common enough across
     * area abilities (shockwave, earthquake, nova) to belong in the service.
     *
     * @param {Dimension} dimension
     * @param {ParticleSpec} spec
     * @param {Vec3Like} center
     * @param {number} radius
     * @param {number} points
     * @returns {number}
     */
    ring(dimension, spec, center, radius, points) {
        const total = clamp(Math.floor(points), 0, this.config.particles.maxPerEmit);
        if (total === 0 || radius <= 0) return 0;
        const molang = this.buildMolang(spec);
        let spawned = 0;
        for (let i = 0; i < total; i++) {
            const angle = (i / total) * Math.PI * 2;
            const point = {
                x: center.x + Math.cos(angle) * radius,
                y: center.y,
                z: center.z + Math.sin(angle) * radius,
            };
            try {
                dimension.spawnParticle(spec.id, point, molang);
                spawned++;
            } catch (error) {
                this.log.warn(`particles.ring failed for '${spec.id}':`, error);
                break;
            }
        }
        return spawned;
    }

    /**
     * @private
     * @param {ParticleSpec} spec
     * @returns {MolangVariableMap | undefined}
     */
    buildMolang(spec) {
        if (spec.color === undefined) return undefined;
        try {
            const molang = new MolangVariableMap();
            molang.setColorRGBA('variable.color', {
                red: spec.color.r,
                green: spec.color.g,
                blue: spec.color.b,
                alpha: spec.color.a ?? 1,
            });
            return molang;
        } catch (error) {
            this.log.debug('particles.buildMolang failed:', error);
            return undefined;
        }
    }
}
