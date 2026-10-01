"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { BOSSES, bossImage } from "../../shared/content.ts";
import { ATTACKS_PER_DAY, KEYS_TO_UNLOCK } from "../../shared/economy.ts";
import { itemById } from "../../shared/items.ts";
import { Avatar, Bar, ConfirmButton, PriceTag, fmtNum, countdown } from "../ui.tsx";
import { UIcon } from "../art/icons.tsx";
import { ItemIcon } from "../art/items.tsx";
import { haptic } from "../telegram.ts";
import { api, type FightView, type HitResult, type VictoryResult } from "../api.ts";

export function BossScreen() {
  const { game, act, busy, setFight, now } = useGame();
  const fight = game?.fight ?? null;
  const start = async (index: number) => {
    haptic.tap();
    if (fight?.bossIndex === index) return setFight(index);
    const r = await act<{ bossIndex: number }>("fight_start", { boss: index });
    if (r) setFight(r.bossIndex);
  };
  if (!game) return null;
  const nextReset = new Date(now);
  const resetIn = Date.UTC(nextReset.getUTCFullYear(), nextReset.getUTCMonth(), nextReset.getUTCDate() + 1) - now;

  return (
    <div className="screen">
      <div className="screen-title">
        <h2 className="comic">BOSSES</h2>
        <span className="muted small">Нападения обновятся через {countdown(resetIn)}</span>
      </div>
      <div className="boss-list">
        {game.bosses.map((b) => {
          const def = BOSSES.find((x) => x.index === b.index)!;
          const locked = !b.unlocked;
          return (
            <div key={b.index} className={`boss-card ${locked ? "locked" : ""}`}>
              <div className="boss-ava">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bossImage(def)} alt="" draggable={false} />
                {locked && <span className="q comic">?</span>}
                <span className="boss-n comic">{b.index}</span>
              </div>
              <div className="boss-info">
                <div className="boss-name comic ellipsis">{b.name}</div>
                <div className="hp-row">
                  <span className="hp-ic">❤</span>
                  <Bar value={b.hp} max={b.hpMax} tone="red" label={`${fmtNum(b.hp)} / ${fmtNum(b.hpMax)} HP`} />
                </div>
                <div className="boss-meta">
                  <span title="Награда"><PriceTag price={b.reward} size={14} /></span>
                  <span title="Побед">🏆 {b.wins}</span>
                </div>
              </div>
              <div className="boss-act">
                {!locked ? (
                  <>
                    {fight?.bossIndex === b.index ? (
                      <button className={`btn-attack comic ${fight.won ? "won" : "live"}`} onClick={() => setFight(b.index)}>{fight.won ? "WIN!" : "В БОЮ"}</button>
                    ) : (
                      <button className="btn-attack comic" disabled={!!fight || b.attemptsLeft <= 0 || busy === "fight_start"} onClick={() => start(b.index)}>ATTACK</button>
                    )}
                    <small className="muted">{fight && fight.bossIndex !== b.index ? `бой #${fight.bossIndex}` : `${b.attemptsLeft}/${ATTACKS_PER_DAY}`}</small>
                  </>
                ) : b.canUnlock ? (
                  <button className="btn-unlock comic" disabled={busy === "unlock"} onClick={() => act("unlock", { boss: b.index }, `Босс #${b.index} открыт!`)}>
                    OPEN<br /><span className="keys"><UIcon name="key" size={14} />{KEYS_TO_UNLOCK}</span>
                  </button>
                ) : (
                  <div className="key-need">
                    <UIcon name={b.index === 1 ? "lock" : "key"} size={22} />
                    <small>{b.index > 1 ? `${Math.min(b.keysHave, KEYS_TO_UNLOCK)}/${KEYS_TO_UNLOCK}` : ""}</small>
                    <small className="muted">ключи #{b.index - 1}</small>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted small center">У каждого свой бой, но урон глобальный: удар любого игрока по любому боссу бьёт и твоего босса. На каждого босса — {ATTACKS_PER_DAY} нападений в сутки. Победа даёт ключ, {KEYS_TO_UNLOCK} ключа открывают следующего босса.</p>
    </div>
  );
}

function WeaponIcon({ id, size }: { id: string; size: number }) {
  if (id === "fists") return <span className="fist-ic" style={{ fontSize: size * 0.7, width: size, height: size }}>👊</span>;
  return <ItemIcon id={id} size={size} />;
}
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/** Full-screen personal fight. Damage of all players (on any boss) also hits this boss. */
export function FightScreen() {
  const { fight: openIndex, setFight, game, act, busy, refresh, now } = useGame();
  const [view, setView] = useState<FightView | null>(null);
  const [pops, setPops] = useState<{ id: number; dmg: number }[]>([]);
  const [shake, setShake] = useState(0);
  const popSeq = useRef(0);
  const wonRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await api.fight();
      setView(r.fight);
      if (!r.fight) setFight(null);
      else if (r.fight.won && !wonRef.current) {
        wonRef.current = true;
        refresh(); // shows the victory window
      }
    } catch {
      /* keep the last view; the next poll retries */
    }
  }, [refresh, setFight]);

  useEffect(() => {
    if (openIndex === null) return;
    setView(null);
    wonRef.current = false;
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 3000);
    return () => clearInterval(t);
  }, [openIndex, load]);

  if (openIndex === null || !game) return null;
  const def = BOSSES.find((b) => b.index === openIndex)!;
  const st = game.fight;
  const hp = view?.hp ?? st?.hp ?? def.hp;
  const hpMax = view?.hpMax ?? st?.hpMax ?? def.hp;
  const cooldowns = view?.cooldowns ?? st?.cooldowns ?? {};
  const won = hp <= 0;

  const hit = async (weapon: string) => {
    if (busy || won) return;
    haptic.tap();
    const r = await act<HitResult>("fight_hit", { weapon });
    if (!r) return;
    const id = ++popSeq.current;
    setPops((p) => [...p.slice(-3), { id, dmg: r.dmg }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 900);
    setShake((n) => n + 1);
    setView((v) => (v ? { ...v, hp: r.hp, won: r.won, cooldowns: { ...v.cooldowns, [weapon]: r.readyAt } } : v));
    if (r.won) {
      wonRef.current = true;
      haptic.ok();
    }
    load();
  };

  return (
    <div className="fight">
      <header className="fight-top">
        <button className="x-btn" onClick={() => setFight(null)} aria-label="Назад">←</button>
        <div className="grow minw0 center">
          <div className="comic fight-name ellipsis">#{def.index} {def.name}</div>
          <div className="small muted ellipsis">{def.title}</div>
        </div>
        {!won && (
          <ConfirmButton className="btn-small red comic" disabled={!!busy} confirmText="Точно?" onConfirm={async () => { if (await act("fight_flee", {}, "Ты сбежал с поля боя")) setFight(null); }}>
            Сбежать
          </ConfirmButton>
        )}
      </header>

      <div className="fight-body">
        <div className="fight-stage">
          <div key={shake} className={`fight-boss ${shake ? "shake" : ""} ${won ? "dead" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bossImage(def)} alt="" draggable={false} />
          </div>
          {pops.map((p, i) => (
            <span key={p.id} className="hit-pop comic" style={{ left: `${38 + ((p.id * 17) % 28)}%`, top: `${30 + i * 6}%` }}>-{fmtNum(p.dmg)}</span>
          ))}
          {won && <span className="result-stamp comic win">K.O.</span>}
        </div>
        <div className="fight-hp">
          <Bar value={hp} max={hpMax} tone="red" label={`❤ ${fmtNum(hp)} / ${fmtNum(hpMax)}`} />
          <div className="row-c between small muted">
            <span>Награда: <PriceTag price={def.reward} size={13} /></span>
            <span>+ключ #{def.index}</span>
          </div>
        </div>

        <section className="panel dmg-panel">
          <div className="row-c between">
            <h3 className="comic">ГЛОБАЛЬНЫЙ УРОН</h3>
            <span className="small muted">всего {fmtNum(view?.total ?? 0)}</span>
          </div>
          <div className="small muted">Удары всех игроков с начала твоего боя — они бьют и твоего босса.</div>
          {!view && <div className="muted small">Загрузка…</div>}
          {view && view.damage.length === 0 && <div className="muted small">Пока тихо — нанеси первый удар!</div>}
          {view?.damage.map((d, i) => (
            <div key={d.id} className={`dmg-row ${d.id === game.player.id ? "me" : ""}`}>
              <span className="rank comic">{i + 1}</span>
              <Avatar url={d.photo_url} name={d.name} size={30} />
              <div className="grow minw0">
                <div className="row-c between gap">
                  <b className="ellipsis">{d.id === game.player.id ? "Ты" : d.name}</b>
                  <b className="comic nowrap">−{fmtNum(d.damage)}</b>
                </div>
                <div className="small muted">босс #{d.boss_index} · ударов: {d.hits}</div>
              </div>
            </div>
          ))}
        </section>
      </div>

      <footer className="weapon-bar">
        <div className="small muted weapon-hint">{won ? "Босс повержен!" : "Нажми на оружие, чтобы ударить"}</div>
        <div className="weapons">
          {game.weapons.map((w) => {
            const left = (cooldowns[w.id] ?? 0) - now;
            const cd = left > 0;
            return (
              <button key={w.id} className={`weapon ${cd ? "cd" : "ready"}`} disabled={!!busy || cd || won} onClick={() => hit(w.id)}>
                <WeaponIcon id={w.id} size={42} />
                <span className="w-name ellipsis">{w.name}</span>
                <span className="w-dmg comic">{fmtNum(w.dmg)}</span>
                <span className="w-cd">{cd ? `⏳ ${mmss(left)}` : `⟳ ${w.cooldownMin >= 60 ? `${w.cooldownMin / 60}ч` : `${w.cooldownMin}м`}`}</span>
              </button>
            );
          })}
        </div>
      </footer>
    </div>
  );
}

/** Shown as soon as the active fight's boss reaches 0 HP. Claiming returns the player to the boss list. */
export function VictoryModal() {
  const { game, act, busy, setFight, setTab, toast } = useGame();
  const f = game?.fight;
  if (!f?.won) return null;
  const def = BOSSES.find((b) => b.index === f.bossIndex)!;
  const claim = async () => {
    const r = await act<VictoryResult>("fight_claim");
    if (!r) return;
    haptic.ok();
    if (r.items.length) toast("ok", `Бонус: ${r.items.map((id) => itemById(id)?.name ?? id).join(", ")}!`);
    setFight(null);
    setTab("boss");
  };
  return (
    <div className="modal-backdrop">
      <div className="victory">
        <div className="victory-title comic">VICTORY!</div>
        <div className="victory-boss">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bossImage(def)} alt="" />
          <span className="result-stamp comic win">K.O.</span>
        </div>
        <div className="comic big center">{def.name} повержен</div>
        <div className="battle-rewards">
          <span className="reward"><PriceTag price={def.reward} /></span>
          <span className="reward"><ItemIcon id={`key-${def.index}`} size={24} /> ключ #{def.index}</span>
          <span className="reward">+{def.xp} XP</span>
          <span className="reward">+{def.power} ⚔</span>
          {def.firstWinItem && (game?.bosses.find((b) => b.index === def.index)?.wins ?? 0) === 0 && (
            <span className="reward"><ItemIcon id={def.firstWinItem} size={24} /> {itemById(def.firstWinItem)?.name}</span>
          )}
        </div>
        <div className="small muted center">Шанс сундука: {Math.round(def.chestChance * 100)}%</div>
        <button className="btn-green comic" disabled={busy === "fight_claim"} onClick={claim}>ЗАБРАТЬ НАГРАДУ</button>
      </div>
    </div>
  );
}
