"use client";
/*
 * Animated boss built from the artist's layers (tools/boss/build-boss.py): body breathes, head sways around the neck,
 * fists bob in a guard around the elbows, eyes blink. Bosses without a rig use their flat picture.
 * Bosses with a full face (pupils, brows, mouth layers) also look around and react to hits: the arena gets the
 * class "ouch" for a moment — angry brows turn into sad ones and the grin into a closed mouth.
 * Below half HP a boss with a "<id>-beaten" rig (tools/boss/align-variant.py) switches to its beaten look.
 * Bosses with whole arms (armL/armR + handL/handR, Гаркуша): the arm swings at the shoulder and the hand turns at the wrist
 * inside it; the irises are clipped to the eye whites so they can look around.
 * Puppet-warped sequences (Мугонатор: brows and the lower jaw, tools/boss/assemble-mugo.py) come as one strip of frames;
 * the frame on show steps along a schedule (FRAME_SEQ) — idle, when he is hit ("ouch") and when he punches ("strike").
 * A tail sways behind the body; the far arm of a boss listed in BEHIND is drawn behind the body. Arms in three pieces
 * (shoulder → forearm at the elbow → fist at the wrist) box: see screens.css "Мугонатор".
 */
import type { CSSProperties } from "react";
import { BOSS_RIGS } from "./boss-rig-data.ts";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number };

/** bosses whose far arm (R or L) goes behind the body */
const BEHIND: Record<string, "L" | "R"> = { mugo: "R" };

/** frame schedules of the puppet strips: [frame, ms] — idle loops, ouch/strike play once */
const FRAME_SEQ: Record<string, Record<"idle" | "ouch" | "strike", [number, number][]>> = {
  // a grin now and then: the jaw drops in two chuckles and closes
  jaw: {
    idle: [[0, 4200], [1, 70], [2, 70], [3, 90], [2, 70], [1, 70], [2, 70], [3, 90], [4, 160], [3, 80], [2, 70], [1, 70], [0, 600]],
    ouch: [[2, 50], [3, 50], [4, 800], [3, 80], [2, 80], [1, 80], [0, 60]],
    strike: [[1, 50], [2, 50], [3, 50], [4, 520], [3, 80], [2, 60], [1, 60], [0, 30]],
  },
  // a smug lift of the brows, later a short frown
  brows: {
    idle: [[0, 2600], [1, 80], [2, 900], [1, 80], [0, 2400], [3, 80], [4, 700], [3, 80], [0, 500]],
    ouch: [[1, 50], [2, 1100], [1, 80], [0, 70]],
    strike: [[3, 60], [4, 760], [3, 80], [0, 0]],
  },
};

/** a boss's own schedules (one loop in step with his CSS round): Мугонатор frowns and grunts while he boxes (3 s), then chuckles */
const FRAME_SEQ_BY_BOSS: Record<string, Partial<Record<string, [number, number][]>>> = {
  mugo: {
    // in step with the jabs (screens.css "he boxes"): the mouth opens on each hit, then breathes in the pause
    jaw: [[0, 430], [2, 150], [0, 450], [2, 150], [0, 450], [2, 150], [0, 450], [2, 150], [0, 450], [2, 150],
      [0, 1000], [1, 70], [2, 70], [3, 100], [2, 70], [1, 70], [2, 70], [3, 100], [2, 80], [1, 70], [0, 320]],
    brows: [[3, 80], [4, 3140], [3, 80], [0, 200], [1, 80], [2, 900], [1, 80], [0, 440]],
  },
};

function seqKeyframes(name: string, w: number, seq: [number, number][]) {
  const total = seq.reduce((t, [, ms]) => t + ms, 0) || 1;
  let at = 0;
  const steps = seq.map(([f, ms]) => {
    const k = `${((at / total) * 100).toFixed(3)}% { transform: translateX(${-f * w}px); }`;
    at += ms;
    return k;
  });
  return { css: `@keyframes ${name} { ${steps.join(" ")} 100% { transform: translateX(${-seq[seq.length - 1][0] * w}px); } }`, ms: total };
}

export function hasBossRig(id: string): boolean {
  return id in BOSS_RIGS;
}

/** HP share (0..1) below which the beaten look is shown. */
export const BEATEN_BELOW = 0.5;

