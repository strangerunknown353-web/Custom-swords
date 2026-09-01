# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version numbers appear in `package.json`, both pack manifests and
`scripts/config.js`. Use `npm run version:set -- <x.y.z>` to change all of them
together; `npm run validate` fails if they ever drift apart.

## [Unreleased]

Nothing yet.

## [0.3.0] — 2026-09-01

Ability Engine and the permanent texture standard (roadmap step 3). Still **no
shipped swords** — one diagnostic sword and one ability.

### Added

- **Activation system** (`core/activation.js`) — four player-driven methods:
  `use`, `sneak_use`, `attack`, `sneak_attack`, resolved from the engine hook
  plus the player's sneak state. A sneaking activation falls back to its
  non-sneaking base, so a sword that binds only `use` still works while
  crouching.
- **Ability Registry** (`core/ability_registry.js`) — lookup, sealing and a
  reverse index: `swordsUsing(abilityId)` answers "what would I break if I
  changed this?", and `unused()` surfaces abilities no sword binds.
- **Validation gate** (`core/ability_gate.js`) — an ordered, named chain run
  before anything is spent: player validity, ability existence, sword still
  equipped, declarative restrictions, cooldown. Cooldown is checked last so a
  refusal never shows a misleading "recharging" message, and a failed gate
  mutates nothing.
- **Restrictions** as binding data: `minHealth`, `requireGrounded`,
  `forbidInWater`, `dimensions`. A restriction that cannot be evaluated fails
  closed.
- **Outcome composition** (`systems/outcome.js`) — `applyToTargets` performs the
  block every ability ends with, owning the ordering (damage → particles →
  sound → effects → ignite → knockback); `playCast` covers activation visuals.
- **Effect helpers**: `heal` (clamped to max), `ignite`, `extinguish`,
  `teleport` (block-checked by default) and `impulse`, which routes players to
  `applyKnockback` because `applyImpulse` throws on them.
- **Life-scoped player state** — keys prefixed `life:` are cleared on death and
  respawn; everything else survives until disconnect. Cooldowns are deliberately
  not life-scoped, so dying cannot be used to reset one.
- **`custom_swords:shockwave`** — the first real ability, fully envelope-driven.
- **Texture pipeline** — sword icons are authored as text under `art/swords/`
  and compiled to PNG, so art diffs in git and can be linted.
- **`docs/TEXTURE_STANDARD.md`** — the project's permanent texture rule, the
  visual bar, the source format, and what the automated gate can and cannot
  judge.
- **In-game `/scriptevent custom_swords:abilities`** — every registered ability
  and the swords that bind it.
- Validator gates for the texture standard (missing source, broken silhouette,
  flat palette, missing outline, recolour detection) and for duplicate engine
  subscriptions.
- 72 further tests (254 total).

### Changed

- **Sword definitions now carry an `abilities` array keyed by activation**,
  replacing the `active` / `passive` slots. A sword may bind several methods,
  and the Test Blade now binds the same ability twice with different envelopes —
  a wide burst on `use`, an aimed strike on `sneak_use` — which is the clearest
  demonstration that behaviour comes from data.
- `InputRouter` resolves activations and dispatches; it holds no sword or
  ability knowledge.
- The Test Blade's texture was **regenerated from scratch** to the new standard.

### Removed

- `systems/combat.js`. The router now dispatches melee activations through the
  same path as every other activation, so the class had become pure indirection.
  The combat layer proper is milestone 4.
- `custom_swords:diagnostic_pulse`, superseded by `shockwave`.

## [0.2.0] — 2026-09-01

Core Sword Framework (roadmap step 2). The reusable foundation the 20–25 sword
collection will be built on. Still **no shipped swords** — the collection begins
in a later milestone.

### Added

- **Sword Registry** (`core/sword_registry.js`) — the central source of truth
  for sword metadata: lookup by id, `isCustomSword`, stats, ability bindings and
  a consistent display record. Definitions are deep-frozen at registration and
  the registry is sealed after bootstrap.
- **Item identification** (`core/item_identifier.js`) — resolves an item stack
  or a player's main hand to a sword definition. Never throws, never claims a
  vanilla item, and classifies anything as custom sword / vanilla sword /
  other item / empty.
- **Identifier convention** (`core/identifiers.js`) — one module deriving every
  namespaced string: item ids, ability ids, the custom component, the item tag,
  localisation keys, texture paths and diagnostic commands.
- **Rarity tiers** (`core/rarity.js`) — six tiers with order, label, colour code
  and colour name, defined once.
