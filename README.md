# Custom Swords

A custom sword add-on for **Minecraft Bedrock Edition / MCPE**, built as a
reusable framework rather than a pile of one-off scripts.

> **Status: v2.0.0 — 20 swords, 121 powers.**
> Every sword carries several powers you switch between by tapping crouch,
> each animated with its own particle effects, and every icon is a 32×32
> long sword. See `SWORD_CATALOG.md` for the full roster and `CHANGELOG.md`
> for everything new in 2.0.
>
> v2.0 passes the full automated suite (generate, validate, 450+ tests,
> build) but has **not yet been played in a Minecraft client** — see
> *Current limitations*.

## How to play

| Do this | While holding a Custom Sword |
|---|---|
| **Tap crouch** | Switch to the sword's next power. The bar above the hotbar shows `[2/5] Power - Ready` (or the seconds left). |
| **Use** (right-click / long-press) | Cast the selected power. |
| **Hit** something | The sword's passive triggers on every melee hit. |

- Holding crouch (to sneak along a ledge) does **not** switch — only a quick
  tap does. In creative flight, crouch means "fly down" and never switches.
- Each power has its own cooldown. When the power you have selected is ready
  again you hear a chime and see "*Power ready*".
- Each sword remembers which power you had selected, even after you leave
  and rejoin.
- More powers at higher rarity: Uncommon 3 · Rare 4 · Epic 5 · Legendary 6 ·
  Mythic 7 — plus one passive each.
- Every sword is crafted at a crafting table; recipes are in
  `SWORD_CATALOG.md`. Or, with cheats: `/give @s custom_swords:dragon_sword`.
- Powers hit mobs from other add-ons too, and never hurt players when the
  world's PvP setting is off.

| Rarity | Swords |
|---|---|
| Uncommon | Ember Blade |
| Rare | Frost, Wind, Nature, Poison, Soul |
| Epic | Inferno, Earth, Ocean, Shadow, Crystal, Gravity, Storm, Blood |
| Legendary | Thunder, Solar, Void, Echo |
| Mythic | Time, Dragon |

---

## Quick start

```bash
git clone <this repository>
cd Custom-swords
npm run all          # generate → validate → test → build
```

There is nothing to install. The project has **zero npm dependencies**; it needs
only Node 20+.

The build writes to `dist/`:

| File | Use |
|---|---|
| `CustomSwords-v2.0.0.mcaddon` | import both packs at once — this is the one to install |
| `CustomSwordsBP-v2.0.0.mcpack` | behaviour pack alone |
| `CustomSwordsRP-v2.0.0.mcpack` | resource pack alone |

Prefer not to build? `releases/CustomSwords-v0.9.0.mcaddon` is a committed copy
of the same file.

Open the `.mcaddon` on a device with Minecraft installed, create a world with
both packs enabled, then give yourself a sword and right-click:

```
/give @s custom_swords:ember_blade       fast ember burst; build heat by hitting things
/give @s custom_swords:inferno_sword     a burning arc
/give @s custom_swords:thunder_sword     a bolt that arcs between enemies
/give @s custom_swords:frost_sword       chill them, then shatter the chilled
/give @s custom_swords:wind_sword        scatters everything outward
/give @s custom_swords:earth_sword       a ground shock, heaviest melee
/give @s custom_swords:tidal_sword       a wave pushed forward
/give @s custom_swords:nature_sword      an execute, and it heals you
/give @s custom_swords:shadow_sword      dash through the dark, then hit hard
```

Every sword is craftable at a crafting table — `SWORD_CATALOG.md` shows each
recipe grid. To confirm the framework recognises a sword, run in game:

```
/scriptevent custom_swords:list        every registered sword and its stats
/scriptevent custom_swords:held        identify whatever is in your main hand
/scriptevent custom_swords:abilities   every ability and the swords using it
```

Every sword has an **active** on right-click and a **passive** that fires on a
melee hit. The Wind and Tidal swords run the *same* ability with different
data — one scatters targets outward, the other pushes them forward — which is
the framework's whole point.

Requires **Minecraft Bedrock 1.21.120 or newer** (raised in v0.5.2 for the
swing-animation component). No experimental toggles.

---

## Project layout

