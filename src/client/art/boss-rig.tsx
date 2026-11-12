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
import { MetalGlint } from "./glint.tsx";
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { usePoses } from "./boss-poses.ts";
import { usePuppet } from "./boss-puppet.ts";
import { BOSS_RIGS } from "./boss-rig-data.ts";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string };

/** bosses whose far arm (R or L) goes behind the body */
const BEHIND: Record<string, "L" | "R"> = { mugo: "R", babafey: "L", gopnik: "L", botsman: "R" };
/** of these the arm in BEHIND goes behind only with its shoulder: the forearm and the hand stay in front of everything */
const SPLIT_BEHIND = new Set(["babafey", "botsman"]);
/** rigs drawn as plain SVG only */
const NO_PUPPET = new Set<string>(["knyaz"]);
/** the bosses drawn whole (no legs of their own) that still bend at the waist on the pose engine: the waist (rig units)
 *  and where the torso picture bends (data-pp-follow-at: the top follows fully down to a, not at all from b) */
const WAIST: Record<string, { at: [number, number]; bend?: string }> = {
  babafey: { at: [547, 940], bend: "0.24,0.46" }, bebyakyan: { at: [400, 650], bend: "0.35,0.62" }, kedr: { at: [350, 590], bend: "0.4,0.6" },
  garkusha: { at: [420, 700], bend: "0.4,0.66" }, mugo: { at: [600, 660], bend: "0.35,0.5" },
  // cut off at the waist: he leans whole from the bottom edge
  datsik: { at: [590, 1400] },
  // Боцман: he bends at the belt (the legs stand; the coat's top leans, its tails swing — COAT below)
  botsman: { at: [450, 625] },
};
/** a long coat (Боцман): its top leans with br-up, its tails below the belt swing with an empty group bs-hem (the pose
 *  engine's hem, boss-poses.ts); the legs are drawn over it */
const COAT: Record<string, { follow: string; hem: [number, number] }> = { botsman: { follow: "0.24,0.43;0.72,0.48", hem: [450, 640] } };

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

/** a frame schedule sampled from a curve (0…1 of the loop → frame), ~30 steps a second, equal neighbours merged:
 *  a strip of frames 2° apart stepped this fast reads as a smooth bend */
function sampled(ms: number, frameAt: (t: number) => number): [number, number][] {
  const STEP = 33;
  const out: [number, number][] = [];
  for (let t = 0; t < ms; t += STEP) {
    const f = Math.round(frameAt(t / ms));
    const d = Math.min(STEP, ms - t);
    if (out.length && out[out.length - 1][0] === f) out[out.length - 1][1] += d;
    else out.push([f, d]);
  }
  return out;
}

