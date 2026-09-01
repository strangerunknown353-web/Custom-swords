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

    // --- Active ability: right-click / long-press --------------------------
    active: {
        abilityId: 'custom_swords:flame_nova',
        cooldownTicks: 140,               // 7 seconds
        hudCategory: 'custom_swords_emberfang',   // optional vanilla HUD sweep

        targeting: { type: 'area', range: 5, maxTargets: 10 },
        effects: [{ effect: 'weakness', durationTicks: 80 }],
        particles: [{ id: 'minecraft:basic_flame_particle', count: 16, at: 'caster' }],
        sounds: { cast: 'ability_cast', impact: 'impact_heavy' },

        params: { damage: 6, igniteSeconds: 4 },   // numbers only the ability understands
    },

    // --- Passive ability: fired on melee hit -------------------------------
    passive: {
        abilityId: 'custom_swords:ignite_on_hit',
        targeting: { type: 'self' },
        params: { chance: 0.35 },
    },
};
```

### The envelope is the point

`targeting`, `effects`, `particles` and `sounds` are the *invocation envelope*.
Binding the same ability twice with different envelopes gives you two swords
that feel genuinely different, with no new code:

```js
// A precise duellist's blade.
active: { abilityId: 'custom_swords:flame_nova',
          targeting: { type: 'single', range: 6 }, params: { damage: 10 } }

// A crowd-clearing greatsword, same ability.
active: { abilityId: 'custom_swords:flame_nova',
          targeting: { type: 'cone', range: 9, angleDegrees: 120 }, params: { damage: 4 } }
```

`params` is reserved for numbers only the ability itself understands. Anything
the framework can interpret belongs in a typed field, where `npm run validate`
checks it at build time — a targeting block missing its `range` fails the build,
whereas the same mistake hidden in `params` would ship as an ability that
silently does nothing.

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
        const origin = ctx.player.location;

        // Presentation comes from the binding, not from here.
        for (const particle of ctx.particles) {
            if ((particle.at ?? 'caster') === 'caster') services.particles.emit(ctx.dimension, particle, origin);
        }
        if (ctx.sounds.cast) services.sounds.playAt(ctx.dimension, ctx.sounds.cast, origin);

        // So does targeting — this ability never learns which shape it got.
        const targets = services.targeting.resolve(ctx);
        if (targets.length === 0) return { ok: false, message: 'Nothing to burn.' };

        for (const target of targets) {
            services.damage.apply(ctx, target, params.damage, { cause: 'fire' });
            services.effects.applyMany(target, ctx.effects);
        }
        return { ok: true, message: `${targets.length} scorched` };
    },
};
```

Add it to `abilities/index.js`.

**Rules for abilities**, all enforced by `npm run validate` or by review:

- no `@minecraft/server` import — use `ctx.services`;
- read targeting, effects, particles and sounds from `ctx`, never hard-code
  them — that is what keeps one ability reusable across many swords;
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

## 4. Add real art

Replace the placeholder with a 16×16 RGBA PNG at:

```
packs/CustomSwordsRP/textures/items/custom_swords/swords/<texture>.png
```

The generator never overwrites an existing texture, and the validator fails the
build if an icon sits outside that directory.

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
- [ ] Real texture committed (or placeholder deliberately kept for now)
- [ ] Tested in-game and the result recorded
- [ ] `CHANGELOG.md` updated
