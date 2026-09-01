# Custom Swords

A custom sword add-on for **Minecraft Bedrock Edition / MCPE**, built as a
reusable framework rather than a pile of one-off scripts. The finished add-on
will contain 20–25 swords with genuinely distinct powers, effects, particles,
sounds and cooldowns.

> **Status: v0.6.0 — eight swords, and the first green client test.**
> Ember Blade 🔥 joins the seven Elemental Collection blades: Inferno 🔥,
> Thunder ⚡, Frost ❄️, Wind 🌪️, Earth 🪨, Tidal 🌊 and Nature 🌿. See
> `SWORD_CATALOG.md` for the roster and `ROADMAP.md` for what comes next.
>
> **v0.5.2 was tested in Minecraft Bedrock and passed** — creative category,
> icon, name, rendering, attack animation, abilities, particles, sounds and
> cooldowns all confirmed working. That followed two failed client tests and two
> rounds of fixes, recorded honestly in `docs/TESTING.md`.
>
> Ember Blade itself has **not** been client-tested yet.

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
| `CustomSwords-v0.6.0.mcaddon` | import both packs at once — this is the one to test with |
| `CustomSwordsBP-v0.6.0.mcpack` | behaviour pack alone |
| `CustomSwordsRP-v0.6.0.mcpack` | resource pack alone |

Prefer not to build? `releases/CustomSwords-v0.6.0.mcaddon` is a committed copy
of the same file.

Open the `.mcaddon` on a device with Minecraft installed, create a world with
both packs enabled, then give yourself a sword and right-click:

```
/give @s custom_swords:ember_blade       fast ember burst; build heat by hitting things
/give @s custom_swords:inferno_sword     a burning arc
/give @s custom_swords:thunder_sword     a bolt where you are looking
/give @s custom_swords:frost_sword       slowness and mining fatigue
/give @s custom_swords:wind_sword        scatters everything outward
/give @s custom_swords:earth_sword       a ground shock, heaviest melee
/give @s custom_swords:tidal_sword       a wave pushed forward
/give @s custom_swords:nature_sword      an execute, and it heals you
```

To confirm the framework recognises it, run in game:

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
| `npm test` | 359 unit and integration tests against a mocked engine |
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

- **No sword behaviour has ever been observed in Minecraft.** The one in-game
  test so far (v0.5.0) failed at item registration before any ability could be
  exercised. Every "Tested" cell in the sword test matrix is still empty. The
  code passes static validation and a full test suite against a *mocked*
  engine — v0.5.0 proved that is not the same as working.
- **8 of 20–25 swords.** The remaining 12–17 arrive in milestones 7, 9 and 10.
- **No custom particles or sounds.** Both services reference vanilla identifiers
  only; custom assets arrive in milestone 11.
- **No crafting, loot or trades.** The swords are creative/`/give` only so far.
- **`en_US` only.** The localisation plumbing exists; other languages do not.
- **In-memory state only.** Cooldowns and player state reset on world reload, by
  design; persistence is tracked in `TODO.md`.
- **No multi-stage abilities.** Wind-up → impact, and the cancellation that goes
  with it, is milestone 8. Everything resolves within a single tick today.
- **No tooltip flavour text.** Bedrock has no item-JSON lore component; a
  sword's description is reachable through `/scriptevent custom_swords:info` but
  not the vanilla tooltip. See `TODO.md`.
- **Balance is unplayed.** The progression in `SWORD_CATALOG.md` is reasoned,
  not tuned; milestone 13 is the pass that fixes that.

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
