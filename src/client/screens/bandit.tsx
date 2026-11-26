"use client";
/*
 * «Бандитский фарт» (the user 2026-11-26): a 5×4 slot machine for roubles (a bet of 1–10), its own big vertical wilds
 * that multiply the lines. Being built: for now the reels' look with the symbols (public/assets/bandit, tools/bandit);
 * the artist's frame, background and characters, the spins and the payouts come next.
 */
import Link from "next/link";
import { usePageReady } from "../route-loader.tsx";

/** the symbols, the dear ones first */
export const BANDIT_SYMBOLS = ["raven", "cap", "ring", "chain", "money", "revolver", "dice", "horseshoe", "a", "k", "q", "j", "ten", "bell"] as const;
const V = "?v=1";
// a fixed spread of the symbols over the 5×4 reels
const GRID = [0, 6, 2, 9, 4, 11, 1, 13, 7, 3, 5, 8, 12, 0, 10, 2, 9, 6, 1, 11].map((k) => BANDIT_SYMBOLS[k]);

export function BanditScreen() {
  usePageReady(true);
  return (
    <div className="bd-screen">
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <Link href="/yard" className="btn sm dark" aria-label="Назад во двор">‹</Link>
        <h2 className="display" style={{ margin: 0 }}>Бандитский фарт</h2>
      </div>
      <div className="bd-reels" aria-hidden="true">
        {GRID.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} className="bd-sym" src={`/assets/bandit/${s}.webp${V}`} alt="" draggable={false} />
        ))}
      </div>
    </div>
  );
}
