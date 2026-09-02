#!/usr/bin/env node
/**
 * Single-command version bump.
 *
 * A Bedrock add-on carries the same version number in six places (package.json,
 * two manifest headers, three module entries, the behaviour pack's dependency
 * on the resource pack, and the framework's own CONFIG.version). Bumping them
 * by hand is how packs end up refusing to update in-game, so this does all of
 * them at once and `tools/validate.mjs` fails the build if they ever diverge.
 *
 * Usage: npm run version:set -- 0.2.0
 */

import fs from 'node:fs';

import { PATHS, toJson } from './lib/project.mjs';

const version = process.argv[2];

if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('set-version: expected a semantic version, e.g. `npm run version:set -- 0.2.0`.');
    process.exit(1);
}

const triple = version.split('.').map(Number);

// package.json
const pkg = JSON.parse(fs.readFileSync(PATHS.packageJson, 'utf8'));
const previous = pkg.version;
pkg.version = version;
fs.writeFileSync(PATHS.packageJson, toJson(pkg));

// Both manifests: header, every module, and the BP -> RP dependency.
const rpManifest = JSON.parse(fs.readFileSync(PATHS.rpManifest, 'utf8'));
const rpUuid = rpManifest.header.uuid;

for (const manifestPath of [PATHS.bpManifest, PATHS.rpManifest]) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.header.version = triple;
    for (const module of manifest.modules ?? []) {
        module.version = triple;
    }
    for (const dependency of manifest.dependencies ?? []) {
        if (dependency.uuid === rpUuid) dependency.version = triple;
    }
    fs.writeFileSync(manifestPath, toJson(manifest));
}

// The framework's own CONFIG.version, used in the world-load banner.
const configPath = `${PATHS.bpScripts}/config.js`;
const config = fs.readFileSync(configPath, 'utf8');
const versionPattern = /(version:\s*')[\d.]+(')/;
if (!versionPattern.test(config)) {
    // Compare against the pattern, not against the rewritten text: re-running
    // with the current version is a legitimate no-op, not a failure.
    console.error(`set-version: could not find CONFIG.version in ${configPath}.`);
    process.exit(1);
}
fs.writeFileSync(configPath, config.replace(versionPattern, `$1${version}$2`));

// The README names the built artefacts by filename, and those names carry the
// version. They had drifted three milestones behind by the time anyone looked,
// which is the ordinary fate of a version number written down somewhere the
// bump script does not reach.
const readme = fs.readFileSync(PATHS.readme, 'utf8');
const rewritten = readme.replace(/CustomSwords(BP|RP)?-v\d+\.\d+\.\d+\.mc(addon|pack)/g, (match) =>
    match.replace(/v\d+\.\d+\.\d+/, `v${version}`),
);
if (rewritten !== readme) fs.writeFileSync(PATHS.readme, rewritten);

console.log(`set-version: ${previous} -> ${version} (package.json, both manifests, config.js, README.md).`);
console.log('set-version: remember to add a CHANGELOG.md entry, then run `npm run all`.');
