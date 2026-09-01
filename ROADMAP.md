# Roadmap

Fifteen milestones from an empty repository to a finished 20–25 sword add-on.

The plan is re-balanced as milestones land, but the total stays at fifteen.
Milestone 2 was originally "sword framework hardening"; delivering it showed the
ability work deserved its own step, so the Ability Engine became step 3 and the
two asset milestones were merged into step 11. Milestone 3 then absorbed the
texture standard, and the combat/safety layer was promoted to step 4 — it is the
foundation the whole collection leans on, and it is cheaper to build before
twenty-five swords depend on it than after. Milestone 5 then delivered seven
swords rather than the four elemental abilities originally planned, because
step 4's combat layer already covered the ability work; Phase 2's remaining
content steps were rebalanced accordingly, still five of them.

Every milestone ends with a `.mcaddon` that can be imported and played. A
milestone is marked **done** when its code is complete and every automated check
passes; where in-client verification is still outstanding, `docs/TESTING.md`
says so explicitly rather than the roadmap implying otherwise.

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
same block (superseded by the combat system in step 4). One real ability, bound twice on one sword to prove the envelope
drives behaviour. Also establishes the project's permanent premium texture
standard, its authored-as-text pipeline and its automated quality gate.

### 4. Combat, damage, targeting and safety layer — **done**
The layer everything else leans on, hardened before the collection arrived: a
central combat system with one fixed ordering for every damaging ability, a
seven-step damage validation chain that names its refusals, six targeting modes
including block-aware `point`, reusable target categories built on verified
vanilla type families, self-damage protection on by default, clamped knockback
with `away` / `forward` modes, an AoE framework, per-player rate limiting, and
two-layer hit protection so nothing can be damaged twice by one activation. Six
built-in abilities exercise it; an edge-case suite proves the refusals.

### 5. Elemental Collection — swords 1–7 — **done**
The first shipped swords: Inferno, Thunder, Frost, Wind, Earth, Tidal and
Nature. Each has its own gameplay identity, rarity, balance point, hand-authored
texture, particles and sounds — and every one is data bound to abilities that
already existed. Exactly one new ability (`cleave`) was needed, which is the
result the framework was built for. Published as `SWORD_CATALOG.md`, generated
from the definitions so it cannot drift.

---

## Phase 2 — Content

### 5a. Item-registration fix (v0.5.1) — **done**
Not a milestone; an unplanned bug fix between 5 and 6. The first in-game test
found the swords registering but not integrating — wrong creative tab, raw
translation key for a name. Both were generated-content defects that every
automated check had passed. Fixed, with contract tests against the real
generated files and three new validator checks so the class cannot recur.
Milestone 6 does not start until the fix is confirmed in a client.

### 6. Ability library — spatial (planned)
Teleportation, gravity manipulation, earthquakes and area denial. Introduces
block-aware targeting beyond the `point` mode already shipped, and the safety
rules that go with moving players and entities around.

### 7. Swords 8–13 (planned)
The forged and mystic tiers, leaning on the spatial library. First swords
carrying three or four activation methods at once, which stress-tests whether
the activation fallback rules hold up under real bindings.

### 8. Ability library — exotic and ultimates (planned)
Life steal, shadow and light, time-based effects, meteors, and the multi-stage
pattern (wind-up → impact) with cancellation on death, disconnect or dimension
change. The first abilities that need state to survive across ticks.

### 9. Swords 14–19 (planned)
The epic and legendary tiers, built on the exotic library.

### 10. Swords 20–25 and the mythic tier (planned)
Genuinely climactic ultimates. Completes the collection at 25 swords.

---

## Phase 3 — Presentation

### 11. Assets: attachables, particles and sound (planned)
Icons are already authored per sword under the permanent texture standard, so
this milestone covers what is left: attachables and geometry for swords that
should not render as flat sprites, resource-pack particle definitions, and
custom `.ogg` audio — all swapped in behind the existing `ParticleService` /
`SoundService` presets so no ability code changes.

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
4. be tested in a real Minecraft client, with results recorded honestly in
   `docs/TESTING.md` — including "not yet tested" where that is the truth;
5. update `CHANGELOG.md`, and `ARCHITECTURE.md` if the design moved.
