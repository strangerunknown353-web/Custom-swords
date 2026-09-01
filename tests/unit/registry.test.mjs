import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Registry } from '../../packs/CustomSwordsBP/scripts/core/registry.js';

describe('Registry', () => {
    it('stores and retrieves by id', () => {
        const registry = new Registry('ability');
        registry.register('ns:one', { id: 'ns:one' });
        assert.deepEqual(registry.get('ns:one'), { id: 'ns:one' });
        assert.equal(registry.size, 1);
        assert.deepEqual(registry.ids(), ['ns:one']);
    });

    it('rejects duplicates', () => {
        const registry = new Registry('ability');
        registry.register('ns:one', {});
        assert.throws(() => registry.register('ns:one', {}), /Duplicate ability id/);
    });

    it('rejects empty ids', () => {
        const registry = new Registry('sword');
        assert.throws(() => registry.register('', {}), /non-empty string/);
    });

    it('refuses registration once sealed', () => {
        const registry = new Registry('sword');
        registry.seal();
        assert.equal(registry.isSealed, true);
        assert.throws(() => registry.register('ns:late', {}), /registry is sealed/);
    });

    it('require() names the registered ids when a lookup misses', () => {
        const registry = new Registry('ability');
        registry.register('ns:known', {});
        assert.throws(() => registry.require('ns:unknown'), /Unknown ability 'ns:unknown'.*ns:known/s);
    });
});
