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
│ CORE          identifiers  rarity  activation  target_categories     │
│               effect_catalogue  particle_catalogue  visual_profiles  │
│               types                                                  │
│               registry  sword_registry  ability_registry             │
│               item_identifier  sword_stats  definition_validator     │
│               cooldown_manager  player_state                         │
│               ability_gate  ability_executor  input_router           │
│               diagnostics  bootstrap                                 │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEMS       targeting  damage  combat  effects  particles          │
│               sounds  feedback  movement  environment                │
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

A sword is **pure data**: no code, no conditionals, no engine calls. This is
Ember Blade, and it is also the shape every one of the eventual 20–25 swords
takes.

Sixteen swords are registered today, and the roster is closed: the seven
Elemental Collection blades (Inferno, Thunder, Frost, Wind, Earth, Tidal,
Nature) plus Ember Blade, Shadow, Crystal, Void, Solar, Gravity, Poison, Time
and Storm. The project no longer ships a diagnostic item — the
former Test Blade became Ember Blade — though `isTestItem` remains in the data
model for future use. Not one of the sixteen required a new engine call:
everything a sword can do is expressed as a binding envelope over an ability,
and every ability goes through the same combat pipeline. `SWORD_CATALOG.md` is
generated from those definitions by `tools/catalog.mjs`, so the published stats
cannot drift from the code.

Wind and Tidal are the clearest demonstration that behaviour comes from data:
both bind the same `repulse` ability, but Wind's binding targets an area with
`knockback.mode: 'away'` (a scatter in every direction) while Tidal's targets a
cone with `knockback.mode: 'forward'` (a wave pushed along the view vector).
Same code, two different weapons.

