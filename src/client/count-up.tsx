"use client";
import { useEffect, useRef, useState } from "react";

/**
 * A number that does not jump: when the value changes, the digits run up (or down) to the new value
 * (the HUD's money and authority). First render — shown as is; a gain also glows gold for a moment.
 */
export function CountUp({ value, format, className = "num" }: { value: number; format: (v: number) => string; className?: string }) {
  const [shown, setShown] = useState(value);
  const [dir, setDir] = useState<"" | "up" | "down">("");
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    cancelAnimationFrame(raf.current);
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { from.current = value; setShown(value); return; }
    // bigger changes run a little longer: 0.6–1.6 s
    const diff = Math.abs(value - start);
    const ms = Math.min(1600, 600 + Math.log10(diff + 1) * 160);
    const t0 = performance.now();
    setDir(value > start ? "up" : "down");
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3); // ease-out: fast at first, slows down to the number
      const v = k >= 1 ? value : start + (value - start) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else setDir("");
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <b className={`${className} count-up ${dir}`}>{format(shown)}</b>;
}
