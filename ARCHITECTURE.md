# Architecture

Custom Swords is a **data-driven framework** for Minecraft Bedrock Edition, not
a collection of individually scripted swords. The target is 20–25 swords that
feel genuinely different from one another while sharing one runtime, one
cooldown system, one combat pipeline and one set of safety rules.

The rule that shapes everything below: **adding sword #26 must add data, never a
code path.**

---

## 1. Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│ DATA          swords/*.js          abilities/builtin/*.js   config.js│
│               (pure data)          (pure behaviour)                  │
├──────────────────────────────────────────────────────────────────────┤
│ CORE          identifiers  rarity  types                             │
│               registry  sword_registry  item_identifier  sword_stats │
│               definition_validator  cooldown_manager  player_state   │
│               ability_executor  input_router  diagnostics  bootstrap │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEMS       targeting  damage  effects  particles  sounds          │
│               feedback   combat                                      │
├──────────────────────────────────────────────────────────────────────┤
│ UTIL          vec3  mathx  ticks                                     │
├──────────────────────────────────────────────────────────────────────┤
│ ENGINE        @minecraft/server 2.0.0                                │
└──────────────────────────────────────────────────────────────────────┘
```

Dependencies point **downward only**. In particular:

- `util/` imports nothing.
- `abilities/` and `swords/` import **nothing from the engine** — this is
  enforced by `tools/validate.mjs`, not just by convention.
- `systems/` is the only layer allowed to call engine methods that mutate the
  world.

---

## 2. Data flow

One right-click on a custom sword travels this path, and only this path:

```
Player uses the item
        │
        ▼
Item custom component  ── custom_swords:sword, registered once for the whole addon
        │                  (scripts/core/input_router.js)
        ▼
Item identification  ───── namespace check, then O(1) registry lookup
        │                  (scripts/core/item_identifier.js)
        ▼
Ability resolution   ───── binding.abilityId → AbilityRegistry
        │
        ▼
Cooldown check       ───── CooldownManager.remaining(playerId, key)
        │                  ├─ still cooling → feedback.onCooldown, STOP
        ▼
Context construction ───── player, origin, view direction, merged params,
        │                  service container
        ▼
Ability.execute(ctx) ───── guarded by try/catch
        │
        ├── targeting.sphere / cone / raycast
        ├── damage.apply / knockback
        ├── effects.apply
        ├── particles.emit / ring
        └── sounds.playAt / playFor
        │
        ▼
Result               ───── { ok: true }  → start cooldown, action-bar confirmation
                           { ok: false } → NO cooldown, action-bar explanation
