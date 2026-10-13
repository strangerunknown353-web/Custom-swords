/**
 * Sword texture sources: parse, validate, render and quality-check.
 *
 * Textures are authored as JSON pixel-art sources under `art/swords/` — a
 * palette plus a character grid — and compiled to PNG by `tools/generate.mjs`.
 * Storing art as text rather than as opaque binary means it diffs in git, can
 * be reviewed line by line, and can be checked automatically against the
 * project's quality bar. The compiled PNG is what ships; the source is what a
 * human edits.
 *
 * See docs/TEXTURE_STANDARD.md for the artistic rules this enforces
 * mechanically.
 */

import { encodePng } from './png.mjs';

/** Every sword icon is 32x32 — double the vanilla item resolution, for detail (v2.0). */
export const TEXTURE_SIZE = 32;

/** The character reserved for a transparent pixel. */
export const TRANSPARENT = '.';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/**
 * @typedef {Object} TextureSource
 * @property {Record<string, string>} palette Character -> `#rrggbb` or `#rrggbbaa`.
 * @property {string[]} pixels One string per row, each `TEXTURE_SIZE` characters.
 * @property {string} [name]
 * @property {string} [description]
 */

/**
 * @param {string} hex
 * @returns {[number, number, number, number]}
 */
export function parseColor(hex) {
    const body = hex.slice(1);
    const value = (from, to) => Number.parseInt(body.slice(from, to), 16);
    return [value(0, 2), value(2, 4), value(4, 6), body.length === 8 ? value(6, 8) : 255];
}

/**
 * Structural validation. Anything that would produce a broken or unloadable
 * texture is an error here rather than a surprise in game.
 *
 * @param {TextureSource} source
 * @returns {string[]} Problems; empty means the source is well-formed.
 */
export function validateSource(source) {
    /** @type {string[]} */
    const problems = [];

    if (typeof source !== 'object' || source === null) return ['texture source must be an object.'];
    if (!Array.isArray(source.pixels)) return ["'pixels' must be an array of row strings."];
    if (typeof source.palette !== 'object' || source.palette === null) {
        return ["'palette' must be an object mapping characters to colours."];
    }

    if (source.pixels.length !== TEXTURE_SIZE) {
        problems.push(`'pixels' must have exactly ${TEXTURE_SIZE} rows (found ${source.pixels.length}).`);
    }
    source.pixels.forEach((row, y) => {
        if (typeof row !== 'string') {
            problems.push(`row ${y} must be a string.`);
        } else if (row.length !== TEXTURE_SIZE) {
            problems.push(`row ${y} must be ${TEXTURE_SIZE} characters wide (found ${row.length}).`);
        }
    });

    for (const [key, value] of Object.entries(source.palette)) {
        if (key.length !== 1) {
            problems.push(`palette key '${key}' must be a single character.`);
        }
        if (key === TRANSPARENT) {
            problems.push(`palette must not define '${TRANSPARENT}', which is reserved for transparency.`);
        }
        if (typeof value !== 'string' || !HEX_PATTERN.test(value)) {
            problems.push(`palette entry '${key}' must be #rrggbb or #rrggbbaa (found ${JSON.stringify(value)}).`);
        }
    }

    const used = new Set();
    source.pixels.forEach((row, y) => {
        if (typeof row !== 'string') return;
        for (const [x, ch] of [...row].entries()) {
            if (ch === TRANSPARENT) continue;
            if (!Object.hasOwn(source.palette, ch)) {
                problems.push(`pixel (${x}, ${y}) uses '${ch}', which is not in the palette.`);
            }
            used.add(ch);
        }
    });
    for (const key of Object.keys(source.palette)) {
        if (!used.has(key)) problems.push(`palette entry '${key}' is never used.`);
    }

    return problems;
}

/**
 * @param {TextureSource} source
 * @returns {Uint8Array} RGBA pixel data, row-major.
 */
export function renderPixels(source) {
    const rgba = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
    for (let y = 0; y < TEXTURE_SIZE; y++) {
        const row = source.pixels[y];
        for (let x = 0; x < TEXTURE_SIZE; x++) {
            const ch = row[x];
            if (ch === TRANSPARENT) continue;
            const [r, g, b, a] = parseColor(source.palette[ch]);
            const i = (y * TEXTURE_SIZE + x) * 4;
            rgba[i] = r;
            rgba[i + 1] = g;
            rgba[i + 2] = b;
            rgba[i + 3] = a;
        }
    }
    return rgba;
}

