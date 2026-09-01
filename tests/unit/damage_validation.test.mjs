/**
 * Damage validation. Every refusal here is a bug that would otherwise reach the
 * engine: NaN hit points, a dead target taking another swing, an ability
 * hurting its own caster, a filter bypassed by a second code path.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDimension, MockEntity, MockPlayer } from '../mocks/minecraft_server.mjs';
import { DamageService } from '../../packs/CustomSwordsBP/scripts/systems/damage.js';
import { TargetingService } from '../../packs/CustomSwordsBP/scripts/systems/targeting.js';
import { log } from '../../packs/CustomSwordsBP/scripts/core/log.js';
import { CONFIG } from '../../packs/CustomSwordsBP/scripts/config.js';

/** @param {object} overrides */
function configWith(overrides = {}) {
    return { ...CONFIG, combat: { ...CONFIG.combat, ...overrides } };
}

function setup(config = CONFIG) {
    const targeting = new TargetingService(config, log);
    const damage = new DamageService(config, targeting, log);
    const dimension = new MockDimension();
    const player = new MockPlayer({ id: 'player-a', location: { x: 0, y: 64, z: 0 }, dimension });
    dimension.entities.push(player);

    const ctx = {
        player,
        playerId: player.id,
        dimension,
        origin: player.getHeadLocation(),
        viewDirection: { x: 0, y: 0, z: 1 },
        allowedTargets: ['any'],
        services: { log, config, targeting },
    };

    const zombie = new MockEntity({ id: 'zombie-1', location: { x: 0, y: 64, z: 2 }, dimension });
    dimension.entities.push(zombie);
    return { damage, ctx, player, zombie, dimension };
}

describe('damage amount resolution', () => {
    it('refuses every flavour of invalid amount', () => {
        const { damage } = setup();
        for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -5, '7', null, undefined]) {
            assert.equal(damage.resolveAmount(/** @type {any} */ (amount)), 0, String(amount));
        }
    });

    it('applies the global multiplier and the per-hit ceiling', () => {
        const damage = setup(configWith({ abilityDamageMultiplier: 2, maxAbilityDamagePerHit: 10 })).damage;
        assert.equal(damage.resolveAmount(3), 6);
        assert.equal(damage.resolveAmount(50), 10);
        assert.equal(damage.resolveAmount(3, true), 3, 'bypass skips the multiplier');
    });

    it('cannot be pushed to infinity by a huge multiplier', () => {
        const damage = setup(configWith({ abilityDamageMultiplier: Number.MAX_VALUE })).damage;
        assert.equal(damage.resolveAmount(Number.MAX_VALUE), 0, 'an overflow must collapse to zero, not Infinity');
    });
});

describe('damage validation chain', () => {
    it('accepts a well-formed request', () => {
        const { damage, ctx, zombie } = setup();
        assert.deepEqual(damage.validate(ctx, zombie, 5), { ok: true, amount: 5 });
    });

    it('refuses when there is no attacker', () => {
        const { damage, zombie } = setup();
        assert.equal(damage.validate(/** @type {any} */ ({}), zombie, 5).reason, 'no_attacker');
    });

    it('refuses when the attacker has been removed', () => {
        const { damage, ctx, zombie, player } = setup();
        player.isValid = false;
        assert.equal(damage.validate(ctx, zombie, 5).reason, 'invalid_attacker');
    });

    it('refuses a missing target', () => {
        const { damage, ctx } = setup();
        assert.equal(damage.validate(ctx, undefined, 5).reason, 'no_target');
        assert.equal(damage.validate(ctx, null, 5).reason, 'no_target');
    });

    it('refuses a removed target', () => {
        const { damage, ctx, zombie } = setup();
        zombie.isValid = false;
        assert.equal(damage.validate(ctx, zombie, 5).reason, 'invalid_target');
    });

    it('refuses a target that is already dead', () => {
        const { damage, ctx, zombie } = setup();
        zombie.setHealth(0);
        assert.equal(damage.validate(ctx, zombie, 5).reason, 'target_dead');
    });

    it('treats an entity with no health component as alive', () => {
        const { damage, ctx, zombie } = setup();
        delete zombie.components['minecraft:health'];
        assert.equal(damage.validate(ctx, zombie, 5).ok, true);
    });

    it('refuses an invalid amount before touching the target', () => {
        const { damage, ctx, zombie } = setup();
        assert.equal(damage.validate(ctx, zombie, Number.NaN).reason, 'invalid_amount');
        assert.equal(zombie.damageTaken.length, 0);
    });

    it('refuses to damage the caster unless explicitly allowed', () => {
        const { damage, ctx, player } = setup();
        assert.equal(damage.validate(ctx, player, 5).reason, 'target_not_permitted');
        assert.equal(damage.validate(ctx, player, 5, { allowSelf: true }).ok, true);
    });

    it('refuses a target outside the ability\'s allowed categories', () => {
        const { damage, ctx, dimension } = setup();
        const pig = new MockEntity({ id: 'pig-1', typeId: 'minecraft:pig', location: { x: 0, y: 64, z: 2 }, dimension });
        assert.equal(damage.validate(ctx, pig, 5, { allowedCategories: ['hostile'] }).reason, 'target_not_permitted');
        assert.equal(damage.validate(ctx, pig, 5, { allowedCategories: ['passive'] }).ok, true);
    });
});