```js
{
  // Identity
  id:          'custom_swords:ember_blade',  // namespace:local_name
  name:        'Ember Blade',
  rarity:      'uncommon',                   // one of six tiers
  description: 'Framework diagnostic sword.',
  texture:     'ember_blade',                // resource-pack shortname
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
      hudCategory:   'custom_swords_ember_blade',
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
| Sword item id | `custom_swords:<name>` | `custom_swords:ember_blade` |
| Ability id | `custom_swords:<name>` | `custom_swords:diagnostic_pulse` |
| Item custom component | `custom_swords:sword` | one for the whole addon |
| Item tag | `custom_swords:is_custom_sword` | on every sword |
| Display-name key | `item.<id>` | `item.custom_swords:ember_blade` |
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

## 6. The combat layer

### Damage (`systems/damage.js`)

The only module in the addon that can hurt anything. Every request runs the
full chain before a hit point is dealt:

| # | Check | Refusal |
|---|---|---|
| 1 | attacker exists | `no_attacker` |
| 2 | attacker still valid | `invalid_attacker` |
| 3 | target exists | `no_target` |
| 4 | target handle still valid | `invalid_target` |
| 5 | target is alive | `target_dead` |
| 6 | amount is finite and positive | `invalid_amount` |
| 7 | target is permitted (not the caster, not never-target, PvP, category) | `target_not_permitted` |

A refusal returns a reason rather than throwing, so a partially-applied area
ability continues with its remaining targets instead of aborting. `resolveAmount`
is pure and collapses `NaN`, `Infinity`, negatives and overflow to zero — a bad
number in a definition can never reach `applyDamage`.

Knockback is a declarative spec, clamped on both axes by
`config.combat.maxKnockback*`. Its `mode` field is worth calling out because it
carries real design weight:

| Mode | Behaviour | Feels like |
|---|---|---|
| `away` (default) | each target is pushed radially from the origin | an explosion |
| `forward` | every target is pushed along one shared vector | a wave |

The Wind and Tidal Swords bind the *same ability* and differ mainly by this one
field — scatter versus sweep — which is the clearest demonstration in the
project that behaviour comes from data.

### Combat (`systems/combat.js`)

Turns an ability's intent into consequences, in a fixed order:

```
validate → damage → target particles → impact sound → effects → ignite → knockback
```

Damage lands before knockback so a dying target is not pointlessly launched, and
particles are drawn at the target's position before it is moved.

**Hit protection**, in two layers that solve different problems:

- *Per execution, always on.* A `Set` of entity ids scoped to one `strike` call.
  An ability that combines a raycast with an area sweep can hand the same
  entity in twice; it takes damage once. Costs one `Set` per activation.
- *Per player, across executions, configurable.* After a hit, that attacker
  cannot damage that target again for `config.combat.hitProtectionTicks`. This
  is what stops a held right-click grinding a mob down at twenty hits a second.
  It reuses `CooldownManager` under a `hit:` key namespace, inheriting its
  per-player isolation, lazy expiry and sweeping — no new subsystem, no tick loop.

A target refused as `target_not_permitted` receives none of the rest of the
outcome either; otherwise the category filter could be bypassed by the effects
and knockback paths.

### Target filtering (`core/target_categories.js`)

A binding declares `allowedTargets: ['hostile']` and the framework does the
rest. Categories resolve in two stages:

1. **Engine-side pre-filter.** With exactly one category, its family constraints
   are handed to `getEntities`, so the engine culls before anything reaches
   script.
2. **Client-side union.** `families` is documented as matching *all* listed
   families, so `['monster', 'player']` would match nothing. With several
   categories the engine query is widened and the union applied per entity.

| Category | Vanilla families |
|---|---|
| `any` | — (the default) |
| `mob` | `mob`, not `inanimate` |
| `hostile` | `monster` |
| `passive` | `mob`, not `monster`, not `inanimate` |
| `player` | type id `minecraft:player` |
| `undead` | `undead` |
| `arthropod` | `arthropod` |

Family names are the vanilla `minecraft:type_family` values — a Blaze really is
`["blaze", "monster", "mob"]`. Add-on entities that follow the convention are
categorised for free; ones that declare no families match only `any`, so a
hostile-only ability never sweeps up a foreign entity it cannot classify.

### Area of effect

An AoE is not a separate system — it is a targeting spec plus a strike spec:

```js
targeting: { type: 'area', range: 6, maxTargets: 12 },
allowedTargets: ['hostile'],
knockback: { horizontal: 1.0, vertical: 1.1 },
params: { damage: 11, edgeDamageFactor: 0.35 }
```

Searches happen only when an ability runs. Range is clamped to
`config.targeting.maxRange` (32) and results to `config.targeting.maxTargets`
(64) on every path, so no definition can ask the engine for a thousand-block
sweep or act on an unbounded crowd.

### Status effects (`core/effect_catalogue.js`)

Effect ids in definitions are free-form strings, so a typo would load fine and
then silently do nothing — which reads as "this sword is weak", not "this sword
is broken". The catalogue is the engine's own list of 37 effects, transcribed
from `@minecraft/vanilla-data`, and `npm run validate` fails on anything not in
it, suggesting the nearest match.

### Attack damage versus ability damage

These are deliberately separate and never interact:

| | Source | Where it lives |
|---|---|---|
| Melee attack | `minecraft:damage` component | `sword.item.attackDamage`, baked into the generated item JSON |
| Ability damage | `DamageService.apply` | `binding.params.damage`, resolved per activation |

No ability writes to the item. Swinging a sword harder is a permanent property
of the item; an ability is an event. Confusing the two is how "my sword got
stronger and never went back" bugs happen.

## 7. Systems

| System | Responsibility | Safety rules it owns |
|---|---|---|
| `targeting` | resolve a declarative targeting spec into entities (sphere / cone / raycast) | range ceiling, target-count ceiling, PvP toggle, never-target list, stale-handle rejection |
| `damage` | validate and apply damage; knockback | seven-step validation chain, global multiplier, per-hit ceiling, knockback clamping, never damage the caster |
| `effects` | status effects, healing, ignition, teleport, impulse | duration normalisation, unknown-effect containment, non-finite rejection, `applyImpulse`-on-player routing |
| `particles` | emit particles and rings | per-emit budget, non-finite location rejection |
| `sounds` | play sounds | named preset library, world-vs-player scoping |
| `feedback` | action bar text, deny cues | always single-player scoped — cannot broadcast |
| `combat` | the whole "do this to these targets" pipeline | fixed ordering, per-execution and per-player hit protection, category re-check |
| `movement` | reposition the caster safely | destination screening, lava and drop refusal, distance ceiling, engine collision test as the authority |

`targeting.around(ctx, origin, range)` resolves candidates near an arbitrary
point while keeping the binding's filters and the caster exclusion, so an
ability cannot widen its own permissions by choosing a different origin.
`particles.line(dimension, spec, from, to, points)` draws the visual for
anything that travels, capped by the same per-emit budget as `ring`.

Targeting always delegates culling to the engine's own spatial query
(`getEntities` with `location` + `maxDistance`). The framework never iterates
every entity in a dimension.

---

## 8. Lifecycle

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

## 9. Multiplayer safety

Each of the failure modes the project set out to avoid maps to a specific
structural guarantee:

| Risk | Guarantee |
|---|---|
| Shared cooldowns | every read/write is keyed by `player.id`; there is no un-keyed cooldown API to call by accident |
| Global ability state | abilities have no module-level mutable state; `PlayerStateStore` is the only sanctioned store, and it is player-keyed |
| Shared metadata being mutated | sword definitions are **deep-frozen** at registration, so the object handed to every player on every invocation cannot be changed by any of them |
| One player's ability affecting another | `TargetingService` excludes the caster by default and gates other players behind `config.combat.allowPlayerVersusPlayer`; `FeedbackService` can only address one player |
| A player damaging themselves with their own sword | `DamageService.validate` refuses `source === target` unless the binding sets `allowSelfDamage`; the check is in the damage layer, so no ability can bypass it by targeting differently |
| Two players' area abilities interfering | targeting resolves from each caster's own position and view vector, and every hit-protection key is `player.id`-scoped, so simultaneous casters never share a budget |
| One activation hitting the same entity repeatedly | two independent layers: a per-execution `Set` of entity ids, and a per-player `hit:` cooldown key lasting `config.combat.hitProtectionTicks` |
| Input spam | `AbilityGate.checkRate` enforces `config.combat.minActivationIntervalTicks` per player before any work is done, ahead of the cooldown check |
| Stale player/entity references | nothing is cached across ticks; `isValid` is checked before every mutation, and every engine call is wrapped so a removed entity aborts one target, not the ability |
| Duplicated event handling | exactly one subscription for the entire addon (`tools/validate.mjs` enforces the single-interval rule and the router owns the only component registration) |
| Runaway loops | no gameplay tick loops exist; the only `system.runInterval` is a 30-second memory sweep, and the validator fails the build if a second one appears |
| Unbounded damage or knockback | `resolveAmount` collapses `NaN`, `Infinity` and negatives to 0; knockback is clamped to `maxKnockbackHorizontal` / `maxKnockbackVertical`; targeting clamps range to `maxRange` and count to `maxTargets` |
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

The combat layer stores nothing of its own: hit protection lives in
`CooldownManager` under `hit:<entityId>` keys owned by the striking player, and
the per-execution duplicate set is a local variable that dies with the call.

### Reading the target, not just the caster

`EffectService.has(entity, effectId)` and `.remaining(entity, effectId)` are the
read half of the effect system, and they open an axis the framework did not
have: an ability can branch on **what the target is already suffering**.

That is what makes Frost Sword a sequence rather than a button. Its passive
leaves slowness; its active deals bonus damage to anything already slowed.

`EffectService.healthFraction(entity)` (v0.10.0) is the third read, and the one
with two opposite consumers: `ward` asks it about the **caster**, so a defensive
guard forms only once its wielder is losing; `drain` asks it about the
**target**, so the void pays out most for taking what is nearest to gone. One
utility, because the failure handling — a health component that is absent, a
handle that has gone invalid, a maximum of zero — is identical either way and is
exactly the sort of thing that gets written twice and fixed once.

Every area and on-hit ability in the collection now scales with a different
question, which is the test a new ability has to pass to justify existing:

| Ability | Scales with | Sword |
|---|---|---|
| `burst` | how far the target is from the centre | Earth |
| `ember_burst` | how much heat the **caster** has banked | Ember Blade |
| `nova` | what the **target** is already suffering | Frost |
| `entangle` | how many were caught, paid to the caster | Nature |
| `resonate` | how many were caught, paid to every target | Crystal |
| `rift` | how far from the caster it was opened | Void |
| `ward` | the **caster's** remaining health | Crystal |
| `drain` | the **target's** remaining health | Void |
| `flare` | the time of day and the dimension | Solar |
| `radiance` | what *kind* of thing the target is | Solar |
| `crush` | how far **above** the caster the target is | Gravity |
| `weigh` | the target's **maximum** health, as mass | Gravity |
| `rupture` | venom the target is already carrying | Poison |
| `stasis` | **how long the caster has waited** | Time |
| `surge` | **how fast the caster is moving** | Storm |

Sixteen swords, and every row of that table is a different question. That is
also why the roster closed there: the collection's rule has always been that a
sword must ask something no other sword asks, and by sixteen the axes a Bedrock
add-on can cheaply and reliably read — distance, angle, crowd size, caster
health, target health, target category, target mass, altitude, reach, world
time, banked charge, banked venom, waiting, motion — were used up. A
seventeenth would have had to repeat one, and a repeated axis is a recolour with
a different particle.

None of these reads ever throws — `getEffect` and `getComponent` both raise on a
dead handle, and they run inside combat resolution where a throw would abandon
the remaining targets. An unreadable target reports as *unaffected* and
*unhurt*, so the failure mode is always "no bonus", never "free bonus": `ward`
only forms below a threshold and `drain` only pays below one, so reporting 1
withholds both rather than granting both.

The ordering rule that goes with it: **read the target's state before striking**,
so the effects or damage an activation applies cannot trigger its own bonus.
`nova`, `afflict` and `drain` all do this, and a test asserts it for each.

### Moving the caster

`systems/movement.js` is the framework's only code that repositions a player,
and it is written under the opposite rule to the rest of the combat layer:
**when in doubt, do nothing.** A refused strike costs a player a click; a bad
teleport suffocates them in stone, drops them down a ravine, or puts them in
lava.

```
caster position + view direction (flattened)
        │
        ▼  candidates at maxDistance, maxDistance-1, … minDistance
        │  furthest first — the player asked to go as far as possible
        ▼  per candidate:
        │    1. finite coordinates
        │    2. feet and head blocks passable
        │    3. not lava, not fire
        │    4. ground within maxDrop below
        │    5. Entity.tryTeleport with checkForBlocks  ← the authority
        ▼
   first candidate that passes, or a refusal with a named reason
