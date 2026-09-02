#!/usr/bin/env node
/**
 * Pack and architecture validator.
 *
 * Runs entirely outside Minecraft and catches the failure classes that
 * otherwise only show up as a silent "pack failed to load" dialog:
 *
 *   - malformed or inconsistent manifests, duplicate/invalid UUIDs
 *   - a script entry point that does not exist
 *   - item JSON whose identifier, texture or localisation key does not resolve
 *   - sword/ability definitions that violate the data model
 *   - architecture rules the project has committed to (no tick loops in
 *     gameplay paths, abilities and sword data stay engine-free, no orphaned
 *     script modules)
 *
 * Exit code 0 = clean, 1 = at least one error. Warnings never fail the build.
 *
 * Usage: node tools/validate.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { PATHS, MODULES, artFile, resourceFile } from './lib/project.mjs';
import { verifyPng } from './lib/png.mjs';
import { inspectQuality, renderPixels, validateSource } from './lib/texture.mjs';

const {
    NAMESPACE,
    SWORD_COMPONENT_ID,
    SWORD_ITEM_TAG,
    CREATIVE_CATEGORY,
    CREATIVE_GROUP,
    localNameOf,
    namespaceOf,
    nameKey,
    legacyNameKey,
    swordTexturePath,
} =
    await import(MODULES.identifiers);
const { RARITIES } = await import(MODULES.rarity);
const { CONFIG } = await import(MODULES.config);
const CONFIG_PARTICLE_CAP = CONFIG.particles.maxPerEmit;
const { describeAll } = await import(MODULES.swordStats);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];
/** @type {string[]} */
const notes = [];

/** @param {string} message */
const error = (message) => errors.push(message);
/** @param {string} message */
const warn = (message) => warnings.push(message);
/** @param {string} message */
const note = (message) => notes.push(message);

/**
 * @param {string} filePath
 * @returns {any}
 */
function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (cause) {
        error(`${path.relative(PATHS.root, filePath)}: invalid JSON — ${cause instanceof Error ? cause.message : cause}`);
        return undefined;
    }
}

/**
 * @param {string} directory
 * @param {RegExp} pattern
 * @returns {string[]}
 */
function filesMatching(directory, pattern) {
    if (!fs.existsSync(directory)) return [];
    /** @type {string[]} */
    const found = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) found.push(...filesMatching(absolute, pattern));
        else if (pattern.test(entry.name)) found.push(absolute);
    }
    return found;
}

// ---------------------------------------------------------------------------
// 1. Manifests
// ---------------------------------------------------------------------------

/**
 * @param {any} version
 * @param {string} label
 * @returns {boolean}
 */
function checkVersionTriple(version, label) {
    if (!Array.isArray(version) || version.length !== 3 || !version.every((n) => Number.isInteger(n) && n >= 0)) {
        error(`${label}: version must be an array of three non-negative integers.`);
        return false;
    }
    return true;
}

/**
 * @returns {{ bp: any, rp: any } | undefined}
 */
function validateManifests() {
    const bp = readJson(PATHS.bpManifest);
    const rp = readJson(PATHS.rpManifest);
    if (bp === undefined || rp === undefined) return undefined;

    const pkg = readJson(PATHS.packageJson);
    const expected = pkg === undefined ? undefined : pkg.version.split('.').map(Number);

    /** @type {Map<string, string>} */
    const seenUuids = new Map();

    for (const [label, manifest] of [
        ['BP manifest', bp],
        ['RP manifest', rp],
    ]) {
        if (manifest.format_version !== 2) {
            error(`${label}: format_version must be 2 (found ${JSON.stringify(manifest.format_version)}).`);
        }
        if (!UUID_PATTERN.test(manifest.header?.uuid ?? '')) {
            error(`${label}: header.uuid is not a valid UUID.`);
        }
        checkVersionTriple(manifest.header?.version, `${label} header`);
        checkVersionTriple(manifest.header?.min_engine_version, `${label} header min_engine_version`);
        if (expected !== undefined && JSON.stringify(manifest.header?.version) !== JSON.stringify(expected)) {
            error(
                `${label}: header.version ${JSON.stringify(manifest.header?.version)} does not match package.json ` +
                    `version ${JSON.stringify(expected)}. Run 'npm run version:set -- <x.y.z>'.`,
            );
        }

        /** @type {any[]} */
        const modules = manifest.modules ?? [];
        if (modules.length === 0) error(`${label}: has no modules.`);
        for (const module of modules) {
            if (!UUID_PATTERN.test(module.uuid ?? '')) {
                error(`${label}: module '${module.description ?? module.type}' has an invalid UUID.`);
            }
            checkVersionTriple(module.version, `${label} module '${module.type}'`);
            if (expected !== undefined && JSON.stringify(module.version) !== JSON.stringify(expected)) {
                error(`${label}: module '${module.type}' version does not match package.json.`);
            }
        }

        for (const uuid of [manifest.header?.uuid, ...modules.map((m) => m.uuid)]) {
            if (typeof uuid !== 'string') continue;
            const previous = seenUuids.get(uuid.toLowerCase());
            if (previous !== undefined) {
                error(`Duplicate UUID ${uuid} used by both ${previous} and ${label}.`);
            }
            seenUuids.set(uuid.toLowerCase(), label);
        }
    }

    // Behaviour pack specifics.
    const script = (bp.modules ?? []).find((/** @type {any} */ m) => m.type === 'script');
    if (script === undefined) {
        error('BP manifest: no module of type "script".');
    } else {
        if (script.language !== 'javascript') {
            error(`BP manifest: script module language must be "javascript" (found ${JSON.stringify(script.language)}).`);
        }
        if (typeof script.entry !== 'string') {
            error('BP manifest: script module has no "entry".');
        } else if (!fs.existsSync(path.join(PATHS.bp, script.entry))) {
            error(`BP manifest: script entry '${script.entry}' does not exist on disk.`);
        }
    }
    if (!(bp.modules ?? []).some((/** @type {any} */ m) => m.type === 'data')) {
        error('BP manifest: no module of type "data"; item JSON will not load.');
    }

    /** @type {any[]} */
    const dependencies = bp.dependencies ?? [];
    const rpDependency = dependencies.find((d) => d.uuid !== undefined);
    if (rpDependency === undefined) {
        error('BP manifest: does not declare a dependency on the resource pack.');
    } else {
        if (rpDependency.uuid !== rp.header?.uuid) {
            error(
                `BP manifest: resource pack dependency uuid ${rpDependency.uuid} does not match the RP header ` +
                    `uuid ${rp.header?.uuid}.`,
            );
        }
        if (JSON.stringify(rpDependency.version) !== JSON.stringify(rp.header?.version)) {
            error('BP manifest: resource pack dependency version does not match the RP header version.');
        }
    }

    const serverDependency = dependencies.find((d) => d.module_name === '@minecraft/server');
    if (serverDependency === undefined) {
        error('BP manifest: no @minecraft/server module dependency; scripts will not run.');
    } else if (typeof serverDependency.version !== 'string' || !/^\d+\.\d+\.\d+(-beta)?$/.test(serverDependency.version)) {
        error(`BP manifest: @minecraft/server version ${JSON.stringify(serverDependency.version)} is not a released version string.`);
    } else if (!serverDependency.version.startsWith('2.')) {
        error(
            `BP manifest: @minecraft/server ${serverDependency.version} is a 1.x module, but the framework requires ` +
                'Scripting V2 (system.beforeEvents.startup and Custom Components V2).',
        );
    } else {
        note(`Targeting @minecraft/server ${serverDependency.version}.`);
    }

    return { bp, rp };
}

