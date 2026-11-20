/** a short pause between taps on the weapons (the user 2026-11-20): no spamming, ~0.3 s */
export const HIT_GAP_MS = 300;
let lastHitAt = 0;
/** true when a weapon tap may go now (and marks it); false — too soon after the last one */
export function hitGapOk(now = Date.now()): boolean {
  if (now - lastHitAt < HIT_GAP_MS) return false;
  lastHitAt = now;
  return true;
}
