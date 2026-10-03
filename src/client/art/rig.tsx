"use client";
/*
 * Seated player character assembled from the artist's parts (public/assets/hero, built by tools/rig/build-rig.py).
 * Bones: torso → head, upper arms → forearms; legs are static. Each bone rotates around the joint where it overlaps
 * its parent. Draw order matches the artwork: torso, legs over the shorts, arms over the torso, head on top.
 * Animations (CSS, see screens.css): breathing, looking around, tapping fingers on the knee.
 */
import type { ReactNode } from "react";
import { RIG } from "./rig-data.ts";

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

/** Placeholder stool until the artist's furniture arrives (level 1 seat). */
function Stool() {
  const ink = "#140d0a";
  return (
    <g>
      <path d="M352 984 L318 1276 M648 984 L682 1276 M430 996 L420 1250 M570 996 L580 1250" stroke={ink} strokeWidth="26" strokeLinecap="round" />
      <path d="M352 984 L318 1276 M648 984 L682 1276 M430 996 L420 1250 M570 996 L580 1250" stroke="#8a5a2b" strokeWidth="14" strokeLinecap="round" />
      <path d="M338 1150 H662" stroke={ink} strokeWidth="18" strokeLinecap="round" />
      <path d="M338 1150 H662" stroke="#6b4320" strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="500" cy="984" rx="196" ry="36" fill="#6b4320" stroke={ink} strokeWidth="9" />
      <ellipse cx="500" cy="968" rx="196" ry="36" fill="#a8743f" stroke={ink} strokeWidth="9" />
    </g>
  );
}

export function HeroRig({ size = 300, className, still }: { size?: number; className?: string; still?: boolean }) {
  return (
    <svg className={`rig ${still ? "still" : ""} ${className ?? ""}`} viewBox="0 0 1000 1400" width={size * (1000 / 1400)} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
      <ellipse cx="500" cy="1282" rx="400" ry="30" fill="rgba(0,0,0,0.3)" />
      <Stool />
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
    </svg>
  );
}
