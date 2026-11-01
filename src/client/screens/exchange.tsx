"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { CURRENCIES, CURRENCY_DEFS, exchangeScheduleText, exchangeWindow, floorTo, type Currency } from "../../content/currencies.ts";
import { Icon } from "../art/icons.tsx";
import { clock, money } from "../format.ts";
import { haptic } from "../telegram.ts";
import type { ShopData } from "./shop.tsx";
import { Help, HelpList } from "../help.tsx";
import { ItemArt } from "../art/items.tsx";
import { itemById } from "../../content/items.ts";
import { sfx } from "../sound.ts";
import { Modal } from "../ui.tsx";
import { KioskDealer } from "../art/kiosk.tsx";
import { XG_BOX } from "../art/exchange-data.ts";

export function Exchanger({ ex }: { ex: ShopData["exchange"] }) {
  const { state, act, busy } = useGame();
  const [from, setFrom] = useState<Currency>("RUB");
  const [to, setTo] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const have = state?.wallet[from] ?? 0;
  const a = Math.floor(Number(amount) || 0);
  const quote = a > 0 && from !== to ? floorTo(to, ((a * ex.rub[from]) / ex.rub[to]) * (1 - ex.fee)) : 0;
  const rate = (ex.rub[from] / ex.rub[to]) * (1 - ex.fee);
  const swap = () => {
    setFrom(to);
    setTo(from);
    setAmount("");
  };
  const go = async () => {
    const r = await act<{ paid: number; got: number }>("exchange", { from, to, amount: floorTo(from, a), idem: crypto.randomUUID() }, (x) => `Обмен: ${money(from, x.paid)} ${from} → ${money(to, x.got)} ${to}`);
    if (r) {
      haptic.ok();
      setAmount("");
    }
  };
  // regions of the drawn frame (public/assets/ui/exchange-frame.webp), percent of 1117×1301
  const COLS = [8.6, 31.3, 53.6, 75.7];
  const box = (l: number, t: number, w: number, h: number) => ({ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` });
  const row = (top: number, v: Currency, set: (c: Currency) => void, other: Currency) =>
    CURRENCIES.map((c, i) => (
      <button key={c} className={`exp-btn exp-cur ${v === c ? "on" : ""}`} style={box(COLS[i], top, 20.1, 8)} disabled={c === other} onClick={() => set(c)} aria-label={CURRENCY_DEFS[c].name}>
        <Icon name={c} size={26} />
        <b>{c}</b>
      </button>
    ));
  const can = a > 0 && a <= have && quote > 0 && busy !== "exchange" && ex.open !== false;
  return (
    <div className="exp-panel">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="exp-bg" src="/assets/ui/exchange-frame.webp" alt="" draggable={false} />
      <div className="exp-cell exp-title display" style={box(17.9, 2.2, 68.5, 6)}>Обменник</div>
      <div className="exp-cell exp-info" style={box(9, 11.3, 86.1, 8.8)}>
        <span className="exp-label">Отдаю</span>
        <Icon name={from} size={24} />
        <span className="grow">{CURRENCY_DEFS[from].name}</span>
        <span className="exp-have">есть <b className="num">{money(from, have)}</b></span>
      </div>
      {row(23, from, setFrom, to)}
      <div className="exp-cell exp-input" style={box(9, 34.4, 67.6, 8.8)}>
        <Icon name={from} size={24} />
        <input inputMode="numeric" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, ""))} aria-label="Сколько отдать" />
      </div>
      <button className="exp-btn exp-max display" style={box(80.9, 34.3, 13.1, 8.3)} onClick={() => setAmount(String(floorTo(from, have)))}>ВСЁ</button>
      <button className="exp-btn exp-swap" style={box(45.7, 46, 12.1, 8.8)} onClick={swap} aria-label="Поменять местами">⇅</button>
      {row(57.9, to, setTo, from)}
      <div className="exp-cell exp-info" style={box(9, 68.6, 86.1, 7.5)}>
        <span className="exp-label">Получу</span>
        <Icon name={to} size={24} />
        <b className="num grow exp-quote">{money(to, quote)}</b>
        <span className="exp-rate">{rate >= 1 ? `1 ${from} = ${money(to, floorTo(to, rate))} ${to}` : `${Math.ceil(1 / rate)} ${from} = 1 ${to}`}</span>
      </div>
      <button className="exp-btn exp-go display" style={box(9, 78.2, 86.1, 10.5)} disabled={!can} onClick={go}>
        {a > have ? "Не хватает" : "Обменять"}
      </button>
      <div className="exp-cell exp-foot" style={box(9, 89.6, 86.1, 3.6)}>Комиссия {Math.round(ex.fee * 100)}% · валюта игровая</div>
    </div>
  );
}


/**
 * «Скупка»: the dealer buys the yard finds (things with a price in state.sell, no weapons) for roubles — always open,
 * not only on the exchanger's days — and the upgraded ★ things for their price. A row per thing; «Продать всё»
 * Tabs «Находки» / «Детали»; each row: how many to sell (− n +), the price for that many.
 */
function sellRows(state: ReturnType<typeof useGame>["state"]) {
  return Object.entries(state?.sell ?? {})
    .map(([id, price]) => ({ id, price, qty: state?.inventory.find((i) => i.id === id)?.qty ?? 0, def: itemById(id) }))
    .filter((r) => r.qty > 0 && r.def && !r.def.weapon && r.price > 0);
}
export function BuyBack() {
  const { state, act, busy } = useGame();
  const [tab, setTab] = useState<"finds" | "parts">("finds");
  // how many of each thing to sell (0 by default); upgraded ★ things by "u<uid>" (0 or 1)
  const [pick, setPick] = useState<Record<string, number>>({});
  if (!state) return null;
  const rows = sellRows(state);
  const ups = state.upgraded ?? [];
  const dealer = state.dealer ?? [];
  const buyPart = async (id: string) => {
    const r = await act<{ qty: number; paid: number }>("dealer_buy", { itemId: id, qty: 1 }, (x) => `Куплено: ${itemById(id)?.name} · −${money("RUB", x.paid)} ₽`);
    if (r) { haptic.ok(); sfx("coinsoft"); }
  };
  const finds = rows.filter((r) => !r.id.startsWith("part-"));
  const parts = rows.filter((r) => r.id.startsWith("part-"));
  const list = tab === "finds" ? finds : parts;
  // what is picked, clamped to what the player still has
  const items = rows.map((r) => ({ itemId: r.id, qty: Math.min(r.qty, pick[r.id] ?? 0), price: r.price })).filter((x) => x.qty > 0);
  const uids = ups.filter((u) => (pick[`u${u.uid}`] ?? 0) > 0);
  const total = items.reduce((t, x) => t + x.qty * x.price, 0) + uids.reduce((t, u) => t + u.value, 0);
  const picked = (ids: string[]) => ids.reduce((t, id) => t + (pick[id] ?? 0), 0);
  const sellAll = async () => {
    const r = await act<{ got: number; count: number }>("sell_many", { items: items.map(({ itemId, qty }) => ({ itemId, qty })), uids: uids.map((u) => u.uid) }, (x) => `Продано ${x.count} шт. за ${money("RUB", x.got)} ₽`);
    if (r) { haptic.ok(); sfx("coin"); setPick({}); }
  };
  const stepper = (key: string, max: number) => {
    const n = Math.min(max, pick[key] ?? 0);
    const set = (v: number) => { haptic.tap(); setPick((p) => ({ ...p, [key]: Math.max(0, Math.min(max, v)) })); };
    return (
      <span className={`bb-qty ${n > 0 ? "on" : ""}`}>
        <button type="button" disabled={n <= 0} onClick={() => set(n - 1)} aria-label="Меньше">−</button>
        {/* a tap on the number: all of it / none */}
        <button type="button" className="num bb-qty-n" onClick={() => set(n >= max ? 0 : max)} title="Все">{n}</button>
        <button type="button" disabled={n >= max} onClick={() => set(n + 1)} aria-label="Больше">+</button>
      </span>
    );
  };
  const tabBtn = (id: "finds" | "parts", label: string, n: number) => (
    <button type="button" role="tab" aria-selected={tab === id} className={`bb-tab ${tab === id ? "on" : ""}`} onClick={() => { haptic.tap(); setTab(id); }}>
      {label}
      {n > 0 && <i className="bb-tab-n num">{n}</i>}
    </button>
  );
  return (
    <div className="bb-panel">
      {/* the fixed top: the dealer's offers, the tabs and the «Продать» button; only the list under it scrolls */}
      <div className="bb-top">
        {dealer.length > 0 && (
          <div className="bb-dealer">
            <b className="small">Барыга продаёт сегодня</b>
            <div className="bb-offers">
              {dealer.map((o) => {
                const out = o.left < 1;
                return (
                  <div key={o.id} className={`bb-offer ${out ? "out" : ""}`} title={itemById(o.id)?.name}>
                    <span className="bb-offer-pic">
                      <ItemArt id={o.id} size={40} />
                      {!out && <i className="bb-offer-n num">×{o.left}</i>}
                      {out && <i className="bb-offer-stamp">куплено</i>}
                    </span>
                    <span className="tiny ellipsis">{itemById(o.id)?.name}</span>
                    <b className="num small">{money("RUB", o.price)} ₽</b>
                    <button type="button" className="bb-buy" disabled={!!busy || out || (state.wallet.RUB ?? 0) < o.price} onClick={() => buyPart(o.id)}>купить</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="bb-bar">
          <div className="bb-tabs" role="tablist">
            {tabBtn("finds", "Находки", picked([...finds.map((r) => r.id), ...ups.map((u) => `u${u.uid}`)]))}
            {tabBtn("parts", "Детали", picked(parts.map((r) => r.id)))}
          </div>
          <b className={`bb-total num ${total > 0 ? "on" : ""}`}>+{money("RUB", total)} ₽</b>
          <button type="button" className="btn sm gold bb-sell" disabled={!!busy || total <= 0} onClick={sellAll}>Продать</button>
        </div>
      </div>
      <div className="bb-list">
        {list.map((r) => (
          <div key={r.id} className="bb-row">
            <ItemArt id={r.id} size={36} />
            <span className="grow col" style={{ minWidth: 0 }}>
              <b className="small ellipsis">{r.def!.name}</b>
              <span className="tiny bb-sub num">есть {r.qty} · {money("RUB", r.price)} ₽ за шт.</span>
            </span>
            {stepper(r.id, r.qty)}
          </div>
        ))}
        {tab === "finds" && ups.map((u) => (
          <div key={`u${u.uid}`} className="bb-row">
            <span className="upg-art"><ItemArt id={u.itemId} size={36} /><i className="up-star">★</i></span>
            <span className="grow col" style={{ minWidth: 0 }}>
              <b className="small ellipsis">{itemById(u.itemId)?.name} ★</b>
              <span className="tiny bb-sub num">улучшенная · {money("RUB", u.value)} ₽</span>
            </span>
            {stepper(`u${u.uid}`, 1)}
          </div>
        ))}
        {!list.length && !(tab === "finds" && ups.length) && <div className="small bb-sub center bb-empty">{tab === "finds" ? "Нечего продать: подбирай находки во дворе." : "Деталей пока нет."}</div>}
      </div>
    </div>
  );
}

/** The exchanger is an event: one Moscow day out of three. A strip says how long it still works / when it opens. */
function ExchangeClock({ until, open, onTurn }: { until: number; open: boolean; onTurn: () => void }) {
  const { state } = useGame();
  const when = exchangeScheduleText(state?.exchangeSchedule);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = until - now;
  useEffect(() => {
    if (left <= 0) onTurn();
  }, [left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = Math.floor(Math.max(0, left) / 86_400_000);
  const t = `${days > 0 ? `${days} д ` : ""}${clock(left % 86_400_000)}`;
  return open ? (
    <div className="exp-event on"><b className="display">Обменник открыт</b><span>Закроется через <b className="num">{t}</b></span></div>
  ) : (
    <div className="exp-event"><b className="display">Обменник закрыт</b><span>{when[0].toUpperCase() + when.slice(1)}.{state?.exchangeSchedule?.mode === "closed" ? "" : <> Откроется через <b className="num">{t}</b></>}</span></div>
  );
}

export function ExchangeScreen() {
  const [data, setData] = useState<ShopData | null>(null);
  const load = () => api.get<ShopData>("/api/shop").then(setData).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  const { state } = useGame();
  const sched = state?.exchangeSchedule;
  const win = data ? { open: data.exchange.open ?? exchangeWindow(Date.now(), sched).open, until: data.exchange.until ?? exchangeWindow(Date.now(), sched).until } : null;
  return (
    <div className="fit-page xg-page">
      <ExchangeGarage data={data} win={win} onTurn={load} />
      {/* over the scene: back to the yard and the help */}
      <div className="xg-top">
        <div className="title-row">
          <Link href="/yard" className="back-btn" aria-label="Во двор">‹</Link>
          <Help topic="exchange" title="Обменник">
            <HelpList title="Валюты" rows={CURRENCIES.map((c) => ({ key: c, icon: <Icon name={c} size={40} />, name: CURRENCY_DEFS[c].name, hint: `1 ${c} ≈ ${money("RUB", CURRENCY_DEFS[c].rub)} ₽ по базовому курсу` }))} />
            <ul>
              <li>Верхний ряд — что отдаёшь, нижний — что получаешь. Кнопка ⇅ меняет их местами.</li>
              <li>Впиши сумму или нажми «ВСЁ», ниже сразу видно, сколько получишь и по какому курсу.</li>
              <li>Комиссия {data ? Math.round(data.exchange.fee * 100) : 5}% уже учтена в сумме «Получу».</li>
              <li>Обменник — ивент: {exchangeScheduleText(sched)}. В день открытия на главном экране появится уведомление.</li>
              <li>Меняются только целые числа — без копеек и дробей.</li>
              <li>Валюты игровые и не связаны с настоящими кошельками.</li>
            </ul>
          </Help>
        </div>
      </div>
      {/* when the exchange works: in the dark strip under the table, over the menu */}
      {win && <div className="xg-clock"><ExchangeClock key={win.until} open={win.open} until={win.until} onTurn={load} /></div>}
    </div>
  );
}

/**
 * The garage (the artist's layers, tools/exchange/build.py → public/assets/exchange, boxes in XG_BOX): it fills the
 * whole screen like the yard (the 1080×2400 picture covers it, the HUD and the menu lie over its top and bottom).
 * The dealer behind the table is the yard kiosk's animated layers (his body behind the table, his arms on it); the
 * lamp swings and its light flickers. The finds on the newspaper on the left — a tap sells them to him («Скупка»,
 * every day); the exchange machine on the right — a tap opens the currency exchange (its screen shows the rate).
 */
const XG = "/assets/exchange";
function XgLayer({ id, className }: { id: string; className?: string }) {
  const [l, t, w, h] = XG_BOX[id];
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`xg-l ${className ?? ""}`} src={`${XG}/${id}.webp`} alt="" draggable={false} style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` }} />;
}
function ExchangeGarage({ data, win }: { data: ShopData | null; win: { open: boolean; until: number } | null; onTurn: () => void }) {
  const [open, setOpen] = useState<"sell" | "ex" | null>(null);
  const ex = data?.exchange;
  const rate = ex ? Math.ceil(ex.rub.USD / ex.rub.RUB / (1 - ex.fee)) : null;
  const [ml, mt, mw, mh] = XG_BOX.machine;
  const [pl, pt, pw, ph] = XG_BOX.paper;
  return (
    <>
      <div className="xg">
        <div className="xg-box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="xg-l xg-bg" src={`${XG}/bg.webp`} alt="" draggable={false} />
          <span className="xg-dealer"><KioskDealer part="back" /></span>
          <XgLayer id="table" />
          <XgLayer id="paper" />
          <XgLayer id="junk" />
          {/* his arm lies on the newspaper, over the finds */}
          <span className="xg-dealer"><KioskDealer part="front" /></span>
          <XgLayer id="machine" />
          {/* the machine's green display: the rate, or «закрыто» */}
          <span className={`xg-screen ${win?.open ? "" : "off"}`} aria-hidden="true">
            {win?.open ? (rate ? <><b>$1</b><b>={rate}₽</b></> : <b>…</b>) : <b>ЗАКРЫТО</b>}
          </span>
          {/* the lamp swings on its wire, its light flickers */}
          <span className="xg-lamp">
            <i className="xg-light" />
            <XgLayer id="lamp" />
          </span>
          <button type="button" className="xg-zone xg-sell" style={{ left: `${pl}%`, top: `${pt}%`, width: `${pw}%`, height: `${ph}%` }} onClick={() => { haptic.tap(); setOpen("sell"); }} aria-label="Продать барыге">
          </button>
          <button type="button" className={`xg-zone xg-ex ${win?.open ? "" : "closed"}`} style={{ left: `${ml}%`, top: `${mt}%`, width: `${mw}%`, height: `${mh}%` }} onClick={() => { haptic.tap(); setOpen("ex"); }} aria-label="Обмен валют">
          </button>
        </div>
      </div>
      {open === "sell" && (
        <Modal title="Скупка" className="bb-modal" onClose={() => setOpen(null)}>
          <BuyBack />
        </Modal>
      )}
      {open === "ex" && (
        <Modal onClose={() => setOpen(null)}>
          {data ? (
            <div className={`exp-wrap${win?.open ? "" : " closed"}`}>
              <Exchanger ex={data.exchange} />
              {!win?.open && <div className="exp-closed-sign display" aria-hidden="true">ЗАКРЫТО</div>}
            </div>
          ) : <div className="panel muted center">Загружаем курс…</div>}
        </Modal>
      )}
    </>
  );
}
