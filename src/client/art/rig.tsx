"use client";
/*
 * Seated player character assembled from the artist's parts (public/assets/hero, built by tools/rig/build-rig.py).
 * Bones: torso (with the legs) → head, upper arms → forearms. The face (eyes, pupils, brows, closed eyes) rides on the head. Each bone rotates around the joint where it overlaps
 * its parent. Draw order matches the artwork: torso, legs over the shorts, arms over the torso, head on top.
 * Clothes (WEAR_FIT): shoes and pants over the legs, the shirt over the arms, the hat on the head bone.
 * Hair rides on the head bone; skin tone and hair colour come from `look` (pre-baked image variants).
 * The left hand (handR, on the screen's right) is its own part on the forearm (HandFrames): resting, drumming (an item) or holding a thing.
 * Animations (CSS, see screens.css): breathing, looking around, drumming fingers, a held thing turning at the wrist.
 */
import { ART_VER } from "../preload.ts";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { RIG } from "./rig-data.ts";
import { HAIR_CUT_HATS, HAIR_FIT, SKIN_ORIGINAL, WEAR_FIT } from "./rig-look.ts";
import { HELD_FIT } from "./held-data.ts";
import { TATTOO_FIT } from "./tattoo-data.ts";
import { SEAT } from "../../content/home-scene.ts";
import { CHAIR_FIT } from "./desk-data.ts";
import { DEFAULT_LOOK, type Look } from "../../content/home.ts";

type PartId = keyof typeof RIG;
type HairId = keyof typeof HAIR_FIT;
type WearId = string;
/** clothes drawn for the current body (may be empty while being redrawn) */
const WEARS: Record<string, { slot: string; x: number; y: number; w: number; h: number }> = WEAR_FIT;
/** what the player wears: slot → item id (items without drawn art are skipped) */
export type Worn = Record<string, string | undefined>;
/**
 * The character editor: every part of the hero gets a thin gold outline; the chosen part glows (a bright ring drawn
 * over the hero, Highlight). While editing the hero holds still (no breathing), so the ring stays on the part.
 * mode "items": HEAD, ACCESSORY, SHIRT, PANTS, SHOES, HAND — where clothes go (shown even with nothing worn);
 * mode "body": HEAD, EYES, MOUTH, TORSO, SHOULDER_L/R, ARM_L/R (forearms), HAND, LEG_L/R — «L» is the screen's left.
 */
export type RigEdit = { mode: "items" | "body"; part: string | null; onPick?: (part: string) => void };
const EditCtx = createContext<RigEdit | null>(null);

/** the thin outline of every part in the editor (nothing outside the editor) */
function Ol({ children }: { children: ReactNode }) {
  const e = useContext(EditCtx);
  if (!e) return <>{children}</>;
  return <g filter="url(#rig-ol)">{children}</g>;
}

