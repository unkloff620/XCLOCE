"use client";
/*
 * Seated player character assembled from the artist's parts (public/assets/hero, built by tools/rig/build-rig.py).
 * Bones: torso → head, upper arms → forearms; legs are static. Each bone rotates around the joint where it overlaps
 * its parent. Draw order matches the artwork: torso, legs over the shorts, arms over the torso, head on top.
 * Hair rides on the head bone; skin tone and hair colour come from `look` (pre-baked image variants).
 * Animations (CSS, see screens.css): breathing, looking around, tapping fingers on the knee.
 */
import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { RIG } from "./rig-data.ts";
import { HAIR_FIT, SKIN_ORIGINAL } from "./rig-look.ts";
import { SEAT } from "../../content/home-scene.ts";
import { DEFAULT_LOOK, type Look } from "../../content/home.ts";

type PartId = keyof typeof RIG;
type HairId = keyof typeof HAIR_FIT;

/** Look of the rig being drawn; skin and hair colours are pre-baked variants (tools/rig/build-look.py). */
const LookCtx = createContext<Look>(DEFAULT_LOOK);

function Img({ p }: { p: PartId }) {
  const r = RIG[p];
  const skin = useContext(LookCtx).skin;
  const src = skin === SKIN_ORIGINAL ? `/assets/hero/${p}.webp` : `/assets/hero/skin-${skin}/${p}.webp`;
  return <image href={src} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />;
}

function Hair() {
  const look = useContext(LookCtx);
  if (!(look.hair in HAIR_FIT)) return null; // bald
  const f = HAIR_FIT[look.hair as HairId];
  return <image href={`/assets/hero/hair/${look.hair}-${look.hairColor}.webp`} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" />;
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
function RigBody({ seat, look }: { seat?: boolean; look?: Look }) {
  return (
    <LookCtx.Provider value={look ?? DEFAULT_LOOK}>
      <ellipse cx="500" cy="1282" rx="400" ry="30" fill="rgba(0,0,0,0.3)" />
      {seat && <Seat />}
      {/* torso breathes; arms and head ride along in a second group with the same animation */}
      <g className="rig-breath">
        <Img p="torso" />
      </g>
      <Img p="thighL" />
      <Img p="thighR" />
      <Img p="shinL" />
      <Img p="shinR" />
      <g className="rig-breath">
        <Bone p="armUL">
          <Bone p="foreL" />
        </Bone>
        <Bone p="armUR">
          <Bone p="foreR" className="rig-tap" />
        </Bone>
        <Bone p="head" className="rig-head">
          <Hair />
        </Bone>
      </g>
    </LookCtx.Provider>
  );
}

/** Nested viewport so bone pivots (view-box units) stay in rig coordinates inside any scene. */
export function RigViewport({ x, y, scale, seat, still, look }: { x: number; y: number; scale: number; seat?: boolean; still?: boolean; look?: Look }) {
  return (
    <svg className={`rig ${still ? "still" : ""}`} x={x} y={y} width={1000 * scale} height={1400 * scale} viewBox="0 0 1000 1400" overflow="visible">
      <RigBody seat={seat} look={look} />
    </svg>
  );
}

export function HeroRig({ size = 300, className, still, look }: { size?: number; className?: string; still?: boolean; look?: Look }) {
  return (
    <svg className={`rig ${still ? "still" : ""} ${className ?? ""}`} viewBox="0 0 1000 1400" width={size * (1000 / 1400)} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
      <RigBody look={look} />
    </svg>
  );
}