```

Steps 1–4 are a survivability screen; step 5 is the engine's own collision
test, and the only check that cannot disagree with the game. Both halves are
needed: `tryTeleport` alone would happily drop a player off a cliff, because it
tests geometry rather than whether they live.

Three details worth stating:

- **Every block read is wrapped.** `Block.isAir`, `.isLiquid` and `.typeId` all
  throw on an unloaded chunk or outside world bounds — ordinary situations at a
  chunk edge or at world height. An unreadable block counts as *not passable*.
- **`Block.isSolid` is not used.** It is still pre-release; `isAir || isLiquid`
  is the stable way to ask whether something can stand somewhere.
- **The view is flattened by default.** A dash that follows pitch is how a
  mobility ability launches someone into a ceiling.

`config.movement.maxDashDistance` caps every dash at 10 blocks regardless of
what a definition asks for.

### Reading the world, not the fight

`systems/environment.js` (v0.11.0) is the first service that answers a question
about neither the caster nor the target. `daylight(dimension)` reports how high
the sun stands, as 1 at noon falling to 0 across the night, and 0 anywhere the
sun does not reach.

That is a genuinely different *kind* of condition, and it is worth naming as
one:

| Condition on | Example | Read through |
|---|---|---|
| The caster | Crystal Guard forms only when wounded | `effects.healthFraction(ctx.player)` |
| The target | Void Drain pays out on what is nearly gone | `effects.healthFraction(target)` |
| The fight | Crystal Burst rings louder for a crowd | the resolved target list |
| **The world** | **Solar Flare is worth a third of itself at night** | **`environment.daylight(ctx.dimension)`** |

Three design notes that generalise:

- **A ramp, not a switch.** The daylight curve is a cosine over the day, so dusk
  fades. A sword that switched off at a fixed hour would be a rule to memorise;
  one that fades is something a player feels.
- **The dimension is part of the question.** `daylight` takes the dimension and
  returns 0 for the Nether and the End regardless of the clock, because a solar
  weapon that worked identically underground would be a solar weapon in name
  only. That check lives in the service rather than in the ability, so the next
  sun-reading sword inherits it.
- **It fails to zero.** An unreadable clock reports no sun, matching every other
  conditional read in the framework: the failure mode is "no bonus", never
  "free bonus".

Nothing here polls. One engine call at the moment an ability fires, and never
again.

### Storing state on the target instead of the player

`PlayerStateStore` holds three shapes of state, all keyed by `player.id`.
Poison Sword needed a fourth that belongs to nobody: how much venom **a
particular mob** is carrying.

The obvious implementation is a `Map` from entity id to a stack count, and it is
a memory leak wearing a hat. Entities die, despawn, unload with their chunk and
cross dimensions; every one of those leaves a key that nothing will ever remove,
and the leak grows with playtime on a busy server.

So the count is stored in **the effect itself**. `envenom` reads
`effects.amplifierOf(target, 'poison')` and applies the same effect one
amplifier higher; `rupture` reads the tiers, pays out for them, and calls
`effects.remove` to spend them.

| | Player-side (`PlayerStateStore`) | Target-side (the effect) |
|---|---|---|
| Keyed by | `player.id` | nothing — it *is* the entity's state |
| Cleared by | death, disconnect, the 30-second sweep | the effect's own expiry |
| Survives the mob dying | n/a | no, and correctly so |
| Bytes held between activations | one map entry per active player | **zero** |
| Spending it | `spendCharges` | `effects.remove` |

The trade is that the game is now the source of truth, which means a *different*
source of the same effect feeds the meter — a witch's poison counts as venom.
That is recorded in `TODO.md` as a question for play rather than reasoning; it
is arguably correct and arguably an exploit, and it is not the sort of thing
static analysis settles.

### Waiting as a resource, and the second mark scope

Time Sword's `stasis` is the only ability whose output depends on **how long it
has been since it last ran**. That needed no new machinery — `sinceMark` already
answers it — but it did need a second scope.

Marks are life-scoped by default so a combo window cannot outlast the death that
ended it. A charge clock must not be: a life-scoped clock is *cleared* on death,
`sinceMark` then reports `Infinity`, and `Infinity` means "has been waiting
forever", which is a **full meter**. Dying would recharge the sword. So
`mark`/`sinceMark` take `{ lifeScoped: false }`, storing under a `mark:` prefix
that survives respawning and is dropped on disconnect like everything else.

| Scope | Key prefix | Cleared on | Use for |
|---|---|---|---|
| Life | `life:` | death, respawn, disconnect | combo windows, charge levels |
| **Mark** | `mark:` | **disconnect only** | clocks that belong to the item, not the body |
| Player | anything else | disconnect | anything that should survive a respawn |

It is the same reasoning that keeps cooldowns out of the life scope, and it is
worth stating as a rule: **anything a player would benefit from resetting must
not be life-scoped.**

`Infinity` for an unwritten mark is load-bearing rather than incidental here — a
sword picked up and never fired has, correctly, been waiting forever, and
arrives fully wound with no special case in the ability.

### Reading the caster's motion

`MovementService.momentumOf` is the last of the conditional reads, and the only
one about what the caster is *doing* rather than what they are.

It is built from `isSprinting` and `isOnGround`/`isFalling` — booleans — rather
than from `getVelocity()`, which would give a nicer scalar. Server-side player
velocity in Bedrock is jittery and can report near-zero for a player who is
plainly running, and a sword's headline mechanic cannot rest on a reading like
that. Two reliable booleans beat one unreliable float; `TODO.md` records the
trade so it can be revisited with client evidence rather than by argument.

### Acting where the caster is not

Every offensive ability up to v0.9.0 originated at the wielder's body: the
radial bursts expand from their feet, `cleave` is a cone off their arm, `chain`
starts on whatever they point at, `repulse` throws from where they stand. None
could affect a place the caster was not standing in.

`TargetingService.resolvePoint` had existed since step 4 for exactly this and
had no consumer. `rift` (Void Sword) is the first:

```
resolvePoint(ctx)          one block raycast, capped by the binding's range
  -> targeting.around(...)  one entity query around the returned point
  -> combat.strike(..., { origin: centre, knockback: { pull: true } })
