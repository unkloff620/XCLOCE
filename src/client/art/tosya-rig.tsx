"use client";
/*
 * «Тося» (tools/tosya/build-tosya.py): the dress breathes, the head rides on it and tilts a little, the eyes look
 * about and blink, the tray sways in his hands. The pies lie on the tray (they ride with it): `pies` how many he
 * brought (3…5 — the 4th and 5th lie in a back row), `taken` the bits of the ones already bought, `onPie` a tap.
 */
import { TOSYA_PARTS as P, TOSYA_SIZE } from "./tosya-data.ts";

export const TOSYA_ART_V = 4;
const SRC = (n: string) => `/assets/tosya/${n}.webp?v=${TOSYA_ART_V}`;
/** a part of the look (body / head / item…) — falls back to the maid's own when the look has none */
const img = (n: string, dx = 0, dy = 0) => {
  const b = P[n];
  if (!b) return null;
  return <image href={SRC(n)} x={b.x + dx} y={b.y + dy} width={b.w} height={b.h} preserveAspectRatio="none" />;
};
/** the pies' places: the front row as drawn, the back row between them a little higher */
const BACK = { dx: 106, dy: -30 };
const SLOTS: { art: string; dx: number; dy: number }[] = [
  { art: "pie-l", dx: 0, dy: 0 }, { art: "pie-c", dx: 0, dy: 0 }, { art: "pie-r", dx: 0, dy: 0 },
  { art: "pie-l", ...BACK }, { art: "pie-c", ...BACK },
];

export function TosyaRig({ look = "", pies = 3, taken = 0, onPie, picked }: { look?: string; pies?: number; taken?: number; onPie?: (slot: number) => void; picked?: number | null }) {
  // `look`: "" — the maid (body / head / pie-*), "-business" … — body-business, head-business, item-business-l/c/r
  const part = (n: string) => (look && P[`${n}${look}`] ? `${n}${look}` : n);
  const item = (art: string) => (look ? `item${look}-${art.slice(4)}` : art);
  const slots = SLOTS.slice(0, pies).map((s, i) => ({ ...s, i })).filter((s) => !(taken & (1 << s.i)));
  // the back row first, so the front pies lie over it
  const order = [...slots.filter((s) => s.i >= 3), ...slots.filter((s) => s.i < 3)];
  return (
    <svg className="tosya-rig" viewBox={`0 0 ${TOSYA_SIZE.w} ${TOSYA_SIZE.h}`} aria-label="Тося">
      <g className="ts-breath">{img(part("body"))}</g>
      <g className="ts-head">
        {img("whites")}
        <g className="ts-pupils">{img("pupils")}</g>
        {img(part("head"))}
        <g className="ts-lids">{img("lids")}</g>
      </g>
      <g className="ts-tray">
        {img("tray")}
        {order.map((s) => {
          const art = P[item(s.art)] ? item(s.art) : s.art;
          const b = P[art];
          return (
            <g key={s.i} className={`ts-pie ${picked === s.i ? "on" : ""}`} onClick={onPie ? () => onPie(s.i) : undefined} role={onPie ? "button" : undefined} aria-label="Товар">
              <image href={SRC(art)} x={b.x + s.dx} y={b.y + s.dy} width={b.w} height={b.h} preserveAspectRatio="none" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
