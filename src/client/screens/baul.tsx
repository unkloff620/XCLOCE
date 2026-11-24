"use client";
/*
 * «Баул» (content/baul.ts): the bag on the left of the shop's counter. Its level grows from the boss wins' points; an
 * opening (free after a new level, otherwise for слитки) shows the «Красава!» sheet: the pack and, if lucky, a tattoo.
 */
import { useState } from "react";
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
import type { Granted } from "../../server/core.ts";

export const BAUL_IMG = "/assets/shop/v2/baul.webp?v=1";

interface OpenResult { reward: Granted; tattoos: string[]; free: boolean; level: number }

export function BaulWindow({ onClose }: { onClose: () => void }) {
  const { state, act } = useGame();
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<OpenResult | null>(null);
  const b = state?.baul;
  if (!b) return null;
  const gold = state?.wallet[BAUL_CUR] ?? 0;
  const pct = b.to === null ? 100 : Math.max(0, Math.min(100, ((b.points - b.from) / (b.to - b.from)) * 100));
  const open = async () => {
    if (busy) return;
    haptic.tap();
    setBusy(true);
    const r = await act<OpenResult>("baul_open");
    setBusy(false);
    if (r) { haptic.ok(); setGot(r); }
  };
  return (
    <Modal title="Баул" onClose={onClose} wide className="bl-win">
      <div className="bl-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bl-bag" src={BAUL_IMG} alt="" draggable={false} />
        <div className="bl-lv">
          <b className="display">Уровень {b.level}<span>/{BAUL_MAX}</span></b>
          <div className="bl-bar"><i style={{ width: `${pct}%` }} /></div>
          <span className="bl-pts num">{b.to === null ? `${full(b.points)} очков` : `${full(b.points)} / ${full(b.to)}`}</span>
        </div>
      </div>
      <button type="button" className="btn gold bl-open" disabled={busy || b.level < 1 || (b.free < 1 && gold < BAUL_PRICE)} onClick={() => void open()}>
        {b.level < 1 ? "С 1 уровня" : b.free > 0 ? <>Открыть бесплатно{b.free > 1 ? ` ×${b.free}` : ""}</> : <>Открыть <span className="num row" style={{ gap: 3 }}>{BAUL_PRICE}<Icon name={BAUL_CUR} size={18} /></span></>}
      </button>
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
      {got && <Krasava got={got} onClose={() => setGot(null)} />}
    </Modal>
  );
}

/** the «Красава!» sheet: every reward of the opening with its «+N», the tattoo pinned up as a photo */
function Krasava({ got, onClose }: { got: OpenResult; onClose: () => void }) {
  const r = got.reward;
  const tat = new Set(got.tattoos);
  const cells: { key: string; icon: React.ReactNode; n: number; name: string }[] = [
    ...(r.xp ? [{ key: "xp", icon: <Icon name="xp" size={30} />, n: r.xp, name: "Авторитет" }] : []),
    ...Object.entries(r.currencies ?? {}).filter(([, v]) => !!v).map(([c, v]) => ({ key: c, icon: <Icon name={c} size={30} />, n: v as number, name: c })),
    ...(r.items ?? []).filter((it) => it.qty > 0 && !tat.has(it.id)).map((it) => ({ key: it.id, icon: <ItemArt id={it.id} size={34} />, n: it.qty, name: itemById(it.id)?.name ?? it.id })),
  ];
  const t = got.tattoos[0];
  // over everything (the window's pop animation would trap a fixed sheet inside it)
  return createPortal(
    <div className="bl-kr-back" onClick={(e) => e.stopPropagation()}>
      <div className="bl-kr">
        <h2 className="bl-kr-h display">Красава!</h2>
        {t && (
          <div className="bl-kr-photo" title={itemById(t)?.name}>
            <ItemArt id={t} size={64} />
            <span>{tattooSetOf(t)?.name ?? "Наколка"}</span>
          </div>
        )}
        <div className="bl-kr-grid">
          {cells.map((c) => (
            <span key={c.key} className="bl-kr-cell" title={c.name}>{c.icon}<b className="num">+{full(c.n)}</b></span>
          ))}
        </div>
        <button type="button" className="btn gold bl-kr-ok" onClick={() => { haptic.tap(); onClose(); }}>Забрать</button>
      </div>
    </div>,
    document.body,
  );
}
