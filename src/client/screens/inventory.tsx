"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGame } from "../store.tsx";
import { CATEGORY_NAME, itemById, RARITY_NAME, type Category, type ItemDef } from "../../content/items.ts";
import { ItemArt } from "../art/items.tsx";
import { Coin, Empty, Modal } from "../ui.tsx";
import { haptic } from "../telegram.ts";

const CATS: (Category | "all")[] = ["all", "weapon", "clothing", "item", "reward", "event"];
const CAT_LABEL = { all: "Всё", ...CATEGORY_NAME };

/** Selling yard finds back for RUB. */
function SellBox({ id, have, price }: { id: string; have: number; price: number }) {
  const { act, busy } = useGame();
  const [n, setN] = useState(1);
  const qty = Math.max(1, Math.min(n, have));
  if (have < 1) return null;
  const sell = async () => {
    const r = await act<{ got: number }>("sell", { itemId: id, qty }, (x) => `Продано за ${x.got} ₽`);
    if (r) {
      haptic.ok();
      setN(1);
    }
  };
  return (
    <div className="sell-box">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small muted">Продать · {price} ₽ за шт.</span>
        <b><Coin c="RUB" v={price * qty} /></b>
      </div>
      <div className="row">
        <button className="btn sm dark" onClick={() => setN(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button>
        <span className="num grow center"><b>{qty}</b> / {have}</span>
        <button className="btn sm dark" onClick={() => setN(Math.min(have, qty + 1))} disabled={qty >= have}>+</button>
        <button className="btn sm dark" onClick={() => setN(have)}>Все</button>
      </div>
      <button className="btn gold block" disabled={busy === "sell"} onClick={sell}>Продать ×{qty}</button>
    </div>
  );
}

export function InventoryScreen() {
  const { state, act, busy } = useGame();
  const router = useRouter();
  const [cat, setCat] = useState<Category | "all">("all");
  const [open, setOpen] = useState<ItemDef | null>(null);
  if (!state) return null;
  const items = state.inventory.map((i) => ({ def: itemById(i.id)!, qty: i.qty })).filter((x) => x.def && (cat === "all" || x.def.category === cat));
  const order: Category[] = ["weapon", "clothing", "item", "reward", "event"];
  items.sort((a, b) => order.indexOf(a.def.category) - order.indexOf(b.def.category) || (b.def.weapon?.damage ?? 0) - (a.def.weapon?.damage ?? 0));
  const qtyOf = (id: string) => state.inventory.find((i) => i.id === id)?.qty ?? 0;
  const worn = open?.slot ? state.look.equipped[open.slot] === open.id : false;

  return (
    <div>
      <div className="title">
        <h1 className="display">Инвентарь</h1>
        <span className="small muted">{state.inventory.length} видов</span>
      </div>
      <div className="tabs">
        {CATS.map((c) => (
          <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{CAT_LABEL[c]}</button>
        ))}
      </div>
      {items.length === 0 ? (
        <Empty>{cat === "event" ? "Ивентовые вещи появятся с первыми событиями." : "Здесь пока пусто."}</Empty>
      ) : (
        <div className="inv-grid">
          {items.map(({ def, qty }) => (
            <button key={def.id} className={`inv-cell rar-${def.rarity} ${def.slot && state.look.equipped[def.slot] === def.id ? "worn" : ""}`} onClick={() => setOpen(def)}>
              <ItemArt id={def.id} size={44} />
              <span className="inv-name">{def.name}</span>
              {def.maxStack > 1 && <span className="inv-qty num">×{qty}</span>}
            </button>
          ))}
        </div>
      )}
      {open && (
        <Modal title={open.name} onClose={() => setOpen(null)}>
          <div className={`item-card rar-${open.rarity}`}>
            <div className="item-art"><ItemArt id={open.id} size={96} /></div>
            <div className="row" style={{ justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
              <span className="chip" style={{ color: "var(--rar)" }}>{RARITY_NAME[open.rarity]}</span>
              <span className="chip">{CATEGORY_NAME[open.category]}</span>
              {open.maxStack > 1 && <span className="chip">×{qtyOf(open.id)}{open.maxStack < 999 ? "" : " / 999"}</span>}
            </div>
            {open.weapon && (
              <div className="row" style={{ justifyContent: "center", gap: 6 }}>
                <span className="chip red">Урон: {open.weapon.damage}</span>
                <span className="chip">{open.weapon.kind === "permanent" ? `перезарядка ${open.weapon.cooldownMin} мин` : "расходник"}</span>
              </div>
            )}
            <p className="center" style={{ margin: "10px 0" }}>{open.description}</p>
            <div className="tiny muted center">Откуда: {open.sources.join(", ")}</div>
            <div className="col" style={{ marginTop: 12, gap: 8 }}>
              {open.weapon && (
                <button className="btn red block" onClick={() => router.push(state.fight ? `/bosses/${state.fight.bossId}` : "/bosses")}>
                  {open.weapon.action} — к боссу
                </button>
              )}
              {open.use && (
                <button className="btn green block" disabled={busy === "use" || qtyOf(open.id) < 1} onClick={() => act("use", { itemId: open.id }, `+${open.use?.energy} энергии`)}>
                  Использовать
                </button>
              )}
              {open.slot && (
                <button className="btn violet block" disabled={!!busy} onClick={() => act(worn ? "unequip" : "equip", worn ? { slot: open.slot } : { itemId: open.id }, worn ? "Снято" : "Надето")}>
                  {worn ? "Снять" : "Надеть"}
                </button>
              )}
              {!!state.sell[open.id] && <SellBox key={open.id} id={open.id} have={qtyOf(open.id)} price={state.sell[open.id]} />}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
