# Release builds

A committed convenience copy of the packaged add-on so it can be downloaded
straight from the repository without running the toolchain.

| File | Milestone |
|---|---|
| `CustomSwords-v0.1.0.mcaddon` | Roadmap step 1 — foundation. Framework, toolchain and one diagnostic sword. **No shipped swords yet.** |

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

Then work through the checklist in `../docs/TESTING.md`.
