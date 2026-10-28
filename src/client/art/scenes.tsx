"use client";
/* Location banners, the yard's item spots and the silhouette of a boss without a picture. */
import { OL } from "./icons.tsx";

/* ---------------- location banners (360×140) ---------------- */
/** locations with a drawn background (public/assets/locations, built by tools/scene/build-locations.py) */
export const LOCATION_ART = new Set(["openspace", "market", "serverroom", "basement", "board", "accounting", "hr", "party"]);

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
