/**
 * The shared layer added and consolidated in v0.11.0.
 *
 * Three new sword mechanics needed four new reads and one new service. Each is
 * shared rather than inlined, so each is tested here once rather than through
 * whichever sword happens to exercise it — and in particular the **failure**
 * direction of each read is asserted, because every one of them runs inside
 * combat resolution where a throw abandons the remaining targets.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDimension, MockEntity, MockPlayer } from '../mocks/minecraft_server.mjs';
import { EffectService } from '../../packs/CustomSwordsBP/scripts/systems/effects.js';
import { EnvironmentService } from '../../packs/CustomSwordsBP/scripts/systems/environment.js';
import { TargetingService } from '../../packs/CustomSwordsBP/scripts/systems/targeting.js';
import { CONFIG } from '../../packs/CustomSwordsBP/scripts/config.js';
import { log } from '../../packs/CustomSwordsBP/scripts/core/log.js';
import {
    distanceBetween,
    distanceTo,
    locationOf,
    round1,
    spanFraction,
    taper,
} from '../../packs/CustomSwordsBP/scripts/abilities/support.js';

const effects = new EffectService(log);
const targeting = new TargetingService(CONFIG, log);

/** A world clock stuck at one time of day. */
const clockAt = (time) => ({ getTimeOfDay: () => time });

function mob(typeId = 'minecraft:pig', { health = 20, max = 20 } = {}) {
    const entity = new MockEntity({ id: 'm', typeId, location: { x: 0, y: 64, z: 0 } });
    entity.setHealth(health, max);
    return entity;
}

describe('EnvironmentService.daylight', () => {
    const overworld = new MockDimension('minecraft:overworld');

    it('peaks at noon and bottoms out across the night', () => {
        assert.equal(new EnvironmentService(log, clockAt(6000)).daylight(overworld), 1, 'noon');
        assert.equal(new EnvironmentService(log, clockAt(18000)).daylight(overworld), 0, 'midnight');
    });

    it('fades through dawn and dusk rather than switching off at an hour', () => {
        // A step at a fixed hour would be a rule to memorise; a ramp is
        // something a player feels.
        const dawn = new EnvironmentService(log, clockAt(0)).daylight(overworld);
        const dusk = new EnvironmentService(log, clockAt(12000)).daylight(overworld);
        assert.ok(dawn > 0 && dawn < 1, `dawn (${dawn}) is partial`);
        assert.ok(dusk > 0 && dusk < 1, `dusk (${dusk}) is partial`);
    });

    it('never runs negative through the small hours', () => {
        for (const time of [15000, 18000, 21000, 23000]) {
            const value = new EnvironmentService(log, clockAt(time)).daylight(overworld);
            assert.ok(value >= 0, `time ${time} produced ${value}`);
        }
    });

    it('reports no sun outside the Overworld, whatever the clock says', () => {
        const service = new EnvironmentService(log, clockAt(6000));
        assert.equal(service.daylight(new MockDimension('minecraft:nether')), 0);
        assert.equal(service.daylight(new MockDimension('minecraft:the_end')), 0);
        assert.equal(service.daylight(overworld), 1, 'and the Overworld is unaffected by the check');
    });

    it('reports no sun when the clock cannot be read', () => {
        // Fails towards withholding the bonus, like every other conditional
        // read in the framework.
        const broken = new EnvironmentService(log, {
            getTimeOfDay() {
                throw new Error('early execution');
            },
        });
        assert.doesNotThrow(() => broken.daylight(overworld));
        assert.equal(broken.daylight(overworld), 0);
        assert.equal(new EnvironmentService(log, clockAt(Number.NaN)).daylight(overworld), 0);
    });
});

describe('EffectService.maxHealth', () => {
    it('reports the maximum, not what is left of it', () => {
        assert.equal(effects.maxHealth(mob('minecraft:zombie', { health: 1, max: 100 })), 100);
    });

    it('reports 0 for anything it cannot read, so a bonus becomes nothing rather than NaN', () => {
        const removed = mob();
        removed.isValid = false;
        assert.equal(effects.maxHealth(removed), 0);

        const bodiless = new MockEntity({ id: 'b', location: { x: 0, y: 64, z: 0 } });
        delete bodiless.components['minecraft:health'];
        assert.equal(effects.maxHealth(bodiless), 0);

        assert.equal(effects.maxHealth(undefined), 0);
        assert.ok(Number.isFinite(effects.maxHealth(undefined) * 0.05));
    });
});

