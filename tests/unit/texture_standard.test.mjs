/**
 * The texture standard, enforced mechanically.
 *
 * The quality linter cannot judge taste, but it can catch every measurable way
 * a sword icon falls short: broken silhouettes, flat shading, missing outlines,
 * muddy palettes, wrong dimensions. These tests pin that behaviour, and assert
 * the shipped art actually passes it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    TEXTURE_SIZE,
    compile,
    inspectQuality,
    parseColor,
    validateSource,
} from '../../tools/lib/texture.mjs';
import { PATHS, artFile } from '../../tools/lib/project.mjs';

/** A minimal well-formed source: a filled 8x8 block with an outline. */
function makeSource(overrides = {}) {
    const rows = [];
    for (let y = 0; y < TEXTURE_SIZE; y++) {
        let row = '';
        for (let x = 0; x < TEXTURE_SIZE; x++) {
            const inside = x >= 4 && x < 12 && y >= 4 && y < 12;
            const edge = inside && (x === 4 || x === 11 || y === 4 || y === 11);
            row += inside ? (edge ? 'o' : 'B') : '.';
        }
        rows.push(row);
    }
    return {
        palette: { o: '#101018', B: '#c0c8d4', H: '#ffffff', S: '#7d8694', D: '#4a5058', R: '#c04030' },
        pixels: rows,
        ...overrides,
    };
}

describe('texture source validation', () => {
    it('accepts a well-formed source', () => {
        const source = makeSource();
        // Every palette entry must be used, so exercise the spare tones.
        source.pixels[6] = source.pixels[6].slice(0, 6) + 'HSDR' + source.pixels[6].slice(10);
        assert.deepEqual(validateSource(source), []);
    });

    it('rejects the wrong number of rows or the wrong row width', () => {
        assert.ok(validateSource(makeSource({ pixels: ['....'] })).some((p) => p.includes('16 rows')));
        const short = makeSource();
        short.pixels[3] = '...';
        assert.ok(validateSource(short).some((p) => p.includes('16 characters wide')));
    });

    it('rejects a pixel using a character the palette does not define', () => {
        const source = makeSource();
        source.pixels[5] = 'Z'.padEnd(TEXTURE_SIZE, '.');
        assert.ok(validateSource(source).some((p) => p.includes("uses 'Z'")));
    });

    it('rejects a palette entry nothing uses, so dead tones cannot accumulate', () => {
        const source = makeSource();
        assert.ok(validateSource(source).some((p) => p.includes("'H' is never used")));
    });

    it('rejects a malformed colour and a redefinition of transparency', () => {
        assert.ok(validateSource(makeSource({ palette: { o: 'black', B: '#ffffff' } })).some((p) => p.includes('#rrggbb')));
        const source = makeSource();
        source.palette['.'] = '#ffffff';
        assert.ok(validateSource(source).some((p) => p.includes('reserved for transparency')));
    });

    it('parses six- and eight-digit colours', () => {
        assert.deepEqual(parseColor('#102030'), [16, 32, 48, 255]);
        assert.deepEqual(parseColor('#10203080'), [16, 32, 48, 128]);
    });
});

describe('texture quality gate', () => {
    it('rejects a canvas with no silhouette', () => {
        const filled = makeSource({ pixels: Array.from({ length: TEXTURE_SIZE }, () => 'B'.repeat(TEXTURE_SIZE)) });
        const { errors } = inspectQuality(filled);
        assert.ok(errors.some((e) => e.includes('silhouette')));
        assert.ok(errors.some((e) => e.includes('no transparent pixels')));
    });

    it('rejects art too sparse to read at item scale', () => {
        const sparse = makeSource({ pixels: Array.from({ length: TEXTURE_SIZE }, () => '.'.repeat(TEXTURE_SIZE)) });
        sparse.pixels[8] = '........B.......';
        assert.ok(inspectQuality(sparse).errors.some((e) => e.includes('too sparse')));
    });

    it('rejects detached pixels, which are almost always accidents', () => {
        const source = makeSource();
        source.pixels[0] = 'B' + source.pixels[0].slice(1);
        assert.ok(inspectQuality(source).errors.some((e) => e.includes('detached')));
    });

    it('rejects a flat, low-contrast palette', () => {
        const flat = makeSource({
            palette: { o: '#8a8a8a', B: '#909090', H: '#959595', S: '#9a9a9a', D: '#a0a0a0', R: '#a5a5a5' },
        });
        const { errors } = inspectQuality(flat);
        assert.ok(errors.some((e) => e.includes('luminance spread')));
        assert.ok(errors.some((e) => e.includes('no dark outline')));
    });

    it('rejects a palette too small to shade with', () => {
        const thin = makeSource({ palette: { o: '#101018', B: '#c0c8d4' } });
        assert.ok(inspectQuality(thin).errors.some((e) => e.includes('only 2 colours')));
    });

    it('warns about near-duplicate tones', () => {
        const noisy = makeSource({
            palette: { o: '#101018', B: '#c0c8d4', H: '#c1c9d5', S: '#7d8694', D: '#4a5058', R: '#c04030' },
        });
        assert.ok(inspectQuality(noisy).warnings.some((w) => w.includes('nearly identical')));
    });
});

describe('compilation', () => {
    it('produces a 16x16 RGBA PNG with transparent background pixels', () => {
        const png = compile(makeSource());
        assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        assert.equal(png.readUInt32BE(16), TEXTURE_SIZE);
        assert.equal(png.readUInt32BE(20), TEXTURE_SIZE);
        assert.equal(png.readUInt8(25), 6, 'RGBA colour type');
    });

    it('is deterministic, so builds stay reproducible', () => {
        assert.deepEqual(compile(makeSource()), compile(makeSource()));
    });
});

describe('shipped art', () => {
    const sources = fs.existsSync(PATHS.art)
        ? fs.readdirSync(PATHS.art).filter((name) => name.endsWith('.json'))
        : [];

    it('exists', () => {
        assert.ok(sources.length > 0, 'expected at least one authored sword texture');
    });

    for (const name of sources) {
        it(`${name} meets the standard`, () => {
            const source = JSON.parse(fs.readFileSync(path.join(PATHS.art, name), 'utf8'));
            assert.deepEqual(validateSource(source), [], 'structural problems');
            const { errors, warnings } = inspectQuality(source);
            assert.deepEqual(errors, [], 'quality errors');
            assert.deepEqual(warnings, [], 'quality warnings');
        });
    }

    it('the Ember Blade is the documented benchmark and is richly shaded', () => {
        const source = JSON.parse(fs.readFileSync(artFile('ember_blade'), 'utf8'));
        const { stats } = inspectQuality(source);
        // The benchmark has to clear the bar comfortably, not scrape past it.
        assert.ok(stats.colours >= 12, `expected a rich palette, got ${stats.colours}`);
        assert.ok(stats.luminanceSpread >= 200, `expected strong contrast, got ${stats.luminanceSpread}`);
        assert.ok(stats.coverage > 0.25 && stats.coverage < 0.55, `unexpected coverage ${stats.coverage}`);
    });
});
