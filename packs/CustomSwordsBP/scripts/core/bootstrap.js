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

import * as mc from '@minecraft/server';
import { ItemStack, system, world } from '@minecraft/server';

import { CONFIG } from '../config.js';
import { log } from './log.js';
import { NAMESPACE, GUIDE_COMPONENT_ID, GUIDE_ITEM_ID } from './identifiers.js';
import { SwordRegistry } from './sword_registry.js';
import { AbilityRegistry } from './ability_registry.js';
import { ItemIdentifier } from './item_identifier.js';
import { Diagnostics } from './diagnostics.js';
import { CooldownManager } from './cooldown_manager.js';
import { PlayerStateStore } from './player_state.js';
import { AbilityGate } from './ability_gate.js';
import { AbilityExecutor } from './ability_executor.js';
import { InputRouter } from './input_router.js';
import { AbilitySelector } from './ability_selector.js';
import { validateAbilityDefinition, validateSwordDefinition } from './definition_validator.js';

import { TargetingService } from '../systems/targeting.js';
import { DamageService } from '../systems/damage.js';
import { EffectService } from '../systems/effects.js';
import { ParticleService } from '../systems/particles.js';
import { MovementService } from '../systems/movement.js';
import { SoundService } from '../systems/sounds.js';
import { FeedbackService } from '../systems/feedback.js';
import { CombatSystem } from '../systems/combat.js';
import { EnvironmentService } from '../systems/environment.js';
import { FxService } from '../systems/fx.js';
import { GuideUi } from '../systems/guide_ui.js';

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
 * @param {{ getTimeOfDay: () => number }} [options.worldClock] World time source; defaults to the engine.
 * @returns {{
 *   abilities: AbilityRegistry,
 *   swords: SwordRegistry,
 *   identifier: ItemIdentifier,
 *   diagnostics: Diagnostics,
 *   services: import('./types.js').ServiceContainer,
 *   gate: AbilityGate,
 *   executor: AbilityExecutor,
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

    // --- Abilities ---------------------------------------------------------
    const abilities = new AbilityRegistry();
    for (const ability of abilityDefinitions) {
        const issues = validateAbilityDefinition(ability);
        if (issues.length > 0) {
            problems.push(...issues);
            continue; // Never register a malformed ability.
        }
        try {
            abilities.register(ability);
        } catch (error) {
            problems.push(String(error instanceof Error ? error.message : error));
        }
    }
    abilities.seal();

    // --- Swords ------------------------------------------------------------
    const swords = new SwordRegistry();
    for (const sword of swordDefinitions) {
        const issues = validateSwordDefinition(sword, (id) => abilities.has(id));
        if (issues.length > 0) {
            problems.push(...issues);
            continue;
        }
        problems.push(...validateBindingParams(sword, abilities));
        try {
            swords.register(sword);
        } catch (error) {
            problems.push(String(error instanceof Error ? error.message : error));
            continue;
        }
        // Record the reverse index once the sword is known to be sound, so
        // `abilities.swordsUsing(id)` can answer "what would I break?".
        for (const binding of sword.abilities) {
            abilities.link(binding.abilityId, sword.id, binding.activation);
        }
    }
    swords.seal();

    const identifier = new ItemIdentifier({ swords });
    const diagnostics = new Diagnostics({ swords, abilities, identifier, log });

    // --- Services ----------------------------------------------------------
    const cooldowns = new CooldownManager(clock);
    const state = new PlayerStateStore();
    const targeting = new TargetingService(CONFIG, log, {
        worldPvp: options.worldPvp ?? (() => /** @type {any} */ (world).gameRules?.pvp !== false),
    });
    const sounds = new SoundService(log);
    const damage = new DamageService(CONFIG, targeting, log);
    const effects = new EffectService(log);
    const particles = new ParticleService(CONFIG, log);
    const movement = new MovementService(CONFIG, log);
    const fx = new FxService(CONFIG, particles, log, options.fxScheduler ? { schedule: options.fxScheduler } : {});
    const environment = new EnvironmentService(log, options.worldClock);
    const feedback = new FeedbackService(CONFIG, sounds, log);
    const combat = new CombatSystem({ config: CONFIG, damage, effects, particles, sounds, cooldowns });

    /** @type {import('./types.js').ServiceContainer} */
    const services = {
        targeting,
        damage,
        effects,
        particles,
        fx,
        sounds,
        feedback,
        movement,
        environment,
        combat,
        cooldowns,
        state,
        log,
        config: CONFIG,
    };

    // --- Engine ------------------------------------------------------------
    const gate = new AbilityGate({ abilities, identifier, cooldowns, config: CONFIG, log });
    const executor = new AbilityExecutor({ abilities, gate, services, clock });
    const selector = new AbilitySelector({ swords, log });
    const router = new InputRouter({ identifier, swords, executor, selector, feedback, clock, config: CONFIG, log });
    const guide = new GuideUi(swordDefinitions, log);

    return { abilities, swords, identifier, diagnostics, services, gate, executor, selector, router, guide, problems };
}

/**
 * Runs each ability's own `validateParams` against the merged parameters a
 * sword actually binds. Catches "this sword passes damage: -1" at load time
 * instead of the first time a player swings it.
 *
 * @param {SwordDefinition} sword
 * @param {AbilityRegistry} abilities
 * @returns {string[]}
 */
function validateBindingParams(sword, abilities) {
    /** @type {string[]} */
    const problems = [];
    for (const binding of sword.abilities ?? []) {
        const ability = abilities.get(binding.abilityId);
        if (ability?.validateParams === undefined) continue;
        const merged = { ...(ability.defaults ?? {}), ...(binding.params ?? {}) };
        for (const issue of ability.validateParams(merged)) {
            problems.push(`${sword.id}[${binding.activation}] -> ${ability.id}: ${issue}`);
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
            registerGuideBook(framework, event.itemComponentRegistry);
        } catch (error) {
            log.error('Startup failed:', error);
        }
    });

    subscribePlayerLifecycle(framework);
    subscribeSneakSwitching(framework);

    // Diagnostics are exposed as script events rather than a tick loop, so they
    // cost one namespace-filtered subscription and nothing else.
    system.afterEvents.scriptEventReceive.subscribe((event) => framework.diagnostics.handle(event), {
        namespaces: [NAMESPACE],
    });

    world.afterEvents.worldLoad.subscribe(() => {
        const shipped = framework.swords.shipped().length;
        const diagnosticItems = framework.swords.testItems().length;
        log.info(
            `v${CONFIG.version} ready - ${framework.swords.size} sword(s) ` +
                `(${shipped} shipped, ${diagnosticItems} diagnostic), ` +
                `${framework.abilities.size} ability(ies). ` +
                `Run '/scriptevent ${NAMESPACE}:list' in game to inspect the registry.`,
        );
        const unused = framework.abilities.unused();
        if (unused.length > 0) {
            log.warn(`Registered but unbound ability(ies): ${unused.join(', ')}.`);
        }
        startMaintenance(framework);
    });

    return framework;
}

