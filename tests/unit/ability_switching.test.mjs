/**
 * v2.0 ability switching: crouch cycles a sword's selectable abilities and use
 * casts the selected one.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
    ButtonState,
    InputButton,
    MockDimension,
    MockItemComponentRegistry,
    MockItemStack,
    MockPlayer,
    resetMocks,
    world,
} from '../mocks/minecraft_server.mjs';

import { createFramework, subscribeSneakSwitching } from '../../packs/CustomSwordsBP/scripts/core/bootstrap.js';
import { SWORD_COMPONENT_ID } from '../../packs/CustomSwordsBP/scripts/core/input_router.js';
import { propertyFor } from '../../packs/CustomSwordsBP/scripts/core/ability_selector.js';
import { SWORDS } from '../../packs/CustomSwordsBP/scripts/swords/index.js';
import { maxActiveAbilities } from '../../packs/CustomSwordsBP/scripts/core/rarity.js';

let tick = 0;
const clock = () => tick;

/** Three self-targeted abilities that only record that they ran. */
const casts = [];
const recorder = (name) => ({
    id: `custom_swords:${name}`,
    name: name.toUpperCase(),
    execute(ctx) {
        casts.push({ name, activation: ctx.activation });
        return { ok: true };
    },
});
const ABILITIES = [recorder('first'), recorder('second'), recorder('third'), recorder('passive')];

const SWORD = {
    id: 'custom_swords:switch_probe',
    name: 'Switch Probe',
    rarity: 'rare',
    description: 'Three abilities and a passive.',
    item: { attackDamage: 1, durability: 10 },
    abilities: [
        { activation: 'use', abilityId: 'custom_swords:first', label: 'First', cooldownTicks: 100 },
        { activation: 'use', abilityId: 'custom_swords:second', label: 'Second', cooldownTicks: 100 },
        { activation: 'use', abilityId: 'custom_swords:third', label: 'Third', cooldownTicks: 100 },
        { activation: 'attack', abilityId: 'custom_swords:passive' },
    ],
};

function setup() {
    const framework = createFramework({ clock, abilities: ABILITIES, swords: [SWORD] });
    assert.deepEqual(framework.problems, []);
    const registry = new MockItemComponentRegistry();
    framework.router.register(registry);
    const player = new MockPlayer({ id: 'p1', location: { x: 0, y: 64, z: 0 }, dimension: new MockDimension() });
    player.setMainhand(new MockItemStack(SWORD.id));
    const use = () => {
        tick += 3;
        registry.components.get(SWORD_COMPONENT_ID).onUse({ source: player, itemStack: new MockItemStack(SWORD.id) });
    };
    const tap = (holdTicks = 2) => {
        tick += 5; // separate crouches, not one crouch reported twice
        world.afterEvents.playerButtonInput.emit({ player, button: InputButton.Sneak, newButtonState: ButtonState.Pressed });
        tick += holdTicks;
        world.afterEvents.playerButtonInput.emit({ player, button: InputButton.Sneak, newButtonState: ButtonState.Released });
    };
    return { framework, player, use, tap };
}

