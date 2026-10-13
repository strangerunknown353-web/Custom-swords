/**
 * v2.0 FX: multi-frame ability animations.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
    MockDimension,
    MockEntity,
    MockItemComponentRegistry,
    MockItemStack,
    MockPlayer,
    resetMocks,
} from '../mocks/minecraft_server.mjs';

import { CONFIG } from '../../packs/CustomSwordsBP/scripts/config.js';
import { log } from '../../packs/CustomSwordsBP/scripts/core/log.js';
import { createFramework } from '../../packs/CustomSwordsBP/scripts/core/bootstrap.js';
import { SWORD_COMPONENT_ID } from '../../packs/CustomSwordsBP/scripts/core/input_router.js';
import { VISUAL_PROFILES } from '../../packs/CustomSwordsBP/scripts/core/visual_profiles.js';
import { ParticleService } from '../../packs/CustomSwordsBP/scripts/systems/particles.js';
import { FxService } from '../../packs/CustomSwordsBP/scripts/systems/fx.js';
import { SWORDS } from '../../packs/CustomSwordsBP/scripts/swords/index.js';

/** A scheduler the test drives by hand. */
function manualScheduler() {
    const queue = [];
    return {
        schedule: (callback) => queue.push(callback),
        flush() {
            let ran = 0;
            while (queue.length > 0) {
                queue.shift()();
                ran++;
            }
            return ran;
        },
        get pending() {
            return queue.length;
        },
    };
}

function withConfig(overrides) {
    return { ...CONFIG, fx: { ...CONFIG.fx, ...overrides } };
}

const look = VISUAL_PROFILES.fire;

describe('fx animations', () => {
    beforeEach(() => resetMocks());

    it('draws frame 0 at once and the rest on later ticks', () => {
        const clock = manualScheduler();
        const fx = new FxService(CONFIG, new ParticleService(CONFIG, log), log, clock);
        const dimension = new MockDimension();
        fx.shockwave(dimension, look, { x: 0, y: 64, z: 0 }, 5);
        const first = dimension.particles.length;
        assert.ok(first > 0, 'frame 0 draws immediately');
        assert.equal(fx.active, 1);
        assert.equal(clock.flush(), 6, 'a 7-frame shockwave schedules 6 more frames');
        assert.ok(dimension.particles.length > first * 3);
        assert.equal(fx.active, 0, 'the slot is released when the animation ends');
    });

    it('a growing shockwave gets wider each frame; an inward one gets narrower', () => {
        for (const inward of [false, true]) {
            const clock = manualScheduler();
            const fx = new FxService(CONFIG, new ParticleService(CONFIG, log), log, clock);
            const dimension = new MockDimension();
            const radii = [];
            let seen = 0;
            const sample = () => {
                const p = dimension.particles[seen];
                radii.push(Math.hypot(p.location.x, p.location.z));
                seen = dimension.particles.length;
            };
            fx.shockwave(dimension, look, { x: 0, y: 64, z: 0 }, 6, { inward });
            sample();
            clock.flush();
            // Re-sample by frame: the first trail particle of each frame sits on its ring.
            const firsts = [];
            for (let i = 0; i < dimension.particles.length; i++) {
                const p = dimension.particles[i];
                if (p.id === look.trail && (i === 0 || dimension.particles[i - 1].id !== look.trail)) {
                    firsts.push(Math.hypot(p.location.x, p.location.z));
                }
            }
            const ascending = firsts.every((r, i) => i === 0 || r >= firsts[i - 1] - 1e-9);
            const descending = firsts.every((r, i) => i === 0 || r <= firsts[i - 1] + 1e-9);
            assert.ok(inward ? descending : ascending, `inward=${inward}: ${firsts.map((r) => r.toFixed(2))}`);
        }
    });

    it('past the cap, a new animation plays its first frame only', () => {
        const clock = manualScheduler();
        const fx = new FxService(withConfig({ maxActiveAnimations: 1 }), new ParticleService(CONFIG, log), log, clock);
        const dimension = new MockDimension();
        assert.equal(fx.shockwave(dimension, look, { x: 0, y: 64, z: 0 }, 5), true);
        assert.equal(fx.shockwave(dimension, look, { x: 0, y: 64, z: 0 }, 5), false);
        assert.equal(clock.pending, 1, 'only the first animation scheduled a frame');
    });

    it('does nothing when disabled', () => {
        const clock = manualScheduler();
        const fx = new FxService(withConfig({ enabled: false }), new ParticleService(CONFIG, log), log, clock);
        const dimension = new MockDimension();
        fx.shockwave(dimension, look, { x: 0, y: 64, z: 0 }, 5);
        assert.equal(dimension.particles.length, 0);
        assert.equal(clock.pending, 0);
    });

    it('stops quietly when the entity it follows goes away', () => {
        const clock = manualScheduler();
        const fx = new FxService(CONFIG, new ParticleService(CONFIG, log), log, clock);
        const dimension = new MockDimension();
        const player = new MockPlayer({ id: 'p', location: { x: 0, y: 64, z: 0 }, dimension });
        fx.follow(dimension, look, player, 10);
        player.isValid = false;
        assert.doesNotThrow(() => clock.flush());
        assert.equal(fx.active, 0);
    });

    it('a slash sweeps in front of the wielder, not behind', () => {
        const clock = manualScheduler();
        const fx = new FxService(CONFIG, new ParticleService(CONFIG, log), log, clock);
        const dimension = new MockDimension();
        fx.slash(dimension, look, { x: 0, y: 65, z: 0 }, { x: 0, y: 0, z: 1 }, 5, 120);
        clock.flush();
        assert.ok(dimension.particles.length > 20);
        assert.ok(dimension.particles.every((p) => p.location.z > 0), 'every particle is on the facing side');
    });
});

