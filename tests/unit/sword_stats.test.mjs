import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    BASE_MELEE_DAMAGE,
    describeAll,
    describeSword,
    repairAmountFor,
    resolveStats,
    summariseBinding,
} from '../../packs/CustomSwordsBP/scripts/core/sword_stats.js';

/** @param {object} overrides */
function sword(overrides = {}) {
    return {
        id: 'custom_swords:example',
        name: 'Example',
        rarity: 'epic',
        description: 'An example sword.',
        item: { attackDamage: 8, durability: 800, enchantValue: 14, repairItems: ['minecraft:iron_ingot'] },
        abilities: [
            {
                activation: 'use',
                abilityId: 'custom_swords:shockwave',
                cooldownTicks: 140,
                targeting: { type: 'cone', range: 6, angleDegrees: 60 },
            },
        ],
        ...overrides,
    };
}

describe('resolveStats', () => {
    it('adds the player base damage to the authored component value', () => {
        // `minecraft:damage` is documented as EXTRA damage on top of the base.
        const stats = resolveStats(sword());
        assert.equal(stats.attackDamage, 8);
        assert.equal(stats.meleeDamage, BASE_MELEE_DAMAGE + 8);
    });

    it('reports enchantability from the enchant value', () => {
        assert.equal(resolveStats(sword()).enchantable, true);
        assert.equal(resolveStats(sword({ item: { attackDamage: 1, durability: 10 } })).enchantable, false);
        assert.equal(resolveStats(sword({ item: { attackDamage: 1, durability: 10, enchantValue: 0 } })).enchantable, false);
    });

    it('defaults optional fields rather than returning undefined', () => {
        const stats = resolveStats(sword({ item: { attackDamage: 1, durability: 40 } }));
        assert.deepEqual(stats.repairItems, []);
        assert.equal(stats.enchantValue, 0);
    });

    it('resolves the rarity tier', () => {
        assert.equal(resolveStats(sword()).rarity.label, 'Epic');
        assert.throws(() => resolveStats(sword({ rarity: 'nonsense' })), /Unknown rarity/);
    });
});

describe('repairAmountFor', () => {
    it('restores a quarter of the bar per repair item', () => {
        assert.equal(repairAmountFor(800), 200);
        assert.equal(repairAmountFor(250), 63);
    });

    it('never returns zero, even for a very fragile sword', () => {
        assert.equal(repairAmountFor(1), 1);
        assert.equal(repairAmountFor(2), 1);
    });
});

describe('summariseBinding', () => {
    it('converts cooldown ticks to seconds and surfaces targeting', () => {
        const summary = summariseBinding(sword().abilities[0]);
        assert.equal(summary?.cooldownTicks, 140);
        assert.equal(summary?.cooldownSeconds, 7);
        assert.equal(summary?.targetingType, 'cone');
        assert.equal(summary?.range, 6);
    });

    it('defaults an unbound envelope to self-targeting with no cooldown', () => {
        const summary = summariseBinding({ activation: 'attack', abilityId: 'custom_swords:x' });
        assert.equal(summary?.cooldownTicks, 0);
        assert.equal(summary?.targetingType, 'self');
        assert.equal(summary?.range, undefined);
    });

    it('returns undefined for an absent binding', () => {
        assert.equal(summariseBinding(undefined), undefined);
    });
});

describe('describeSword', () => {
    it('produces one consistent display record', () => {
        const description = describeSword(sword());
        assert.equal(description.id, 'custom_swords:example');
        assert.equal(description.coloredName, '§dExample§r');
        assert.equal(description.rarityLabel, 'Epic');
        assert.equal(description.isTestItem, false);
        assert.equal(description.stats.meleeDamage, 9);
        assert.deepEqual(
            description.abilities.map((a) => a.activation),
            ['use'],
        );
    });

    it('lists every binding a sword carries, in declaration order', () => {
        const description = describeSword(
            sword({
                abilities: [
                    { activation: 'use', abilityId: 'custom_swords:shockwave', cooldownTicks: 40 },
                    { activation: 'sneak_attack', abilityId: 'custom_swords:shockwave', cooldownTicks: 20 },
                ],
            }),
        );
        assert.deepEqual(
            description.abilities.map((a) => a.activation),
            ['use', 'sneak_attack'],
        );
    });
});

describe('describeAll', () => {
    it('sorts by rarity then id, so reports and the codex read consistently', () => {
        const swords = [
            sword({ id: 'custom_swords:zulu', rarity: 'common' }),
            sword({ id: 'custom_swords:alpha', rarity: 'mythic' }),
            sword({ id: 'custom_swords:bravo', rarity: 'common' }),
        ];
        assert.deepEqual(
            describeAll(swords).map((d) => d.id),
            ['custom_swords:bravo', 'custom_swords:zulu', 'custom_swords:alpha'],
        );
    });

    it('does not mutate the input array', () => {
        const swords = [sword({ id: 'custom_swords:b', rarity: 'mythic' }), sword({ id: 'custom_swords:a' })];
        const before = swords.map((s) => s.id);
        describeAll(swords);
        assert.deepEqual(
            swords.map((s) => s.id),
            before,
        );
    });
});
