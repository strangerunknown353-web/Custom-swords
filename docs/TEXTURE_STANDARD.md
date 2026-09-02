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
| Shadow | matte near-black, violet rim light, ragged edge | Shadow — narrow blade, violet seam on the cutting edge, wide crescent guard |
| Crystal | cut amethyst, faceted rather than forged, warm metal against a cool stone | Crystal — broad shard, alternating specular and rose facets, rose-gold cross guard, pale grip |
| Void | deep indigo void-metal, cold cyan rift-light, high contrast | Void — long narrow blade with the light in its *centre*, clipped chisel point, gem set in the guard |
| Solar | white-gold light, not heat — pale steel against warm gold fittings | Solar — bright tapering blade, a solid gold sun-disc guard, the only round guard in the set |
| Gravity | achromatic gunmetal and dust, industrial rather than cosmic | Gravity — heavy chisel-ended slab, a plain bronze bar straight across, a counterweight pommel |
| Poison | sickly yellow-green venom sitting *on* bruised violet-grey steel | Poison — the narrowest blade in the set, corroded bronze fangs, a venom bead in the pommel |
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
  "name": "Ember Blade",
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

A suggested letter convention, followed by every shipped sword:

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

## 9. Benchmarks

Two references, and they are references for different reasons.

**`art/swords/inferno_sword.json` — material and light.** Cold charcoal iron
with a molten seam running the blade's length and a white-hot core at the
fuller; obsidian guard, brass pommel, scorched leather grip. It is the reference
for how a *material story* should read: the steel is genuinely cold-toned so
the heat has something to sit against.

**`art/swords/ember_blade.json` — restraint and silhouette.** A slim,
straight blade of cold-polished steel holding forge heat only in its lower
third and fading to a keen grey point; a compact steel guard with one live ember
between the quillons; wire-wrapped grip with a single highlight; small brass
pommel. It is the reference for **how two swords in the same theme stay
distinct**: both are fire swords, and neither is a recolour of the other.

Set side by side they differ in silhouette (slim versus broad), in where the
heat sits (a band at the ricasso versus a full-length seam), and in colour
weighting (mostly cool steel versus mostly dark iron). That comparison is the
standard every future themed pair must meet — the fifth fire sword must still
be tellable from the first four at hotbar scale.

| Reference | Colours | Coverage | Luminance spread |
|---|---:|---:|---:|
| Inferno Sword | 14 | 36% | 218 |
| Ember Blade | 13 | 31% | 225 |

Those numbers are the floor for the collection, not the ceiling.

**A third reference, for the hardest case: `art/swords/void_sword.json` — where
the light lives.** Every other blade in the set is lit along its edge, with the
upper-left face bright and the lower-right face shaded. Void puts the light in
the blade's *centre* instead — a seam of cold cyan running down a dark indigo
body — and terminates in a clipped chisel rather than a point.

It is the reference for what to do when a theme has no natural colour of its
own. "Void" wants to be black, and a black sword next to Shadow is a recolour of
Shadow. The answer was not a different black; it was a different *place for the
light*, which changes the silhouette's internal structure rather than its hue.
Reach for that before reaching for the colour picker.

| Reference | Colours | Coverage | Luminance spread |
|---|---:|---:|---:|
| Void Sword | 12 | 39% | 240 |
| Crystal Sword | 13 | 37% | 238 |

**A fourth rule, learned the hard way in v0.11.0: a dark hilt disappears.**

Gravity's and Poison's first drafts both had bronze guards around luminance 60
and dark grips beneath them. Rendered at 16×16 on a dark inventory background,
both hilts simply vanished — each sword read as a blade floating over a smudge.
Every automated check passed: the palettes were well spread, the silhouettes
were unbroken, the coverage was in range. The linter measures the spread of the
*whole* palette and has nothing to say about the spread *within one component*.

Both were fixed by lightening the guard and grip tones by roughly 40% and
widening the guard by a pixel, and the check that caught it is the one the gate
cannot run:

> Render the icon at hotbar scale, on a dark ground, and **cover the blade with
> your thumb**. If what is left is not recognisably a hilt, the hilt is not
> finished.
