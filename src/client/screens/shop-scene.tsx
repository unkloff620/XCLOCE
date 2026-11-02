"use client";
/*
 * The shop: the shopkeeper behind the counter (tools/shop/build-shop.py cuts the artist's parts into layers).
 * He breathes and sways his head, sways the raised forearm (the hand with the pen lags behind it) and drums the counter with his fingers
 * (each finger taps on its own, one after another). The eyes and the mouth come later. The goods glow and pulse: the weapons on the counter,
 * the clothes rack, the energy drinks on the shelf — a tap opens that window. The arms lie in front of the goods;
 * the rack and the shelf stand right after the background, behind the shopkeeper and the counter.
 */
import { AchCase } from "../art/ach-case.tsx";
import { CASE_ASPECT } from "../art/case-data.ts";
import type { CSSProperties, ReactNode } from "react";
import { SHOP_ART } from "../art/shop-data.ts";
import { ART_VER } from "../preload.ts";
import { FINGER_FRAMES, FINGERS as FINGER_BOX } from "../art/finger-data.ts";

const L = SHOP_ART.layers;
const box = (n: string): CSSProperties => {
  const b = L[n];
  return { left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` };
};
/** transform-origin of a layer at a canvas point (percent of the canvas) */
const originAt = (n: string, x: number, y: number) => {
  const b = L[n];
  return `${((x - b.left) / b.width) * 100}% ${((y - b.top) / b.height) * 100}%`;
};

function Layer({ n, className = "", style }: { n: string; className?: string; style?: CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`sk-layer ${className}`} src={`/assets/shop/v2/${n}.webp?v=${ART_VER.shop}`} alt="" draggable={false} style={{ ...box(n), ...style }} />
  );
}

/** the fingers on the counter, drawn back to front: index (f1), middle (f4), ring (f2), little (f3); they tap little finger first */
const FINGER_ORDER = ["f1", "f4", "f2", "f3"] as const;
const TAP_AT: Record<string, number> = { f3: 0, f2: 0.1, f4: 0.2, f1: 0.3 };
/** the elbow on the counter: the raised forearm sways around it (canvas percent) */
const ELBOW = { x: 25.5, y: 58.2 };

export type ShopSpotId = "weapons" | "clothing" | "energy";
const SPOTS: { id: ShopSpotId; layer: string; label: string; tag: "top" | "bottom" }[] = [
  { id: "energy", layer: "drinks", label: "Энергия", tag: "bottom" },
  { id: "clothing", layer: "rack", label: "Одежда", tag: "top" },
  { id: "weapons", layer: "weapons", label: "Оружие", tag: "bottom" },
];

function spotBox(layer: string): CSSProperties {
  if (layer !== "weapons") return box(layer);
  const b = L[layer];
  const w = b.width * WEAPONS_SCALE, h = b.height * WEAPONS_SCALE;
  return { left: `${WEAPONS_LEFT}%`, top: `${b.top + b.height - h}%`, width: `${w}%`, height: `${h}%` };
}

function Spot({ s, onOpen }: { s: (typeof SPOTS)[number]; onOpen: (id: ShopSpotId) => void }) {
  return (
    <button className={`sk-spot sk-spot-${s.id}`} style={spotBox(s.layer)} onClick={() => onOpen(s.id)} aria-label={s.label} title={s.label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/assets/shop/v2/${s.layer}.webp?v=${ART_VER.shop}`} alt="" draggable={false} />
    </button>
  );
}

/** «Ящик ништяков» — the case (art/ach-case.tsx) lies whole on the right of the dealer's counter */
const ACH_BOX_W = 29;
const ACH_BOX_H = ACH_BOX_W * (2000 / 2800) / CASE_ASPECT;
const ACH_BOX_AT = { left: 69.5, top: 73 - ACH_BOX_H, width: ACH_BOX_W, height: ACH_BOX_H };
/** the weapons on the counter: smaller and moved to the left, to make room for the case */
const WEAPONS_SCALE = 0.8;
const WEAPONS_LEFT = 3;

export function ShopScene({ onOpen, children, box, onBox }: {
  onOpen: (id: ShopSpotId) => void; children?: ReactNode;
  box?: { ready: number; progress: number; cost: number }; onBox?: () => void;
}) {
  const spot = (id: ShopSpotId) => <Spot s={SPOTS.find((x) => x.id === id)!} onOpen={onOpen} />;
  const neck = SHOP_ART.neck;
  const pv = SHOP_ART.pivots;
  return (
    <div className="sk-scene" style={{ aspectRatio: SHOP_ART.aspect }}>
      <Layer n="room" className="sk-room" />
      {/* the lamp hangs a little higher, so the cut end of its cord stays above the picture */}
      <Layer n="lamp" className="sk-lamp" style={{ transformOrigin: "50% 0%", top: `${L.lamp.top - 3.2}%` }} />
      {spot("energy")}
      {spot("clothing")}
      <div className="sk-body" style={{ transformOrigin: `${neck.x}% 70%` }}>
        <Layer n="torso" />
        <div className="sk-head" style={{ transformOrigin: `${neck.x}% ${neck.y}%` }}>
          <Layer n="head" />
        </div>
      </div>
      <Layer n="counter" />
      {/* the raised forearm: the elbow lies on the counter, the forearm sways slowly left and right around it, the hand with
          the pen (in front of the cuff) follows it a little late, catching up at the ends */}
      <div className="sk-body">
        <div className="sk-forearm" style={{ transformOrigin: `${ELBOW.x}% ${ELBOW.y}%` }}>
          <Layer n="sleeveL" />
          <Layer n="pen" className="sk-pen" style={{ transformOrigin: originAt("pen", pv.pen.x, pv.pen.y) }} />
        </div>
      </div>
      {onBox && (
        <button className={`sk-spot sk-box ${box && box.ready > 0 ? "ready" : ""}`} onClick={onBox} aria-label="Ящик ништяков" title="Ящик ништяков"
          style={{ left: `${ACH_BOX_AT.left}%`, top: `${ACH_BOX_AT.top}%`, width: `${ACH_BOX_AT.width}%`, height: `${ACH_BOX_AT.height}%` }}>
          <AchCase ready={!!box && box.ready > 0} label={box ? (box.ready > 0 ? `×${box.ready}` : `${box.progress}/${box.cost}`) : undefined} />
        </button>
      )}
      {spot("weapons")}
      {/* the arms lie on the counter in front of the goods; they breathe with the body (same animation, same pivot) */}
      <div className="sk-body sk-arms" style={{ transformOrigin: `${neck.x}% 70%` }}>
        <Layer n="sleeveR" />
        {/* the fingers drum the counter one after another, each around its knuckle (under the palm) */}
        {/* back to front: index, middle, ring, little; each a strip of bent frames (tools/shop/build-fingers.py), the little finger taps first */}
        {FINGER_ORDER.map((f) => {
          const b = FINGER_BOX[f];
          return <i key={f} className="sk-finger" style={{ left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%`, backgroundImage: `url(/assets/shop/v2/finger-${f}.webp?v=${ART_VER.shop})`, backgroundSize: `${FINGER_FRAMES * 100}% 100%`, animationDelay: `${TAP_AT[f]}s` }} />;
        })}
        <Layer n="palm" />
      </div>
      {children}
    </div>
  );
}
