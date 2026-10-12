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
        abilities: [{ activation: 'use', abilityId: 'custom_swords:shockwave', cooldownTicks: 40 }],
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
        const problems = validateSwordDefinition(sword({ abilities: [] }), always);
        assert.ok(problems.some((p) => p.includes('at least one ability binding')));
    });

    it('accepts an attack-only sword', () => {
        assert.deepEqual(
            validateSwordDefinition(
                sword({ abilities: [{ activation: 'attack', abilityId: 'custom_swords:life_steal' }] }),
                always,
            ),
            [],
        );
    });

    it('rejects two bindings on the same non-use activation, which would make dispatch ambiguous', () => {
        const problems = validateSwordDefinition(
            sword({
                abilities: [
                    { activation: 'attack', abilityId: 'custom_swords:a' },
                    { activation: 'attack', abilityId: 'custom_swords:b' },
                ],
            }),
            always,
        );
        assert.ok(problems.some((p) => p.includes("binds 'attack' more than once")));
    });

    it('accepts several use bindings: they are the abilities crouch cycles through', () => {
        const problems = validateSwordDefinition(
            sword({
                abilities: [
                    { activation: 'use', abilityId: 'custom_swords:a' },
                    { activation: 'use', abilityId: 'custom_swords:b' },
                    { activation: 'attack', abilityId: 'custom_swords:c' },
                ],
            }),
            always,
        );
        assert.deepEqual(problems, []);
    });

    it('caps selectable abilities by rarity', () => {
        const uses = (n) => Array.from({ length: n }, (_, i) => ({ activation: 'use', abilityId: `custom_swords:a${i}` }));
        assert.deepEqual(validateSwordDefinition(sword({ rarity: 'rare', abilities: uses(4) }), always), []);
        const problems = validateSwordDefinition(sword({ rarity: 'rare', abilities: uses(5) }), always);
        assert.ok(problems.some((p) => p.includes('exceeds the rare limit of 4')));
        assert.deepEqual(validateSwordDefinition(sword({ rarity: 'mythic', abilities: uses(7) }), always), []);
    });

    it('reserves crouch for switching once a sword has several abilities', () => {
        const problems = validateSwordDefinition(
            sword({
                abilities: [
                    { activation: 'use', abilityId: 'custom_swords:a' },
                    { activation: 'use', abilityId: 'custom_swords:b' },
                    { activation: 'sneak_use', abilityId: 'custom_swords:c' },
                ],
            }),
            always,
        );
        assert.ok(problems.some((p) => p.includes('reserved for switching')));
    });

    it('rejects an unknown activation method', () => {
        const problems = validateSwordDefinition(
            sword({ abilities: [{ activation: 'telepathy', abilityId: 'custom_swords:a' }] }),
            always,
        );
        assert.ok(problems.some((p) => p.includes("'activation' must be one of")));
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
