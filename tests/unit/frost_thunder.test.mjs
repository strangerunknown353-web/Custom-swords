/**
 * Frost Sword's shatter combo and Thunder Sword's chain, end to end.
 *
 * Both swords gained mechanics the framework had never done before: Frost is
 * the first ability to branch on the *target's* state, and Thunder the first to
 * walk from one entity to another. Each brings its own way to be wrong, and
 * these are the assertions that would catch it.
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

const FROST = 'custom_swords:frost_sword';
const THUNDER = 'custom_swords:thunder_sword';
const CHARGE = 'static_charge';

let tick = 0;
const clock = () => tick;

function install() {
    const framework = createFramework({ clock });
    const registry = new MockItemComponentRegistry();
    framework.router.register(registry);
    subscribePlayerLifecycle(framework);
    return { framework, component: registry.components.get(SWORD_COMPONENT_ID) };
}

function wielder(dimension, id, sword) {
    const player = new MockPlayer({ id, location: { x: 0, y: 64, z: 0 }, dimension });
    player.setMainhand(new MockItemStack(sword));
    dimension.entities.push(player);
    return player;
}

function mob(dimension, id, z, x = 0) {
    const entity = new MockEntity({ id, location: { x, y: 64, z }, dimension });
    dimension.entities.push(entity);
    return entity;
}

function use(component, player, sword) {
    tick += 250; // clear cooldowns, hit protection and the anti-spam floor
    return component.onUse({ source: player, itemStack: new MockItemStack(sword) });
}

function hit(component, player, target, sword) {
    tick += 60;
    return component.onHitEntity({
        attackingEntity: player,
        hitEntity: target,
        itemStack: new MockItemStack(sword),
        hadEffect: true,
    });
}

const totalDamage = (entity) => entity.damageTaken.reduce((sum, d) => sum + d.amount, 0);

describe('binding labels', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('shows the sword\'s name for the ability, not the generic behaviour name', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', FROST);
        mob(dimension, 'm', 2);

        use(component, player, FROST);

        // The ability id is the reusable `custom_swords:nova`; the player must
        // never see that, only what this sword calls it.
        assert.match(player.actionBarMessages.at(-1), /Frost Nova/);
        assert.ok(!player.actionBarMessages.at(-1).includes('Nova ·'));
    });

    it('falls back to the ability name when a binding sets no label', () => {
        // Inferno labels neither binding, so it still shows the ability's own
        // name — which is what keeps `label` optional rather than required.
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', 'custom_swords:inferno_sword');
        mob(dimension, 'm', 2);

        use(component, player, 'custom_swords:inferno_sword');

        assert.match(player.actionBarMessages.at(-1), /Cleave/);
    });
});

describe('Frost Sword — the shatter combo', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('deals more to an already-slowed target than to a fresh one', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', FROST);
        const fresh = mob(dimension, 'fresh', 2);
        const chilled = mob(dimension, 'chilled', 2, 1);
        chilled.addEffect('slowness', 60, {});

        use(component, player, FROST);

        assert.ok(
            totalDamage(chilled) > totalDamage(fresh),
            `shatter bonus expected: chilled ${totalDamage(chilled)} vs fresh ${totalDamage(fresh)}`,
        );
    });

    it('does not count the effects it applies itself as a prior chill', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', FROST);
        const target = mob(dimension, 'm', 2);

        use(component, player, FROST);
        const first = totalDamage(target);

        // The nova just applied slowness. A second nova *should* now shatter,
        // but the first must not have shattered off its own effects.
        assert.ok(first > 0);
        assert.ok(target.effects.some((e) => e.effect === 'slowness'));

        use(component, player, FROST);
        const second = totalDamage(target) - first;
        assert.ok(second > first, `the follow-up should shatter: ${second} vs ${first}`);
    });

    it('holds a close target longer than a distant one', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', FROST);
        const near = mob(dimension, 'near', 1);
        const far = mob(dimension, 'far', 5, 1);

        use(component, player, FROST);

        const durationOf = (e) => e.effects.find((x) => x.effect === 'slowness')?.duration ?? 0;
        assert.ok(durationOf(near) > durationOf(far), `near ${durationOf(near)} vs far ${durationOf(far)}`);
    });

    it('escalates the passive against a target already chilled', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', FROST);
        const target = mob(dimension, 'm', 2);

        hit(component, player, target, FROST);
        const first = totalDamage(target);
        assert.ok(target.effects.some((e) => e.effect === 'slowness'), 'first hit chills');

        hit(component, player, target, FROST);
        const second = totalDamage(target) - first;
        assert.ok(second > first, `escalated hit should bite deeper: ${second} vs ${first}`);
        assert.ok(
            target.effects.some((e) => e.effect === 'mining_fatigue'),
            'escalation adds mining fatigue',
        );
    });

    it('never damages the wielder', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', FROST);
        mob(dimension, 'm', 2);
        use(component, player, FROST);
        assert.equal(player.damageTaken.length, 0);
    });

    it('is safe and costs no cooldown with nothing in range', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, 'p', FROST);

        use(component, player, FROST);

        assert.equal(framework.services.cooldowns.isReady('p', `${FROST}#use`), true);
        assert.match(player.actionBarMessages.at(-1), /Nothing near enough/);
    });
});

describe('Thunder Sword — the chain', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('strikes the aimed target and arcs to its neighbours', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', THUNDER);
        const a = mob(dimension, 'a', 6);
        const b = mob(dimension, 'b', 9);
        const c = mob(dimension, 'c', 12);

        use(component, player, THUNDER);

        for (const [name, entity] of [['a', a], ['b', b], ['c', c]]) {
            assert.ok(entity.damageTaken.length > 0, `link ${name} should be struck`);
        }
    });

    it('loses damage with every jump', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', THUNDER);
        const a = mob(dimension, 'a', 6);
        const b = mob(dimension, 'b', 9);
        const c = mob(dimension, 'c', 12);

        use(component, player, THUNDER);

        assert.ok(totalDamage(a) > totalDamage(b), `first link hardest: ${totalDamage(a)} vs ${totalDamage(b)}`);
        assert.ok(totalDamage(b) > totalDamage(c), `falloff continues: ${totalDamage(b)} vs ${totalDamage(c)}`);
    });

    it('stops at maxJumps rather than running through a crowd', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', THUNDER);
        // Eight in a line, three blocks apart: well inside jump range, and far
        // more than the chain is allowed to touch.
        const line = Array.from({ length: 8 }, (_, i) => mob(dimension, `m${i}`, 5 + i * 3));

        use(component, player, THUNDER);

        const struck = line.filter((m) => m.damageTaken.length > 0).length;
        assert.equal(struck, 4, 'the first target plus exactly three jumps');
    });

    it('never strikes the same entity twice in one chain', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', THUNDER);
        const a = mob(dimension, 'a', 6);
        const b = mob(dimension, 'b', 8);

        use(component, player, THUNDER);

        assert.equal(a.damageTaken.length, 1, 'the aimed target is hit once');
        assert.equal(b.damageTaken.length, 1, 'and so is its neighbour');
    });

    it('never damages the wielder', () => {
        const dimension = new MockDimension();
        const { component } = install();
        const player = wielder(dimension, 'p', THUNDER);
        mob(dimension, 'a', 6);
        use(component, player, THUNDER);
        assert.equal(player.damageTaken.length, 0);
    });

    it('is safe and costs no cooldown with nothing to strike', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, 'p', THUNDER);

        use(component, player, THUNDER);

        assert.equal(framework.services.cooldowns.isReady('p', `${THUNDER}#use`), true);
        assert.match(player.actionBarMessages.at(-1), /No target in the storm/);
    });
});

describe('Thunder Sword — Static Charge', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('discharges on exactly every third landed hit', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, 'p', THUNDER);
        const target = mob(dimension, 'm', 2);

        const damageAfter = [];
        for (let i = 0; i < 6; i++) {
            const before = totalDamage(target);
            hit(component, player, target, THUNDER);
            damageAfter.push(totalDamage(target) - before);
        }

        // Hits 3 and 6 discharge; the rest are chip damage only.
        assert.ok(damageAfter[2] > damageAfter[0], `3rd hit discharges: ${damageAfter}`);
        assert.ok(damageAfter[2] > damageAfter[1], `and is larger than the 2nd: ${damageAfter}`);
        assert.ok(damageAfter[5] > damageAfter[4], `6th hit discharges too: ${damageAfter}`);
        assert.equal(framework.services.cooldowns.isReady('p', `${THUNDER}#attack`), false);
    });

    it('resets the counter after discharging', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, 'p', THUNDER);
        const target = mob(dimension, 'm', 2);

        for (let i = 0; i < 3; i++) hit(component, player, target, THUNDER);
        assert.equal(framework.services.state.charges('p', CHARGE), 0, 'spent on the discharge');

        hit(component, player, target, THUNDER);
        assert.equal(framework.services.state.charges('p', CHARGE), 1, 'and starts building again');
    });

    it('keeps two wielders on separate counters', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const playerA = wielder(dimension, 'a', THUNDER);
        const playerB = wielder(dimension, 'b', THUNDER);
        const target = mob(dimension, 'm', 2);

        hit(component, playerA, target, THUNDER);
        hit(component, playerA, target, THUNDER);
        assert.equal(framework.services.state.charges('a', CHARGE), 2);
        assert.equal(framework.services.state.charges('b', CHARGE), 0, "A's swings must not charge B");
    });

    it('clears the counter on death', () => {
        const dimension = new MockDimension();
        const { framework, component } = install();
        const player = wielder(dimension, 'p', THUNDER);
        const target = mob(dimension, 'm', 2);

        hit(component, player, target, THUNDER);
        assert.equal(framework.services.state.charges('p', CHARGE), 1);
        framework.services.state.clearLifeScope('p');
        assert.equal(framework.services.state.charges('p', CHARGE), 0);
    });
});
