# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version numbers appear in `package.json`, both pack manifests and
`scripts/config.js`. Use `npm run version:set -- <x.y.z>` to change all of them
together; `npm run validate` fails if they ever drift apart.

## [Unreleased]

Work towards v2.0.0. See `docs/V2_PLAN.md`.

### Added

- **Ability switching.** A sword can now carry several selectable abilities.
  Tap crouch while holding it to switch to the next one; use casts the
  selected ability. The action bar shows `[2/5] Ability - Ready` (or the time
  left) and a click plays. Holding sneak to creep along an edge does not
  switch — only a tap of 0.4 s or less does.
  - Each ability has its own cooldown.
  - The selection is remembered per sword and survives a relog.
  - On an engine without the sneak-button event, crouch + use switches instead.
- **Ability limits by rarity**: Common 2, Uncommon 3, Rare 4, Epic 5,
  Legendary 6, Mythic 7 selectable abilities, plus one on-hit passive. The
  validator enforces them.
- **Four new swords**, each with a full kit:
  - **Soul Sword** (Rare) — Soul Flame, Soul Snare, Soul Dash, Soul Ward;
    passive Soul Siphon.
  - **Blood Sword** (Epic) — Crimson Cleave, Hemorrhage, Blood Burst, Blood
    Pull, Bloodlust; passive Vampiric Edge.
  - **Echo Sword** (Legendary) — Sonic Boom, Shriek, Resonance, Vibration
    Rift, Echo Step, Sculk Shockwave; passive Reverberate.
  - **Dragon Sword** (Mythic) — Dragon Breath, Wing Gust, Ender Flame, Dragon
    Dash, Dragon Roar, Sky Crush, Draconic Fury; passive Dragon Scale.
- Visual profiles `soul`, `blood`, `echo`, `dragon` and their sounds.

### Fixed

- CI: every shipped texture has an art source again, so `generate --check`
  reproduces the shipped PNGs byte for byte.
- The cooldown message named the underlying ability instead of the sword's
  label for it.

## [0.9.0] — 2026-09-01

**Every sword is craftable.** The collection had nine swords and zero recipes;
it now has nine of each, generated from the sword definitions and checked
against a transcribed vanilla item list.

### Added

- **Crafting recipes for all nine swords** — shaped, crafting-table, one sword
  each. Each is built around the material that *repairs* that sword, so the
  thing that mends a blade is the thing it was made from, and cost scales with
  rarity: Ember Blade is two copper on a blaze rod; Thunder is a lightning rod
  quenched between copper over a diamond core.
- **`recipe` on the sword data model**, compiled to `minecraft:recipe_shaped`
  by `tools/generate.mjs` into `packs/CustomSwordsBP/recipes/`. Recipes are
  sword data for the same reason item JSON is: a recipe file maintained apart
  from its sword drifts from it, and the drift is invisible until somebody
  tries to craft one.
- **`tools/data/vanilla_items.json`** — 1607 item identifiers from Mojang's own
  `bedrock-samples` metadata. Build-time only, not shipped. The validator proves
  every crafting ingredient **and every repair item** is a real item, because a
  recipe naming a nonexistent item does not error, it simply never registers.
- **Validator gates**: every sword has a recipe; patterns fit a 3×3 grid and are
  not ragged; every pattern character has a key and every key is used; every
  ingredient is a real item; recipe identifiers are unique; generated JSON
  carries the `crafting_table` tag and resolves to one of our swords. Each
  negative-tested by seeding the defect.
- **`tests/unit/recipes.test.mjs`** — nine assertions against the real generated
  files, including that the emitted JSON has not drifted from the definitions.
- **Nature's Grasp** (`custom_swords:entangle`) — an area root that pays the
  caster back **per target held**, capped. The first area ability whose effect
  scales with *how many* it caught rather than distance, target state, or
  nothing. No knockback: roots hold things where they are. The roots are
  effects, not blocks, so nothing is placed in the world and there is nothing
  to clean up.

### Changed

- **Named the abilities on Wind, Earth, Tidal and Nature** using the binding
  `label` added in v0.7.0: Wind Burst / Wind Momentum, Earth Shock / Stone
  Guard, Tidal Wave / Aqua Affinity, Nature's Grasp / Nature's Vitality. The
  ability ids stay generic behaviour names so other swords can bind them.