// ---------------------------------------------------------------------------
// 2. JSON syntax across both packs
// ---------------------------------------------------------------------------

function validateAllJson() {
    for (const file of [...filesMatching(PATHS.bp, /\.json$/), ...filesMatching(PATHS.rp, /\.json$/)]) {
        readJson(file);
    }
}

// ---------------------------------------------------------------------------
// 3. Items, textures and localisation
// ---------------------------------------------------------------------------

/**
 * @param {string} langPath
 * @returns {Set<string>}
 */
function readLangKeys(langPath) {
    /** @type {Set<string>} */
    const keys = new Set();
    if (!fs.existsSync(langPath)) {
        error(`Missing language file ${path.relative(PATHS.root, langPath)}.`);
        return keys;
    }
    for (const line of fs.readFileSync(langPath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator === -1) {
            warn(`${path.relative(PATHS.root, langPath)}: line without '=' — ${JSON.stringify(trimmed)}`);
            continue;
        }
        keys.add(trimmed.slice(0, separator));
    }
    return keys;
}

/**
 * @param {readonly any[]} swords
 */
function validateItemsAndResources(swords) {
    const itemTextures = readJson(PATHS.itemTextureJson);
    const textureData = itemTextures?.texture_data ?? {};
    const rpLangKeys = readLangKeys(path.join(PATHS.rpTexts, 'en_US.lang'));
    const bpLangKeys = readLangKeys(path.join(PATHS.bpTexts, 'en_US.lang'));

    for (const [label, keys] of [
        ['RP', rpLangKeys],
        ['BP', bpLangKeys],
    ]) {
        for (const required of ['pack.name', 'pack.description']) {
            if (!keys.has(required)) {
                error(`${label} en_US.lang is missing '${required}', which its manifest references.`);
            }
        }
    }

    for (const [label, textsDir] of [
        ['RP', PATHS.rpTexts],
        ['BP', PATHS.bpTexts],
    ]) {
        const languages = readJson(path.join(textsDir, 'languages.json'));
        if (Array.isArray(languages)) {
            if (!languages.includes('en_US')) error(`${label} languages.json does not list 'en_US'.`);
        } else {
            error(`${label} languages.json must be an array of language codes.`);
        }
    }

    const itemFiles = filesMatching(PATHS.bpItems, /\.item\.json$/);
    /** @type {Set<string>} */
    const declaredIdentifiers = new Set();

    for (const file of itemFiles) {
        const relative = path.relative(PATHS.root, file);
        const json = readJson(file);
        if (json === undefined) continue;

        const item = json['minecraft:item'];
        if (item === undefined) {
            error(`${relative}: missing the 'minecraft:item' root.`);
            continue;
        }
        if (typeof json.format_version !== 'string') {
            error(`${relative}: missing a string 'format_version'.`);
        }

        const identifier = item.description?.identifier;
        if (typeof identifier !== 'string') {
            error(`${relative}: description.identifier is missing.`);
            continue;
        }
        declaredIdentifiers.add(identifier);

        const expectedFile = `${localNameOf(identifier)}.item.json`;
        if (path.basename(file) !== expectedFile) {
            error(`${relative}: identifier '${identifier}' expects file name '${expectedFile}'.`);
        }
        if (namespaceOf(identifier) !== NAMESPACE) {
            error(`${relative}: identifier '${identifier}' must use the '${NAMESPACE}' namespace.`);
        }

        const components = item.components ?? {};
        if (components[SWORD_COMPONENT_ID] === undefined) {
            error(`${relative}: does not declare the '${SWORD_COMPONENT_ID}' custom component; its abilities can never fire.`);
        }
        if (components['minecraft:custom_components'] !== undefined) {
            error(`${relative}: uses the deprecated 'minecraft:custom_components' array. Flatten the component instead.`);
        }
        const tags = components['minecraft:tags']?.tags ?? [];
        for (const requiredTag of ['minecraft:is_sword', SWORD_ITEM_TAG]) {
            if (!tags.includes(requiredTag)) {
                error(`${relative}: minecraft:tags must include '${requiredTag}'.`);
            }
        }

        const shortname = components['minecraft:icon']?.textures?.default;
        if (typeof shortname !== 'string') {
            error(`${relative}: minecraft:icon must be { "textures": { "default": "<shortname>" } }.`);
        } else if (textureData[shortname] === undefined) {
            error(`${relative}: icon shortname '${shortname}' is not defined in item_texture.json.`);
        } else {
            const declared = textureData[shortname].textures;
            const expectedPath = swordTexturePath(shortname);
            if (declared !== expectedPath) {
                error(
                    `${relative}: texture '${declared}' does not follow the convention. ` +
                        `Sword icons live at '${expectedPath}'.`,
                );
            }
            const png = resourceFile(declared);
            if (!fs.existsSync(png)) {
                error(`${relative}: texture '${declared}.png' does not exist in the resource pack.`);
            } else {
                // The PNG encoder is hand-written, so the bytes are verified
                // rather than assumed. A lenient decoder opening the file is
                // not evidence that Minecraft will.
                for (const problem of verifyPng(fs.readFileSync(png))) {
                    error(`${relative}: icon '${declared}.png' is not a conformant PNG — ${problem}.`);
                }
            }
        }

        const declaredNameKey = components['minecraft:display_name']?.value;
        const expectedNameKey = nameKey(identifier);
        if (typeof declaredNameKey !== 'string') {
            error(`${relative}: missing minecraft:display_name.value.`);
        } else if (declaredNameKey !== expectedNameKey) {
            error(`${relative}: display name key '${declaredNameKey}' should be '${expectedNameKey}'.`);
        } else if (!rpLangKeys.has(declaredNameKey)) {
            error(`${relative}: display name key '${declaredNameKey}' is not defined in the resource pack en_US.lang.`);
        }

        // The v0.5.0 tooltip bug: only `item.<id>.name` was defined, which the
        // engine never looks up for a namespaced custom item, so the raw
        // identifier showed instead of the name. Both keys are required now.
        if (!rpLangKeys.has(legacyNameKey(identifier))) {
            error(
                `${relative}: '${legacyNameKey(identifier)}' is not defined in the resource pack en_US.lang. ` +
                    'Both name keys are emitted deliberately — see identifiers.js.',
            );
        }

        // The v0.5.0 creative-category bug: an unnamespaced group is not a
        // valid group reference, so the swords fell into the generic tab.
        const menu = item.description?.menu_category;
        if (menu === undefined || typeof menu !== 'object') {
            error(`${relative}: description.menu_category is missing — the item will default to the Items tab.`);
        } else {
            if (menu.category !== CREATIVE_CATEGORY) {
                error(`${relative}: menu_category.category is '${menu.category}', expected '${CREATIVE_CATEGORY}'.`);
            }
            if (menu.group !== CREATIVE_GROUP) {
                error(
                    `${relative}: menu_category.group is '${menu.group}', expected '${CREATIVE_GROUP}'. ` +
                        'A creative group reference must carry the minecraft: namespace.',
                );
            }
        }
    }

    // Definitions and item JSON must be in one-to-one correspondence.
    for (const sword of swords) {
        if (!declaredIdentifiers.has(sword.id)) {
            error(`Sword '${sword.id}' has no generated item JSON. Run 'npm run generate'.`);
        }
    }
    for (const identifier of declaredIdentifiers) {
        if (!swords.some((/** @type {any} */ s) => s.id === identifier)) {
            error(`Item '${identifier}' exists in the behaviour pack but has no sword definition. Run 'npm run generate'.`);
        }
    }

    // Every texture entry should be referenced by something.
    for (const shortname of Object.keys(textureData)) {
        if (!swords.some((/** @type {any} */ s) => (s.texture ?? localNameOf(s.id)) === shortname)) {
            warn(`item_texture.json defines unused texture '${shortname}'.`);
        }
    }
}

