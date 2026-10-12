# Custom Swords v2.0 — Update Plan

A 7-step project from v1.3.0 (16 swords, 2 abilities each) to v2.0.0 (20 swords,
switchable multi-ability kits). Each step ends with a commit to
`claude/swords-mod-v2-update-et8vw9`. The final `.mcaddon` / `.mcpack` files are
delivered at the end of Step 7.

The plan grew from 5 steps to 6, then to 7, at the owner's request: ability
animations and effects got a step of their own (Step 5), the texture redraw
moved to Step 6, and Step 7 is the final polish and release.

Status legend: **done** · *in progress* · (planned)

---

## Step 1 — Audit, baseline and plan — **done**

### What was done
- Imported the uploaded v1.3.0 `CustomSwordsBP` / `CustomSwordsRP` into
  `packs/` as the v2 baseline (the repo was still at v0.9.0 with 9 swords).
- Synced the project version to 1.3.0 (`package.json`, manifests, `config.js`).
- Ran the existing toolchain against the baseline (results below).
- Wrote this plan.

### Baseline: what v1.3.0 contains
| | |
|---|---|
| Swords | 16 |
| Abilities | 28 built-ins, data-driven through sword bindings |
| Kit per sword | exactly 2: one **use** active + one **on-hit** passive |
| Inputs | `use`, `sneak_use`, `attack`, `sneak_attack` (only `use` and `attack` are bound) |
| Script API | `@minecraft/server` 2.0.0, `min_engine_version` 1.21.120 |
| Textures | 16×16, diagonal |
| Runtime cost | 6 event subscriptions, 1 recurring 30 s sweep, no per-tick loops |

| Sword | Rarity | Use ability | On-hit passive |
|---|---|---|---|
| Ember Blade | Uncommon | Ember Burst | Ember Edge |
| Frost Sword | Rare | Frost Nova | Frostbite |
| Wind Sword | Rare | Wind Burst | Wind Momentum |
| Nature Sword | Rare | Nature's Grasp | Nature's Vitality |
| Poison Sword | Rare | Venom Burst | Venomous Edge |
| Inferno Sword | Epic | Infernal Cleave | Searing Brand |
| Earth Sword | Epic | Earth Shock | Stone Guard |
| Tidal Sword | Epic | Tidal Wave | Aqua Affinity |
| Shadow Sword | Epic | Shadow Step | Shadow Edge |
| Crystal Sword | Epic | Crystal Burst | Crystal Guard |
| Gravity Sword | Epic | Gravity Crush | Heavy Force |
| Storm Sword | Epic | Storm Surge | Storm Momentum |
| Thunder Sword | Legendary | Thunder Strike | Static Charge |
| Solar Sword | Legendary | Solar Flare | Solar Radiance |
| Void Sword | Legendary | Void Rift | Void Drain |
| Time Sword | Mythic | Time Freeze | Temporal Edge |

### Audit findings
**Textures ("they look like knives")** — confirmed. Every icon is 16×16 with
the blade occupying only ~9 diagonal pixels and a guard/grip almost as large as
the blade; the blades taper from a wide base straight to a point. Result: a
dagger silhouette in the hotbar and especially in hand.

**Bugs / defects**
1. 7 swords (Crystal, Void, Solar, Gravity, Poison, Time, Storm) have no art
   source in `art/swords/`, so their textures cannot be regenerated and
   `npm run validate` fails on them.
2. The 9 older art sources are stale vs. the shipped v1.3 PNGs.
3. Two unit tests are stale against v1.3 data (Ember Blade cooldown changed
   70 → 90 ticks); test suite is 403/405.
4. `sneak_use` silently falls back to `use`, so crouching gives no extra
   control — the input slot v2 needs is unused.
5. Version drift existed between `package.json` (0.9.0) and manifests (1.3.0).
   Fixed in this step.

**Compatibility**
- `min_engine_version` 1.21.120 locks out players on 1.21.90–1.21.11x even
  though the API used (`@minecraft/server` 2.0.0) works from 1.21.90.
- Everything is namespaced (`custom_swords:`), no vanilla files are overridden,
  `item_texture.json` and `.lang` merge with other packs — good foundations.
- Hard floor: custom item components with script hooks require 1.21.90+.
  Versions older than that cannot run the ability system at all (see Step 4).

**Performance** — already lean. Remaining opportunities: entity queries per
cast (`getEntities` with no type filter), per-target particle/sound calls, and
string allocation in the hot path.

---

