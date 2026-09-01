/**
 * End-to-end tests of the real framework running against the engine mock.
 *
 * These exercise the exact modules shipped inside the .mcaddon —
 * `createFramework`, the input router, the executor, the services — so a
 * regression in the wiring shows up here rather than in-game.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
    MockDimension,
    MockEntity,
    MockPlayer,
    MockItemComponentRegistry,
    resetMocks,
    system,
} from '../mocks/minecraft_server.mjs';

import { createFramework } from '../../packs/CustomSwordsBP/scripts/core/bootstrap.js';
import { SWORD_COMPONENT_ID } from '../../packs/CustomSwordsBP/scripts/core/input_router.js';
import { AbilityExecutor } from '../../packs/CustomSwordsBP/scripts/core/ability_executor.js';

const TEST_SWORD_ID = 'custom_swords:test_blade';

/** Deterministic clock shared by the framework under test. */
let tick = 0;
const clock = () => tick;

/**
 * Builds a world containing one player and `mobCount` zombies at the origin.
 *
 * @param {number} mobCount
 * @param {string} [playerId]
 */
function makeWorld(mobCount, playerId = 'player-a') {
    const dimension = new MockDimension();
    const player = new MockPlayer({ id: playerId, location: { x: 0, y: 64, z: 0 }, dimension });
    dimension.entities.push(player);
    for (let i = 0; i < mobCount; i++) {
        dimension.entities.push(
            new MockEntity({ id: `zombie-${i}`, location: { x: i * 0.5, y: 64, z: 1 }, dimension }),
        );
    }
    return { dimension, player };
}

/** @returns {{ typeId: string }} */
function testItemStack() {
    return { typeId: TEST_SWORD_ID };
}

describe('framework bootstrap', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('registers the shipped definitions with no problems', () => {
        const framework = createFramework({ clock });
        assert.deepEqual(framework.problems, []);
        assert.equal(framework.swords.has(TEST_SWORD_ID), true);
        assert.equal(framework.abilities.has('custom_swords:diagnostic_pulse'), true);
    });

    it('seals both registries so nothing can register late', () => {
        const framework = createFramework({ clock });
        assert.equal(framework.swords.isSealed, true);
        assert.equal(framework.abilities.isSealed, true);
    });

    it('rejects a malformed sword instead of registering it', () => {
        const framework = createFramework({
            clock,
            swords: [
                {
                    id: 'custom_swords:broken',
                    name: 'Broken',
                    rarity: 'nonsense',
                    description: 'invalid',
                    item: { attackDamage: 1, durability: 10 },
                    active: { abilityId: 'custom_swords:diagnostic_pulse' },
                },
            ],
        });
        assert.equal(framework.swords.size, 0);
        assert.ok(framework.problems.some((p) => p.includes("'rarity'")));
    });

    it('rejects a sword binding an ability that does not exist', () => {
        const framework = createFramework({
            clock,
            swords: [
                {
                    id: 'custom_swords:ghost',
                    name: 'Ghost',
                    rarity: 'common',
                    description: 'binds nothing real',
                    item: { attackDamage: 1, durability: 10 },
                    active: { abilityId: 'custom_swords:does_not_exist' },
                },
            ],
        });
        assert.equal(framework.swords.size, 0);
        assert.ok(framework.problems.some((p) => p.includes('unregistered ability')));
    });

    it('rejects binding parameters the ability itself refuses', () => {
        const framework = createFramework({
            clock,
            swords: [
                {
                    id: 'custom_swords:bad_params',
                    name: 'Bad Params',
                    rarity: 'common',
                    description: 'negative radius',
                    item: { attackDamage: 1, durability: 10 },
                    active: { abilityId: 'custom_swords:diagnostic_pulse', params: { radius: -3 } },
                },
            ],
        });
        assert.ok(framework.problems.some((p) => p.includes("'radius'")));
    });
});

