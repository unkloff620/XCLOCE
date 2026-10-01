"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { BOSSES, bossImage } from "../../shared/content.ts";
import { ATTACKS_PER_DAY, KEYS_TO_UNLOCK } from "../../shared/economy.ts";
import { itemById } from "../../shared/items.ts";
import { Avatar, Bar, PriceTag, fmtCur, fmtNum, countdown } from "../ui.tsx";
import { UIcon } from "../art/icons.tsx";
import { ItemIcon } from "../art/items.tsx";
import { haptic } from "../telegram.ts";
import { api, type BossFight, type HitResult, type KillReward } from "../api.ts";

export function BossScreen() {
  const { game, act, busy, setFight, now } = useGame();
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
                    <button
                      className="btn-attack comic"
                      onClick={() => {
                        haptic.tap();
                        setFight(b.index);
                      }}
                    >
                      ATTACK
                    </button>
                    <small className="muted">{b.attemptsLeft}/{ATTACKS_PER_DAY}</small>
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
      <p className="muted small center">Здоровье босса общее для всех игроков. Каждый удар тратит 1 из {ATTACKS_PER_DAY} нападений в сутки. Когда босс падает, награду делят по нанесённому урону, а ключ получает добивший и все, кто снёс от 10% HP. {KEYS_TO_UNLOCK} ключа открывают следующего босса.</p>
    </div>
  );
}

const WEAPON_NAME = (id: string) => (id === "fists" ? "Кулаки" : itemById(id)?.name ?? id);

function WeaponIcon({ id, size }: { id: string; size: number }) {
  if (id === "fists") return <span className="fist-ic" style={{ fontSize: size * 0.7, width: size, height: size }}>👊</span>;
  return <ItemIcon id={id} size={size} />;
}

function RewardLine({ r }: { r: KillReward }) {
  return (
    <div className="battle-rewards">
      {r.amount > 0 && <span className="reward"><PriceTag price={{ currency: r.currency, amount: r.amount }} /></span>}
      {r.key && <span className="reward"><ItemIcon id={`key-${r.bossIndex}`} size={24} /> ключ</span>}
      {r.items.map((id) => <span key={id} className="reward"><ItemIcon id={id} size={24} /> {itemById(id)?.name}</span>)}
      <span className="reward">+{r.xp} XP</span>
      {r.power > 0 && <span className="reward">+{r.power} ⚔</span>}
    </div>
  );
}

