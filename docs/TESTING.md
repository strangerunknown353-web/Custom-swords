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
- **architecture rules**: abilities and sword data never import
  `@minecraft/server`; no `setTimeout` / `setInterval`; exactly one
  `system.runInterval`, and only in `core/bootstrap.js`; no orphaned script
  modules.

### What the tests cover

The tests import the **real** framework modules — the ones shipped inside the
`.mcaddon` — with `@minecraft/server` swapped for `tests/mocks/minecraft_server.mjs`
via an ESM resolve hook. They are not a parallel reimplementation.

Covered: cooldown isolation between players and between keys, lazy expiry,
sweeping, player-state isolation, registry sealing and duplicate rejection,
definition validation, vector and tick maths, targeting filters (caster,
invalid handles, never-target types, the PvP toggle, range and count ceilings,
cone geometry), damage clamping and self-damage refusal, particle budgets, the
sound library, the full use-and-hit pipeline, cooldown gating end to end,
HUD mirroring, and containment of a throwing ability.

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
- [ ] The content log shows `[CustomSwords] v0.1.0 ready - 1 sword(s), 1 ability(ies).`

### B. Item

- [ ] `/give @s custom_swords:test_blade` succeeds
- [ ] The item appears in the creative Equipment tab under Swords
- [ ] Its name reads **Test Blade** — not `item.custom_swords:test_blade.name`
- [ ] Its icon is the placeholder sword, not the purple/black missing texture
- [ ] It renders as a held tool in first and third person
- [ ] It can be enchanted at an enchanting table
- [ ] It can be repaired with an iron ingot at an anvil
- [ ] Its durability bar depletes when it is used to attack

### C. Ability

- [ ] Right-click (or long-press on touch) with mobs nearby: nearby mobs take
      damage, are pushed away, and gain Slowness
- [ ] Particles appear at the player's feet and in a ring
- [ ] A sound plays
- [ ] The action bar reads `Diagnostic Pulse   <n> hit`
- [ ] Using it again immediately is refused, and the action bar shows a
      countdown
- [ ] After 3 seconds it fires again
- [ ] Using it with no mobs nearby shows `No targets in range.` **and does not
      start a cooldown** — the next use with a mob present must fire immediately
- [ ] The player never damages themselves

### D. Multiplayer

Requires two players on one world or server.

- [ ] Player A uses the sword; player B's sword is still ready
- [ ] Player B uses it while A is on cooldown; B's fires normally
- [ ] Each player's action bar shows only their own messages
- [ ] Player A's ability does not damage player B when
      `config.combat.allowPlayerVersusPlayer` is `false`
- [ ] A player disconnecting and reconnecting has no leftover cooldown

### E. Stability

- [ ] Ten minutes of normal play produces no content-log errors
- [ ] No frame-rate drop while idle (there are no gameplay tick loops)
- [ ] Leaving and rejoining the world reloads the pack cleanly

---

## Recording results

Add a dated section per milestone. Do not tick a box that has not actually been
performed.

### v0.1.0 — not yet tested in Minecraft

The foundation has passed every automated check (`npm run all`, 84 tests) and
the `.mcaddon` has been verified to be a well-formed archive with the expected
contents. It has **not** been loaded into a Minecraft client. Every box above is
open.

---

## Reporting a bug

Include: Minecraft version and platform, add-on version, exact steps, expected
vs actual, and the relevant content-log lines.
