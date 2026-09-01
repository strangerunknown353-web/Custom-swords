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

`targeting`, `effects`, `particles`, `sounds` and `restrictions` are the
*invocation envelope*. Binding the same ability twice with different envelopes
gives you two attacks that feel genuinely different, with no new code — exactly
as above: a crowd-clearing burst on `use`, a committed aimed strike on
`sneak_use`.

`params` is reserved for numbers only the ability itself understands. Anything
the framework can interpret belongs in a typed field, where `npm run validate`
checks it at build time — a targeting block missing its `range` fails the build,
whereas the same mistake hidden in `params` would ship as an ability that
silently does nothing.

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
        services.outcome.playCast(ctx);

        // Targeting is data — this ability never learns which shape it got.
        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'Nothing to burn.' };

        // One call does damage, particles, sound, effects, ignition and knockback,
        // in a fixed, sensible order.
        const report = services.outcome.applyToTargets(ctx, targets, {
            damage: params.damage,
            igniteSeconds: params.igniteSeconds,
            damageCause: 'fire',
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
- prefer `services.outcome.applyToTargets` over hand-rolling the
  damage/knockback/effects/particles block, so ordering stays consistent;
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

That runs `generate` → `validate` → `test` → `build`. The generator writes the
item JSON, the texture atlas entry and the `.lang` names, and drops in a
deterministic placeholder icon if `packs/CustomSwordsRP/textures/items/custom_swords/<texture>.png`
does not exist yet.

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
