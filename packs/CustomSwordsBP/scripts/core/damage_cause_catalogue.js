/**
 * The vanilla damage-cause catalogue — the fourth build-time gate.
 *
 * Every sword binding names a `cause` in its params, and that string is handed
 * straight to `Entity.applyDamage({ cause })`. Bedrock does not complain about
 * a cause it does not recognise; it applies the damage with a cause the engine
 * cannot classify, and everything downstream that keys off it — death messages,
 * `fire_resistance` and the other cause-specific mitigations, the `entityHurt`
 * payload other packs read — quietly stops matching.
 *
 * That is the same failure shape the project already gates three times over:
 *
 * | Catalogue | Guards against |
 * |---|---|
 * | `effect_catalogue.js` | an effect that never lands |
 * | `particle_catalogue.js` | a visual that never draws |
 * | `tools/data/vanilla_sound_events.json` | a sound that never plays |
 * | **this** | **damage that lands, but as the wrong kind** |
 *
 * The last one is the most insidious of the four, because the ability *looks*
 * like it is working: the target takes the hit. Only the classification is
 * wrong, and nothing on screen says so.
 *
 * Transcribed from `@minecraft/server`'s `EntityDamageCause` enum, which is the
 * engine's own list rather than one assembled from memory.
 *
 * Engine-free, so the build tools and the unit tests can both load it.
 */

/** Every damage cause the script API defines. */
export const VANILLA_DAMAGE_CAUSES = Object.freeze([
    'anvil',
    'blockExplosion',
    'campfire',
    'charging',
    'contact',
    'drowning',
    'entityAttack',
    'entityExplosion',
    'fall',
    'fallingBlock',
    'fire',
    'fireTick',
    'fireworks',
    'flyIntoWall',
    'freezing',
    'lava',
    'lightning',
    'magic',
    'magma',
    'none',
    'override',
    'piston',
    'projectile',
    'ramAttack',
    'selfDestruct',
    'sonicBoom',
    'soulCampfire',
    'stalactite',
    'stalagmite',
    'starve',
    'suffocation',
    'suicide',
    'temperature',
    'thorns',
    'void',
    'wither',
]);

/** @type {ReadonlySet<string>} */
const CAUSE_SET = new Set(VANILLA_DAMAGE_CAUSES);

/**
 * Unlike effect and particle ids, damage causes are camelCase enum members and
 * carry no namespace, so the match is exact. A definition writing
 * `'entity_attack'` is wrong in a way this will catch rather than silently
 * normalise, which is the point.
 *
 * @param {unknown} cause
 * @returns {boolean}
 */
export function isVanillaDamageCause(cause) {
    return typeof cause === 'string' && CAUSE_SET.has(cause);
}

/**
 * Suggests the closest known cause for a mistyped one, so a build error can say
 * "did you mean" rather than only "unknown". Case- and separator-insensitive,
 * because the realistic mistakes are `entity_attack` for `entityAttack` and
 * `Magic` for `magic`.
 *
 * @param {unknown} cause
 * @returns {string | undefined}
 */
export function suggestDamageCause(cause) {
    if (typeof cause !== 'string') return undefined;
    const flat = cause.replace(/[^a-z]/gi, '').toLowerCase();
    if (flat.length < 3) return undefined;
    return (
        VANILLA_DAMAGE_CAUSES.find((known) => known.toLowerCase() === flat) ??
        VANILLA_DAMAGE_CAUSES.find((known) => known.toLowerCase().startsWith(flat.slice(0, 4)))
    );
}
