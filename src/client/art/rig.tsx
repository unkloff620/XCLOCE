"use client";
/*
 * Seated player character assembled from the artist's parts (public/assets/hero, built by tools/rig/build-rig.py).
 * Bones: torso (with the legs) → head, upper arms → forearms. The face (eyes, pupils, brows, closed eyes) rides on the head. Each bone rotates around the joint where it overlaps
 * its parent. Draw order matches the artwork: torso, legs over the shorts, arms over the torso, head on top.
 * Clothes (WEAR_FIT): shoes and pants over the legs, the shirt over the arms, the hat on the head bone.
 * Hair rides on the head bone; skin tone and hair colour come from `look` (pre-baked image variants).
 * The left hand (handR, on the screen's right) is its own part on the forearm; its fingers drum on the knee (HandFrames).
 * Animations (CSS, see screens.css): breathing, looking around, drumming fingers.
 */
import { ART_VER } from "../preload.ts";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { RIG } from "./rig-data.ts";
import { HAIR_FIT, SKIN_ORIGINAL, WEAR_FIT } from "./rig-look.ts";
import { HELD_FIT } from "./held-data.ts";
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
 * The character editor: every editable part gets a thin gold outline, the chosen one a bright thick one.
 * mode "items": HEAD, EYES, MOUTH, SHIRT, PANTS, SHOES, HAND; mode "body": the whole body (skin, later tattoos).
 */
export type RigEdit = { mode: "items" | "body"; part: string | null };
const EditCtx = createContext<RigEdit | null>(null);

/** wraps a part in the editor outline (nothing outside the editor) */
function Ol({ k, children }: { k: string; children: ReactNode }) {
  const e = useContext(EditCtx);
  if (!e) return <>{children}</>;
  const on = e.mode === "body" ? k === "BODY" : e.part === k;
  return <g filter={`url(#${on ? "rig-ol-on" : "rig-ol"})`} className={on ? "rig-ol-on" : undefined}>{children}</g>;
}

function OutlineDefs() {
  const ring = (id: string, r: number, color: string, op: number) => (
    <filter id={id} x="-15%" y="-15%" width="130%" height="130%">
      <feMorphology in="SourceAlpha" operator="dilate" radius={r} result="d" />
      <feFlood floodColor={color} floodOpacity={op} />
      <feComposite in2="d" operator="in" result="o" />
      <feMerge><feMergeNode in="o" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  );
  return <defs>{ring("rig-ol", 4, "#ffb627", 0.8)}{ring("rig-ol-on", 8, "#ffe27a", 1)}</defs>;
}

/** Look of the rig being drawn; skin and hair colours are pre-baked variants (tools/rig/build-look.py). */
const LookCtx = createContext<Look>(DEFAULT_LOOK);
const WornCtx = createContext<Worn>({});

function wornIn(worn: Worn, slot: string): WearId | null {
  const id = worn[slot];
  return id && id in WEARS ? id : null;
}

/** a worn piece of clothing, if the item in that slot has art */
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

function Hair() {
  const look = useContext(LookCtx);
  const hat = wornIn(useContext(WornCtx), "HEAD"); // hair is cut to fit under a hat
  if (!(look.hair in HAIR_FIT)) return null; // bald
  const f = HAIR_FIT[look.hair as HairId];
  return <image href={`/assets/hero/hair/${look.hair}-${look.hairColor}${hat ? `-${hat}` : ""}.webp?v=${ART_VER.hair}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />;
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

/**
 * The empty left hand drums its fingers on the knee: frames from a puppet warp (tools/rig/build-hand.py), pinky → index,
 * each finger half up, up, half up; the frames are stacked and shown one at a time (screens.css «rig-hf»).
 * A thing held in the hand (slot «Кисть», drops from bosses) replaces the empty hand with its own swaying frames.
 */
function HandFrames() {
  const r = RIG.handR;
  const { skin } = useContext(LookCtx);
  const heldId = useContext(WornCtx).HAND;
  // a thing in the hand (slot «Кисть»): the hand holding it, swaying (tools/rig/build-held.py)
  if (heldId && heldId in HELD_FIT) {
    const f = HELD_FIT[heldId];
    const base = skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${skin}/held-${heldId}` : `/assets/hero/held/${heldId}`;
    return (
      <g className="rig-hand held">
        <image className="rig-hl rig-hl-0" href={`${base}.webp?v=${ART_VER.heroPart}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />
        {Array.from({ length: f.frames }, (_, i) => (
          <image key={i} className={`rig-hl rig-hl-${i + 1}`} href={`${base}-f${i + 1}.webp?v=${ART_VER.heroPart}`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />
        ))}
      </g>
    );
  }
  const dir = skin !== SKIN_ORIGINAL ? `/assets/hero/skin-${skin}` : "/assets/hero";
  return (
    <g className="rig-hand">
      <image className="rig-hf rig-hf-0" href={`${dir}/handR.webp?v=${ART_VER.heroPart}`} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />
      {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
        <image key={k} className={`rig-hf rig-hf-${k}`} href={`${dir}/handR-f${k}.webp?v=${ART_VER.heroPart}`} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />
      ))}
    </g>
  );
}

/** a bone: rotates around its joint (pivot) */
function Bone({ p, className, children }: { p: PartId; className?: string; children?: ReactNode }) {
  const pv = "pivot" in RIG[p] ? (RIG[p] as { pivot: readonly [number, number] }).pivot : [500, 900];
  return (
    <g className={className} style={{ transformOrigin: `${pv[0]}px ${pv[1]}px`, transformBox: "view-box" }}>
      <Img p={p} />
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
        <Ol k="BODY"><Img p="torso" /></Ol>
      </g>
      <Ol k="SHOES"><Wear slot="SHOES" /></Ol>
      <Ol k="PANTS"><Wear slot="PANTS" /></Ol>
      <g className="rig-breath">
        <Ol k="BODY">
          <Bone p="armUL">
            <Bone p="foreL" />
          </Bone>
        </Ol>
        <Ol k="BODY">
          <Bone p="armUR">
            <Bone p="foreR">
              <Ol k="HAND"><HandFrames /></Ol>
            </Bone>
          </Bone>
        </Ol>
        <Ol k="SHIRT"><Wear slot="SHIRT" /></Ol>
        <Wear slot="ACCESSORY" />
        <Ol k="HEAD">
          <Bone p="head" className="rig-head">
            <Ol k="EYES"><Face /></Ol>
            <Hair />
            <Wear slot="HEAD" />
          </Bone>
        </Ol>
      </g>
    </EditCtx.Provider>
    </WornCtx.Provider>
    </LookCtx.Provider>
  );
}

/** Nested viewport so bone pivots (view-box units) stay in rig coordinates inside any scene. */
export function RigViewport({ x, y, scale, seat, still, look, worn, seatOnly, edit }: { x: number; y: number; scale: number; seat?: boolean | number; still?: boolean; look?: Look; worn?: Worn; seatOnly?: boolean; edit?: RigEdit }) {
  return (
    <svg className={`rig ${still ? "still" : ""}`} x={x} y={y} width={1000 * scale} height={1400 * scale} viewBox="0 0 1000 1400" overflow="visible">
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