```

A melee hit takes the same path through `onHitEntity → CombatSystem →
AbilityExecutor`, with `ctx.target` pre-populated and `trigger: 'hit'`.

### Why one custom component instead of global events

The alternative is `world.afterEvents.itemUse` plus
`world.afterEvents.entityHitEntity`. Both work, but the component wins on three
counts that matter at 25 swords:

| | one custom component | global after-events |
|---|---|---|
| Fires for | our swords only | every item / every melee hit in the world |
| Subscriptions | 1, forever | 2, plus per-sword filtering logic |
| Cost of a zombie punching a player | zero | a handler runs and filters |

`InputRouter` is nevertheless a separate class from the executor precisely so
the input source can be swapped later without touching a single ability.

---

## 3. The sword data model

A sword is **pure data**: no code, no conditionals, no engine calls. This is the
Test Blade, and it is also the shape every one of the eventual 20–25 swords
takes.

```js
{
  // Identity
  id:          'custom_swords:test_blade',   // namespace:local_name
  name:        'Test Blade',
  rarity:      'uncommon',                   // one of six tiers
  description: 'Framework diagnostic sword.',
  texture:     'test_blade',                 // resource-pack shortname
  isTestItem:  true,                         // excluded from collection counts

  // Vanilla item statistics — the single source of truth for the item JSON
  item: {
    attackDamage: 6,                         // -> minecraft:damage  (7 effective)
    durability:   250,                       // -> minecraft:durability
    enchantValue: 10,                        // -> minecraft:enchantable, slot 'sword'
    repairItems:  ['minecraft:iron_ingot'],  // -> minecraft:repairable
    glint:        false,                     // -> minecraft:glint
  },

  // Active ability: right-click / long-press
  active: {
    abilityId:     'custom_swords:diagnostic_pulse',
    cooldownTicks: 60,
    hudCategory:   'custom_swords_test_blade',
    targeting:     { type: 'area', range: 4, maxTargets: 8 },
    effects:       [{ effect: 'slowness', durationTicks: 40 }],
    particles:     [{ id: 'minecraft:critical_hit_emitter', count: 12, at: 'caster' }],
    sounds:        { cast: 'ability_cast', impact: 'impact_light' },
    params:        { damage: 3 },
  },

  // Passive ability: fired on melee hit. Same shape as `active`.
  passive: undefined,
}
```

### Why the envelope lives on the binding, not on the sword

`range`, `targeting`, `effects`, `particles` and `sounds` are properties of *an
ability invocation*, not of the sword's identity. A sword with two abilities has
two ranges. Putting them on the binding is what makes the following true:

> The same ability, bound twice with different envelopes, produces two swords
> that feel genuinely different — with no new code.

That is the property the entire 20–25 sword plan rests on. A `flame_nova` bound
at `range: 4, damage: 5` and the same `flame_nova` bound at
`range: 9, damage: 12, angleDegrees: 90` are two distinct swords sharing one
implementation.

### Why `params` is separate

`params` carries only numbers the *ability itself* understands — a damage
figure, a chance roll. Everything the *framework* can interpret is a typed field
instead, so it is validated at build time rather than discovered at runtime. A
targeting block missing its `range` fails `npm run validate`; the same mistake
buried in `params` would ship as an ability that silently does nothing.

### Targeting shapes

| Type | Finds |
|---|---|
| `self` | nothing — acts on the caster only |
| `single` | the first entity along the view vector |
| `ray` | as `single`; kept distinct so piercing rays can extend it later |
| `area` | everything within `range` of the caster's feet |
| `cone` | `area`, narrowed to `angleDegrees` around the view vector |

`TargetingService.resolve(ctx)` turns the declared shape into an entity list.
Abilities call it and never learn which shape they got.

## 4. Core components

### Identifier convention (`core/identifiers.js`)

Every namespaced string the project creates is derived from one module:

```
<namespace>:<local_name>
```

- **namespace** is always `custom_swords` for content this project owns;
- **local_name** is `lower_snake_case`, begins with a letter, and is unique
  within its kind (sword, ability);
- the namespace is what guarantees no collision with vanilla `minecraft:` ids
  or with any other add-on following the same rule.

Derived from it, and never written out by hand anywhere else:

| Thing | Value | Example |
|---|---|---|
| Sword item id | `custom_swords:<name>` | `custom_swords:test_blade` |
| Ability id | `custom_swords:<name>` | `custom_swords:diagnostic_pulse` |
| Item custom component | `custom_swords:sword` | one for the whole addon |
| Item tag | `custom_swords:is_custom_sword` | on every sword |
| Display-name key | `item.<id>.name` | `item.custom_swords:test_blade.name` |
| Description key | `item.<id>.description` | — |
| Texture path | `textures/items/custom_swords/swords/<shortname>` | — |
| Diagnostic commands | `/scriptevent custom_swords:<command>` | `list`, `held`, `info` |

The runtime, `tools/generate.mjs` and `tools/validate.mjs` all import this
module, so they cannot disagree about the convention. `tools/validate.mjs`
fails the build if any generated file departs from it.

### Rarity (`core/rarity.js`)

Six tiers, defined once with their order, label, section colour code and colour
name:

| Tier | Order | Colour |
|---|---|---|
| `common` | 0 | white |
| `uncommon` | 1 | green |
| `rare` | 2 | blue |
| `epic` | 3 | light purple |
| `legendary` | 4 | gold |
| `mythic` | 5 | red |

Rarity is taxonomy and presentation, not mechanics: it colours the display
name, orders swords in the codex and reports, and gives balance work a
vocabulary. It grants no combat bonus of its own.

Rarity is applied as a **section colour code on the generated display name**,
not via the `minecraft:rarity` item component. That is a deliberate choice:
`minecraft:rarity` supports only four tiers (common/uncommon/rare/epic) and
*automatically escalates* when an item is enchanted, so a six-tier scheme
cannot be expressed through it and an enchanted sword would change tier colour
on its own. See `docs/API_NOTES.md`.

### Sword Registry (`core/sword_registry.js`)

The central source of truth for sword metadata. Everything that needs to know
something about a sword asks this object; nothing anywhere else hard-codes a
sword id, a stat or a rarity.

| Query | Answers |
|---|---|
| `get` / `require` / `has` | the definition, by id |
| `isCustomSword(typeId)` | is this item type one of ours? |
| `getStats(id)` | the authored item statistics |
| `getAbilities(id)` | both bindings, always as an object |
| `getBinding(id, trigger)` | one binding |
| `getDisplay(id)` | name, coloured name, description, rarity tier |
| `all` / `shipped` / `testItems` | the collection, split by purpose |

Two properties matter beyond convenience:

- **Deep-frozen definitions.** The same object is handed to every player on
  every invocation, so it is frozen at registration. One player's ability
  cannot mutate a sword out from under another. This is the immutability half
  of the multiplayer rule; the mutable half lives in `PlayerStateStore`, keyed
  per player.
- **Sealed after bootstrap.** A late `register()` is a loud error, not a silent
  race.

### Item Identification (`core/item_identifier.js`)

Answers "which of our swords is this, if any?" — and it is the only place that
question is answered, so the safety rules exist once:

- **Never throws.** Bad input — a missing stack, a removed player, a malformed
  id, an invalidated `ItemStack` handle — returns `undefined`. Identification
  runs inside engine event handlers, where a throw costs the rest of the
  handler.
- **Never touches vanilla.** The namespace is checked *before* any registry
  lookup, so `minecraft:diamond_sword` is rejected immediately and vanilla
  swords keep their stock behaviour.
- **Silent on a miss.** An unknown item is an ordinary answer, not a warning.

| Method | Use |
|---|---|
| `fromTypeId` / `fromItemStack` | resolve a definition |
| `isCustomSword` | boolean check |
| `mainhandItem(player)` | the held stack, read on demand — no polling, no caching |
| `heldSword(player)` | the held custom sword, if any |
| `describe(itemStack)` | classify as `custom_sword` / `vanilla_sword` / `other_item` / `empty` |

### Sword stats (`core/sword_stats.js`)

Definitions store *authoring* values; this module resolves the *effective*
values a player experiences, and builds one display record used by every
surface (in-game diagnostics, the validator roster, the future codex UI, the
docs). Two surfaces can therefore never disagree.

The one derivation worth stating: `minecraft:damage` is documented as damage
*added to* the base, so effective melee damage is `1 + attackDamage`. The Test
Blade's authored `6` is 7 in the player's hand.

### Diagnostics (`core/diagnostics.js`)

The framework is otherwise invisible — a player holding a sword cannot tell
whether the registry recognised it or whether the item merely looks right.
Three script events make the framework's own view observable:

```
/scriptevent custom_swords:list         every registered sword and its stats
/scriptevent custom_swords:held         identify the item in your main hand
/scriptevent custom_swords:info <id>    the full record for one sword
```

Cost when unused is a single namespace-filtered subscription. No polling.

### Registry (`core/registry.js`)

A `Map` wrapper used for both abilities and swords. Rejects duplicate ids, and
is **sealed** after bootstrap so a late `register()` is a loud error rather than
a silent race. Lookup is O(1) — there is no `switch` over sword ids anywhere in
the project, and there never will be.

### Definition validator (`core/definition_validator.js`)

Engine-free, so it runs in three places: at world load (reports to the content
log), in `tools/validate.mjs` (fails the build), and in unit tests. A malformed
sword is **not registered** rather than half-registered.

### CooldownManager (`core/cooldown_manager.js`)

`Map<playerId, Map<key, expiryTick>>`.

- Keyed by `player.id` (a stable string), never by a `Player` object — entity
  handles go stale across dimension changes and relogs.
- Time comes from an **injected clock** (`system.currentTick` in game, a fake in
  tests). One server-side monotonic counter means no drift and no per-player
  timers.
- Nothing ticks. Expiry is computed lazily on read; entries delete themselves
  the moment anyone observes them as expired.
- Default key is `<swordId>#<trigger>`, so every sword and every trigger is
  independent. A binding may set `cooldownKey` to deliberately share one timer
  across a set of swords.
