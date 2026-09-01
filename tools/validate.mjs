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

import { PATHS, MODULES, artFile, resourceFile } from './lib/project.mjs';
import { inspectQuality, validateSource } from './lib/texture.mjs';

const { NAMESPACE, SWORD_COMPONENT_ID, SWORD_ITEM_TAG, localNameOf, namespaceOf, nameKey, swordTexturePath } =
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
            if (!fs.existsSync(resourceFile(declared))) {
                error(`${relative}: texture '${declared}.png' does not exist in the resource pack.`);
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

async function main() {
    validateManifests();
    validateAllJson();
    const swords = await validateDefinitions();
    validateItemsAndResources(swords);
    validateTextures(swords);
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
