"use client";
import { Tumbleweed } from "./tumbleweed.tsx";
import { useEffect, useState } from "react";

/** pages still waiting for their data (usePageReady): the loading screen stays until every one is ready */
const waiting = new Set<symbol>();
/** a page says whether its data is in; while not, a section change keeps its loading screen up */
export function usePageReady(ready: boolean) {
  useEffect(() => {
    if (ready) return;
    const k = Symbol("page");
    waiting.add(k);
    return () => { waiting.delete(k); };
  }, [ready]);
}

/*
 * Screens open already drawn (the user 2026-11-27): on a move to another screen the new screen stays hidden until its
 * pictures (the ones on the screen, not far below it) are downloaded and decoded — then it shows whole. If that takes
 * longer than SHOW_AFTER_MS, the loading screen (the yard at dusk with the tumbleweed and a spinner) covers it meanwhile;
 * a quick move shows no loader at all. Pictures the screen puts in a moment later (drawn from its data) are waited for
 * too. Decoded pictures are kept (KEEP of them), so going back to a screen shows it at once.
 * Every in-game link starts it on its own; code that navigates with router.push calls startRouteLoad() itself.
 */
const SHOW_AFTER_MS = 300;
const MAX_MS = 9000;

let listener: ((from: string) => void) | null = null;
/** start the loading screen for a navigation that is about to happen */
export function startRouteLoad() {
  listener?.(window.location.pathname);
}

/** links that wait for their screen: every in-game link (the bottom menu's open tab steps back — Nav starts it itself) */
function wantsLoader(a: HTMLAnchorElement): boolean {
  if (a.closest(".nav")) return !a.classList.contains("on");
  return !a.hasAttribute("data-no-loader");
}

/** decoded pictures kept alive (the browser may drop a decoded picture nobody holds — it would flash again) */
const KEEP = 400;
const kept = new Map<string, HTMLImageElement>();
function decodeOne(src: string): Promise<unknown> {
  const had = kept.get(src);
  if (had) {
    kept.delete(src);
    kept.set(src, had);
    return had.complete ? Promise.resolve() : had.decode().catch(() => undefined);
  }
  const im = new Image();
  im.src = src;
  kept.set(src, im);
  if (kept.size > KEEP) kept.delete(kept.keys().next().value as string);
  return im.decode().catch(() => undefined);
}

/** the pictures on the screen now (the ones within a screen's height below the top — not a long list's far end) */
function screenPictures(): string[] {
  const srcs = new Set<string>();
  const near = window.innerHeight * 1.5;
  const onScreen = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.bottom > -50 && r.top < near && r.width > 0 && r.height > 0;
  };
  document.querySelectorAll<HTMLImageElement>(".main img").forEach((i) => {
    const src = i.currentSrc || i.src;
    if (src && onScreen(i)) srcs.add(src);
  });
  document.querySelectorAll<SVGImageElement>(".main image").forEach((i) => {
    const h = i.getAttribute("href");
    if (h && onScreen(i)) srcs.add(h);
  });
  return [...srcs];
}

/** waits until the screen's pictures are decoded — and the ones it puts in a moment later too (or the time runs out) */
async function picturesReady(deadline: number) {
  const seen = new Set<string>();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let round = 0; round < 6 && Date.now() < deadline; round++) {
    const fresh = screenPictures().filter((s) => !seen.has(s));
    if (!fresh.length && round > 0) return;
    fresh.forEach((s) => seen.add(s));
    await Promise.race([Promise.all(fresh.map(decodeOne)), wait(Math.max(0, deadline - Date.now()))]);
    await wait(40);
  }
}

export function RouteLoader() {
  const [load, setLoad] = useState<{ from: string; at: number } | null>(null);
  const [cover, setCover] = useState(false);

  useEffect(() => {
    listener = (from) => setLoad({ from, at: Date.now() });
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/")) return;
      const to = new URL(href, window.location.href).pathname;
      if (to === window.location.pathname) return;
      if (wantsLoader(a)) setLoad({ from: window.location.pathname, at: Date.now() });
    };
    document.addEventListener("click", click, true);
    return () => {
      listener = null;
      document.removeEventListener("click", click, true);
    };
  }, []);

  useEffect(() => {
    if (!load) return;
    let alive = true;
    const root = document.documentElement;
    // the new screen stays hidden until it is whole; the loader only if that takes a while
    root.classList.add("routing");
    const coverT = setTimeout(() => alive && setCover(true), SHOW_AFTER_MS);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const deadline = load.at + MAX_MS;
    void (async () => {
      // the new page is in place (the address changed) — or the move never happened (a link that did something else):
      // then the old screen comes back after a while
      const moveBy = load.at + 4000;
      while (alive && window.location.pathname === load.from && Date.now() < moveBy) await wait(30);
      // the new page's data (the boss list…), then its pictures (the cards drawn from that data)
      await wait(20);
      while (alive && waiting.size > 0 && Date.now() < deadline) await wait(40);
      await wait(30); // let the new screen put its pictures in
      if (alive) await picturesReady(deadline);
      if (!alive) return;
      root.classList.remove("routing");
      setCover(false);
      setLoad(null);
    })();
    return () => {
      alive = false;
      clearTimeout(coverT);
      root.classList.remove("routing");
    };
  }, [load]);

  if (!load || !cover) return null;
  return (
    <div className="route-loader" role="progressbar" aria-label="Загрузка">
      {/* the same yard at dusk as the game's loading, the tumbleweed blown over it */}
      <Tumbleweed inside />
      <span className="route-spin" />
    </div>
  );
}
