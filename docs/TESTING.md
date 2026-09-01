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
npm test            # 322 unit + integration tests against a mocked @minecraft/server
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
- every display-name key follows `item.<id>.name`;
- every ability binding's envelope is well-formed — an unknown activation
  method, two bindings on the same activation, a ranged targeting type without a
  range, a cone without an angle, an effect without a duration, a misspelled
  sound slot, an unknown restriction, an unknown knockback `mode`, an unknown
  target category;
- **every status effect names a real vanilla effect**, checked against the 37
  in `core/effect_catalogue.js`; a near-miss gets a "did you mean" suggestion
  rather than failing silently in-game;
- `SWORD_CATALOG.md` matches the definitions (`npm run catalog -- --check`);
- **the texture standard**: every sword has an authored source, of the right
  dimensions, with no unused palette tones, an unbroken silhouette, a real dark
  outline, enough tonal range to be shaded, and a shape not shared with any
  other sword;
- **architecture rules**: abilities and sword data never import
  `@minecraft/server`; no `setTimeout` / `setInterval`; exactly one
  `system.runInterval`, and only in `core/bootstrap.js`; every engine event
  subscribed exactly once and only from the bootstrap; no orphaned script
  modules.

It also prints a roster of every sword — rarity, effective damage, durability,
targeting and cooldown — so balance outliers are visible on every build.

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
Tidal, which share the `repulse` ability, produce measurably different knockback
vectors from the same code.

Two tests deserve calling out:

- **The same ability bound twice with different envelopes must behave
  differently** (`pipeline.test.mjs`). That is the property the whole 20–25
  sword plan rests on, and the Wind/Tidal pair is its shipped proof.
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

One row per shipped sword. **Every "Tested" cell is still empty.** v0.5.0 was
loaded into a client and failed at the item-registration layer before any sword
behaviour could be exercised (see "Recording results"), so nothing in the
Active/Passive/FX columns has been observed working. The other columns
record what has been verified *statically* — the definition validates, the
texture passes the linter, the item JSON generates, the sound preset and
particle ids exist in the definition — which is a different and much weaker
claim.

Fill the last column in only after performing the corresponding block of the
in-game checklist below.

| Sword | Item id | Attack | Active (cooldown) | Passive | Texture | Sound | FX | Tested in-game |
|---|---|---:|---|---|:---:|:---:|:---:|:---:|
| Inferno 🔥 | `custom_swords:inferno_sword` | 9 | Cleave — burning arc, angular falloff (7 s) | Brand — ignite 3 s | ✅ | ✅ | ✅ | ☐ |
| Thunder ⚡ | `custom_swords:thunder_sword` | 9 | Surge — bolt at the looked-at block, ≤16 m (10 s) | Brand — weakness 2 s | ✅ | ✅ | ✅ | ☐ |
| Frost ❄️ | `custom_swords:frost_sword` | 7 | Brand — slowness 7 s + mining fatigue 6 s (6 s) | Brand — slowness 2 s | ✅ | ✅ | ✅ | ☐ |
| Wind 🌪️ | `custom_swords:wind_sword` | 6 | Repulse — scatter outward, kb 2.2 (5 s) | Bolster — speed 4 s | ✅ | ✅ | ✅ | ☐ |
| Earth 🪨 | `custom_swords:earth_sword` | 10 | Burst — ground shock, distance falloff (9 s) | Bolster — resistance 5 s | ✅ | ✅ | ✅ | ☐ |
| Tidal 🌊 | `custom_swords:tidal_sword` | 8 | Repulse — forward wave in a cone, kb 2.6 (7.5 s) | Bolster — water breathing 15 s | ✅ | ✅ | ✅ | ☐ |
| Nature 🌿 | `custom_swords:nature_sword` | 7 | Strike — execute below 40 % health (5.5 s) | Bolster — regeneration 4 s | ✅ | ✅ | ✅ | ☐ |
| Test Blade | `custom_swords:test_blade` | 7 | 4 diagnostic bindings across all activations | — | ✅ | ✅ | ✅ | ☐ |

Legend: ✅ = verified by `npm run check`. ☐ = not verified; requires a client.

The v0.5.0 failure is the reason the two columns are kept apart. Every ✅ below
was ✅ for the build that did not work in-game. A ✅ means a static check passed
and nothing more.

Column meanings, so a ✅ is not read as more than it is:

