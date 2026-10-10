"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useGame } from "../store.tsx";
import { ItemArt } from "../art/items.tsx";
import { ITEMS, type Slot } from "../../content/items.ts";
import { HAIR_COLORS, HAIR_STYLES, type Look } from "../../content/home.ts";
import { haptic } from "../telegram.ts";
import type { RigEdit } from "../art/rig.tsx";

/*
 * The hero editor right on the home screen: the room and every button go grey, only the hero keeps his colours,
 * and his parts get gold outlines. You tap a part of the hero himself and its menu opens below (the chosen part
 * glows brighter). Two modes:
 *   «Вещи» — the head → hats, the neck → chains, the torso → tops, the legs → bottoms, the feet → shoes, the hand →
 *            things held in it;
 *   «Тело» — every place on its own: the head (hair), the eyes (effects from bosses, later), the mouth (later), the
 *            torso, each shoulder, each forearm, the hand, each leg — the tattoos of that place (they will drop from
 *            bosses). The skin tone and the eye colour are set in the profile («Внешность»).
 * Everything is a preview until «Сохранить»: then the changed slots are put on / taken off and the look is saved.
 */

export interface StyleDraft {
  look: Look;
  worn: Record<string, string>;
}

const CLOTHES: Slot[] = ["HEAD", "ACCESSORY", "SHIRT", "PANTS", "SHOES", "HAND"];
const ITEM_PART: Record<string, string> = { HEAD: "Голова", ACCESSORY: "Аксессуар", SHIRT: "Верх", PANTS: "Низ", SHOES: "Обувь", HAND: "Кисть" };
// «левое / правое» — as seen on the screen
const BODY_PART: Record<string, string> = {
  HEAD: "Голова", EYES: "Глаза", MOUTH: "Рот", TORSO: "Торс", SHOULDER_L: "Левое плечо", SHOULDER_R: "Правое плечо",
  ARM_L: "Левая рука", ARM_R: "Правая рука", HAND: "Кисть", LEG_L: "Левая нога", LEG_R: "Правая нога",
};
const TATTOO_WHERE: Record<string, string> = {
  HEAD: "на лице и шее", TORSO: "на груди и животе", SHOULDER_L: "на левом плече", SHOULDER_R: "на правом плече",
  ARM_L: "на левой руке", ARM_R: "на правой руке", HAND: "на кисти", LEG_L: "на левой ноге", LEG_R: "на правой ноге",
};

export function Stylist({ draft, setDraft, onClose, focus, setFocus }: {
  draft: StyleDraft; setDraft: (d: StyleDraft) => void; onClose: () => void; focus: RigEdit; setFocus: (f: RigEdit) => void;
}) {
  const { state, act, busy } = useGame();
  const [saving, setSaving] = useState(false);
  if (!state) return null;
  const mode = focus.mode;
  const part = focus.part;
  const setMode = (m: "items" | "body") => {
    haptic.tap();
    setFocus({ mode: m, part: m === "items" ? "SHIRT" : "HEAD" });
  };
  const owned = new Set(state.inventory.map((i) => i.id));
  const slot = mode === "items" && part && (CLOTHES as string[]).includes(part) ? (part as Slot) : null;
  const items = slot ? ITEMS.filter((i) => i.slot === slot && owned.has(i.id)) : [];
  const now = state.look.equipped;
  const lookChanged = JSON.stringify(draft.look) !== JSON.stringify(state.look.body);
  const slotsChanged = CLOTHES.filter((s) => (draft.worn[s] ?? null) !== (now[s] ?? null));
  const changed = lookChanged || slotsChanged.length > 0;

  const wear = (id: string | null) => {
    if (!slot) return;
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

  const tattooRow = (where: string) => (
    <div className="sty-row">
      <span className="tiny muted">Татуировки {where}</span>
      <div className="sty-soon-box"><span className="small">Скоро: татуировки будут выпадать с боссов, их можно будет набить здесь.</span></div>
    </div>
  );

  let body: ReactNode;
  if (!part) {
    body = <div className="sty-hint">Нажми на персонажа — выбери, что изменить</div>;
  } else if (slot) {
    body = (
      <div className="sty-strip">
        <button className={`sty-item none ${!draft.worn[slot] ? "on" : ""}`} onClick={() => wear(null)}>
          <span className="sty-plus" aria-hidden="true">∅</span>
          <span className="sty-item-name">{slot === "HAND" ? "Обычная" : "Ничего"}</span>
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
            <span className="sty-item-name">{slot === "HAND" ? "Выпадают с боссов" : "В магазин"}</span>
          </Link>
        )}
      </div>
    );
  } else if (part === "EYES") {
    body = <div className="sty-soon-box"><b>Эффекты глаз — скоро</b><span className="small">Светящиеся и другие глаза будут выпадать с боссов. Цвет глаз меняется в профиле → «Внешность».</span></div>;
  } else if (part === "MOUTH") {
    body = <div className="sty-soon-box"><b>Скоро</b><span className="small">Формы рта появятся в одном из следующих обновлений.</span></div>;
  } else if (part === "HEAD") {
    body = (
      <>
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
        {tattooRow(TATTOO_WHERE.HEAD)}
      </>
    );
  } else {
    body = tattooRow(TATTOO_WHERE[part] ?? "");
  }
  const title = part ? (mode === "items" ? ITEM_PART[part] : BODY_PART[part]) : null;

  return createPortal(
    // the panel goes to <body>: the fixed .fit-page is its own stacking layer and would stay under the nav
    <div className="sty-panel">
      <div className="sty-head">
        <div className="sty-tabs two">
          <button className={mode === "items" ? "on" : ""} onClick={() => setMode("items")}>Вещи</button>
          <button className={mode === "body" ? "on" : ""} onClick={() => setMode("body")}>Тело</button>
        </div>
        <button className="sty-x" onClick={onClose} aria-label="Закрыть без сохранения">✕</button>
      </div>
      <div className="sty-body">
        {title && <div className="sty-part"><b>{title}</b><span className="tiny muted">нажми на другую часть персонажа</span></div>}
        {body}
      </div>
      <div className="sty-actions">
        <button className="btn dark" onClick={onClose}>Отмена</button>
        <button className="btn green grow" disabled={!changed || saving || !!busy} onClick={save}>{changed ? "Сохранить" : "Без изменений"}</button>
      </div>
    </div>,
    document.body,
  );
}
