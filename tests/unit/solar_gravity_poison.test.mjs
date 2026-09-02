/**
 * Solar, Gravity and Poison Swords — the six mechanics new in v0.11.0.
 *
 * Each of the three swords is built on a question the framework could not
 * previously ask, and every claim below is one that could be quietly false
 * without anything failing:
 *
 * | Claim | Failure it guards against |
 * |---|---|
 * | Solar Flare's damage tracks the sun | a "solar" sword that is just a cone with gold particles |
 * | it is weak in the Nether whatever the clock says | a dimension check that was never wired up |
 * | Solar Radiance pays only against the undead | a smite bonus that quietly applies to everything |
 * | Gravity Crush hits airborne targets hardest | an altitude mechanic measuring plain distance |
 * | Heavy Force scales with the target's mass | a mass bonus that is really a flat bonus |
 * | and is capped | a boss-killer nobody tested against a boss |
 * | Venomous Edge deepens venom one tier per hit | a "stacking" passive that only ever reapplies tier 1 |
 * | Venom Burst spends what was banked | a resource loop with no spend, so the button is free |
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

const SOLAR = 'custom_swords:solar_sword';
const GRAVITY = 'custom_swords:gravity_sword';
const POISON = 'custom_swords:poison_sword';

/** World-clock landmarks. `getTimeOfDay` runs 0-23999 with noon at 6000. */
const NOON = 6000;
const MIDNIGHT = 18000;

let tick = 0;
const clock = () => tick;

function install() {
    const framework = createFramework({ clock, worldClock: world });
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

function mob(dimension, id, { x = 0, y = 64, z = 0, type = 'minecraft:pig', health = 20, max = 20 } = {}) {
    const entity = new MockEntity({ id, typeId: type, location: { x, y, z }, dimension });
    entity.setHealth(health, max);
    dimension.entities.push(entity);
    return entity;
}

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

describe('Solar Flare — borrowed from the sky', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    /** Fires one flare at a lone target and reports the damage it took. */
    function flareAt(time, dimensionId = 'minecraft:overworld') {
        resetMocks();
        tick = 0;
        world.timeOfDay = time;
        const dimension = new MockDimension(dimensionId);
        const { component } = install();
        const player = wielder(dimension, SOLAR);
        const target = mob(dimension, 'm1', { z: 3 });
        use(component, player, SOLAR);
        return { damage: totalDamage(target), target };
    }

    it('hits hardest at noon', () => {
        assert.equal(flareAt(NOON).damage, 11, 'nightDamage 3 + the full sunBonus 8');
    });

    it('falls to its floor at midnight', () => {
        assert.equal(flareAt(MIDNIGHT).damage, 3, 'nightDamage alone, with no sun to draw on');
    });

    it('lands between the two at dawn and dusk', () => {
        const dawn = flareAt(0).damage;
        assert.ok(dawn > 3 && dawn < 11, `dawn (${dawn}) should sit between the floor and the peak`);
    });

    it('has no sun in the Nether, whatever the clock says', () => {
        assert.equal(
            flareAt(NOON, 'minecraft:nether').damage,
            3,
            'noon in the Nether must be worth exactly as much as midnight',
        );
    });

    it('has no sun in the End either', () => {
        assert.equal(flareAt(NOON, 'minecraft:the_end').damage, 3);
    });

    it('dazzles only when there is a sun to be dazzled by', () => {
        assert.equal(effectsNamed(flareAt(NOON).target, 'blindness').length, 1, 'blinded at noon');
        assert.equal(effectsNamed(flareAt(MIDNIGHT).target, 'blindness').length, 0, 'not blinded at midnight');
    });

    it('never sets anything on fire', () => {
        // The whole separation from Inferno and Ember Blade rests on this.
        assert.equal(flareAt(NOON).target.ignitions.length, 0);
    });

    it('refuses, and starts no cooldown, when the cone is empty', () => {
        world.timeOfDay = NOON;
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, SOLAR);

        use(component, player, SOLAR);

        assert.equal(framework.services.cooldowns.isReady(player.id, `${SOLAR}#use`), true);
    });
});

describe('Solar Radiance — against what hides from the sun', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
        world.timeOfDay = NOON;
    });

    it('pays a large bonus against the undead in daylight', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, SOLAR);
        const zombie = mob(dimension, 'z', { z: 2, type: 'minecraft:zombie' });

        hit(component, player, zombie, SOLAR);

        assert.equal(totalDamage(zombie), 7, 'chip 1 + the full smite 6 at noon');
    });

    it('pays almost nothing against the same undead at midnight', () => {
        world.timeOfDay = MIDNIGHT;
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, SOLAR);
        const zombie = mob(dimension, 'z', { z: 2, type: 'minecraft:zombie' });

        hit(component, player, zombie, SOLAR);

        assert.equal(totalDamage(zombie), 1 + 6 * 0.25, 'only the nightFactor quarter of the bonus survives');
    });

    it('pays nothing at all against something living, however bright the day', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, SOLAR);
        const pig = mob(dimension, 'pig', { z: 2, type: 'minecraft:pig' });

        hit(component, player, pig, SOLAR);

        assert.equal(totalDamage(pig), 1, 'a living target gets the chip damage and nothing else');
        assert.equal(effectsNamed(pig, 'weakness').length, 0, 'and none of the smite effects');
    });

    it('recognises the undead by type family, not by a hard-coded list', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, SOLAR);
        // A skeleton is a different type id but the same family, and must be
        // smitten for exactly the same reason a zombie is.
        const skeleton = mob(dimension, 's', { z: 2, type: 'minecraft:skeleton' });

        hit(component, player, skeleton, SOLAR);

        assert.equal(totalDamage(skeleton), 7);
    });
});

