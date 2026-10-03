# XCLOCE image generator for Claude Code

This local MCP server lets Claude Code generate game art with the OpenAI Images API and save it directly under `public/assets/`.

## Setup

Add these values to the repository root `.env.local`:

```env
OPENAI_API_KEY=your_key_here

# Optional overrides:
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_TRANSPARENT_IMAGE_MODEL=gpt-image-1
```

Only `OPENAI_API_KEY` is required. The model variables are optional.

- Normal game art and boss art use `gpt-image-2` by default.
- Transparent item assets use `gpt-image-1` by default because GPT Image 2 currently does not support transparent backgrounds.

Do not commit the real key. The repository already ignores `.env.local`.

Restart Claude Code from the repository root. The project-level `.mcp.json` exposes the `game-images` server.

On first launch, `launcher.mjs` installs the local MCP dependencies automatically.

Available tools:
- `generate_game_image`
- `generate_boss_art`
- `generate_transparent_item`

Generated files are restricted to `public/assets/`.
