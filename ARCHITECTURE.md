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
│ CORE          identifiers  rarity  activation  types                 │
│               registry  sword_registry  ability_registry             │
│               item_identifier  sword_stats  definition_validator     │
│               cooldown_manager  player_state                         │
│               ability_gate  ability_executor  input_router           │
│               diagnostics  bootstrap                                 │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEMS       targeting  damage  effects  particles  sounds          │
│               feedback   outcome                                     │
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
Player input (right-click or melee hit)
        │
        ▼
Item custom component  ── custom_swords:sword, registered once for the whole addon
        │                  (scripts/core/input_router.js)
        ▼
Item identification  ───── namespace check, then O(1) registry lookup
        │                  (scripts/core/item_identifier.js)
        ▼
Activation resolution ──── hook + sneak state → use | sneak_use | attack | sneak_attack
        │                  then exact match, else non-sneaking fallback
        ▼
Binding lookup       ───── SwordRegistry.getBinding(swordId, activation)
        │                  ├─ no binding → silently do nothing
        ▼
VALIDATION GATE      ───── scripts/core/ability_gate.js, in this order:
        │                    1. player still valid?
        │                    2. ability registered?
        │                    3. sword still equipped?
        │                    4. restrictions satisfied?
        │                    5. cooldown elapsed?
        │                  ├─ any failure → explain, change NOTHING, STOP
        ▼
Context construction ───── player, origin, view direction, the binding's
        │                  targeting / effects / particles / sounds,
        │                  merged params, service container
        ▼
Ability.execute(ctx) ───── guarded by try/catch
        │
        ├── outcome.playCast              (caster particles + cast sound)
        ├── targeting.resolve             (self | single | ray | area | cone)
        └── outcome.applyToTargets        (damage → particles → sound →
        │                                  effects → ignite → knockback)
        ▼
Result               ───── { ok: true }  → start cooldown, action-bar confirmation
                           { ok: false } → NO cooldown, action-bar explanation
