# Adding a sword

This is the whole process. If it ever takes more than these steps, the
framework has a gap — file it in `TODO.md` rather than working around it.

---

## 1. Write the definition

Create `packs/CustomSwordsBP/scripts/swords/<name>.js`:

```js
/**
 * Emberfang — sets its target alight and pulses flame on use.
 *
 * @type {import('../core/types.js').SwordDefinition}
 */
export const emberfang = {
    // --- Identity ---------------------------------------------------------
    id: 'custom_swords:emberfang',        // namespace:local_name, always ours
    name: 'Emberfang',
    rarity: 'rare',                       // one of the six tiers
    description: 'A blade that never cooled.',
    texture: 'emberfang',                 // optional; defaults to the id's local part

    // --- Vanilla item statistics ------------------------------------------
    item: {
        attackDamage: 8,                  // -> minecraft:damage (9 effective melee)
        durability: 900,
        enchantValue: 14,                 // omit to make the sword unenchantable
        repairItems: ['minecraft:blaze_rod'],
    },

    // --- Abilities: one binding per activation method ----------------------
    abilities: [
        {
            activation: 'use',            // right-click / long-press
            abilityId: 'custom_swords:flame_nova',
            cooldownTicks: 140,           // 7 seconds
            hudCategory: 'custom_swords_emberfang',

            targeting: { type: 'area', range: 5, maxTargets: 10 },
            effects: [{ effect: 'weakness', durationTicks: 80 }],
            particles: [{ id: 'minecraft:basic_flame_particle', count: 16, at: 'caster' }],
            sounds: { cast: 'ability_cast', impact: 'impact_heavy' },

            params: { damage: 6, igniteSeconds: 4 },   // numbers only the ability understands
        },
        {
            activation: 'sneak_use',      // the SAME ability, aimed
            abilityId: 'custom_swords:flame_nova',
            cooldownTicks: 200,

            targeting: { type: 'single', range: 8 },
            restrictions: { requireGrounded: true, minHealth: 6 },

            params: { damage: 14, igniteSeconds: 8 },
        },
    ],
};
```

### The envelope is the point

`targeting`, `allowedTargets`, `knockback`, `effects`, `particles`, `sounds`
and `restrictions` are the *invocation envelope*. Binding the same ability twice with different envelopes
gives you two attacks that feel genuinely different, with no new code — exactly
as above: a crowd-clearing burst on `use`, a committed aimed strike on
`sneak_use`.

`params` is reserved for numbers only the ability itself understands. Anything
the framework can interpret belongs in a typed field, where `npm run validate`
checks it at build time — a targeting block missing its `range` fails the build,
whereas the same mistake hidden in `params` would ship as an ability that
silently does nothing.

### Every sword needs a recipe

This is a permanent project rule, enforced by `npm run validate`: a sword with
no `recipe` fails the build.

```js
recipe: {
    pattern: [' X ', ' X ', ' I '],       // 1-3 rows, 1-3 wide, space = empty
    key: { X: 'minecraft:copper_ingot', I: 'minecraft:blaze_rod' },
    unlockedBy: 'minecraft:blaze_rod',    // optional; reveals it in the recipe book
},
```

`tools/generate.mjs` compiles that into `recipes/<name>.recipe.json`. Never
hand-write the JSON — it is build output.

Two rules that are not stylistic:

- **Every ingredient must be a real vanilla item**, checked against
  `tools/data/vanilla_items.json`. A recipe naming an item that does not exist
  does **not** error; it silently never registers, and the only symptom is a
  player who cannot craft the sword.
- **Build the recipe around the sword's own `repairItems[0]`** where it makes
  sense, so the material that mends a blade is the material it is made from.
  Scale the rest of the cost with rarity.

### Presentation: pick a visual profile

Do not write particle ids and sound names into a binding by hand. Name a
profile:

```js
visual: 'fire',        // fire | storm | frost | gale | stone | tide | grove | ember
                       // shadow | crystal | void | solar | gravity | venom | arcane
```

That supplies the caster particle, the target particle, the trail used for arcs
and rings, and the cast and impact sounds — all from
`core/visual_profiles.js`. Anything the binding states explicitly still wins, so
overriding one slot does not cost you the rest.

Two rules, and they are not stylistic:

