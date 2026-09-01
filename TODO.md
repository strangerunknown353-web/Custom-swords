# TODO

Open work, grouped by when it matters. Milestone numbers refer to `ROADMAP.md`.

## Blocking the next milestone (2)

- [ ] Decide the fate of `custom_swords:test_blade`: delete it, or gate it
      behind `CONFIG.debug.enabled` so it never ships in a release build.
- [ ] Add a second ability trigger (sneak + use). `AbilityTrigger` already has
      room for it; `InputRouter.handleUse` needs to branch on `source.isSneaking`.
- [ ] Support two active abilities on one sword (primary / secondary bindings).
- [ ] Add `lore` to the sword data model and emit it into the generated
      `.lang` so tooltips can carry flavour text.

## Data model gaps

- [ ] `minecraft:rarity` component — currently rarity only tints the display
      name via a section colour code in the generated `.lang`. Verify the
      component's exact schema before adopting it.
- [ ] `minecraft:swing_duration` — requires item `format_version` **1.21.120 or
      higher**, above our current 1.21.90 target. Revisit when the minimum
      engine version is raised.
- [ ] Per-sword particle and sound presets in the definition, rather than
      inside ability parameters.
- [ ] `minecraft:cooldown` item component so the vanilla HUD sweep works even
      without a script-side mirror.

## Framework

- [ ] Persistent player data via dynamic properties, for anything that must
      survive a world reload. `PlayerStateStore` is deliberately in-memory only.
- [ ] Multi-stage abilities (wind-up → impact) on `system.runTimeout`, with
      cancellation when the player dies, disconnects or changes dimension
      mid-cast.
- [ ] Block-aware targeting (line of sight, ground detection) for earthquake and
      meteor style abilities.
- [ ] A shared ability-composition helper so "damage + effect + knockback +
      particles" does not get retyped in every ability.
- [ ] Runtime configuration (`/scriptevent` or a settings UI) so operators can
      change the PvP toggle and damage multiplier without editing `config.js`.

## Tooling

- [ ] Optional type-check step (`npm i -D @minecraft/server && tsc -p jsconfig.json`)
      wired into CI. Skipped for now to keep the project dependency-free.
- [ ] Balance report: emit a table of every sword's damage, durability, cooldown
      and rarity so outliers are visible at a glance.
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
