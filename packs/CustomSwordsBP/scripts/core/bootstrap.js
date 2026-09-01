/**
 * Framework wiring and lifecycle.
 *
 * Scripting V2 runs the module body and `system.beforeEvents.startup` in EARLY
 * EXECUTION, before the world exists. Touching `world.getAllPlayers()`, blocks
 * or entities there throws. So the lifecycle is split deliberately:
 *
 *   early execution (startup)
 *     - build registries and services (pure objects, no world access)
 *     - validate every definition and report problems to the content log
 *     - register the item custom component (must happen before item JSON loads)
 *     - subscribe to events (subscribing is allowed in early execution)
 *
 *   world load (worldLoad)
 *     - log a readiness banner
 *     - start the single maintenance interval
 *
 * See docs/API_NOTES.md for the exact API version contract.
 */

import { system, world } from '@minecraft/server';

import { CONFIG } from '../config.js';
import { log } from './log.js';
import { Registry } from './registry.js';
import { CooldownManager } from './cooldown_manager.js';
import { PlayerStateStore } from './player_state.js';
import { AbilityExecutor } from './ability_executor.js';
import { InputRouter } from './input_router.js';
import { validateAbilityDefinition, validateSwordDefinition } from './definition_validator.js';

import { TargetingService } from '../systems/targeting.js';
import { DamageService } from '../systems/damage.js';
import { EffectService } from '../systems/effects.js';
import { ParticleService } from '../systems/particles.js';
import { SoundService } from '../systems/sounds.js';
import { FeedbackService } from '../systems/feedback.js';
import { CombatSystem } from '../systems/combat.js';

import { ABILITIES } from '../abilities/index.js';
import { SWORDS } from '../swords/index.js';

/** @typedef {import('./types.js').AbilityDefinition} AbilityDefinition */
/** @typedef {import('./types.js').SwordDefinition} SwordDefinition */

/**
 * Builds every registry and service. Pure: no engine state is read, so this is
 * safe in early execution and callable from unit tests.
 *
 * @param {object} [options]
 * @param {readonly AbilityDefinition[]} [options.abilities]
 * @param {readonly SwordDefinition[]} [options.swords]
 * @param {() => number} [options.clock]
 * @returns {{
 *   abilities: Registry<AbilityDefinition>,
 *   swords: Registry<SwordDefinition>,
 *   services: import('./types.js').ServiceContainer,
 *   executor: AbilityExecutor,
 *   combat: CombatSystem,
 *   router: InputRouter,
 *   problems: string[]
 * }}
 */
export function createFramework(options = {}) {
    const abilityDefinitions = options.abilities ?? ABILITIES;
    const swordDefinitions = options.swords ?? SWORDS;
    const clock = options.clock ?? (() => system.currentTick);

    /** @type {string[]} */
    const problems = [];

    /** @type {Registry<AbilityDefinition>} */
    const abilities = new Registry('ability');
    for (const ability of abilityDefinitions) {
        const issues = validateAbilityDefinition(ability);
        if (issues.length > 0) {
            problems.push(...issues);
            continue; // Never register a malformed ability.
        }
        try {
            abilities.register(ability.id, ability);
        } catch (error) {
            problems.push(String(error instanceof Error ? error.message : error));
        }
    }
    abilities.seal();

    /** @type {Registry<SwordDefinition>} */
    const swords = new Registry('sword');
    for (const sword of swordDefinitions) {
        const issues = validateSwordDefinition(sword, (id) => abilities.has(id));
        if (issues.length > 0) {
            problems.push(...issues);
            continue;
        }
        problems.push(...validateBindingParams(sword, abilities));
        try {
            swords.register(sword.id, sword);
        } catch (error) {
            problems.push(String(error instanceof Error ? error.message : error));
        }
    }
    swords.seal();

    const cooldowns = new CooldownManager(clock);
    const state = new PlayerStateStore();
    const targeting = new TargetingService(CONFIG, log);
    const sounds = new SoundService(log);
    const damage = new DamageService(CONFIG, targeting, log);
    const effects = new EffectService(log);
    const particles = new ParticleService(CONFIG, log);
    const feedback = new FeedbackService(CONFIG, sounds, log);

    /** @type {import('./types.js').ServiceContainer} */
    const services = { targeting, damage, effects, particles, sounds, feedback, cooldowns, state, log, config: CONFIG };

    const executor = new AbilityExecutor({ abilities, services, clock });
    const combat = new CombatSystem({ executor });
    const router = new InputRouter({ swords, executor, combat, log });

    return { abilities, swords, services, executor, combat, router, problems };
}

/**
 * Runs each ability's own `validateParams` against the merged parameters a
 * sword actually binds. Catches "this sword passes radius: -1" at load time
 * instead of the first time a player swings it.
 *
 * @param {SwordDefinition} sword
 * @param {Registry<AbilityDefinition>} abilities
 * @returns {string[]}
 */
function validateBindingParams(sword, abilities) {
    /** @type {string[]} */
    const problems = [];
    for (const [trigger, binding] of [
        ['active', sword.active],
        ['passive', sword.passive],
    ]) {
        if (binding === undefined) continue;
        const ability = abilities.get(binding.abilityId);
        if (ability?.validateParams === undefined) continue;
        const merged = { ...(ability.defaults ?? {}), ...(binding.params ?? {}) };
        for (const issue of ability.validateParams(merged)) {
            problems.push(`${sword.id}.${trigger} -> ${ability.id}: ${issue}`);
        }
    }
    return problems;
}

/**
 * Installs the framework into the running game. Call exactly once from
 * `main.js`.
 */
export function start() {
    const framework = createFramework();

    // Early execution: build state, register the component, subscribe.
    system.beforeEvents.startup.subscribe((event) => {
        try {
            reportProblems(framework.problems);
            framework.router.register(event.itemComponentRegistry);
        } catch (error) {
            log.error('Startup failed:', error);
        }
    });

    // Releasing per-player memory the moment a player disconnects is the whole
    // multiplayer hygiene story: no stale handles, no cooldowns leaking into
    // whoever reuses that slot.
    world.afterEvents.playerLeave.subscribe(({ playerId }) => {
        framework.services.cooldowns.clearPlayer(playerId);
        framework.services.state.clearPlayer(playerId);
        log.debug(`Cleared runtime state for departed player ${playerId}.`);
    });

    world.afterEvents.worldLoad.subscribe(() => {
        log.info(
            `v${CONFIG.version} ready - ${framework.swords.size} sword(s), ${framework.abilities.size} ability(ies).`,
        );
        startMaintenance(framework);
    });

    return framework;
}

/**
 * The addon's ONLY recurring timer. It does no gameplay work: it just releases
 * memory for players who are gone. Every gameplay path is event-driven.
 *
 * @param {ReturnType<typeof createFramework>} framework
 */
function startMaintenance(framework) {
    system.runInterval(() => {
        try {
            const expired = framework.services.cooldowns.sweep();
            const dropped = framework.services.state.retainOnly(world.getAllPlayers().map((player) => player.id));
            if (expired > 0 || dropped > 0) {
                log.debug(`Maintenance: ${expired} cooldown(s) expired, ${dropped} state bucket(s) dropped.`);
            }
        } catch (error) {
            log.warn('Maintenance sweep failed:', error);
        }
    }, CONFIG.cooldown.sweepIntervalTicks);
}

/**
 * @param {string[]} problems
 */
function reportProblems(problems) {
    if (problems.length === 0) return;
    log.error(`${problems.length} definition problem(s) found; those definitions were NOT registered:`);
    for (const problem of problems) log.error(`  - ${problem}`);
}
