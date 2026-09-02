# Roadmap

Fifteen milestones from an empty repository to a finished add-on. The original
target was 20–25 swords; **the roster closed at sixteen in v0.12.0**, which is a
deliberate stop rather than a shortfall — see steps 9 and 10.

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

### Interlude — two client bug-fix rounds (v0.5.1, v0.5.2) — **done**
Not roadmap milestones; the roadmap stays at fifteen. The first real in-client
tests found that the swords registered into the wrong creative tab under a raw
translation key, and then that their abilities were invisible and silent. Both
rounds ended with the defect class turned into a build-time error, and both are
recorded in `CHANGELOG.md` and `docs/TESTING.md`.

The lesson worth carrying: **every identifier handed to Bedrock is only as good
as the catalogue it was checked against.** There are now three such catalogues —
effects, particles and sound events — and milestone 11 will add custom assets
behind the same gate.

### Interlude — Ember Blade finalization (v0.6.0) — **done**
Also not a roadmap milestone. The framework's diagnostic Test Blade became a
finished sword, taking the collection to eight shipped and none diagnostic.

It earned its place by exercising something new: Ember Blade is the first sword
whose damage comes from state carried *between* activations, which turned into a
reusable stacking-charge primitive on `PlayerStateStore` rather than bespoke
logic. That is the shape every content milestone below should take — a sword
that needs something new leaves a reusable capability behind.

### Interlude — Frost and Thunder finalized (v0.7.0) — **done**
Both shipped in step 5 but leaned on the generic `brand` ability. They now carry
mechanics of their own: Frost a chill-then-shatter sequence that reads the
*target's* state, Thunder a chain that arcs between entities. Each left a
reusable primitive behind — `effects.has`, `particles.line`,
`targeting.around`, and binding `label` — which is the pattern every content
step below should follow.

### Interlude — Shadow Sword (v0.8.0) — **done**
The ninth sword, and the first whose active does no meaningful damage. It
brought the framework its movement layer — destination validation, a distance
ceiling, and combo windows — which is most of what step 6 below was for. That
step is correspondingly smaller now: gravity and area denial rather than
teleportation from scratch.

### Interlude — crafting, and four swords finalized (v0.9.0) — **done**
The collection had nine swords and no way to obtain any of them outside
creative. Every sword is now craftable, with recipes generated from the sword
definitions and ingredients checked against Mojang's own item list.

Wind, Earth, Tidal and Nature also stopped sharing generic abilities: they carry
named identities now, and Nature gained a real one in `entangle`. That closes
the gap between the four swords built in step 5 and the benchmark set since.

**Milestone 12 shrinks accordingly** — crafting and survival acquisition were
most of its scope, so what remains there is the codex UI, loot tables and
trades.

### Interlude — Crystal and Void (v0.10.0) — **done**
Swords ten and eleven, and the first two that are not about hitting harder.
Crystal is the collection's first defensive sword: its active scales *up* with
the size of the crowd it is caught in, and its passive forms a guard only once
its wielder is losing. Void is the first sword that acts somewhere the wielder
is not — `rift` is the first consumer of the `point` targeting mode, which had
been sitting unused in `TargetingService` since step 4 — and its passive pays out
on how *empty* the target is rather than on how hard it was hit.

**Milestone 6 shrinks accordingly**: abilities that move entities rather than
the caster now exist (`rift` pulls a group toward a remote point), and `point`
targeting has a proven consumer. What remains there is genuinely block-aware
targeting and persistent area denial.

### 6. Ability library — spatial (planned)
Gravity manipulation, earthquakes and area denial. Teleportation and its safety
rules arrived early with Shadow Sword (`systems/movement.js`), and remote point
detonation with pull arrived with Void Sword (`abilities/builtin/rift.js`), so
what is left is block-aware targeting beyond the `point` mode and effects that
persist for a few seconds rather than resolving in one activation.

### Interlude — Solar, Gravity and Poison (v0.11.0) — **done**
Swords twelve through fourteen, and three axes the framework had never had.
Solar reads the **world** — the time of day and the dimension — which is the
first condition on a sword that is not about the caster, the target or the
fight. Gravity reads **altitude**, filling the collection's one obvious gap:
thirteen swords measured distance in a straight line and were all equally poor
against anything flying. Poison banks its resource **on the enemy**, storing the
count in the effect itself so there is no per-target map to leak.

