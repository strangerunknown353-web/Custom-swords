/**
 * Leveled logging that routes to the Minecraft content log.
 *
 * Uses only `console.*`, which is available in the script runtime and in Node,
 * so this module stays testable and carries no `@minecraft/server` import.
 */

import { CONFIG } from '../config.js';

/** @type {Record<string, number>} */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const PREFIX = '[CustomSwords]';

/**
 * @param {string} level
 * @returns {boolean}
 */
function enabled(level) {
    if (!CONFIG.debug.enabled && level !== 'error' && level !== 'warn') return false;
    return LEVELS[level] <= (LEVELS[CONFIG.debug.level] ?? LEVELS.info);
}

/**
 * @param {unknown[]} parts
 * @returns {string}
 */
function format(parts) {
    return `${PREFIX} ${parts.map((p) => (typeof p === 'string' ? p : safeStringify(p))).join(' ')}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function safeStringify(value) {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

/**
 * `info` and `debug` deliberately route through `console.warn`: Minecraft's
 * content log filters `console.log` out of the default view, so informational
 * lines written with it are invisible exactly when a creator is trying to
 * diagnose a load failure.
 */
export const log = {
    /** @param {...unknown} parts */
    error(...parts) {
        if (enabled('error')) console.error(format(parts));
    },
    /** @param {...unknown} parts */
    warn(...parts) {
        if (enabled('warn')) console.warn(format(parts));
    },
    /** @param {...unknown} parts */
    info(...parts) {
        if (enabled('info')) console.warn(format(parts));
    },
    /** @param {...unknown} parts */
    debug(...parts) {
        if (enabled('debug')) console.warn(format(parts));
    },
};
