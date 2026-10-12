/**
 * v2.0 abilities: `beam` (piercing line) and `leap` (self-launch).
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

import { createFramework } from '../../packs/CustomSwordsBP/scripts/core/bootstrap.js';
import { SWORD_COMPONENT_ID } from '../../packs/CustomSwordsBP/scripts/core/input_router.js';
import { beam } from '../../packs/CustomSwordsBP/scripts/abilities/builtin/beam.js';
import { leap } from '../../packs/CustomSwordsBP/scripts/abilities/builtin/leap.js';

let tick = 0;
const clock = () => tick;

function swordWith(binding) {
    return {
        id: 'custom_swords:probe',
        name: 'Probe',
        rarity: 'common',
        description: 'Probe.',
        item: { attackDamage: 1, durability: 10 },
        abilities: [{ activation: 'use', allowedTargets: ['mob'], ...binding }],
    };
}

function cast(binding, mobs = 0) {
    const sword = swordWith(binding);
    const framework = createFramework({ clock, swords: [sword] });
    assert.deepEqual(framework.problems, []);
    const registry = new MockItemComponentRegistry();
    framework.router.register(registry);
    const dimension = new MockDimension();
    const player = new MockPlayer({ id: 'p1', location: { x: 0, y: 64, z: 0 }, dimension });
    player.setMainhand(new MockItemStack(sword.id));
    dimension.entities.push(player);
    const zombies = [];
    for (let i = 0; i < mobs; i++) {
        const z = new MockEntity({ id: `z${i}`, location: { x: 0, y: 64, z: 2 + i }, dimension });
        zombies.push(z);
        dimension.entities.push(z);
    }
    tick += 3;
    registry.components.get(SWORD_COMPONENT_ID).onUse({ source: player, itemStack: new MockItemStack(sword.id) });
    return { player, zombies, dimension };
}

describe('beam', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('pierces several targets, each for less than the last', () => {
        const { zombies } = cast(
            { abilityId: beam.id, targeting: { type: 'ray', range: 12 }, params: { damage: 10, pierceFalloff: 0.5, maxPierce: 5 } },
            3,
        );
        const amounts = zombies.map((z) => z.damageTaken[0]?.amount);
        assert.equal(amounts.length, 3);
        assert.ok(amounts.every((a) => a > 0), 'every target in the line is struck');
        assert.ok(amounts[0] > amounts[1] && amounts[1] > amounts[2], 'damage falls off per pierce');
    });

    it('stops at maxPierce', () => {
        const { zombies } = cast(
            { abilityId: beam.id, targeting: { type: 'ray', range: 12 }, params: { maxPierce: 2 } },
            4,
        );
        assert.equal(zombies.filter((z) => z.damageTaken.length > 0).length, 2);
    });

    it('reports nothing hit, and starts no cooldown, on an empty line', () => {
        const { player } = cast({ abilityId: beam.id, targeting: { type: 'ray', range: 12 }, cooldownTicks: 100 }, 0);
        assert.match(player.actionBarMessages.at(-1), /found nothing/);
    });

    it('rejects out-of-range params', () => {
        assert.ok(beam.validateParams({ ...beam.defaults, maxPierce: 0 }).length > 0);
        assert.ok(beam.validateParams({ ...beam.defaults, pierceFalloff: 2 }).length > 0);
        assert.deepEqual(beam.validateParams({ ...beam.defaults }), []);
    });
});

describe('leap', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('launches the wielder along their view and applies the binding effects to them', () => {
        const { player } = cast({
            abilityId: leap.id,
            targeting: { type: 'self' },
            effects: [{ effect: 'slow_falling', durationTicks: 100 }],
            params: { horizontal: 2, vertical: 0.6 },
        });
        assert.equal(player.knockbacks.length, 1);
        const { horizontal, vertical } = player.knockbacks[0];
        assert.ok(Math.abs(horizontal.z - 2) < 1e-9 && Math.abs(horizontal.x) < 1e-9, 'pushed along the view');
        assert.equal(vertical, 0.6);
        assert.ok(player.effects.some((e) => e.effect === 'slow_falling'));
    });

    it('caps its forces', () => {
        assert.ok(leap.validateParams({ ...leap.defaults, horizontal: 9 }).length > 0);
        assert.ok(leap.validateParams({ ...leap.defaults, vertical: 3 }).length > 0);
        assert.deepEqual(leap.validateParams({ ...leap.defaults }), []);
    });
});
