"use client";
/* The player's room: artist's background, the PC in the corner, the desk with 1–3 monitors and the seated character on the stool. */
import { CHARACTER, HERO_HOT, ROOM_BG, ROOM_LIGHTS, ROOM_RGB, ROOM_SKY, SCENE, SCENE_HOT, SCENE_OBJECTS } from "../../content/home-scene.ts";
import { RigViewport, type RigEdit, type Worn } from "./rig.tsx";
import { ART_ASPECT } from "./desk-data.ts";
import { placedArt, placedOf, type Look } from "../../content/home.ts";

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
 * hideHero: the room editor is open — the hero steps away (his chair stays) so the room behind is seen.
 * pieces / decor: the owned room things and which of them stand (content/home.ts placedOf).
 */
export function HomeScene({ room = "basic", onPick, onHero, still, look, worn, pieces = {}, decor = {}, trophies = [], focusHero, hideHero, edit }: { edit?: RigEdit; room?: string; onPick?: (equipment: string) => void; onHero?: () => void; still?: boolean; look?: Look; worn?: Worn; pieces?: Record<string, number>; decor?: Record<string, number>; trophies?: string[]; focusHero?: boolean; hideHero?: boolean }) {
  const bg = ROOM_BG[room] ?? ROOM_BG.basic;
  const sky = ROOM_SKY[room];
  const desk = placedArt("desk", pieces, decor) ?? "desk-001";
  // shown monitors: bit 1 — right, 2 — left, 4 — middle, 8 — the old CRT (in the right one's place)
  const monitors = placedOf("monitor2", pieces, decor);
  const lights = ROOM_LIGHTS[room] ?? [];
  const rgb = ROOM_RGB[room];
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
      {rgb && (
        // RGB LED strip: a soft glow along the ceiling and the sides, flowing from violet to blue
        <g className={still ? undefined : "room-rgb"} style={{ mixBlendMode: "screen" }} aria-hidden="true">
          <defs>
            <linearGradient id={`rgb-${room}`} x1="0" y1="0" x2={SCENE.w} y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#b44cff">{!still && <animate attributeName="stop-color" values="#b44cff;#3d8bff;#b44cff" dur="6s" repeatCount="indefinite" />}</stop>
              <stop offset="0.5" stopColor="#7a5cff">{!still && <animate attributeName="stop-color" values="#7a5cff;#b44cff;#3d8bff;#7a5cff" dur="6s" repeatCount="indefinite" />}</stop>
              <stop offset="1" stopColor="#3d8bff">{!still && <animate attributeName="stop-color" values="#3d8bff;#b44cff;#3d8bff" dur="6s" repeatCount="indefinite" />}</stop>
            </linearGradient>
            <filter id={`rgb-blur-${room}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14" /></filter>
          </defs>
          {rgb.map((pts, i) => (
            <g key={i}>
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={`url(#rgb-${room})`} strokeWidth={i > 2 ? 26 : 44} strokeLinecap="round" strokeLinejoin="round" filter={`url(#rgb-blur-${room})`} opacity={i > 2 ? 0.45 : 0.8} />
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={`url(#rgb-${room})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity={i > 2 ? 0.35 : 0.9} />
            </g>
          ))}
        </g>
      )}
      <Obj id="pc" art="pc-1" />
      <Obj id="desk" art={desk} />
      {(monitors & 4) !== 0 && <Obj id="monitorCenter" art="monitor-center" />}
      {(monitors & 2) !== 0 && <Obj id="monitorLeft" art="monitor-left" />}
      {(monitors & 1) !== 0 && <Obj id="monitorRight" art="monitor-right" />}
      {(monitors & 8) !== 0 && <Obj id="monitorOld" art="monitor-1" />}
      {trophies.includes("statue-close") && <Obj id="statueClose" art="statue-close" />}
      </g>
      <RigViewport x={CHARACTER.x} y={CHARACTER.y} scale={CHARACTER.scale} seat={placedOf("chair", pieces, decor)} still={still || !!edit} look={look} worn={worn} seatOnly={hideHero} edit={edit} />
      {onPick && <Hot id="monitors" onPick={onPick} />}
      {onPick && <Hot id="pc" onPick={onPick} />}
      {onHero && !hideHero && HERO_HOT.map((z, i) => (
        // the hero's body over the monitors' zone: a tap opens the wardrobe
        <rect key={i} role="button" tabIndex={i === 0 ? 0 : -1} aria-label="Персонаж: гардероб" x={z.x} y={z.y} width={z.w} height={z.h} rx="40"
          fill="transparent" pointerEvents="all" style={{ cursor: "pointer", outline: "none" }}
          onClick={onHero} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onHero()} />
      ))}
    </svg>
  );
}
