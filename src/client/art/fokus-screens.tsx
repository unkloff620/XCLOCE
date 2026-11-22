"use client";
/*
 * Фокус's monitors (his room, art/arena-fokus.tsx): code types itself on the big one — tiny characters, the whole screen
 * full, it scrolls up when it reaches the bottom — and the small one runs a terminal (builds, tests, failing deadlines).
 * Both are drawn flat on canvases of their own, then laid onto the screens in perspective (the monitors stand turned a
 * little: each screen is a quad of the room picture, filled in thin vertical strips, each strip its own affine) on one
 * canvas in a foreignObject over the two screens.
 */
import { useEffect, useRef } from "react";
import { frameGate } from "../eco.ts";

type Pt = readonly [number, number];
/** the screens' corners in the room's units (1060×1484): top left, top right, bottom right, bottom left */
const BIG: Pt[] = [[776.5, 576.5], [980.5, 559], [966.5, 713.5], [765.5, 693.5]];
const SMALL: Pt[] = [[989, 608.5], [1046.5, 600], [1034, 724.5], [981.5, 719.5]];
/** the foreignObject over both screens (room units) and the canvas's pixels per unit */
const BOX = { x: 760, y: 553, w: 292, h: 177 };
const PX = 3;

const CODE = `import { Wallet, Chain, sleep } from "@fokus/core";
import { pump, dump, hodl } from "./strategy";

// My name is Fokus — I promise to ship the software by August.
// (which August — see TODO below)
const DEADLINE = new Date("August");   // TODO: pick a year
const MAX_LEVERAGE = 125;

export async function main(wallet: Wallet) {
  const chain = await Chain.connect("mainnet", { retries: Infinity });
  let balance = await wallet.balance();
  while (balance > 0) {
    const signal = await readTheCharts(chain);
    if (signal === "moon") {
      await pump(wallet, balance * MAX_LEVERAGE);
    } else if (signal === "rug") {
      await dump(wallet);          // it was not a rug, it was a feature
    } else {
      await hodl(wallet);
    }
    balance = await wallet.balance();
    log(\`balance: \${balance.toFixed(8)} — stop-loss: none\`);
  }
  throw new Error("liquidated (again)");
}

function readTheCharts(chain: Chain): Promise<string> {
  // three lines up = moon, one line down = the end of the world
  const candles = chain.candles("BTC", "1m").slice(-3);
  return candles.every((c) => c.close > c.open) ? "moon" : "rug";
}

class Software {
  private progress = 0.01;
  constructor(readonly author = "Fokus") {}
  async ship(): Promise<never> {
    while (Date.now() < DEADLINE.getTime()) {
      this.progress += 0.0000001;
      await sleep(24 * 60 * 60 * 1000);   // one day of work
    }
    return this.ship();                     // next August, I promise
  }
}

const soft = new Software();
soft.ship().catch(() => console.log("by August. for real this time."));

export const config = {
  name: "XCLOSE-killer",
  version: "0.0.1-alpha-pre-beta",
  tests: false,
  docs: "later",
  bugs: "features",
  coffee: Number.POSITIVE_INFINITY,
};

for (let day = 1; day <= 365; day++) {
  if (day % 7 === 0) rewrite("everything", { framework: "new" });
  commit(\`wip \${day}\`);
}
`.split("\n");

const TERM: [string, string][] = [
  ["$ npm run build", "#d7dde8"], ["> fokus-soft@0.0.1 build", "#8a93a6"], ["compiling 1 of 9999 modules…", "#8a93a6"],
  ["✓ wallet.ts", "#5fd67a"], ["✓ strategy.ts", "#5fd67a"], ["✗ deadline.ts", "#ff6b6b"], ["  Error: August is not defined", "#ff6b6b"],
  ["$ git commit -m \"fix\"", "#d7dde8"], ["[main 4f2a] fix", "#8a93a6"], ["$ git commit -m \"fix fix\"", "#d7dde8"],
  ["$ npm test", "#d7dde8"], ["0 passing, 0 failing", "#e6c14a"], ["no tests found (as planned)", "#e6c14a"],
  ["$ ping moon", "#d7dde8"], ["request timed out", "#ff6b6b"], ["$ sudo make money", "#d7dde8"], ["permission denied", "#ff6b6b"],
  ["$ deploy --prod --yolo", "#d7dde8"], ["deploying… 3%", "#8a93a6"], ["deploying… 4%", "#8a93a6"], ["ETA: August", "#5fd67a"],
];

