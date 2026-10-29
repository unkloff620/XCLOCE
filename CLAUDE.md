# XCLOCE project instructions

## Working style

Implement requested changes directly in the project.
Inspect existing code before editing.
Keep working systems intact and avoid placeholders where a real asset can be created.

## Image generation

This project exposes the MCP server `game-images`.

Tools:
- `generate_game_image` for backgrounds, banners, locations and general art.
- `generate_boss_art` for vertical boss artwork.
- `generate_transparent_item` for weapons, equipment and loot on transparent backgrounds.

When a requested feature needs art, use these tools instead of emoji or placeholder images.

Before generating:
1. Inspect the current screen and visual direction.
2. Write a detailed prompt matching the XCLOCE crypto-meme / degen / cyberpunk style.
3. Prefer original meme-inspired designs.

After generating:
1. Confirm the asset exists under `public/assets/`.
2. Integrate it into the relevant screen.
3. Check mobile and desktop behavior.
4. Reuse suitable existing assets instead of generating duplicates.
5. Run the relevant checks after code changes.

Asset folders:
- bosses: `public/assets/bosses/`
- items: `public/assets/items/`
- general art: `public/assets/generated/`

Use lowercase kebab-case filenames.

## Image generation cost (OpenAI is billed per picture)

- Icons and items (shown at 16–64 px): quality `low` or `medium`, never `high`. Big backgrounds and bosses: `medium` for drafts, `high` only for the approved final.
- Show a cheap draft first; regenerate in high quality only what the user approved.
- Keep reference images small (≤1024 px on the long side): they are billed as input too.

## Secrets

The MCP server reads `OPENAI_API_KEY` and optional `OPENAI_IMAGE_MODEL` from root `.env.local`.
Never commit, print, expose, or place secret values in browser code.

## Update notes for players

After every release that changes something players see, add an entry at the top of `src/content/updates.ts`
(«Что нового»: shown once on the home screen, mostly pictures in `public/assets/updates/<date>-*.webp` with a short line each).

## Boss rooms

Every boss that has his own fight room (`BOSS_ARENAS` in `src/content/bosses.ts`, `public/assets/arena/<id>.webp`) also gives
that room to the players' homes right away: add a `ROOM_DEFS` entry in `src/content/home.ts` with
`drop: { boss: "<id>", chance: ROOM_DROP_CHANCE }`, the picture as `tools/scene/source/room-<room id>.png`
(run `python3 tools/scene/build-scene.py`), and its `ROOM_BG` / `ROOM_BACKDROP` / `ROOM_LIGHTS` lines in `src/content/home-scene.ts`.
