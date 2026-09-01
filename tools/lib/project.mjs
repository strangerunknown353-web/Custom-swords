/**
 * Shared paths and constants for the build tools.
 *
 * One place to change if the pack layout ever moves, and one place that both
 * the generator and the validator agree on.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PATHS = Object.freeze({
    root: ROOT,
    bp: path.join(ROOT, 'packs', 'CustomSwordsBP'),
    rp: path.join(ROOT, 'packs', 'CustomSwordsRP'),
    bpManifest: path.join(ROOT, 'packs', 'CustomSwordsBP', 'manifest.json'),
    rpManifest: path.join(ROOT, 'packs', 'CustomSwordsRP', 'manifest.json'),
    bpItems: path.join(ROOT, 'packs', 'CustomSwordsBP', 'items'),
    bpScripts: path.join(ROOT, 'packs', 'CustomSwordsBP', 'scripts'),
    bpTexts: path.join(ROOT, 'packs', 'CustomSwordsBP', 'texts'),
    rpTexts: path.join(ROOT, 'packs', 'CustomSwordsRP', 'texts'),
    rpTextures: path.join(ROOT, 'packs', 'CustomSwordsRP', 'textures'),
    rpItemTextures: path.join(ROOT, 'packs', 'CustomSwordsRP', 'textures', 'items', 'custom_swords'),
    itemTextureJson: path.join(ROOT, 'packs', 'CustomSwordsRP', 'textures', 'item_texture.json'),
    dist: path.join(ROOT, 'dist'),
    swordsIndex: path.join(ROOT, 'packs', 'CustomSwordsBP', 'scripts', 'swords', 'index.js'),
    abilitiesIndex: path.join(ROOT, 'packs', 'CustomSwordsBP', 'scripts', 'abilities', 'index.js'),
    packageJson: path.join(ROOT, 'package.json'),
    /** Records which item JSON files the generator owns, so stale ones can be pruned. */
    generatedManifest: path.join(ROOT, 'packs', 'CustomSwordsBP', 'items', '.generated.json'),
});

/**
 * The behaviour-pack item `format_version` the generator emits.
 *
 * 1.21.90 is the release in which Custom Components V2 (namespaced components
 * flattened into `components`) became stable alongside `@minecraft/server`
 * 2.0.0. Raising this is a deliberate compatibility decision — see
 * docs/API_NOTES.md.
 */
export const ITEM_FORMAT_VERSION = '1.21.90';

/** Item custom component id registered by `scripts/core/input_router.js`. */
export const SWORD_COMPONENT_ID = 'custom_swords:sword';

/** Minecraft section colour codes used to tint display names by rarity. */
export const RARITY_COLORS = Object.freeze({
    common: '§f',
    uncommon: '§a',
    rare: '§9',
    epic: '§d',
    legendary: '§6',
    mythic: '§c',
});

/**
 * Local (non-namespaced) part of an identifier.
 *
 * @param {string} identifier
 * @returns {string}
 */
export function localName(identifier) {
    const index = identifier.indexOf(':');
    return index === -1 ? identifier : identifier.slice(index + 1);
}

/**
 * Namespace part of an identifier.
 *
 * @param {string} identifier
 * @returns {string}
 */
export function namespaceOf(identifier) {
    const index = identifier.indexOf(':');
    return index === -1 ? '' : identifier.slice(0, index);
}

/**
 * Stable, pretty JSON with a trailing newline so files diff cleanly.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function toJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
