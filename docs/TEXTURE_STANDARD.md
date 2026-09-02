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
| Time | warm brass and cyan, clockwork rather than magic | Time — graduated blade, an hourglass guard with a pinched waist, a clock-face pommel |
| Storm | cold slate and copper, weather rather than a bolt | Storm — rain-pale banding down a broad blade, swept copper wings, a copper cap |

The roster closed at sixteen, so the table above is the finished set. It was
drawn up when there were seven swords and every later theme had to find a gap in
it; the last two took the two that were left — clockwork, which nothing else
used, and *weather* as distinct from Thunder's bolt and Wind's gust.

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

It warns on near-duplicate palette entries, on two icons closer than 50 in mean
colour distance, on two icons sharing more than 95% of their silhouette, on an
icon less than 65% blade, and on a crossguard no wider than the blade above it.

That last one exists because the rule above it was not enough. "Identical pixel
grid" catches a copy-paste and nothing else, and the collection drifted into
sixteen swords that were the same diagonal blade, the same straight crossguard
and the same round pommel in sixteen colours. Every one of them passed. The
overlap measure is intersection over union of the two opaque masks, which
throws the empty background away — the naive version, share of all 256 pixels
that agree, reads above 90% for every pair here and separates nothing.

### Proportion, and why upright

**A sword icon is at least 65% blade.** The v1.1.0 set measured 36-50%: the
handle was longer than the blade on twelve of the sixteen, which is a dagger,
and nothing in the pipeline noticed because every rule up to then graded
colour, contrast or silhouette *overlap* — none of them can tell a sword from
a knife. `npm run validate` measures it now, finding the crossguard as the row
where the icon suddenly gets wider and calling everything above it blade.

The swords are drawn on the **vanilla diagonal**, tip to the upper right. The
trick that makes it work — and that three earlier attempts missed — is that a
blade is a stack of **horizontal runs**, one per screen row, each shifted one
column left of the row above. Drawing it as a true 45° lattice instead (one
step along the blade being `(-1,+1)`, one step across it `(+1,+1)`) only ever
lands on cells of one parity and produces a checkerboard. Only the crossguard
is a real diagonal line, because a guard is a line rather than a filled region,
and a line running down-right is exactly perpendicular to a blade running
down-left.

Proportion is measured **without assuming which way the sword points**: the
weapon's own long axis is found from the principal axis of its opaque pixels,
and the cross-section perpendicular to that axis is walked along it. The
crossguard is the widest slice, which also says which end is the hilt.
Orienting by "which end looks narrower" gets a blunt or broad blade backwards —
that is how a chisel-ended sword once measured 33%.

The other half of the rule: **the crossguard must be wider than the blade**,
also checked. A guard no wider than the blade it sits under does not read as a
guard, and without a guard an upright blade reads as a rod.

### The six hilt forms

Varying the blade alone is not enough to keep the silhouettes apart, so the
collection has six hilts and every sword takes one:

The hilt is built from four independent dials rather than named presets: how
far the guard reaches either side (`arms`, 2 to 4), how long the grip is
(2 or 3), the pommel shape (`round`, `heavy` or `ring`), and where the guard
sits along the blade. Earth carries the widest guard in the set at `arms=4`;
Void and Time are the only pierced pommels.

Hilts alone are not enough to keep sixteen upright swords apart, so the blade
carries a **taper** as well — `straight`, `leaf` (widest in the middle),
`flare` (widening toward the guard) or `spike` (narrowing toward it) — and no
two swords share the same combination of width, taper, tip, length and hilt.
That is what took the worst silhouette pair from 100% overlap down to 95%.

The rule that follows from this: **cover the blade with your thumb, and the
hilt should still tell you which sword it is.** The rule from v0.10.0 still
holds too — cover the hilt, and what is left must be recognisably a hilt. And
the one this milestone added: **squint until the icon is a black silhouette.
If it is not obviously a sword, it is not finished.**

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
5. Check it against the two measures the gate reports: colour distance to its
   nearest neighbour, and silhouette overlap with its widest match. Passing the
   thresholds is the floor, not the goal.
6. `npm run validate` — the gate must pass with zero errors and zero warnings.
7. Only then is the sword complete.

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
| Time Sword | 11 | 36% | 230 |
| Storm Sword | 12 | 36% | 231 |

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

**And a fifth, from the last two: the guard is where a crowded theme finds
room.** By sixteen swords every blade shape was close to something. Time and
Storm are separated from their neighbours less by their blades than by their
guards — an hourglass with a visible waist, and a pair of swept wings, neither
of which any other sword has. Blade silhouettes run out long before hilt
silhouettes do; when a new sword reads as an existing one, redesign the guard
before reaching for the colour picker.
