/**
 * Crystal Sword and Void Sword — the four mechanics that are new in v0.10.0.
 *
 * Each of these swords is built on a claim the framework could not previously
 * make, and every claim below is one a player could be lied to about without
 * anything failing:
 *
 * | Claim | Failure it guards against |
 * |---|---|
 * | Crystal Burst hits harder for every body caught | a crowd ability that is just a wide single hit |
 * | its resonance is capped | quadratic scaling one-shotting a spawner room |
 * | Crystal Guard forms only when the wielder is wounded | permanent uptime on a defensive buff |
 * | the guard lands on the wielder, never the target | handing the enemy Resistance for being hit |
 * | Void Rift detonates where the player *looks* | an "area at range" that is really an area at the feet |
 * | its damage rises with reach | an aimed ability where aiming is worth nothing |
 * | Void Drain pays out on the target's remaining health | lifesteal farmable against a tanky mob forever |
 *
 * Everything runs through the real router, gate, executor and combat system, so
 * a regression anywhere in the pipeline shows up here too.
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

const CRYSTAL = 'custom_swords:crystal_sword';
const VOID = 'custom_swords:void_sword';

let tick = 0;
const clock = () => tick;

function install() {
    const framework = createFramework({ clock });
    const registry = new MockItemComponentRegistry();
    framework.router.register(registry);
    subscribePlayerLifecycle(framework);
    return { framework, component: registry.components.get(SWORD_COMPONENT_ID) };
}

/** A wielder on open ground at the origin, looking due south (+z). */
function wielder(dimension, sword, id = 'p') {
    const player = new MockPlayer({ id, location: { x: 0, y: 64, z: 0 }, dimension });
    player.setMainhand(new MockItemStack(sword));
    player.viewDirection = { x: 0, y: 0, z: 1 };
    dimension.entities.push(player);
    return player;
}

function mob(dimension, id, { x = 0, z = 0, health = 20, max = 20 } = {}) {
    const entity = new MockEntity({ id, location: { x, y: 64, z }, dimension });
    entity.setHealth(health, max);
    dimension.entities.push(entity);
    return entity;
}

/** Advances well past every cooldown these swords declare. */
function use(component, player, sword) {
    tick += 400;
    return component.onUse({ source: player, itemStack: new MockItemStack(sword) });
}

function hit(component, player, target, sword) {
    tick += 20;
    return component.onHitEntity({
        attackingEntity: player,
        hitEntity: target,
        itemStack: new MockItemStack(sword),
        hadEffect: true,
    });
}

const totalDamage = (entity) => entity.damageTaken.reduce((sum, d) => sum + d.amount, 0);
const effectsNamed = (entity, name) => entity.effects.filter((e) => e.effect === name);

describe('Crystal Burst — resonance', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('hits a lone target for the base damage', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, CRYSTAL);
        const alone = mob(dimension, 'm1', { z: 2 });

        use(component, player, CRYSTAL);

        assert.equal(totalDamage(alone), 5, 'a single target should take the base damage with no resonance');
    });

    it('hits every target harder when more are caught', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, CRYSTAL);
        const crowd = [
            mob(dimension, 'm1', { z: 2 }),
            mob(dimension, 'm2', { z: -2 }),
            mob(dimension, 'm3', { x: 2 }),
            mob(dimension, 'm4', { x: -2 }),
        ];

        use(component, player, CRYSTAL);

        // 5 base + 1.2 for each of the three targets beyond the first.
        for (const target of crowd) {
            assert.equal(totalDamage(target), 5 + 3.6, `${target.id} should take the resonated damage`);
        }
    });

    it('caps the resonance however large the crowd', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, CRYSTAL);
        // Eight is the binding's maxTargets, well past the four-target cap.
        const crowd = Array.from({ length: 8 }, (_, i) =>
            mob(dimension, `m${i}`, { x: (i % 4) - 2, z: i < 4 ? 2 : -2 }),
        );

        use(component, player, CRYSTAL);

        for (const target of crowd) {
            assert.equal(totalDamage(target), 5 + 4.2, 'resonance must stop at maxResonance');
        }
    });

    it('slows what it catches', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, CRYSTAL);
        const target = mob(dimension, 'm1', { z: 2 });

        use(component, player, CRYSTAL);

        assert.equal(effectsNamed(target, 'slowness').length, 1);
        assert.equal(effectsNamed(target, 'slowness')[0].duration, 60);
    });

    it('refuses, and starts no cooldown, when nothing is in range', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, CRYSTAL);

        use(component, player, CRYSTAL);

        assert.equal(
            framework.services.cooldowns.isReady(player.id, `${CRYSTAL}#use`),
            true,
            'a whiffed burst must not burn the cooldown',
        );
    });
});

