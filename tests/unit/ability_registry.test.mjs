import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AbilityRegistry } from '../../packs/CustomSwordsBP/scripts/core/ability_registry.js';

/** @param {string} id */
function ability(id, extra = {}) {
    return { id, name: id.split(':')[1], description: 'An ability.', defaults: { damage: 3 }, execute() {}, ...extra };
}

describe('AbilityRegistry', () => {
    it('registers and retrieves by identifier', () => {
        const registry = new AbilityRegistry();
        registry.register(ability('custom_swords:shockwave'));
        assert.equal(registry.get('custom_swords:shockwave')?.name, 'shockwave');
        assert.equal(registry.has('custom_swords:shockwave'), true);
        assert.equal(registry.size, 1);
    });

    it('rejects duplicates and late registration', () => {
        const registry = new AbilityRegistry();
        registry.register(ability('custom_swords:a'));
        assert.throws(() => registry.register(ability('custom_swords:a')), /Duplicate ability id/);
        registry.seal();
        assert.throws(() => registry.register(ability('custom_swords:b')), /registry is sealed/);
    });

    it('freezes defaults but leaves execute callable', () => {
        const registry = new AbilityRegistry();
        registry.register(ability('custom_swords:a'));
        const stored = registry.require('custom_swords:a');
        assert.throws(() => {
            stored.defaults.damage = 99;
        }, TypeError);
        assert.equal(typeof stored.execute, 'function');
        assert.doesNotThrow(() => stored.execute({}));
    });

    it('indexes which swords use an ability, and on which activation', () => {
        const registry = new AbilityRegistry();
        registry.register(ability('custom_swords:shockwave'));
        registry.link('custom_swords:shockwave', 'custom_swords:blade_a', 'use');
        registry.link('custom_swords:shockwave', 'custom_swords:blade_b', 'sneak_attack');

        assert.deepEqual(registry.swordsUsing('custom_swords:shockwave'), [
            { swordId: 'custom_swords:blade_a', activation: 'use' },
            { swordId: 'custom_swords:blade_b', activation: 'sneak_attack' },
        ]);
        assert.deepEqual(registry.swordsUsing('custom_swords:unknown'), []);
    });

    it('reports abilities no sword binds', () => {
        const registry = new AbilityRegistry();
        registry.register(ability('custom_swords:used'));
        registry.register(ability('custom_swords:orphan'));
        registry.link('custom_swords:used', 'custom_swords:blade', 'use');
        assert.deepEqual(registry.unused(), ['custom_swords:orphan']);
    });

    it('describes an ability together with its users', () => {
        const registry = new AbilityRegistry();
        registry.register(ability('custom_swords:shockwave'));
        registry.link('custom_swords:shockwave', 'custom_swords:blade', 'use');
        const described = registry.describe('custom_swords:shockwave');
        assert.equal(described?.name, 'shockwave');
        assert.equal(described?.usedBy.length, 1);
        assert.equal(registry.describe('custom_swords:nope'), undefined);
    });
});
