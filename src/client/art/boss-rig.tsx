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
 * A head with its own jaw (head-open + throat + teeth-up/teeth-low, Бабафей) grinds its teeth and opens its mouth;
 * brows drawn one by one (browL/browR) turn at their inner ends for the emotions.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { usePuppet } from "./boss-puppet.ts";
import { BOSS_RIGS } from "./boss-rig-data.ts";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string };

/** bosses whose far arm (R or L) goes behind the body */
const BEHIND: Record<string, "L" | "R"> = { mugo: "R", babafey: "L" };
/** of these the arm in BEHIND goes behind only with its shoulder: the forearm and the hand stay in front of everything */
const SPLIT_BEHIND = new Set(["babafey"]);
/** rigs drawn as plain SVG only */
const NO_PUPPET = new Set<string>();

/** frame schedules of the puppet strips: [frame, ms] — idle loops, ouch/strike play once */
type SeqMode = "idle" | "ouch" | "strike" | "fear";
const FRAME_SEQ: Record<string, Record<SeqMode, [number, number][]>> = {
  // a grin now and then: the jaw drops in two chuckles and closes; scared (below half HP) — the teeth chatter
  jaw: {
    fear: [[1, 90], [2, 90], [1, 90], [2, 90], [1, 90], [2, 90], [1, 120], [0, 700], [1, 90], [2, 90], [1, 90], [0, 900]],
    idle: [[0, 4200], [1, 70], [2, 70], [3, 90], [2, 70], [1, 70], [2, 70], [3, 90], [4, 160], [3, 80], [2, 70], [1, 70], [0, 600]],
    ouch: [[2, 50], [3, 50], [4, 800], [3, 80], [2, 80], [1, 80], [0, 60]],
    strike: [[1, 50], [2, 50], [3, 50], [4, 520], [3, 80], [2, 60], [1, 60], [0, 30]],
  },
  // a smug lift of the brows, later a short frown; scared — lifted high and twitching
  brows: {
    fear: [[2, 1300], [1, 70], [2, 900], [1, 60], [2, 60], [1, 60], [2, 1100]],
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

/** the viewBox of a boss's bust: the head in the middle, the shoulders' top at the bottom */
function bustBox(rig: { w: number; h: number; parts: Record<string, { x: number; y: number; w: number; h: number }> }) {
  const head = rig.parts.head;
  if (!head) return `0 0 ${rig.w} ${rig.h}`;
  // the card's box is about 0.87 wide to 1 tall: at least 1.6 heads tall, and wide enough for a wide head (the shark)
  const w = Math.max(head.w * 1.15, head.h * 1.62 * 0.87);
  const h = w / 0.87;
  const cx = head.x + head.w / 2;
  return `${Math.round(cx - w / 2)} ${Math.round(head.y - head.h * 0.06)} ${Math.round(w)} ${Math.round(h)}`;
}

/** HP share (0..1) below which the beaten look is shown. */
export const BEATEN_BELOW = 0.5;

/** how much slower a dazed boss moves (below half HP): breath, head, fists — all at this share of their speed */
const DAZED_RATE = 0.45;

/**
 * Below half HP the boss is dazed — beaten and scared: the breath runs slower, the whole boss sways from side to side,
 * he stops punching and only waves his arms limply, and his face shows fear (sad raised brows, a shut mouth, darting
 * eyes, quick blinks, a shivering head, sweat running down — class "dazed", CSS «the scared boss»).
 * Hit reactions (punch, ouch) and the fear motions keep their speed so a hit still lands.
 * CSS animations restart whenever a class changes, so the rate is put back on a short timer.
 */
export function useDazed(ref: RefObject<Element | null>, on: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.getAnimations !== "function") return;
    const apply = (rate: number) => {
      for (const a of el.getAnimations({ subtree: true })) {
        const name = (a as CSSAnimation).animationName ?? "";
        // hit reactions and the scared face (its own tempo: shivers, darting eyes, quick blinks, limp arms) keep their speed
        if (name === "boss-dazed" || /punch|hit|ouch|strike|beaten-in|fear|limp|shiver|sweat|blink/.test(name)) continue;
        if (a.playbackRate !== rate) a.playbackRate = rate;
      }
    };
    if (!on) { apply(1); return; }
    apply(DAZED_RATE);
    const t = setInterval(() => apply(DAZED_RATE), 400);
    return () => { clearInterval(t); apply(1); };
  }, [ref, on]);
}