- **Nature's active moved from `strike` to `entangle`.** Its old identity was a
  single-target execute; an area root that holds a group is a different and more
  distinctive thing, and it no longer duplicates a behaviour three other swords
  could bind.

### Removed

- **`custom_swords:strike`.** Nature was its last binder, and the project
  forbids orphaned abilities — the same call made for `surge` in v0.7.0. Git
  history keeps it if a future sword wants an execute.

### Notes

- **No new swords were created.** Wind, Earth, Tidal and Nature have shipped
  since v0.5.0; the collection has stood at nine since v0.8.0. What was actually
  missing was recipes, which no sword had, and distinct identities for the four
  that still bound shared abilities.
- **"Ocean Sword" is Tidal Sword.** The collection's water sword already exists
  as `custom_swords:tidal_sword`, and its active was already a forward-cone
  wave — now labelled **Tidal Wave**. Renaming a shipped identifier would break
  every world that already contains one, so the id is unchanged.

## [0.8.0] — 2026-09-01

**Shadow Sword** — the ninth sword, and the first whose active does no
meaningful damage on its own.

### Added

- **Shadow Sword** (`custom_swords:shadow_sword`) — Epic, 8 melee, 1000
  durability, 0.28s swing, repaired with echo shards. Its Epic rating is bought
  with utility rather than numbers: it is the only sword in the set that can
  leave a fight it is losing.
- **Shadow Step** (`custom_swords:blink`) — a validated 6-block dash along the
  wielder's view, on a 7-second cooldown. Lands a light 4-damage strike on
  whatever is standing at the arrival point, and opens a combo window.
- **Shadow Edge** (`custom_swords:opportunist`) — 1 damage on an ordinary
  swing; **+6 and 2 health drained** on a swing within 4 seconds of a step.
  Positioning is the cost of the damage rather than a bonus on top of it.
- **`systems/movement.js`** — the reusable destination validator every future
  mobility ability inherits. Candidates are tried furthest-first; each is
  screened for finite coordinates, passable feet and head blocks, lava, and
  ground within `maxDrop` — and then `Entity.tryTeleport` runs the engine's own
  collision test as the authority. A refusal moves nothing and names its reason.
- **`config.movement.maxDashDistance`** (10) — a hard ceiling on any dash,
  whatever a definition asks for. Deliberately short: a long teleport is not a
  stronger short one, it is terrain traversal.
- **`PlayerStateStore.mark()` / `.sinceMark()`** — the third shape of per-player
  state, after resources and counters: a **combo window**. One ability marks,
  another asks how long ago. `sinceMark` returns `Infinity` for an absent mark
  so `<= windowTicks` is naturally false, and treats a backwards clock (a world
  reload) as no mark rather than an infinitely fresh one.
- **`shadow` visual profile** and `shadow_cast` / `shadow_impact` presets —
  portal motes where the wielder was, void-dark spatter where they arrive. The
  only profile whose caster particle marks a place the player has *left*.
- **`tests/unit/shadow_step.test.mjs`** — eighteen assertions, most of them
  refusals: facing a wall, head-height obstruction only, lava, a drop, an
  unreadable chunk, and the distance ceiling. Plus the combo window, its
  expiry, the lifesteal, and per-player isolation.

### Changed

- The readiness-banner test matched a hardcoded sword count and broke on every
  new sword. It now matches the banner's *shape* and checks the counts against
  each other, so it asserts something real without needing an edit per sword.

### Notes

- **Not a stealth sword.** Bedrock has no reliable invisibility-with-held-item
  behaviour worth building an identity on, and the `invisibility` effect leaves
  armour and the held sword rendered — a promise the game does not keep.
  Mobility is the honest version of that fantasy.
- **`Block.isSolid` is not used.** It is still marked pre-release; `isAir ||
  isLiquid` is the stable equivalent and is what the validator uses.
- The other eight swords are untouched.

## [0.7.0] — 2026-09-01

**Frost Sword and Thunder Sword finalized.** Both shipped in v0.5.0 as part of
the Elemental Collection, but both leaned on the generic `brand` ability —
Frost for its active *and* its passive. They now have mechanics of their own,
built to the benchmark Ember Blade set.