- **Every particle identifier must be in `core/particle_catalogue.js`.** Bedrock
  has two ways to fail here and neither throws: an identifier that does not
  exist renders nothing, and one authored for a host entity logs errors instead
  of rendering. The validator rejects both and names the sibling that works.
- **Every sound must be a `SOUND_LIBRARY` preset.** `playSound` with an unknown
  id is silent. If you need a vanilla sound the library does not cover, add it
  to `SOUND_LIBRARY` — the validator then checks it against the real vanilla
  sound event list.

Adding a new theme means adding a profile, not editing seven swords.

### Reading how hurt something is

`services.effects.healthFraction(entity)` returns 1 at full health down to 0 at
death, for the caster or for a target, and never throws:

```js
// A passive that only pays off once its wielder is in trouble:
if (services.effects.healthFraction(ctx.player) > params.guardThreshold) {
    return { ok: true, message: 'strike' };
}

// A passive that pays out most against what is nearly gone. Read BEFORE the
// strike, so the ability's own damage cannot inflate its own payout:
const fraction = services.effects.healthFraction(target);
```

An unreadable entity reports **1 — unhurt**, which is deliberate: both shipped
consumers only grant something *below* a threshold, so failing to 1 withholds
the benefit rather than handing it out for free. If you write a mechanic that
pays out *above* a threshold, invert your own default rather than changing this
one.

### Reading the world

`services.environment` answers questions about the world rather than about an
entity — currently one:

```js
// 1 at noon, easing to 0 across the night; 0 in the Nether and the End
// whatever the clock says.
const sun = services.environment.daylight(ctx.dimension);
const damage = params.nightDamage + params.sunBonus * sun;
```

Two rules, both learned from Solar Sword:

- **Pass the dimension.** `daylight()` without it ignores the dimension check,
  which is almost never what you want — a sun-powered ability that works
  identically in the Nether is a sun-powered ability in name only.
- **Ramp, do not switch.** A condition that flips at a threshold is a rule the
  player has to memorise. One that fades is something they feel. Solar Flare's
  action-bar message names the current sun percentage for the same reason:
  a sword doing a third of its usual damage should say why, or it reads as a
  bug.

### State that carries between activations

If a sword should build something up as you fight with it — heat, a combo,
momentum — use the charge primitive on `PlayerStateStore` rather than inventing
storage:

```js
// In the passive, on a hit that landed:
const total = services.state.addCharge(ctx.playerId, 'ember_heat', 1, 5);

// In the active:
const charges = services.state.spendCharges(ctx.playerId, 'ember_heat');
const damage = params.damage + charges * params.damagePerCharge;
```

The store handles what would otherwise be repeated (and eventually got wrong)
per sword: counters are keyed by `player.id` so two players can never share one,
they are life-scoped so death clears them, they are clamped to `max` so nothing
can leak an unbounded number, and non-finite input is refused.
`spendCharges` reads and clears in one step, so two rapid activations cannot
both claim the same stacks.

Two rules for the ability itself:

- **Bank only on success.** Ember Edge banks a stack only when the hit actually
  damaged something, so a blocked or filtered target does not feed the meter.
- **Do not spend on a miss.** Ember Burst returns `{ ok: false }` before
  spending when nothing is in range, which also means no cooldown is consumed.
  Losing a full meter to a mistimed click feels terrible.

Ember Blade is the worked example — see `swords/ember_blade.js` and both
`abilities/builtin/ember_*.js`.

### State that belongs to the target, not the player

If a sword builds something up on **a particular enemy**, do not reach for a
`Map` from entity id to a count. Entities die, despawn, unload with their chunk
and cross dimensions, and every one of those leaves a key nothing will ever
remove — a leak that grows with playtime.

Store it in an effect instead, and let the game be the source of truth:

```js
// In the passive, on a landed hit: read what is there, apply one tier deeper.
const carried = services.effects.amplifierOf(target, 'poison');   // -1 when absent
services.effects.apply(target, {
    effect: 'poison',
    durationTicks: params.venomTicks,
    amplifier: Math.min(carried + 1, params.maxAmplifier),
});

// In the active: read the tiers, pay out for them, then SPEND them.
const tiers = services.effects.amplifierOf(target, 'poison') + 1;
services.effects.remove(target, 'poison');
```

