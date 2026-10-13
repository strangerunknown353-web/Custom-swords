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
import { inspectQuality, validateSource } from './lib/texture.mjs';

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
    GUIDE_ITEM_ID,
    GUIDE_COMPONENT_ID,
    GUIDE_TEXTURE_NAME,
    GUIDE_TEXTURE_PATH,
} =
    await import(MODULES.identifiers);
const { RARITIES } = await import(MODULES.rarity);
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
        if (identifier === GUIDE_ITEM_ID) {
            validateGuideItem(json, relative, textureData, rpLangKeys);
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
        if (shortname === GUIDE_TEXTURE_NAME) continue;
        if (!swords.some((/** @type {any} */ s) => (s.texture ?? localNameOf(s.id)) === shortname)) {
            warn(`item_texture.json defines unused texture '${shortname}'.`);
        }
    }
}

/**
 * The guide book: not a sword, so it gets its own, smaller set of checks.
 *
 * @param {any} json
 * @param {string} relative
 * @param {Record<string, { textures: string }>} textureData
 * @param {Set<string>} rpLangKeys
 */
function validateGuideItem(json, relative, textureData, rpLangKeys) {
    const components = json['minecraft:item']?.components ?? {};
    if (components[GUIDE_COMPONENT_ID] === undefined) {
        error(`${relative}: does not declare the '${GUIDE_COMPONENT_ID}' component; the book would never open.`);
    }
    if (components['minecraft:icon']?.textures?.default !== GUIDE_TEXTURE_NAME) {
        error(`${relative}: icon must be '${GUIDE_TEXTURE_NAME}'.`);
    }
    if (textureData[GUIDE_TEXTURE_NAME]?.textures !== GUIDE_TEXTURE_PATH) {
        error(`item_texture.json: '${GUIDE_TEXTURE_NAME}' must point at '${GUIDE_TEXTURE_PATH}'.`);
    } else {
        const png = resourceFile(GUIDE_TEXTURE_PATH);
        if (!fs.existsSync(png)) error(`${relative}: '${GUIDE_TEXTURE_PATH}.png' does not exist.`);
        else for (const problem of verifyPng(fs.readFileSync(png))) error(`${relative}: icon is not a conformant PNG — ${problem}.`);
    }
    for (const key of [nameKey(GUIDE_ITEM_ID), legacyNameKey(GUIDE_ITEM_ID)]) {
        if (!rpLangKeys.has(key)) error(`${relative}: '${key}' is not defined in the resource pack en_US.lang.`);
    }
    note('  guide book: item, component, icon and name verified.');
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
    for (const sword of SWORDS) {
        for (const problem of validateSwordDefinition(sword, (/** @type {string} */ id) => abilityIds.has(id))) {
            error(`sword: ${problem}`);
        }
        if (swordIds.has(sword.id)) error(`Duplicate sword id '${sword.id}'.`);
        swordIds.add(sword.id);

        // Ability-specific parameter validation, using the same merge the
        // executor performs at runtime.
        for (const [trigger, binding] of [
            ['active', sword.active],
            ['passive', sword.passive],
        ]) {
            if (binding === undefined) continue;
            const ability = ABILITIES.find((/** @type {any} */ a) => a.id === binding.abilityId);
            if (ability?.validateParams === undefined) continue;
            const merged = { ...(ability.defaults ?? {}), ...(binding.params ?? {}) };
            for (const problem of ability.validateParams(merged)) {
                error(`sword: ${sword.id}.${trigger} -> ${ability.id}: ${problem}`);
            }
        }
    }

    const testItems = SWORDS.filter((/** @type {any} */ s) => s.isTestItem === true);
    note(
        `${SWORDS.length} sword definition(s): ${SWORDS.length - testItems.length} shipped, ` +
            `${testItems.length} diagnostic (${testItems.map((/** @type {any} */ s) => s.id).join(', ') || 'none'}).`,
    );
    note(`${ABILITIES.length} ability definition(s): ${[...abilityIds].join(', ')}.`);

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

// ---------------------------------------------------------------------------
// 5. Architecture rules
// ---------------------------------------------------------------------------

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

    // --- the guide book's recipe ---
    const guideRecipe = readJson(path.join(PATHS.bpRecipes, 'guide', 'guide_book.recipe.json'));
    const shapeless = guideRecipe?.['minecraft:recipe_shapeless'];
    if (shapeless === undefined) {
        error("recipes/guide/guide_book.recipe.json: missing or not shapeless. Run 'npm run generate'.");
    } else {
        for (const ingredient of shapeless.ingredients ?? []) {
            ingredientsChecked += 1;
            if (!vanillaItems.has(ingredient.item)) error(`guide book recipe: '${ingredient.item}' is not a vanilla item.`);
        }
        if (shapeless.result?.item !== GUIDE_ITEM_ID) error(`guide book recipe: result must be '${GUIDE_ITEM_ID}'.`);
        if (!(shapeless.tags ?? []).includes('crafting_table')) error("guide book recipe: missing the 'crafting_table' tag.");
    }

    note(`${swords.length} recipe(s), ${ingredientsChecked} ingredient/repair item(s) verified against ${vanillaItems.size} vanilla items.`);
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
    validateUniqueness(swords);
    validateRecipes(swords);
    validateItemsAndResources(swords);
    validateTextures(swords);
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
