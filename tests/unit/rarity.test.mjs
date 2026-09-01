import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    RARITIES,
    RARITY_TIERS,
    colorize,
    compareRarity,
    isRarity,
    rarityOf,
    requireRarity,
} from '../../packs/CustomSwordsBP/scripts/core/rarity.js';

describe('rarity tiers', () => {
    it('exposes the six planned tiers in ascending order', () => {
        assert.deepEqual(RARITIES, ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']);
    });

    it('gives every tier a complete, distinct presentation', () => {
        const colours = new Set();
        const orders = new Set();
        for (const id of RARITIES) {
            const tier = RARITY_TIERS[id];
            assert.equal(tier.id, id);
            assert.ok(tier.label.length > 0, `${id} needs a label`);
            assert.match(tier.colorCode, /^§.$/, `${id} needs a section colour code`);
            assert.ok(tier.colorName.length > 0, `${id} needs a colour name`);
            colours.add(tier.colorCode);
            orders.add(tier.order);
        }
        assert.equal(colours.size, RARITIES.length, 'tiers must be visually distinguishable');
        assert.equal(orders.size, RARITIES.length, 'tier order must be unique');
    });

    it('is immutable', () => {
        assert.throws(() => {
            // @ts-expect-error deliberately mutating a frozen tier
            RARITY_TIERS.common.label = 'Changed';
        }, TypeError);
    });

    it('recognises and rejects tier ids', () => {
        assert.equal(isRarity('mythic'), true);
        assert.equal(isRarity('ultra'), false);
        assert.equal(isRarity(undefined), false);
        // Must not be fooled by inherited Object properties.
        assert.equal(isRarity('toString'), false);
        assert.equal(isRarity('constructor'), false);
    });

    it('looks up tiers, throwing only where a caller asked it to', () => {
        assert.equal(rarityOf('rare')?.label, 'Rare');
        assert.equal(rarityOf('nope'), undefined);
        assert.equal(requireRarity('epic').order, 3);
        assert.throws(() => requireRarity('nope'), /Unknown rarity 'nope'/);
    });

    it('colours text and resets afterwards', () => {
        assert.equal(colorize('legendary', 'Sunforge'), '§6Sunforge§r');
        assert.equal(colorize('nonsense', 'Plain'), 'Plain', 'an unknown tier must not corrupt the string');
    });

    it('sorts ascending by tier', () => {
        const sorted = ['mythic', 'common', 'epic', 'uncommon'].sort(compareRarity);
        assert.deepEqual(sorted, ['common', 'uncommon', 'epic', 'mythic']);
    });
});
