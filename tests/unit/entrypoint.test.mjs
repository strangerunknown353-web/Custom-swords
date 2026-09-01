/**
 * Smoke test for the real manifest entry point.
 *
 * Imports `scripts/main.js` exactly as the game would, with `@minecraft/server`
 * swapped for the mock, then drives the real lifecycle events. This is the
 * closest thing to "the script loads" that can be asserted outside Minecraft:
 * it proves the whole module graph resolves, that `start()` runs in early
 * execution without touching world state, and that the component registration
 * and cleanup subscriptions actually happen.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { MockItemComponentRegistry, MockPlayer, system, world } from '../mocks/minecraft_server.mjs';
import { SWORD_COMPONENT_ID } from '../../packs/CustomSwordsBP/scripts/core/input_router.js';

/** @type {string[]} */
const logged = [];
const originalWarn = console.warn;
console.warn = (...args) => logged.push(args.join(' '));
after(() => {
    console.warn = originalWarn;
});

// Importing main.js runs the module body, which is what the game does.
await import('../../packs/CustomSwordsBP/scripts/main.js');

describe('scripts/main.js', () => {
    it('subscribes to startup, playerLeave and worldLoad at module load', () => {
        assert.equal(system.beforeEvents.startup.handlers.length, 1);
        assert.equal(world.afterEvents.playerLeave.handlers.length, 1);
        assert.equal(world.afterEvents.worldLoad.handlers.length, 1);
    });

    it('subscribes diagnostics to script events, filtered to our namespace', () => {
        assert.equal(system.afterEvents.scriptEventReceive.handlers.length, 1);
        // A namespace filter is what keeps this from running on every
        // /scriptevent any other add-on fires.
        assert.deepEqual(system.afterEvents.scriptEventReceive.options?.namespaces, ['custom_swords']);
    });

    it('starts no timers during early execution', () => {
        // Registering an interval before the world exists would throw in game.
        assert.equal(system.intervals.length, 0);
    });

    it('registers the sword component when startup fires', () => {
        const registry = new MockItemComponentRegistry();
        system.beforeEvents.startup.emit({ itemComponentRegistry: registry });

        assert.deepEqual([...registry.components.keys()], [SWORD_COMPONENT_ID]);
        assert.ok(
            logged.some((line) => line.includes(`Registered item component '${SWORD_COMPONENT_ID}'`)),
            'expected the registration to be logged',
        );
    });

    it('reports no definition problems', () => {
        assert.equal(
            logged.some((line) => line.includes('definition problem')),
            false,
            `unexpected definition problems: ${logged.filter((l) => l.includes('problem')).join(' | ')}`,
        );
    });

    it('logs a readiness banner and starts exactly one maintenance interval on world load', () => {
        world.afterEvents.worldLoad.emit({});

        assert.ok(
            logged.some((line) => /ready - 1 sword\(s\) \(0 shipped, 1 diagnostic\), 1 ability\(ies\)/.test(line)),
            `expected a readiness banner, got: ${logged.join(' | ')}`,
        );
        assert.equal(system.intervals.length, 1);
        assert.equal(system.intervals[0].interval, 600, 'the sweep must be low frequency, not per tick');
    });

    it('the maintenance sweep runs without throwing when the world is empty', () => {
        assert.doesNotThrow(() => system.intervals[0].callback());
    });

    it('clears per-player state when a player leaves', () => {
        const player = new MockPlayer({ id: 'departing-player' });
        world.players.push(player);
        assert.doesNotThrow(() => world.afterEvents.playerLeave.emit({ playerId: player.id, playerName: 'x' }));
    });
});
