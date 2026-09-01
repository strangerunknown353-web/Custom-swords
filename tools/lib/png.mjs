/**
 * A tiny dependency-free PNG encoder.
 *
 * The project deliberately has zero npm dependencies so that `npm run all`
 * works on a clean machine with nothing but Node installed. That makes an
 * image library unavailable, so we write the 40 lines of PNG ourselves.
 *
 * Only what we need: 8-bit RGBA, non-interlaced, single IDAT.
 */

import { deflateSync, inflateSync } from 'node:zlib';

import { crc32 } from './crc32.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {string} type Four ASCII characters.
 * @param {Buffer} data
 * @returns {Buffer}
 */
function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([length, typeAndData, crc]);
}

/**
 * Encodes raw RGBA pixels into a PNG buffer.
 *
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba Length must be width * height * 4.
 * @returns {Buffer}
 */
export function encodePng(width, height, rgba) {
    if (rgba.length !== width * height * 4) {
        throw new Error(`encodePng: expected ${width * height * 4} bytes, received ${rgba.length}.`);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(8, 8); // bit depth
    ihdr.writeUInt8(6, 9); // colour type 6 = RGBA
    ihdr.writeUInt8(0, 10); // compression
    ihdr.writeUInt8(0, 11); // filter
    ihdr.writeUInt8(0, 12); // interlace

    // One filter byte (0 = None) per scanline.
    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        const rowStart = y * (1 + width * 4);
        raw[rowStart] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, rowStart + 1);
    }

    return Buffer.concat([
        PNG_SIGNATURE,
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/**
 * 16x16 placeholder sword stencil.
 *
 * Written as a character mask rather than procedural geometry so the shape is
 * obvious at a glance and easy to tweak. Legend:
 *   `.` transparent   `b` blade body   `B` blade highlight   `e` blade shadow
 *   `g` cross guard   `h` grip         `p` pommel
 */
const SWORD_MASK = [
    '..............bB',
    '.............bBe',
    '............bBe.',
    '...........bBe..',
    '..........bBe...',
    '.........bBe....',
    '........bBe.....',
    '.......bBe......',
    '......bBe.......',
    '..g..bBe........',
    '..gggBe.........',
    '.hhgggg.........',
    '.hhhg...........',
    'phhh............',
    'pph.............',
    'pp..............',
];

/**
 * Draws a placeholder sword icon.
 *
 * Placeholder art is generated rather than committed as binary blobs so the
 * repository stays diffable, and so every new sword gets a distinct, visually
 * identifiable icon before an artist replaces it. The hue is derived from the
 * sword id, so the same sword always renders the same colour.
 *
 * @param {object} options
 * @param {string} options.seed Any string; the id of the sword.
 * @returns {Buffer}
 */
export function placeholderSwordIcon({ seed }) {
    const size = SWORD_MASK.length;
    const rgba = new Uint8Array(size * size * 4);
    const hue = hashToUnit(seed);

    /** @type {Record<string, [number, number, number]>} */
    const palette = {
        b: hslToRgb(hue, 0.12, 0.78),
        B: hslToRgb(hue, 0.08, 0.94),
        e: hslToRgb(hue, 0.18, 0.55),
        g: hslToRgb(hue, 0.65, 0.48),
        h: hslToRgb((hue + 0.5) % 1, 0.4, 0.3),
        p: hslToRgb(hue, 0.7, 0.62),
    };

    for (let y = 0; y < size; y++) {
        const row = SWORD_MASK[y];
        for (let x = 0; x < size; x++) {
            const colour = palette[row[x]];
            if (colour === undefined) continue; // '.' stays fully transparent
            const i = (y * size + x) * 4;
            rgba[i] = colour[0];
            rgba[i + 1] = colour[1];
            rgba[i + 2] = colour[2];
            rgba[i + 3] = 255;
        }
    }
    return encodePng(size, size, rgba);
}

/**
 * Solid-colour pack icon with a diagonal accent, used for `pack_icon.png`.
 *
 * @param {object} options
 * @param {number} [options.size]
 * @param {string} options.seed
 * @returns {Buffer}
 */
export function placeholderPackIcon({ size = 128, seed }) {
    const rgba = new Uint8Array(size * size * 4);
    const hue = hashToUnit(seed);
    const background = hslToRgb(hue, 0.45, 0.22);
    const accent = hslToRgb(hue, 0.6, 0.62);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const onStripe = Math.abs(x - (size - 1 - y)) < size * 0.09;
            const colour = onStripe ? accent : background;
            const i = (y * size + x) * 4;
            rgba[i] = colour[0];
            rgba[i + 1] = colour[1];
            rgba[i + 2] = colour[2];
            rgba[i + 3] = 255;
        }
    }
    return encodePng(size, size, rgba);
}

