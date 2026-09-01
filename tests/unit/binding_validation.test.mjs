/**
 * The binding is the invocation envelope — targeting, effects, particles and
 * sounds. Because it is data, every mistake in it must be caught at build time
 * rather than showing up as an ability that quietly does nothing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    TARGETING_TYPES,
    validateBinding,
    validateEffects,
    validateParticles,
    validateSounds,
    validateTargeting,
} from '../../packs/CustomSwordsBP/scripts/core/definition_validator.js';

const always = () => true;

describe('validateTargeting', () => {
    it('accepts every documented shape', () => {
        assert.deepEqual(validateTargeting({ type: 'self' }, 'x'), []);
        assert.deepEqual(validateTargeting({ type: 'area', range: 5 }, 'x'), []);
        assert.deepEqual(validateTargeting({ type: 'single', range: 8 }, 'x'), []);
        assert.deepEqual(validateTargeting({ type: 'ray', range: 12 }, 'x'), []);
        assert.deepEqual(validateTargeting({ type: 'cone', range: 6, angleDegrees: 45 }, 'x'), []);
    });

    it('treats an absent targeting block as valid', () => {
        assert.deepEqual(validateTargeting(undefined, 'x'), []);
    });

    it('rejects an unknown type and names the valid ones', () => {
        const problems = validateTargeting({ type: 'wormhole' }, 'x');
        assert.ok(problems.some((p) => p.includes(TARGETING_TYPES.join(', '))));
    });

    it('requires a range for every shape that acts on entities', () => {
        for (const type of ['area', 'cone', 'single', 'ray']) {
            const problems = validateTargeting({ type, angleDegrees: 45 }, 'x');
            assert.ok(
                problems.some((p) => p.includes("requires a positive 'range'")),
                `${type} must require a range`,
            );
        }
    });

    it('does not require a range for self targeting', () => {
        assert.deepEqual(validateTargeting({ type: 'self' }, 'x'), []);
    });

    it('requires an angle for cones', () => {
        const problems = validateTargeting({ type: 'cone', range: 5 }, 'x');
        assert.ok(problems.some((p) => p.includes("requires 'angleDegrees'")));
    });

    it('rejects out-of-range numbers and wrong types', () => {
        assert.ok(validateTargeting({ type: 'area', range: -1 }, 'x').length > 0);
        assert.ok(validateTargeting({ type: 'area', range: 5, maxTargets: 0 }, 'x').length > 0);
        assert.ok(validateTargeting({ type: 'cone', range: 5, angleDegrees: 400 }, 'x').length > 0);
        assert.ok(validateTargeting({ type: 'area', range: 5, includePlayers: 'yes' }, 'x').length > 0);
        assert.ok(validateTargeting('area', 'x').length > 0);
    });
});

describe('validateEffects', () => {
    it('accepts a well-formed list', () => {
        assert.deepEqual(validateEffects([{ effect: 'slowness', durationTicks: 40, amplifier: 1 }], 'x'), []);
        assert.deepEqual(validateEffects(undefined, 'x'), []);
    });

    it('rejects missing ids, non-positive durations and negative amplifiers', () => {
        assert.ok(validateEffects([{ durationTicks: 40 }], 'x').some((p) => p.includes("'effect'")));
        assert.ok(validateEffects([{ effect: 'speed', durationTicks: 0 }], 'x').some((p) => p.includes('durationTicks')));
        assert.ok(
            validateEffects([{ effect: 'speed', durationTicks: 20, amplifier: -1 }], 'x').some((p) =>
                p.includes('amplifier'),
            ),
        );
    });

    it('reports the offending index so a long list is debuggable', () => {
        const problems = validateEffects(
            [
                { effect: 'speed', durationTicks: 20 },
                { effect: 'haste', durationTicks: -5 },
            ],
            'sword.active',
        );
        assert.ok(problems.some((p) => p.includes('sword.active.effects[1]')));
    });

    it('rejects a non-array', () => {
        assert.ok(validateEffects({ effect: 'speed' }, 'x').length > 0);
    });
});

describe('validateParticles', () => {
    it('accepts a well-formed list', () => {
        assert.deepEqual(
            validateParticles([{ id: 'minecraft:basic_flame_particle', count: 8, spread: 1, at: 'target' }], 'x'),
            [],
        );
    });

    it('rejects a bad emission point, count or id', () => {
        assert.ok(validateParticles([{ id: 'p', at: 'somewhere' }], 'x').some((p) => p.includes("'at'")));
        assert.ok(validateParticles([{ id: 'p', count: 0 }], 'x').some((p) => p.includes("'count'")));
        assert.ok(validateParticles([{ count: 3 }], 'x').some((p) => p.includes("'id'")));
        assert.ok(validateParticles([{ id: 'p', spread: -1 }], 'x').some((p) => p.includes("'spread'")));
    });
});

describe('validateSounds', () => {
    it('accepts the two known slots', () => {
        assert.deepEqual(validateSounds({ cast: 'ability_cast', impact: 'impact_light' }, 'x'), []);
        assert.deepEqual(validateSounds({}, 'x'), []);
        assert.deepEqual(validateSounds(undefined, 'x'), []);
    });

    it('rejects an unknown slot, which is almost always a typo', () => {
        const problems = validateSounds({ casst: 'ability_cast' }, 'x');
        assert.ok(problems.some((p) => p.includes("unknown slot 'casst'")));
    });

    it('rejects empty or non-string values', () => {
        assert.ok(validateSounds({ cast: '' }, 'x').length > 0);
        assert.ok(validateSounds({ impact: 7 }, 'x').length > 0);
    });
});

describe('validateBinding', () => {
    it('accepts a complete envelope', () => {
        assert.deepEqual(
            validateBinding(
                {
                    activation: 'use',
                    abilityId: 'custom_swords:shockwave',
                    cooldownTicks: 60,
                    targeting: { type: 'area', range: 4, maxTargets: 8 },
                    effects: [{ effect: 'slowness', durationTicks: 40 }],
                    particles: [{ id: 'minecraft:critical_hit_emitter', count: 4, at: 'target' }],
                    sounds: { cast: 'ability_cast' },
                    params: { damage: 3 },
                },
                'sword.active',
                always,
            ),
            [],
        );
    });

    // Regression: v0.5.1 validated particle *shape* but never *existence*, so
    // five unusable identifiers shipped across four swords. Wind had no working
    // particle at all and its ability was completely invisible in-game.
    it('rejects a particle identifier that does not exist', () => {
        const problems = validateBinding(
            {
                activation: 'use',
                abilityId: 'custom_swords:shockwave',
                cooldownTicks: 60,
                particles: [{ id: 'minecraft:wind_explosion_emitter', count: 3, at: 'caster' }],
            },
            'sword.active',
            always,
        );
        assert.equal(problems.length, 1);
        assert.match(problems[0], /not a usable vanilla particle identifier/);
    });

    it('rejects a particle that needs Molang context, and names the sibling to use', () => {
        const problems = validateBinding(
            {
                activation: 'use',
                abilityId: 'custom_swords:shockwave',
                cooldownTicks: 60,
                particles: [{ id: 'minecraft:electric_spark_particle', count: 3, at: 'caster' }],
            },
            'sword.active',
            always,
        );
        assert.equal(problems.length, 1);
        assert.match(problems[0], /Molang variables/);
        assert.match(problems[0], /minecraft:endrod/);
    });

    // Regression: the fourteen elemental sound presets were never defined, and
    // SoundService silently treated the names as raw vanilla sound ids.
    it('rejects a sound name that is not a SOUND_LIBRARY preset', () => {
        const problems = validateBinding(
            {
                activation: 'use',
                abilityId: 'custom_swords:shockwave',
                cooldownTicks: 60,
                sounds: { cast: 'inferno_cast_typo' },
            },
            'sword.active',
            always,
        );
        assert.equal(problems.length, 1);
        assert.match(problems[0], /not a preset in SOUND_LIBRARY/);
    });

    it('rejects an unknown visual profile', () => {
        const problems = validateBinding(
            { activation: 'use', abilityId: 'custom_swords:shockwave', cooldownTicks: 60, visual: 'flamey' },
            'sword.active',
            always,
        );
        assert.equal(problems.length, 1);
        assert.match(problems[0], /not a visual profile/);
    });

    it('collects problems from every sub-block at once', () => {
        const problems = validateBinding(
            {
                activation: 'use',
                abilityId: 'custom_swords:shockwave',
                targeting: { type: 'area' },
                effects: [{ effect: 'slowness' }],
                particles: [{}],
                sounds: { nope: 'x' },
            },
            'sword.active',
            always,
        );
        assert.ok(problems.some((p) => p.includes('targeting')));
        assert.ok(problems.some((p) => p.includes('effects')));
        assert.ok(problems.some((p) => p.includes('particles')));
        assert.ok(problems.some((p) => p.includes('sounds')));
    });
});
