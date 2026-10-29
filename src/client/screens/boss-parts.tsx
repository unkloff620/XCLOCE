"use client";
import type { BossDef } from "../../content/bosses.ts";
import { BossSilhouette } from "../art/scenes.tsx";
import { BossRig, hasBossRig } from "../art/boss-rig.tsx";

/**
 * Raster boss photo inside a vector frame: thick outline like the rest of the UI, a rim in the boss colour,
 * a themed glow behind and a vignette on top so the photo sits in the vector world instead of looking pasted in.
 */
export function BossPhoto({ boss, round, defeated, locked }: { boss: BossDef; round?: boolean; defeated?: boolean; locked?: boolean }) {
  const src = boss.photo.portrait;
  // the beaten boss on the win screen: his live rig, sad and dazed, slowly swaying, stars going round over his head
  const ko = defeated && !locked && hasBossRig(boss.id);
  return (
    <div className={`bphoto ${round ? "round" : ""} ${locked ? "locked" : ""} ${ko ? "ko" : ""}`} style={{ ["--acc" as string]: boss.theme.accent, ["--bga" as string]: boss.theme.a }}>
      <div className="bphoto-in">
        {ko ? (
          <>
            <div className="bphoto-ko"><BossRig id={boss.id} bust hpShare={0} /></div>
            <KoStars />
          </>
        ) : src && !locked ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={boss.name} draggable={false} />
        ) : (
          <BossSilhouette accent={boss.theme.accent} />
        )}
      </div>
      {defeated && <span className="stamp display">ПОБЕДА!</span>}
    </div>
  );
}

/** knocked out: little stars circling over the head (each runs the same oval, one after another) */
function KoStars() {
  return (
    <span className="ko-stars" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <svg key={i} className="ko-star" viewBox="-12 -12 24 24" style={{ animationDelay: `${(-i * 2.4) / 4}s` }}>
          <path d="M0 -10 L2.9 -3.6 L9.6 -3.1 L4.5 1.4 L6 8.2 L0 4.6 L-6 8.2 L-4.5 1.4 L-9.6 -3.1 L-2.9 -3.6 Z" fill="#ffd84a" stroke="#2a1606" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}
