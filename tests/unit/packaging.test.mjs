/**
 * Tests for the build tooling itself.
 *
 * The ZIP and PNG writers are hand-rolled to keep the project dependency-free,
 * so they need their own coverage: a malformed archive would produce an
 * .mcaddon that Minecraft silently refuses to import.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inflateRawSync } from 'node:zlib';

import { createZip } from '../../tools/lib/zip.mjs';
import { crc32 } from '../../tools/lib/crc32.mjs';
import { encodePng, placeholderSwordIcon } from '../../tools/lib/png.mjs';

/**
 * Reads back a ZIP produced by `createZip`, without any dependency.
 *
 * @param {Buffer} zip
 * @returns {Map<string, Buffer>}
 */
function readZip(zip) {
    const eocdOffset = zip.length - 22;
    assert.equal(zip.readUInt32LE(eocdOffset), 0x06054b50, 'end-of-central-directory signature');
    const entryCount = zip.readUInt16LE(eocdOffset + 10);
    let cursor = zip.readUInt32LE(eocdOffset + 16);

    /** @type {Map<string, Buffer>} */
    const files = new Map();
    for (let i = 0; i < entryCount; i++) {
        assert.equal(zip.readUInt32LE(cursor), 0x02014b50, 'central directory signature');
        const method = zip.readUInt16LE(cursor + 10);
        const storedCrc = zip.readUInt32LE(cursor + 16);
        const compressedSize = zip.readUInt32LE(cursor + 20);
        const nameLength = zip.readUInt16LE(cursor + 28);
        const localOffset = zip.readUInt32LE(cursor + 42);
        const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength);

        const localNameLength = zip.readUInt16LE(localOffset + 26);
        const localExtraLength = zip.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const payload = zip.subarray(dataStart, dataStart + compressedSize);
        const data = method === 8 ? inflateRawSync(payload) : Buffer.from(payload);

        assert.equal(crc32(data), storedCrc, `CRC mismatch for ${name}`);
        files.set(name, data);
        cursor += 46 + nameLength + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
    }
    return files;
}

describe('createZip', () => {
    it('round-trips nested paths and content exactly', () => {
        const entries = [
            { name: 'CustomSwordsBP/manifest.json', data: Buffer.from('{"format_version":2}') },
            { name: 'CustomSwordsBP/scripts/main.js', data: Buffer.from('a'.repeat(5000)) },
            { name: 'CustomSwordsRP/textures/item_texture.json', data: Buffer.from('{}') },
        ];
        const files = readZip(createZip(entries));

        assert.equal(files.size, 3);
        for (const entry of entries) {
            assert.deepEqual(files.get(entry.name), Buffer.from(entry.data), entry.name);
        }
    });

    it('handles an empty file without corrupting the archive', () => {
        const files = readZip(createZip([{ name: 'empty.txt', data: Buffer.alloc(0) }]));
        assert.equal(files.get('empty.txt').length, 0);
    });

    it('produces byte-identical archives for identical input', () => {
        const entries = [{ name: 'a.txt', data: Buffer.from('hello') }];
        assert.deepEqual(createZip(entries), createZip(entries), 'builds must be reproducible');
    });
});

describe('png encoder', () => {
    it('writes a valid signature and IHDR for the requested size', () => {
        const png = encodePng(2, 2, new Uint8Array(2 * 2 * 4));
        assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        assert.equal(png.toString('ascii', 12, 16), 'IHDR');
        assert.equal(png.readUInt32BE(16), 2);
        assert.equal(png.readUInt32BE(20), 2);
        assert.equal(png.readUInt8(24), 8, 'bit depth');
        assert.equal(png.readUInt8(25), 6, 'RGBA colour type');
    });

    it('rejects a pixel buffer of the wrong length', () => {
        assert.throws(() => encodePng(4, 4, new Uint8Array(10)), /expected 64 bytes/);
    });

    it('renders a 16x16 icon deterministically per seed', () => {
        const a1 = placeholderSwordIcon({ seed: 'custom_swords:ember_blade' });
        const a2 = placeholderSwordIcon({ seed: 'custom_swords:ember_blade' });
        const b = placeholderSwordIcon({ seed: 'custom_swords:other_blade' });

        assert.deepEqual(a1, a2, 'same seed must give the same icon');
        assert.notDeepEqual(a1, b, 'different swords must be visually distinguishable');
        assert.equal(a1.readUInt32BE(16), 16);
        assert.equal(a1.readUInt32BE(20), 16);
    });
});
