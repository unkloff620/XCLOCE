"use client";
import type { BossDef } from "../../content/bosses.ts";
import { BossSilhouette } from "../art/scenes.tsx";

/**
 * Raster boss photo inside a vector frame: thick outline like the rest of the UI, a rim in the boss colour,
 * a themed glow behind and a vignette on top so the photo sits in the vector world instead of looking pasted in.
 */
export function BossPhoto({ boss, round, defeated, locked }: { boss: BossDef; round?: boolean; defeated?: boolean; locked?: boolean }) {
  const src = boss.photo.portrait;
  return (
    <div className={`bphoto ${round ? "round" : ""} ${locked ? "locked" : ""}`} style={{ ["--acc" as string]: boss.theme.accent, ["--bga" as string]: boss.theme.a }}>
      <div className="bphoto-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && !locked ? <img src={src} alt={boss.name} draggable={false} /> : <BossSilhouette accent={boss.theme.accent} />}
      </div>
      {defeated && <span className="stamp display">DEFEATED</span>}
    </div>
  );
}
