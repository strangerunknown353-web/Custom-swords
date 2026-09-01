/**
 * The effect helpers added for the Ability Engine. Each one wraps an engine
 * call that can fail in an ordinary, expected way — a removed entity, an
 * unsupported operation — and must absorb that rather than aborting an ability.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDimension, MockEntity, MockPlayer } from '../mocks/minecraft_server.mjs';
import { EffectService } from '../../packs/CustomSwordsBP/scripts/systems/effects.js';
import { log } from '../../packs/CustomSwordsBP/scripts/core/log.js';

const effects = new EffectService(log);

/** @param {number} current @param {number} max */
function mob(current = 20, max = 20) {
    const entity = new MockEntity({ id: 'mob', location: { x: 0, y: 64, z: 0 } });
    entity.setHealth(current, max);
    return entity;
}

describe('EffectService.heal', () => {
    it('restores health and reports the amount actually restored', () => {
        const target = mob(10);
        assert.equal(effects.heal(target, 5), 5);
        assert.equal(target.getComponent('minecraft:health').currentValue, 15);
    });

    it('clamps to the maximum rather than overhealing', () => {
        const target = mob(18, 20);
        assert.equal(effects.heal(target, 10), 2);
        assert.equal(target.getComponent('minecraft:health').currentValue, 20);
    });

    it('does nothing at full health, or for a non-positive amount', () => {
        assert.equal(effects.heal(mob(20, 20), 5), 0);
        assert.equal(effects.heal(mob(10), 0), 0);
        assert.equal(effects.heal(mob(10), -5), 0);
    });

    it('does nothing for a removed entity', () => {
        const target = mob(10);
        target.isValid = false;
        assert.doesNotThrow(() => effects.heal(target, 5));
        assert.equal(effects.heal(target, 5), 0);
    });
});

describe('EffectService.ignite', () => {
    it('sets a target alight', () => {
        const target = mob();
        assert.equal(effects.ignite(target, 4), true);
        assert.deepEqual(target.ignitions.at(-1).seconds, 4);
    });

    it('rounds fractional seconds up rather than silently truncating to zero', () => {
        const target = mob();
        effects.ignite(target, 0.4);
        assert.equal(target.ignitions.at(-1).seconds, 1);
    });

    it('refuses non-positive durations and removed entities', () => {
        assert.equal(effects.ignite(mob(), 0), false);
        const gone = mob();
        gone.isValid = false;
        assert.equal(effects.ignite(gone, 3), false);
    });
});

describe('EffectService.teleport', () => {
    it('moves an entity and checks for blocks by default', () => {
        const target = mob();
        assert.equal(effects.teleport(target, { x: 5, y: 64, z: 5 }), true);
        assert.deepEqual(target.teleports.at(-1).location, { x: 5, y: 64, z: 5 });
        assert.equal(target.teleports.at(-1).options.checkForBlocks, true);
    });

    it('refuses a non-finite destination instead of handing NaN to the engine', () => {
        const target = mob();
        assert.equal(effects.teleport(target, { x: Number.NaN, y: 64, z: 0 }), false);
        assert.equal(target.teleports.length, 0);
    });
});

describe('EffectService.impulse', () => {
    it('uses applyImpulse for non-players', () => {
        const target = mob();
        assert.equal(effects.impulse(target, { x: 0, y: 0.5, z: 0 }), true);
        assert.deepEqual(target.impulses.at(-1), { x: 0, y: 0.5, z: 0 });
    });

    it('routes players to knockback, because applyImpulse throws on them', () => {
        // Documented engine behaviour, not something we can work around — so
        // the service must not surface it to callers.
        const player = new MockPlayer({ id: 'player-a' });
        assert.doesNotThrow(() => effects.impulse(player, { x: 1, y: 0.4, z: 0 }));
        assert.equal(player.impulses.length, 0, 'applyImpulse must not be used on a player');
        assert.deepEqual(player.knockbacks.at(-1), { horizontal: { x: 1, z: 0 }, vertical: 0.4 });
    });

    it('refuses a non-finite vector', () => {
        const target = mob();
        assert.equal(effects.impulse(target, { x: 0, y: Number.NaN, z: 0 }), false);
    });
});
