"use client";
/*
 * «Бандитский фарт» (content/bandit.ts, systems/bandit.ts; the user 2026-11-26): the yard's 5×4 slot machine for
 * roubles. The frame, the panel and the wild reel are drawn in code for now — the artist's frame, background, bandit and
 * buttons take their places later. A spin: the reels run down and stop one by one from the left with a bounce, a wild
 * reel opens over its column with its multiplier, the winning cells glow, the win counts up; 3+ bells give free spins.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { usePageReady } from "../route-loader.tsx";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { BANDIT_UI as UI } from "../art/bandit-ui-data.ts";
import { BANDIT_BET_MAX, BANDIT_BET_MIN, BANDIT_FREE, BANDIT_REELS, BANDIT_ROWS, BANDIT_SYMS, BANDIT_WILD, type BanditCell, type BanditSpin, type BanditSym } from "../../content/bandit.ts";

const V = "?v=1";
const pic = (s: BanditSym) => `/assets/bandit/${s}.webp${V}`;
const SYMS = BANDIT_SYMS.map((s) => s.id);
const randSym = (): BanditSym => SYMS[Math.floor(Math.random() * SYMS.length)];
const randCol = (): BanditCell[] => Array.from({ length: BANDIT_ROWS }, randSym);
/** the endless run while the server answers: so many cells, one loop in LOOP_MS */
const LOOP = 12, LOOP_MS = 380;
/** the last run onto the result: so many cells before it, in STOP_MS; the first reel stops no sooner than MIN_RUN after
 *  the tap, each next one STOP_GAP later */
const TAIL = 8, STOP_MS = 520, MIN_RUN = 650, STOP_GAP = 230;
const fmt = (n: number) => n.toLocaleString("ru-RU");

interface View { free: number; freeBet: number; spins: number; won: number; rub: number; xp: number; lvl: { level: number; into: number; need: number } }
type SpinRes = BanditSpin & View & { bet: number; paid: number; wasFree: boolean; freeLeft: number; levelBefore: number };

