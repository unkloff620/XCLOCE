"use client";
/*
 * Фокус's monitors (his room, art/arena-fokus.tsx): code types itself on the big one — tiny characters, the whole screen
 * full, it scrolls up when it reaches the bottom — and the small one runs a terminal (builds, tests, failing deadlines).
 * Both are SVG text in a flat box put onto the screen's four corners in true perspective (thin strips through a homography) — not a canvas in a
 * foreignObject, which the phone's WebKit paints once and never updates. The boss card's code (FokusCardCode) is a canvas.
 */
import { useEffect, useRef } from "react";
import { frameGate } from "../eco.ts";

type Pt = readonly [number, number];
/** the screens' corners in the room's units (1060×1484): top left, top right, bottom right, bottom left */
const BIG: Pt[] = [[775, 576], [982, 556], [969, 712], [761, 716]];
const SMALL: Pt[] = [[989, 606], [1046, 598], [1034, 727], [981, 721]];
/** the screens' exact working area (the artist's mask): the code is clipped to it */
const BIG_AREA: Pt[] = [[982, 556], [775, 576], [763, 695], [776, 696], [777, 709], [918, 716], [937, 716], [940, 702], [970, 702]];
const SMALL_AREA: Pt[] = [[1046, 598], [989, 606], [981, 721], [1034, 727]];

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

/** the true perspective (as Photoshop's «Perspective»): the homography taking the flat w×h box to the screen's four
 *  corners (tl, tr, br, bl) — farther parts come out smaller */
function homography(q: Pt[], w: number, h: number) {
  const src: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = q[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  }
  // Gauss–Jordan on the 8×9 system
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  const m = A.map((r, i) => r[8] / r[i]);
  return (x: number, y: number): Pt => { const d = m[6] * x + m[7] * y + 1; return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d]; };
}
/** the flat box cut into n vertical strips, each laid by its own affine through the homography (the strips are thin, so
 *  together they read as one picture in perspective): [transform, x0, x1] per strip */
