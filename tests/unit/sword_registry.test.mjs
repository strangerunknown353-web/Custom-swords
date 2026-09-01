/**
 * The Sword Registry is the central source of truth. These tests pin the
 * queries the rest of the addon depends on, and the immutability guarantee that
 * makes shared metadata multiplayer-safe.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SwordRegistry } from '../../packs/CustomSwordsBP/scripts/core/sword_registry.js';

/** @param {object} overrides */
function sword(overrides = {}) {
    return {
        id: 'custom_swords:example',
        name: 'Example',
        rarity: 'rare',
        description: 'An example sword.',
        item: { attackDamage: 7, durability: 500, enchantValue: 12 },
        active: { abilityId: 'custom_swords:diagnostic_pulse', cooldownTicks: 40 },
        ...overrides,
    };
}

/** @returns {SwordRegistry} */
function populated() {
    const registry = new SwordRegistry();
    registry.register(sword({ id: 'custom_swords:plain', name: 'Plain', rarity: 'common' }));
    registry.register(sword({ id: 'custom_swords:fancy', name: 'Fancy', rarity: 'legendary' }));
    registry.register(sword({ id: 'custom_swords:probe', name: 'Probe', rarity: 'common', isTestItem: true }));
    return registry;
}

describe('SwordRegistry', () => {
    it('registers and retrieves by identifier', () => {
        const registry = new SwordRegistry();
        registry.register(sword());
        assert.equal(registry.get('custom_swords:example')?.name, 'Example');
        assert.equal(registry.require('custom_swords:example').rarity, 'rare');
        assert.equal(registry.has('custom_swords:example'), true);
        assert.equal(registry.size, 1);
    });

    it('rejects duplicates and late registration', () => {
        const registry = new SwordRegistry();
        registry.register(sword());
        assert.throws(() => registry.register(sword()), /Duplicate sword id/);
        registry.seal();
        assert.equal(registry.isSealed, true);
        assert.throws(() => registry.register(sword({ id: 'custom_swords:late' })), /registry is sealed/);
    });

    it('deep-freezes definitions so shared metadata cannot be mutated at runtime', () => {
        const registry = new SwordRegistry();
        const definition = sword();
        registry.register(definition);
        const stored = registry.require('custom_swords:example');

        assert.throws(() => {
            stored.name = 'Hacked';
        }, TypeError);
        assert.throws(() => {
            stored.item.attackDamage = 999;
        }, TypeError);
        assert.throws(() => {
            stored.active.cooldownTicks = 0;
        }, TypeError);
    });

    describe('isCustomSword', () => {
        it('recognises our registered swords', () => {
            assert.equal(populated().isCustomSword('custom_swords:plain'), true);
        });

        it('never claims a vanilla item', () => {
            const registry = populated();
            for (const id of ['minecraft:diamond_sword', 'minecraft:netherite_sword', 'minecraft:stick']) {
                assert.equal(registry.isCustomSword(id), false, id);
            }
        });

        it('rejects an unregistered id inside our own namespace', () => {
            assert.equal(populated().isCustomSword('custom_swords:not_registered'), false);
        });

        it('rejects another add-on that happens to name a sword the same', () => {
            assert.equal(populated().isCustomSword('other_addon:plain'), false);
        });

        it('answers false for junk instead of throwing', () => {
            const registry = populated();
            for (const value of [undefined, null, 42, {}, [], '', 'no_namespace']) {
                assert.equal(registry.isCustomSword(/** @type {any} */ (value)), false, String(value));
            }
        });
    });

    it('returns stats and ability bindings', () => {
        const registry = populated();
        assert.equal(registry.getStats('custom_swords:plain')?.durability, 500);
        assert.equal(registry.getStats('custom_swords:missing'), undefined);

        const abilities = registry.getAbilities('custom_swords:plain');
        assert.equal(abilities.active?.abilityId, 'custom_swords:diagnostic_pulse');
        assert.equal(abilities.passive, undefined);

        // Always an object, so callers can destructure without a null check.
        assert.deepEqual(registry.getAbilities('custom_swords:missing'), { active: undefined, passive: undefined });
    });

    it('returns the binding for one trigger', () => {
        const registry = populated();
        assert.equal(registry.getBinding('custom_swords:plain', 'use')?.cooldownTicks, 40);
        assert.equal(registry.getBinding('custom_swords:plain', 'hit'), undefined);
        assert.equal(registry.getBinding('custom_swords:missing', 'use'), undefined);
    });

    it('assembles a consistent display record', () => {
        const display = populated().getDisplay('custom_swords:fancy');
        assert.equal(display?.name, 'Fancy');
        assert.equal(display?.coloredName, '§6Fancy§r');
        assert.equal(display?.rarity?.label, 'Legendary');
        assert.equal(populated().getDisplay('custom_swords:missing'), undefined);
    });

    it('separates shipped swords from diagnostic items and sorts by rarity', () => {
        const registry = populated();
        assert.deepEqual(
            registry.shipped().map((s) => s.id),
            ['custom_swords:plain', 'custom_swords:fancy'],
            'shipped swords sort common -> legendary and exclude diagnostics',
        );
        assert.deepEqual(
            registry.testItems().map((s) => s.id),
            ['custom_swords:probe'],
        );
        assert.equal(registry.all().length, 3);
    });
});
