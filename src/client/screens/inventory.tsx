"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGame } from "../store.tsx";
import { CATEGORY_NAME, itemById, RARITY_NAME, type Category, type ItemDef } from "../../content/items.ts";
import { ItemArt } from "../art/items.tsx";
import { Coin, Empty, Modal } from "../ui.tsx";
import { haptic } from "../telegram.ts";
import { Icon } from "../art/icons.tsx";
import { BASE_CRIT_MULT } from "../../content/home.ts";
import { weaponTalentBonus } from "../../content/talents.ts";
import { TalentNext, TalentWindow } from "./talents.tsx";

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
  // talents: a cell of their own (with "all" and "rewards"), its window leads to the talent tree
  const [talInfo, setTalInfo] = useState(false);
  const [talents, setTalents] = useState(false);
  if (!state) return null;
  const showTalents = cat === "all" || cat === "reward";
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
      {items.length === 0 && !showTalents ? (
        <Empty>{cat === "event" ? "Ивентовые вещи появятся с первыми событиями." : "Здесь пока пусто."}</Empty>
      ) : (
        <div className="inv-grid">
          {showTalents && (
            <button className="inv-cell rar-epic" onClick={() => setTalInfo(true)}>
              <Icon name="talent" size={44} />
              <span className="inv-name">Таланты</span>
              <span className="inv-qty num">×{state.player.talents}</span>
            </button>
          )}
          {items.map(({ def, qty }) => (
            <button key={def.id} className={`inv-cell rar-${def.rarity} ${def.slot && state.look.equipped[def.slot] === def.id ? "worn" : ""}`} onClick={() => setOpen(def)}>
              <ItemArt id={def.id} size={44} />
              <span className="inv-name">{def.name}</span>
              {def.maxStack > 1 && <span className="inv-qty num">×{qty}</span>}
            </button>
          ))}
        </div>
      )}
      {talInfo && (
        <Modal title="Таланты" onClose={() => setTalInfo(false)}>
          <div className="item-card rar-epic">
            <div className="item-art"><Icon name="talent" size={96} /></div>
            <div className="row" style={{ justifyContent: "center", gap: 6 }}>
              <span className="chip">свободно: <b className="num">{state.player.talents}</b></span>
            </div>
            <p className="center" style={{ margin: "10px 0" }}>Таланты дают за урон по боссам — счётчик не сгорает между боями. Ими прокачивается каждое оружие, даже кулак: урон и сила крита.</p>
            <TalentNext dmg={state.player.talentDamage} />
            <button className="btn gold block" style={{ marginTop: 12 }} onClick={() => { setTalInfo(false); setTalents(true); }}>Перейти</button>
          </div>
        </Modal>
      )}
      {talents && <TalentWindow onClose={() => setTalents(false)} />}
      {open && (
        <Modal title={open.name} onClose={() => setOpen(null)}>
          <div className={`item-card rar-${open.rarity}`}>
            <div className="item-art"><ItemArt id={open.id} size={96} /></div>
            <div className="row" style={{ justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
              <span className="chip" style={{ color: "var(--rar)" }}>{RARITY_NAME[open.rarity]}</span>
              <span className="chip">{CATEGORY_NAME[open.category]}</span>
              {open.maxStack > 1 && <span className="chip">×{qtyOf(open.id)}{open.maxStack < 999 ? "" : ` / ${open.maxStack}`}</span>}
            </div>
            {open.weapon && (
              <div className="row" style={{ justifyContent: "center", gap: 6 }}>
                {(() => {
                  // what a hit really does: the home bonus and this weapon's talents
                  const t = weaponTalentBonus(state.weaponTalents ?? {}, open.id);
                  const dmg = Math.round(open.weapon.damage * (1 + state.home.bonus.damage + t.damage));
                  return (
                    <>
                      <span className="chip red" title={`база ${open.weapon.damage}`}>Урон: {dmg}</span>
                      <span className="chip">крит ×{(BASE_CRIT_MULT + state.home.bonus.critDamage + t.critDamage).toFixed(2)}</span>
                    </>
                  );
                })()}
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