- Optionally mirrored onto the vanilla item-cooldown HUD via
  `player.startItemCooldown` when a binding sets `hudCategory`. The script
  cooldown remains the single source of truth; the HUD is cosmetic.

### PlayerStateStore (`core/player_state.js`)

Per-player scratch space for future abilities (combo counters, charge levels).
Its existence is what lets the framework forbid module-level mutable state in
abilities — there is always a correct place to put it.

### AbilityExecutor (`core/ability_executor.js`)

The single funnel. Two decisions worth restating:

1. **Cooldown starts only on success.** An ability returning `{ ok: false }`
   (no target, wrong conditions) does not punish the player.
2. **`execute` is wrapped in try/catch.** One throwing ability is contained to
   that invocation. It can never take down the event handler and with it every
   other sword in the world.

### Service container

Abilities receive `ctx.services` and nothing else. They never import
`@minecraft/server`, never reach for a module singleton. Three consequences:

- abilities are unit-testable in plain Node,
- global safety rules (damage ceiling, PvP toggle, particle budget) cannot be
  bypassed by an individual sword,
- swapping an implementation (say, custom particles for vanilla ones) touches
  one file.

---

## 5. Systems

| System | Responsibility | Safety rules it owns |
|---|---|---|
| `targeting` | resolve a declarative targeting spec into entities (sphere / cone / raycast) | range ceiling, target-count ceiling, PvP toggle, never-target list, stale-handle rejection |
| `damage` | apply damage and knockback | global damage multiplier, per-hit ceiling, never damage the caster |
| `effects` | apply status effects | duration normalisation, unknown-effect containment |
| `particles` | emit particles and rings | per-emit budget, non-finite location rejection |
| `sounds` | play sounds | named preset library, world-vs-player scoping |
| `feedback` | action bar text, deny cues | always single-player scoped — cannot broadcast |
| `combat` | on-hit behaviour | entry point for future life steal, combos, crit windows |

