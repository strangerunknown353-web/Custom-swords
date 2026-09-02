/**
 * The final pass — regressions for the defects found auditing v0.12.0.
 *
 * Both of the bugs guarded here share a shape: **something that looked like it
 * was working because it never said anything.** A validation gate that checks
 * nothing reports no problems, and a lethal hit that aborts an ability looks
 * from the outside like an ability that simply missed. Neither shows up in a
 * green build, so both get a test that fails loudly if they come back.
 *
 * | Guard | The bug it locks out |
 * |---|---|
 * | every binding is parameter-checked | the build gate reading a field no definition has |
 * | a killed target does not abort the sweep | one dead mob cancelling the damage owed to the rest |
 * | a lethal passive still resolves | reading a released handle to draw the blow that killed it |
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
    MockDimension,
    MockEntity,
    MockItemComponentRegistry,
    MockItemStack,
    MockPlayer,
    resetMocks,
} from '../mocks/minecraft_server.mjs';
import { createFramework } from '../../packs/CustomSwordsBP/scripts/core/bootstrap.js';
import { SWORD_COMPONENT_ID } from '../../packs/CustomSwordsBP/scripts/core/input_router.js';
import { SWORDS } from '../../packs/CustomSwordsBP/scripts/swords/index.js';
import { validateDamageCause } from '../../packs/CustomSwordsBP/scripts/core/definition_validator.js';
import { ABILITIES } from '../../packs/CustomSwordsBP/scripts/abilities/index.js';

let tick = 0;
const clock = () => tick;

function install() {
    const framework = createFramework({ clock });
    const registry = new MockItemComponentRegistry();
    framework.router.register(registry);
    return registry.components.get(SWORD_COMPONENT_ID);
}

function wielder(dimension, sword) {
    const player = new MockPlayer({ id: 'p', location: { x: 0, y: 64, z: 0 }, dimension });
    player.setMainhand(new MockItemStack(sword));
    player.viewDirection = { x: 0, y: 0, z: 1 };
    dimension.entities.push(player);
    return player;
}

function mob(dimension, id, { x = 0, z = 0 } = {}) {
    const entity = new MockEntity({ id, location: { x, y: 64, z }, dimension });
    dimension.entities.push(entity);
    return entity;
}

const damageOf = (entity) => entity.damageTaken.reduce((sum, d) => sum + d.amount, 0);

// ---------------------------------------------------------------------------
// The build gate that checked nothing
// ---------------------------------------------------------------------------

describe('ability parameter validation actually runs', () => {
    it('reaches every binding of every sword', () => {
        // Mirrors `tools/validate.mjs` exactly, including the defaults/params
        // merge the executor performs. The point is the *count*: the shipped
        // gate read `sword.active` and `sword.passive`, fields no definition
        // has ever carried, so it silently validated zero bindings while
        // reporting a clean build.
        let checked = 0;
        /** @type {string[]} */
        const problems = [];

        for (const sword of SWORDS) {
            assert.ok(
                Array.isArray(sword.abilities),
                `${sword.id} must carry its bindings in 'abilities' — the gate reads that field`,
            );
            for (const binding of sword.abilities) {
                const ability = ABILITIES.find((a) => a.id === binding.abilityId);
                assert.ok(ability !== undefined, `${sword.id} binds unknown ability '${binding.abilityId}'`);
                if (ability.validateParams === undefined) continue;
                const merged = { ...(ability.defaults ?? {}), ...(binding.params ?? {}) };
                for (const problem of ability.validateParams(merged)) {
                    problems.push(`${sword.id}.${binding.activation} -> ${ability.id}: ${problem}`);
                }
                checked++;
            }
        }

        assert.equal(problems.join('\n'), '', 'every binding must satisfy its own ability validator');
        assert.equal(checked, 32, 'all 16 swords contribute both of their bindings to the gate');
    });
});

// ---------------------------------------------------------------------------
// A target that dies mid-sweep
// ---------------------------------------------------------------------------

describe('a killed target does not abort the ability', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    it('damages the rest of the list after the first target is released', () => {
        const dimension = new MockDimension();
        const component = install();
        const player = wielder(dimension, 'custom_swords:frost_sword');

        // First in the list, and killed outright by the blow — the engine takes
        // the handle with it, so every later read of its position throws.
        const dies = mob(dimension, 'm1', { z: 2 });
        dies.releaseOnDamage = true;
        const survivors = [mob(dimension, 'm2', { z: -2 }), mob(dimension, 'm3', { x: 2 })];

        tick += 400;
        component.onUse({ source: player, itemStack: new MockItemStack('custom_swords:frost_sword') });

        assert.ok(damageOf(dies) > 0, 'the target that died should still have been damaged');
        for (const survivor of survivors) {
            assert.ok(
                damageOf(survivor) > 0,
                `${survivor.id} was behind a dying mob in the list and must still have been struck`,
            );
        }
    });

    it('reports the kill as damaged rather than as a refusal', () => {
        const dimension = new MockDimension();
        const component = install();
        const player = wielder(dimension, 'custom_swords:frost_sword');
        const dies = mob(dimension, 'm1', { z: 2 });
        dies.releaseOnDamage = true;

        tick += 400;
        const result = component.onUse({
            source: player,
            itemStack: new MockItemStack('custom_swords:frost_sword'),
        });

        assert.notEqual(result?.reason, 'ability_error', 'a lethal hit must not surface as an internal error');
    });
});