/** a boss's schedules for the other modes: Князь — sad brows (the inner ends up, frames 5–6) when hit and when beaten */
const FRAME_SEQ_MODE_BY_BOSS: Record<string, Partial<Record<string, Partial<Record<SeqMode, [number, number][]>>>>> = {
  knyaz: { brows: { fear: [[6, 2400], [5, 300], [6, 1800], [5, 200]], ouch: [[5, 60], [6, 900], [5, 120], [0, 60]] } },
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
/** HP share below which a boss with a "<id>-dying" rig shows it (rags, a gag) */
export const DYING_BELOW = 0.25;

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
  // below a quarter: the last look (Князь — rags and a gag, «<id>-dying»), below half: beaten
  const id = hpShare < DYING_BELOW && `${baseId}-dying` in BOSS_RIGS ? `${baseId}-dying`
    : hpShare < BEATEN_BELOW && `${baseId}-beaten` in BOSS_RIGS ? `${baseId}-beaten` : baseId;
  const dazed = hpShare < BEATEN_BELOW;
  const svgRef = useRef<SVGSVGElement>(null);
  useDazed(svgRef, dazed);
  // the puppet warp (soft joints) for the full boss; the small busts on the list stay plain SVG
  const puppet = !bust && !!BOSS_RIGS[id] && !NO_PUPPET.has(baseId);
  const wrapRef = useRef<HTMLDivElement>(null);
  usePuppet(wrapRef, id, { w: BOSS_RIGS[id]?.w ?? 1, h: BOSS_RIGS[id]?.h ?? 1 }, puppet);
  // the bosses with a pose engine (boss-poses.ts): springs instead of the CSS keyframes
  usePoses(svgRef, baseId, id);
  // a gleaming tool in a hand (Боцман's crowbar): the puppet draws the forearms and fists on a canvas OVER the SVG, so the
  // gleam lives on a layer of its own above it and follows the hand's group every frame
  const glintSide = GLINT[baseId];
  const glintRef = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!glintSide || !puppet) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const svg = svgRef.current, g = glintRef.current;
      const hand = svg?.querySelector<SVGGElement>("[data-glint]");
      const a = svg?.getScreenCTM(), b = hand?.getScreenCTM();
      if (!g || !a || !b) return;
      const m = a.inverse().multiply(b);
      g.setAttribute("transform", `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [glintSide, puppet, id]);
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
            <g className={`br-hand br-hand-${side.toLowerCase()}`} {...joint(`hand${side}`)} style={origin(`hand${side}`)} data-glint={glintSide === side ? "1" : undefined}>
              {img(`hand${side}`, undefined, layer)}
              {/* without the puppet the gleam sits right here; with it — on its own layer over the puppet's canvas (below) */}
              {glintSide === side && !puppet && <CrowbarGlint P={P} />}
            </g>
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
    const k = (mode: SeqMode) => seqKeyframes(`brf-${id}-${p}-${mode}`, w, FRAME_SEQ_MODE_BY_BOSS[baseId]?.[p]?.[mode] || (mode === "idle" && FRAME_SEQ_BY_BOSS[baseId]?.[p]) || FRAME_SEQ[p][mode]);
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
  if (baseId === "knyaz") return <KnyazRig id={id} rig={rig} bust={bust} dazed={dazed} svgRef={svgRef} frameCss={frameCss} strip={strip} />;
  if (baseId === "vadim") return <VadimRig id={id} rig={rig} bust={bust} dazed={dazed} sleepy={hpShare < DYING_BELOW} svgRef={svgRef} wrapRef={wrapRef} puppet={puppet} />;
  const behind = BEHIND[baseId];
  const split = SPLIT_BEHIND.has(baseId);
  const clipEyes = !!P.armL && !!P.pupils && !!P.eyes;
  const maskId = `br-eyes-${id}`;
  // bosses with a full face (Кедр): pupils glance around, brows and mouth change when he is hit (class "ouch" on the arena)
  const svgEl = (
    <svg key={id} ref={svgRef} className={`boss-rig rig-${baseId} ${id.endsWith("-beaten") ? "beaten" : ""} ${dazed ? "dazed" : ""}`} viewBox={bust ? bustBox(rig) : `0 0 ${rig.w} ${rig.h}`} width="100%" height="100%" preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      {frameCss && <style>{frameCss}</style>}
      <g className="br-breath" style={{ transformOrigin: `${rig.w / 2}px ${rig.h}px`, transformBox: "view-box" }}>
        {/* legs of their own (Гопник): they stay put, everything above the waist leans in br-up (screens.css «Гопник») */}
        {!COAT[baseId] && img("legs", undefined, "back")}
        {COAT[baseId] && <g className="bs-hem" style={{ transformOrigin: `${COAT[baseId].hem[0]}px ${COAT[baseId].hem[1]}px`, transformBox: "view-box" }} />}
        <g className="br-up" style={WAIST[baseId] ? { transformOrigin: `${WAIST[baseId].at[0]}px ${WAIST[baseId].at[1]}px`, transformBox: "view-box" }
          : P.legs ? { transformOrigin: `${P.legs.x + P.legs.w / 2}px ${P.legs.y + P.legs.h * 0.2}px`, transformBox: "view-box" } : undefined}>
        {P.tail && <g className="br-tail" {...joint("tail")} style={origin("tail")}>{img("tail", undefined, "back")}</g>}
        {behind && arm(behind, split ? "upper" : undefined, "back")}
        {/* with legs of its own the torso bends at the waist (the puppet): its frame is the standing one, the top
            follows the leaning upper body; without the puppet it leans whole with br-up */}
        {(P.legs || WAIST[baseId]?.bend) && puppet ? (
          <image className="pp" data-pp="back" data-pp-body="1" data-pp-own="br-breath" data-pp-follow={COAT[baseId] ? "br-up bs-hem" : "br-up"}
            data-pp-follow-at={COAT[baseId]?.follow ?? WAIST[baseId]?.bend ?? "0.3,0.93"}
            href={`/bosses/${id}/rig/body.webp${P.body.v ? `?v=${P.body.v}` : ""}`} x={P.body.x} y={P.body.y} width={P.body.w} height={P.body.h} preserveAspectRatio="none" />
        ) : img("body", undefined, "back")}
        {/* the legs over the coat (Боцман): standing with the body's frame, not leaning with br-up */}
        {COAT[baseId] && P.legs && (puppet ? (
          <image className="pp" data-pp="back" data-pp-own="br-breath" href={`/bosses/${id}/rig/legs.webp${P.legs.v ? `?v=${P.legs.v}` : ""}`}
            x={P.legs.x} y={P.legs.y} width={P.legs.w} height={P.legs.h} preserveAspectRatio="none" />
        ) : img("legs"))}
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
          {/* an open mouth over the whole head (Боцман): the throat, the upper teeth, the lower teeth on a jaw that drops
              and grinds, the lips with their hole round them; hidden when he is hit — the head's own sad mouth shows */}
          {P.lips && !P["head-open"] && (
            <g className="br-mouth-open">
              {img("throat")}
              <g className="br-teeth-up">{img("teeth-up")}</g>
              <g className="br-teeth-low">{img("teeth-low")}</g>
              {img("lips")}
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
      </g>
    </svg>
    );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={id} className={`br-pup rig-${baseId}-pup`}>
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
      {glintSide && (
        <svg className="br-pup-over" viewBox={`0 0 ${rig.w} ${rig.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <g ref={glintRef}><CrowbarGlint P={P} /></g>
        </svg>
      )}
    </div>
  );
}