describe('Gravity Crush — billed by altitude', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('deals its floor to something standing level with the wielder', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, GRAVITY);
        const grounded = mob(dimension, 'g', { z: 3, y: 64 });

        use(component, player, GRAVITY);

        assert.equal(totalDamage(grounded), 5, 'groundDamage, with no height to add');
    });

    it('deals its ceiling to something at full height', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, GRAVITY);
        const airborne = mob(dimension, 'a', { y: 69 });

        use(component, player, GRAVITY);

        assert.equal(totalDamage(airborne), 12, 'groundDamage 5 + the full heightBonus 7');
    });

    it('can actually reach the height it pays its ceiling for', () => {
        // The bug this exists for: an earlier draft paired a five-block well
        // with a six-block full-height bonus, so the ceiling was unreachable —
        // anything high enough to earn it was outside the query, and the sword
        // quietly never dealt its advertised maximum.
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, GRAVITY);
        const atFullHeight = mob(dimension, 'a', { y: 69 });

        use(component, player, GRAVITY);

        assert.ok(totalDamage(atFullHeight) > 0, 'full height must be inside the binding range');
    });

    it('scales between the two, and caps rather than extrapolating', () => {
        const at = (y) => {
            resetMocks();
            tick = 0;
            const dimension = new MockDimension();
            const { component } = install();
            const player = wielder(dimension, GRAVITY);
            // Directly overhead: the well is a sphere, so any horizontal
            // offset eats into the vertical reach being measured here.
            const target = mob(dimension, 't', { y });
            use(component, player, GRAVITY);
            return totalDamage(target);
        };

        const low = at(66);
        assert.ok(low > 5 && low < 12, `two blocks up (${low}) should sit between the floor and the ceiling`);
        assert.equal(at(70), 12, 'above `fullHeight` is capped, not extrapolated');
    });

    it('pays nothing extra for something below the wielder', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, GRAVITY);
        const below = mob(dimension, 'b', { y: 61 });

        use(component, player, GRAVITY);

        assert.equal(totalDamage(below), 5, 'the mechanic is altitude, not plain distance');
    });

    it('drags targets inward and downward rather than scattering them', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, GRAVITY);
        const target = mob(dimension, 't', { z: 3, y: 66 });

        use(component, player, GRAVITY);

        assert.equal(target.knockbacks.length, 1);
        assert.ok(target.knockbacks[0].horizontal.z < 0, 'pulled back towards the caster (-z), not pushed out');
        assert.ok(target.knockbacks[0].vertical < 0, 'and pressed down, not launched');
    });
});

describe('Heavy Force — billed by mass', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    const struck = (max) => {
        resetMocks();
        tick = 0;
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, GRAVITY);
        const target = mob(dimension, 't', { z: 2, health: max, max });
        hit(component, player, target, GRAVITY);
        return totalDamage(target);
    };

    it('hits a heavy target harder than a light one', () => {
        const light = struck(6); // a bat
        const heavy = struck(40);
        assert.ok(heavy > light, `40 max health (${heavy}) should out-damage 6 (${light})`);
    });

    it('caps the mass bonus, so a boss is worth no more than a golem', () => {
        assert.equal(struck(100), struck(300), 'maxBonus holds at 60 max health and above');
        assert.equal(struck(100), 1 + 3, 'damage 1 + the capped bonus 3');
    });

    it('reads maximum health, not current — a wounded golem is still heavy', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, GRAVITY);
        const wounded = mob(dimension, 'w', { z: 2, health: 1, max: 100 });

        hit(component, player, wounded, GRAVITY);

        assert.equal(totalDamage(wounded), 4, 'mass is the maximum, not what is left of it');
    });

    it('presses its target down instead of pushing it away', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, GRAVITY);
        const target = mob(dimension, 't', { z: 2 });

        hit(component, player, target, GRAVITY);

        assert.equal(target.knockbacks.length, 1);
        assert.ok(target.knockbacks[0].vertical < 0, 'the force is downward');
        assert.equal(target.knockbacks[0].horizontal.x, 0, 'and has no horizontal component at all');
        assert.equal(target.knockbacks[0].horizontal.z, 0);
    });
});

