/**
 * Visual profiles — a sword's presentation as one named, reusable bundle.
 *
 *   Sword → Ability → Visual Profile → particles / sounds → execution
 *
 * A binding says `visual: 'fire'` and inherits a coherent kit: the particle
 * emitted at the caster, the one emitted on each target, the one used to draw
 * an arc or trail, and the cast/impact sounds. Anything the binding states
 * explicitly still wins — the profile only fills gaps.
 *
 * ## Why this layer exists
 *
 * Before it, every binding restated its own particle ids and sound names
 * inline. That is how five unusable particle identifiers and fourteen missing
 * sound presets spread across seven swords without anyone noticing: there was
 * no single place where "what fire looks like" was written down, so there was
 * no single place to get it wrong once and fix it once.
 *
 * Now there is. Adding sword #9 with a fire theme is `visual: 'fire'`, and
 * correcting how fire looks is one edit here rather than one per binding.
 *
 * Every identifier below is checked against `particle_catalogue.js` and
 * `SOUND_LIBRARY` by `tools/validate.mjs` on every build.
 */

/**
 * @typedef {Object} VisualProfile
 * @property {string} caster   Particle emitted at the wielder on cast.
 * @property {string} target   Particle emitted on each target struck.
 * @property {string} trail    Particle used to draw arcs, trails and rings.
 * @property {string} castSound   `SOUND_LIBRARY` preset played on cast.
 * @property {string} impactSound `SOUND_LIBRARY` preset played per target.
 */

/** @type {Readonly<Record<string, VisualProfile>>} */
export const VISUAL_PROFILES = Object.freeze({
    /** Volcanic: flame at the hand, molten spatter on the target. */
    fire: Object.freeze({
        caster: 'minecraft:basic_flame_particle',
        target: 'minecraft:lava_particle',
        trail: 'minecraft:basic_flame_particle',
        castSound: 'inferno_cast',
        impactSound: 'inferno_impact',
    }),

    /** Storm: bright white arc-sparks, a hard crack on impact. */
    storm: Object.freeze({
        caster: 'minecraft:endrod',
        target: 'minecraft:critical_hit_emitter',
        trail: 'minecraft:endrod',
        castSound: 'thunder_cast',
        impactSound: 'thunder_impact',
    }),

    /** Frost: falling snow, evaporating rime where it lands. */
    frost: Object.freeze({
        caster: 'minecraft:snowflake_particle',
        target: 'minecraft:ice_evaporation_emitter',
        trail: 'minecraft:snowflake_particle',
        castSound: 'frost_cast',
        impactSound: 'frost_impact',
    }),

    /** Gale: a visible shockwave outward, drifting motes in its wake. */
    gale: Object.freeze({
        caster: 'minecraft:knockback_roar_particle',
        target: 'minecraft:spore_blossom_ambient_particle',
        trail: 'minecraft:spore_blossom_ambient_particle',
        castSound: 'wind_cast',
        impactSound: 'wind_impact',
    }),

    /** Stone: heavy dust, kicked up and settling. */
    stone: Object.freeze({
        caster: 'minecraft:basic_smoke_particle',
        target: 'minecraft:falling_border_dust_particle',
        trail: 'minecraft:basic_smoke_particle',
        castSound: 'earth_cast',
        impactSound: 'earth_impact',
    }),

    /** Tide: thrown spray, evaporating mist on contact. */
    tide: Object.freeze({
        caster: 'minecraft:water_splash_particle_manual',
        target: 'minecraft:water_evaporation_bucket_emitter',
        trail: 'minecraft:water_splash_particle_manual',
        castSound: 'tidal_cast',
        impactSound: 'tidal_impact',
    }),

    /** Grove: growth and pollen. */
    grove: Object.freeze({
        caster: 'minecraft:villager_happy',
        target: 'minecraft:spore_blossom_shower_particle',
        trail: 'minecraft:villager_happy',
        castSound: 'nature_cast',
        impactSound: 'nature_impact',
    }),

    /**
     * Ember: sparks off heated steel, not a conflagration. Deliberately built
     * from a different vocabulary than `fire` — spark motes rather than open
     * flame at the hand, a single controlled candle-flame on the target rather
     * than molten spatter — so Ember Blade and Inferno never read as the same
     * weapon at two power levels.
     */
    ember: Object.freeze({
        caster: 'minecraft:redstone_torch_dust_particle',
        target: 'minecraft:candle_flame_particle',
        trail: 'minecraft:obsidian_glow_dust_particle',
        castSound: 'ember_cast',
        impactSound: 'ember_impact',
    }),

    /**
     * Shadow: displacement rather than an element. Portal motes where the
     * wielder was, void-dark spatter where they arrive. The only profile whose
     * caster particle marks a place the player has *left*.
     */
    shadow: Object.freeze({
        caster: 'minecraft:mob_portal',
        target: 'minecraft:obsidian_glow_dust_particle',
        trail: 'minecraft:basic_portal_particle',
        castSound: 'shadow_cast',
        impactSound: 'shadow_impact',
    }),

    /**
     * Crystal: a lattice ringing, not an element burning. Mystical motes gather
     * at the hand and a bright mineral flare goes off where the resonance
     * lands. Deliberately built from the one particle vocabulary no other
     * profile touches — `frost` is the nearest theme by colour and it is
     * snow and rime, never sparkle, so the two never read as one weapon.
     */
    crystal: Object.freeze({
        caster: 'minecraft:lab_table_misc_mystical_particle',
        target: 'minecraft:magnesium_salts_emitter',
        trail: 'minecraft:lab_table_misc_mystical_particle',
        castSound: 'crystal_cast',
        impactSound: 'crystal_impact',
    }),

    /**
     * Void: dimensional energy rather than darkness. Dragon-breath wisps where
     * the rift is torn, dark tears where it closes on something, End-sparkle
     * along its edge.
     *
     * `shadow` is the profile it must never be mistaken for, so the two share
     * no identifier at all: shadow is portal motes marking a place the wielder
     * has left, void is the breath of somewhere else arriving.
     */
    void: Object.freeze({
        caster: 'minecraft:dragon_breath_trail',
        target: 'minecraft:obsidian_tear_particle',
        trail: 'minecraft:end_chest',
        castSound: 'void_cast',
        impactSound: 'void_impact',
    }),

    /** The framework's neutral default. */
    arcane: Object.freeze({
        caster: 'minecraft:critical_hit_emitter',
        target: 'minecraft:evoker_spell',
        trail: 'minecraft:critical_hit_emitter',
        castSound: 'ability_cast',
        impactSound: 'impact_light',
    }),
});

