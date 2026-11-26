"use client";
/*
 * Химик (the 16th boss, the third «Отморозок», tools/boss/assemble-himik.py; the user 2026-11-26): a mad old chemist in a lab
 * coat with a round flask of poison in his right glove (the left of the picture) and a narrow test tube in his left. The
 * puppet (boss-puppet.ts) bends the legs (only the feet stay: a crouch bends the knees), the body, the arms at the shoulders
 * and the elbows, and the coat's two halves — their tails below the belt swing on their own (hm-hem, the pose engine's
 * hem). The poison is drawn here, between each glass's solid copy and its 70 % one (the artist's two layers): a liquid
 * in the glass's own inside (poisonR-mask / poisonL-mask) whose surface waves and stays level however the glass turns
 * (--tR / --tL: the hand's whole turn, undone), with bubbles going up. The pose engine (boss-poses.ts POSES.himik) shakes
 * the glasses, brings the tube to his neck and swirls it there, raises the flask and throws the poison out of it (the
 * class hm-splash: a burst of green drops off the flask's mouth, useSplash). The face is plain SVG: the mask over the
 * mouth (above half HP; below it hangs off his ear and the mouth shows), the jaw drops, the brows frown, the eyes look
 * about and blink.
 */
import { useEffect, useId, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string };
type Rig = { w: number; h: number; parts: Record<string, Part> };

/** the eye holes of the head (rig units): his right eye (the left of the picture), his left */
const HOLES = [{ x: 355.5, y: 162, w: 23.5, h: 14 }, { x: 414.5, y: 161, w: 24, h: 14 }];
const SKIN = "#fda96c";
const LID_LINE = "#6a3018";
/** the waist: the upper body leans round it; the coat's tails swing from the belt */
const WAIST = [400, 640] as const;
const HEM = [400, 520] as const;
/** the round flask's mouth (rig units, as drawn): the poison flies out of it */
const FLASK_MOUTH = [89.7, 659.5] as const;
/** where each glove holds its glass (rig units): the glass swings round it */
const GRIP = { R: [92, 700], L: [548, 700] } as const;
/** how full the glasses are: the poison's surface (rig y, as drawn) */
const LEVEL = { R: 738, L: 708 } as const;
const POISON = { top: "#9dff3a", mid: "#46d10f", deep: "#167a0a", line: "#e2ffa8" };

/** the parts drawn beaten below half HP (tools/boss/beaten-blood.py), and their pictures" version */
const BEATEN = new Set(["armL", "armR", "body", "chin", "coatL", "coatR", "fingersR", "handR", "head", "legs", "lowL", "lowR", "neck", "thumbR"]);
const BEATEN_V = 1;

