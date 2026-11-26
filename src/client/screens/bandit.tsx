"use client";
/*
 * «Бандитский фарт» (content/bandit.ts, systems/bandit.ts; the user 2026-11-26): the yard's 5×4 slot machine for
 * roubles. The frame, the panel and the wild reel are drawn in code for now — the artist's frame, background, bandit and
 * buttons take their places later. A spin: the reels run down and stop one by one from the left with a bounce, a wild
 * reel opens over its column with its multiplier, the winning cells glow, the win counts up; 3+ bells give free spins.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { usePageReady } from "../route-loader.tsx";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { BANDIT_UI as UI } from "../art/bandit-ui-data.ts";
import { BANDIT_BET_MAX, BANDIT_BET_MIN, BANDIT_FREE, BANDIT_REELS, BANDIT_ROWS, BANDIT_SCALE, BANDIT_SYMS, BANDIT_WILD, type BanditCell, type BanditSpin, type BanditSym } from "../../content/bandit.ts";

const V = "?v=1";
const pic = (s: BanditSym) => `/assets/bandit/${s}.webp${V}`;
const SYMS = BANDIT_SYMS.map((s) => s.id);
const randSym = (): BanditSym => SYMS[Math.floor(Math.random() * SYMS.length)];
const randCol = (): BanditCell[] => Array.from({ length: BANDIT_ROWS }, randSym);
/** how many cells run past before a reel stops; each next reel runs longer */
const RUN = 14, RUN_STEP = 4;
/** a reel's run (ms) and the gap before the next one stops */
const SPIN_MS = 700, STOP_GAP = 220;
const fmt = (n: number) => n.toLocaleString("ru-RU");

interface View { free: number; freeBet: number; spins: number; won: number; rub: number }
type SpinRes = BanditSpin & View & { bet: number; paid: number; wasFree: boolean; freeLeft: number };

