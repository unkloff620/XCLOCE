"use client";
import { useEffect, useState } from "react";
import { invQty, liveEnergy, useGame, useNow } from "../store.tsx";
import { api } from "../api.ts";
import { Modal } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { clock, money } from "../format.ts";
import { haptic } from "../telegram.ts";
import { ITEMS } from "../../content/items.ts";
import type { Offer } from "../../content/shop.ts";
import type { ShopData } from "./shop.tsx";

/** Opened from the energy chip in the HUD: buy energy or drink what is in the inventory. */
export function EnergyWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const now = useNow();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  useEffect(() => {
    api.get<ShopData>("/api/shop").then((d) => setOffers(d.offers.filter((o) => o.section === "energy"))).catch(() => setOffers([]));
  }, []);
  if (!state) return null;
  const e = liveEnergy(state, now);
  const drinks = ITEMS.filter((i) => i.use?.energy && invQty(state, i.id) > 0);
  const buy = async (o: Offer) => {
    haptic.tap();
    await act("buy", { offerId: o.id, idem: crypto.randomUUID() }, `+${o.give.energy} энергии`);
  };
  return (
    <Modal title="Энергия" onClose={onClose}>
      <div className="col" style={{ gap: 12 }}>
        <div className="energy-head">
          <Icon name="energy" size={44} />
          <div>
            <div className="display" style={{ fontSize: 26 }}>
              {e.energy}<span className="muted" style={{ fontSize: 16 }}> / {state.player.energyMax}</span>
            </div>
            <div className="tiny muted">
              {e.nextIn > 0 ? <>+1 через {clock(e.nextIn)} · +1 каждые 5 минут</> : e.energy > state.player.energyMax ? "Сверх лимита — сама не растёт" : "Полная"}
            </div>
          </div>
        </div>
        <div className="tiny muted">Энергия тратится только в локациях. Купленная энергия добавляется сверх лимита.</div>

        {drinks.length > 0 && (
          <div className="col" style={{ gap: 6 }}>
            <b className="small">Из инвентаря</b>
            {drinks.map((d) => (
              <div key={d.id} className="energy-row">
                <ItemArt id={d.id} size={38} />
                <div className="grow">
                  <b className="small">{d.name}</b>
                  <div className="tiny muted">+{d.use!.energy} · есть {invQty(state, d.id)}</div>
                </div>
                <button className="btn sm green" disabled={busy === "use"} onClick={() => act("use", { itemId: d.id }, `+${d.use!.energy} энергии`)}>Выпить</button>
              </div>
            ))}
          </div>
        )}

        <div className="col" style={{ gap: 6 }}>
          <b className="small">Купить</b>
          {!offers && <div className="tiny muted">Загружаем…</div>}
          {offers?.map((o) => {
            const can = (state.wallet[o.price.currency] ?? 0) >= o.price.amount;
            return (
              <div key={o.id} className="energy-row">
                <Icon name="energy" size={38} />
                <div className="grow">
                  <b className="small">{o.title}</b>
                  {o.note && <div className="tiny muted">{o.note}</div>}
                </div>
                <button className="btn sm gold" disabled={!can || busy === "buy"} onClick={() => buy(o)}>
                  <Icon name={o.price.currency} size={16} />
                  {money(o.price.currency, o.price.amount)}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
