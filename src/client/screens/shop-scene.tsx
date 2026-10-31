"use client";
/*
 * The shop: the shopkeeper behind the counter (tools/shop/build-shop.py cuts the artist's parts into layers).
 * He breathes, sways his head, blinks, glances around, smokes (the cigarette bobs, the tip glows, smoke rises),
 * moves the open hand and taps the counter with the fist. The goods glow and pulse: the weapons on the counter,
 * the clothes rack, the energy drinks on the shelf — a tap opens that window. The arms lie in front of the goods;
 * the rack and the shelf stand right after the background, behind the shopkeeper and the counter.
 */
import { AchCase } from "../art/ach-case.tsx";
import { CASE_ASPECT } from "../art/case-data.ts";
import type { CSSProperties, ReactNode } from "react";
import { SHOP_ART } from "../art/shop-data.ts";

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
    <img className={`sk-layer ${className}`} src={`/assets/shop/v2/${n}.webp`} alt="" draggable={false} style={{ ...box(n), ...style }} />
  );
}

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
      <img src={`/assets/shop/v2/${s.layer}.webp`} alt="" draggable={false} />
    </button>
  );
}

/** «Ящик ништяков» — the case (art/ach-case.tsx) lies whole on the right of the dealer's counter */
const ACH_BOX_W = 29;
const ACH_BOX_H = ACH_BOX_W * (2000 / 2800) / CASE_ASPECT;
const ACH_BOX_AT = { left: 69.5, top: 67 - ACH_BOX_H, width: ACH_BOX_W, height: ACH_BOX_H };
/** the weapons on the counter: smaller and moved to the left, to make room for the case */
const WEAPONS_SCALE = 0.8;
const WEAPONS_LEFT = 3;

export function ShopScene({ onOpen, children, box, onBox }: {
  onOpen: (id: ShopSpotId) => void; children?: ReactNode;
  box?: { ready: number; progress: number; cost: number }; onBox?: () => void;
}) {
  const spot = (id: ShopSpotId) => <Spot s={SPOTS.find((x) => x.id === id)!} onOpen={onOpen} />;
  const neck = SHOP_ART.neck;
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
          <Layer n="sclera" />
          <Layer n="iris" className="sk-iris" />
          <Layer n="lids" className="sk-lids" />
          <Layer n="cigarette" className="sk-cig" style={{ transformOrigin: originAt("cigarette", L.cigarette.left + L.cigarette.width * 0.95, L.cigarette.top + 2) }} />
          <span className="sk-ember" style={{ left: `${SHOP_ART.smoke.x}%`, top: `${SHOP_ART.smoke.y}%` }} />
          {[0, 1, 2, 3].map((i) => <span key={i} className="sk-smoke" style={{ left: `${SHOP_ART.smoke.x}%`, top: `${SHOP_ART.smoke.y}%`, animationDelay: `${i * 1.1}s` }} />)}
        </div>
      </div>
      <Layer n="counter" />
      {onBox && (
        <button className={`sk-spot sk-box ${box && box.ready > 0 ? "ready" : ""}`} onClick={onBox} aria-label="Ящик ништяков" title="Ящик ништяков"
          style={{ left: `${ACH_BOX_AT.left}%`, top: `${ACH_BOX_AT.top}%`, width: `${ACH_BOX_AT.width}%`, height: `${ACH_BOX_AT.height}%` }}>
          <AchCase ready={!!box && box.ready > 0} label={box ? (box.ready > 0 ? `×${box.ready}` : `${box.progress}/${box.cost}`) : undefined} />
        </button>
      )}
      {spot("weapons")}
      {/* the arms lie on the counter in front of the goods; they breathe with the body (same animation, same pivot) */}
      <div className="sk-body sk-arms" style={{ transformOrigin: `${neck.x}% 70%` }}>
        <Layer n="armR" className="sk-armR" style={{ transformOrigin: "72% 4%" }} />
        <Layer n="armL" className="sk-armL" style={{ transformOrigin: "88% 6%" }} />
        <Layer n="fist" className="sk-fist" style={{ transformOrigin: "96% 55%" }} />
      </div>
      {children}
    </div>
  );
}
