"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useGame } from "../store.tsx";
import { ItemArt } from "../art/items.tsx";
import { ITEMS, weaponById, type Slot } from "../../content/items.ts";
import { HAIR_COLORS, HAIR_STYLES, type Look } from "../../content/home.ts";
import { haptic } from "../telegram.ts";
import { HeadArt, type RigEdit } from "../art/rig.tsx";
import { ART_VER } from "../preload.ts";
import { TATTOO_SETS, tattooSource, oneTattooPerZone, tattooZone } from "../../content/tattoos.ts";
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
        title={have ? (inked.has(p.id) ? "Свести" : "Набить") : `Выпадает ${tattooSource(s, (b) => bossById(b)?.name)}`}>
        <ItemArt id={p.id} size={46} />
        <span className="sty-item-name">{have ? p.name : "???"}</span>
        {!have && <img className="ink-chain" src="/assets/ui/chain-lock.webp" alt="" draggable={false} />}
        {inked.has(p.id) && <i className="ink-on" aria-hidden="true">✓</i>}
      </button>
    );
  };
  // «Наколки»: the sets like an inventory — a set opens to its pieces (dropped ones in colour, the rest grey)
  const openSet = TATTOO_SETS.find((s) => s.id === inkSet) ?? null;
  const inkView = openSet ? (() => {
    const mine = openSet.pieces.filter((p) => owned.has(p.id));
    const all = mine.length > 0 && mine.every((p) => inked.has(p.id));
    return (
      <div className="ink-open">
        <div className="ink-open-head">
          <button type="button" className="btn dark sm" onClick={() => { haptic.tap(); setInkSet(null); }}>‹</button>
          <span className="grow ink-open-t">
            <b>«{openSet.name}» <span className="num">{mine.length}/{openSet.pieces.length}</span></b>
            <small>Падает {tattooSource(openSet, (b) => bossById(b)?.name)} · весь сет: +{openSet.bonus.damage} к урону «{weaponById(openSet.bonus.weapon)?.name}»</small>
          </span>
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
        return (
          <button type="button" key={s.id} className={`ink-set ${got === s.pieces.length ? "done" : ""} ${got ? "" : "locked"}`} onClick={() => { haptic.tap(); setInkSet(s.id); }}
            title={`«${s.name}» · ${tattooSource(s, (b) => bossById(b)?.name)}`}>
            {/* the set's main picture fills the tile; its name on top (two lines at most), the count bottom right */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ink-set-pic" src={`/assets/hero/tattoo/set-${s.id}.webp?v=${ART_VER.tattoo}`} alt="" draggable={false} />
            <span className="ink-set-name">{s.name}</span>
            <span className="ink-set-n num">{got}/{s.pieces.length}</span>
            {!got && <img className="ink-chain" src="/assets/ui/chain-lock.webp" alt="" draggable={false} />}
          </button>
        );
      })}
    </div>
  );
  let body: ReactNode;
  if (inkTab) {
    body = inkView;
  } else if (mode === "body") {
    // «Внешность»: the hairstyle (a picture of the head with it) and the hair colour
    body = (
      <>
        <div className="sty-row">
          <span className="tiny muted">Причёска</span>
          <div className="hair-picks">
            {HAIR_STYLES.map((h) => (
              <button key={h.id} type="button" className={`hair-pick ${draft.look.hair === h.id ? "on" : ""}`} onClick={() => patch({ hair: h.id })} aria-label={h.name} title={h.name}>
                <HeadArt look={{ ...draft.look, hair: h.id, tattoos: [] }} size={48} />
              </button>
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
      </>
    );
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
  }

  return createPortal(
    // the panel goes to <body>: the fixed .fit-page is its own stacking layer and would stay under the nav
    <div className="sty-panel">
      {/* eslint-disable @next/next/no-img-element */}
      {/* the three editors: a column on the right of the hero */}
      <div className="sty-side-tabs" role="tablist">
        <button type="button" className={mode === "body" && !inkTab ? "on" : ""} onClick={() => setMode("body")} aria-label="Изменить внешность" title="Изменить внешность"><img src="/assets/ui/tab-look.webp" alt="" draggable={false} /></button>
        <button type="button" className={inkTab ? "on" : ""} onClick={openInk} aria-label="Набить наколки" title="Набить наколки"><img src="/assets/ui/drop-tattoo.webp" alt="" draggable={false} /></button>
        <button type="button" className={mode === "items" && !inkTab ? "on" : ""} onClick={() => setMode("items")} aria-label="Сменить одежду" title="Сменить одежду"><img src="/assets/ui/slot-shirt.webp" alt="" draggable={false} /></button>
      </div>
      {/* cancel and save: over the panel, on the sides of the hero's feet */}
      <button type="button" className="sty-big x" onClick={onClose} aria-label="Отмена" title="Отмена"><img src="/assets/ui/btn-cancel.webp" alt="" draggable={false} /></button>
      <button type="button" className="sty-big ok" disabled={!changed || saving || !!busy} onClick={save} aria-label={changed ? "Сохранить" : "Без изменений"} title={changed ? "Сохранить" : "Без изменений"}><img src="/assets/ui/btn-ok.webp" alt="" draggable={false} /></button>
      {/* eslint-enable @next/next/no-img-element */}
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
        ) : null}
        {body}
      </div>
    </div>,
    document.body,
  );
}