describe('Crystal Guard — the wounded-only ward', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('gives an unhurt wielder nothing', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, CRYSTAL);
        const target = mob(dimension, 'm1', { z: 2 });

        hit(component, player, target, CRYSTAL);

        assert.equal(effectsNamed(player, 'resistance').length, 0, 'the guard must not form at full health');
    });

    it('forms once the wielder drops below the threshold', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, CRYSTAL);
        const target = mob(dimension, 'm1', { z: 2 });
        player.setHealth(10, 20); // 50% — under guardThreshold, over deepThreshold.

        hit(component, player, target, CRYSTAL);

        const guard = effectsNamed(player, 'resistance');
        assert.equal(guard.length, 1);
        assert.equal(guard[0].duration, 100);
        assert.equal(guard[0].options.amplifier, 0, 'a shallow wound gets the base tier');
    });

    it('forms one tier stronger on a deep wound, and no stronger than the cap', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, CRYSTAL);
        const target = mob(dimension, 'm1', { z: 2 });
        player.setHealth(2, 20); // 10% — well under deepThreshold.

        hit(component, player, target, CRYSTAL);

        const guard = effectsNamed(player, 'resistance');
        assert.equal(guard.length, 1);
        assert.equal(guard[0].options.amplifier, 1, 'the deep tier is amplifier 1, and maxAmplifier holds it there');
    });

    it('never puts the guard on the target', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, CRYSTAL);
        const target = mob(dimension, 'm1', { z: 2 });
        player.setHealth(4, 20);

        hit(component, player, target, CRYSTAL);

        assert.equal(effectsNamed(target, 'resistance').length, 0, 'the enemy must not be handed the ward');
        assert.ok(totalDamage(target) > 0, 'the swing should still land its chip damage');
    });

    it('will not re-form inside its own interval, even as swings continue', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, CRYSTAL);
        player.setHealth(4, 20);

        // Each `hit` advances 20 ticks; guardIntervalTicks is 140, so the
        // second and third swings fall well inside the window.
        for (let i = 0; i < 3; i++) hit(component, player, mob(dimension, `m${i}`, { z: 2 }), CRYSTAL);

        assert.equal(effectsNamed(player, 'resistance').length, 1, 'only the first swing should form a guard');
    });

    it('re-forms once the interval has passed', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, CRYSTAL);
        player.setHealth(4, 20);

        hit(component, player, mob(dimension, 'a', { z: 2 }), CRYSTAL);
        tick += 200;
        hit(component, player, mob(dimension, 'b', { z: 2 }), CRYSTAL);

        assert.equal(effectsNamed(player, 'resistance').length, 2);
    });

    it('keeps one wielder’s guard entirely out of another’s', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const wounded = wielder(dimension, CRYSTAL, 'wounded');
        const healthy = wielder(dimension, CRYSTAL, 'healthy');
        wounded.setHealth(4, 20);
        wounded.location = { x: 0, y: 64, z: 0 };
        healthy.location = { x: 30, y: 64, z: 0 };

        hit(component, wounded, mob(dimension, 'm1', { z: 2 }), CRYSTAL);
        hit(component, healthy, mob(dimension, 'm2', { x: 30, z: 2 }), CRYSTAL);

        assert.equal(effectsNamed(wounded, 'resistance').length, 1);
        assert.equal(effectsNamed(healthy, 'resistance').length, 0, 'a healthy player gets no guard from anyone');
    });
});

describe('Void Rift — a collapse where the wielder is looking', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('detonates at the aimed point, not at the wielder', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, VOID);
        // The mock world is open air, so the rift resolves to full reach: ten
        // blocks along +z from the player's head.
        const underfoot = mob(dimension, 'near', { z: 1 });
        const atTheRift = mob(dimension, 'far', { z: 10 });

        use(component, player, VOID);

        assert.equal(totalDamage(underfoot), 0, 'something beside the wielder is outside the rift');
        assert.ok(totalDamage(atTheRift) > 0, 'something at the aimed point is inside it');
    });

    it('hits harder the further the rift is torn', () => {
        const far = (() => {
            const dimension = new MockDimension();
            const { component } = install();
            const player = wielder(dimension, VOID);
            const target = mob(dimension, 'far', { z: 10 });
            use(component, player, VOID);
            return totalDamage(target);
        })();

        resetMocks();
        tick = 0;

        const near = (() => {
            const dimension = new MockDimension();
            const { component } = install();
            const player = wielder(dimension, VOID);
            // A wall two blocks ahead stops the raycast, so the rift opens close
            // to the wielder instead of at full reach.
            for (let y = 63; y < 68; y++) dimension.setBlock(0, y, 2, 'stone');
            const target = mob(dimension, 'near', { z: 2 });
            use(component, player, VOID);
            return totalDamage(target);
        })();

        assert.ok(near > 0 && far > 0, 'both rifts should land');
        assert.ok(far > near, `a rift at reach (${far}) must out-damage one at arm's length (${near})`);
        assert.equal(far, 9, 'nearDamage 5 + the full reachBonus 4');
    });

    it('drags what it catches toward the rift rather than scattering it', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, VOID);
        // Beyond the rift centre, so "away from the rift" and "away from the
        // player" point in opposite directions and the pull is unambiguous.
        const target = mob(dimension, 'beyond', { z: 12 });

        use(component, player, VOID);

        assert.equal(target.knockbacks.length, 1);
        assert.ok(
            target.knockbacks[0].horizontal.z < 0,
            'a target past the rift must be pulled back towards it (-z), not pushed further out',
        );
    });

    it('weakens what it catches', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, VOID);
        const target = mob(dimension, 'far', { z: 10 });

        use(component, player, VOID);

        assert.equal(effectsNamed(target, 'weakness').length, 1);
    });

    it('refuses, and starts no cooldown, when the rift closes on nothing', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, VOID);

        use(component, player, VOID);

        assert.equal(framework.services.cooldowns.isReady(player.id, `${VOID}#use`), true);
    });
});

