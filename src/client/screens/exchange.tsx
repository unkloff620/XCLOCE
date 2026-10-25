"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { CURRENCIES, CURRENCY_DEFS, EXCHANGE_EVERY_DAYS, exchangeWindow, floorTo, type Currency } from "../../content/currencies.ts";
import { Icon } from "../art/icons.tsx";
import { clock, money } from "../format.ts";
import { haptic } from "../telegram.ts";
import type { ShopData } from "./shop.tsx";
import { Help, HelpList } from "../help.tsx";

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


/** The exchanger is an event: one Moscow day out of three. A strip says how long it still works / when it opens. */
function ExchangeClock({ until, open, onTurn }: { until: number; open: boolean; onTurn: () => void }) {
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
    <div className="exp-event on"><b className="display">Ивент: обменник открыт</b><span>закроется через <b className="num">{t}</b></span></div>
  ) : (
    <div className="exp-event"><b className="display">Обменник закрыт</b><span>Работает один день из {EXCHANGE_EVERY_DAYS}. Откроется через <b className="num">{t}</b></span></div>
  );
}

export function ExchangeScreen() {
  const [data, setData] = useState<ShopData | null>(null);
  const load = () => api.get<ShopData>("/api/shop").then(setData).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  const win = data ? { open: data.exchange.open ?? exchangeWindow(Date.now()).open, until: data.exchange.until ?? exchangeWindow(Date.now()).until } : null;
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="title" style={{ margin: 0 }}>
        <div className="title-row">
          <Link href="/yard" className="back-btn" aria-label="Во двор">‹</Link>
          <Help topic="exchange" title="Обменник">
            <HelpList title="Валюты" rows={CURRENCIES.map((c) => ({ key: c, icon: <Icon name={c} size={40} />, name: CURRENCY_DEFS[c].name, hint: `1 ${c} ≈ ${money("RUB", CURRENCY_DEFS[c].rub)} ₽ по базовому курсу` }))} />
            <ul>
              <li>Верхний ряд — что отдаёшь, нижний — что получаешь. Кнопка ⇅ меняет их местами.</li>
              <li>Впиши сумму или нажми «ВСЁ», ниже сразу видно, сколько получишь и по какому курсу.</li>
              <li>Комиссия {data ? Math.round(data.exchange.fee * 100) : 5}% уже учтена в сумме «Получу».</li>
              <li>Обменник — ивент: работает один день из {EXCHANGE_EVERY_DAYS} (по Москве). В день открытия на главном экране появится уведомление.</li>
              <li>Меняются только целые числа — без копеек и дробей.</li>
              <li>Валюты игровые и не связаны с настоящими кошельками.</li>
            </ul>
          </Help>
        </div>
      </div>
      {win && <ExchangeClock key={win.until} open={win.open} until={win.until} onTurn={load} />}
      {data ? (
        <div className={`exp-wrap${win?.open ? "" : " closed"}`}>
          <Exchanger ex={data.exchange} />
          {!win?.open && <div className="exp-closed-sign display" aria-hidden="true">ЗАКРЫТО</div>}
        </div>
      ) : <div className="panel muted center">Загружаем курс…</div>}
    </div>
  );
}