/** Full-screen fight: the boss with shared HP, damage list of all players, my weapons at the bottom. */
export function FightScreen() {
  const { fight: bossIndex, setFight, game, act, busy, applyState, toast } = useGame();
  const [view, setView] = useState<BossFight | null>(null);
  const [pops, setPops] = useState<{ id: number; dmg: number; crit: boolean }[]>([]);
  const [shake, setShake] = useState(0);
  const [ko, setKo] = useState<KillReward | null>(null);
  const [otherKill, setOtherKill] = useState<BossFight["lastKill"] | null>(null);
  const instRef = useRef<number | null>(null);
  const popSeq = useRef(0);

  const load = useCallback(async (idx: number) => {
    try {
      const r = await api.boss(idx);
      if (r.state) applyState(r.state);
      const prev = instRef.current;
      instRef.current = r.fight.instanceId;
      // someone else finished the boss while we were watching
      if (prev !== null && prev !== r.fight.instanceId && r.fight.lastKill && r.fight.lastKill.killerId !== game?.player.id) setOtherKill(r.fight.lastKill);
      setView(r.fight);
    } catch {
      /* keep the last view; next poll will retry */
    }
  }, [applyState, game?.player.id]);

  useEffect(() => {
    if (bossIndex === null) return;
    setView(null);
    setKo(null);
    setOtherKill(null);
    instRef.current = null;
    load(bossIndex);
    const t = setInterval(() => document.visibilityState === "visible" && load(bossIndex), 3000);
    return () => clearInterval(t);
  }, [bossIndex, load]);

  if (bossIndex === null || !game) return null;
  const def = BOSSES.find((b) => b.index === bossIndex)!;
  const st = game.bosses.find((b) => b.index === bossIndex)!;
  const attemptsLeft = view?.attemptsLeft ?? st.attemptsLeft;
  const weapons = [...game.weapons].sort((a, b) => b.avg - a.avg);
  const hp = view?.hp ?? st.hp;
  const hpMax = view?.hpMax ?? st.hpMax;

  const hit = async (weapon: string) => {
    if (busy || attemptsLeft <= 0) return;
    haptic.tap();
    const r = await act<HitResult>("hit", { boss: bossIndex, weapon });
    if (!r) return;
    const id = ++popSeq.current;
    setPops((p) => [...p.slice(-3), { id, dmg: r.dmg, crit: r.crit }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 900);
    setShake((n) => n + 1);
    if (r.crit) haptic.ok();
    setView((v) => (v ? { ...v, hp: r.hp, attemptsLeft: r.attemptsLeft } : v));
    if (r.killed && r.kill) {
      haptic.ok();
      setKo(r.kill);
      instRef.current = null; // the next instance is expected, not "killed by someone else"
    }
    load(bossIndex);
  };

  const total = view?.damage.reduce((s, d) => s + d.damage, 0) ?? 0;

  return (
    <div className="fight">
      <header className="fight-top">
        <button className="x-btn" onClick={() => setFight(null)} aria-label="Назад">←</button>
        <div className="grow minw0 center">
          <div className="comic fight-name ellipsis">#{def.index} {def.name}</div>
          <div className="small muted">{def.title}</div>
        </div>
        <div className="fight-att comic" title="Нападений осталось">⚔ {attemptsLeft}/{ATTACKS_PER_DAY}</div>
      </header>

      <div className="fight-body">
        <div className="fight-stage">
          <div key={shake} className={`fight-boss ${shake ? "shake" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bossImage(def)} alt="" draggable={false} />
          </div>
          {pops.map((p, i) => (
            <span key={p.id} className={`hit-pop comic ${p.crit ? "crit" : ""}`} style={{ left: `${38 + ((p.id * 17) % 28)}%`, top: `${30 + i * 6}%` }}>
              -{fmtNum(p.dmg)}{p.crit ? "!" : ""}
            </span>
          ))}
          {ko && <span className="result-stamp comic win">K.O.</span>}
        </div>
        <div className="fight-hp">
          <Bar value={hp} max={hpMax} tone="red" label={`❤ ${fmtNum(hp)} / ${fmtNum(hpMax)}`} />
          <div className="row-c between small muted">
            <span>Участников: {view?.participants ?? 0}</span>
            <span>Награда: {fmtCur(def.reward.amount, def.reward.currency)}</span>
          </div>
        </div>

        {ko && (
          <section className="panel ko-panel">
            <b className="comic">ТЫ ДОБИЛ БОССА!</b>
            <div className="small muted">Твой урон: {fmtNum(ko.damage)} ({Math.round(ko.share * 100)}%)</div>
            <RewardLine r={ko} />
            <button className="btn-green comic" onClick={() => setKo(null)}>ДАЛЬШЕ</button>
          </section>
        )}
        {!ko && otherKill && (
          <section className="panel ko-panel">
            <b className="comic">💀 {otherKill.killer} добил босса</b>
            {otherKill.myReward ? (
              <>
                <div className="small muted">Твой урон: {fmtNum(otherKill.myReward.damage)} ({Math.round(otherKill.myReward.share * 100)}%). Награда:</div>
                <RewardLine r={otherKill.myReward} />
              </>
            ) : <div className="small muted">Появился новый босс с полным здоровьем</div>}
            <button className="btn-small comic" onClick={() => setOtherKill(null)}>OK</button>
          </section>
        )}

        <section className="panel dmg-panel">
          <div className="row-c between">
            <h3 className="comic">УРОН ИГРОКОВ</h3>
            {view && view.my.hits > 0 && <span className="small">Твой: <b>{fmtNum(view.my.damage)}</b> · {view.my.hits} уд.</span>}
          </div>
          {!view && <div className="muted small">Загрузка…</div>}
          {view && view.damage.length === 0 && <div className="muted small">Пока никто не бил — нанеси первый удар!</div>}
          {view?.damage.map((d, i) => (
            <div key={d.id} className={`dmg-row ${d.id === game.player.id ? "me" : ""}`}>
              <span className="rank comic">{i + 1}</span>
              <Avatar url={d.photo_url} name={d.name} size={30} />
              <div className="grow minw0">
                <div className="row-c between"><b className="ellipsis">{d.id === game.player.id ? "Ты" : d.name}</b><b className="comic">{fmtNum(d.damage)}</b></div>
                <div className="dmg-bar"><span style={{ width: `${total ? (d.damage / total) * 100 : 0}%` }} /></div>
              </div>
            </div>
          ))}
        </section>
      </div>

      <footer className="weapon-bar">
        <div className="small muted weapon-hint">{attemptsLeft > 0 ? "Выбери оружие и бей" : "Удары кончились — новые завтра"}</div>
        <div className="weapons">
          {weapons.map((w, i) => (
            <button key={w.id} className={`weapon ${i === 0 ? "best" : ""}`} disabled={!!busy || attemptsLeft <= 0} onClick={() => hit(w.id)}>
              <WeaponIcon id={w.id} size={44} />
              <span className="w-name ellipsis">{WEAPON_NAME(w.id)}</span>
              <span className="w-dmg comic">~{fmtNum(w.avg)}</span>
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