// ---------------------------------------------------------------------------
// 3b. Texture standard
// ---------------------------------------------------------------------------

/**
 * Enforces the project's permanent texture rule: every sword ships a unique,
 * hand-authored, polished icon. A missing or sub-standard source is a build
 * failure, not a warning — see docs/TEXTURE_STANDARD.md.
 *
 * @param {readonly any[]} swords
 */
/**
 * How confusable two 16×16 icons are, as the mean per-pixel colour distance
 * over the pixels both of them paint.
 *
 * Silhouette is deliberately not weighted: every icon in the collection is a
 * sword pointing the same way, so shape overlap runs 78–99% for every pair and
 * separates nothing. Colour is what a player actually picks a hotbar slot by,
 * and the number below is what "these two look alike" reduces to.
 *
 * @param {Uint8ClampedArray | Uint8Array} a
 * @param {Uint8ClampedArray | Uint8Array} b
 * @returns {number} 0 for identical; the collection's median sits near 135.
 */
function iconDistance(a, b) {
    let sum = 0;
    let counted = 0;
    for (let pixel = 0; pixel < 16 * 16; pixel++) {
        const offset = pixel * 4;
        if (a[offset + 3] === 0 || b[offset + 3] === 0) continue;
        const dr = a[offset] - b[offset];
        const dg = a[offset + 1] - b[offset + 1];
        const db = a[offset + 2] - b[offset + 2];
        sum += Math.sqrt(dr * dr + dg * dg + db * db);
        counted++;
    }
    return counted === 0 ? 0 : sum / counted;
}

/** Below this share of blade, an icon reads as a dagger rather than a sword. */
const BLADE_FLOOR = 0.65;

/**
 * How much of an icon is blade rather than hilt.
 *
 * The crossguard is found as the row where the icon suddenly gets *wider* — not
 * the widest row, which on a sword with a slender guard and a heavy pommel
 * finds the pommel and reports the blade as half the weapon. Everything above
 * that row is blade.
 *
 * This exists because the v1.1.0 set measured 36-50%: the handle was longer
 * than the blade on twelve of the sixteen swords, and nothing in the pipeline
 * noticed. Every other texture rule grades colour, contrast or silhouette
 * *overlap*; none of them can tell a sword from a knife.
 *
 * @param {Uint8ClampedArray | Uint8Array} pixels
 * @returns {{ share: number, guard: number, blade: number }}
 */
function bladeShare(pixels) {
    const widths = [];
    for (let y = 0; y < 16; y++) {
        let w = 0;
        for (let x = 0; x < 16; x++) if (pixels[(y * 16 + x) * 4 + 3] > 0) w++;
        widths.push(w);
    }
    const filled = widths.map((w, y) => ({ w, y })).filter((r) => r.w > 0);
    if (filled.length < 3) return { share: 1, guard: 0, blade: 0 };
    const top = filled[0].y;
    const bottom = filled[filled.length - 1].y;
    let waist = bottom;
    let jump = -Infinity;
    for (const { y } of filled) {
        if (y <= top + (bottom - top) * 0.45) continue;
        const delta = widths[y] - widths[y - 1];
        if (delta > jump) {
            jump = delta;
            waist = y;
        }
    }
    return {
        share: (waist - top) / (bottom - top),
        guard: widths[waist],
        blade: widths[Math.max(0, waist - 2)],
    };
}

/** Above this share of a common silhouette, two swords are the same weapon. */
const SILHOUETTE_CEILING = 0.95;

/**
 * How much of two icons' shape is the same, as intersection over union of their
 * opaque masks.
 *
 * Not "share of the 256 pixels that agree", which sounds equivalent and is
 * useless: both icons leave most of the canvas empty, so that measure reads
 * 90%+ for every pair in the collection and separates nothing. Union as the
 * denominator throws the background away and asks only about the weapons.
 *
 * @param {Uint8ClampedArray | Uint8Array} a
 * @param {Uint8ClampedArray | Uint8Array} b
 * @returns {number} 0 for disjoint shapes, 1 for identical ones.
 */
function silhouetteOverlap(a, b) {
    let both = 0;
    let either = 0;
    for (let pixel = 0; pixel < 16 * 16; pixel++) {
        const inA = a[pixel * 4 + 3] > 0;
        const inB = b[pixel * 4 + 3] > 0;
        if (inA && inB) both++;
        if (inA || inB) either++;
    }
    return either === 0 ? 0 : both / either;
}

/**
 * No two swords may be hard to tell apart in a hotbar slot.
 *
 * Every other texture rule in this file grades an icon on its own — colour
 * count, coverage, luminance spread — and a collection can pass all of them
 * while containing two icons nobody can distinguish at 16 pixels. This is the
 * only check that looks at a texture *relative to the others*, which is the
 * form the problem actually takes: Earth and Nature scored 47 against a median
 * of 135 and read as the same brown-hilted green-bladed sword on the bar.
 *
 * @param {any[]} swords
 */
