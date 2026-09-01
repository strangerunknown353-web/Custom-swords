#!/usr/bin/env node
/**
 * Packages the behaviour and resource packs into a `.mcaddon`.
 *
 * Output (in `dist/`):
 *   CustomSwords-v<version>.mcaddon   both packs, one-click import
 *   CustomSwordsBP-v<version>.mcpack  behaviour pack alone
 *   CustomSwordsRP-v<version>.mcpack  resource pack alone
 *
 * A `.mcaddon` is a ZIP whose top level contains one folder per pack, each with
 * its own `manifest.json`. Files Minecraft never reads (`.generated.json`) and
 * OS cruft are excluded.
 *
 * Usage: node tools/build.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

import { PATHS } from './lib/project.mjs';
import { createZip } from './lib/zip.mjs';

/** Files that must never end up inside a shipped pack. */
const EXCLUDED_NAMES = new Set(['.DS_Store', 'Thumbs.db', '.generated.json']);

/**
 * @param {string} directory
 * @param {string} prefix Path prefix inside the archive.
 * @returns {import('./lib/zip.mjs').ZipEntry[]}
 */
function collect(directory, prefix) {
    /** @type {import('./lib/zip.mjs').ZipEntry[]} */
    const entries = [];
    /** @param {string} current @param {string} relative */
    const walk = (current, relative) => {
        for (const name of fs.readdirSync(current).sort()) {
            if (EXCLUDED_NAMES.has(name)) continue;
            const absolute = path.join(current, name);
            const archiveName = relative === '' ? name : `${relative}/${name}`;
            const stat = fs.statSync(absolute);
            if (stat.isDirectory()) {
                walk(absolute, archiveName);
            } else if (stat.isFile()) {
                entries.push({ name: `${prefix}${archiveName}`, data: fs.readFileSync(absolute) });
            }
        }
    };
    walk(directory, '');
    return entries;
}

/**
 * @param {string} filePath
 * @param {import('./lib/zip.mjs').ZipEntry[]} entries
 */
function writeArchive(filePath, entries) {
    const buffer = createZip(entries);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    const kilobytes = (buffer.length / 1024).toFixed(1);
    console.log(`build: ${path.relative(PATHS.root, filePath)}  (${entries.length} files, ${kilobytes} KiB)`);
}

function main() {
    const { version } = JSON.parse(fs.readFileSync(PATHS.packageJson, 'utf8'));

    for (const packPath of [PATHS.bp, PATHS.rp]) {
        if (!fs.existsSync(path.join(packPath, 'manifest.json'))) {
            throw new Error(`Missing manifest in ${packPath}. Run 'npm run generate' first.`);
        }
    }

    const bpEntries = collect(PATHS.bp, 'CustomSwordsBP/');
    const rpEntries = collect(PATHS.rp, 'CustomSwordsRP/');

    fs.rmSync(PATHS.dist, { recursive: true, force: true });

    writeArchive(path.join(PATHS.dist, `CustomSwords-v${version}.mcaddon`), [...bpEntries, ...rpEntries]);
    writeArchive(
        path.join(PATHS.dist, `CustomSwordsBP-v${version}.mcpack`),
        bpEntries.map((entry) => ({ ...entry, name: entry.name.replace(/^CustomSwordsBP\//, '') })),
    );
    writeArchive(
        path.join(PATHS.dist, `CustomSwordsRP-v${version}.mcpack`),
        rpEntries.map((entry) => ({ ...entry, name: entry.name.replace(/^CustomSwordsRP\//, '') })),
    );
}

try {
    main();
} catch (error) {
    console.error('build: failed —', error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