`amplifierOf` returns `-1` for a target carrying nothing, so `+ 1` starts a
fresh target at 0 without a special case. The count expires when the effect
does, cleans itself up when the mob dies, and costs nothing between
activations.

Two rules for the ability:

- **Read before striking.** Otherwise the tier this hit applies counts towards
  the tier this hit is deciding.
- **Spend what you read.** An active that pays out for banked stacks without
  removing them turns the button into a free bonus on cooldown, and the build-up
  stops being a decision.

Poison Sword is the worked example — see `swords/poison_sword.js` and
`abilities/builtin/{envenom,rupture}.js`.

### Sword feel: swing duration

```js
item: { attackDamage: 8, durability: 900, swingDuration: 0.4 }
```

`minecraft:swing_duration` is the only item-side control Bedrock gives you over
the attack animation, and it is **visual only** — it does not change attack
rate, cooldown or damage. Vanilla's default is about 0.3s; the collection runs
from Wind at 0.25 to Earth at 0.55, so weight reads in the swing.

There is no per-item attack animation beyond this. The swing itself belongs to
the player, not the item, and applies to every item held.

### Targeting, filters and knockback

All three are envelope data, so an ability never decides who it hits or how hard
they fly:

```js
targeting:      { type: 'cone', range: 6, angleDegrees: 90, maxTargets: 8 },
allowedTargets: ['hostile', 'player'],
knockback:      { horizontal: 2.2, vertical: 0.4, mode: 'away' },
```

| `targeting.type` | Resolves to |
|---|---|
| `self` | the caster alone |
| `single` | the first valid entity along the view line, within `range` |
| `area` | everything within `range` of the caster |
| `cone` | everything within `range` **and** inside `angleDegrees` of the view direction |
| `ray` | everything the view line passes through, in order |
| `point` | nothing — resolves the *location* the caster is looking at, up to `range`, for abilities that detonate there |

`allowedTargets` accepts `any`, `mob`, `hostile`, `passive`, `player`, `undead`
and `arthropod`. Omit it and the binding hits anything but the caster. It is a
union: `['hostile', 'undead']` means either.

