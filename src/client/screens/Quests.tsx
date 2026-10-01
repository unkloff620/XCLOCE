"use client";
import { useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { api } from "../api.ts";
import { Bar, Icon } from "../ui.tsx";
import { cur, money, num } from "../format.ts";
import { haptic } from "../telegram.ts";
import { GameIcon } from "../icons.tsx";
import { DAILY_REWARDS, type Reward } from "../../shared/retention.ts";

function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.currency && r.amount) parts.push(cur(r.amount, r.currency));
  if (r.energy) parts.push(`+${r.energy} ⚡`);
  if (r.xp) parts.push(`+${r.xp} XP`);
  return parts.join(" · ");
}

function left(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}д ${h % 24}ч`;
  return `${h}ч ${String(m).padStart(2, "0")}м`;
}

export function QuestsScreen() {
  const { game, run, busy, toast } = useGame();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!game) return null;
  const d = game.daily;
  const daily = game.quests.filter((q) => q.period === "daily");
  const weekly = game.quests.filter((q) => q.period === "weekly");

  const claimQuest = (id: string) =>
    run(`q:${id}`, () => api.claimQuest(id), (r) => {
      haptic.ok();
      toast("ok", `Награда: ${rewardText(r.reward)}`);
    });

  const QuestRow = ({ q }: { q: (typeof game.quests)[number] }) => (
    <div className={`quest ${q.claimed ? "claimed" : q.done ? "ready" : ""}`}>
      <div className="grow minw0">
        <div className="strong">{q.title}</div>
        <div className="row gap-s">
          <div className="grow"><Bar value={q.progress} max={q.target} tone="xp" /></div>
          <span className="small muted mono">{q.metric === "sell_usd" || q.metric === "damage" ? `${money(q.progress, { compact: true })}/${money(q.target, { compact: true })}` : `${num(q.progress, 0)}/${num(q.target, 0)}`}</span>
        </div>
        <div className="small up">{rewardText(q.reward)}</div>
      </div>
      {q.claimed ? (
        <span className="chip chip-muted">✓ Получено</span>
      ) : (
        <button className="btn btn-chip btn-buy" disabled={!q.done || busy === `q:${q.id}`} onClick={() => claimQuest(q.id)}>
          {q.done ? "Забрать" : "В процессе"}
        </button>
      )}
    </div>
  );

  return (
    <div className="screen">
      <div className="screen-head"><h2>Задания</h2></div>
      <section className="card daily-card">
        <div className="row gap">
          <GameIcon name="chest" size={52} />
          <div className="grow">
            <h3>Ежедневная награда</h3>
            <div className="muted small">Серия: {d.streak} {d.streak === 1 ? "день" : "дн."} · не пропускай больше 48 ч</div>
          </div>
        </div>
        <div className="streak">
          {DAILY_REWARDS.map((r, i) => {
            const day = i + 1;
            const cycleDay = ((d.nextDay - 1) % DAILY_REWARDS.length) + 1;
            const state = day < cycleDay ? "done" : day === cycleDay ? (d.canClaim ? "today" : "next") : "future";
            return (
              <div key={day} className={`streak-day ${state}`}>
                <small>День {day}</small>
                {r.currency && <Icon name={r.currency.toLowerCase() as "rub"} size={18} />}
                <b>{r.currency && r.amount ? (r.currency === "RUB" ? num(r.amount, 0) : r.currency === "SOL" ? r.amount : `$${r.amount}`) : ""}</b>
              </div>
            );
          })}
        </div>
        <button
          className="btn btn-primary wide"
          disabled={!d.canClaim || busy === "daily"}
          onClick={() => run("daily", api.claimDaily, (r) => { haptic.ok(); toast("ok", `День ${r.day}: ${rewardText(r.reward)}`); })}
        >
          {d.canClaim ? `Забрать: ${rewardText(d.reward)}` : `Следующая через ${left(Math.max(0, d.availableAt - now))}`}
        </button>
      </section>

      <div className="row between"><h3>Ежедневные</h3><span className="muted small">обновятся через {left(Math.max(0, (daily[0]?.endsAt ?? now) - now))}</span></div>
      <div className="list">{daily.map((q) => <QuestRow key={q.id} q={q} />)}</div>

      <div className="row between"><h3>Недельные</h3><span className="muted small">через {left(Math.max(0, (weekly[0]?.endsAt ?? now) - now))}</span></div>
      <div className="list">{weekly.map((q) => <QuestRow key={q.id} q={q} />)}</div>
    </div>
  );
}
