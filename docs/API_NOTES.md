# API notes and version contract

This project's rule is: **never invent an API.** Everything below was verified
against a primary source before it was used. This file records what was
verified, where, and what a version change would cost.

Verified on **2026-09-01** (milestone 1), extended for milestones 2 and 3.

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
| `Dimension.getBlockFromRay` | `(location, direction, options?: BlockRaycastOptions) => BlockRaycastHit \| undefined` — **returns `undefined` in open air**, which is the normal case for a skyward aim, not an error |
| `Entity.getComponent('minecraft:type_family')` | `EntityTypeFamilyComponent` — `getTypeFamilies(): string[]`, `hasTypeFamily(f): boolean` |
| `EntityQueryOptions.families` | `string[]` — **AND semantics**, see below |
| `Entity.matches` | `(options: EntityQueryOptions) => boolean` — the same filter language applied to one entity |

**`EntityQueryOptions.families` is AND, not OR.** An entity must belong to
*every* family listed, so `families: ['monster', 'animal']` matches nothing at
all rather than "monsters or animals". `core/target_categories.js` therefore
pushes at most **one** category down to the engine query and returns `{}` for a
union, applying the union in script via `matchesCategories`. Getting this
backwards produces an ability that silently never hits anything — the failure
mode is an empty result, not an exception, which is why it is documented here
rather than left to be rediscovered.

**Vanilla type families used**, all verified against the vanilla entity
definitions rather than assumed:

| Category | `minecraft:type_family` |
|---|---|
| `mob` | `mob` |
| `hostile` | `monster` |
| `passive` | `animal` |
| `player` | `player` |
| `undead` | `undead` |
| `arthropod` | `arthropod` |
| `any` | — no family filter |

### Diagnostics

| API | Signature |
|---|---|
| `system.afterEvents.scriptEventReceive` | `subscribe(callback, options?: ScriptEventMessageFilterOptions)` — the options object takes `namespaces: string[]`, which is what keeps our handler off other add-ons' script events |
| `ScriptEventCommandMessageAfterEvent` | `id`, `message`, `sourceEntity?`, `sourceBlock?`, `sourceType`, `initiator?` |
| `Player.sendMessage` | `(message: RawMessage \| string \| (…)[]) => void` |

### Ability Engine

| API | Signature | Used for |
|---|---|---|
| `Player.isSneaking` | `boolean` property | resolving `sneak_use` / `sneak_attack` |
| `Player.isOnGround` | `boolean` property | the `requireGrounded` restriction |
| `Player.isInWater` | `boolean` property | the `forbidInWater` restriction |
| `Entity.getComponent('minecraft:health')` | `EntityHealthComponent` — `currentValue`, `effectiveMax`, `setCurrentValue(v)` | the `minHealth` restriction, and `effects.heal` |
| `Entity.setOnFire` | `(seconds: number, useEffects?: boolean) => boolean` | `effects.ignite` |
| `Entity.extinguishFire` | `(useEffects?: boolean) => boolean` | `effects.extinguish` |
| `Entity.teleport` | `(location: Vector3, options?: TeleportOptions)` — options `{ checkForBlocks?, dimension?, facingLocation?, keepVelocity? }` | `effects.teleport` |
| `Entity.applyImpulse` | `(vector: Vector3) => void` | `effects.impulse` — **throws on Players**, see below |
| `world.afterEvents.entityDie` | `subscribe(cb, options?: EntityEventOptions)`; options take `entityTypes: string[]`; event has `deadEntity`, `damageSource` | clearing life-scoped state |
| `world.afterEvents.playerSpawn` | event has `player`, `initialSpawn` | respawn cleanup |

**`applyImpulse` throws on Players.** The type definitions state it plainly:
"this method throws an error if called on Players and will have no impact."
`EffectService.impulse` therefore routes players to `applyKnockback`, which is
the supported equivalent, so callers get one method that works on anything. This
is engine behaviour, not a bug to work around.

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

### Verified the hard way — the v0.5.0 item-registration bugs

Both of these were found by an actual in-game test, not by any check in this
repository. They are recorded here because both are cases where the *obvious*
form is the wrong one.

| Thing | Wrong (shipped in v0.5.0) | Correct | Why the wrong one is tempting |
|---|---|---|---|
| Creative group | `"itemGroup.name.sword"` | `"minecraft:itemGroup.name.sword"` | Microsoft's own custom-item tutorial uses the unnamespaced form (at format_version 1.20.60 / 1.21.30). The current Bedrock Wiki group list, up to date as of Preview 1.26.30, namespaces every entry, and 1.26.20 tightened validation of the description block. |
| Item name key | `item.<ns>:<id>.name` | `item.<ns>:<id>` | Every *vanilla* item uses `item.<name>.name` — `item.apple.name`, `item.breeze_rod.name` — and Microsoft's `minecraft:display_name` reference lists only vanilla examples. Vanilla items are not namespaced; a namespaced custom item's generated key has no `.name` suffix. |

Sources: Microsoft Learn *How to Add Custom Items* and the `minecraft:display_name`
/ `minecraft:icon` component references; Bedrock Wiki *Create a Custom Item*,
*Custom Weapons* and *Vanilla Item Groups*.

Two consequences worth keeping:

- **A missing `menu_category` does not fail.** It silently defaults to the Items
  tab. Silence is the failure mode, so the validator treats it as an error.
- **An unresolved translation key does not fail either.** Minecraft prints the
  key. Any tooltip that looks like an identifier means a lang key that nothing
  defines — and it will look exactly like a partially-registered item.

### Confirmed correct, and re-verified during that investigation

| Thing | Form used here | Note |
|---|---|---|
| `minecraft:icon` | `{ "textures": { "default": "<shortname>" } }` | Current. The singular `"texture"` form is documented as "Deprecated - no longer in use". Microsoft's custom-chestplate tutorial uses `textures.default` for an ordinary (non-bundle) item. |
| `item_texture.json` path | `textures/items/.../<name>` | No `.png` extension. |
| Custom component | `"custom_swords:sword": {}` flattened into `components` | Custom Components V2; the `minecraft:custom_components` array is deprecated. |

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

## 3a. The vanilla effect catalogue

`core/effect_catalogue.js` lists all **37** vanilla status effects. They were
transcribed from the `MinecraftEffectTypes` enum in `@minecraft/vanilla-data`
**1.26.44**, not written from memory, and the module carries that provenance in
its header.

The reason it exists: `Entity.addEffect` with an unknown effect id fails at
runtime, inside an event handler, on a player's machine. Validating against a
transcribed list moves that failure to startup, where `definition_validator.js`
can name the sword, the binding and the nearest real effect ("did you mean
`mining_fatigue`?"). The catalogue is data the framework never calls into the
engine to obtain, so it costs nothing at runtime.

The trade-off is that the list is a snapshot: an effect added in a later
Minecraft release will be rejected until the catalogue is updated. That is the
right direction to fail — a rejected new effect is a build error with a clear
message; an accepted typo is a silent no-op in someone's world.

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
- `@minecraft/vanilla-data` 1.26.44, npm registry — source of the effect
  catalogue and the vanilla type-family names.
- Minecraft Creator documentation: Scripting V2 overview, Introducing Custom
  Components, Item Components reference, individual item component pages
  (`minecraft:display_name`, `minecraft:damage`, `minecraft:enchantable`,
  `minecraft:glint`, `minecraft:swing_duration`), and the 1.21.90 and 1.26.0
  update notes.
