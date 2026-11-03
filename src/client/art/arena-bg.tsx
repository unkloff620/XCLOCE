"use client";
/*
 * A boss's room behind the fight (and behind the door). Most are one flat picture (content/bosses.ts arenaOf); Князь's
 * room is alive (tools/boss/build-knyaz-room.py): the round vault door swings open a little on its hinge now and then and
 * gold light spills out of the vault, the leaves behind the window stir in the wind.
 */
import { arenaOf } from "../../content/bosses.ts";
import { KNYAZ_ROOM } from "./arena-knyaz-data.ts";

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

export function ArenaBg({ bossId, className, focus = "bottom" }: { bossId: string; className?: string; focus?: "bottom" | "middle" }) {
  if (bossId !== "knyaz") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={arenaOf(bossId)} alt="" draggable={false} />;
  }
  return (
    <svg className={`arena-live ${className ?? ""}`} viewBox="0 0 1024 1536" preserveAspectRatio={focus === "bottom" ? "xMidYMax slice" : "xMidYMid slice"} aria-hidden="true">
      <KnyazRoom uid={focus} />
    </svg>
  );
}
