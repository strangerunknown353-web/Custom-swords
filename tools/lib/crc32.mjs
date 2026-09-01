/**
 * CRC-32 (IEEE 802.3), used by both the PNG encoder and the ZIP writer.
 */

const TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

/**
 * @param {Uint8Array} buffer
 * @returns {number} Unsigned 32-bit CRC.
 */
export function crc32(buffer) {
    let c = 0xffffffff;
    for (const byte of buffer) {
        c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}
