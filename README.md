# Custom Swords

A custom sword add-on for **Minecraft Bedrock Edition / MCPE**, built as a
reusable framework rather than a pile of one-off scripts. The finished add-on
will contain 20–25 swords with genuinely distinct powers, effects, particles,
sounds and cooldowns.

> **Status: v0.2.0 — core sword framework.**
> This release contains the reusable framework, the toolchain and **one
> diagnostic sword** used to verify it. It contains **none** of the final 20–25
> swords. See `ROADMAP.md`.

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
| `CustomSwords-v0.2.0.mcaddon` | import both packs at once — this is the one to test with |
| `CustomSwordsBP-v0.2.0.mcpack` | behaviour pack alone |
| `CustomSwordsRP-v0.2.0.mcpack` | resource pack alone |

Prefer not to build? `releases/CustomSwords-v0.2.0.mcaddon` is a committed copy
of the same file.

Open the `.mcaddon` on a device with Minecraft installed, create a world with
both packs enabled, then `/give @s custom_swords:test_blade` and right-click.

To confirm the framework recognises it, run in game:

```
/scriptevent custom_swords:list     every registered sword and its stats
/scriptevent custom_swords:held     identify whatever is in your main hand
```

Requires **Minecraft Bedrock 1.21.90 or newer**. No experimental toggles.

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
│   │       ├── core/              Identifiers, rarity, registry, identification, stats,
│   │       │                       cooldowns, executor, router, diagnostics, bootstrap
│   │       ├── systems/           Targeting, damage, effects, particles, sounds, feedback, combat
│   │       ├── abilities/         Reusable, parameterised powers
│   │       ├── swords/            Sword definitions — pure data, the source of truth
│   │       └── util/              Vector, numeric and tick helpers
│   └── CustomSwordsRP/            Resource pack: textures and text
│       ├── manifest.json
│       ├── textures/              GENERATED atlas + placeholder icons
│       └── texts/                 GENERATED display names
├── tools/                         Dependency-free generator, validator, packager, version bump
├── tests/                         Node test suite + a mocked @minecraft/server
├── docs/                          Contributor guides and the API version contract
├── releases/                      Committed .mcaddon builds, for download without a toolchain
├── ARCHITECTURE.md                How it all fits together, and why
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
| `npm run generate` | rebuild item JSON, texture atlas, `.lang` and placeholder art from the sword definitions |
| `npm run validate` | check manifests, UUIDs, JSON, cross-references and architecture rules |
| `npm test` | 173 unit and integration tests against a mocked engine |
| `npm run build` | package `.mcaddon` and `.mcpack` files into `dist/` |
| `npm run check` | generate + validate + test |
| `npm run all` | check + build |
| `npm run version:set -- 0.2.0` | bump the version everywhere it appears |

---

## Adding a sword

See **`docs/ADDING_A_SWORD.md`**. The short version: write one data file, export
it from `swords/index.js`, run `npm run all`. Item JSON, the texture atlas
entry, the localised name and a placeholder icon are all generated for you.

---

## Current limitations

Stated plainly, because this is a foundation release:

- **Not tested inside Minecraft.** Everything below the line in
  `docs/TESTING.md` is unchecked. The code passes static validation and a full
  test suite against a *mocked* engine — that is not the same as running.
- **No shipped swords.** `custom_swords:test_blade` is a diagnostic item marked
  `isTestItem: true`. It stays as the framework's own test fixture and will be
  debug-gated before release.
- **One ability.** `diagnostic_pulse` exists to exercise the pipeline, not to be
  played. The reusable Ability Engine is milestone 3.
- **Placeholder art only.** Icons are generated 16×16 stencils.
- **No custom particles or sounds.** Both services reference vanilla identifiers
  only; custom assets arrive in milestone 11.
- **No crafting, loot or trades.** The swords are creative/`/give` only so far.
- **`en_US` only.** The localisation plumbing exists; other languages do not.
- **In-memory state only.** Cooldowns and player state reset on world reload, by
  design; persistence is tracked in `TODO.md`.
- **Single active trigger.** Sneak-use and dual abilities are milestone 3.
- **No tooltip flavour text.** Bedrock has no item-JSON lore component; a
  sword's description is reachable through `/scriptevent custom_swords:info` but
  not the vanilla tooltip. See `TODO.md`.

---

## Documentation

| Document | Contents |
|---|---|
| `ARCHITECTURE.md` | layers, data flow, design decisions, multiplayer and performance guarantees |
| `ROADMAP.md` | the 15 milestones |
| `TODO.md` | open work, grouped by urgency |
| `CHANGELOG.md` | released changes |
| `docs/ADDING_A_SWORD.md` | the full process for a new sword or ability |
| `docs/TESTING.md` | automated checks and the in-game checklist |
| `docs/API_NOTES.md` | every engine API used, where it was verified, and the version contract |

---

## Licence

MIT.
