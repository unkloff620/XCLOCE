"use client";
/*
 * Seated player character assembled from the artist's parts (public/assets/hero, built by tools/rig/build-rig.py).
 * Bones: torso → head, upper arms → forearms; legs are static. Each bone rotates around the joint where it overlaps
 * its parent. Draw order matches the artwork: torso, legs over the shorts, arms over the torso, head on top.
 * Animations (CSS, see screens.css): breathing, looking around, tapping fingers on the knee.
 */
import type { ReactNode } from "react";
import { RIG } from "./rig-data.ts";
import { SEAT } from "../../content/home-scene.ts";

type PartId = keyof typeof RIG;
const SRC = (p: PartId) => `/assets/hero/${p}.webp`;

function Img({ p }: { p: PartId }) {
  const r = RIG[p];
  return <image href={SRC(p)} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />;
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
function RigBody({ seat }: { seat?: boolean }) {
  return (
    <>
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
        <Bone p="head" className="rig-head" />
      </g>
    </>
  );
}

/** Nested viewport so bone pivots (view-box units) stay in rig coordinates inside any scene. */
export function RigViewport({ x, y, scale, seat, still }: { x: number; y: number; scale: number; seat?: boolean; still?: boolean }) {
  return (
    <svg className={`rig ${still ? "still" : ""}`} x={x} y={y} width={1000 * scale} height={1400 * scale} viewBox="0 0 1000 1400" overflow="visible">
      <RigBody seat={seat} />
    </svg>
  );
}

export function HeroRig({ size = 300, className, still }: { size?: number; className?: string; still?: boolean }) {
  return (
    <svg className={`rig ${still ? "still" : ""} ${className ?? ""}`} viewBox="0 0 1000 1400" width={size * (1000 / 1400)} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
      <RigBody />
    </svg>
  );
}