// ---------- tapping a part of the hero in the editor: hit-tested on the pictures' own pixels, top layer first ----------
/** `items` / `body` — the part this layer stands for in each mode ("" — not tappable in that mode) */
type HitLayer = { href: string; x: number; y: number; w: number; h: number; items: string; body: string; rect?: boolean };
const alphaCache = new Map<string, Promise<ImageData | null>>();
function alphaOf(href: string): Promise<ImageData | null> {
  let p = alphaCache.get(href);
  if (!p) {
    p = new Promise((done) => {
      const im = new Image();
      im.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = im.naturalWidth; c.height = im.naturalHeight;
          const g = c.getContext("2d");
          if (!g) return done(null);
          g.drawImage(im, 0, 0);
          done(g.getImageData(0, 0, c.width, c.height));
        } catch {
          done(null);
        }
      };
      im.onerror = () => done(null);
      im.src = href;
    });
    alphaCache.set(href, p);
  }
  return p;
}
/** where the torso picture ends and the legs begin, and the legs and the feet (rig y); the legs part at MID_X */
const HIPS_Y = 660, FEET_Y = 1120, MID_X = 500;
/** where a chain goes when none is worn */
const NECK = { x: 420, y: 285, w: 160, h: 85 };
type Box = { href: string; x: number; y: number; w: number; h: number; rect?: boolean };
function partLayer(look: Look, p: PartId): Box {
  const skinDir = look.skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${look.skin}` : "/assets/hero";
  return { href: `${look.skin !== SKIN_ORIGINAL && !NO_SKIN.has(p) ? skinDir : "/assets/hero"}/${p}.webp?v=${ART_VER.heroPart}`, ...RIG[p] };
}
function wearLayer(worn: Worn, slot: string): Box | null {
  const id = wornIn(worn, slot);
  return id ? { href: `/assets/hero/wear/${id}.webp?v=${ART_VER.wear}`, ...WEARS[id] } : null;
}
function handLayer(look: Look, worn: Worn): Box {
  const held = worn.HAND && worn.HAND in HELD_FIT ? worn.HAND : null;
  if (!held) return partLayer(look, "handR");
  const base = look.skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${look.skin}/held-${held}` : `/assets/hero/held/${held}`;
  return { href: `${base}.webp?v=${ART_VER.heroPart}`, ...HELD_FIT[held] };
}
function hairLayer(look: Look, worn: Worn): Box | null {
  if (!(look.hair in HAIR_FIT)) return null;
  const hat = wornIn(worn, "HEAD");
  return { href: `/assets/hero/hair/${look.hair}-${look.hairColor}${hat && HAIR_CUT_HATS.includes(hat) ? `-${hat}` : ""}.webp?v=${ART_VER.hair}`, ...HAIR_FIT[look.hair as HairId] };
}
const EYES_BOX = { href: "", x: RIG.eyes.x - 6, y: RIG.eyes.y - 22, w: RIG.eyes.w + 12, h: RIG.eyes.h + 30, rect: true };
const MOUTH_BOX = { href: "", x: RIG.head.x + RIG.head.w * 0.36, y: RIG.head.y + RIG.head.h * 0.72, w: RIG.head.w * 0.28, h: RIG.head.h * 0.13, rect: true };
function hitLayers(look: Look, worn: Worn): HitLayer[] {
  const part = (p: PartId) => partLayer(look, p);
  const out: HitLayer[] = [];
  const add = (l: Box | null, items: string, body: string) => { if (l) out.push({ ...l, items, body }); };
  add(wearLayer(worn, "HEAD"), "HEAD", "HEAD");
  add(hairLayer(look, worn), "HEAD", "HEAD");
  add(wearLayer(worn, "FACE"), "FACE", "EYES");
  add(EYES_BOX, "FACE", "EYES");
  // no mouth layer yet: the place under the nose
  add(MOUTH_BOX, "HEAD", "MOUTH");
  add(part("head"), "HEAD", "HEAD");
  add(wearLayer(worn, "ACCESSORY") ?? { href: "", ...NECK, rect: true }, "ACCESSORY", "");
  add(wearLayer(worn, "SHIRT"), "SHIRT", "TORSO");
  add(handLayer(look, worn), "HAND", "HAND");
  add(part("foreR"), "SHIRT", "ARM_R");
  add(part("armUR"), "SHIRT", "SHOULDER_R");
  add(part("foreL"), "SHIRT", "ARM_L");
  add(part("armUL"), "SHIRT", "SHOULDER_L");
  add(wearLayer(worn, "PANTS"), "PANTS", "LEGS");
  add(wearLayer(worn, "SHOES"), "SHOES", "LEGS");
  add(part("torso"), "TORSO", "TORSO");
  return out;
}
async function pickAt(x: number, y: number, layers: HitLayer[], mode: "items" | "body"): Promise<string | null> {
  for (const l of layers) {
    if (x < l.x || y < l.y || x >= l.x + l.w || y >= l.y + l.h) continue;
    if (!(mode === "items" ? l.items : l.body)) continue;
    if (!l.rect) {
      const a = await alphaOf(l.href);
      if (a) {
        const px = Math.floor(((x - l.x) / l.w) * a.width), py = Math.floor(((y - l.y) / l.h) * a.height);
        if (a.data[(py * a.width + px) * 4 + 3] < 60) continue;
      }
    }
    const v = mode === "items" ? l.items : l.body;
    if (!v) continue;
    // the torso picture carries the legs too; trousers and shoes count as the legs in the body editor
    if (l.items === "TORSO" || v === "LEGS") {
      if (mode === "body") return y < HIPS_Y && v !== "LEGS" ? "TORSO" : x < MID_X ? "LEG_L" : "LEG_R";
      return y < HIPS_Y ? "SHIRT" : y < FEET_Y ? "PANTS" : "SHOES";
    }
    return v;
  }
  return null;
}

