/**
 * Derived sword statistics and display records.
 *
 * Sword definitions store *authoring* values — the numbers a designer types.
 * This module turns those into the *effective* values a player experiences and
 * into one consistent display record. Everything that shows a sword's numbers
 * (the future codex UI, the balance report, generated documentation, debug
 * output) reads from here, so no two surfaces can disagree.
 *
 * Pure and engine-free, so the build tools and tests use the real code.
 */

import { requireRarity, rarityOf } from './rarity.js';
import { ticksToSeconds } from '../util/ticks.js';

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */
/** @typedef {import('./types.js').AbilityBinding} AbilityBinding */

/**
 * Damage a player deals with an item that has no `minecraft:damage` component.
 * The component's documented behaviour is that its value is *added* to this
 * base, so effective melee damage is `BASE + attackDamage`.
 */
export const BASE_MELEE_DAMAGE = 1;

/**
 * @typedef {Object} ResolvedSwordStats
 * @property {number} attackDamage Authoring value; what goes into `minecraft:damage`.
 * @property {number} meleeDamage Effective in-game melee damage.
 * @property {number} durability Uses before the item breaks.
 * @property {boolean} enchantable
 * @property {number} enchantValue 0 when the sword cannot be enchanted.
 * @property {readonly string[]} repairItems
 * @property {number} repairAmount Durability restored per repair item, as emitted into the item JSON.
 * @property {import('./rarity.js').RarityTier} rarity
 */

/**
 * @param {SwordDefinition} sword
 * @returns {ResolvedSwordStats}
 */
export function resolveStats(sword) {
    const stats = sword.item;
    return {
        attackDamage: stats.attackDamage,
        meleeDamage: BASE_MELEE_DAMAGE + stats.attackDamage,
        durability: stats.durability,
        enchantable: stats.enchantValue !== undefined && stats.enchantValue > 0,
        enchantValue: stats.enchantValue ?? 0,
        repairItems: stats.repairItems ?? [],
        repairAmount: repairAmountFor(stats.durability),
        rarity: requireRarity(sword.rarity),
    };
}

/**
 * Durability restored by one repair item. A quarter of the bar per item, which
 * is the vanilla tool convention. Lives here rather than in the generator so
 * the documented number and the emitted number cannot drift.
 *
 * @param {number} durability
 * @returns {number}
 */
export function repairAmountFor(durability) {
    return Math.max(1, Math.round(durability / 4));
}

/**
 * @typedef {Object} AbilitySummary
 * @property {import('./types.js').AbilityTrigger} trigger
 * @property {string} abilityId
 * @property {number} cooldownTicks
 * @property {number} cooldownSeconds
 * @property {string} targetingType
 * @property {number | undefined} range
 */

/**
 * @param {AbilityBinding | undefined} binding
 * @param {import('./types.js').AbilityTrigger} trigger
 * @returns {AbilitySummary | undefined}
 */
export function summariseBinding(binding, trigger) {
    if (binding === undefined) return undefined;
    const cooldownTicks = binding.cooldownTicks ?? 0;
    return {
        trigger,
        abilityId: binding.abilityId,
        cooldownTicks,
        cooldownSeconds: ticksToSeconds(cooldownTicks),
        targetingType: binding.targeting?.type ?? 'self',
        range: binding.targeting?.range,
    };
}

/**
 * @typedef {Object} SwordDescription
 * @property {string} id
 * @property {string} name
 * @property {string} coloredName
 * @property {string} description
 * @property {string} rarityId
 * @property {string} rarityLabel
 * @property {boolean} isTestItem
 * @property {ResolvedSwordStats} stats
 * @property {AbilitySummary[]} abilities
 */

/**
 * The canonical display record for one sword.
 *
 * @param {SwordDefinition} sword
 * @returns {SwordDescription}
 */
export function describeSword(sword) {
    const tier = requireRarity(sword.rarity);
    /** @type {AbilitySummary[]} */
    const abilities = [];
    const active = summariseBinding(sword.active, 'use');
    const passive = summariseBinding(sword.passive, 'hit');
    if (active !== undefined) abilities.push(active);
    if (passive !== undefined) abilities.push(passive);

    return {
        id: sword.id,
        name: sword.name,
        coloredName: `${tier.colorCode}${sword.name}§r`,
        description: sword.description,
        rarityId: tier.id,
        rarityLabel: tier.label,
        isTestItem: sword.isTestItem === true,
        stats: resolveStats(sword),
        abilities,
    };
}

/**
 * A compact, sortable table of every sword — the data behind the balance report
 * planned in TODO.md, and behind the docs table.
 *
 * @param {readonly SwordDefinition[]} swords
 * @returns {SwordDescription[]}
 */
export function describeAll(swords) {
    return [...swords]
        .map(describeSword)
        .sort(
            (a, b) =>
                (rarityOf(a.rarityId)?.order ?? 0) - (rarityOf(b.rarityId)?.order ?? 0) || a.id.localeCompare(b.id),
        );
}