function validateIconDistinctness(swords) {
    /** Below this, two icons are close enough to be worth looking at. */
    const FLOOR = 50;

    const icons = [];
    for (const sword of swords) {
        const file = artFile(sword.texture ?? localNameOf(sword.id));
        if (!fs.existsSync(file)) continue;
        try {
            icons.push({ id: sword.id, pixels: renderPixels(readJson(file)) });
        } catch {
            // A texture that will not render is already an error elsewhere.
        }
    }

    // Proportion is a property of one icon, so it is checked before the pairwise
    // work rather than inside it.
    let leanest = 1;
    let leanestId = 'none';
    for (const icon of icons) {
        const { share, guard, blade } = bladeShare(icon.pixels);
        if (share < leanest) {
            leanest = share;
            leanestId = icon.id;
        }
        if (share < BLADE_FLOOR) {
            warn(
                `${icon.id} is only ${(share * 100).toFixed(0)}% blade (floor ` +
                    `${(BLADE_FLOOR * 100).toFixed(0)}%). A weapon whose handle rivals its blade reads ` +
                    'as a dagger — lengthen the blade or shorten the hilt.',
            );
        }
        if (guard <= blade) {
            warn(
                `${icon.id} has a crossguard ${guard} wide against a blade ${blade} wide. ` +
                    'A guard no wider than its blade does not read as a guard at sixteen pixels.',
            );
        }
    }

    let closest = Number.POSITIVE_INFINITY;
    let closestPair = 'none';
    let widest = 0;
    let widestPair = 'none';
    for (let i = 0; i < icons.length; i++) {
        for (let j = i + 1; j < icons.length; j++) {
            // Silhouette first. Two icons can be far apart in colour and still
            // be the same weapon painted twice, which is what a recolour *is*;
            // the existing rule only caught grids that matched pixel for pixel.
            const overlap = silhouetteOverlap(icons[i].pixels, icons[j].pixels);
            if (overlap > widest) {
                widest = overlap;
                widestPair = `${icons[i].id} / ${icons[j].id}`;
            }
            if (overlap > SILHOUETTE_CEILING) {
                warn(
                    `${icons[i].id} and ${icons[j].id} share ${(overlap * 100).toFixed(0)}% of their ` +
                        `silhouette (ceiling ${(SILHOUETTE_CEILING * 100).toFixed(0)}%). Same weapon, ` +
                        'different paint — give one of them its own blade, guard or pommel.',
                );
            }

            const distance = iconDistance(icons[i].pixels, icons[j].pixels);
            if (distance < closest) {
                closest = distance;
                closestPair = `${icons[i].id} / ${icons[j].id}`;
            }
            if (distance < FLOOR) {
                warn(
                    `${icons[i].id} and ${icons[j].id} score ${distance.toFixed(1)} on icon distance ` +
                        `(floor ${FLOOR}). They will be hard to tell apart in a hotbar slot.`,
                );
            }
        }
    }

    if (icons.length > 1) {
        note(`icon distinctness: closest pair is ${closestPair} at ${closest.toFixed(1)} (floor ${FLOOR}).`);
        note(
            `silhouette overlap: widest pair is ${widestPair} at ${(widest * 100).toFixed(0)}% ` +
                `(ceiling ${(SILHOUETTE_CEILING * 100).toFixed(0)}%).`,
        );
        note(
            `blade proportion: leanest is ${leanestId} at ${(leanest * 100).toFixed(0)}% blade ` +
                `(floor ${(BLADE_FLOOR * 100).toFixed(0)}%).`,
        );
    }
}

function validateTextures(swords) {
    /** @type {Map<string, string>} Signature -> the sword that used it first. */
    const signatures = new Map();

    for (const sword of swords) {
        const shortname = sword.texture ?? localNameOf(sword.id);
        const source = artFile(shortname);
        const relative = path.relative(PATHS.root, source);

        if (!fs.existsSync(source)) {
            error(
                `${sword.id}: no texture source at ${relative}. Every sword needs a hand-authored ` +
                    'icon before it is complete — a generated placeholder does not satisfy the texture standard.',
            );
            continue;
        }

        const spec = readJson(source);
        if (spec === undefined) continue;

        const structural = validateSource(spec);
        for (const problem of structural) error(`${relative}: ${problem}`);
        if (structural.length > 0) continue;

        const quality = inspectQuality(spec);
        for (const problem of quality.errors) error(`${relative}: ${problem}`);
        for (const problem of quality.warnings) warn(`${relative}: ${problem}`);

        // Two swords sharing a pixel grid means a recolour, which the standard
        // forbids: each sword needs its own silhouette and identity.
        const signature = spec.pixels.join('|');
        const previous = signatures.get(signature);
        if (previous !== undefined) {
            error(
                `${sword.id}: its texture is pixel-identical in shape to ${previous}. ` +
                    'Swords must not be recolours of one another.',
            );
        } else {
            signatures.set(signature, sword.id);
        }

        note(
            `  texture ${shortname.padEnd(20)} ${quality.stats.colours} colours · ` +
                `${(quality.stats.coverage * 100).toFixed(0)}% coverage · ` +
                `luminance spread ${quality.stats.luminanceSpread}`,
        );
    }
}

// ---------------------------------------------------------------------------
// 4. Sword and ability definitions
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<readonly any[]>}
 */
