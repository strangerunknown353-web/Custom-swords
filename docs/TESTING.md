# Testing

Two kinds of testing happen here, and this document is careful never to let one
be mistaken for the other.

| | What it proves | What it cannot prove |
|---|---|---|
| **Automated** (`npm run check`) | the code is well-formed, the packs are internally consistent, the framework logic behaves as specified against a mocked engine | that Minecraft loads the pack, or that anything is fun |
| **In-game** (this checklist) | the add-on actually works | nothing about untested code paths |

**Automated checks passing is not evidence that the add-on works in Minecraft.**
Only the checklist below is.

---

## Automated

```bash
npm run generate    # rebuild derived pack content from sword definitions
npm run validate    # manifests, UUIDs, JSON, cross-references, architecture rules
npm test            # 543 unit + integration tests against a mocked @minecraft/server
npm run build       # produce dist/*.mcaddon and dist/*.mcpack

npm run catalog     # regenerate SWORD_CATALOG.md (`-- --check` to fail on drift)

npm run check       # generate + validate + catalog check + test
npm run all         # check + build
```

### What the validator checks

- both manifests parse, use `format_version` 2, and carry valid, globally unique
  UUIDs;
- every version triple matches `package.json`;
- the behaviour pack has both a `data` and a `script` module, the script
  `entry` file exists, and the `@minecraft/server` dependency is a 2.x release;
- the behaviour pack's resource-pack dependency matches the resource pack's real
  UUID and version;
- every JSON file in both packs parses;
- every item declares the `custom_swords:sword` custom component, and never the
  deprecated `minecraft:custom_components` array;
- every item's icon shortname exists in `item_texture.json` **and** the PNG it
  points at exists on disk;
- every item's display-name key exists in the resource pack `en_US.lang`;
- `pack.name` / `pack.description` exist in both packs' `.lang`, and both
  `languages.json` list `en_US`;
- sword and ability definitions satisfy the data model, including each ability's
  own parameter validation;
- definitions and item JSON are in one-to-one correspondence;
- every item carries both `minecraft:is_sword` and `custom_swords:is_custom_sword`;
- every icon sits under `textures/items/custom_swords/swords/`;
- every display-name key is `item.<id>` — the key the engine generates for a
  namespaced custom item — and both it and `item.<id>.name` exist in the
  resource pack `en_US.lang`;
- every item's `menu_category` names the `equipment` category and the
  **namespaced** `minecraft:itemGroup.name.sword` group;
- every ability binding's envelope is well-formed — an unknown activation
  method, two bindings on the same activation, a ranged targeting type without a
  range, a cone without an angle, an effect without a duration, a misspelled
  sound slot, an unknown restriction, an unknown knockback `mode`, an unknown
  target category;
- **every status effect names a real vanilla effect**, checked against the 37
  in `core/effect_catalogue.js`; a near-miss gets a "did you mean" suggestion
  rather than failing silently in-game;
- **every particle identifier can actually be spawned**, checked against
  `core/particle_catalogue.js` — which separates "does not exist" from "exists
  but needs Molang context from a host entity" and names the usable sibling for
  the second case;
- **every sound name is a `SOUND_LIBRARY` preset**, and **every id in
  `SOUND_LIBRARY` is a real vanilla sound event**, checked against the 1824
  events in `tools/data/vanilla_sound_events.json`;
- **every binding names a known visual profile**;
- **every sword declares a crafting recipe**, its pattern fits a 3×3 grid, every
  pattern character has a key and every key is used, every ingredient and repair
  item is a real vanilla item (checked against 1607 identifiers from Mojang's
  own metadata), and recipe identifiers are unique;
- **no two swords share an identifier, display name, texture shortname or
  localisation key** — the registry already rejected duplicate ids, but the
  other three collide silently;
- `SWORD_CATALOG.md` matches the definitions (`npm run catalog -- --check`);
- **the texture standard**: every sword has an authored source, of the right
  dimensions, with no unused palette tones, an unbroken silhouette, a real dark
  outline, enough tonal range to be shaded, and a shape not shared with any
  other sword;
- **architecture rules**: abilities and sword data never import
  `@minecraft/server`; no `setTimeout` / `setInterval`; exactly one
  `system.runInterval`, and only in `core/bootstrap.js`; every engine event
  subscribed exactly once and only from the bootstrap; no orphaned script
  modules;
- **the world-mutation ban list** (v1.0.0): no script may call `setType`,
  `setPermutation`, `fillBlocks`, `spawnEntity`, `spawnItem`, `createExplosion`,
  `setTimeOfDay`, `setWeather`, `setGameRule` or `runCommand`. The addon reads
  blocks — the dash needs to know where the ground is — and applies damage,
  effects and knockback, and does nothing else to the world. Several definitions
  argue at length for *not* using these APIs, so the scan blanks comments and
  strings before looking;
- **every damage cause is a real `EntityDamageCause`** (v1.0.0), checked against
  `core/damage_cause_catalogue.js`. This is the fourth catalogue of its kind and
  the most insidious of the four: Bedrock applies damage with an unrecognised
  cause rather than complaining, so the hit lands and only its classification is
  wrong. Both the binding's params and the ability's defaults are checked;
- **paired bindings agree about shared state** (v1.0.0). Ember, Shadow and Time
  each hold a passive and an active together with two matching string literals
  in different files; a mismatch would leave the passive filling a meter nothing
  reads, with nothing to see in game. State keys must also be unique across
  swords, since they are scoped to the player rather than the sword;
- **the per-activation particle budget** (v1.0.0). `maxPerEmit` caps a single
  call, but a binding drawing at each of twelve targets is inside every
  individual cap and still asks the client for hundreds in one frame;
- **icon distinctness** (v1.0.0). Every other texture rule grades an icon on its
  own, so a collection can pass all of them and still contain two nobody can
  tell apart in a hotbar slot;
- **every binding carries a label**, and **every binding that deals damage is
  describable by the catalogue** (both v1.0.0).

It also prints a roster of every sword — rarity, effective damage, durability,
targeting and cooldown — so balance outliers are visible on every build, plus
the crafting cost curve, the worst particle activation, the closest icon pair,
and the number of bindings that passed their ability's own parameter validation.

> That last count exists because of the bug that produced this milestone. The
> gate had been reading a field no sword definition carries, so it validated
> **zero** bindings while reporting a clean build for eleven milestones. A gate
> that checks nothing is indistinguishable from a gate that passes unless it
> says how much it checked.

### What the tests cover

The tests import the **real** framework modules — the ones shipped inside the
`.mcaddon` — with `@minecraft/server` swapped for `tests/mocks/minecraft_server.mjs`
via an ESM resolve hook. They are not a parallel reimplementation.

Covered: cooldown isolation between players and between keys, lazy expiry,
sweeping, player-state isolation, registry sealing, duplicate rejection and
deep-freezing, the identifier convention, rarity tiers, sword-stat resolution,
item identification across all five cases (our sword, another of our swords, a
vanilla sword, an unrelated item, malformed input), held-item lookup, the
declarative targeting dispatcher, binding-envelope validation, the diagnostics
commands, definition validation, vector and tick maths, targeting filters
(caster, invalid handles, never-target types, the PvP toggle, range and count
ceilings, cone geometry), damage clamping and self-damage refusal, particle
budgets, the sound library, the full use-and-hit pipeline, cooldown gating end
to end, HUD mirroring, and containment of a throwing ability.

Milestone 3 adds coverage for the activation system and its fallback rule, the
Ability Registry's reverse index, every step of the validation gate and its
ordering, all four restriction types including the fail-closed path, the extended
effect helpers, life-scoped state cleanup, and the texture quality gate.

Milestone 4 adds the combat layer: every step of the damage validation chain and
the named reason it returns, `resolveAmount` against `NaN`, `Infinity`,
`-Infinity`, negatives and `Number.MAX_VALUE`, target categories against the
vanilla type-family table, the `families`-is-AND workaround, all six targeting
modes including `point`'s open-air fallback, knockback clamping in both `away`
and `forward` modes, per-execution and per-player hit protection, rate limiting,
and a dedicated edge-case suite: an entity removed mid-execution, a target that
dies between validation and application, a zero-range spec, an empty target set,
and an ability that tries to target its own caster.

