/**
 * Sword catalogue.
 *
 * Every entry is pure data with no engine imports, which is what lets the same
 * definitions be consumed by three different consumers:
 *
 *   1. the in-game script framework (behaviour),
 *   2. `tools/generate.mjs` (emits behaviour-pack item JSON, resource-pack
 *      texture entries and `.lang` names from these numbers),
 *   3. the Node unit tests and validator.
 *
 * Because the item JSON is generated, the stats a designer edits here are
 * guaranteed to be the stats the game loads. Adding sword #26 is: write one
 * module, add it to this array, drop in a 16x16 texture, run `npm run all`.
 */

import { testBlade } from './test_blade.js';

/** @type {readonly import('../core/types.js').SwordDefinition[]} */
export const SWORDS = Object.freeze([testBlade]);
