"use client";
/*
 * Seated player character assembled from the artist's parts (public/assets/hero, built by tools/rig/build-rig.py).
 * Bones: torso (with the legs) → head, upper arms → forearms. The face (eyes, pupils, brows, closed eyes) rides on the head. Each bone rotates around the joint where it overlaps
 * its parent. Draw order matches the artwork: torso, legs over the shorts, arms over the torso, head on top.
 * Clothes (WEAR_FIT): shoes and pants over the legs, the shirt over the arms, the hat on the head bone.
 * Hair rides on the head bone; skin tone and hair colour come from `look` (pre-baked image variants).
 * Animations (CSS, see screens.css): breathing, looking around, tapping fingers on the knee.
 */
import { ART_VER } from "../preload.ts";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { RIG } from "./rig-data.ts";
import { HAIR_FIT, SKIN_ORIGINAL, WEAR_FIT } from "./rig-look.ts";
import { SEAT } from "../../content/home-scene.ts";
import { DEFAULT_LOOK, type Look } from "../../content/home.ts";

type PartId = keyof typeof RIG;
type HairId = keyof typeof HAIR_FIT;
type WearId = string;
/** clothes drawn for the current body (may be empty while being redrawn) */
const WEARS: Record<string, { slot: string; x: number; y: number; w: number; h: number }> = WEAR_FIT;
/** what the player wears: slot → item id (items without drawn art are skipped) */
export type Worn = Record<string, string | undefined>;

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
  const skin = useContext(LookCtx).skin;
  // parts without skin (pupils, brows, closed eyes) have no tone variants; ?v=2 — the slimmer character
  const tinted = skin !== SKIN_ORIGINAL && !NO_SKIN.has(p);
  const src = `${tinted ? `/assets/hero/skin-${skin}/${p}` : `/assets/hero/${p}`}.webp?v=${ART_VER.heroPart}`;
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

/** The seat (stool → chairs as the player upgrades), drawn behind the body. */
function Seat({ level = 1 }: { level?: number }) {
  return <image href={`/assets/home/seat-${level}.webp`} x={SEAT.x} y={SEAT.y} width={SEAT.w} height={SEAT.w * SEAT.aspect} preserveAspectRatio="none" />;
}

/** Rig contents in its own 1000×1400 coordinates (place inside an <svg viewBox="0 0 1000 1400">). */
function RigBody({ seat, look, worn }: { seat?: boolean; look?: Look; worn?: Worn }) {
  return (
    <LookCtx.Provider value={look ?? DEFAULT_LOOK}>
    <WornCtx.Provider value={worn ?? {}}>
      <ellipse cx="500" cy="1282" rx="400" ry="30" fill="rgba(0,0,0,0.3)" />
      {seat && <Seat />}
      {/* torso breathes; arms and head ride along in a second group with the same animation */}
      {/* the torso layer carries the legs too; only the chest breathes visibly (origin at the hips) */}
      <g className="rig-breath">
        <Img p="torso" />
      </g>
      <Wear slot="SHOES" />
      <Wear slot="PANTS" />
      <g className="rig-breath">
        <Bone p="armUL">
          <Bone p="foreL" />
        </Bone>
        <Bone p="armUR">
          <Bone p="foreR" className="rig-tap" />
        </Bone>
        <Wear slot="SHIRT" />
        <Wear slot="ACCESSORY" />
        <Bone p="head" className="rig-head">
          <Face />
          <Hair />
          <Wear slot="HEAD" />
        </Bone>
      </g>
    </WornCtx.Provider>
    </LookCtx.Provider>
  );
}

/** Nested viewport so bone pivots (view-box units) stay in rig coordinates inside any scene. */
export function RigViewport({ x, y, scale, seat, still, look, worn }: { x: number; y: number; scale: number; seat?: boolean; still?: boolean; look?: Look; worn?: Worn }) {
  return (
    <svg className={`rig ${still ? "still" : ""}`} x={x} y={y} width={1000 * scale} height={1400 * scale} viewBox="0 0 1000 1400" overflow="visible">
      <RigBody seat={seat} look={look} worn={worn} />
    </svg>
  );
}

export function HeroRig({ size = 300, className, still, look, worn }: { size?: number; className?: string; still?: boolean; look?: Look; worn?: Worn }) {
  return (
    <svg className={`rig ${still ? "still" : ""} ${className ?? ""}`} viewBox="0 0 1000 1400" width={size * (1000 / 1400)} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
      <RigBody look={look} worn={worn} />
    </svg>
  );
}