/**
 * Per-player state hygiene.
 *
 * Three distinct moments, each clearing a different amount:
 *
 *  - **disconnect** — everything. No stale handles, no cooldowns leaking into
 *    whoever reuses that player slot.
 *  - **death** — life-scoped state only. A combo or a charge does not survive
 *    dying; a cooldown does, because dying to reset a long cooldown would be an
 *    exploit.
 *  - **respawn** — life-scoped state again, as a backstop for the case where a
 *    death event was missed.
 *
 * `entityDie` is filtered to players at subscription time, so the handler does
 * not run for every mob that dies in the world.
 *
 * Exported so the edge-case suite can install it without booting the whole
 * addon; `start()` is the only caller in the game.
 *
 * @param {ReturnType<typeof createFramework>} framework
 */
export function subscribePlayerLifecycle(framework) {
    const { cooldowns, state } = framework.services;

    world.afterEvents.playerLeave.subscribe(({ playerId }) => {
        cooldowns.clearPlayer(playerId);
        state.clearPlayer(playerId);
        framework.selector?.clearPlayer(playerId);
        framework.router?.forgetPlayer(playerId);
        log.debug(`Cleared runtime state for departed player ${playerId}.`);
    });

    world.afterEvents.entityDie.subscribe(
        (event) => {
            const dead = event.deadEntity;
            if (dead?.typeId !== 'minecraft:player') return;
            try {
                state.clearLifeScope(dead.id);
            } catch (error) {
                log.debug('Death cleanup skipped:', error);
            }
        },
        { entityTypes: ['minecraft:player'] },
    );

    world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
        if (initialSpawn) {
            // A first join has nothing to clear, but may be owed a guide book.
            giveGuideOnce(player);
            return;
        }
        try {
            state.clearLifeScope(player.id);
        } catch (error) {
            log.debug('Respawn cleanup skipped:', error);
        }
    });
}

