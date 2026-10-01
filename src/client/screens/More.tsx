"use client";
import { useEffect, useMemo, useState } from "react";
import { useGame, type MoreSection } from "../store.tsx";
import { api, type LeaderRow } from "../api.ts";
import { Avatar, RarityBadge, Segmented } from "../ui.tsx";
import { cur, money, num } from "../format.ts";
import { haptic } from "../telegram.ts";
import { Room, CharacterPreview, type MonitorTicker } from "../room/Room.tsx";
import { DUMP_TOOLS, EQUIPMENT, equipmentByTier } from "../../shared/economy.ts";
import { COSMETICS, cosmeticById, type Slot } from "../../shared/retention.ts";

export function MoreScreen() {
  const { moreSection, openMore } = useGame();
  return (
    <div className="screen">
      <div className="scroll-x">
        <Segmented<MoreSection>
          value={moreSection}
          onChange={openMore}
          options={[
            { value: "upgrades", label: "Апгрейды" },
            { value: "arsenal", label: "Dump Tools" },
            { value: "wardrobe", label: "Гардероб" },
            { value: "top", label: "Топ" },
          ]}
        />
      </div>
      {moreSection === "upgrades" ? <UpgradesSection /> : moreSection === "arsenal" ? <ArsenalSection /> : moreSection === "wardrobe" ? <WardrobeSection /> : <TopSection />}
    </div>
  );
}

function ArsenalSection() {
  const { game, run, busy, toast } = useGame();
  if (!game) return null;
  const owned = new Set(game.inventory.tools);
  return (
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
  );
}

function UpgradesSection() {
  const { game, run, busy, toast, market } = useGame();
  const tickers: MonitorTicker[] = useMemo(() => market.map((t) => ({ ticker: t.ticker, change: t.change1h, history: t.history })), [market]);
  if (!game) return null;
  const tier = game.player.equipmentTier;
  const next = EQUIPMENT[tier];
  const cur0 = equipmentByTier(tier);
  return (
        <div className="setup">
          <section className="card">
            <h3>Сейчас: {cur0.name}</h3>
            <div className="room-thumb"><Room tier={cur0.tier} outfit={game.player.outfit} tickers={tickers} /></div>
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
              <div className="room-thumb"><Room tier={next.tier} outfit={game.player.outfit} tickers={tickers} /></div>
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
  );
}

const SLOTS: { slot: Slot; label: string }[] = [
  { slot: "hoodie", label: "Худи" },
  { slot: "hat", label: "Голова" },
  { slot: "glasses", label: "Очки" },
  { slot: "headphones", label: "Наушники" },
];

function WardrobeSection() {
  const { game, run, busy, toast } = useGame();
  const [slot, setSlot] = useState<Slot>("hoodie");
  const [preview, setPreview] = useState<string | null>(null);
  if (!game) return null;
  const owned = new Set(game.cosmetics);
  const outfit = { ...game.player.outfit };
  const pv = preview ? cosmeticById(preview) : null;
  if (pv) outfit[pv.slot] = pv.id;
  return (
    <div className="section">
      <section className="card wardrobe-stage">
        <CharacterPreview outfit={outfit} size={170} />
        {pv && !owned.has(pv.id) && <div className="chip chip-info">Примерка: {pv.name}</div>}
      </section>
      <Segmented<Slot> value={slot} onChange={(s) => { setSlot(s); setPreview(null); }} options={SLOTS.map((s) => ({ value: s.slot, label: s.label }))} />
      <div className="wardrobe-grid">
        {COSMETICS.filter((c) => c.slot === slot).map((c) => {
          const have = owned.has(c.id);
          const worn = game.player.outfit[c.slot] === c.id;
          const locked = game.player.level < c.unlockLevel;
          return (
            <div key={c.id} className={`wear-card ${worn ? "worn" : ""} ${preview === c.id ? "previewing" : ""}`} onClick={() => setPreview(c.id)}>
              <span className="swatch" style={{ background: c.color ?? "linear-gradient(135deg,#2a2f45,#141926)" }}>{c.variant && c.variant !== "none" ? c.variant.slice(0, 1).toUpperCase() : c.color ? "" : "—"}</span>
              <div className="strong small">{c.name}</div>
              {worn ? (
                <span className="chip chip-up">Надето</span>
              ) : have ? (
                <button className="btn btn-chip" disabled={busy === "wear"} onClick={(e) => { e.stopPropagation(); run("wear", () => api.wear(c.id), () => { haptic.ok(); setPreview(null); }); }}>Надеть</button>
              ) : locked ? (
                <span className="chip chip-muted">🔒 LVL {c.unlockLevel}</span>
              ) : (
                <button
                  className="btn btn-chip btn-buy"
                  disabled={busy === "wear"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (game.balances[c.currency] < c.price) return toast("err", `Нужно ${cur(c.price, c.currency)}`);
                    run("wear", () => api.wear(c.id), () => { haptic.ok(); toast("ok", `${c.name} — твоё!`); setPreview(null); });
                  }}
                >
                  {cur(c.price, c.currency)}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted small center">Косметика не влияет на урон — только на стиль.</p>
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

function TopSection() {
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
    <div className="section">
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
