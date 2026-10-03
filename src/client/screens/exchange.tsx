"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { CURRENCIES, floorTo, type Currency } from "../../content/currencies.ts";
import { Icon } from "../art/icons.tsx";
import { Coin } from "../ui.tsx";
import { money } from "../format.ts";
import { haptic } from "../telegram.ts";
import type { ShopData } from "./shop.tsx";

export function Exchanger({ ex }: { ex: ShopData["exchange"] }) {
  const { state, act, busy } = useGame();
  const [from, setFrom] = useState<Currency>("RUB");
  const [to, setTo] = useState<Currency>("USD");
  const [amount, setAmount] = useState("");
  const have = state?.wallet[from] ?? 0;
  const a = Number(amount.replace(",", "."));
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
  const pick = (v: Currency, set: (c: Currency) => void, other: Currency) => (
    <div className="cur-pick">
      {CURRENCIES.map((c) => (
        <button key={c} className={v === c ? "on" : ""} disabled={c === other} onClick={() => set(c)}>
          <Icon name={c} size={22} />
          {c}
        </button>
      ))}
    </div>
  );
  return (
    <div className="panel col" style={{ gap: 10 }}>
      <div className="tiny muted">Курс задаёт сервер, комиссия {Math.round(ex.fee * 100)}%. Валюты внутриигровые и не связаны с настоящими кошельками.</div>
      <div className="small muted">Отдаю</div>
      {pick(from, setFrom, to)}
      <div className="row">
        <input className="input grow" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} />
        <button className="btn sm dark" onClick={() => setAmount(String(floorTo(from, have)))}>Всё</button>
      </div>
      <div className="tiny muted">Есть: {money(from, have)} {from}</div>
      <button className="btn sm dark" onClick={swap} style={{ alignSelf: "center" }}>⇅</button>
      <div className="small muted">Получаю</div>
      {pick(to, setTo, from)}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted small">1 {from} = {money(to, floorTo(to, rate) || rate)} {to}</span>
        <b><Coin c={to} v={quote} /></b>
      </div>
      <button className="btn green block" disabled={!(a > 0) || a > have || quote <= 0 || busy === "exchange"} onClick={go}>Обменять</button>
    </div>
  );
}


export function ExchangeScreen() {
  const [data, setData] = useState<ShopData | null>(null);
  useEffect(() => {
    api.get<ShopData>("/api/shop").then(setData).catch(() => undefined);
  }, []);
  return (
    <div>
      <div className="title">
        <div>
          <Link href="/yard" className="back">← Двор</Link>
          <h1 className="display">Обменник</h1>
        </div>
      </div>
      {data ? <Exchanger ex={data.exchange} /> : <div className="panel muted center">Загружаем курс…</div>}
    </div>
  );
}