/** Profile names, for validation and diagnostics. */
export const PROFILE_NAMES = Object.freeze(Object.keys(VISUAL_PROFILES));

/**
 * @param {unknown} name
 * @returns {boolean}
 */
export function isVisualProfile(name) {
    return typeof name === 'string' && name in VISUAL_PROFILES;
}

/**
 * @param {string} name
 * @returns {VisualProfile | undefined}
 */
export function getProfile(name) {
    return VISUAL_PROFILES[name];
}

/**
 * Fills a binding's presentation from its profile, without overriding anything
 * the binding stated for itself.
 *
 * Returns a new object; the frozen profile and the frozen binding are never
 * mutated. Called once per activation, not per target.
 *
 * @param {{ visual?: string, particles?: readonly any[], sounds?: Record<string, unknown> }} binding
 * @returns {{ particles: readonly any[], sounds: Record<string, unknown>, profile: VisualProfile | undefined }}
 */
export function resolvePresentation(binding) {
    const profile = binding.visual === undefined ? undefined : VISUAL_PROFILES[binding.visual];

    if (profile === undefined) {
        return { particles: binding.particles ?? [], sounds: binding.sounds ?? {}, profile: undefined };
    }

    // An explicit particle list means the binding wants exactly that list.
    const particles =
        binding.particles !== undefined && binding.particles.length > 0
            ? binding.particles
            : [
                  { id: profile.caster, count: 14, spread: 1.2, at: 'caster' },
                  { id: profile.target, count: 5, spread: 0.4, at: 'target' },
              ];

    const sounds = {
        cast: profile.castSound,
        impact: profile.impactSound,
        ...(binding.sounds ?? {}),
    };

    return { particles, sounds, profile };
}
