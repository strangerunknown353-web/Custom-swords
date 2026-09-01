/**
 * Tests for the safety rules the systems layer enforces on behalf of every
 * ability: target filtering, PvP gating, damage clamping and particle budgets.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDimension, MockEntity, MockPlayer } from '../mocks/minecraft_server.mjs';
import { TargetingService } from '../../packs/CustomSwordsBP/scripts/systems/targeting.js';
import { DamageService } from '../../packs/CustomSwordsBP/scripts/systems/damage.js';
import { ParticleService } from '../../packs/CustomSwordsBP/scripts/systems/particles.js';
import { SoundService, SOUND_LIBRARY } from '../../packs/CustomSwordsBP/scripts/systems/sounds.js';
import { log } from '../../packs/CustomSwordsBP/scripts/core/log.js';
import { CONFIG } from '../../packs/CustomSwordsBP/scripts/config.js';

/**
 * Builds a config clone with overrides, so tests can flip a rule without
 * mutating the shipped frozen config.
 *
 * @param {object} overrides
 */
function configWith(overrides = {}) {
    return {
        ...CONFIG,
        combat: { ...CONFIG.combat, ...(overrides.combat ?? {}) },
        targeting: { ...CONFIG.targeting, ...(overrides.targeting ?? {}) },
        particles: { ...CONFIG.particles, ...(overrides.particles ?? {}) },
    };
}

/**
 * @param {object} options
 */
function makeContext({ config = CONFIG, targeting } = {}) {
    const dimension = new MockDimension();
    const player = new MockPlayer({ id: 'player-a', location: { x: 0, y: 64, z: 0 }, dimension });
    dimension.entities.push(player);
    const services = { log, config, targeting };
    return {
        dimension,
        player,
        ctx: {
            player,
            playerId: player.id,
            dimension,
            origin: { x: 0, y: 64, z: 0 },
            viewDirection: { x: 0, y: 0, z: 1 },
            services,
        },
    };
}

describe('TargetingService', () => {
    it('excludes the caster', () => {
        const targeting = new TargetingService(CONFIG);
        const { ctx, dimension } = makeContext({ targeting });
        dimension.entities.push(new MockEntity({ id: 'zombie-1', location: { x: 0, y: 64, z: 1 }, dimension }));

        const targets = targeting.sphere(ctx, { range: 5 });
        assert.deepEqual(targets.map((t) => t.id), ['zombie-1']);
    });

    it('excludes invalid (removed) entity handles', () => {
        const targeting = new TargetingService(CONFIG);
        const { ctx, dimension } = makeContext({ targeting });
        const dead = new MockEntity({ id: 'zombie-dead', location: { x: 0, y: 64, z: 1 }, dimension });
        dead.isValid = false;
        dimension.entities.push(dead);

        assert.deepEqual(targeting.sphere(ctx, { range: 5 }), []);
    });

    it('excludes never-target types such as dropped items', () => {
        const targeting = new TargetingService(CONFIG);
        const { ctx, dimension } = makeContext({ targeting });
        dimension.entities.push(
            new MockEntity({ id: 'drop', typeId: 'minecraft:item', location: { x: 0, y: 64, z: 1 }, dimension }),
        );

        assert.deepEqual(targeting.sphere(ctx, { range: 5 }), []);
    });

    it('honours the PvP toggle for other players', () => {
        const dimension = new MockDimension();
        const caster = new MockPlayer({ id: 'player-a', location: { x: 0, y: 64, z: 0 }, dimension });
        const other = new MockPlayer({ id: 'player-b', location: { x: 0, y: 64, z: 1 }, dimension });
        dimension.entities.push(caster, other);

        const pvpOff = new TargetingService(configWith({ combat: { allowPlayerVersusPlayer: false } }));
        const pvpOn = new TargetingService(configWith({ combat: { allowPlayerVersusPlayer: true } }));
        const ctx = {
            playerId: caster.id,
            dimension,
            origin: { x: 0, y: 64, z: 0 },
            viewDirection: { x: 0, y: 0, z: 1 },
            allowedTargets: ['any'],
            services: { log, config: CONFIG },
        };

        assert.deepEqual(pvpOff.sphere(ctx, { range: 5 }), []);
        assert.deepEqual(pvpOn.sphere(ctx, { range: 5 }).map((t) => t.id), ['player-b']);
    });

    it('clamps range and target count to the configured ceilings', () => {
        const config = configWith({ targeting: { maxRange: 4, maxTargets: 2 } });
        const targeting = new TargetingService(config);
        const { ctx, dimension } = makeContext({ config, targeting });
        for (let i = 0; i < 6; i++) {
            dimension.entities.push(new MockEntity({ id: `z${i}`, location: { x: 0, y: 64, z: 1 }, dimension }));
        }
        // Ask for far more than the ceiling allows.
        assert.equal(targeting.sphere(ctx, { range: 1000, maxTargets: 1000 }).length, 2);
    });

    it('restricts a cone to entities in front of the caster', () => {
        const targeting = new TargetingService(CONFIG);
        const { ctx, dimension } = makeContext({ targeting });
        dimension.entities.push(
            new MockEntity({ id: 'ahead', location: { x: 0, y: 64, z: 3 }, dimension }),
            new MockEntity({ id: 'behind', location: { x: 0, y: 64, z: -3 }, dimension }),
        );

        const hit = targeting.cone(ctx, { range: 6, coneAngleDegrees: 60 });
        assert.deepEqual(hit.map((t) => t.id), ['ahead']);
    });
});

