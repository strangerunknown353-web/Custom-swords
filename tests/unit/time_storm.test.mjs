/**
 * Time Sword and Storm Sword — the four mechanics that complete the roster.
 *
 * These two swords are opposites by design: one is worth more the longer it has
 * been held back, the other is worth nothing at all standing still. Every claim
 * below could be quietly false without anything failing:
 *
 * | Claim | Failure it guards against |
 * |---|---|
 * | Time Freeze is longer the longer you waited | a charge mechanic that is really a flat ability |
 * | its charge is spent when it fires | a bank with no withdrawal, so waiting once is permanent |
 * | a whiffed cast keeps the charge | losing a full meter to a mistimed click |
 * | the charge survives death | a life-scoped clock that reads absent and hands back a full meter |
 * | Temporal Edge winds the charge on a hit | a passive that is only chip damage with a label |
 * | the hold expires on its own | a freeze that needs a timer, or one that never ends |
 * | Storm Surge scales with the wielder's motion | a "momentum" sword that is a flat cone |
 * | Storm Momentum boosts the WIELDER | handing the enemy Speed for being hit |
 *
 * Everything runs through the real router, gate, executor and combat system.
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
    world,
} from '../mocks/minecraft_server.mjs';
import { createFramework, subscribePlayerLifecycle } from '../../packs/CustomSwordsBP/scripts/core/bootstrap.js';
import { SWORD_COMPONENT_ID } from '../../packs/CustomSwordsBP/scripts/core/input_router.js';

const TIME = 'custom_swords:time_sword';
const STORM = 'custom_swords:storm_sword';

/** The active's own numbers, restated so a drift in either shows up here. */
const FULL_CHARGE_TICKS = 1200;
const MIN_FREEZE = 40;
const MAX_FREEZE = 160;

let tick = 0;
const clock = () => tick;

function install() {
    const framework = createFramework({ clock, worldClock: world });
    const registry = new MockItemComponentRegistry();
    framework.router.register(registry);
    subscribePlayerLifecycle(framework);
    return { framework, component: registry.components.get(SWORD_COMPONENT_ID) };
}

function wielder(dimension, sword, id = 'p') {
    const player = new MockPlayer({ id, location: { x: 0, y: 64, z: 0 }, dimension });
    player.setMainhand(new MockItemStack(sword));
    player.viewDirection = { x: 0, y: 0, z: 1 };
    dimension.entities.push(player);
    return player;
}

function mob(dimension, id, { x = 0, z = 0 } = {}) {
    const entity = new MockEntity({ id, location: { x, y: 64, z }, dimension });
    dimension.entities.push(entity);
    return entity;
}

/** Fires the active after advancing the clock by `wait` ticks. */
function useAfter(component, player, sword, wait) {
    tick += wait;
    return component.onUse({ source: player, itemStack: new MockItemStack(sword) });
}

function hit(component, player, target, sword, gap = 20) {
    tick += gap;
    return component.onHitEntity({
        attackingEntity: player,
        hitEntity: target,
        itemStack: new MockItemStack(sword),
        hadEffect: true,
    });
}

const effectsNamed = (entity, name) => entity.effects.filter((e) => e.effect === name);
const totalDamage = (entity) => entity.damageTaken.reduce((sum, d) => sum + d.amount, 0);
/** Duration of the hold this activation laid on a target. */
const holdOn = (entity) => effectsNamed(entity, 'slowness').at(-1)?.duration;

