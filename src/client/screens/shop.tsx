"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { invQty, useGame } from "../store.tsx";
import { api } from "../api.ts";
import { SHOP_SECTIONS, type Offer } from "../../content/shop.ts";
import type { Currency } from "../../content/currencies.ts";
import { itemById } from "../../content/items.ts";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { money } from "../format.ts";
import { haptic } from "../telegram.ts";

export interface ShopData { offers: Offer[]; exchange: { rub: Record<Currency, number>; fee: number } }

export function ShopScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { state, act, busy } = useGame();
  const [data, setData] = useState<ShopData | null>(null);
  const asked = params.get("tab") ?? "";
  const tab = SHOP_SECTIONS.some((x) => x.id === asked) ? asked : "weapons";
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
        <div>
          <Link href="/yard" className="back">← Двор</Link>
          <h1 className="display">Магазин</h1>
        </div>
      </div>
      <div className="tabs">
        {SHOP_SECTIONS.map((s) => (
          <button key={s.id} className={tab === s.id ? "on" : ""} onClick={() => setTab(s.id)}>{s.name}</button>
        ))}
      </div>
      {(
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
      <p className="tiny muted center" style={{ marginTop: 12 }}>Все цены — во внутриигровой валюте. Не хватает? Загляни в <Link href="/exchange" style={{ textDecoration: "underline" }}>обменник</Link>.</p>
    </div>
  );
}