export function BanditScreen() {
  const { act } = useGame();
  const [v, setV] = useState<View | null>(null);
  usePageReady(!!v);
  const [bet, setBet] = useState(1);
  const [cols, setCols] = useState<BanditCell[][]>(() => Array.from({ length: BANDIT_REELS }, randCol));
  /** the strips while spinning: the coming 4 on top, the run below them */
  const [strips, setStrips] = useState<BanditCell[][] | null>(null);
  const [stopped, setStopped] = useState<boolean[]>(Array(BANDIT_REELS).fill(true));
  const [res, setRes] = useState<SpinRes | null>(null);
  const [shown, setShown] = useState(false);
  const [winShown, setWinShown] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [auto, setAuto] = useState(false);
  const autoRef = useRef(false);
  const [table, setTable] = useState(false);
  const timers = useRef<number[]>([]);

  const load = useCallback(() => api.get<View>("/api/bandit").then(setV).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { autoRef.current = false; timers.current.forEach(clearTimeout); }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const free = v?.free ?? 0;
  const spin = useCallback(async () => {
    if (spinning) return;
    haptic.tap();
    setSpinning(true); setShown(false); setRes(null); setWinShown(0);
    // the reels start running at once; they stop when the answer is here
    setStrips(cols.map((c, i) => [...randCol(), ...Array.from({ length: RUN + i * RUN_STEP }, randSym), ...c]));
    setStopped(Array(BANDIT_REELS).fill(false));
    sfx("spin");
    const r = await act<SpinRes>("bandit_spin", { bet });
    if (!r) { setStrips(null); setStopped(Array(BANDIT_REELS).fill(true)); setSpinning(false); autoRef.current = false; setAuto(false); return; }
    // the real screen goes on top of every strip, then the reels stop one by one
    setStrips((st) => st && st.map((s, i) => [...r.reels[i], ...s.slice(BANDIT_ROWS)]));
    for (let i = 0; i < BANDIT_REELS; i++) later(() => { setStopped((p) => p.map((x, j) => (j === i ? true : x))); sfx("tap", 0.25); }, SPIN_MS + i * STOP_GAP);
    const end = SPIN_MS + (BANDIT_REELS - 1) * STOP_GAP + 380;
    later(() => {
      setCols(r.reels); setStrips(null); setRes(r); setShown(true);
      setV({ free: r.free > 0 ? r.freeLeft : r.freeLeft, freeBet: r.freeBet, spins: r.spins, won: r.won, rub: r.rub });
      if (r.win > 0) {
        sfx(r.win >= r.bet * 20 ? "bigwin" : "coin");
        // the win counts up
        const t0 = performance.now(), dur = Math.min(1800, 400 + r.win * 6);
        const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); setWinShown(Math.round(r.win * k)); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }
      setSpinning(false);
      if (autoRef.current) later(() => { if (autoRef.current) void spinRef.current(); }, r.win > 0 ? 1600 : 700);
    }, end);
  }, [spinning, cols, bet, act]);
  const spinRef = useRef(spin);
  spinRef.current = spin;

  const toggleAuto = () => {
    haptic.tap();
    const on = !autoRef.current;
    autoRef.current = on; setAuto(on);
    if (on && !spinning) void spin();
  };

  // the cells of the winning ways glow: a winning symbol (or a wild) on the reels its run covers
  const lit = (r: number, row: number) => {
    if (!shown || !res) return false;
    const c = res.reels[r][row];
    if (c === "bell") return res.bells > 0;
    return res.wins.some((w) => r < w.n && (c === w.sym || c === "W"));
  };
  const anyWin = shown && !!res && (res.wins.length > 0 || res.bells > 0);
  const shownBet = free > 0 ? v?.freeBet ?? bet : bet;

  const u = (b: { x: number; y: number; w: number; h: number }) => ({ left: `${(b.x / 20).toFixed(3)}%`, top: `${(b.y / 30).toFixed(3)}%`, width: `${(b.w / 20).toFixed(3)}%`, height: `${(b.h / 30).toFixed(3)}%` });
  const art = (name: keyof typeof UI.boxes) => `/assets/bandit/ui/${name}.webp${V}`;
  const reelTop = UI.cellY[0], reelH = UI.cellY[3] + UI.boxes.cell.h - UI.cellY[0];

  return (
    <div className="bd-screen" style={{ backgroundImage: `url(/assets/bandit/ui/bg.webp${V})` }}>
      <div className="bd-stage">
        {/* the artist's machine on its 2000×3000 canvas */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(UI.boxes.title)} src={art("title")} alt="Бандитский фарт" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(UI.boxes.frame)} src={art("frame")} alt="" draggable={false} />
        {UI.cellX.map((x) => UI.cellY.map((y) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${x}-${y}`} className="bd-l" style={u({ x, y, w: UI.boxes.cell.w, h: UI.boxes.cell.h })} src={art("cell")} alt="" draggable={false} />
        )))}
        <div className={`bd-reels ${anyWin ? "won" : ""}`}>
          {UI.cellX.map((x, r) => {
            const strip = strips?.[r];
            const wildMult = shown && res ? res.wilds[r] : undefined;
            return (
              <div key={r} className="bd-reel" style={u({ x, y: reelTop, w: UI.boxes.cell.w, h: reelH })}>
                {strip && !stopped[r] ? (
                  <div className="bd-strip run" style={{ ["--n" as string]: strip.length - BANDIT_ROWS, ["--ms" as string]: `${SPIN_MS + r * STOP_GAP}ms` }}>
                    {strip.map((c, i) => <Cell key={i} c={c} />)}
                  </div>
                ) : strip && stopped[r] ? (
                  <div className="bd-strip land">{strip.slice(0, BANDIT_ROWS).map((c, i) => <Cell key={i} c={c} />)}</div>
                ) : (
                  <div className="bd-strip">{cols[r].map((c, i) => <Cell key={i} c={c} lit={lit(r, i)} dim={anyWin && !lit(r, i)} />)}</div>
                )}
              </div>
            );
          })}
          {/* the wild reels: the artist's bandit over the column, «WILD» on his plate, the multiplier over his head */}
          {shown && res && Object.entries(res.wilds).map(([k, m]) => {
            const dx = UI.cellX[Number(k)] - UI.cellX[3];
            const w = UI.boxes.wild, ww = UI.boxes["wild-word"];
            return (
              <div key={k} className="bd-wild" style={u({ ...w, x: w.x + dx })} aria-label={`Дикий барабан ×${m}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={art("wild")} alt="" draggable={false} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="bd-wild-word" style={{ left: `${((ww.x - w.x) / w.w) * 100}%`, top: `${((ww.y - w.y) / w.h) * 100}%`, width: `${(ww.w / w.w) * 100}%` }} src={art("wild-word")} alt="" draggable={false} />
                <b className="bd-wild-x num">×{m}</b>
              </div>
            );
          })}
        </div>
        {shown && res && res.win > 0 && (
          <div className={`bd-win ${res.win >= res.bet * 20 ? "big" : ""}`}>
            {res.win >= res.bet * 20 && <i>БОЛЬШОЙ ВЫИГРЫШ</i>}
            <b className="num">+{fmt(winShown)}</b>
            {res.mult > 1 && <span className="num">×{res.mult}</span>}
          </div>
        )}
        {shown && res && res.free > 0 && <div className="bd-free-got">+{res.free} бесплатных!</div>}

        {/* the panel */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(UI.boxes.panel)} src={art("panel")} alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(UI.boxes["balance-box"])} src={art("balance-box")} alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(UI.boxes["balance-word"])} src={art("balance-word")} alt="Баланс" draggable={false} />
        <b className="bd-val num" style={u(UI.boxes["balance-box"])}><Icon name="RUB" size={18} />{v ? fmt(v.rub) : "…"}</b>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(UI.boxes["bet-box"])} src={art("bet-box")} alt="" draggable={false} />
        <b className={`bd-val num ${free > 0 ? "free" : ""}`} style={u(UI.boxes["bet-box"])}>{shownBet}</b>
        <button type="button" className="bd-btn" style={u(UI.boxes.minus)} disabled={spinning || free > 0 || bet <= BANDIT_BET_MIN} onClick={() => { haptic.tap(); setBet((b) => Math.max(BANDIT_BET_MIN, b - 1)); }} aria-label="Ставка меньше">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art("minus")} alt="" draggable={false} />
        </button>
        <button type="button" className="bd-btn" style={u(UI.boxes.plus)} disabled={spinning || free > 0 || bet >= BANDIT_BET_MAX} onClick={() => { haptic.tap(); setBet((b) => Math.min(BANDIT_BET_MAX, b + 1)); }} aria-label="Ставка больше">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art("plus")} alt="" draggable={false} />
        </button>
        <button type="button" className={`bd-btn bd-spin ${free > 0 ? "free" : ""}`} style={u(UI.boxes.spin)} disabled={spinning || !v} onClick={() => void spin()} aria-label={free > 0 ? `Бесплатный спин, осталось ${free}` : "Крутить"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art("spin")} alt="" draggable={false} />
          {free > 0 && <span className="bd-free num">{free}</span>}
        </button>
        <button type="button" className={`bd-btn bd-auto ${auto ? "on" : ""}`} style={u(UI.boxes.auto)} onClick={toggleAuto} aria-pressed={auto} aria-label={auto ? "Остановить автоигру" : "Автоигра"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art("auto")} alt="" draggable={false} />
        </button>
        {/* the last win: left under the balance */}
        <div className="bd-last" style={u({ x: 138, y: 2470, w: 600, h: 200 })}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic("matchbox" as BanditSym)} alt="" draggable={false} />
          <b className="num">{shown && res ? fmt(winShown) : 0}</b>
        </div>
      </div>
      <Link href="/yard" className="bd-back" aria-label="Назад во двор">‹</Link>
      <button type="button" className="bd-table-btn" onClick={() => { haptic.tap(); setTable(true); }} aria-label="Таблица выплат">?</button>
      {table && <PayTable bet={shownBet} onClose={() => setTable(false)} />}
    </div>
  );
}