describe('DamageService', () => {
    it('applies the global multiplier and the per-hit ceiling', () => {
        const config = configWith({ combat: { abilityDamageMultiplier: 2, maxAbilityDamagePerHit: 10 } });
        const service = new DamageService(config, new TargetingService(config), log);

        assert.equal(service.resolveAmount(3), 6);
        assert.equal(service.resolveAmount(50), 10, 'must clamp to the ceiling');
        assert.equal(service.resolveAmount(3, true), 3, 'bypass skips the multiplier');
        assert.equal(service.resolveAmount(0), 0);
        assert.equal(service.resolveAmount(Number.NaN), 0);
    });

    it('refuses to damage the caster', () => {
        const targeting = new TargetingService(CONFIG);
        const service = new DamageService(CONFIG, targeting, log);
        const { ctx, player } = makeContext({ targeting });

        assert.equal(service.apply(ctx, player, 5).ok, false);
        assert.equal(player.damageTaken.length, 0);
    });

    it('survives a target that is removed mid-ability', () => {
        const targeting = new TargetingService(CONFIG);
        const service = new DamageService(CONFIG, targeting, log);
        const { ctx, dimension } = makeContext({ targeting });
        const zombie = new MockEntity({ id: 'z', location: { x: 0, y: 64, z: 1 }, dimension });
        zombie.isValid = false;

        assert.doesNotThrow(() => service.apply(ctx, zombie, 5));
        assert.equal(service.apply(ctx, zombie, 5).ok, false);
    });

    it('pushes a target directly away from the origin', () => {
        const service = new DamageService(CONFIG, new TargetingService(CONFIG), log);
        const zombie = new MockEntity({ id: 'z', location: { x: 0, y: 64, z: 4 } });

        assert.equal(service.knockback(zombie, { horizontal: 1.5, vertical: 0.4 }, { x: 0, y: 64, z: 0 }), true);
        const [{ horizontal, vertical }] = zombie.knockbacks;
        assert.equal(Math.abs(horizontal.z - 1.5) < 1e-12, true);
        assert.equal(horizontal.x, 0);
        assert.equal(vertical, 0.4);
    });
});

describe('ParticleService', () => {
    it('never exceeds the configured per-emit budget', () => {
        const config = configWith({ particles: { maxPerEmit: 5 } });
        const service = new ParticleService(config, log);
        const dimension = new MockDimension();

        service.emit(dimension, { id: 'minecraft:basic_flame_particle', count: 500 }, { x: 0, y: 0, z: 0 });
        assert.equal(dimension.particles.length, 5);
    });

    it('refuses a non-finite location instead of throwing into the engine', () => {
        const service = new ParticleService(CONFIG, log);
        const dimension = new MockDimension();

        assert.equal(service.emit(dimension, { id: 'x', count: 3 }, { x: Number.NaN, y: 0, z: 0 }), 0);
        assert.equal(dimension.particles.length, 0);
    });

    it('draws a ring at the requested radius', () => {
        const service = new ParticleService(CONFIG, log);
        const dimension = new MockDimension();

        service.ring(dimension, { id: 'p' }, { x: 0, y: 64, z: 0 }, 3, 8);
        assert.equal(dimension.particles.length, 8);
        for (const particle of dimension.particles) {
            assert.equal(Math.abs(Math.hypot(particle.location.x, particle.location.z) - 3) < 1e-9, true);
        }
    });
});

describe('SoundService', () => {
    it('resolves a library preset', () => {
        const service = new SoundService(log);
        assert.deepEqual(service.resolve('ability_cast'), SOUND_LIBRARY.ability_cast);
        assert.deepEqual(service.resolve({ id: 'x', volume: 0.5 }), { id: 'x', volume: 0.5 });
        assert.equal(service.resolve(undefined), undefined);
    });

    // Regression, and a correction of this very test. It previously asserted
    // that an unknown name resolved to `{ id: <the name> }` — "library names and
    // raw ids alike" — which encoded the bug as intended behaviour. That
    // fallback is why the seven elemental swords referenced fourteen presets
    // that did not exist and played as silence: every layer, this test
    // included, treated the typo as a deliberate raw sound id.
    it('refuses an unknown preset name instead of guessing it is a raw sound id', () => {
        const service = new SoundService(log);
        assert.equal(service.resolve('inferno_cast_typo'), undefined);
        assert.equal(service.resolve('not_a_preset'), undefined);
    });

    it('defines a cast and an impact preset for every elemental theme', () => {
        for (const theme of ['inferno', 'thunder', 'frost', 'wind', 'earth', 'tidal', 'nature']) {
            assert.ok(SOUND_LIBRARY[`${theme}_cast`], `${theme}_cast missing from SOUND_LIBRARY`);
            assert.ok(SOUND_LIBRARY[`${theme}_impact`], `${theme}_impact missing from SOUND_LIBRARY`);
        }
    });

    it('sends personal feedback only to the one player', () => {
        const service = new SoundService(log);
        const dimension = new MockDimension();
        const a = new MockPlayer({ id: 'a', dimension });
        const b = new MockPlayer({ id: 'b', dimension });

        service.playFor(a, 'ability_deny');
        assert.equal(a.soundsHeard.length, 1);
        assert.equal(b.soundsHeard.length, 0);
    });
});
