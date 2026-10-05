"use client";
import { useEffect, useState } from "react";

/*
 * A short loading screen between sections: the screen goes grey and a spinner turns in the middle, no text.
 * Shown for at least MIN_MS so the next place has time to draw its pictures; it stays a little longer
 * (up to MAX_MS) while the pictures of the new screen are still decoding.
 * Starts on its own for the bottom menu and for the places of the yard (locations, shop, exchange);
 * code that navigates with router.push calls startRouteLoad() itself.
 */

const MIN_MS = 1000;
const MAX_MS = 4000;

let listener: ((from: string) => void) | null = null;
/** start the loading screen for a navigation that is about to happen */
export function startRouteLoad() {
  listener?.(window.location.pathname);
}

/** links that get the loading screen: the bottom menu and the yard's places */
function wantsLoader(a: HTMLAnchorElement, path: string): boolean {
  // the open tab of the bottom menu steps back inside its section — Nav starts the loader itself then
  if (a.closest(".nav")) return !a.classList.contains("on");
  return ["/locations", "/yard", "/shop", "/exchange"].some((p) => path === p || path.startsWith(p + "/"));
}

/** waits until the pictures on the screen are decoded (or the time runs out) */
async function picturesReady(limitMs: number) {
  const srcs = new Set<string>();
  document.querySelectorAll<HTMLImageElement>(".main img").forEach((i) => i.currentSrc && srcs.add(i.currentSrc));
  document.querySelectorAll<SVGImageElement>(".main image").forEach((i) => {
    const h = i.getAttribute("href");
    if (h) srcs.add(h);
  });
  const all = [...srcs].map((src) => {
    const im = new Image();
    im.src = src;
    return im.decode().catch(() => undefined);
  });
  await Promise.race([Promise.all(all), new Promise((r) => setTimeout(r, limitMs))]);
}

export function RouteLoader() {
  const [load, setLoad] = useState<{ from: string; at: number } | null>(null);

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
      if (wantsLoader(a, to)) setLoad({ from: window.location.pathname, at: Date.now() });
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
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const left = () => MAX_MS - (Date.now() - load.at);
    void (async () => {
      await wait(MIN_MS);
      // the new page is in place (the address changed), or the navigation never happened
      while (alive && window.location.pathname === load.from && left() > 0) await wait(50);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (left() > 0) await picturesReady(left());
      if (alive) setLoad(null);
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  if (!load) return null;
  return (
    <div className="route-loader" role="progressbar" aria-label="Загрузка">
      <span className="route-spin" />
    </div>
  );
}