```

Two safety properties make that a framework capability rather than a hole in
one:

- **`around` keeps the binding's filters.** It is a front door onto the same
  `sphere` query the caster-centred abilities use, carrying `ctx.allowedTargets`
  and the caster exclusion, so choosing a different origin cannot widen what an
  ability may hit. An ability cannot escape its own permissions by aiming
  elsewhere.
- **Reach is bounded twice.** The binding's `targeting.range` is clamped to
  `config.targeting.maxRange`, and the blast radius is a separate parameter, so
  a long-ranged rift is not automatically a wide one.

`StrikeSpec.origin` is what makes the pull work: it is the knockback's reference
point, so passing the rift's centre and `pull: true` drags everything caught
inward. That is also the cleanest available answer to "move entities rather than
the caster" — no teleport, no per-tick force, one impulse at resolution time.

### Stacking charges

`PlayerStateStore` exposes the one primitive for "this sword builds something up
as you fight": `addCharge` / `charges` / `spendCharges`. Two swords use it now, in
opposite ways, which is the argument for it existing:

| | Ember Blade — heat | Thunder Sword — static charge |
|---|---|---|
| Fills on | a landed melee hit | a landed melee hit |
| Spent by | the **player**, with the active | **itself**, on the third hit |
| Feels like | a resource | a metronome |

Same primitive, opposite rhythm.

### Combo windows

`mark(playerId, name, tick)` and `sinceMark(playerId, name, tick)` are the third
shape of per-player state, and the only one read by a *different* ability than
the one that wrote it:

| Shape | Written by | Read by | Example |
|---|---|---|---|
| Resource | a passive | the player, deliberately | Ember Blade's heat |
| Counter | itself | itself, on a rhythm | Thunder's static charge |
| **Window** | one ability | **another**, for a time | Shadow Step → Shadow Edge |

The two Shadow abilities never reference each other; they share a key. A future
sword could open the same window with a leap, a feint or a kill and reuse
`opportunist` unchanged.

`sinceMark` returns `Infinity` when no mark exists, so the natural comparison
`sinceMark(...) <= windowTicks` is false without the caller special-casing it,
and treats an apparently backwards clock — a world reload — as no mark rather
than an infinitely fresh one.

Three properties are enforced centrally rather than per ability, because each is
a way the multiplayer rule could quietly break:

| Property | Why it lives in the store |
|---|---|
| Keyed by `player.id` | there is no un-keyed way to reach a counter, so one player's meter structurally cannot feed another's |
| Life-scoped | dying clears the meter; nobody respawns holding a full one |
| Clamped to `max`, non-finite input rejected | an ability cannot leak an unbounded counter, and the clamp is tested once instead of once per sword |

`spendCharges` reads and clears in a single step, so two rapid activations
cannot both claim the same stacks.

Cooldowns are deliberately **not** life-scoped: dying to reset a long cooldown
would be an exploit.

There is no third category, and no API in the framework that stores per-player
data without a player id. That is why one player's cooldown structurally cannot
affect another's.

## 10. Performance

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
- **Engine-side spatial queries** — `Dimension.getEntities` with a bounded
  `maxDistance` does the search; the framework never scans entity lists or
  blocks itself. Cone and directional modes narrow an engine sphere rather than
  replacing it.
- **One spatial query per activation.** A binding with both a targeting spec and
  an ability that queries on its own (`surge`) costs two; nothing costs more.
- **Cheapest rejection first.** `AbilityGate` runs player → ability → equipped →
  restrictions → rate → cooldown, so a spammed input is refused after a `Map`
  lookup, before any targeting or damage work.
- **Hard caps on every unbounded quantity:**

  | Quantity | Cap | Where |
  |---|---|---|
  | Particles per emit | 64 | `config.particles.maxPerEmit` |
  | Targets per activation | 64 | `config.combat.maxTargets` |
  | Targeting range | 32 blocks | `config.combat.maxRange` |
  | Horizontal knockback | 4 | `config.combat.maxKnockbackHorizontal` |
  | Vertical knockback | 2 | `config.combat.maxKnockbackVertical` |
  | Activations per player | 1 per 2 ticks | `config.combat.minActivationIntervalTicks` |

  The caps are applied in the systems layer, so a mis-authored sword definition
  is clamped rather than trusted.
- **Measured worst case**: Inferno's `use` binding — the most expensive
  activation shipped — emits 72 particles across an arc plus one per target, in
  a single tick, with one entity query. No shipped sword schedules work into a
  later tick.
- **Cost scales with player actions, not with sword count.** 25 swords cost the
  same at idle as 1: registration is startup-only, and idle cost is exactly one
  600-tick sweep.

---

## 11. Item registration

Everything above concerns the framework's *behaviour*. This section covers how
a sword becomes a real Minecraft item, which is a separate problem with its own
failure modes — and the one that broke in v0.5.0 despite every automated check
passing.

### The four things Minecraft needs, and where each comes from

| What | Where it is declared | Consumed by |
|---|---|---|
| Identity | `description.identifier` in the item JSON (BP) | the engine's item registry, `/give`, `ItemStack.typeId` |
| Creative placement | `description.menu_category` (BP) | the creative inventory |
| Icon | `minecraft:icon` shortname (BP) → `item_texture.json` (RP) → PNG (RP) | the inventory, hotbar and hand |
| Name | `minecraft:display_name` key (BP) → `en_US.lang` (RP) | every tooltip |

Only the first lives entirely in the behaviour pack. The other three **cross the
pack boundary**, and each is a separate chance for the two halves to disagree.
All four are generated from one sword definition, so the halves cannot drift —
but generating them consistently is worthless if the convention itself is wrong,
which is exactly what happened.

### Creative placement

```json
"menu_category": { "category": "equipment", "group": "minecraft:itemGroup.name.sword" }
```

**The group reference must carry the `minecraft:` namespace.** Minecraft's own
older tutorials show the bare `itemGroup.name.sword`, and that is what this
project shipped in v0.5.0; the result was seven swords in the generic Items
tab. From 1.26.20 the description block is validated strictly and an
unnamespaced group is not a valid reference.

`category` is one of `construction`, `equipment`, `items`, `nature`. Omitting
`menu_category` entirely does not fail — it silently defaults to Items, which
is why the validator now treats a missing one as an error.

### Display name — the key Minecraft actually generates

For a **namespaced custom item** the engine's own translation key is:

```
item.<namespace>:<local_name>          →  item.custom_swords:inferno_sword
```

with **no `.name` suffix**. The familiar `item.<name>.name` form is the
*vanilla* convention (`item.apple.name`), and following it for a custom item
produces a key nothing ever looks up — so the raw identifier appears in the
tooltip. That was the v0.5.0 name bug, and it is a genuinely easy one to make,
because the vanilla form is what every vanilla item file shows.

`en_US.lang` therefore emits **both** keys per sword:

```
item.custom_swords:inferno_sword=§dInferno Sword§r
item.custom_swords:inferno_sword.name=§dInferno Sword§r
```

The first is the one that resolves. The second costs one line and hedges
against a convention that is version-dependent and thinly documented.

Rarity colour is a section code baked into the translated value, because
`minecraft:rarity` offers only four tiers and escalates on enchant (see
`docs/API_NOTES.md`).

### Icon

```
minecraft:icon.textures.default   →  "inferno_sword"                       (BP)
item_texture.json texture_data    →  "textures/items/custom_swords/swords/inferno_sword"  (RP)
the file on disk                  →  .../inferno_sword.png                 (RP)
```

The atlas path carries **no `.png` extension**. `minecraft:icon.texture` (the
singular form) is deprecated; `textures.default` is current.

Because this project's PNG encoder is hand-written, the validator runs
`verifyPng()` over every icon on every build: chunk CRCs, chunk ordering, 8-bit
RGBA, non-interlaced, exact decompressed IDAT length, legal per-scanline filter
bytes. Another decoder opening the file is not evidence that Minecraft will.

### Why the v0.5.0 bugs got through

Worth recording, because the lesson generalises:

- The tests covered `identifiers.js`, the module that *builds* the keys. The
  wrong creative group was a string literal hard-coded in `tools/generate.mjs`,
  outside that module entirely — so the identifier tests were green and the
  shipped item was wrong.
- The validator checked that the item's declared name key matched
  `nameKey(id)` and that the key existed in `en_US.lang`. Both were true. The
  convention they agreed on was the wrong one, and a consistency check cannot
  catch consistent-but-wrong.

The fix is structural, not a patch: the creative group now lives in
`core/identifiers.js` with every other namespaced string, and
`tests/unit/pack_output.test.mjs` asserts against the **real generated files**
rather than the helpers that produce them. Re-introducing either bug fails
three of those tests.

---

## 12. Rendering, animation and presentation

The section above gets a sword into the game. This one covers what the player
*sees and hears*, which is where v0.5.1 failed: the abilities were firing
correctly and were completely invisible.

### What Bedrock actually gives you, and what it does not

The first job here was separating "animation" into the three different things
people mean by it, because only one of them is item-side at all.

| Wanted | Mechanism in Bedrock | Where it lives |
|---|---|---|
| Sword renders as a tool in hand, not a flat card | `minecraft:hand_equipped: true` | item JSON |
| Icon in hotbar, inventory and hand | `minecraft:icon` → `item_texture.json` → PNG | §11 |
| Arm swing on attack | the **player's** animation, applied to every item | nothing to author |
| Swing speed | `minecraft:swing_duration` (format_version **1.21.120**) | item JSON |
| Ability visuals | `Dimension.spawnParticle` from script | systems + profiles |
| Ability audio | `Dimension.playSound` / `Player.playSound` | systems + profiles |

Two consequences worth stating plainly, because both are places to waste a
week:

- **There is no per-item attack animation in Bedrock.** The swing belongs to
  the player entity. A custom item cannot replace it, and does not need to —
  it already swings. `swing_duration` changes how *long* the swing takes, and
  is explicitly visual only: it does not touch attack rate, cooldown or damage.
- **This project ships no attachables, geometry, animations or animation
  controllers, and needs none.** Those are for items that must render as a 3D
  model rather than a sprite. A sprite sword with `hand_equipped` is the
  correct architecture here, so the resource pack contains exactly textures and
  text. An empty `animations/` folder would be a liability, not a feature.

### Visual profiles

Ability presentation is a named, reusable bundle rather than per-binding
inline data:

```
Sword definition
  └── binding: visual: 'fire'
        └── VISUAL_PROFILES.fire
              ├── caster particle   (the flare at the wielder)
              ├── target particle   (what lands on each victim)
              ├── trail particle    (arcs, rings, trails)
              ├── cast sound
              └── impact sound
                    └── AbilityExecutor.resolvePresentation()
                          └── ctx.particles / ctx.sounds / ctx.visual