/** the brows: the gap between them (rig x), each one's outer end (it turns round it) */
const BROW_GAP = 395.5;
const BROW_OUT = { l: [342, 166], r: [451, 161] } as const;
export function HimikRig({ id, look, rig, bust, dazed, dying, svgRef, wrapRef, puppet, viewBox }: {
  id: string; look: string; rig: Rig; bust: boolean; dazed: boolean; dying: boolean; svgRef: RefObject<SVGSVGElement | null>; wrapRef: RefObject<HTMLDivElement | null>; puppet: boolean; viewBox: string;
}) {
  const P = rig.parts;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const handR = useRef<SVGGElement>(null);
  const splash = useRef<SVGGElement>(null);
  useSplash(svgRef, handR, splash, !bust);
  // below half HP: beaten — blood, cuts, bruises, torn clothes (tools/boss/beaten-blood.py, <part>-blood.webp)
  const src = (p: string) => dazed && !bust && BEATEN.has(p) ? `/bosses/${id}/rig/${p}-blood.webp?v=${BEATEN_V}` : `/bosses/${id}/rig/${p}.webp${P[p]?.v ? `?v=${P[p].v}` : ""}`;
  // a picture: plain SVG, or warped by the puppet on the back / front canvas; follow: [the groups, their bands]
  const pic = (p: string, pp?: "back" | "front", follow?: [string, string]) => {
    const r = P[p];
    if (!r) return null;
    const on = puppet && pp;
    return <image className={on ? "pp" : undefined} data-pp={on ? pp : undefined} data-pp-body={on && p === "body" ? "1" : undefined}
      data-pp-follow={on && follow ? follow[0] : undefined} data-pp-follow-at={on && follow ? follow[1] : undefined}
      href={src(p)} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />;
  };
  const at = (x: number, y: number): CSSProperties => ({ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" });
  const origin = (p: string): CSSProperties => { const pv = P[p]?.pivot ?? [rig.w / 2, rig.h]; return at(pv[0], pv[1]); };
  const box = (p: string, fx: number, fy: number): CSSProperties => { const r = P[p]; return r ? at(r.x + r.w * fx, r.y + r.h * fy) : {}; };
  const bone = (cls: string, p: string, kids: ReactNode, size?: number, ref?: RefObject<SVGGElement | null>) => (
    <g className={cls} ref={ref} data-pivot={P[p]?.pivot ? `${P[p].pivot![0]},${P[p].pivot![1]}` : undefined} data-pp-size={size} style={origin(p)}>{kids}</g>
  );
  // the poison in a glass: its inside as a mask, a liquid whose surface stays level (the group turns back by the hand's
  // turn) and waves (two wave strips sliding), bubbles going up
  const poison = (side: "R" | "L") => {
    const m = P[`poison${side}-mask`];
    if (!m) return null;
    const lv = LEVEL[side];
    const cx = m.x + m.w / 2;
    const x0 = m.x - 90, x1 = m.x + m.w + 90, bottom = m.y + m.h + 90;
    // the surface: a row of soft humps len wide, amp high, from far left to far right (it slides by one len, endlessly)
    const top = (amp: number, len: number, dy: number) => {
      let d = `M${x0} ${lv + dy}`;
      for (let x = x0, k = 0; x <= x1 + len; x += len / 2, k++) d += ` Q${(x + len / 4).toFixed(1)} ${(lv + dy + (k % 2 ? amp : -amp)).toFixed(1)} ${(x + len / 2).toFixed(1)} ${lv + dy}`;
      return d;
    };
    const wave = (amp: number, len: number, dy: number) => `${top(amp, len, dy)} L${x1 + len} ${bottom} L${x0} ${bottom} Z`;
    const mid = `hm-m${side}${uid}`, gid = `hm-g${side}${uid}`;
    return (
      <g className={`hm-poison hm-poison-${side.toLowerCase()}`}>
        <defs>
          <mask id={mid} maskUnits="userSpaceOnUse" x={m.x - 4} y={m.y - 4} width={m.w + 8} height={m.h + 8}>
            <image href={src(`poison${side}-mask`)} x={m.x} y={m.y} width={m.w} height={m.h} preserveAspectRatio="none" />
          </mask>
          <linearGradient id={gid} x1="0" y1={lv - 6} x2="0" y2={m.y + m.h} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={POISON.top} />
            <stop offset="0.35" stopColor={POISON.mid} />
            <stop offset="1" stopColor={POISON.deep} />
          </linearGradient>
        </defs>
        <g mask={`url(#${mid})`}>
          <g className={`hm-liq hm-liq-${side.toLowerCase()}`} style={at(cx, lv)}><g className={`hm-lvl hm-lvl-${side.toLowerCase()}`}>
            <g className="hm-wave hm-wave-back"><path d={wave(2.2, 22, -1.5)} fill={POISON.deep} opacity={0.75} /></g>
            <g className="hm-wave hm-wave-front"><path d={wave(1.8, 18, 0.5)} fill={`url(#${gid})`} /><path d={top(1.8, 18, 0.5)} fill="none" stroke={POISON.line} strokeWidth={1.1} opacity={0.8} /></g>
            {[0, 1, 2, 3, 4].map((i) => (
              <circle key={i} className="hm-bub" cx={cx + (i - 2) * (m.w / 7)} cy={m.y + m.h - 4} r={1.2 + (i % 3) * 0.6}
                fill="rgba(230,255,200,0.75)" style={{ animationDelay: `${(i * 0.53) % 2.4}s`, ["--rise" as string]: `${(m.y + m.h - lv - 6).toFixed(1)}px` }} />
            ))}
          </g></g>
        </g>
      </g>
    );
  };
  const svgEl = (
    <svg key={look} ref={svgRef} className={`boss-rig rig-hm ${dazed ? "dazed" : ""} ${dying ? "dying" : ""}`} viewBox={viewBox} width="100%" height="100%"
      preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      <g className="hm-root" style={at(rig.w / 2, rig.h - 20)}>
        {/* the legs: the feet stay planted, the hips go with the upper body — a crouch bends the knees */}
        {pic("legs", "back", ["br-up", "0.25,0.72"])}
        <g className="br-up" style={at(WAIST[0], WAIST[1])}>
          {pic("neck", "back")}
          {pic("body", "back")}
          {/* his right arm (the flask's, on the left of the picture): the sleeve under the coat (an empty elbow in it — its end
              bends with the forearm); the forearm with the flask is in front of the coat, below */}
          {bone("br-arm br-arm-r", "armR", <>{pic("armR", "back")}{bone("br-low br-low-r", "lowR", null, 110)}</>, 130)}
          {/* the lab coat's halves over it: the tails below the belt swing with an empty group (the pose engine's hem) */}
          <g className="hm-hem" style={at(HEM[0], HEM[1])} />
          {pic("coatR", "back", ["hm-hem", "0.98,0.3"])}
          {pic("coatL", "back", ["hm-hem", "0.98,0.3"])}
          {/* the face: the mouth inside (the throat, the teeth, the chin that drops), the whites and the pupils under the
              head's eye holes, the lids, the head, the beard, the brows, the mask — on the face, or off it on the ear */}
          {bone("br-head", "head", <>
            {pic("throat")}
            {/* the upper teeth: in the head's mouth hole, with the head (the upper jaw) */}
            {pic("teeth-up")}
            {pic("eyes")}
            <g className="hm-pupils">{pic("pupils")}</g>
            <g className="hm-lids">
              {HOLES.map((h, i) => (
                <g key={i} style={at(h.x, h.y - 1)}>
                  <rect x={h.x - 2} y={h.y - 2} width={h.w + 4} height={h.h + 3} fill={SKIN} />
                  <rect x={h.x - 2} y={h.y + h.h - 0.2} width={h.w + 4} height={1.3} fill={LID_LINE} />
                </g>
              ))}
            </g>
            {pic("head")}
            {/* the lower teeth over the head, the lower lip and the little tuft under it («mustache», the soul patch): all
                drop with the jaw */}
            <g className="hm-jaw">{pic("teeth-low")}{pic("chin")}{pic("mustache")}</g>
            <g className="hm-beard" style={box("beard", 0.5, 0.15)}>{pic("beard")}</g>
            {/* the brows, each on its own (the picture twice, clipped at the gap between them): below half HP their inner
                ends go up — he looks sad — each turning round its outer end */}
            <g className="hm-brows" style={box("brows", 0.5, 0.5)}>
              <defs>
                <clipPath id={`hm-bl${uid}`}><rect x={BROW_GAP - 200} y={0} width={200} height={400} /></clipPath>
                <clipPath id={`hm-br${uid}`}><rect x={BROW_GAP} y={0} width={200} height={400} /></clipPath>
              </defs>
              <g className="hm-brow-l" style={at(BROW_OUT.l[0], BROW_OUT.l[1])}><g clipPath={`url(#hm-bl${uid})`}>{pic("brows")}</g></g>
              <g className="hm-brow-r" style={at(BROW_OUT.r[0], BROW_OUT.r[1])}><g clipPath={`url(#hm-br${uid})`}>{pic("brows")}</g></g>
            </g>
            <g className="hm-mask" style={box("mask", 0.5, 0.1)}>{pic("mask")}</g>
            {/* off the face it hangs on the ear: a soft spring of its own (the pose engine's «hair») swings it on his jerks */}
            <g className="hm-mask-ear" style={box("maskEar", 0.6, 0.02)}><g className="hm-mask-j" style={box("maskEar", 0.6, 0.02)}>{pic("maskEar")}</g></g>
          </>, 150)}
          {/* his right forearm in front of the coat (the user 2026-11-26): the rolled cuff, the glove's palm, the round flask
              (the solid glass, the poison, the glass over it), the thumb and the fingers round it */}
          {bone("br-arm br-arm-r", "armR", bone("br-low br-low-r", "lowR", <>{pic("lowR")}{bone("br-hand br-hand-r", "handR", <>
            {pic("handR")}
            {/* the flask sits loose in the glove: it swings a little round the grip (--lR, the pose engine's hmLoose) */}
            <g className="hm-loose-r" style={at(GRIP.R[0], GRIP.R[1])}>
              {pic("flaskR")}
              {poison("R")}
              <g className="hm-glass">{pic("flaskR-glass")}</g>
            </g>
            {pic("thumbR")}
            {pic("fingersR")}
          </>, 90, handR)}</>, 110), 130)}
          {/* his left arm over the coat: the sleeve, the forearm with the glove — the test tube under its fingers */}
          {bone("br-arm br-arm-l", "armL", <>
            {/* the sleeve on the back canvas (over the coat, it is drawn after it): the tube raised to the neck stays over it */}
            {pic("armL", "back")}
            {bone("br-low br-low-l", "lowL", <>
              <g className="hm-loose-l" style={at(GRIP.L[0], GRIP.L[1])}>
                {pic("tube")}
                {poison("L")}
                <g className="hm-glass">{pic("tube-glass")}</g>
              </g>
              {pic("lowL", "front")}
            </>, 120)}
          </>, 130)}
        </g>
      </g>
      {!puppet && <g ref={splash} className="hm-splash-fx" />}
    </svg>
  );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={look} className="br-pup rig-hm-pup">
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
      <svg className="br-pup-over" viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <g ref={splash} className="hm-splash-fx" />
      </svg>
    </div>
  );
}

/**
 * The poison thrown out of the flask: when the pose engine puts hm-splash on the rig, a burst of green drops and long
 * streaks flies off the flask's mouth along its swing, falls and fades. The mouth is read off the hand's group every frame.
 */
function useSplash(svgRef: RefObject<SVGSVGElement | null>, handRef: RefObject<SVGGElement | null>, layerRef: RefObject<SVGGElement | null>, on: boolean) {
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const NS = "http://www.w3.org/2000/svg";
    type Drop = { el: SVGElement; x: number; y: number; vx: number; vy: number; r: number; life: number; age: number; streak: boolean; grow: number };
    const drops: Drop[] = [];
    let raf = 0, last = 0, was = false;
    let prev: [number, number] | null = null;
    let vel: [number, number] = [0, -1];
    const mouth = (): [number, number] | null => {
      const svg = svgRef.current, hand = handRef.current;
      const a = svg?.getScreenCTM(), b = hand?.getScreenCTM();
      if (!a || !b) return null;
      const m = a.inverse().multiply(b);
      return [m.a * FLASK_MOUTH[0] + m.c * FLASK_MOUTH[1] + m.e, m.b * FLASK_MOUTH[0] + m.d * FLASK_MOUTH[1] + m.f];
    };
    const add = (x: number, y: number, vx: number, vy: number, r: number, life: number, streak: boolean, grow = 0) => {
      const layer = layerRef.current;
      if (!layer) return;
      const el = document.createElementNS(NS, streak ? "line" : "circle");
      el.setAttribute("fill", Math.random() < 0.66 ? "#6be832" : "#b6ff6e");
      el.setAttribute("stroke", Math.random() < 0.5 ? "#3fb81c" : "#8cf24a");
      el.setAttribute("stroke-linecap", "round");
      el.setAttribute("stroke-width", streak ? r.toFixed(2) : "0.8");
      el.setAttribute("style", "filter: drop-shadow(0 0 3px rgba(140,255,80,0.8))");
      layer.appendChild(el);
      drops.push({ el, x, y, vx, vy, r, life, age: 0, streak, grow });
    };
    // at us: the poison flies out of the mouth towards the screen — the drops spread all round and grow as they come
    const burst = (p: [number, number]) => {
      for (let i = 0; i < 38; i++) {
        const a = Math.random() * Math.PI * 2, s = 140 + Math.random() * 380;
        add(p[0], p[1], Math.cos(a) * s + vel[0] * 0.15, Math.sin(a) * s * 0.8 - 160, 2 + Math.random() * 4, 0.55 + Math.random() * 0.45, i < 8, 2.5 + Math.random() * 4);
      }
    };
    // pouring: a thin stream off the mouth, falling
    const pour = (p: [number, number]) => {
      for (let i = 0; i < 2; i++) add(p[0] + (Math.random() - 0.5) * 3, p[1], 25 + (Math.random() - 0.5) * 30, 40 + Math.random() * 40, 1.6 + Math.random() * 1.6, 0.9, i === 0);
    };
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (document.hidden) { last = 0; return; }
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      const p = mouth();
      if (p && prev && dt > 0) vel = [(p[0] - prev[0]) / dt * 0.5 + vel[0] * 0.5, (p[1] - prev[1]) / dt * 0.5 + vel[1] * 0.5];
      prev = p;
      const now = !!svgRef.current?.classList.contains("hm-splash");
      if (now && !was && p) burst(p);
      if (p && svgRef.current?.classList.contains("hm-pour")) pour(p);
      was = now;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.age += dt;
        d.vy += (d.grow ? 450 : 1000) * dt;
        d.vx *= 1 - 1.2 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const k = 1 - d.age / d.life;
        if (k <= 0) { d.el.remove(); drops.splice(i, 1); continue; }
        d.el.setAttribute("opacity", Math.min(1, k * 1.6).toFixed(2));
        const g = 1 + d.grow * (d.age / d.life);
        if (d.streak) {
          d.el.setAttribute("stroke-width", (d.r * g).toFixed(2));
          d.el.setAttribute("x1", d.x.toFixed(1)); d.el.setAttribute("y1", d.y.toFixed(1));
          d.el.setAttribute("x2", (d.x - d.vx * 0.05).toFixed(1)); d.el.setAttribute("y2", (d.y - d.vy * 0.05).toFixed(1));
        } else {
          d.el.setAttribute("cx", d.x.toFixed(1)); d.el.setAttribute("cy", d.y.toFixed(1)); d.el.setAttribute("r", (d.r * g).toFixed(2));
        }
      }
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); for (const d of drops) d.el.remove(); };
  }, [svgRef, handRef, layerRef, on]);
}
