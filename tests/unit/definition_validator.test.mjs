import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    RARITIES,
    validateAbilityDefinition,
    validateBinding,
    validateSwordDefinition,
} from '../../packs/CustomSwordsBP/scripts/core/definition_validator.js';

const always = () => true;

/** @param {object} overrides */
function sword(overrides = {}) {
    return {
        id: 'custom_swords:example',
        name: 'Example',
        rarity: 'rare',
        description: 'An example sword.',
        item: { attackDamage: 7, durability: 500 },
        active: { abilityId: 'custom_swords:diagnostic_pulse', cooldownTicks: 40 },
        ...overrides,
    };
}

describe('validateSwordDefinition', () => {
    it('accepts a well-formed definition', () => {
        assert.deepEqual(validateSwordDefinition(sword(), always), []);
    });

    it('rejects an identifier without a namespace', () => {
        const problems = validateSwordDefinition(sword({ id: 'example' }), always);
        assert.ok(problems.some((p) => p.includes('namespace:local_name')));
    });

    it('rejects an unknown rarity and lists the valid ones', () => {
        const problems = validateSwordDefinition(sword({ rarity: 'ultra' }), always);
        assert.ok(problems.some((p) => p.includes(RARITIES.join(', '))));
    });

    it('rejects out-of-range item stats', () => {
        assert.ok(
            validateSwordDefinition(sword({ item: { attackDamage: -1, durability: 10 } }), always).some((p) =>
                p.includes('attackDamage'),
            ),
        );
        assert.ok(
            validateSwordDefinition(sword({ item: { attackDamage: 40000, durability: 10 } }), always).some((p) =>
                p.includes('attackDamage'),
            ),
        );
        assert.ok(
            validateSwordDefinition(sword({ item: { attackDamage: 1, durability: 0 } }), always).some((p) =>
                p.includes('durability'),
            ),
        );
    });

    it('requires at least one ability binding', () => {
        const problems = validateSwordDefinition(sword({ active: undefined, passive: undefined }), always);
        assert.ok(problems.some((p) => p.includes("'active' or 'passive'")));
    });

    it('accepts a passive-only sword', () => {
        assert.deepEqual(
            validateSwordDefinition(
                sword({ active: undefined, passive: { abilityId: 'custom_swords:life_steal' } }),
                always,
            ),
            [],
        );
    });

    it('rejects a texture shortname that is not a plain lower-case name', () => {
        assert.ok(validateSwordDefinition(sword({ texture: 'custom_swords:blade' }), always).length > 0);
    });
});

describe('validateBinding', () => {
    it('flags a binding to an unregistered ability', () => {
        const problems = validateBinding({ abilityId: 'custom_swords:ghost' }, 'x.active', () => false);
        assert.ok(problems.some((p) => p.includes('unregistered ability')));
    });

    it('rejects a negative or fractional cooldown', () => {
        assert.ok(
            validateBinding({ abilityId: 'a:b', cooldownTicks: -1 }, 'x.active', always).some((p) =>
                p.includes('cooldownTicks'),
            ),
        );
        assert.ok(
            validateBinding({ abilityId: 'a:b', cooldownTicks: 1.5 }, 'x.active', always).some((p) =>
                p.includes('cooldownTicks'),
            ),
        );
    });

    it('treats an absent binding as valid', () => {
        assert.deepEqual(validateBinding(undefined, 'x.passive', always), []);
    });
});

describe('validateAbilityDefinition', () => {
    it('accepts a minimal ability', () => {
        assert.deepEqual(validateAbilityDefinition({ id: 'a:b', name: 'B', execute() {} }), []);
    });

    it('requires an execute function', () => {
        const problems = validateAbilityDefinition({ id: 'a:b', name: 'B' });
        assert.ok(problems.some((p) => p.includes("'execute'")));
    });
});
