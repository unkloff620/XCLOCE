"use client";
import { useEffect } from "react";

/*
 * Horizontal strips (the upgrader's «Что поставить», the inventory filters, item rows…) scroll by touch on a phone,
 * but a mouse has no sideways wheel and their scrollbars are hidden — in Telegram Desktop they could not be scrolled
 * at all. Here, for the whole app: the mouse wheel over such a strip scrolls it sideways, and the strip can be dragged
 * with the mouse (a drag does not count as a click on the button under it).
 */
function hStrip(from: EventTarget | null): HTMLElement | null {
  let el = from instanceof Element ? (from as HTMLElement) : null;
  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 2) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") return el;
    }
    el = el.parentElement;
  }
  return null;
}
function vScrolls(el: HTMLElement): boolean {
  const oy = getComputedStyle(el).overflowY;
  return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 2;
}

export function HorizontalScroll() {
  useEffect(() => {
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // pinch, or a real sideways scroll
      const el = hStrip(e.target);
      if (!el || vScrolls(el)) return;
      const max = el.scrollWidth - el.clientWidth;
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return; // at the end: let the page scroll on
      e.preventDefault();
      el.scrollLeft = next;
    };
    let drag: { el: HTMLElement; x: number; left: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const el = hStrip(e.target);
      if (el) drag = { el, x: e.clientX, left: el.scrollLeft, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      drag.moved = true;
      drag.el.scrollLeft = drag.left - dx;
    };
    const up = () => {
      if (drag?.moved) {
        // swallow the click that ends a drag
        const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 50);
      }
      drag = null;
    };
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
  return null;
}