export function BanditScreen() {
  const { act } = useGame();
  const [v, setV] = useState<View | null>(null);
  usePageReady(!!v);
  const [bet, setBet] = useState(1);
  const [cols, setCols] = useState<BanditCell[][]>(() => Array.from({ length: BANDIT_REELS }, randCol));
  /** each reel: still (its 4 cells), running endlessly, or running down onto its result (the result on top of the strip) */
  const [mode, setMode] = useState<("idle" | "loop" | "stop")[]>(Array(BANDIT_REELS).fill("idle"));
  const [strips, setStrips] = useState<BanditCell[][]>(() => Array.from({ length: BANDIT_REELS }, () => []));
  const [res, setRes] = useState<SpinRes | null>(null);
  const [shown, setShown] = useState(false);
  const [winShown, setWinShown] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [auto, setAuto] = useState(false);
  const autoRef = useRef(false);
  const [table, setTable] = useState(false);
  const [lvlUp, setLvlUp] = useState<number | null>(null);
  const [chest, setChest] = useState(false);
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
    // the reels start running at once, endlessly, until the answer is here
    const t0 = performance.now();
    setStrips(Array.from({ length: BANDIT_REELS }, () => Array.from({ length: LOOP }, randSym)));
    setMode(Array(BANDIT_REELS).fill("loop"));
    sfx("spin");
    const r = await act<SpinRes>("bandit_spin", { bet });
    if (!r) { setMode(Array(BANDIT_REELS).fill("idle")); setSpinning(false); autoRef.current = false; setAuto(false); return; }
    // then each reel runs down onto its result (a wild reel falls in as one tall bandit), one after another from the left
    const wait = Math.max(0, MIN_RUN - (performance.now() - t0));
    for (let i = 0; i < BANDIT_REELS; i++) {
      later(() => {
        setStrips((st) => st.map((x, j) => (j === i ? [...r.reels[i], ...Array.from({ length: TAIL }, randSym)] : x)));
        setMode((m) => m.map((x, j) => (j === i ? "stop" : x)));
      }, wait + i * STOP_GAP);
      later(() => { setCols((c) => c.map((x, j) => (j === i ? r.reels[i] : x))); setMode((m) => m.map((x, j) => (j === i ? "idle" : x))); sfx("tap", 0.25); }, wait + i * STOP_GAP + STOP_MS);
    }
    const end = wait + (BANDIT_REELS - 1) * STOP_GAP + STOP_MS + 250;
    later(() => {
      setRes(r); setShown(true);
      setV({ free: r.freeLeft, freeBet: r.freeBet, spins: r.spins, won: r.won, rub: r.rub, xp: r.xp, lvl: r.lvl });
      if (r.lvl.level > r.levelBefore) { sfx("levelup"); setLvlUp(r.lvl.level); later(() => setLvlUp(null), 2600); }
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
    return res.wins.some((w) => w.row === row && r < w.n);
  };
  const anyWin = shown && !!res && (res.wins.length > 0 || res.bells > 0);
  const shownBet = free > 0 ? v?.freeBet ?? bet : bet;

  const u = (b: { x: number; y: number; w: number; h: number }) => ({ left: `${(b.x / 20).toFixed(3)}%`, top: `${(b.y / 30).toFixed(3)}%`, width: `${(b.w / 20).toFixed(3)}%`, height: `${(b.h / 30).toFixed(3)}%` });
  const art = (name: keyof typeof UI.boxes) => `/assets/bandit/ui/${name}.webp${V}`;
  const reelTop = UI.cellY[0], reelH = UI.cellY[3] + UI.boxes.cell.h - UI.cellY[0];

  return (
    <div className="bd-screen" style={{ ["--bd-bg" as string]: `url(/assets/bandit/ui/bg.webp${V})` }}>
      <div className="bd-stage">
        {/* the artist's machine on its 2000×3000 canvas */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u({ ...UI.boxes.title, y: UI.boxes.title.y - 150 })} src={art("title")} alt="Бандитский фарт" draggable={false} />
        {/* the chest up on the left: the machine's level */}
        <button type="button" className="bd-btn bd-chest" style={u({ x: 40, y: 400, w: 330, h: 248 })} onClick={() => { haptic.tap(); setChest(true); }} aria-label="Сундук автомата">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/bandit/ui/chest.webp${V}`} alt="" draggable={false} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(UI.boxes.frame)} src={art("frame")} alt="" draggable={false} />
        {/* the machine's level: 1 experience per rouble bet */}
        {v && (
          <div className="bd-lvl" style={u({ x: 520, y: 590, w: 960, h: 92 })} title={`Опыт: ${fmt(v.xp)}`}>
            <b className="num">Ур. {v.lvl.level}</b>
            <span className="bd-lvl-bar"><i style={{ width: `${v.lvl.need ? (v.lvl.into / v.lvl.need) * 100 : 100}%` }} /></span>
            <small className="num">{v.lvl.need ? `${fmt(v.lvl.into)} / ${fmt(v.lvl.need)}` : "макс."}</small>
          </div>
        )}
        {lvlUp !== null && <div className="bd-lvlup">Новый уровень автомата: <b className="num">{lvlUp}</b></div>}
        <div className={`bd-reels ${anyWin ? "won" : ""}`}>
          {UI.cellX.map((x, r) => (
            <div key={r} className="bd-reel" style={u({ x, y: reelTop, w: UI.boxes.cell.w, h: reelH })}>
              {mode[r] === "loop" ? (
                <div className="bd-strip loop" style={{ ["--n" as string]: LOOP, ["--ms" as string]: `${LOOP_MS}ms` }}>
                  {[...strips[r], ...strips[r]].map((c, i) => <Cell key={i} c={c} />)}
                </div>
              ) : mode[r] === "stop" ? (
                <div className="bd-strip stop" style={{ ["--n" as string]: TAIL, ["--ms" as string]: `${STOP_MS}ms` }}>
                  <Strip cells={strips[r]} />
                </div>
              ) : (
                <div className="bd-strip land">
                  <Strip cells={cols[r]} lit={(i) => lit(r, i)} dim={(i) => anyWin && !lit(r, i)} mult={shown && res ? res.wilds[r] : undefined} />
                </div>
              )}
            </div>
          ))}
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
      {chest && v && (
        <Modal title="Сундук автомата" onClose={() => setChest(false)}>
          <div className="bd-chest-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/assets/bandit/ui/chest.webp${V}`} alt="" draggable={false} />
            <b className="num">Уровень {v.lvl.level}</b>
            <span className="bd-lvl-bar"><i style={{ width: `${v.lvl.need ? (v.lvl.into / v.lvl.need) * 100 : 100}%` }} /></span>
            <span className="small num">{v.lvl.need ? `${fmt(v.lvl.into)} / ${fmt(v.lvl.need)} опыта` : "Максимальный уровень"}</span>
          </div>
        </Modal>
      )}
      {table && <PayTable bet={shownBet} onClose={() => setTable(false)} />}
    </div>
  );
}