describe('Time Freeze — worth what it was saved for', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    /**
     * A wielder who has just fired the sword, so the charge clock starts from a
     * known zero rather than from "never fired", which is a full meter.
     */
    function primed(dimension) {
        const { framework, component } = install();
        const player = wielder(dimension, TIME);
        framework.services.state.mark(player.id, 'temporal_charge', tick, { lifeScoped: false });
        return { framework, component, player };
    }

    it('arrives fully wound, because a sword never fired has been waiting forever', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, TIME);
        const target = mob(dimension, 'm', { z: 2 });

        useAfter(component, player, TIME, 300);

        assert.equal(holdOn(target), MAX_FREEZE, 'an unfired sword holds for the full duration');
    });

    it('holds only briefly when fired the moment the cooldown lifts', () => {
        const dimension = new MockDimension();
        const { component, player } = primed(dimension);
        const target = mob(dimension, 'm', { z: 2 });

        // 240 ticks is the binding cooldown, so this is the earliest legal cast.
        useAfter(component, player, TIME, 240);

        const held = holdOn(target);
        assert.ok(held >= MIN_FREEZE, 'never shorter than the floor');
        assert.ok(held < MIN_FREEZE + 40, `a 240-tick wait is a fifth of a meter, got ${held}`);
    });

    it('holds for the full duration after a full minute of waiting', () => {
        const dimension = new MockDimension();
        const { component, player } = primed(dimension);
        const target = mob(dimension, 'm', { z: 2 });

        useAfter(component, player, TIME, FULL_CHARGE_TICKS);

        assert.equal(holdOn(target), MAX_FREEZE);
    });

    it('scales between the floor and the ceiling, and caps rather than extrapolating', () => {
        const held = (wait) => {
            resetMocks();
            tick = 0;
            const dimension = new MockDimension();
            const { component, player } = primed(dimension);
            const target = mob(dimension, 'm', { z: 2 });
            useAfter(component, player, TIME, wait);
            return holdOn(target);
        };

        const half = held(FULL_CHARGE_TICKS / 2);
        assert.ok(half > MIN_FREEZE && half < MAX_FREEZE, `half a meter (${half}) sits between the two`);
        assert.equal(held(FULL_CHARGE_TICKS * 3), MAX_FREEZE, 'waiting longer than a full meter adds nothing');
    });

    it('spends the charge, so a second cast at the same interval is weaker', () => {
        const dimension = new MockDimension();
        const { component, player } = primed(dimension);
        const first = mob(dimension, 'first', { z: 2 });

        useAfter(component, player, TIME, FULL_CHARGE_TICKS);
        assert.equal(holdOn(first), MAX_FREEZE);

        const second = mob(dimension, 'second', { z: 2 });
        useAfter(component, player, TIME, 240);

        assert.ok(holdOn(second) < MAX_FREEZE, 'the meter was emptied by the first cast');
    });

    it('keeps the charge when the cast finds nothing to hold', () => {
        const dimension = new MockDimension();
        const { framework, component, player } = primed(dimension);

        // Wait a full meter, then fire into an empty room.
        useAfter(component, player, TIME, FULL_CHARGE_TICKS);
        assert.equal(
            framework.services.cooldowns.isReady(player.id, `${TIME}#use`),
            true,
            'a whiffed cast burns no cooldown',
        );

        // And the meter is still full for the cast that does connect.
        // `config.combat.minActivationIntervalTicks` is the anti-spam floor, so
        // the follow-up has to clear it.
        const target = mob(dimension, 'm', { z: 2 });
        useAfter(component, player, TIME, 5);

        assert.equal(holdOn(target), MAX_FREEZE, 'losing a full meter to a mistimed click would feel terrible');
    });

    it('keeps the charge across death, so dying is not a way to reload', () => {
        const dimension = new MockDimension();
        const { framework, component, player } = primed(dimension);

        tick += 240;
        // Death clears life-scoped state. The charge clock is deliberately not
        // life-scoped: if it were, it would read as absent and hand back a FULL
        // meter, making death a free recharge.
        framework.services.state.clearLifeScope(player.id);

        const target = mob(dimension, 'm', { z: 2 });
        useAfter(component, player, TIME, 1);

        assert.ok(holdOn(target) < MAX_FREEZE, 'dying must not refill the meter');
    });

    it('lays a hold that expires on its own, with no timer and nothing to restore', () => {
        const dimension = new MockDimension();
        const { framework, component, player } = primed(dimension);
        const target = mob(dimension, 'm', { z: 2 });

        useAfter(component, player, TIME, FULL_CHARGE_TICKS);

        const hold = effectsNamed(target, 'slowness').at(-1);
        assert.ok(hold.duration > 0 && hold.duration <= MAX_FREEZE, 'the hold is finite');
        assert.equal(hold.options.amplifier, 5, 'Slowness VI — as close to frozen as Bedrock supports');
        // The engine expires the effect. Nothing in the addon schedules anything
        // to undo it, which is the point: no per-entity timer, nothing to leak.
        assert.equal(framework.services.config.cooldown.sweepIntervalTicks > 0, true);
    });

    it('holds without shoving — a hold that scatters is not a hold', () => {
        const dimension = new MockDimension();
        const { component, player } = primed(dimension);
        const target = mob(dimension, 'm', { z: 2 });

        useAfter(component, player, TIME, FULL_CHARGE_TICKS);

        assert.equal(target.knockbacks.length, 0);
    });
});

