/**
 * The outcome service performs the block every ability ends with. Its ordering
 * guarantees matter: damage before knockback, particles before the target is
 * moved.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDimension, MockEntity, MockPlayer } from '../mocks/minecraft_server.mjs';
import { OutcomeService } from '../../packs/CustomSwordsBP/scripts/systems/outcome.js';
import { DamageService } from '../../packs/CustomSwordsBP/scripts/systems/damage.js';
import { EffectService } from '../../packs/CustomSwordsBP/scripts/systems/effects.js';
import { ParticleService } from '../../packs/CustomSwordsBP/scripts/systems/particles.js';
import { SoundService } from '../../packs/CustomSwordsBP/scripts/systems/sounds.js';
import { TargetingService } from '../../packs/CustomSwordsBP/scripts/systems/targeting.js';
import { log } from '../../packs/CustomSwordsBP/scripts/core/log.js';
import { CONFIG } from '../../packs/CustomSwordsBP/scripts/config.js';

function setup({ effects = [], particles = [], sounds = {} } = {}) {
    const targeting = new TargetingService(CONFIG, log);
    const damage = new DamageService(CONFIG, targeting, log);
    const effectService = new EffectService(log);
    const particleService = new ParticleService(CONFIG, log);
    const soundService = new SoundService(log);
    const outcome = new OutcomeService({
        damage,
        effects: effectService,
        particles: particleService,
        sounds: soundService,
    });

    const dimension = new MockDimension();
    const player = new MockPlayer({ id: 'player-a', location: { x: 0, y: 64, z: 0 }, dimension });
    dimension.entities.push(player);

    const ctx = {
        player,
        playerId: player.id,
        dimension,
        origin: player.getHeadLocation(),
        viewDirection: { x: 0, y: 0, z: 1 },
        effects,
        particles,
        sounds,
        services: { log, config: CONFIG, targeting },
    };
    return { outcome, ctx, dimension, player };
}

/** @param {MockDimension} dimension @param {number} z */
function target(dimension, z = 3) {
    const entity = new MockEntity({ id: `mob-${z}`, location: { x: 0, y: 64, z }, dimension });
    dimension.entities.push(entity);
    return entity;
}

describe('OutcomeService.applyToTargets', () => {
    it('damages, knocks back and reports what landed', () => {
        const { outcome, ctx, dimension } = setup();
        const a = target(dimension, 2);
        const b = target(dimension, 3);

        const report = outcome.applyToTargets(ctx, [a, b], { damage: 5, knockback: 1, lift: 0.3 });

        assert.equal(report.targets, 2);
        assert.equal(report.damaged, 2);
        assert.equal(report.knockedBack, 2);
        assert.equal(a.damageTaken[0].amount, 5);
        assert.equal(a.knockbacks.length, 1);
    });

    it('applies the binding\'s effects to every target', () => {
        const { outcome, ctx, dimension } = setup({
            effects: [{ effect: 'slowness', durationTicks: 40 }],
        });
        const a = target(dimension);
        const report = outcome.applyToTargets(ctx, [a], { damage: 1 });
        assert.equal(report.effectsApplied, 1);
        assert.equal(a.effects[0].effect, 'slowness');
    });

    it('draws only target-scoped particles, at the target', () => {
        const { outcome, ctx, dimension } = setup({
            particles: [
                { id: 'at-caster', count: 1, at: 'caster' },
                { id: 'at-target', count: 1, at: 'target' },
            ],
        });
        const a = target(dimension, 4);
        outcome.applyToTargets(ctx, [a], {});

        const ids = dimension.particles.map((p) => p.id);
        assert.deepEqual(ids, ['at-target']);
        assert.equal(dimension.particles[0].location.z, 4);
    });

    it('plays the impact sound at each target', () => {
        const { outcome, ctx, dimension } = setup({ sounds: { impact: 'impact_light' } });
        outcome.applyToTargets(ctx, [target(dimension, 2), target(dimension, 3)], {});
        assert.equal(dimension.sounds.length, 2);
    });

    it('ignites when asked', () => {
        const { outcome, ctx, dimension } = setup();
        const a = target(dimension);
        const report = outcome.applyToTargets(ctx, [a], { igniteSeconds: 3 });
        assert.equal(report.ignited, 1);
        assert.equal(a.ignitions[0].seconds, 3);
    });

    it('honours the opt-outs', () => {
        const { outcome, ctx, dimension } = setup({
            effects: [{ effect: 'slowness', durationTicks: 40 }],
            particles: [{ id: 'p', count: 1, at: 'target' }],
            sounds: { impact: 'impact_light' },
        });
        const a = target(dimension);
        const report = outcome.applyToTargets(ctx, [a], {
            damage: 1,
            applyBindingEffects: false,
            applyBindingParticles: false,
            playImpactSound: false,
        });
        assert.equal(report.effectsApplied, 0);
        assert.equal(dimension.particles.length, 0);
        assert.equal(dimension.sounds.length, 0);
    });

    it('does nothing at all for an empty target list', () => {
        const { outcome, ctx, dimension } = setup({ sounds: { impact: 'impact_light' } });
        const report = outcome.applyToTargets(ctx, [], { damage: 5 });
        assert.deepEqual(report, { targets: 0, damaged: 0, knockedBack: 0, effectsApplied: 0, ignited: 0 });
        assert.equal(dimension.sounds.length, 0);
    });
});

describe('OutcomeService.playCast', () => {
    it('draws caster-scoped particles and the cast sound at the caster', () => {
        const { outcome, ctx, dimension } = setup({
            particles: [
                { id: 'at-caster', count: 1, at: 'caster' },
                { id: 'at-target', count: 1, at: 'target' },
            ],
            sounds: { cast: 'ability_cast', impact: 'impact_light' },
        });
        outcome.playCast(ctx);

        assert.deepEqual(dimension.particles.map((p) => p.id), ['at-caster']);
        assert.equal(dimension.sounds.length, 1);
    });

    it('treats a particle with no `at` as caster-scoped', () => {
        const { outcome, ctx, dimension } = setup({ particles: [{ id: 'p', count: 1 }] });
        outcome.playCast(ctx);
        assert.equal(dimension.particles.length, 1);
    });
});
