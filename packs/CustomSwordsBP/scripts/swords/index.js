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
 * Adding a sword is: write one module, add it here, author its texture source
 * under `art/swords/`, run `npm run all`.
 */

import { emberBlade } from './ember_blade.js';
import { infernoSword } from './inferno_sword.js';
import { thunderSword } from './thunder_sword.js';
import { frostSword } from './frost_sword.js';
import { windSword } from './wind_sword.js';
import { earthSword } from './earth_sword.js';
import { tidalSword } from './tidal_sword.js';
import { natureSword } from './nature_sword.js';
import { shadowSword } from './shadow_sword.js';
import { crystalSword } from './crystal_sword.js';
import { voidSword } from './void_sword.js';
import { solarSword } from './solar_sword.js';
import { gravitySword } from './gravity_sword.js';
import { poisonSword } from './poison_sword.js';
import { timeSword } from './time_sword.js';
import { stormSword } from './storm_sword.js';
import { soulSword } from './soul_sword.js';
import { bloodSword } from './blood_sword.js';
import { echoSword } from './echo_sword.js';
import { dragonSword } from './dragon_sword.js';

/** @type {readonly import('../core/types.js').SwordDefinition[]} */
export const SWORDS = Object.freeze([
    emberBlade,
    infernoSword,
    thunderSword,
    frostSword,
    windSword,
    earthSword,
    tidalSword,
    natureSword,
    shadowSword,
    crystalSword,
    voidSword,
    solarSword,
    gravitySword,
    poisonSword,
    timeSword,
    stormSword,
    soulSword,
    bloodSword,
    echoSword,
    dragonSword,
]);
