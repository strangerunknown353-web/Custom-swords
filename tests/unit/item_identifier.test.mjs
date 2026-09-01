/**
 * Item identification must handle every item a player can hold without ever
 * throwing and without ever claiming a vanilla item. These tests walk the five
 * cases the milestone requires: our sword, a different custom sword, a vanilla
 * sword, an unrelated item, and malformed input.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EquipmentSlot, InvalidMockItemStack, MockItemStack, MockPlayer } from '../mocks/minecraft_server.mjs';
import { ItemIdentifier } from '../../packs/CustomSwordsBP/scripts/core/item_identifier.js';
import { SwordRegistry } from '../../packs/CustomSwordsBP/scripts/core/sword_registry.js';

const VANILLA_SWORD_TAG = 'minecraft:is_sword';

/** @param {string} id @param {string} name */
function definition(id, name) {
    return {
        id,
        name,
        rarity: 'common',
        description: `${name}.`,
        item: { attackDamage: 5, durability: 100 },
        active: { abilityId: 'custom_swords:diagnostic_pulse' },
    };
}

function makeIdentifier() {
    const swords = new SwordRegistry();
    swords.register(definition('custom_swords:test_blade', 'Test Blade'));
    swords.register(definition('custom_swords:other_blade', 'Other Blade'));
    swords.seal();
    return { identifier: new ItemIdentifier({ swords }), swords };
}

describe('ItemIdentifier', () => {
    describe('resolution', () => {
        it('identifies each of our registered swords distinctly', () => {
            const { identifier } = makeIdentifier();
            assert.equal(identifier.fromItemStack(new MockItemStack('custom_swords:test_blade'))?.name, 'Test Blade');
            assert.equal(identifier.fromItemStack(new MockItemStack('custom_swords:other_blade'))?.name, 'Other Blade');
        });

        it('ignores vanilla swords entirely', () => {
            const { identifier } = makeIdentifier();
            const diamond = new MockItemStack('minecraft:diamond_sword', [VANILLA_SWORD_TAG]);
            assert.equal(identifier.fromItemStack(diamond), undefined);
            assert.equal(identifier.isCustomSword(diamond), false);
        });

        it('ignores unrelated custom items, including ones in our own namespace', () => {
            const { identifier } = makeIdentifier();
            assert.equal(identifier.fromItemStack(new MockItemStack('other_addon:magic_wand')), undefined);
            assert.equal(identifier.fromItemStack(new MockItemStack('custom_swords:not_a_registered_sword')), undefined);
        });

        it('fails safe on malformed and missing input', () => {
            const { identifier } = makeIdentifier();
            for (const value of [undefined, null]) {
                assert.equal(identifier.fromItemStack(/** @type {any} */ (value)), undefined);
            }
            for (const value of [undefined, null, 42, '', 'no_namespace', {}]) {
                assert.equal(identifier.fromTypeId(/** @type {any} */ (value)), undefined, String(value));
            }
        });

        it('treats an invalidated ItemStack handle as a miss, not an error', () => {
            const { identifier } = makeIdentifier();
            const stale = new InvalidMockItemStack();
            assert.doesNotThrow(() => identifier.fromItemStack(/** @type {any} */ (stale)));
            assert.equal(identifier.fromItemStack(/** @type {any} */ (stale)), undefined);
        });
    });

    describe('describe', () => {
        it('classifies all four kinds of item', () => {
            const { identifier } = makeIdentifier();

            assert.equal(identifier.describe(new MockItemStack('custom_swords:test_blade')).kind, 'custom_sword');
            assert.equal(
                identifier.describe(new MockItemStack('minecraft:iron_sword', [VANILLA_SWORD_TAG])).kind,
                'vanilla_sword',
            );
            assert.equal(identifier.describe(new MockItemStack('minecraft:stick')).kind, 'other_item');
            assert.equal(identifier.describe(undefined).kind, 'empty');
        });

        it('returns the definition only for our own swords', () => {
            const { identifier } = makeIdentifier();
            assert.equal(identifier.describe(new MockItemStack('custom_swords:test_blade')).sword?.name, 'Test Blade');
            assert.equal(identifier.describe(new MockItemStack('minecraft:iron_sword', [VANILLA_SWORD_TAG])).sword, undefined);
        });

        it('does not throw when hasTag itself fails', () => {
            const { identifier } = makeIdentifier();
            const hostile = new MockItemStack('minecraft:mystery');
            hostile.hasTag = () => {
                throw new Error('engine said no');
            };
            assert.equal(identifier.describe(hostile).kind, 'other_item');
        });
    });

    describe('heldSword', () => {
        it('finds a custom sword in the main hand', () => {
            const { identifier } = makeIdentifier();
            const player = new MockPlayer({ id: 'player-a' });
            player.setMainhand(new MockItemStack('custom_swords:test_blade'));

            const held = identifier.heldSword(player);
            assert.equal(held?.sword.id, 'custom_swords:test_blade');
            assert.equal(held?.itemStack.typeId, 'custom_swords:test_blade');
        });

        it('returns undefined for an empty hand, a vanilla sword, or another item', () => {
            const { identifier } = makeIdentifier();
            const player = new MockPlayer({ id: 'player-a' });

            assert.equal(identifier.heldSword(player), undefined);
            player.setMainhand(new MockItemStack('minecraft:diamond_sword', [VANILLA_SWORD_TAG]));
            assert.equal(identifier.heldSword(player), undefined);
            player.setMainhand(new MockItemStack('minecraft:dirt'));
            assert.equal(identifier.heldSword(player), undefined);
        });

        it('reads the main hand slot specifically, not the off hand', () => {
            const { identifier } = makeIdentifier();
            const player = new MockPlayer({ id: 'player-a' });
            player.equipment[EquipmentSlot.Offhand] = new MockItemStack('custom_swords:test_blade');

            assert.equal(identifier.heldSword(player), undefined);
        });

        it('fails safe for a missing or removed player', () => {
            const { identifier } = makeIdentifier();
            assert.equal(identifier.heldSword(undefined), undefined);
            assert.equal(identifier.heldSword(null), undefined);

            const gone = new MockPlayer({ id: 'player-gone' });
            gone.setMainhand(new MockItemStack('custom_swords:test_blade'));
            gone.isValid = false;
            assert.doesNotThrow(() => identifier.heldSword(gone));
            assert.equal(identifier.heldSword(gone), undefined);
        });
    });
});