`knockback.mode` is `'away'` (radially outward from the caster — a scatter) or
`'forward'` (along the caster's view direction — a wave). The Wind and Tidal
swords differ by little more than this field and their targeting shape, and they
play nothing alike.

Both forces are clamped by `config.combat`, so an over-enthusiastic number is
capped rather than launching a zombie into orbit.

### Activation methods

| Method | Input | Notes |
|---|---|---|
| `use` | right-click / long-press | also catches sneak + use when no `sneak_use` binding exists |
| `sneak_use` | sneak + right-click | |
| `attack` | melee hit | no action-bar feedback, to avoid spam |
| `sneak_attack` | sneak + melee hit | falls back to `attack` |

A sword may bind at most one ability per method; two bindings on the same
activation is a build error.

### Restrictions

Gate an ability without writing code. Each field is optional, and a restriction
that cannot be evaluated refuses the activation rather than passing:

```js
restrictions: {
    minHealth: 6,
    requireGrounded: true,
    forbidInWater: true,
    dimensions: ['minecraft:nether'],
}
```

Sword definitions are **pure data**. They must not import `@minecraft/server` —
`npm run validate` fails the build if they do.

## 2. Reuse an ability, or write one

Prefer binding an existing ability with different parameters. That is the whole
point of the ability layer: `flame_nova` with `radius: 5` and `flame_nova` with
`radius: 9, damage: 12` are two very different-feeling swords sharing one
implementation.

When you genuinely need new behaviour, create
`packs/CustomSwordsBP/scripts/abilities/builtin/<name>.js`:

```js
/** @type {import('../../core/types.js').AbilityDefinition} */
export const flameNova = {
    id: 'custom_swords:flame_nova',
    name: 'Flame Nova',
    description: 'Burns everything the binding targets.',

    defaults: { damage: 5, igniteSeconds: 3 },

    validateParams(params) {
        const problems = [];
        if (typeof params.damage !== 'number' || params.damage < 0) {
            problems.push("'damage' must be a non-negative number.");
        }
        return problems;
    },

    execute(ctx) {
        const { params, services } = ctx;

        // Caster visuals: the binding decides what they are.
        services.combat.playCast(ctx);

        // Targeting is data — this ability never learns which shape it got.
        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'Nothing to burn.' };

        // One call validates, damages, emits target particles, plays the impact
        // sound, applies the binding's effects, ignites and knocks back — in a
        // fixed order, with hit protection and self-damage refusal already
        // handled. The report says how many landed and why the rest did not.
        const report = services.combat.strike(ctx, targets, {
            damage: params.damage,
            igniteSeconds: params.igniteSeconds,
            damageCause: 'fire',
            knockback: ctx.knockback,
        });

        return { ok: true, message: `${report.damaged} scorched` };
    },
};
```

Add it to `abilities/index.js`.

**Rules for abilities**, all enforced by `npm run validate` or by review:

- no `@minecraft/server` import — use `ctx.services`;
- read targeting, effects, particles and sounds from `ctx`, never hard-code
  them — that is what keeps one ability reusable across many swords;
- go through `services.combat.strike` (or `strikeOne`) rather than calling
  `damage`, `effects` and `particles` yourself — the combat system owns the
  ordering, the validation, the self-damage refusal and the hit protection, and
  an ability that bypasses it bypasses all four;
- never call `services.damage.apply` directly from an ability; that is the
  combat system's job;
- no module-level mutable state — use `ctx.services.state`, keyed by
  `ctx.playerId`;
- no `system.runInterval` — the framework allows exactly one interval, and it
  already exists;
- return `{ ok: false, message }` instead of throwing when there is simply
  nothing to do. A failed ability does not consume the player's cooldown.

## 3. Generate, validate, test, build

```bash
npm run all
```

That runs `generate` → `catalog` → `validate` → `test` → `build`. The generator
writes the item JSON, the texture atlas entry, the compiled PNG and the `.lang`
names; `catalog` refreshes `SWORD_CATALOG.md` so the published roster matches
the definitions. Neither is hand-editable — regenerate instead.

## 4. Author the texture

**This is not optional.** `npm run validate` fails for a sword with no authored
texture source. Write `art/swords/<texture>.json` — a palette plus a 16×16
character grid — then `npm run generate` compiles it into the resource pack.

Read **`docs/TEXTURE_STANDARD.md`** first: it defines the quality bar, the
letter convention, what the automated gate checks, and what it cannot check.
The short version:

- upper-left light source, always;
- three or more tones per material, plus a full dark outline;
- its own silhouette — a recolour of another sword is a build error;
- render it enlarged and **look at it** before accepting it.

Never hand-edit the PNG in the resource pack. It is build output.

## 5. Test in Minecraft

Import `dist/CustomSwords-v<version>.mcaddon` and work through
`docs/TESTING.md`:

```
/give @s custom_swords:emberfang
/scriptevent custom_swords:held        confirm the registry recognises it
/scriptevent custom_swords:info emberfang
```

---

## Cooldown keys

By default each sword and trigger gets its own key, `<swordId>#<trigger>`, so
nothing shares a timer by accident. Set `cooldownKey` on a binding to
deliberately share one:

```js
active:  { abilityId: '…', cooldownTicks: 200, cooldownKey: 'custom_swords:ultimates' },
```

Every sword using `custom_swords:ultimates` then draws from one shared timer —
per player, as always.

## Rarity

Rarity drives the display-name colour, sorting in reports and the codex, and the
vocabulary used in balance work. It grants no combat bonus.

| Rarity | Colour |
|---|---|
| `common` | white |
| `uncommon` | green |
| `rare` | blue |
| `epic` | light purple |
| `legendary` | gold |
| `mythic` | red |

The colour is applied as a section code on the generated display name rather
than via `minecraft:rarity`, which only supports four tiers and escalates on
enchant. See `docs/API_NOTES.md`.

## Checklist

- [ ] Definition file created and exported from `swords/index.js`
- [ ] Ability reused, or new ability added to `abilities/index.js`
- [ ] `npm run all` is green
- [ ] Texture source authored in `art/swords/`, rendered, inspected and passing
      the quality gate with zero errors and zero warnings
- [ ] Tested in-game and the result recorded
- [ ] `CHANGELOG.md` updated
