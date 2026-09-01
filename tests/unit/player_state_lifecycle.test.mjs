/**
 * Life-scoped player state.
 *
 * The rule this pins: dying clears the state that belonged to that life, and
 * nothing else. In particular it must NOT clear cooldowns — dying to reset a
 * long cooldown would be an exploit.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LIFE_SCOPE, PlayerStateStore, lifeKey } from '../../packs/CustomSwordsBP/scripts/core/player_state.js';
import { CooldownManager } from '../../packs/CustomSwordsBP/scripts/core/cooldown_manager.js';

describe('life-scoped state', () => {
    it('builds keys with the documented prefix', () => {
        assert.equal(lifeKey('combo'), `${LIFE_SCOPE}combo`);
    });

    it('clears only life-scoped keys on death', () => {
        const store = new PlayerStateStore();
        store.set('player-a', lifeKey('combo'), 5);
        store.set('player-a', lifeKey('charge'), 2);
        store.set('player-a', 'unlocked_swords', ['a', 'b']);

        assert.equal(store.clearLifeScope('player-a'), 2);
        assert.equal(store.get('player-a', lifeKey('combo'), 0), 0);
        assert.deepEqual(store.get('player-a', 'unlocked_swords', []), ['a', 'b']);
    });

    it('leaves other players untouched', () => {
        const store = new PlayerStateStore();
        store.set('player-a', lifeKey('combo'), 5);
        store.set('player-b', lifeKey('combo'), 9);

        store.clearLifeScope('player-a');
        assert.equal(store.get('player-b', lifeKey('combo'), 0), 9);
    });

    it('drops the player bucket when nothing survives the clear', () => {
        const store = new PlayerStateStore();
        store.set('player-a', lifeKey('combo'), 5);
        store.clearLifeScope('player-a');
        assert.equal(store.trackedPlayerCount, 0);
    });

    it('is a no-op for a player with no state', () => {
        const store = new PlayerStateStore();
        assert.equal(store.clearLifeScope('nobody'), 0);
    });

    it('does not touch cooldowns, so death cannot be used to reset one', () => {
        let tick = 0;
        const cooldowns = new CooldownManager(() => tick);
        const store = new PlayerStateStore();

        cooldowns.start('player-a', 'custom_swords:ultimate', 1200);
        store.set('player-a', lifeKey('combo'), 3);

        store.clearLifeScope('player-a');

        assert.equal(cooldowns.remaining('player-a', 'custom_swords:ultimate'), 1200);
    });
});
