"use client";
/*
 * A boss medal: the boss's face struck on a coin — bronze, silver or gold (content/medals.ts). The portrait is toned
 * into the metal, the rim is milled; a medal not got yet is a dull grey blank with the face barely seen.
 */
import type { BossDef } from "../../content/bosses.ts";
import type { MedalTier } from "../../content/medals.ts";
import { BossSilhouette } from "./scenes.tsx";

export function BossCoin({ boss, tier, size = 40, dim = false }: { boss: BossDef; tier: MedalTier; size?: number; dim?: boolean }) {
  const src = boss.photo.portrait;
  return (
    <span className={`bcoin ${tier} ${dim ? "dim" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="bcoin-face">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" draggable={false} /> : <BossSilhouette accent="#222" />}
      </span>
      <span className="bcoin-shine" />
    </span>
  );
}
