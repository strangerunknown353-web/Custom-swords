# Release builds

A committed convenience copy of the packaged add-on so it can be downloaded
straight from the repository without running the toolchain.

Only the current build is kept; older ones are available from the git history
and from CI artifacts.

| File | Milestone |
|---|---|
| `CustomSwords-v0.5.0.mcaddon` | Roadmap step 5 — the Elemental Collection. The first seven final swords (Inferno, Thunder, Frost, Wind, Earth, Tidal, Nature) on top of the framework, the Ability Engine and the combat/safety layer. Plus the Test Blade, a diagnostic item. |

These are build artifacts. The authoritative output is `dist/`, produced by
`npm run build`; CI also uploads it as a workflow artifact. If this copy ever
disagrees with a fresh build, the fresh build wins.

## Installing

Requires Minecraft Bedrock Edition **1.21.90 or newer**. No experimental
toggles are needed.

1. Download the `.mcaddon` onto a device with Minecraft installed.
2. Open it — Minecraft imports both the behaviour pack and the resource pack.
3. Create a **new** world, enable both packs, and turn on Creative plus cheats.
4. Give yourself a sword and right-click (or long-press) with mobs nearby:

   ```
   /give @s custom_swords:inferno_sword
   /give @s custom_swords:thunder_sword
   /give @s custom_swords:frost_sword
   /give @s custom_swords:wind_sword
   /give @s custom_swords:earth_sword
   /give @s custom_swords:tidal_sword
   /give @s custom_swords:nature_sword
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

Then work through the checklist in `../docs/TESTING.md`. **Nobody has done this
yet** — no build of this project has been loaded into a Minecraft client, so if
you are reading this, you would be the first. Results are recorded in that file.
