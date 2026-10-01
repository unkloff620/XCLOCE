"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { api, type BossListItem } from "../api.ts";
import { TokenLogo } from "../ui.tsx";
import { haptic } from "../telegram.ts";
import { AnimatedNumber, Bar, Icon, Sheet } from "../ui.tsx";
import { money } from "../format.ts";
import { bossInfo } from "../../shared/bosses.ts";
import { comboMultiplier, contributionFactor, DUMP_TOOLS, equipmentByTier, toolById, COMBO_WINDOW_MS } from "../../shared/economy.ts";

export function BossScreen() {
  const { game, predictedBoss, pops, feed, setTab, openSheet, live, openMore, run, busy, energyNow, toast } = useGame();
  const [hit, setHit] = useState(false);
  const lastPop = useRef(0);
  useEffect(() => {
    const last = pops[pops.length - 1];
    if (last && last.id !== lastPop.current) {
      lastPop.current = last.id;
      setHit(true);
      const t = setTimeout(() => setHit(false), 380);
      return () => clearTimeout(t);
    }
  }, [pops]);
  if (!game || !predictedBoss) return null;
  const info = bossInfo(predictedBoss.index);
  const sameBoss = predictedBoss.index === game.boss.index;
  const personal = sameBoss ? game.boss.personalOnBoss : 0;
  const tool = toolById(game.player.equippedTool) ?? DUMP_TOOLS[0];
  const eq = equipmentByTier(game.player.equipmentTier);
  const comboActive = game.player.lastSellAt && Date.now() - game.player.lastSellAt <= COMBO_WINDOW_MS ? game.player.combo : 0;
  const damageFeed = feed.filter((f) => ["damage", "crit", "boss"].includes(f.kind)).slice(-6).reverse();
  const share = contributionFactor(personal, info.marketCap);

  return (
    <div className="screen boss-screen">
      <div className="screen-head">
        <h2>Босс #{info.index}</h2>
        <button className="btn btn-ghost small" onClick={() => openSheet("bosses")}>Все боссы →</button>
      </div>
      <section className={`boss-stage env-${info.env} ${hit ? "hit" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={predictedBoss.remaining / info.marketCap < 0.35 ? info.imageHurt : info.image} alt={info.name} className="boss-img" style={info.hueShift ? { filter: `hue-rotate(${info.hueShift}deg) saturate(1.2)` } : undefined} draggable={false} />
        <div className="pops">
          {pops.map((p) => (
            <span key={p.id} className={`pop ${p.crit ? "crit" : ""} ${p.mine ? "mine" : "global"}`}>
              -{money(p.amount)}{p.crit ? " CRIT" : ""}
            </span>
          ))}
        </div>
        <div className="boss-name">
          <div className="title">{info.name}</div>
          <div className="muted small">{info.title}</div>
        </div>
      </section>

      <section className="card boss-mcap">
        <div className="row between">
          <span className="muted small">MARKET CAP</span>
          <span className={`live ${live ? "on" : ""}`}>{live ? "LIVE" : "sync"}</span>
        </div>
        <div className="mcap-value">
          <AnimatedNumber value={predictedBoss.remaining} format={(v) => money(v)} duration={500} />
          <span className="muted"> / {money(info.marketCap)}</span>
        </div>
        <Bar value={predictedBoss.remaining} max={info.marketCap} tone="boss" />
        <div className="row between small">
          <span>Твой урон: <b>{money(personal)}</b></span>
          <span>Награда: <b className="up">{money(info.rewardUsdFull * share)}</b>{share < 1 && <span className="muted"> из {money(info.rewardUsdFull)}</span>}</span>
        </div>
        {share < 1 && <div className="muted small">Нанеси лично 10% Market Cap ({money(info.marketCap * 0.1)}), чтобы получить полную награду.</div>}
        {info.dropToolId && <div className="drop small">🎁 Дроп: {toolById(info.dropToolId)?.name}</div>}
      </section>

      <section className="card">
        <div className="row between"><h3>Dump Tool</h3><button className="btn btn-ghost small" onClick={() => openMore("arsenal")}>Сменить →</button></div>
        <div className="row gap tool-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/dump-tools/${tool.id}.svg`} width={52} height={52} alt="" />
          <div className="grow">
            <div className="strong">{tool.name}</div>
            <div className="mods">
              <span className="mod">×{tool.mult} урон</span>
              <span className="mod">{Math.round(tool.critChance * 100)}% крит ×{tool.critMult}</span>
              <span className="mod">комбо {comboActive} · ×{comboMultiplier(comboActive)}</span>
              <span className="mod">сетап ×{(1 + eq.damageBonus).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card attack-card">
        <div className="row between"><h3>⚔️ Атака</h3><span className="muted small">{Math.floor(energyNow)} ⚡ · {tool.energyCost} ⚡ за удар</span></div>
        {game.positions.length ? (
          <div className="list">
            {game.positions.map((x) => {
              const dmg = x.valueUsd * tool.mult * comboMultiplier(comboActive + 1) * (1 + eq.damageBonus);
              const attack = (fraction: number) => {
                if (energyNow < tool.energyCost) return toast("err", "Нет энергии для удара");
                run(`atk:${x.tokenId}`, () => api.sell(x.tokenId, fraction), (r) => {
                  haptic.hit();
                  toast("dmg", `${r.damage.crit ? "💥 CRITICAL DUMP! " : "🔥 "}${money(r.damage.amount)} урона`);
                });
              };
              return (
                <div key={x.tokenId} className="attack-row">
                  <TokenLogo art={x.art as never} size={36} />
                  <div className="grow minw0">
                    <div className="strong">${x.ticker}</div>
                    <div className="small muted">{money(x.valueUsd)} · удар ≈ <b className="dmg">{money(dmg)}</b></div>
                  </div>
                  <button className="btn btn-chip" disabled={busy === `atk:${x.tokenId}`} onClick={() => attack(0.5)}>50%</button>
                  <button className="btn btn-chip btn-sell" disabled={busy === `atk:${x.tokenId}`} onClick={() => attack(1)}>DUMP</button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty small">Нечем бить. Купи мемкоин — его продажа нанесёт урон боссу.</div>
        )}
        <button className="btn btn-sell wide" onClick={() => setTab("market")}>Купить снаряды на рынке</button>
      </section>

      <section className="card">
        <div className="row between"><h3>Глобальная активность</h3><Icon name="damage" size={18} /></div>
        <div className="feed">
          {damageFeed.length ? damageFeed.map((f) => <div key={f.id} className={`feed-item feed-${f.kind}`}>{f.text}</div>) : <div className="muted small">Пока тихо. Будь первым, кто сольёт!</div>}
        </div>
        <div className="muted small">Урон любого игрока снижает Market Cap твоего босса — и всех остальных.</div>
      </section>
    </div>
  );
}

export function BossListSheet() {
  const { sheet, openSheet } = useGame();
  const [list, setList] = useState<BossListItem[] | null>(null);
  const open = sheet === "bosses";
  useEffect(() => {
    if (open) api.bosses().then((r) => setList(r.bosses)).catch(() => setList([]));
  }, [open]);
  return (
    <Sheet open={open} onClose={() => openSheet(null)} title="Прогрессия боссов">
      <div className="boss-list">
        {!list && <div className="empty">Загрузка…</div>}
        {list?.map((b) => (
          <div key={b.index} className={`boss-row ${b.status}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.image} alt="" width={56} height={56} style={b.hueShift ? { filter: `hue-rotate(${b.hueShift}deg)` } : undefined} />
            <div className="grow minw0">
              <div className="strong ellipsis">#{b.index} {b.name}</div>
              <div className="muted small">MC {money(b.marketCap, { compact: true })} · награда до {money(b.rewardUsdFull, { compact: true })}{b.dropToolId ? " · 🎁" : ""}</div>
            </div>
            <span className={`status status-${b.status}`}>
              {b.status === "defeated" ? "✓" : b.status === "current" ? "Бой" : "🔒"}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function Celebration() {
  const { celebrations, dismissCelebration } = useGame();
  const c = celebrations[0];
  if (!c) return null;
  const info = bossInfo(c.index);
  const item = c.rewardItem ? toolById(c.rewardItem) : null;
  return (
    <div className="victory-backdrop" onClick={dismissCelebration}>
      <div className="victory" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/effects/explosion.svg" className="victory-boom" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={info.image} className="victory-boss" alt="" style={info.hueShift ? { filter: `hue-rotate(${info.hueShift}deg) grayscale(.6)` } : { filter: "grayscale(.6)" }} />
        <div className="victory-title">BOSS DUMPED!</div>
        <div className="victory-name">#{c.index} {info.name}</div>
        <div className="victory-stats">
          <div><span className="muted small">Market Cap</span><b>{money(info.marketCap)}</b></div>
          <div><span className="muted small">Твой вклад</span><b>{money(c.personalDamage)}</b></div>
        </div>
        <div className="victory-rewards">
          <div className="reward"><Icon name="usd" size={22} /> +{money(c.rewardUsd)}</div>
          <div className="reward"><Icon name="xp" size={22} /> +{c.rewardXp} XP</div>
          {item && (
            <div className="reward">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/assets/dump-tools/${item.id}.svg`} width={22} height={22} alt="" /> {item.name}
            </div>
          )}
        </div>
        <button className="btn btn-primary wide" onClick={dismissCelebration}>Забрать награду</button>
      </div>
    </div>
  );
}