export function BossRig({ id: baseId, hpShare = 1 }: { id: string; hpShare?: number }) {
  const id = hpShare < BEATEN_BELOW && `${baseId}-beaten` in BOSS_RIGS ? `${baseId}-beaten` : baseId;
  const rig = BOSS_RIGS[id];
  if (!rig) return null;
  const P = rig.parts;
  const img = (p: string, extra?: string) => {
    const r: Part | undefined = P[p];
    return r ? <image className={extra} href={`/bosses/${id}/rig/${p}.webp`} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" /> : null;
  };
  const origin = (p: string) => {
    const pv = P[p]?.pivot ?? [rig.w / 2, rig.h];
    return { transformOrigin: `${pv[0]}px ${pv[1]}px`, transformBox: "view-box" as const };
  };
  // the punch at the screen (class "strike-l/r" on the arena): which way the limb turns around its joint so the fist
  // goes towards the middle (a fist above/below the joint swings sideways; a fist beside it goes up)
  const tilt = (limb: string, fist: string, deg: number): CSSProperties => {
    const pv = P[limb]?.pivot;
    const f = P[fist] ?? P[limb];
    if (!pv || !f) return {};
    const dx = f.x + f.w / 2 - pv[0];
    const dy = f.y + f.h / 2 - pv[1];
    const toMid = Math.sign(rig.w / 2 - (f.x + f.w / 2)) || 1;
    const t = Math.abs(dy) > Math.abs(dx) * 0.6 ? toMid * Math.sign(-dy) : -Math.sign(dx);
    return { ["--tilt" as string]: `${t * deg}deg` } as CSSProperties;
  };
  // whole arm: the sleeve swings at the shoulder, the hand inside it at the wrist
  const arm = (side: "L" | "R") =>
    P[`arm${side}`] ? (
      <g className={`br-arm br-arm-${side.toLowerCase()}`} style={{ ...origin(`arm${side}`), ...tilt(`arm${side}`, `hand${side}`, 24) }}>
        {img(`arm${side}`)}
        {P[`low${side}`] ? (
          // three pieces (Мугонатор): the forearm bends at the elbow, the fist turns at the wrist inside it
          <g className={`br-low br-low-${side.toLowerCase()}`} style={origin(`low${side}`)}>
            {img(`low${side}`)}
            <g className={`br-hand br-hand-${side.toLowerCase()}`} style={origin(`hand${side}`)}>{img(`hand${side}`)}</g>
          </g>
        ) : (
          <g className={`br-hand br-hand-${side.toLowerCase()}`} style={origin(`hand${side}`)}>{img(`hand${side}`)}</g>
        )}
      </g>
    ) : null;
  // a puppet strip: a window one frame wide, the strip slides behind it
  const strip = (p: string) => {
    const r: Part | undefined = P[p];
    if (!r?.frames) return null;
    return (
      <svg x={r.x} y={r.y} width={r.w} height={r.h} viewBox={`0 0 ${r.w} ${r.h}`} overflow="hidden">
        <image className={`brf brf-${p}`} href={`/bosses/${id}/rig/${p}.webp`} x={0} y={0} width={r.w * r.frames} height={r.h} preserveAspectRatio="none" />
      </svg>
    );
  };
  const frameCss = Object.keys(FRAME_SEQ).filter((p) => P[p]?.frames).map((p) => {
    const w = P[p].w;
    const k = (mode: "idle" | "ouch" | "strike") => seqKeyframes(`brf-${id}-${p}-${mode}`, w, (mode === "idle" && FRAME_SEQ_BY_BOSS[baseId]?.[p]) || FRAME_SEQ[p][mode]);
    const idle = k("idle"), ouch = k("ouch"), strike = k("strike");
    const sel = `.rig-${baseId}.boss-rig .brf-${p}`;
    return `${idle.css} ${ouch.css} ${strike.css}
      ${sel} { animation: brf-${id}-${p}-idle ${idle.ms}ms step-end infinite; }
      .arena-photo.ouch ${sel} { animation: brf-${id}-${p}-ouch ${ouch.ms}ms step-end both; }
      .arena-photo.strike ${sel} { animation: brf-${id}-${p}-strike ${strike.ms}ms step-end both; }
      @media (prefers-reduced-motion: reduce) { ${sel} { animation: none; } }`;
  }).join("\n");
  const behind = BEHIND[baseId];
  const clipEyes = !!P.armL && !!P.pupils && !!P.eyes;
  const maskId = `br-eyes-${id}`;
  // bosses with a full face (Кедр): pupils glance around, brows and mouth change when he is hit (class "ouch" on the arena)
  return (
    <svg key={id} className={`boss-rig rig-${baseId} ${id.endsWith("-beaten") ? "beaten" : ""}`} viewBox={`0 0 ${rig.w} ${rig.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      {frameCss && <style>{frameCss}</style>}
      <g className="br-breath" style={{ transformOrigin: `${rig.w / 2}px ${rig.h}px`, transformBox: "view-box" }}>
        {P.tail && <g className="br-tail" style={origin("tail")}>{img("tail")}</g>}
        {behind && arm(behind)}
        {img("body")}
        <g className="br-head" style={origin("head")}>
          {img("head")}
          {clipEyes && (
            <mask id={maskId} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width={rig.w} height={rig.h}>{img("eyes")}</mask>
          )}
          <g className="br-eyes-open">
            {img("eyes")}
            {P.pupils && <g mask={clipEyes ? `url(#${maskId})` : undefined}><g className="br-pupils">{img("pupils")}</g></g>}
          </g>
          {img("eyes-closed", "br-eyes-closed")}
          {P.brows && !P.brows.frames && <g className="br-brows">{img("brows", "br-brows-angry")}{img("brows-sad", "br-brows-sad")}</g>}
          {P.brows?.frames && strip("brows")}
          {img("mouth", "br-mouth")}
          {img("mouth-closed", "br-mouth-closed")}
          {strip("jaw")}
        </g>
        {img("collar")}
        {P.foreL && <g className="br-fist-l" style={{ ...origin("foreL"), ...tilt("foreL", "foreL", 9) }}>{img("foreL")}</g>}
        {P.foreR && <g className="br-fist-r" style={{ ...origin("foreR"), ...tilt("foreR", "foreR", 9) }}>{img("foreR")}</g>}
        {behind !== "R" && arm("R")}
        {behind !== "L" && arm("L")}
      </g>
    </svg>
  );
}
