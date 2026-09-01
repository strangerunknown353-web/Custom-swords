/**
 * Shadow Step's destination validation, and the combo window it opens.
 *
 * This is the only ability in the project that moves the *player*, which makes
 * it the only one whose bugs are unrecoverable: a teleport into stone
 * suffocates, one over a ravine kills, one into lava does both. The refusal
 * cases below matter more than the success case.
 *
 * The mock world is open air above y=64 and solid stone below, and tests carve
 * walls, drops and hazards into it with `setBlock`.
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

const SHADOW = 'custom_swords:shadow_sword';
const MARK = 'shadow_step';

let tick = 0;
const clock = () => tick;

function install() {
    const framework = createFramework({ clock });
    const registry = new MockItemComponentRegistry();
    framework.router.register(registry);
    subscribePlayerLifecycle(framework);
    return { framework, component: registry.components.get(SWORD_COMPONENT_ID) };
}

/** A wielder standing on the ground at the origin, looking due south (+z). */
function wielder(dimension, id = 'p') {
    const player = new MockPlayer({ id, location: { x: 0, y: 64, z: 0 }, dimension });
    player.setMainhand(new MockItemStack(SHADOW));
    player.viewDirection = { x: 0, y: 0, z: 1 };
    dimension.entities.push(player);
    return player;
}

function mob(dimension, id, z, x = 0) {
    const entity = new MockEntity({ id, location: { x, y: 64, z }, dimension });
    dimension.entities.push(entity);
    return entity;
}

function use(component, player) {
    tick += 200;
    return component.onUse({ source: player, itemStack: new MockItemStack(SHADOW) });
}

function hit(component, player, target) {
    tick += 20;
    return component.onHitEntity({
        attackingEntity: player,
        hitEntity: target,
        itemStack: new MockItemStack(SHADOW),
        hadEffect: true,
    });
}

/** Fills the column at (x, z) from y upward, i.e. builds a wall. */
function wall(dimension, x, z, height = 3) {
    for (let y = 64; y < 64 + height; y++) dimension.setBlock(x, y, z, 'stone');
}

const totalDamage = (e) => e.damageTaken.reduce((s, d) => s + d.amount, 0);

describe('Shadow Step — destination safety', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('steps forward through open air', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);

        use(component, player);

        assert.equal(player.teleports.length, 1, 'expected exactly one teleport');
        assert.equal(player.location.z, 6, 'the full 6-block step');
        assert.equal(player.location.x, 0);
        assert.equal(player.location.y, 64);
    });

    it('shortens the step rather than refusing when the far end is blocked', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        // A wall from 4 blocks out: 6 and 5 are unreachable, 4 is the wall
        // itself, so the step should land at 3.
        for (const z of [4, 5, 6]) wall(dimension, 0, z);

        use(component, player);

        assert.equal(player.teleports.length, 1);
        assert.equal(player.location.z, 3, 'should fall back to the furthest safe distance');
    });

    it('refuses entirely when facing a wall, and charges no cooldown', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension);
        for (let z = 1; z <= 8; z++) wall(dimension, 0, z);

        use(component, player);

        assert.equal(player.teleports.length, 0, 'must not move');
        assert.equal(framework.services.cooldowns.isReady('p', `${SHADOW}#use`), true, 'a refusal is free');
        assert.match(player.actionBarMessages.at(-1), /blocked/i);
    });

    it('never steps into a block that would suffocate the player', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        // Head-height obstruction only: the feet block is clear, so a naive
        // check would let the player teleport into it.
        for (let z = 1; z <= 8; z++) dimension.setBlock(0, 65, z, 'stone');

        use(component, player);

        assert.equal(player.teleports.length, 0, 'a clear floor is not enough — the head must fit too');
    });

    it('refuses to step into lava', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        for (let z = 1; z <= 8; z++) dimension.setBlock(0, 64, z, 'lava');

        use(component, player);

        assert.equal(player.teleports.length, 0, 'lava is never a destination');
    });

    it('refuses to step over a drop', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        // Carve a chasm: air all the way down for every candidate distance.
        for (let z = 1; z <= 8; z++) for (let y = 40; y < 64; y++) dimension.setBlock(0, y, z, 'air');

        use(component, player);

        assert.equal(player.teleports.length, 0, 'no footing within maxDrop means no step');
    });

    it('accepts a short drop within tolerance', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        // A two-block step down, with ground beneath it.
        for (let z = 1; z <= 8; z++) for (const y of [62, 63]) dimension.setBlock(0, y, z, 'air');

        use(component, player);

        assert.equal(player.teleports.length, 1, 'a survivable drop is fine');
    });

    it('refuses when the destination chunk cannot be read', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        for (let z = 1; z <= 8; z++) for (let y = 60; y <= 66; y++) dimension.setUnreadable(0, y, z);

        use(component, player);

        assert.equal(player.teleports.length, 0, 'an unreadable destination is refused, not guessed at');
    });

    it('never travels further than the configured ceiling', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension);

        use(component, player);

        const moved = Math.abs(player.location.z);
        assert.ok(moved <= framework.services.config.movement.maxDashDistance, `moved ${moved}`);
    });

    it('ignores pitch so looking up does not launch the player', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        player.viewDirection = { x: 0, y: 0.95, z: 0.31 }; // steeply upward

        use(component, player);

        if (player.teleports.length > 0) {
            assert.equal(player.location.y, 64, 'a dash must stay level');
        }
    });

    it('does not damage the wielder on arrival', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        mob(dimension, 'm', 6);

        use(component, player);

        assert.equal(player.damageTaken.length, 0);
    });

    it('strikes what is standing at the arrival point', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        const target = mob(dimension, 'm', 6);
        const bystander = mob(dimension, 'far', 20);

        use(component, player);

        assert.ok(target.damageTaken.length > 0, 'the mob at the destination is caught');
        assert.equal(bystander.damageTaken.length, 0, 'a distant mob is not');
    });

    it('keeps two players independent', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const playerA = wielder(dimension, 'a');
        const playerB = wielder(dimension, 'b');
        playerB.location = { x: 30, y: 64, z: 0 };

        use(component, playerA);

        assert.equal(playerA.teleports.length, 1);
        assert.equal(playerB.teleports.length, 0, "A's step must not move B");
        assert.deepEqual(playerB.location, { x: 30, y: 64, z: 0 });
        assert.equal(framework.services.cooldowns.isReady('b', `${SHADOW}#use`), true, "B's cooldown is untouched");
    });
});

