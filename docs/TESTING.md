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
npm test            # unit + integration tests against a mocked @minecraft/server
npm run build       # produce dist/*.mcaddon and dist/*.mcpack

npm run check       # generate + validate + test
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
  sound slot, an unknown restriction;
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
effect helpers, the outcome composer's ordering guarantees, life-scoped state
cleanup, and the texture quality gate.

Two tests deserve calling out:

- **The same ability bound twice with different envelopes must behave
  differently** (`pipeline.test.mjs`). That is the property the whole 20–25
  sword plan rests on.
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
      `[CustomSwords] v0.2.0 ready - 1 sword(s) (0 shipped, 1 diagnostic), 1 ability(ies).`

### B. Item and stats

- [ ] `/give @s custom_swords:test_blade` succeeds
- [ ] The item appears in the creative Equipment tab under Swords
- [ ] Its name reads **Test Blade** in §agreen§r (uncommon) — not
      `item.custom_swords:test_blade.name`
- [ ] Its icon is the finished steel sword — visible blade gradient, blue-steel
      cross-guard with a red gem, banded leather grip, gold pommel — and **not**
      the purple/black missing texture
- [ ] The icon reads clearly at normal hotbar scale, not just in the inventory
- [ ] It renders as a held tool in first and third person
- [ ] It deals noticeably more damage than a bare hand (7 vs 1)
- [ ] Its durability bar depletes when it is used to attack
- [ ] It can be enchanted at an enchanting table
- [ ] It can be repaired with an iron ingot at an anvil

### C. Registry and identification

- [ ] `/scriptevent custom_swords:list` reports
      `1 registered — 0 shipped, 1 diagnostic` and lists Test Blade with
      `dmg 7 · dur 250`
- [ ] `/scriptevent custom_swords:abilities` reports Shockwave, used by
      `custom_swords:test_blade` on both `use` and `sneak_use`
- [ ] Holding the Test Blade, `/scriptevent custom_swords:held` reports a
      **registered custom sword** with melee damage 7, and lists both
      activations — `Use` with `targeting area r=4`, and `Sneak + use` with
      `targeting single r=7 · restricted`
- [ ] Holding a **vanilla** diamond sword, the same command reports a
      **vanilla sword — not managed by this addon**
- [ ] Holding dirt, it reports **not a custom sword**
- [ ] With an empty hand, it reports **main hand is empty**
- [ ] `/scriptevent custom_swords:info test_blade` prints the full record
- [ ] `/scriptevent custom_swords:info nope` prints a helpful error, not a crash

### D. Vanilla is untouched

- [ ] A vanilla diamond sword deals its normal damage and loses durability normally
- [ ] Right-clicking a vanilla sword does nothing unusual
- [ ] No content-log output appears when using vanilla items

### E. Ability Engine

**Right-click (the `use` binding — a wide burst):**

- [ ] With mobs within 4 blocks: they take damage, are pushed away, and gain
      Slowness
- [ ] Particles appear at the player's feet, in a ring marking the 4-block
      reach, and on each mob hit
- [ ] A cast sound plays, and an impact sound plays per target
- [ ] The action bar reads `Shockwave   <n> hit`
- [ ] Using it again immediately is refused, with a countdown on the action bar
- [ ] After 3 seconds it fires again
- [ ] With no mobs in range it shows `Nothing in range.` **and does not start a
      cooldown** — the next use with a mob present must fire immediately

**Sneak + right-click (the `sneak_use` binding — an aimed strike):**

- [ ] Crouch and look at a single mob up to 7 blocks away: it takes noticeably
      more damage, is thrown back harder, and gains Weakness (not Slowness)
- [ ] It fires while the standing burst is still cooling down — the two
      activations have independent 3s and 5s timers
- [ ] Jumping and using it mid-air is refused with `Must be on the ground.`
      (the binding declares `requireGrounded`)

**Validation gate:**

- [ ] Swapping to another hotbar slot mid-swing never fires the ability
- [ ] The player never damages themselves with either activation
- [ ] No content-log errors from any of the above

### F. Multiplayer

Requires two players on one world or server.

- [ ] Player A uses the sword; player B's sword is still ready
- [ ] Player B uses it while A is on cooldown; B's fires normally
- [ ] Each player's action bar shows only their own messages
- [ ] Player A's ability does not damage player B when
      `config.combat.allowPlayerVersusPlayer` is `false`
- [ ] A player disconnecting and reconnecting has no leftover cooldown

### G. Death, respawn and reconnect

- [ ] Dying while the sword is on cooldown, then respawning: the cooldown is
      **still running** (dying must not be a free reset)
- [ ] Reconnecting after a disconnect: the cooldown is clear
- [ ] No content-log errors around death or respawn

### H. Stability

- [ ] Ten minutes of normal play produces no content-log errors
- [ ] No frame-rate drop while idle (there are no gameplay tick loops)
- [ ] Leaving and rejoining the world reloads the pack cleanly

---

## Recording results

Add a dated section per milestone. Do not tick a box that has not actually been
performed.

### v0.1.0 — not tested in Minecraft

Passed every automated check; never loaded into a client.

### v0.2.0 — not yet tested in Minecraft

The core sword framework has passed every automated check (`npm run all`, 173
tests), the validator was negative-tested against ten seeded defects, and the
`.mcaddon` has been verified to be a well-formed archive with the expected
contents. It has **not** been loaded into a Minecraft client. Every box above is
open.

---

## Reporting a bug

Include: Minecraft version and platform, add-on version, exact steps, expected
vs actual, and the relevant content-log lines.