const KW = /\b(import|from|export|const|let|async|await|function|return|if|else|while|for|new|class|private|readonly|constructor|throw|this|catch)\b/;
/** one line of code coloured: [text, colour] pieces */
function colour(line: string): [string, string][] {
  const out: [string, string][] = [];
  const c = line.indexOf("//");
  const code = c >= 0 ? line.slice(0, c) : line;
  const re = /("[^"]*"|'[^']*'|`[^`]*`|\b\d[\d_.]*\b|\b[A-Za-z_$][\w$]*\b|\s+|.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const t = m[0];
    const col = /^["'`]/.test(t) ? "#e6b673" : /^\d/.test(t) ? "#d19a66" : KW.test(t) && t.match(KW)![0] === t ? "#c678dd"
      : /^[A-Z]/.test(t) ? "#e5c07b" : /^[a-z_$][\w$]*$/i.test(t) && code[m.index + t.length] === "(" ? "#61afef" : "#c9d1d9";
    out.push([t, col]);
  }
  if (c >= 0) out.push([line.slice(c), line.includes("Fokus") ? "#7ee787" : "#6a737d"]);
  return out;
}

/** the flat screen of code: the lines typed so far, the one being typed, the cursor */
export function codeScreen(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!;
  const FS = 11, LH = 13.5;
  const rows = Math.floor((h - 8) / LH);
  const lines: string[] = [];
  let src = 0, typed = 0;
  return {
    cv,
    /** type n characters on */
    step(n: number) {
      while (n > 0) {
        const line = CODE[src % CODE.length];
        const left = line.length - typed;
        if (left <= 0) {
          lines.push(line); src++; typed = 0;
          if (lines.length > rows - 1) lines.shift();
          n -= 1;
          continue;
        }
        const k = Math.min(n, left);
        typed += k; n -= k;
      }
    },
    draw(t: number) {
      g.fillStyle = "#0d1117";
      g.fillRect(0, 0, w, h);
      g.font = `${FS}px ui-monospace, Menlo, Consolas, monospace`;
      g.textBaseline = "top";
      const cur = CODE[src % CODE.length].slice(0, typed);
      const all = [...lines, cur];
      all.forEach((ln, i) => {
        const y = 4 + i * LH;
        g.fillStyle = "#3b4252";
        g.fillText(String((src - lines.length + i) % CODE.length + 1).padStart(3, " "), 3, y);
        let x = 28;
        for (const [s, col] of colour(ln)) { g.fillStyle = col; g.fillText(s, x, y); x += g.measureText(s).width; }
        if (i === all.length - 1 && Math.floor(t * 2.2) % 2 === 0) { g.fillStyle = "#c9d1d9"; g.fillRect(x + 1, y, 6, FS); }
      });
      // the screen's own light: brighter in the middle, a soft glare from the top left
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, "rgba(255,255,255,0.07)"); gr.addColorStop(0.45, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(0,0,0,0.18)");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    },
  };
}

/** the flat terminal: a new line every few tenths of a second */
function termScreen(w: number, h: number) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!;
  const FS = 10, LH = 12.5;
  const rows = Math.floor((h - 6) / LH);
  const lines: [string, string][] = [];
  let k = 0;
  return {
    cv,
    step() { lines.push(TERM[k++ % TERM.length]); if (lines.length > rows) lines.shift(); },
    draw(t: number) {
      g.fillStyle = "#0a0f0c";
      g.fillRect(0, 0, w, h);
      g.font = `${FS}px ui-monospace, Menlo, Consolas, monospace`;
      g.textBaseline = "top";
      lines.forEach(([s, col], i) => { g.fillStyle = col; g.fillText(s, 4, 3 + i * LH); });
      if (Math.floor(t * 2) % 2 === 0) { g.fillStyle = "#5fd67a"; g.fillRect(4, 3 + lines.length * LH, 6, FS); }
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, "rgba(255,255,255,0.05)"); gr.addColorStop(1, "rgba(0,0,0,0.25)");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    },
  };
}

