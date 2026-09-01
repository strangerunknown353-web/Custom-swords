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
│ CORE          registry  definition_validator  cooldown_manager       │
│               player_state  ability_executor  input_router  bootstrap│
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
Sword identification  ──── O(1) Map lookup on itemStack.typeId
        │                  (scripts/core/registry.js)
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

## 3. Core components

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

## 4. Systems

| System | Responsibility | Safety rules it owns |
|---|---|---|
| `targeting` | find entities (sphere / cone / raycast) | range ceiling, target-count ceiling, PvP toggle, never-target list, stale-handle rejection |
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

## 5. Lifecycle

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

## 6. Multiplayer safety

Each of the failure modes the project set out to avoid maps to a specific
structural guarantee:

| Risk | Guarantee |
|---|---|
| Shared cooldowns | every read/write is keyed by `player.id`; there is no un-keyed cooldown API to call by accident |
| Global ability state | abilities have no module-level mutable state; `PlayerStateStore` is the only sanctioned store, and it is player-keyed |
| One player's ability affecting another | `TargetingService` excludes the caster by default and gates other players behind `config.combat.allowPlayerVersusPlayer`; `FeedbackService` can only address one player |
| Stale player/entity references | nothing is cached across ticks; `isValid` is checked before every mutation, and every engine call is wrapped so a removed entity aborts one target, not the ability |
| Duplicated event handling | exactly one subscription for the entire addon (`tools/validate.mjs` enforces the single-interval rule and the router owns the only component registration) |
| Runaway loops | no gameplay tick loops exist; the only `system.runInterval` is a 30-second memory sweep, and the validator fails the build if a second one appears |
| Memory growth | `playerLeave` clears per-player buckets immediately; the sweep is a backstop for missed events |

---

## 7. Performance

- **Zero gameplay tick loops.** Everything is event-driven.
- **One interval**, every 600 ticks, doing nothing but releasing memory.
- **O(1) sword identification** — a `Map` lookup on `typeId`.
- **Engine-side spatial queries** — no manual entity scans, no block scans.
- **Hard particle budget** — `config.particles.maxPerEmit` caps any single call,
  so a mis-authored meteor cannot stall a low-end device.
- **Cost scales with player actions, not with sword count.** 25 swords cost the
  same at idle as 1.

---

## 8. Build pipeline

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

The tools have **zero npm dependencies**: the PNG encoder
(`tools/lib/png.mjs`) and the ZIP writer (`tools/lib/zip.mjs`) are ~150 lines
each, and both are unit tested. `npm run all` works on a clean machine with only
Node installed.

---

## 9. Version contract

The framework targets `@minecraft/server` **2.0.0** and a minimum engine version
of **1.21.90**. Both the Scripting V2 lifecycle and Custom Components V2 became
stable in that release. `docs/API_NOTES.md` records every API the framework
relies on, where each was verified, and what a version bump would require.
