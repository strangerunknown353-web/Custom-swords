#!/usr/bin/env node
/**
 * Content generator: sword definitions -> pack files.
 *
 * `packs/CustomSwordsBP/scripts/swords/*.js` is the single source of truth for
 * every sword. This script derives from it:
 *
 *   - packs/CustomSwordsBP/items/<name>.item.json     (item definition)
 *   - packs/CustomSwordsRP/textures/item_texture.json (texture atlas entries)
 *   - packs/CustomSwordsRP/texts/en_US.lang           (display names + descriptions)
 *   - packs/CustomSwordsBP/texts/en_US.lang           (pack name/description)
 *   - placeholder icons for any sword that has no art yet
 *
 * Why generate rather than hand-write: with 20-25 swords, hand-maintained item
 * JSON drifts from the script definitions, and drift shows up as a sword whose
 * tooltip promises 9 damage while the game deals 6. Generating removes that
 * failure mode entirely, and makes adding sword #26 a one-file change.
 *
 * Identifier, rarity, texture-path and repair-amount rules are imported from
 * the framework itself, so the generator cannot disagree with the runtime.
 *
 * The generator is idempotent and prunes item JSON for swords that no longer
 * exist, tracked via `items/.generated.json`.
 *
 * Usage: node tools/generate.mjs [--check]
 *   --check  Fail (exit 1) instead of writing, if anything would change.
 */

import fs from 'node:fs';
import path from 'node:path';

import { PATHS, MODULES, ITEM_FORMAT_VERSION, artFile, resourceFile, toJson } from './lib/project.mjs';
import { placeholderSwordIcon, placeholderPackIcon } from './lib/png.mjs';
import { compile as compileTexture, validateSource } from './lib/texture.mjs';

const CHECK_ONLY = process.argv.includes('--check');

const {
    SWORD_COMPONENT_ID,
    SWORD_ITEM_TAG,
    CREATIVE_CATEGORY,
    CREATIVE_GROUP,
    localNameOf,
    nameKey,
    legacyNameKey,
    descriptionKey,
    swordTexturePath,
} = await import(
    MODULES.identifiers
);
const { colorize, requireRarity } = await import(MODULES.rarity);
const { repairAmountFor } = await import(MODULES.swordStats);

/** @type {{ path: string, reason: string }[]} */
const changes = [];

/**
 * Writes a file only when the content actually differs, so repeated runs leave
 * mtimes (and git) alone.
 *
 * @param {string} filePath
 * @param {string | Buffer} content
 */
function writeIfChanged(filePath, content) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    if (fs.existsSync(filePath)) {
        if (fs.readFileSync(filePath).equals(buffer)) return;
        changes.push({ path: path.relative(PATHS.root, filePath), reason: 'updated' });
    } else {
        changes.push({ path: path.relative(PATHS.root, filePath), reason: 'created' });
    }
    if (CHECK_ONLY) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
}

/** @param {string} filePath */
function removeIfPresent(filePath) {
    if (!fs.existsSync(filePath)) return;
    changes.push({ path: path.relative(PATHS.root, filePath), reason: 'removed' });
    if (CHECK_ONLY) return;
    fs.rmSync(filePath);
}

/**
 * @param {any} sword
 * @returns {string} The resource-pack texture shortname for a sword.
 */
function textureNameOf(sword) {
    return sword.texture ?? localNameOf(sword.id);
}

/**
 * Builds the behaviour-pack item definition for one sword.
 *
 * Every component emitted here was verified against the Creator reference for
 * item format_version 1.21.90 — see docs/API_NOTES.md.
 *
 * @param {any} sword
 * @returns {object}
 */
function buildItemJson(sword) {
    const stats = sword.item;

    /** @type {Record<string, unknown>} */
    const components = {
        'minecraft:max_stack_size': 1,
        'minecraft:icon': { textures: { default: textureNameOf(sword) } },
        'minecraft:display_name': { value: nameKey(sword.id) },
        'minecraft:hand_equipped': true,
        'minecraft:damage': { value: stats.attackDamage },
        'minecraft:durability': { max_durability: stats.durability },
    };

    if (stats.enchantValue !== undefined) {
        components['minecraft:enchantable'] = { slot: 'sword', value: stats.enchantValue };
    }
    if (stats.repairItems !== undefined && stats.repairItems.length > 0) {
        components['minecraft:repairable'] = {
            repair_items: [{ items: stats.repairItems, repair_amount: repairAmountFor(stats.durability) }],
        };
    }
    if (stats.glint === true) {
        components['minecraft:glint'] = true;
    }

    components['minecraft:tags'] = {
        // `minecraft:is_sword` makes vanilla systems treat it as a sword;
        // our own tag lets future recipes and filters select the collection.
        tags: ['minecraft:is_sword', SWORD_ITEM_TAG, ...(sword.tags ?? [])],
    };

    // The framework's single input hook. Flattened namespaced component
    // (Custom Components V2); `minecraft:custom_components` is deprecated.
    components[SWORD_COMPONENT_ID] = {};

    return {
        format_version: ITEM_FORMAT_VERSION,
        'minecraft:item': {
            description: {
                identifier: sword.id,
                menu_category: { category: CREATIVE_CATEGORY, group: CREATIVE_GROUP },
            },
            components,
        },
    };
}

/**
 * @param {readonly any[]} swords
 * @returns {object}
 */
function buildItemTextureJson(swords) {
    /** @type {Record<string, { textures: string }>} */
    const textureData = {};
    for (const sword of swords) {
        const shortname = textureNameOf(sword);
        textureData[shortname] = { textures: swordTexturePath(shortname) };
    }
    return {
        resource_pack_name: 'custom_swords',
        texture_name: 'atlas.items',
        texture_data: textureData,
    };
}