### Added

- **Frost Nova** (`custom_swords:nova`) — a radial burst that inverts the usual
  falloff: **proximity scales the effect duration, not the damage**. A target at
  the caster's feet is locked down for the full slowness III and mining fatigue;
  one at the rim gets 40% of it. It is a control ability, so its falloff is
  control.
- **The shatter bonus.** Frost Nova deals +5 damage to a target that is
  *already* slowed. Combined with the passive, the sword plays as a sequence:
  chill the group in melee, then shatter them.
- **Frostbite** (`custom_swords:afflict`) — the passive that sets that up.
  Applies slowness, and against a target already slowed adds mining fatigue and
  +3 damage. Staying on one enemy is worth more than spreading hits.
- **Thunder Strike** (`custom_swords:chain`) — picks the entity the wielder is
  looking at within 16 blocks, then arcs to the nearest unstruck target, three
  further links at 60% damage each. Rewards finding a *line* of enemies, where
  every other reaching ability rewards a cluster's centre.
- **Static Charge** (`custom_swords:discharge`) — builds one charge per landed
  hit and releases on the third: +6 damage, weakness, and a spark burst. A fixed
  interval rather than a random chance, because a percentage roll cannot be
  learned by the player, cannot be tested deterministically, and feels broken on
  a bad streak.
- **`EffectService.has()` / `.remaining()`** — the read half of the effect
  system, and the primitive behind every "conditional on what the target is
  already suffering" mechanic. Never throws: an unreadable target reports as
  unaffected, which fails towards *not* granting a bonus.
- **`ParticleService.line()`** — particles between two points, capped like
  `ring()`. The visual primitive for anything that travels; Thunder's arc is the
  first user.
- **`TargetingService.around()`** — targetable entities near an arbitrary point,
  keeping the binding's filters and caster exclusion so an ability cannot widen
  its own permissions by choosing a different origin.
- **Binding `label`** — a sword can present "Frost Nova" while binding the
  generic, reusable `nova`. Ability ids stay behaviour names so other swords can
  bind them; the flavour lives with the sword that owns it. Surfaced on the
  action bar and in the catalogue.
- **`tests/unit/frost_thunder.test.mjs`** — the shatter combo, proximity-scaled
  duration, chain falloff, the jump limit, the discharge rhythm, and per-player
  isolation for both.

### Changed

- **Frost Sword's texture regenerated.** It read as a blue diamond sword with a
  stub for a hilt — the one thing the theme brief rules out. Now a deep glacier
  blade with alternating crystal facets, a bright silver rimed guard that
  separates blade from grip, a near-black wrapped grip and a crystal pommel.
  Luminance spread 226. Three iterations; the first two were worse than what
  they replaced and were discarded.
- **Thunder Sword's active moved from `point` to `ray` targeting.** The player
  now names a victim and the chain decides the rest, instead of the bolt landing
  wherever the crosshair met a block.
- Thunder's Static Charge deals 1 chip damage per swing. Not cosmetic: the
  ability learns whether its blow landed from the strike report, and the damage
  layer refuses a zero-damage strike — so a 0-damage build-up could never
  advance its own counter. `discharge` validates `damage >= 1` to stop the next
  sword falling into it.

### Removed

- **`custom_swords:surge`.** Thunder was its only binder, and the project
  enforces "no orphaned abilities" — shipping unbound ability code in a mobile
  add-on is the wrong default. The `point` targeting mode it used remains in the
  framework and tested, so a future meteor sword can restore it from history.

### Notes

- Inferno Sword and Ember Blade are untouched.
- **No vanilla lightning.** `spawnEntity('minecraft:lightning_bolt')` would look
  right and behave badly: fires, charged creepers, zombified piglins, witches,
  damage to the wielder, and all of it outside the combat layer's validation and
  PvP rules. Thunder's bolt is particles and sound; every point of damage goes
  through `combat.strikeOne`.

## [0.6.0] — 2026-09-01

**Ember Blade.** The framework's diagnostic Test Blade becomes a finished
sword, and the project ships no test item for the first time. This is also the
first release built on a client test that passed: v0.5.2 was confirmed working
in Minecraft Bedrock — creative category, icon, name, rendering, attack
animation, abilities, effects, sounds and cooldowns all correct.

