/*
 * «Критический урон ×2» over the fight: the banner catches fire from the bottom up (a ragged glowing edge eats in),
 * smoulders for a moment and then burns away the same way. A noise field decides when each pixel ignites/burns;
 * the pixels near the front glow orange-yellow. Drawn on a canvas only while it plays (~2 s), then `onDone`.
 */
import { useEffect, useRef } from "react";

export const CRIT_BANNER = "/assets/generated/crit-x2.webp";

const IGNITE_MS = 520;
const HOLD_MS = 900;
const BURN_MS = 700;
/** how wide the glowing front is (in noise units) */
const EDGE = 0.09;

let cache: { img: HTMLImageElement; noise: Float32Array; w: number; h: number; src: Uint8ClampedArray } | null = null;

/** smooth value noise, a few octaves, leaning so the bottom goes first (fire climbs) */
function makeNoise(w: number, h: number): Float32Array {
  const G = 24;
  const gw = Math.ceil(w / G) + 2, gh = Math.ceil(h / G) + 2;
  const grid = (oct: number) => { const a = new Float32Array(gw * gh * oct * oct); for (let i = 0; i < a.length; i++) a[i] = Math.random(); return a; };
  const octs = [1, 2, 4].map((o) => ({ o, g: grid(o), gw: gw * o }));
  const sm = (t: number) => t * t * (3 - 2 * t);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0, amp = 0.55, tot = 0;
      for (const { o, g, gw: W } of octs) {
        const fx = (x / G) * o, fy = (y / G) * o;
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
        const a = g[iy * W + ix], b = g[iy * W + ix + 1], c = g[(iy + 1) * W + ix], d = g[(iy + 1) * W + ix + 1];
        v += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        tot += amp; amp *= 0.5;
      }
      out[y * w + x] = 0.55 * (v / tot) + 0.45 * (1 - y / h);
    }
  }
  // stretch to 0…1
  let lo = 1, hi = 0;
  for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo || 1);
  return out;
}

function load(): Promise<NonNullable<typeof cache>> {
  if (cache) return Promise.resolve(cache);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d")!; x.drawImage(img, 0, 0);
      cache = { img, noise: makeNoise(w, h), w, h, src: x.getImageData(0, 0, w, h).data };
      res(cache);
    };
    img.onerror = rej;
    img.src = CRIT_BANNER;
  });
}
/** start loading early, so the first crit does not wait for the picture */
export const preloadCritBanner = () => { if (typeof window !== "undefined") void load().catch(() => undefined); };

export function CritBurn({ onDone, className }: { onDone: () => void; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    let raf = 0, dead = false;
    void load().then((c) => {
      const cv = ref.current;
      if (dead || !cv) return;
      cv.width = c.w; cv.height = c.h;
      const ctx = cv.getContext("2d")!;
      const out = ctx.createImageData(c.w, c.h);
      const d = out.data, s = c.src, n = c.noise;
      // t: the front (0 → 1+EDGE); `away`: false — pixels below the front are lit; true — they are gone
      const paint = (t: number, away: boolean) => {
        for (let i = 0, p = 0; i < n.length; i++, p += 4) {
          const a = s[p + 3];
          if (!a) { d[p + 3] = 0; continue; }
          const k = t - n[i]; // > 0: the front has passed this pixel
          if (away ? k > EDGE : k < 0) { d[p + 3] = 0; continue; }
          let r = s[p], g = s[p + 1], b = s[p + 2], al = a;
          // inside the glowing band: 1 right at the front, 0 at its far side
          const f = away ? (k >= 0 ? k / EDGE : 0) : k < EDGE ? 1 - k / EDGE : 0;
          if (f > 0) {
            r += (255 - r) * f; g += (190 - g) * f * 0.9; b *= 1 - f;
            if (away) al = a * (1 - f * 0.85); // burning away: thins out
          }
          d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = al;
        }
        ctx.putImageData(out, 0, 0);
      };
      const t0 = performance.now();
      const frame = (now: number) => {
        if (dead) return;
        const el = now - t0;
        if (el < IGNITE_MS) paint((el / IGNITE_MS) * (1 + EDGE), false);
        else if (el < IGNITE_MS + HOLD_MS) {
          if (el - IGNITE_MS < 40) ctx.drawImage(c.img, 0, 0);
        } else if (el < IGNITE_MS + HOLD_MS + BURN_MS) paint(((el - IGNITE_MS - HOLD_MS) / BURN_MS) * (1 + EDGE), true);
        else { ctx.clearRect(0, 0, c.w, c.h); done.current(); return; }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }).catch(() => done.current());
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
