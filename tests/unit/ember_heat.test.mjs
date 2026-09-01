/**
 * Ember Blade's heat mechanic, end to end.
 *
 * This is the project's first ability whose output depends on per-player state
 * carried *between* activations, so it is also the first place the multiplayer
 * rule could be broken by a mechanic rather than by a mistake. The isolation
 * assertions below matter more than the damage arithmetic.
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
import { createFramework, subscribePlayerLifecycle } from '../../packs/CustomSwordsBP/scripts/core/bootstrap.js';
import { SWORD_COMPONENT_ID } from '../../packs/CustomSwordsBP/scripts/core/input_router.js';
import { PlayerStateStore } from '../../packs/CustomSwordsBP/scripts/core/player_state.js';

const EMBER = 'custom_swords:ember_blade';
const HEAT = 'ember_heat';

let tick = 0;
const clock = () => tick;

function install() {
    const framework = createFramework({ clock });
    const registry = new MockItemComponentRegistry();
    framework.router.register(registry);
    subscribePlayerLifecycle(framework);
    return { framework, component: registry.components.get(SWORD_COMPONENT_ID) };
}

function wielder(dimension, id) {
    const player = new MockPlayer({ id, location: { x: 0, y: 64, z: 0 }, dimension });
    player.setMainhand(new MockItemStack(EMBER));
    dimension.entities.push(player);
    return player;
}

function zombie(dimension, id, z = 1) {
    const entity = new MockEntity({ id, location: { x: 0, y: 64, z }, dimension });
    dimension.entities.push(entity);
    return entity;
}

/** A melee hit, past the anti-spam floor and the passive's own cooldown. */
function hit(component, player, target) {
    tick += 30;
    return component.onHitEntity({
        attackingEntity: player,
        hitEntity: target,
        itemStack: new MockItemStack(EMBER),
        hadEffect: true,
    });
}

/** A right-click, past the anti-spam floor and hit protection. */
function use(component, player) {
    tick += 90;
    return component.onUse({ source: player, itemStack: new MockItemStack(EMBER) });
}

describe('PlayerStateStore charges', () => {
    it('accumulates, reads and clamps to the ceiling', () => {
        const state = new PlayerStateStore();
        assert.equal(state.charges('p', HEAT), 0);
        assert.equal(state.addCharge('p', HEAT, 1, 3), 1);
        assert.equal(state.addCharge('p', HEAT, 1, 3), 2);
        assert.equal(state.addCharge('p', HEAT, 1, 3), 3);
        assert.equal(state.addCharge('p', HEAT, 1, 3), 3, 'must not exceed the ceiling');
        assert.equal(state.charges('p', HEAT), 3);
    });

    it('spends everything and resets to zero', () => {
        const state = new PlayerStateStore();
        state.addCharge('p', HEAT, 4, 10);
        assert.equal(state.spendCharges('p', HEAT), 4);
        assert.equal(state.charges('p', HEAT), 0);
        assert.equal(state.spendCharges('p', HEAT), 0, 'spending an empty counter is not an error');
    });

    it('keeps two players' + " counters completely separate", () => {
        const state = new PlayerStateStore();
        state.addCharge('a', HEAT, 3, 10);
        state.addCharge('b', HEAT, 1, 10);
        assert.equal(state.charges('a', HEAT), 3);
        assert.equal(state.charges('b', HEAT), 1);
        state.spendCharges('a', HEAT);
        assert.equal(state.charges('b', HEAT), 1, "spending A's heat must not touch B's");
    });

    it('is life-scoped, so death clears it', () => {
        const state = new PlayerStateStore();
        state.addCharge('a', HEAT, 5, 10);
        state.set('a', 'not_life_scoped', 'kept');
        state.clearLifeScope('a');
        assert.equal(state.charges('a', HEAT), 0, 'heat must not survive death');
        assert.equal(state.get('a', 'not_life_scoped', undefined), 'kept');
    });

    it('refuses non-finite input instead of corrupting the counter', () => {
        const state = new PlayerStateStore();
        state.addCharge('a', HEAT, 2, 10);
        assert.equal(state.addCharge('a', HEAT, Number.NaN, 10), 2);
        assert.equal(state.addCharge('a', HEAT, Number.POSITIVE_INFINITY, 10), 2);
        assert.equal(state.charges('a', HEAT), 2);
    });
});

