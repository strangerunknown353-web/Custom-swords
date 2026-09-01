# Roadmap

Fifteen milestones from an empty repository to a finished 20–25 sword add-on.

Milestone 2 was originally scoped as "sword framework hardening"; delivering it
made clear that the ability work it assumed deserved a milestone of its own, so
the Ability Engine is now step 3 and the two asset milestones (art, then
particles and sound) were merged into step 11, keeping the total at fifteen.
Every milestone ends with a `.mcaddon` that can be imported and played; nothing
is "done" until it has been tested in a real game.

Status legend: **done** · *in progress* · (planned)

---

## Phase 1 — Foundation

### 1. Project foundation, architecture and master plan — **done**
Directory structure, behaviour and resource pack manifests, Scripting V2
bootstrap, registries, cooldown manager, player state, ability executor, input
router, the seven systems, the build/validate/test toolchain, and one diagnostic
sword to prove the pipeline loads. No shipped swords yet.

### 2. Core sword framework — **done**
The reusable foundation the collection is built on: a Sword Registry as the
central source of truth, a fail-safe item identification system, single-sourced
identifier and rarity conventions, resolved sword stats, and a declarative
ability envelope (targeting, effects, particles, sounds) that turns one ability
into many distinct swords. Plus in-game diagnostics so the registry's view is
observable in a real world. Still one diagnostic sword and one ability.

### 3. Ability Engine (planned)
The reusable engine the envelope was designed for: an ability composition
helper, multi-stage abilities (wind-up → impact) with cancellation, a second
trigger (sneak-use) and dual active slots, and ability-level cost and condition
checks. Two or three real abilities as vertical slices — no sword collection
yet.

### 4. Ability library, part one — elemental (planned)
Fire, ice, lightning and wind as reusable, parameterised abilities. Establishes
the composition patterns (damage-over-time, status application, area shapes,
projectile-like ranged hits) that the rest of the library builds on.

---

## Phase 2 — Content

### 5. Swords 1–5 (planned)
The first shipped tier. Common through rare. Focus on making them feel distinct
using only the Phase 1 primitives, which stress-tests whether the abstraction is
actually general.

### 6. Ability library, part two — spatial (planned)
Teleportation, gravity manipulation, earthquake / shockwave, area denial.
Introduces block-aware targeting and the safety rules that go with it.

### 7. Swords 6–12 (planned)
Mid tier. First swords with both an active and a passive ability.

### 8. Ability library, part three — exotic (planned)
Life steal, shadow effects, time-based effects, meteors, ultimates. Introduces
multi-stage abilities (wind-up → impact) built on `system.runTimeout` rather
than intervals.

### 9. Swords 13–20 (planned)
Epic and legendary tiers.

### 10. Swords 21–25 and the ultimate tier (planned)
Mythic swords with genuinely climactic abilities. Completes the collection.

---

## Phase 3 — Presentation

### 11. Assets: art, particles and sound (planned)
Replace every generated placeholder icon with real 16×16 art, and add
attachables and geometry for swords that should not render as flat sprites.
Then resource-pack particle definitions and custom `.ogg` audio, swapped in
behind the existing `ParticleService` / `SoundService` presets so no ability
code changes. These are one milestone because they are the same job — replacing
generated stand-ins with authored assets — against the same interfaces.

### 12. UI, discovery and progression (planned)
`@minecraft/server-ui` codex listing every sword and its abilities, plus
crafting recipes, loot-table integration and trades so the swords are obtainable
in survival.

---

## Phase 4 — Polish

### 13. Balance pass (planned)
Damage, durability, cooldown and rarity tuning across all 25 swords. Config
switches for server operators.

### 14. Multiplayer and performance validation (planned)
Dedicated-server testing with several players using different swords
simultaneously; profiling on low-end devices; hardening anything the foundation
rules did not already cover.

### 15. Release (planned)
Full localisation, documentation for players, installation guide, changelog
finalisation and a tagged 1.0.0 release build.

---

## Invariants for every milestone

Each milestone must, before it is considered complete:

1. keep `npm run all` green — generate, validate, test, build;
2. add tests for whatever it introduced;
3. produce an importable `.mcaddon`;
4. be tested in a real Minecraft client, with results recorded;
5. update `CHANGELOG.md`, and `ARCHITECTURE.md` if the design moved.
