# Roadmap

Fifteen milestones from an empty repository to a finished 20–25 sword add-on.

The plan is re-balanced as milestones land, but the total stays at fifteen.
Milestone 2 was originally "sword framework hardening"; delivering it showed the
ability work deserved its own step, so the Ability Engine became step 3 and the
two asset milestones were merged into step 11. Milestone 3 then absorbed the
texture standard, and the combat/safety layer was promoted to step 4 — it is the
foundation the whole collection leans on, and it is cheaper to build before
twenty-five swords depend on it than after.
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

### 3. Ability Engine and texture standard — **done**
The reusable engine: an activation system covering four player inputs, a
dedicated Ability Registry with a sword reverse-index, an ordered validation
gate with declarative restrictions, life-scoped player state cleared on death,
extended effect helpers, and an outcome composer so abilities stop retyping the
same block. One real ability, bound twice on one sword to prove the envelope
drives behaviour. Also establishes the project's permanent premium texture
standard, its authored-as-text pipeline and its automated quality gate.

### 4. Combat, damage and safety layer (planned)
Harden the layer everything else will lean on before the collection arrives:
crit windows and combo tracking on melee activations, damage attribution and
resistance handling, friendly-fire and team rules, projectile-like ranged hits,
and multi-stage abilities (wind-up → impact) with cancellation on death,
disconnect or dimension change. Plus the safety work that only matters at scale:
target-count budgets under load, and per-player rate limiting.

---

## Phase 2 — Content

### 5. Ability library — elemental (planned)
Fire, ice, lightning and wind as reusable, parameterised abilities, each with
its own authored texture theme. Establishes the composition patterns
(damage-over-time, status application, area shapes, ranged hits) that the rest
of the library builds on.

### 6. Swords 1–5 (planned)
The first shipped tier, common through rare. Focus on making them feel distinct
using only existing primitives, which stress-tests whether the abstraction is
actually general. Every sword ships a finished texture.

### 7. Ability library — spatial (planned)
Teleportation, gravity manipulation, earthquake, area denial. Introduces
block-aware targeting and the safety rules that go with it.

### 8. Swords 6–12 (planned)
Mid tier. First swords carrying three or four activation methods at once.

### 9. Ability library — exotic, and swords 13–20 (planned)
Life steal, shadow effects, time-based effects, meteors and ultimates, plus the
epic and legendary tiers that use them.

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