describe('Venomous Edge — the meter kept on the enemy', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('starts a fresh target at the first tier', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, POISON);
        const target = mob(dimension, 't', { z: 2 });

        hit(component, player, target, POISON);

        const venom = effectsNamed(target, 'poison');
        assert.equal(venom.length, 1);
        assert.equal(venom[0].options.amplifier, 0, 'Poison I');
    });

    it('deepens by one tier per landed hit', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, POISON);
        const target = mob(dimension, 't', { z: 2 });

        hit(component, player, target, POISON);
        hit(component, player, target, POISON);
        hit(component, player, target, POISON);

        const venom = effectsNamed(target, 'poison');
        assert.deepEqual(
            venom.map((v) => v.options.amplifier),
            [0, 1, 2],
            'each hit reads what is there and applies one tier deeper',
        );
    });

    it('stops at the cap however long the wielder keeps swinging', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, POISON);
        const target = mob(dimension, 't', { z: 2 });

        for (let i = 0; i < 6; i++) hit(component, player, target, POISON);

        const amplifiers = effectsNamed(target, 'poison').map((v) => v.options.amplifier);
        assert.equal(Math.max(...amplifiers), 2, 'maxAmplifier holds at Poison III');
    });

    it('banks on the target, so a second mob starts from nothing', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, POISON);
        const first = mob(dimension, 'first', { z: 2 });

        hit(component, player, first, POISON);
        hit(component, player, first, POISON);

        // A fresh world for the second target: `single` targeting raycasts, and
        // the first mob would otherwise still be the one in front of the player.
        resetMocks();
        tick = 0;
        const other = new MockDimension();
        const { component: c2 } = install();
        const player2 = wielder(other, POISON);
        const second = mob(other, 'second', { z: 2 });

        hit(c2, player2, second, POISON);

        assert.equal(
            effectsNamed(second, 'poison')[0].options.amplifier,
            0,
            'venom worked into one mob is worth nothing against another',
        );
    });
});

describe('Venom Burst — spending what was banked', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('deals its base damage to a target carrying no venom', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, POISON);
        const clean = mob(dimension, 'c', { z: 2 });

        use(component, player, POISON);

        assert.equal(totalDamage(clean), 4);
    });

    it('deals far more to a target carrying venom, in proportion to the tiers', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, POISON);
        const target = mob(dimension, 't', { z: 2 });
        // Two swings leave Poison II, which is two tiers.
        hit(component, player, target, POISON);
        hit(component, player, target, POISON);
        const beforeBurst = totalDamage(target);

        use(component, player, POISON);

        assert.equal(totalDamage(target) - beforeBurst, 4 + 2 * 3, 'base 4 + damagePerTier 3 for each of two tiers');
    });

    it('spends the venom, so a second burst is worth only the base again', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, POISON);
        const target = mob(dimension, 't', { z: 2 });
        hit(component, player, target, POISON);
        hit(component, player, target, POISON);

        use(component, player, POISON);
        const afterFirst = totalDamage(target);
        use(component, player, POISON);

        assert.equal(
            totalDamage(target) - afterFirst,
            4 + 3,
            'only the single residual tier the first burst left behind',
        );
    });

    it('leaves its targets poisoned rather than cleansed', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, POISON);
        const target = mob(dimension, 't', { z: 2 });
        hit(component, player, target, POISON);

        use(component, player, POISON);

        const venom = effectsNamed(target, 'poison');
        assert.equal(venom.at(-1).options.amplifier, 0, 'a residual first tier is reapplied');
        assert.equal(venom.at(-1).duration, 60);
    });

    it('refuses, and starts no cooldown, when nothing is in range', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, POISON);

        use(component, player, POISON);

        assert.equal(framework.services.cooldowns.isReady(player.id, `${POISON}#use`), true);
    });
});

describe('multiplayer isolation across the three new swords', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
        world.timeOfDay = NOON;
    });

    it('keeps each sword and each player on their own cooldown', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const first = wielder(dimension, SOLAR, 'first');
        const second = wielder(dimension, SOLAR, 'second');
        second.location = { x: 40, y: 64, z: 0 };
        mob(dimension, 'm1', { z: 2 });

        component.onUse({ source: first, itemStack: new MockItemStack(SOLAR) });

        const cooldowns = framework.services.cooldowns;
        assert.equal(cooldowns.isReady(first.id, `${SOLAR}#use`), false, 'the caster is on cooldown');
        assert.equal(cooldowns.isReady(second.id, `${SOLAR}#use`), true, 'the other player is not');
        assert.equal(cooldowns.isReady(first.id, `${GRAVITY}#use`), true, 'their other swords are not');
        assert.equal(cooldowns.isReady(first.id, `${POISON}#use`), true);
    });

    it('never lets one wielder’s crush reach a bystander out of range', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const caster = wielder(dimension, GRAVITY, 'caster');
        const bystander = wielder(dimension, GRAVITY, 'bystander');
        bystander.location = { x: 40, y: 64, z: 0 };
        const near = mob(dimension, 'near', { z: 2 });

        use(component, caster, GRAVITY);

        assert.ok(totalDamage(near) > 0);
        assert.equal(totalDamage(bystander), 0, 'forty blocks away is outside a five-block well');
    });
});
