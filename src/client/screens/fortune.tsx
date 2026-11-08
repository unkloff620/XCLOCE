"use client";
/*
 * «Колесо удачи» (content/fortune.ts): a manhole wheel on the asphalt of the back yard. Above — the jackpot in a chalk
 * frame and the last player who took it; on the left — the wheel's level; the chalk arrow at the top shows the sector
 * fallen. Below — the tickets (with «+» to buy), the keycaps, «Крутить» and «Крутить на все».
 * The server picks the sector; the wheel only turns to it (a few full turns, slowing down).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { api, type Granted } from "../api.ts";
import { usePageReady } from "../route-loader.tsx";
import { Avatar, Modal } from "../ui.tsx";
import { Help } from "../help.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { KEYCAP_ID, SECTORS, TICKET_ID, WHEEL_R, spokeBend, type CupKind, type Sector } from "../../content/fortune.ts";

const A = "/assets/fortune";
const WHEEL_IMG = `${A}/wheel-v2.webp`;
const PRIZE_IMG = `${A}/prize.webp?v=2`;
const N = SECTORS.length;
const STEP = 360 / N;
/** one turn of the wheel; the pause between the turns of «Крутить на все»; the shuffle of the cups */
const SPIN_MS = 1000;
const PAUSE_MS = 350;
const CUPS_SHUFFLE_MS = 2000;

interface FortuneView {
  jackpot: number; spins: number;
  winner: { id: number; name: string; photo: string | null; amount: number; at: number } | null;
  xp: number; level: number; into: number; need: number; cups: number; cupsLayout: unknown[] | null;
  tickets: number; keycaps: number; price: number; add: number;
}
interface SpinResult { spins: number; hits: number[]; last: number; sector: string; reward: Granted | null; xp: number; cups: number; empty: number; fortune: FortuneView }

/** the middle of sector k at the share t of the way from the hub to the rim (deg, 0 = right, clockwise) */
function sectorAngle(k: number, t: number) {
  return -90 + k * STEP + STEP / 2 + spokeBend(t);
}
/** a point at the share t between the hub and the rim, in % of the wheel */
function at(k: number, t: number) {
  const r = (WHEEL_R.hub + (WHEEL_R.rim - WHEEL_R.hub) * t) * 50;
  const a = (sectorAngle(k, t) * Math.PI) / 180;
  return { left: `${50 + r * Math.cos(a)}%`, top: `${50 + r * Math.sin(a)}%`, a: sectorAngle(k, t) };
}

function SectorIcon({ s, size }: { s: Sector; size: number }) {
  if (s.icon === "RUB" || s.icon === "USD") return <Icon name={s.icon} size={size} />;
  // eslint-disable-next-line @next/next/no-img-element
  if (s.icon === "fortune-xp") return <img src={`${A}/xp.webp`} alt="" width={size} height={size} draggable={false} />;
  return <ItemArt id={s.icon} size={size} />;
}

function WheelFace() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="fo-wheel-pic" src={WHEEL_IMG} alt="" draggable={false} />
      {SECTORS.map((s, k) => {
        if (s.kind === "empty") return null;
        if (s.kind === "prize") {
          const p = at(k, 0.5);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s.id} className="fo-prize" src={PRIZE_IMG} alt="ПРИЗ" draggable={false} style={{ left: p.left, top: p.top, transform: `translate(-50%, -50%) rotate(${p.a}deg)` }} />
          );
        }
        const ic = at(k, 0.72), lb = at(k, 0.3);
        return (
          <span key={s.id}>
            <span className="fo-ic" style={{ left: ic.left, top: ic.top, transform: `translate(-50%, -50%) rotate(${ic.a + 90}deg)` }}><SectorIcon s={s} size={40} /></span>
            {s.label && <span className="fo-lb num" style={{ left: lb.left, top: lb.top, transform: `translate(-50%, -50%) rotate(${lb.a}deg)` }}>{s.label}</span>}
          </span>
        );
      })}
    </>
  );
}

