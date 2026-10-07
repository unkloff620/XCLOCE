"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { invQty, useGame } from "../store.tsx";
import { api } from "../api.ts";
import { BULK, bulkPrice, type Offer } from "../../content/shop.ts";
import { Modal } from "../ui.tsx";
import { Help, HelpList } from "../help.tsx";
import type { Currency } from "../../content/currencies.ts";
import { itemById, type Slot } from "../../content/items.ts";
import { unlockBossOf } from "../../content/bosses.ts";
import { EnergyArt, ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { money } from "../format.ts";
import { haptic } from "../telegram.ts";
import { weaponStats } from "../weapon-stats.ts";
import { ShopScene } from "./shop-scene.tsx";

export interface ShopData { offers: Offer[]; exchange: { rub: Record<Currency, number>; fee: number } }

/** The goods in the shop scene (screens/shop-scene.tsx): the weapons on the counter, the clothes rack, the energy drinks. */
const SHOP_SPOTS = [
  { id: "weapons", img: "weapons", name: "Оружие", sections: ["weapons"], hint: "Оружие на прилавке: мыши, свечи, клавиатуры, видеокарты и Rug Pull Gun." },
  { id: "clothing", img: "rack", name: "Одежда", sections: ["clothing"], hint: "Вешалка с вещами: футболки, кепки и прочее для персонажа." },
  { id: "energy", img: "drinks", name: "Энергия", sections: ["energy", "misc"], hint: "Энергетики на полке: энергия для заданий и полезные мелочи." },
] as const;

/** A locked thing: which boss drops it, and that it is bought here after it drops. */
function LockedInfo({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const def = itemById(itemId)!;
  const boss = unlockBossOf(itemId)!;
  return (
    <Modal title={def.name} onClose={onClose}>
      <div className="col" style={{ gap: 10, alignItems: "center", textAlign: "center" }}>
        <div className="locked-art"><ItemArt id={itemId} size={84} /><span className="locked-badge"><Icon name="lock" size={22} /></span></div>
        <p className="small" style={{ margin: 0 }}>{def.description}</p>
        <div className="panel col" style={{ gap: 6, width: "100%" }}>
          <b>Где получить</b>
          <span className="small">Выпадает с босса <b>{boss.name}</b> (№{boss.order}). Победи его — вещь откроется здесь, в магазине, и её можно будет выкупить.</span>
          <span className="tiny muted">Шанс — секрет. Не везёт {boss.wear?.pity ?? 10} побед подряд — вещь откроется точно. Нужно нанести в бою хотя бы 1% здоровья босса.</span>
        </div>
        <Link href={`/bosses/${boss.id}`} className="btn red block" onClick={onClose}>К боссу {boss.name}</Link>
      </div>
    </Modal>
  );
}

/** clothes on the rack go from the head down; the filter row shows these as icons */
const WEAR_GROUPS: { slot: Slot; name: string; icon: string }[] = [
  { slot: "HEAD", name: "Голова", icon: "slot-head" },
  { slot: "SHIRT", name: "Верх", icon: "slot-shirt" },
  { slot: "PANTS", name: "Низ", icon: "slot-pants" },
  { slot: "SHOES", name: "Обувь", icon: "slot-shoes" },
  { slot: "ACCESSORY", name: "Аксессуары", icon: "slot-accessory" },
];

/** the filter row above the clothes: everything, or one slot */
function SlotRow({ slot, onPick }: { slot: Slot | null; onPick: (s: Slot | null) => void }) {
  const pick = (s: Slot | null) => { haptic.tap(); onPick(s); };
  return (
    <div className="slot-row" role="radiogroup" aria-label="Что показать">
      <button role="radio" aria-checked={slot === null} aria-label="Всё" title="Всё" className={`slot-btn${slot === null ? " on" : ""}`} onClick={() => pick(null)}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      </button>
      {WEAR_GROUPS.map((g) => (
        <button key={g.slot} role="radio" aria-checked={slot === g.slot} aria-label={g.name} title={g.name} className={`slot-btn${slot === g.slot ? " on" : ""}`} onClick={() => pick(g.slot)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/ui/${g.icon}.webp`} alt="" width={30} height={30} draggable={false} />
        </button>
      ))}
    </div>
  );
}

/** the batch row above the weapons: 1, 10, 100, 1000 — the price on every card follows it */
function BatchRow({ qty, onPick }: { qty: number; onPick: (n: number) => void }) {
  return (
    <div className="batch-row" role="radiogroup" aria-label="Сколько штук">
      {BULK.map((b) => (
        <button key={b.qty} role="radio" aria-checked={qty === b.qty} className={`batch-btn${qty === b.qty ? " on" : ""}`} onClick={() => { haptic.tap(); onPick(b.qty); }}>
          <b className="num">×{b.qty}</b>
          {b.off > 0 && <span className="batch-off">−{Math.round(b.off * 100)}%</span>}
        </button>
      ))}
    </div>
  );
}

function OfferGrid({ offers, rub }: { offers: Offer[]; rub?: Record<Currency, number> }) {
  const [batch, setBatch] = useState(1);
  const bulk = offers.some((o) => o.bulk);
  const wear = offers.length > 0 && offers.every((o) => o.section === "clothing");
  const [slot, setSlot] = useState<Slot | null>(null);
  if (wear) {
    // by slot (head, top, bottom, shoes, accessories), cheaper first inside a slot
    const val = (o: Offer) => o.price.amount * (rub?.[o.price.currency] ?? 1);
    const order = (o: Offer) => WEAR_GROUPS.findIndex((g) => g.slot === itemById(o.give.item ?? "")?.slot);
    const shown = offers
      .filter((o) => slot === null || itemById(o.give.item ?? "")?.slot === slot)
      .sort((a, b) => order(a) - order(b) || val(a) - val(b));
    return (
      <>
        <SlotRow slot={slot} onPick={setSlot} />
        {shown.length > 0 ? <Cards offers={shown} batch={1} /> : <p className="small muted center">Здесь пока пусто</p>}
      </>
    );
  }
  return (
    <>
      {bulk && <BatchRow qty={batch} onPick={setBatch} />}
      <Cards offers={offers} batch={batch} />
    </>
  );
}

function Cards({ offers, batch }: { offers: Offer[]; batch: number }) {
  const { state, act, busy } = useGame();
  const [info, setInfo] = useState<string | null>(null);
  const buy = async (o: Offer, n: number) => {
    haptic.tap();
    await act("buy", n > 1 ? { offerId: o.id, qty: n, idem: crypto.randomUUID() } : { offerId: o.id, idem: crypto.randomUUID() }, `Куплено: ${o.title}${n > 1 ? ` ×${n}` : ""}`);
  };
  return (
    <div className="shop-grid">
      {offers.map((o) => {
        const n = o.bulk ? batch : 1;
        const amount = n > 1 ? bulkPrice(o.price.currency, o.price.amount, n) : o.price.amount;
        const def = o.give.item ? itemById(o.give.item) : null;
        const owned = def ? invQty(state, def.id) : 0;
        const full = def ? owned + o.give.qty * n > def.maxStack : false;
        const can = (state?.wallet[o.price.currency] ?? 0) >= amount;
        // things from bosses are sold only after they dropped (or if already owned)
        const boss = def ? unlockBossOf(def.id) : null;
        const locked = !!boss && owned === 0 && !state?.unlocks?.includes(def!.id);
        if (locked) {
          return (
            <button key={o.id} className={`offer locked rar-${def!.rarity}`} onClick={() => setInfo(def!.id)} aria-label={`${o.title}: закрыто, выпадает с босса ${boss!.name}`}>
              <div className="offer-art"><ItemArt id={def!.id} size={56} /><span className="locked-badge"><Icon name="lock" size={18} /></span></div>
              <b className="small">{o.title}</b>
              <span className="tiny muted">с босса {boss!.name}</span>
              <span className="btn sm dark block">Где взять</span>
            </button>
          );
        }
        return (
          <div key={o.id} className={`offer rar-${def?.rarity ?? "common"}`}>
            {o.note && <span className="offer-note">{o.note}</span>}
            {o.bulk && <span className="offer-batch num">×{n}</span>}
            <div className="offer-art">{def ? <ItemArt id={def.id} size={56} /> : <EnergyArt amount={o.give.energy ?? 0} size={56} />}</div>
            <b className="small">{o.title}</b>
            {def?.weapon && <span className="tiny muted" title={`база ${def.weapon.damage}`}>урон {weaponStats(state, def.id).damage}</span>}
            {def && def.maxStack > 1 && <span className="tiny dim">есть: {owned}</span>}
            {def && def.maxStack === 1 && owned > 0 && <span className="tiny" style={{ color: "var(--green)" }}>уже есть</span>}
            <button className="btn sm gold block" disabled={!can || full || busy === "buy"} onClick={() => buy(o, n)}>
              <Icon name={o.price.currency} size={16} />
              {money(o.price.currency, amount)}
            </button>
          </div>
        );
      })}
      {info && <LockedInfo itemId={info} onClose={() => setInfo(null)} />}
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
            <HelpList title="Что где лежит" rows={SHOP_SPOTS.map((x) => ({ key: x.id, icon: /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/assets/shop/v2/${x.img}.webp`} alt="" width={44} height={44} style={{ objectFit: "contain" }} />, name: x.name, hint: x.hint }))} />
            <p className="small muted">Нажми на оружие на прилавке, вешалку или энергетики на полке — они подсвечены — откроется витрина. Все цены во внутриигровой валюте; не хватает — загляни в обменник.</p>
          </Help>
        </div>
      </div>
      <div className="yard shop-scene">
        <div className="scene-backdrop" style={{ backgroundImage: "url(/assets/shop/v2/room.webp)" }} />
        <div className="yard-stage">
          <ShopScene onOpen={(id) => setOpen(id)} />
        </div>
      </div>
      {open && (
        <Modal title={open.name} onClose={() => setOpen(null)} wide>
          {data ? <OfferGrid offers={offers} rub={data.exchange.rub} /> : <div className="muted small center">Загрузка…</div>}
          <p className="tiny muted center" style={{ marginTop: 12 }}>Не хватает валюты? Загляни в <Link href="/exchange" style={{ textDecoration: "underline" }}>обменник</Link>.</p>
        </Modal>
      )}
    </div>
  );
}

/** The weapons shelf as a window over the current screen (from the fight: buy and go on hitting where you were). */
export function WeaponShopWindow({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ShopData | null>(null);
  useEffect(() => {
    api.get<ShopData>("/api/shop").then(setData).catch(() => undefined);
  }, []);
  const offers = data?.offers.filter((o) => o.section === "weapons") ?? [];
  return (
    <Modal title="Оружие" onClose={onClose} wide>
      {data ? <OfferGrid offers={offers} rub={data.exchange.rub} /> : <div className="muted small center">Загрузка…</div>}
      <p className="tiny muted center" style={{ marginTop: 12 }}>Не хватает валюты? Нажми на любую валюту вверху — откроется обменник.</p>
    </Modal>
  );
}
