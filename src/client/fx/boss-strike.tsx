"use client";
/*
 * The boss hits back (just for show — no damage): every few seconds he winds up and punches at the screen with one fist
 * (left and right in turn, sometimes twice). The arena gets "strike-l"/"strike-r" for STRIKE_MS (the rig's fist/arm or the
 * whole flat picture lunges, see screens.css "boss strikes"). Only the fight itself: no burst, no shaking, no buzz.
 * Bosses that box on their own all the time (BOXERS) do not take part.
 */
import { useEffect, useRef, useState } from "react";

/** bosses whose rig boxes by itself (screens.css): no extra strikes on top */
export const BOXERS = new Set(["mugo"]);

/** the whole wind-up → punch → back, ms (matches the CSS keyframes) */
export const STRIKE_MS = 900;
/** pause between strikes, ms */
const GAP_MIN = 5200;
const GAP_MAX = 9000;

export function useBossStrike(enabled: boolean) {
  const [side, setSide] = useState<"l" | "r" | null>(null);
  const next = useRef<"l" | "r">(Math.random() < 0.5 ? "l" : "r");
  useEffect(() => {
    if (!enabled) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    const strike = (s: "l" | "r", then: () => void) => {
      setSide(s);
      later(() => {
        setSide(null);
        then();
      }, STRIKE_MS);
    };
    const loop = () => {
      later(() => {
        // not while the game is in the background
        if (typeof document !== "undefined" && document.hidden) return loop();
        const s = next.current;
        next.current = s === "l" ? "r" : "l";
        // now and then a quick one-two
        const combo = Math.random() < 0.25;
        strike(s, () => (combo ? later(() => strike(next.current, () => { next.current = next.current === "l" ? "r" : "l"; loop(); }), 120) : loop()));
      }, GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN));
    };
    loop();
    return () => {
      timers.forEach(clearTimeout);
      setSide(null);
    };
  }, [enabled]);
  return { side };
}
