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
import { ART_VER, usedUrl } from "../preload.ts";
import { frameGate } from "../eco.ts";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { RIG } from "./rig-data.ts";
import { BEARD_FIT } from "./beard-data.ts";
import { HAIR_CUT_HATS, HAIR_FIT, HATS_ON_HAIR, SKIN_ORIGINAL, WEAR_FIT } from "./rig-look.ts";
import { HELD_FIT, HELD_SWING } from "./held-data.ts";
import { GLOVES, GLOVES_ID } from "./gloves-data.ts";
import { MetalGlint } from "./glint.tsx";
import { KEYS_ORDER, KEYS_PARTS, KEYS_PIVOTS } from "./keys-data.ts";
import { VIALS_PARTS, VIALS_PIVOTS } from "./vials-data.ts";
import { FLASK_PARTS, FLASK_PIVOTS, FLASK_SHAPE } from "./flask-data.ts";
import { KNIFE_PARTS, KNIFE_PIVOTS } from "./knife-data.ts";
import { TATTOO_FIT } from "./tattoo-data.ts";
import { PLACES } from "./places-data.ts";
import { SEAT } from "../../content/home-scene.ts";
import { CHAIR_FIT } from "./desk-data.ts";
import { JAW } from "./jaw-data.ts";
import { Raven } from "./raven.tsx";
import { MOUTH_HELD } from "./mouth-held-data.ts";
import { DEFAULT_LOOK, equipmentById, type Look } from "../../content/home.ts";

const CHAIRS = equipmentById("chair")?.pieces ?? [];

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
/**
 * mode "items" — the clothes: the «вещи» grid (head, eyes, mouth, neck, top, bottom, shoes, the hand), a tap picks the slot;
 * mode "ink" — the tattoos: the «наколки» grid (the 21 tattoo places), a tap picks the place (zone id, tattoos.ts ZONES);
 * mode "body" — the looks (hair): every part outlined, as before.
 */
export type RigEdit = { mode: "items" | "body" | "ink"; part: string | null; onPick?: (part: string) => void;
  /** turned round (the wardrobe's rotate button): the hero's back on the stool, the back's tattoo places (tattoos.ts BACK_ZONES) */
  back?: boolean };
const EditCtx = createContext<RigEdit | null>(null);