/** Player dynamic property recording that the guide book was handed out. */
export const GUIDE_GIVEN_PROPERTY = `${NAMESPACE}:guide_given`;

/**
 * The guide book opens its menu on use.
 *
 * @param {ReturnType<typeof createFramework>} framework
 * @param {import('@minecraft/server').ItemComponentRegistry} registry
 */
export function registerGuideBook(framework, registry) {
    registry.registerCustomComponent(GUIDE_COMPONENT_ID, {
        onUse: (event) => {
            const player = event.source;
            if (player?.typeId !== 'minecraft:player') return;
            void framework.guide.open(/** @type {any} */ (player));
        },
    });
}

/**
 * Hands a player one guide book the first time they join a world with the
 * add-on, and never again — losing it is fixed by crafting another.
 *
 * @param {import('@minecraft/server').Player} player
 * @returns {boolean} Whether a book was given.
 */
export function giveGuideOnce(player) {
    if (!CONFIG.guide.giveOnFirstJoin) return false;
    try {
        if (player.getDynamicProperty(GUIDE_GIVEN_PROPERTY) === true) return false;
        const inventory = /** @type {any} */ (player.getComponent('minecraft:inventory'));
        const container = inventory?.container;
        if (container === undefined) return false;
        const leftover = container.addItem(new ItemStack(GUIDE_ITEM_ID, 1));
        // A full inventory hands the book back; drop it at the player's feet.
        if (leftover !== undefined) player.dimension.spawnItem(leftover, player.location);
        player.setDynamicProperty(GUIDE_GIVEN_PROPERTY, true);
        return true;
    } catch (error) {
        log.debug('Guide book not given:', error);
        return false;
    }
}

/**
 * Crouch ability switching (on the way down).
 *
 * `playerButtonInput` is looked up through the module namespace rather than
 * imported by name: a named import the engine does not export fails the whole
 * script at link time, which would take every sword down on an older client.
 * Read this way, a missing event leaves crouch + use as the way to switch.
 *
 * The subscription is filtered to the sneak button, so the handler never runs
 * for jumps or any other input.
 *
 * Exported for the test suite; `start()` is the only caller in the game.
 *
 * @param {ReturnType<typeof createFramework>} framework
 * @returns {boolean} Whether crouch switching is active.
 */
export function subscribeSneakSwitching(framework) {
    const signal = world.afterEvents.playerButtonInput;
    const InputButton = /** @type {any} */ (mc).InputButton;
    const ButtonState = /** @type {any} */ (mc).ButtonState;
    if (signal === undefined || InputButton?.Sneak === undefined || ButtonState?.Pressed === undefined) {
        log.info('Sneak-button event unavailable; crouch + use switches abilities.');
        return false;
    }
    try {
        world.afterEvents.playerButtonInput.subscribe(
            (event) => {
                try {
                    framework.router.handleSneakButton(event.player, event.newButtonState === ButtonState.Pressed);
                } catch (error) {
                    log.debug('Sneak switch skipped:', error);
                }
            },
            // Presses only: the switch happens on the way down, so releases
            // never need to reach the script at all.
            { buttons: [InputButton.Sneak], state: ButtonState.Pressed },
        );
    } catch (error) {
        log.warn('Could not subscribe to sneak input; crouch + use switches abilities.', error);
        return false;
    }
    framework.router.enableTapSwitching();
    return true;
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
            const live = world.getAllPlayers().map((player) => player.id);
            const dropped = framework.services.state.retainOnly(live) + framework.selector.retainOnly(live);
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
