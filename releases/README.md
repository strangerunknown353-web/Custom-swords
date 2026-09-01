# Release builds

A committed convenience copy of the packaged add-on so it can be downloaded
straight from the repository without running the toolchain.

Only the current build is kept; older ones are available from the git history
and from CI artifacts.

| File | Milestone |
|---|---|
| `CustomSwords-v0.2.0.mcaddon` | Roadmap step 2 — core sword framework. Registry, identification, rarity, stats, declarative ability envelope and in-game diagnostics, plus one diagnostic sword. **No shipped swords yet.** |

These are build artifacts. The authoritative output is `dist/`, produced by
`npm run build`; CI also uploads it as a workflow artifact. If this copy ever
disagrees with a fresh build, the fresh build wins.

## Installing

Requires Minecraft Bedrock Edition **1.21.90 or newer**. No experimental
toggles are needed.

1. Download the `.mcaddon` onto a device with Minecraft installed.
2. Open it — Minecraft imports both the behaviour pack and the resource pack.
3. Create a **new** world, enable both packs, and turn on Creative plus cheats.
4. `/give @s custom_swords:test_blade`, then right-click (or long-press) with
   mobs nearby.
5. Confirm the framework recognises it:

   ```
   /scriptevent custom_swords:list
   /scriptevent custom_swords:held
   ```

Then work through the checklist in `../docs/TESTING.md`.