### Added

- **Ember Blade** (`custom_swords:ember_blade`) — Uncommon, 6 melee, 500
  durability, and the fastest swing in the collection at 0.22s. A light,
  fast, close-range ember weapon, deliberately positioned at the base of the
  balance curve.
- **`custom_swords:ember_burst`** — the active. A 3-block burst on a 3.5s
  cooldown whose damage comes from banked heat rather than a large base number:
  4 damage cold, +1.5 per stack, up to 11.5 with a full meter. Burn duration
  scales the same way. A burst that finds nothing **keeps its heat** and starts
  no cooldown.
- **`custom_swords:ember_edge`** — the passive. Each landed melee hit banks one
  heat stack (capped at 5) plus 1 chip damage and a 1s scorch. Its own 0.6s
  cooldown is what stops the collection's fastest sword from filling its meter
  in a single flurry.
- **Stacking charges on `PlayerStateStore`** — `addCharge`, `charges`,
  `spendCharges`. The reusable "this sword builds something up as you fight"
  primitive, life-scoped so death clears it, clamped centrally so no ability can
  leak an unbounded counter, and rejecting non-finite input. Ember Blade is the
  first user; combo and momentum swords are the intended next ones.
- **`ember` visual profile** — spark motes at the hand
  (`redstone_torch_dust_particle`), a controlled candle flame on each target,
  glowing dust for the burst ring. Built from a different vocabulary than
  `fire` on purpose.
- **`ember_cast` / `ember_impact`** sound presets — quenching steel then the
  crackle it leaves, pitched up and quieter than Inferno's blaze roar.
- **Uniqueness gate in the validator** — no two swords may share an identifier,
  display name, texture shortname or localisation key. The registry already
  rejected duplicate ids; the other three collided silently, which gets more
  dangerous as the collection grows toward 25.
- **`tests/unit/ember_heat.test.mjs`** — the charge primitive and the mechanic
  end to end, including that one player can neither gain nor spend another's
  heat, that a missed burst does not waste it, and that dying clears it.

### Changed

- **Test Blade → Ember Blade.** Renamed everywhere: definition, texture source,
  item JSON, texture atlas, localisation, catalogue, tests and docs. Its four
  diagnostic bindings (one per activation method, chosen to exercise the engine
  rather than to play well) are replaced by two that form a single coherent
  mechanic. `isTestItem` remains in the data model, unused.
- **A new texture**, not a recolour: a slim straight blade of cold-polished
  steel holding forge heat in its lower third, a compact steel guard with a live
  ember between the quillons, wire-wrapped grip, brass pommel. Set beside
  Inferno's broad molten-seamed blade, the two read as different weapons rather
  than one weapon at two power levels.
- **`SWORD_CATALOG.md` gained swing duration, visual profile, texture status,
  and per-binding particle and sound columns**, so the published entry now
  states everything a sword's presentation depends on.
- **Framework tests no longer lean on a shipped sword's tuning.** Several tests
  asserted the Test Blade's specific bindings — a sneak activation, a
  hostile-only filter, a 4-block range. They now build local fixtures, because a
  shipped sword should never have to keep a binding alive to satisfy a test of
  the router.

### Notes

- Inferno Sword is untouched. The two fire swords are deliberately separate in
  fantasy, rarity, stats, swing speed, ability, damage model and visual
  vocabulary — the comparison table is in `swords/ember_blade.js`.
- No diagnostic item ships any more. `/scriptevent custom_swords:list` now
  reports 8 shipped, 0 diagnostic.

## [0.5.2] — 2026-09-01

**Bug fix: ability presentation.** Reported as "the sword animations are not
working". The audit found the abilities were firing correctly the whole time —
they were simply invisible and inaudible, because most of the identifiers they
handed the engine were not real.

Neither failure mode raises an error. `spawnParticle` with a bad identifier
renders nothing or spams the content log; `playSound` with a bad id is silent.
A mocked engine accepts both, so 337 passing tests and a clean validator meant
nothing here.

### Fixed

