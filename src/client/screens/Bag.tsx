"use client";
import { useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { api, type LeaderRow } from "../api.ts";
import { Avatar, RarityBadge, Segmented } from "../ui.tsx";
import { cur, money, num } from "../format.ts";
import { haptic } from "../telegram.ts";
import { DUMP_TOOLS, EQUIPMENT, equipmentByTier } from "../../shared/economy.ts";

export function BagScreen() {
  const { game, run, busy, toast } = useGame();
  const [section, setSection] = useState<"tools" | "setup">("tools");
  if (!game) return null;
  const owned = new Set(game.inventory.tools);
  const tier = game.player.equipmentTier;
  const next = EQUIPMENT[tier];
  const cur0 = equipmentByTier(tier);

  return (
    <div className="screen">
      <div className="screen-head"><h2>Арсенал</h2></div>
      <Segmented value={section} onChange={setSection} options={[{ value: "tools", label: "Dump Tools" }, { value: "setup", label: "Рабочее место" }]} />
      {section === "tools" ? (
        <div className="tool-grid">
          {DUMP_TOOLS.map((t) => {
            const have = owned.has(t.id);
            const equipped = game.player.equippedTool === t.id;
            const locked = game.player.level < t.unlockLevel;
            return (
              <div key={t.id} className={`tool-card rarity-border-${t.rarity} ${equipped ? "equipped" : ""} ${!have ? "not-owned" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/assets/dump-tools/${t.id}.svg`} alt="" width={64} height={64} />
                <div className="strong">{t.name}</div>
                <RarityBadge rarity={t.rarity} />
                <div className="tool-stats small">
                  <span>×{t.mult}</span><span>{Math.round(t.critChance * 100)}% ×{t.critMult}</span><span>{t.energyCost}⚡</span>
                </div>
                <div className="muted tiny">{t.description}</div>
                {equipped ? (
                  <span className="chip chip-up">Экипирован</span>
                ) : have ? (
                  <button className="btn btn-chip" disabled={busy === "equip"} onClick={() => run("equip", () => api.equip(t.id), () => haptic.ok())}>Экипировать</button>
                ) : t.priceUsd === null ? (
                  <span className="chip chip-muted">Дроп с босса #20</span>
                ) : locked ? (
                  <span className="chip chip-muted">🔒 LVL {t.unlockLevel}</span>
                ) : (
                  <button
                    className="btn btn-chip btn-buy"
                    disabled={busy === "tool"}
                    onClick={() => {
                      if (game.balances.USD < (t.priceUsd ?? 0)) return toast("err", `Нужно ${money(t.priceUsd ?? 0)}`);
                      run("tool", () => api.buyTool(t.id), () => { haptic.ok(); toast("ok", `${t.name} в арсенале!`); });
                    }}
                  >
                    {money(t.priceUsd)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="setup">
          <section className="card">
            <h3>Сейчас: {cur0.name}</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="room small-room" src={`/assets/rooms/room-${cur0.tier}-${cur0.id}.svg`} alt="" />
            <div className="stats-grid">
              <div><span className="muted small">За смену</span><b>{cur0.workRub} ₽</b></div>
              <div><span className="muted small">Пассивно</span><b>{num(cur0.passiveRubPerHour, 0)} ₽/ч</b></div>
              <div><span className="muted small">Энергия</span><b>{cur0.maxEnergy}</b></div>
              <div><span className="muted small">Бонус урона</span><b>+{Math.round(cur0.damageBonus * 100)}%</b></div>
            </div>
          </section>
          {next ? (
            <section className="card upgrade-card">
              <h3>Следующий уровень: {next.name}</h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="room small-room" src={`/assets/rooms/room-${next.tier}-${next.id}.svg`} alt="" />
              <div className="stats-grid">
                <div><span className="muted small">За смену</span><b className="up">{next.workRub} ₽</b></div>
                <div><span className="muted small">Пассивно</span><b className="up">{num(next.passiveRubPerHour, 0)} ₽/ч</b></div>
                <div><span className="muted small">Энергия</span><b className="up">{next.maxEnergy}</b></div>
                <div><span className="muted small">Бонус урона</span><b className="up">+{Math.round(next.damageBonus * 100)}%</b></div>
              </div>
              {game.player.level < next.unlockLevel ? (
                <button className="btn wide" disabled>🔒 Нужен уровень {next.unlockLevel}</button>
              ) : (
                <button
                  className="btn btn-primary wide"
                  disabled={busy === "eq"}
                  onClick={() => {
                    if (game.balances[next.priceCurrency] < next.price) return toast("err", `Нужно ${cur(next.price, next.priceCurrency)}`);
                    run("eq", () => api.buyEquipment(next.tier), () => { haptic.ok(); toast("ok", `${next.name} установлен!`); });
                  }}
                >
                  Купить за {cur(next.price, next.priceCurrency)}
                </button>
              )}
            </section>
          ) : (
            <section className="card"><h3>Максимальный сетап 🐋</h3></section>
          )}
        </div>
      )}
    </div>
  );
}

const BOARDS = [
  { value: "damage_today", label: "Сегодня" },
  { value: "damage_all", label: "Всё время" },
  { value: "bosses", label: "Боссы" },
  { value: "biggest_dump", label: "Слив" },
  { value: "profit", label: "Профит" },
  { value: "level", label: "Уровень" },
] as const;

export function TopScreen() {
  const { game } = useGame();
  const [board, setBoard] = useState<(typeof BOARDS)[number]["value"]>("damage_today");
  const [data, setData] = useState<{ title: string; money: boolean; rows: LeaderRow[] } | null>(null);
  useEffect(() => {
    setData(null);
    api.leaderboard(board).then(setData).catch(() => setData({ title: "", money: false, rows: [] }));
  }, [board]);
  if (!game) return null;
  const s = game.stats as Record<string, number>;
  const p = game.player;
  return (
    <div className="screen">
      <section className="card profile-big">
        <Avatar url={p.photoUrl} name={p.name} size={64} />
        <div>
          <div className="profile-name">{p.name}</div>
          <div className="muted small">LVL {p.level} · {p.isGuest ? "гостевой профиль" : "Telegram"}</div>
        </div>
      </section>
      <div className="stats-grid four">
        <div><span className="muted small">Урон всего</span><b>{money(s.lifetime_damage ?? 0, { compact: true })}</b></div>
        <div><span className="muted small">Урон сегодня</span><b>{money(s.damage_today ?? 0, { compact: true })}</b></div>
        <div><span className="muted small">Боссов</span><b>{s.bosses_defeated ?? 0}</b></div>
        <div><span className="muted small">Лучший слив</span><b>{money(s.biggest_dump ?? 0, { compact: true })}</b></div>
        <div><span className="muted small">Сделок</span><b>{s.trades ?? 0}</b></div>
        <div><span className="muted small">Объём</span><b>{money(s.volume_usd ?? 0, { compact: true })}</b></div>
        <div><span className="muted small">Прибыль</span><b className={(s.realized_profit_usd ?? 0) >= 0 ? "up" : "down"}>{money(s.realized_profit_usd ?? 0, { compact: true, sign: true })}</b></div>
        <div><span className="muted small">Босс</span><b>#{game.boss.index}</b></div>
      </div>

      <div className="screen-head"><h2>Рейтинг</h2></div>
      <div className="scroll-x"><Segmented value={board} onChange={setBoard} options={[...BOARDS]} /></div>
      <div className="list leaderboard">
        {!data && <div className="empty">Загрузка…</div>}
        {data?.rows.map((r) => (
          <div key={r.id} className={`list-row ${r.id === p.id ? "me" : ""}`}>
            <span className={`rank rank-${r.rank}`}>{r.rank}</span>
            <Avatar url={r.photo_url} name={r.name} size={34} />
            <div className="grow minw0">
              <div className="strong ellipsis">{r.username ? "@" + r.username : r.name}</div>
              <div className="muted small">LVL {r.level}</div>
            </div>
            <b>{data.money ? money(r.value, { compact: true }) : num(r.value, 0)}</b>
          </div>
        ))}
        {data && !data.rows.length && <div className="empty">Пока пусто</div>}
      </div>
    </div>
  );
}