Milestone 5 adds the seven shipped swords: each definition validates, each binds
a registered ability, each has an authored texture that passes the linter, the
catalogue matches the definitions, and — the test that matters most — Wind and
Ocean, which share the `repulse` ability, produce measurably different knockback
vectors from the same code.

Bug-fix 2 adds the presentation layer: every visual profile references only
catalogued particles and real sound presets, no two profiles share a caster
particle or a cast sound, resolving a profile never mutates the frozen original,
a binding's explicit values still win, and — the assertion that would have
caught the original bug — **every shipped binding resolves to identifiers the
catalogues vouch for**.

The honest limit: a mocked engine accepts any string as a particle or sound id,
so no test here can prove something renders. What these tests prove is that the
identifiers reaching the engine are ones a *transcribed vanilla list* vouches
for. That is a real guarantee and a strictly weaker one than "it looks right".

Two tests deserve calling out:

- **The same ability bound twice with different envelopes must behave
  differently** (`pipeline.test.mjs`). That is the property the whole 20–25
  sword plan rests on, and the Wind/Ocean pair is its shipped proof.
- **Clearing life-scoped state must not clear cooldowns**
  (`player_state_lifecycle.test.mjs`). Otherwise dying resets a long cooldown,
  which is an exploit rather than a feature.

A separate smoke test imports `scripts/main.js` exactly as the manifest names
it and drives the real lifecycle: it asserts the whole module graph resolves,
that `start()` touches no world state during early execution, that exactly one
item component is registered, that no timer exists before `worldLoad`, and that
the single maintenance interval runs at 600 ticks afterwards.

The ZIP and PNG writers are covered too, since a malformed archive would
silently fail to import.

Not covered, by construction: anything about how Minecraft itself parses the
packs.

---

## Sword test matrix

**v0.5.2 passed a full client test** — creative category, icon, name, holding,
rendering, attack animation, abilities, particles, sounds and cooldowns were all
confirmed working by the project owner. The Tested column below is ticked for
the item-and-presentation layer on that basis.

What is **not** ticked is per-sword ability behaviour: the client test exercised
the add-on, not each sword's individual actives and passives. Ember Blade
(v0.6.0), Shadow (v0.8.0), Crystal and Void (v0.10.0), Solar, Gravity and Poison
(v0.11.0) and Time and Storm (v0.12.0) have not been in a client at all —
eleven of the sixteen. The v1.0.0 engineering pass changed code in all sixteen
and was likewise never launched, so no tick below has been re-earned since
v0.5.2.

The other columns record what is verified *statically*.

| Sword | Item id | Attack | Active (cooldown) | Passive | Texture | Sound | FX | Tested in-game |
|---|---|---:|---|---|:---:|:---:|:---:|:---:|
| Inferno 🔥 | `custom_swords:inferno_sword` | 9 | Cleave — burning arc, angular falloff (7 s) | Brand — ignite 3 s | ✅ | ✅ | ✅ | ☐ |
| Thunder ⚡ | `custom_swords:thunder_sword` | 9 | Thunder Strike — aimed target + 3 arcs at 60% falloff, ≤16 m (10 s) | Static Charge — discharges every 3rd hit | ✅ | ✅ | ✅ | ☐ |
| Frost ❄️ | `custom_swords:frost_sword` | 7 | Frost Nova — duration scales with nearness, +5 vs already-slowed (6 s) | Frostbite — slowness, escalates on a chilled target | ✅ | ✅ | ✅ | ☐ |
| Wind 🌪️ | `custom_swords:wind_sword` | 6 | Repulse — scatter outward, kb 2.2 (5 s) | Bolster — speed 4 s | ✅ | ✅ | ✅ | ☐ |
| Earth 🪨 | `custom_swords:earth_sword` | 10 | Burst — ground shock, distance falloff (9 s) | Bolster — resistance 5 s | ✅ | ✅ | ✅ | ☐ |
| Ocean 🌊 | `custom_swords:tidal_sword` | 8 | Repulse — forward wave in a cone, kb 2.6 (7.5 s) | Bolster — water breathing 15 s | ✅ | ✅ | ✅ | ☐ |
| Nature 🌿 | `custom_swords:nature_sword` | 7 | Strike — execute below 40 % health (5.5 s) | Bolster — regeneration 4 s | ✅ | ✅ | ✅ | ☐ |
| Shadow 🌑 | `custom_swords:shadow_sword` | 8 | Shadow Step — 6-block validated dash, light strike on arrival (7 s) | Shadow Edge — +6 and 2 lifesteal within 4 s of a step | ✅ | ✅ | ✅ | ☐ |
| Ember Blade 🔥 | `custom_swords:ember_blade` | 6 | Ember Burst — spends banked heat, 3 m radius (3.5 s) | Ember Edge — banks 1 heat per hit, max 5 | ✅ | ✅ | ✅ | ☐ |
| Crystal 🔮 | `custom_swords:crystal_sword` | 8 | Crystal Burst — 4.5 m ring, +1.2 damage to **every** target per extra target, capped at +4.2 (8 s) | Crystal Guard — Resistance 5 s below 60 % health, II below 30 %, once per 7 s | ✅ | ✅ | ✅ | ☐ |
| Void 🕳️ | `custom_swords:void_sword` | 9 | Void Rift — collapse at the aimed point up to 10 m, 3.5 m radius, 5→9 damage with reach, pulls inward (9 s) | Void Drain — up to 3 HP back, scaled by how little the target has left | ✅ | ✅ | ✅ | ☐ |
| Solar ☀️ | `custom_swords:solar_sword` | 9 | Solar Flare — 120° cone at 6 m, 3 damage at midnight rising to 11 at noon, blinds only in daylight (8.5 s) | Solar Radiance — +6 against undead at noon, +1.5 at midnight, nothing against the living | ✅ | ✅ | ✅ | ☐ |
| Gravity 🪐 | `custom_swords:gravity_sword` | 10 | Gravity Crush — 6 m well, pulls in and presses down, 5 damage on the floor rising to 12 five blocks up (10 s) | Heavy Force — pins straight down, +up to 3 scaled by the target's maximum health | ✅ | ✅ | ✅ | ☐ |
| Poison 🧪 | `custom_swords:poison_sword` | 6 | Venom Burst — 4 m ring, 4 damage +3 per venom tier the target carries, to 13; spends the venom (6.5 s) | Venomous Edge — deepens the target's poison one tier per hit, to Poison III | ✅ | ✅ | ✅ | ☐ |
| Time ⏳ | `custom_swords:time_sword` | 9 | Time Freeze — 4 m hold, 2 s spent on cooldown rising to 8 s at a full charge banked by waiting (12 s) | Temporal Edge — every hit winds the charge 3 s, plus a brief drag on the target | ✅ | ✅ | ✅ | ☐ |
| Storm 🌩️ | `custom_swords:storm_sword` | 9 | Storm Surge — 130° cone at 6 m, 4 damage standing still rising to 11 at a full sprint through the air (7.5 s) | Storm Momentum — Speed to the wielder, and knockback that scales with their motion | ✅ | ✅ | ✅ | ☐ |

Legend: ✅ = verified by `npm run check`. ☐ = not verified; requires a client.

The v0.5.0 failure is the reason the two columns are kept apart. Every ✅ below
was ✅ for the build that did not work in-game. A ✅ means a static check passed
and nothing more.

Column meanings, so a ✅ is not read as more than it is:

| Column | ✅ means |
|---|---|
| Texture | an authored `art/swords/*.json` source exists, compiles to a 16×16 PNG, and passes every rule in `docs/TEXTURE_STANDARD.md` with zero warnings |
| Sound | the binding names a real `SOUND_LIBRARY` preset **and** that preset's id is a real vanilla sound event, verified against the vanilla `sound_definitions.json` |
| FX | every particle identifier the binding resolves to — its own, or its visual profile's — is in the usable catalogue, and counts are within the per-emit budget. It does **not** mean the effect looks good |
| Tested in-game | **nothing yet** — see "Recording results" |

---

## In-game checklist