function perspectiveStrips(q: Pt[], w: number, h: number, n: number) {
  const H = homography(q, w, h);
  return Array.from({ length: n }, (_, i) => {
    const x0 = (i / n) * w, x1 = ((i + 1) / n) * w;
    const o = H(x0, 0), r = H(x1, 0), b = H(x0, h);
    const a = (r[0] - o[0]) / (x1 - x0), bb = (r[1] - o[1]) / (x1 - x0), c = (b[0] - o[0]) / h, d = (b[1] - o[1]) / h;
    return { t: `matrix(${a} ${bb} ${c} ${d} ${o[0] - a * x0} ${o[1] - bb * x0})`, x0, x1 };
  });
}
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The monitors as SVG text (not a canvas in a foreignObject: the phone's WebKit draws that once and never again): each
 * screen's lines in a flat box, laid onto the screen's corners by one affine, clipped to the screen; updated in place.
 */
export function FokusScreens() {
  const big = useRef<SVGGElement>(null), small = useRef<SVGGElement>(null), curB = useRef<SVGRectElement>(null), curS = useRef<SVGRectElement>(null);
  const BW = 600, BH = 420, SW = 200, SH = 430, FS = 11, LH = 13.5, TFS = 10, TLH = 12.5;
  useEffect(() => {
    const gb = big.current, gs = small.current;
    if (!gb || !gs) return;
    const rows = Math.floor((BH - 8) / LH), trows = Math.floor((SH - 6) / TLH);
    const lines: string[] = [];
    let src = 0, typed = 0;
    const step = (n: number) => {
      while (n > 0) {
        const line = CODE[src % CODE.length];
        if (typed >= line.length) { lines.push(line); src++; typed = 0; if (lines.length > rows - 1) lines.shift(); n--; continue; }
        const k = Math.min(n, line.length - typed); typed += k; n -= k;
      }
    };
    const term: [string, string][] = [];
    let tk = 0;
    const tstep = () => { term.push(TERM[tk++ % TERM.length]); if (term.length > trows) term.shift(); };
    step(1400);
    for (let i = 0; i < 14; i++) tstep();
    // monospace: the cursor goes after the typed characters (the width of one character ≈ 0.6 em)
    const CW = FS * 0.6;
    const drawBig = () => {
      const all = [...lines, CODE[src % CODE.length].slice(0, typed)];
      gb.innerHTML = all.map((ln, i) => {
        const y = 4 + FS + i * LH;
        const no = String((src - lines.length + i) % CODE.length + 1).padStart(3, " ");
        return `<text x="3" y="${y}" fill="#3b4252">${no}</text><text x="28" y="${y}" xml:space="preserve">${colour(ln).map(([t, c]) => `<tspan fill="${c}">${esc(t)}</tspan>`).join("")}</text>`;
      }).join("");
      const last = all.length - 1;
      curB.current?.setAttribute("x", String(28 + all[last].length * CW + 1));
      curB.current?.setAttribute("y", String(4 + last * LH + 1));
    };
    const drawSmall = () => {
      gs.innerHTML = term.map(([t, c], i) => `<text x="4" y="${3 + TFS + i * TLH}" fill="${c}" xml:space="preserve">${esc(t)}</text>`).join("");
      curS.current?.setAttribute("y", String(3 + term.length * TLH + 1));
    };
    drawBig(); drawSmall();
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, last = performance.now(), acc = 0, tt = 0, blink = 0;
    const gate = frameGate();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!gate(now)) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // typed in small bursts (~8 a second): every redraw repaints all the strips
      acc += dt * 70;
      if (acc >= 8) { const n = Math.floor(acc); step(n); acc -= n; drawBig(); }
      tt += dt;
      if (tt > 0.45) { tstep(); tt = 0; drawSmall(); }
      blink += dt;
      const on = Math.floor(blink * 2.2) % 2 === 0 ? "1" : "0";
      curB.current?.setAttribute("opacity", on);
      curS.current?.setAttribute("opacity", on);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const poly = (q: Pt[]) => q.map((p) => p.join(",")).join(" ");
  const SB = perspectiveStrips(BIG, BW, BH, 12), SS = perspectiveStrips(SMALL, SW, SH, 5);
  return (
    <g style={{ pointerEvents: "none" }} fontFamily="ui-monospace, Menlo, Consolas, monospace">
      <defs>
        <clipPath id="fks-big"><polygon points={poly(BIG_AREA)} /></clipPath>
        <clipPath id="fks-small"><polygon points={poly(SMALL_AREA)} /></clipPath>
        <linearGradient id="fks-glare" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.07" /><stop offset="0.45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      {/* the flat screens (drawn once, in defs) shown through the perspective strips */}
      <defs>
        <g id="fks-b-flat" fontSize={FS}>
          <g ref={big} />
          <rect ref={curB} width={6} height={FS} fill="#c9d1d9" />
          <rect width={BW} height={BH} fill="url(#fks-glare)" />
        </g>
        <g id="fks-s-flat" fontSize={TFS}>
          <g ref={small} />
          <rect ref={curS} x={4} width={6} height={TFS} fill="#5fd67a" />
        </g>
        {SB.map((st, k) => <clipPath key={k} id={`fks-bc-${k}`}><rect x={st.x0 - 0.6} y={-2} width={st.x1 - st.x0 + 1.2} height={BH + 4} /></clipPath>)}
        {SS.map((st, k) => <clipPath key={k} id={`fks-sc-${k}`}><rect x={st.x0 - 0.6} y={-2} width={st.x1 - st.x0 + 1.2} height={SH + 4} /></clipPath>)}
      </defs>
      <g clipPath="url(#fks-big)" opacity={0.94}>
        <polygon points={poly(BIG_AREA)} fill="#0d1117" />
        {SB.map((st, k) => <g key={k} transform={st.t}><use href="#fks-b-flat" clipPath={`url(#fks-bc-${k})`} /></g>)}
      </g>
      <g clipPath="url(#fks-small)" opacity={0.94}>
        <polygon points={poly(SMALL_AREA)} fill="#0a0f0c" />
        {SS.map((st, k) => <g key={k} transform={st.t}><use href="#fks-s-flat" clipPath={`url(#fks-sc-${k})`} /></g>)}
      </g>
    </g>
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
    </span>
  );
}