/**
 * Deterministic string -> [0, 1) hash (FNV-1a). Same input, same colour.
 *
 * @param {string} value
 * @returns {number}
 */
function hashToUnit(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash / 0xffffffff;
}

/**
 * @param {number} h 0..1
 * @param {number} s 0..1
 * @param {number} l 0..1
 * @returns {[number, number, number]}
 */
function hslToRgb(h, s, l) {
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return /** @type {[number, number, number]} */ ([h + 1 / 3, h, h - 1 / 3].map((t) => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        let value;
        if (tt < 1 / 6) value = p + (q - p) * 6 * tt;
        else if (tt < 1 / 2) value = q;
        else if (tt < 2 / 3) value = p + (q - p) * (2 / 3 - tt) * 6;
        else value = p;
        return Math.round(value * 255);
    }));
}

/**
 * Strict conformance check on an encoded PNG.
 *
 * The encoder above is hand-written, so "Node wrote a file and Python opened
 * it" is not evidence that Minecraft will accept it. This verifies the parts a
 * lenient decoder will happily paper over: chunk CRCs, chunk ordering, the
 * IHDR fields Minecraft requires (8-bit RGBA, non-interlaced), the exact
 * decompressed IDAT length, and that every scanline carries a legal filter
 * byte.
 *
 * Used by `tools/validate.mjs` on every build. Introduced while investigating
 * the v0.5.0 icon report — it cleared the encoder rather than convicting it,
 * which is exactly why it is worth keeping.
 *
 * @param {Buffer | Uint8Array} bytes
 * @returns {string[]} Problems found; empty means conformant.
 */
export function verifyPng(bytes) {
    const buf = Buffer.from(bytes);
    /** @type {string[]} */
    const problems = [];

    if (buf.length < 8 || !buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return ['not a PNG: bad signature'];
    }

    /** @type {{ type: string, data: Buffer }[]} */
    const chunks = [];
    let offset = 8;
    while (offset + 12 <= buf.length) {
        const length = buf.readUInt32BE(offset);
        const type = buf.subarray(offset + 4, offset + 8).toString('latin1');
        const data = buf.subarray(offset + 8, offset + 8 + length);
        const stored = buf.readUInt32BE(offset + 8 + length);
        if (crc32(buf.subarray(offset + 4, offset + 8 + length)) !== stored) {
            problems.push(`${type}: CRC mismatch`);
        }
        chunks.push({ type, data });
        offset += 12 + length;
    }

    if (offset !== buf.length) problems.push('trailing bytes after the last chunk');
    if (chunks.length === 0) return [...problems, 'no chunks'];
    if (chunks[0].type !== 'IHDR') problems.push('first chunk is not IHDR');
    if (chunks[chunks.length - 1].type !== 'IEND') problems.push('last chunk is not IEND');

    const ihdr = chunks[0].data;
    if (ihdr.length !== 13) return [...problems, 'IHDR is not 13 bytes'];
    const width = ihdr.readUInt32BE(0);
    const height = ihdr.readUInt32BE(4);
    const [bitDepth, colourType, compression, filterMethod, interlace] = [
        ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12],
    ];

    if (width === 0 || height === 0) problems.push(`degenerate dimensions ${width}x${height}`);
    if (bitDepth !== 8) problems.push(`bit depth ${bitDepth}, expected 8`);
    if (colourType !== 6) problems.push(`colour type ${colourType}, expected 6 (RGBA)`);
    if (compression !== 0) problems.push(`compression method ${compression}, expected 0`);
    if (filterMethod !== 0) problems.push(`filter method ${filterMethod}, expected 0`);
    if (interlace !== 0) problems.push('interlaced — Minecraft expects non-interlaced');

    const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
    if (idat.length === 0) return [...problems, 'no IDAT data'];

    /** @type {Buffer} */
    let raw;
    try {
        raw = inflateSync(idat);
    } catch (error) {
        return [...problems, `IDAT is not a valid zlib stream: ${error}`];
    }

    const stride = 1 + width * 4;
    if (raw.length !== height * stride) {
        problems.push(`decompressed IDAT is ${raw.length} bytes, expected ${height * stride}`);
    } else {
        for (let y = 0; y < height; y++) {
            const filter = raw[y * stride];
            if (filter > 4) problems.push(`scanline ${y} has illegal filter byte ${filter}`);
        }
    }

    return problems;
}
