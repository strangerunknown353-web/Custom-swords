/**
 * Activation methods — how a player asks a sword to do something.
 *
 * The framework separates *what* an ability does from *how it is triggered*, so
 * one sword can carry several abilities on different inputs and the same
 * ability can be reached by different inputs on different swords.
 *
 * Bedrock gives an item custom component two player-driven hooks: `onUse`
 * (right-click / long-press) and `onHitEntity` (melee). Combining each with the
 * player's sneak state yields the four methods below. Nothing here polls input;
 * the sneak state is read from the event's player at the moment it fires.
 *
 * Engine-free, so both the runtime and the build tools share the vocabulary.
 */

/**
 * @typedef {'use' | 'sneak_use' | 'attack' | 'sneak_attack'} ActivationMethod
 */

/** Every activation method, in the order documentation should list them. */
export const ACTIVATION_METHODS = Object.freeze(['use', 'sneak_use', 'attack', 'sneak_attack']);

/**
 * Human-readable labels, used by the diagnostics command and the docs.
 *
 * @type {Readonly<Record<ActivationMethod, string>>}
 */
export const ACTIVATION_LABELS = Object.freeze({
    use: 'Use (right-click / long-press)',
    sneak_use: 'Sneak + use',
    attack: 'Melee hit',
    sneak_attack: 'Sneak + melee hit',
});

/**
 * The base method a sneaking variant falls back to.
 *
 * @type {Readonly<Record<ActivationMethod, ActivationMethod | undefined>>}
 */
const FALLBACK = Object.freeze({
    use: undefined,
    attack: undefined,
    sneak_use: 'use',
    sneak_attack: 'attack',
});

/**
 * @param {unknown} value
 * @returns {value is ActivationMethod}
 */
export function isActivationMethod(value) {
    return typeof value === 'string' && ACTIVATION_METHODS.includes(/** @type {any} */ (value));
}

/**
 * Turns a raw engine hook plus the player's sneak state into an activation.
 *
 * @param {'use' | 'attack'} hook Which custom-component handler fired.
 * @param {boolean} sneaking
 * @returns {ActivationMethod}
 */
export function activationFor(hook, sneaking) {
    if (hook === 'use') return sneaking ? 'sneak_use' : 'use';
    return sneaking ? 'sneak_attack' : 'attack';
}

/**
 * Resolution order for an activation: the exact method first, then its
 * non-sneaking base.
 *
 * The fallback exists so a sword that only binds `use` still works when the
 * player happens to be crouching — which is what players expect, and which
 * would otherwise be a baffling "my sword stopped working on ladders" bug. A
 * sword that binds both gets the specific one.
 *
 * @param {ActivationMethod} method
 * @returns {ActivationMethod[]}
 */
export function resolutionOrder(method) {
    const fallback = FALLBACK[method];
    return fallback === undefined ? [method] : [method, fallback];
}