describe('fx for every shipped power', () => {
    beforeEach(() => resetMocks());

    it('every sword power animates without errors and draws particles', () => {
        const clock = manualScheduler();
        const framework = createFramework({ clock: () => 0, fxScheduler: clock.schedule });
        const fx = framework.services.fx;
        const errors = [];
        const originalDebug = log.debug;
        log.debug = (...args) => errors.push(args.map(String).join(' '));
        try {
            for (const sword of SWORDS) {
                for (const binding of sword.abilities) {
                    const dimension = new MockDimension();
                    const player = new MockPlayer({ id: 'p', location: { x: 0, y: 64, z: 0 }, dimension });
                    const target = new MockEntity({ id: 'z', location: { x: 0, y: 64, z: 2 }, dimension });
                    const ctx = framework.executor.buildContext(
                        { player, sword, binding, activation: binding.activation, target },
                        framework.abilities.require(binding.abilityId),
                    );
                    fx.forAbility(ctx);
                    clock.flush();
                    assert.ok(dimension.particles.length > 0, `${sword.id} ${binding.label}: no particles`);
                }
            }
        } finally {
            log.debug = originalDebug;
        }
        assert.deepEqual(errors.filter((e) => e.startsWith('fx')), []);
        assert.equal(fx.active, 0);
    });

    it('casting through the real pipeline plays the animation', () => {
        const clock = manualScheduler();
        const framework = createFramework({ clock: () => 100, fxScheduler: clock.schedule });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const dimension = new MockDimension();
        const player = new MockPlayer({ id: 'p', location: { x: 0, y: 64, z: 0 }, dimension });
        player.setMainhand(new MockItemStack('custom_swords:frost_sword'));
        dimension.entities.push(player, new MockEntity({ id: 'z', location: { x: 0, y: 64, z: 2 }, dimension }));
        registry.components.get(SWORD_COMPONENT_ID).onUse({ source: player, itemStack: new MockItemStack('custom_swords:frost_sword') });
        assert.ok(clock.pending > 0, 'later frames are scheduled');
        const before = dimension.particles.length;
        clock.flush();
        assert.ok(dimension.particles.length > before);
    });
});
