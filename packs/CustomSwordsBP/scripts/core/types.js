/**
 * Shared JSDoc type definitions for the Custom Swords framework.
 *
 * This module exports nothing at runtime; it exists so that every other module
 * can reference one canonical set of shapes via `import('./types.js').Foo`.
 * Keeping the data model in one file is what lets sword definitions stay pure
 * data that both the game runtime and the Node build tools can consume.
 */

/**
 * Rarity tier id. The tiers themselves — order, label, colour — are defined
 * once in `core/rarity.js`; this alias exists so definitions read clearly.
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
 * @property {number} [swingDuration] Seconds for the swing animation, via `minecraft:swing_duration`
 *   (requires item format_version 1.21.120). Visual only — it does not change attack speed or damage.
 *   Vanilla's default swing is about 0.3s; a heavier sword reads better nearer 0.4-0.5.
 * @property {RecipeSpec} recipe How the sword is crafted. Required — see `tools/validate.mjs`.
 */

/**
 * A shaped crafting-table recipe, in the project's own shorthand.
 *
 * Compiled to `minecraft:recipe_shaped` JSON by `tools/generate.mjs`. Kept as
 * sword data rather than hand-written JSON for the same reason the item
 * definitions are: with 25 swords, a recipe file maintained separately from the
 * sword drifts from it, and the drift is invisible until someone tries to craft
 * one.
 *
 * `pattern` is 1–3 rows of at most 3 characters; a space means an empty slot.
 * Every non-space character must appear in `key`, and every `key` value must be
 * a real vanilla item identifier — checked at build time against
 * `tools/data/vanilla_items.json`, because a recipe naming an item that does
 * not exist simply never registers, with no error anywhere.
 *
 * @typedef {Object} RecipeSpec
 * @property {readonly string[]} pattern Rows of the crafting grid, e.g. `['X', 'X', 'I']`.
 * @property {Readonly<Record<string, string>>} key Pattern character → vanilla item identifier.
 * @property {string} [unlockedBy] Item that reveals the recipe in the recipe book. Defaults to the rarest key item.
 */

/**
 * How an ability picks what it acts on.
 *
 * Targeting is declared as data on the binding rather than hard-coded inside
 * each ability, so the same ability can be a tight single-target strike on one
 * sword and a wide area burst on another. `TargetingService.resolve` turns this
 * into a concrete entity list.
 *
 * @typedef {Object} TargetingSpec
 * @property {'self' | 'single' | 'area' | 'cone' | 'ray' | 'point'} type
 *   `self` acts on the caster only and finds no entities;
 *   `single` takes the first entity along the view vector;
 *   `area` takes everything within `range` of the caster;
 *   `cone` narrows `area` to `angleDegrees` around the view vector;
 *   `ray` behaves like `single` but is documented separately so future
 *   piercing/multi-hit rays can extend it without changing existing swords;
 *   `point` resolves a world location the caster is looking at and finds no
 *   entities, for ground-targeted and projectile-style abilities.
 * @property {number} [range] Blocks. Ignored for `self`. Clamped to `config.targeting.maxRange`.
 * @property {number} [maxTargets] Clamped to `config.targeting.maxTargets`.
 * @property {number} [angleDegrees] Full cone width; required in practice for `cone`.
 * @property {boolean} [includeCaster] Defaults to false — abilities do not hit their own user.
 * @property {boolean} [includePlayers] Defaults to `config.combat.allowPlayerVersusPlayer`.
 */

/**
 * A status effect an ability applies. Declared on the binding so a sword can
 * change what its ability inflicts without touching ability code.
 *
 * @typedef {Object} EffectSpec
 * @property {string} effect Effect type id, e.g. `slowness`.
 * @property {number} durationTicks
 * @property {number} [amplifier] 0-based, matching the engine. Defaults to 0.
 * @property {boolean} [showParticles] Defaults to true.
 */

/**
 * A particle burst. `id` must be a valid particle identifier; the foundation
 * uses vanilla ids only.
 *
 * @typedef {Object} ParticleSpec
 * @property {string} id
 * @property {number} [count] Clamped to `config.particles.maxPerEmit`.
 * @property {number} [spread] Random offset radius, in blocks.
 * @property {'caster' | 'target'} [at] Where to emit. Defaults to `caster`.
 * @property {{ r: number, g: number, b: number, a?: number }} [color] Sets the `variable.color` Molang variable.
 */

/**
 * The two sound slots an ability invocation can fill. Each is either a preset
 * name from `SOUND_LIBRARY` or a raw vanilla sound id.
 *
 * @typedef {Object} SoundSlots
 * @property {string} [cast] Played at the caster when the ability fires.
 * @property {string} [impact] Played at each target that was affected.
 */

/**
 * How an ability pushes what it hits.
 *
 * Both components are clamped by `config.combat.maxKnockback*`, so a
 * mis-authored definition cannot fling a player out of the world.
 *
 * @typedef {Object} KnockbackSpec
 * @property {number} [horizontal] Force away from the origin.
 * @property {number} [vertical] Upward strength.
 * @property {{ x: number, y: number, z: number }} [from] Point to push away from. Defaults to the caster's feet.
 * @property {{ x: number, y: number, z: number }} [direction] Explicit direction; overrides `from`.
 * @property {boolean} [pull] Reverse the push, dragging targets inward.
 */