Targeting always delegates culling to the engine's own spatial query
(`getEntities` with `location` + `maxDistance`). The framework never iterates
every entity in a dimension.

---

## 6. Lifecycle

Scripting V2 runs module bodies and `system.beforeEvents.startup` in **early
execution**, before the world exists. Touching `world.getAllPlayers()`, blocks
or entities there throws. The bootstrap is split accordingly:

| Phase | What happens | What is forbidden |
|---|---|---|
| Module load | pure imports only | any world access |
| `system.beforeEvents.startup` | build registries and services, validate definitions, register the item component, subscribe to events | reading world state |
| `world.afterEvents.worldLoad` | readiness banner, start the maintenance interval | — |
| `world.afterEvents.playerLeave` | drop that player's cooldowns and state | — |

Registering the custom component **must** happen in `startup`, because item JSON
is parsed after scripts run in V2 — that ordering is the reason V2 moved script
init earlier.

---

## 7. Multiplayer safety

Each of the failure modes the project set out to avoid maps to a specific
structural guarantee:

| Risk | Guarantee |
|---|---|
| Shared cooldowns | every read/write is keyed by `player.id`; there is no un-keyed cooldown API to call by accident |
| Global ability state | abilities have no module-level mutable state; `PlayerStateStore` is the only sanctioned store, and it is player-keyed |
| Shared metadata being mutated | sword definitions are **deep-frozen** at registration, so the object handed to every player on every invocation cannot be changed by any of them |
| One player's ability affecting another | `TargetingService` excludes the caster by default and gates other players behind `config.combat.allowPlayerVersusPlayer`; `FeedbackService` can only address one player |
| Stale player/entity references | nothing is cached across ticks; `isValid` is checked before every mutation, and every engine call is wrapped so a removed entity aborts one target, not the ability |
| Duplicated event handling | exactly one subscription for the entire addon (`tools/validate.mjs` enforces the single-interval rule and the router owns the only component registration) |
| Runaway loops | no gameplay tick loops exist; the only `system.runInterval` is a 30-second memory sweep, and the validator fails the build if a second one appears |
| Memory growth | `playerLeave` clears per-player buckets immediately; the sweep is a backstop for missed events |