Import `dist/CustomSwords-v<version>.mcaddon`, create a **new** world with both
packs enabled, and turn on **Creative** plus cheats.

Content log: on Windows, `%localappdata%\Packages\Microsoft.MinecraftUWP_*\LocalState\logs`.
Enable *Settings → Creator → Content Log GUI* to read it in-game.

### A. Load

- [ ] Both packs appear in the world's pack list with correct names and icons
- [ ] No red error entries in the content log during world load
- [ ] The content log shows `[CustomSwords] Registered item component 'custom_swords:sword'.`
- [ ] The content log shows
      `[CustomSwords] v0.6.0 ready - 8 sword(s) (8 shipped, 0 diagnostic), 9 ability(ies).`

### A2. Item registration — run this first

These four regressed in v0.5.0. Check them before anything else; if any fails,
nothing below is worth testing.

- [ ] `/give @s custom_swords:inferno_sword` succeeds
- [ ] The sword appears in the creative **Equipment** tab, in the **sword**
      group, alongside the vanilla swords — **not** in Items
- [ ] Its tooltip reads **Inferno Sword** in purple — **not**
      `item.custom_swords:inferno_sword` and not any other raw key
- [ ] Its icon is the authored art — not the purple/black missing texture
- [ ] The same four hold for all eight items
- [ ] The content log contains no `menu_category`, texture or component errors

### B. Items, stats and textures

For **each** of the eight items:

- [ ] `/give @s custom_swords:<name>` succeeds
- [ ] It appears in the creative Equipment tab under Swords
- [ ] Its name is the readable display name in its rarity colour — not
      `item.custom_swords:<name>.name`
- [ ] Its icon is the authored art, **not** the purple/black missing texture
- [ ] The icon is clearly distinguishable from the other seven at hotbar scale —
      this is the check the texture linter cannot perform
- [ ] It renders as a held tool in first and third person
- [ ] Its melee damage matches `SWORD_CATALOG.md` (Inferno 9, Thunder 9,
      Frost 7, Wind 6, Earth 10, Ocean 8, Nature 7, Ember Blade 6)
- [ ] Its durability bar depletes when it is used to attack
- [ ] It can be enchanted at an enchanting table
- [ ] It can be repaired at an anvil with the material named in the catalogue
      (blaze rod, copper ingot, packed ice, phantom membrane, deepslate,
      prismarine shard, moss block, and copper ingot for Ember Blade)

### C. Registry and identification

- [ ] `/scriptevent custom_swords:list` reports
      `8 registered — 8 shipped, 0 diagnostic` and lists all eight
- [ ] `/scriptevent custom_swords:abilities` reports nine abilities and, for
      each, the swords that bind it — `repulse` must list **both** Wind and
      Ocean
- [ ] Holding each sword, `/scriptevent custom_swords:held` reports a
      **registered custom sword** with the right melee damage and lists its
      activations
- [ ] Holding a **vanilla** diamond sword, the same command reports a
      **vanilla sword — not managed by this addon**
- [ ] Holding dirt, it reports **not a custom sword**
- [ ] With an empty hand, it reports **main hand is empty**
- [ ] `/scriptevent custom_swords:info inferno_sword` prints the full record
- [ ] `/scriptevent custom_swords:info nope` prints a helpful error, not a crash

### D. Vanilla is untouched

- [ ] A vanilla diamond sword deals its normal damage and loses durability normally
- [ ] Right-clicking a vanilla sword does nothing unusual
- [ ] No content-log output appears when using vanilla items

### E. Ember Blade — the heat mechanic

Ember Blade is the only sword whose power comes from state carried between
activations, so it needs its own block. The thing to judge is whether the
mechanic **reads**: a player should work out on their own that hitting things
makes the burst stronger.

**Cold open (`use` → Ember Burst, 3.5 s, 3-block radius):**

- [ ] With no heat banked, right-click near mobs: they take modest damage, are
      pushed back slightly, and catch fire briefly
- [ ] Orange spark motes appear at the wielder, a small flame on each target,
      and a ring of glowing dust marks the 3-block reach
- [ ] A quench sound plays on cast, a crackle per target
- [ ] The action bar reads `Ember Burst   <n> hit`
- [ ] Using it again immediately is refused with a countdown
- [ ] With nothing in range it shows `Nothing close enough to scorch.` **and
      starts no cooldown**

**Banking heat (`attack` → Ember Edge):**

- [ ] Each melee hit that lands shows `heat 1/5`, `heat 2/5` … on the action bar
- [ ] Sparks appear on the target with each hit
- [ ] The counter stops at **5/5** and does not go higher
- [ ] Swinging at thin air banks nothing

**Spending it — the payoff:**

- [ ] Bank 5 heat, then burst: the damage is **clearly** higher than the cold
      open above, and the burn lasts longer
- [ ] The action bar reads `Ember Burst   <n> hit · 5 heat`
- [ ] Immediately bursting again does far less — the meter was emptied
- [ ] Bursting with heat banked but **nothing in range** does not consume the
      heat: the next burst on a real target must still be a big one

**Death resets it:**

- [ ] Bank heat, die, respawn: the next hit shows `heat 1/5`, not `heat 4/5`

**Feel:**

- [ ] The 0.22 s swing is noticeably faster than Inferno's — quick, not twitchy
- [ ] Ember Blade and Inferno are distinguishable in the hotbar **at a glance**

### F. Shadow Sword — the step, and what it must never do

Shadow Step is the only ability in the project that moves **you**. Its refusals
matter more than its successes: a bad teleport suffocates, drops or burns you,
and none of that is recoverable. Run the unsafe cases first.

**It must refuse, harmlessly, when:**

- [ ] You face a wall from point-blank — nothing happens, the action bar says
      the shadows are blocked, **and the cooldown does not start**
- [ ] You stand in a 1-block-wide corridor facing its end
- [ ] Everything ahead is a 2-block-high tunnel with a solid ceiling — the feet
      fit, the head does not, and it must still refuse
- [ ] A lava pool lies ahead at every distance from 2 to 6
- [ ] You face a sheer drop with no floor within 4 blocks

**It must work, and land you somewhere sane, when:**

- [ ] Open flat ground — you move the full 6 blocks forward
- [ ] A wall 4 blocks ahead — you land at 3, not against the wall or inside it
- [ ] A 2-block step down ahead — you take it
- [ ] You look straight up or straight down — you move **level**, never launched
- [ ] Water ahead — refused by default (`allowLiquid: false`)

**Terrain the mock could not model — the cases most likely to find a bug:**

- [ ] Half-slabs and stairs at the destination
- [ ] A doorway, fence or gate exactly at the far end of the step
- [ ] Standing in a boat or minecart
- [ ] The edge of a loaded chunk in a freshly generated world
- [ ] The Nether roof, and standing on bedrock at y=-64

**Arrival and combo:**

- [ ] Portal motes appear where you left **and** where you arrive, with a trail
      between
- [ ] A mob standing where you land takes light damage; a mob 10 blocks away
      does not
- [ ] Hitting a mob **within 4 seconds** of stepping deals clearly more damage
      than an ordinary swing, and heals you a little
- [ ] Waiting more than 4 seconds and hitting deals ordinary damage, no heal
- [ ] Dying and respawning closes the window — the next hit is ordinary

**Multiplayer:**

- [ ] Player A steps; player B does not move, and B's cooldown is untouched
- [ ] B hitting a mob right after A's step gets **no** empowered bonus

### F2. The seven elemental swords

One block per sword. The point of each is that it should feel like a *different
weapon*, not a recoloured one — judge that, not just whether damage numbers
appear.

**Inferno 🔥 (`use` → cleave, 7 s):**

- [ ] Right-click sweeps a burning arc ahead; everything in it catches fire
- [ ] Flame particles trace the arc, lava particles land on each target
- [ ] A mob at the centre of the arc takes clearly more than one at the edge
- [ ] Melee hits alone set mobs on fire briefly (the `brand` passive)

**Thunder ⚡ (`use` → Thunder Strike, 10 s):**

- [ ] Right-click while looking at a mob up to 16 blocks away: **that** mob is
      struck — not a random one, not the whole area