/** a flat picture laid onto a quad (canvas pixels) in thin vertical strips */
function warp(g: CanvasRenderingContext2D, src: HTMLCanvasElement, q: [number, number][], n = 40) {
  const [tl, tr, br, bl] = q;
  const lerp = (a: [number, number], b: [number, number], u: number): [number, number] => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  g.save();
  g.beginPath(); g.moveTo(...tl); g.lineTo(...tr); g.lineTo(...br); g.lineTo(...bl); g.closePath(); g.clip();
  const W = src.width, H = src.height;
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n;
    const o = lerp(tl, tr, u0), o1 = lerp(tl, tr, u1), ob = lerp(bl, br, u0);
    const sx0 = u0 * W, sw = (u1 - u0) * W;
    const a = (o1[0] - o[0]) / sw, b = (o1[1] - o[1]) / sw, c = (ob[0] - o[0]) / H, d = (ob[1] - o[1]) / H;
    g.setTransform(a, b, c, d, o[0] - a * sx0, o[1] - b * sx0);
    g.drawImage(src, sx0, 0, sw + 1, H, sx0, 0, sw + 1, H);
  }
  g.restore();
}

export function FokusScreens() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const big = codeScreen(600, 420), small = termScreen(200, 430);
    const toPx = (q: Pt[]) => q.map(([x, y]) => [(x - BOX.x) * PX, (y - BOX.y) * PX] as [number, number]);
    const qb = toPx(BIG), qs = toPx(SMALL);
    // a screen full of code from the start, the terminal half full
    big.step(1400);
    for (let i = 0; i < 14; i++) small.step();
    let raf = 0, last = performance.now(), acc = 0, term = 0;
    const gate = frameGate();
    const paint = (t: number) => {
      big.draw(t); small.draw(t);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      warp(g, big.cv, qb);
      warp(g, small.cv, qs, 16);
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!gate(now)) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // about 70 characters a second; a terminal line every 0.45 s
      acc += dt * 70;
      const n = Math.floor(acc);
      if (n > 0) { big.step(n); acc -= n; }
      term += dt;
      if (term > 0.45) { small.step(); term = 0; }
      paint(now / 1000);
    };
    if (still) paint(0);
    else raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <foreignObject x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} style={{ pointerEvents: "none" }}>
      <canvas ref={ref} width={BOX.w * PX} height={BOX.h * PX} style={{ width: "100%", height: "100%", display: "block", opacity: 0.94 }} />
    </foreignObject>
  );
}

/** Фокус's card in the boss list: the code types itself behind the text (the same code, dim), a frame of its own */
export function FokusCardCode() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const scr = codeScreen(560, 300);
    scr.step(900);
    const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = performance.now(), acc = 0;
    const gate = frameGate();
    const paint = (t: number) => { scr.draw(t); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(scr.cv, 0, 0, cv.width, cv.height); };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!gate(now)) return;
      acc += Math.min(0.1, (now - last) / 1000) * 45;
      last = now;
      const n = Math.floor(acc);
      if (n > 0) { scr.step(n); acc -= n; }
      paint(now / 1000);
    };
    if (still) paint(0); else raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span className="fk-card-fx" aria-hidden="true">
      <canvas ref={ref} className="fk-card-code" width={560} height={300} />
      <span className="fk-card-egg"><b>{"// My name is Fokus — I promise to ship the software by August."}</b></span>
      <i className="fk-drip d1" /><i className="fk-drip d2" /><i className="fk-drip d3" /><i className="fk-drip d4" />
    </span>
  );
}
