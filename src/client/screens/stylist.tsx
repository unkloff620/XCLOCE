"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useGame } from "../store.tsx";
import { ItemArt } from "../art/items.tsx";
import { ITEMS, weaponById, type Slot } from "../../content/items.ts";
import { HAIR_COLORS, HAIR_STYLES, type Look } from "../../content/home.ts";
import { haptic } from "../telegram.ts";
import type { RigEdit } from "../art/rig.tsx";
import { TATTOO_MODE_NAME, TATTOO_SETS, oneTattooPerZone, tattooZone } from "../../content/tattoos.ts";
import { bossById } from "../../content/bosses.ts";

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

const CLOTHES: Slot[] = ["HEAD", "FACE", "ACCESSORY", "SHIRT", "PANTS", "SHOES", "HAND"];
const ITEM_PART: Record<string, string> = { HEAD: "Голова", FACE: "Лицо", ACCESSORY: "Аксессуар", SHIRT: "Верх", PANTS: "Низ", SHOES: "Обувь", HAND: "Кисть" };
/** the slot buttons: a picture (public/assets/ui/slot-*.webp) and a short word under it */
const SLOT_ICON: Record<string, string> = { HEAD: "slot-head", ACCESSORY: "slot-accessory", SHIRT: "slot-shirt", PANTS: "slot-pants", SHOES: "slot-shoes" };
const SHORT_PART: Record<string, string> = { HEAD: "Голова", FACE: "Лицо", ACCESSORY: "Шея", SHIRT: "Верх", PANTS: "Низ", SHOES: "Обувь", HAND: "Кисть" };
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
  // «Наколки»: the tattoos tab (the hero is picked by body parts there too; no part — every tattoo)
  const [inkTab, setInkTab] = useState(false);
  const [inkSet, setInkSet] = useState<string | null>(null);
  if (!state) return null;
  const mode = focus.mode;
  const part = focus.part;
  const setMode = (m: "items" | "body") => {
    haptic.tap();
    setInkTab(false);
    setFocus({ mode: m, part: m === "items" ? "SHIRT" : "HEAD" });
  };
  const openInk = () => {
    haptic.tap();
    setInkTab(true);
    setFocus({ mode: "body", part: null });
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

  // tattoos: one per place on the body — inking one replaces whatever was in that place (another set's piece)
  const inked = new Set(draft.look.tattoos ?? []);
  const setInk = (next: string[]) => patch({ tattoos: oneTattooPerZone(next) });
  const toggleInk = (id: string) => {
    if (!owned.has(id)) return;
    if (inked.has(id)) setInk([...inked].filter((t) => t !== id));
    else setInk([...[...inked].filter((t) => tattooZone(t) !== tattooZone(id)), id]);
  };
  const piece = (s: (typeof TATTOO_SETS)[number], p: (typeof TATTOO_SETS)[number]["pieces"][number]) => {
    const have = owned.has(p.id);
    return (
      <button key={p.id} className={`sty-item rar-epic ink-item ${inked.has(p.id) ? "on" : ""} ${have ? "" : "locked"}`} onClick={() => toggleInk(p.id)} disabled={!have}
        title={have ? (inked.has(p.id) ? "Свести" : "Набить") : `Выпадает с ${bossById(s.boss)?.name} в «${TATTOO_MODE_NAME[s.mode]}»`}>
        <ItemArt id={p.id} size={46} />
        <span className="sty-item-name">{have ? p.name : "???"}</span>
        {inked.has(p.id) && <i className="ink-on" aria-hidden="true">✓</i>}
      </button>
    );
  };
  // the body view (a part tapped): the pieces of that place from every set, in one row
  const inkStrip = (where: string | null) => (
    <div className="sty-strip">{TATTOO_SETS.flatMap((s) => s.pieces.filter((p) => !where || p.part === where).map((p) => piece(s, p)))}</div>
  );
  // «Наколки»: the sets like an inventory — a set opens to its pieces (dropped ones in colour, the rest grey)
  const openSet = TATTOO_SETS.find((s) => s.id === inkSet) ?? null;
  const inkView = openSet ? (() => {
    const mine = openSet.pieces.filter((p) => owned.has(p.id));
    const all = mine.length > 0 && mine.every((p) => inked.has(p.id));
    return (
      <div className="ink-open">
        <div className="ink-open-head">
          <button type="button" className="btn dark sm" onClick={() => { haptic.tap(); setInkSet(null); }}>‹ Сеты</button>
          <b className="grow">«{openSet.name}» <span className="num">{mine.length}/{openSet.pieces.length}</span></b>
          {all ? (
            <button type="button" className="btn dark sm" onClick={() => setInk([...inked].filter((t) => !openSet.pieces.some((p) => p.id === t)))}>Свести все</button>
          ) : (
            <button type="button" className="btn gold sm" disabled={!mine.length} onClick={() => setInk([...inked, ...mine.map((p) => p.id)])}>Набить все</button>
          )}
        </div>
        <div className="ink-grid">{openSet.pieces.map((p) => piece(openSet, p))}</div>
      </div>
    );
  })() : (
    <div className="ink-sets">
      {TATTOO_SETS.map((s) => {
        const got = s.pieces.filter((p) => owned.has(p.id)).length;
        const on = s.pieces.filter((p) => inked.has(p.id)).length;
        return (
          <button type="button" key={s.id} className={`ink-set ${got === s.pieces.length ? "done" : ""}`} onClick={() => { haptic.tap(); setInkSet(s.id); }}>
            <ItemArt id={s.pieces[2].id} size={40} />
            <span className="grow">
              <b>Сет «{s.name}»</b> <span className="num">{got}/{s.pieces.length}</span>{on > 0 && <span className="ink-count"> · набито {on}</span>}
              <small>с {bossById(s.boss)?.name} в «{TATTOO_MODE_NAME[s.mode]}» · весь сет: +{s.bonus.damage} к урону «{weaponById(s.bonus.weapon)?.name}»</small>
            </span>
            <span className="ink-go" aria-hidden="true">›</span>
          </button>
        );
      })}
    </div>
  );
  const tattooRow = (where: string, place: string) => (
    <div className="sty-row">
      <span className="tiny muted">Наколки {place}</span>
      {inkStrip(where)}
    </div>
  );

  let body: ReactNode;
  if (inkTab) {
    body = inkView;
  } else if (!part) {
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
        {tattooRow("HEAD", TATTOO_WHERE.HEAD)}
      </>
    );
  } else {
    body = tattooRow(part, TATTOO_WHERE[part] ?? "");
  }
  const title = part ? (mode === "items" ? ITEM_PART[part] : BODY_PART[part]) : null;

  return createPortal(
    // the panel goes to <body>: the fixed .fit-page is its own stacking layer and would stay under the nav
    <div className="sty-panel">
      <div className="sty-head">
        <div className="sty-tabs three">
          {/* eslint-disable @next/next/no-img-element */}
          <button className={mode === "body" && !inkTab ? "on" : ""} onClick={() => setMode("body")} aria-label="Изменить внешность" title="Изменить внешность"><img src="/assets/ui/tab-look.webp" alt="" draggable={false} /></button>
          <button className={inkTab ? "on" : ""} onClick={openInk} aria-label="Набить наколки" title="Набить наколки"><img src="/assets/ui/drop-tattoo.webp" alt="" draggable={false} /></button>
          <button className={mode === "items" && !inkTab ? "on" : ""} onClick={() => setMode("items")} aria-label="Сменить одежду" title="Сменить одежду"><img src="/assets/ui/slot-shirt.webp" alt="" draggable={false} /></button>
          {/* eslint-enable @next/next/no-img-element */}
        </div>
        <button className="sty-x" onClick={onClose} aria-label="Закрыть без сохранения">✕</button>
      </div>
      <div className="sty-body">
        {mode === "items" ? (
          // the clothes slots as buttons too: a tap on the character is not the only way to find a thing
          <div className="sty-slots" role="tablist">
            {CLOTHES.map((s) => {
              const n = ITEMS.filter((i) => i.slot === s && owned.has(i.id)).length;
              return (
                <button key={s} type="button" role="tab" aria-selected={part === s} aria-label={ITEM_PART[s]} title={ITEM_PART[s]} className={`sty-slot ${part === s ? "on" : ""}`} onClick={() => { haptic.tap(); setFocus({ ...focus, mode: "items", part: s }); }}>
                  {/* the same slot pictures as the shop's filter row; the hand has none — a hand thing stands for it */}
                  {SLOT_ICON[s]
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/assets/ui/${SLOT_ICON[s]}.webp`} alt="" draggable={false} />
                    : <ItemArt id={s === "FACE" ? "laser-eyes" : "hand-drum"} size={30} />}
                  <small>{SHORT_PART[s]}</small>
                  {n > 0 && <i className="num">{n}</i>}
                </button>
              );
            })}
          </div>
        ) : !inkTab && title && <div className="sty-part"><b>{title}</b><span className="tiny muted">нажми на другую часть персонажа</span></div>}
        {body}
      </div>
      <div className="sty-actions">
        <button className="btn dark sty-act" onClick={onClose} aria-label="Отмена" title="Отмена">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" /></svg>
        </button>
        <button className="btn green grow sty-act" disabled={!changed || saving || !!busy} onClick={save} aria-label={changed ? "Сохранить" : "Без изменений"} title={changed ? "Сохранить" : "Без изменений"}>
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}
