# Release builds

A committed convenience copy of the packaged add-on so it can be downloaded
straight from the repository without running the toolchain.

Only the current build is kept; older ones are available from the git history
and from CI artifacts.

| File | Milestone |
|---|---|
| `CustomSwords-v2.0.0.mcaddon` | **v2.0** — 20 swords, 121 powers, crouch to switch power, animated effects, 32×32 icons, in-game guide book. Both packs in one file. |
| `CustomSwordsBP-v2.0.0.mcpack` | v2.0 behaviour pack alone. |
| `CustomSwordsRP-v2.0.0.mcpack` | v2.0 resource pack alone. |
| `CustomSwords-v2-recipes-1.png` | Recipe poster: the ten Uncommon to Epic swords. |
| `CustomSwords-v2-recipes-2.png` | Recipe poster: the ten Epic to Mythic swords, and the guide book. |

These are build artifacts. The authoritative output is `dist/`, produced by
`npm run build`; CI also uploads it as a workflow artifact. If this copy ever
disagrees with a fresh build, the fresh build wins.

## Installing

Requires Minecraft Bedrock Edition **1.21.120 or newer**. No experimental
toggles are needed.

1. Download `CustomSwords-v2.0.0.mcaddon` onto a device with Minecraft installed.
2. Open it — Minecraft imports both the behaviour pack and the resource pack.
   (Upgrading from v1.x: the pack IDs are unchanged, so existing worlds pick
   up v2.0 automatically.)
3. Enable **both** packs on the world.
4. Craft a sword (recipes in `../SWORD_CATALOG.md`), or with cheats on:

   ```
   /give @s custom_swords:dragon_sword
   /give @s custom_swords:echo_sword
   /give @s custom_swords:ember_blade
   ```

5. **Crouch** to switch power, **use** (right-click / long-press) to cast,
   and **hit** things for the passive.
6. Open the **Custom Swords Guide** (you get one on first join, or craft a
   Book + Stick) for every recipe and power.
7. To inspect what the add-on loaded:

   ```
   /scriptevent custom_swords:list
   /scriptevent custom_swords:held
   ```