describe('ability switching', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
        casts.length = 0;
    });

    it('casts the first ability until the player switches', () => {
        const { use } = setup();
        use();
        assert.deepEqual(casts.map((c) => c.name), ['first']);
    });

    it('tap-crouch cycles forward and wraps, and use casts the selection', () => {
        const { framework, player, use, tap } = setup();
        assert.equal(subscribeSneakSwitching(framework), true);
        assert.deepEqual(world.afterEvents.playerButtonInput.options, {
            buttons: [InputButton.Sneak],
            state: ButtonState.Pressed,
        });

        tap();
        assert.match(player.actionBarMessages.at(-1), /\[2\/3\].*Second.*Ready/);
        use();
        tap();
        use();
        tap();
        use();
        assert.deepEqual(casts.map((c) => c.name), ['second', 'third', 'first']);
        assert.ok(player.soundsHeard.some((s) => s.id === 'random.click'));
    });

    it('switches the moment you crouch down, never when you stand up', () => {
        const { framework, player, use } = setup();
        subscribeSneakSwitching(framework);
        const emit = (state) =>
            world.afterEvents.playerButtonInput.emit({ player, button: InputButton.Sneak, newButtonState: state });

        emit(ButtonState.Pressed);
        assert.match(player.actionBarMessages.at(-1), /\[2\/3\]/, 'switched on the way down');
        const shown = player.actionBarMessages.length;
        tick += 40; // hold sneak for two seconds
        emit(ButtonState.Released);
        assert.equal(player.actionBarMessages.length, shown, 'standing up does not switch');
        use();
        assert.deepEqual(casts.map((c) => c.name), ['second']);
    });

    it('one crouch reported twice in quick succession switches only once', () => {
        const { framework, player, use } = setup();
        subscribeSneakSwitching(framework);
        const press = () =>
            world.afterEvents.playerButtonInput.emit({ player, button: InputButton.Sneak, newButtonState: ButtonState.Pressed });
        press();
        tick += 1;
        press();
        use();
        assert.deepEqual(casts.map((c) => c.name), ['second']);
    });

    it('does not switch while flying, where sneak means descend', () => {
        const { framework, player, use, tap } = setup();
        subscribeSneakSwitching(framework);
        player.isFlying = true;
        tap();
        use();
        assert.deepEqual(casts.map((c) => c.name), ['first']);
    });

    it('with tap switching live, crouch + use casts instead of switching', () => {
        const { framework, player, use } = setup();
        subscribeSneakSwitching(framework);
        player.isSneaking = true;
        use();
        assert.deepEqual(casts.map((c) => c.name), ['first']);
    });

    it('falls back to crouch + use switching when the engine has no button event', () => {
        world.afterEvents.playerButtonInput = undefined;
        const { framework, player, use } = setup();
        assert.equal(subscribeSneakSwitching(framework), false);
        player.isSneaking = true;
        use();
        assert.deepEqual(casts, [], 'crouch + use switches rather than casts');
        player.isSneaking = false;
        use();
        assert.deepEqual(casts.map((c) => c.name), ['second']);
    });

    it('gives every ability its own cooldown and shows it when selected', () => {
        const { framework, player, use, tap } = setup();
        subscribeSneakSwitching(framework);
        use();
        use(); // first is cooling down
        tap();
        use(); // second is ready
        assert.deepEqual(casts.map((c) => c.name), ['first', 'second']);
        tap();
        tap(); // back to first, still cooling down
        assert.match(player.actionBarMessages.at(-1), /\[1\/3\].*First.*s/);
        assert.doesNotMatch(player.actionBarMessages.at(-1), /Ready/);
    });

    it('melee always runs the passive, whatever is selected', () => {
        const { framework, player, tap } = setup();
        subscribeSneakSwitching(framework);
        tap();
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const target = new MockPlayer({ id: 'p2', location: { x: 0, y: 64, z: 1 }, dimension: player.dimension });
        tick += 3;
        registry.components.get(SWORD_COMPONENT_ID).onHitEntity({
            attackingEntity: player,
            hitEntity: target,
            itemStack: new MockItemStack(SWORD.id),
        });
        assert.deepEqual(casts.map((c) => c.name), ['passive']);
    });

    it('remembers the selection per sword across a relog', () => {
        const first = setup();
        subscribeSneakSwitching(first.framework);
        first.tap();
        first.tap();
        assert.equal(first.player.getDynamicProperty(propertyFor(SWORD.id)), 2);

        // A fresh framework (new session) reads the stored choice back.
        resetMocks();
        const second = setup();
        second.player.dynamicProperties = first.player.dynamicProperties;
        second.use();
        assert.equal(casts.at(-1).name, 'third');
    });

    it('ignores a stored index past the end of the list', () => {
        const { player, use } = setup();
        player.setDynamicProperty(propertyFor(SWORD.id), 9);
        use();
        assert.deepEqual(casts.map((c) => c.name), ['first']);
    });

    it('a single-ability sword does nothing on crouch', () => {
        const single = { ...SWORD, id: 'custom_swords:single_probe', abilities: [SWORD.abilities[0]] };
        const framework = createFramework({ clock, abilities: ABILITIES, swords: [single] });
        const player = new MockPlayer({ id: 'p1', location: { x: 0, y: 64, z: 0 }, dimension: new MockDimension() });
        player.setMainhand(new MockItemStack(single.id));
        assert.equal(framework.router.switchAbility(player, framework.swords.require(single.id)), false);
        assert.equal(player.actionBarMessages.length, 0);
    });
});

describe('ready ping', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
        casts.length = 0;
    });

    function pingSetup() {
        const queue = [];
        const framework = createFramework({
            clock,
            abilities: ABILITIES,
            swords: [SWORD],
            fxScheduler: (callback, delay) => queue.push({ callback, at: tick + delay }),
        });
        const registry = new MockItemComponentRegistry();
        framework.router.register(registry);
        const player = new MockPlayer({ id: 'p1', location: { x: 0, y: 64, z: 0 }, dimension: new MockDimension() });
        player.setMainhand(new MockItemStack(SWORD.id));
        const use = () => {
            tick += 3;
            registry.components.get(SWORD_COMPONENT_ID).onUse({ source: player, itemStack: new MockItemStack(SWORD.id) });
        };
        const advance = (ticks) => {
            tick += ticks;
            for (const job of queue.splice(0).filter((j) => j.at <= tick)) job.callback();
        };
        return { framework, player, use, advance };
    }

    it('announces the selected ability when its cooldown ends', () => {
        const { player, use, advance } = pingSetup();
        use();
        advance(100);
        assert.match(player.actionBarMessages.at(-1), /First ready/);
        assert.ok(player.soundsHeard.some((s) => s.id === 'random.levelup'));
    });

    it('stays quiet if the wielder switched away or put the sword down', () => {
        const switched = pingSetup();
        subscribeSneakSwitching(switched.framework);
        switched.use();
        tick += 5;
        world.afterEvents.playerButtonInput.emit({ player: switched.player, button: InputButton.Sneak, newButtonState: ButtonState.Pressed });
        world.afterEvents.playerButtonInput.emit({ player: switched.player, button: InputButton.Sneak, newButtonState: ButtonState.Released });
        switched.advance(100);
        assert.doesNotMatch(switched.player.actionBarMessages.at(-1), /ready/);

        resetMocks();
        const stowed = pingSetup();
        stowed.use();
        stowed.player.setMainhand(undefined);
        stowed.advance(100);
        assert.ok(!stowed.player.actionBarMessages.some((m) => /ready/.test(m)));
    });
});

describe('shipped kits', () => {
    it('every shipped sword stays within its rarity limit and has a passive', () => {
        for (const sword of SWORDS) {
            const actives = sword.abilities.filter((b) => b.activation === 'use').length;
            assert.ok(actives >= 1, `${sword.id} has no selectable ability`);
            assert.ok(actives <= maxActiveAbilities(sword.rarity), `${sword.id} exceeds its rarity limit`);
            assert.ok(sword.abilities.some((b) => b.activation === 'attack'), `${sword.id} has no on-hit passive`);
        }
    });

    it('every selectable ability has a player-facing label', () => {
        for (const sword of SWORDS) {
            for (const binding of sword.abilities.filter((b) => b.activation === 'use')) {
                assert.ok(binding.label, `${sword.id} has an unlabelled ability`);
            }
        }
    });
});
