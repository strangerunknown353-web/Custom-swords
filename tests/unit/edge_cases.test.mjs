/**
 * The edge cases this milestone commits to handling.
 *
 * Every one of these is a situation a real world produces constantly — a mob
 * dying mid-sweep, a player logging out mid-cast, two people firing at once —
 * and every one must fail safely rather than throw out of an engine handler.
 * They are gathered in one file so the list can be read against the brief.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
    MockDimension,
    MockEntity,
    MockItemStack,
    MockPlayer,
    MockItemComponentRegistry,
    resetMocks,
    world,
} from '../mocks/minecraft_server.mjs';
import { createFramework, subscribePlayerLifecycle } from '../../packs/CustomSwordsBP/scripts/core/bootstrap.js';
import { SWORD_COMPONENT_ID } from '../../packs/CustomSwordsBP/scripts/core/input_router.js';
import { lifeKey } from '../../packs/CustomSwordsBP/scripts/core/player_state.js';

const TEST_SWORD = 'custom_swords:test_blade';
const EARTH = 'custom_swords:earth_sword';
const THUNDER = 'custom_swords:thunder_sword';

let tick = 0;
const clock = () => tick;

function install() {
    const framework = createFramework({ clock });
    const registry = new MockItemComponentRegistry();
    framework.router.register(registry);
    subscribePlayerLifecycle(framework);
    return { framework, component: registry.components.get(SWORD_COMPONENT_ID) };
}

/**
 * @param {MockDimension} dimension
 * @param {string} id
 * @param {number} z
 */
function zombie(dimension, id, z = 2) {
    const entity = new MockEntity({ id, location: { x: 0, y: 64, z }, dimension });
    dimension.entities.push(entity);
    return entity;
}

/**
 * @param {MockDimension} dimension
 * @param {string} id
 * @param {string} [sword]
 */
function wielder(dimension, id, sword = TEST_SWORD) {
    const player = new MockPlayer({ id, location: { x: 0, y: 64, z: 0 }, dimension });
    player.setMainhand(new MockItemStack(sword));
    dimension.entities.push(player);
    return player;
}

/** @param {any} component @param {MockPlayer} player @param {string} [sword] */
function use(component, player, sword = TEST_SWORD) {
    tick += 30; // clear the anti-spam floor and hit protection
    return component.onUse({ source: player, itemStack: new MockItemStack(sword) });
}

