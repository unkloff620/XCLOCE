"use client";
/* Location banners, the yard's item spots and the silhouette of a boss without a picture. */
import { OL } from "./icons.tsx";

/* ---------------- location banners (360×140) ---------------- */
/** locations with a drawn background (public/assets/locations, built by tools/scene/build-locations.py) */
export const LOCATION_ART = new Set(["openspace", "market", "serverroom", "basement", "board", "accounting", "hr", "party", "offshore", "yacht", "moonbase"]);

export function LocationScene({ scene }: { scene: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="loc-banner" src={`/assets/locations/${LOCATION_ART.has(scene) ? scene : "openspace"}-card.webp`} alt="" draggable={false} />;
}

/* ---------------- yard: where finds lie on the drawn yard (percent of the picture) ---------------- */
export const YARD_SPOTS = [
  // on the asphalt of the drawn yard (public/assets/yard/court-night.webp): in front of the table and the machines
  // (table x 2–61%, y 58–83%; 777 and the upgrader x 60–100%, y 59–82%); r = how the thing lies
  // high enough that the open leaders strip over the bottom bar never covers a find (the picture itself does not move)
  { x: 14, y: 81, r: -14 },
  { x: 36, y: 82, r: 9 },
  { x: 57, y: 80, r: 18 },
  { x: 78, y: 77, r: -8 }, // clear of the «Игроки» tab on the right
  { x: 56, y: 73, r: 12 },
];
/** the back yard on the left (public/assets/yard/yard0-bg.webp): on the tiles, clear of the manhole (x 27–73%, y 78–90%) and the puddles */
export const YARD0_SPOTS = [
  { x: 14, y: 75, r: 10 },
  { x: 84, y: 77, r: -12 },
  { x: 50, y: 72, r: 6 },
  { x: 86, y: 87, r: 14 },
  { x: 20, y: 82, r: -6 },
];
/** the kiosk's side on the right (public/assets/yard/yard2-bg.webp): right of the kiosk (x 1–53%), clear of the puddles */
export const YARD2_SPOTS = [
  { x: 72, y: 76, r: -10 },
  { x: 62, y: 86, r: 12 },
  { x: 88, y: 79, r: 8 },
  { x: 13, y: 85, r: -14 },
  { x: 80, y: 71, r: 4 },
];
/** a find's place: the finds take the three screens of the yard in turn (the court, the back yard, the kiosk's side) */
export function yardSpot(slot: number): { page: -1 | 0 | 1; x: number; y: number; r: number } {
  const page = ([0, -1, 1] as const)[slot % 3];
  const list = page === 0 ? YARD_SPOTS : page === -1 ? YARD0_SPOTS : YARD2_SPOTS;
  return { page, ...list[Math.floor(slot / 3) % list.length] };
}

/** Silhouette used until a boss photo is provided. */
export function BossSilhouette({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 200 240" width="100%" height="100%" aria-hidden="true">
      <circle cx="100" cy="80" r="52" fill="#151933" stroke={OL} strokeWidth="5" />
      <path d="M20 240 C20 170 60 140 100 140 C140 140 180 170 180 240 Z" fill="#151933" stroke={OL} strokeWidth="5" />
      <text x="100" y="100" textAnchor="middle" fontSize="64" fontWeight="900" fill={accent} fontFamily="var(--font-display), sans-serif">?</text>
    </svg>
  );
}