```

The gate runs before anything is spent. A refused activation costs no cooldown,
no durability, no particles and no sound — the world is exactly as it was.

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

  // One binding per activation method. A sword may carry several.
  abilities: [
    {
      activation:    'use',              // right-click / long-press
      abilityId:     'custom_swords:shockwave',
      cooldownTicks: 60,
      hudCategory:   'custom_swords_test_blade',
      targeting:     { type: 'area', range: 4, maxTargets: 8 },
      effects:       [{ effect: 'slowness', durationTicks: 40 }],
      particles:     [{ id: 'minecraft:critical_hit_emitter', count: 12, at: 'caster' }],
      sounds:        { cast: 'ability_cast', impact: 'impact_light' },
      params:        { damage: 4, knockback: 0.8 },
    },
    {
      activation:    'sneak_use',        // the SAME ability, aimed
      abilityId:     'custom_swords:shockwave',
      cooldownTicks: 100,
      targeting:     { type: 'single', range: 7 },
      effects:       [{ effect: 'weakness', durationTicks: 60 }],
      restrictions:  { requireGrounded: true },
      params:        { damage: 9, knockback: 1.4 },
    },
  ],
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

## 5. The Ability Engine

### Activation (`core/activation.js`)

Bedrock's item custom component gives two player-driven hooks — `onUse` and
`onHitEntity`. Combined with the player's sneak state that yields four
activation methods:

| Method | Input |
|---|---|
| `use` | right-click / long-press |
| `sneak_use` | sneak + right-click |
| `attack` | melee hit |
| `sneak_attack` | sneak + melee hit |

Nothing polls input. The sneak state is read from the event's player at the
moment the event fires.

**Fallback rule.** A sneaking activation resolves to its exact binding first,
then to the non-sneaking base. So a sword that binds only `use` still works
while the player happens to crouch — which is what players expect, and which
would otherwise be a baffling "my sword stops working on ladders" bug. The
reverse never happens: a standing player cannot trigger a sneak-only ability.

### Ability Registry (`core/ability_registry.js`)

Mirrors the Sword Registry deliberately: same lookup semantics, same sealing,
same "ask the registry, never hard-code" rule. There is no `switch` over ability
ids anywhere in the addon.

It also keeps a **reverse index**: `swordsUsing(abilityId)` answers "which swords
would I affect if I changed this ability?" — essential once 25 swords share a
dozen abilities — and `unused()` surfaces abilities no sword binds, which is
dead behaviour worth knowing about. The world-load banner reports them.

### Validation gate (`core/ability_gate.js`)

An ordered, named chain rather than inline conditions, so the order is visible
and each step is individually testable:

| # | Check | Refusal reason |
|---|---|---|
| 1 | Player handle still valid | `invalid_player` |
| 2 | Bound ability is registered | `unknown_ability` |
| 3 | Caster still holds this sword | `not_equipped`, `wrong_sword` |
| 4 | Binding's restrictions satisfied | `restricted_*` |
| 5 | Cooldown elapsed | `cooldown` |

Two properties matter:

- **Cooldown is checked last.** A refusal for any other reason never shows the
  player a misleading "still recharging" message.
- **The gate mutates nothing.** A failed check leaves no cooldown, no
  durability loss, no particles, no sound.

Step 3 exists because the engine hands us the stack that fired the event, but by
the time the handler runs the player may have swapped slots or the item may have
broken. One component read on a player-initiated action is a cheap price for
never running a sword's ability from an empty hand.

**Restrictions** are declared as data on the binding, so a designer gates an
ability without writing code:

```js
restrictions: {
  minHealth: 6,                        // caster must have this much health left
  requireGrounded: true,               // no mid-air casting
  forbidInWater: true,
  dimensions: ['minecraft:nether'],
}
```

A restriction that cannot be evaluated **fails closed** — it refuses the
activation rather than silently passing.

### Executor (`core/ability_executor.js`)

The single funnel every invocation passes through. Beyond the gate:

- **Cooldown starts only on success.** An ability returning `{ ok: false }` (no
  target, conditions unmet) does not burn the player's cooldown.
- **`execute` is wrapped in try/catch.** One throwing ability is contained to
  that invocation; it can never take down the handler and with it every other
  sword in the world.
- **Feedback is activation-aware.** Only deliberate activations (`use`,
  `sneak_use`) write to the action bar. A melee swing that fails its gate must
  not spam the screen on every hit.

Cooldown keys default to `<swordId>#<activation>`, so each sword and each of its
activations has an independent timer. A binding can set `cooldownKey` to
deliberately share one across abilities or across swords.

### Outcome composition (`systems/outcome.js`)

Nearly every ability ends with the same block: damage each target, knock it
back, apply the binding's effects, spray its particles, play its impact sound.
Retyping that across twenty-five abilities is how per-sword drift gets in, so
`applyToTargets` performs it once — and owns the ordering:

```
damage → target particles → impact sound → effects → ignite → knockback
```

Damage lands before knockback so a dying target is not pointlessly launched, and
particles are drawn at the target's position before it is moved. `playCast`
covers the other half: caster particles and the cast sound at activation.

## 6. Systems

| System | Responsibility | Safety rules it owns |
|---|---|---|
| `targeting` | resolve a declarative targeting spec into entities (sphere / cone / raycast) | range ceiling, target-count ceiling, PvP toggle, never-target list, stale-handle rejection |
| `damage` | apply damage and knockback | global damage multiplier, per-hit ceiling, never damage the caster |
| `effects` | status effects, healing, ignition, teleport, impulse | duration normalisation, unknown-effect containment, non-finite rejection, `applyImpulse`-on-player routing |
| `particles` | emit particles and rings | per-emit budget, non-finite location rejection |
| `sounds` | play sounds | named preset library, world-vs-player scoping |
| `feedback` | action bar text, deny cues | always single-player scoped — cannot broadcast |
| `outcome` | the standard "do this to these targets" block | fixed ordering: damage before knockback, particles before movement |

Targeting always delegates culling to the engine's own spatial query
(`getEntities` with `location` + `maxDistance`). The framework never iterates
every entity in a dimension.

---

## 7. Lifecycle

Scripting V2 runs module bodies and `system.beforeEvents.startup` in **early
execution**, before the world exists. Touching `world.getAllPlayers()`, blocks
or entities there throws. The bootstrap is split accordingly:

| Phase | What happens | What is forbidden |
|---|---|---|
| Module load | pure imports only | any world access |
| `system.beforeEvents.startup` | build registries and services, validate definitions, register the item component, subscribe to events | reading world state |
| `world.afterEvents.worldLoad` | readiness banner, start the maintenance interval | — |
| `world.afterEvents.playerLeave` | drop that player's cooldowns and state | — |
| `world.afterEvents.entityDie` | drop that player's life-scoped state (filtered to players at subscription) | — |
| `world.afterEvents.playerSpawn` | drop life-scoped state again, as a backstop; ignore first joins | — |

Registering the custom component **must** happen in `startup`, because item JSON
is parsed after scripts run in V2 — that ordering is the reason V2 moved script
init earlier.

---

## 8. Multiplayer safety

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

Player state has two scopes, cleared at different moments:

| Scope | Key prefix | Cleared on | Use for |
|---|---|---|---|
| Life | `life:` (via `lifeKey()`) | death, respawn, disconnect | combos, charge levels, in-flight ability state |
| Player | anything else | disconnect | anything that should survive a respawn |

Cooldowns are deliberately **not** life-scoped: dying to reset a long cooldown
would be an exploit.

There is no third category, and no API in the framework that stores per-player
data without a player id. That is why one player's cooldown structurally cannot
affect another's.

## 9. Performance

- **Zero gameplay tick loops.** Everything is event-driven.
- **One interval**, every 600 ticks, doing nothing but releasing memory.
- **O(1) sword identification** — a namespace check, then a `Map` lookup on
  `typeId`. Vanilla and foreign items are rejected before the lookup happens.
- **Diagnostics cost one filtered subscription**, not a loop.
- **Six engine subscriptions in total**, each registered exactly once and only
  from `core/bootstrap.js`. `tools/validate.mjs` fails the build on a duplicate
  or a subscription made anywhere else — a second listener on one signal would
  fire every ability twice per input.
- **Three component reads per activation** at most (equippable, plus health only
  when a restriction asks for it), all on player-initiated actions.
- **Engine-side spatial queries** — no manual entity scans, no block scans.
- **Hard particle budget** — `config.particles.maxPerEmit` caps any single call,
  so a mis-authored meteor cannot stall a low-end device.
- **Cost scales with player actions, not with sword count.** 25 swords cost the
  same at idle as 1.

---

## 10. Build pipeline

```
scripts/swords/*.js  (behaviour + stats)      art/swords/*.json  (texture art)
        │                                              │
        ▼  tools/generate.mjs  ◄────────────────────────┘
        ├── packs/CustomSwordsBP/items/*.item.json
        ├── packs/CustomSwordsRP/textures/item_texture.json
        ├── packs/CustomSwordsRP/textures/items/custom_swords/swords/*.png
        ├── packs/CustomSwordsRP/texts/en_US.lang
        └── packs/CustomSwordsBP/texts/en_US.lang
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

### Textures

Sword icons are authored as text (`art/swords/<name>.json`: a palette plus a
character grid) and compiled to PNG. Art that lives as text diffs in git, can be
reviewed line by line, and can be checked automatically. The PNG in the resource
pack is build output and must never be hand-edited.

`tools/lib/texture.mjs` enforces the project's permanent texture rule — every
sword ships a unique, hand-authored, polished icon — by failing the build for a
missing source, a broken silhouette, a flat palette, a missing outline, or a
grid identical in shape to another sword's. The full standard, including what
the linter *cannot* judge, is `docs/TEXTURE_STANDARD.md`.

The tools have **zero npm dependencies**: the PNG encoder
(`tools/lib/png.mjs`) and the ZIP writer (`tools/lib/zip.mjs`) are ~150 lines
each, and both are unit tested. `npm run all` works on a clean machine with only
Node installed.

---

## 11. Version contract

The framework targets `@minecraft/server` **2.0.0** and a minimum engine version
of **1.21.90**. Both the Scripting V2 lifecycle and Custom Components V2 became
stable in that release. `docs/API_NOTES.md` records every API the framework
relies on, where each was verified, and what a version bump would require.