/** the thin outline of every part in the looks editor (the clothes and the tattoos have their own grids) */
function Ol({ children }: { children: ReactNode }) {
  const e = useContext(EditCtx);
  if (!e || e.mode !== "body") return <>{children}</>;
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
  if (worn.HAND === GLOVES_ID) return { href: `/assets/hero/held/${GLOVES_ID}-fist.webp?v=${ART_VER.heroPart}`, ...GLOVES.hand };
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
  // the mouth: a cigarette, a toothpick (the «Рот» slot)
  add(MOUTH_BOX, "MOUTH", "");
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
type Grid = keyof typeof PLACES;
const PLACE_ART_V = ART_VER.tattoo;
/** which place of a grid is at a rig point (the grid's tap map: red channel = the place's number + 1) */
async function placeAt(grid: Grid, x: number, y: number): Promise<string | null> {
  const a = await alphaOf(`/assets/hero/tattoo/${grid}-map.png?v=${PLACE_ART_V}`);
  if (!a) return null;
  const px = Math.floor(x / 2), py = Math.floor(y / 2);
  if (px < 0 || py < 0 || px >= a.width || py >= a.height) return null;
  const n = a.data[(py * a.width + px) * 4];
  const order = PLACES[grid].order as readonly string[];
  return n > 0 && a.data[(py * a.width + px) * 4 + 3] > 0 ? order[n - 1] ?? null : null;
}
async function pickAt(x: number, y: number, layers: HitLayer[], mode: RigEdit["mode"], back?: boolean): Promise<string | null> {
  if (back) return mode === "ink" ? placeAt("bzone", x, y) : null;
  if (mode === "ink") return placeAt("zone", x, y);
  if (mode === "items") {
    // a worn thing that sticks out past the body (a hat, a jacket) is still its slot; the body itself by the grid
    const hit = await placeAt("slot", x, y);
    if (hit) return hit;
  }
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
        <feFlood floodColor="#ffffff" />
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
  const head = [p("head"), hairLayer(look, worn)].filter(Boolean) as Box[];
  if (edit.mode === "items") {
    // a worn thing: the ring round its picture (the place's own picture is drawn by Highlight)
    switch (edit.part) {
      case "HEAD": { const w = wearLayer(worn, "HEAD"); return w ? [{ boxes: [w, ...head] }] : []; }
      case "ACCESSORY": case "FACE": case "SHIRT": case "PANTS": case "SHOES": { const w = wearLayer(worn, edit.part); return w ? [{ boxes: [w] }] : []; }
      case "HAND": return worn.HAND && (worn.HAND in HELD_FIT || worn.HAND === GLOVES_ID) ? [{ boxes: [handLayer(look, worn)] }] : [];
    }
    return [];
  }
  if (edit.mode === "ink") return [];
  switch (edit.part) {
    case "HEAD": return [{ boxes: head }];
    case "EYES": return [{ boxes: [EYES_BOX] }];
    case "MOUTH": case "TEETH": return [{ boxes: [MOUTH_BOX] }];
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
/** the chosen place of the clothes / tattoo grid: its own picture (lightly filled, brightly outlined) */
const placeSrc = (grid: Grid, id: string) => `/assets/hero/tattoo/place-${grid}-${id}.webp?v=${PLACE_ART_V}`;
/** all the place pictures of a grid, loaded once it is opened: a tap then shows its place at once */
const placesLoaded = new Set<Grid>();
function preloadPlaces(grid: Grid) {
  if (placesLoaded.has(grid) || typeof Image === "undefined") return;
  placesLoaded.add(grid);
  for (const id of Object.keys(PLACES[grid].fit)) { const im = new Image(); im.src = placeSrc(grid, id); }
}
function PlacePic({ grid, id }: { grid: Grid; id: string }) {
  const f = (PLACES[grid].fit as Record<string, { x: number; y: number; w: number; h: number }>)[id];
  if (!f) return null;
  // keyed by the place: a new <image> per place — a reused one moves to the new box at once while it still shows the
  // previous place's picture until the new one loads (the wrong place flashed on a tap)
  return <image key={`${grid}-${id}`} className="rig-place" href={placeSrc(grid, id)} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />;
}
function PreloadPlaces({ grid }: { grid: Grid }) {
  useEffect(() => preloadPlaces(grid), [grid]);
  return null;
}
/** the mask that keeps the tattoo grid off the head and the beard (their pictures, filled black) */
function InkHeadCut() {
  const { beard } = useContext(LookCtx);
  const h = RIG.head, b = beard ? BEARD_FIT[beard] : null;
  return (
    <defs>
      <filter id="rig-ink-black"><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" /></filter>
      <mask id="rig-ink-headcut" maskUnits="userSpaceOnUse" x={0} y={0} width={1000} height={1400}>
        <rect x={0} y={0} width={1000} height={1400} fill="#fff" />
        <g filter="url(#rig-ink-black)">
          <image href={`/assets/hero/head.webp?v=${ART_VER.heroPart}`} x={h.x} y={h.y} width={h.w} height={h.h} preserveAspectRatio="none" />
          {b && <image href={`/assets/hero/beard-${beard}.webp?v=${ART_VER.heroPart}`} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />}
        </g>
      </mask>
    </defs>
  );
}

function Highlight({ edit }: { edit: RigEdit }) {
  const look = useContext(LookCtx), worn = useContext(WornCtx);
  // the hand with the keys shows its own place (KeysHand)
  if (edit.mode === "ink" && edit.part === "hand-r" && (worn.HAND === KEYS_ID || worn.HAND === VIALS_ID || worn.HAND === FLASK_ID || worn.HAND === KNIFE_ID)) return null;
  const shapes = partShapes(edit, look, worn);
  return (
    <g pointerEvents="none" className="rig-hl-part">
      {edit.part && edit.mode !== "body" && <PlacePic grid={edit.back ? "bzone" : edit.mode === "ink" ? "zone" : "slot"} id={edit.part} />}
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
/** `hat`: a head thing — "under" the hair (headphones) or "over" it (hats that cut the hair, HAIR_CUT_HATS) */
/** clothes with a part behind the legs (a long coat's back, over the seat, under the body): its own picture */
const WEAR_BACK: Record<string, string> = { "coat-botsman": "coat-botsman-back", "coat-himik": "coat-himik-back" };
function WearBack() {
  const id = wornIn(useContext(WornCtx), "SHIRT");
  const back = id ? WEAR_BACK[id] : undefined;
  if (!back || !(back in WEARS)) return null;
  const f = WEARS[back];
  const pic = <image href={`/assets/hero/wear/${back}.webp?v=${ART_VER.wear}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />;
  // a swaying coat: its back sways from its top edge, a beat behind the front tails
  return id && WEAR_SWAY[id] ? <g className="rig-sway rig-sway-back" style={{ transformOrigin: `500px ${f.y}px`, transformBox: "view-box" }}>{pic}</g> : pic;
}

/** long coats whose tails (and the apron below the lap) sway a little: below this line (rig y) the picture leans side to side (a skew about the line,
 *  so the seam stays put); above it — the shoulders and sleeves on the arms — it stays still */
const WEAR_SWAY: Record<string, number> = { "coat-botsman": 820, "apron-utilizator": 840, "coat-himik": 790 };
function SwayingWear({ id }: { id: string }) {
  const f = WEARS[id];
  const cut = WEAR_SWAY[id];
  const uid = useId().replace(/:/g, "");
  const pic = <image href={`/assets/hero/wear/${id}.webp?v=${ART_VER.wear}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />;
  return (
    <>
      <defs>
        <clipPath id={`${uid}-u`}><rect x={-200} y={-200} width={1400} height={cut + 201} /></clipPath>
        <clipPath id={`${uid}-d`}><rect x={-200} y={cut} width={1400} height={1600} /></clipPath>
      </defs>
      <g clipPath={`url(#${uid}-u)`}>{pic}</g>
      <g className="rig-sway" style={{ transformOrigin: `500px ${cut}px`, transformBox: "view-box" }}><g clipPath={`url(#${uid}-d)`}>{pic}</g></g>
    </>
  );
}

function Wear({ slot, hat }: { slot: string; hat?: "under" | "over" }) {
  const id = wornIn(useContext(WornCtx), slot);
  if (!id) return null;
  if (hat && (hat === "over") !== (HAIR_CUT_HATS.includes(id) || HATS_ON_HAIR.includes(id))) return null;
  if (WEAR_SWAY[id]) return <SwayingWear id={id} />;
  const f = WEARS[id];
  return <image href={`/assets/hero/wear/${id}.webp?v=${ART_VER.wear}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />;
}

/**
 * Something in the mouth (slot «Рот»: a cigarette, a toothpick): the teeth are clenched on it (jaw.webp, tools/rig/build-mouth.py).
 * Now and then the lower jaw drops a little (the chin is pulled down with it — JAW.frames frames shown one at a time, .rig-jaw-f),
 * and the thing is turned quickly from one corner of the mouth to the other: through the front of the teeth, pointing at us
 * (shorter there), then on into the other corner; the jaw closes. The picture (mouth-<id>.webp, build-held-mouth.py) lies level
 * with the end in the mouth at 0,0 — .rig-chew moves and turns it around that end; the smoke (.rig-smoke-at) follows the lit tip.
 */
/** part «jaw» — the teeth (under the beard); «held» — the thing in the mouth and its smoke (over the beard: it grows a level a day) */
function Mouth({ part }: { part: "jaw" | "held" }) {
  const worn = useContext(WornCtx);
  const id = wornIn(worn, "MOUTH") ?? (worn.MOUTH && worn.MOUTH in MOUTH_HELD ? worn.MOUTH : null);
  // «Зубы»: the diamond grills — the same jaw with diamond teeth; with nothing in the mouth he grins with them
  const diamond = worn.TEETH === "grillz-diamond";
  const teeth = !!worn.TEETH;
  const uid = useId().replace(/:/g, "");
  const { skin } = useContext(LookCtx);
  if (!id && !teeth) return null;
  const href = `${skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${skin}` : "/assets/hero"}/${diamond ? "jaw-diamond" : "jaw"}.webp?v=${ART_VER.heroPart}`;
  const held = id ? MOUTH_HELD[id] : undefined;
  if (part === "held") {
    return (
      <>
        {held ? (
          <g className={`rig-chew ${teeth ? "" : "fixed"}`} pointerEvents="none">
            <image href={`/assets/hero/mouth-${id}.webp?v=${ART_VER.wear}`} x={0} y={-held.thick / 2} width={held.len} height={held.thick} preserveAspectRatio="none" />
          </g>
        ) : id ? <Wear slot="MOUTH" /> : null}
        {(id === "cigarette" || id === "cigar") && (
          <g className={`rig-smoke-at ${teeth ? "" : "fixed"}`} pointerEvents="none">
            <g className="rig-smoke">
              {[0, 1, 2].map((i) => <circle key={i} cx={0} cy={0} r={6} style={{ animationDelay: `${i * 0.9}s` }} />)}
            </g>
          </g>
        )}
      </>
    );
  }
  return (
    <>
      {/* the jaw (teeth, chewing) only with «Зубы» worn; without them the thing just sits in the corner of the closed mouth */}
      {teeth && <svg x={JAW.x} y={JAW.y} width={JAW.w} height={JAW.h} viewBox={`0 0 ${JAW.w} ${JAW.h}`} overflow="hidden" pointerEvents="none">
        <image className="rig-jaw-f" href={href} x={0} y={0} width={JAW.w} height={JAW.h * JAW.frames} preserveAspectRatio="none"
          style={{ ["--fh" as string]: `${JAW.h}px` }} />
        {/* the diamonds: a glare sweeps across the teeth (like on the medals), only where the teeth show */}
        {diamond && (
          <>
            <defs>
              <mask id={`${uid}-m`} maskUnits="userSpaceOnUse" x={0} y={0} width={JAW.w} height={JAW.h}>
                <image className="rig-jaw-f" href={`/assets/hero/jaw-diamond-mask.webp?v=${ART_VER.heroPart}`} x={0} y={0} width={JAW.w} height={JAW.h * JAW.frames} preserveAspectRatio="none"
                  style={{ ["--fh" as string]: `${JAW.h}px` }} />
              </mask>
              <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="0.35">
                <stop offset="0" stopColor="#fff" stopOpacity="0" />
                <stop offset="0.42" stopColor="#fff" stopOpacity="0.7" /><stop offset="0.5" stopColor="#fff" stopOpacity="1" /><stop offset="0.58" stopColor="#fff" stopOpacity="0.7" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g mask={`url(#${uid}-m)`}>
              <rect className="rig-teeth-shine" x={0} y={0} width={JAW.w * 0.42} height={JAW.h} fill={`url(#${uid}-g)`} />
            </g>
          </>
        )}
      </svg>}
      {/* the diamonds glint: little stars flash on the teeth now and then */}
      {diamond && (
        <g className="rig-glint" pointerEvents="none">
          {GLINTS.map(([x, y, d], i) => (
            <path key={i} d="M0 -4 L0.9 -0.9 L4 0 L0.9 0.9 L0 4 L-0.9 0.9 L-4 0 L-0.9 -0.9 Z" transform={`translate(${x} ${y})`} style={{ animationDelay: `${d}s` }} />
          ))}
        </g>
      )}
    </>
  );
}

/** the beard: a level a day unshaven (look.beard 1–3), over the face and the jaw, under the face things */
function Beard() {
  const { beard } = useContext(LookCtx);
  const f = beard ? BEARD_FIT[beard] : null;
  if (!f) return null;
  return <image href={`/assets/hero/beard-${beard}.webp?v=${ART_VER.heroPart}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" pointerEvents="none" />;
}

/** open jackets: the chain goes under them */
const OPEN_JACKETS = ["jacket-komandate", "jacket-puffer", "jacket-vadim", "coat-botsman", "coat-himik"];

/** where the diamond teeth glint (rig coordinates over the mouth) and when (s) */
const GLINTS: [number, number, number][] = [[485, 253, 0], [503, 256, 1.3], [520, 252, 2.6], [495, 266, 3.7], [515, 267, 5.1]];

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

/** the belly's tattoos are drawn over the arms, so over the trousers too: worn trousers mask them out, the edge blurred so the
 *  ink fades smoothly under the waistband instead of lying on the cloth */
function UnderPants({ children }: { children: ReactNode }) {
  const pants = wornIn(useContext(WornCtx), "PANTS");
  const { tattoos } = useContext(LookCtx);
  const uid = useId().replace(/:/g, "");
  if (!pants || !WEARS[pants] || !(tattoos ?? []).some((id) => TATTOO_FIT[id]?.part === "upper")) return <>{children}</>;
  const f = WEARS[pants];
  return (
    <>
      <defs>
        <filter id={`${uid}-pk`} x="-10%" y="-10%" width="120%" height="120%">
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={`${uid}-pw`} x="-5%" y="-5%" width="110%" height="110%">
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
        </filter>
        <mask id={`${uid}-pm`} maskUnits="userSpaceOnUse" x={-200} y={-200} width={1400} height={1800}>
          <rect x={-200} y={-200} width={1400} height={1800} fill="#fff" />
          <image href={`/assets/hero/wear/${pants}.webp?v=${ART_VER.wear}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" filter={`url(#${uid}-pk)`} />
          {/* the arms lie over the trousers (a hand on the knee): their ink stays */}
          <g filter={`url(#${uid}-pw)`}>
            <Bone p="armUL"><Bone p="foreL" /></Bone>
            <Bone p="armUR"><Bone p="foreR" /></Bone>
          </g>
        </mask>
      </defs>
      <g mask={`url(#${uid}-pm)`}>{children}</g>
    </>
  );
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
  if (heldId === GLOVES_ID) return <GloveHand />;
  if (heldId === KEYS_ID) return <KeysHand />;
  if (heldId === VIALS_ID) return <VialsHand />;
  if (heldId === FLASK_ID) return <FlaskHand />;
  if (heldId === KNIFE_ID) return <KnifeHand />;
  if (heldId && heldId in HELD_FIT) {
    const f = HELD_FIT[heldId];
    const sw = HELD_SWING[heldId];
    const base = skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${skin}/held-${heldId}` : `/assets/hero/held/${heldId}`;
    return (
      <g className={`rig-hand held ${sw ? "swing" : ""} ${heldId in HELD_STEAM ? "slosh" : ""}`}>
        {/* what hangs from the fist (the anchor on its rope) swings behind the hand as a pendulum, a beat behind it */}
        {sw && (
          <g className="rig-pendulum" style={{ transformOrigin: `${sw.pivot[0]}px ${sw.pivot[1]}px`, transformBox: "view-box" }}>
            {Object.entries(sw.parts).map(([k, b]) => (
              <image key={k} href={`/assets/hero/held/${heldId}-${k}.webp?v=${ART_VER.heroPart}`} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />
            ))}
          </g>
        )}
        <image href={`${base}.webp?v=${ART_VER.heroPart}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />
        {heldId in HELD_STEAM && <Steam at={HELD_STEAM[heldId]} />}
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

const KEYS_ID = "keys-bundle";
const VIALS_ID = "vials-utilizator";

/**
 * «Колбы Утилизатора» (tools/rig/build-vials.py), a little physics instead of a picture going round:
 *  - the ring with the vials is a heavy pendulum on the finger; the hand keeps driving it clockwise (a pull towards the
 *    drive speed), gravity slows it over the top and speeds it through the bottom;
 *  - the hand answers the weight: it lifts and turns with the vials' pull (most when they swing low and fast), and leads
 *    the ring a little, as a hand that is twirling it;
 *  - each vial hangs on its eye: it wants to point along gravity + the spin's pull outward (in the ring's frame) and gets
 *    there on a soft spring, so it lags and swings on its own.
 */
function VialsHand() {
  const { skin } = useContext(LookCtx);
  const handRef = useRef<SVGGElement>(null), spinRef = useRef<SVGGElement>(null);
  const vialRefs = [useRef<SVGGElement>(null), useRef<SVGGElement>(null), useRef<SVGGElement>(null)];
  const fingerRefs = [useRef<SVGGElement>(null), useRef<SVGGElement>(null), useRef<SVGGElement>(null)];
  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // the twirl never stops: the hand keeps the ring going round at about DRIVE; the weight slows it hard on the way up
    // and drops it fast over the top and through the bottom (the speed never goes below a third: it never swings back)
    const DRIVE = (Math.PI * 2) / 1.0, PULL = 7, GL = 17;
    let phi = 0, w = DRIVE, last = performance.now(), raf = 0, t = 0;
    const vials = [0, 0, 0].map((_, i) => ({ a: 0, v: 0, k: 55 + i * 10, c: 4.5 + i * 0.6 }));
    // the middle, ring and little fingers close together now and then
    let close = 0, closeV = 0, closeAt = 1.5 + Math.random() * 2, closeEnd = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      t += dt;
      const n = Math.ceil(dt / 0.004), h = dt / n;
      if (t >= closeAt && closeEnd === 0) closeEnd = t + 0.45 + Math.random() * 0.4;
      if (closeEnd && t >= closeEnd) { closeEnd = 0; closeAt = t + 1.6 + Math.random() * 2.8; }
      const closeTarget = closeEnd ? 1 : 0;
      for (let k = 0; k < n; k++) {
        const acc = PULL * (DRIVE - w) - GL * Math.sin(phi);
        w = Math.max(DRIVE * 0.3, w + acc * h);
        phi += w * h;
        // each vial: the spin flings it outward, a little of the weight pulls it toward the ground; it lags on a spring
        const target = Math.atan2(-Math.sin(phi) * 0.7, Math.cos(phi) * 0.7 + 0.9);
        for (const v of vials) {
          let d = target - v.a;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          v.v += (v.k * d - v.c * v.v - acc * 0.45) * h;
          v.a += v.v * h;
        }
        closeV += (60 * (closeTarget - close) - 11 * closeV) * h;
        close += closeV * h;
      }
      phi %= Math.PI * 2;
      const deg = (r: number) => (r * 180) / Math.PI;
      // the hand turns at the wrist only (it stays on the forearm): it rises as the weight swings up and away, sinks as it falls
      const turn = -6 * (1 - Math.cos(phi + 0.6)) / 2 + 1.5 * Math.sin(phi + 0.6) - 0.6 * (w - DRIVE);
      handRef.current?.setAttribute("transform", `rotate(${turn.toFixed(2)} ${VIALS_PIVOTS.wrist[0]} ${VIALS_PIVOTS.wrist[1]})`);
      spinRef.current?.setAttribute("transform", `rotate(${deg(phi).toFixed(2)} ${VIALS_PIVOTS.spin[0]} ${VIALS_PIVOTS.spin[1]})`);
      vialRefs.forEach((r, i) => {
        const p = VIALS_PARTS[`vial-${i + 1}`].pivot!;
        r.current?.setAttribute("transform", `rotate(${deg(vials[i].a).toFixed(2)} ${p[0]} ${p[1]})`);
      });
      // closing: the middle finger turns toward the ring finger, the little one too; the ring one a touch
      [-7, 2, 9].forEach((a, i) => {
        const p = VIALS_PIVOTS[["finger-m", "finger-r", "finger-p"][i]];
        fingerRefs[i].current?.setAttribute("transform", `rotate(${(a * close).toFixed(2)} ${p[0]} ${p[1]})`);
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const src = (part: string, tinted = false) =>
    `${tinted && skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${skin}/held-${VIALS_ID}` : `/assets/hero/held/${VIALS_ID}`}-${part}.webp?v=${ART_VER.heroPart}`;
  const img = (part: string, tinted = false) => {
    const b = VIALS_PARTS[part];
    return <image href={src(part, tinted)} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />;
  };
  return (
    <g className="rig-hand rig-vials" ref={handRef}>
      <g ref={spinRef}>
        {img("ring")}
        {["vial-1", "vial-2", "vial-3"].map((v, i) => <g key={v} ref={vialRefs[i]}>{img(v)}</g>)}
        {img("clip-1")}{img("clip-2")}{img("clip-3")}
      </g>
      {img("hand", true)}
      {["finger-m", "finger-r", "finger-p"].map((f, i) => <g key={f} ref={fingerRefs[i]}>{img(f, true)}</g>)}
    </g>
  );
}

const FLASK_ID = "flask-himik";

/**
 * «Колба Химика» (tools/rig/build-flask.py, the artist's layers and his video): the hand holds the round flask by its
 * neck between the fingers; the hand rocks a little at the wrist, the flask hangs from the grip and swings under it as a
 * pendulum (the hand's rocking keeps it going), and the green poison inside keeps level, lagging behind the swings and
 * sloshing (its surface tilts against the flask and ripples), small bubbles rise through it. The glass is drawn twice:
 * solid under the liquid, see-through over it.
 */
function FlaskHand() {
  const { skin } = useContext(LookCtx);
  const uid = useId().replace(/:/g, "");
  const handRef = useRef<SVGGElement>(null), flaskRef = useRef<SVGGElement>(null), liqRef = useRef<SVGGElement>(null), waveRef = useRef<SVGPathElement>(null);
  const topRef = useRef<SVGGElement>(null), lowRef = useRef<SVGGElement>(null);
  const [gx, gy] = FLASK_PIVOTS.grip, [cx, cy] = FLASK_PIVOTS.bulb, [wx, wy] = FLASK_PIVOTS.wrist;
  const r = FLASK_SHAPE.bulbR;
  // the liquid's surface (in the bulb's own frame, level at LV): a wavy top, the body down past the bottom
  const LV = cy - r * 0.12;
  const wave = (ph: number, amp: number) => {
    let d = `M${cx - r * 2} ${LV}`;
    for (let i = 0; i <= 16; i++) {
      const x = cx - r * 2 + (i * r * 4) / 16;
      d += ` L${x.toFixed(1)} ${(LV + amp * Math.sin(ph + i * 0.9) + amp * 0.5 * Math.sin(ph * 1.7 + i * 1.6)).toFixed(2)}`;
    }
    return d;
  };
  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gate = frameGate();
    // the pendulum: the flask's angle in the world (rad) round the grip; the liquid's surface angle in the world (lags)
    const LEN = Math.hypot(cx - gx, cy - gy), W2 = 26, DAMP = 0.55;
    let th = 0, thV = 0, su = 0, suV = 0, last = performance.now(), t = 0, raf = 0;
    let pgx = gx, pgy = gy, pvx = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      // the hand rocks at the wrist, a little slower than the flask's own swing (so it keeps swinging without growing wild)
      const hand = 3.6 * Math.sin(t * 4.6) * (0.75 + 0.25 * Math.sin(t * 0.7)) + 1.2 * Math.sin(t * 1.7 + 1.1);
      const ha = (hand * Math.PI) / 180;
      // where the grip is now (it rides on the hand round the wrist): its sideways speed and pull drive the pendulum
      const dx = gx - wx, dy = gy - wy;
      const ngx = wx + dx * Math.cos(ha) - dy * Math.sin(ha), ngy = wy + dx * Math.sin(ha) + dy * Math.cos(ha);
      const vx = (ngx - pgx) / Math.max(dt, 1e-3), ax = (vx - pvx) / Math.max(dt, 1e-3);
      pgx = ngx; pgy = ngy; pvx = vx;
      const n = Math.ceil(dt / 0.004), h = dt / n;
      for (let k = 0; k < n; k++) {
        const acc = -W2 * Math.sin(th) - DAMP * thV - (Math.max(-900, Math.min(900, ax)) / LEN) * Math.cos(th) * 0.9;
        thV += acc * h;
        th += thV * h;
        // the liquid wants to stay level (0) and lags: the flask's swing kicks it the other way, it rocks back on a spring
        suV += (-38 * su - 2.2 * suV - acc * 0.35) * h;
        su += suV * h;
      }
      const deg = (v: number) => (v * 180) / Math.PI;
      if (!gate(now)) return;
      handRef.current?.setAttribute("transform", `rotate(${hand.toFixed(2)} ${wx} ${wy})`);
      // the flask's group is inside the hand's: its own turn is the world angle minus the hand's
      flaskRef.current?.setAttribute("transform", `rotate(${(deg(th) - hand).toFixed(2)} ${gx} ${gy})`);
      // the liquid (inside the flask's group): turned back to the world's level, plus its own lag
      liqRef.current?.setAttribute("transform", `rotate(${(deg(su) - deg(th)).toFixed(2)} ${cx} ${cy})`);
      // the two fingers on the neck fidget at their roots, each on its own beat: the upper one lifts and presses, the lower
      // one rubs the glass
      const up = 6 * Math.sin(t * 2.3) * Math.max(0, Math.sin(t * 0.9)) - 2.5 * Math.max(0, Math.sin(t * 5.2 + 1)) ** 4;
      const low = 5.5 * Math.sin(t * 3.1 + 0.8) * (0.6 + 0.4 * Math.sin(t * 0.6 + 2));
      topRef.current?.setAttribute("transform", `rotate(${up.toFixed(2)} ${FLASK_PIVOTS.thumb[0]} ${FLASK_PIVOTS.thumb[1]})`);
      lowRef.current?.setAttribute("transform", `rotate(${low.toFixed(2)} ${FLASK_PIVOTS.fingers[0]} ${FLASK_PIVOTS.fingers[1]})`);
      waveRef.current?.setAttribute("d", `${wave(t * 7, 0.6 + Math.min(2.2, Math.abs(suV) * 0.6))} L${cx + r * 2} ${cy + r * 2.4} L${cx - r * 2} ${cy + r * 2.4} Z`);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const src = (part: string, tinted = false) =>
    `${tinted && skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${skin}/held-${FLASK_ID}` : `/assets/hero/held/${FLASK_ID}`}-${part}.webp?v=${ART_VER.heroPart}`;
  const img = (part: string, tinted = false) => {
    const b = FLASK_PARTS[part];
    return <image href={src(part, tinted)} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />;
  };
  const ins = FLASK_PARTS.inside;
  return (
    <g className="rig-hand rig-flask" ref={handRef}>
      <defs>
        <mask id={`fl-in-${uid}`} maskUnits="userSpaceOnUse" x={ins.x} y={ins.y} width={ins.w} height={ins.h}>
          <image href={src("inside")} x={ins.x} y={ins.y} width={ins.w} height={ins.h} preserveAspectRatio="none" />
        </mask>
        <linearGradient id={`fl-liq-${uid}`} gradientUnits="userSpaceOnUse" x1={cx} y1={LV} x2={cx} y2={cy + r}>
          <stop offset="0" stopColor="#9dff3a" />
          <stop offset="0.45" stopColor="#46d10f" />
          <stop offset="1" stopColor="#167a0a" />
        </linearGradient>
      </defs>
      {img("fingers-back", true)}
      <g ref={flaskRef}>
        {img("glass")}
        <g mask={`url(#fl-in-${uid})`}>
          <g ref={liqRef}>
            <path ref={waveRef} d={`${wave(0, 0.6)} L${cx + r * 2} ${cy + r * 2.4} L${cx - r * 2} ${cy + r * 2.4} Z`} fill={`url(#fl-liq-${uid})`} />
            <rect x={cx - r * 2} y={LV - 0.6} width={r * 4} height={1.6} fill="#e2ffa8" opacity={0.85} />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <circle key={i} className="rig-flask-bub" cx={cx - r * 0.55 + i * r * 0.22} cy={cy + r * 0.72} r={2.2 + (i % 3) * 0.9} fill="rgba(230,255,200,0.85)"
                style={{ animationDelay: `${(i * 0.53) % 2.2}s`, ["--rise" as string]: `${(cy + r * 0.72 - LV - 3).toFixed(1)}px` }} />
            ))}
          </g>
        </g>
        {/* the see-through glass over the liquid: lighter still, so the poison shows bright */}
        <g opacity={0.28}>{img("glass-front")}</g>
      </g>
      {img("hand", true)}
      <g ref={lowRef}>{img("fingers", true)}</g>
      <g ref={topRef}>{img("thumb", true)}</g>
    </g>
  );
}

const KNIFE_ID = "knife-psih";

/**
 * «Нож Психа» (tools/rig/build-knife.py, the artist's layers and his video): the hand rests with the knife under its
 * fingers; every few seconds it dips, flicks up and the fingers lift (they turn up at their roots), the knife is thrown
 * up — a real throw: it flies on gravity, spinning at the speed the flick gave it, one full turn by the time it falls back
 * — and the hand catches it: the catch knocks the hand down a little and the knife rocks in the fingers before it
 * settles (springs). In between the fingers lift and drop and the thumb rubs, each on its own beat. The knife is always
 * behind the whole hand (its own layer under the fingers and the palm).
 */
function KnifeHand() {
  const { skin } = useContext(LookCtx);
  const handRef = useRef<SVGGElement>(null), knifeRef = useRef<SVGGElement>(null);
  const frontRef = useRef<SVGGElement>(null), backRef = useRef<SVGGElement>(null), thumbRef = useRef<SVGGElement>(null);
  const P = KNIFE_PIVOTS;
  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gate = frameGate();
    // the throw: up HIGH rig px on gravity G; it turns once while in the air
    const G = 1500, HIGH = 150, VY = Math.sqrt(2 * G * HIGH), AIR = (2 * VY) / G, SPIN = 360 / AIR;
    // the hand's wrist angle and the fingers' lift on springs (they chase the targets the toss sets)
    const hand = { a: 0, v: 0 }, open = { a: 0, v: 0 };
    // the knife: in the hand it rocks on a spring (its angle off the rest), in the air it flies
    const knife = { air: false, x: 0, y: 0, vx: 0, vy: 0, r: 0, w: 0 };
    let next = 1.2, phase: "rest" | "dip" | "flick" = "rest", phaseAt = 0, t = 0, last = performance.now(), raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const n = Math.ceil(dt / 0.004), h = dt / n;
      for (let i = 0; i < n; i++) {
        t += h;
        // the toss's beats: dip (0.14 s), flick (0.12 s: the knife leaves at its end), then back to rest
        if (phase === "rest" && !knife.air && t >= next) { phase = "dip"; phaseAt = t; }
        if (phase === "dip" && t - phaseAt >= 0.14) { phase = "flick"; phaseAt = t; }
        if (phase === "flick" && t - phaseAt >= 0.12) {
          phase = "rest";
          Object.assign(knife, { air: true, x: 0, y: 0, vx: -14 / AIR, vy: -VY, r: knife.r, w: SPIN });
          hand.v -= 60; // the throw's kick back up
        }
        const handTarget = phase === "dip" ? 5 : phase === "flick" ? -12 : knife.air ? -6 : 0;
        const openTarget = phase === "flick" ? 1 : knife.air ? 0.85 : 0;
        hand.v += (220 * (handTarget - hand.a) - 16 * hand.v) * h; hand.a += hand.v * h;
        open.v += (260 * (openTarget - open.a) - 18 * open.v) * h; open.a += open.v * h;
        if (knife.air) {
          knife.vy += G * h; knife.x += knife.vx * h; knife.y += knife.vy * h; knife.r += knife.w * h;
          if (knife.vy > 0 && knife.y >= 0) {
            // caught: the turn it still owes to a full one becomes a rock in the fingers; the hand gives with the weight
            const off = ((knife.r % 360) + 540) % 360 - 180;
            Object.assign(knife, { air: false, x: 0, y: 0, vx: 0, vy: 0, r: off, w: knife.w * 0.12 });
            hand.v += 90;
            open.v -= 4;
            next = t + 2.4 + Math.random() * 1.6;
          }
        } else {
          knife.w += (-300 * knife.r - 14 * knife.w) * h; knife.r += knife.w * h;
        }
      }
      if (!gate(now)) return;
      // the fingers lift (up, at their roots) with the toss, and on their own beats in between; the thumb rubs
      const lift = (ph: number) => Math.max(0, Math.sin(ph)) ** 3;
      const idle = knife.air ? 0.2 : 1;
      const fFront = 32 * open.a + 9 * lift(t * 2.9) * idle;
      const fBack = 26 * open.a + 8 * lift(t * 2.9 - 1.2) * idle;
      const fThumb = 12 * open.a + 4 * Math.sin(t * 2.4 + 0.5);
      handRef.current?.setAttribute("transform", `rotate(${hand.a.toFixed(2)} ${P.wrist[0]} ${P.wrist[1]})`);
      frontRef.current?.setAttribute("transform", `rotate(${fFront.toFixed(2)} ${P["finger-front"][0]} ${P["finger-front"][1]})`);
      backRef.current?.setAttribute("transform", `rotate(${fBack.toFixed(2)} ${P["finger-back"][0]} ${P["finger-back"][1]})`);
      thumbRef.current?.setAttribute("transform", `rotate(${fThumb.toFixed(2)} ${P.thumb[0]} ${P.thumb[1]})`);
      knifeRef.current?.setAttribute("transform", `translate(${knife.x.toFixed(1)} ${knife.y.toFixed(1)}) rotate(${knife.r.toFixed(1)} ${P.knife[0]} ${P.knife[1]})`);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const src = (part: string, tinted = false) =>
    `${tinted && skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${skin}/held-${KNIFE_ID}` : `/assets/hero/held/${KNIFE_ID}`}-${part}.webp?v=${ART_VER.heroPart}`;
  const img = (part: string, tinted = false) => {
    const b = KNIFE_PARTS[part];
    return <image href={src(part, tinted)} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />;
  };
  return (
    <g className="rig-hand rig-knife" ref={handRef}>
      <g ref={knifeRef}>{img("knife")}</g>
      <g ref={thumbRef}>{img("thumb", true)}</g>
      {img("hand", true)}
      <g ref={backRef}>{img("finger-back", true)}</g>
      <g ref={frontRef}>{img("finger-front", true)}</g>
    </g>
  );
}

const KEY_NAMES = KEYS_ORDER.filter((n) => n.startsWith("key-"));
const at = (p: [number, number]) => ({ transformOrigin: `${p[0]}px ${p[1]}px`, transformBox: "view-box" as const });

/**
 * «Связка ключей» (tools/rig/build-keys.py): the hand bobs a little at the wrist; the ring swings from the fingers and
 * the keys on it a beat behind (screens.css «rk-»), each key dangles a little on its
 * own; the thumb behind the hand and the index finger move. The ring's left half is behind the keys, its right half over
 * them; the hand is over all of it. Now and then one key gleams — one at a time, in a random order.
 */
function KeysHand() {
  const { skin } = useContext(LookCtx);
  const src = (part: string, tinted = false) =>
    `${tinted && skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${skin}/held-${KEYS_ID}` : `/assets/hero/held/${KEYS_ID}`}-${part}.webp?v=${ART_VER.heroPart}`;
  const img = (part: string, tinted = false) => {
    const b = KEYS_PARTS[part];
    return <image href={src(part, tinted)} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />;
  };
  const [shine, setShine] = useState<{ key: string; n: number }[]>([]);
  const edit = useContext(EditCtx);
  useEffect(() => {
    let last = "";
    let n = 0;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      const pool = KEY_NAMES.filter((k) => k !== last);
      last = pool[Math.floor(Math.random() * pool.length)];
      const item = { key: last, n: ++n };
      setShine((s) => [...s.slice(-3), item]);
      t = setTimeout(next, 500 + Math.random() * 700);
    };
    t = setTimeout(next, 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <g className="rig-hand rig-keys" style={at(KEYS_PIVOTS.wrist)}>
      <g className="rk-ring" style={at(KEYS_PIVOTS.grip)}>
        {img("ring-back")}
        <g className="rk-keys" style={at(KEYS_PIVOTS.hang)}>
          {KEY_NAMES.map((k, i) => {
            const b = KEYS_PARTS[k];
            return (
              <g key={k} className={`rk-key rk-key-${i + 1}`} style={at(b.pivot!)}>
                {img(k)}
                {shine.filter((x) => x.key === k).map((x) => (
                  <MetalGlint key={x.n} mask={src(`${k}-shine`)} box={b} star={b.star!} size={11} />
                ))}
              </g>
            );
          })}
        </g>
        {img("ring-front")}
      </g>
      <g className="rk-thumb" style={at(KEYS_PIVOTS.thumb)}>{img("thumb", true)}</g>
      {img("hand", true)}
      <g className="rk-finger" style={at(KEYS_PIVOTS.finger)}>{img("finger", true)}</g>
      {/* no hand tattoos on this hand: it moves, the ink would not (the forearm keeps its own) */}
      {/* the looks editor's tattoo grid: this hand's own outline, filled when its place is chosen */}
      {edit?.mode === "ink" && (
        <image className={edit.part === "hand-r" ? "rig-place" : "rig-grid"} href={src(edit.part === "hand-r" ? "place" : "zone")} pointerEvents="none"
          x={KEYS_PARTS.zone.x} y={KEYS_PARTS.zone.y} width={KEYS_PARTS.zone.w} height={KEYS_PARTS.zone.h} preserveAspectRatio="none" />
      )}
    </g>
  );
}

/** a hot drink in the hand: where its steam rises from (the middle of the rim, rig coordinates; source/held/mug-coin.png) */
const HELD_STEAM: Record<string, [number, number]> = { "mug-coin": [621.5, 716] };

/**
 * Steam over a hot mug: soft wisps rise, sway, widen and melt away, one after another (screens.css «rig-steam»).
 * The hand sloshes the mug about the wrist; the steam's own group turns back the same angle about the rim, so the
 * steam rides along with the mug but keeps rising straight up.
 */
function Steam({ at }: { at: [number, number] }) {
  const uid = useId().replace(/:/g, "");
  const [x, y] = at;
  const wisp = (dx: number) => `M${x + dx} ${y} c -9 -12 9 -22 0 -34 s -9 -22 0 -34 s 7 -18 0 -28`;
  return (
    <g className="rig-steam-keep" style={{ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" }} pointerEvents="none" aria-hidden="true">
      <defs>
        <filter id={`${uid}-b`} x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="3.2" /></filter>
      </defs>
      <g filter={`url(#${uid}-b)`} fill="none" stroke="#fff" strokeLinecap="round">
        {[-22, 2, 24, -8, 14].map((dx, i) => (
          <path key={i} className={`rig-steam rig-steam-${i}`} d={wisp(dx)} strokeWidth={i % 2 ? 9 : 12}
            style={{ transformOrigin: `${x + dx}px ${y}px`, transformBox: "view-box" }} />
        ))}
      </g>
    </g>
  );
}

/**
 * «Перчатки Боцмана», the left hand: the glove's fingers over Боцман's crowbar. The wrist rocks it, dips, flicks it up —
 * a full turn in the air — and catches it; the crowbar hangs on a spring at the grip (its weight); the glove's frames
 * (fist, open, squeeze — a puppet warp of the fingers) switch as it lets go and clenches. All baked by tools/rig/build-gloves.py.
 */
function GloveHand() {
  const g = GLOVES;
  const pic = (name: string, b: { x: number; y: number; w: number; h: number }, className?: string) => (
    <image className={className} href={`/assets/hero/held/${GLOVES_ID}-${name}.webp?v=${ART_VER.heroPart}`} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />
  );
  return (
    <g className="rig-hand rig-gloves">
      <g className="rig-crowbar">
        {pic("crowbar", g.crowbar)}
        <MetalGlint mask={`/assets/hero/held/${GLOVES_ID}-crowbar-shine.webp?v=1`} box={g.crowbar} star={[g.crowbar.x + 62, g.crowbar.y + 42]} size={18} delay={-2.2} />
      </g>
      {pic("fist", g.hand, "rig-gf rig-gf-fist")}
      {pic("open", g.hand, "rig-gf rig-gf-open")}
      {pic("squeeze", g.hand, "rig-gf rig-gf-squeeze")}
    </g>
  );
}

/** «Перчатки Боцмана», the right hand: the glove over the hand that rests on the knee (rides on the forearm, foreL) */
function GloveRight() {
  const worn = useContext(WornCtx);
  if (worn.HAND !== GLOVES_ID) return null;
  const b = GLOVES.right;
  return <image href={`/assets/hero/held/${GLOVES_ID}-right.webp?v=${ART_VER.heroPart}`} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />;
}

/**
 * A hand that holds something (an animated picture of its own) gets no hand tattoos; the body's tattoos (the forearm
 * round the wrist) lie over it instead — only near the hand and never over the shirt (its sleeve keeps covering them).
 */
function WristInk() {
  const worn = useContext(WornCtx);
  const { tattoos } = useContext(LookCtx);
  const uid = useId().replace(/:/g, "");
  const held = worn.HAND && worn.HAND in HELD_FIT ? worn.HAND : null;
  if (!held || !(tattoos ?? []).some((id) => TATTOO_FIT[id]?.part === "upper")) return null;
  const h = RIG.handR;
  const shirt = wearLayer(worn, "SHIRT");
  const m = 50;
  return (
    <>
      <defs>
        <clipPath id={`${uid}-wc`}><rect x={h.x - m} y={h.y - m} width={h.w + m * 2} height={h.h + m * 2} /></clipPath>
        <filter id={`${uid}-wk`}><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" /></filter>
        <mask id={`${uid}-wm`} maskUnits="userSpaceOnUse" x={0} y={0} width={1000} height={1400}>
          <rect x={0} y={0} width={1000} height={1400} fill="#fff" />
          {shirt && <image href={shirt.href} x={shirt.x} y={shirt.y} width={shirt.w} height={shirt.h} preserveAspectRatio="none" filter={`url(#${uid}-wk)`} />}
        </mask>
      </defs>
      <g clipPath={`url(#${uid}-wc)`} mask={`url(#${uid}-wm)`}><Ink part="upper" /></g>
    </>
  );
}

/** a bone's joint only (no picture): carries a part drawn in another layer, e.g. the hand over the clothes */
function Joint({ p, children }: { p: PartId; children?: ReactNode }) {
  const pv = "pivot" in RIG[p] ? (RIG[p] as { pivot: readonly [number, number] }).pivot : [500, 900];
  return <g style={{ transformOrigin: `${pv[0]}px ${pv[1]}px`, transformBox: "view-box" }}>{children}</g>;
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

/**
 * «Бочка Утилизатора»: green toxic ooze pours out of the bungs at both ends of the lying barrel (rig units: the artist's
 * barrel drawn in place, its bungs at (36, 1025) and (964, 1025), its bottom at 1244): a stream that bends down to the
 * ground, drops falling along it, a glowing puddle that breathes (screens.css «boz-»; not «bz», the business drawer’s class)
 */
function BarrelOoze() {
  const side = (x: number, dir: 1 | -1, k: number) => {
    const out = x + dir * 18, low = 1246;
    const d = `M${x} 1022 C${x + dir * 10} 1020 ${out} 1030 ${out + dir * 2} 1050 C${out + dir * 4} 1100 ${out} 1170 ${out + dir * 2} ${low - 4}`;
    return (
      <g key={k} className={`boz boz-${k}`}>
        <ellipse className="boz-pool" cx={out + dir * 10} cy={low} rx={78} ry={15} fill="url(#boz-pool)" />
        <path className="boz-stream" d={d} fill="none" stroke="#b6ff2e" strokeWidth={11} strokeLinecap="round" />
        <path className="boz-flow" d={d} fill="none" stroke="#f2ffb0" strokeWidth={3.5} strokeLinecap="round" strokeDasharray="12 24" />
        <path d={`M${x - dir * 2} 1012 Q${x + dir * 14} 1008 ${x + dir * 20} 1034 L${x + dir * 2} 1036 Z`} fill="#9ff21c" stroke="#2c5a00" strokeWidth={1.2} />
        {[0, 1, 2].map((i) => <circle key={i} className={`boz-drop boz-drop-${i}`} cx={out + dir * 2} cy={1060} r={5.5} fill="#c8ff4a" />)}
      </g>
    );
  };
  return (
    <g className="boz-all" aria-hidden="true">
      <defs>
        <radialGradient id="boz-pool"><stop offset="0" stopColor="#d6ff5c" stopOpacity="0.95" /><stop offset="0.55" stopColor="#8fe81a" stopOpacity="0.8" /><stop offset="1" stopColor="#5cbf00" stopOpacity="0" /></radialGradient>
      </defs>
      {side(36, -1, 0)}
      {side(964, 1, 1)}
    </g>
  );
}

/** The seat, drawn behind the body: the stool at chair level 0, then the best drawn chair up to the level. */
function Seat({ level = 0 }: { level?: number }) {
  // the chair that stands: piece `level` of the room's «Кресло» (its picture by name: chair-1 … chair-<boss>)
  const art = level > 0 ? CHAIRS[level - 1]?.art : undefined;
  const f = art ? CHAIR_FIT[art] : undefined;
  if (art && f) return (
    <>
      <image href={usedUrl(`/assets/home/${art}.webp`)} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />
      {art === "chair-utilizator" && <BarrelOoze />}
    </>
  );
  return <image href="/assets/home/seat-1.webp" x={SEAT.x} y={SEAT.y} width={SEAT.w} height={SEAT.w * SEAT.aspect} preserveAspectRatio="none" />;
}

/**
 * The hero turned round (the wardrobe, the user 2026-11-26): his back on the plain stool whatever chair stands in the
 * room, bare (no clothes are drawn from behind), with the back's tattoos (TATTOO_FIT part "back") and its places grid.
 */
function BackBody({ look, edit }: { look: Look; edit: RigEdit }) {
  const src = `${look.skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${look.skin}` : "/assets/hero"}/back.webp?v=${ART_VER.heroPart}`;
  return (
    <LookCtx.Provider value={look}>
      <OutlineDefs />
      <ellipse cx="500" cy="1282" rx="400" ry="30" fill="rgba(0,0,0,0.3)" />
      <Seat level={0} />
      <image href={src} x={0} y={0} width={1000} height={1400} preserveAspectRatio="none" />
      <Ink part="back" />
      {edit.mode === "ink" && (
        <>
          <PreloadPlaces grid="bzone" />
          <image className="rig-grid" href={`/assets/hero/tattoo/bzones.webp?v=${PLACE_ART_V}`} x={0} y={0} width={1000} height={1400} preserveAspectRatio="none" pointerEvents="none" />
          {edit.part && <g pointerEvents="none" className="rig-hl-part"><PlacePic grid="bzone" id={edit.part} /></g>}
        </>
      )}
    </LookCtx.Provider>
  );
}

/** Rig contents in its own 1000×1400 coordinates (place inside an <svg viewBox="0 0 1000 1400">). */
function RigBody({ seat, look, worn, seatOnly, edit }: { seat?: boolean | number; look?: Look; worn?: Worn; seatOnly?: boolean; edit?: RigEdit }) {
  // the room editor hides the hero: only the seat stays, so the room behind is seen
  if (seatOnly) return <>{seat !== undefined && seat !== false && <Seat level={typeof seat === "number" ? seat : 0} />}</>;
  if (edit?.back) return <BackBody look={look ?? DEFAULT_LOOK} edit={edit} />;
  return (
    <LookCtx.Provider value={look ?? DEFAULT_LOOK}>
    <WornCtx.Provider value={worn ?? {}}>
    <EditCtx.Provider value={edit ?? null}>
      {edit && <OutlineDefs />}
      <ellipse cx="500" cy="1282" rx="400" ry="30" fill="rgba(0,0,0,0.3)" />
      {seat !== undefined && seat !== false && <Seat level={typeof seat === "number" ? seat : 0} />}
      <WearBack />
      {/* «Ворон»'s wings behind the whole hero: they never flap in his face (the bird itself sits on the shoulder, below) */}
      {worn?.SPECIAL === "raven" && <g className="rig-breath"><Raven layer="wings" /></g>}
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
            <Bone p="foreR" />
          </Bone>
        </Ol>
        {/* the tattoos of the chest, the belly and the arms: over the arms, under the shirt — and under the trousers (they fade out under the waistband) */}
        <UnderPants><Ink part="upper" /></UnderPants>
        {/* the right glove over the hand on the knee — over the arm's tattoos (the glove covers the hand's ink), under the shirt */}
        <Joint p="armUL"><Joint p="foreL"><GloveRight /></Joint></Joint>
        {/* a chain lies over a T-shirt, but under an open jacket (on the bare chest between its flaps) */}
        {OPEN_JACKETS.includes(worn?.SHIRT ?? "") ? (
          <>
            <Ol><Wear slot="ACCESSORY" /></Ol>
            <Ol><Wear slot="SHIRT" /></Ol>
          </>
        ) : (
          <>
            <Ol><Wear slot="SHIRT" /></Ol>
            <Ol><Wear slot="ACCESSORY" /></Ol>
          </>
        )}
        {/* the hand (and what it holds, its animations) over everything worn: a sleeve never covers it — the same
            shoulder and elbow joints as the arm above, without their pictures */}
        {/* the forearm's tattoos round the wrist of a holding hand: under the hand (it and its mug lie over the ink) */}
        <WristInk />
        <Joint p="armUR">
          <Joint p="foreR">
            <Ol><HandFrames /></Ol>
          </Joint>
        </Joint>
        {/* «Ворон» on the right shoulder (slot «Особое»: the poker's royal flush): under the head (his wings: behind the whole hero, above) */}
        {worn?.SPECIAL === "raven" && <Raven layer="body" />}
        <Ol>
          <Bone p="head" className="rig-head">
            <Face />
            <Mouth part="jaw" />
            <Beard />
            {/* the cigarette, the toothpick, the cigar — over the beard */}
            <Mouth part="held" />
            <Wear slot="FACE" />
            <Wear slot="HEAD" hat="under" />
            <Hair />
            <Wear slot="HEAD" hat="over" />
          </Bone>
        </Ol>
      </g>
      {edit && edit.mode !== "body" && <PreloadPlaces grid={edit.mode === "ink" ? "zone" : "slot"} />}
      {/* the tattoo grid and the chosen place lie under the head and the beard (they hang over the neck and the traps) */}
      {edit?.mode === "ink" && <InkHeadCut />}
      <g mask={edit?.mode === "ink" ? "url(#rig-ink-headcut)" : undefined}>
      {/* the grid of the places: the tattoo places or the clothes places */}
      {edit && edit.mode !== "body" && (() => {
        const grid = <image className="rig-grid" href={`/assets/hero/tattoo/${edit.mode === "ink" ? "zones" : "slots"}.webp?v=${PLACE_ART_V}`} x={0} y={0} width={1000} height={1400} preserveAspectRatio="none" pointerEvents="none" />;
        // «Связка ключей»: the bare hand's lines are cut out of the tattoo grid (the hand with the keys draws its own)
        if (edit.mode !== "ink" || worn?.HAND !== KEYS_ID) return grid;
        const c = KEYS_PARTS.gridcut;
        return (
          <>
            <defs>
              <mask id="rig-keys-gridcut" maskUnits="userSpaceOnUse" x={0} y={0} width={1000} height={1400}>
                <rect x={0} y={0} width={1000} height={1400} fill="#fff" />
                <image href={`/assets/hero/held/${KEYS_ID}-gridcut.webp?v=${ART_VER.heroPart}`} x={c.x} y={c.y} width={c.w} height={c.h} preserveAspectRatio="none" />
              </mask>
            </defs>
            <g mask="url(#rig-keys-gridcut)">{grid}</g>
          </>
        );
      })()}
      {edit?.part && <Highlight edit={edit} />}
      </g>
    </EditCtx.Provider>
    </WornCtx.Provider>
    </LookCtx.Provider>
  );
}

/** A close-up of the hero's eyes (brows, eyes, glasses and a hat brim — the whole rig, cropped): the anime cut-in before a fight. */
export function EyesArt({ look, worn }: { look?: Look; worn?: Worn }) {
  return (
    <svg className="rig still" viewBox="338 118 330 128" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
      <RigBody look={look} worn={worn} />
    </svg>
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
  // the clothes / tattoo grid's tap map too (a picture loaded only when the editor opens)
  useEffect(() => { if (edit?.mode === "ink" || edit?.mode === "items") void placeAt(edit.back ? "bzone" : edit.mode === "ink" ? "zone" : "slot", -1, -1); }, [edit?.mode, edit?.back]);
  const tap = async (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg || !edit?.onPick) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const part = await pickAt(pt.x, pt.y, layers, edit.mode, edit.back);
    if (part) edit.onPick(part);
  };
  return (
    <svg ref={ref} className={`rig ${still || edit ? "still" : ""} ${edit?.onPick ? "pickable" : ""}`} x={x} y={y} width={1000 * scale} height={1400 * scale} viewBox="0 0 1000 1400" overflow="visible"
      onPointerDown={edit?.onPick ? tap : undefined}>
      <RigBody seat={seat} look={look} worn={worn} seatOnly={seatOnly} edit={edit} />
    </svg>
  );
}

/** The hero alone; `seat` (chair level) puts the seat under them so a sitting hero does not hang in the air; `back`: turned
 *  round, his back on the stool (the roulette of «Бандитский фарт») */
export function HeroRig({ size = 300, className, still, look, worn, seat, back }: { size?: number; className?: string; still?: boolean; look?: Look; worn?: Worn; seat?: boolean | number; back?: boolean }) {
  return (
    <svg className={`rig ${still ? "still" : ""} ${className ?? ""}`} viewBox="0 0 1000 1400" width={size * (1000 / 1400)} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
      <RigBody look={look} worn={worn} seat={seat} edit={back ? { mode: "body", part: null, back: true } : undefined} />
    </svg>
  );
}
