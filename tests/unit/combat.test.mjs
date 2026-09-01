/**
 * The outcome service performs the block every ability ends with. Its ordering
 * guarantees matter: damage before knockback, particles before the target is
 * moved.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDimension, MockEntity, MockPlayer } from '../mocks/minecraft_server.mjs';
import { CombatSystem } from '../../packs/CustomSwordsBP/scripts/systems/combat.js';
import { CooldownManager } from '../../packs/CustomSwordsBP/scripts/core/cooldown_manager.js';
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
    const cooldowns = new CooldownManager(() => 0);
    const combat = new CombatSystem({
        config: CONFIG,
        damage,
        effects: effectService,
        particles: particleService,
        sounds: soundService,
        cooldowns,
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
        allowedTargets: ['any'],
        services: { log, config: CONFIG, targeting },
    };
    return { combat, ctx, dimension, player, cooldowns };
}

/** @param {MockDimension} dimension @param {number} z */
function target(dimension, z = 3) {
    const entity = new MockEntity({ id: `mob-${z}`, location: { x: 0, y: 64, z }, dimension });
    dimension.entities.push(entity);
    return entity;
}

describe('CombatSystem.strike', () => {
    it('damages, knocks back and reports what landed', () => {
        const { combat, ctx, dimension } = setup();
        const a = target(dimension, 2);
        const b = target(dimension, 3);

        const report = combat.strike(ctx, [a, b], { damage: 5, knockback: { horizontal: 1, vertical: 0.3 } });

        assert.equal(report.considered, 2);
        assert.equal(report.damaged, 2);
        assert.equal(report.knockedBack, 2);
        assert.equal(a.damageTaken[0].amount, 5);
        assert.equal(a.knockbacks.length, 1);
    });

    it('applies the binding\'s effects to every target', () => {
        const { combat, ctx, dimension } = setup({
            effects: [{ effect: 'slowness', durationTicks: 40 }],
        });
        const a = target(dimension);
        const report = combat.strike(ctx, [a], { damage: 1 });
        assert.equal(report.effectsApplied, 1);
        assert.equal(a.effects[0].effect, 'slowness');
    });

    it('draws only target-scoped particles, at the target', () => {
        const { combat, ctx, dimension } = setup({
            particles: [
                { id: 'at-caster', count: 1, at: 'caster' },
                { id: 'at-target', count: 1, at: 'target' },
            ],
        });
        const a = target(dimension, 4);
        combat.strike(ctx, [a], {});

        const ids = dimension.particles.map((p) => p.id);
        assert.deepEqual(ids, ['at-target']);
        assert.equal(dimension.particles[0].location.z, 4);
    });

    it('plays the impact sound at each target', () => {
        const { combat, ctx, dimension } = setup({ sounds: { impact: 'impact_light' } });
        combat.strike(ctx, [target(dimension, 2), target(dimension, 3)], {});
        assert.equal(dimension.sounds.length, 2);
    });

    it('ignites when asked', () => {
        const { combat, ctx, dimension } = setup();
        const a = target(dimension);
        const report = combat.strike(ctx, [a], { igniteSeconds: 3 });
        assert.equal(report.ignited, 1);
        assert.equal(a.ignitions[0].seconds, 3);
    });

    it('honours the opt-outs', () => {
        const { combat, ctx, dimension } = setup({
            effects: [{ effect: 'slowness', durationTicks: 40 }],
            particles: [{ id: 'p', count: 1, at: 'target' }],
            sounds: { impact: 'impact_light' },
        });
        const a = target(dimension);
        const report = combat.strike(ctx, [a], {
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
        const { combat, ctx, dimension } = setup({ sounds: { impact: 'impact_light' } });
        const report = combat.strike(ctx, [], { damage: 5 });
        assert.equal(report.considered, 0);
        assert.equal(report.damaged, 0);
        assert.equal(report.totalDamage, 0);
        assert.deepEqual(report.refusals, {});
        assert.equal(dimension.sounds.length, 0);
    });

    it('hits a duplicated target only once per execution', () => {
        // Abilities that combine a raycast with an area sweep can hand the
        // same entity in twice; it must not take double damage for one press.
        const { combat, ctx, dimension } = setup();
        const a = target(dimension);
        const report = combat.strike(ctx, [a, a, a], { damage: 4 });

        assert.equal(a.damageTaken.length, 1);
        assert.equal(report.damaged, 1);
        assert.equal(report.refusals.duplicate_in_execution, 2);
    });

    it('blocks a second hit on the same target while hit protection holds', () => {
        const { combat, ctx, dimension } = setup();
        const a = target(dimension);

        combat.strike(ctx, [a], { damage: 4 });
        const second = combat.strike(ctx, [a], { damage: 4 });

        assert.equal(a.damageTaken.length, 1, 'the follow-up must be absorbed');
        assert.equal(second.refusals.hit_protected, 1);
    });

    it('keeps hit protection per attacker, so two players are independent', () => {
        const { combat, ctx, dimension } = setup();
        const a = target(dimension);

        combat.strike(ctx, [a], { damage: 4 });
        // Same target, different attacker: must not inherit the protection.
        const otherCtx = { ...ctx, playerId: 'player-b' };
        const second = combat.strike(otherCtx, [a], { damage: 4 });

        assert.equal(second.damaged, 1, "player B's hit must land");
        assert.equal(a.damageTaken.length, 2);
    });

    it('scales damage per target when asked', () => {
        const { combat, ctx, dimension } = setup();
        const near = target(dimension, 1);
        const far = target(dimension, 5);

        combat.strike(ctx, [near, far], { damage: 10, damageScale: (t) => (t === far ? 0.5 : 1) });

        assert.equal(near.damageTaken[0].amount, 10);
        assert.equal(far.damageTaken[0].amount, 5);
    });

    it('reports refusals rather than throwing on a removed target', () => {
        const { combat, ctx, dimension } = setup();
        const gone = target(dimension);
        gone.isValid = false;

        const report = combat.strike(ctx, [gone], { damage: 5 });
        assert.equal(report.damaged, 0);
        assert.equal(report.refusals.invalid_target, 1);
    });

});

describe('CombatSystem.playCast', () => {
    it('draws caster-scoped particles and the cast sound at the caster', () => {
        const { combat, ctx, dimension } = setup({
            particles: [
                { id: 'at-caster', count: 1, at: 'caster' },
                { id: 'at-target', count: 1, at: 'target' },
            ],
            sounds: { cast: 'ability_cast', impact: 'impact_light' },
        });
        combat.playCast(ctx);

        assert.deepEqual(dimension.particles.map((p) => p.id), ['at-caster']);
        assert.equal(dimension.sounds.length, 1);
    });

    it('treats a particle with no `at` as caster-scoped', () => {
        const { combat, ctx, dimension } = setup({ particles: [{ id: 'p', count: 1 }] });
        combat.playCast(ctx);
        assert.equal(dimension.particles.length, 1);
    });
});
