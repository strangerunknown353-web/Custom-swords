/**
 * Sound playback.
 *
 * Sword definitions reference sounds either by a raw vanilla sound id or by a
 * name from {@link SOUND_LIBRARY}. The library exists so that a family of
 * swords can share a consistent audio vocabulary and so a later milestone can
 * swap a preset for a custom `.ogg` in exactly one place.
 *
 * Every id below is a vanilla Bedrock sound event, **verified against the
 * vanilla resource pack's `sound_definitions.json`** by `tools/validate.mjs` on
 * every build (`tools/data/vanilla_sound_events.json`, 1824 events). The build
 * ships no custom audio.
 *
 * ## The v0.5.1 silent-audio bug
 *
 * The seven elemental swords referenced presets — `inferno_cast`,
 * `thunder_impact`, and twelve more — that were never added to the library.
 * `resolve()` treated an unknown name as a raw sound id and handed
 * `playSound('inferno_cast')` to the engine, which is not a sound event, so
 * every ability was silent. Nothing failed: not the tests, not the validator,
 * not the game.
 *
 * That fallback is gone. An unknown name now resolves to `undefined` and is
 * logged, and the validator rejects it at build time. A sound reference is
 * either a library preset or an explicit `{ id }` spec — guessing on the
 * player's behalf is what made the failure invisible.
 */

/** @typedef {import('@minecraft/server').Dimension} Dimension */
/** @typedef {import('@minecraft/server').Player} Player */
/** @typedef {import('../util/vec3.js').Vec3} Vec3Like */

/**
 * @typedef {Object} SoundSpec
 * @property {string} id Vanilla sound event id.
 * @property {number} [volume] Defaults to 1.
 * @property {number} [pitch] Defaults to 1.
 */

/**
 * Named presets. Values are vanilla sound event ids.
 *
 * @type {Readonly<Record<string, SoundSpec>>}
 */
export const SOUND_LIBRARY = Object.freeze({
    // --- Framework cues -----------------------------------------------------
    ability_cast: { id: 'random.orb', volume: 0.8, pitch: 1.2 },
    ability_deny: { id: 'note.bass', volume: 0.5, pitch: 0.6 },
    ability_ready: { id: 'random.levelup', volume: 0.4, pitch: 1.6 },
    impact_heavy: { id: 'random.explode', volume: 0.6, pitch: 1.4 },
    impact_light: { id: 'random.anvil_land', volume: 0.4, pitch: 1.8 },

    // --- Elemental themes ---------------------------------------------------
    // Each pair is a cast (at the wielder) and an impact (per target). Pitch and
    // volume carry most of the character: the same blaze shot at 0.8 pitch reads
    // as a much heavier weapon than at 1.4.
    inferno_cast: { id: 'mob.blaze.shoot', volume: 0.9, pitch: 0.8 },
    inferno_impact: { id: 'fire.ignite', volume: 0.7, pitch: 1.1 },

    thunder_cast: { id: 'item.trident.thunder', volume: 0.9, pitch: 1.2 },
    thunder_impact: { id: 'ambient.weather.lightning.impact', volume: 0.7, pitch: 1.3 },

    frost_cast: { id: 'dig.powder_snow', volume: 0.9, pitch: 0.7 },
    frost_impact: { id: 'random.glass', volume: 0.5, pitch: 1.6 },

    wind_cast: { id: 'mob.breeze.shoot', volume: 0.9, pitch: 1.1 },
    wind_impact: { id: 'breeze_wind_charge.burst', volume: 0.7, pitch: 1.2 },

    earth_cast: { id: 'dig.deepslate', volume: 1, pitch: 0.6 },
    earth_impact: { id: 'block.stonecutter.use', volume: 0.6, pitch: 0.8 },

    tidal_cast: { id: 'bucket.empty_water', volume: 0.9, pitch: 0.8 },
    tidal_impact: { id: 'ambient.underwater.exit', volume: 0.6, pitch: 1.2 },

    nature_cast: { id: 'block.cave_vines.place', volume: 0.9, pitch: 0.9 },
    nature_impact: { id: 'break.amethyst_cluster', volume: 0.6, pitch: 1.3 },
});

/** Preset names, for the validator and for diagnostics. */
export const SOUND_PRESETS = Object.freeze(Object.keys(SOUND_LIBRARY));

export class SoundService {
    /**
     * @param {typeof import('../core/log.js').log} log
     */
    constructor(log) {
        /** @private @readonly */
        this.log = log;
    }

    /**
     * Resolves a spec or a library name into a concrete {@link SoundSpec}.
     * Pure, so it is unit tested directly.
     *
     * @param {SoundSpec | string} sound
     * @returns {SoundSpec | undefined}
     */
    resolve(sound) {
        if (typeof sound === 'string') {
            // A library preset — and *only* a library preset. Falling back to
            // treating an unknown name as a raw sound id is what made fourteen
            // missing presets play as silence instead of failing. If you need a
            // vanilla id the library does not cover, pass `{ id: '...' }`
            // explicitly, which says you meant it.
            const preset = SOUND_LIBRARY[sound];
            if (preset === undefined) {
                this.log.warn(
                    `sounds.resolve: '${sound}' is not a preset in SOUND_LIBRARY. ` +
                        'Add it there, or pass an explicit { id } spec.',
                );
                return undefined;
            }
            return preset;
        }
        if (sound !== null && typeof sound === 'object' && typeof sound.id === 'string') {
            return sound;
        }
        return undefined;
    }

    /**
     * Plays a sound at a world location, audible to everyone nearby. Use this
     * for ability impacts that other players should hear.
     *
     * @param {Dimension} dimension
     * @param {SoundSpec | string} sound
     * @param {Vec3Like} location
     * @returns {boolean}
     */
    playAt(dimension, sound, location) {
        const spec = this.resolve(sound);
        if (spec === undefined) return false;
        try {
            dimension.playSound(spec.id, location, {
                volume: spec.volume ?? 1,
                pitch: spec.pitch ?? 1,
            });
            return true;
        } catch (error) {
            this.log.warn(`sounds.playAt failed for '${spec.id}':`, error);
            return false;
        }
    }

    /**
     * Plays a sound heard only by one player. Use this for personal UI feedback
     * (cooldown denied, ability ready) so it never leaks to other players.
     *
     * @param {Player} player
     * @param {SoundSpec | string} sound
     * @returns {boolean}
     */
    playFor(player, sound) {
        const spec = this.resolve(sound);
        if (spec === undefined) return false;
        if (!player.isValid) return false;
        try {
            player.playSound(spec.id, {
                volume: spec.volume ?? 1,
                pitch: spec.pitch ?? 1,
            });
            return true;
        } catch (error) {
            this.log.warn(`sounds.playFor failed for '${spec.id}':`, error);
            return false;
        }
    }
}
