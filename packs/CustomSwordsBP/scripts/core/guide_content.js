/**
 * The guide book's content, as plain data.
 *
 * Built from the sword and ability definitions themselves, so the book can
 * never disagree with the game: change a recipe or a cooldown and the book
 * changes with it. Engine-free — the UI that shows it lives in
 * `systems/guide_ui.js`, and the tests read these pages directly.
 */

import { rarityOf, colorize, compareRarity } from './rarity.js';
import { resolveStats } from './sword_stats.js';
import { swordTexturePath, localNameOf } from './identifiers.js';
import { formatTicks } from '../util/ticks.js';

/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */
/** @typedef {import('./types.js').AbilityBinding} AbilityBinding */

/**
 * @typedef {Object} GuidePage
 * @property {string} title
 * @property {string} body
 */

/** `minecraft:blaze_rod` → `Blaze Rod`. */
export function itemName(identifier) {
    return localNameOf(identifier)
        .split('_')
        .map((word) => (word.length === 0 ? word : word[0].toUpperCase() + word.slice(1)))
        .join(' ');
}

/** @param {readonly SwordDefinition[]} swords */
export function guideOrder(swords) {
    return swords
        .filter((sword) => sword.isTestItem !== true)
        .slice()
        .sort((a, b) => compareRarity(a.rarity, b.rarity) || a.name.localeCompare(b.name));
}

/** @param {SwordDefinition} sword */
export function swordIcon(sword) {
    return swordTexturePath(sword.texture ?? localNameOf(sword.id));
}

/** @returns {GuidePage} */
export function howToPlayPage() {
    return {
        title: 'How to play',
        body: [
            '§lHolding a Custom Sword:§r',
            '',
            '§e• Crouch§r - switch to the next power.',
            '   The bar above your hotbar shows §e[2/5] Power - Ready§r.',
            '   It switches once each time you crouch down.',
            '§e• Use§r (right-click / long-press) - cast the selected power.',
            '§e• Hit§r something - the sword\'s passive triggers.',
            '',
            '§lGood to know§r',
            '• Every power has its own cooldown.',
            '• A chime tells you when your selected power is ready.',
            '• Each sword remembers your last selected power.',
            '• Repair a sword on an anvil with its repair item.',
            '• Powers never hurt players while the world\'s PvP is off.',
            '',
            '§lPowers by rarity§r',
            `${colorize('uncommon', 'Uncommon')} 3   ${colorize('rare', 'Rare')} 4   ${colorize('epic', 'Epic')} 5   ` +
                `${colorize('legendary', 'Legendary')} 6   ${colorize('mythic', 'Mythic')} 7`,
            '(plus one passive on every sword)',
            '',
            '§lThis book§r',
            'Craft another from a §eBook + Stick§r (any arrangement).',
        ].join('\n'),
    };
}

/**
 * A 3x3 recipe drawn with letters, plus the key.
 *
 * @param {NonNullable<SwordDefinition['recipe']>} recipe
 * @returns {string[]}
 */
export function recipeLines(recipe) {
    const rows = [...recipe.pattern];
    while (rows.length < 3) rows.push('   ');
    const lines = rows.map((row) => {
        const cells = row.padEnd(3, ' ').split('');
        return '  ' + cells.map((ch) => (ch === ' ' ? '§8[  ]§r' : `§f[§e${ch}§f]§r`)).join(' ');
    });
    lines.push('');
    for (const [ch, item] of Object.entries(recipe.key)) {
        const count = recipe.pattern.join('').split(ch).length - 1;
        lines.push(`  §e${ch}§r = ${itemName(item)}${count > 1 ? ` §7x${count}§r` : ''}`);
    }
    return lines;
}

/**
 * One line describing what a power does, in plain words.
 *
 * @param {AbilityBinding} binding
 * @returns {string}
 */
export function describePower(binding) {
    const t = binding.targeting ?? { type: 'self' };
    const p = binding.params ?? {};
    const id = binding.abilityId;
    const range = t.range === undefined ? '' : ` (${t.range} blocks)`;

    /** @type {string} */
    let shape;
    if (id === 'custom_swords:leap') shape = 'Leap forward where you look';
    else if (id === 'custom_swords:blink') shape = `Dash up to ${p.distance ?? 6} blocks and strike on arrival`;
    else if (t.type === 'self') shape = 'Empowers you';
    else if (t.type === 'cone') shape = `Sweeps in front of you${range}`;
    else if (t.type === 'ray' || t.type === 'single') {
        shape = id === 'custom_swords:beam' ? `Beam through everything you aim at${range}` : `Strikes what you aim at${range}`;
    } else if (t.type === 'point') shape = `Erupts where you look${range}`;
    else shape = binding.knockback?.pull ? `Pulls enemies in${range}` : `Blasts all around you${range}`;

    const damage = p.damage ?? p.nearDamage ?? p.groundDamage ?? p.stillDamage ?? p.arrivalDamage ?? p.nightDamage;
    const parts = [shape];
    if (typeof damage === 'number' && damage > 0) parts.push(`${damage} dmg`);
    if (p.igniteSeconds > 0) parts.push('burns');
    const effects = (binding.effects ?? []).map((e) => itemName(e.effect));
    if (effects.length > 0) parts.push(effects.join(', '));
    if (p.heal > 0) parts.push(`heals ${p.heal}`);
    return parts.join(' · ');
}

/**
 * @param {SwordDefinition} sword
 * @returns {GuidePage}
 */
export function swordPage(sword) {
    const stats = resolveStats(sword);
    const tier = rarityOf(sword.rarity);
    const lines = [
        `${colorize(sword.rarity, tier?.label ?? sword.rarity)}§r`,
        `§o${sword.description}§r`,
        '',
        `Damage §c${stats.meleeDamage}§r   Durability §a${stats.durability}§r`,
    ];
    if (stats.repairItems.length > 0) lines.push(`Repair with: ${stats.repairItems.map(itemName).join(', ')}`);

    if (sword.recipe !== undefined) {
        lines.push('', '§lRecipe§r (crafting table)', ...recipeLines(sword.recipe));
    }

    const actives = sword.abilities.filter((b) => b.activation === 'use');
    lines.push('', `§lPowers§r - crouch to switch, use to cast`);
    actives.forEach((binding, index) => {
        lines.push(
            `§e${index + 1}. ${binding.label ?? itemName(binding.abilityId)}§r §7(${formatTicks(binding.cooldownTicks ?? 0)})§r`,
            `   ${describePower(binding)}`,
        );
    });
    const passive = sword.abilities.find((b) => b.activation === 'attack');
    if (passive !== undefined) {
        lines.push('', `§lPassive§r - on every hit`, `§b${passive.label ?? itemName(passive.abilityId)}§r`);
    }
    return { title: colorize(sword.rarity, sword.name), body: lines.join('\n') };
}

/**
 * @param {readonly SwordDefinition[]} swords
 * @returns {GuidePage}
 */
export function indexPage(swords) {
    const shipped = guideOrder(swords);
    const powers = shipped.reduce((n, s) => n + s.abilities.length, 0);
    return {
        title: 'Custom Swords Guide',
        body:
            `§l${shipped.length} swords, ${powers} powers.§r\n` +
            'Crouch to switch power, use to cast.\n' +
            'Pick a sword to see its recipe and powers.',
    };
}