async function validateDefinitions() {
    const { SWORDS } = await import(MODULES.swords);
    const { ABILITIES } = await import(MODULES.abilities);
    const { validateSwordDefinition, validateAbilityDefinition } = await import(MODULES.definitionValidator);

    /** @type {Set<string>} */
    const abilityIds = new Set();
    for (const ability of ABILITIES) {
        for (const problem of validateAbilityDefinition(ability)) error(`ability: ${problem}`);
        if (abilityIds.has(ability.id)) error(`Duplicate ability id '${ability.id}'.`);
        abilityIds.add(ability.id);
    }

    /** @type {Set<string>} */
    const swordIds = new Set();
    /** @type {Map<string, string>} binding label -> the sword that uses it */
    const labels = new Map();
    // Counted and reported below. A gate that silently checks nothing looks
    // exactly like a gate that passes, which is how the previous version of
    // this loop went unnoticed; the count makes "it ran" visible on every build.
    let checked = 0;
    for (const sword of SWORDS) {
        for (const problem of validateSwordDefinition(sword, (/** @type {string} */ id) => abilityIds.has(id))) {
            error(`sword: ${problem}`);
        }
        if (swordIds.has(sword.id)) error(`Duplicate sword id '${sword.id}'.`);
        swordIds.add(sword.id);

        // Ability-specific parameter validation, using the same merge the
        // executor performs at runtime.
        //
        // This reads `sword.abilities`, which is where bindings actually live.
        // An earlier version read `sword.active` and `sword.passive` — fields no
        // definition has ever carried — so the loop found `undefined` every
        // time and skipped silently. The effect was that every ability's
        // `validateParams` was dead code: a mis-authored parameter would have
        // sailed through the build and failed in-game, which is the exact
        // failure mode this gate exists to prevent. Iterate the real shape, and
        // fail loudly if it is ever missing.
        if (!Array.isArray(sword.abilities)) {
            error(`sword: ${sword.id} has no 'abilities' array; parameter validation cannot run.`);
            continue;
        }
        for (const binding of sword.abilities) {
            if (binding === undefined || binding === null) continue;
            const trigger = binding.activation ?? 'unknown';

            // The label is what the player reads on the action bar when the
            // ability fires. The framework falls back to the ability's own name
            // when a binding omits one, which is why two swords shipped for
            // eleven milestones announcing themselves as 'Cleave' and 'Brand'
            // — correct, and anonymous. A shipped sword names its own moves.
            if (typeof binding.label !== 'string' || binding.label.length === 0) {
                error(`sword: ${sword.id}.${trigger} has no 'label'; the action bar would fall back to the ability name.`);
            } else {
                const owner = labels.get(binding.label);
                if (owner !== undefined) {
                    error(`sword: ability label '${binding.label}' is used by both ${owner} and ${sword.id}.`);
                }
                labels.set(binding.label, sword.id);
            }

            const ability = ABILITIES.find((/** @type {any} */ a) => a.id === binding.abilityId);
            if (ability?.validateParams === undefined) continue;
            const merged = { ...(ability.defaults ?? {}), ...(binding.params ?? {}) };
            for (const problem of ability.validateParams(merged)) {
                error(`sword: ${sword.id}.${trigger} -> ${ability.id}: ${problem}`);
            }
            checked++;
        }
    }

    const testItems = SWORDS.filter((/** @type {any} */ s) => s.isTestItem === true);
    note(
        `${SWORDS.length} sword definition(s): ${SWORDS.length - testItems.length} shipped, ` +
            `${testItems.length} diagnostic (${testItems.map((/** @type {any} */ s) => s.id).join(', ') || 'none'}).`,
    );
    note(`${ABILITIES.length} ability definition(s): ${[...abilityIds].join(', ')}.`);
    if (checked === 0) {
        error('No ability parameters were validated. The binding shape changed and this gate is not reading it.');
    } else {
        note(`${checked} binding(s) passed their ability's own parameter validation.`);
    }

    // A compact roster, so balance outliers are visible on every build rather
    // than only when someone goes looking. Uses the same resolver the runtime
    // and the in-game `/scriptevent custom_swords:list` use.
    for (const description of describeAll(SWORDS)) {
        const abilities =
            description.abilities
                .map(
                    (a) =>
                        `${a.activation}:${a.targetingType}${a.range === undefined ? '' : `/${a.range}`}` +
                        `@${a.cooldownSeconds}s`,
                )
                .join(' ') || 'none';
        note(
            `  ${description.rarityLabel.padEnd(9)} ${description.id.padEnd(32)} ` +
                `dmg ${String(description.stats.meleeDamage).padStart(3)} ` +
                `dur ${String(description.stats.durability).padStart(5)}  ${abilities}` +
                `${description.isTestItem ? '  [diagnostic]' : ''}`,
        );
    }

    return SWORDS;
}

/**
 * Cross-binding agreement on shared state.
 *
 * A sword's two bindings often talk to each other through the player-state
 * store: Time Sword's passive banks charge that its active spends, Ember
 * Blade's edge builds the heat its burst releases, Shadow Sword's step opens
 * the window its edge exploits. All three are held together by nothing but two
 * string literals in different files matching, and several of the definitions
 * carry a comment saying so — which is not a gate.
 *
 * When they stop matching nothing errors, nothing logs, and nothing looks
 * broken. The passive charges a meter no one reads and the active reads a meter
 * no one fills, so the sword just quietly never pays out. That is the exact
 * failure the ability-parameter gate above was supposed to catch and could not,
 * because each binding's params are individually valid — it is the *pairing*
 * that is wrong, and only the sword can see it.
 *
 * Two rules:
 *
 *  - **Within a sword**, every `*Key` and `*ChargeTicks` parameter that appears
 *    in more than one binding must carry the same value. These name a shared
 *    clock; disagreeing about it is always a bug.
 *  - **Across swords**, a state key value must be unique. Keys are scoped to
 *    the *player*, not the sword, so two swords sharing `'charge'` would fight
 *    over one slot in the inventory of anyone carrying both.
 *
 * @param {any[]} swords
 * @param {any[]} abilities
 */
function validateSharedState(swords, abilities) {
    /** Params that name a shared store or clock rather than a local tuning value. */
    const SHARED = /(Key|ChargeTicks)$/;

    /** @type {Map<string, string>} key value -> the sword that claimed it */
    const owners = new Map();
    let pairs = 0;

    for (const sword of swords) {
        /** @type {Map<string, { value: unknown, where: string }>} */
        const seen = new Map();

        for (const binding of sword.abilities ?? []) {
            const ability = abilities.find((/** @type {any} */ a) => a.id === binding.abilityId);
            const merged = { ...(ability?.defaults ?? {}), ...(binding.params ?? {}) };
            const where = `${binding.activation} -> ${binding.abilityId}`;

            for (const [name, value] of Object.entries(merged)) {
                if (!SHARED.test(name)) continue;

                const previous = seen.get(name);
                if (previous === undefined) {
                    seen.set(name, { value, where });
                } else {
                    pairs++;
                    if (previous.value !== value) {
                        error(
                            `${sword.id}: '${name}' disagrees between bindings — ` +
                                `${previous.where} says ${JSON.stringify(previous.value)} but ` +
                                `${where} says ${JSON.stringify(value)}. They share one store; ` +
                                'a mismatch makes the pairing silently never pay out.',
                        );
                    }
                }

                // Cross-sword uniqueness, for the keys that name a store.
                if (!name.endsWith('Key') || typeof value !== 'string') continue;
                const owner = owners.get(value);
                if (owner === undefined) owners.set(value, sword.id);
                else if (owner !== sword.id) {
                    error(
                        `state key '${value}' is claimed by both ${owner} and ${sword.id}. ` +
                            'Keys are scoped to the player, so both swords would share one slot.',
                    );
                }
            }
        }
    }

    note(`${owners.size} shared state key(s), ${pairs} cross-binding pairing(s) agreed.`);
}

/**
 * The per-activation particle budget.
 *
 * `config.particles.maxPerEmit` caps a single `emit`, `ring` or `line` call at
 * 64 — but an ability makes several of those calls, and the ones marked
 * `at: 'target'` are made once per target. A binding drawing 20 particles at
 * each of 12 targets is inside every individual cap and still asks the client
 * for 240 in one frame, which is what a low-end device notices.
 *
 * Nothing in the collection is close to that today; the point of counting it
 * here is that the ceiling is invisible from any one definition, so the number
 * has to be assembled from the whole binding to be seen at all.
 *
 * @param {any[]} swords
 * @param {any[]} abilities
 */
