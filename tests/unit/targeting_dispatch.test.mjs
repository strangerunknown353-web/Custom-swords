/**
 * `TargetingService.resolve` is what makes targeting data rather than code:
 * the same ability bound with a different envelope hits different things.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockDimension, MockEntity, MockPlayer } from '../mocks/minecraft_server.mjs';
import { TargetingService } from '../../packs/CustomSwordsBP/scripts/systems/targeting.js';
import { log } from '../../packs/CustomSwordsBP/scripts/core/log.js';
import { CONFIG } from '../../packs/CustomSwordsBP/scripts/config.js';

/**
 * Builds a caster with mobs in front of and behind them.
 *
 * @param {import('../../packs/CustomSwordsBP/scripts/core/types.js').TargetingSpec} targeting
 */
function scenario(targeting) {
    const dimension = new MockDimension();
    const player = new MockPlayer({ id: 'player-a', location: { x: 0, y: 64, z: 0 }, dimension });
    const ahead = new MockEntity({ id: 'ahead', location: { x: 0, y: 64, z: 3 }, dimension });
    const behind = new MockEntity({ id: 'behind', location: { x: 0, y: 64, z: -3 }, dimension });
    const far = new MockEntity({ id: 'far', location: { x: 0, y: 64, z: 20 }, dimension });
    dimension.entities.push(player, ahead, behind, far);

    const targetingService = new TargetingService(CONFIG, log);
    const ctx = {
        player,
        playerId: player.id,
        dimension,
        origin: player.getHeadLocation(),
        viewDirection: { x: 0, y: 0, z: 1 },
        targeting,
        services: { log, config: CONFIG, targeting: targetingService },
    };
    return { targetingService, ctx };
}

describe('TargetingService.resolve', () => {
    it('self targeting finds no entities at all', () => {
        const { targetingService, ctx } = scenario({ type: 'self' });
        assert.deepEqual(targetingService.resolve(ctx), []);
    });

    it('area targeting takes everything within range, in every direction', () => {
        const { targetingService, ctx } = scenario({ type: 'area', range: 5 });
        assert.deepEqual(
            targetingService.resolve(ctx).map((e) => e.id).sort(),
            ['ahead', 'behind'],
            'the entity 20 blocks away must be out of range',
        );
    });

    it('cone targeting keeps only what is in front', () => {
        const { targetingService, ctx } = scenario({ type: 'cone', range: 5, angleDegrees: 60 });
        assert.deepEqual(
            targetingService.resolve(ctx).map((e) => e.id),
            ['ahead'],
        );
    });

    it('single and ray targeting return at most one entity', () => {
        for (const type of /** @type {const} */ (['single', 'ray'])) {
            const { targetingService, ctx } = scenario({ type, range: 5 });
            assert.equal(targetingService.resolve(ctx).length <= 1, true, type);
        }
    });

    it('honours maxTargets from the binding', () => {
        const { targetingService, ctx } = scenario({ type: 'area', range: 5, maxTargets: 1 });
        assert.equal(targetingService.resolve(ctx).length, 1);
    });

    it('never includes the caster by default', () => {
        const { targetingService, ctx } = scenario({ type: 'area', range: 10 });
        assert.equal(
            targetingService.resolve(ctx).some((e) => e.id === 'player-a'),
            false,
        );
    });

    it('accepts an explicit spec that overrides the context', () => {
        const { targetingService, ctx } = scenario({ type: 'self' });
        assert.equal(targetingService.resolve(ctx, { type: 'area', range: 5 }).length, 2);
    });

    it('fails closed on an unknown targeting type rather than guessing', () => {
        const { targetingService, ctx } = scenario(/** @type {any} */ ({ type: 'wormhole', range: 5 }));
        assert.deepEqual(targetingService.resolve(ctx), []);
    });

    it('returns nothing when a ranged type has no range', () => {
        // Validation rejects this at load; resolve must still be safe.
        const { targetingService, ctx } = scenario(/** @type {any} */ ({ type: 'area' }));
        assert.deepEqual(targetingService.resolve(ctx), []);
    });
});