## Step 2 — Ability switching system + 4 new swords — **done**
- **Mode system:** each sword gets an ordered list of *active* abilities.
  - **Crouch (tap sneak) while holding the sword → switch to the next ability.**
    Action bar shows `◆ [2/5] Frost Lance` in the rarity colour, with a click.
  - **Use (right-click / tap-hold on mobile) → cast the selected ability.**
  - Melee hit → the sword's on-hit passive (always on).
  - Selected ability is remembered per player per sword (dynamic property),
    survives relog.
  - Fallback for players/devices where the sneak-button event isn't delivered:
    **sneak + use** also switches.
  - Only a *tap* (≤ 0.4 s) switches, so holding sneak at a ledge does not.
  - Each selectable ability has its own cooldown.
- **Max abilities per rarity** (actives + 1 passive):
  | Rarity | Actives | Passive | Total |
  |---|---|---|---|
  | Uncommon | 3 | 1 | 4 |
  | Rare | 4 | 1 | 5 |
  | Epic | 5 | 1 | 6 |
  | Legendary | 6 | 1 | 7 |
  | Mythic | 7 | 1 | 8 |
- **4 new swords** (bringing the set to 20):
  | Sword | Rarity | Theme |
  |---|---|---|
  | Soul Sword | Rare | soul fire, spirit drain, soul-speed dash |
  | Blood Sword | Epic | lifesteal, bleed, berserk at low HP |
  | Echo Sword | Legendary | sculk, sonic boom line, sense/darkness |
  | Dragon Sword | Mythic | dragon breath cone, wing leap, ender-flame |
- The 4 new swords ship with full kits built from the existing 28-ability
  library; their 16×16 icons already use long-sword proportions and are
  redrawn at 32×32 with the rest in Step 5.

## Step 3 — Full ability kits for all 20 swords — **done**
- Every sword's kit is at its rarity cap: 101 selectable abilities + 20
  passives, built from the shared library (now 30 abilities, with the new
  `beam` and `leap`) with per-sword parameters, visuals and sounds.
- Balance pass per rarity band; cooldowns per ability, shown on the HUD.
- Updated `SWORD_CATALOG.md`, in-game `/scriptevent custom_swords:list`.

## Step 4 — Compatibility, optimisation, bug fixes — **done**
- **Other mods' mobs are now hit.** The `mob` target category only matched
  entities carrying the vanilla `mob` type family, so creatures from other
  add-ons (which often declare no family, or a custom one) were ignored by
  every ability. Anything with health that is not a player or inanimate now
  counts. Non-living foreign entities (markers, projectiles) are still skipped.
- **The world's PvP setting is respected.** Abilities ignored the world's PvP
  setting, so on a server or Realm with PvP off they could still damage,
  knock back, levitate or blind players. They now never touch a player while
  it is off.
- **Area abilities take the nearest targets.** A capped area ability took the
  first N entities the engine listed rather than the N closest.
- Crouch-taps no longer switch abilities during creative flight, where sneak
  means "descend".
- `/scriptevent custom_swords:swordinfo` lists each ability's slot and name.
- Entity searches reuse one exclusion list instead of building a new one per
  query.
- **Minimum version stays 1.21.120.** The Step 1 audit called this an
  unnecessary lock-out; it is not. `minecraft:swing_duration` (each sword's
  swing speed) needs item `format_version` 1.21.120, and an older client cannot
  load those item files. Dropping swing speed would open 1.21.90–1.21.11x;
  that is the owner's call, recorded in `docs/API_NOTES.md`.

## Step 5 — Ability animations, effects and particles — (planned)
- Richer, layered particle effects for every power: charge-up at the hand,
  travelling shapes (rings, spirals, beams, shockwaves), and impact bursts.
- Short multi-tick animations (expanding rings, rising spirals, trails that
  follow the wielder), scheduled cheaply and capped for performance.
- Sounds layered per ability; switch effect when changing ability.
- Budgeted so busy servers stay smooth.

## Step 6 — Regenerated sword textures — (planned)
- Redraw all 20 swords at **32×32** with proper sword proportions: long blade
  running corner to corner (~70 % of the length), fuller line, distinct
  crossguard, wrapped grip and pommel, element-specific details.
- Art sources for every sword in `art/swords/`, validator updated for 32×32.

## Step 7 — Final polish and v2.0.0 release — (planned)
- Balance pass, README how-to-play, CHANGELOG, version bump to 2.0.0.
- Build and deliver `CustomSwords-v2.0.0.mcaddon`, `CustomSwordsBP.mcpack`,
  `CustomSwordsRP.mcpack`.
