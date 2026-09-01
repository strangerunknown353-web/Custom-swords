# Texture standard

> ## The rule
>
> **Every newly created custom sword must receive a unique, polished, beautiful,
> realistic-looking Minecraft-style texture. If an automatically generated or
> previously created texture does not meet the project's visual quality
> standard, it must be improved or regenerated before the sword is considered
> complete.**

This rule is permanent and applies to all 20–25 swords. It is not advisory:
`npm run validate` fails the build for a sword with no authored texture source,
and fails again if that source does not clear the measurable parts of the bar.

---

## 1. What "premium" means here

The target is **Minecraft pixel art with realistic material treatment** — not
photorealism, and not a flat two-tone placeholder.

A finished sword icon has:

- **A strong silhouette.** Readable as a specific sword at 16×16, from across a
  hotbar, against any background.
- **A full dark outline.** Every edge of the silhouette borders a near-black
  tone, so the icon never smears into a bright inventory background.
- **Three-plus tones per material.** A blade needs a lit edge, a core, and a
  shaded edge at minimum. Two tones read as unfinished.
- **A consistent light source.** This project lights everything from the
  **upper left**. The upper-left face of every form is the highlight; the
  lower-right face is the shadow. No exceptions, or the set stops looking like
  a set.
- **Specular detail.** One or two near-white glints along a polished blade sell
  the metal. Used sparingly — a blade covered in glints reads as noise.
- **A detailed hilt.** Guard, grip and pommel must each be distinguishable.
  A brown smear below a blade is not a hilt.
- **Material honesty.** Steel, obsidian, ice and bone should not share a
  palette. Colour carries the material.

## 2. What is forbidden

- Recolours. Two swords sharing a pixel grid is a build error, not a style
  choice. Each sword gets its own blade shape, guard, grip and proportions.
- Flat fills with no shading.
- Missing or partial outlines.
- Detached or orphaned pixels.
- Palettes of near-identical tones (visual noise that reads as mud).
- Anything copied from an existing game, mod or asset pack. Every design here is
  original.

## 3. Visual identity per sword

The set must look coherent *and* varied. Same quality bar, same light source,
same outline discipline — but each sword carries its own theme:

| Theme | Direction | Shipped |
|---|---|---|
| Fire | volcanic, forged, glowing seams in dark metal | Inferno — dark iron blade with orange ember seams, brass fittings |
| Thunder | dark storm-iron, a live arc along the fuller, violet discharge at the point | Thunder — narrow forked spike, gold arc, copper guard |
| Frost | crystalline, translucent edges, pale blue with white refraction | Frost — a grown shard widening toward the tip, rimed silver guard |
| Wind | light, slim, desaturated mint and white; nothing heavy | Wind — the slimmest blade in the set, swept guard, pale grip |
| Earth | rough stone, brown and grey, chunky and blunt, a fleck of moss | Earth — the widest and shortest blade, deliberately unrefined |
| Water | deep teal with a coral guard and a pearl pommel | Tidal — flowing edge, warm guard against a cold blade |
| Nature | living wood and leaf-green, gold sap, growth over metal | Nature — leaf-shaped blade, branching guard |
| Shadow | matte near-black, violet rim light, ragged edge | *(not yet)* |
| Dragon | ancient bronze and bone, scaled guard, warm patina | *(not yet)* |

**Two swords must never be distinguishable only by hue.** Every sword in the
table above differs from every other in silhouette *and* palette. This is the
rule the linter enforces least well, so it is the one to check by eye.

### A worked example of the rule being applied

Thunder's first version used a pale blue-white blade — "bright polished metal,
cold blue-white", as the direction above originally read. Rendered next to
Frost on a contact sheet, it read as *ice*: same hue family, same brightness,
and it looked like a weaker Frost despite being the collection's only Legendary.

Every automated check passed. The linter had nothing to say, because nothing was
wrong at the pixel level — the two grids are different shapes, both palettes are
well spread, both silhouettes are clean.

