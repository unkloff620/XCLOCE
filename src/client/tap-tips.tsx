"use client";
/*
 * Tap tooltips for phones: a tap on anything with a `title` that does nothing by itself (a reward plaque, an icon,
 * a chip, a stat) shows that title in a small bubble above it — what a mouse shows on hover. One global listener,
 * so every `title` in the game works without extra code. Taps on buttons and links keep their normal action.
 * The bubble goes away on the next tap, a scroll, or after a few seconds. Mouse users keep the native hover hint.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const INTERACTIVE = "button, a, input, select, textarea, label, summary, [role=button], [role=link], [role=radio], [role=tab], [contenteditable]";
const SHOW_MS = 3200;

interface Tip { text: string; x: number; y: number; below: boolean }

export function TapTips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // only where there is no hover (phones, tablets): mice already get the native title
    const touch = () => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
    const hide = () => {
      setTip(null);
      if (timer.current) clearTimeout(timer.current);
    };
    const onClick = (e: MouseEvent) => {
      if (!touch()) return;
      const t = e.target as Element | null;
      if (!t || !(t instanceof Element)) return hide();
      const el = t.closest<HTMLElement | SVGElement>("[title]");
      // a tap on something clickable does its own thing
      if (!el || t.closest(INTERACTIVE)) return hide();
      const text = el.getAttribute("title")!.trim();
      if (!text) return hide();
      const r = el.getBoundingClientRect();
      const below = r.top < 70;
      setLeft(null);
      setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setTip(null), SHOW_MS);
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // keep the bubble inside the screen: measure it once it is drawn
  useEffect(() => {
    if (!tip || !bubble.current) return;
    const w = bubble.current.offsetWidth;
    const pad = 8;
    setLeft(Math.max(pad, Math.min(window.innerWidth - w - pad, tip.x - w / 2)));
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div ref={bubble} className={`tap-tip ${tip.below ? "below" : ""}`} role="tooltip"
      style={{ left: left ?? tip.x, top: tip.y, visibility: left === null ? "hidden" : "visible", ["--ax" as string]: `${tip.x - (left ?? tip.x)}px` }}>
      {tip.text}
    </div>,
    document.body,
  );
}