/** the bosses with a gleaming tool, and in which hand */
const GLINT: Record<string, "L" | "R"> = { botsman: "L" };
/** Боцман's crowbar in his fist (handL): the gleam over its bare metal, the flash near the bend (tools/boss/make-shine.py) */
function CrowbarGlint({ P }: { P: Record<string, Part> }) {
  const h = P.handL;
  if (!h) return null;
  return <MetalGlint mask="/bosses/botsman/rig/handL-shine.webp?v=1" box={h} star={[h.x + 168, h.y + 57]} size={22} />;
}

/*
 * Князь (tools/boss/assemble-knyaz.py): plain layers, no puppet mesh. He breathes and sways, keeps the right fist up in a
 * guard and slashes with the hardware wallet held like a knife in the left — sharp short cuts and a stab, the wrist flicking
 * (screens.css «Князь»). The face: whites with rolling irises, lids that blink, the brows bent like a puppet (a strip of
 * frames, FRAME_SEQ.brows); the mouth is a grin with the teeth clenched on a cigarette — now and then the jaw drops and the
 * cigarette goes from one corner of the mouth to the other through the front, like the hero's (rig-chew), smoke from its tip.
 */
type Rig = { w: number; h: number; parts: Record<string, Part> };
/** the cigarette in rig units: the corners of the mouth, its length and thickness */
/** the shoulders (rig units): each whole arm swings around its own */
const KZ_SHOULDER_R = [737, 370] as const;
const KZ_SHOULDER_L = [440, 400] as const;
/** the wallet arm's elbow (rig units) and the bend of each frame of its strip (tools/boss/assemble-knyaz.py ARM_L_DEG) */
const KZ_ELBOW_L = { at: [215, 634] as const, deg: Array.from({ length: 13 }, (_, k) => k * 2) };
const KZ_CIG = { r: [555, 270.5], l: [494, 285.5], f: [525, 281], len: 42, thick: 6 } as const;
/** the cigarette's way through one 8 s loop: [%, x, y, angle, squeeze] — the hero's schedule (rig-chew) on his mouth */
const KZ_CHEW: [number, number, number, number, number][] = (() => {
  const R = KZ_CIG.r, L = KZ_CIG.l, F = KZ_CIG.f;
  const at = (p: number, c: readonly number[], a: number, sx = 1): [number, number, number, number, number] => [p, c[0], c[1], a, sx];
  const bite = (p: number, c: readonly number[], a: number, d: number) =>
    [at(p, c, a), at(p + 1.6, [c[0], c[1] + 1.2], a - 5 * d), at(p + 3.4, [c[0], c[1] - 0.6], a + 9 * d), at(p + 5.4, c, a)];
  return [
    at(0, R, 24), at(0.5, R, 24), at(3.6, F, 92, 0.64), at(6.8, L, 156),
    ...bite(15, L, 156, -1), ...bite(25, L, 156, -1), ...bite(35, L, 156, -1),
    at(50, L, 156), at(50.5, L, 156), at(53.6, F, 92, 0.64), at(56.8, R, 24),
    ...bite(65, R, 24, 1), ...bite(75, R, 24, 1), ...bite(85, R, 24, 1), at(100, R, 24),
  ];
})();
const kzChewCss = () => {
  const cig = KZ_CHEW.map(([p, x, y, a, sx]) => `${p}% { transform: translate(${x}px, ${y}px) rotate(${a}deg) scaleX(${sx}); }`).join(" ");
  const tip = KZ_CHEW.map(([p, x, y, a, sx]) => {
    const r = (a * Math.PI) / 180;
    return `${p}% { transform: translate(${(x + Math.cos(r) * KZ_CIG.len * sx).toFixed(1)}px, ${(y + Math.sin(r) * KZ_CIG.len).toFixed(1)}px); }`;
  }).join(" ");
  return `@keyframes kz-chew { ${cig} } @keyframes kz-tip { ${tip} }`;
};

