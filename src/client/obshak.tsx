"use client";
/*
 * «Общак» (content/obshak.ts, server/systems/obshak.ts): the four levels one at a time on the van's slates (swipe or ‹ ›),
 * each with its day's damage («Игла») and bonuses; the active one shows its days left, the next collecting and «Забрать».
 */
import { useLayoutEffect, useRef, useState } from "react";
import { OBSHAK, NEEDLE_ID, type ObshakDef } from "../content/obshak.ts";
import { useGame, useNow } from "./store.tsx";
import type { Granted } from "./api.ts";
import { Modal, RewardChips } from "./ui.tsx";
import { ItemArt } from "./art/items.tsx";
import { Icon } from "./art/icons.tsx";
import { clock, full } from "./format.ts";
import { haptic } from "./telegram.ts";
import { IcArrow } from "./screens/van.tsx";

const DAY = 24 * 3_600_000;

/** the van's slates (public/assets/van/plaque-*.webp) by level; the two top ones shine along the edge */
const PLATE: Record<string, "free" | "bronze" | "silver" | "gold"> = { pacan: "free", blat: "bronze", avtor: "silver", vor: "gold" };
const daysWord = (d: number) => (d % 10 === 1 && d % 100 !== 11 ? "день" : d % 10 >= 2 && d % 10 <= 4 && (d % 100 < 12 || d % 100 > 14) ? "дня" : "дней");

export function ObshakWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const now = useNow();
  const [got, setGot] = useState<{ reward: Granted; damage: number; keys: boolean } | null>(null);
  const o = state?.obshak;
  const gold = state?.wallet?.GOLD ?? 0;
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(() => Math.max(0, OBSHAK.findIndex((d) => d.id === o?.level)));
  // open on the active level
  useLayoutEffect(() => {
    const el = track.current;
    if (el && at) el.scrollLeft = at * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    haptic.tap();
    const n = (i + OBSHAK.length) % OBSHAK.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = track.current;
    if (el) setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const buy = async (d: ObshakDef) => {
    const r = await act("obshak_buy", { level: d.id });
    if (r) haptic.ok();
  };
  const claim = async () => {
    const r = await act<{ reward: Granted; damage: number; keys: boolean }>("obshak_claim");
    if (r) { haptic.ok(); setGot(r); }
  };
  return (
    <Modal title="Общак" onClose={onClose} className="ob-win">
      <div className="ob-car">
        <div ref={track} className="ob-track" onScroll={onScroll}>
          {OBSHAK.map((d) => {
            const mine = o?.level === d.id;
            const days = mine && o?.until ? Math.max(1, Math.ceil((o.until - now) / DAY)) : null;
            const plate = PLATE[d.id];
            return (
              <div key={d.id} className="ob-slide">
                <div className={`ob-plate k-${plate} ${mine ? "on" : ""}`} style={{ backgroundImage: `url(/assets/van/plaque-${plate}.webp)` }}>
                  {(plate === "gold" || plate === "silver") && <i className="ob-rim" aria-hidden="true" />}
                  <div className="ob-in">
                    <b className="ob-name display">{d.name}</b>
                    <span className="ob-days">{days ? `Осталось: ${days} ${daysWord(days)}` : "На 30 дней"}</span>
                    <span className="ob-sub">ежедневная награда</span>
                    <span className="ob-dmg num"><ItemArt id={NEEDLE_ID} size={26} />{full(d.damage)}</span>
                    <span className="ob-bonus"><RewardChips r={d.bonus} size={20} /></span>
                    {d.keysChance ? <span className="ob-keys" title="Шанс получить связку ключей"><ItemArt id="keys-bundle" size={24} />шанс</span> : null}
                  </div>
                  <b className="ob-price display num"><Icon name="GOLD" size={20} />{full(d.price)}</b>
                </div>
                <div className="ob-ctl">
                  {mine && o && (
                    o.ready
                      ? <button type="button" className="btn green ob-take" disabled={busy === "obshak_claim"} onClick={() => void claim()}>Забрать</button>
                      : <span className="ob-next num"><Icon name="clock" size={14} />{clock(o.nextAt - now)}</span>
                  )}
                  <button type="button" className="btn gold ob-buy" disabled={busy === "obshak_buy" || gold < d.price} onClick={() => void buy(d)}>
                    {mine ? "Продлить" : "Купить"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="ob-arrow l" onClick={() => go(at - 1)} aria-label="Предыдущий общак"><IcArrow /></button>
        <button type="button" className="ob-arrow r" onClick={() => go(at + 1)} aria-label="Следующий общак"><IcArrow flip /></button>
        <div className="ob-dots" aria-hidden="true">{OBSHAK.map((d, i) => <i key={d.id} className={i === at ? "on" : ""} />)}</div>
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