function OutlineDefs() {
  return (
    <defs>
      <filter id="rig-ol" x="-15%" y="-15%" width="130%" height="130%">
        <feMorphology in="SourceAlpha" operator="dilate" radius={3} result="d" />
        <feFlood floodColor="#ffb627" floodOpacity={0.55} />
        <feComposite in2="d" operator="in" result="o" />
        <feMerge><feMergeNode in="o" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      {/* the chosen part: only a bright ring around it (drawn over the hero), with a soft glow */}
      <filter id="rig-ring" x="-20%" y="-20%" width="140%" height="140%">
        <feMorphology in="SourceAlpha" operator="dilate" radius={7} result="d" />
        <feComposite in="d" in2="SourceAlpha" operator="out" result="r" />
        <feFlood floodColor="#ffe27a" />
        <feComposite in2="r" operator="in" result="ring" />
        <feGaussianBlur in="ring" stdDeviation={5} result="glow" />
        <feMerge><feMergeNode in="glow" /><feMergeNode in="ring" /></feMerge>
      </filter>
    </defs>
  );
}

type Clip = { x0?: number; x1?: number; y0?: number; y1?: number };
/** the pictures (and clip) that make up the chosen part: drawn again over the hero through the ring filter */
function partShapes(edit: RigEdit, look: Look, worn: Worn): { boxes: Box[]; clip?: Clip }[] {
  const p = (id: PartId) => partLayer(look, id);
  const torso = (clip: Clip) => ({ boxes: [p("torso")], clip });
  const legs = { y0: HIPS_Y, y1: FEET_Y }, feet = { y0: FEET_Y };
  const head = [p("head"), hairLayer(look, worn)].filter(Boolean) as Box[];
  if (edit.mode === "items") {
    switch (edit.part) {
      case "HEAD": return [{ boxes: [wearLayer(worn, "HEAD") ?? head[0], ...head] }];
      case "ACCESSORY": return [{ boxes: [wearLayer(worn, "ACCESSORY") ?? { href: "", ...NECK, rect: true }] }];
      case "FACE": return [{ boxes: [wearLayer(worn, "FACE") ?? EYES_BOX] }];
      case "SHIRT": {
        const shirt = wearLayer(worn, "SHIRT");
        return [shirt ? { boxes: [shirt] } : torso({ y1: HIPS_Y }), { boxes: [p("armUL"), p("foreL"), p("armUR"), p("foreR")] }];
      }
      case "PANTS": { const w = wearLayer(worn, "PANTS"); return [w ? { boxes: [w] } : torso(legs)]; }
      case "SHOES": { const w = wearLayer(worn, "SHOES"); return [w ? { boxes: [w] } : torso(feet)]; }
      case "HAND": return [{ boxes: [handLayer(look, worn)] }];
    }
    return [];
  }
  switch (edit.part) {
    case "HEAD": return [{ boxes: head }];
    case "EYES": return [{ boxes: [EYES_BOX] }];
    case "MOUTH": return [{ boxes: [MOUTH_BOX] }];
    case "TORSO": return [torso({ y1: HIPS_Y })];
    case "SHOULDER_L": return [{ boxes: [p("armUL")] }];
    case "SHOULDER_R": return [{ boxes: [p("armUR")] }];
    case "ARM_L": return [{ boxes: [p("foreL")] }];
    case "ARM_R": return [{ boxes: [p("foreR")] }];
    case "HAND": return [{ boxes: [handLayer(look, worn)] }];
    case "LEG_L": return [torso({ y0: HIPS_Y, x1: MID_X })];
    case "LEG_R": return [torso({ y0: HIPS_Y, x0: MID_X })];
  }
  return [];
}
function Highlight({ edit }: { edit: RigEdit }) {
  const look = useContext(LookCtx), worn = useContext(WornCtx);
  const shapes = partShapes(edit, look, worn);
  return (
    <g pointerEvents="none" className="rig-hl-part">
      {/* all the pieces of the part (a jacket and both sleeves) under one ring: one whole outline, not one per piece */}
      <g filter="url(#rig-ring)">
        {shapes.map((sh, k) => {
          const c = sh.clip, id = `rig-clip-${k}`;
          return (
            <g key={`${edit.part}-${k}`} clipPath={c ? `url(#${id})` : undefined}>
              {c && <clipPath id={id}><rect x={c.x0 ?? -200} y={c.y0 ?? -200} width={(c.x1 ?? 1200) - (c.x0 ?? -200)} height={(c.y1 ?? 1600) - (c.y0 ?? -200)} /></clipPath>}
              {sh.boxes.map((b, i) => b.rect
                ? <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(b.w, b.h) / 2} fill="#fff" />
                : <image key={i} href={b.href} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />)}
            </g>
          );
        })}
      </g>
    </g>
  );
}

