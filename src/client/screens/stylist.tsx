"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { RigEdit } from "../art/rig.tsx";
import { createPortal } from "react-dom";
import { useGame } from "../store.tsx";
import { ItemArt } from "../art/items.tsx";
import { ITEMS, type Slot } from "../../content/items.ts";
import { EYE_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type Look } from "../../content/home.ts";
import { haptic } from "../telegram.ts";

/*
 * The hero editor right on the home screen: the room and every button go grey, only the hero keeps his colours,
 * and his parts get gold outlines (the chosen one brighter). Two modes:
 *   «Вещи» — slots around him: head, eyes, mouth, top on the left; hand, bottom, shoes on the right
 *            (mouth shapes and things held in the hand come later, from bosses);
 *   «Тело» — skin, hair and, later, tattoos (they will drop from bosses).
 * Everything is a preview until «Сохранить»: then the changed slots are put on / taken off and the look is saved.
 */

export interface StyleDraft {
  look: Look;
  worn: Record<string, string>;
}

/** editor slots: clothing slots plus the parts edited here (eyes) or coming later (mouth, hand) */
type EditSlot = Slot | "EYES" | "MOUTH";
const SLOT_NAME: Record<string, string> = { HEAD: "Голова", EYES: "Глаза", MOUTH: "Рот", SHIRT: "Верх", HAND: "Кисть", PANTS: "Низ", SHOES: "Обувь" };
const LEFT: EditSlot[] = ["HEAD", "EYES", "MOUTH", "SHIRT"];
const RIGHT: EditSlot[] = ["HAND", "PANTS", "SHOES"];
const CLOTHES: Slot[] = ["HEAD", "SHIRT", "PANTS", "SHOES", "HAND"];
const isClothes = (s: EditSlot): s is Slot => (CLOTHES as string[]).includes(s);

export function Stylist({ draft, setDraft, onClose, onFocus }: { draft: StyleDraft; setDraft: (d: StyleDraft) => void; onClose: () => void; onFocus?: (f: RigEdit) => void }) {
  const { state, act, busy } = useGame();
  const [mode, setModeRaw] = useState<"items" | "body">("items");
  const [slot, setSlotRaw] = useState<EditSlot>("SHIRT");
  const [saving, setSaving] = useState(false);
  // the outlines on the hero follow the mode and the chosen slot
  useEffect(() => onFocus?.({ mode, part: slot }), [mode, slot]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMode = (m: "items" | "body") => { haptic.tap(); setModeRaw(m); };
  const setSlot = (s: EditSlot) => setSlotRaw(s);
  if (!state) return null;
  const owned = new Set(state.inventory.map((i) => i.id));
  const items = ITEMS.filter((i) => i.slot === slot && owned.has(i.id));
  const now = state.look.equipped;
  const lookChanged = JSON.stringify(draft.look) !== JSON.stringify(state.look.body);
  const slotsChanged = CLOTHES.filter((s) => (draft.worn[s] ?? null) !== (now[s] ?? null));
  const changed = lookChanged || slotsChanged.length > 0;

  const wear = (id: string | null) => {
    if (!isClothes(slot)) return;
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

  const slotBtn = (s: EditSlot) => {
    const id = isClothes(s) ? draft.worn[s] : undefined;
    const def = id ? ITEMS.find((i) => i.id === id) : null;
    const soon = s === "MOUTH";
    return (
      <button key={s} className={`sty-slot ${slot === s ? "on" : ""} ${def ? `filled rar-${def.rarity}` : ""} ${soon ? "soon" : ""}`}
        onClick={() => { haptic.tap(); setSlot(s); }} aria-label={`${SLOT_NAME[s]}: ${def?.name ?? "пусто"}`}>
        {def ? <ItemArt id={def.id} size={38} />
          : s === "EYES" ? <span className="sty-eye" style={{ ["--iris" as string]: EYE_COLORS[draft.look.eyes] ?? EYE_COLORS[0] }} aria-hidden="true" />
          : <span className="sty-plus" aria-hidden="true">{soon ? "…" : "+"}</span>}
        <span className="sty-slot-name">{SLOT_NAME[s]}</span>
      </button>
    );
  };

  return (
    <>
      {mode === "items" && <div className="sty-side left">{LEFT.map(slotBtn)}</div>}
      {mode === "items" && <div className="sty-side right">{RIGHT.map(slotBtn)}</div>}

      {/* the panel goes to <body>: the fixed .fit-page is its own stacking layer and would stay under the nav */}
      {createPortal(<div className="sty-panel">
        <div className="sty-head">
          <div className="sty-tabs two">
            <button className={mode === "items" ? "on" : ""} onClick={() => setMode("items")}>Вещи</button>
            <button className={mode === "body" ? "on" : ""} onClick={() => setMode("body")}>Тело</button>
          </div>
          <button className="sty-x" onClick={onClose} aria-label="Закрыть без сохранения">✕</button>
        </div>

        {mode === "items" && slot === "MOUTH" ? (
          <div className="sty-body">
            <div className="tiny muted">{SLOT_NAME[slot]}</div>
            <div className="sty-soon-box">
              <b>Скоро</b>
              <span className="small">Формы рта появятся в одном из следующих обновлений.</span>
            </div>
          </div>
        ) : mode === "items" && isClothes(slot) ? (
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
        ) : mode === "items" ? (
          <div className="sty-body">
            <div className="sty-row">
              <span className="tiny muted">Цвет глаз</span>
              <div className="sty-opts">
                {EYE_COLORS.map((c, i) => (
                  <button key={c} className={`swatch eye ${draft.look.eyes === i ? "on" : ""}`} style={{ ["--iris" as string]: c }} onClick={() => patch({ eyes: i })} aria-label={`цвет глаз ${i + 1}`} />
                ))}
              </div>
            </div>
            <div className="sty-row">
              <span className="tiny muted">Форма глаз</span>
              <div className="sty-opts">
                <button className="look-chip on">Обычные</button>
                <span className="tiny muted sty-soon">новые формы — в следующем обновлении</span>
              </div>
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
            <div className="sty-row">
              <span className="tiny muted">Татуировки</span>
              <div className="sty-opts"><span className="tiny muted sty-soon">будут выпадать с боссов — в следующих обновлениях</span></div>
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
