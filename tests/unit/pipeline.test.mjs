/**
 * End-to-end tests of the real Ability Engine running against the engine mock.
 *
 * These exercise the exact modules shipped inside the .mcaddon —
 * `createFramework`, the input router, the validation gate, the executor, the
 * services — so a regression in the wiring shows up here rather than in-game.
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
} from '../mocks/minecraft_server.mjs';

import { createFramework } from '../../packs/CustomSwordsBP/scripts/core/bootstrap.js';
import { SWORD_COMPONENT_ID } from '../../packs/CustomSwordsBP/scripts/core/input_router.js';
import { AbilityExecutor } from '../../packs/CustomSwordsBP/scripts/core/ability_executor.js';

const TEST_SWORD_ID = 'custom_swords:test_blade';

/** Deterministic clock shared by the framework under test. */
let tick = 0;
const clock = () => tick;

/**
 * Builds a world containing one player holding the test sword, plus `mobCount`
 * zombies just in front of them.
 *
 * @param {number} mobCount
 * @param {object} [options]
 */
function makeWorld(mobCount, { playerId = 'player-a', swordId = TEST_SWORD_ID, distance = 1 } = {}) {
    const dimension = new MockDimension();
    const player = new MockPlayer({ id: playerId, location: { x: 0, y: 64, z: 0 }, dimension });
    player.setMainhand(new MockItemStack(swordId));
    dimension.entities.push(player);
    for (let i = 0; i < mobCount; i++) {
        dimension.entities.push(
            new MockEntity({ id: `zombie-${i}`, location: { x: i * 0.5, y: 64, z: distance }, dimension }),
        );
    }
    return { dimension, player };
}

/**
 * @param {ReturnType<typeof createFramework>} framework
 * @returns {MockItemComponentRegistry}
 */
function install(framework) {
    const registry = new MockItemComponentRegistry();
    framework.router.register(registry);
    return registry;
}

/** @param {MockItemComponentRegistry} registry */
const component = (registry) => registry.components.get(SWORD_COMPONENT_ID);

/**
 * Fires a use activation. Advances the clock past the anti-spam floor first, so
 * tests exercise cooldowns rather than the rate limiter — which has its own
 * test.
 *
 * @param {MockItemComponentRegistry} registry
 * @param {MockPlayer} player
 * @param {string} [swordId]
 */
const use = (registry, player, swordId = TEST_SWORD_ID) => {
    tick += 3;
    return component(registry).onUse({ source: player, itemStack: new MockItemStack(swordId) });
};

/** @param {object} overrides */
function swordDefinition(overrides = {}) {
    return {
        id: 'custom_swords:probe',
        name: 'Probe',
        rarity: 'common',
        description: 'A probe sword.',
        item: { attackDamage: 1, durability: 10 },
        abilities: [{ activation: 'use', abilityId: 'custom_swords:burst', targeting: { type: 'area', range: 5 } }],
        ...overrides,
    };
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
        assert.equal(framework.abilities.has('custom_swords:burst'), true);
    });

    it('seals both registries so nothing can register late', () => {
        const framework = createFramework({ clock });
        assert.equal(framework.swords.isSealed, true);
        assert.equal(framework.abilities.isSealed, true);
    });

    it('indexes which swords use each ability', () => {
        const framework = createFramework({ clock });
        const usage = framework.abilities.swordsUsing('custom_swords:burst');
        // The diagnostic sword binds `burst` on use; the elemental collection
        // binds the rest, so nothing should be orphaned.
        assert.ok(usage.some((u) => u.swordId === TEST_SWORD_ID && u.activation === 'use'));
        assert.deepEqual(framework.abilities.unused(), []);
    });

    it('rejects a malformed sword instead of registering it', () => {
        const framework = createFramework({ clock, swords: [swordDefinition({ rarity: 'nonsense' })] });
        assert.equal(framework.swords.size, 0);
        assert.ok(framework.problems.some((p) => p.includes("'rarity'")));
    });

    it('rejects a sword binding an ability that does not exist', () => {
        const framework = createFramework({
            clock,
            swords: [swordDefinition({ abilities: [{ activation: 'use', abilityId: 'custom_swords:nope' }] })],
        });
        assert.equal(framework.swords.size, 0);
        assert.ok(framework.problems.some((p) => p.includes('unregistered ability')));
    });

    it('rejects binding parameters the ability itself refuses', () => {
        const framework = createFramework({
            clock,
            swords: [
                swordDefinition({
                    abilities: [
                        {
                            activation: 'use',
                            abilityId: 'custom_swords:burst',
                            targeting: { type: 'area', range: 4 },
                            params: { damage: -3 },
                        },
                    ],
                }),
            ],
        });
        assert.ok(framework.problems.some((p) => p.includes("'damage'")));
    });

    it('rejects a ranged targeting spec with no range', () => {
        // The nastiest possible failure mode: the ability silently finds
        // nothing and looks broken. Validation must catch it at load.
        const framework = createFramework({
            clock,
            swords: [
                swordDefinition({
                    abilities: [
                        { activation: 'use', abilityId: 'custom_swords:burst', targeting: { type: 'area' } },
                    ],
                }),
            ],
        });
        assert.equal(framework.swords.size, 0);
        assert.ok(framework.problems.some((p) => p.includes("requires a positive 'range'")));
    });
});