- [ ] The strike arcs onward to up to three more mobs standing near it, with a
      visible line of particles between each pair
- [ ] Each link takes **less** damage than the one before
- [ ] Line up six mobs: exactly four are hit, not all six
- [ ] Right-click at open sky: nothing happens, no cooldown starts, no error
- [ ] **No fires start.** No creeper becomes charged, no pig becomes a
      zombified piglin, no villager becomes a witch — the bolt is scripted, not
      a vanilla lightning entity
- [ ] The wielder takes no damage from their own strike
- [ ] **Static Charge:** every third melee hit visibly crackles and hits harder;
      the two hits between it are ordinary

**Frost ❄️ (`use` → Frost Nova, 6 s):**

- [ ] Right-click applies Slowness **and** Mining Fatigue with only light damage
- [ ] A ring of snowflakes marks the 6-block reach
- [ ] A mob at your feet stays slowed **noticeably longer** than one at the rim
- [ ] **The combo:** hit a mob in melee first (it gains Slowness), then nova it —
      it should take clearly more damage than an unchilled mob beside it
- [ ] The action bar reads `Frost Nova   n frozen · n shattered`
- [ ] Melee hits apply brief Slowness; a **second** hit on the same mob also
      applies Mining Fatigue and hits harder

**Wind 🌪️ (`use` → repulse, 5 s):**

- [ ] Right-click throws everything nearby **outward in all directions**
- [ ] The knockback is the strongest of any sword relative to its damage
- [ ] Melee hits give the wielder Speed (the `bolster` passive)

**Earth 🪨 (`use` → burst, 9 s):**

- [ ] Right-click shakes the ground: heavy damage at the centre, much less at
      the edge
- [ ] A smoke ring marks the reach
- [ ] Melee hits give the wielder Resistance
- [ ] It has the highest melee damage of the collection (10) and the slowest
      active

**Ocean 🌊 (`use` → repulse, 7.5 s):**

- [ ] Right-click pushes everything **forward, along the look direction**, in a
      cone — visibly different from Wind's outward scatter, despite both being
      `repulse`
- [ ] Targets behind the player are **not** affected
- [ ] Melee hits give the wielder Water Breathing

**Nature 🌿 (`use` → strike, 5.5 s):**

- [ ] Right-click hits one target for solid damage plus Poison and Slowness
- [ ] A target below 40 % health takes substantially more (the execute bonus)
- [ ] Melee hits give the wielder Regeneration

**Across the set:**

- [ ] Each sword's cooldown matches `SWORD_CATALOG.md`
- [ ] No sword damages its own wielder
- [ ] No content-log errors from any activation

### F3. Crystal Sword — the crowd, and the guard

Two mechanics that both need a *situation*, so neither can be checked by
swinging at one pig on flat ground.

**Crystal Burst (`use`, 8 s) — bring a crowd:**

- [ ] Against **one** mob within 4.5 blocks, right-click deals about 5 damage
- [ ] Against **four** mobs, each of them takes visibly more (about 8.6)
- [ ] Against **eight** mobs, each takes about 9.2 and no more — the cap holds
- [ ] Everything caught is Slowed for 3 seconds
- [ ] Everything caught is nudged outward, not thrown apart
- [ ] The amethyst chime plays and the mystical motes are visible
- [ ] With nothing in range, right-click costs no cooldown

**Crystal Guard (`attack`) — you have to be losing:**

- [ ] At **full health**, hitting mobs repeatedly grants no Resistance at all
- [ ] Below **12 hearts**, the next hit grants Resistance for 5 seconds
- [ ] Below **6 hearts**, it grants Resistance **II** instead
- [ ] It never goes above Resistance II however low you drop
- [ ] After it forms, swinging again does not re-form it for ~7 seconds
- [ ] The **mob** never gains Resistance — check its behaviour, or hit a
      second player in a PvP world and watch their effects
- [ ] The guard forming is *noticeable* — there is no action-bar message by
      design, so the sound and particles are the whole cue. If it is not
      noticeable, that is a finding, not a nitpick

### F4. Void Sword — reach, and the drain

**Void Rift (`use`, 9 s) — aim it:**

- [ ] Right-click while looking at a mob **ten blocks away**: the rift opens
      there and damages it
- [ ] A mob standing **next to you** while you aim far away is *not* hit
- [ ] A rift opened at your feet (look at the ground) hits for noticeably less
      than one opened at full reach
- [ ] Mobs caught are dragged **toward** the rift, not away from it
- [ ] Mobs caught are Weakened for 4 seconds
- [ ] The tether and ring particles make the rift's location readable — if you
      cannot tell where it landed, that is a finding
- [ ] **No blocks are broken, placed or changed.** Fire the rift into a build
      and confirm the build is untouched
- [ ] Nothing is left behind after the activation — no lingering entity, no
      portal, no particles that outlive the cast by more than a moment
- [ ] Aiming at open sky with nothing in range costs no cooldown

**Void Drain (`attack`):**

- [ ] Hitting a **full-health** mob restores nothing
- [ ] Hitting a mob at **1 heart** restores health, up to about 1.5 hearts
- [ ] It never takes you above your maximum health
- [ ] Repeatedly hitting one high-health mob (a ravager, an iron golem) does
      **not** sustain you — this is the abuse case the mechanic is shaped to
      prevent, and it is the single most important line in this section

### F5. Solar Sword — the sword that keeps office hours

The only sword whose power depends on something outside the fight, so this
section needs `/time set` and a trip to the Nether.

**Solar Flare (`use`, 8.5 s):**

- [ ] `/time set noon` — the flare hits for about 11 and **blinds** what it hits
- [ ] `/time set midnight` — the same flare hits for about 3 and blinds nothing
- [ ] Dawn and dusk land somewhere in between rather than snapping between the two
- [ ] The action bar names the sun percentage, so the difference reads as a
      mechanic rather than as a broken sword. **If it does not, that is a
      finding**
- [ ] In the **Nether** at any hour, the flare is at its floor
- [ ] In the **End** at any hour, the flare is at its floor
- [ ] **Nothing catches fire.** Fire the flare into dry grass, a wooden build and
      a group of mobs, and confirm no ignition anywhere. This is the line that
      separates Solar from Inferno and Ember Blade

**Solar Radiance (`attack`):**

- [ ] At noon, zombies and skeletons die markedly faster than creepers or pigs
- [ ] At midnight the undead bonus is small but not zero
- [ ] A **husk, drowned, stray or wither skeleton** is smitten too — the bonus
      reads Bedrock's undead type family, not a list, so all of them should work
- [ ] A creeper, spider or villager gets no bonus at any hour

### F6. Gravity Sword — fighting upward

Needs something airborne. A phantom at night, a blaze in a fortress, or a mob
standing on a two-block pillar all work.

**Gravity Crush (`use`, 10 s):**

- [ ] Against a mob at your feet, about 5 damage
- [ ] Against a mob roughly five blocks above you, about 12
- [ ] Against a mob *below* you, the floor — this is altitude, not distance
- [ ] Everything caught is dragged **towards** you and **downwards**, never
      scattered or launched
- [ ] The ring particle makes the well's reach readable — if you cannot tell
      what was inside it, that is a finding
- [ ] No blocks move, fall, or change. Fire it inside a build and confirm

**Heavy Force (`attack`):**

- [ ] Mobs are pressed **down** rather than knocked back — they should stay
      roughly where they were
- [ ] An iron golem or ravager takes visibly more than a chicken or a bat
- [ ] A *wounded* iron golem still takes the full bonus (mass is its maximum
      health, not what is left of it)
- [ ] Hitting the Ender Dragon or a Warden is worth no more than an iron golem

### F7. Poison Sword — the meter kept on the enemy

**Venomous Edge (`attack`):**

- [ ] The first hit on a fresh mob applies Poison I
- [ ] The second applies Poison II, the third Poison III
- [ ] It stops at Poison III however long you keep swinging
- [ ] Walking away and letting it expire loses the stack — a mob left alone for
      six seconds is back to nothing

**Venom Burst (`use`, 6.5 s):**

