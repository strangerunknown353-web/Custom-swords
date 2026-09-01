# TODO

Open work, grouped by when it matters. Milestone numbers refer to `ROADMAP.md`.
Only items actually finished are ticked.

## Completed in milestone 3 (v0.3.0)

- [x] Activation system covering `use`, `sneak_use`, `attack`, `sneak_attack`,
      with a documented fallback rule.
- [x] Dedicated Ability Registry with a sword reverse-index and unused-ability
      reporting.
- [x] Ordered validation gate run before anything is spent, including the
      "is the sword still equipped?" re-check.
- [x] Declarative restrictions (`minHealth`, `requireGrounded`, `forbidInWater`,
      `dimensions`) that fail closed.
- [x] Outcome composition helper — abilities no longer retype
      damage + knockback + effects + particles.
- [x] Effect helpers: heal, ignite, extinguish, teleport, impulse.
- [x] Life-scoped player state cleared on death and respawn; cooldowns
      deliberately excluded so death cannot reset one.
- [x] One real, fully envelope-driven ability (`custom_swords:shockwave`),
      bound twice on the test sword to prove reuse.
- [x] Premium texture standard, authored-as-text pipeline, automated quality
      gate, and a regenerated benchmark texture.
- [x] Duplicate-engine-subscription check in the validator.

## Blocking the next milestone (4 — combat, damage and safety)

- [ ] Multi-stage abilities (wind-up → impact) on `system.runTimeout`, with
      cancellation when the caster dies, disconnects or changes dimension.
      `life:`-scoped state exists for exactly this; nothing uses it yet.
- [ ] Combo and crit-window tracking on melee activations.
- [ ] Damage attribution and resistance handling; friendly-fire / team rules
      beyond the current global PvP toggle.
- [ ] Per-player activation rate limiting, so a spam-clicked sword cannot
      dominate a busy server's tick budget.
- [ ] Target-count budgeting when several players fire area abilities at once.

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
- [ ] Block-aware targeting (line of sight, ground detection) for earthquake and
      meteor style abilities.
- [ ] Runtime configuration (`/scriptevent` or a settings UI) so operators can
      change the PvP toggle and damage multiplier without editing `config.js`.
- [ ] Debug-gate the Test Blade so it cannot ship in a release build.

## Tooling

- [ ] Optional type-check step (`npm i -D @minecraft/server && tsc -p jsconfig.json`)
      wired into CI. Skipped for now to keep the project dependency-free.
- [ ] Texture preview command — render an art source enlarged, next to a 1:1
      copy, so a reviewer can judge it without importing the pack. This was done
      by hand this milestone; it should be a script.
- [ ] Standalone balance report. The validator prints a roster; a dedicated
      `tools/report.mjs` writing Markdown would serve the docs.
- [ ] A `--watch` mode for `tools/generate.mjs` during development.

## Testing

- [ ] Record real in-Minecraft test results in `docs/TESTING.md` — the checklist
      exists but has never been executed.
- [ ] Dedicated-server test with 2+ players on different swords simultaneously.
- [ ] Low-end device performance check once particle-heavy abilities exist.

## Documentation

- [ ] Player-facing installation and usage guide (milestone 15).
- [ ] Localisation beyond `en_US`.