describe('passives that flourish after a lethal hit', () => {
    beforeEach(() => {
        resetMocks();
        tick = 0;
    });

    // Each of these draws particles at the target *after* striking it, which is
    // precisely the read that a lethal blow invalidates.
    for (const [sword, label] of [
        ['custom_swords:thunder_sword', 'Static Charge discharge'],
        ['custom_swords:shadow_sword', 'Shadow Edge ambush'],
        ['custom_swords:solar_sword', 'Solar Radiance smite'],
    ]) {
        it(`${label} survives killing its target`, () => {
            const dimension = new MockDimension();
            const component = install();
            const player = wielder(dimension, sword);

            // A fresh victim per swing, each killed outright by the blow. Six
            // of them is enough to carry Thunder's charge counter to its
            // discharge and to open Shadow's ambush window, so the branch that
            // draws a flourish at the target is the one under test. All are
            // undead, which is also what Solar's smite keys on.
            const victims = [];
            for (let swing = 0; swing < 6; swing++) {
                const victim = new MockEntity({
                    id: `victim${swing}`,
                    typeId: 'minecraft:zombie',
                    location: { x: 0, y: 64, z: 2 },
                    dimension,
                });
                victim.releaseOnDamage = true;
                dimension.entities = [player, victim];
                victims.push(victim);

                tick += 30;
                component.onHitEntity({
                    attackingEntity: player,
                    hitEntity: victim,
                    itemStack: new MockItemStack(sword),
                    hadEffect: true,
                });
            }

            // The executor catches whatever an ability throws, so a crash is
            // invisible from the return value — it surfaces only as the
            // internal-error notice the player is shown. That notice is the
            // assertion: no swing may produce one.
            assert.deepEqual(
                player.actionBarMessages.filter((line) => line.includes('That ability failed')),
                [],
                `${label} threw while resolving a lethal hit`,
            );
            for (const victim of victims) {
                assert.ok(victim.damageTaken.length > 0, `${victim.id} should have been struck`);
            }
        });
    }
});

// ---------------------------------------------------------------------------
// The two gates added in this pass
// ---------------------------------------------------------------------------

describe('damage causes are checked against the engine enum', () => {
    it('accepts every cause the collection actually uses', () => {
        for (const cause of ['magic', 'entityAttack', 'fire', 'lightning']) {
            assert.deepEqual(
                validateDamageCause(cause, 'demo'),
                [],
                `'${cause}' is a real EntityDamageCause and must pass`,
            );
        }
    });

    it('rejects a typo and names the cause it meant', () => {
        // Bedrock accepts an unknown cause silently: the hit still lands, but
        // every cause-specific mitigation and message stops matching it. There
        // is nothing to see in game, so the build has to be the one that notices.
        const [problem] = validateDamageCause('magik', 'demo');
        assert.match(problem ?? '', /not an EntityDamageCause/);
        assert.match(problem ?? '', /magic/);
    });

    it('rejects the snake_case spelling of a camelCase member', () => {
        const [problem] = validateDamageCause('entity_attack', 'demo');
        assert.match(problem ?? '', /entityAttack/);
    });

    it('leaves an absent cause alone, since the damage layer defaults it', () => {
        assert.deepEqual(validateDamageCause(undefined, 'demo'), []);
    });
});

describe('paired bindings agree about the state they share', () => {
    it('never lets one binding write a key another does not read', () => {
        // Ember, Shadow and Time each hold a passive and an active together
        // with nothing but two matching string literals in different files.
        // A mismatch is invisible: the passive fills a meter nothing reads.
        const shared = /(Key|ChargeTicks)$/;
        /** @type {Map<string, string>} */
        const owners = new Map();
        let pairings = 0;

        for (const sword of SWORDS) {
            /** @type {Map<string, unknown>} */
            const seen = new Map();
            for (const binding of sword.abilities) {
                const ability = ABILITIES.find((a) => a.id === binding.abilityId);
                const merged = { ...(ability?.defaults ?? {}), ...(binding.params ?? {}) };
                for (const [name, value] of Object.entries(merged)) {
                    if (!shared.test(name)) continue;
                    if (seen.has(name)) {
                        pairings++;
                        assert.equal(
                            value,
                            seen.get(name),
                            `${sword.id}: both bindings must agree about '${name}'`,
                        );
                    } else {
                        seen.set(name, value);
                    }
                    if (!name.endsWith('Key') || typeof value !== 'string') continue;
                    // Keys are scoped to the player, not the sword, so two
                    // swords sharing one would collide in a single inventory.
                    const owner = owners.get(value);
                    assert.ok(
                        owner === undefined || owner === sword.id,
                        `state key '${value}' is claimed by both ${owner} and ${sword.id}`,
                    );
                    owners.set(value, sword.id);
                }
            }
        }

        assert.ok(pairings >= 4, 'the swords that pair a passive with an active must be reached');
    });
});
