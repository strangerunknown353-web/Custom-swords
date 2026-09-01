/**
 * The diagnostics commands are how a tester confirms in-game that the registry
 * recognises a sword — they turn "it looks right" into "the framework reports
 * it". They must never throw, whatever is typed at them.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MockItemStack, MockPlayer } from '../mocks/minecraft_server.mjs';
import { Diagnostics } from '../../packs/CustomSwordsBP/scripts/core/diagnostics.js';
import { ItemIdentifier } from '../../packs/CustomSwordsBP/scripts/core/item_identifier.js';
import { SwordRegistry } from '../../packs/CustomSwordsBP/scripts/core/sword_registry.js';
import { log } from '../../packs/CustomSwordsBP/scripts/core/log.js';

function setup() {
    const swords = new SwordRegistry();
    swords.register({
        id: 'custom_swords:test_blade',
        name: 'Test Blade',
        rarity: 'uncommon',
        description: 'Framework diagnostic sword.',
        isTestItem: true,
        item: { attackDamage: 6, durability: 250, enchantValue: 10, repairItems: ['minecraft:iron_ingot'] },
        active: {
            abilityId: 'custom_swords:diagnostic_pulse',
            cooldownTicks: 60,
            targeting: { type: 'area', range: 4 },
        },
    });
    swords.seal();

    const identifier = new ItemIdentifier({ swords });
    const diagnostics = new Diagnostics({ swords, identifier, log });
    const player = new MockPlayer({ id: 'player-a' });
    return { diagnostics, player, swords };
}

/** @param {string} id @param {MockPlayer} [player] @param {string} [message] */
function event(id, player, message = '') {
    return { id, message, sourceEntity: player, sourceType: 'Entity' };
}

describe('Diagnostics', () => {
    it('lists the registry, separating shipped swords from diagnostic items', () => {
        const { diagnostics, player } = setup();
        diagnostics.handle(event('custom_swords:list', player));

        const output = player.chatMessages.join('\n');
        assert.match(output, /1 registered — 0 shipped, 1 diagnostic/);
        assert.match(output, /Test Blade/);
        assert.match(output, /\[diagnostic\]/);
    });

    it('reports a held custom sword with its resolved stats', () => {
        const { diagnostics, player } = setup();
        player.setMainhand(new MockItemStack('custom_swords:test_blade'));
        diagnostics.handle(event('custom_swords:held', player));

        const output = player.chatMessages.join('\n');
        assert.match(output, /registered custom sword/);
        assert.match(output, /Melee damage: 7/, 'must report effective damage, not the raw component value');
        assert.match(output, /Durability: 250/);
        assert.match(output, /targeting area r=4/);
    });

    it('identifies a vanilla sword as vanilla and says it is not managed', () => {
        const { diagnostics, player } = setup();
        player.setMainhand(new MockItemStack('minecraft:diamond_sword', ['minecraft:is_sword']));
        diagnostics.handle(event('custom_swords:held', player));

        assert.match(player.chatMessages.join('\n'), /vanilla sword.*not managed by this addon/s);
    });

    it('reports an empty hand and an unrelated item distinctly', () => {
        const { diagnostics, player } = setup();
        diagnostics.handle(event('custom_swords:held', player));
        assert.match(player.chatMessages.at(-1), /main hand is empty/);

        player.setMainhand(new MockItemStack('minecraft:dirt'));
        diagnostics.handle(event('custom_swords:held', player));
        assert.match(player.chatMessages.at(-1), /is not a custom sword/);
    });

    it('looks a sword up by full id or bare local name', () => {
        const { diagnostics, player } = setup();
        diagnostics.handle(event('custom_swords:info', player, 'custom_swords:test_blade'));
        assert.match(player.chatMessages.join('\n'), /Test Blade/);

        player.chatMessages.length = 0;
        diagnostics.handle(event('custom_swords:info', player, 'test_blade'));
        assert.match(player.chatMessages.join('\n'), /Test Blade/);
    });

    it('explains itself for an unknown sword, a missing argument and an unknown command', () => {
        const { diagnostics, player } = setup();

        diagnostics.handle(event('custom_swords:info', player, 'nope'));
        assert.match(player.chatMessages.at(-1), /No sword registered as 'custom_swords:nope'/);

        diagnostics.handle(event('custom_swords:info', player, ''));
        assert.match(player.chatMessages.at(-1), /Usage:/);

        diagnostics.handle(event('custom_swords:banana', player));
        assert.match(player.chatMessages.at(-1), /Unknown command 'banana'/);
    });

    it('works without a player, as from a command block or the server console', () => {
        const { diagnostics } = setup();
        assert.doesNotThrow(() => diagnostics.handle(event('custom_swords:list', undefined)));
        assert.doesNotThrow(() => diagnostics.handle(event('custom_swords:held', undefined)));
    });

    it('never throws, whatever the event carries', () => {
        const { diagnostics, player } = setup();
        assert.doesNotThrow(() => diagnostics.handle(/** @type {any} */ ({ id: 'custom_swords:info' })));
        assert.doesNotThrow(() => diagnostics.handle(/** @type {any} */ ({})));

        // A player that vanishes mid-reply must fall back to the log.
        player.sendMessage = () => {
            throw new Error('player gone');
        };
        assert.doesNotThrow(() => diagnostics.handle(event('custom_swords:list', player)));
    });
});
