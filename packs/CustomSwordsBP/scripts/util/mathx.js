/**
 * Small numeric helpers shared by the systems layer.
 * Engine-free so it can be unit tested in plain Node.
 */

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * @param {number} degrees
 * @returns {number}
 */
export function degToRad(degrees) {
    return (degrees * Math.PI) / 180;
}

/**
 * Inclusive integer in [min, max].
 *
 * @param {number} min
 * @param {number} max
 * @param {() => number} [rng] Injectable for deterministic tests.
 * @returns {number}
 */
export function randomInt(min, max, rng = Math.random) {
    return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * @param {number} min
 * @param {number} max
 * @param {() => number} [rng]
 * @returns {number}
 */
export function randomFloat(min, max, rng = Math.random) {
    return min + rng() * (max - min);
}

/**
 * @param {number} probability 0..1
 * @param {() => number} [rng]
 * @returns {boolean}
 */
export function chance(probability, rng = Math.random) {
    return rng() < probability;
}
