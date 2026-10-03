"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { invQty, useGame } from "../store.tsx";
import { api } from "../api.ts";
import { SHOP_SECTIONS, type Offer } from "../../content/shop.ts";
import { CURRENCIES, floorTo, type Currency } from "../../content/currencies.ts";
import { itemById } from "../../content/items.ts";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { Coin } from "../ui.tsx";
import { money } from "../format.ts";
import { haptic } from "../telegram.ts";

interface ShopData { offers: Offer[]; exchange: { rub: Record<Currency, number>; fee: number } }

function Exchanger({ ex }: { ex: ShopData["exchange"] }) {
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
      <b className="display">Обменник</b>
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

export function ShopScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { state, act, busy } = useGame();
  const [data, setData] = useState<ShopData | null>(null);
  const tab = (params.get("tab") as string) || "weapons";
  useEffect(() => {
    api.get<ShopData>("/api/shop").then(setData).catch(() => undefined);
  }, []);
  const offers = useMemo(() => data?.offers.filter((o) => o.section === tab) ?? [], [data, tab]);
  const setTab = (t: string) => router.replace(`/shop?tab=${t}`, { scroll: false });

  const buy = async (o: Offer) => {
    haptic.tap();
    await act("buy", { offerId: o.id, idem: crypto.randomUUID() }, `Куплено: ${o.title}`);
  };

  return (
    <div>
      <div className="title">
        <h1 className="display">Магазин</h1>
        <Link href="/" className="back">← Дом</Link>
      </div>
      <div className="tabs">
        {[...SHOP_SECTIONS, { id: "exchange", name: "Обменник" }].map((s) => (
          <button key={s.id} className={tab === s.id ? "on" : ""} onClick={() => setTab(s.id)}>{s.name}</button>
        ))}
      </div>
      {tab === "exchange" ? (
        data && <Exchanger ex={data.exchange} />
      ) : (
        <div className="shop-grid">
          {offers.map((o) => {
            const def = o.give.item ? itemById(o.give.item) : null;
            const owned = def ? invQty(state, def.id) : 0;
            const full = def ? owned + o.give.qty > def.maxStack : false;
            const can = (state?.wallet[o.price.currency] ?? 0) >= o.price.amount;
            return (
              <div key={o.id} className={`offer rar-${def?.rarity ?? "common"}`}>
                {o.note && <span className="offer-note">{o.note}</span>}
                <div className="offer-art">{def ? <ItemArt id={def.id} size={56} /> : <Icon name="energy" size={56} />}</div>
                <b className="small">{o.title}</b>
                {def?.weapon && <span className="tiny muted">урон {def.weapon.damage}</span>}
                {def && def.maxStack > 1 && <span className="tiny dim">есть: {owned}</span>}
                {def && def.maxStack === 1 && owned > 0 && <span className="tiny" style={{ color: "var(--green)" }}>уже есть</span>}
                <button className="btn sm gold block" disabled={!can || full || busy === "buy"} onClick={() => buy(o)}>
                  <Icon name={o.price.currency} size={16} />
                  {money(o.price.currency, o.price.amount)}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {tab !== "exchange" && <p className="tiny muted center" style={{ marginTop: 12 }}>Все цены — во внутриигровой валюте. Не хватает? Загляни в обменник.</p>}
    </div>
  );
}