describe('edge cases', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('an ability with no valid target does nothing and consumes no cooldown', () => {
        const { framework, component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');

        use(component, player);

        assert.equal(framework.services.cooldowns.isReady(player.id, `${TEST_SWORD}#use`), true);
        assert.match(player.actionBarMessages.at(-1), /Nothing in range/);
    });

    it('a target that dies mid-execution does not abort the rest of the sweep', () => {
        const { component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        const dying = zombie(dimension, 'dying', 1);
        const survivor = zombie(dimension, 'survivor', 2);

        // The engine can invalidate a handle the instant it dies.
        dying.applyDamage = () => {
            dying.isValid = false;
            throw new Error('entity removed');
        };

        assert.doesNotThrow(() => use(component, player));
        assert.equal(survivor.damageTaken.length, 1, 'the survivor must still be hit');
    });

    it('multiple targets dying simultaneously is survivable', () => {
        const { component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        for (let i = 0; i < 5; i++) {
            const mob = zombie(dimension, `z${i}`, 1 + i * 0.2);
            mob.applyDamage = () => {
                mob.isValid = false;
                throw new Error('entity removed');
            };
        }
        assert.doesNotThrow(() => use(component, player));
    });

    it('a player who dies mid-cast does not corrupt anything', () => {
        const { framework, component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        zombie(dimension, 'z1');

        framework.services.state.set(player.id, lifeKey('combo'), 4);
        use(component, player);

        world.afterEvents.entityDie.emit({ deadEntity: player, damageSource: {} });

        assert.equal(framework.services.state.get(player.id, lifeKey('combo'), 0), 0, 'life state clears on death');
        assert.equal(
            framework.services.cooldowns.isReady(player.id, `${TEST_SWORD}#use`),
            false,
            'dying must not reset a cooldown',
        );
    });

    it('a respawn clears life state but leaves cooldowns running', () => {
        const { framework } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');

        framework.services.cooldowns.start(player.id, 'custom_swords:ultimate', 400);
        framework.services.state.set(player.id, lifeKey('charge'), 3);

        world.afterEvents.playerSpawn.emit({ player, initialSpawn: false });

        assert.equal(framework.services.state.get(player.id, lifeKey('charge'), 0), 0);
        assert.equal(framework.services.cooldowns.remaining(player.id, 'custom_swords:ultimate'), 400);
    });

    it('a disconnect releases everything for that player and nobody else', () => {
        const { framework } = install();
        const { cooldowns, state } = framework.services;

        cooldowns.start('player-a', 'k', 200);
        cooldowns.start('player-b', 'k', 200);
        state.set('player-a', 'x', 1);
        state.set('player-b', 'x', 1);

        world.afterEvents.playerLeave.emit({ playerId: 'player-a', playerName: 'A' });

        assert.equal(cooldowns.isReady('player-a', 'k'), true);
        assert.equal(cooldowns.isReady('player-b', 'k'), false, "player B's cooldown must survive");
        assert.equal(state.get('player-b', 'x', 0), 1);
    });

    it('a dimension change is handled because nothing caches a dimension', () => {
        const { component } = install();
        const overworld = new MockDimension('minecraft:overworld');
        const nether = new MockDimension('minecraft:nether');
        const player = wielder(overworld, 'player-a');
        const inNether = zombie(nether, 'nether-zombie', 2);

        // The player moves; the ability must act in the new dimension.
        player.dimension = nether;
        nether.entities.push(player);
        use(component, player);

        assert.equal(inNether.damageTaken.length, 1);
    });

    it('a very large mob group is capped by the target ceiling', () => {
        const { framework, component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a', EARTH);
        for (let i = 0; i < 200; i++) zombie(dimension, `z${i}`, 1 + (i % 5) * 0.3);

        use(component, player, EARTH);

        const hit = dimension.entities.filter((e) => e.damageTaken?.length > 0).length;
        const cap = framework.swords.require(EARTH).abilities[0].targeting.maxTargets;
        assert.ok(hit <= cap, `expected at most ${cap} targets, ${hit} were hit`);
        assert.ok(hit > 0, 'the ability should still connect');
    });

    it('an entity from another add-on is never swept up by a category-filtered ability', () => {
        const { component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        // No minecraft:type_family — an add-on that skips the convention.
        const foreign = new MockEntity({
            id: 'foreign-1',
            typeId: 'other_addon:sentinel',
            location: { x: 0, y: 64, z: 2 },
            dimension,
            families: [],
        });
        dimension.entities.push(foreign);

        use(component, player); // the diagnostic sword's use binding is hostile-only

        assert.equal(foreign.damageTaken.length, 0);
    });

    it('a vanilla passive mob is spared by a hostile-only ability', () => {
        const { component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        const pig = new MockEntity({ id: 'pig', typeId: 'minecraft:pig', location: { x: 0, y: 64, z: 2 }, dimension });
        const mob = zombie(dimension, 'z1', 2);
        dimension.entities.push(pig);

        use(component, player);

        assert.equal(pig.damageTaken.length, 0, 'the pig must be spared');
        assert.equal(mob.damageTaken.length, 1);
    });

    it('spamming activations cannot outpace the rate limiter', () => {
        const { component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        const mob = zombie(dimension, 'z1');

        for (let i = 0; i < 50; i++) {
            component.onUse({ source: player, itemStack: new MockItemStack(TEST_SWORD) });
        }
        assert.equal(mob.damageTaken.length, 1, 'fifty presses in one tick must land exactly one hit');
    });

    it('a point-targeted ability still resolves when nothing blocks the ray', () => {
        const { component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a', THUNDER);
        // No block raycast result in the mock: it must fall back to max reach.
        const distant = zombie(dimension, 'distant', 14);

        assert.doesNotThrow(() => use(component, player, THUNDER));
        assert.equal(distant.damageTaken.length, 1, 'the bolt should land near where the player looks');
    });
});

describe('multiplayer isolation', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('two players firing different swords keep separate cooldowns and targets', () => {
        // The brief's scenario: A strikes zombie A, B bursts on zombie B.
        const { framework, component } = install();
        const dimension = new MockDimension();

        const playerA = wielder(dimension, 'player-a', THUNDER);
        const playerB = wielder(dimension, 'player-b', EARTH);
        playerB.location = { x: 40, y: 64, z: 0 };

        // Thunder's bolt lands where the player looks; in open air that is its
        // full 16-block reach, so A's target stands there.
        const zombieA = zombie(dimension, 'zombie-a', 16);
        const zombieB = new MockEntity({ id: 'zombie-b', location: { x: 40, y: 64, z: 2 }, dimension });
        dimension.entities.push(zombieB);

        use(component, playerA, THUNDER);
        use(component, playerB, EARTH);

        assert.ok(zombieA.damageTaken.length > 0, "A's bolt should hit A's target");
        assert.ok(zombieB.damageTaken.length > 0, "B's quake should hit B's target");

        // Cooldowns are per player AND per sword; neither key leaks.
        assert.equal(framework.services.cooldowns.isReady('player-a', `${THUNDER}#use`), false);
        assert.equal(framework.services.cooldowns.isReady('player-b', `${THUNDER}#use`), true);
        assert.equal(framework.services.cooldowns.isReady('player-a', `${EARTH}#use`), true);
        assert.equal(framework.services.cooldowns.isReady('player-b', `${EARTH}#use`), false);
    });

    it("one player's area ability never reaches another player's distant fight", () => {
        const { component } = install();
        const dimension = new MockDimension();
        const playerA = wielder(dimension, 'player-a', EARTH);
        const far = new MockEntity({ id: 'far', location: { x: 60, y: 64, z: 0 }, dimension });
        dimension.entities.push(far);

        use(component, playerA, EARTH);
        assert.equal(far.damageTaken.length, 0);
    });

    it('hit protection is per attacker, so two players can both strike one target', () => {
        const { component } = install();
        const dimension = new MockDimension();
        const playerA = wielder(dimension, 'player-a');
        const playerB = wielder(dimension, 'player-b');
        const shared = zombie(dimension, 'shared', 2);

        tick += 30;
        component.onUse({ source: playerA, itemStack: new MockItemStack(TEST_SWORD) });
        component.onUse({ source: playerB, itemStack: new MockItemStack(TEST_SWORD) });

        assert.equal(shared.damageTaken.length, 2, 'both players should land their hit');
    });

    it('a player using a sword they no longer hold is refused', () => {
        const { component } = install();
        const dimension = new MockDimension();
        const player = wielder(dimension, 'player-a');
        const mob = zombie(dimension, 'z1');

        player.setMainhand(new MockItemStack('minecraft:dirt'));
        use(component, player);

        assert.equal(mob.damageTaken.length, 0);
    });
});