The milestone also carried the performance pass the growing roster needed. It
found no duplicated queries — every entity search in the project still goes
through `systems/targeting.js`, at exactly two call sites — but five abilities
had each written their own guarded distance helper, so those were consolidated
into `abilities/support.js` with no behaviour change.

**Milestone 7 is complete**: swords 8 through 14 have all landed across the
interludes. What follows is the exotic ability library and the epic and
legendary tiers built on it.

### 7. Swords 8–14 — **done**
Delivered across the interludes above rather than as one step: Ember Blade
(v0.6.0), Shadow (v0.8.0), Crystal and Void (v0.10.0), Solar, Gravity and Poison
(v0.11.0). The one item it planned that has not happened is a sword binding
three or four activation methods at once — every sword so far binds exactly two,
and no design has yet needed a third. Carried into step 9 rather than invented
for its own sake.

### Interlude — Time and Storm, and the roster closes (v0.12.0) — **done**
Swords fifteen and sixteen, chosen as a pair: Time Freeze is worth more the
longer the sword has gone unused, and Storm Surge is worth nothing at all
standing still. The same question about time and motion, answered from both
ends, which is the right note to finish a collection on.

Time Sword is the collection's only **Mythic** — the tier existed in
`core/rarity.js` from v0.2.0 and had never been used.

The milestone also brought the **crafting-progression audit**: every ingredient
now carries an acquisition tier, every rarity a floor, and `npm run validate`
warns when a sword costs less than its rarity implies. It immediately caught
Storm Sword drafted as a Legendary on entirely tier-2 materials, which is why
Storm ships as an Epic.

**The roster is closed at sixteen.** The original plan said 20–25 and this is a
deliberate stop rather than a shortfall: every sword answers a question no other
one asks, and by sixteen the distinct axes were used up. Steps 9 and 10 below
are retired.

### 7b. Swords 15–16 — **done**
Time and Storm, delivered in the interlude above.

### Interlude — the final engineering pass (v1.0.0) — **done**
No new content. The last milestone of the plan was an audit, and the audit's
main finding was about the audits: several of the things this project believed
were checked were not being checked.

The ability parameter gate had read `sword.active` and `sword.passive` since
the binding shape changed — fields no definition has ever carried — so
twenty-five abilities' worth of constraints sat dead while every build reported
a clean pass. `CombatSystem.strike` read a target's position straight after the
blow that may have killed it, and the throw abandoned the rest of the sweep.

Both are now fixed and both are covered by tests that fail without the fix. The
more durable outcome is five new gates: a damage-cause catalogue, cross-binding
agreement on shared state, a world-mutation ban list, a per-activation particle
budget, and icon distinctness. Each closes a hole a green build could hide, and
three of them describe properties that were previously true only because
everyone kept being careful.

The balance pass found the cheapest sword in the collection out-damaging three
Legendaries, and the art pass found the two closest icons were a pair the brief
had specifically asked to keep apart. Both are corrected, and both are measured
on every build now rather than noticed by eye.

**This completes the fifteen-milestone plan.**

### 8. Ability library — exotic and ultimates (planned)
The **multi-stage pattern** — wind-up, then impact, with cancellation on death,
disconnect or dimension change. It is the one ability shape the framework still
cannot express: everything shipped resolves inside a single activation, and
Gravity Crush and Time Freeze both wanted a second stage and were written
without one rather than smuggling in per-tick state under a sword.

Shadow, light and time-based effects were absorbed by Shadow, Solar and Time
Swords; "meteors" arrived as Void Rift's remote point. What remains here is the
machinery, not the content.

### 9. ~~Swords 14–19~~ — **retired**
### 10. ~~Swords 20–25 and the mythic tier~~ — **retired**
The roster closed at sixteen in v0.12.0, and the mythic tier is spent on Time
Sword. Both steps are retired rather than unfinished: the collection's rule has
always been that a sword must answer a question no other sword asks, and by
sixteen the distinct axes — distance, angle, crowd size, caster health, target
health, target category, target mass, altitude, reach, world time, banked
charge, banked venom, waiting, and motion — were used up. A seventeenth sword
would have had to repeat one, and a repeated axis is a recolour with a different
particle.

Adding more later remains a one-file change if a genuinely new axis turns up.
That was always the point of the architecture; it is just not something to do
for its own sake.

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
