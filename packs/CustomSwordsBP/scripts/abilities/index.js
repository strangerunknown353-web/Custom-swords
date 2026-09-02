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

import { burst } from './builtin/burst.js';
import { repulse } from './builtin/repulse.js';
import { brand } from './builtin/brand.js';
import { cleave } from './builtin/cleave.js';
import { bolster } from './builtin/bolster.js';
import { emberBurst } from './builtin/ember_burst.js';
import { emberEdge } from './builtin/ember_edge.js';
import { nova } from './builtin/nova.js';
import { afflict } from './builtin/afflict.js';
import { chain } from './builtin/chain.js';
import { discharge } from './builtin/discharge.js';
import { blink } from './builtin/blink.js';
import { opportunist } from './builtin/opportunist.js';
import { entangle } from './builtin/entangle.js';
import { resonate } from './builtin/resonate.js';
import { rift } from './builtin/rift.js';
import { ward } from './builtin/ward.js';
import { drain } from './builtin/drain.js';
import { flare } from './builtin/flare.js';
import { radiance } from './builtin/radiance.js';
import { crush } from './builtin/crush.js';
import { weigh } from './builtin/weigh.js';
import { rupture } from './builtin/rupture.js';
import { envenom } from './builtin/envenom.js';
import { stasis } from './builtin/stasis.js';
import { tempo } from './builtin/tempo.js';
import { surge } from './builtin/surge.js';
import { momentum } from './builtin/momentum.js';

/** @type {readonly import('../core/types.js').AbilityDefinition[]} */
export const ABILITIES = Object.freeze([
    burst,
    repulse,
    brand,
    cleave,
    bolster,
    emberBurst,
    emberEdge,
    nova,
    afflict,
    chain,
    discharge,
    blink,
    opportunist,
    entangle,
    resonate,
    rift,
    ward,
    drain,
    flare,
    radiance,
    crush,
    weigh,
    rupture,
    envenom,
    stasis,
    tempo,
    surge,
    momentum,
]);
