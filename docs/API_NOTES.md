# API notes and version contract

This project's rule is: **never invent an API.** Everything below was verified
against a primary source before it was used. This file records what was
verified, where, and what a version change would cost.

Verified on **2026-09-01** (milestone 1), extended for milestone 2.

---

## 1. Target versions

| Thing | Value | Why |
|---|---|---|
| `@minecraft/server` module | **2.0.0** | First stable Scripting V2 release. Declared in the behaviour pack manifest. |
| `min_engine_version` | **1.21.90** | The Minecraft release that shipped `@minecraft/server` 2.0.0 as stable. |
| Item `format_version` | **1.21.90** | Same release; the item schema is documented separately as `minecraft:item v1.21.90`. |

**Why 2.0.0 and not the newest (2.9.0 at time of writing):** the framework uses
nothing added after 2.0.0. Pinning to 2.0.0 means the add-on runs on every
Minecraft build from 1.21.90 onward instead of only the newest one. Raising it
is a deliberate decision, taken only when a specific API justifies it, and
recorded here.

`@minecraft/server` release history relevant to this project (from the npm
registry): 2.0.0 → 2026-06-17 (MC 1.21.90) … 2.9.0 → 2026-08-04 (MC 26.40).
Minecraft moved to year-based version numbers in 2026; JSON and API versioning
continues to use the `1.26.xx` form.

---

## 2. APIs the framework depends on

Every entry below was checked against the `@minecraft/server` 2.0.0 TypeScript
definitions (`npm pack @minecraft/server@2.0.0`).

### Lifecycle

| API | Signature | Used by |
|---|---|---|
| `system.beforeEvents.startup` | `StartupBeforeEventSignal` → `StartupEvent` | `core/bootstrap.js` |
| `StartupEvent.itemComponentRegistry` | `ItemComponentRegistry` | `core/input_router.js` |
| `ItemComponentRegistry.registerCustomComponent` | `(name: string, component: ItemCustomComponent) => void` | `core/input_router.js` |
| `world.afterEvents.worldLoad` | `WorldLoadAfterEventSignal` | `core/bootstrap.js` |
| `world.afterEvents.playerLeave` | event has `playerId`, `playerName` (no `Player` — it is gone) | `core/bootstrap.js` |
| `system.currentTick` | `number` | cooldown clock |
| `system.runInterval` | `(callback, tickInterval?) => number` | maintenance sweep only |
| `world.getAllPlayers` | `() => Player[]` | maintenance sweep only |

**Scripting V1 → V2 renames that this project must not get wrong:**
`world.beforeEvents.worldInitialize` was **removed** in favour of
`system.beforeEvents.startup`, and `world.afterEvents.worldInitialize` was
renamed to `world.afterEvents.worldLoad`.

### Item custom component

`ItemCustomComponent` in 2.0.0 exposes `onUse`, `onUseOn`, `onHitEntity`,
`onMineBlock`, `onBeforeDurabilityDamage`, `onCompleteUse`, `onConsume`. This
project uses two:

| Handler | Event fields used |
|---|---|
| `onUse` | `source: Player`, `itemStack?: ItemStack` |
| `onHitEntity` | `attackingEntity: Entity`, `hitEntity: Entity`, `itemStack?: ItemStack`, `hadEffect: boolean` |

Each handler also receives a second `CustomComponentParameters` argument
carrying the component's JSON parameters. The framework does **not** use it:
sword configuration lives in the script definitions so that one component
declaration (`"custom_swords:sword": {}`) serves every sword.

### Entities and targeting

| API | Signature |
|---|---|
| `Entity.isValid` | **property**, not a method (it was a method in 1.x) |
| `Entity.id` / `typeId` / `location` / `dimension` | read-only |
| `Entity.applyDamage` | `(amount, options?: EntityApplyDamageOptions) => boolean`, options `{ cause: EntityDamageCause, damagingEntity?: Entity }` |
| `Entity.applyKnockback` | `(horizontalForce: VectorXZ, verticalStrength: number) => void` — **two arguments**, not the four of 1.x. The magnitude of the `VectorXZ` is the force. |
| `Entity.addEffect` | `(effectType, duration, options?: { amplifier?, showParticles? })` |
| `Dimension.getEntities` | `(options?: EntityQueryOptions) => Entity[]`; `location` + `maxDistance` + `excludeTypes` are all supported |
| `Dimension.getEntitiesFromRay` | `(location, direction, options?) => EntityRaycastHit[]` |

### Diagnostics

| API | Signature |
|---|---|
| `system.afterEvents.scriptEventReceive` | `subscribe(callback, options?: ScriptEventMessageFilterOptions)` — the options object takes `namespaces: string[]`, which is what keeps our handler off other add-ons' script events |
| `ScriptEventCommandMessageAfterEvent` | `id`, `message`, `sourceEntity?`, `sourceBlock?`, `sourceType`, `initiator?` |
| `Player.sendMessage` | `(message: RawMessage \| string \| (…)[]) => void` |

### Player, feedback and audio

