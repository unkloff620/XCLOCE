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
 * A frame gate for a requestAnimationFrame loop: `if (!gate(now)) return;` — false while the page is hidden
 * or the frame came too soon after the last drawn one.
 */
export function frameGate(): (now: number) => boolean {
  let last = -Infinity;
  return (now: number) => {
    if (typeof document !== "undefined" && document.hidden) return false;
    // a little slack, so a 60 Hz screen draws every 2nd frame and not every 3rd
    if (now - last < frameGap() - 4) return false;
    last = now;
    return true;
  };
}