function KnyazRig({ id, rig, bust, dazed, svgRef, frameCss, strip }: {
  id: string; rig: Rig; bust: boolean; dazed: boolean; svgRef: RefObject<SVGSVGElement | null>; frameCss: string; strip: (p: string) => ReactNode;
}) {
  const P = rig.parts;
  const coverRef = useRef<SVGGElement>(null);
  const handRef = useRef<SVGGElement>(null);
  useCoverSwing(coverRef, handRef, P.cover?.pivot, !bust);
  const img = (p: string, cls?: string) => {
    const r = P[p];
    return r ? <image className={cls} href={`/bosses/${id}/rig/${p}.webp${r.v ? `?v=${r.v}` : ""}`} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" /> : null;
  };
  const origin = (p: string): CSSProperties => {
    const pv = P[p]?.pivot ?? [rig.w / 2, rig.h];
    return { transformOrigin: `${pv[0]}px ${pv[1]}px`, transformBox: "view-box" };
  };
  const at = (pt: readonly number[]): CSSProperties => ({ transformOrigin: `${pt[0]}px ${pt[1]}px`, transformBox: "view-box" });
  const vb: CSSProperties = { transformBox: "view-box", transformOrigin: "0 0" };
  const maskId = `kz-eyes-${id}`;
  // a puppet-bent limb: a window one frame wide over its strip, the strip steps through the frames
  const bent = (p: string, cls: string) => {
    const r = P[p];
    return r?.frames ? (
      <svg x={r.x} y={r.y} width={r.w} height={r.h} viewBox={`0 0 ${r.w} ${r.h}`} overflow="hidden">
        <image className={cls} href={`/bosses/${id}/rig/${p}.webp${r.v ? `?v=${r.v}` : ""}`} x={0} y={0} width={r.w * r.frames} height={r.h} preserveAspectRatio="none" />
      </svg>
    ) : null;
  };
  const css: string[] = [frameCss, kzChewCss()];
  // the fist arm (frames 0…4, straight … bent): up and down with the guard, a quick double bend now and then
  if (P.armRb?.frames) {
    const n = P.armRb.frames - 1;
    // in step with kz-jab (1.6 s): the elbow snaps in for each of the two jerks, quick enough that the frames don't show
    const ease = (x: number) => x * x * (3 - 2 * x);
    const bump = (t: number, a: number, b: number, c: number, d: number) => (t < a || t > d ? 0 : t < b ? ease((t - a) / (b - a)) : t < c ? 1 : 1 - ease((t - c) / (d - c)));
    const k = seqKeyframes(`kz-elbow-r-${id}`, P.armRb.w, sampled(1600, (t) => n * Math.max(bump(t, 0.5, 0.55, 0.6, 0.66), bump(t, 0.72, 0.77, 0.82, 0.9))));
    css.push(`${k.css} .rig-knyaz .kz-elbow-r { animation: kz-elbow-r-${id} ${k.ms}ms step-end infinite; }`);
  }
  // the wallet arm: the elbow snaps in with each cut (in step with kz-slash, 2.1 s), the hand turns around the elbow by
  // the frame's angle (KZ_ELBOW_L.deg) so it stays on the cuff
  if (P.armLb?.frames) {
    const n = P.armLb.frames - 1;
    // in step with kz-slash (2.1 s): snapped in with each cut (fast in, eased out), a smaller bend with the stab
    const ease = (x: number) => x * x * (3 - 2 * x);
    const bump = (t: number, a: number, b: number, c: number, d: number) => (t < a || t > d ? 0 : t < b ? ease((t - a) / (b - a)) : t < c ? 1 : 1 - ease((t - c) / (d - c)));
    const seq = sampled(2100, (t) => n * Math.max(bump(t, 0.3, 0.335, 0.41, 0.48), bump(t, 0.455, 0.49, 0.56, 0.64), 0.55 * bump(t, 0.7, 0.745, 0.8, 0.9)));
    const k = seqKeyframes(`kz-elbow-l-${id}`, P.armLb.w, seq);
    const total = seq.reduce((t, [, ms]) => t + ms, 0);
    let t0 = 0;
    const turn = seq.map(([f, ms]) => { const step = `${((t0 / total) * 100).toFixed(3)}% { transform: rotate(${KZ_ELBOW_L.deg[f]}deg); }`; t0 += ms; return step; }).join(" ");
    css.push(`${k.css} @keyframes kz-turn-l-${id} { ${turn} 100% { transform: rotate(0deg); } }
      .rig-knyaz .kz-elbow-l { animation: kz-elbow-l-${id} ${k.ms}ms step-end infinite; }
      .rig-knyaz .kz-turn-l { animation: kz-turn-l-${id} ${k.ms}ms step-end infinite; }`);
  }
  return (
    <svg ref={svgRef} className={`boss-rig rig-knyaz ${dazed ? "dazed" : ""} ${P.gag ? "gagged" : ""}`} viewBox={bust ? bustBox(rig) : `0 0 ${rig.w} ${rig.h}`} width="100%" height="100%" preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      <style>{css.join("\n")}</style>
      <g className="kz-root" style={{ transformOrigin: `${rig.w / 2}px ${rig.h - 20}px`, transformBox: "view-box" }}>
        {img("legs")}
        <g className="kz-up" style={{ transformOrigin: `${rig.w / 2}px ${rig.h * 0.56}px`, transformBox: "view-box" }}>
          {/* the wallet arm (viewer's left) behind the body: it swings at the shoulder, the elbow bends like a puppet,
              the hand rides on the forearm and flicks at the wrist; the swivel cover hangs free on its pin (useCoverSwing) */}
          <g className="kz-arm-l" style={at(KZ_SHOULDER_L)}>{bent("armLb", "kz-elbow-l")}</g>
          {img("body")}
          <g className="kz-head" style={origin("head")}>
            {img("head-open")}
            {/* the grin with the teeth clenched on the cigarette; hit or beaten — the sad mouth instead */}
            <g className="kz-grin">
              {img("throat")}
              {img("teeth-up")}
              <g className="kz-jaw">{img("teeth-low")}</g>
              {img("lips")}
            </g>
            {img("mouth-sad", "kz-sad")}
            {/* below a quarter: a rag in his mouth (knyaz-dying) — the grin, the jaw and the cigarette are hidden */}
            {P.gag && img("gag")}
            <g className="kz-cig" style={vb}>
              <image href={`/assets/hero/mouth-cigarette.webp`} x={0} y={-KZ_CIG.thick / 2} width={KZ_CIG.len} height={KZ_CIG.thick} preserveAspectRatio="none" />
            </g>
            <g className="kz-tip" style={vb}>
              <g className="rig-smoke">{[0, 1, 2].map((i) => <circle key={i} cx={0} cy={0} r={5} style={{ animationDelay: `${i * 0.9}s` }} />)}</g>
            </g>
            <mask id={maskId} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width={rig.w} height={rig.h}>{img("eyes")}</mask>
            <g className="br-eyes-open">
              {img("eyes")}
              <g mask={`url(#${maskId})`}><g className="br-pupils">{img("pupils")}</g></g>
            </g>
            {img("eyes-closed", "br-eyes-closed")}
            {strip("brows")}
          </g>
          {/* the fist arm (viewer's right) in front of the body, its elbow bending like a puppet */}
          <g className="kz-arm-r" style={at(KZ_SHOULDER_R)}>{bent("armRb", "kz-elbow-r")}</g>
          {/* the hand with the wallet in front of everything: the same shoulder and elbow turns as its sleeve behind */}
          <g className="kz-arm-l" style={at(KZ_SHOULDER_L)}>
            <g className="kz-turn-l" style={at(KZ_ELBOW_L.at)}>
              <g className="kz-hand-l" ref={handRef} style={origin("handL")}>
                {img("handL")}
                <g ref={coverRef}>{img("cover")}</g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

/**
 * The wallet's swivel cover hangs free on its pin: a damped pendulum in the screen's frame. Every frame the hand's
 * turn and the pin's place are read off the hand group (getCTM — the CSS animations included); the cover keeps its own
 * angle, so when the hand turns or jerks the cover lags, swings out and settles back to hanging the way it is drawn.
 */
function useCoverSwing(coverRef: RefObject<SVGGElement | null>, handRef: RefObject<SVGGElement | null>, pin: readonly number[] | undefined, on: boolean) {
  useEffect(() => {
    const cover = coverRef.current, hand = handRef.current;
    if (!on || !cover || !hand || !pin || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const L = 46;                      // the cover's length (rig units): its swing period
    const G = 2600;                    // gravity in rig units / s²
    const DAMP = 2.2;
    let phi = 0, vel = 0;              // the cover's angle in the screen (0 — hanging as drawn) and its speed
    let last = 0, raf = 0;
    let prev: { x: number; y: number; vx: number; vy: number } | null = null;
    const svg = hand.ownerSVGElement;
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (document.hidden) { last = 0; return; }
      const m = hand.getCTM();
      const root = svg?.getCTM();
      if (!m || !root) return;
      // the hand's matrix in the rig's own units (the screen scale taken out)
      const r = root.inverse().multiply(m);
      const handAng = Math.atan2(r.b, r.a);
      const px = r.a * pin[0] + r.c * pin[1] + r.e, py = r.b * pin[0] + r.d * pin[1] + r.f;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      if (dt > 0) {
        const vx = prev ? (px - prev.x) / dt : 0, vy = prev ? (py - prev.y) / dt : 0;
        const ax = prev ? (vx - prev.vx) / dt : 0, ay = prev ? (vy - prev.vy) / dt : 0;
        prev = { x: px, y: py, vx, vy };
        // the pin's jolt pushes the cover the other way (its tangent), gravity pulls it back to hanging, the air damps it
        const tx = -Math.cos(phi), ty = Math.sin(phi);
        const acc = (-G * Math.sin(phi) - (ax * tx + ay * ty) * 0.6) / L - DAMP * vel;
        vel += acc * dt;
        phi += vel * dt;
        phi = Math.max(-1.4, Math.min(1.4, phi));
      } else prev = { x: px, y: py, vx: 0, vy: 0 };
      // drawn inside the hand: its own turn is the screen angle minus the hand's
      const rel = ((phi - handAng) * 180) / Math.PI;
      cover.setAttribute("transform", `rotate(${rel.toFixed(2)} ${pin[0]} ${pin[1]})`);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [coverRef, handRef, pin, on]);
}

/*
 * Вадим (tools/boss/assemble-vadim.py): soft joints like Восток's — the puppet (boss-puppet.ts) bends the sleeves at the
 * shoulders, the elbows and the wrists, the body round the shoulders and the neck; the limbs only turn (screens.css
 * «Вадим»): he stabs with the knife in the right fist and beats with the car keys in the left. The bunch hangs free —
 * every piece is its own pendulum on its pin (useDangle): the big ring (with its split ring) in the key's hole, the fob
 * and the door key on the ring; each lags behind what it hangs on, swings out and settles.
 */
/** his fast heavy breath: the chest grows by 18 % round its middle and rises 8 px at a full breath in (screens.css
 *  vd-breath: the upper body's height scale 1.03) */
const VD_BREATH = "0.18,8,1.03";
function VadimRig({ id, rig, bust, dazed, sleepy, svgRef, wrapRef, puppet }: {
  id: string; rig: Rig; bust: boolean; dazed: boolean; sleepy: boolean; svgRef: RefObject<SVGSVGElement | null>; wrapRef: RefObject<HTMLDivElement | null>; puppet: boolean;
}) {
  const P = rig.parts;
  const hand = useRef<SVGGElement>(null);
  const ring = useRef<SVGGElement>(null);
  const fob = useRef<SVGGElement>(null);
  const key = useRef<SVGGElement>(null);
  // length (rig units: the swing's period), damping and the widest swing (radians) of each piece
  useDangle([
    { el: ring, parent: hand, pin: P.keyRing?.pivot, len: 50, damp: 2.6, max: 1.1 },
    { el: fob, parent: ring, pin: P.keyFob?.pivot, len: 70, damp: 1.9, max: 1.2 },
    { el: key, parent: ring, pin: P.keyKey?.pivot, len: 36, damp: 1.4, max: 1.3 },
  ], !bust);
  // a picture: warped by the puppet on the back or the front canvas (the SVG copy hides then)
  // fade: drawn with the opacity of that ancestor group (the lids, the open and the sad mouth)
  const pic = (p: string, pp: "back" | "front", fade?: string) => {
    const r = P[p];
    return r ? <image className={puppet ? "pp" : undefined} data-pp={puppet ? pp : undefined} data-pp-body={puppet && p === "body" ? "1" : undefined} data-pp-fade={puppet ? fade : undefined}
      data-pp-breath={puppet && p === "body" ? VD_BREATH : undefined}
      href={`/bosses/${id}/rig/${p}.webp${r.v ? `?v=${r.v}` : ""}`} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" /> : null;
  };
  const origin = (p: string): CSSProperties => {
    const pv = P[p]?.pivot ?? [rig.w / 2, rig.h];
    return { transformOrigin: `${pv[0]}px ${pv[1]}px`, transformBox: "view-box" };
  };
  // a joint: the group turns round the part's pivot; the puppet blends the pictures on both sides of it
  const bone = (cls: string, p: string, kids: ReactNode, size?: number, ref?: RefObject<SVGGElement | null>) => (
    <g className={cls} ref={ref} data-pivot={P[p]?.pivot ? `${P[p].pivot![0]},${P[p].pivot![1]}` : undefined} data-pp-size={size} style={origin(p)}>{kids}</g>
  );
  const svgEl = (
    <svg key={id} ref={svgRef} className={`boss-rig rig-vadim ${dazed ? "dazed" : ""} ${sleepy ? "sleepy" : ""}`} viewBox={bust ? bustBox(rig) : `0 0 ${rig.w} ${rig.h}`} width="100%" height="100%" preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      <g className="vd-root" style={{ transformOrigin: `${rig.w / 2}px ${rig.h - 20}px`, transformBox: "view-box" }}>
        {pic("legs", "back")}
        <g className="vd-up" style={{ transformOrigin: `${rig.w / 2}px ${rig.h * 0.52}px`, transformBox: "view-box" }}>
          {/* the key arm's upper sleeve behind the body (with an empty elbow, so its end bends with the forearm) */}
          {bone("vd-arm-l", "armL", <>{pic("armL", "back")}{bone("vd-low-l", "lowL", null, 120)}</>, 140)}
          {pic("body", "back")}
          {/* the face: the eye whites and the irises behind the head (it has see-through eye holes), the head with its own
              closed smile; over it the open mouth (the throat, the upper teeth, the lower teeth on the jaw that drops with
              the breath and grinds now and then, the lips round them), the sad mouth (hit, beaten), the lids, the brows */}
          {bone("vd-head", "head", <>
            {pic("eyes", "back")}
            <g className="vd-pupils">{pic("pupils", "back")}</g>
            {pic("head", "back")}
            <g className="vd-mouth">
              {pic("throat", "back", "vd-mouth")}
              {pic("teeth-up", "back", "vd-mouth")}
              <g className="vd-jaw"><g className="vd-grind">{pic("teeth-low", "back", "vd-mouth")}</g></g>
              {pic("lips", "back", "vd-mouth")}
            </g>
            <g className="vd-sad">{pic("mouth-sad", "back", "vd-sad")}</g>
            <g className="vd-lids">{pic("eyes-closed", "back", "vd-lids")}</g>
            {/* each brow turns at its inner end: a smug lift and a frown now and then, sad (the outer ends down) when hit */}
            <g className="vd-brows">
              <g className="vd-brow-l" style={origin("browL")}>{pic("browL", "back")}</g>
              <g className="vd-brow-r" style={origin("browR")}>{pic("browR", "back")}</g>
            </g>
            {/* below a quarter: a duck's head over his (it pops on, then sways with the head) */}
            {P.duck && (
              <g className="vd-duck" style={{ transformOrigin: `${P.duck.x + P.duck.w / 2}px ${P.duck.y + P.duck.h * 0.8}px`, transformBox: "view-box" }}>
                {pic("duck", "back", "vd-duck")}
              </g>
            )}
          </>, 160)}
          {/* the key arm's forearm and fist in front: the same shoulder and elbow turns */}
          {bone("vd-arm-l", "armL", bone("vd-low-l", "lowL", <>
            {pic("lowL", "front")}
            {bone("vd-hand-l", "handL", <>
              {pic("handL", "front")}
              {/* the bunch: the big ring (with its split ring) hangs in the key's hole, the fob and the key hang on it */}
              <g ref={ring}>
                {pic("keyRing", "front")}
                <g ref={fob}>{pic("keyFob", "front")}</g>
                <g ref={key}>{pic("keyKey", "front")}</g>
              </g>
            </>, 90, hand)}
          </>, 120), 140)}
          {/* the knife arm, all in front of the body */}
          {bone("vd-arm-r", "armR", <>
            {pic("armR", "front")}
            {bone("vd-low-r", "lowR", <>
              {pic("lowR", "front")}
              {bone("vd-hand-r", "handR", pic("handR", "front"), 90)}
            </>, 120)}
          </>, 140)}
        </g>
      </g>
    </svg>
  );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={id} className={`br-pup rig-${id.split("-")[0]}-pup`}>
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
    </div>
  );
}

/**
 * Things hanging free, each on its pin, each a damped pendulum in the screen's frame (like useCoverSwing, for a chain):
 * every frame, in order, the parent's turn and the pin's place are read off the parent group (getCTM — its CSS
 * animations and the turn just given to it included); the piece keeps its own angle, so a jerk of what it hangs on makes
 * it lag, swing out and settle back to hanging the way it is drawn. A piece's parent may be another piece (a chain).
 */
type Dangle = { el: RefObject<SVGGElement | null>; parent: RefObject<SVGGElement | null>; pin: readonly number[] | undefined; len: number; damp: number; max: number };
function useDangle(list: Dangle[], on: boolean) {
  const cfg = useRef(list);
  cfg.current = list;
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const G = 4000;                    // gravity, rig units / s²
    const st = cfg.current.map(() => ({ phi: 0, vel: 0, prev: null as { x: number; y: number; vx: number; vy: number } | null }));
    let last = 0, raf = 0;
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (document.hidden) { last = 0; return; }
      const dt = last ? Math.min(0.04, (t - last) / 1000) : 0;
      last = t;
      cfg.current.forEach((d, i) => {
        const el = d.el.current, par = d.parent.current, pin = d.pin, s = st[i];
        if (!el || !par || !pin) return;
        const m = par.getCTM();
        const root = par.ownerSVGElement?.getCTM();
        if (!m || !root) return;
        const r = root.inverse().multiply(m);
        const parAng = Math.atan2(r.b, r.a);
        const px = r.a * pin[0] + r.c * pin[1] + r.e, py = r.b * pin[0] + r.d * pin[1] + r.f;
        if (dt > 0) {
          const vx = s.prev ? (px - s.prev.x) / dt : 0, vy = s.prev ? (py - s.prev.y) / dt : 0;
          const ax = s.prev ? (vx - s.prev.vx) / dt : 0, ay = s.prev ? (vy - s.prev.vy) / dt : 0;
          s.prev = { x: px, y: py, vx, vy };
          // the pin's jolt throws the piece the other way (along its swing), gravity pulls it back, the air damps it
          const tx = -Math.cos(s.phi), ty = Math.sin(s.phi);
          const acc = (-G * Math.sin(s.phi) - (ax * tx + ay * ty) * 0.8) / d.len - d.damp * s.vel;
          s.vel += acc * dt;
          s.phi = Math.max(-d.max, Math.min(d.max, s.phi + s.vel * dt));
          if (Math.abs(s.phi) >= d.max) s.vel *= -0.3;
        } else s.prev = { x: px, y: py, vx: 0, vy: 0 };
        // drawn inside the parent: its own turn is the screen angle minus the parent's
        el.setAttribute("transform", `rotate(${(((s.phi - parAng) * 180) / Math.PI).toFixed(2)} ${pin[0]} ${pin[1]})`);
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on]);
}
