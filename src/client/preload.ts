"use client";
/*
 * Art preloading: the game shows only after its pictures are downloaded, and a section (yard, shop, bosses…)
 * opens only after its own pictures are there — no half-drawn scenes.
 * The URL must be exactly the one the screen uses (the browser caches by full URL, query included),
 * so the cache-busting versions live here and the screens take them from here.
 */
import { ASSET_FILES } from "./asset-manifest.ts";

/** cache-busting versions of redrawn art (bump when the picture changes) */
export const ART_VER = { heroPart: 4, hair: 4, wear: 2, items: 3 } as const;

/** the URL a screen really requests for a file from the manifest */
export function usedUrl(path: string): string {
  if (path.startsWith("/assets/hero/hair/")) return `${path}?v=${ART_VER.hair}`;
  if (path.startsWith("/assets/hero/wear/")) return `${path}?v=${ART_VER.wear}`;
  if (path.startsWith("/assets/hero/")) return `${path}?v=${ART_VER.heroPart}`;
  if (path.startsWith("/assets/items/")) return `${path}?v=${ART_VER.items}`;
  return path;
}

export type Section = "core" | "home" | "yard" | "shop" | "bosses" | "locations";

function sectionOf(path: string): Section {
  const dir = path.split("/")[2] ?? "";
  if (path.startsWith("/bosses/") || dir === "arena") return "bosses";
  if (dir === "yard") return "yard";
  if (dir === "shop") return "shop";
  if (dir === "locations") return "locations";
  if (dir === "home" || dir === "pc") return "home";
  return "core"; // hero, items, ui, nav
}

/** the section a route belongs to (its pictures must be ready before it shows) */
export function sectionOfRoute(route: string): Section | null {
  if (route === "/") return "home";
  if (route.startsWith("/yard")) return "yard";
  if (route.startsWith("/shop")) return "shop";
  if (route.startsWith("/bosses")) return "bosses";
  if (route.startsWith("/locations")) return "locations";
  return null;
}

/** Hero art comes in many variants (6 skin tones × parts, 8 hair colours × hats): only the player's own are fetched. */
export interface LookLite { hair: string; hairColor: number; skin: number }
function wanted(path: string, look: LookLite | null): boolean {
  if (!look) return true;
  const skinDir = path.match(/^\/assets\/hero\/skin-(\d+)\//);
  if (skinDir) return Number(skinDir[1]) === look.skin;
  const hair = path.match(/^\/assets\/hero\/hair\/([a-z]+)-(\d+)/);
  if (hair) return hair[1] === look.hair && Number(hair[2]) === look.hairColor;
  return true;
}

export function urlsFor(sections: Section[] | "all", look: LookLite | null): string[] {
  return ASSET_FILES.filter((p) => (sections === "all" || sections.includes(sectionOf(p))) && wanted(p, look)).map(usedUrl);
}

const done = new Set<string>();
const pending = new Map<string, Promise<void>>();

function loadOne(url: string): Promise<void> {
  if (done.has(url)) return Promise.resolve();
  const p0 = pending.get(url);
  if (p0) return p0;
  const p = new Promise<void>((resolve) => {
    const img = new Image();
    const finish = () => {
      clearTimeout(timer);
      done.add(url); // a broken or slow picture must not lock the game: it counts as done either way
      pending.delete(url);
      resolve();
    };
    const timer = setTimeout(finish, 15_000);
    img.onload = () => (img.decode ? img.decode().catch(() => undefined).then(finish) : finish());
    img.onerror = finish;
    img.src = url;
  });
  pending.set(url, p);
  return p;
}

export const isLoaded = (urls: string[]) => urls.every((u) => done.has(u));

/** Downloads the pictures, 6 at a time; onProgress(done, total, url just finished) after each one. */
export async function preload(urls: string[], onProgress?: (n: number, total: number, url: string | null) => void): Promise<void> {
  const list = [...new Set(urls)];
  let n = list.filter((u) => done.has(u)).length;
  onProgress?.(n, list.length, null);
  const queue = list.filter((u) => !done.has(u));
  const worker = async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      await loadOne(u);
      onProgress?.(++n, list.length, u);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}