| Column | ✅ means |
|---|---|
| Texture | an authored `art/swords/*.json` source exists, compiles to a 16×16 PNG, and passes every rule in `docs/TEXTURE_STANDARD.md` with zero warnings |
| Sound | the binding names a slot that exists in `SOUND_LIBRARY`, so the call will resolve at runtime |
| FX | the binding declares particle emitters, and their ids and counts are within the per-emit budget |
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
      `[CustomSwords] v0.5.1 ready - 8 sword(s) (7 shipped, 1 diagnostic), 7 ability(ies).`

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
      Frost 7, Wind 6, Earth 10, Tidal 8, Nature 7, Test Blade 7)
- [ ] Its durability bar depletes when it is used to attack
- [ ] It can be enchanted at an enchanting table
- [ ] It can be repaired at an anvil with the material named in the catalogue
      (blaze rod, copper ingot, packed ice, phantom membrane, deepslate,
      prismarine shard, moss block, iron ingot respectively)

### C. Registry and identification

- [ ] `/scriptevent custom_swords:list` reports
      `8 registered — 7 shipped, 1 diagnostic` and lists all eight
- [ ] `/scriptevent custom_swords:abilities` reports seven abilities and, for
      each, the swords that bind it — `repulse` must list **both** Wind and
      Tidal
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

### E. Ability Engine — Test Blade

The Test Blade binds a different ability to each of the four activations, so one
item verifies the whole engine.

**Right-click (`use` → `burst`, 3 s):**

- [ ] With hostile mobs within 4 blocks: they take damage, are pushed away, and
      gain Slowness. **Passive mobs are ignored** — the binding allows only
      `hostile`
- [ ] Particles appear at the player's feet and on each mob hit
- [ ] A cast sound plays, and an impact sound plays per target
- [ ] The action bar reads `Burst   <n> hit`
- [ ] Using it again immediately is refused, with a countdown on the action bar
- [ ] With no mobs in range it shows `Nothing in range.` **and does not start a
      cooldown** — the next use with a mob present must fire immediately

**Sneak + right-click (`sneak_use` → `strike`, 5 s):**

- [ ] Crouch and look at a single mob up to 7 blocks away: it takes noticeably
      more damage, is thrown back harder, and gains Weakness (not Slowness)
- [ ] A mob below half health takes visibly more than a healthy one (the execute
      bonus)
- [ ] It fires while the standing burst is still cooling down — the two
      activations have independent timers
- [ ] Jumping and using it mid-air is refused with `Must be on the ground.`

**Melee hit (`attack` → `brand`, 2 s):** 

- [ ] Hitting a mob poisons it, in addition to the normal 7 melee damage
- [ ] Hitting the same mob repeatedly does not stack a new poison every swing —
      the binding has its own cooldown

**Sneak + melee hit (`sneak_attack` → `cleave`, 4 s):**

- [ ] Crouching and hitting a mob also strikes everything in a 100° arc ahead
- [ ] A mob directly ahead takes more than one at the edge of the arc
- [ ] Everything struck is thrown backwards

### F. The seven elemental swords

One block per sword. The point of each is that it should feel like a *different
weapon*, not a recoloured one — judge that, not just whether damage numbers
appear.

**Inferno 🔥 (`use` → cleave, 7 s):**

- [ ] Right-click sweeps a burning arc ahead; everything in it catches fire
- [ ] Flame particles trace the arc, lava particles land on each target
- [ ] A mob at the centre of the arc takes clearly more than one at the edge
- [ ] Melee hits alone set mobs on fire briefly (the `brand` passive)

**Thunder ⚡ (`use` → surge, 10 s):**

- [ ] Right-click while looking at a block up to 16 blocks away: the blast lands
      **there**, not at the player
- [ ] Right-click while looking at open sky: the blast lands at maximum reach
      along the view line and does not error
- [ ] Electric spark particles appear at the caster and a ring at the impact
- [ ] Melee hits apply brief Weakness

**Frost ❄️ (`use` → brand, 6 s):**

- [ ] Right-click applies Slowness **and** Mining Fatigue for several seconds
      with only light damage — this sword controls, it does not burst
- [ ] Snowflake particles at the caster, ice evaporation on each target
- [ ] Melee hits apply brief Slowness

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

**Tidal 🌊 (`use` → repulse, 7.5 s):**

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
- [ ] Give A the Wind Sword and B the Tidal Sword and fire both at the same mob
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
Test Blade's icon was reviewed visually as a rendered contact sheet, which is
not the same as seeing it in a hotbar. Never loaded into a client.

### v0.4.0 — not tested in Minecraft

The combat, damage and targeting layer passed every automated check, including
the edge-case suite. Never loaded into a client.

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
