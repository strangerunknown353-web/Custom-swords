/**
 * Rarity tiers — the single source of truth.
 *
 * Rarity was previously spelled out in three places (a union type, a validation
 * array, and a colour map inside the build tools). This module replaces all
 * three, so adding a tier is a one-line change that the runtime, the generator
 * and the validator all pick up.
 *
 * Rarity is presentation and taxonomy, not mechanics: it colours the display
 * name, orders swords in documentation and the future codex, and gives balance
 * work a vocabulary. It grants no combat bonus of its own.
 *
 * Engine-free.
 */

/**
 * @typedef {Object} RarityTier
 * @property {string} id Machine name used in sword definitions.
 * @property {number} order Ascending; useful for sorting and balance checks.
 * @property {string} label Human-readable name for UI and documentation.
 * @property {string} colorCode Minecraft section colour code applied to the display name.
 * @property {string} colorName Equivalent Bedrock colour name, for any future component that wants one.
 * @property {number} maxActives Most selectable abilities a sword of this tier may carry.
 */

/** @type {Readonly<Record<string, RarityTier>>} */
export const RARITY_TIERS = Object.freeze({
    common: Object.freeze({ id: 'common', order: 0, label: 'Common', colorCode: '§f', colorName: 'white', maxActives: 2 }),
    uncommon: Object.freeze({ id: 'uncommon', order: 1, label: 'Uncommon', colorCode: '§a', colorName: 'green', maxActives: 3 }),
    rare: Object.freeze({ id: 'rare', order: 2, label: 'Rare', colorCode: '§9', colorName: 'blue', maxActives: 4 }),
    epic: Object.freeze({ id: 'epic', order: 3, label: 'Epic', colorCode: '§d', colorName: 'light_purple', maxActives: 5 }),
    legendary: Object.freeze({ id: 'legendary', order: 4, label: 'Legendary', colorCode: '§6', colorName: 'gold', maxActives: 6 }),
    mythic: Object.freeze({ id: 'mythic', order: 5, label: 'Mythic', colorCode: '§c', colorName: 'red', maxActives: 7 }),
});

/** Tier ids in ascending order. */
/**
 * The most selectable (use) abilities a sword of this rarity may carry.
 * Crouching cycles through them; a sword's on-hit passive does not count.
 *
 * @param {unknown} value
 * @returns {number} 0 for an unknown rarity.
 */
export function maxActiveAbilities(value) {
    return rarityOf(value)?.maxActives ?? 0;
}

export const RARITIES = Object.freeze(
    Object.values(RARITY_TIERS)
        .sort((a, b) => a.order - b.order)
        .map((tier) => tier.id),
);

/** Section code that resets colour back to default. */
export const RESET_CODE = '§r';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isRarity(value) {
    return typeof value === 'string' && Object.hasOwn(RARITY_TIERS, value);
}

/**
 * @param {string} value
 * @returns {RarityTier | undefined}
 */
export function rarityOf(value) {
    return isRarity(value) ? RARITY_TIERS[value] : undefined;
}

/**
 * @param {string} value
 * @returns {RarityTier}
 * @throws {Error} When the tier is unknown.
 */
export function requireRarity(value) {
    const tier = rarityOf(value);
    if (tier === undefined) {
        throw new Error(`Unknown rarity '${value}'. Valid tiers: ${RARITIES.join(', ')}.`);
    }
    return tier;
}

/**
 * Wraps text in the tier's colour, resetting afterwards so the colour does not
 * bleed into anything appended later.
 *
 * @param {string} rarity
 * @param {string} text
 * @returns {string}
 */
export function colorize(rarity, text) {
    const tier = rarityOf(rarity);
    return tier === undefined ? text : `${tier.colorCode}${text}${RESET_CODE}`;
}

/**
 * Ascending comparator, for sorting sword lists by tier.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareRarity(a, b) {
    return (rarityOf(a)?.order ?? -1) - (rarityOf(b)?.order ?? -1);
}
