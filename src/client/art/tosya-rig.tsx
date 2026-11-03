"use client";
/*
 * «Тося» (tools/tosya/build-tosya.py): the dress breathes, the head rides on it and tilts a little, the eyes look
 * about and blink, the tray sways in his hands. The pies lie on the tray (they ride with it): `pies` how many he
 * brought (3…5 — the 4th and 5th lie in a back row), `taken` the bits of the ones already bought, `onPie` a tap.
 */
import { TOSYA_PARTS as P, TOSYA_SIZE } from "./tosya-data.ts";

const SRC = (n: string) => `/assets/tosya/${n}.webp?v=3`;
const img = (n: string, dx = 0, dy = 0) => {
  const b = P[n];
  return <image href={SRC(n)} x={b.x + dx} y={b.y + dy} width={b.w} height={b.h} preserveAspectRatio="none" />;
};
/** the pies' places: the front row as drawn, the back row between them a little higher */
const BACK = { dx: 106, dy: -30 };
const SLOTS: { art: string; dx: number; dy: number }[] = [
  { art: "pie-l", dx: 0, dy: 0 }, { art: "pie-c", dx: 0, dy: 0 }, { art: "pie-r", dx: 0, dy: 0 },
  { art: "pie-l", ...BACK }, { art: "pie-c", ...BACK },
];

export function TosyaRig({ pies = 3, taken = 0, onPie, picked }: { pies?: number; taken?: number; onPie?: (slot: number) => void; picked?: number | null }) {
  const slots = SLOTS.slice(0, pies).map((s, i) => ({ ...s, i })).filter((s) => !(taken & (1 << s.i)));
  // the back row first, so the front pies lie over it
  const order = [...slots.filter((s) => s.i >= 3), ...slots.filter((s) => s.i < 3)];
  return (
    <svg className="tosya-rig" viewBox={`0 0 ${TOSYA_SIZE.w} ${TOSYA_SIZE.h}`} aria-label="Тося">
      <g className="ts-breath">{img("body")}</g>
      <g className="ts-head">
        {img("whites")}
        <g className="ts-pupils">{img("pupils")}</g>
        {img("head")}
        <g className="ts-lids">{img("lids")}</g>
      </g>
      <g className="ts-tray">
        {img("tray")}
        {order.map((s) => {
          const b = P[s.art];
          return (
            <g key={s.i} className={`ts-pie ${picked === s.i ? "on" : ""}`} onClick={onPie ? () => onPie(s.i) : undefined} role={onPie ? "button" : undefined} aria-label="Пирожок">
              <image href={SRC(s.art)} x={b.x + s.dx} y={b.y + s.dy} width={b.w} height={b.h} preserveAspectRatio="none" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
