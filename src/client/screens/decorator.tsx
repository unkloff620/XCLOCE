"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useGame } from "../store.tsx";
import { Icon } from "../art/icons.tsx";
import { money } from "../format.ts";
import { haptic } from "../telegram.ts";
import { EQUIPMENT, equipmentById, hasPiece, placedOf, type Price } from "../../content/home.ts";
import { BonusLine } from "./house.tsx";

/*
 * The room editor right on the home screen, built like the hero editor: the hero steps away (his chair stays) so the room
 * behind is seen; things to change stand at the left, the panel below shows the choices for the picked one.
 * Desk, monitors and chair are bought one by one, in any order: the 3rd monitor before the 2nd, the throne before the office chair.
 * Every bought piece gives its bonus forever; which desk / chair / monitors stand in the room is a preview until «Сохранить».
 */

/** what stands: desk / chair — piece index (0 = the free one); monitor2 — a mask of the shown monitors */
export type RoomDraft = Record<string, number>;
export type RoomTab = "desk" | "monitor2" | "chair" | "rgb";

const PLACED = ["desk", "monitor2", "chair"] as const;
const SIDE: { id: RoomTab; name: string }[] = [
  { id: "desk", name: "Стол" },
  { id: "monitor2", name: "Мониторы" },
  { id: "chair", name: "Кресло" },
  { id: "rgb", name: "Свет" },
];

/** the editor's starting draft: what stands in the room now */
export function roomDraftOf(pieces: Record<string, number>, decor: Record<string, number>): RoomDraft {
  return Object.fromEntries(PLACED.map((id) => [id, placedOf(id, pieces, decor)]));
}

/** owned pieces plus the ones being tried on in the draft (to show them in the room before buying) */
export function previewPieces(pieces: Record<string, number>, draft: RoomDraft): Record<string, number> {
  const out = { ...pieces };
  for (const id of PLACED) {
    const e = equipmentById(id)!;
    const v = draft[id] ?? 0;
    out[id] = (out[id] ?? 0) | (e.multi ? v : v > 0 ? 1 << (v - 1) : 0);
  }
  return out;
}

