# Release builds

A committed convenience copy of the packaged add-on so it can be downloaded
straight from the repository without running the toolchain.

Only the current build is kept; older ones are available from the git history
and from CI artifacts.

| File | What it is |
|---|---|
| `CustomSwords-v1.2.0.mcaddon` | **The one to install.** Both packs in a single file — open it and Minecraft imports the behaviour pack and the resource pack together. |
| `CustomSwordsBP-v1.2.0.mcpack` | Behaviour pack alone: the sixteen item definitions, their recipes and the whole script framework. Needs the resource pack alongside it, or the swords have no icons or names. |
| `CustomSwordsRP-v1.2.0.mcpack` | Resource pack alone: the sixteen icons, the atlas entry and the English strings. |

**v1.2.0 — the silhouette correction.** All sixteen icons redrawn upright so
every weapon unmistakably reads as a sword: a long blade over a crossguard
wider than it, a short grip and a pommel. The previous set measured 36-50%
blade — the handle was longer than the blade — and read as daggers. This one
is 67-87% blade, and the build checks it.

**v1.1.0 before it — the art pass.** Each sword got its own weapon rather than
the same blade in a different colour: sixteen blade profiles, six hilt forms.
Impact sounds capped at four per strike.

**v1.0.0 before it — the engineering pass.** The build gate that had been
silently validating nothing now validates; a lethal hit no longer abandons the
rest of an ability; the collection is priced so the cheapest sword is not the
strongest.

Sixteen swords, all craftable at a crafting table — see `SWORD_CATALOG.md` for
each recipe grid, the cost progression and the output curve.

These are build artifacts. The authoritative output is `dist/`, produced by
`npm run build`; CI also uploads it as a workflow artifact. If this copy ever
disagrees with a fresh build, the fresh build wins.

## Installing

Requires Minecraft Bedrock Edition **1.21.120 or newer** — raised in v0.5.2 for the swing-animation component. No experimental
toggles are needed.

1. Download the `.mcaddon` onto a device with Minecraft installed.
2. Open it — Minecraft imports both the behaviour pack and the resource pack.
   (The two `.mcpack` files are the same content split apart, for servers and
   realms that install packs separately. Install both, or the swords load with
   no icons and no names.)
3. Create a **new** world, enable both packs, and turn on Creative plus cheats.
   The behaviour pack needs **Beta APIs** off and no other experimental toggle.
4. Give yourself a sword and right-click (or long-press) with mobs nearby:

   ```
   /give @s custom_swords:ember_blade
   /give @s custom_swords:inferno_sword
   /give @s custom_swords:thunder_sword
   /give @s custom_swords:frost_sword
   /give @s custom_swords:wind_sword
   /give @s custom_swords:earth_sword
   /give @s custom_swords:tidal_sword   # Ocean Sword
   /give @s custom_swords:nature_sword
   /give @s custom_swords:shadow_sword
   /give @s custom_swords:crystal_sword
   /give @s custom_swords:void_sword
   /give @s custom_swords:solar_sword
   /give @s custom_swords:gravity_sword
   /give @s custom_swords:poison_sword
   /give @s custom_swords:time_sword
   /give @s custom_swords:storm_sword
   ```

5. Every sword has an active on right-click and a passive that fires on a melee
   hit. Try Wind and Tidal back to back: same ability, completely different
   feel.
6. Confirm the framework recognises it:

   ```
   /scriptevent custom_swords:list
   /scriptevent custom_swords:held
   /scriptevent custom_swords:abilities
   ```

6b. Several swords need a *situation* rather than a target dummy. Crystal wants
   a crowd and a wounded wielder; Void wants something ten blocks away; Solar
   wants `/time set` and a trip to the Nether; Gravity wants something in the
   air; Poison wants one mob you commit to for several swings. Sections **F3**
   through **F7** of `../docs/TESTING.md` say exactly what to set up for each.

Then work through the checklist in `../docs/TESTING.md`, starting with section
**A2 (item registration)** — that is what failed in v0.5.0 and what the v0.5.1
and v0.5.2 builds fixed. Results are recorded in that file, honestly, including
the failure.

**Nothing in v1.2.0 has been in a client** — not the sixteen redrawn icons, not the
renamed Ocean Sword, not the sound cap — and eleven of the sixteen swords have
never been in one at all. Everything passes every check this repository can run
without a game, which v0.5.0 proved is not the same thing as working.