describe('input router and activation', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('registers exactly one custom component for the whole addon', () => {
        const registry = install(createFramework({ clock }));
        assert.deepEqual([...registry.components.keys()], [SWORD_COMPONENT_ID]);
        assert.equal(typeof component(registry).onUse, 'function');
        assert.equal(typeof component(registry).onHitEntity, 'function');
    });

    it('ignores a use event from an item that is not a registered sword', () => {
        const registry = install(createFramework({ clock }));
        const { player } = makeWorld(3);
        component(registry).onUse({ source: player, itemStack: new MockItemStack('minecraft:stick') });
        assert.equal(player.actionBarMessages.length, 0);
    });

    it('runs the whole pipeline on use: targets, damages, emits, gives feedback', () => {
        const registry = install(createFramework({ clock }));
        const { player, dimension } = makeWorld(3);

        use(registry, player);

        const zombies = dimension.entities.filter((e) => e.typeId === 'minecraft:zombie');
        assert.equal(zombies.every((z) => z.damageTaken.length === 1), true);
        assert.equal(zombies.every((z) => z.knockbacks.length === 1), true);
        assert.equal(zombies.every((z) => z.effects[0].effect === 'slowness'), true);
        assert.ok(dimension.particles.length > 0, 'expected particles');
        assert.ok(dimension.sounds.length > 0, 'expected a sound');
        assert.match(player.actionBarMessages.at(-1), /Burst/);
    });

    it('routes sneak + use to the sword\'s sneak binding', () => {
        const registry = install(createFramework({ clock }));
        const { player, dimension } = makeWorld(1, { distance: 6 });
        const zombie = dimension.entities.find((e) => e.typeId === 'minecraft:zombie');

        // Standing: the area binding has range 4, so a mob 6 blocks out is missed.
        use(registry, player);
        assert.equal(zombie.damageTaken.length, 0, 'the standing burst should not reach 6 blocks');

        // Sneaking: the single-target binding reaches 7 blocks and hits harder.
        tick += 200;
        player.isSneaking = true;
        use(registry, player);
        assert.equal(zombie.damageTaken.length, 1, 'the sneak binding should reach it');
        assert.equal(zombie.effects.at(-1).effect, 'weakness', 'the sneak envelope applies weakness, not slowness');
    });

    it('falls back to the base activation when no sneak binding exists', () => {
        const sword = swordDefinition({
            abilities: [
                {
                    activation: 'use',
                    abilityId: 'custom_swords:burst',
                    targeting: { type: 'area', range: 5 },
                    params: { damage: 2 },
                },
            ],
        });
        const registry = install(createFramework({ clock, swords: [sword] }));
        const { player, dimension } = makeWorld(1, { swordId: sword.id });
        const zombie = dimension.entities.find((e) => e.typeId === 'minecraft:zombie');

        player.isSneaking = true;
        use(registry, player, sword.id);
        assert.equal(zombie.damageTaken.length, 1, 'crouching must not silently disable the sword');
    });

    it('does nothing when a sword binds no matching activation', () => {
        const sword = swordDefinition({
            abilities: [{ activation: 'attack', abilityId: 'custom_swords:burst' }],
        });
        const registry = install(createFramework({ clock, swords: [sword] }));
        const { player } = makeWorld(2, { swordId: sword.id });

        use(registry, player, sword.id);
        assert.equal(player.actionBarMessages.length, 0);
    });

    it('routes a melee hit to the attack binding', () => {
        const sword = swordDefinition({
            abilities: [
                {
                    activation: 'attack',
                    abilityId: 'custom_swords:burst',
                    targeting: { type: 'area', range: 3 },
                    params: { damage: 2, knockback: 0 },
                },
            ],
        });
        const registry = install(createFramework({ clock, swords: [sword] }));
        const { player, dimension } = makeWorld(1, { swordId: sword.id });
        const zombie = dimension.entities.find((e) => e.typeId === 'minecraft:zombie');

        component(registry).onHitEntity({
            attackingEntity: player,
            hitEntity: zombie,
            itemStack: new MockItemStack(sword.id),
            hadEffect: true,
        });
        assert.equal(zombie.damageTaken.length, 1);
        assert.equal(player.actionBarMessages.length, 0, 'melee activations must not spam the action bar');
    });

    it('ignores a hit made by a non-player wielder', () => {
        const registry = install(createFramework({ clock }));
        const dimension = new MockDimension();
        const mob = new MockEntity({ id: 'skeleton-1', typeId: 'minecraft:skeleton', dimension });
        const victim = new MockEntity({ id: 'pig-1', typeId: 'minecraft:pig', dimension });

        component(registry).onHitEntity({
            attackingEntity: mob,
            hitEntity: victim,
            itemStack: new MockItemStack(TEST_SWORD_ID),
            hadEffect: true,
        });
        assert.equal(victim.damageTaken.length, 0);
    });

    it('never damages the caster', () => {
        const registry = install(createFramework({ clock }));
        const { player } = makeWorld(2);
        use(registry, player);
        assert.equal(player.damageTaken.length, 0);
    });

    it('drives targeting, effects and damage from the binding, not from code', () => {
        // The same ability, bound twice with different envelopes, must behave
        // differently. This is the property the whole framework rests on.
        const base = {
            abilityId: 'custom_swords:burst',
            sounds: { cast: 'ability_cast' },
        };
        const wide = swordDefinition({
            id: 'custom_swords:wide',
            abilities: [
                {
                    ...base,
                    activation: 'use',
                    targeting: { type: 'area', range: 10 },
                    effects: [{ effect: 'weakness', durationTicks: 60 }],
                    params: { damage: 1 },
                },
            ],
        });
        const narrow = swordDefinition({
            id: 'custom_swords:narrow',
            abilities: [
                { ...base, activation: 'use', targeting: { type: 'area', range: 1 }, params: { damage: 1 } },
            ],
        });

        const registry = install(createFramework({ clock, swords: [wide, narrow] }));
        const dimension = new MockDimension();
        const player = new MockPlayer({ id: 'player-a', location: { x: 0, y: 64, z: 0 }, dimension });
        const near = new MockEntity({ id: 'near', location: { x: 0, y: 64, z: 1 }, dimension });
        const distant = new MockEntity({ id: 'distant', location: { x: 0, y: 64, z: 6 }, dimension });
        dimension.entities.push(player, near, distant);

        player.setMainhand(new MockItemStack(wide.id));
        use(registry, player, wide.id);
        assert.equal(distant.damageTaken.length, 1, 'range 10 must reach the distant mob');
        assert.equal(near.effects[0].effect, 'weakness', 'the effect comes from the binding');

        tick += 100;
        player.setMainhand(new MockItemStack(narrow.id));
        use(registry, player, narrow.id);
        assert.equal(distant.damageTaken.length, 1, 'range 1 must not reach the distant mob');
        assert.equal(near.effects.length, 1, 'an empty effects list must apply nothing');
    });
});