describe('damage application', () => {
    it('applies the resolved amount and reports it', () => {
        const { damage, ctx, zombie } = setup();
        const result = damage.apply(ctx, zombie, 6);
        assert.deepEqual(result, { ok: true, amount: 6 });
        assert.equal(zombie.damageTaken[0].amount, 6);
    });

    it('attributes the hit to the caster by default', () => {
        const { damage, ctx, zombie, player } = setup();
        damage.apply(ctx, zombie, 6);
        assert.equal(zombie.damageTaken[0].options.damagingEntity, player);
    });

    it('never throws when the engine rejects the call', () => {
        const { damage, ctx, zombie } = setup();
        zombie.applyDamage = () => {
            throw new Error('engine said no');
        };
        assert.doesNotThrow(() => damage.apply(ctx, zombie, 5));
        assert.equal(damage.apply(ctx, zombie, 5).reason, 'apply_failed');
    });
});

describe('knockback', () => {
    it('pushes away from the origin by default', () => {
        const { damage, zombie } = setup();
        assert.equal(damage.knockback(zombie, { horizontal: 1.5, vertical: 0.4 }, { x: 0, y: 64, z: 0 }), true);
        const { horizontal, vertical } = zombie.knockbacks[0];
        assert.equal(Math.abs(horizontal.z - 1.5) < 1e-9, true);
        assert.equal(vertical, 0.4);
    });

    it('clamps extreme forces so nothing leaves the world', () => {
        const { damage, zombie } = setup();
        damage.knockback(zombie, { horizontal: 9999, vertical: 9999 }, { x: 0, y: 64, z: 0 });
        const { horizontal, vertical } = zombie.knockbacks[0];
        assert.equal(Math.hypot(horizontal.x, horizontal.z) <= CONFIG.combat.maxKnockbackHorizontal + 1e-9, true);
        assert.equal(vertical <= CONFIG.combat.maxKnockbackVertical, true);
    });

    it('drives everything the same way in forward mode', () => {
        const { damage, dimension } = setup();
        const a = new MockEntity({ id: 'a', location: { x: -3, y: 64, z: 1 }, dimension });
        const b = new MockEntity({ id: 'b', location: { x: 3, y: 64, z: 1 }, dimension });
        const wave = { horizontal: 2, vertical: 0.2, direction: { x: 0, y: 0, z: 1 } };

        damage.knockback(a, wave, { x: 0, y: 64, z: 0 });
        damage.knockback(b, wave, { x: 0, y: 64, z: 0 });

        // Radial knockback would send these opposite ways; a wave does not.
        assert.equal(a.knockbacks[0].horizontal.x, 0);
        assert.equal(b.knockbacks[0].horizontal.x, 0);
        assert.equal(a.knockbacks[0].horizontal.z > 0, true);
        assert.equal(b.knockbacks[0].horizontal.z > 0, true);
    });

    it('reverses direction when pulling', () => {
        const { damage, zombie } = setup();
        damage.knockback(zombie, { horizontal: 1, pull: true }, { x: 0, y: 64, z: 0 });
        assert.equal(zombie.knockbacks[0].horizontal.z < 0, true);
    });

    it('refuses non-finite and zero-force pushes', () => {
        const { damage, zombie } = setup();
        assert.equal(damage.knockback(zombie, { horizontal: Number.NaN }, { x: 0, y: 64, z: 0 }), false);
        assert.equal(damage.knockback(zombie, { horizontal: 0, vertical: 0 }, { x: 0, y: 64, z: 0 }), false);
        assert.equal(damage.knockback(zombie, { horizontal: 1, direction: { x: Number.NaN, y: 0, z: 0 } }), false);
    });

    it('does nothing to a removed entity', () => {
        const { damage, zombie } = setup();
        zombie.isValid = false;
        assert.doesNotThrow(() => damage.knockback(zombie, { horizontal: 1 }, { x: 0, y: 64, z: 0 }));
        assert.equal(damage.knockback(zombie, { horizontal: 1 }, { x: 0, y: 64, z: 0 }), false);
    });
});
