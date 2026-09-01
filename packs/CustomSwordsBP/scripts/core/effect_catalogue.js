/**
 * The vanilla status-effect catalogue.
 *
 * Effect ids in a sword definition are free-form strings, which means a typo
 * (`'slowess'`) would sail through review, load fine, and then silently do
 * nothing the first time a player swings the sword — the worst kind of bug,
 * because it looks like the ability is simply weak.
 *
 * This list makes that a build failure. It is transcribed from
 * `@minecraft/vanilla-data` 1.26.44
 * (`MinecraftEffectTypes`), so it is the engine's own list rather than one
 * assembled from memory.
 *
 * Effects are referenced without the namespace in definitions; the engine
 * accepts either form, and {@link normaliseEffect} handles both.
 *
 * Engine-free.
 */

/** Every effect the vanilla game defines, without the `minecraft:` prefix. */
export const VANILLA_EFFECTS = Object.freeze([
    'absorption',
    'bad_omen',
    'blindness',
    'breath_of_the_nautilus',
    'conduit_power',
    'darkness',
    'fatal_poison',
    'fire_resistance',
    'haste',
    'health_boost',
    'hunger',
    'infested',
    'instant_damage',
    'instant_health',
    'invisibility',
    'jump_boost',
    'levitation',
    'mining_fatigue',
    'nausea',
    'night_vision',
    'oozing',
    'poison',
    'raid_omen',
    'regeneration',
    'resistance',
    'saturation',
    'slow_falling',
    'slowness',
    'speed',
    'strength',
    'trial_omen',
    'village_hero',
    'water_breathing',
    'weakness',
    'weaving',
    'wind_charged',
    'wither',
]);

/** @type {ReadonlySet<string>} */
const EFFECT_SET = new Set(VANILLA_EFFECTS);

/**
 * Strips an optional `minecraft:` prefix and lower-cases the result.
 *
 * @param {unknown} effect
 * @returns {string | undefined} The bare effect id, or undefined for non-strings.
 */
export function normaliseEffect(effect) {
    if (typeof effect !== 'string') return undefined;
    const trimmed = effect.trim().toLowerCase();
    return trimmed.startsWith('minecraft:') ? trimmed.slice('minecraft:'.length) : trimmed;
}

/**
 * @param {unknown} effect
 * @returns {boolean}
 */
export function isVanillaEffect(effect) {
    const normalised = normaliseEffect(effect);
    return normalised !== undefined && EFFECT_SET.has(normalised);
}

/**
 * Suggests the closest known effect for a mistyped one, so the build error can
 * say "did you mean" rather than just "unknown".
 *
 * Uses a cheap prefix/substring heuristic rather than full edit distance —
 * enough to catch the realistic mistakes (a dropped letter, a plural, a
 * remembered Java name) without pulling in an algorithm for a build message.
 *
 * @param {string} effect
 * @returns {string | undefined}
 */
export function suggestEffect(effect) {
    const normalised = normaliseEffect(effect);
    if (normalised === undefined || normalised.length < 3) return undefined;
    return (
        VANILLA_EFFECTS.find((known) => known.startsWith(normalised.slice(0, 4))) ??
        VANILLA_EFFECTS.find((known) => known.includes(normalised) || normalised.includes(known))
    );
}