describe('EffectService.amplifierOf and remove — the game as a store', () => {
    it('reports -1 for a target carrying nothing, so +1 starts a fresh target at 0', () => {
        const target = mob();
        assert.equal(effects.amplifierOf(target, 'poison'), -1);
        assert.equal(effects.amplifierOf(target, 'poison') + 1, 0);
    });

    it('reports the amplifier the target actually carries', () => {
        const target = mob();
        effects.apply(target, { effect: 'poison', durationTicks: 100, amplifier: 2 });
        assert.equal(effects.amplifierOf(target, 'poison'), 2);
    });

    it('reads the most recent application, which is how a stack deepens', () => {
        const target = mob();
        effects.apply(target, { effect: 'poison', durationTicks: 100, amplifier: 0 });
        effects.apply(target, { effect: 'poison', durationTicks: 100, amplifier: 1 });
        assert.equal(effects.amplifierOf(target, 'poison'), 1);
    });

    it('removes what was banked, and reports whether there was anything to remove', () => {
        const target = mob();
        assert.equal(effects.remove(target, 'poison'), false, 'nothing to spend');
        effects.apply(target, { effect: 'poison', durationTicks: 100, amplifier: 2 });
        assert.equal(effects.remove(target, 'poison'), true);
        assert.equal(effects.amplifierOf(target, 'poison'), -1, 'and it is gone');
    });

    it('never throws on a dead handle', () => {
        const removed = mob();
        removed.isValid = false;
        assert.doesNotThrow(() => effects.amplifierOf(removed, 'poison'));
        assert.equal(effects.amplifierOf(removed, 'poison'), -1);
        assert.equal(effects.remove(removed, 'poison'), false);
    });
});

describe('TargetingService.isCategory', () => {
    it('matches by type family, so every undead is covered without listing them', () => {
        assert.equal(targeting.isCategory(mob('minecraft:zombie'), ['undead']), true);
        assert.equal(targeting.isCategory(mob('minecraft:skeleton'), ['undead']), true);
        assert.equal(targeting.isCategory(mob('minecraft:pig'), ['undead']), false);
    });

    it('accepts a union, and treats `any` as a match', () => {
        assert.equal(targeting.isCategory(mob('minecraft:spider'), ['undead', 'arthropod']), true);
        assert.equal(targeting.isCategory(mob('minecraft:pig'), ['any']), true);
    });

    it('matches nothing for an empty list or an unreadable entity', () => {
        assert.equal(targeting.isCategory(mob('minecraft:zombie'), []), false);
        const removed = mob('minecraft:zombie');
        removed.isValid = false;
        assert.equal(targeting.isCategory(removed, ['undead']), false);
        assert.equal(targeting.isCategory(undefined, ['undead']), false);
    });
});

describe('abilities/support — the measurement five abilities used to each own', () => {
    const origin = { x: 0, y: 64, z: 0 };

    it('reads a location, and reports undefined rather than throwing on a dead handle', () => {
        const entity = new MockEntity({ id: 'e', location: { x: 3, y: 64, z: 4 } });
        assert.deepEqual(locationOf(entity), { x: 3, y: 64, z: 4 });
        assert.deepEqual(locationOf(entity, 1), { x: 3, y: 65, z: 4 }, 'the chest-height offset `chain` needs');

        entity.isValid = false;
        Object.defineProperty(entity, 'location', {
            get() {
                throw new Error('entity removed');
            },
        });
        assert.doesNotThrow(() => locationOf(entity));
        assert.equal(locationOf(entity), undefined);
        assert.equal(distanceTo(origin, entity), undefined);
    });

    it('measures distance, and propagates the unmeasurable case', () => {
        assert.equal(distanceBetween(origin, { x: 3, y: 64, z: 4 }), 5);
        assert.equal(distanceBetween(origin, undefined), undefined);
        assert.equal(distanceBetween(undefined, origin), undefined);
    });

    it('turns a distance into a clamped 0..1 span fraction', () => {
        assert.equal(spanFraction(0, 10), 0);
        assert.equal(spanFraction(5, 10), 0.5);
        assert.equal(spanFraction(20, 10), 1, 'clamped, never extrapolated');
        assert.equal(spanFraction(5, 0), 0, 'a zero span cannot be divided by');
        assert.equal(spanFraction(undefined, 10), undefined, 'the caller decides what unmeasurable means');
    });

    it('ramps from full strength to the edge factor, the same way for distance and angle', () => {
        assert.equal(taper(0, 0.5), 1, 'full strength at the centre');
        assert.equal(taper(1, 0.5), 0.5, 'the edge factor at the rim');
        assert.equal(taper(0.5, 0.5), 0.75);
        assert.equal(taper(0.5, 1), 1, 'an edge factor of 1 disables the ramp');
        assert.equal(taper(5, 0.5), 0.5, 'clamped past the rim');
    });

    it('formats a number for the action bar without a trailing zero', () => {
        assert.equal(round1(1.7000000000000002), '1.7');
        assert.equal(round1(3), '3');
        assert.equal(round1(4.25), '4.3');
    });
});
