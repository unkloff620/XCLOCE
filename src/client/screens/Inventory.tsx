"use client";
import { useMemo, useState } from "react";
import { useGame } from "../store.tsx";
import { ITEMS, RARITY_ORDER, SLOTS, itemById, type Slot } from "../../shared/items.ts";
import { ItemIcon } from "../art/items.tsx";
import { Hero } from "../art/hero.tsx";
import { PriceTag, RARITY_LABEL, Sheet, Tabs, fmtNum } from "../ui.tsx";

const SLOT_LABEL: Record<Slot, string> = { weapon: "Оружие", hat: "Голова", glasses: "Очки", jacket: "Куртка", chain: "Цепь" };
type Filter = "all" | "gear" | "items" | "keys";

export function InventoryScreen() {
  const { game, openItem } = useGame();
  const [filter, setFilter] = useState<Filter>("all");
  const items = useMemo(() => {
    if (!game) return [];
    const list = game.inventory.map((i) => ({ ...i, def: itemById(i.id) })).filter((i) => i.def);
    const f = list.filter((i) => {
      const k = i.def!.kind;
      if (filter === "gear") return SLOTS.includes(k as Slot);
      if (filter === "keys") return k === "key";
      if (filter === "items") return k === "consumable" || k === "chest" || k === "theme";
      return true;
    });
    return f.sort((a, b) => RARITY_ORDER.indexOf(b.def!.rarity) - RARITY_ORDER.indexOf(a.def!.rarity));
  }, [game, filter]);
  if (!game) return null;
  const lo = game.player.loadout;
  const cells = Math.max(25, Math.ceil(items.length / 5) * 5);

  return (
    <div className="screen">
      <div className="screen-title">
        <h2 className="comic">INVENTORY</h2>
        <span className="muted small">{game.inventory.length} предметов</span>
      </div>
      <section className="panel equip-panel">
        <div className="equip-hero"><Hero loadout={lo} size={110} /></div>
        <div className="equip-slots">
          {SLOTS.map((s) => (
            <button key={s} className={`slot ${lo[s] ? `r-${itemById(lo[s]!)?.rarity}` : ""}`} onClick={() => lo[s] && openItem(lo[s]!)}>
              {lo[s] ? <ItemIcon id={lo[s]!} size={40} /> : <span className="slot-empty">+</span>}
              <small>{SLOT_LABEL[s]}</small>
            </button>
          ))}
          <div className="power-chip comic">⚔ {fmtNum(game.player.power)}</div>
        </div>
      </section>
      <Tabs<Filter> value={filter} onChange={setFilter} options={[{ value: "all", label: "Всё" }, { value: "gear", label: "Экипировка" }, { value: "items", label: "Предметы" }, { value: "keys", label: "Ключи" }]} />
      <div className="inv-grid">
        {Array.from({ length: cells }, (_, i) => {
          const it = items[i];
          if (!it) return <div key={`e${i}`} className="cell empty" />;
          const equipped = Object.values(lo).includes(it.id);
          return (
            <button key={it.id} className={`cell r-${it.def!.rarity} ${equipped ? "equipped" : ""}`} onClick={() => openItem(it.id)}>
              <ItemIcon id={it.id} size={46} />
              {it.qty > 1 && <span className="qty">{it.qty}</span>}
              {equipped && <span className="eq">E</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ItemSheet() {
  const { itemSheet, openItem, game, act, busy, openSheet } = useGame();
  const it = itemSheet ? itemById(itemSheet) : undefined;
  if (!game || !it) return null;
  const owned = game.inventory.find((i) => i.id === it.id)?.qty ?? 0;
  const isGear = SLOTS.includes(it.kind as Slot);
  const equipped = isGear && game.player.loadout[it.kind as Slot] === it.id;
  const close = () => openItem(null);
  return (
    <Sheet open onClose={close} title={it.name}>
      <div className={`item-hero r-${it.rarity}`}>
        <ItemIcon id={it.id} size={110} />
      </div>
      <div className="row-c gap center-row">
        <span className={`rarity-chip r-${it.rarity}`}>{RARITY_LABEL[it.rarity]}</span>
        {it.power ? <span className="power-chip comic">+{it.power} ⚔</span> : null}
        {it.energy ? <span className="power-chip comic">+{it.energy} ⚡</span> : null}
        {owned > 1 && <span className="muted">×{owned}</span>}
      </div>
      <p className="center">{it.description}</p>
      {isGear && owned > 0 && (
        equipped
          ? <button className="btn-dark comic" disabled={!!busy} onClick={() => act("unequip", { slot: it.kind }, "Снято")}>СНЯТЬ</button>
          : <button className="btn-green comic" disabled={!!busy} onClick={async () => { if (await act("equip", { itemId: it.id }, "Надето!")) close(); }}>НАДЕТЬ</button>
      )}
      {(it.kind === "consumable" || it.kind === "chest") && owned > 0 && (
        <button className="btn-green comic" disabled={!!busy} onClick={() => act("use", { itemId: it.id }, (r: { energy?: number; loot?: { reward: { currency: string; amount: number } | null; item: string | null } }) =>
          r.energy ? `+${r.energy} энергии` : r.loot?.item ? `Выпало: ${itemById(r.loot.item)?.name}` : r.loot?.reward ? `Выпало: ${fmtNum(r.loot.reward.amount)} ${r.loot.reward.currency}` : "Готово")}>
          {it.kind === "chest" ? "ОТКРЫТЬ" : "ИСПОЛЬЗОВАТЬ"}
        </button>
      )}
      {it.kind === "theme" && (owned > 0 || it.id === "t-default") && (
        <button className="btn-green comic" disabled={!!busy || game.player.theme === it.id} onClick={() => act("theme", { itemId: it.id }, "Комната изменена")}>
          {game.player.theme === it.id ? "УСТАНОВЛЕНО" : "ПРИМЕНИТЬ"}
        </button>
      )}
      {it.kind === "key" && <p className="muted small center">Собери 3 ключа и открой следующего босса во вкладке Boss.</p>}
      {owned === 0 && it.price && (
        <button className="btn-yellow comic" onClick={() => { close(); openSheet("shop"); }}>В МАГАЗИН · <PriceTag price={it.price} size={16} /></button>
      )}
    </Sheet>
  );
}

export { ITEMS };
