"use client";
/*
 * Art preloading: the game shows only after its pictures are downloaded, and a section (yard, shop, bosses…)
 * opens only after its own pictures are there — no half-drawn scenes.
 * The URL must be exactly the one the screen uses (the browser caches by full URL, query included),
 * so the cache-busting versions live here and the screens take them from here.
 */
import { ASSET_FILES } from "./asset-manifest.ts";
import { ROOM_BACKDROP, ROOM_BG } from "../content/home-scene.ts";

/** cache-busting versions of redrawn art (bump when the picture changes) */
export const ART_VER = { heroPart: 7, hair: 7, wear: 11, items: 11, pepe: 2, tattoo: 7 } as const;

/** the URL a screen really requests for a file from the manifest */
export function usedUrl(path: string): string {
  if (path.startsWith("/assets/hero/hair/")) return `${path}?v=${ART_VER.hair}`;
  if (path.startsWith("/assets/hero/wear/")) return `${path}?v=${ART_VER.wear}`;
  if (path.startsWith("/assets/hero/tattoo/")) return `${path}?v=${ART_VER.tattoo}`;
  if (path.startsWith("/assets/hero/")) return `${path}?v=${ART_VER.heroPart}`;
  if (path.startsWith("/assets/items/")) return `${path}?v=${ART_VER.items}`;
  if (path.startsWith("/bosses/pepe/")) return `${path}?v=${ART_VER.pepe}`;
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
  if (route.startsWith("/bosses") || route.startsWith("/event")) return "bosses";
  if (route.startsWith("/locations")) return "locations";
  return null;
}

/** Hero art comes in many variants (6 skin tones × parts, 8 hair colours × hats): only the player's own are fetched. */
export interface LookLite { hair: string; hairColor: number; skin: number; /** inked tattoos: their pictures load at entry */ tattoos?: string[] }
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

/** pictures the home screen does not need at once: they come in the background after the game shows */
const LATER = ["/assets/hero/tattoo/", "/assets/items/", "/assets/stash/", "/assets/talents/", "/assets/slots/", "/assets/upgrader/", "/assets/cards/", "/assets/chips/", "/assets/door/", "/assets/updates/"];
/**
 * What the game waits for on entry: the hero, the interface and the home (+ today's «Что нового» pictures);
 * everything else (laterUrls) loads in the background — a section still opens only once its own pictures are there.
 */
/** of the home rooms' pictures only the player's own room is needed at once */
function otherRoom(p: string, room: string) {
  if (!/^\/assets\/home\/(room-|[a-z0-9]+-sky)/.test(p)) return false;
  const mine = [ROOM_BG[room] ?? ROOM_BG.basic, ROOM_BACKDROP[room] ?? ROOM_BACKDROP.basic, `${room}-sky`];
  return !mine.some((n) => p === `/assets/home/${n}.webp`);
}
export function entryUrls(look: LookLite | null, today: string, room: string): string[] {
  return ASSET_FILES.filter((p) => ["core", "home"].includes(sectionOf(p)) && wanted(p, look) && !otherRoom(p, room)
    && (!LATER.some((d) => p.startsWith(d)) || p.startsWith(`/assets/updates/${today}`) || (look?.tattoos ?? []).some((t) => p === `/assets/hero/tattoo/${t}.webp`))).map(usedUrl);
}
/** what a section's screen waits for (the home: only the player's own room) */
export function sectionUrls(section: Section, look: LookLite | null, room: string): string[] {
  return ASSET_FILES.filter((p) => sectionOf(p) === section && wanted(p, look) && !(section === "home" && otherRoom(p, room))).map(usedUrl);
}
/** everything else, the hero's own variants only (it is fetched after the game has shown) */
export function laterUrls(look: LookLite | null): string[] {
  return urlsFor("all", look).filter((u) => !done.has(u));
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

/** Downloads the pictures, `lanes` at a time (6); onProgress(done, total, url just finished) after each one. */
export async function preload(urls: string[], onProgress?: (n: number, total: number, url: string | null) => void, lanes = 6): Promise<void> {
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
  await Promise.all(Array.from({ length: lanes }, worker));
}
