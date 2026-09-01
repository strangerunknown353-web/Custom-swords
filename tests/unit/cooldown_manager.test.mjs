/**
 * Cooldown manager tests.
 *
 * The multiplayer isolation case is the important one: it is the exact
 * scenario from the project brief (player A on cooldown, player B ready) and
 * the one that regressions would be most damaging.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CooldownManager } from '../../packs/CustomSwordsBP/scripts/core/cooldown_manager.js';

/** @returns {{ manager: CooldownManager, advance: (ticks: number) => void }} */
function withFakeClock() {
    let tick = 0;
    const manager = new CooldownManager(() => tick);
    return {
        manager,
        advance(ticks) {
            tick += ticks;
        },
    };
}

describe('CooldownManager', () => {
    it('reports a fresh key as ready', () => {
        const { manager } = withFakeClock();
        assert.equal(manager.isReady('player-a', 'sword'), true);
        assert.equal(manager.remaining('player-a', 'sword'), 0);
    });

    it('counts down and becomes ready again', () => {
        const { manager, advance } = withFakeClock();
        manager.start('player-a', 'sword', 60);
        assert.equal(manager.remaining('player-a', 'sword'), 60);

        advance(20);
        assert.equal(manager.remaining('player-a', 'sword'), 40);
        assert.equal(manager.isReady('player-a', 'sword'), false);

        advance(40);
        assert.equal(manager.remaining('player-a', 'sword'), 0);
        assert.equal(manager.isReady('player-a', 'sword'), true);
    });

    it('keeps players completely independent', () => {
        const { manager, advance } = withFakeClock();
        manager.start('player-a', 'custom_swords:thunder', 160);

        assert.equal(manager.isReady('player-a', 'custom_swords:thunder'), false);
        assert.equal(manager.isReady('player-b', 'custom_swords:thunder'), true);

        manager.start('player-b', 'custom_swords:thunder', 40);
        advance(40);

        // B has recovered; A is still waiting on the longer timer.
        assert.equal(manager.isReady('player-b', 'custom_swords:thunder'), true);
        assert.equal(manager.remaining('player-a', 'custom_swords:thunder'), 120);
    });

    it('keeps keys independent for the same player', () => {
        const { manager } = withFakeClock();
        manager.start('player-a', 'sword-one', 100);
        assert.equal(manager.isReady('player-a', 'sword-two'), true);
    });

    it('treats non-positive durations as no cooldown', () => {
        const { manager } = withFakeClock();
        manager.start('player-a', 'sword', 0);
        manager.start('player-a', 'other', -5);
        assert.equal(manager.isReady('player-a', 'sword'), true);
        assert.equal(manager.trackedPlayerCount, 0);
    });

    it('restarting a live cooldown replaces the old expiry', () => {
        const { manager, advance } = withFakeClock();
        manager.start('player-a', 'sword', 100);
        advance(50);
        manager.start('player-a', 'sword', 10);
        assert.equal(manager.remaining('player-a', 'sword'), 10);
    });

    it('releases memory lazily on read', () => {
        const { manager, advance } = withFakeClock();
        manager.start('player-a', 'sword', 10);
        assert.equal(manager.trackedPlayerCount, 1);
        advance(10);
        manager.remaining('player-a', 'sword');
        assert.equal(manager.trackedPlayerCount, 0);
    });

    it('sweeps expired entries without touching live ones', () => {
        const { manager, advance } = withFakeClock();
        manager.start('player-a', 'short', 10);
        manager.start('player-a', 'long', 1000);
        manager.start('player-b', 'short', 10);
        advance(10);

        assert.equal(manager.sweep(), 2);
        assert.equal(manager.keyCountFor('player-a'), 1);
        assert.equal(manager.trackedPlayerCount, 1);
    });

    it('clears everything for a departing player', () => {
        const { manager } = withFakeClock();
        manager.start('player-a', 'one', 100);
        manager.start('player-a', 'two', 100);
        manager.start('player-b', 'one', 100);

        manager.clearPlayer('player-a');
        assert.equal(manager.keyCountFor('player-a'), 0);
        assert.equal(manager.isReady('player-b', 'one'), false);
    });
});