function validateVisualBudget(swords, abilities) {
    /** Above this, one activation is worth a second look on a low-end device. */
    const BUDGET = 120;
    /** How the geometry each ability draws scales: once per cast, or per target. */
    const GEOMETRY = {
        ringPoints: 'once',
        arcPoints: 'once',
        tetherPoints: 'once',
        trailPoints: 'perTarget',
        dischargeParticleCount: 'perTarget',
        empoweredParticleCount: 'perTarget',
        smiteParticleCount: 'perTarget',
    };

    let worst = 0;
    let worstLabel = 'none';

    for (const sword of swords) {
        for (const binding of sword.abilities ?? []) {
            const ability = abilities.find((/** @type {any} */ a) => a.id === binding.abilityId);
            const params = { ...(ability?.defaults ?? {}), ...(binding.params ?? {}) };
            const targeting = binding.targeting ?? { type: 'self' };

            // The most entities this binding can reach. `self` and `point`
            // resolve no entities, so their ability's own params carry the cap.
            const maxTargets =
                targeting.type === 'self'
                    ? params.arrivalMaxTargets ?? 0
                    : targeting.type === 'point'
                      ? params.maxTargets ?? 1
                      : targeting.type === 'single' || targeting.type === 'ray'
                        ? 1 + (params.maxJumps ?? 0)
                        : targeting.maxTargets ?? 1;

            const cap = CONFIG_PARTICLE_CAP;
            let total = 0;
            for (const particle of binding.particles ?? []) {
                const count = Math.min(particle.count ?? 1, cap);
                total += (particle.at ?? 'caster') === 'target' ? count * maxTargets : count;
            }
            for (const [name, mode] of Object.entries(GEOMETRY)) {
                const points = params[name];
                if (typeof points !== 'number' || points <= 0) continue;
                total += Math.min(points, cap) * (mode === 'perTarget' ? maxTargets : 1);
            }

            if (total > worst) {
                worst = total;
                worstLabel = `${sword.id}.${binding.activation}`;
            }
            if (total > BUDGET) {
                warn(
                    `${sword.id}.${binding.activation} can draw ${total} particles in one activation ` +
                        `(budget ${BUDGET}). Every individual call is inside its own cap; the total is not.`,
                );
            }
        }
    }

    note(`particle budget: worst single activation is ${worst} (${worstLabel}), budget ${BUDGET}.`);
}

// ---------------------------------------------------------------------------
// 5. Architecture rules
// ---------------------------------------------------------------------------

/**
 * Source with comments and string literals blanked out, so a scan for a banned
 * API does not trip over the doc comments explaining why it was never called.
 * Several definitions discuss `spawnEntity` and `setTimeOfDay` at length for
 * exactly that reason.
 *
 * Crude but adequate: it only has to be right about whether an identifier
 * appears in executable position, and it errs toward blanking.
 *
 * @param {string} source
 * @returns {string}
 */