/**
 * @param {TextureSource} source
 * @returns {Buffer} A TEXTURE_SIZE x TEXTURE_SIZE RGBA PNG.
 */
export function compile(source) {
    return encodePng(TEXTURE_SIZE, TEXTURE_SIZE, renderPixels(source));
}

/**
 * Perceptual luminance, 0..255.
 *
 * @param {[number, number, number, number]} colour
 * @returns {number}
 */
function luminance([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The project's automated quality bar.
 *
 * These are the parts of "does this texture look professional?" that can be
 * checked objectively: silhouette, contrast, palette discipline, readability.
 * Taste still has to be applied by a human looking at the render — this only
 * catches the failures that are measurable.
 *
 * @param {TextureSource} source
 * @returns {{ errors: string[], warnings: string[], stats: Record<string, number> }}
 */
export function inspectQuality(source) {
    /** @type {string[]} */
    const errors = [];
    /** @type {string[]} */
    const warnings = [];

    /** @type {{x: number, y: number, ch: string}[]} */
    const opaque = [];
    for (let y = 0; y < TEXTURE_SIZE; y++) {
        for (let x = 0; x < TEXTURE_SIZE; x++) {
            const ch = source.pixels[y]?.[x];
            if (ch !== undefined && ch !== TRANSPARENT) opaque.push({ x, y, ch });
        }
    }

    const total = TEXTURE_SIZE * TEXTURE_SIZE;
    const coverage = opaque.length / total;

    // An item icon that fills the whole canvas has no silhouette; one that
    // barely covers it is unreadable in a hotbar slot.
    if (coverage > 0.75) {
        errors.push(`covers ${(coverage * 100).toFixed(0)}% of the canvas — an item icon needs a silhouette, not a filled square.`);
    }
    if (coverage < 0.15) {
        errors.push(`covers only ${(coverage * 100).toFixed(0)}% of the canvas — too sparse to read at item scale.`);
    }

    // Broken pixels: a detached island is almost always an accident.
    const key = (x, y) => `${x},${y}`;
    const opaqueSet = new Set(opaque.map((p) => key(p.x, p.y)));
    if (opaque.length > 0) {
        const seen = new Set([key(opaque[0].x, opaque[0].y)]);
        const queue = [opaque[0]];
        while (queue.length > 0) {
            const { x, y } = queue.pop();
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const k = key(x + dx, y + dy);
                    if (opaqueSet.has(k) && !seen.has(k)) {
                        seen.add(k);
                        queue.push({ x: x + dx, y: y + dy });
                    }
                }
            }
        }
        if (seen.size !== opaque.length) {
            errors.push(`silhouette is broken into ${opaque.length - seen.size} detached pixel(s) — check for stray or orphaned pixels.`);
        }
    }

    // Tonal range: a flat two-tone icon looks unfinished.
    const colours = Object.values(source.palette).map(parseColor);
    const luminances = colours.map(luminance);
    const spread = Math.max(...luminances) - Math.min(...luminances);
    if (colours.length < 6) {
        errors.push(`palette has only ${colours.length} colours — a shaded icon needs highlight, mid, shadow and outline tones at minimum.`);
    }
    if (spread < 120) {
        errors.push(`luminance spread is only ${spread.toFixed(0)} — the icon will look flat and low-contrast.`);
    }

    // A dark outline is what makes an item readable against any background.
    const darkest = Math.min(...luminances);
    if (darkest > 60) {
        errors.push(`darkest colour has luminance ${darkest.toFixed(0)} — the icon has no dark outline and will smear into bright backgrounds.`);
    }

    // Near-duplicate colours read as noise and bloat the palette.
    for (let i = 0; i < colours.length; i++) {
        for (let j = i + 1; j < colours.length; j++) {
            const distance =
                Math.abs(colours[i][0] - colours[j][0]) +
                Math.abs(colours[i][1] - colours[j][1]) +
                Math.abs(colours[i][2] - colours[j][2]);
            if (distance < 12) {
                const keys = Object.keys(source.palette);
                warnings.push(`palette entries '${keys[i]}' and '${keys[j]}' are nearly identical — merge them or push them apart.`);
            }
        }
    }

    // Transparency must actually be present, or the icon is a square tile.
    if (opaque.length === total) {
        errors.push('texture has no transparent pixels at all.');
    }

    return {
        errors,
        warnings,
        stats: {
            coverage: Number(coverage.toFixed(3)),
            colours: colours.length,
            luminanceSpread: Number(spread.toFixed(0)),
            opaquePixels: opaque.length,
        },
    };
}