---

### The rule, stated once

> **Sword metadata is shared and immutable. Player state is private and
> mutable.**

Concretely:

- Anything describing *a sword* — id, name, stats, rarity, bindings, targeting,
  effects, particles, sounds — is registered once, deep-frozen, and read by
  every player. It is never written at runtime.
- Anything describing *a player's relationship to a sword* — cooldowns, charge
  levels, combo counters, in-flight ability state — is stored under
  `player.id` in `CooldownManager` or `PlayerStateStore`, and is released when
  that player disconnects.

There is no third category, and no API in the framework that stores per-player
data without a player id. That is why one player's cooldown structurally cannot
affect another's.

## 8. Performance

- **Zero gameplay tick loops.** Everything is event-driven.
- **One interval**, every 600 ticks, doing nothing but releasing memory.
- **O(1) sword identification** — a namespace check, then a `Map` lookup on
  `typeId`. Vanilla and foreign items are rejected before the lookup happens.
- **Diagnostics cost one filtered subscription**, not a loop.
- **Engine-side spatial queries** — no manual entity scans, no block scans.
- **Hard particle budget** — `config.particles.maxPerEmit` caps any single call,
  so a mis-authored meteor cannot stall a low-end device.
- **Cost scales with player actions, not with sword count.** 25 swords cost the
  same at idle as 1.

---

## 9. Build pipeline

```
scripts/swords/*.js  (single source of truth)
        │
        ▼  tools/generate.mjs
        ├── packs/CustomSwordsBP/items/*.item.json
        ├── packs/CustomSwordsRP/textures/item_texture.json
        ├── packs/CustomSwordsRP/texts/en_US.lang
        ├── packs/CustomSwordsBP/texts/en_US.lang
        └── placeholder textures (only when art is absent)
        │
        ▼  tools/validate.mjs      manifests, UUIDs, JSON, references, architecture rules
        ▼  npm test                84 unit + integration tests against a mocked engine
        ▼  tools/build.mjs         dist/CustomSwords-v<version>.mcaddon
```

Item JSON is generated because with 25 swords a hand-maintained copy of the
stats drifts from the script definitions, and drift shows up in-game as a
tooltip promising 9 damage while the sword deals 6. Generating removes that
failure mode entirely.

The tools import the framework's own `identifiers.js`, `rarity.js` and
`sword_stats.js` rather than keeping their own copies of the rules. A build tool
with a private copy of the conventions is a build tool that will one day
disagree with the game.

The tools have **zero npm dependencies**: the PNG encoder
(`tools/lib/png.mjs`) and the ZIP writer (`tools/lib/zip.mjs`) are ~150 lines
each, and both are unit tested. `npm run all` works on a clean machine with only
Node installed.

---

## 10. Version contract

The framework targets `@minecraft/server` **2.0.0** and a minimum engine version
of **1.21.90**. Both the Scripting V2 lifecycle and Custom Components V2 became
stable in that release. `docs/API_NOTES.md` records every API the framework
relies on, where each was verified, and what a version bump would require.
