/**
 * Visual profiles, end to end.
 *
 * These exist because the v0.5.1 audio/particle failure was invisible at every
 * layer: the mocked engine accepted any particle id and any sound id, so
 * "spawned a particle" and "played a sound" were true in the tests and false in
 * the game. What can be checked here is that the *identifiers reaching the
 * engine are ones the catalogues vouch for* — which is the part that was wrong.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    VISUAL_PROFILES,
    PROFILE_NAMES,
    getProfile,
    isVisualProfile,
    resolvePresentation,
} from '../../packs/CustomSwordsBP/scripts/core/visual_profiles.js';
import { explainParticle, isUsableParticle } from '../../packs/CustomSwordsBP/scripts/core/particle_catalogue.js';
import { SOUND_LIBRARY } from '../../packs/CustomSwordsBP/scripts/systems/sounds.js';
import { SWORDS } from '../../packs/CustomSwordsBP/scripts/swords/index.js';

describe('visual profiles', () => {
    it('only references particles the catalogue vouches for', () => {
        for (const [name, profile] of Object.entries(VISUAL_PROFILES)) {
            for (const slot of ['caster', 'target', 'trail']) {
                const complaint = explainParticle(profile[slot]);
                assert.equal(complaint, undefined, `profile '${name}'.${slot}: ${complaint}`);
            }
        }
    });

    it('only references sounds that exist in SOUND_LIBRARY', () => {
        for (const [name, profile] of Object.entries(VISUAL_PROFILES)) {
            assert.ok(SOUND_LIBRARY[profile.castSound], `profile '${name}' cast sound missing`);
            assert.ok(SOUND_LIBRARY[profile.impactSound], `profile '${name}' impact sound missing`);
        }
    });

    it('gives every profile a distinct look — not one kit recoloured', () => {
        const casters = PROFILE_NAMES.map((n) => VISUAL_PROFILES[n].caster);
        assert.equal(new Set(casters).size, casters.length, 'two profiles share a caster particle');
        const sounds = PROFILE_NAMES.map((n) => VISUAL_PROFILES[n].castSound);
        assert.equal(new Set(sounds).size, sounds.length, 'two profiles share a cast sound');
    });

    it('fills presentation from the profile when the binding says nothing', () => {
        const { particles, sounds, profile } = resolvePresentation({ visual: 'fire' });
        assert.equal(profile, getProfile('fire'));
        assert.equal(sounds.cast, 'inferno_cast');
        assert.equal(sounds.impact, 'inferno_impact');
        assert.equal(particles.length, 2);
        assert.ok(particles.every((p) => isUsableParticle(p.id)));
    });

    it('lets the binding override the profile without mutating it', () => {
        const before = { ...VISUAL_PROFILES.fire };
        const { particles, sounds } = resolvePresentation({
            visual: 'fire',
            particles: [{ id: 'minecraft:snowflake_particle', count: 1, at: 'caster' }],
            sounds: { cast: 'ability_cast' },
        });
        assert.equal(particles[0].id, 'minecraft:snowflake_particle');
        assert.equal(sounds.cast, 'ability_cast');
        assert.equal(sounds.impact, 'inferno_impact', 'unstated slots still come from the profile');
        assert.deepEqual({ ...VISUAL_PROFILES.fire }, before, 'the frozen profile must not be mutated');
    });

    it('passes a binding with no profile straight through', () => {
        const { particles, sounds, profile } = resolvePresentation({});
        assert.equal(profile, undefined);
        assert.deepEqual(particles, []);
        assert.deepEqual(sounds, {});
    });

    it('rejects unknown profile names', () => {
        assert.equal(isVisualProfile('fire'), true);
        assert.equal(isVisualProfile('flamey'), false);
        assert.equal(isVisualProfile(undefined), false);
    });
});

describe('every shipped binding', () => {
    it('declares a visual profile', () => {
        for (const sword of SWORDS) {
            for (const binding of sword.abilities) {
                assert.ok(
                    isVisualProfile(binding.visual),
                    `${sword.id}[${binding.activation}] has no visual profile`,
                );
            }
        }
    });

    it('resolves to usable particles and real sound presets', () => {
        for (const sword of SWORDS) {
            for (const binding of sword.abilities) {
                const { particles, sounds } = resolvePresentation(binding);
                for (const particle of particles) {
                    const complaint = explainParticle(particle.id);
                    assert.equal(complaint, undefined, `${sword.id}[${binding.activation}]: ${complaint}`);
                }
                for (const [slot, value] of Object.entries(sounds)) {
                    if (typeof value !== 'string') continue;
                    assert.ok(
                        SOUND_LIBRARY[value],
                        `${sword.id}[${binding.activation}].sounds.${slot}: '${value}' is not a preset`,
                    );
                }
            }
        }
    });

    it('keeps every particle emit inside the per-emit budget', () => {
        for (const sword of SWORDS) {
            for (const binding of sword.abilities) {
                for (const particle of resolvePresentation(binding).particles) {
                    assert.ok(
                        (particle.count ?? 1) <= 64,
                        `${sword.id}[${binding.activation}] emits ${particle.count} of ${particle.id}`,
                    );
                }
            }
        }
    });
});
