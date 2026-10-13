/**
 * The in-game guide book: its content, its screens and its first-join gift.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { MockDimension, MockPlayer, resetMocks } from '../mocks/minecraft_server.mjs';
import { queueFormResponse, resetForms, shownForms } from '../mocks/minecraft_server_ui.mjs';

import { SWORDS } from '../../packs/CustomSwordsBP/scripts/swords/index.js';
import {
    describePower,
    guideOrder,
    howToPlayPage,
    itemName,
    recipeLines,
    swordPage,
} from '../../packs/CustomSwordsBP/scripts/core/guide_content.js';
import { GuideUi } from '../../packs/CustomSwordsBP/scripts/systems/guide_ui.js';
import { GUIDE_GIVEN_PROPERTY, giveGuideOnce } from '../../packs/CustomSwordsBP/scripts/core/bootstrap.js';
import { GUIDE_ITEM_ID } from '../../packs/CustomSwordsBP/scripts/core/identifiers.js';
import { log } from '../../packs/CustomSwordsBP/scripts/core/log.js';

const strip = (text) => text.replace(/§./g, '');

describe('guide content', () => {
    it('names items the way players know them', () => {
        assert.equal(itemName('minecraft:blaze_rod'), 'Blaze Rod');
        assert.equal(itemName('minecraft:netherite_ingot'), 'Netherite Ingot');
    });

    it('lists every sword, Uncommon first and Mythic last', () => {
        const order = guideOrder(SWORDS);
        assert.equal(order.length, 20);
        assert.equal(order[0].rarity, 'uncommon');
        assert.equal(order.at(-1).rarity, 'mythic');
    });

    it('draws each recipe as a 3x3 grid with a key', () => {
        const dragon = SWORDS.find((s) => s.id === 'custom_swords:dragon_sword');
        const lines = recipeLines(dragon.recipe).map(strip);
        assert.equal(lines.filter((l) => l.includes('[')).length, 3, 'three grid rows');
        assert.ok(lines.some((l) => l.includes('B = Dragon Breath x3')));
        assert.ok(lines.some((l) => l.includes('H = Dragon Head')));
    });

    it("every sword's page has its recipe, every power and its passive", () => {
        for (const sword of SWORDS) {
            const body = strip(swordPage(sword).body);
            assert.match(body, /Recipe/, `${sword.id}: no recipe`);
            for (const [ch, item] of Object.entries(sword.recipe.key)) {
                assert.ok(body.includes(`${ch} = ${itemName(item)}`), `${sword.id}: recipe key ${ch} missing`);
            }
            for (const binding of sword.abilities) {
                assert.ok(body.includes(binding.label), `${sword.id}: ${binding.label} missing`);
            }
            assert.match(body, /Passive/);
        }
    });

    it('describes powers in plain words', () => {
        const frost = SWORDS.find((s) => s.id === 'custom_swords:frost_sword');
        const lance = frost.abilities.find((b) => b.label === 'Ice Lance');
        assert.match(describePower(lance), /Beam through everything you aim at \(14 blocks\) · 5 dmg/);
    });

    it('explains the controls and how to craft the book', () => {
        const body = strip(howToPlayPage().body);
        assert.match(body, /Crouch - switch to the next power/);
        assert.match(body, /Book \+ Stick/);
    });
});

describe('guide screens', () => {
    beforeEach(() => {
        resetMocks();
        resetForms();
    });

    it('opens on the index with How to play and every sword, with icons', async () => {
        const ui = new GuideUi(SWORDS, log);
        await ui.open(new MockPlayer({ id: 'p', dimension: new MockDimension() }));
        const index = shownForms[0];
        assert.equal(index.buttons.length, 21);
        assert.match(index.buttons[0].text, /How to play/);
        assert.ok(index.buttons.slice(1).every((b) => b.icon.startsWith('textures/items/custom_swords/swords/')));
    });

    it('goes from the index to a sword, then to the next one, then back to the list', async () => {
        const ui = new GuideUi(SWORDS, log);
        queueFormResponse({ selection: 1 }); // first sword
        queueFormResponse({ selection: 0 }); // next sword
        queueFormResponse({ selection: 2 }); // all swords
        await ui.open(new MockPlayer({ id: 'p', dimension: new MockDimension() }));
        const titles = shownForms.map((f) => strip(f.title));
        const order = guideOrder(SWORDS);
        assert.deepEqual(titles.slice(0, 4), ['Custom Swords Guide', order[0].name, order[1].name, 'Custom Swords Guide']);
    });

    it('previous from the first sword wraps to the last', async () => {
        const ui = new GuideUi(SWORDS, log);
        queueFormResponse({ selection: 1 });
        queueFormResponse({ selection: 1 });
        await ui.open(new MockPlayer({ id: 'p', dimension: new MockDimension() }));
        assert.equal(strip(shownForms[2].title), guideOrder(SWORDS).at(-1).name);
    });
});

describe('guide book gift', () => {
    beforeEach(() => resetMocks());

    function playerWithInventory({ full = false } = {}) {
        const dimension = new MockDimension();
        dimension.spawned = [];
        dimension.spawnItem = (item, location) => dimension.spawned.push({ item, location });
        const player = new MockPlayer({ id: 'p', location: { x: 1, y: 64, z: 2 }, dimension });
        const added = [];
        player.components['minecraft:inventory'] = {
            container: { addItem: (item) => (full ? item : (added.push(item), undefined)) },
        };
        return { player, added, dimension };
    }

    it('gives one guide book on first join, and never again', () => {
        const { player, added } = playerWithInventory();
        assert.equal(giveGuideOnce(player), true);
        assert.equal(giveGuideOnce(player), false);
        assert.equal(added.length, 1);
        assert.equal(added[0].typeId, GUIDE_ITEM_ID);
        assert.equal(player.getDynamicProperty(GUIDE_GIVEN_PROPERTY), true);
    });

    it('drops the book at the player when the inventory is full', () => {
        const { player, dimension } = playerWithInventory({ full: true });
        assert.equal(giveGuideOnce(player), true);
        assert.equal(dimension.spawned.length, 1);
        assert.equal(dimension.spawned[0].item.typeId, GUIDE_ITEM_ID);
    });
});
