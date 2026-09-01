import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PlayerStateStore } from '../../packs/CustomSwordsBP/scripts/core/player_state.js';

describe('PlayerStateStore', () => {
    it('returns the fallback without storing it', () => {
        const store = new PlayerStateStore();
        assert.equal(store.get('a', 'combo', 0), 0);
        assert.equal(store.trackedPlayerCount, 0);
    });

    it('isolates state per player', () => {
        const store = new PlayerStateStore();
        store.set('a', 'combo', 3);
        assert.equal(store.get('a', 'combo', 0), 3);
        assert.equal(store.get('b', 'combo', 0), 0);
    });

    it('updates through a reducer', () => {
        const store = new PlayerStateStore();
        assert.equal(store.update('a', 'combo', 0, (n) => n + 1), 1);
        assert.equal(store.update('a', 'combo', 0, (n) => n + 1), 2);
    });

    it('drops empty buckets on delete', () => {
        const store = new PlayerStateStore();
        store.set('a', 'combo', 1);
        store.delete('a', 'combo');
        assert.equal(store.trackedPlayerCount, 0);
    });

    it('retains only live players', () => {
        const store = new PlayerStateStore();
        store.set('a', 'x', 1);
        store.set('b', 'x', 1);
        store.set('c', 'x', 1);
        assert.equal(store.retainOnly(['a', 'c']), 1);
        assert.equal(store.get('b', 'x', 'gone'), 'gone');
        assert.equal(store.trackedPlayerCount, 2);
    });
});
