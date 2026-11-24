"use client";
/*
 * «Баул» (content/baul.ts): the bag on the left of the shop's counter. A tap opens it in the middle of the screen with
 * «Посмотреть» (the bag from inside: what lies in it now, «Забрать» there too) and «Забрать» (take it without looking).
 * Its level grows from the boss wins' points; the bag looks empty (0–14), half full (15–29) and stuffed (30).
 */
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Modal } from "../ui.tsx";
import { ItemArt } from "../art/items.tsx";
import { Icon } from "../art/icons.tsx";
import { useGame } from "../store.tsx";
import { haptic } from "../telegram.ts";
import { full } from "../format.ts";
import { BAUL_CUR, BAUL_MAX, BAUL_PRICE } from "../../content/baul.ts";
import { itemById } from "../../content/items.ts";
import { tattooSetOf } from "../../content/tattoos.ts";
import { STASH_IDS } from "../../content/stashes.ts";
import type { Reward } from "../../content/rewards.ts";
import type { Granted } from "../../server/core.ts";

const STASH = new Set<string>(STASH_IDS);
const V = "?v=2";
const tier = (level: number) => (level >= BAUL_MAX ? 30 : level >= 15 ? 15 : 0);
/** the bag's picture by its level: 0–14 empty, 15–29 half full, 30 stuffed */
export const baulImg = (level: number) => `/assets/shop/v2/baul-${tier(level)}.webp${V}`;
/** width / height of each picture */
export const baulAspect = (level: number) => ({ 0: 560 / 335, 15: 560 / 398, 30: 560 / 467 })[tier(level)];

interface OpenResult { reward: Granted; tattoos: string[]; level: number }

export function BaulWindow({ onClose }: { onClose: () => void }) {
  const { state, act } = useGame();
  const [busy, setBusy] = useState(false);
  const [look, setLook] = useState(false);
  const [got, setGot] = useState<OpenResult | null>(null);
  const b = state?.baul;
  if (!b) return null;
  const gold = state?.wallet[BAUL_CUR] ?? 0;
  const pct = b.to === null ? 100 : Math.max(0, Math.min(100, ((b.points - b.from) / (b.to - b.from)) * 100));
  const can = !busy && b.level >= 1 && gold >= BAUL_PRICE;
  const take = async () => {
    if (!can) return;
    haptic.tap();
    setBusy(true);
    const r = await act<OpenResult>("baul_open");
    setBusy(false);
    if (r) { haptic.ok(); setLook(false); setGot(r); }
  };
  const takeLabel = <>Забрать <span className="num row" style={{ gap: 3 }}>{BAUL_PRICE}<Icon name={BAUL_CUR} size={18} /></span></>;
  return (
    <Modal title="Баул" onClose={onClose} wide className="bl-win">
      <div className="bl-lv">
        <b className="display">Уровень {b.level}<span>/{BAUL_MAX}</span></b>
        <div className="bl-bar"><i style={{ width: `${pct}%` }} /></div>
        <span className="bl-pts num">{b.to === null ? `${full(b.points)} очков` : `${full(b.points)} / ${full(b.to)}`}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bl-bag" src={baulImg(b.level)} alt="" draggable={false} />
      <div className="bl-btns">
        <button type="button" className="btn" disabled={b.level < 1} onClick={() => { haptic.tap(); setLook(true); }}>Посмотреть</button>
        <button type="button" className="btn gold" disabled={!can} onClick={() => void take()}>{b.level < 1 ? "С 1 уровня" : takeLabel}</button>
      </div>
      {b.sets.length > 0 && (
        <div className="bl-sets">
          {b.sets.map((s) => (
            <div key={s.id} className={`bl-set ${s.gold ? "gold" : ""} ${s.own >= s.total ? "done" : ""}`}>
              <span>{s.name}</span>
              <span className="num">{s.own}/{s.total}</span>
            </div>
          ))}
        </div>
      )}
      {look && b.pack && (
        <Inside r={b.pack} onClose={() => setLook(false)}
          button={<button type="button" className="btn gold bl-in-ok" disabled={!can} onClick={() => void take()}>{takeLabel}</button>} />
      )}
      {got && (
        <Inside r={got.reward} title="Красава!" onClose={() => setGot(null)}
          button={<button type="button" className="btn gold bl-in-ok" onClick={() => { haptic.tap(); setGot(null); }}>Забрать</button>} />
      )}
    </Modal>
  );
}

/** the bag from inside (the artist's picture): what lies in it, the tattoo on top, the button at the bottom */
function Inside({ r, title, button, onClose }: { r: Reward | Granted; title?: string; button: ReactNode; onClose: () => void }) {
  const tats = (r.items ?? []).filter((it) => it.qty > 0 && !!tattooSetOf(it.id));
  const cells: { key: string; icon: ReactNode; n: number; name: string }[] = [
    ...(r.xp ? [{ key: "xp", icon: <Icon name="xp" size={22} />, n: r.xp, name: "Авторитет" }] : []),
    ...Object.entries(r.currencies ?? {}).filter(([, v]) => !!v).map(([c, v]) => ({ key: c, icon: <Icon name={c} size={22} />, n: v as number, name: c })),
    ...(r.items ?? []).filter((it) => it.qty > 0 && !tattooSetOf(it.id) && !STASH.has(it.id)).map((it) => ({ key: it.id, icon: <ItemArt id={it.id} size={26} />, n: it.qty, name: itemById(it.id)?.name ?? it.id })),
  ];
  // the нычки: one sign for all of them (the chest, as everywhere in the rewards), the names in the tooltip
  const stash = (r.items ?? []).filter((it) => it.qty > 0 && STASH.has(it.id));
  if (stash.length) cells.push({ key: "stash", icon: <Icon name="nychki" size={26} />, n: stash.reduce((t, it) => t + it.qty, 0), name: `Нычки: ${stash.map((it) => `${itemById(it.id)?.name ?? it.id} ×${it.qty}`).join(", ")}` });
  // over everything (the window's pop animation would trap a fixed layer inside it)
  return createPortal(
    <div className="bl-in-back" onClick={onClose}>
      <div className="bl-in" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bl-in-bg" src={`/assets/shop/v2/baul-inside.webp${V}`} alt="" draggable={false} />
        <button type="button" className="x bl-in-x" onClick={onClose} aria-label="Закрыть">×</button>
        {title && <h2 className="bl-in-h display">{title}</h2>}
        <div className="bl-in-pocket">
          {tats.map((t) => (
            <div key={t.id} className="bl-in-photo" title={itemById(t.id)?.name}>
              <ItemArt id={t.id} size={56} />
              <span>{tattooSetOf(t.id)?.name ?? "Наколка"}</span>
            </div>
          ))}
          <div className="bl-in-grid">
            {cells.map((c, i) => (
              // they fall in from above one after another, big, and settle small where they lie
              <span key={c.key} className="bl-in-cell" title={c.name} style={{ animationDelay: `${0.15 + i * 0.07}s` }}>{c.icon}<b className="num">+{full(c.n)}</b></span>
            ))}
          </div>
        </div>
        <div className="bl-in-foot">{button}</div>
      </div>
    </div>,
    document.body,
  );
}
