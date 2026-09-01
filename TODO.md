# TODO

Open work, grouped by when it matters. Milestone numbers refer to `ROADMAP.md`.
Only items actually finished are struck through.

## Completed in milestone 2 (v0.2.0)

- [x] Sword Registry with a sword-specific query API.
- [x] Item identification system that fails safe and never touches vanilla.
- [x] Identifier convention single-sourced and documented in `ARCHITECTURE.md`.
- [x] Rarity single-sourced across runtime, generator and validator.
- [x] Sword stats resolution and a shared display record.
- [x] `targeting`, `effects`, `particles` and `sounds` promoted from untyped
      `params` to validated binding fields.
- [x] Texture architecture reworked for the full collection.
- [x] `minecraft:rarity` schema verified — and deliberately **not** adopted;
      see `docs/API_NOTES.md`.
- [x] Test Blade converted to the new framework and kept as the diagnostic item
      (milestone 2's brief requires a working test sword, so it is no longer a
      candidate for deletion — it will be debug-gated before release).

## Blocking the next milestone (3 — Ability Engine)

- [ ] Ability composition helper so "damage + effect + knockback + particles"
      is not retyped in every ability.
- [ ] Second ability trigger (sneak + use). `AbilityTrigger` and the binding
      shape already allow it; `InputRouter.handleUse` needs to branch on
      `source.isSneaking`, and a sword needs a second active slot.
- [ ] Multi-stage abilities (wind-up → impact) on `system.runTimeout`, with
      cancellation when the player dies, disconnects or changes dimension.
- [ ] Ability-level cost/condition checks (health, hunger, dimension) before the
      cooldown gate.

## Data model gaps

- [ ] Tooltip flavour text. Bedrock has **no item-JSON lore component**, so a
      `description` cannot reach the vanilla tooltip. It is generated into
      `.lang` under `item.<id>.description` and read by the diagnostics command;
      a real tooltip needs either the codex UI (milestone 12) or an
      event-driven `ItemStack.setLore` hook. Do not add a `lore` field until one
      of those exists.
- [ ] `minecraft:swing_duration` — requires item `format_version` **1.21.120 or
      higher**, above our current 1.21.90 target. Revisit when the minimum
      engine version is raised.
- [ ] `minecraft:cooldown` item component so the vanilla HUD sweep works without
      a script-side mirror.
- [ ] Sword-level (rather than binding-level) sound and particle themes, so a
      family of swords can share an audio identity.

## Framework

- [ ] Persistent player data via dynamic properties, for anything that must
      survive a world reload. `PlayerStateStore` is deliberately in-memory only.
- [ ] Block-aware targeting (line of sight, ground detection) for earthquake and
      meteor style abilities.
- [ ] Runtime configuration (`/scriptevent` or a settings UI) so operators can
      change the PvP toggle and damage multiplier without editing `config.js`.
- [ ] Debug-gate the Test Blade so it cannot ship in a release build.

## Tooling

- [ ] Optional type-check step (`npm i -D @minecraft/server && tsc -p jsconfig.json`)
      wired into CI. Skipped for now to keep the project dependency-free.
- [ ] Standalone balance report command. The validator already prints a roster;
      a dedicated `tools/report.mjs` writing Markdown would serve the docs.
- [ ] Texture linting: assert every committed icon is 16×16 RGBA.
- [ ] A `--watch` mode for `tools/generate.mjs` during development.

## Testing

- [ ] Record real in-Minecraft test results in `docs/TESTING.md` — the checklist
      exists but has never been executed.
- [ ] Dedicated-server test with 2+ players on different swords simultaneously.
- [ ] Low-end device performance check once particle-heavy abilities exist.

## Documentation

- [ ] Player-facing installation and usage guide (milestone 15).
- [ ] Localisation beyond `en_US`.
