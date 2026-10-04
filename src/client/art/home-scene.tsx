"use client";
/* The player's room: artist's background, desk, monitor, PC and the seated character on the stool. */
import { CHARACTER, ROOM_BG, ROOM_LIGHTS, ROOM_SKY, SCENE, SCENE_OBJECTS } from "../../content/home-scene.ts";
import { RigViewport, type Worn } from "./rig.tsx";
import { DESK_ASPECT } from "./desk-data.ts";
import { STARTER_DESK } from "../../content/items.ts";
import type { Look } from "../../content/home.ts";

type ObjId = keyof typeof SCENE_OBJECTS;

function Obj({ id, onPick, art }: { id: ObjId; onPick?: (equipment: string) => void; art?: { src: string; aspect: number } }) {
  const o = SCENE_OBJECTS[id];
  const eq = "equipment" in o ? o.equipment : null;
  const h = o.w * (art?.aspect ?? o.aspect);
  const src = art?.src ?? `/assets/home/${id}-1.webp`;
  // standing objects keep their bottom (feet, legs) where the layout puts it, whatever the picture's height
  const y = o.y + o.w * o.aspect - h;
  const img = o.flip ? (
    <g transform={`translate(${o.x + o.w} ${y}) scale(-1 1)`}>
      <image href={src} x="0" y="0" width={o.w} height={h} preserveAspectRatio="none" />
    </g>
  ) : (
    <image href={src} x={o.x} y={y} width={o.w} height={h} preserveAspectRatio="none" />
  );
  if (!eq || !onPick) return img;
  return (
    <g role="button" tabIndex={0} aria-label={id === "pc" ? "Системник" : "Монитор"} style={{ cursor: "pointer" }}
      onClick={() => onPick(eq)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(eq)}>
      {img}
    </g>
  );
}

export function HomeScene({ room = "basic", onPick, still, look, worn }: { room?: string; onPick?: (equipment: string) => void; still?: boolean; look?: Look; worn?: Worn }) {
  const bg = ROOM_BG[room] ?? ROOM_BG.basic;
  const sky = ROOM_SKY[room];
  const desk = worn?.DESK && DESK_ASPECT[worn.DESK] ? worn.DESK : STARTER_DESK;
  const lights = ROOM_LIGHTS[room] ?? [];
  return (
    <svg viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} width="100%" style={{ display: "block" }}>
      {sky && (
        // the panorama and its mirror copy side by side: one period = 2 × width, so the loop has no seam
        <g className={still ? undefined : "room-sky"} style={{ ["--sky-w" as string]: `${-2 * sky.w}px` }}>
          <image href={sky.src} x="0" y={sky.y} width={sky.w} height={sky.h} preserveAspectRatio="none" />
          <image href={sky.src} x={-2 * sky.w} y={sky.y} width={sky.w} height={sky.h} preserveAspectRatio="none" transform="scale(-1 1)" />
          <image href={sky.src} x={2 * sky.w} y={sky.y} width={sky.w} height={sky.h} preserveAspectRatio="none" />
        </g>
      )}
      <image href={`/assets/home/${bg}.webp`} x="0" y="0" width={SCENE.w} height={SCENE.h} preserveAspectRatio="none" />
      {lights.length > 0 && (
        <g className={still ? undefined : "room-lights"} style={{ mixBlendMode: "screen" }} aria-hidden="true">
          <defs>
            {lights.map((l, i) => (
              <radialGradient key={i} id={`glow-${room}-${i}`}>
                <stop offset="0" stopColor={l.color} stopOpacity={l.kind === "lamp" ? 0.75 : 0.35} />
                <stop offset="0.35" stopColor={l.color} stopOpacity={l.kind === "lamp" ? 0.28 : 0.15} />
                <stop offset="1" stopColor={l.color} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>
          {lights.map((l, i) => (
            <ellipse key={i} className={`room-light ${l.kind}`} style={{ animationDelay: `${-i * 1.7}s` }}
              cx={l.x} cy={l.y} rx={l.r} ry={l.kind === "lamp" ? l.r * 1.25 : l.r * 0.22} fill={`url(#glow-${room}-${i})`} />
          ))}
        </g>
      )}
      <Obj id="desk" art={{ src: `/assets/home/${desk}.webp`, aspect: DESK_ASPECT[desk] ?? SCENE_OBJECTS.desk.aspect }} />
      <Obj id="pc" onPick={onPick} />
      <Obj id="monitor" onPick={onPick} />
      <RigViewport x={CHARACTER.x} y={CHARACTER.y} scale={CHARACTER.scale} seat still={still} look={look} worn={worn} />
    </svg>
  );
}
