/**
 * Shared JSDoc type definitions for the Custom Swords framework.
 *
 * This module exports nothing at runtime; it exists so that every other module
 * can reference one canonical set of shapes via `import('./types.js').Foo`.
 * Keeping the data model in one file is what lets sword definitions stay pure
 * data that both the game runtime and the Node build tools can consume.
 */

/**
 * Rarity tiers. Rarity drives the display-name colour and is surfaced in
 * documentation; it has no mechanical effect on its own.
 *
 * @typedef {'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'} SwordRarity
 */

/**
 * Vanilla item statistics. These are the single source of truth: the behaviour
 * pack item JSON is GENERATED from them by `tools/generate.mjs`, so the numbers
 * a designer reads in the definition are always the numbers the game loads.
 *
 * @typedef {Object} SwordItemStats
 * @property {number} attackDamage Extra melee damage, becomes `minecraft:damage`.
 * @property {number} durability Becomes `minecraft:durability.max_durability`.
 * @property {number} [enchantValue] Becomes `minecraft:enchantable.value` (slot `sword`). Omit to make the sword unenchantable.
 * @property {string[]} [repairItems] Item ids accepted by `minecraft:repairable`.
 * @property {boolean} [glint] Force the enchanted shimmer via `minecraft:glint`.
 */

/**
 * Binds one registered ability to one sword, with the cooldown and parameters
 * that this particular sword uses. The same ability can be bound by many swords
 * with different parameters — that is the core of the reuse strategy.
 *
 * @typedef {Object} AbilityBinding
 * @property {string} abilityId Id of an ability in the {@link AbilityRegistry}.
 * @property {number} [cooldownTicks] Defaults to 0 (no cooldown).
 * @property {string} [cooldownKey] Share a cooldown across several bindings. Defaults to the sword id.
 * @property {string} [hudCategory] Vanilla item-cooldown category to mirror onto the HUD.
 * @property {Record<string, unknown>} [params] Merged over the ability's `defaults`.
 */

/**
 * A complete sword. Pure data — no engine imports, no functions.
 *
 * @typedef {Object} SwordDefinition
 * @property {string} id Fully-qualified item identifier, e.g. `custom_swords:test_blade`.
 * @property {string} name Display name shown in-game (before rarity colouring).
 * @property {SwordRarity} rarity
 * @property {string} description One-line summary used in docs and in the item tooltip.
 * @property {string} [texture] Resource-pack texture shortname. Defaults to the id's local part.
 * @property {SwordItemStats} item
 * @property {AbilityBinding} [active] Fired when the player uses (right-click / long-press) the sword.
 * @property {AbilityBinding} [passive] Fired when the sword hits an entity.
 * @property {string[]} [tags] Extra `minecraft:tags` entries.
 * @property {boolean} [isTestItem] True for diagnostic items that are NOT part of the shipped collection.
 */

/**
 * Result an ability may return. Returning nothing is equivalent to
 * `{ ok: true }`. When `ok` is false the cooldown is NOT started, so a
 * whiffed ability does not punish the player.
 *
 * @typedef {Object} AbilityResult
 * @property {boolean} ok
 * @property {string} [reason] Short machine-ish reason, e.g. `no_target`.
 * @property {string} [message] Player-facing message; shown on the action bar.
 */

/**
 * What triggered an ability invocation.
 *
 * @typedef {'use' | 'hit'} AbilityTrigger
 */

/**
 * Everything an ability is allowed to touch. Abilities receive this and nothing
 * else — they never import `@minecraft/server` and never reach for globals,
 * which is what makes them unit-testable and multiplayer-safe.
 *
 * @typedef {Object} AbilityContext
 * @property {import('@minecraft/server').Player} player
 * @property {string} playerId Stable string id; use this for any per-player storage.
 * @property {SwordDefinition} sword
 * @property {AbilityBinding} binding
 * @property {import('@minecraft/server').ItemStack | undefined} itemStack
 * @property {import('@minecraft/server').Dimension} dimension
 * @property {{ x: number, y: number, z: number }} origin Player head location at invocation time.
 * @property {{ x: number, y: number, z: number }} viewDirection
 * @property {number} currentTick
 * @property {AbilityTrigger} trigger
 * @property {import('@minecraft/server').Entity} [target] Present when `trigger` is `hit`.
 * @property {Record<string, any>} params Ability defaults merged with binding params.
 * @property {ServiceContainer} services
 */

/**
 * An ability: reusable behaviour that many swords can bind with different
 * parameters.
 *
 * @typedef {Object} AbilityDefinition
 * @property {string} id Fully-qualified, e.g. `custom_swords:diagnostic_pulse`.
 * @property {string} name Human-readable name, shown in feedback.
 * @property {string} [description]
 * @property {Record<string, any>} [defaults] Default parameter values.
 * @property {(params: Record<string, any>) => string[]} [validateParams] Returns a list of problems; empty means valid.
 * @property {(ctx: AbilityContext) => AbilityResult | void} execute
 */

/**
 * The service container handed to abilities. Injecting these rather than
 * importing them keeps abilities decoupled from the engine and from each other.
 *
 * @typedef {Object} ServiceContainer
 * @property {import('../systems/targeting.js').TargetingService} targeting
 * @property {import('../systems/damage.js').DamageService} damage
 * @property {import('../systems/effects.js').EffectService} effects
 * @property {import('../systems/particles.js').ParticleService} particles
 * @property {import('../systems/sounds.js').SoundService} sounds
 * @property {import('../systems/feedback.js').FeedbackService} feedback
 * @property {import('./cooldown_manager.js').CooldownManager} cooldowns
 * @property {import('./player_state.js').PlayerStateStore} state
 * @property {typeof import('./log.js').log} log
 * @property {typeof import('../config.js').CONFIG} config
 */

export {};
