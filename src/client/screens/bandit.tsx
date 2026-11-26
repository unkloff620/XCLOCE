"use client";
/*
 * «Бандитский фарт» (content/bandit.ts, systems/bandit.ts; the user 2026-11-26): the yard's 5×3 slot machine for
 * roubles, on the artist's layers (the frame one row shorter, the panel up by that row: tools/bandit/build-ui.py). A spin:
 * the reels run down and stop one by one from the left (no bounce), a wild reel stands over its column with its
 * multiplier, the winning cells glow, the win counts up; 3+ bells give free spins; 3+ revolvers open «Русская рулетка»
 * (RouletteWindow). A new level of the machine: «+1» flies up over the level bar.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { usePageReady } from "../route-loader.tsx";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { itemById } from "../../content/items.ts";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { BANDIT_UI as UI } from "../art/bandit-ui-data.ts";
import { HeroRig } from "../art/rig.tsx";
import { BANDIT_CHEST_PRICE, BANDIT_BET_MAX, BANDIT_BET_MIN, BANDIT_FREE, BANDIT_REELS, BANDIT_ROWS, BANDIT_SCATTER, BANDIT_SYMS, BANDIT_WILD, ROULETTE_PAY, ROULETTE_PULLS, type BanditCell, type BanditSpin, type BanditSym } from "../../content/bandit.ts";

const V = "?v=2";
/** the machine's canvas: the artist's 2000×3000 one row (ROW) shorter — the frame of 3 rows, the panel up by ROW */
const ROW = 307, CH = 3000 - ROW;
/** the parts under the reels go up by the row taken out */
const up = (b: { x: number; y: number; w: number; h: number }) => ({ ...b, y: b.y - ROW });
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
/** the blue matchbox: the roulette's win (the spins give the red ones) */
const BLUE = "/assets/bandit/matchbox-blue.webp?v=1";

interface Roulette { left: number; pulls: number; bet: number }
interface View { free: number; freeBet: number; spins: number; won: number; rub: number; xp: number; lvl: { level: number; into: number; need: number }; boxes: number; blue: number; roulette: Roulette | null }
/** the machine's state out of an answer */
const viewOf = (r: View): View => ({ free: r.free, freeBet: r.freeBet, spins: r.spins, won: r.won, rub: r.rub, xp: r.xp, lvl: r.lvl, boxes: r.boxes, blue: r.blue, roulette: r.roulette });
type SpinRes = BanditSpin & View & { bet: number; paid: number; wasFree: boolean; freeLeft: number; levelBefore: number };

