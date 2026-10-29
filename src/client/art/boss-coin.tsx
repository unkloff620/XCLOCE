"use client";
/*
 * A boss medal — bronze, silver or gold (content/medals.ts). Bosses with drawn medals (public/assets/medals/<boss>-<tier>.webp,
 * tools/medals/build-medals.py) show them; the others get the portrait toned into a coin. A medal not got yet is grey.
 */
import type { BossDef } from "../../content/bosses.ts";
import type { MedalTier } from "../../content/medals.ts";
import { BossSilhouette } from "./scenes.tsx";

/** the bosses whose medals are drawn */
const DRAWN = new Set(["datsik", "kedr", "mugo", "garkusha", "bebyakyan", "babafey", "vodovoz"]);

export function BossCoin({ boss, tier, size = 40, dim = false }: { boss: BossDef; tier: MedalTier; size?: number; dim?: boolean }) {
  if (DRAWN.has(boss.id)) {
    return (
      <span className={`bmedal ${dim ? "dim" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/assets/medals/${boss.id}-${tier}.webp`} alt="" draggable={false} />
      </span>
    );
  }
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
