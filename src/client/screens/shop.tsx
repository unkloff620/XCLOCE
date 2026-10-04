"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { invQty, useGame } from "../store.tsx";
import { api } from "../api.ts";
import { type Offer } from "../../content/shop.ts";
import { Modal } from "../ui.tsx";
import { Help, HelpList } from "../help.tsx";
import type { Currency } from "../../content/currencies.ts";
import { itemById } from "../../content/items.ts";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { money } from "../format.ts";
import { haptic } from "../telegram.ts";

export interface ShopData { offers: Offer[]; exchange: { rub: Record<Currency, number>; fee: number } }

/** Clickable things in the shop scene (percent of the 941×1672 background), as in the artist's layout reference. */
const SHOP_SPOTS = [
  { id: "weapons", img: "shelf", name: "Оружие", sections: ["weapons"], left: -18, top: 12, width: 68, hint: "Стеллаж с оружием: мыши, свечи, клавиатуры, видеокарты и Rug Pull Gun." },
  { id: "clothing", img: "rack", name: "Одежда", sections: ["clothing"], left: 40.4, top: 33.5, width: 28.7, hint: "Вешалка с вещами: футболки, кепки и прочее для персонажа." },
  { id: "energy", img: "drinks", name: "Энергия", sections: ["energy", "misc"], left: 81.8, top: 31.5, width: 23.5, hint: "Энергетики на прилавке: энергия для заданий и полезные мелочи." },
] as const;

function OfferGrid({ offers }: { offers: Offer[] }) {
  const { state, act, busy } = useGame();
  const buy = async (o: Offer) => {
    haptic.tap();
    await act("buy", { offerId: o.id, idem: crypto.randomUUID() }, `Куплено: ${o.title}`);
  };
  return (
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
  );
}

export function ShopScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<ShopData | null>(null);
  // ?tab=weapons|clothing|energy|misc opens that window right away (links from the boss screen, wardrobe, …)
  const asked = params.get("tab") ?? "";
  const open = SHOP_SPOTS.find((x) => (x.sections as readonly string[]).includes(asked)) ?? null;
  useEffect(() => {
    api.get<ShopData>("/api/shop").then(setData).catch(() => undefined);
  }, []);
  const offers = useMemo(() => (open ? data?.offers.filter((o) => (open.sections as readonly string[]).includes(o.section)) ?? [] : []), [data, open]);
  const setOpen = (id: string | null) => router.replace(id ? `/shop?tab=${id}` : "/shop", { scroll: false });

  return (
    <div className="fit-page">
      <div className="title">
        <div className="title-row">
          <Link href="/yard" className="back-btn" aria-label="Во двор">‹</Link>
          <h1 className="display">Магазин</h1>
          <Help topic="shop" title="Магазин">
            <HelpList title="Что где лежит" rows={SHOP_SPOTS.map((x) => ({ key: x.id, icon: /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/assets/shop/${x.img}.webp`} alt="" width={44} height={44} style={{ objectFit: "contain" }} />, name: x.name, hint: x.hint }))} />
            <p className="small muted">Нажми на стеллаж, вешалку или энергетики — откроется витрина. Все цены во внутриигровой валюте; не хватает — загляни в обменник.</p>
          </Help>
        </div>
      </div>
      <div className="yard shop-scene">
        <div className="scene-backdrop" style={{ backgroundImage: "url(/assets/shop/bg.webp)" }} />
        <div className="yard-stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="yard-bg" src="/assets/shop/bg.webp" alt="" draggable={false} />
          {SHOP_SPOTS.map((x) => (
            <button key={x.id} className="shop-spot" style={{ left: `${x.left}%`, top: `${x.top}%`, width: `${x.width}%` }} onClick={() => setOpen(x.id)} aria-label={x.name} title={x.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/assets/shop/${x.img}.webp`} alt="" draggable={false} />
            </button>
          ))}
        </div>
      </div>
      {open && (
        <Modal title={open.name} onClose={() => setOpen(null)} wide>
          {data ? <OfferGrid offers={offers} /> : <div className="muted small center">Загрузка…</div>}
          <p className="tiny muted center" style={{ marginTop: 12 }}>Не хватает валюты? Загляни в <Link href="/exchange" style={{ textDecoration: "underline" }}>обменник</Link>.</p>
        </Modal>
      )}
    </div>
  );
}
