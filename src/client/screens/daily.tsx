"use client";
import { useState } from "react";
import { useGame, useNow } from "../store.tsx";
import { Modal, RewardChips, Coin } from "../ui.tsx";
import { Icon } from "../art/icons.tsx";
import { ItemArt } from "../art/items.tsx";
import { clock } from "../format.ts";
import { haptic } from "../telegram.ts";
import { itemById } from "../../content/items.ts";
import type { Currency } from "../../content/currencies.ts";
import type { Reward } from "../../content/rewards.ts";
import type { Granted } from "../api.ts";

/** Compact content of one day tile: currencies, energy, items, XP — one per line. */
function TileReward({ r }: { r: Reward }) {
  return (
    <div className="daily-lines">
      {Object.entries(r.currencies ?? {}).map(([c, v]) => (v ? <span key={c}><Coin c={c as Currency} v={v} size={15} /></span> : null))}
      {!!r.energy && <span><Icon name="energy" size={15} /><b className="num">+{r.energy}</b></span>}
      {(r.items ?? []).map((it) => (
        <span key={it.id} title={itemById(it.id)?.name}><ItemArt id={it.id} size={18} /><b className="num">×{it.qty}</b></span>
      ))}
      {!!r.xp && <span className="dim tiny">+{r.xp} XP</span>}
    </div>
  );
}

export function DailyWindow({ onClose }: { onClose: () => void }) {
  const { state, act, busy } = useGame();
  const now = useNow();
  const [got, setGot] = useState<Granted | null>(null);
  if (!state) return null;
  const d = state.daily;
  // tiles before the current day are already taken in this cycle; the current one is taken too once claimed
  const taken = (i: number) => i + 1 < d.day || (!d.available && i + 1 === d.day);
  const claim = async () => {
    const r = await act<{ day: number; reward: Granted }>("daily_claim");
    if (r) {
      haptic.ok();
      setGot(r.reward);
    }
  };
  return (
    <Modal title="Награда за вход" onClose={onClose} wide>
      <div className="col" style={{ gap: 12 }}>
        <div className="small muted">
          Заходи каждый день — награда растёт. Пропустишь день — серия начнётся заново.
          {d.streak > 0 && <> Серия: <b style={{ color: "var(--ink)" }}>{d.streak} дн.</b></>}
        </div>
        <div className="daily-grid">
          {d.rewards.map((r, i) => {
            const isNow = i + 1 === d.day;
            const cls = taken(i) ? "taken" : isNow && d.available ? "now" : "";
            return (
              <div key={i} className={`daily-tile ${cls} ${i === d.rewards.length - 1 ? "big" : ""}`}>
                <div className="daily-day display">День {i + 1}</div>
                <TileReward r={r} />
                {taken(i) && <span className="daily-check" aria-label="получено">✓</span>}
              </div>
            );
          })}
        </div>
        {got ? (
          <div className="panel col" style={{ alignItems: "center", gap: 8 }}>
            <b className="display">Получено!</b>
            <RewardChips r={got} />
            {got.levelUp && <div className="chip violet">Новый уровень: {got.levelUp.to}!</div>}
            <button className="btn green block" onClick={onClose}>Круто</button>
          </div>
        ) : d.available ? (
          <button className="btn gold big block" disabled={busy === "daily_claim"} onClick={claim}>
            <Icon name="gift" size={22} /> Забрать награду дня {d.day}
          </button>
        ) : (
          <div className="btn dark block" aria-disabled>
            <Icon name="clock" size={18} /> Следующая через {clock((d.nextAt ?? now) - now)}
          </div>
        )}
      </div>
    </Modal>
  );
}