- [ ] Against a clean mob, about 4 damage
- [ ] Against a mob you have worked to Poison III, about 13
- [ ] Immediately after a burst, a **second** burst on the same mob is weak
      again — the venom was spent, not just read
- [ ] The burst leaves its targets poisoned, not cured
- [ ] **The exploit check:** poison a mob with a splash potion or let a witch do
      it, then burst. If the sword pays out for poison it did not apply, note
      it — that is a known open question, not a surprise

### F8. Time Sword — the sword you are not supposed to use

The only sword in the collection where holding the button is the wrong play, so
this section needs a stopwatch more than it needs mobs.

**Time Freeze (`use`, 12 s):**

- [ ] A freshly given sword, fired once, holds for the **full** eight seconds —
      a sword never fired has been waiting forever
- [ ] Fire it again the instant the cooldown lifts: the hold is about **two**
      seconds
- [ ] Wait a full minute and fire: the hold is eight seconds again
- [ ] The action bar reports the charge percentage on every cast. **If you cannot
      tell from playing that waiting matters, that is a finding**, not a nitpick
- [ ] Fire it at empty air on a full charge, then immediately at a mob — the mob
      still gets the full hold. Losing a banked minute to a mistimed click would
      feel terrible
- [ ] Die on a full charge, respawn, fire: the hold is **short**. Dying must not
      be a way to reload
- [ ] Held mobs stop moving, then recover on their own. Nothing stays slowed
- [ ] Held mobs are not shoved anywhere
- [ ] Reload the world mid-freeze: nothing is left frozen, and no errors appear

**Temporal Edge (`attack`):**

- [ ] Landing twenty hits and then firing gives roughly a full-charge hold
- [ ] Every hit leaves a brief drag on the target — every hit, not some

### F9. Storm Sword — never stand still

**Storm Surge (`use`, 7.5 s):**

- [ ] Standing still, the surge is a shove — about 4 damage
- [ ] **Sprinting** into the group, it is noticeably harder
- [ ] Sprinting **and falling** into them, it is hardest — about 11
- [ ] The knockback grows with your speed too, not just the damage
- [ ] Everything caught is slowed as well as thrown
- [ ] **No lightning bolt appears.** Surge into dry grass, a wooden build and a
      creeper: nothing ignites, nothing is charged, no block changes
- [ ] The weather does not change

**Storm Momentum (`attack`):**

- [ ] **You** get Speed on a landed hit. The mob does not
- [ ] Hitting while sprinting throws the target further than hitting still
- [ ] The loop works: hit, gain speed, sprint, surge harder

**If the surge feels identical whatever you are doing**, `isSprinting` /
`isFalling` are not reporting the way this sword assumes. That is the single most
valuable thing this checklist can find.

### G. Combat safety layer

- [ ] Spam-clicking any sword as fast as possible produces refusals, never
      double damage or a content-log error