```

Resolution happens **once per activation**, not per target, in
`ability_executor.js`. Anything the binding states explicitly wins; the profile
only fills gaps. Abilities read `ctx.visual?.trail` for decorative geometry, so
`cleave` draws its arc in flame on Inferno and in storm-sparks on Thunder
without knowing either theme exists.

A binding may also carry a **`label`**, the player-facing name for that
activation. Ability ids stay behaviour names — `nova`, `chain`, `discharge` —
so any sword can bind them; the flavour lives with the sword that owns it. Frost
presents `nova` as "Frost Nova", Thunder presents `chain` as "Thunder Strike",
and the action bar and catalogue both show the label. Without this the choice
was between reusable abilities and evocative names; there is no reason to lose
either.

Seventeen profiles ship: `fire`, `storm`, `frost`, `gale`, `stone`, `tide`,
`grove`, `ember`, `shadow`, `crystal`, `void`, `solar`, `gravity`, `venom`,
`chrono`, `tempest`, and `arcane` as the framework's neutral default. A test asserts no two share a caster particle or a cast sound,
so "distinct look per theme" is enforced rather than intended — which is what
keeps `ember` and `fire` from converging as more fire-themed swords arrive.

The rule matters most for the pairs that are *conceptually* adjacent, where the
temptation is to reach for the same vocabulary at a different brightness:

| Pair | How they are kept apart |
|---|---|
| `fire` / `ember` | open flame and molten spatter versus spark motes and a single candle flame |
| `frost` / `crystal` | snow and rime versus mystical motes and a mineral flare — no snowflake anywhere in `crystal` |
| `shadow` / `void` | portal motes marking where the wielder *was* versus dragon-breath wisps and End-sparkle marking somewhere else *arriving*; the two share not one identifier |
| `fire` / `ember` / `solar` | the third warm theme takes the one warm vocabulary neither of the first two uses — totem sparkle and a pale spike, never flame or spatter |
| `void` / `gravity` | cosmic and bright against dark versus entirely achromatic dust and debris |
| `grove` / `venom` | villager-happy motes and blossom, unmistakably benign, versus a thrown toxic puff and a sour pulse |
| `storm` / `tempest` | a single white arc between two points versus the whole sky — cloud, rain and a pale discharge |
| `gale` / `tempest` | a shockwave and drifting motes versus weather that lands on its targets |

### Why this layer exists

Before it, every binding restated its own particle ids and sound names inline.
There was no single place where "what fire looks like" was written down, so
there was no single place to get it wrong once and fix it once. Five unusable
particle identifiers and fourteen missing sound presets spread across seven
swords, and:

| Layer | Why it did not catch this |
|---|---|
| Unit tests | the mocked engine accepts any string as a particle or sound id |
| Validator | it checked the *shape* of a particle spec, never the *identifier* |
| The game | `spawnParticle` renders nothing; `playSound` is silent. Neither throws |

Nothing failed. That is the whole lesson: **an identifier handed to the engine
is only as good as the catalogue it was checked against.**

### The catalogues

Three now, all the same pattern — a transcribed snapshot, checked at build
time, failing towards a build error rather than a silent no-op in someone's
world:

| Catalogue | Contents | Source |
|---|---|---|
| `core/effect_catalogue.js` | 37 status effects | `@minecraft/vanilla-data` 1.26.44 |
| `core/particle_catalogue.js` | usable particles, plus Molang-dependent ones mapped to their usable sibling | Bedrock Wiki vanilla particle list |
| `tools/data/vanilla_sound_events.json` | 1824 sound events | the vanilla resource pack's `sound_definitions.json` |
| `tools/data/vanilla_items.json` | 1607 item identifiers | Mojang's `bedrock-samples` metadata |

The particle catalogue encodes the distinction that caused the bug. An
identifier fails for one of two reasons, and the error says which:

- **It does not exist.** `minecraft:wind_explosion_emitter` is not a vanilla
  particle. It reads plausibly, which is exactly the problem.
- **It exists but needs a host entity.** Many vanilla particles read Molang
  variables from the entity they were authored for. Spawned standalone they log
  errors instead of rendering. Each is mapped to the sibling that works —
  `electric_spark_particle` → `endrod` — so the error carries its own fix.

The sound snapshot is build-time only and is never shipped in the add-on; it
exists solely to prove every `SOUND_LIBRARY` id is a real event.

---

## 13. Build pipeline

```
scripts/swords/*.js  (behaviour + stats)      art/swords/*.json  (texture art)
        │                                              │
        ▼  tools/generate.mjs  ◄────────────────────────┘
        ├── packs/CustomSwordsBP/items/*.item.json
        ├── packs/CustomSwordsBP/recipes/*.recipe.json
        ├── packs/CustomSwordsRP/textures/item_texture.json
        ├── packs/CustomSwordsRP/textures/items/custom_swords/swords/*.png
        ├── packs/CustomSwordsRP/texts/en_US.lang
        └── packs/CustomSwordsBP/texts/en_US.lang
        │
        ▼  tools/validate.mjs      manifests, UUIDs, JSON, references, architecture rules
        ▼  tools/catalog.mjs        SWORD_CATALOG.md (regenerated; `--check` in CI)
        ▼  npm test                322 unit + integration tests against a mocked engine
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

### Crafting recipes

A sword's recipe is **sword data**, not a hand-written JSON file:

```js
recipe: {
    pattern: [' X ', ' X ', ' I '],
    key: { X: 'minecraft:copper_ingot', I: 'minecraft:blaze_rod' },
    unlockedBy: 'minecraft:blaze_rod',
}
```

`tools/generate.mjs` compiles that into `minecraft:recipe_shaped` JSON under
`packs/CustomSwordsBP/recipes/`. The reason is the same one that made item JSON
generated: at 25 swords, a recipe file maintained separately from its sword
drifts from it, and the drift is invisible until somebody tries to craft one.

Every sword **must** declare a recipe — `tools/validate.mjs` fails the build
otherwise. That is a permanent project rule, alongside the texture standard.

The failure mode this guards against is specific: **a recipe naming an item
that does not exist does not error.** It simply never registers, and the only
symptom is a player who cannot craft the sword. So every ingredient, and every
`repairItems` entry, is checked against `tools/data/vanilla_items.json` — 1607
identifiers from Mojang's own metadata — at build time.

Each recipe is built around the material that repairs its sword, so the thing
that mends a blade is the thing it was made from.

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

## 14. Version contract

The framework targets `@minecraft/server` **2.0.0** and a minimum engine version
of **1.21.90**. Both the Scripting V2 lifecycle and Custom Components V2 became
stable in that release. `docs/API_NOTES.md` records every API the framework
relies on, where each was verified, and what a version bump would require.
