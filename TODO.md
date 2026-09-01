# TODO

Open work, grouped by when it matters. Milestone numbers refer to `ROADMAP.md`.
Only items actually finished are ticked.

## Completed in the v0.5.1 item-registration fix

- [x] Creative category: `menu_category.group` now carries the `minecraft:`
      namespace, so the swords sit with the vanilla swords.
- [x] Display name: `en_US.lang` emits the key Minecraft actually generates for
      a namespaced custom item (`item.<id>`, no `.name`), plus the vanilla-style
      key as a hedge.
- [x] `CREATIVE_CATEGORY` / `CREATIVE_GROUP` moved into `core/identifiers.js`,
      so no namespaced string is hard-coded in the generator any more.
- [x] Contract tests against the real generated pack files, not the helpers.
- [x] Validator checks for creative category, both name keys, and PNG
      conformance — each negative-tested.

### Still open from that report

- [ ] **Confirm the fixes in a client.** The two defects are fixed by reasoning
      from the documented conventions; nobody has verified the result in-game.
- [ ] **The icon report is unexplained.** Every link in the pipeline verifies
      and the PNGs are byte-level conformant. Leading hypothesis: it was a
      consequence of the rejected `menu_category`. Needs the content log to
      settle.
- [ ] Audit the remaining generated JSON against current Bedrock conventions
      rather than assuming — `minecraft:damage` (object vs scalar form),
      `minecraft:repairable.repair_amount`, and whether `minecraft:glint` is
      still the right way to mark a sword. The two bugs found suggest others of
      the same shape may be sitting in the same file.

## Completed in Shadow Sword (v0.8.0)

- [x] Shadow Sword: Epic, mobility-first, ninth in the collection.
- [x] Shadow Step (`blink`) with full destination validation, and Shadow Edge
      (`opportunist`) with a 4-second combo window and lifesteal.
- [x] `systems/movement.js` — reusable safe repositioning for any future
      mobility ability.
- [x] `config.movement.maxDashDistance` ceiling.
- [x] `PlayerStateStore.mark()` / `.sinceMark()` — combo windows.
- [x] `shadow` visual profile and its two sound presets.
- [x] Readiness-banner test no longer hardcodes the sword count.



- [x] Frost Nova and Frostbite — a chill-then-shatter sequence, replacing two
      bindings that both used the generic `brand`.
- [x] Thunder Strike (chain lightning, `ray` targeting) and Static Charge
      (every third hit), replacing `surge` and `brand`.
- [x] `EffectService.has()` / `.remaining()` — target-state reads.
- [x] `ParticleService.line()` and `TargetingService.around()`.
- [x] Binding `label`, so reusable ability ids can carry per-sword names.
- [x] Frost Sword's texture regenerated — it read as a blue diamond sword.
- [x] `surge` removed; it had no binder and the project forbids orphans.
- [x] Lightning implemented without `spawnEntity('minecraft:lightning_bolt')`,
      avoiding fires, mob conversions and out-of-framework damage.



- [x] Test Blade renamed to Ember Blade and promoted to a shipped sword; the
      project no longer ships a diagnostic item.
- [x] `ember_burst` active and `ember_edge` passive — one coherent heat
      mechanic replacing four diagnostic bindings.
- [x] Stacking charges on `PlayerStateStore` (`addCharge` / `charges` /
      `spendCharges`), life-scoped, clamped and player-keyed.
- [x] `ember` visual profile plus `ember_cast` / `ember_impact` presets.
- [x] New Ember Blade texture, distinct in silhouette and palette from Inferno.
- [x] Validator gate: no two swords may share an identifier, display name,
      texture shortname or localisation key.
- [x] `SWORD_CATALOG.md` extended with swing duration, visual profile, texture
      status and per-binding particle and sound columns.
- [x] Framework tests decoupled from any shipped sword's tuning.



- [x] All fourteen elemental sound presets defined and mapped to real vanilla
      sound events. Ability audio was completely silent before this.
- [x] All five unusable particle identifiers replaced. Wind's ability had no
      visual at all; Thunder's and Tidal's had none that rendered.
- [x] `SoundService.resolve()` no longer guesses that an unknown preset name is
      a raw sound id — the fallback that made the failure invisible.
- [x] `core/particle_catalogue.js`: usable particles, plus Molang-dependent ones
      mapped to the sibling that works.
- [x] `core/visual_profiles.js`: eight named presentation bundles, so a theme is
      defined once rather than restated per binding.
- [x] `tools/data/vanilla_sound_events.json` and a validator gate proving every
      `SOUND_LIBRARY` id is a real sound event.
- [x] `minecraft:swing_duration` per sword (item format_version 1.21.120).
- [x] Inferno's texture regenerated — it was the weakest of the eight.
- [x] Validator gates for particles, sound presets and visual profiles, each
      negative-tested by seeding the defect.

## Completed in bug-fix 1 (v0.5.1)

- [x] Creative category: `menu_category.group` namespaced to
      `minecraft:itemGroup.name.sword`, so the swords sit with the vanilla ones.
- [x] Display name: the lang key is `item.<id>`, the key the engine actually
      generates for a namespaced custom item. `item.<id>.name` is emitted too,
      as a hedge.
- [x] `tests/unit/pack_output.test.mjs` asserts the contract against the real
      generated pack files, not just against `identifiers.js`.

## Completed in milestone 5 (v0.5.0)

- [x] Seven final swords — Inferno, Thunder, Frost, Wind, Earth, Tidal, Nature —
      each with its own gameplay identity, rarity and balance point.
- [x] One new ability (`cleave`); the other six swords bind abilities that
      already existed, which was the point of the framework.