export function RoomEditor({ draft, setDraft, tab, setTab, onClose }: { draft: RoomDraft; setDraft: (d: RoomDraft) => void; tab: RoomTab; setTab: (t: RoomTab) => void; onClose: () => void }) {
  const { state, act, busy } = useGame();
  const [saving, setSaving] = useState(false);
  // the piece the panel talks about (its bonus and the «Купить» button); for monitors — the last tapped one
  const [focus, setFocus] = useState<Record<string, number>>({});
  if (!state) return null;
  const owned = state.home.pieces ?? {};
  const decor = state.home.decor;
  const b = state.home.bonus;
  const now = roomDraftOf(owned, decor);
  // only owned things can be saved into the room
  const notOwned = PLACED.filter((id) => {
    const e = equipmentById(id)!;
    const v = draft[id] ?? 0;
    return e.multi ? (v & ~(owned[id] ?? 0)) !== 0 : v > 0 && !hasPiece(owned[id] ?? 0, v);
  });
  const changed = PLACED.some((id) => (draft[id] ?? 0) !== (now[id] ?? 0));
  const canPay = (p: Price) => (state.wallet[p.currency] ?? 0) >= p.amount;

  const pick = (id: string, k: number) => {
    haptic.tap();
    const e = equipmentById(id)!;
    setFocus({ ...focus, [id]: k });
    if (e.multi) {
      if (k === 0) setDraft({ ...draft, [id]: 0 });
      else setDraft({ ...draft, [id]: (draft[id] ?? 0) ^ (1 << (k - 1)) });
    } else setDraft({ ...draft, [id]: k });
  };
  const buy = async (id: string, k: number) => {
    const e = equipmentById(id)!;
    const piece = e.pieces![k - 1];
    const r = await act("piece_buy", { id, piece: k }, `Куплено: ${piece.name}`);
    if (r) {
      haptic.ok();
      // a bought monitor stands right away
      if (e.multi) setDraft({ ...draft, [id]: (draft[id] ?? 0) | (1 << (k - 1)) });
    }
  };
  const rgbUp = async () => {
    const r = await act<{ level: number }>("equipment_upgrade", { id: "rgb" }, (x) => `Подсветка: уровень ${x.level}`);
    if (r) haptic.ok();
  };
  const save = async () => {
    setSaving(true);
    const r = await act("decor_save", { decor: Object.fromEntries(PLACED.map((id) => [id, draft[id] ?? 0])) }, "Обстановка сохранена");
    setSaving(false);
    if (r) {
      haptic.ok();
      onClose();
    }
  };

  const sideArt = (id: RoomTab) => {
    if (id === "rgb") return <Icon name="bolt" size={36} />;
    const e = equipmentById(id)!;
    const v = draft[id] ?? 0;
    // monitors: the highest shown one, else the old CRT
    const k = e.multi ? [3, 2, 1].find((n) => (v & (1 << (n - 1))) !== 0) ?? 0 : v;
    const art = k > 0 ? e.pieces![k - 1].art : e.base!.art;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/assets/home/${art}.webp`} alt="" draggable={false} />;
  };

  const e = tab === "rgb" ? null : equipmentById(tab)!;
  const f = e ? focus[tab] ?? (e.multi ? 0 : draft[tab] ?? 0) : 0;
  const fPiece = e && f > 0 ? e.pieces![f - 1] : null;
  const fOwned = e && f > 0 ? hasPiece(owned[tab] ?? 0, f) : true;
  const rgb = EQUIPMENT.find((x) => x.id === "rgb")!;
  const rgbLv = state.home.levels.rgb ?? 0;
  const rgbNext = rgb.levels[rgbLv];

  return (
    <>
      <div className="sty-side left room-ed-side">
        {SIDE.map((s) => (
          <button key={s.id} className={`sty-slot filled ${tab === s.id ? "on" : ""}`} onClick={() => setTab(s.id)} aria-label={s.name}>
            <span className="room-ed-art">{sideArt(s.id)}</span>
            <span className="sty-slot-name">{s.name}</span>
          </button>
        ))}
      </div>

      {createPortal(<div className="sty-panel">
        <div className="sty-head">
          <div className="room-ed-title">
            <b className="display">{e ? e.name : rgb.name}</b>
            <span className="tiny muted">крит {Math.round(b.critChance * 1000) / 10}% · сила ×{(1.5 + b.critDamage).toFixed(2)} · урон +{Math.round(b.damage * 1000) / 10}%</span>
          </div>
          <button className="sty-x" onClick={onClose} aria-label="Закрыть без сохранения">✕</button>
        </div>

        {e ? (
          <div className="sty-body">
            <div className="tiny muted">{e.multi ? "Каждый монитор покупается отдельно. Нажми, чтобы поставить или убрать." : "Купленные остаются навсегда и дают бонус, а поставить можно любой."}</div>
            <div className="sty-strip">
              {!e.multi && (
                <button className={`sty-item room-ed-item ${(draft[tab] ?? 0) === 0 ? "on" : ""}`} onClick={() => pick(tab, 0)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="room-ed-thumb" src={`/assets/home/${e.base!.art}.webp`} alt="" draggable={false} />
                  <span className="sty-item-name">{e.base!.name}</span>
                </button>
              )}
              {e.pieces!.map((pc, i) => {
                const k = i + 1;
                const have = hasPiece(owned[tab] ?? 0, k);
                const on = e.multi ? ((draft[tab] ?? 0) & (1 << i)) !== 0 : (draft[tab] ?? 0) === k;
                return (
                  <button key={pc.art} className={`sty-item room-ed-item ${on ? "on" : ""} ${have ? "" : "room-ed-new"}`} onClick={() => pick(tab, k)} aria-pressed={on}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="room-ed-thumb" src={`/assets/home/${pc.art}.webp`} alt="" draggable={false} />
                    <span className="sty-item-name">{pc.name}</span>
                    {!have && <span className="room-ed-price num"><Icon name={pc.price.currency} size={12} />{money(pc.price.currency, pc.price.amount)}</span>}
                    {e.multi && have && <span className={`room-ed-check ${on ? "on" : ""}`} aria-hidden="true">{on ? "✓" : ""}</span>}
                  </button>
                );
              })}
            </div>
            {fPiece ? (
              <div className="room-ed-info">
                <span className="small"><b>{fPiece.name}</b> · <BonusLine b={fPiece.bonus} /></span>
                {!fOwned && (
                  <button className="btn sm gold" disabled={!canPay(fPiece.price) || busy === "piece_buy"} onClick={() => buy(tab, f)}>
                    Купить · <Icon name={fPiece.price.currency} size={14} /> {money(fPiece.price.currency, fPiece.price.amount)}
                  </button>
                )}
              </div>
            ) : (
              <div className="room-ed-info tiny muted">{e.multi ? "Без нового монитора справа стоит старый ламповый." : `${e.base!.name} — бесплатно, без бонуса.`}</div>
            )}
          </div>
        ) : (
          <div className="sty-body">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="small">Уровень {rgbLv} из {rgb.levels.length}</span>
              <span className="equip-lv">{rgb.levels.map((_, i) => <i key={i} className={i < rgbLv ? "on" : ""} />)}</span>
            </div>
            <div className="tiny muted">{rgb.description}</div>
            <div className="tiny">
              {rgbLv > 0 && <>Сейчас: <BonusLine b={rgb.levels[rgbLv - 1].bonus} /><br /></>}
              {rgbNext && <>Уровень {rgbLv + 1}: <b><BonusLine b={rgbNext.bonus} /></b></>}
            </div>
            {rgbNext ? (
              <button className="btn sm gold block" disabled={!canPay(rgbNext.price) || busy === "equipment_upgrade"} onClick={rgbUp}>
                {rgbLv === 0 ? "Купить" : "Улучшить"} · <Icon name={rgbNext.price.currency} size={15} /> {money(rgbNext.price.currency, rgbNext.price.amount)}
              </button>
            ) : (
              <div className="chip green" style={{ alignSelf: "flex-start" }}>Максимальный уровень</div>
            )}
          </div>
        )}

        <div className="sty-actions">
          <button className="btn dark" onClick={onClose}>Отмена</button>
          <button className="btn green grow" disabled={!changed || notOwned.length > 0 || saving || !!busy} onClick={save}>
            {notOwned.length ? "Сначала купи выбранное" : changed ? "Сохранить" : "Без изменений"}
          </button>
        </div>
      </div>, document.body)}
    </>
  );
}