- **All ability audio was silent.** The seven elemental swords referenced
  fourteen sound presets — `inferno_cast`, `thunder_impact`, and twelve more —
  that were never added to `SOUND_LIBRARY`. `SoundService.resolve()` treated an
  unknown preset name as a raw vanilla sound id and passed `'inferno_cast'`
  straight to `playSound`, which is not a sound event. All fourteen presets now
  exist, mapped to real vanilla sound events.
- **Five of twelve particle identifiers were unusable**, across four swords:
  - `minecraft:sculk_soul_particle` and `minecraft:wind_explosion_emitter` do
    not exist. Both were Wind's, so **Wind's ability had no visual at all**.
  - `minecraft:electric_spark_particle` (Thunder's only particle),
    `minecraft:water_splash_particle` (Tidal's only particle) and
    `minecraft:basic_crit_particle` exist but read Molang variables from a host
    entity; spawned from script they log errors instead of rendering.
- **The silent fallback that hid it.** `resolve()` no longer guesses that an
  unknown name is a raw sound id. It returns `undefined` and logs. A sound is a
  library preset or an explicit `{ id }` spec.

### Added

- **`core/particle_catalogue.js`** — vanilla particle identifiers split by
  whether they can actually be spawned from script, plus `explainParticle()`,
  which names the usable sibling for every Molang-dependent particle
  (`electric_spark_particle` → `endrod`). Transcribed from the Bedrock Wiki's
  vanilla particle list.
- **`core/visual_profiles.js`** — a sword's presentation as one named bundle:
  `fire`, `storm`, `frost`, `gale`, `stone`, `tide`, `grove`, `arcane`. A
  binding says `visual: 'fire'` and inherits caster/target/trail particles and
  cast/impact sounds; anything it states explicitly still wins. This is the
  layer whose absence let five bad identifiers spread across seven swords.
- **`minecraft:swing_duration`** on every sword, weighted by character — Wind
  0.25s through Earth 0.55s. This is the only item-side control Bedrock offers
  over the swing animation, and it is visual only.
- **`tools/data/vanilla_sound_events.json`** — the 1824 sound event names from
  the vanilla resource pack's own `sound_definitions.json`. Build-time
  reference only, not shipped. The validator proves every `SOUND_LIBRARY` id is
  a real event against it.
- **`tests/unit/presentation.test.mjs`** — asserts every shipped binding
  resolves to catalogued particles and real sound presets, that no two profiles
  share a look, and that resolving never mutates a frozen profile.
- Validator gates for particle usability, sound presets, visual profile names
  and `SOUND_LIBRARY` ids. Each negative-tested by seeding the defect.

### Changed

- Item `format_version` **1.21.90 → 1.21.120**, and `min_engine_version` in
  both manifests with it, because `swing_duration` requires it. **This raises
  the minimum Minecraft version.**
- **Inferno's texture regenerated.** It was the weakest in the set — a muddy
  brown that read as wood, with the lowest luminance spread of the eight (174).
  Now cold charcoal iron with a molten seam and a white-hot core: spread 218.
- Decorative particle params (`arcParticle`, `ringParticle`, `trailParticle`,
  `impactParticle`) default to the binding's visual profile rather than a
  hard-coded id.
- A test that asserted `resolve()` mapped unknown names to raw sound ids —
  "resolves library names and raw ids alike" — was rewritten. It had encoded
  the bug as intended behaviour, which is why the bug survived every run.

### Not changed

- **No attachables, geometry, animations or animation controllers were added.**
  A flat-sprite sword needs none, and the swing is the player's arm animation,
  which applies to every item. See `ARCHITECTURE.md` §12.

## [0.5.1] — 2026-09-01

**Bug fix: item registration.** The first real in-game test of this project
found that the swords registered but did not integrate: they appeared in the
generic Items tab instead of beside the vanilla swords, and every tooltip read
`item.custom_swords:<name>` instead of the sword's name.

Both were defects in generated pack content that a green test suite and a clean
validator had missed entirely, because nothing checked the generated output
against the conventions Minecraft actually uses.

### Fixed

- **Creative category.** `menu_category.group` was the bare
  `itemGroup.name.sword`. A creative group reference must carry the namespace:
  `minecraft:itemGroup.name.sword`. Minecraft's own older tutorials show the
  unnamespaced form, which is where it came from; the current wiki and the
  1.26.20 validation changes make the namespaced form the correct one.
- **Display name.** The only name key emitted was `item.<id>.name`. That is the
  *vanilla* item convention. For a **namespaced custom item** Minecraft
  generates the key `item.<namespace>:<local_name>` with **no `.name` suffix**,
  so nothing resolved and the raw key showed in the tooltip. `en_US.lang` now
  emits both keys, and `minecraft:display_name` points at the one the engine
  actually looks up.

### Changed

- `CREATIVE_CATEGORY` and `CREATIVE_GROUP` moved into `core/identifiers.js`.
  The bad group string was hard-coded inline in `tools/generate.mjs`, outside
  the module whose entire job is to own namespaced strings — which is why the
  existing identifier tests could pass while the shipped item was wrong.

### Added

- **`tests/unit/pack_output.test.mjs`** — contract tests that read the *real*
  generated item JSON, `item_texture.json` and `en_US.lang` rather than the
  helpers that produce them. Re-introducing either bug fails three of them.
- **Validator checks** for the creative category and group, for both name keys
  being present in `en_US.lang`, and for a missing `menu_category`. All three
  were negative-tested against seeded defects.
- **`verifyPng()`** (`tools/lib/png.mjs`), run by the validator on every sword
  icon: chunk CRCs, chunk ordering, 8-bit RGBA, non-interlaced, exact
  decompressed IDAT length and legal per-scanline filter bytes. Written while
  investigating the icon report — the PNG encoder here is hand-written, so
  "another decoder opened it" was not good enough evidence. It cleared the
  encoder rather than convicting it, and is kept as a permanent gate.

### Not fixed

- **The icon report could not be reproduced or traced to a defect.** Every link
  in the pipeline verifies: the `minecraft:icon` schema matches the current
  reference, the shortname resolves in `item_texture.json`, the path is correct
  and extension-less, the PNGs are byte-level conformant. The leading
  hypothesis is that the icon failure was a *consequence* of the invalid
  `menu_category`, since an item whose description block is rejected does not
  resolve its icon either — in which case the category fix resolves it too.
  Unconfirmed until the next in-game test.

## [0.5.0] — 2026-09-01

The **Elemental Collection** — the first seven final swords (roadmap step 5).
No new engine calls and no new code paths: every sword is data bound to the
abilities and systems the previous two milestones shipped.

### Added

- **Seven shipped swords**, each with a distinct gameplay identity rather than a
  recoloured stat block:

  | Sword | Rarity | Melee | Durability | Active (cooldown) | Passive on hit | Identity |
  |---|---|---|---|---|---|---|
  | Inferno 🔥 | Epic | 9 | 1100 | `cleave` (7 s) | `brand` | wide burning arc; damage falls off with angle |
  | Thunder ⚡ | Legendary | 9 | 1400 | `surge` (10 s) | `brand` | called down on the block you are looking at, up to 16 blocks away |
  | Frost ❄️ | Rare | 7 | 900 | `brand` (6 s) | `brand` | control, not damage: slowness and mining fatigue |
  | Wind 🌪️ | Rare | 6 | 800 | `repulse` (5 s) | `bolster` | scatters everything around you outward |
  | Earth 🪨 | Epic | 10 | 1500 | `burst` (9 s) | `bolster` | heaviest melee; ground shock with distance falloff |
  | Tidal 🌊 | Epic | 8 | 1200 | `repulse` (7.5 s) | `bolster` | a wave pushed *forward* through a cone |
  | Nature 🌿 | Rare | 7 | 1000 | `strike` (5.5 s) | `bolster` | single-target execute plus self-healing |

- **`cleave`** (`abilities/builtin/cleave.js`) — the one new ability this
  milestone needed: an arc whose damage falls off with the angle from the
  caster's view vector, drawn with `drawArc`.
- **`SWORD_CATALOG.md`**, generated by **`tools/catalog.mjs`** from the sword
  definitions themselves. `npm run catalog -- --check` fails CI when the
  committed catalogue drifts from the code, so the published stats cannot lie.
- **Seven hand-authored 16×16 textures** under `art/swords/`, each with its own
  silhouette, palette and material story (see `docs/TEXTURE_STANDARD.md`). All
  seven pass the texture linter with zero warnings, including the palette
  near-duplicate check.

### Changed

- **Thunder's texture was rebuilt.** Its first version passed every automated
  check but, rendered beside Frost, read as ice rather than lightning — the
  collection's only Legendary looked like a weaker Rare. It is now dark
  storm-iron with a gold arc along the fuller and a violet discharge at the tip,
  and `docs/TEXTURE_STANDARD.md` gained a "render it beside the whole set" step
  plus the worked example, because the linter cannot catch this class of
  failure.
- **Sword test matrix** in `docs/TESTING.md`, recording per sword what has been
  verified statically and what still requires a real client.

### Notes

- Wind and Tidal deliberately share the `repulse` ability. They differ only in
  binding data — area + `knockback.mode: 'away'` versus cone +
  `knockback.mode: 'forward'` — and play completely differently. That pair is
  the milestone's proof that the framework produces variety from data.
- `AbilityRegistry.unused()` now reports nothing: every shipped ability is bound
  by at least one sword.

## [0.4.0] — 2026-09-01

Combat, damage, targeting and the safety layer (roadmap step 4).

### Added

- **Central combat system** (`systems/combat.js`) — one funnel every damaging
  ability goes through, with a fixed ordering: validate → damage → target
  particles → impact sound → effects → ignite → knockback. Returns a
  `StrikeReport` carrying hit counts and a breakdown of *why* each target was
  refused, which is what makes the failures debuggable instead of silent.
- **Damage validation** (`systems/damage.js`) — a seven-step chain returning a
  named reason for every refusal, plus `resolveAmount`, which collapses `NaN`,
  `Infinity`, negatives and overflow to 0 rather than passing them to the
  engine. Self-damage is refused unless a binding explicitly opts in.
- **Two-layer hit protection** — a per-execution `Set` of entity ids stops one
  activation hitting the same entity twice; a per-player `hit:` cooldown key
  (`config.combat.hitProtectionTicks`) stops back-to-back activations
  machine-gunning one target.
- **Rate limiting** — `AbilityGate.checkRate` enforces
  `config.combat.minActivationIntervalTicks` per player, ahead of the cooldown
  check, so input spam is refused before any work is done.
- **Targeting modes** (`systems/targeting.js`) — `self`, `single`, `area`,
  `cone`, `ray` and `point`. `point` raycasts to a block and falls back to
  maximum reach in open air, which is what makes Thunder's called-down strike
  possible without an ability knowing anything about blocks.
- **Target categories** (`core/target_categories.js`) — `any`, `mob`, `hostile`,
  `passive`, `player`, `undead`, `arthropod`, mapped to verified vanilla
  `minecraft:type_family` values. Unions are applied in script because the
  engine's `EntityQueryOptions.families` is AND-semantics, not OR — a trap
  documented in `docs/API_NOTES.md`.
- **Knockback specs** with `mode: 'away' | 'forward'`, clamped to
  `config.combat.maxKnockbackHorizontal` / `maxKnockbackVertical`.
- **Vanilla effect catalogue** (`core/effect_catalogue.js`) — all 37 effects
  transcribed from `@minecraft/vanilla-data`, so `definition_validator.js` can
  reject a typo'd effect at startup and suggest the nearest real name.
- **Six built-in abilities** — `strike`, `burst`, `repulse`, `brand`, `surge`,
  `bolster` — each exercising a different part of the combat layer.
- **Edge-case test suite** (`tests/unit/edge_cases.test.mjs`) covering removed
  entities mid-execution, dead targets, zero-range specs, non-finite damage,
  empty target sets and self-targeting.

### Changed

- `systems/outcome.js` **removed**; `systems/combat.js` supersedes it with
  validation, refusal reporting and hit protection that the old composer had no
  place for.
- `config.js` gains `maxKnockbackHorizontal`, `maxKnockbackVertical`,
  `hitProtectionTicks` and `minActivationIntervalTicks`.

### Fixed

- `EffectService.impulse` routes `Player` targets to `applyKnockback`;
  `Entity.applyImpulse` is documented to throw on players.

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
