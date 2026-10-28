"use client";
/*
 * «Взрыв» — what a won boss fight gives by its mode (content/medals.ts): a bronze, silver or gold blast. Every one adds
 * damage to the boss's weapon at once; MEDAL_SET of a kind is the full bonus. (The coins with the boss's face are the
 * «Дела» medals for wins over him.)
 */
import type { MedalTier } from "../../content/medals.ts";

/** the artist's bursts: public/assets/ui/blast-<tier>.webp (tools/items/ui, built by tools/items/build-items.py) */
export function BlastIcon({ tier, size = 24, dim = false }: { tier: MedalTier; size?: number; dim?: boolean }) {
  return (
    <svg className={`blast ${tier} ${dim ? "dim" : ""}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <image href={`/assets/ui/blast-${tier}.webp`} x="0" y="0" width="100" height="100" />
    </svg>
  );
}
