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
import { Avatar, Modal, RewardChips } from "../ui.tsx";
import { Help } from "../help.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { haptic } from "../telegram.ts";
import { sfx } from "../sound.ts";
import { KEYCAP_ID, SECTORS, SPIN_ALL_MAX, TICKET_ID, WHEEL_R, spokeBend, type Sector } from "../../content/fortune.ts";

const A = "/assets/fortune";
const N = SECTORS.length;
const STEP = 360 / N;
const SPIN_MS = 4200;

interface FortuneView {
  jackpot: number; spins: number;
  winner: { id: number; name: string; photo: string | null; amount: number; at: number } | null;
  xp: number; level: number; into: number; need: number; cups: number;
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
      <img className="fo-wheel-pic" src={`${A}/wheel.webp`} alt="" draggable={false} />
      {SECTORS.map((s, k) => {
        if (s.kind === "empty") return null;
        if (s.kind === "prize") {
          const p = at(k, 0.5);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s.id} className="fo-prize" src={`${A}/prize.webp`} alt="ПРИЗ" draggable={false} style={{ left: p.left, top: p.top, transform: `translate(-50%, -50%) rotate(${p.a}deg)` }} />
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
  const [all, setAll] = useState(false);
  const [buy, setBuy] = useState(false);
  const [shown, setShown] = useState<SpinResult | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(() => api.get<FortuneView>("/api/fortune").then((v) => { setF(v); setStock(null); }).catch(() => {}), []);
  useEffect(() => { void load(); const t = window.setInterval(() => document.visibilityState === "visible" && load(), 20_000); return () => clearInterval(t); }, [load]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // the tickets and keycaps change at once; the jackpot and the level — when the wheel stops
  const [stock, setStock] = useState<{ tickets: number; keycaps: number } | null>(null);
  const tickets = stock?.tickets ?? f?.tickets ?? 0;
  const keycaps = stock?.keycaps ?? f?.keycaps ?? 0;

  const spin = async () => {
    if (spinning || tickets < 1) { if (tickets < 1) setBuy(true); return; }
    haptic.tap();
    setSpinning(true);
    const r = await act<SpinResult>("fortune_spin", { all });
    if (!r) { setSpinning(false); return; }
    setStock({ tickets: r.fortune.tickets, keycaps: f?.keycaps ?? r.fortune.keycaps });
    // turn to the sector fallen: a few full turns more, a little off its middle (where the arrow meets it, near the rim)
    const jitter = (Math.random() - 0.5) * STEP * 0.55;
    const target = -(sectorAngle(r.last, 0.92) + 90) + jitter;
    setTurn((cur) => {
      const base = cur - (((cur % 360) + 360) % 360);
      let next = base + 360 * 6 + (((target % 360) + 360) % 360);
      if (next - cur < 360 * 5) next += 360;
      return next;
    });
    sfx("shake");
    timer.current = window.setTimeout(() => {
      setSpinning(false);
      setF(r.fortune);
      setStock(null);
      setShown(r);
      const s = SECTORS[r.last];
      if (s.kind === "empty" && r.spins === 1) haptic.err();
      else { haptic.big(); sfx(r.cups ? "win" : "reward"); }
    }, SPIN_MS);
  };

  const lvlShare = f ? f.into / f.need : 0;
  const one = shown && shown.spins === 1 ? SECTORS[shown.last] : null;

  return (
    <div className="fit-page fo-page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="fo-bg" src={`${A}/bg.webp`} alt="" draggable={false} />
      <div className="fo-top">
        <div className="title-row">
          <Link href="/yard" className="back-btn" aria-label="Во двор">‹</Link>
          <div className="fo-jack">
            <span className="fo-jack-t">👑 Джекпот</span>
            <b className="fo-jack-v num"><Icon name="RUB" size={22} />{f ? f.jackpot.toLocaleString("ru-RU") : "…"}</b>
          </div>
          <FortuneHelp />
        </div>
        <div className="fo-winner">
          {f?.winner ? (
            <Link href={`/profile?id=${f.winner.id}`} className="fo-winner-in">
              <Avatar name={f.winner.name} photo={f.winner.photo} size={34} />
              <span className="fo-winner-n">{f.winner.name}</span>
              <span className="fo-winner-s">сорвал куш: <b className="num">{f.winner.amount.toLocaleString("ru-RU")}</b> <Icon name="RUB" size={14} /></span>
            </Link>
          ) : <span className="fo-winner-in fo-muted">Куш ещё никто не сорвал — он растёт с каждой прокруткой</span>}
        </div>
      </div>

      {/* the wheel's level: a chalk bar on the left */}
      <div className="fo-level" title={f ? `Опыт колеса: ${f.into}/${f.need}` : undefined}>
        <b className="num">{f?.level ?? 1}<small>ур.</small></b>
        <span className="fo-level-bar"><i style={{ height: `${Math.round(lvlShare * 100)}%` }} /></span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${A}/xp.webp`} alt="" width={26} height={26} />
      </div>

      <div className="fo-stage">
        <svg className="fo-arrow" viewBox="0 0 60 70" aria-hidden="true">
          <path d="M8 6 C 20 12, 40 10, 52 5 L 34 58 C 32 64, 28 64, 26 58 Z" />
        </svg>
        <div className="fo-wheel" style={{ transform: `rotate(${turn}deg)`, transitionDuration: spinning ? `${SPIN_MS}ms` : "0ms" }}>
          <WheelFace />
        </div>
      </div>

      <div className="fo-bottom">
        {!!f?.cups && <div className="fo-cups">ПРИЗ ждёт: <b className="num">{f.cups}</b> — чашки скоро откроются</div>}
        <div className="fo-row">
          <div className="fo-stock">
            <span className="fo-chip" title="Билеты"><ItemArt id={TICKET_ID} size={26} /><b className="num">{tickets}</b>
              <button type="button" className="fo-plus" onClick={() => setBuy(true)} aria-label="Купить билеты">+</button></span>
            <span className="fo-chip" title="Кнопки клавиатуры"><ItemArt id={KEYCAP_ID} size={26} /><b className="num">{keycaps.toLocaleString("ru-RU")}</b></span>
          </div>
          <div className="fo-go">
            <button type="button" className="fo-spin" disabled={spinning || busy === "fortune_spin"} onClick={spin}>
              <b>{tickets < 1 ? "Купить билет" : "Крутить"}</b>
              <span className="num"><ItemArt id={TICKET_ID} size={18} />{all ? Math.min(tickets, SPIN_ALL_MAX) || 1 : 1}</span>
            </button>
            <label className="fo-all"><input type="checkbox" checked={all} disabled={spinning} onChange={(e) => setAll(e.target.checked)} /> Крутить на все</label>
          </div>
        </div>
      </div>

      {shown && !spinning && (
        <Modal onClose={() => setShown(null)} title={one ? (one.kind === "empty" ? "Пусто" : one.kind === "prize" ? "ПРИЗ!" : "Выпало") : `Прокруток: ${shown.spins}`}>
          <div className="fo-res">
            {one && one.kind !== "empty" && one.kind !== "prize" && (
              <div className="fo-got"><SectorIcon s={one} size={84} /><b>{one.name}{one.label && one.kind !== "xp" && !/\d/.test(one.name) ? ` ×${one.label}` : ""}</b></div>
            )}
            {one?.kind === "prize" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="fo-got-prize" src={`${A}/prize.webp`} alt="ПРИЗ" />
            )}
            {one?.kind === "empty" && <p>Колесо встало на пустой сектор. Крути дальше!</p>}
            {one?.kind === "prize" && <p>Выпал <b>ПРИЗ</b> — сыграешь в чашки: девять чашек, в одной из них джекпот. Чашки откроются в следующем обновлении, приз сохранён.</p>}
            {shown.reward && shown.spins > 1 && <RewardChips r={shown.reward} size={30} />}
            {!!shown.xp && shown.spins > 1 && <p className="row" style={{ gap: 6, justifyContent: "center" }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`${A}/xp.webp`} alt="" width={26} height={26} /> Опыт колеса <b className="num">+{shown.xp}</b></p>}
            {shown.spins > 1 && (
              <p className="small">{shown.cups ? <>ПРИЗ ×<b>{shown.cups}</b> · </> : null}пустых: {shown.empty}</p>
            )}
            <button className="btn gold block" onClick={() => setShown(null)}>Ок</button>
          </div>
        </Modal>
      )}
      {buy && f && <BuyTickets price={f.price} onClose={() => setBuy(false)} onDone={() => { void load(); }} />}
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
      <p><b>ПРИЗ</b> — игра в чашки: девять чашек с призами, в одной — джекпот. Кто его сорвал, того видно наверху.</p>
      <p>Кнопки клавиатуры копятся — за них будут открываться коробки с наколками.</p>
      <p>«Крутить на все» — потратить все билеты разом (до {SPIN_ALL_MAX}).</p>
    </Help>
  );
}