/** Look of the rig being drawn; skin and hair colours are pre-baked variants (tools/rig/build-look.py). */
const LookCtx = createContext<Look>(DEFAULT_LOOK);
const WornCtx = createContext<Worn>({});

function wornIn(worn: Worn, slot: string): WearId | null {
  const id = worn[slot];
  return id && id in WEARS ? id : null;
}

/** a worn piece of clothing, if the item in that slot has art (the FACE slot is drawn on the head, over the eyes) */
function Wear({ slot }: { slot: string }) {
  const id = wornIn(useContext(WornCtx), slot);
  if (!id) return null;
  const f = WEARS[id];
  return <image href={`/assets/hero/wear/${id}.webp?v=${ART_VER.wear}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />;
}

const NO_SKIN = new Set<string>(["pupils", "brows", "eyes-closed"]);

function Img({ p }: { p: PartId }) {
  const r = RIG[p];
  const { skin, eyes } = useContext(LookCtx);
  // parts without skin (pupils, brows, closed eyes) have no tone variants; ?v=2 — the slimmer character
  const tinted = skin !== SKIN_ORIGINAL && !NO_SKIN.has(p);
  // the pupils come in eye colours (tools/rig/build-eyes.py); 0 is the original art
  const file = p === "pupils" && eyes > 0 ? `pupils-${eyes}` : p;
  const src = `${tinted ? `/assets/hero/skin-${skin}/${p}` : `/assets/hero/${file}`}.webp?v=${ART_VER.heroPart}`;
  return <image href={src} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />;
}

/** the inked tattoos of one hero part, right over its skin (under the clothes); the ink sinks into any skin tone */
function Ink({ part }: { part: string }) {
  const { tattoos } = useContext(LookCtx);
  const list = (tattoos ?? []).filter((id) => TATTOO_FIT[id]?.part === part);
  if (!list.length) return null;
  return (
    <g className="rig-ink">
      {list.map((id) => {
        const f = TATTOO_FIT[id];
        return <image key={id} href={`/assets/hero/tattoo/${id}.webp?v=${ART_VER.tattoo}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />;
      })}
    </g>
  );
}