describe('input router', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('registers exactly one custom component for the whole addon', () => {
        const framework = createFramework({ clock });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);

        assert.deepEqual([...registry.components.keys()], [SWORD_COMPONENT_ID]);
        const component = registry.components.get(SWORD_COMPONENT_ID);
        assert.equal(typeof component.onUse, 'function');
        assert.equal(typeof component.onHitEntity, 'function');
    });

    it('ignores a use event from an item that is not a registered sword', () => {
        const framework = createFramework({ clock });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const { player } = makeWorld(3);

        registry.components.get(SWORD_COMPONENT_ID).onUse({ source: player, itemStack: { typeId: 'minecraft:stick' } });

        assert.equal(player.actionBarMessages.length, 0);
    });

    it('runs the whole pipeline on use: targets, damages, emits, gives feedback', () => {
        const framework = createFramework({ clock });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const { player, dimension } = makeWorld(3);

        registry.components.get(SWORD_COMPONENT_ID).onUse({ source: player, itemStack: testItemStack() });

        const zombies = dimension.entities.filter((e) => e.typeId === 'minecraft:zombie');
        assert.equal(zombies.every((z) => z.damageTaken.length === 1), true);
        assert.equal(zombies.every((z) => z.knockbacks.length === 1), true);
        assert.equal(zombies.every((z) => z.effects[0].effect === 'slowness'), true);
        assert.ok(dimension.particles.length > 0, 'expected particles to be emitted');
        assert.ok(dimension.sounds.length > 0, 'expected a sound to be played');
        assert.match(player.actionBarMessages.at(-1), /Diagnostic Pulse/);
    });

    it('never damages the caster', () => {
        const framework = createFramework({ clock });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const { player } = makeWorld(2);

        registry.components.get(SWORD_COMPONENT_ID).onUse({ source: player, itemStack: testItemStack() });

        assert.equal(player.damageTaken.length, 0);
    });

    it('ignores a hit made by a non-player wielder', () => {
        const framework = createFramework({ clock });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const dimension = new MockDimension();
        const mob = new MockEntity({ id: 'skeleton-1', typeId: 'minecraft:skeleton', dimension });
        const victim = new MockEntity({ id: 'pig-1', typeId: 'minecraft:pig', dimension });

        // Must not throw even though `attackingEntity` is not a Player.
        registry.components.get(SWORD_COMPONENT_ID).onHitEntity({
            attackingEntity: mob,
            hitEntity: victim,
            itemStack: testItemStack(),
            hadEffect: true,
        });

        assert.equal(victim.damageTaken.length, 0);
    });
});

describe('cooldown behaviour through the executor', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    /**
     * @param {ReturnType<typeof createFramework>} framework
     * @param {MockItemComponentRegistry} registry
     * @param {MockPlayer} player
     */
    const use = (framework, registry, player) =>
        registry.components.get(SWORD_COMPONENT_ID).onUse({ source: player, itemStack: testItemStack() });

    it('blocks a second use while cooling down, then allows it', () => {
        const framework = createFramework({ clock });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const { player, dimension } = makeWorld(1);
        const zombie = dimension.entities.find((e) => e.typeId === 'minecraft:zombie');

        use(framework, registry, player);
        assert.equal(zombie.damageTaken.length, 1);

        tick += 10;
        use(framework, registry, player);
        assert.equal(zombie.damageTaken.length, 1, 'second use should be refused while on cooldown');

        tick += 60;
        use(framework, registry, player);
        assert.equal(zombie.damageTaken.length, 2, 'use should be allowed once the cooldown elapses');
    });

    it('keeps two players on independent cooldowns', () => {
        const framework = createFramework({ clock });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);

        const dimension = new MockDimension();
        const playerA = new MockPlayer({ id: 'player-a', location: { x: 0, y: 64, z: 0 }, dimension });
        const playerB = new MockPlayer({ id: 'player-b', location: { x: 0, y: 64, z: 0 }, dimension });
        const zombie = new MockEntity({ id: 'zombie-0', location: { x: 0, y: 64, z: 1 }, dimension });
        dimension.entities.push(playerA, playerB, zombie);

        use(framework, registry, playerA);
        assert.equal(zombie.damageTaken.length, 1);

        // A is now on cooldown; B has never used it and must still fire.
        use(framework, registry, playerA);
        assert.equal(zombie.damageTaken.length, 1);

        use(framework, registry, playerB);
        assert.equal(zombie.damageTaken.length, 2, "player B's use must be unaffected by player A's cooldown");
    });

    it('does not consume the cooldown when the ability finds nothing', () => {
        const framework = createFramework({ clock });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const { player } = makeWorld(0);

        use(framework, registry, player);
        const key = AbilityExecutor.cooldownKey(framework.swords.require(TEST_SWORD_ID), framework.swords.require(TEST_SWORD_ID).active, 'use');
        assert.equal(framework.services.cooldowns.isReady(player.id, key), true);
        assert.match(player.actionBarMessages.at(-1), /No targets/);
    });

    it('mirrors the cooldown onto the vanilla item HUD when a category is set', () => {
        const framework = createFramework({ clock });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const { player } = makeWorld(1);

        use(framework, registry, player);
        assert.deepEqual(player.itemCooldowns, [{ category: 'custom_swords_test_blade', ticks: 60 }]);
    });

    it('contains a throwing ability instead of letting it escape the handler', () => {
        const exploding = {
            id: 'custom_swords:exploding',
            name: 'Exploding',
            execute() {
                throw new Error('boom');
            },
        };
        const sword = {
            id: 'custom_swords:unstable',
            name: 'Unstable',
            rarity: 'rare',
            description: 'throws on use',
            item: { attackDamage: 1, durability: 10 },
            active: { abilityId: 'custom_swords:exploding', cooldownTicks: 20 },
        };
        const framework = createFramework({ clock, abilities: [exploding], swords: [sword] });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const { player } = makeWorld(0);

        const result = registry.components
            .get(SWORD_COMPONENT_ID)
            .onUse({ source: player, itemStack: { typeId: sword.id } });

        assert.equal(result, undefined, 'the router must not rethrow');
        // A failed ability must not start a cooldown.
        assert.equal(framework.services.cooldowns.isReady(player.id, `${sword.id}#use`), true);
    });
});
