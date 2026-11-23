/**
 * «Экономия заряда»: phones got hot. The canvas animations (bosses on WebGL, Пепе, the pigeons) draw at most
 * 30 frames a second (a phone screen asks for 60–120), and nothing while the game is hidden. With the switch on —
 * 15 frames, and the endless CSS glows/sways play once and stop (html.eco, screens.css). Remembered on this device.
 */
const KEY = "xc_eco";
let on = read();
const listeners = new Set<() => void>();

function read(): boolean {
  try { return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function apply() {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("eco", on);
}
apply();

export const isEco = () => on;
export function setEco(v: boolean) {
  on = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* storage blocked: lasts this session */ }
  apply();
  listeners.forEach((f) => f());
}
export function onEcoChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** ms between drawn frames */
export const frameGap = () => (on ? 1000 / 15 : 1000 / 30);

/**
 * A frame gate for a requestAnimationFrame loop: `if (!gate(now)) return;` — false while the page is hidden or the
 * frame came too soon after the last drawn one. All the loops share one decision per screen frame (the rAF time is the
 * same for every callback of a frame), so the pose engine and the puppet always move on the same frames — two gates
 * out of step made the bosses judder. The slack is wide (a quarter of the gap): a frame that comes a little early on a
 * busy phone is drawn instead of skipped (a skipped one is a 50 ms hitch at 60 Hz).
 */
let frameAt = -1, frameOk = false, lastDrawn = -Infinity;
export function frameGate(): (now: number) => boolean {
  return (now: number) => {
    if (typeof document !== "undefined" && document.hidden) return false;
    if (now !== frameAt) {
      frameAt = now;
      const gap = frameGap();
      frameOk = now - lastDrawn >= gap * 0.75;
      if (frameOk) lastDrawn = now - Math.min(gap * 0.25, Math.max(0, now - lastDrawn - gap));
    }
    return frameOk;
  };
}
