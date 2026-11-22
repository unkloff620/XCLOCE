"use client";
/*
 * «Общак» (content/obshak.ts, server/systems/obshak.ts): four levels side by side, each with its day's damage («Игла»)
 * and bonuses; the active one shows its days left, the next collecting and «Забрать».
 */
import { useState } from "react";
import { OBSHAK, NEEDLE_ID, type ObshakDef } from "../content/obshak.ts";
import { useGame, useNow } from "./store.tsx";
import type { Granted } from "./api.ts";
import { Modal, RewardChips } from "./ui.tsx";
import { ItemArt } from "./art/items.tsx";
import { Icon } from "./art/icons.tsx";
import { clock, full } from "./format.ts";
import { haptic } from "./telegram.ts";

const DAY = 24 * 3_600_000;

export function ObshakWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const now = useNow();
  const [got, setGot] = useState<{ reward: Granted; damage: number; keys: boolean } | null>(null);
  const o = state?.obshak;
  const gold = state?.wallet?.GOLD ?? 0;
  const buy = async (d: ObshakDef) => {
    const r = await act("obshak_buy", { level: d.id });
    if (r) haptic.ok();
  };
  const claim = async () => {
    const r = await act<{ reward: Granted; damage: number; keys: boolean }>("obshak_claim");
    if (r) { haptic.ok(); setGot(r); }
  };
  return (
    <Modal title="Общак" onClose={onClose} wide className="ob-win">
      <div className="ob-grid">
        {OBSHAK.map((d) => {
          const mine = o?.level === d.id;
          const days = mine && o?.until ? Math.max(1, Math.ceil((o.until - now) / DAY)) : null;
          return (
            <div key={d.id} className={`ob-card ob-${d.id} ${mine ? "on" : ""}`}>
              <i className="ob-crown" aria-hidden="true" />
              <b className="ob-name display">{d.name}</b>
              <span className="ob-days">{days ? `Осталось: ${days} ${days % 10 === 1 && days % 100 !== 11 ? "день" : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 12 || days % 100 > 14) ? "дня" : "дней"}` : "На 30 дней"}</span>
              <span className="ob-sub">ежедневная награда</span>
              <span className="ob-dmg num"><ItemArt id={NEEDLE_ID} size={24} />{full(d.damage)}</span>
              <span className="ob-bonus"><RewardChips r={d.bonus} size={18} /></span>
              {d.keysChance ? <span className="ob-keys" title="Шанс получить связку ключей"><ItemArt id="keys-bundle" size={26} />шанс</span> : null}
              {mine && o && (
                o.ready
                  ? <button type="button" className="btn sm green ob-take" disabled={busy === "obshak_claim"} onClick={() => void claim()}>Забрать</button>
                  : <span className="ob-next num"><Icon name="clock" size={14} />{clock(o.nextAt - now)}</span>
              )}
              <button type="button" className="btn gold ob-buy" disabled={busy === "obshak_buy" || gold < d.price} onClick={() => void buy(d)}>
                {mine ? "Продлить" : "Купить"} <span className="num"><Icon name="GOLD" size={16} />{full(d.price)}</span>
              </button>
            </div>
          );
        })}
      </div>
      {got && (
        <Modal title="Общак собран" onClose={() => setGot(null)}>
          <div className="lc-done">
            <span className="lc-done-h display">Награда</span>
            <div className="lc-done-box">
              <span className="chip ob-got-dmg num"><ItemArt id={NEEDLE_ID} size={30} />{full(got.damage)}</span>
              <RewardChips r={got.reward} size={30} />
            </div>
            <button type="button" className="btn gold lc-done-ok" onClick={() => setGot(null)}>Ок</button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
