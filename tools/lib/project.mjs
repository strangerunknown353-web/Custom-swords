/**
 * Shared paths and constants for the build tools.
 *
 * Anything that is also a runtime concept — the namespace, the identifier
 * convention, the custom component id, rarity tiers, texture layout — is
 * imported from the framework's own modules rather than restated here. That is
 * deliberate: a build tool that keeps its own copy of the rules is a build tool
 * that will one day disagree with the game.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const BP = path.join(ROOT, 'packs', 'CustomSwordsBP');
const RP = path.join(ROOT, 'packs', 'CustomSwordsRP');

export const PATHS = Object.freeze({
    root: ROOT,
    bp: BP,
    rp: RP,
    bpManifest: path.join(BP, 'manifest.json'),
    rpManifest: path.join(RP, 'manifest.json'),
    bpItems: path.join(BP, 'items'),
    bpRecipes: path.join(BP, 'recipes'),
    bpScripts: path.join(BP, 'scripts'),
    bpTexts: path.join(BP, 'texts'),
    rpTexts: path.join(RP, 'texts'),
    rpTextures: path.join(RP, 'textures'),
    itemTextureJson: path.join(RP, 'textures', 'item_texture.json'),
    dist: path.join(ROOT, 'dist'),
    art: path.join(ROOT, 'art', 'swords'),
    swordsIndex: path.join(BP, 'scripts', 'swords', 'index.js'),
    abilitiesIndex: path.join(BP, 'scripts', 'abilities', 'index.js'),
    coreDir: path.join(BP, 'scripts', 'core'),
    packageJson: path.join(ROOT, 'package.json'),
    readme: path.join(ROOT, 'README.md'),
    /** Records which item JSON files the generator owns, so stale ones can be pruned. */
    generatedManifest: path.join(BP, 'items', '.generated.json'),
});

/** Framework modules the tools import directly, as `file://` URLs. */
export const MODULES = Object.freeze({
    swords: `file://${PATHS.swordsIndex}`,
    abilities: `file://${PATHS.abilitiesIndex}`,
    identifiers: `file://${path.join(PATHS.coreDir, 'identifiers.js')}`,
    rarity: `file://${path.join(PATHS.coreDir, 'rarity.js')}`,
    swordStats: `file://${path.join(PATHS.coreDir, 'sword_stats.js')}`,
    definitionValidator: `file://${path.join(PATHS.coreDir, 'definition_validator.js')}`,
    config: `file://${path.join(PATHS.bpScripts, 'config.js')}`,
});

/**
 * The behaviour-pack item `format_version` the generator emits.
 *
 * Custom Components V2 (namespaced components flattened into `components`)
 * became stable at 1.21.90 alongside `@minecraft/server` 2.0.0, which was this
 * project's target through v0.5.1.
 *
 * Raised to **1.21.120** to use `minecraft:swing_duration`, the only item-side
 * control Bedrock offers over the swing animation. This raises the minimum
 * client to 1.21.120 — a deliberate compatibility decision, recorded in
 * docs/API_NOTES.md, and `min_engine_version` in both manifests moves with it.
 */
export const ITEM_FORMAT_VERSION = '1.21.120';

/**
 * Absolute path of a sword's texture source.
 *
 * @param {string} shortname
 * @returns {string}
 */
export function artFile(shortname) {
    return path.join(PATHS.art, `${shortname}.json`);
}

/**
 * Absolute path of a sword icon on disk, from the resource-pack-relative path
 * the framework's `swordTexturePath` produces.
 *
 * @param {string} texturePathWithoutExtension
 * @returns {string}
 */
export function resourceFile(texturePathWithoutExtension) {
    return path.join(PATHS.rp, `${texturePathWithoutExtension}.png`);
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
