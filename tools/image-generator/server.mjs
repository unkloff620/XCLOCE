import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { config as loadEnv } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const projectRoot = process.cwd();
loadEnv({ path: path.join(projectRoot, ".env.local"), override: false });

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing. Add it to .env.local in the project root.");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// GPT Image 2 is the current default for normal artwork.
// Transparent backgrounds are not supported by GPT Image 2, so item cutouts use GPT Image 1 by default.
const defaultModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const transparentModel = process.env.OPENAI_TRANSPARENT_IMAGE_MODEL || "gpt-image-1";

const server = new McpServer({
  name: "xcloce-game-images",
  version: "1.1.0",
});

const sizes = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
};

function outputPath(relativePath) {
  const assetsRoot = path.resolve(projectRoot, "public", "assets");
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const file = normalized.toLowerCase().endsWith(".png") ? normalized : normalized + ".png";
  const absolute = path.resolve(assetsRoot, file);

  if (absolute !== assetsRoot && !absolute.startsWith(assetsRoot + path.sep)) {
    throw new Error("Output must stay inside public/assets.");
  }

  return absolute;
}

async function generate({ prompt, output, size, quality, transparent = false }) {
  const model = transparent ? transparentModel : defaultModel;

  const result = await openai.images.generate({
    model,
    prompt,
    size: sizes[size],
    quality,
    background: transparent ? "transparent" : "opaque",
    n: 1,
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image API returned no image data.");

  const target = outputPath(output);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(b64, "base64"));

  return path.relative(projectRoot, target).replace(/\\/g, "/");
}

server.tool(
  "generate_game_image",
  "Generate general game artwork and save it under public/assets.",
  {
    prompt: z.string().min(10),
    output: z.string().min(1),
    size: z.enum(["square", "portrait", "landscape"]).default("portrait"),
    quality: z.enum(["low", "medium", "high"]).default("high"),
  },
  async (args) => ({
    content: [{ type: "text", text: "Generated: " + await generate({ ...args, transparent: false }) }],
  })
);

server.tool(
  "generate_boss_art",
  "Generate vertical boss artwork for XCLOCE.",
  {
    boss_name: z.string().min(1),
    concept: z.string().min(10),
    filename: z.string().min(1),
    quality: z.enum(["low", "medium", "high"]).default("high"),
  },
  async ({ boss_name, concept, filename, quality }) => {
    const prompt = [
      "Premium vertical boss artwork for the XCLOCE Telegram crypto meme RPG.",
      "Boss: " + boss_name + ".",
      "Concept: " + concept + ".",
      "Dark crypto-meme, degen, cyberpunk mobile-game art.",
      "Strong silhouette, dramatic lighting, full character visible, rich environmental depth.",
      "No UI frame, no watermark, no placeholder text. Use an original meme-inspired design.",
      "Leave useful negative space around the character for mobile UI overlays."
    ].join(" ");

    const file = await generate({
      prompt,
      output: "bosses/" + filename,
      size: "portrait",
      quality,
      transparent: false,
    });

    return { content: [{ type: "text", text: "Generated boss: " + file }] };
  }
);

server.tool(
  "generate_transparent_item",
  "Generate a weapon, equipment or loot asset on a transparent background.",
  {
    item_name: z.string().min(1),
    concept: z.string().min(10),
    filename: z.string().min(1),
    quality: z.enum(["low", "medium", "high"]).default("high"),
  },
  async ({ item_name, concept, filename, quality }) => {
    const prompt = [
      "Premium isolated inventory asset for the XCLOCE Telegram crypto meme RPG.",
      "Item: " + item_name + ".",
      "Concept: " + concept + ".",
      "Single centered object, clean silhouette, polished game-ready asset.",
      "Dark crypto cyberpunk meme aesthetic. Transparent background.",
      "No UI card, no border, no watermark, no unrelated text."
    ].join(" ");

    const file = await generate({
      prompt,
      output: "items/" + filename,
      size: "square",
      quality,
      transparent: true,
    });

    return { content: [{ type: "text", text: "Generated item: " + file }] };
  }
);

await server.connect(new StdioServerTransport());
