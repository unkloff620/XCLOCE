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

## Secrets

The MCP server reads `OPENAI_API_KEY` and optional `OPENAI_IMAGE_MODEL` from root `.env.local`.
Never commit, print, expose, or place secret values in browser code.