export function BanditScreen() {
  const { act, state } = useGame();
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
  const [roul, setRoul] = useState(false);
  const timers = useRef<number[]>([]);

  // an unfinished roulette (the app was closed during it) opens again
  const load = useCallback(() => api.get<View>("/api/bandit").then((x) => { setV(x); if (x.roulette) setRoul(true); }).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { autoRef.current = false; timers.current.forEach(clearTimeout); }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const free = v?.free ?? 0;
  const spin = useCallback(async () => {
    if (spinning) return;
    if (v?.roulette) { setRoul(true); return; }
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
      setV({ ...viewOf(r), free: r.freeLeft });
      if (r.lvl.level > r.levelBefore) { sfx("levelup"); setLvlUp(r.lvl.level - r.levelBefore); later(() => setLvlUp(null), 1600); }
      // 3+ revolvers: the roulette opens a moment later (the auto play stops)
      if (r.roulette) { autoRef.current = false; setAuto(false); later(() => setRoul(true), 900); }
      if (r.win > 0) {
        sfx(r.win >= r.bet * 20 ? "bigwin" : "coin");
        // the win counts up
        const t0 = performance.now(), dur = Math.min(1800, 400 + r.win * 6);
        const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); setWinShown(Math.round(r.win * k)); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }
      setSpinning(false);
      if (autoRef.current && !r.roulette) later(() => { if (autoRef.current) void spinRef.current(); }, r.win > 0 ? 1600 : 700);
    }, end);
  }, [spinning, cols, bet, act, v?.roulette]);
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
    if (c === "revolver") return res.roulette;
    return res.wins.some((w) => w.row === row && r < w.n);
  };
  const anyWin = shown && !!res && (res.wins.length > 0 || res.bells > 0 || res.roulette);
  const shownBet = free > 0 ? v?.freeBet ?? bet : bet;

  const u = (b: { x: number; y: number; w: number; h: number }) => ({ left: `${(b.x / 20).toFixed(3)}%`, top: `${((b.y / CH) * 100).toFixed(3)}%`, width: `${(b.w / 20).toFixed(3)}%`, height: `${((b.h / CH) * 100).toFixed(3)}%` });
  const art = (name: keyof typeof UI.boxes) => `/assets/bandit/ui/${name}.webp${V}`;
  const reelTop = UI.cellY[0], reelH = UI.cellY[BANDIT_ROWS - 1] + UI.boxes.cell.h - UI.cellY[0];

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
        <img className="bd-l" style={u(UI.boxes.frame3)} src={art("frame3")} alt="" draggable={false} />
        {/* the machine's level: 1 experience per rouble bet */}
        {v && (
          <div className="bd-lvl" style={u({ x: 520, y: 590, w: 960, h: 92 })} title={`Опыт: ${fmt(v.xp)}`}>
            <b className="num">Ур. {v.lvl.level}</b>
            <span className="bd-lvl-bar"><i style={{ width: `${v.lvl.need ? (v.lvl.into / v.lvl.need) * 100 : 100}%` }} /></span>
            <small className="num">{v.lvl.need ? `${fmt(v.lvl.into)} / ${fmt(v.lvl.need)}` : "макс."}</small>
            {/* a new level: «+1» flies up over the bar (nothing else moves) */}
            {lvlUp !== null && <i key={v.lvl.level} className="bd-lvlup num">+{lvlUp}</i>}
          </div>
        )}
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
        {/* the horseshoes: the machine's experience */}
        {shown && res && res.xp > 0 && <div className="bd-free-got bd-xp-got">+{fmt(res.xp)} опыта</div>}

        {/* the panel */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(up(UI.boxes.panel))} src={art("panel")} alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(up(UI.boxes["balance-box"]))} src={art("balance-box")} alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(up(UI.boxes["balance-word"]))} src={art("balance-word")} alt="Баланс" draggable={false} />
        <b className="bd-val num" style={u(up(UI.boxes["balance-box"]))}><Icon name="RUB" size={18} />{v ? fmt(v.rub) : "…"}</b>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bd-l" style={u(up(UI.boxes["bet-box"]))} src={art("bet-box")} alt="" draggable={false} />
        <b className={`bd-val num ${free > 0 ? "free" : ""}`} style={u(up(UI.boxes["bet-box"]))}>{shownBet}</b>
        <button type="button" className="bd-btn" style={u(up(UI.boxes.minus))} disabled={spinning || free > 0 || bet <= BANDIT_BET_MIN} onClick={() => { haptic.tap(); setBet((b) => Math.max(BANDIT_BET_MIN, b - 1)); }} aria-label="Ставка меньше">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art("minus")} alt="" draggable={false} />
        </button>
        <button type="button" className="bd-btn" style={u(up(UI.boxes.plus))} disabled={spinning || free > 0 || bet >= BANDIT_BET_MAX} onClick={() => { haptic.tap(); setBet((b) => Math.min(BANDIT_BET_MAX, b + 1)); }} aria-label="Ставка больше">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art("plus")} alt="" draggable={false} />
        </button>
        <button type="button" className={`bd-btn bd-spin ${free > 0 ? "free" : ""}`} style={u(up(UI.boxes.spin))} disabled={spinning || !v} onClick={() => void spin()} aria-label={free > 0 ? `Бесплатный спин, осталось ${free}` : "Крутить"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art("spin")} alt="" draggable={false} />
          {free > 0 && <span className="bd-free num">{free}</span>}
        </button>
        <button type="button" className={`bd-btn bd-auto ${auto ? "on" : ""}`} style={u(up(UI.boxes.auto))} onClick={toggleAuto} aria-pressed={auto} aria-label={auto ? "Остановить автоигру" : "Автоигра"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art("auto")} alt="" draggable={false} />
        </button>
        {/* the last win: left under the balance */}
        <div className="bd-last" style={u(up({ x: 138, y: 2470, w: 600, h: 200 }))}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic("matchbox" as BanditSym)} alt="" draggable={false} />
          <b className="num">{v ? fmt(v.boxes) : 0}</b>
          {shown && res && res.win > 0 && <i className="bd-last-plus num">+{fmt(winShown)}</i>}
          {/* the roulette's blue boxes */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {!!v?.blue && <><img src={BLUE} alt="синих коробков" draggable={false} /><b className="num">{fmt(v.blue)}</b></>}
        </div>
      </div>
      <Link href="/yard" className="bd-back" aria-label="Назад во двор">‹</Link>
      <button type="button" className="bd-table-btn" onClick={() => { haptic.tap(); setTable(true); }} aria-label="Таблица выплат">?</button>
      {chest && v && <ChestWindow v={v} onClose={() => setChest(false)} onView={setV} />}
      {roul && v?.roulette && <RouletteWindow r={v.roulette} look={state?.look.body} onView={setV} onClose={() => setRoul(false)} />}
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

/** the chest: the machine's level, and a tattoo piece for BANDIT_CHEST_PRICE matchboxes */
function ChestWindow({ v, onClose, onView }: { v: View; onClose: () => void; onView: (v: View) => void }) {
  const { act, busy } = useGame();
  const [got, setGot] = useState<string | null>(null);
  const open = async () => {
    haptic.tap();
    const r = await act<View & { tattoo: string }>("bandit_chest", {});
    if (!r) return;
    sfx("casedrop");
    setGot(r.tattoo);
    onView(viewOf(r));
  };
  return (
    <Modal title="Сундук" onClose={onClose}>
      <div className="bd-chest-in">
        {got ? (
          <div className="bd-chest-got">
            <ItemArt id={got} size={96} />
            <b>{itemById(got)?.name ?? "Наколка"}</b>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/assets/bandit/ui/chest.webp${V}`} alt="" draggable={false} />
        )}
        <span className="bd-chest-boxes num">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic("matchbox" as BanditSym)} alt="коробков" /> {fmt(v.boxes)}
        </span>
        <button type="button" className="btn gold block" disabled={v.boxes < BANDIT_CHEST_PRICE || !!busy} onClick={() => void open()}>
          Открыть за {fmt(BANDIT_CHEST_PRICE)}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bd-chest-btn-box" src={pic("matchbox" as BanditSym)} alt="коробков" />
        </button>
        <b className="num">Уровень автомата {v.lvl.level}</b>
        <span className="bd-lvl-bar"><i style={{ width: `${v.lvl.need ? (v.lvl.into / v.lvl.need) * 100 : 100}%` }} /></span>
        <span className="small num">{v.lvl.need ? `${fmt(v.lvl.into)} / ${fmt(v.lvl.need)} опыта` : "Максимальный уровень"}</span>
      </div>
    </Modal>
  );
}

/** the rules and prices in the old machine's manner: the special symbols with their words on the left, the prices on the right */
function PayTable({ bet, onClose }: { bet: number; onClose: () => void }) {
  const mults = BANDIT_WILD.mult.map(([m]) => `×${m}`).join(", ");
  const money = BANDIT_SYMS.find((s) => s.id === "money")!;
  const bell = BANDIT_SYMS.find((s) => s.id === "bell")!;
  const box = (n: number) => <span className="num bd-pay-n">{fmt(n * bet)}<img src={pic("matchbox" as BanditSym)} alt="коробков" /></span>;
  const xp = (n: number) => <span className="num bd-pay-n">{fmt(n)} опыта</span>;
  return (
    <Modal title="Таблица выплат" onClose={onClose} wide className="bd-paywin">
      <ul className="bd-rules small">
        <li>Выигрыш считается от левого края, от двух одинаковых подряд.</li>
        <li>Игра идёт по 3 линиям — по каждому ряду.</li>
        <li>Выигрыш каждой линии умножается на ставку ({bet}).</li>
        <li>Выигрыш — коробки спичек: за {BANDIT_CHEST_PRICE} коробков сундук даёт наколку. Каждый поставленный рубль — 1 опыт автомата.</li>
      </ul>
      <div className="bd-paygrid">
        <div className="bd-pay-big">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic("money")} alt="" />
          <div><b>Куш</b><span className="small">Собери пять пачек денег на линии и сорви куш!</span><span>5 — {box(money.pay[3])}</span></div>
        </div>
        <div className="bd-pay-big">
          <span className="bd-pay-wild">WILD</span>
          <div><b>Бандит</b><span className="small">Падает на 2–4 барабан во всю высоту и заменяет любой символ, кроме колокола и револьвера. Его множитель ({mults}) умножает весь выигрыш спина.</span></div>
        </div>
        <div className="bd-pay-big">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic("revolver")} alt="" />
          <div><b>Русская рулетка</b><span className="small">3 револьвера в любом месте — бонусная игра: {ROULETTE_PULLS} пули, каждая заряжается в барабан на шесть гнёзд и барабан крутится. Щелчок — {fmt(ROULETTE_PAY * bet)} синих коробков, выстрел — игра окончена.</span></div>
        </div>
        <div className="bd-pay-big">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic("bell")} alt="" />
          <div><b>Колокол</b><span className="small">3, 4 или 5 колоколов в любом месте — {BANDIT_FREE[3]}, {BANDIT_FREE[4]} или {BANDIT_FREE[5]} бесплатных спинов по текущей ставке и {box(bell.pay[1])} / {box(bell.pay[2])} / {box(bell.pay[3])}.</span></div>
        </div>
        {BANDIT_SYMS.filter((s) => !BANDIT_SCATTER.includes(s.id) && s.id !== "money").map((s) => (
          <div key={s.id} className="bd-pay-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pic(s.id)} alt={s.name} />
            {s.xp ? (
              <span><i>5</i> — {xp(s.xp[3])}<br /><i>4</i> — {xp(s.xp[2])}<br /><i>3</i> — {xp(s.xp[1])}</span>
            ) : (
              <span><i>5</i> — {box(s.pay[3])}<br /><i>4</i> — {box(s.pay[2])}<br /><i>3</i> — {box(s.pay[1])}<br /><i>2</i> — {box(s.pay[0])}</span>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/**
 * «Русская рулетка» (3+ revolvers; the user 2026-11-26): the player's hero sits with his back to us on the stool in a dark
 * backroom; ROULETTE_PULLS bullets lie top left. A tap: the revolver (the artist's, seen from behind) rises from below to
 * the back of his head, the drum swings out, a bullet flies into a chamber (its place top left goes to a shadow), the drum
 * swings back and spins for 2 s, stops — and the trigger: a click (+ROULETTE_PAY × the bet boxes, the revolver goes down)
 * or the shot (a flash, the game is over). The server decides the pull at the tap; the window only plays it out.
 */
const R = "/assets/bandit/roulette";
/** the timeline of a pull (ms from the tap) */
const RT = { rise: 0, open: 800, load: 1250, close: 1800, spin: 2150, fire: 4150, lower: 5000 };
type Phase = "idle" | "rise" | "open" | "load" | "close" | "spin" | "fire" | "lower";
function RouletteWindow({ r, look, onView, onClose }: { r: Roulette; look?: Parameters<typeof HeroRig>[0]["look"]; onView: (v: View) => void; onClose: () => void }) {
  const { act, busy } = useGame();
  const [used, setUsed] = useState(r.pulls);
  const [got, setGot] = useState(r.pulls * ROULETTE_PAY * r.bet);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<"click" | "bang" | null>(null);
  const [over, setOver] = useState<"bang" | "max" | null>(null);
  const [turn, setTurn] = useState(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  const playing = phase !== "idle";
  const pull = async () => {
    if (busy || over || playing) return;
    haptic.tap();
    setResult(null);
    setPhase("rise");
    const res = await act<View & { shot: boolean; got: number; stopped: boolean }>("bandit_pull", {});
    if (!res) { setPhase("idle"); return; }
    at(RT.open, () => setPhase("open"));
    at(RT.load, () => { setPhase("load"); setUsed((u) => u + 1); sfx("tap", 0.3); });
    at(RT.close, () => setPhase("close"));
    // the drum spins 2 s and stops on a chamber (a whole number of turns and a sixth)
    at(RT.spin, () => { setPhase("spin"); setTurn((t) => t + 360 * 5 + 60 * (1 + Math.floor(Math.random() * 6))); sfx("spin", 0.3); });
    at(RT.fire, () => {
      setPhase("fire");
      setResult(res.shot ? "bang" : "click");
      onView(viewOf(res));
      if (res.shot) { sfx("hit"); haptic.tap(); setOver("bang"); }
      else { sfx("tap"); setGot((g) => g + res.got); if (!res.roulette) setOver("max"); }
    });
    if (!res.shot) at(RT.lower, () => setPhase("lower"));
    at(res.shot ? RT.fire + 1200 : RT.lower + 650, () => setPhase("idle"));
  };
  const stop = async () => {
    if (busy || playing) return;
    haptic.tap();
    const res = await act<View>("bandit_pull", { stop: true });
    if (res) onView(viewOf(res));
    onClose();
  };
  const left = ROULETTE_PULLS - used;
  // over the whole app (the machine's screen is a size container: a fixed child would be caught in it)
  return createPortal(
    <div className="bd-roul" role="dialog" aria-label="Русская рулетка">
      <div className={`bd-roul-scene ${result === "bang" && phase === "fire" ? "bang" : ""}`} data-phase={phase}>
        <b className="bd-roul-title">Русская рулетка</b>
        {/* the bullets left: a fired one leaves its shadow */}
        <div className="bd-roul-ammo">
          {Array.from({ length: ROULETTE_PULLS }, (_, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} className={i < used ? "gone" : ""} src={`${R}/bullet.webp${V}`} alt="" draggable={false} />
          ))}
        </div>
        <button type="button" className="bd-roul-hero" disabled={!!busy || !!over || playing} onClick={() => void pull()} aria-label="Приставить револьвер и нажать на спуск">
          <HeroRig size={360} back look={look} />
          {/* the revolver: from below to the back of the head; the drum (with the bullet in it) swings out of it, spins */}
          <span className="bd-roul-gun">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bd-roul-gun-body" src={`${R}/gun.webp${V}`} alt="" draggable={false} />
            <span className="bd-roul-drum-w"><span className="bd-roul-drum" style={{ ["--turn" as string]: `${turn}deg` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${R}/drum.webp${V}`} alt="" draggable={false} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="bd-roul-round" src={`${R}/round.webp${V}`} alt="" draggable={false} />
            </span></span>
            <i className="bd-roul-flash" />
          </span>
        </button>
        {result === "click" && phase !== "idle" && <i className="bd-roul-click">ЩЁЛК!</i>}
        {result === "bang" && <i className="bd-roul-bang">БАХ!</i>}
        {phase === "idle" && !over && <i className="bd-roul-hint">Жми на персонажа</i>}
      </div>
      <div className="bd-roul-panel">
        <span className="bd-roul-got num">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BLUE} alt="синих коробков" /> {fmt(got)}
        </span>
        {over && !playing ? (
          <>
            <b className="bd-roul-end">{over === "bang" ? "Выстрел! Игра окончена" : `Все ${ROULETTE_PULLS} пули — мимо, повезло!`}</b>
            <button type="button" className="btn gold block" onClick={onClose}>Дальше</button>
          </>
        ) : (
          <>
            <span className="small">Пуль осталось: <b className="num">{left}</b> · щелчок — +{fmt(ROULETTE_PAY * r.bet)}</span>
            <button type="button" className="btn block" disabled={!!busy || playing || !!over} onClick={() => void stop()}>{used > 0 ? "Забрать и уйти" : "Уйти"}</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