describe('Void Drain — paid in what is nearest to gone', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('returns nothing from a target at full health', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, VOID);
        player.setHealth(10, 20);
        const target = mob(dimension, 'm1', { z: 2, health: 20, max: 20 });

        hit(component, player, target, VOID);

        assert.equal(player._health, 10, 'a fresh target must not feed the wielder');
    });

    it('returns health from a target near death', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, VOID);
        player.setHealth(10, 20);
        const target = mob(dimension, 'm1', { z: 2, health: 1, max: 20 });

        hit(component, player, target, VOID);

        assert.ok(player._health > 10, 'a nearly dead target should pay out');
        assert.ok(player._health <= 13, 'and never more than maxHeal');
    });

    it('pays more the emptier the target is', () => {
        // A fresh world per case: `single` targeting raycasts, and a leftover
        // mob from the first case would be the one the second case struck.
        const drained = (health) => {
            resetMocks();
            tick = 0;
            const dimension = new MockDimension();
            const { component } = install();
            const player = wielder(dimension, VOID);
            player.setHealth(4, 20);
            hit(component, player, mob(dimension, 'm', { z: 2, health, max: 20 }), VOID);
            return player._health - 4;
        };

        const fromHalf = drained(10);
        const fromDying = drained(1);

        assert.ok(fromHalf > 0 && fromDying > 0);
        assert.ok(fromDying > fromHalf, `a dying target (${fromDying}) must pay more than a wounded one (${fromHalf})`);
    });

    it('reads the target before striking, so its own damage cannot inflate the payout', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, VOID);
        player.setHealth(10, 20);
        // Exactly on the threshold before the hit; the strike would push it
        // under, and a post-strike read would pay out.
        const target = mob(dimension, 'm1', { z: 2, health: 17, max: 20 });

        hit(component, player, target, VOID);

        assert.equal(player._health, 10, 'the fraction must be read before the blow lands');
    });

    it('cannot heal past the wielder’s maximum', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, VOID);
        player.setHealth(20, 20);
        const target = mob(dimension, 'm1', { z: 2, health: 1, max: 20 });

        hit(component, player, target, VOID);

        assert.equal(player._health, 20);
    });

    it('keeps one wielder’s drain out of another’s health', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const draining = wielder(dimension, VOID, 'draining');
        const bystander = wielder(dimension, VOID, 'bystander');
        draining.setHealth(10, 20);
        bystander.setHealth(10, 20);
        bystander.location = { x: 30, y: 64, z: 0 };

        hit(component, draining, mob(dimension, 'm1', { z: 2, health: 1, max: 20 }), VOID);

        assert.ok(draining._health > 10);
        assert.equal(bystander._health, 10, 'the other player is untouched');
    });
});

describe('cooldown isolation across the two new swords', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('gives each sword its own key, and each player their own timer', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const first = wielder(dimension, CRYSTAL, 'first');
        const second = wielder(dimension, CRYSTAL, 'second');
        second.location = { x: 30, y: 64, z: 0 };
        mob(dimension, 'm1', { z: 2 });
        mob(dimension, 'm2', { x: 30, z: 2 });

        component.onUse({ source: first, itemStack: new MockItemStack(CRYSTAL) });

        assert.equal(framework.services.cooldowns.isReady(first.id, `${CRYSTAL}#use`), false, 'the caster is on cooldown');
        assert.equal(framework.services.cooldowns.isReady(second.id, `${CRYSTAL}#use`), true, 'the other player is not');
        assert.equal(framework.services.cooldowns.isReady(first.id, `${VOID}#use`), true, 'and their other sword is not');
    });
});