/** a scared boss sweats: drops at both temples and on the forehead (placed by the eyes) run down and fade, one after another */
function Sweat({ eyes, id }: { eyes: Part; id: string }) {
  const k = (eyes.w * 0.11) / 20;
  const g = `br-sweat-${id}`;
  const spots: [number, number, number][] = [
    [eyes.x - eyes.w * 0.1, eyes.y - eyes.h * 0.15, 0],
    [eyes.x + eyes.w * 1.1, eyes.y - eyes.h * 0.25, 0.9],
    [eyes.x + eyes.w * 0.3, eyes.y - eyes.h * 1.1, 1.7],
  ];
  return (
    <g className="br-sweat">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8f8ff" />
          <stop offset="1" stopColor="#5fb6ee" />
        </linearGradient>
      </defs>
      {spots.map(([x, y, d], i) => (
        <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})`}>
          <g className="br-drop" style={{ animationDelay: `${d}s` }}>
            <path d="M0 -15 C5 -7 9 -1 9 4 A9 9 0 0 1 -9 4 C-9 -1 -5 -7 0 -15 Z" fill={`url(#${g})`} stroke="#1c3a55" strokeWidth="1.8" strokeLinejoin="round" />
            <ellipse cx="-3.2" cy="2.5" rx="2" ry="3.4" fill="#fff" opacity="0.9" />
          </g>
        </g>
      ))}
    </g>
  );
}

/**
 * `bust`: only the head, the neck and the top of the shoulders (the boss list card) — the same live rig, the picture
 * cut to a box around the head (wider than the head, about 1.6 heads tall from just above the crown).
 */
