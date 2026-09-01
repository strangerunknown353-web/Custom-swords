/**
 * The validation gate decides whether anything happens at all. A hole here
 * means an ability firing from an empty hand, through a cooldown, or under
 * conditions its designer forbade — so every check gets its own test, plus the
 * ordering guarantee between them.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { MockItemStack, MockPlayer, MockDimension } from '../mocks/minecraft_server.mjs';
import { AbilityGate } from '../../packs/CustomSwordsBP/scripts/core/ability_gate.js';
import { AbilityRegistry } from '../../packs/CustomSwordsBP/scripts/core/ability_registry.js';
import { SwordRegistry } from '../../packs/CustomSwordsBP/scripts/core/sword_registry.js';
import { ItemIdentifier } from '../../packs/CustomSwordsBP/scripts/core/item_identifier.js';
import { CooldownManager } from '../../packs/CustomSwordsBP/scripts/core/cooldown_manager.js';
import { log } from '../../packs/CustomSwordsBP/scripts/core/log.js';
import { CONFIG } from '../../packs/CustomSwordsBP/scripts/config.js';

/** The rate limiter is exercised in its own test; disable it elsewhere. */
const NO_RATE_LIMIT = { ...CONFIG, combat: { ...CONFIG.combat, minActivationIntervalTicks: 0 } };

const SWORD_ID = 'custom_swords:probe';
const ABILITY_ID = 'custom_swords:shockwave';

let tick = 0;

function setup({ restrictions } = {}) {
    tick = 0;
    const sword = {
        id: SWORD_ID,
        name: 'Probe',
        rarity: 'common',
        description: 'A probe.',
        item: { attackDamage: 1, durability: 10 },
        abilities: [{ activation: 'use', abilityId: ABILITY_ID, restrictions }],
    };

    const swords = new SwordRegistry();
    swords.register(sword);
    swords.seal();

    const abilities = new AbilityRegistry();
    abilities.register({ id: ABILITY_ID, name: 'Shockwave', execute() {} });
    abilities.seal();

    const cooldowns = new CooldownManager(() => tick);
    const identifier = new ItemIdentifier({ swords });
    const gate = new AbilityGate({ abilities, identifier, cooldowns, config: NO_RATE_LIMIT, log });

    const dimension = new MockDimension();
    const player = new MockPlayer({ id: 'player-a', dimension });
    player.setMainhand(new MockItemStack(SWORD_ID));

    const binding = swords.require(SWORD_ID).abilities[0];
    const check = () => gate.check({ player, sword, binding, cooldownKey: 'key' });
    return { gate, player, sword, binding, cooldowns, check, dimension };
}

describe('AbilityGate', () => {
    beforeEach(() => {
        tick = 0;
    });

    it('passes when everything is in order', () => {
        assert.deepEqual(setup().check(), { ok: true });
    });

    describe('player validity', () => {
        it('refuses a removed player', () => {
            const { player, check } = setup();
            player.isValid = false;
            assert.equal(check().reason, 'invalid_player');
        });

        it('refuses a missing player without throwing', () => {
            const { gate } = setup();
            assert.doesNotThrow(() => gate.checkPlayer(undefined));
            assert.equal(gate.checkPlayer(undefined).reason, 'no_player');
        });
    });

    describe('ability existence', () => {
        it('refuses a binding to an unregistered ability', () => {
            const { gate, player, sword } = setup();
            const result = gate.check({
                player,
                sword,
                binding: { activation: 'use', abilityId: 'custom_swords:ghost' },
                cooldownKey: 'key',
            });
            assert.equal(result.reason, 'unknown_ability');
        });
    });

    describe('equipped sword', () => {
        it('refuses when the hand is empty', () => {
            const { player, check } = setup();
            player.setMainhand(undefined);
            assert.equal(check().reason, 'not_equipped');
        });

        it('refuses when the player swapped to a vanilla sword', () => {
            const { player, check } = setup();
            player.setMainhand(new MockItemStack('minecraft:diamond_sword', ['minecraft:is_sword']));
            assert.equal(check().reason, 'not_equipped');
        });

        it('refuses when the player is holding a different custom sword', () => {
            const { gate, player, binding } = setup();
            const swords = new SwordRegistry();
            const other = {
                id: 'custom_swords:other',
                name: 'Other',
                rarity: 'common',
                description: 'Other.',
                item: { attackDamage: 1, durability: 10 },
                abilities: [{ activation: 'use', abilityId: ABILITY_ID }],
            };
            swords.register(other);
            swords.seal();

            // The player holds `other` but the event carries `probe`.
            player.setMainhand(new MockItemStack(other.id));
            const identifier = new ItemIdentifier({ swords });
            const result = new AbilityGate({
                abilities: { has: () => true },
                identifier,
                cooldowns: new CooldownManager(() => 0),
                config: NO_RATE_LIMIT,
                log,
            }).check({ player, sword: { id: SWORD_ID }, binding, cooldownKey: 'key' });
            assert.equal(result.reason, 'wrong_sword');
        });
    });

    describe('restrictions', () => {
        it('refuses below the health floor and passes at or above it', () => {
            const { player, check } = setup({ restrictions: { minHealth: 10 } });
            player.setHealth(6);
            assert.equal(check().reason, 'restricted_health');
            assert.match(check().message, /10 health/);

            player.setHealth(10);
            assert.equal(check().ok, true);
        });

        it('refuses while airborne when grounding is required', () => {
            const { player, check } = setup({ restrictions: { requireGrounded: true } });
            player.isOnGround = false;
            assert.equal(check().reason, 'restricted_airborne');
            player.isOnGround = true;
            assert.equal(check().ok, true);
        });

        it('refuses in water when water is forbidden', () => {
            const { player, check } = setup({ restrictions: { forbidInWater: true } });
            player.isInWater = true;
            assert.equal(check().reason, 'restricted_water');
        });

        it('refuses outside the allowed dimensions', () => {
            const { player, check } = setup({ restrictions: { dimensions: ['minecraft:nether'] } });
            assert.equal(check().reason, 'restricted_dimension');
            player.dimension = new MockDimension('minecraft:nether');
            assert.equal(check().ok, true);
        });

        it('fails closed when a restriction cannot be evaluated', () => {
            // Break only the health read, so the earlier equipped check still
            // passes and the failure lands squarely on the restriction step.
            const { player, gate } = setup({ restrictions: { minHealth: 5 } });
            Object.defineProperty(player.components['minecraft:health'], 'currentValue', {
                get() {
                    throw new Error('engine said no');
                },
            });
            const result = gate.checkRestrictions(player, { minHealth: 5 });
            assert.equal(result.reason, 'restriction_error');
        });

        it('passes when no restrictions are declared', () => {
            assert.equal(setup().check().ok, true);
        });
    });

    describe('cooldown', () => {
        it('refuses while cooling down and reports the remaining ticks', () => {
            const { cooldowns, check } = setup();
            cooldowns.start('player-a', 'key', 40);
            const result = check();
            assert.equal(result.reason, 'cooldown');
            assert.equal(result.remainingTicks, 40);

            tick += 40;
            assert.equal(check().ok, true);
        });
    });

    it('reports the more fundamental failure first, never a misleading cooldown', () => {
        // A player holding nothing, who is also on cooldown, must be told they
        // are not holding the sword — not that the ability is recharging.
        const { player, cooldowns, check } = setup();
        cooldowns.start('player-a', 'key', 100);
        player.setMainhand(undefined);
        assert.equal(check().reason, 'not_equipped');
    });
});