/**
 * Conditions the caster must satisfy before an ability may run.
 *
 * Restrictions are declared as data so a designer can gate an ability without
 * writing code, and so the gate runs in one place — before the cooldown is
 * consumed. Every field is optional; an absent field is not checked.
 *
 * Only conditions the engine can answer cheaply and reliably are supported.
 *
 * @typedef {Object} RestrictionSpec
 * @property {number} [minHealth] Caster must have at least this much health remaining.
 * @property {boolean} [requireGrounded] Caster must be standing on the ground.
 * @property {boolean} [forbidInWater] Caster must not be in water.
 * @property {string[]} [dimensions] Allowed dimension ids, e.g. `['minecraft:nether']`.
 */

/**
 * Binds one registered ability to one sword.
 *
 * A binding is the complete *invocation envelope*: which ability, how it is
 * aimed, what it costs, and how it looks and sounds. The same ability bound
 * twice with different envelopes yields two swords that feel genuinely
 * different — that is the core of the reuse strategy, and the reason there is
 * no per-sword ability code.
 *
 * `params` is reserved for numbers only the ability itself understands (a
 * damage figure, a chance roll). Anything the framework can interpret —
 * targeting, effects, particles, sounds — is a typed field instead, so it can
 * be validated at build time rather than discovered at runtime.
 *
 * @typedef {Object} AbilityBinding
 * @property {import('./activation.js').ActivationMethod} activation How the player triggers it.
 * @property {string} abilityId Id of an ability in the ability registry.
 * @property {number} [cooldownTicks] Defaults to 0 (no cooldown).
 * @property {string} [cooldownKey] Share a cooldown across several bindings. Defaults to `<swordId>#<activation>`.
 * @property {string} [hudCategory] Vanilla item-cooldown category to mirror onto the HUD.
 * @property {string} [label] Player-facing name for this binding, overriding the ability's own.
 *   Lets a sword present "Frost Nova" while binding the generic, reusable `nova` ability — the
 *   ability id stays a behaviour name so other swords can bind it, and the flavour lives with
 *   the sword that owns it.
 * @property {TargetingSpec} [targeting] Defaults to `{ type: 'self' }`.
 * @property {EffectSpec[]} [effects] Applied to each affected target.
 * @property {ParticleSpec[]} [particles]
 * @property {SoundSlots} [sounds]
 * @property {readonly string[]} [allowedTargets]
 *   Target category ids this ability may affect — see `core/target_categories.js`.
 *   Defaults to `['any']`. Applied by targeting AND re-checked by the damage
 *   system, so an ability cannot bypass it by finding entities another way.
 * @property {KnockbackSpec} [knockback] Default push applied by the combat system.
 * @property {RestrictionSpec} [restrictions] Checked before the cooldown is consumed.
 * @property {Record<string, unknown>} [params] Merged over the ability's `defaults`.
 */

/**
 * A complete sword. Pure data — no engine imports, no functions.
 *
 * @typedef {Object} SwordDefinition
 * @property {string} id Fully-qualified item identifier, e.g. `custom_swords:ember_blade`.
 * @property {string} name Display name shown in-game (before rarity colouring).
 * @property {SwordRarity} rarity
 * @property {string} description One-line summary used in docs and in the item tooltip.
 * @property {string} [texture] Resource-pack texture shortname. Defaults to the id's local part.
 * @property {SwordItemStats} item
 * @property {AbilityBinding[]} abilities One binding per activation method. A sword may bind several.
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
 * What triggered an ability invocation. Re-exported from `activation.js` so
 * definitions can refer to one name.
 *
 * @typedef {import('./activation.js').ActivationMethod} AbilityTrigger
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
 * @property {AbilityTrigger} activation The method that triggered this invocation.
 * @property {import('@minecraft/server').Entity} [target] Present for melee activations.
 * @property {TargetingSpec} targeting Resolved from the binding; always present, defaulting to `{ type: 'self' }`.
 * @property {readonly EffectSpec[]} effects From the binding; empty when none are declared.
 * @property {readonly ParticleSpec[]} particles From the binding; empty when none are declared.
 * @property {SoundSlots} sounds From the binding; empty object when none are declared.
 * @property {readonly string[]} allowedTargets Resolved target categories; always present.
 * @property {KnockbackSpec | undefined} knockback From the binding, when declared.
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
 * @property {import('../systems/movement.js').MovementService} movement Safe repositioning of the caster.
 * @property {import('../systems/environment.js').EnvironmentService} environment World conditions — daylight, dimension.
 * @property {import('../systems/sounds.js').SoundService} sounds
 * @property {import('../systems/feedback.js').FeedbackService} feedback
 * @property {import('../systems/combat.js').CombatSystem} combat
 * @property {import('./cooldown_manager.js').CooldownManager} cooldowns
 * @property {import('./player_state.js').PlayerStateStore} state
 * @property {typeof import('./log.js').log} log
 * @property {typeof import('../config.js').CONFIG} config
 */

export {};