export function BossRig({ id: baseId, hpShare = 1, bust = false }: { id: string; hpShare?: number; bust?: boolean }) {
  const id = hpShare < BEATEN_BELOW && `${baseId}-beaten` in BOSS_RIGS ? `${baseId}-beaten` : baseId;
  const dazed = hpShare < BEATEN_BELOW;
  const svgRef = useRef<SVGSVGElement>(null);
  useDazed(svgRef, dazed);
  // the puppet warp (soft joints) for the full boss; the small busts on the list stay plain SVG
  const puppet = !bust && !!BOSS_RIGS[id] && !NO_PUPPET.has(baseId);
  const wrapRef = useRef<HTMLDivElement>(null);
  usePuppet(wrapRef, id, { w: BOSS_RIGS[id]?.w ?? 1, h: BOSS_RIGS[id]?.h ?? 1 }, puppet);
  const rig = BOSS_RIGS[id];
  if (!rig) return null;
  const P = rig.parts;
  // pp: the picture is warped by the puppet (boss-puppet.ts) on the back or front canvas; the SVG copy hides then
  const img = (p: string, extra?: string, pp?: "back" | "front") => {
    const r: Part | undefined = P[p];
    return r ? <image className={pp && puppet ? `pp ${extra ?? ""}` : extra} data-pp={pp && puppet ? pp : undefined} data-pp-body={pp && puppet && p === "body" ? "1" : undefined} href={`/bosses/${id}/rig/${p}.webp${r.v ? `?v=${r.v}` : ""}`} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" /> : null;
  };
  const origin = (p: string) => {
    const pv = P[p]?.pivot ?? [rig.w / 2, rig.h];
    return { transformOrigin: `${pv[0]}px ${pv[1]}px`, transformBox: "view-box" as const };
  };
  // a joint for the puppet: the bone group's pivot
  const joint = (p: string) => (P[p]?.pivot ? { "data-pivot": `${P[p].pivot![0]},${P[p].pivot![1]}` } : {});
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
  // whole arm: the sleeve swings at the shoulder, the hand inside it at the wrist.
  // `only`: "upper" — just the sleeve (drawn behind the body), "lower" — the same joints without the sleeve (in front):
  // a boss in SPLIT_BEHIND has its shoulder behind the body but the forearm and the hand (the balalaika) in front of all
  const arm = (side: "L" | "R", only?: "upper" | "lower", layer: "back" | "front" = "front") =>
    P[`arm${side}`] ? (
      <g className={`br-arm br-arm-${side.toLowerCase()}`} {...joint(`arm${side}`)} style={{ ...origin(`arm${side}`), ...tilt(`arm${side}`, `hand${side}`, 24) }}>
        {only !== "lower" && img(`arm${side}`, undefined, layer)}
        {only === "upper" ? null : P[`low${side}`] ? (
          // three pieces (Мугонатор): the forearm bends at the elbow, the fist turns at the wrist inside it
          <g className={`br-low br-low-${side.toLowerCase()}`} {...joint(`low${side}`)} style={origin(`low${side}`)}>
            {img(`low${side}`, undefined, layer)}
            <g className={`br-hand br-hand-${side.toLowerCase()}`} {...joint(`hand${side}`)} style={origin(`hand${side}`)}>{img(`hand${side}`, undefined, layer)}</g>
          </g>
        ) : (
          <g className={`br-hand br-hand-${side.toLowerCase()}`} {...joint(`hand${side}`)} style={origin(`hand${side}`)}>{img(`hand${side}`, undefined, layer)}</g>
        )}
      </g>
    ) : null;
  // a puppet strip: a window one frame wide, the strip slides behind it
  const strip = (p: string) => {
    const r: Part | undefined = P[p];
    if (!r?.frames) return null;
    return (
      <svg x={r.x} y={r.y} width={r.w} height={r.h} viewBox={`0 0 ${r.w} ${r.h}`} overflow="hidden">
        <image className={`brf brf-${p}`} href={`/bosses/${id}/rig/${p}.webp${r.v ? `?v=${r.v}` : ""}`} x={0} y={0} width={r.w * r.frames} height={r.h} preserveAspectRatio="none" />
      </svg>
    );
  };
  const frameCss = Object.keys(FRAME_SEQ).filter((p) => P[p]?.frames).map((p) => {
    const w = P[p].w;
    const k = (mode: SeqMode) => seqKeyframes(`brf-${id}-${p}-${mode}`, w, (mode === "idle" && FRAME_SEQ_BY_BOSS[baseId]?.[p]) || FRAME_SEQ[p][mode]);
    const idle = k("idle"), ouch = k("ouch"), strike = k("strike"), fear = k("fear");
    const sel = `.rig-${baseId}.boss-rig .brf-${p}`;
    return `${idle.css} ${ouch.css} ${strike.css} ${fear.css}
      ${sel} { animation: brf-${id}-${p}-idle ${idle.ms}ms step-end infinite; }
      .rig-${baseId}.boss-rig.dazed .brf-${p} { animation: brf-${id}-${p}-fear ${fear.ms}ms step-end infinite; }
      .arena-photo.ouch ${sel} { animation: brf-${id}-${p}-ouch ${ouch.ms}ms step-end both; }
      .arena-photo.strike ${sel} { animation: brf-${id}-${p}-strike ${strike.ms}ms step-end both; }
      @media (prefers-reduced-motion: reduce) { ${sel} { animation: none; } }`;
  }).join("\n");
  if (baseId === "vodovoz") {
    // Восток in the artist's layers (screens.css «Восток»), all drawn by the puppet as soft meshes on one canvas in this
    // order: the shoulders, the elbows, the wrists and the neck bend smoothly, the hips bend with the upper body.
    // Both shoulders go behind the torso and the forearms in front, so each arm is drawn twice — the shoulder piece
    // behind, the forearm and the fist in front — in groups with the same class that turn together; the shoulder copy
    // also carries an empty elbow joint, so the end of the upper arm bends with the forearm. The bag hangs from the
    // left fist (no joint of its own: it swings rigid).
    const pp = puppet ? "back" : undefined;
    // follow: the top goes with that group (the legs with the hips); fade: drawn with that group's opacity;
    // ppId / mask: the pupils are drawn only inside the eye whites
    // sx: squeeze the part's width around its centre (Восток's jaw is drawn a touch narrower than the artist's layer)
    const pic = (p: string, o: { follow?: string; fade?: string; ppId?: string; mask?: string; sx?: number } = {}) => {
      const r0: Part | undefined = P[p];
      const r = r0 && o.sx ? { ...r0, x: r0.x + (r0.w * (1 - o.sx)) / 2, w: r0.w * o.sx } : r0;
      return r ? <image className={puppet ? "pp" : undefined} data-pp={pp} data-pp-follow={puppet ? o.follow : undefined}
        data-pp-fade={puppet ? o.fade : undefined} data-pp-id={puppet ? o.ppId : undefined} data-pp-mask={puppet ? o.mask : undefined}
        href={`/bosses/${id}/rig/${p}.webp${r.v ? `?v=${r.v}` : ""}`} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" /> : null;
    };
    const mouth = { fade: "vk-mouth" };
    // the face in layers (the artist's parts): whites, pupils rolling inside them, lids that blink, each brow turning
    // at its inner end; the mouth: his own smirk (the head) — tight lips (mouth-closed) — or open: the throat, both
    // rows of teeth and the lips, the lower lip with the chin (jaw) dropping to talk and yell, rising to bare the teeth
    const face = (
      <>
        {pic("head")}
        {pic("eyes", { ppId: "eyes" })}
        {!puppet && <mask id={`vk-eyes-${id}`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width={rig.w} height={rig.h}>{pic("eyes")}</mask>}
        <g mask={puppet ? undefined : `url(#vk-eyes-${id})`}><g className="vk-pupils">{pic("pupils", { mask: "eyes" })}</g></g>
        <g className="vk-lids">{pic("eyes-closed", { fade: "vk-lids" })}</g>
        <g className="vk-brow-l" style={origin("browL")}>{pic("browL")}</g>
        <g className="vk-brow-r" style={origin("browR")}>{pic("browR")}</g>
        <g className="vk-mouth-shut">{pic("mouth-closed", { fade: "vk-mouth-shut" })}</g>
        <g className="vk-mouth">
          {pic("throat", mouth)}
          <g className="vk-jaw"><g className="vk-grind">{pic("teeth-low", mouth)}</g></g>
          <g className="vk-teeth-up">{pic("teeth-up", mouth)}</g>
          {pic("head-open", mouth)}
          <g className="vk-jaw">{pic("jaw", { ...mouth, sx: 0.88 })}</g>
        </g>
      </>
    );
    const bone = (cls: string, p: string, kids: ReactNode, size?: number) => (
      <g className={cls} {...joint(p)} data-pp-size={size} style={origin(p)}>{kids}</g>
    );
    // a strap hanging in the air off the right arm: an empty bone at its root that swings; the puppet bends the strap
    // (and only the strap) of the picture it lies on towards that bone, more and more down to its tip
    const strap = (cls: string, root: [number, number], tip: [number, number], halfW: number) => (
      <g className={cls} data-pivot={`${root[0]},${root[1]}`} data-pp-dangle={`${tip[0]},${tip[1]},${halfW}`}
        style={{ transformOrigin: `${root[0]}px ${root[1]}px`, transformBox: "view-box" }} />
    );
    const hips = { transformOrigin: `${rig.w * 0.56}px ${rig.h * 0.6}px`, transformBox: "view-box" as const };
    const svgEl = (
      <svg key={id} ref={svgRef} className={`boss-rig rig-${baseId} ${dazed ? "dazed" : ""}`} viewBox={bust ? bustBox(rig) : `0 0 ${rig.w} ${rig.h}`} width="100%" height="100%" preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
        <g className="vk-root" style={{ transformOrigin: `${rig.w / 2}px ${rig.h - 30}px`, transformBox: "view-box" }}>
          <g className="vk-up" style={hips}>{bone("vk-arm-r", "armR", <>{pic("armR")}{bone("vk-low-r", "lowR", null, 150)}{strap("vk-strap vk-strap-a", [812, 650], [840, 785], 9)}</>, 150)}</g>
          {pic("legs", { follow: "vk-up" })}
          <g className="vk-up" style={hips}>
            {bone("vk-arm-l", "armL", <>{pic("armL")}{bone("vk-low-l", "lowL", null, 150)}</>, 150)}
            {pic("body")}
            {bone("vk-arm-l", "armL", bone("vk-low-l", "lowL", <>
              {pic("lowL")}
              {bone("vk-hand-l", "handL", <>{pic("handL")}<g className="vk-bag" style={origin("bag")}>{pic("bag", { fade: "vk-bag" })}</g></>, 90)}
            </>, 150), 150)}
            <g className="vk-headset">{pic("headset", { fade: "vk-headset" })}</g>
            {bone("vk-head", "head", <g className="vk-head-snap" style={origin("head")}>{face}</g>, 160)}
            {bone("vk-arm-r", "armR", bone("vk-low-r", "lowR", <>
              {pic("lowR")}
              {strap("vk-strap vk-strap-b", [744, 612], [747, 750], 11)}
              {strap("vk-strap vk-strap-c", [658, 596], [650, 668], 10)}
              {bone("vk-hand-r", "handR", pic("handR"), 90)}
            </>, 150), 150)}
          </g>
        </g>
      </svg>
    );
    if (!puppet) return svgEl;
    return (
      <div ref={wrapRef} key={id} className={`br-pup rig-${baseId}-pup`}>
        <canvas className="br-pup-back" aria-hidden="true" />
        {svgEl}
        <canvas className="br-pup-front" aria-hidden="true" />
      </div>
    );
  }
  const behind = BEHIND[baseId];
  const split = SPLIT_BEHIND.has(baseId);
  const clipEyes = !!P.armL && !!P.pupils && !!P.eyes;
  const maskId = `br-eyes-${id}`;
  // bosses with a full face (Кедр): pupils glance around, brows and mouth change when he is hit (class "ouch" on the arena)
  const svgEl = (
    <svg key={id} ref={svgRef} className={`boss-rig rig-${baseId} ${id.endsWith("-beaten") ? "beaten" : ""} ${dazed ? "dazed" : ""}`} viewBox={bust ? bustBox(rig) : `0 0 ${rig.w} ${rig.h}`} width="100%" height="100%" preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      {frameCss && <style>{frameCss}</style>}
      <g className="br-breath" style={{ transformOrigin: `${rig.w / 2}px ${rig.h}px`, transformBox: "view-box" }}>
        {P.tail && <g className="br-tail" {...joint("tail")} style={origin("tail")}>{img("tail", undefined, "back")}</g>}
        {behind && arm(behind, split ? "upper" : undefined, "back")}
        {img("body", undefined, "back")}
        <g className="br-head" {...joint("head")} style={origin("head")}>
          {img("head", P["head-open"] ? "br-face-closed" : undefined)}
          {/* a jaw of its own (Бабафей): the head with a hole for the mouth over the throat and both rows of teeth —
              the lower row grinds side to side and drops when he opens his mouth (screens.css «Бабафей») */}
          {P["head-open"] && (
            <g className="br-face-open">
              {img("throat")}
              <g className="br-teeth-up">{img("teeth-up")}</g>
              <g className="br-teeth-low">{img("teeth-low")}</g>
              {img("head-open")}
            </g>
          )}
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
          {/* each brow alone, turning at its inner end: the emotions are in the brows */}
          {P.browL && <g className="br-brow-l" style={origin("browL")}>{img("browL")}</g>}
          {P.browR && <g className="br-brow-r" style={origin("browR")}>{img("browR")}</g>}
          {img("mouth", "br-mouth")}
          {img("mouth-closed", "br-mouth-closed")}
          {strip("jaw")}
          {dazed && P.eyes && <Sweat eyes={P.eyes} id={id} />}
        </g>
        {img("collar")}
        {P.foreL && <g className="br-fist-l" {...joint("foreL")} style={{ ...origin("foreL"), ...tilt("foreL", "foreL", 9) }}>{img("foreL", undefined, "front")}</g>}
        {P.foreR && <g className="br-fist-r" {...joint("foreR")} style={{ ...origin("foreR"), ...tilt("foreR", "foreR", 9) }}>{img("foreR", undefined, "front")}</g>}
        {behind !== "R" && arm("R")}
        {behind !== "L" && arm("L")}
        {split && behind && arm(behind, "lower")}
      </g>
    </svg>
    );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={id} className={`br-pup rig-${baseId}-pup`}>
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
    </div>
  );
}
