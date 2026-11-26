"use client";
/*
 * A boss's room behind the fight (and behind the door). Most are one flat picture (content/bosses.ts arenaOf); Князь's
 * room is alive (tools/boss/build-knyaz-room.py): the round vault door swings open a little on its hinge now and then and
 * gold light spills out of the vault, the leaves behind the window stir in the wind.
 */
import { NitkaRoom } from "./arena-nitka.tsx";
import { HimikRoom } from "./arena-himik.tsx";
import { arenaOf } from "../../content/bosses.ts";
import { KNYAZ_ROOM } from "./arena-knyaz-data.ts";
import { BOTSMAN_ROOM } from "./arena-botsman-data.ts";
import { FokusRoom } from "./arena-fokus.tsx";
import { SUN_ROOM } from "./arena-sun-data.ts";

const K = KNYAZ_ROOM;
/** the vault door's hinge (its right edge) and the middle of the vault */
const HINGE_X = K.door.x + K.door.w - 6;
const VAULT = { x: K.inside.x + K.inside.w / 2, y: K.inside.y + K.inside.h / 2, r: K.inside.w / 2 };

/** Князь's room in its own 1024×1536 units: the layers and their animation (also the home room «Хранилище»: content/home-scene.ts) */
export function KnyazRoom({ uid = "a" }: { uid?: string }) {
  const img = (n: string, cls?: string) => {
    const b = K[n];
    return <image className={cls} href={`/assets/arena/knyaz/${n}.webp`} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />;
  };
  const metal = { x: K.rim.x, y: K.rim.y, w: K.rim.w, h: K.rim.h };
  return (
    <g className="kzr-live">
      <defs>
        <radialGradient id={`kzr-glow-${uid}`}>
          <stop offset="0" stopColor="#fff2b8" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#ffc94a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb020" stopOpacity="0" />
        </radialGradient>
        {/* the silver glint runs over the steel only: the door and its frame */}
        <mask id={`kzr-steel-${uid}`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x={metal.x} y={metal.y} width={metal.w} height={metal.h}>
          <g className="kzr-door" style={{ transformOrigin: `${HINGE_X}px ${VAULT.y}px`, transformBox: "view-box" }}>{img("door")}</g>
          {img("rim")}
        </mask>
        <linearGradient id={`kzr-shine-${uid}`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.42" stopColor="#eef4ff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.58" stopColor="#eef4ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* the leaves and the wired glass are behind the room picture: they show through its window only */}
      <g className="kzr-leaves" style={{ transformOrigin: `${K.leaves.x + K.leaves.w / 2}px ${K.leaves.y + K.leaves.h}px`, transformBox: "view-box" }}>{img("leaves")}</g>
      {img("glass")}
      {img("room")}
      {img("inside")}
      {/* the light from the vault: inside the frame, and a soft spill on the wall around it */}
      <circle className="kzr-glow" cx={VAULT.x} cy={VAULT.y} r={VAULT.r * 0.95} fill={`url(#kzr-glow-${uid})`} />
      <circle className="kzr-spill" cx={VAULT.x - VAULT.r * 0.3} cy={VAULT.y} r={VAULT.r * 2} fill={`url(#kzr-glow-${uid})`} />
      {/* the door swings behind its frame */}
      <g className="kzr-door" style={{ transformOrigin: `${HINGE_X}px ${VAULT.y}px`, transformBox: "view-box" }}>{img("door")}</g>
      {img("rim")}
      <g mask={`url(#kzr-steel-${uid})`} style={{ mixBlendMode: "screen" }}>
        <rect className="kzr-shine" x={metal.x - metal.w} y={metal.y} width={metal.w * 0.7} height={metal.h} fill={`url(#kzr-shine-${uid})`} />
      </g>
    </g>
  );
}

/**
 * Боцман's dojo in 1024×1536 (tools/boss/build-botsman-room.py): a green code rain runs down the black back wall (two
 * strips at different speeds, fading at the wall's edges), the punching bag swings on its chain.
 */
export function BotsmanRoom({ uid = "a" }: { uid?: string }) {
  const B = BOTSMAN_ROOM;
  const w = B.wall;
  return (
    <g className="btr-live">
      <defs>
        <clipPath id={`btr-wall-${uid}`}><rect x={w.x} y={w.y} width={w.w} height={w.h} /></clipPath>
        <linearGradient id={`btr-fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.14" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.86" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`btr-mask-${uid}`} maskUnits="userSpaceOnUse" x={w.x} y={w.y} width={w.w} height={w.h}>
          <rect x={w.x} y={w.y} width={w.w} height={w.h} fill={`url(#btr-fade-${uid})`} />
        </mask>
      </defs>
      <image href="/assets/arena/botsman/room.webp" x={0} y={0} width={1024} height={1536} preserveAspectRatio="none" />
      <g clipPath={`url(#btr-wall-${uid})`}>
        <g mask={`url(#btr-mask-${uid})`} style={{ mixBlendMode: "screen" }}>
          <g className="btr-code btr-code-a"><image href="/assets/arena/botsman/code.webp" x={w.x} y={w.y - w.h} width={w.w} height={w.h * 2} preserveAspectRatio="none" /></g>
          <g className="btr-code btr-code-b"><image href="/assets/arena/botsman/code.webp" x={w.x - 9} y={w.y - w.h} width={w.w} height={w.h * 2} preserveAspectRatio="none" /></g>
        </g>
      </g>
      <g className="btr-bag" style={{ transformOrigin: `${B.pin[0]}px ${B.pin[1]}px`, transformBox: "view-box" }}>
        <image href="/assets/arena/botsman/bag.webp" x={B.bag.x} y={B.bag.y} width={B.bag.w} height={B.bag.h} preserveAspectRatio="none" />
      </g>
    </g>
  );
}

/**
 * Утилизатор's night yard in 1024×1536 (tools/boss/build-utilizator-room.py): the storm sky drifts slowly behind the
 * yard, the lightning flashes now and then (the sky lights up with it), the street lamp flickers, the acid by the barrels
 * glows green, fog creeps along the gate behind him — and a downpour falls. The front fog by his feet and the near rain
 * go over the boss (UtilizatorFront).
 */
const UT = "/assets/arena/utilizator";
function Rain({ cls, src, op }: { cls: string; src: string; op: number }) {
  // two copies of the tile, one over the other: the group slides down one tile and starts again
  return (
    <g className={`utr-rain ${cls}`} opacity={op}>
      {[-768, 0, 768].flatMap((y) => [0, 1024].map((x) => <image key={`${x},${y}`} href={src} x={x} y={y} width={1024} height={768} preserveAspectRatio="none" />))}
    </g>
  );
}
function Fog({ cls, y, h, op }: { cls: string; y: number; h: number; op: number }) {
  return (
    <g className={`utr-fog ${cls}`} opacity={op}>
      <image href={`${UT}/fog.webp`} x={0} y={y} width={2048} height={h} preserveAspectRatio="none" />
      <image href={`${UT}/fog.webp`} x={2048} y={y} width={2048} height={h} preserveAspectRatio="none" />
    </g>
  );
}
export function UtilizatorRoom({ uid = "a" }: { uid?: string }) {
  return (
    <g className="utr-live">
      <defs>
        <radialGradient id={`utr-lamp-${uid}`}><stop offset="0" stopColor="#ffd38a" stopOpacity="0.9" /><stop offset="0.3" stopColor="#ffb44a" stopOpacity="0.35" /><stop offset="1" stopColor="#ff9a2a" stopOpacity="0" /></radialGradient>
        <radialGradient id={`utr-pool-${uid}`}><stop offset="0" stopColor="#ffb050" stopOpacity="0.35" /><stop offset="1" stopColor="#ff9a2a" stopOpacity="0" /></radialGradient>
        <radialGradient id={`utr-acid-${uid}`}><stop offset="0" stopColor="#9dff3a" stopOpacity="0.55" /><stop offset="0.45" stopColor="#6fe01e" stopOpacity="0.2" /><stop offset="1" stopColor="#4ac010" stopOpacity="0" /></radialGradient>
      </defs>
      {/* the sky: two seamless tiles side by side drift left */}
      <g className="utr-sky">
        <image href={`${UT}/sky.webp`} x={0} y={-300} width={1024} height={1024} preserveAspectRatio="none" />
        <image href={`${UT}/sky.webp`} x={1024} y={-300} width={1024} height={1024} preserveAspectRatio="none" />
      </g>
      <rect className="utr-skyflash" x={0} y={0} width={1024} height={720} fill="#9fc2ff" />
      <image className="utr-bolt" href={`${UT}/bolt.webp`} x={160} y={-50} width={900} height={600} preserveAspectRatio="none" />
      <Rain cls="utr-rain-far" src={`${UT}/rain-b.webp`} op={0.55} />
      <image href={`${UT}/room.webp`} x={0} y={0} width={1024} height={1536} preserveAspectRatio="none" />
      {/* the lamp: its head and the orange pool on the wet ground flicker together */}
      <g className="utr-lamp" style={{ mixBlendMode: "screen" }}>
        <ellipse cx={200} cy={152} rx={150} ry={130} fill={`url(#utr-lamp-${uid})`} />
        <ellipse cx={250} cy={1010} rx={260} ry={150} fill={`url(#utr-pool-${uid})`} />
      </g>
      {/* the acid by the barrels and in the puddles */}
      <g className="utr-acid" style={{ mixBlendMode: "screen" }}>
        <ellipse cx={120} cy={830} rx={200} ry={120} fill={`url(#utr-acid-${uid})`} />
        <ellipse cx={890} cy={850} rx={200} ry={120} fill={`url(#utr-acid-${uid})`} />
        <ellipse className="utr-acid-b" cx={240} cy={1240} rx={170} ry={70} fill={`url(#utr-acid-${uid})`} />
        <ellipse className="utr-acid-b" cx={770} cy={1270} rx={180} ry={70} fill={`url(#utr-acid-${uid})`} />
      </g>
      {/* fog behind him, along the gate and the barrels */}
      <Fog cls="utr-fog-back" y={560} h={360} op={0.85} />
      <rect className="utr-groundflash" x={0} y={480} width={1024} height={1056} fill="#9fc2ff" />
    </g>
  );
}
/** what goes over Утилизатор in his fight: the near rain and the fog by his feet */
export function UtilizatorFront() {
  return (
    <svg className="arena-front" viewBox="0 0 1024 1536" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <Fog cls="utr-fog-front" y={800} h={420} op={0.6} />
      <Rain cls="utr-rain-near" src={`${UT}/rain-a.webp`} op={0.6} />
    </svg>
  );
}

/**
 * Солнце's lava forge in 1024×1536 (tools/boss/build-sun-room.py): the fireball turns behind the round window of the sun
 * gate (a hot glow pulsing round it), the room's lava cracks boil — two copies of their glow breathing out of step, one
 * of them a little blurred — and the lamp's beam on the right flickers.
 */
export function SunRoom({ uid = "a" }: { uid?: string }) {
  const R = SUN_ROOM;
  const b = R.ball, w = R.win, m = R.beam;
  const A = "/assets/arena/solntse";
  return (
    <g className="snr-live">
      <defs>
        <radialGradient id={`snr-heat-${uid}`}>
          <stop offset="0" stopColor="#ffd27a" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#ff7a1a" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ff3a00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`snr-beam-${uid}`} gradientUnits="userSpaceOnUse" x1={m.lamp[0]} y1={m.lamp[1]} x2={(m.a[0] + m.b[0]) / 2} y2={(m.a[1] + m.b[1]) / 2}>
          <stop offset="0" stopColor="#ffe2a0" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#ffab4a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff8a2a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={1024} height={1536} fill="#1a0602" />
      {/* the fireball behind the window: it turns, its heat breathes */}
      <circle className="snr-heat" cx={w.cx} cy={w.cy} r={w.r * 1.25} fill={`url(#snr-heat-${uid})`} />
      <g className="snr-ball" style={{ transformOrigin: `${b.x + b.w / 2}px ${b.y + b.h / 2}px`, transformBox: "view-box" }}>
        <image href={`${A}/ball.webp`} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />
      </g>
      <image href={`${A}/room.webp`} x={0} y={0} width={1024} height={1536} preserveAspectRatio="none" />
      {/* the lava boils: its cracks glow brighter and dimmer, two layers out of step */}
      <g style={{ mixBlendMode: "screen" }}>
        <image className="snr-boil snr-boil-a" href={`${A}/cracks.webp`} x={0} y={0} width={1024} height={1536} preserveAspectRatio="none" />
        <image className="snr-boil snr-boil-b" href={`${A}/cracks-soft.webp`} x={0} y={0} width={1024} height={1536} preserveAspectRatio="none" />
        {/* the lamp and its beam flicker */}
        <g className="snr-lamp">
          <polygon points={`${m.lamp[0]},${m.lamp[1]} ${m.a[0]},${m.a[1]} ${m.b[0]},${m.b[1]}`} fill={`url(#snr-beam-${uid})`} />
          <circle cx={m.lamp[0]} cy={m.lamp[1]} r={34} fill={`url(#snr-heat-${uid})`} />
        </g>
      </g>
    </g>
  );
}

export function ArenaBg({ bossId, className, focus = "bottom" }: { bossId: string; className?: string; focus?: "bottom" | "middle" }) {
  // Фокус's room is drawn on the scene canvas (1060×1484), alive (art/arena-fokus.tsx)
  if (bossId === "fokus") {
    return (
      <svg className={`arena-live ${className ?? ""}`} viewBox="0 0 1060 1484" preserveAspectRatio={focus === "bottom" ? "xMidYMax slice" : "xMidYMid slice"} aria-hidden="true">
        <FokusRoom uid={focus} />
      </svg>
    );
  }
  if (bossId === "nitka") {
    return (
      <svg className={`arena-live ${className ?? ""}`} viewBox="0 0 1024 1536" preserveAspectRatio={focus === "bottom" ? "xMidYMax slice" : "xMidYMid slice"} aria-hidden="true">
        <NitkaRoom uid={focus} />
      </svg>
    );
  }
  if (bossId === "himik") {
    // Химик's lab is taller (1024×1843): the artist's 2000×3600 sheet
    return (
      <svg className={`arena-live ${className ?? ""}`} viewBox="0 0 1024 1843" preserveAspectRatio={focus === "bottom" ? "xMidYMax slice" : "xMidYMid slice"} aria-hidden="true">
        <HimikRoom uid={focus} />
      </svg>
    );
  }
  if (bossId !== "knyaz" && bossId !== "botsman" && bossId !== "utilizator" && bossId !== "solntse") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={arenaOf(bossId)} alt="" draggable={false} />;
  }
  return (
    <svg className={`arena-live ${className ?? ""}`} viewBox="0 0 1024 1536" preserveAspectRatio={focus === "bottom" ? "xMidYMax slice" : "xMidYMid slice"} aria-hidden="true">
      {bossId === "solntse" ? <SunRoom uid={focus} /> : bossId === "botsman" ? <BotsmanRoom uid={focus} /> : bossId === "utilizator" ? <UtilizatorRoom uid={focus} /> : <KnyazRoom uid={focus} />}
    </svg>
  );
}
