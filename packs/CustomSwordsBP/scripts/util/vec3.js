/**
 * Minimal, allocation-conscious 3D vector helpers.
 *
 * Every function is pure and returns a new plain object so that values coming
 * out of the engine (which are read-only snapshots) are never mutated.
 *
 * This module intentionally has NO dependency on `@minecraft/server` so that it
 * can be unit tested in plain Node.
 *
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{ x: number, z: number }} Vec2XZ
 */

/** @type {Readonly<Vec3>} */
export const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

/** @type {Readonly<Vec3>} */
export const UP = Object.freeze({ x: 0, y: 1, z: 0 });

/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * @param {Vec3} a
 * @param {number} scalar
 * @returns {Vec3}
 */
export function scale(a, scalar) {
    return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar };
}

/**
 * @param {Vec3} a
 * @returns {number}
 */
export function lengthSquared(a) {
    return a.x * a.x + a.y * a.y + a.z * a.z;
}

/**
 * @param {Vec3} a
 * @returns {number}
 */
export function length(a) {
    return Math.sqrt(lengthSquared(a));
}

/**
 * Normalises a vector. Returns {@link ZERO} for a zero-length input rather than
 * producing NaN, because NaN coordinates passed back into the engine throw.
 *
 * @param {Vec3} a
 * @returns {Vec3}
 */
export function normalize(a) {
    const len = length(a);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: a.x / len, y: a.y / len, z: a.z / len };
}

/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {number}
 */
export function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {number}
 */
export function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {number}
 */
export function distance(a, b) {
    return Math.sqrt(distanceSquared(a, b));
}

/**
 * Projects a point `range` blocks along `direction` starting from `origin`.
 *
 * @param {Vec3} origin
 * @param {Vec3} direction Does not need to be normalised.
 * @param {number} range
 * @returns {Vec3}
 */
export function project(origin, direction, range) {
    return add(origin, scale(normalize(direction), range));
}

/**
 * Drops the Y component. `Entity.applyKnockback` takes a `VectorXZ` whose
 * magnitude is the horizontal force, which is why this returns x/z only.
 *
 * @param {Vec3} a
 * @returns {Vec2XZ}
 */
export function horizontal(a) {
    return { x: a.x, z: a.z };
}

/**
 * Normalises only the horizontal plane and scales it by `force`.
 *
 * @param {Vec3} direction
 * @param {number} force
 * @returns {Vec2XZ}
 */
export function horizontalForce(direction, force) {
    const len = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    if (len === 0) return { x: 0, z: 0 };
    return { x: (direction.x / len) * force, z: (direction.z / len) * force };
}

/**
 * @param {Vec3} a
 * @returns {boolean} True when every component is a finite number.
 */
export function isFinite3(a) {
    return Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);
}