export function FortuneScreen() {
  const { act, busy } = useGame();
  const [f, setF] = useState<FortuneView | null>(null);
  usePageReady(!!f);
  const [turn, setTurn] = useState(0);
  const [spinning, setSpinning] = useState(false);
  // «Крутить на все»: the wheel turns by itself, one ticket after another, until they run out (or «ПРИЗ», or «Стоп»)
  const [auto, setAuto] = useState(false);
  const [running, setRunning] = useState(false);
  const runRef = useRef(false);
  const [buy, setBuy] = useState(false);
  const [cups, setCups] = useState(false);
  const [bag, setBag] = useState(false);
  const timer = useRef<number | null>(null);
  // the tickets and keycaps change at once; the jackpot and the level — when the wheel stops
  const [stock, setStock] = useState<{ tickets: number; keycaps: number } | null>(null);

  const load = useCallback(() => api.get<FortuneView>("/api/fortune").then((v) => { setF(v); setStock(null); }).catch(() => {}), []);
  useEffect(() => { void load(); const t = window.setInterval(() => document.visibilityState === "visible" && !runRef.current && load(), 20_000); return () => clearInterval(t); }, [load]);
  useEffect(() => () => { runRef.current = false; if (timer.current) clearTimeout(timer.current); }, []);

  const tickets = stock?.tickets ?? f?.tickets ?? 0;
  const keycaps = stock?.keycaps ?? f?.keycaps ?? 0;
  const stop = () => { runRef.current = false; setRunning(false); };

  const spinOnce = async (): Promise<void> => {
    setSpinning(true);
    const r = await act<SpinResult>("fortune_spin", {});
    if (!r) { setSpinning(false); stop(); return; }
    setStock({ tickets: r.fortune.tickets, keycaps: stock?.keycaps ?? f?.keycaps ?? r.fortune.keycaps });
    // turn to the sector fallen: two full turns more, a little off its middle (where the arrow meets it, near the rim)
    const jitter = (Math.random() - 0.5) * STEP * 0.55;
    const target = -(sectorAngle(r.last, 0.92) + 90) + jitter;
    setTurn((cur) => {
      const base = cur - (((cur % 360) + 360) % 360);
      let next = base + 360 * 2 + (((target % 360) + 360) % 360);
      if (next - cur < 360 * 1.5) next += 360;
      return next;
    });
    sfx("tap");
    await new Promise<void>((res) => { timer.current = window.setTimeout(res, SPIN_MS); });
    setSpinning(false);
    setF(r.fortune);
    setStock(null);
    const s = SECTORS[r.last];
    if (s.kind === "prize") { haptic.big(); sfx("win"); stop(); setCups(true); return; }
    if (s.kind === "empty") haptic.tap(); else { haptic.ok(); sfx("coin"); }
    if (runRef.current && r.fortune.tickets > 0) {
      await new Promise<void>((res) => { timer.current = window.setTimeout(res, PAUSE_MS); });
      if (runRef.current) return spinOnce();
    }
    stop();
  };

  const go = () => {
    if (running) { stop(); return; }
    if (spinning) return;
    if (tickets < 1) { setBuy(true); return; }
    haptic.tap();
    runRef.current = auto;
    setRunning(auto);
    void spinOnce();
  };

  const lvlShare = f ? f.into / f.need : 0;
  const cupsWaiting = (f?.cups ?? 0) + (f?.cupsLayout ? 1 : 0);

  return (
    <div className="fit-page fo-page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="fo-bg" src={`${A}/bg.webp`} alt="" draggable={false} />
      <div className="fo-top">
        <div className="title-row">
          <Link href="/yard" className="back-btn" aria-label="Во двор">‹</Link>
          <span className="grow" />
          <FortuneHelp />
        </div>
        {/* left: who took the jackpot last; right: the jackpot itself, written in chalk on the asphalt */}
        <div className="fo-head">
          {f?.winner ? (
            <Link href={`/profile?id=${f.winner.id}`} className="fo-winner">
              <Avatar name={f.winner.name} photo={f.winner.photo} size={40} />
              <span className="fo-winner-n">{f.winner.name}</span>
              <span className="fo-winner-s">сорвал куш</span>
              <b className="fo-chalk num">{f.winner.amount.toLocaleString("ru-RU")} <Icon name="RUB" size={15} /></b>
            </Link>
          ) : <span className="fo-winner fo-winner-none">Куш ещё никто<br />не сорвал</span>}
          <div className="fo-jack">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="fo-jack-t" src={`${A}/jackpot-title.webp`} alt="Джекпот" draggable={false} />
            <b className="fo-jack-v fo-chalk num"><Icon name="RUB" size={22} />{f ? f.jackpot.toLocaleString("ru-RU") : "…"}</b>
          </div>
        </div>
      </div>

      {/* the wheel's level: a chalk bar on the left */}
      <div className="fo-level" title={f ? `Опыт колеса: ${f.into}/${f.need}` : undefined}>
        <b className="num">{f?.level ?? 1}<small>ур.</small></b>
        <span className="fo-level-bar"><i style={{ height: `${Math.round(lvlShare * 100)}%` }} /></span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${A}/xp.webp`} alt="" width={22} height={22} />
      </div>

      <div className="fo-stage">
        <svg className="fo-arrow" viewBox="0 0 60 70" aria-hidden="true">
          <path d="M8 6 C 20 12, 40 10, 52 5 L 34 58 C 32 64, 28 64, 26 58 Z" />
        </svg>
        <div className="fo-wheel" style={{ transform: `rotate(${turn}deg)`, transitionDuration: spinning ? `${SPIN_MS}ms` : "0ms" }}>
          <WheelFace />
        </div>
      </div>

      {/* the bag: the boxes of tattoo sets for keycaps */}
      <button type="button" className="fo-bag" onClick={() => setBag(true)} aria-label="Сумка">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${A}/bag.webp`} alt="" draggable={false} />
      </button>

      <div className="fo-bottom">
        {cupsWaiting > 0 && !cups && (
          <button type="button" className="fo-cups" onClick={() => { stop(); setCups(true); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PRIZE_IMG} alt="" /> Чашки ждут{cupsWaiting > 1 ? <>: <b className="num">{cupsWaiting}</b></> : null} — открыть
          </button>
        )}
        <div className="fo-row">
          <div className="fo-stock">
            <span className="fo-chip" title="Билеты"><ItemArt id={TICKET_ID} size={22} /><b className="num">{tickets}</b>
              <button type="button" className="fo-plus" onClick={() => setBuy(true)} aria-label="Купить билеты">+</button></span>
            <span className="fo-chip" title="Кнопки клавиатуры"><ItemArt id={KEYCAP_ID} size={22} /><b className="num">{keycaps.toLocaleString("ru-RU")}</b></span>
          </div>
          <div className="fo-go">
            <button type="button" className={`fo-spin ${running ? "stop" : ""}`} disabled={!running && (spinning || busy === "fortune_spin")} onClick={go}>
              <b>{running ? "Стоп" : tickets < 1 ? "Купить билет" : "Крутить"}</b>
              {!running && <span className="num"><ItemArt id={TICKET_ID} size={16} />{auto ? tickets || 1 : 1}</span>}
            </button>
            <label className="fo-all"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (!e.target.checked) stop(); }} /> Крутить на все</label>
          </div>
        </div>
      </div>

      {buy && f && <BuyTickets price={f.price} onClose={() => setBuy(false)} onDone={() => { void load(); }} />}
      {bag && (
        <Modal onClose={() => setBag(false)} title="Сумка">
          <div className="fo-res">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${A}/bag.webp`} alt="" width={120} />
            <p className="small">Здесь будут 4 коробки с сетами наколок — открываются за кнопки клавиатуры (140, 300, 600 и 1200). Копи кнопки!</p>
            <button className="btn gold block" onClick={() => setBag(false)}>Ок</button>
          </div>
        </Modal>
      )}
      {cups && <CupsGame onClose={() => { setCups(false); void load(); }} />}
    </div>
  );
}

/* ---------------- «ПРИЗ»: the cups ---------------- */
type CupView = { kind: CupKind; reward?: { currencies?: Partial<Record<"RUB" | "USD", number>>; items?: { id: string; qty: number }[]; achPoints?: number } };
interface CupsStart { layout: CupView[] }
interface CupsPick { index: number; kind: CupKind; final: CupView[]; reward: Granted | null; jackpot: number }

function CupPrize({ c, jackpot }: { c: CupView; jackpot?: number }) {
  const r = c.reward;
  const it = r?.items?.[0];
  return (
    <span className={`fo-cup-prize k-${c.kind}`}>
      {c.kind === "jackpot" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <><img src={`${A}/jackpot.webp`} alt="" /><b>{jackpot ? jackpot.toLocaleString("ru-RU") : "Джекпот"}</b></>
      ) : c.kind === "case" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <><img src={`${A}/case.webp`} alt="" /><b>Ящик</b></>
      ) : r?.currencies?.RUB ? <><Icon name="RUB" size={30} /><b className="num">{r.currencies.RUB.toLocaleString("ru-RU")}</b></>
        : r?.currencies?.USD ? <><Icon name="USD" size={30} /><b className="num">{r.currencies.USD}</b></>
        : it ? <><ItemArt id={it.id} size={34} /><b className="num">×{it.qty}</b></> : null}
    </span>
  );
}

/** the slots of the 3×3 grid (% of the table) */
const slotXY = (k: number) => ({ left: `${16.7 + (k % 3) * 33.3}%`, top: `${16.7 + Math.floor(k / 3) * 33.3}%` });

function CupsGame({ onClose }: { onClose: () => void }) {
  const { act } = useGame();
  const [layout, setLayout] = useState<CupView[] | null>(null);
  // where each cup stands (cup i → slot pos[i]); the cups are shuffled by swapping slots
  const [pos, setPos] = useState<number[]>(() => Array.from({ length: 9 }, (_, i) => i));
  const [phase, setPhase] = useState<"load" | "show" | "down" | "shuffle" | "pick" | "busy" | "open" | "all">("load");
  const [res, setRes] = useState<CupsPick | null>(null);
  const [jp, setJp] = useState(0);
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await act<CupsStart & { fortune: FortuneView }>("fortune_cups", {});
      if (!alive) return;
      if (!r) { onClose(); return; }
      setLayout(r.layout);
      setJp(r.fortune.jackpot);
      setPhase("show");
      // the prizes for a moment, the cups come down, then two seconds of shuffling
      later(1800, () => setPhase("down"));
      later(2400, () => {
        setPhase("shuffle");
        const swaps = 9;
        for (let k = 0; k < swaps; k++) {
          later((k * CUPS_SHUFFLE_MS) / swaps, () => {
            setPos((p) => {
              const a = Math.floor(Math.random() * 9);
              let b = Math.floor(Math.random() * 8);
              if (b >= a) b++;
              const n = p.slice();
              const ia = n.indexOf(a), ib = n.indexOf(b);
              n[ia] = b; n[ib] = a;
              return n;
            });
            sfx("tap");
          });
        }
        later(CUPS_SHUFFLE_MS + 250, () => setPhase("pick"));
      });
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (slot: number) => {
    if (phase !== "pick") return;
    haptic.tap();
    setPhase("busy");
    const r = await act<CupsPick>("fortune_cup_pick", { index: slot });
    if (!r) { setPhase("pick"); return; }
    setRes(r);
    setPhase("open");
    if (r.kind === "jackpot") { haptic.big(); sfx("win"); } else { haptic.ok(); sfx("reward"); }
    later(900, () => setPhase("all"));
  };

  // what lies in a slot: the shown layout before the pick, the server's final layout after it
  const under = (slot: number, cup: number): CupView | null => (res ? res.final[slot] : layout ? layout[cup] : null);
  const lifted = (slot: number) => phase === "show" || phase === "all" || (phase === "open" && res?.index === slot);

  return (
    <div className="fo-cups-layer" role="dialog" aria-label="Чашки">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="fo-bg" src={`${A}/bg.webp`} alt="" draggable={false} />
      <div className="fo-cups-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PRIZE_IMG} alt="ПРИЗ" />
        <span>{phase === "show" ? "Запоминай, где джекпот…" : phase === "down" || phase === "shuffle" ? "Перемешиваю…" : phase === "pick" ? "Выбери чашку!" : phase === "load" ? "…" : res?.kind === "jackpot" ? "ДЖЕКПОТ!" : "Твой приз"}</span>
      </div>
      <div className="fo-table">
        {(layout ?? Array.from({ length: 9 }, () => null)).map((_, cup) => {
          const slot = pos[cup];
          const c = under(slot, cup);
          const mine = res?.index === slot;
          return (
            <button key={cup} type="button" className={`fo-cup ${lifted(slot) ? "up" : ""} ${mine ? "mine" : ""} ${phase === "pick" ? "pickable" : ""}`}
              style={{ ...slotXY(slot), transitionDuration: phase === "shuffle" ? `${Math.round((CUPS_SHUFFLE_MS / 9) * 0.9)}ms` : undefined }}
              onClick={() => pick(slot)} disabled={phase !== "pick"} aria-label={`Чашка ${slot + 1}`}>
              {c && <CupPrize c={c} jackpot={c.kind === "jackpot" ? (mine && res?.jackpot ? res.jackpot : jp) : undefined} />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="fo-cup-pic" src={`${A}/cup.webp`} alt="" draggable={false} />
            </button>
          );
        })}
      </div>
      <div className="fo-cups-foot">
        {res && phase === "all" && (
          <>
            {res.kind === "jackpot" && <b className="fo-cups-jack">Сорвал куш: {res.jackpot.toLocaleString("ru-RU")} ₽!</b>}
            <button className="btn gold block" onClick={onClose}>Забрать</button>
          </>
        )}
      </div>
    </div>
  );
}

function BuyTickets({ price, onClose, onDone }: { price: number; onClose: () => void; onDone: () => void }) {
  const { act, busy, state } = useGame();
  const [n, setN] = useState(1);
  const rub = state?.wallet.RUB ?? 0;
  const max = Math.max(1, Math.min(1000, Math.floor(rub / price)));
  return (
    <Modal onClose={onClose} title="Билеты колеса">
      <div className="fo-res">
        <ItemArt id={TICKET_ID} size={72} />
        <p className="small">Один билет — одна прокрутка. Ещё билеты падают из «Ящика ништяков» в магазине.</p>
        <div className="fo-qty">
          {[1, 5, 10, 25].map((q) => <button key={q} type="button" className={`btn sm ${n === q ? "gold" : "dark"}`} onClick={() => setN(q)}>{q}</button>)}
          <button type="button" className={`btn sm ${n === max ? "gold" : "dark"}`} onClick={() => setN(max)}>макс</button>
        </div>
        <button className="btn gold block" disabled={busy === "fortune_buy" || rub < price * n} onClick={async () => {
          if (await act("fortune_buy", { qty: n }, `Билетов: +${n}`)) { haptic.ok(); onDone(); onClose(); }
        }}>
          Купить {n} за <Icon name="RUB" size={16} /> <b className="num">{(price * n).toLocaleString("ru-RU")}</b>
        </button>
        {rub < price * n && <p className="small fo-muted">Не хватает рублей</p>}
      </div>
    </Modal>
  );
}

function FortuneHelp() {
  return (
    <Help topic="fortune" title="Колесо удачи">
      <p>Одна прокрутка — один билет. Билеты падают из «Ящика ништяков» в магазине или покупаются здесь по 150 ₽ (кнопка «+»).</p>
      <p>Каждая прокрутка любого игрока добавляет 150 ₽ к общему джекпоту.</p>
      <p>На колесе: оружие, энергетик, рубли, доллары, билет, кнопки клавиатуры, опыт колеса, пустой сектор и <b>ПРИЗ</b>.</p>
      <p><b>ПРИЗ</b> — игра в чашки: девять чашек, под каждой приз (рубли, оружие, доллары, фишки, ящик ништяков, кнопки), под одной — джекпот. Чашки показывают призы, накрываются и перемешиваются — выбери одну. Кто сорвал джекпот, того видно наверху, а джекпот начинается заново с 5000 ₽.</p>
      <p>Кнопки клавиатуры копятся — за них будут открываться коробки с наколками.</p>
      <p>«Крутить на все» — колесо крутится само, билет за билетом, пока они не кончатся (остановится на «ПРИЗ» или по кнопке «Стоп»).</p>
    </Help>
  );
}