function stripCommentsAndStrings(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function validateArchitecture() {
    const scriptFiles = filesMatching(PATHS.bpScripts, /\.js$/);

    // 5a. Ability and sword modules must stay engine-free so they remain
    //     unit-testable and decoupled from the runtime.
    for (const file of scriptFiles) {
        const relative = path.relative(PATHS.bpScripts, file);
        const source = fs.readFileSync(file, 'utf8');
        const importsEngine = /^\s*import[^\n]*from\s+['"]@minecraft\/server['"]/m.test(source);
        if (importsEngine && (relative.startsWith('abilities/') || relative.startsWith('swords/'))) {
            error(
                `scripts/${relative}: imports '@minecraft/server'. Abilities and sword definitions must use the ` +
                    'injected service container instead.',
            );
        }
    }

    // 5b. Browser timers do not exist in the Bedrock script runtime.
    for (const file of scriptFiles) {
        const source = fs.readFileSync(file, 'utf8');
        for (const banned of ['setTimeout(', 'setInterval(', 'requestAnimationFrame(']) {
            if (source.includes(banned)) {
                error(`scripts/${path.relative(PATHS.bpScripts, file)}: uses '${banned}', which does not exist in Bedrock scripting.`);
            }
        }
    }

    // 5b-ii. Terrain and world safety. The addon reads blocks — the dash needs
    //     to know where the ground is — but it never writes one, never spawns
    //     an entity, never touches the clock or the weather, and never shells
    //     out to a command. That is what makes every sword safe to hand to a
    //     stranger on a shared world, and it has been true only by convention
    //     since v0.1.0. A ban list is how a convention becomes a guarantee.
    //
    //     Several sword and ability docs discuss these APIs at length to
    //     explain why they were not used, so the check looks at code with
    //     comments and strings stripped rather than at raw source.
    const WORLD_MUTATION = [
        ['setType', 'places a block'],
        ['setPermutation', 'changes a block'],
        ['fillBlocks', 'rewrites terrain'],
        ['setBlockPermutation', 'changes a block'],
        ['spawnEntity', 'spawns an entity'],
        ['spawnItem', 'drops an item'],
        ['createExplosion', 'destroys terrain'],
        ['setTimeOfDay', "changes everyone's sky"],
        ['setWeather', "changes everyone's weather"],
        ['setGameRule', 'changes the world rules'],
        ['runCommand', 'escapes every safety rule in this framework'],
        ['runCommandAsync', 'escapes every safety rule in this framework'],
    ];
    for (const file of scriptFiles) {
        const relative = path.relative(PATHS.bpScripts, file);
        const code = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'));
        for (const [api, why] of WORLD_MUTATION) {
            if (new RegExp(`\\.${api}\\s*\\(`).test(code)) {
                error(
                    `scripts/${relative}: calls '${api}()', which ${why}. Custom Swords does not modify the ` +
                        'world — it reads blocks and applies damage, effects and knockback, and nothing else.',
                );
            }
        }
    }

    // 5c. Performance rule: gameplay is event-driven. Exactly one recurring
    //     interval is allowed, and it exists only for memory maintenance.
    /** @type {string[]} */
    const intervalSites = [];
    for (const file of scriptFiles) {
        const source = fs.readFileSync(file, 'utf8');
        const matches = source.match(/system\.runInterval\s*\(/g);
        if (matches !== null) {
            for (let i = 0; i < matches.length; i++) intervalSites.push(path.relative(PATHS.bpScripts, file));
        }
    }
    if (intervalSites.length > 1) {
        error(
            `Found ${intervalSites.length} system.runInterval call sites (${intervalSites.join(', ')}). ` +
                'The framework allows exactly one, in core/bootstrap.js, for state maintenance.',
        );
    } else if (intervalSites.length === 1 && intervalSites[0] !== 'core/bootstrap.js') {
        error(`system.runInterval must live in core/bootstrap.js, found it in ${intervalSites[0]}.`);
    }

    // 5d. Performance rule: every engine event is subscribed exactly once, and
    //     only from the bootstrap. A second subscription to the same signal
    //     means an ability firing twice per input.
    /** @type {Map<string, string[]>} signal -> files subscribing to it */
    const subscriptions = new Map();
    for (const file of scriptFiles) {
        const relative = path.relative(PATHS.bpScripts, file);
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(/\b(?:world|system)\.(?:before|after)Events\.([a-zA-Z]+)\.subscribe\b/g)) {
            const signal = match[1];
            const seen = subscriptions.get(signal) ?? [];
            seen.push(relative);
            subscriptions.set(signal, seen);
        }
    }
    for (const [signal, files] of subscriptions) {
        if (files.length > 1) {
            error(`Engine event '${signal}' is subscribed ${files.length} times (${files.join(', ')}). Subscribe once.`);
        }
        if (files[0] !== 'core/bootstrap.js') {
            error(`Engine event '${signal}' is subscribed from ${files[0]}; all subscriptions belong in core/bootstrap.js.`);
        }
    }
    note(`  ${subscriptions.size} engine event subscription(s), 1 recurring interval, 0 gameplay tick loops.`);

    // 5e. No orphaned script modules — everything must be reachable from the
    //     manifest entry point, or it is dead weight inside the .mcaddon.
    const entry = path.join(PATHS.bpScripts, 'main.js');
    /** @type {Set<string>} */
    const reachable = new Set();
    /** @param {string} file */
    const walk = (file) => {
        if (reachable.has(file) || !fs.existsSync(file)) return;
        reachable.add(file);
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(/^\s*(?:import|export)[^\n]*?from\s+['"](\.[^'"]+)['"]/gm)) {
            walk(path.resolve(path.dirname(file), match[1]));
        }
    };
    walk(entry);
    // `core/types.js` is a documentation-only module: it exports nothing and is
    // referenced solely from JSDoc `import('./types.js')` annotations, so it is
    // legitimately unreachable at runtime.
    const RUNTIME_UNREACHABLE_BY_DESIGN = new Set(['core/types.js']);
    for (const file of scriptFiles) {
        const relative = path.relative(PATHS.bpScripts, file);
        if (reachable.has(file) || RUNTIME_UNREACHABLE_BY_DESIGN.has(relative)) continue;
        warn(`scripts/${relative} is not reachable from main.js.`);
    }
}

// ---------------------------------------------------------------------------
// 4b. Uniqueness
// ---------------------------------------------------------------------------

/**
 * No two swords may share an identifier, a display name, a texture shortname or
 * a localisation key.
 *
 * The registry already rejects a duplicate *id* at startup, but the other three
 * collide silently: two swords pointing at one texture shortname simply render
 * the same icon, and two sharing a display name are indistinguishable in the
 * creative menu. Both are cheap mistakes to make by copying a definition, and
 * they get harder to spot as the collection grows towards 25.
 *
 * @param {readonly any[]} swords
 */
function validateUniqueness(swords) {
    /** @type {Record<string, Map<string, string>>} */
    const seen = { id: new Map(), name: new Map(), texture: new Map(), nameKey: new Map() };

    for (const sword of swords) {
        /** @type {[keyof typeof seen, string, string][]} */
        const claims = [
            ['id', sword.id, 'identifier'],
            ['name', sword.name, 'display name'],
            ['texture', sword.texture ?? localNameOf(sword.id), 'texture shortname'],
            ['nameKey', nameKey(sword.id), 'localisation key'],
        ];
        for (const [bucket, value, label] of claims) {
            const owner = seen[bucket].get(value);
            if (owner !== undefined) {
                error(`${label} '${value}' is claimed by both '${owner}' and '${sword.id}'.`);
            } else {
                seen[bucket].set(value, sword.id);
            }
        }
    }

    note(`${swords.length} sword(s): identifiers, names, texture shortnames and lang keys all unique.`);
}

// ---------------------------------------------------------------------------
// 4c. Crafting recipes
// ---------------------------------------------------------------------------

/**
 * Every sword must be craftable, and every ingredient must be a real item.
 *
 * A recipe naming an item that does not exist does not error — it simply never
 * registers, and the player finds out by not being able to craft the sword.
 * That is the same silent-failure shape as the particle and sound bugs, so it
 * gets the same treatment: a transcribed vanilla list, checked at build time.
 *
 * @param {readonly any[]} swords
 */
function validateRecipes(swords) {
    const snapshotPath = path.join(PATHS.root, 'tools', 'data', 'vanilla_items.json');
    if (!fs.existsSync(snapshotPath)) {
        error('tools/data/vanilla_items.json is missing — recipe ingredients cannot be verified.');
        return;
    }
    const snapshot = readJson(snapshotPath);
    if (snapshot === undefined) return;
    const vanillaItems = new Set(snapshot.items ?? []);

    /** @type {Map<string, string>} recipe identifier -> owning sword */
    const identifiers = new Map();
    let ingredientsChecked = 0;

    for (const sword of swords) {
        const recipe = sword.recipe;
        if (recipe === undefined) {
            error(`${sword.id}: no crafting recipe. Every sword must be craftable — see docs/ADDING_A_SWORD.md.`);
            continue;
        }

        // --- shape ---
        if (!Array.isArray(recipe.pattern) || recipe.pattern.length === 0 || recipe.pattern.length > 3) {
            error(`${sword.id}: recipe.pattern must be 1 to 3 rows.`);
            continue;
        }
        const width = recipe.pattern[0].length;
        if (width === 0 || width > 3) {
            error(`${sword.id}: recipe rows must be 1 to 3 characters wide.`);
            continue;
        }
        for (const row of recipe.pattern) {
            if (typeof row !== 'string' || row.length !== width) {
                error(`${sword.id}: every recipe row must be a string of the same width.`);
            }
        }

        // --- keys cover the pattern, and nothing more ---
        const used = new Set([...recipe.pattern.join('')].filter((ch) => ch !== ' '));
        if (used.size === 0) {
            error(`${sword.id}: recipe pattern is entirely empty.`);
        }
        for (const ch of used) {
            if (recipe.key?.[ch] === undefined) {
                error(`${sword.id}: recipe pattern uses '${ch}' but recipe.key does not define it.`);
            }
        }
        for (const ch of Object.keys(recipe.key ?? {})) {
            if (!used.has(ch)) {
                warn(`${sword.id}: recipe.key defines '${ch}', which the pattern never uses.`);
            }
        }

        // --- every ingredient is a real vanilla item ---
        for (const [ch, item] of Object.entries(recipe.key ?? {})) {
            ingredientsChecked += 1;
            if (typeof item !== 'string' || !vanillaItems.has(item)) {
                error(`${sword.id}: recipe key '${ch}' is '${item}', which is not a vanilla item identifier.`);
            }
        }
        if (recipe.unlockedBy !== undefined && !vanillaItems.has(recipe.unlockedBy)) {
            error(`${sword.id}: recipe.unlockedBy '${recipe.unlockedBy}' is not a vanilla item identifier.`);
        }

        // --- one recipe identifier per sword ---
        const identifier = `${sword.id}_recipe`;
        const owner = identifiers.get(identifier);
        if (owner !== undefined) error(`recipe identifier '${identifier}' is claimed by both '${owner}' and '${sword.id}'.`);
        else identifiers.set(identifier, sword.id);
    }

    // --- repair items are real too ---
    for (const sword of swords) {
        for (const item of sword.item?.repairItems ?? []) {
            ingredientsChecked += 1;
            if (!vanillaItems.has(item)) {
                error(`${sword.id}: repair item '${item}' is not a vanilla item identifier.`);
            }
        }
    }

    // --- the generated JSON matches the definitions ---
    if (fs.existsSync(PATHS.bpRecipes)) {
        const files = fs.readdirSync(PATHS.bpRecipes).filter((f) => f.endsWith('.recipe.json'));
        if (files.length !== swords.length) {
            error(`${files.length} recipe file(s) for ${swords.length} sword(s). Run 'npm run generate'.`);
        }
        for (const file of files) {
            const json = readJson(path.join(PATHS.bpRecipes, file));
            if (json === undefined) continue;
            const shaped = json['minecraft:recipe_shaped'];
            if (shaped === undefined) {
                error(`recipes/${file}: not a minecraft:recipe_shaped recipe.`);
                continue;
            }
            if (!(shaped.tags ?? []).includes('crafting_table')) {
                error(`recipes/${file}: must carry the 'crafting_table' tag or it cannot be crafted anywhere.`);
            }
            if (!swords.some((s) => s.id === shaped.result)) {
                error(`recipes/${file}: result '${shaped.result}' is not one of this add-on's swords.`);
            }
        }
    } else {
        error("packs/CustomSwordsBP/recipes/ does not exist. Run 'npm run generate'.");
    }

    note(`${swords.length} recipe(s), ${ingredientsChecked} ingredient/repair item(s) verified against ${vanillaItems.size} vanilla items.`);

    validateCraftingProgression(swords);
}

/**
 * The crafting cost curve against the rarity curve.
 *
 * A collection where a Rare costs a diamond and an Epic costs a stick does not
 * feel intentional, and nothing else in the toolchain can see it: every such
 * recipe is individually valid, and the problem only exists in the comparison.
 *
 * Ingredients carry an acquisition tier (`tools/data/ingredient_tiers.json`) and
 * each rarity declares the lowest tier its recipes should demand. A sword whose
 * rarest ingredient falls below its floor is **cheaper than its tier claims**,
 * which is reported as a warning rather than an error: it is a balance
 * judgement, not a defect, and the fix belongs to whoever is doing the balance
 * pass rather than to whoever is adding a sword.
 *
 * @param {readonly any[]} swords
 */
function validateCraftingProgression(swords) {
    const tierFile = path.join(PATHS.root, 'tools', 'data', 'ingredient_tiers.json');
    if (!fs.existsSync(tierFile)) {
        warn('tools/data/ingredient_tiers.json is missing — the crafting cost curve cannot be checked.');
        return;
    }
    const data = readJson(tierFile);
    if (data === undefined) return;

    /** @type {Map<string, number>} item -> acquisition tier */
    const tierOf = new Map();
    /** @type {Map<number, string>} tier -> label */
    const labelOf = new Map([[0, 'starting materials']]);
    for (const group of data.tiers ?? []) {
        labelOf.set(group.tier, group.label);
        for (const item of group.items ?? []) tierOf.set(item, group.tier);
    }

    /** @type {{ rarity: string, id: string, tier: number, floor: number, rarest: string }[]} */
    const rows = [];
    for (const sword of swords) {
        const floor = data.expected?.[sword.rarity];
        if (typeof floor !== 'number') continue;

        let tier = 0;
        let rarest = '(starting materials)';
        for (const item of Object.values(sword.recipe?.key ?? {})) {
            const itemTier = tierOf.get(item) ?? 0;
            if (itemTier > tier) {
                tier = itemTier;
                rarest = item;
            }
        }
        rows.push({ rarity: sword.rarity, id: sword.id, tier, floor, rarest });
    }

    for (const row of rows.sort((a, b) => a.tier - b.tier)) {
        if (row.tier >= row.floor) continue;
        warn(
            `${row.id} is ${row.rarity} but its costliest ingredient is '${row.rarest}' ` +
                `(tier ${row.tier}, ${labelOf.get(row.tier)}), below the tier-${row.floor} floor its rarity implies. ` +
                'Cheaper than its rarity claims — a balance judgement, not a defect.',
        );
    }

    const byTier = new Map();
    for (const row of rows) byTier.set(row.tier, (byTier.get(row.tier) ?? 0) + 1);
    const spread = [...byTier.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([tier, count]) => `${count}x tier ${tier} (${labelOf.get(tier)})`)
        .join(', ');
    note(`crafting cost curve: ${spread}.`);
}

// ---------------------------------------------------------------------------
// 5b. Audio catalogue
// ---------------------------------------------------------------------------

/**
 * Every id in `SOUND_LIBRARY` must be a real vanilla sound event.
 *
 * `Dimension.playSound` with an unknown id is silent, not an error, so a wrong
 * id is invisible in-game and invisible to a mocked test suite. v0.5.1 shipped
 * fourteen sword bindings whose sounds never played for exactly that reason.
 *
 * Checked against `tools/data/vanilla_sound_events.json` — the event names from
 * the vanilla resource pack's own `sound_definitions.json`. That file is
 * build-time reference material and is not shipped in the add-on.
 */
async function validateSoundLibrary() {
    const snapshotPath = path.join(PATHS.root, 'tools', 'data', 'vanilla_sound_events.json');
    if (!fs.existsSync(snapshotPath)) {
        error('tools/data/vanilla_sound_events.json is missing — sound ids cannot be verified.');
        return;
    }

    const snapshot = readJson(snapshotPath);
    if (snapshot === undefined) return;
    const events = new Set(snapshot.events ?? []);

    const { SOUND_LIBRARY } = await import(
        pathToFileURL(path.join(PATHS.bpScripts, 'systems', 'sounds.js')).href
    );

    let checked = 0;
    for (const [preset, spec] of Object.entries(SOUND_LIBRARY)) {
        checked += 1;
        if (!events.has(spec.id)) {
            error(
                `SOUND_LIBRARY.${preset}: '${spec.id}' is not a vanilla sound event. ` +
                    'playSound would be silent rather than failing.',
            );
        }
    }
    note(`${checked} sound preset(s) verified against ${events.size} vanilla sound events.`);
}

// ---------------------------------------------------------------------------

async function main() {
    validateManifests();
    validateAllJson();
    const swords = await validateDefinitions();
    const { ABILITIES } = await import(MODULES.abilities);
    validateSharedState(swords, ABILITIES);
    validateVisualBudget(swords, ABILITIES);
    validateUniqueness(swords);
    validateRecipes(swords);
    validateItemsAndResources(swords);
    validateTextures(swords);
    validateIconDistinctness(swords);
    await validateSoundLibrary();
    validateArchitecture();

    for (const message of notes) console.log(`validate: note    ${message}`);
    for (const message of warnings) console.warn(`validate: WARNING ${message}`);
    for (const message of errors) console.error(`validate: ERROR   ${message}`);

    if (errors.length > 0) {
        console.error(`\nvalidate: FAILED with ${errors.length} error(s) and ${warnings.length} warning(s).`);
        process.exitCode = 1;
    } else {
        console.log(`\nvalidate: OK (0 errors, ${warnings.length} warning(s)).`);
    }
}

main().catch((cause) => {
    console.error('validate: crashed —', cause);
    process.exitCode = 1;
});
