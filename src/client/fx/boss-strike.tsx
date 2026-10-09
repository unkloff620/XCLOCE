"use client";
/*
 * The boss hits back (just for show — no damage): every few seconds he winds up and punches at the screen with one fist
 * (left and right in turn, sometimes twice). The arena gets "strike-l"/"strike-r" for STRIKE_MS (the rig's fist/arm or the
 * whole flat picture lunges, see screens.css "boss strikes"), and at the moment the punch lands the fight screen shakes,
 * the edges flash red and a comic burst pops where the fist "hits the glass", with a thump and a buzz.
 */
import { useEffect, useRef, useState } from "react";
import { sfx } from "../sound.ts";
import { haptic } from "../telegram.ts";

/** the whole wind-up → punch → back, ms (matches the CSS keyframes) */
export const STRIKE_MS = 900;
/** when inside the strike the punch lands, ms */
const LAND_MS = 470;
/** pause between strikes, ms */
const GAP_MIN = 5200;
const GAP_MAX = 9000;

export interface Impact { id: number; x: number; y: number; side: "l" | "r" }

export function useBossStrike(enabled: boolean) {
  const [side, setSide] = useState<"l" | "r" | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const next = useRef<"l" | "r">(Math.random() < 0.5 ? "l" : "r");
  const seq = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    const strike = (s: "l" | "r", then: () => void) => {
      setSide(s);
      later(() => {
        const id = ++seq.current;
        // the fist comes at the screen a little off-centre on its own side
        setImpact({ id, side: s, x: (s === "l" ? 30 : 70) + (Math.random() * 14 - 7), y: 46 + Math.random() * 16 });
        haptic.hit();
        sfx("hit", 0.25);
        later(() => setImpact((cur) => (cur?.id === id ? null : cur)), 650);
      }, LAND_MS);
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
      setImpact(null);
    };
  }, [enabled]);
  return { side, impact };
}

/** Red edges + a comic burst where the punch lands. */
export function StrikeFx({ impact }: { impact: Impact | null }) {
  if (!impact) return null;
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 26 : 50;
    return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`;
  }).join(" ");
  return (
    <div key={impact.id} className="strike-fx" aria-hidden="true">
      <div className="strike-vignette" />
      <svg className="strike-burst" viewBox="0 0 100 100" style={{ left: `${impact.x}%`, top: `${impact.y}%`, ["--r" as string]: `${impact.side === "l" ? -12 : 12}deg` }}>
        <polygon points={pts} fill="#ffd23f" stroke="#1e1006" strokeWidth="3.5" strokeLinejoin="round" />
        <polygon points={pts} fill="#ff4d6d" transform="translate(50 50) scale(0.62) translate(-50 -50)" />
        <text x="50" y="57" textAnchor="middle" fontSize="19" fontWeight="900" fill="#fff" stroke="#1e1006" strokeWidth="3" paintOrder="stroke">БАМ!</text>
      </svg>
      {/* cracks from the hit point */}
      <svg className="strike-crack" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ left: `${impact.x}%`, top: `${impact.y}%` }}>
        <path d="M50 50 L22 30 L10 34 M50 50 L78 22 L86 10 M50 50 L84 64 L96 62 M50 50 L40 86 L44 98 M50 50 L14 66" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}