It was rebuilt as dark storm-iron with a gold arc crawling the fuller and a
violet discharge at the tip, and the theme direction in the table above was
rewritten to match. That is what "regenerate a texture that does not meet the
standard" means in practice, and it is why step 3 of the workflow below is
*look at it*, not *check the linter passed*.

## 4. Technical requirements

| Requirement | Value |
|---|---|
| Dimensions | 16×16 |
| Format | PNG, 8-bit RGBA, non-interlaced |
| Transparency | Required — the background must be fully transparent (alpha 0) |
| Location | `packs/CustomSwordsRP/textures/items/custom_swords/swords/<shortname>.png` |
| Atlas entry | `textures/item_texture.json`, keyed by `<shortname>` |
| Source of truth | `art/swords/<shortname>.json` |

The PNG in the resource pack is **compiled output**. Never hand-edit it — edit
the source and run `npm run generate`.

## 5. The source format

Textures are authored as text so they diff in git, can be reviewed line by line,
and can be checked automatically:

```json
{
  "name": "Test Blade",
  "description": "What the design is going for.",
  "palette": {
    "o": "#0d0d14",
    "H": "#dde7f4",
    "B": "#b4c1d2"
  },
  "pixels": [
    ".............oXB",
    "...........ooHBS"
  ]
}
```

- `.` is reserved for transparency and must not appear in the palette.
- Every palette entry must be used by at least one pixel.
- All 16 rows, all 16 characters wide.

A suggested letter convention, followed by the Test Blade:

| Letter | Role |
|---|---|
| `o` | outline |
| `X` | specular glint |
| `H` | lit edge |
| `B` | blade core |
| `S` | shaded edge |
| `D` | deep shadow |
| `G` `g` `e` | guard: lit, mid, dark |
| `W` `w` `k` | grip: lit, mid, dark |
| `P` `p` `Q` | pommel: mid, dark, highlight |
| `R` | accent (gem, rune, ember) |

## 6. The automated gate

`tools/lib/texture.mjs` enforces everything measurable. `npm run validate`
fails on:

- wrong dimensions, malformed rows, undefined pixel characters, bad hex colours;
- an unused palette entry (dead tones);
- coverage above 75% (no silhouette) or below 15% (unreadable);
- a broken silhouette — any pixel detached from the main shape;
- fewer than 6 palette colours (cannot be properly shaded);
- a luminance spread under 120 (flat, low contrast);
- a darkest colour lighter than luminance 60 (no real outline);
- a pixel grid identical in shape to another sword's (a recolour);
- **a sword with no authored source at all.**

It warns on near-duplicate palette entries.

## 7. What the gate cannot judge

Taste. The linter cannot tell you the guard looks like a lump or the
proportions are wrong. Before accepting a texture, **render it and look at it**,
at both 16×16 and enlarged, checking for:

blurry or muddy detail · incorrect transparency · broken pixels · inconsistent
perspective · ugly or missing outlines · excessive noise · an unreadable blade ·
poor contrast · inconsistent shading · stray artifacts · wrong proportions ·
a generally cheap appearance.

If any of those are present, revise the source and render again. Do not accept
the first result.

## 8. Workflow for a new sword

1. Write `art/swords/<shortname>.json`.
2. `npm run generate` — compiles it into the resource pack.
3. Render it enlarged and **look at it**. Iterate.
4. Render it **beside every other sword in the set**, at both scales, on a dark
   background. A texture that is fine alone and indistinct in company has
   failed. This is how the Thunder revision above was caught.
5. `npm run validate` — the gate must pass with zero errors and zero warnings.
6. Only then is the sword complete.

## 9. Benchmark

`art/swords/test_blade.json` is the reference. Polished steel blade with a lit
upper-left edge, two specular glints, a shaded lower-right edge and a deep
shadow band; a blued-steel cross-guard with a set gem; a leather-wrapped grip
with visible banding and a shaded underside; a brass pommel with a highlight;
and a full dark outline.

Its measured profile — 16 colours, 38% coverage, luminance spread 241 — is the
floor for the collection, not the ceiling.
