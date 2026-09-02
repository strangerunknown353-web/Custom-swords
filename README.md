# Custom Swords

A custom sword add-on for **Minecraft Bedrock Edition / MCPE**, built as a
reusable framework rather than a pile of one-off scripts. The finished add-on
will contain 20–25 swords with genuinely distinct powers, effects, particles,
sounds and cooldowns.

> **Status: v1.0.0 — sixteen swords, all craftable, all distinct.**
> Time ⏳ and Storm 🌩️ close out the roster, joining Solar ☀️, Gravity 🪐,
> Poison 🧪, Crystal 🔮, Void 🕳️, Shadow 🌑, Ember Blade 🔥 and the seven
> Elemental Collection blades: Inferno 🔥, Thunder ⚡, Frost ❄️, Wind 🌪️,
> Earth 🪨, Ocean 🌊 and Nature 🌿. See `SWORD_CATALOG.md` for the roster, its
> crafting progression and its output curve.
>
> v1.3.0 puts the swords back on the vanilla diagonal, keeping the proportions
> v1.2.0 earned: 67-80% blade, a crossguard wider than the blade on every one,
> and a grip and pommel that run down-left from the guard the way vanilla's do.
> v1.2.0 before it was the silhouette correction — the set before that measured
> 36-50% blade, so the handle was longer than the blade and the icons read as
> daggers. v1.0.0 was the
> > engineering pass — the
> build gates that were silently checking nothing now check, the collection is
> priced so the cheapest sword is not the strongest, and the properties this
> addon has always claimed (it never modifies the world, no two icons look
> alike, every damage cause is real) are gates instead of conventions.
> `CHANGELOG.md` has the list.
>
> **v0.5.2 was tested in Minecraft Bedrock and passed** — creative category,
> icon, name, rendering, attack animation, abilities, particles, sounds and
> cooldowns all confirmed working. That followed two failed client tests and two
> rounds of fixes, recorded honestly in `docs/TESTING.md`.
>
> **Everything after v0.5.2 — eleven of the sixteen swords, and every change in
> this release — has not been client-tested.** What has been done to it is
> automated: 543 unit tests against a mocked engine, and a validator that
> checks the packs, the data and the architecture. Neither is a substitute for
> launching the game, and this README will not pretend otherwise.

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
| `CustomSwords-v1.3.0.mcaddon` | import both packs at once — this is the one to test with |
| `CustomSwordsBP-v1.3.0.mcpack` | behaviour pack alone |
| `CustomSwordsRP-v1.3.0.mcpack` | resource pack alone |

Prefer not to build? `releases/CustomSwords-v1.3.0.mcaddon` is a committed copy
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
/give @s custom_swords:crystal_sword     hits harder the more of them there are
/give @s custom_swords:void_sword        tear a rift where you are looking
/give @s custom_swords:solar_sword       strong at noon, weak at night, no use in the Nether
/give @s custom_swords:gravity_sword     drags things down; hits airborne targets hardest
/give @s custom_swords:poison_sword      work venom into one target, then burst it
/give @s custom_swords:time_sword        worth more the longer you do not use it
/give @s custom_swords:storm_sword       worth nothing at all standing still
```

Every sword is craftable at a crafting table — `SWORD_CATALOG.md` shows each
recipe grid. To confirm the framework recognises a sword, run in game:

```
/scriptevent custom_swords:list        every registered sword and its stats
/scriptevent custom_swords:held        identify whatever is in your main hand
/scriptevent custom_swords:abilities   every ability and the swords using it
```

Every sword has an **active** on right-click and a **passive** that fires on a
melee hit. The Wind and Ocean swords run the *same* ability with different
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

- **No sword behaviour has ever been observed in Minecraft.** The one in-game
  test so far (v0.5.0) failed at item registration before any ability could be
  exercised. Every "Tested" cell in the sword test matrix is still empty. The
  code passes static validation and a full test suite against a *mocked*
  engine — v0.5.0 proved that is not the same as working.
- **Sixteen swords, and the roster is closed.** The original plan said 20–25;
  sixteen distinct designs is where the axes ran out. Every sword answers a
  question no other one asks — see the table in `ARCHITECTURE.md` §9 — and a
  seventeenth would have had to repeat one. Milestones 9 and 10 are retired
  rather than unfinished.
- **No custom particles or sounds.** Both services reference vanilla identifiers
  only; custom assets arrive in milestone 11.
- **No loot tables or trades.** Every sword is craftable at a table, but none
  appear in chests or villager trades yet — milestone 12.
- **`en_US` only.** The localisation plumbing exists; other languages do not.
- **In-memory state only.** Cooldowns and player state reset on world reload, by
  design; persistence is tracked in `TODO.md`.
- **No multi-stage abilities.** Wind-up → impact, and the cancellation that goes
  with it, is milestone 8. Everything resolves within a single tick today —
  including Void Rift, which opens and closes inside one activation.
- **No reactive abilities.** Bedrock gives an item custom component exactly two
  player-driven hooks, `onUse` and `onHitEntity`, so nothing can trigger on the
  wielder *being* hit without a world-wide damage listener the architecture
  deliberately refuses. Crystal Guard reads the wielder's health on the swing
  instead, which is the honest version of the same fantasy.
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
