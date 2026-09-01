/**
 * Contract tests against the REAL generated pack files.
 *
 * The v0.5.0 item-registration bugs are the reason this file exists. Both were
 * invisible to the existing tests because the existing tests only covered
 * `identifiers.js`, while the wrong values lived in the generator's output:
 *
 *   - `menu_category.group` was hard-coded in `tools/generate.mjs` as the bare
 *     `itemGroup.name.sword`, so the swords fell into the generic Items tab;
 *   - the only name key in `en_US.lang` was `item.<id>.name`, which the engine
 *     never looks up for a namespaced custom item, so every tooltip showed the
 *     raw identifier.
 *
 * A green unit suite plus a green validator still shipped a broken add-on. So
 * these assertions read the files that actually go into the `.mcaddon`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { PATHS } from '../../tools/lib/project.mjs';
import {
    CREATIVE_CATEGORY,
    CREATIVE_GROUP,
    legacyNameKey,
    nameKey,
    SWORD_COMPONENT_ID,
} from '../../packs/CustomSwordsBP/scripts/core/identifiers.js';

/** @returns {{ file: string, json: any }[]} */
function itemFiles() {
    return fs
        .readdirSync(PATHS.bpItems)
        .filter((f) => f.endsWith('.item.json'))
        .map((f) => ({ file: f, json: JSON.parse(fs.readFileSync(path.join(PATHS.bpItems, f), 'utf8')) }));
}

function resourceLang() {
    return fs.readFileSync(path.join(PATHS.rpTexts, 'en_US.lang'), 'utf8');
}

/** @param {string} text @returns {Set<string>} */
function langKeys(text) {
    const keys = new Set();
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq > 0) keys.add(trimmed.slice(0, eq));
    }
    return keys;
}

describe('generated pack output', () => {
    it('generates one item file per sword', () => {
        assert.ok(itemFiles().length >= 8, 'expected at least 8 generated item definitions');
    });

    it('puts every sword in the vanilla sword group, with the minecraft: namespace', () => {
        for (const { file, json } of itemFiles()) {
            const menu = json['minecraft:item'].description.menu_category;
            assert.ok(menu, `${file}: menu_category missing — the item would default to the Items tab`);
            assert.equal(menu.category, CREATIVE_CATEGORY, `${file}: wrong creative category`);
            assert.equal(menu.group, CREATIVE_GROUP, `${file}: wrong creative group`);
            assert.ok(menu.group.startsWith('minecraft:'), `${file}: group reference must be namespaced`);
        }
    });

    it('names every sword with the key the engine actually generates', () => {
        const keys = langKeys(resourceLang());
        for (const { file, json } of itemFiles()) {
            const id = json['minecraft:item'].description.identifier;
            const declared = json['minecraft:item'].components['minecraft:display_name'].value;

            assert.equal(declared, nameKey(id), `${file}: display_name must use the engine key`);
            assert.ok(!declared.endsWith('.name'), `${file}: '.name' is the vanilla convention, not the custom-item one`);
            assert.ok(keys.has(nameKey(id)), `${file}: '${nameKey(id)}' missing from en_US.lang`);
            assert.ok(keys.has(legacyNameKey(id)), `${file}: '${legacyNameKey(id)}' missing from en_US.lang`);
        }
    });

    it('never leaves a raw identifier as a player-facing name', () => {
        const text = resourceLang();
        for (const { json } of itemFiles()) {
            const id = json['minecraft:item'].description.identifier;
            const match = text.split('\n').find((l) => l.startsWith(`${nameKey(id)}=`));
            assert.ok(match, `no name line for ${id}`);
            const value = match.slice(match.indexOf('=') + 1);
            assert.ok(value.length > 0, `${id}: empty display name`);
            assert.ok(!value.includes(id), `${id}: display name still contains the raw identifier`);
            assert.ok(!value.includes('item.'), `${id}: display name looks like a translation key`);
        }
    });

    it('points every icon at a shortname that resolves to a real PNG', () => {
        const atlas = JSON.parse(fs.readFileSync(path.join(PATHS.rpTextures, 'item_texture.json'), 'utf8'));
        for (const { file, json } of itemFiles()) {
            const shortname = json['minecraft:item'].components['minecraft:icon'].textures.default;
            const entry = atlas.texture_data[shortname];
            assert.ok(entry, `${file}: icon shortname '${shortname}' missing from item_texture.json`);
            const png = path.join(PATHS.rp, `${entry.textures}.png`);
            assert.ok(fs.existsSync(png), `${file}: ${entry.textures}.png does not exist`);
            assert.ok(fs.statSync(png).size > 0, `${file}: ${entry.textures}.png is empty`);
        }
    });

    it('declares the framework component on every sword', () => {
        for (const { file, json } of itemFiles()) {
            const components = json['minecraft:item'].components;
            assert.ok(SWORD_COMPONENT_ID in components, `${file}: missing ${SWORD_COMPONENT_ID}`);
            assert.ok(
                !('minecraft:custom_components' in components),
                `${file}: the deprecated custom_components array must not be used`,
            );
        }
    });
});
