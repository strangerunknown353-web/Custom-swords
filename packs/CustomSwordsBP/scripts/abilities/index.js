/**
 * Ability catalogue.
 *
 * Adding an ability means adding a module under `builtin/` and listing it here.
 * Nothing else in the framework changes — the registry, the gate and the
 * executor are completely agnostic about what an ability does.
 *
 * Each ability is a distinct *behaviour*, not a distinct set of numbers. Where
 * two swords differ only in damage, range, effects or visuals they share an
 * ability and differ in their binding envelope; a new ability is justified only
 * when the logic itself differs — a health-conditional bonus, angular falloff,
 * a remote impact point.
 */

import { strike } from './builtin/strike.js';
import { burst } from './builtin/burst.js';
import { repulse } from './builtin/repulse.js';
import { brand } from './builtin/brand.js';
import { cleave } from './builtin/cleave.js';
import { surge } from './builtin/surge.js';
import { bolster } from './builtin/bolster.js';

/** @type {readonly import('../core/types.js').AbilityDefinition[]} */
export const ABILITIES = Object.freeze([strike, burst, repulse, brand, cleave, surge, bolster]);
