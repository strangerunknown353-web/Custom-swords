/**
 * Ability catalogue.
 *
 * Adding an ability means adding a module under `builtin/` and listing it here.
 * Nothing else in the framework changes — the registry, the gate and the
 * executor are completely agnostic about what an ability does.
 *
 * Abilities are plain objects with an `execute(ctx)`. Because everything they
 * need arrives through `ctx.services`, a future ability (meteor, teleport,
 * gravity well, life steal, ...) composes the same primitives rather than
 * introducing a parallel system.
 */

import { shockwave } from './builtin/shockwave.js';

/** @type {readonly import('../core/types.js').AbilityDefinition[]} */
export const ABILITIES = Object.freeze([shockwave]);