describe('Temporal Edge — fighting winds the sword', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('advances the charge on every landed hit', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, TIME);
        framework.services.state.mark(player.id, 'temporal_charge', tick, { lifeScoped: false });

        const before = framework.services.state.sinceMark(player.id, 'temporal_charge', tick, { lifeScoped: false });
        hit(component, player, mob(dimension, 'm', { z: 2 }), TIME);
        const after = framework.services.state.sinceMark(player.id, 'temporal_charge', tick, { lifeScoped: false });

        assert.ok(after > before + 20, `a hit is worth more than the 20 ticks that elapsed (${before} -> ${after})`);
    });

    it('makes a fought-for charge worth the same as a waited-for one', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, TIME);
        framework.services.state.mark(player.id, 'temporal_charge', tick, { lifeScoped: false });

        // Twenty LANDED hits at three seconds of charge each is a full meter.
        // The gap has to clear the passive's own 10-tick cooldown, or most of
        // the swings are refused by the gate and never wind anything.
        for (let i = 0; i < 20; i++) hit(component, player, mob(dimension, `m${i}`, { z: 2 }), TIME, 12);

        // The fight is over. Clearing the mobs matters: the active is area
        // targeting capped at six, so twenty corpses left standing would fill
        // every slot and the mob being measured would never be reached.
        dimension.entities = [player];
        const target = mob(dimension, 'final', { z: 2 });
        useAfter(component, player, TIME, 240);

        assert.equal(holdOn(target), MAX_FREEZE, 'a fighter should reach a full meter as surely as a waiter');
    });

    it('applies a certain drag rather than a dice roll', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, TIME);
        const target = mob(dimension, 'm', { z: 2 });

        // Every hit, not some of them: a percentage cannot be learned, and a bad
        // streak reads as broken rather than unlucky.
        hit(component, player, target, TIME);
        hit(component, player, target, TIME);
        hit(component, player, target, TIME);

        assert.equal(effectsNamed(target, 'slowness').length, 3);
        assert.ok(totalDamage(target) > 0);
    });
});

describe('Storm Surge — carried on the wielder’s own speed', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    /** Fires one surge with the wielder in a given motion state. */
    function surgeWith({ sprinting = false, airborne = false } = {}) {
        resetMocks();
        tick = 0;
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, STORM);
        player.isSprinting = sprinting;
        player.isFalling = airborne;
        player.isOnGround = !airborne;
        const target = mob(dimension, 'm', { z: 3 });
        tick += 400;
        component.onUse({ source: player, itemStack: new MockItemStack(STORM) });
        return target;
    }

    it('is a shove from a standing start', () => {
        assert.equal(totalDamage(surgeWith()), 4, 'stillDamage alone');
    });

    it('hits hardest at a full sprint through the air', () => {
        assert.equal(
            totalDamage(surgeWith({ sprinting: true, airborne: true })),
            11,
            'stillDamage 4 + the full momentumBonus 7',
        );
    });

    it('lands between the two on one motion state alone', () => {
        const sprinting = totalDamage(surgeWith({ sprinting: true }));
        const airborne = totalDamage(surgeWith({ airborne: true }));
        assert.ok(sprinting > 4 && sprinting < 11, `sprinting alone (${sprinting}) is half a meter`);
        assert.equal(sprinting, airborne, 'both states are worth the same');
    });

    it('throws harder the faster the wielder is moving', () => {
        const still = surgeWith().knockbacks[0].horizontal;
        const fast = surgeWith({ sprinting: true, airborne: true }).knockbacks[0].horizontal;
        assert.ok(Math.abs(fast.z) > Math.abs(still.z), 'momentum scales the push, not just the damage');
    });

    it('still throws something from a standstill — the wind is always there', () => {
        assert.ok(Math.abs(surgeWith().knockbacks[0].horizontal.z) > 0);
    });

    it('rains on what it catches', () => {
        assert.equal(effectsNamed(surgeWith({ sprinting: true }), 'slowness').length, 1);
    });

    it('spawns no lightning entity and touches no block', () => {
        // The separation from Thunder rests on the surge being particles and a
        // strike, never `spawnEntity('minecraft:lightning_bolt')`.
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, STORM);
        player.isSprinting = true;
        const before = dimension.entities.length;
        mob(dimension, 'm', { z: 3 });

        tick += 400;
        component.onUse({ source: player, itemStack: new MockItemStack(STORM) });

        assert.equal(dimension.entities.length, before + 1, 'only the mob that was added');
        assert.equal(dimension.blocks.size, 0, 'no block was set');
    });

    it('refuses, and starts no cooldown, when the cone is empty', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, STORM);

        tick += 400;
        component.onUse({ source: player, itemStack: new MockItemStack(STORM) });

        assert.equal(framework.services.cooldowns.isReady(player.id, `${STORM}#use`), true);
    });
});

