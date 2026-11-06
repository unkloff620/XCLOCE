import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { ITEMS } from "../src/content/items.ts";
import { hasItemArt } from "../src/client/art/items.tsx";

describe("item pictures", () => {
  it("every item with a picture in public/assets/items is drawn with it (not the fallback chest)", () => {
    const files = new Set(fs.readdirSync("public/assets/items").map((f) => f.replace(/\.webp$/, "")));
    const missed = ITEMS.filter((i) => files.has(i.id) && !hasItemArt(i.id)).map((i) => i.id);
    expect(missed).toEqual([]);
  });
});