- [x] Seven hand-authored premium textures, each with a distinct silhouette and
      palette, all passing the linter with zero warnings.
- [x] `SWORD_CATALOG.md`, generated by `tools/catalog.mjs` and drift-checked in
      CI with `npm run catalog -- --check`.
- [x] Sword test matrix in `docs/TESTING.md`, honest about what is unverified.
- [x] `AbilityRegistry.unused()` reports nothing — every ability is bound.

## Completed in milestone 4 (v0.4.0)

- [x] Central combat system with one fixed ordering for every damaging ability.
- [x] Seven-step damage validation returning a named reason per refusal; `NaN`,
      `Infinity`, negative and overflowing amounts collapse to 0.
- [x] Six targeting modes: `self`, `single`, `area`, `cone`, `ray`, `point`.
- [x] Reusable target categories on verified vanilla type families, with the
      `families`-is-AND workaround applied in script.
- [x] Self-damage protection on by default, opt-in per binding.
- [x] Knockback with `away` / `forward` modes, clamped on both axes.
- [x] Per-player activation rate limiting, checked before any work is done.
- [x] Two-layer hit protection: per-execution entity set + per-player `hit:`
      cooldown keys.
- [x] Vanilla effect catalogue so a typo'd effect fails at startup with a
      suggestion, not silently in-game.
- [x] Six built-in abilities and a dedicated edge-case suite.

## Completed in milestone 3 (v0.3.0)

- [x] Activation system covering `use`, `sneak_use`, `attack`, `sneak_attack`,
      with a documented fallback rule.
- [x] Dedicated Ability Registry with a sword reverse-index and unused-ability
      reporting.
- [x] Ordered validation gate run before anything is spent, including the
      "is the sword still equipped?" re-check.
- [x] Declarative restrictions (`minHealth`, `requireGrounded`, `forbidInWater`,
      `dimensions`) that fail closed.
- [x] Outcome composition helper — superseded in milestone 4 by
      `systems/combat.js`, which added validation and refusal reporting.
- [x] Effect helpers: heal, ignite, extinguish, teleport, impulse.
- [x] Life-scoped player state cleared on death and respawn; cooldowns
      deliberately excluded so death cannot reset one.
- [x] One real, fully envelope-driven ability, bound twice on the test sword to
      prove reuse.
- [x] Premium texture standard, authored-as-text pipeline, automated quality
      gate, and a regenerated benchmark texture.
- [x] Duplicate-engine-subscription check in the validator.

## Blocking the next milestone (6 — spatial ability library)

- [ ] Multi-stage abilities (wind-up → impact) on `system.runTimeout`, with
      cancellation when the caster dies, disconnects or changes dimension.
      `life:`-scoped state exists for exactly this; nothing uses it yet.
- [ ] Combo and crit-window tracking on melee activations.
- [ ] Damage attribution and resistance handling; friendly-fire / team rules
      beyond the current global PvP toggle.
- [ ] Target-count budgeting *across* players — the per-activation ceiling is
      enforced, but several players firing area abilities in the same tick are
      not yet budgeted collectively.
- [ ] Block-aware targeting beyond `point`: ground detection and line-of-sight
      culling, so an area ability cannot hit through a wall.

## Data model gaps

- [ ] Tooltip flavour text. Bedrock has **no item-JSON lore component**, so a
      `description` cannot reach the vanilla tooltip. It is generated into
      `.lang` under `item.<id>.description` and read by the diagnostics command;
      a real tooltip needs either the codex UI (milestone 12) or an
      event-driven `ItemStack.setLore` hook. Do not add a `lore` field until one
      of those exists.
- [ ] `minecraft:swing_duration` — requires item `format_version` **1.21.120 or
      higher**, above our current 1.21.90 target.
- [ ] `minecraft:cooldown` item component so the vanilla HUD sweep works without
      a script-side mirror.
- [ ] Sword-level sound and particle themes, so a family of swords can share an
      audio and visual identity without repeating it per binding.

## Framework

- [ ] Persistent player data via dynamic properties, for anything that must
      survive a world reload. `PlayerStateStore` is deliberately in-memory only.
- [ ] Runtime configuration (`/scriptevent` or a settings UI) so operators can
      change the PvP toggle and damage multiplier without editing `config.js`.
- [ ] Decide whether a diagnostic item should return behind a debug flag. The
      Test Blade became Ember Blade, so `isTestItem` is currently unused; a
      hidden probe item would be useful again once swords need in-world
      inspection.

## Tooling

- [ ] Optional type-check step (`npm i -D @minecraft/server && tsc -p jsconfig.json`)
      wired into CI. Skipped for now to keep the project dependency-free.
- [ ] Texture preview command — render an art source enlarged, next to a 1:1
      copy, so a reviewer can judge it without importing the pack. Contact
      sheets were rendered by hand again this milestone; it should be a script.
- [ ] Balance report beyond the catalogue. `tools/catalog.mjs` publishes the
      roster; a damage-per-second and cooldown-uptime comparison would make the
      milestone 13 tuning pass evidence-driven.
- [ ] A `--watch` mode for `tools/generate.mjs` during development.

## Testing

- [x] Record real in-Minecraft test results in `docs/TESTING.md`. v0.5.0 was
      tested and **failed** at item registration; the result is recorded there
      in full.
- [ ] Re-test v0.5.1 in a client. No sword *behaviour* has ever been observed —
      v0.5.0 failed before any ability could be exercised, so every row of the
      sword test matrix is still unverified.
- [ ] Dedicated-server test with 2+ players on different swords simultaneously.
- [ ] Low-end device performance check once particle-heavy abilities exist.

## Documentation

- [ ] Player-facing installation and usage guide (milestone 15).
- [ ] Localisation beyond `en_US`.