describe('Ember Blade heat', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('banks heat on a melee hit that lands', () => {
        const { framework, component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        const target = zombie(dimension, 'z1');

        assert.equal(framework.services.state.charges(player.id, HEAT), 0);
        hit(component, player, target);
        assert.equal(framework.services.state.charges(player.id, HEAT), 1);
        hit(component, player, target);
        assert.equal(framework.services.state.charges(player.id, HEAT), 2);
    });

    it('caps banked heat, so it cannot be stockpiled before a fight', () => {
        const { framework, component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        const target = zombie(dimension, 'z1');

        for (let i = 0; i < 12; i++) hit(component, player, target);
        assert.equal(framework.services.state.charges(player.id, HEAT), 5, 'maxCharges is the ceiling');
    });

    it('spends all banked heat on the burst', () => {
        const { framework, component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        const target = zombie(dimension, 'z1');

        hit(component, player, target);
        hit(component, player, target);
        assert.equal(framework.services.state.charges(player.id, HEAT), 2);

        use(component, player);
        assert.equal(framework.services.state.charges(player.id, HEAT), 0, 'the burst consumes everything');
    });

    it('hits harder with heat than without — the whole point of the sword', () => {
        const dimension = new MockDimension();

        const cold = install();
        const coldPlayer = wielder(dimension, 'cold');
        const coldTarget = zombie(dimension, 'cold-z', 1);
        use(cold.component, coldPlayer);
        const coldDamage = coldTarget.damageTaken.at(-1).amount;

        resetMocks();
        tick = 0;
        const hotDimension = new MockDimension();
        const hot = install();
        const hotPlayer = wielder(hotDimension, 'hot');
        const hotTarget = zombie(hotDimension, 'hot-z', 1);
        for (let i = 0; i < 4; i++) hit(hot.component, hotPlayer, hotTarget);
        use(hot.component, hotPlayer);
        const hotDamage = hotTarget.damageTaken.at(-1).amount;

        assert.ok(hotDamage > coldDamage, `expected banked heat to raise damage: ${hotDamage} vs ${coldDamage}`);
    });

    it('keeps a missed burst from wasting banked heat', () => {
        const { framework, component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        const target = zombie(dimension, 'z1', 1);

        hit(component, player, target);
        hit(component, player, target);
        // Nothing left in range: the mob is gone from the dimension.
        dimension.entities.splice(dimension.entities.indexOf(target), 1);

        use(component, player);
        assert.equal(framework.services.state.charges(player.id, HEAT), 2, 'a burst with no target must not spend heat');
    });

    it('never lets one player spend or gain another player\'s heat', () => {
        const { framework, component } = install();
        const dimension = new MockDimension();
        const playerA = wielder(dimension, 'player-a');
        const playerB = wielder(dimension, 'player-b');
        const target = zombie(dimension, 'z1', 1);

        for (let i = 0; i < 3; i++) hit(component, playerA, target);
        assert.equal(framework.services.state.charges(playerA.id, HEAT), 3);
        assert.equal(framework.services.state.charges(playerB.id, HEAT), 0, "B must not gain from A's swings");

        use(component, playerB);
        assert.equal(framework.services.state.charges(playerA.id, HEAT), 3, "B's burst must not spend A's heat");
    });

    it('clears heat when the wielder dies', () => {
        const { framework, component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        const target = zombie(dimension, 'z1');

        hit(component, player, target);
        hit(component, player, target);
        assert.equal(framework.services.state.charges(player.id, HEAT), 2);

        framework.services.state.clearLifeScope(player.id);
        assert.equal(framework.services.state.charges(player.id, HEAT), 0);
    });
});
