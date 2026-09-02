/**
 * Crafting recipes, asserted against the real generated files.
 *
 * A recipe that names an item which does not exist does not error — it simply
 * never registers, and the only symptom is a player who cannot craft the sword.
 * That is the same silent-failure shape as the particle and sound bugs, so it
 * gets the same treatment here: check the identifiers against a transcribed
 * vanilla list rather than trusting them.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { PATHS } from '../../tools/lib/project.mjs';
import { SWORDS } from '../../packs/CustomSwordsBP/scripts/swords/index.js';

const vanillaItems = new Set(
    JSON.parse(fs.readFileSync(path.join(PATHS.root, 'tools', 'data', 'vanilla_items.json'), 'utf8')).items,
);

/** @returns {{ file: string, json: any }[]} */
function recipeFiles() {
    return fs
        .readdirSync(PATHS.bpRecipes)
        .filter((f) => f.endsWith('.recipe.json'))
        .map((f) => ({ file: f, json: JSON.parse(fs.readFileSync(path.join(PATHS.bpRecipes, f), 'utf8')) }));
}

describe('sword definitions', () => {
    it('every sword declares a crafting recipe', () => {
        for (const sword of SWORDS) {
            assert.ok(sword.recipe, `${sword.id} has no recipe — every sword must be craftable`);
        }
    });

    it('every ingredient and repair item is a real vanilla item', () => {
        for (const sword of SWORDS) {
            for (const [ch, item] of Object.entries(sword.recipe.key)) {
                assert.ok(vanillaItems.has(item), `${sword.id} recipe key '${ch}': '${item}' is not a vanilla item`);
            }
            for (const item of sword.item.repairItems ?? []) {
                assert.ok(vanillaItems.has(item), `${sword.id} repair item '${item}' is not a vanilla item`);
            }
        }
    });

    it('every pattern character has a key, and every key is used', () => {
        for (const sword of SWORDS) {
            const used = new Set([...sword.recipe.pattern.join('')].filter((c) => c !== ' '));
            for (const ch of used) {
                assert.ok(sword.recipe.key[ch], `${sword.id}: pattern uses '${ch}' with no key`);
            }
            for (const ch of Object.keys(sword.recipe.key)) {
                assert.ok(used.has(ch), `${sword.id}: key '${ch}' is never used by the pattern`);
            }
        }
    });

    it('keeps every pattern inside a 3x3 grid', () => {
        for (const sword of SWORDS) {
            const { pattern } = sword.recipe;
            assert.ok(pattern.length >= 1 && pattern.length <= 3, `${sword.id}: ${pattern.length} rows`);
            const width = pattern[0].length;
            assert.ok(width >= 1 && width <= 3, `${sword.id}: rows are ${width} wide`);
            for (const row of pattern) {
                assert.equal(row.length, width, `${sword.id}: ragged pattern`);
            }
        }
    });
});

describe('generated recipe JSON', () => {
    it('generates exactly one recipe file per sword', () => {
        assert.equal(recipeFiles().length, SWORDS.length);
    });

    it('is a crafting-table shaped recipe producing that sword', () => {
        for (const { file, json } of recipeFiles()) {
            const shaped = json['minecraft:recipe_shaped'];
            assert.ok(shaped, `${file}: not a shaped recipe`);
            assert.ok(shaped.tags.includes('crafting_table'), `${file}: missing the crafting_table tag`);
            assert.ok(
                SWORDS.some((s) => s.id === shaped.result),
                `${file}: result '${shaped.result}' is not one of our swords`,
            );
            assert.equal(shaped.description.identifier, `${shaped.result}_recipe`);
        }
    });

    it('gives every recipe a unique identifier', () => {
        const ids = recipeFiles().map(({ json }) => json['minecraft:recipe_shaped'].description.identifier);
        assert.equal(new Set(ids).size, ids.length, 'duplicate recipe identifier');
    });

    it('wraps every key entry in the { item } form the schema expects', () => {
        for (const { file, json } of recipeFiles()) {
            for (const [ch, entry] of Object.entries(json['minecraft:recipe_shaped'].key)) {
                assert.equal(typeof entry, 'object', `${file}: key '${ch}' must be an object`);
                assert.ok(vanillaItems.has(entry.item), `${file}: key '${ch}' names '${entry.item}'`);
            }
        }
    });

    it('produces exactly one sword, never a stack', () => {
        // A shaped recipe with a bare identifier `result` yields one item. If
        // that ever becomes `{ item, count }` the count must stay 1 — a sword
        // that crafts in twos is a duplication bug, not a generosity.
        for (const { file, json } of recipeFiles()) {
            const result = json['minecraft:recipe_shaped'].result;
            if (typeof result === 'string') continue;
            assert.equal(result.count ?? 1, 1, `${file}: must produce exactly one sword`);
        }
    });

    it('has no two swords sharing a craftable grid', () => {
        // Two recipes with the same pattern AND the same ingredients conflict:
        // the crafting table can only resolve one of them, and which one is not
        // something the project controls. Identical patterns with different
        // ingredients are fine, and common — every sword is a vertical bar.
        /** @type {Map<string, string>} */
        const grids = new Map();
        for (const { json } of recipeFiles()) {
            const shaped = json['minecraft:recipe_shaped'];
            const grid = shaped.pattern
                .map((row) => [...row].map((ch) => (ch === ' ' ? '-' : shaped.key[ch].item)).join('|'))
                .join('/');
            const owner = grids.get(grid);
            assert.equal(owner, undefined, `${shaped.result} crafts from the same grid as ${owner}`);
            grids.set(grid, shaped.result);
        }
    });

    it('matches the sword definitions exactly', () => {
        for (const sword of SWORDS) {
            const file = recipeFiles().find((r) => r.json['minecraft:recipe_shaped'].result === sword.id);
            assert.ok(file, `no generated recipe for ${sword.id}`);
            const shaped = file.json['minecraft:recipe_shaped'];
            assert.deepEqual(shaped.pattern, [...sword.recipe.pattern], `${sword.id}: pattern drifted`);
            for (const [ch, item] of Object.entries(sword.recipe.key)) {
                assert.equal(shaped.key[ch].item, item, `${sword.id}: key '${ch}' drifted`);
            }
        }
    });
});