- **Sword stats** (`core/sword_stats.js`) — resolves authored values into
  effective ones (melee damage, repair amount) and builds the display record
  shared by the in-game diagnostics, the validator roster and future UI.
- **Declarative ability envelope** — `targeting`, `effects`, `particles` and
  `sounds` are now typed, validated fields on an ability binding rather than
  untyped `params`. The same ability bound with different envelopes produces
  different-feeling swords with no new code.
- **`TargetingService.resolve`** — dispatches the declared targeting shape
  (`self`, `single`, `ray`, `area`, `cone`) to a concrete entity list.
- **In-game diagnostics** (`core/diagnostics.js`) — `/scriptevent
  custom_swords:list`, `:held` and `:info <id>` make the registry's own view
  observable in a real world. One namespace-filtered subscription, no polling.
- Validator checks for the required item tags, the display-name key convention,
  the texture-path convention, and the full binding envelope.
- A sword roster in the validator output, so balance outliers are visible on
  every build.
- 88 further tests (173 total).

### Changed

- Sword icons moved to `textures/items/custom_swords/swords/`, namespaced and
  categorised, ready for the full collection.
- `tools/lib/project.mjs`, `tools/generate.mjs` and `tools/validate.mjs` now
  import the framework's own identifier, rarity and stats modules instead of
  keeping private copies of the same rules.
- `InputRouter` delegates identification to `ItemIdentifier`; it now contains no
  sword knowledge at all.
- The Test Blade was converted to the new model and promoted to `uncommon` so
  the rarity colouring is visibly exercised.
- The world-load banner reports shipped and diagnostic counts separately and
  points at the diagnostics command.

### Fixed

- Rarity was defined in three places (a union type, a validation array and a
  colour map in the build tools) and the custom component id in two. Both are
  now single-sourced.

### Verified, not adopted

- `minecraft:rarity` supports only four tiers and auto-escalates on enchant, so
  it cannot express a six-tier scheme; rarity stays a section colour code on the
  generated display name. Recorded in `docs/API_NOTES.md`.

## [0.1.0] — 2026-09-01

Foundation milestone (roadmap step 1). Framework and toolchain only — **no
shipped swords yet**.

### Added

- Behaviour pack and resource pack with validated manifests, targeting
  `@minecraft/server` 2.0.0 and `min_engine_version` 1.21.90.
- Scripting V2 bootstrap split across early execution and `worldLoad`.
- Core: generic sealed `Registry`, engine-free definition validator,
  player-scoped `CooldownManager` with an injected clock, `PlayerStateStore`,
  `AbilityExecutor` (single funnel, guarded execution, cooldown-on-success),
  and an `InputRouter` built on one item custom component.
- Systems: targeting (sphere / cone / raycast), damage and knockback, status
  effects, particles, sounds, player feedback, and a combat entry point for
  on-hit behaviour.
- Utilities: `vec3`, `mathx`, `ticks`.
- Configuration module holding every global tunable, including a PvP toggle,
  a global ability damage multiplier and a particle budget.
- `custom_swords:diagnostic_pulse`, the single ability of this milestone, which
  exercises every subsystem in one invocation.
- `custom_swords:test_blade`, a **diagnostic** item marked `isTestItem` and
  explicitly not part of the final 20–25 sword collection.
- Toolchain, all dependency-free: content generator (item JSON, texture atlas,
  `.lang`, placeholder art), pack and architecture validator, `.mcaddon` /
  `.mcpack` packager with a hand-written ZIP writer, and a version-bump tool.
- 84 unit and integration tests running the shipped modules against a mocked
  `@minecraft/server`.
- Documentation: `ARCHITECTURE.md`, `ROADMAP.md`, `TODO.md`,
  `docs/ADDING_A_SWORD.md`, `docs/TESTING.md`, `docs/API_NOTES.md`.
- GitHub Actions workflow running generate-check, validate, test and build.

### Known limitations

See "Current limitations" in `README.md` and the open items in `TODO.md`. In
particular: this release has **not** been run inside a Minecraft client — it has
been validated statically and against a mocked engine only.

[Unreleased]: https://github.com/strangerunknown353-web/Custom-swords/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/strangerunknown353-web/Custom-swords/releases/tag/v0.3.0
[0.2.0]: https://github.com/strangerunknown353-web/Custom-swords/releases/tag/v0.2.0
[0.1.0]: https://github.com/strangerunknown353-web/Custom-swords/releases/tag/v0.1.0
