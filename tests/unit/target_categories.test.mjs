/**
 * Target categories decide what a sword is allowed to hurt. A hole here means
 * an ability meant for hostiles slaughtering a village of villagers, so each category
 * is pinned against the real vanilla family data.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    DEFAULT_CATEGORIES,
    TARGET_CATEGORIES,
    TARGET_CATEGORY_IDS,
    categoryOf,
    isTargetCategory,
    matchesCategories,
    matchesCategory,
    queryFor,
} from '../../packs/CustomSwordsBP/scripts/core/target_categories.js';

/** Family lists exactly as the vanilla entity files declare them. */
const ZOMBIE = ['zombie', 'undead', 'monster', 'mob'];
const BLAZE = ['blaze', 'monster', 'mob'];
const PIG = ['pig', 'mob'];
const ARMOR_STAND = ['armor_stand', 'inanimate', 'mob'];
const SPIDER = ['spider', 'arthropod', 'monster', 'mob'];
const PLAYER = ['player'];
const FOREIGN = [];

describe('target categories', () => {
    it('defaults to unrestricted', () => {
        assert.deepEqual(DEFAULT_CATEGORIES, ['any']);
    });

    it('gives every category a complete definition', () => {
        for (const id of TARGET_CATEGORY_IDS) {
            const category = TARGET_CATEGORIES[id];
            assert.equal(category.id, id);
            assert.ok(category.label.length > 0, `${id} needs a label`);
            assert.ok(Array.isArray(category.families));
            assert.ok(Array.isArray(category.excludeFamilies));
        }
    });

    it('recognises and rejects category ids', () => {
        assert.equal(isTargetCategory('hostile'), true);
        assert.equal(isTargetCategory('friendly'), false);
        assert.equal(isTargetCategory(undefined), false);
        assert.equal(isTargetCategory('toString'), false);
        assert.equal(categoryOf('nope'), undefined);
    });

    describe('classification against real vanilla family data', () => {
        it('hostile matches monsters and nothing else', () => {
            assert.equal(matchesCategory('minecraft:zombie', ZOMBIE, 'hostile'), true);
            assert.equal(matchesCategory('minecraft:blaze', BLAZE, 'hostile'), true);
            assert.equal(matchesCategory('minecraft:pig', PIG, 'hostile'), false);
            assert.equal(matchesCategory('minecraft:player', PLAYER, 'hostile'), false);
        });

        it('passive matches peaceful mobs but never monsters or armour stands', () => {
            assert.equal(matchesCategory('minecraft:pig', PIG, 'passive'), true);
            assert.equal(matchesCategory('minecraft:zombie', ZOMBIE, 'passive'), false);
            assert.equal(matchesCategory('minecraft:armor_stand', ARMOR_STAND, 'passive'), false);
        });

        it('mob matches living things but excludes armour stands', () => {
            assert.equal(matchesCategory('minecraft:pig', PIG, 'mob'), true);
            assert.equal(matchesCategory('minecraft:zombie', ZOMBIE, 'mob'), true);
            assert.equal(matchesCategory('minecraft:armor_stand', ARMOR_STAND, 'mob'), false);
        });

        it('player matches only players', () => {
            assert.equal(matchesCategory('minecraft:player', PLAYER, 'player'), true);
            assert.equal(matchesCategory('minecraft:zombie', ZOMBIE, 'player'), false);
        });

        it('undead and arthropod pick out their families', () => {
            assert.equal(matchesCategory('minecraft:zombie', ZOMBIE, 'undead'), true);
            assert.equal(matchesCategory('minecraft:blaze', BLAZE, 'undead'), false);
            assert.equal(matchesCategory('minecraft:spider', SPIDER, 'arthropod'), true);
        });

        it('any matches everything, including entities with no families at all', () => {
            assert.equal(matchesCategory('other_addon:golem', FOREIGN, 'any'), true);
            assert.equal(matchesCategory('minecraft:zombie', ZOMBIE, 'any'), true);
        });

        it('a foreign entity declaring no families is only ever "any"', () => {
            // An add-on that skips minecraft:type_family cannot be categorised,
            // so it must not be silently swept up by a hostile-only ability.
            assert.equal(matchesCategory('other_addon:golem', FOREIGN, 'hostile'), false);
            assert.equal(matchesCategory('other_addon:golem', FOREIGN, 'mob'), false);
        });

        it('an unknown category matches nothing rather than everything', () => {
            assert.equal(matchesCategory('minecraft:zombie', ZOMBIE, 'nonsense'), false);
        });
    });

    describe('union across several categories', () => {
        it('matches if any one category matches', () => {
            const both = ['hostile', 'player'];
            assert.equal(matchesCategories('minecraft:zombie', ZOMBIE, both), true);
            assert.equal(matchesCategories('minecraft:player', PLAYER, both), true);
            assert.equal(matchesCategories('minecraft:pig', PIG, both), false);
        });

        it('an empty list is unrestricted', () => {
            assert.equal(matchesCategories('minecraft:pig', PIG, []), true);
        });
    });

    describe('engine-side pre-filter', () => {
        it('pushes a single category down to the engine query', () => {
            assert.deepEqual(queryFor(['hostile']), { families: ['monster'] });
            assert.deepEqual(queryFor(['passive']), {
                families: ['mob'],
                excludeFamilies: ['monster', 'inanimate'],
            });
        });

        it('leaves the query wide for several categories', () => {
            // `families` is documented as matching ALL listed families, so
            // pushing a union down would silently return nothing.
            assert.deepEqual(queryFor(['hostile', 'player']), {});
        });

        it('leaves the query wide for `any` and for unknown categories', () => {
            assert.deepEqual(queryFor(['any']), {});
            assert.deepEqual(queryFor(['nonsense']), {});
            assert.deepEqual(queryFor([]), {});
        });
    });
});
