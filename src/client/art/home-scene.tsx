"use client";
/* The player's room: artist's background, desk, monitor, PC and the seated character on the stool. */
import { CHARACTER, ROOM_BG, SCENE, SCENE_OBJECTS } from "../../content/home-scene.ts";
import { RigViewport } from "./rig.tsx";

type ObjId = keyof typeof SCENE_OBJECTS;

function Obj({ id, onPick }: { id: ObjId; onPick?: (equipment: string) => void }) {
  const o = SCENE_OBJECTS[id];
  const eq = "equipment" in o ? o.equipment : null;
  const h = o.w * o.aspect;
  const img = o.flip ? (
    <g transform={`translate(${o.x + o.w} ${o.y}) scale(-1 1)`}>
      <image href={`/assets/home/${id}-1.webp`} x="0" y="0" width={o.w} height={h} preserveAspectRatio="none" />
    </g>
  ) : (
    <image href={`/assets/home/${id}-1.webp`} x={o.x} y={o.y} width={o.w} height={h} preserveAspectRatio="none" />
  );
  if (!eq || !onPick) return img;
  return (
    <g role="button" tabIndex={0} aria-label={id === "pc" ? "Системник" : "Монитор"} style={{ cursor: "pointer" }}
      onClick={() => onPick(eq)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(eq)}>
      {img}
    </g>
  );
}

export function HomeScene({ room = "basic", onPick }: { room?: string; onPick?: (equipment: string) => void }) {
  const bg = ROOM_BG[room] ?? ROOM_BG.basic;
  return (
    <svg viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} width="100%" style={{ display: "block" }}>
      <image href={`/assets/home/${bg}.webp`} x="0" y="0" width={SCENE.w} height={SCENE.h} preserveAspectRatio="none" />
      <Obj id="desk" />
      <Obj id="pc" onPick={onPick} />
      <Obj id="monitor" onPick={onPick} />
      <RigViewport x={CHARACTER.x} y={CHARACTER.y} scale={CHARACTER.scale} seat />
    </svg>
  );
}