/**
 * @param {readonly any[]} swords
 * @returns {string}
 */
function buildResourceLang(swords) {
    const lines = [
        '## Custom Swords - generated by tools/generate.mjs. Do not edit by hand.',
        '',
        'pack.name=Custom Swords',
        'pack.description=Custom Swords - resources (textures and text).',
        '',
    ];
    for (const sword of swords) {
        const tier = requireRarity(sword.rarity);
        lines.push(`## ${sword.id} - ${tier.label}`);
        // Rarity is expressed as a section colour code on the name itself, which
        // colours it in the hotbar, the inventory and the hover tooltip alike.
        // Two name keys on purpose. `nameKey` is the key Minecraft generates for
        // a namespaced custom item (`item.<id>`, no suffix) and is the one that
        // actually resolves; `legacyNameKey` is the vanilla-style
        // `item.<id>.name`, emitted as a hedge. Shipping only the latter is the
        // v0.5.0 bug that put the raw identifier in every tooltip.
        const displayName = colorize(sword.rarity, sword.name);
        lines.push(`${nameKey(sword.id)}=${displayName}`);
        lines.push(`${legacyNameKey(sword.id)}=${displayName}`);
        lines.push(`${descriptionKey(sword.id)}=${sword.description}`);
        lines.push('');
    }
    return lines.join('\n');
}

/** @returns {string} */
function buildBehaviourLang() {
    return [
        '## Custom Swords - generated by tools/generate.mjs. Do not edit by hand.',
        '',
        'pack.name=Custom Swords',
        'pack.description=Custom Swords - behaviour and scripting.',
        '',
    ].join('\n');
}

async function main() {
    const { SWORDS } = await import(MODULES.swords);

    // --- Behaviour pack item definitions -------------------------------------
    /** @type {string[]} */
    const generatedItemFiles = [];
    for (const sword of SWORDS) {
        const fileName = `${localNameOf(sword.id)}.item.json`;
        generatedItemFiles.push(fileName);
        writeIfChanged(path.join(PATHS.bpItems, fileName), toJson(buildItemJson(sword)));
    }

    // Prune item JSON left behind by swords that were renamed or removed.
    const previous = fs.existsSync(PATHS.generatedManifest)
        ? (JSON.parse(fs.readFileSync(PATHS.generatedManifest, 'utf8')).items ?? [])
        : [];
    for (const stale of previous) {
        if (!generatedItemFiles.includes(stale)) {
            removeIfPresent(path.join(PATHS.bpItems, stale));
        }
    }
    writeIfChanged(
        PATHS.generatedManifest,
        toJson({
            note: 'Written by tools/generate.mjs so stale generated files can be pruned. Not read by Minecraft.',
            items: generatedItemFiles.sort(),
        }),
    );

    // --- Resource pack --------------------------------------------------------
    writeIfChanged(PATHS.itemTextureJson, toJson(buildItemTextureJson(SWORDS)));
    writeIfChanged(path.join(PATHS.rpTexts, 'en_US.lang'), buildResourceLang(SWORDS));
    writeIfChanged(path.join(PATHS.rpTexts, 'languages.json'), toJson(['en_US']));
    writeIfChanged(path.join(PATHS.bpTexts, 'en_US.lang'), buildBehaviourLang());
    writeIfChanged(path.join(PATHS.bpTexts, 'languages.json'), toJson(['en_US']));

    // --- Sword icons ----------------------------------------------------------
    // Compiled from the hand-authored sources in `art/swords/`. A sword with no
    // source still gets a placeholder so the pack loads and iteration is not
    // blocked, but `tools/validate.mjs` fails the build until real art exists —
    // see the texture standard in docs/TEXTURE_STANDARD.md.
    for (const sword of SWORDS) {
        const shortname = textureNameOf(sword);
        const target = resourceFile(swordTexturePath(shortname));
        const source = artFile(shortname);

        if (!fs.existsSync(source)) {
            if (!fs.existsSync(target)) {
                writeIfChanged(target, placeholderSwordIcon({ seed: sword.id }));
            }
            continue;
        }

        const spec = JSON.parse(fs.readFileSync(source, 'utf8'));
        const problems = validateSource(spec);
        if (problems.length > 0) {
            console.error(`generate: ${path.relative(PATHS.root, source)} is malformed:`);
            for (const problem of problems) console.error(`  - ${problem}`);
            process.exitCode = 1;
            continue;
        }
        writeIfChanged(target, compileTexture(spec));
    }
    for (const [dir, seed] of [
        [PATHS.bp, 'custom_swords_behaviour'],
        [PATHS.rp, 'custom_swords_resources'],
    ]) {
        const icon = path.join(dir, 'pack_icon.png');
        if (!fs.existsSync(icon)) {
            writeIfChanged(icon, placeholderPackIcon({ seed }));
        }
    }

    // --- Report ---------------------------------------------------------------
    if (changes.length === 0) {
        console.log(
            `generate: up to date (${SWORDS.length} sword definition(s), format_version ${ITEM_FORMAT_VERSION}).`,
        );
        return;
    }
    for (const change of changes) {
        console.log(`generate: ${change.reason.padEnd(7)} ${change.path}`);
    }
    if (CHECK_ONLY) {
        console.error(`generate --check: ${changes.length} file(s) are out of date. Run 'npm run generate'.`);
        process.exitCode = 1;
        return;
    }
    console.log(`generate: wrote ${changes.length} file(s) for ${SWORDS.length} sword(s).`);
}

main().catch((error) => {
    console.error('generate: failed —', error);
    process.exitCode = 1;
});
