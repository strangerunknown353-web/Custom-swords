/**
 * Tick/second conversions. Every duration stored by the framework is in ticks;
 * durations exposed to authors and players are in seconds.
 */

export const TICKS_PER_SECOND = 20;

/**
 * @param {number} seconds
 * @returns {number} Whole ticks, never negative.
 */
export function secondsToTicks(seconds) {
    return Math.max(0, Math.round(seconds * TICKS_PER_SECOND));
}

/**
 * @param {number} ticks
 * @returns {number}
 */
export function ticksToSeconds(ticks) {
    return ticks / TICKS_PER_SECOND;
}

/**
 * Formats a tick duration for player-facing text, e.g. `3.5s`.
 *
 * @param {number} ticks
 * @returns {string}
 */
export function formatTicks(ticks) {
    const seconds = ticksToSeconds(Math.max(0, ticks));
    return `${seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10}s`;
}
