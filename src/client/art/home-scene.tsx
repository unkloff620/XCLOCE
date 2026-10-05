"use client";
/* The player's room: artist's background, the PC in the corner, the desk with 1–3 monitors and the seated character on the stool. */
import { CHARACTER, ROOM_BG, ROOM_LIGHTS, ROOM_SKY, SCENE, SCENE_HOT, SCENE_OBJECTS } from "../../content/home-scene.ts";
import { RigViewport, type Worn } from "./rig.tsx";
import { ART_ASPECT } from "./desk-data.ts";
import { stageOf, type Look } from "../../content/home.ts";

type ObjId = keyof typeof SCENE_OBJECTS;

/** a picture standing at its place; a picture of another height keeps the place's bottom line (legs, stand on the desk) */
function Obj({ id, art }: { id: ObjId; art: string }) {
  const o = SCENE_OBJECTS[id];
  const h = o.w * (ART_ASPECT[art] ?? o.aspect);
  const src = `/assets/home/${art}.webp`;
  const y = o.y + o.w * o.aspect - h;
  return o.flip ? (
    <g transform={`translate(${o.x + o.w} ${y}) scale(-1 1)`}>
      <image href={src} x="0" y="0" width={o.w} height={h} preserveAspectRatio="none" />
    </g>
  ) : (
    <image href={src} x={o.x} y={y} width={o.w} height={h} preserveAspectRatio="none" />
  );
}

/** invisible tap zone above everything (the character's pictures would catch the taps otherwise) */
function Hot({ id, onPick }: { id: keyof typeof SCENE_HOT; onPick: (equipment: string) => void }) {
  const z = SCENE_HOT[id];
  return (
    <rect role="button" tabIndex={0} aria-label={id === "pc" ? "Системник" : "Мониторы"} x={z.x} y={z.y} width={z.w} height={z.h}
      fill="transparent" pointerEvents="all" style={{ cursor: "pointer", outline: "none" }}
      onClick={() => onPick(z.equipment)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(z.equipment)} />
  );
}

/**
 * focusHero: the character editor is open — the whole room goes grey and dark, only the hero keeps his colours.
 */
export function HomeScene({ room = "basic", onPick, still, look, worn, levels = {}, decor = {}, focusHero }: { room?: string; onPick?: (equipment: string) => void; still?: boolean; look?: Look; worn?: Worn; levels?: Record<string, number>; decor?: Record<string, number>; focusHero?: boolean }) {
  const bg = ROOM_BG[room] ?? ROOM_BG.basic;
  const sky = ROOM_SKY[room];
  const desk = stageOf("desk", levels, decor).stage?.art ?? "desk-001";
  const monitors = stageOf("monitor2", levels, decor).level; // 0: old CRT on the right, 1: flat on the right, 2: + left, 3: + middle
  const lights = ROOM_LIGHTS[room] ?? [];
  return (
    <svg viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} width="100%" style={{ display: "block" }}>
      {focusHero && (
        <defs>
          {/* greyscale, then ~40% brightness */}
          <filter id="scene-dim" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0.085 0.286 0.029 0 0  0.085 0.286 0.029 0 0  0.085 0.286 0.029 0 0  0 0 0 1 0" />
          </filter>
        </defs>
      )}
      <g filter={focusHero ? "url(#scene-dim)" : undefined}>
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
      <Obj id="pc" art="pc-1" />
      <Obj id="desk" art={desk} />
      {monitors >= 3 && <Obj id="monitorCenter" art="monitor-center" />}
      {monitors >= 2 && <Obj id="monitorLeft" art="monitor-left" />}
      {monitors >= 1 ? <Obj id="monitorRight" art="monitor-right" /> : <Obj id="monitorOld" art="monitor-1" />}
      </g>
      <RigViewport x={CHARACTER.x} y={CHARACTER.y} scale={CHARACTER.scale} seat={stageOf("chair", levels, decor).level} still={still} look={look} worn={worn} />
      {onPick && <Hot id="monitors" onPick={onPick} />}
      {onPick && <Hot id="pc" onPick={onPick} />}
    </svg>
  );
}