- [ ] One activation never damages the same mob twice (check with a boss-bar mob
      or by watching a single zombie's health)
- [ ] Two activations back to back within half a second do not both damage the
      same mob (hit protection)
- [ ] Standing in lava or on fire does not change how any ability resolves
- [ ] Using a sword's active with nothing in range costs no cooldown
- [ ] Killing a mob mid-sweep (so it dies between targets) does not error

### H. Multiplayer

Requires two players on one world or dedicated server. This is the scenario the
whole "shared metadata, private state" rule exists for, so run it deliberately
rather than casually.

**Setup:** give player A the Inferno Sword and player B the Frost Sword. Stand
them within 5 blocks of each other with several mobs between them.

- [ ] A uses Inferno's active; **B's Frost Sword is still ready** — no shared
      cooldown
- [ ] B uses Frost's active while A is still cooling down; B's fires normally
- [ ] Each player's action bar shows only their own messages — B never sees A's
      `Cleave  3 hit`
- [ ] A's cleave does not damage B while
      `config.combat.allowPlayerVersusPlayer` is `false`
- [ ] Both players fire an area ability in the same tick: each hits its own
      targets, neither is refused because of the other, and no mob takes double
      damage
- [ ] Give both players the **same** sword: their cooldowns run independently
- [ ] Give A the Wind Sword and B the Ocean Sword and fire both at the same mob
      group: the two knockback directions are visibly different
- [ ] A disconnects and reconnects: no leftover cooldown, and B is unaffected
      throughout
- [ ] Neither player's content log shows an error

### I. Death, respawn and reconnect

- [ ] Dying while the sword is on cooldown, then respawning: the cooldown is
      **still running** (dying must not be a free reset)
- [ ] Reconnecting after a disconnect: the cooldown is clear
- [ ] No content-log errors around death or respawn

### J. Stability

- [ ] Ten minutes of normal play produces no content-log errors
- [ ] No frame-rate drop while idle (there are no gameplay tick loops)
- [ ] Leaving and rejoining the world reloads the pack cleanly

---

## Recording results

Add a dated section per milestone. Do not tick a box that has not actually been
performed.

### v0.1.0 — not tested in Minecraft

Passed every automated check; never loaded into a client.

### v0.2.0 — not tested in Minecraft

The core sword framework passed every automated check (`npm run all`, 173
tests), the validator was negative-tested against ten seeded defects, and the
`.mcaddon` was verified to be a well-formed archive with the expected contents.
It was **not** loaded into a Minecraft client.

### v0.3.0 — not tested in Minecraft

The Ability Engine and the texture standard passed every automated check. The
The diagnostic sword's icon was reviewed visually as a rendered contact sheet, which is
not the same as seeing it in a hotbar. Never loaded into a client.

### v0.4.0 — not tested in Minecraft

The combat, damage and targeting layer passed every automated check, including
the edge-case suite. Never loaded into a client.

### v1.2.0 — the silhouette correction, not tested in Minecraft

| Check | Result |
|---|---|
| `npm run validate` | **0 errors, 0 warnings** |
| `npm test` | **543 passed**, 0 failed — unchanged, because no gameplay code changed |
| Blade proportion | 67-87% blade across all sixteen, floor 65%; leanest is Ember Blade at 67% |
| Crossguard | wider than its blade on every sword, from 8-vs-4 to 14-vs-7 |
| Silhouette | worst overlap 95% (Inferno/Crystal), ceiling 95% |
| Colour | closest pair Frost/Wind at 50.7, floor 50 |
| Registration | re-verified on the built archives after the art change: 16 identifiers, names, icons, recipes and lang keys all intact |
| Packages | `.mcaddon` 141 entries, BP `.mcpack` 120, RP `.mcpack` 21 — all CRC-clean, all manifests `[1,2,0]` |

**The defect this release fixed was one the pipeline could not see.** Every
texture rule in the project graded an icon's colour, contrast, palette
discipline or silhouette *overlap* with its neighbours. Not one of them could
distinguish a sword from a knife, so sixteen icons whose handles were longer
than their blades passed a clean build. The measurement now exists, and
shortening a blade back to the old proportion was confirmed to trip it.

**Three orientations were tried before one worked**, and the failures are worth
recording because they were not arbitrary. A diagonal blade long enough to be
70% of the icon runs off the edge of a sixteen-pixel canvas before there is
room for a hilt — which is why vanilla's own blade stops at eight rows — and
both attempts to buy the length back (pinning one blade edge, leaning the blade
harder) produced a curved shape that read as a flame standing on a plinth. A
procedurally generated hilt produced a pedestal. Upright, with a horizontal
crossguard, is what reads.

**What this release did not do, and cannot claim:** nothing here has been in
Minecraft. The icons were rendered and looked at, at hotbar scale and enlarged,
against each other — which is the closest this environment gets to seeing them
in an inventory, and is not the same thing. In particular, whether an upright
sword sits well beside vanilla's diagonal ones in a real hotbar is a judgement
only a client can settle.

### v1.1.0 — the art pass, not tested in Minecraft

| Check | Result |
|---|---|
| `npm run validate` | **0 errors, 0 warnings** |
| `npm test` | **543 passed**, 0 failed |
| Textures | 16 redrawn; closest colour pair Frost/Wind at 60.0 (floor 50); widest silhouette overlap Thunder/Ocean at 93% (ceiling 95%) |
| Registration | verified **on the built archives**: 16 unique identifiers, all in the equipment/sword category, every display name resolving through `.lang`, every icon wired to the atlas |
| Recipes | 16, one per item, all `crafting_table`, every pattern within 3×3, every key used, every result one of our items |
| Vanilla safety | the resource pack contains 16 namespaced PNGs, one additive atlas file and one `.lang` whose every key is `item.custom_swords:*` or `pack.*` — nothing vanilla is overridden |
| Manifests | both format_version 2, both `[1,1,0]`, min engine `[1,21,120]`, BP→RP dependency resolving to the RP's real UUID, `@minecraft/server` 2.0.0 |
| Sounds | worst case cut from 13 in one frame to 4 |
| Effects | 27 applications, all finite, longest 15 s, ceiling now 30 s |
| Performance | 6 engine subscriptions, 1 recurring interval, 0 gameplay tick loops — unchanged since v0.9.0 |

**Three things were re-audited and found correct**, and are recorded here
because "we checked and there was nothing wrong" is a result:

1. **No re-entrancy path exists for ability damage.** `applyDamage` does not
   re-fire the item component — that fires on a player's melee swing, not on
   scripted damage — and the addon subscribes to no damage event at all, so
   there is no signal an ability could feed back into itself.
2. **No unused imports** anywhere in the behaviour pack.
3. **Nothing permanent.** Every one of the 27 effect applications carries a
   finite duration; the longest is Ocean Sword's 15-second water breathing, on
   its own wielder.

**One test in this release was wrong before it was right.** The sound-cap
regression asserted `impacts.length <= CONFIG.combat.maxImpactSoundsPerStrike` —
comparing the cap against itself, which passes at any setting. Rewritten against
a literal and against the number of targets actually struck, it fails with 12
sounds when the cap is lifted. A regression test that cannot fail is worse than
no test, because it reports safety.

**What this release did not do, and cannot claim:** nothing here has been in
Minecraft. Not the sixteen new textures, not the renamed Ocean Sword, not the
sound cap. Every number above comes from static validation, from unit tests
against a mocked engine, or from unzipping the built packages and reading them.
The icons were rendered and looked at, at both enlarged and hotbar scale, which
is the closest this environment gets to seeing them in a hotbar — and it is not
the same thing.

### v1.0.0 — the final engineering pass, not tested in Minecraft

| Check | Result |
|---|---|
| `npm run validate` | **0 errors, 0 warnings** — the first release with a completely clean validate |
| `npm test` | **540 passed**, 0 failed |
| Ability parameters | **32 of 32 bindings validated** — previously 0, see below |
| Recipes | 16 recipes, 69 ingredient/repair items verified against 1607 vanilla items; no two swords craft from the same grid |
| Registry | 16 swords, 28 abilities, none orphaned |
| Shared state | 5 state keys, 4 cross-binding pairings agreed, no collisions between swords |
| Textures | 16 sources, 0 errors, 0 warnings; closest icon pair Frost/Ocean at 62.3 against a floor of 50 |
| Particles | worst single activation 72, median 28, budget 120 |
| Cost curve | 9× tier 2, 4× tier 3, 3× tier 4 |
| Performance | 6 engine subscriptions, 1 recurring interval, 0 gameplay tick loops — **unchanged since v0.9.0**, seven swords ago |
| World mutation | **0 call sites** across the whole behaviour pack, now enforced |

**The defect that defined this milestone was in the testing itself.**
`tools/validate.mjs` ran each ability's `validateParams` against `sword.active`
and `sword.passive` — fields no sword definition has ever carried, since all
sixteen keep their bindings in `sword.abilities`. The loop found `undefined`
every time and skipped, so twenty-five abilities' worth of parameter constraints
had never once run against real sword data. Every build reported a clean pass
for it.

Wiring it up correctly turned up **no** hidden violations: all 32 bindings pass.
That is a good outcome and a slightly uncomfortable one — the gate was dead for
eleven milestones and nothing went wrong in the meantime, which is precisely why
nobody noticed. The gate now reports how many bindings it checked, so the
silence has a number attached to it.

**A second defect was found by reading rather than by any check.**
`CombatSystem.strike` read `target.location` for the impact particles and sound
immediately after `damage.apply` may have killed that target. `Entity.location`
throws on a handle the engine has already released, and a throw there escaped
`strike` entirely — abandoning every target still in the list. Drawing the blow
that killed something is the most common moment in the game, so this was the
worst possible place in the codebase to read without a guard. The same pattern
appeared in three passives.

Both fixes are covered by tests that were confirmed to **fail without them**,
which is the only way to know a regression test is doing anything. The mock now
models the engine releasing a handle on a lethal hit; that fidelity is what made
the combat case testable at all.

**What this release did not do, and cannot claim:**

- Nothing was tested in Minecraft. Not the fixes, not the re-priced Ember Blade,
  not the repainted Earth Sword, not one of the sixteen swords.
- The icon-distinctness floor (50) and the particle budget (120) were chosen
  from the collection as it stands rather than from any measurement of what a
  low-end device actually struggles with. They are calibrated guesses that will
  catch a regression and should not be mistaken for device testing.
- The balance table is arithmetic on declared values. Whether Ember Blade *feels*
  right at 4.5 seconds is a question only play answers.

### v0.12.0 — Time and Storm, the roster complete, not yet tested in Minecraft

| Check | Result |
|---|---|
| `npm run validate` | 0 errors, **1 warning** (see below) |
| `npm test` | **529 passed**, 0 failed |
| Recipes | 16 recipes, 68 ingredient/repair items verified against 1607 vanilla items; no two swords craft from the same grid |
| Registry | 16 swords, 28 abilities, none orphaned |
| Textures | 16 sources, 0 errors, 0 warnings; Time 11 colours / 36 % / spread 230, Storm 12 / 36 % / 231 |
| Sounds | 42 presets verified against 1824 vanilla sound events |
| Cost curve | 10× tier 2, 3× tier 3, 3× tier 4 — published in `SWORD_CATALOG.md` |
| Performance | 6 engine subscriptions, 1 recurring interval, 0 gameplay tick loops — **unchanged since v0.9.0**, seven swords ago |

**The one warning is deliberate.** Thunder Sword is Legendary but its costliest
ingredient is a lightning rod (tier 2), below the floor its rarity implies. It
is a pre-existing shipped recipe and a balance judgement rather than a defect,
so it is recorded for the balance pass rather than redesigned alongside two new
swords.

**Two defects were caught before shipping, both by work done in this milestone
rather than by the existing gates:**

1. **Time Freeze held targets the combat layer had refused.** The first draft
   struck the whole target list in one call, then applied the hold to every
   target in a second pass — so a target outside the binding's allowed
   categories, or inside another player's hit-protection window, would have been
   frozen by an ability that never touched it. A filter bypass, found by the
   optimization pass, fixed by striking one at a time.
2. **Storm Sword was drafted a Legendary on entirely tier-2 materials.** The new
   crafting-progression audit caught it on its first run. Fixed by accepting the
   tier its ingredients actually describe, not by re-tiering the ingredients.

**Two things are new in kind, and each has a failure mode no check here can
see:**

1. **Time Sword is the first sword where not pressing the button is a play.**
   The tests prove the hold scales with the wait. Nothing proves a player
   *notices* — the action bar reports the charge percentage on every cast for
   exactly that reason, and whether it lands is a client question.
2. **Storm Sword reads the wielder's motion.** `isSprinting` and
   `isOnGround`/`isFalling` were chosen over `getVelocity()` because server-side
   player velocity in Bedrock is unreliable. Whether *these* report reliably
   mid-combat is the single most important thing to check: if they do not, the
   sword silently works at its floor and never feels like anything.

Specifically to check:

- [ ] Time Freeze held straight off cooldown is noticeably shorter than one held
      after a minute of carrying the sword
- [ ] The action bar names the charge percentage, and it reads as a mechanic
- [ ] Firing into empty air does **not** empty the charge
- [ ] Dying does **not** refill the charge
- [ ] Held mobs recover on their own with no lingering slowness
- [ ] Twenty landed hits get you roughly the same charge as a minute of waiting
- [ ] Storm Surge sprinting is visibly stronger than standing still
- [ ] Storm Surge while falling into a group is stronger again
- [ ] **No lightning bolt is ever spawned** — surge into dry grass and a wooden
      build and confirm nothing catches fire and no creeper is charged
- [ ] Storm Momentum gives *you* Speed, never the mob
- [ ] Both new recipes work in survival and produce exactly one sword
- [ ] The Mythic name colour (red) renders for Time Sword

### v0.11.0 — Solar, Gravity and Poison, not yet tested in Minecraft

| Check | Result |
|---|---|
| `npm run validate` | OK — 0 errors, 0 warnings |
| `npm test` | **492 passed**, 0 failed |
| Recipes | 14 recipes, 59 ingredient/repair items verified against 1607 vanilla items; no two swords craft from the same grid |
| Registry | 14 swords, 24 abilities, none orphaned |
| Textures | 14 sources, 0 errors, 0 warnings; Solar 11 colours / 34 % / spread 233, Gravity 11 / 38 % / 233, Poison 12 / 34 % / 209 |
| Sounds | 36 presets verified against 1824 vanilla sound events |
| Performance | 6 engine subscriptions, 1 recurring interval, 0 gameplay tick loops — **unchanged since v0.9.0**, five swords ago |

**Two defects were caught by the automated layer this milestone, and both are
worth recording because they are the kind that ship silently:**

1. **`glowing` is not a Bedrock effect.** Solar Radiance's first draft applied
   it. `core/effect_catalogue.js` rejected it at build time; without that
   catalogue, `addEffect` would have failed quietly on every single swing and
   the only symptom would have been a mark that never appeared.
2. **Gravity Crush advertised a ceiling it could not reach.** A five-block well
   paired with a six-block full-height bonus meant anything high enough to earn
   the maximum was already outside the entity query. The sword would have worked
   — it would just never have dealt its stated damage. A unit test caught it;
   nothing else would have.

**Three things are new in kind, and each has a failure mode no check here can
see:**

1. **Solar is the first sword that is deliberately weak half the time.** The
   tests prove the damage tracks the clock. Nothing proves a player reads that
   as a mechanic rather than as a broken sword — which is why the action bar
   names the sun percentage, and whether that is enough is a client question.
2. **Gravity Crush is aimed upward.** The tests prove damage scales with height
   against a mocked entity at a set coordinate. Whether the well's ring particle
   makes its reach legible, and whether phantoms are actually inside it in a real
   fight, is not something a mock can answer.
3. **Poison stores its meter in the poison effect itself.** That means a
   *different* source of poison — a witch, a cave spider, a splash potion —
   feeds the sword's meter. It is arguably correct and arguably an exploit, and
   only play settles it.

Specifically to check:

- [ ] Solar Flare is visibly stronger at noon than at midnight
- [ ] Solar Flare is weak in the Nether **at every hour**
- [ ] Solar Flare sets **nothing** on fire — swing it into dry grass and a
      wooden build and confirm
- [ ] Solar Radiance kills zombies and skeletons markedly faster than creepers
- [ ] Gravity Crush hits a phantom or a blaze harder than a zombie at your feet
- [ ] Gravity Crush pulls inward and downward, never scattering
- [ ] Heavy Force pins mobs rather than knocking them back
- [ ] Venomous Edge visibly deepens poison over three hits on one mob
- [ ] Venom Burst hurts a well-poisoned mob far more than a fresh one
- [ ] A second Venom Burst straight after the first is weak (the venom was spent)
- [ ] All three new recipes work in survival and produce exactly one sword
- [ ] None of the nine new particles or seven new sounds are silent or missing

### v0.10.0 — Crystal and Void, not yet tested in Minecraft

| Check | Result |
|---|---|
| `npm run validate` | OK — 0 errors, 0 warnings |
| `npm test` | **436 passed**, 0 failed |
| Recipes | 11 recipes, 44 ingredient/repair items verified against 1607 vanilla items |
| Registry | 11 swords, 18 abilities, none orphaned |
| Textures | 11 sources, 0 errors, 0 warnings; Crystal 13 colours / 37 % / spread 238, Void 12 colours / 39 % / spread 240 |
| Sounds | 29 presets verified against 1824 vanilla sound events |
| Performance | 6 engine subscriptions, 1 recurring interval, 0 gameplay tick loops — unchanged from v0.9.0 despite two more swords |

**Three things here are new in kind, not just in number, and each has a way to
fail that no automated check in this repository can see:**

1. **Crystal Guard is the first mechanic with no action-bar feedback.** `attack`
   activations deliberately get none, so the only signal that the guard formed
   is the `resonate.amethyst_block` cue plus caster particles. The tests prove
   the effect is applied; nothing proves a player *notices*.
2. **Void Rift is the first ability that acts somewhere the player is not.** The
   tests prove it detonates at the resolved point and that damage rises with
   reach — against a mocked raycast. Whether ten blocks is aimable on touch
   controls, and whether the tether and ring particles make the rift's location
   readable, is a client question.
3. **Two new particle vocabularies.** `lab_table_misc_mystical_particle`,
   `magnesium_salts_emitter`, `dragon_breath_trail`, `obsidian_tear_particle`
   and `end_chest` are all in the usable catalogue and all previously unused by
   this project. The catalogue says they *can* be spawned standalone; only a
   client says they look like anything.

Specifically to check:

- [ ] Crystal Burst visibly hits harder against a crowd than against one mob
- [ ] Crystal Guard forms when you drop below ~12 hearts and is noticeable
- [ ] Crystal Guard does **not** form at full health, however much you swing
- [ ] Void Rift opens where you are looking, not at your feet
- [ ] Void Rift drags mobs toward the rift rather than scattering them
- [ ] Void Drain heals visibly more from a nearly-dead mob than a fresh one
- [ ] Both new recipes work in survival and produce exactly one sword
- [ ] Neither new sword's particles or sounds are silent or missing

### v0.9.0 — crafting, not yet tested in Minecraft

| Check | Result |
|---|---|
| `npm run validate` | OK — 0 errors, 0 warnings |
| `npm test` | **405 passed**, 0 failed |
| Recipes | 9 recipes, 35 ingredient/repair items verified against 1607 vanilla items |
| Registry | 9 swords, 14 abilities, none orphaned |
| Package | 9 `.recipe.json` files present in the `.mcaddon` |

**Crafting is the thing to test first, and the automated checks cannot reach
it.** They prove the JSON is well-formed and the ingredient ids are real; they
cannot prove Minecraft accepts the recipe, that the pattern is what the player
must lay out, or that nothing conflicts with a vanilla recipe.

For each of the nine swords, in survival at a crafting table:

- [ ] The recipe produces **exactly one** sword
- [ ] The pattern shown in `SWORD_CATALOG.md` is the one that works
- [ ] It appears in the recipe book once you hold the unlocking item
- [ ] No vanilla recipe stopped working (check a vanilla sword and a pickaxe)

### v0.8.0 — Shadow Sword, not yet tested in Minecraft

| Check | Result |
|---|---|
| `npm run validate` | OK — 0 errors, 0 warnings |
| `npm test` | **396 passed**, 0 failed |
| Registry | 9 swords, 14 abilities, none orphaned |
| Uniqueness | ids, names, texture shortnames, lang keys all unique |
| Sound presets | 23 verified against 1824 vanilla events |
| Performance | 6 subscriptions, 1 interval, 0 gameplay tick loops |

Shadow Step's refusals are covered by eighteen assertions against a mock world
with walls, drops, lava and unloaded chunks carved into it. **That is not the
same as a real world**, and this is the ability where the gap matters most —
a mock cannot reproduce slabs, stairs, fences, boats, scaffolding, or a chunk
boundary under load.

**Test Shadow Step against real terrain before trusting it.** The in-game
checklist has a dedicated block; the cases most likely to find something are
the ones the mock cannot model:

- half-slabs and stairs at the destination (passable feet, solid-ish footing);
- a doorway or fence line exactly at 6 blocks;
- standing in a boat or minecart;
- the edge of a loaded chunk in a fresh world;
- the Nether roof and bedrock floor, where world bounds are in play.

### v0.7.0 — Frost and Thunder finalized, not yet tested in Minecraft

| Check | Result |
|---|---|
| `npm run validate` | OK — 0 errors, 0 warnings |
| `npm test` | **377 passed**, 0 failed |
| Uniqueness | 8 swords: ids, names, texture shortnames, lang keys all unique |
| Abilities | 12 registered, **none orphaned** (`surge` removed rather than left unbound) |
| Sound presets | 21 verified against 1824 vanilla events |
| Textures | 8 sources, 0 warnings; Frost rebuilt, spread 226 |

**Not tested in a client — I have no Minecraft environment.** What to watch for
when it is, beyond the usual regression pass:

- **Does the Frost combo read?** A player should notice that hitting things
  first makes the nova hurt more. The action bar says `4 frozen · 2 shattered`,
  but whether that lands is a design question no test answers.
- **Does the chain look like lightning?** It is particles along a line, not a
  vanilla bolt — deliberately, see `docs/API_NOTES.md` §3c. If it reads as a
  dotted trail rather than an arc, the fix is particle choice and density.
- **Is `random.fizz`/`item.trident.thunder` the right audio** for these swords.
- Whether Static Charge's every-third-hit rhythm is noticeable in real combat.

### v0.6.0 — Ember Blade, not yet tested in Minecraft

| Check | Result |
|---|---|
| `npm run generate` | up to date, 8 definitions |
| `npm run catalog -- --check` | up to date |
| `npm run validate` | OK — 0 errors, 0 warnings |
| `npm test` | **359 passed**, 0 failed |
| Uniqueness | 8 swords: ids, names, texture shortnames, lang keys all unique |
| Sound presets | 21 verified against 1824 vanilla events |
| Registry | 8 shipped, 0 diagnostic; 9 abilities, none orphaned |

New guards, negative-tested by seeding the defect: two swords sharing a display
name, and two sharing a texture shortname, are both build failures.

**Ember Blade has never been in a client.** The specific things worth watching
when it is:

- whether the heat mechanic *reads* — a player needs to notice that hitting
  things makes the burst stronger. The action bar shows `heat n/5` on each hit
  and `n hit · n heat` on the burst, but whether that lands is a design question
  no test answers.
- whether 0.22s swing duration feels good or twitchy;
- whether Ember Blade and Inferno are actually distinguishable in the hotbar at
  a glance, which is the only real test of the texture work;
- whether the ember particles and the quench/crackle sounds suit the sword.

### v0.5.2 — TESTED IN MINECRAFT · PASSED

The project owner confirmed all of the following working in Minecraft Bedrock:
custom sword in the correct Sword/Combat section, icon displaying, human-readable
name, obtainable, holdable, rendering correctly, normal attack, attack animation,
ability system, visual effects, sounds, and cooldowns.

This closed out two rounds of client failures (v0.5.0 and v0.5.1) and is the
project's first green client test.

### v0.5.2 — automated results at time of shipping

The user reported that the sword animations were not working. The audit found
the abilities had been firing correctly all along — they were invisible and
inaudible, because most of the identifiers they handed the engine were not real:
fourteen sound presets that were never defined, and five particle identifiers
that render nothing.

| Check | Result |
|---|---|
| `npm run generate` | up to date, 8 definitions, item format_version 1.21.120 |
| `npm run catalog -- --check` | up to date |
| `npm run validate` | OK — 0 errors, 0 warnings |
| `npm test` | **347 passed**, 0 failed |
| Sound presets | 19 verified against 1824 real vanilla sound events |
| Particle identifiers | 15 referenced, every one in the usable catalogue |
| Texture linter | 8 sources, 0 warnings (Inferno rebuilt: spread 174 → 218) |
| `.mcaddon` | rebuilt from source, verified as a well-formed archive |

New guards, each negative-tested by seeding the defect:

| Guard | Catches |
|---|---|
| validator: particle usability | a nonexistent identifier, or one needing Molang context — and names the sibling that works |
| validator: sound presets | a `sounds.cast` / `sounds.impact` name not in `SOUND_LIBRARY` |
| validator: `SOUND_LIBRARY` ids | a preset pointing at something that is not a vanilla sound event |
| validator: visual profile names | an unknown `visual:` value |
| `tests/unit/presentation.test.mjs` | any shipped binding resolving to a bad particle or sound; two profiles sharing a look |

**Not tested in a client by me — I have no Minecraft environment.** Every
in-client fact this project has came from the user. What remains genuinely
unverified is now narrower, but real:

- whether the icons and names are right after the v0.5.1 fix;
- whether the replacement particles *look good*. The catalogue proves an
  identifier is spawnable, not that it is attractive;
- whether the chosen vanilla sound events suit their swords;
- whether `swing_duration` feels right per sword;
- **whether raising the minimum client to 1.21.120 is acceptable on the user's
  device.** This is the one change that could make the add-on stop loading
  entirely, on a client where v0.5.1 loaded.

### v0.5.1 — item-registration fix, not yet re-tested in Minecraft

Fixes the two defects the v0.5.0 test found (see below). All automated checks
pass: generate up to date, catalogue up to date, validate OK with 0 errors and
0 warnings, **331 tests**, `.mcaddon` verified as a well-formed archive.

New guards, each negative-tested by seeding the defect and confirming the check
fires:

| Guard | Catches |
|---|---|
| `tests/unit/pack_output.test.mjs` | either v0.5.0 bug, asserted against the real generated files |
| validator: creative category + group | an unnamespaced or missing `menu_category` |
| validator: both name keys in `en_US.lang` | a name key the engine will not resolve |
| validator: `verifyPng()` on every icon | a malformed PNG from the hand-written encoder |

**Not re-tested in a client.** The fixes are reasoned from the documented
conventions and verified against the generated output; whether they resolve the
reported symptoms is unknown until someone runs the build.

### v0.5.0 — TESTED IN MINECRAFT · FAILED

The first real in-game test of this project, performed by the project owner.
**It failed**, and it found things no check in this repository could have.

Reported:

| Area | Result |
|---|---|
| Item registers and can be obtained | ✅ |
| Appears in the sword/combat creative section | ❌ — appeared in the generic Items tab |
| Icon displays | ❌ — not displaying correctly |
| Display name | ❌ — showed `item.custom_swords:inferno_sword` |
| Overall | "partially registered but not correctly integrated" |

Root causes and fixes: see `CHANGELOG.md` v0.5.1 and
`ARCHITECTURE.md` §11. Two were confirmed defects in generated pack content; the
icon report could not be traced to a defect and may have been a consequence of
the invalid `menu_category`.

**The lesson, recorded because it generalises:** every automated check in this
repository was green when this build shipped. The validator confirmed the item's
name key matched the generator's name key and existed in `en_US.lang` — both
true, and both wrong, because a consistency check cannot catch
consistent-but-wrong. Static validation proves the packs agree with *themselves*.
Only a client proves they agree with *Minecraft*.

### v0.5.0 — automated results at time of shipping

The Elemental Collection is complete in code and passes everything this
repository can check without a game:

| Check | Result |
|---|---|
| `npm run generate` | up to date, 8 sword definitions |
| `npm run catalog -- --check` | up to date |
| `npm run validate` | OK — 0 errors, 0 warnings |
| `npm test` | 322 passed, 0 failed |
| `npm run build` | `.mcaddon` produced and verified as a well-formed archive with the expected entries |
| Texture linter | 8 sources, 0 warnings |
| Performance audit | 1 recurring interval, 6 engine subscriptions, 0 gameplay tick loops |

All of it passed. **The build was still broken in-game**, as the section above
records. What follows was written before that test and is left unedited, because
the gap between this list and what actually happened is the most useful thing in
this document:

- whether Minecraft parses the item JSON and the custom component at all;
- whether the icons read well in a hotbar, which is the only test of the texture
  standard that matters;
- whether the particle and sound ids exist in the client's registries — the
  framework validates their *shape*, not their existence;
- whether the seven swords actually feel different to play;
- whether the balance progression is right;
- multiplayer behaviour on a real dedicated server;
- performance on a low-end device.

---

## Reporting a bug

Include: Minecraft version and platform, add-on version, exact steps, expected
vs actual, and the relevant content-log lines.