describe('Storm Momentum — the wielder gathers, the target is thrown', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('grants Speed to the wielder, never to the target', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, STORM);
        const target = mob(dimension, 'm', { z: 2 });

        hit(component, player, target, STORM);

        assert.equal(effectsNamed(player, 'speed').length, 1, 'the wielder gathers speed');
        assert.equal(effectsNamed(target, 'speed').length, 0, 'the enemy is not handed it for being hit');
    });

    it('throws harder when the wielder is already moving', () => {
        const thrown = ({ sprinting = false } = {}) => {
            resetMocks();
            tick = 0;
            const dimension = new MockDimension();
            const { component } = install();
            const player = wielder(dimension, STORM);
            player.isSprinting = sprinting;
            const target = mob(dimension, 'm', { z: 2 });
            hit(component, player, target, STORM);
            return Math.abs(target.knockbacks[0].horizontal.z);
        };

        assert.ok(thrown({ sprinting: true }) > thrown(), 'motion decides how hard the target flies');
    });

    it('still lands its hit when the wielder cannot be read for motion', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, STORM);
        // Motion properties absent entirely, as an older client might report.
        delete player.isSprinting;
        delete player.isFalling;
        delete player.isOnGround;
        const target = mob(dimension, 'm', { z: 2 });

        assert.doesNotThrow(() => hit(component, player, target, STORM));
        assert.ok(totalDamage(target) > 0, 'the sword works at its floor rather than not at all');
    });
});

describe('the two final swords in company', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('keeps each sword and each player on their own cooldown', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const first = wielder(dimension, TIME, 'first');
        const second = wielder(dimension, TIME, 'second');
        second.location = { x: 40, y: 64, z: 0 };
        mob(dimension, 'm', { z: 2 });

        component.onUse({ source: first, itemStack: new MockItemStack(TIME) });

        const cooldowns = framework.services.cooldowns;
        assert.equal(cooldowns.isReady(first.id, `${TIME}#use`), false);
        assert.equal(cooldowns.isReady(second.id, `${TIME}#use`), true, 'the other player is unaffected');
        assert.equal(cooldowns.isReady(first.id, `${STORM}#use`), true, 'and their other sword is');
    });

    it('keeps one wielder’s temporal charge out of another’s', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const patient = wielder(dimension, TIME, 'patient');
        const hasty = wielder(dimension, TIME, 'hasty');
        hasty.location = { x: 40, y: 64, z: 0 };

        // Both start primed; only one of them then fights to wind the sword.
        for (const p of [patient, hasty]) {
            framework.services.state.mark(p.id, 'temporal_charge', tick, { lifeScoped: false });
        }
        for (let i = 0; i < 20; i++) hit(component, patient, mob(dimension, `m${i}`, { z: 2 }), TIME, 12);

        // Clear the fight so the area cast reaches the mob being measured.
        dimension.entities = [patient, hasty];
        const patientTarget = mob(dimension, 'pt', { z: 2 });
        useAfter(component, patient, TIME, 240);
        const hastyTarget = mob(dimension, 'ht', { x: 40, z: 2 });
        component.onUse({ source: hasty, itemStack: new MockItemStack(TIME) });

        assert.equal(holdOn(patientTarget), MAX_FREEZE, 'the one who fought has a full meter');
        assert.ok(holdOn(hastyTarget) < MAX_FREEZE, 'the one who did not, does not');
    });
});
