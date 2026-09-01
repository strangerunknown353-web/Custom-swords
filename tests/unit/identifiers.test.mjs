/**
 * The identifier convention is a project-wide contract: the runtime, the
 * generator and the validator all derive from this module, so a regression here
 * would silently desynchronise the packs.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    NAMESPACE,
    SWORD_COMPONENT_ID,
    SWORD_ITEM_TAG,
    SWORD_TEXTURE_DIR,
    abilityId,
    descriptionKey,
    isOwnedIdentifier,
    isValidIdentifier,
    isValidLocalName,
    localNameOf,
    nameKey,
    legacyNameKey,
    CREATIVE_CATEGORY,
    CREATIVE_GROUP,
    namespaceOf,
    swordId,
    swordTexturePath,
} from '../../packs/CustomSwordsBP/scripts/core/identifiers.js';

describe('identifier convention', () => {
    it('derives every project identifier from one namespace', () => {
        assert.equal(NAMESPACE, 'custom_swords');
        assert.equal(SWORD_COMPONENT_ID, 'custom_swords:sword');
        assert.equal(SWORD_ITEM_TAG, 'custom_swords:is_custom_sword');
        assert.equal(swordId('inferno_blade'), 'custom_swords:inferno_blade');
        assert.equal(abilityId('flame_nova'), 'custom_swords:flame_nova');
    });

    it('accepts well-formed identifiers', () => {
        for (const id of ['custom_swords:test_blade', 'minecraft:iron_ingot', 'a:b', 'ns1:name_2']) {
            assert.equal(isValidIdentifier(id), true, id);
        }
    });

    it('rejects malformed identifiers', () => {
        for (const id of [
            'no_namespace',
            'Custom_Swords:blade', // upper case
            'custom_swords:Blade',
            '1bad:name',
            'custom_swords:',
            ':blade',
            'custom swords:blade', // space
            'custom_swords:blade:extra',
            undefined,
            null,
            42,
        ]) {
            assert.equal(isValidIdentifier(/** @type {any} */ (id)), false, String(id));
        }
    });

    it('splits namespace and local name safely', () => {
        assert.equal(namespaceOf('custom_swords:test_blade'), 'custom_swords');
        assert.equal(localNameOf('custom_swords:test_blade'), 'test_blade');
        assert.equal(namespaceOf('unqualified'), '');
        assert.equal(localNameOf('unqualified'), 'unqualified');
    });

    it('recognises only our own namespace as owned', () => {
        assert.equal(isOwnedIdentifier('custom_swords:test_blade'), true);
        assert.equal(isOwnedIdentifier('minecraft:diamond_sword'), false);
        assert.equal(isOwnedIdentifier('other_addon:test_blade'), false);
        assert.equal(isOwnedIdentifier(undefined), false);
        assert.equal(isOwnedIdentifier(null), false);
        assert.equal(isOwnedIdentifier(123), false);
    });

    it('validates bare local names for texture shortnames', () => {
        assert.equal(isValidLocalName('test_blade'), true);
        assert.equal(isValidLocalName('custom_swords:test_blade'), false);
        assert.equal(isValidLocalName('TestBlade'), false);
    });

    it('builds localisation keys and texture paths consistently', () => {
        assert.equal(descriptionKey('custom_swords:test_blade'), 'item.custom_swords:test_blade.description');
        assert.equal(SWORD_TEXTURE_DIR, 'textures/items/custom_swords/swords');
        assert.equal(swordTexturePath('test_blade'), 'textures/items/custom_swords/swords/test_blade');
    });

    // Regression: v0.5.0 shipped `item.<id>.name` as the only name key. That is
    // the vanilla convention, but Minecraft generates `item.<id>` for a
    // namespaced custom item, so nothing resolved and every tooltip showed the
    // raw identifier.
    it('uses the engine key for a custom item display name — no .name suffix', () => {
        assert.equal(nameKey('custom_swords:inferno_sword'), 'item.custom_swords:inferno_sword');
        assert.ok(!nameKey('custom_swords:inferno_sword').endsWith('.name'));
    });

    it('still exposes the vanilla-style key, which is emitted as a hedge', () => {
        assert.equal(legacyNameKey('custom_swords:inferno_sword'), 'item.custom_swords:inferno_sword.name');
        assert.notEqual(nameKey('custom_swords:inferno_sword'), legacyNameKey('custom_swords:inferno_sword'));
    });

    // Regression: v0.5.0 used the bare `itemGroup.name.sword`, which is not a
    // valid group reference, so the swords landed in the generic Items tab.
    it('namespaces the creative inventory group', () => {
        assert.equal(CREATIVE_CATEGORY, 'equipment');
        assert.equal(CREATIVE_GROUP, 'minecraft:itemGroup.name.sword');
        assert.ok(CREATIVE_GROUP.startsWith('minecraft:'));
    });
});