```
Custom-swords/
├── packs/
│   ├── CustomSwordsBP/            Behaviour pack: logic and item data
│   │   ├── manifest.json
│   │   ├── items/                 GENERATED item JSON — do not hand-edit
│   │   ├── texts/                 GENERATED pack name/description
│   │   └── scripts/
│   │       ├── main.js            Entry point named by the manifest
│   │       ├── config.js          Every global tunable, in one place
│   │       ├── core/              Identifiers, rarity, activation, registries,
│   │       │                       identification, stats, cooldowns, gate,
│   │       │                       executor, router, diagnostics, bootstrap
│   │       ├── systems/           Targeting, damage, effects, particles, sounds, feedback, combat
│   │       ├── abilities/         Reusable, parameterised powers
│   │       ├── swords/            Sword definitions — pure data, the source of truth
│   │       └── util/              Vector, numeric and tick helpers
│   └── CustomSwordsRP/            Resource pack: textures and text
│       ├── manifest.json
│       ├── textures/              GENERATED atlas + compiled sword icons
│       └── texts/                 GENERATED display names
├── art/swords/                    Sword texture sources, authored as text
├── tools/                         Dependency-free generator, validator, packager, version bump
├── tests/                         Node test suite + a mocked @minecraft/server
├── docs/                          Contributor guides and the API version contract
├── releases/                      Committed .mcaddon builds, for download without a toolchain
├── ARCHITECTURE.md                How it all fits together, and why
├── SWORD_CATALOG.md               GENERATED roster of every shipped sword
├── ROADMAP.md                     The 15-milestone plan
├── TODO.md                        Open work
└── CHANGELOG.md
```

Anything marked GENERATED is derived from `scripts/swords/*.js` by
`tools/generate.mjs`. Edit the definitions, then run `npm run generate`.

---

## Commands

| Command | What it does |
|---|---|
| `npm run generate` | rebuild item JSON, texture atlas, compiled PNGs and `.lang` from the sword definitions |
| `npm run validate` | check manifests, UUIDs, JSON, cross-references and architecture rules |
| `npm test` | 405 unit and integration tests against a mocked engine |
| `npm run build` | package `.mcaddon` and `.mcpack` files into `dist/` |
| `npm run catalog` | regenerate `SWORD_CATALOG.md` from the sword definitions |
| `npm run check` | generate + validate + catalog check + test |
| `npm run all` | check + build |
| `npm run version:set -- 0.6.0` | bump the version everywhere it appears |

---

## Adding a sword

See **`docs/ADDING_A_SWORD.md`**. The short version: write one data file and one
texture source, export the sword from `swords/index.js`, run `npm run all`. Item
JSON, the texture atlas entry, the compiled PNG, the localised name and the
catalogue entry are all generated for you — the two things you must author
yourself are the behaviour data and the art, and the build fails if the art does
not meet `docs/TEXTURE_STANDARD.md`.

---

## Current limitations

Stated plainly:

- **v2.0 has not been played in a client yet.** Everything passes static
  validation and a full test suite against a *mocked* engine; v0.5.0 proved
  that is not the same as working. The parts most worth checking in game:
  tap-crouch switching, the leap and beam powers, how busy the animations
  look, and the new 32×32 icons in the hand.
- **Requires Minecraft 1.21.120 or newer** — each sword's swing speed uses a
  component that does not exist earlier. See `docs/API_NOTES.md`.
- **Balance is reasoned, not playtested.** Damage rises with rarity and the
  outliers were trimmed, but real fights will show what needs tuning.
- **Vanilla particles and sounds only.** The animations are built from
  vanilla particle effects; there are no custom particle or sound files.
- **No loot tables or trades.** Swords are crafted, not found.
- **`en_US` only.**
- **No tooltip flavour text.** Bedrock has no item-JSON lore component; a
  sword's description is reachable through `/scriptevent custom_swords:info`.

---

## Documentation

| Document | Contents |
|---|---|
| `ARCHITECTURE.md` | layers, data flow, design decisions, multiplayer and performance guarantees |
| `ROADMAP.md` | the 15 milestones |
| `TODO.md` | open work, grouped by urgency |
| `CHANGELOG.md` | released changes |
| `SWORD_CATALOG.md` | every shipped sword, its stats and its abilities (generated) |
| `docs/ADDING_A_SWORD.md` | the full process for a new sword or ability |
| `docs/TESTING.md` | automated checks and the in-game checklist |
| `docs/TEXTURE_STANDARD.md` | the permanent texture rule, the quality bar and the automated gate |
| `docs/API_NOTES.md` | every engine API used, where it was verified, and the version contract |

---

## Licence

MIT.
