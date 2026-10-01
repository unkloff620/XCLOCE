"use client";
import { useGame } from "../store.tsx";
import { TASKS } from "../../shared/content.ts";
import { itemById } from "../../shared/items.ts";
import { PriceTag, Bar, fmtCur } from "../ui.tsx";
import { UIcon, type UiIcon } from "../art/icons.tsx";
import { ItemIcon } from "../art/items.tsx";
import { haptic } from "../telegram.ts";

const TASK_ICON: Record<string, UiIcon> = { chat: "scroll", megaphone: "trophy", chart: "market", brush: "palette", swap: "exchange", gift: "gift", chip: "cards", whale: "crown" };

export function MarketScreen() {
  const { game, act, busy, energyNow, nextEnergyIn, openSheet } = useGame();
  if (!game) return null;
  const p = game.player;
  return (
    <div className="screen">
      <div className="screen-title">
        <h2 className="comic">MARKET</h2>
        <span className="muted small">Задания за энергию</span>
      </div>
      <section className="panel energy-panel">
        <UIcon name="energy" size={36} />
        <div className="grow">
          <Bar value={energyNow} max={p.maxEnergy} tone="green" label={`${Math.floor(energyNow)} / ${p.maxEnergy}`} />
          <small className="muted">{nextEnergyIn > 0 ? `+1 энергия через ${Math.ceil(nextEnergyIn / 1000)} с` : "Энергия полная"}</small>
        </div>
        <button className="btn-small comic" onClick={() => openSheet("shop")}>+</button>
      </section>
      {game.weekend && <div className="banner comic">WEEKEND PUMP ×2 — награды за задания удвоены!</div>}
      <div className="task-list">
        {TASKS.map((t) => {
          const locked = p.level < t.unlockLevel;
          const can = !locked && energyNow >= t.energy;
          return (
            <div key={t.id} className={`task ${locked ? "locked" : ""}`}>
              <div className="task-ic"><UIcon name={TASK_ICON[t.icon] ?? "scroll"} size={40} /></div>
              <div className="grow minw0">
                <div className="task-title">{t.title}</div>
                <div className="muted small">{t.description}</div>
                <div className="task-rew">
                  <PriceTag price={{ currency: t.reward.currency, amount: t.reward.amount * (game.weekend ? 2 : 1) }} size={14} />
                  <span>+{t.xp} XP</span>
                  <span>+{t.power} ⚔</span>
                  {t.drop && <span className="drop"><ItemIcon id={t.drop.item} size={18} />{Math.round(t.drop.chance * 100)}%</span>}
                </div>
              </div>
              {locked ? (
                <span className="lock-chip"><UIcon name="lock" size={18} />Lv {t.unlockLevel}</span>
              ) : (
                <button
                  className="btn-task comic"
                  disabled={!can || busy === "task"}
                  onClick={() => {
                    haptic.tap();
                    act("task", { taskId: t.id }, (r: { reward: { currency: string; amount: number }; drop: string | null }) =>
                      `+${fmtCur(r.reward.amount, r.reward.currency)}${r.drop ? ` · ${itemById(r.drop)?.name}!` : ""}`);
                  }}
                >
                  <span>GO</span>
                  <small><UIcon name="energy" size={12} />{t.energy}</small>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