describe('cooldown behaviour through the executor', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('blocks a second use while cooling down, then allows it', () => {
        const registry = install(createFramework({ clock }));
        const { player, dimension } = makeWorld(1);
        const zombie = dimension.entities.find((e) => e.typeId === 'minecraft:zombie');

        use(registry, player);
        assert.equal(zombie.damageTaken.length, 1);

        tick += 10;
        use(registry, player);
        assert.equal(zombie.damageTaken.length, 1, 'second use should be refused while on cooldown');

        tick += 60;
        use(registry, player);
        assert.equal(zombie.damageTaken.length, 2, 'use should be allowed once the cooldown elapses');
    });

    it('keeps two players on independent cooldowns', () => {
        const registry = install(createFramework({ clock }));
        const dimension = new MockDimension();
        const playerA = new MockPlayer({ id: 'player-a', location: { x: 0, y: 64, z: 0 }, dimension });
        const playerB = new MockPlayer({ id: 'player-b', location: { x: 0, y: 64, z: 0 }, dimension });
        for (const p of [playerA, playerB]) p.setMainhand(new MockItemStack(TEST_SWORD_ID));
        const zombie = new MockEntity({ id: 'zombie-0', location: { x: 0, y: 64, z: 1 }, dimension });
        dimension.entities.push(playerA, playerB, zombie);

        use(registry, playerA);
        assert.equal(zombie.damageTaken.length, 1);

        use(registry, playerA);
        assert.equal(zombie.damageTaken.length, 1, 'player A is on cooldown');

        use(registry, playerB);
        assert.equal(zombie.damageTaken.length, 2, "player B's use must be unaffected by player A's cooldown");
    });

    it('keeps a sword\'s two activations on independent cooldowns', () => {
        const framework = createFramework({ clock });
        const registry = install(framework);
        const { player, dimension } = makeWorld(1, { distance: 2 });
        const zombie = dimension.entities.find((e) => e.typeId === 'minecraft:zombie');

        use(registry, player);
        assert.equal(zombie.damageTaken.length, 1);

        // Past the per-target hit-protection window, so this test measures
        // cooldowns rather than that. The standing burst is still cooling down;
        // the sneak strike runs on its own timer.
        tick += 20;
        player.isSneaking = true;
        use(registry, player);
        assert.equal(zombie.damageTaken.length, 2, 'the sneak binding has its own cooldown');
    });

    it('protects a target from being re-hit by the same player immediately', () => {
        const framework = createFramework({ clock });
        const registry = install(framework);
        const { player, dimension } = makeWorld(1, { distance: 2 });
        const zombie = dimension.entities.find((e) => e.typeId === 'minecraft:zombie');

        use(registry, player);
        assert.equal(zombie.damageTaken.length, 1);

        // Different activation, so no cooldown blocks it — but the target is
        // still inside its hit-protection window.
        player.isSneaking = true;
        use(registry, player);
        assert.equal(zombie.damageTaken.length, 1, 'the follow-up hit must be absorbed');
    });

    it('rate-limits activations below the anti-spam floor', () => {
        const framework = createFramework({ clock });
        const registry = install(framework);
        const { player, dimension } = makeWorld(1);
        const zombie = dimension.entities.find((e) => e.typeId === 'minecraft:zombie');

        // Two activations in the same tick: the second must never reach the
        // ability, regardless of cooldowns.
        component(registry).onUse({ source: player, itemStack: new MockItemStack(TEST_SWORD_ID) });
        component(registry).onUse({ source: player, itemStack: new MockItemStack(TEST_SWORD_ID) });
        assert.equal(zombie.damageTaken.length, 1);
    });

    it('does not consume the cooldown when the ability finds nothing', () => {
        const framework = createFramework({ clock });
        const registry = install(framework);
        const { player } = makeWorld(0);

        use(registry, player);
        const sword = framework.swords.require(TEST_SWORD_ID);
        const key = AbilityExecutor.cooldownKey(sword, sword.abilities[0]);
        assert.equal(framework.services.cooldowns.isReady(player.id, key), true);
        assert.match(player.actionBarMessages.at(-1), /Nothing in range/);
    });

    it('mirrors the cooldown onto the vanilla item HUD when a category is set', () => {
        const registry = install(createFramework({ clock }));
        const { player } = makeWorld(1);
        use(registry, player);
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
        const sword = swordDefinition({
            id: 'custom_swords:unstable',
            abilities: [{ activation: 'use', abilityId: exploding.id, cooldownTicks: 20 }],
        });
        const framework = createFramework({ clock, abilities: [exploding], swords: [sword] });
        const registry = install(framework);
        const { player } = makeWorld(0, { swordId: sword.id });

        assert.doesNotThrow(() => use(registry, player, sword.id));
        // A failed ability must not start a cooldown.
        assert.equal(framework.services.cooldowns.isReady(player.id, `${sword.id}#use`), true);
    });
});
