"use client";
/**
 * «Как на телефоне» on a computer (Telegram Desktop / macOS / the web or a plain browser). Telegram gives a Mini App no
 * way to resize its window, so the game fits a phone screen into whatever window it has: the page is zoomed so that a
 * PHONE_W × PHONE_H screen fits the window (bigger or smaller), the column is phone-wide, and the viewport units the
 * CSS uses (--vh / --vw, globals.css) are given in the zoomed page's own pixels. Remembered on this device.
 */
import { tg } from "./telegram.ts";

export const PHONE_W = 390;
export const PHONE_H = 844;
const KEY = "xc-phone-mode";
const subs = new Set<() => void>();

/** a computer: the button is shown there only (on a phone the game is a phone already) */
export function phoneModeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = tg();
  if (w) return w.platform !== "ios" && w.platform !== "android";
  return !matchMedia("(pointer: coarse)").matches;
}

export function isPhoneMode(): boolean {
  try { return phoneModeAvailable() && localStorage.getItem(KEY) === "1"; } catch { return false; }
}

/** the page's zoom now (1 when the phone view is off): positions taken from the screen are divided by it */
export function uiZoom(): number {
  if (typeof document === "undefined") return 1;
  return Number(document.documentElement.dataset.zoom) || 1;
}

function apply() {
  const html = document.documentElement;
  if (!isPhoneMode()) {
    html.classList.remove("phone");
    html.style.removeProperty("zoom");
    html.style.removeProperty("--vh");
    html.style.removeProperty("--vw");
    delete html.dataset.zoom;
    return;
  }
  const W = window.innerWidth, H = window.innerHeight;
  const s = Math.min(W / PHONE_W, H / PHONE_H);
  html.classList.add("phone");
  html.style.setProperty("zoom", String(s));
  html.dataset.zoom = String(s);
  // the viewport as the zoomed page sees it (in its own CSS pixels)
  html.style.setProperty("--vh", `${H / s / 100}px`);
  html.style.setProperty("--vw", `${W / s / 100}px`);
}

/** a rect from the screen in the page's own CSS pixels (the phone view zooms the page) */
export function zoomRect(r: DOMRect): DOMRect {
  const z = uiZoom();
  return z === 1 ? r : new DOMRect(r.left / z, r.top / z, r.width / z, r.height / z);
}

let started = false;
/** once at start: applies the saved choice and follows the window's size */
export function initPhoneMode() {
  if (started || typeof window === "undefined") return;
  started = true;
  apply();
  window.addEventListener("resize", () => { if (isPhoneMode()) apply(); });
}

export function setPhoneMode(on: boolean) {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode */ }
  apply();
  subs.forEach((f) => f());
}

export function onPhoneModeChange(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
