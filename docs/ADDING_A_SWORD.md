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
    id: 'custom_swords:emberfang',
    name: 'Emberfang',
    rarity: 'rare',
    description: 'A blade that never cooled.',
    texture: 'emberfang',            // optional; defaults to the id's local part

    item: {
        attackDamage: 8,             // -> minecraft:damage
        durability: 900,             // -> minecraft:durability
        enchantValue: 14,            // -> minecraft:enchantable (slot: sword)
        repairItems: ['minecraft:blaze_rod'],
    },

    active: {
        abilityId: 'custom_swords:flame_nova',
        cooldownTicks: 140,          // 7 seconds
        hudCategory: 'custom_swords_emberfang',   // optional vanilla HUD sweep
        params: { radius: 5, damage: 6, igniteSeconds: 4 },
    },

    passive: {
        abilityId: 'custom_swords:ignite_on_hit',
        params: { chance: 0.35 },
    },
};
```

Register it in `packs/CustomSwordsBP/scripts/swords/index.js`:

```js
import { emberfang } from './emberfang.js';

export const SWORDS = Object.freeze([testBlade, emberfang]);
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
    description: 'A ring of fire that burns everything nearby.',

    defaults: { radius: 4, damage: 5, igniteSeconds: 3 },

    validateParams(params) {
        const problems = [];
        if (params.radius <= 0) problems.push("'radius' must be positive.");
        return problems;
    },

    execute(ctx) {
        const { params, services } = ctx;
        const origin = ctx.player.location;

        services.particles.ring(ctx.dimension, { id: 'minecraft:basic_flame_particle' }, origin, params.radius, 24);
        services.sounds.playAt(ctx.dimension, 'impact_heavy', origin);

        const targets = services.targeting.sphere(ctx, { range: params.radius, origin });
        if (targets.length === 0) return { ok: false, message: 'Nothing to burn.' };

        for (const target of targets) {
            services.damage.apply(ctx, target, params.damage, { cause: 'fire' });
        }
        return { ok: true, message: `${targets.length} scorched` };
    },
};
```

Add it to `abilities/index.js`.

**Rules for abilities**, all enforced by `npm run validate` or by review:

- no `@minecraft/server` import — use `ctx.services`;
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

Replace the placeholder with a 16×16 RGBA PNG at the same path. The generator
never overwrites an existing texture.

## 5. Test in Minecraft

Import `dist/CustomSwords-v<version>.mcaddon` and work through
`docs/TESTING.md`. `/give @s custom_swords:emberfang`.

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

Rarity currently drives the display-name colour in the generated `.lang`:

| Rarity | Colour |
|---|---|
| `common` | white |
| `uncommon` | green |
| `rare` | blue |
| `epic` | light purple |
| `legendary` | gold |
| `mythic` | red |

## Checklist

- [ ] Definition file created and exported from `swords/index.js`
- [ ] Ability reused, or new ability added to `abilities/index.js`
- [ ] `npm run all` is green
- [ ] Real texture committed (or placeholder deliberately kept for now)
- [ ] Tested in-game and the result recorded
- [ ] `CHANGELOG.md` updated
