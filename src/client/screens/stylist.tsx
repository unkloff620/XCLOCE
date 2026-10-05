"use client";
import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useGame } from "../store.tsx";
import { ItemArt } from "../art/items.tsx";
import { ITEMS, type Slot } from "../../content/items.ts";
import { HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type Look } from "../../content/home.ts";
import { haptic } from "../telegram.ts";

/*
 * The hero editor right on the home screen: the room and every button go grey, only the hero keeps his colours.
 * Slots stand around him (tap one — his things for it show in the panel below), the second tab changes hair and skin.
 * Everything is a preview until «Сохранить»: then the changed slots are put on / taken off and the look is saved.
 */

export interface StyleDraft {
  look: Look;
  worn: Record<string, string>;
}

const SLOT_NAME: Record<string, string> = { HEAD: "Голова", SHIRT: "Верх", ACCESSORY: "Аксессуар", PANTS: "Штаны", SHOES: "Обувь" };
const LEFT: Slot[] = ["HEAD", "SHIRT", "ACCESSORY"];
const RIGHT: Slot[] = ["PANTS", "SHOES"];

export function Stylist({ draft, setDraft, onClose }: { draft: StyleDraft; setDraft: (d: StyleDraft) => void; onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [tab, setTab] = useState<"clothes" | "look">("clothes");
  const [slot, setSlot] = useState<Slot>("SHIRT");
  const [saving, setSaving] = useState(false);
  if (!state) return null;
  const owned = new Set(state.inventory.map((i) => i.id));
  const items = ITEMS.filter((i) => i.slot === slot && owned.has(i.id));
  const now = state.look.equipped;
  const lookChanged = JSON.stringify(draft.look) !== JSON.stringify(state.look.body);
  const slotsChanged = [...LEFT, ...RIGHT].filter((s) => (draft.worn[s] ?? null) !== (now[s] ?? null));
  const changed = lookChanged || slotsChanged.length > 0;

  const wear = (id: string | null) => {
    haptic.tap();
    const worn = { ...draft.worn };
    if (id) worn[slot] = id;
    else delete worn[slot];
    setDraft({ ...draft, worn });
  };
  const patch = (p: Partial<Look>) => {
    haptic.tap();
    setDraft({ ...draft, look: { ...draft.look, ...p } });
  };
  const save = async () => {
    setSaving(true);
    let ok = true;
    for (const s of slotsChanged) {
      const id = draft.worn[s];
      const r = await act(id ? "equip" : "unequip", id ? { itemId: id } : { slot: s });
      if (r === null) ok = false;
    }
    if (lookChanged) {
      const r = await act("look_set", { ...draft.look });
      if (r === null) ok = false;
    }
    setSaving(false);
    if (ok) {
      haptic.ok();
      onClose();
    }
  };

  const slotBtn = (s: Slot) => {
    const id = draft.worn[s];
    const def = id ? ITEMS.find((i) => i.id === id) : null;
    return (
      <button key={s} className={`sty-slot ${tab === "clothes" && slot === s ? "on" : ""} ${def ? `filled rar-${def.rarity}` : ""}`}
        onClick={() => {
          setTab("clothes");
          setSlot(s);
        }} aria-label={`${SLOT_NAME[s]}: ${def?.name ?? "пусто"}`}>
        {def ? <ItemArt id={def.id} size={38} /> : <span className="sty-plus" aria-hidden="true">+</span>}
        <span className="sty-slot-name">{SLOT_NAME[s]}</span>
      </button>
    );
  };

  return (
    <>
      <div className="sty-top">
        <b className="display">Редактор персонажа</b>
        <button className="btn dark sm" onClick={onClose} aria-label="Закрыть без сохранения">✕</button>
      </div>
      <div className="sty-side left">{LEFT.map(slotBtn)}</div>
      <div className="sty-side right">{RIGHT.map(slotBtn)}</div>

      {/* the panel goes to <body>: the fixed .fit-page is its own stacking layer and would stay under the nav */}
      {createPortal(<div className="sty-panel">
        <div className="sty-tabs">
          <button className={tab === "clothes" ? "on" : ""} onClick={() => setTab("clothes")}>Одежда</button>
          <button className={tab === "look" ? "on" : ""} onClick={() => setTab("look")}>Внешность</button>
        </div>

        {tab === "clothes" ? (
          <div className="sty-body">
            <div className="tiny muted">{SLOT_NAME[slot]}</div>
            <div className="sty-strip">
              <button className={`sty-item none ${!draft.worn[slot] ? "on" : ""}`} onClick={() => wear(null)}>
                <span className="sty-plus" aria-hidden="true">∅</span>
                <span className="sty-item-name">Ничего</span>
              </button>
              {items.map((i) => (
                <button key={i.id} className={`sty-item rar-${i.rarity} ${draft.worn[slot] === i.id ? "on" : ""}`} onClick={() => wear(i.id)}>
                  <ItemArt id={i.id} size={46} />
                  <span className="sty-item-name">{i.name}</span>
                </button>
              ))}
              {items.length === 0 && (
                <Link href="/shop?tab=clothing" className="sty-item shop" onClick={onClose}>
                  <span className="sty-plus" aria-hidden="true">🛒</span>
                  <span className="sty-item-name">В магазин</span>
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="sty-body">
            <div className="sty-row">
              <span className="tiny muted">Причёска</span>
              <div className="sty-opts">
                {HAIR_STYLES.map((h) => (
                  <button key={h.id} className={`look-chip ${draft.look.hair === h.id ? "on" : ""}`} onClick={() => patch({ hair: h.id })}>{h.name}</button>
                ))}
              </div>
            </div>
            {draft.look.hair !== "bald" && (
              <div className="sty-row">
                <span className="tiny muted">Волосы</span>
                <div className="sty-opts">
                  {HAIR_COLORS.map((c, i) => (
                    <button key={c} className={`swatch ${draft.look.hairColor === i ? "on" : ""}`} style={{ background: c }} onClick={() => patch({ hairColor: i })} aria-label={`цвет волос ${i + 1}`} />
                  ))}
                </div>
              </div>
            )}
            <div className="sty-row">
              <span className="tiny muted">Кожа</span>
              <div className="sty-opts">
                {SKIN_TONES.map((t, i) => (
                  <button key={t.base} className={`swatch ${draft.look.skin === i ? "on" : ""}`} style={{ background: t.base }} onClick={() => patch({ skin: i })} aria-label={`тон кожи ${i + 1}`} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="sty-actions">
          <button className="btn dark" onClick={onClose}>Отмена</button>
          <button className="btn green grow" disabled={!changed || saving || !!busy} onClick={save}>{changed ? "Сохранить" : "Без изменений"}</button>
        </div>
      </div>, document.body)}
    </>
  );
}
