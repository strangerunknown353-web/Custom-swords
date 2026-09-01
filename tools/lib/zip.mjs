/**
 * A minimal, dependency-free ZIP writer.
 *
 * `.mcaddon`, `.mcpack` and `.mcworld` are all ordinary ZIP archives. Writing
 * the format directly keeps the project at zero npm dependencies and means
 * `npm run build` behaves identically on Windows, macOS and Linux without
 * needing a `zip` binary on PATH.
 *
 * Scope: store/deflate entries, no ZIP64, no encryption, no directory entries
 * (Minecraft infers folders from entry names). That covers every pack we build.
 */

import { deflateRawSync } from 'node:zlib';

import { crc32 } from './crc32.mjs';

/** DOS epoch is 1980; anything earlier cannot be represented. */
const DOS_EPOCH_YEAR = 1980;

/**
 * @typedef {Object} ZipEntry
 * @property {string} name Forward-slash separated path inside the archive.
 * @property {Uint8Array} data
 */

/**
 * @param {Date} date
 * @returns {{ time: number, date: number }}
 */
function toDosDateTime(date) {
    const year = Math.max(DOS_EPOCH_YEAR, date.getFullYear());
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
        date: ((year - DOS_EPOCH_YEAR) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
}

/**
 * Builds a ZIP archive in memory.
 *
 * @param {ZipEntry[]} entries
 * @param {Date} [modified] Fixed timestamp keeps builds reproducible.
 * @returns {Buffer}
 */
export function createZip(entries, modified = new Date(Date.UTC(2020, 0, 1, 0, 0, 0))) {
    const { time, date } = toDosDateTime(modified);

    /** @type {Buffer[]} */
    const localParts = [];
    /** @type {Buffer[]} */
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = Buffer.from(entry.name, 'utf8');
        const raw = Buffer.from(entry.data);
        const compressed = deflateRawSync(raw, { level: 9 });
        // Never let "compression" make a file bigger.
        const useDeflate = compressed.length < raw.length;
        const payload = useDeflate ? compressed : raw;
        const method = useDeflate ? 8 : 0;
        const checksum = crc32(raw);

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
        localHeader.writeUInt16LE(20, 4); // version needed
        localHeader.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
        localHeader.writeUInt16LE(method, 8);
        localHeader.writeUInt16LE(time, 10);
        localHeader.writeUInt16LE(date, 12);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(payload.length, 18);
        localHeader.writeUInt32LE(raw.length, 22);
        localHeader.writeUInt16LE(nameBytes.length, 26);
        localHeader.writeUInt16LE(0, 28); // extra field length

        localParts.push(localHeader, nameBytes, payload);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0); // central directory signature
        centralHeader.writeUInt16LE(20, 4); // version made by
        centralHeader.writeUInt16LE(20, 6); // version needed
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(method, 10);
        centralHeader.writeUInt16LE(time, 12);
        centralHeader.writeUInt16LE(date, 14);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(payload.length, 20);
        centralHeader.writeUInt32LE(raw.length, 24);
        centralHeader.writeUInt16LE(nameBytes.length, 28);
        centralHeader.writeUInt16LE(0, 30); // extra
        centralHeader.writeUInt16LE(0, 32); // comment
        centralHeader.writeUInt16LE(0, 34); // disk number
        centralHeader.writeUInt16LE(0, 36); // internal attributes
        centralHeader.writeUInt32LE(0, 38); // external attributes
        centralHeader.writeUInt32LE(offset, 42);

        centralParts.push(centralHeader, nameBytes);
        offset += localHeader.length + nameBytes.length + payload.length;
    }

    const central = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // disk with central directory
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(central.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([...localParts, central, eocd]);
}