| API | Signature |
|---|---|
| `Player.getHeadLocation` | `() => Vector3` |
| `Player.getViewDirection` | `() => Vector3` |
| `Player.getComponent('minecraft:equippable')` | returns `EntityEquippableComponent`; `getEquipment(EquipmentSlot.Mainhand)` reads the held stack |
| `ItemStack.hasTag` | `(tag: string) => boolean`; used to recognise vanilla swords via `minecraft:is_sword` |
| `Player.onScreenDisplay.setActionBar` | `(text: RawMessage \| string \| (…)[]) => void` |
| `Player.playSound` | `(soundId, options?: PlayerSoundOptions { location?, pitch?, volume? })` |
| `Dimension.playSound` | `(soundId, location, options?: WorldSoundOptions { pitch?, volume? })` |
| `Player.startItemCooldown` | `(cooldownCategory: string, tickDuration: number) => void` |
| `Dimension.spawnParticle` | `(effectName, location, molangVariables?: MolangVariableMap)` |
| `MolangVariableMap.setColorRGBA` | `(variableName, color: RGBA { red, green, blue, alpha })` |

---

## 3. JSON schemas used, and their minimum format versions

| Component | Shape used | Minimum format version |
|---|---|---|
| `minecraft:icon` | `{ "textures": { "default": "<shortname>" } }` | 1.20.60 |
| `minecraft:display_name` | `{ "value": "item.<id>.name" }` — the value may be a localisation key | 1.20.0 |
| `minecraft:damage` | `{ "value": <int> }` | 1.20.30 |
| `minecraft:durability` | `{ "max_durability": <int> }` | — |
| `minecraft:enchantable` | `{ "slot": "sword", "value": <int> }` | 1.20.30 |
| `minecraft:repairable` | `{ "repair_items": [ { "items": [...], "repair_amount": <int> } ] }` | — |
| `minecraft:hand_equipped` | `true` | — |
| `minecraft:glint` | `true` | 1.20.30 |
| `minecraft:tags` | `{ "tags": [...] }` | — |
| `custom_swords:sword` | `{}` — flattened custom component | 1.21.90 + `@minecraft/server` ≥ 2.0.0 |

### Deliberately not used

- **`minecraft:custom_components`** — the array form is deprecated and, per the
  reference documentation, "no longer in use in the latest versions". Custom
  Components V2 flattens namespaced components directly into `components`.
  `tools/validate.mjs` fails the build if the deprecated form reappears.
- **`minecraft:swing_duration`** — requires item `format_version` 1.21.120,
  above our 1.21.90 target. Tracked in `TODO.md`.
- **`minecraft:rarity`** — *verified, then rejected.* Two blocking properties:
  it accepts only `common`, `uncommon`, `rare` and `epic`, so it cannot express
  a six-tier scheme; and the documented behaviour is that rarity
  **automatically increases when the item is enchanted** (common/uncommon → rare,
  rare → epic), so an enchanted sword would silently change tier colour. Rarity
  is therefore applied as a section colour code on the generated display name,
  which is exact, six-tier capable, stable under enchanting, and colours the
  name in the hotbar and inventory as well as the hover tooltip.
- **`minecraft:hover_text_color`** — exists since format_version 1.20.10 and
  takes a colour string, but the reference does not enumerate the accepted
  values. It would also only colour the *hover* text, which the section code
  already does alongside the hotbar and inventory. Not adopted.
- **Item lore / tooltip flavour text** — Bedrock has **no item-JSON lore
  component**. A sword's `description` is generated into `.lang` under
  `item.<id>.description` and surfaced by the diagnostics command, but it cannot
  reach the vanilla tooltip without either a UI codex or a runtime
  `ItemStack.setLore` hook. Tracked in `TODO.md`.

---

## 4. Experiment requirements

**None.** Custom Components V2 requires no experimental toggle when the
behaviour pack declares `@minecraft/server` 2.0.0 or higher; it was released
from experimental in Minecraft 1.21.90 for both blocks and items.

---

## 5. What to do when bumping the target version

1. Fetch the new type definitions: `npm pack @minecraft/server@<version>` and
   read `index.d.ts` — do not rely on memory or on this document.
2. Re-check every signature in section 2. Major bumps are explicitly allowed to
   break compatibility (see the Scripting V2 overview).
3. Update the manifest dependency, `min_engine_version`, and
   `ITEM_FORMAT_VERSION` in `tools/lib/project.mjs`.
4. Update `tests/mocks/minecraft_server.mjs` to match any changed shape — the
   mock is only as good as its fidelity to the real definitions.
5. Run `npm run all`, then re-run the in-game checklist in `docs/TESTING.md`.

---

## 6. Sources

- `@minecraft/server` 2.0.0 TypeScript definitions, npm registry.
- Minecraft Creator documentation: Scripting V2 overview, Introducing Custom
  Components, Item Components reference, individual item component pages
  (`minecraft:display_name`, `minecraft:damage`, `minecraft:enchantable`,
  `minecraft:glint`, `minecraft:swing_duration`), and the 1.21.90 and 1.26.0
  update notes.