function Cell({ c, lit, dim }: { c: BanditCell; lit?: boolean; dim?: boolean }) {
  return (
    <div className={`bd-cell ${lit ? "lit" : ""} ${dim ? "dim" : ""} ${c === "W" ? "w" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {c !== "W" && <img src={pic(c)} alt="" draggable={false} />}
    </div>
  );
}

function PayTable({ bet, onClose }: { bet: number; onClose: () => void }) {
  const r = (x: number) => Math.round(x * 100) / 100;
  const mults = BANDIT_WILD.mult.map(([m]) => `×${m}`).join(", ");
  return (
    <Modal title="Таблица выплат" onClose={onClose}>
      <p className="small" style={{ marginTop: 0 }}>
        Выигрыш по способам: одинаковые символы на соседних барабанах слева направо, в любом месте барабана. Цена × число способов, при ставке <b className="num">{bet}</b>.
      </p>
      <div className="bd-pay">
        {BANDIT_SYMS.filter((s) => s.id !== "bell").map((s) => (
          <div key={s.id} className="bd-pay-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pic(s.id)} alt="" />
            <span className="num">5 — {r(s.pay[2] * BANDIT_SCALE * bet)}<br />4 — {r(s.pay[1] * BANDIT_SCALE * bet)}<br />3 — {r(s.pay[0] * BANDIT_SCALE * bet)}</span>
          </div>
        ))}
      </div>
      <div className="bd-pay-rule">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pic("bell")} alt="" />
        <span className="small">Колокол: 3, 4 или 5 в любом месте — {BANDIT_FREE[3]}, {BANDIT_FREE[4]} или {BANDIT_FREE[5]} бесплатных спинов по той же ставке.</span>
      </div>
      <div className="bd-pay-rule">
        <span className="bd-pay-wild">WILD</span>
        <span className="small">Дикий барабан на 2–4 барабане: заменяет любой символ, кроме колокола. Его множитель ({mults}) умножает весь выигрыш спина; множители на экране складываются.</span>
      </div>
    </Modal>
  );
}