/** a reel's cells; four «W» in a row are the one tall wild bandit (it falls in with the reel), its multiplier over his head */
function Strip({ cells, lit, dim, mult }: { cells: BanditCell[]; lit?: (i: number) => boolean; dim?: (i: number) => boolean; mult?: number }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === "W" && cells.slice(i, i + BANDIT_ROWS).every((c) => c === "W")) {
      out.push(<Wild key={i} mult={mult} />);
      i += BANDIT_ROWS - 1;
    } else out.push(<Cell key={i} c={cells[i]} lit={lit?.(i)} dim={dim?.(i)} />);
  }
  return <>{out}</>;
}

function Wild({ mult }: { mult?: number }) {
  const w = UI.boxes.wild, ww = UI.boxes["wild-word"];
  return (
    <div className="bd-wild" aria-label={mult ? `Дикий барабан ×${mult}` : "Дикий барабан"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/assets/bandit/ui/wild.webp${V}`} alt="" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bd-wild-word" style={{ left: `${((ww.x - w.x) / w.w) * 100}%`, top: `${((ww.y - w.y) / w.h) * 100}%`, width: `${(ww.w / w.w) * 100}%` }} src={`/assets/bandit/ui/wild-word.webp${V}`} alt="" draggable={false} />
      {mult !== undefined && <b className="bd-wild-x num">×{mult}</b>}
    </div>
  );
}

function Cell({ c, lit, dim }: { c: BanditCell; lit?: boolean; dim?: boolean }) {
  return (
    <div className={`bd-cell ${lit ? "lit" : ""} ${dim ? "dim" : ""}`} style={{ backgroundImage: `url(/assets/bandit/ui/cell.webp${V})` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {c !== "W" && <img src={pic(c)} alt="" draggable={false} />}
    </div>
  );
}

/** the rules and prices in the old machine's manner: the special symbols with their words on the left, the prices on the right */
function PayTable({ bet, onClose }: { bet: number; onClose: () => void }) {
  const mults = BANDIT_WILD.mult.map(([m]) => `×${m}`).join(", ");
  const money = BANDIT_SYMS.find((s) => s.id === "money")!;
  const bell = BANDIT_SYMS.find((s) => s.id === "bell")!;
  const box = (n: number) => <span className="num bd-pay-n">{fmt(n * bet)}<img src={pic("matchbox" as BanditSym)} alt="коробков" /></span>;
  return (
    <Modal title="Таблица выплат" onClose={onClose} wide className="bd-paywin">
      <ul className="bd-rules small">
        <li>Выигрыш считается от левого края.</li>
        <li>Игра идёт по 4 линиям — по каждому ряду.</li>
        <li>Выигрыш каждой линии умножается на ставку ({bet}). 1 коробок = 1 рубль.</li>
        <li>Каждый поставленный рубль — 1 опыт автомата.</li>
      </ul>
      <div className="bd-paygrid">
        <div className="bd-pay-big">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic("money")} alt="" />
          <div><b>Куш</b><span className="small">Собери пять пачек денег на линии и сорви куш!</span><span>5 — {box(money.pay[2])}</span></div>
        </div>
        <div className="bd-pay-big">
          <span className="bd-pay-wild">WILD</span>
          <div><b>Бандит</b><span className="small">Падает на 2–4 барабан во всю высоту и заменяет любой символ, кроме колокола. Его множитель ({mults}) умножает весь выигрыш спина.</span></div>
        </div>
        <div className="bd-pay-big">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic("bell")} alt="" />
          <div><b>Колокол</b><span className="small">3, 4 или 5 колоколов в любом месте — {BANDIT_FREE[3]}, {BANDIT_FREE[4]} или {BANDIT_FREE[5]} бесплатных спинов по текущей ставке и {fmt(bell.pay[0] * bet)} / {fmt(bell.pay[1] * bet)} / {fmt(bell.pay[2] * bet)} коробков.</span></div>
        </div>
        {BANDIT_SYMS.filter((s) => s.id !== "bell" && s.id !== "money").map((s) => (
          <div key={s.id} className="bd-pay-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pic(s.id)} alt={s.name} />
            <span><i>5</i> — {box(s.pay[2])}<br /><i>4</i> — {box(s.pay[1])}<br /><i>3</i> — {box(s.pay[0])}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