function Hair() {
  const look = useContext(LookCtx);
  const hat = wornIn(useContext(WornCtx), "HEAD"); // hair is cut to fit under a hat
  if (!(look.hair in HAIR_FIT)) return null; // bald
  const f = HAIR_FIT[look.hair as HairId];
  return <image href={`/assets/hero/hair/${look.hair}-${look.hairColor}${hat && HAIR_CUT_HATS.includes(hat) ? `-${hat}` : ""}.webp?v=${ART_VER.hair}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />;
}

/** Eyes, pupils and brows over the head: blinking, glancing around, brows moving. */
function Face() {
  return (
    <>
      <g className="rig-eyes-open">
        <Img p="eyes" />
        <g className="rig-pupils"><Img p="pupils" /></g>
      </g>
      <g className="rig-eyes-closed"><Img p="eyes-closed" /></g>
      <g className="rig-brows"><Img p="brows" /></g>
    </>
  );
}

/** the item (slot «Кисть») that makes the left hand drum its fingers — a reward for the first win over Кедр */
export const DRUM_HAND = "hand-drum";

/**
 * The left hand. By default it just rests on the knee (handR). With «Нервные пальцы» (DRUM_HAND) the fingers drum:
 * frames from a puppet warp (tools/rig/build-hand.py), pinky → index, each finger half up, up, half up; the frames are
 * stacked and shown one at a time (screens.css «rig-hf»), the wrist rocks along.
 * A thing held in the hand (e.g. the bottle) replaces the hand with the hand holding it: glass does not bend, so the
 * whole picture turns at the wrist (screens.css «rig-held»).
 */
function HandFrames() {
  const r = RIG.handR;
  const { skin } = useContext(LookCtx);
  const heldId = useContext(WornCtx).HAND;
  if (heldId && heldId in HELD_FIT) {
    const f = HELD_FIT[heldId];
    const base = skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${skin}/held-${heldId}` : `/assets/hero/held/${heldId}`;
    return (
      <g className="rig-hand held">
        <image href={`${base}.webp?v=${ART_VER.heroPart}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />
      </g>
    );
  }
  const dir = skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${skin}` : "/assets/hero";
  const hand = `${dir}/handR.webp?v=${ART_VER.heroPart}`;
  if (heldId !== DRUM_HAND) {
    return (
      <g className="rig-hand">
        <image href={hand} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />
        <Ink part="handR" />
      </g>
    );
  }
  return (
    <g className="rig-hand drum">
      <image className="rig-hf rig-hf-0" href={hand} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />
      {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
        <image key={k} className={`rig-hf rig-hf-${k}`} href={`${dir}/handR-f${k}.webp?v=${ART_VER.heroPart}`} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />
      ))}
      <Ink part="handR" />
    </g>
  );
}

/** a bone: rotates around its joint (pivot) */
function Bone({ p, className, children }: { p: PartId; className?: string; children?: ReactNode }) {
  const pv = "pivot" in RIG[p] ? (RIG[p] as { pivot: readonly [number, number] }).pivot : [500, 900];
  return (
    <g className={className} style={{ transformOrigin: `${pv[0]}px ${pv[1]}px`, transformBox: "view-box" }}>
      <Img p={p} />
      <Ink part={p} />
      {children}
    </g>
  );
}

/** The seat, drawn behind the body: the stool at chair level 0, then the best drawn chair up to the level. */
function Seat({ level = 0 }: { level?: number }) {
  for (let l = level; l >= 1; l--) {
    const f = CHAIR_FIT[`chair-${l}`];
    if (f) return <image href={`/assets/home/chair-${l}.webp`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />;
  }
  return <image href="/assets/home/seat-1.webp" x={SEAT.x} y={SEAT.y} width={SEAT.w} height={SEAT.w * SEAT.aspect} preserveAspectRatio="none" />;
}

/** Rig contents in its own 1000×1400 coordinates (place inside an <svg viewBox="0 0 1000 1400">). */
function RigBody({ seat, look, worn, seatOnly, edit }: { seat?: boolean | number; look?: Look; worn?: Worn; seatOnly?: boolean; edit?: RigEdit }) {
  // the room editor hides the hero: only the seat stays, so the room behind is seen
  if (seatOnly) return <>{seat !== undefined && seat !== false && <Seat level={typeof seat === "number" ? seat : 0} />}</>;
  return (
    <LookCtx.Provider value={look ?? DEFAULT_LOOK}>
    <WornCtx.Provider value={worn ?? {}}>
    <EditCtx.Provider value={edit ?? null}>
      {edit && <OutlineDefs />}
      <ellipse cx="500" cy="1282" rx="400" ry="30" fill="rgba(0,0,0,0.3)" />
      {seat !== undefined && seat !== false && <Seat level={typeof seat === "number" ? seat : 0} />}
      {/* torso breathes; arms and head ride along in a second group with the same animation */}
      {/* the torso layer carries the legs too; only the chest breathes visibly (origin at the hips) */}
      <g className="rig-breath">
        <Ol><Img p="torso" /><Ink part="torso" /></Ol>
      </g>
      <Ol><Wear slot="SHOES" /></Ol>
      <Ol><Wear slot="PANTS" /></Ol>
      <g className="rig-breath">
        <Ol>
          <Bone p="armUL">
            <Bone p="foreL" />
          </Bone>
        </Ol>
        <Ol>
          <Bone p="armUR">
            <Bone p="foreR">
              <Ol><HandFrames /></Ol>
            </Bone>
          </Bone>
        </Ol>
        {/* the tattoos of the chest, the belly and the arms: over the arms, under the shirt */}
        <Ink part="upper" />
        <Ol><Wear slot="SHIRT" /></Ol>
        <Ol><Wear slot="ACCESSORY" /></Ol>
        <Ol>
          <Bone p="head" className="rig-head">
            <Face />
            <Wear slot="FACE" />
            <Hair />
            <Wear slot="HEAD" />
          </Bone>
        </Ol>
      </g>
      {edit?.part && <Highlight edit={edit} />}
    </EditCtx.Provider>
    </WornCtx.Provider>
    </LookCtx.Provider>
  );
}

/** The hero's head with a hairstyle (the hairstyle picker): the head, the face and the hair, nothing else. */
export function HeadArt({ look, size = 56 }: { look: Look; size?: number }) {
  return (
    <svg viewBox="345 -22 316 336" width={size} height={size * (336 / 316)} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <LookCtx.Provider value={look}>
        <WornCtx.Provider value={{}}>
          <Img p="head" />
          <Face />
          <Hair />
        </WornCtx.Provider>
      </LookCtx.Provider>
    </svg>
  );
}

/** Nested viewport so bone pivots (view-box units) stay in rig coordinates inside any scene. */
export function RigViewport({ x, y, scale, seat, still, look, worn, seatOnly, edit }: { x: number; y: number; scale: number; seat?: boolean | number; still?: boolean; look?: Look; worn?: Worn; seatOnly?: boolean; edit?: RigEdit }) {
  const ref = useRef<SVGSVGElement>(null);
  const layers = useMemo(() => (edit?.onPick ? hitLayers(look ?? DEFAULT_LOOK, worn ?? {}) : []), [edit?.onPick, look, worn]);
  // the pictures' pixels are read once the editor opens, so the first tap is answered at once
  useEffect(() => { layers.forEach((l) => !l.rect && void alphaOf(l.href)); }, [layers]);
  const tap = async (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg || !edit?.onPick) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const part = await pickAt(pt.x, pt.y, layers, edit.mode);
    if (part) edit.onPick(part);
  };
  return (
    <svg ref={ref} className={`rig ${still || edit ? "still" : ""} ${edit?.onPick ? "pickable" : ""}`} x={x} y={y} width={1000 * scale} height={1400 * scale} viewBox="0 0 1000 1400" overflow="visible"
      onPointerDown={edit?.onPick ? tap : undefined}>
      <RigBody seat={seat} look={look} worn={worn} seatOnly={seatOnly} edit={edit} />
    </svg>
  );
}

/** The hero alone; `seat` (chair level) puts the seat under them so a sitting hero does not hang in the air. */
export function HeroRig({ size = 300, className, still, look, worn, seat }: { size?: number; className?: string; still?: boolean; look?: Look; worn?: Worn; seat?: boolean | number }) {
  return (
    <svg className={`rig ${still ? "still" : ""} ${className ?? ""}`} viewBox="0 0 1000 1400" width={size * (1000 / 1400)} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
      <RigBody look={look} worn={worn} seat={seat} />
    </svg>
  );
}