describe('Shadow Edge — the combo window', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('hits far harder just after a step than without one', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        const target = mob(dimension, 'm', 6);

        // Cold: no step beforehand.
        hit(component, player, target);
        const cold = totalDamage(target);

        // Step, then hit inside the window.
        use(component, player);
        const afterStep = totalDamage(target);
        hit(component, player, target);
        const empowered = totalDamage(target) - afterStep;

        assert.ok(empowered > cold, `empowered ${empowered} should exceed cold ${cold}`);
    });

    it('closes the window once it has expired', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension);
        const target = mob(dimension, 'm', 6);

        use(component, player);
        assert.ok(framework.services.state.sinceMark('p', MARK, tick) <= 80);

        tick += 200; // well past the 80-tick window
        assert.ok(framework.services.state.sinceMark('p', MARK, tick) > 80, 'the window must close');
    });

    it('heals the wielder on an empowered hit only', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension);
        const target = mob(dimension, 'm', 6);
        player.setHealth(10);

        hit(component, player, target); // cold
        const afterCold = player.getComponent('minecraft:health').currentValue;

        use(component, player);
        hit(component, player, target); // empowered
        const afterEmpowered = player.getComponent('minecraft:health').currentValue;

        assert.equal(afterCold, 10, 'an ordinary hit heals nothing');
        assert.ok(afterEmpowered > afterCold, 'an empowered hit drains life');
    });

    it('never lets one player use another player\'s window', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const playerA = wielder(dimension, 'a');
        const playerB = wielder(dimension, 'b');
        playerB.location = { x: 0, y: 64, z: 30 };
        const target = mob(dimension, 'm', 30, 1);

        use(component, playerA);
        assert.ok(framework.services.state.sinceMark('a', MARK, tick) <= 80);
        assert.equal(
            framework.services.state.sinceMark('b', MARK, tick),
            Number.POSITIVE_INFINITY,
            "B must not inherit A's window",
        );

        const before = totalDamage(target);
        hit(component, playerB, target);
        const dealt = totalDamage(target) - before;
        assert.ok(dealt <= 2, `B's hit should be an ordinary one, dealt ${dealt}`);
    });

    it('closes the window when the wielder dies', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension);

        use(component, player);
        assert.ok(framework.services.state.sinceMark('p', MARK, tick) <= 80);

        framework.services.state.clearLifeScope('p');
        assert.equal(framework.services.state.sinceMark('p', MARK, tick), Number.POSITIVE_INFINITY);
    });
});
