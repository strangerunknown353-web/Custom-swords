/**
 * Sound playback.
 *
 * Sword definitions reference sounds either by a raw vanilla sound id or by a
 * name from {@link SOUND_LIBRARY}. The library exists so that a family of
 * swords can share a consistent audio vocabulary and so a later milestone can
 * swap a preset for a custom `.ogg` in exactly one place.
 *
 * Every id below is a vanilla Bedrock sound event; the foundation build ships
 * no custom audio.
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
    ability_cast: { id: 'random.orb', volume: 0.8, pitch: 1.2 },
    ability_deny: { id: 'note.bass', volume: 0.5, pitch: 0.6 },
    ability_ready: { id: 'random.levelup', volume: 0.4, pitch: 1.6 },
    impact_heavy: { id: 'random.explode', volume: 0.6, pitch: 1.4 },
    impact_light: { id: 'random.anvil_land', volume: 0.4, pitch: 1.8 },
});

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
            // A library name, or — if it is not in the library — a raw sound id.
            return SOUND_LIBRARY[sound] ?? { id: sound, volume: 1, pitch: 1 };
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
