"use client";
import { bossArt, skinUrl } from "../../shared/skin.ts";
import { useEffect, useRef, useState } from "react";
import { useGame } from "../store.tsx";
import { BOSSES } from "../../shared/content.ts";
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
                <img src={bossArt(def)} alt="" draggable={false} />
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
                      <button className={`btn-attack comic ${fight.won ? "won" : fight.lost ? "lost" : "live"}`} onClick={() => setFight(b.index)}>{fight.won ? "WIN!" : fight.lost ? "ИТОГ" : "В БОЮ"}</button>
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
      <p className="muted small center">У каждого свой бой, но урон глобальный: удар любого игрока по любому боссу бьёт и твоего босса. На бой — 8 часов. На каждого босса — {ATTACKS_PER_DAY} нападений в сутки. Победа даёт ключ, {KEYS_TO_UNLOCK} ключа открывают следующего босса.</p>
    </div>
  );
}

export function WeaponIcon({ id, size }: { id: string; size: number }) {
  if (id === "fists") {
    const up = skinUrl("fists");
    // eslint-disable-next-line @next/next/no-img-element
    if (up) return <img className="skin-img" src={up} alt="" width={size} height={size} draggable={false} />;
    return <span className="fist-ic" style={{ fontSize: size * 0.7, width: size, height: size }}>👊</span>;
  }
  return <ItemIcon id={id} size={size} />;
}
export const hms = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/** Personal fight, shown between the HUD and the bottom menu. Damage of all players (on any boss) also hits this boss. */
export function FightScreen() {
  const { fight: openIndex, setFight, game, act, busy, refresh, now, openSheet } = useGame();
  const [view, setView] = useState<FightView | null>(null);
  const [pops, setPops] = useState<{ id: number; dmg: number }[]>([]);
  const [shake, setShake] = useState(0);
  const popSeq = useRef(0);
  const doneRef = useRef(false);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // poll the fight once every 3 s; the effect depends only on the boss, so the list never resets between polls
  useEffect(() => {
    if (openIndex === null) return;
    let alive = true;
    doneRef.current = false;
    const load = async () => {
      try {
        const r = await api.fight();
        if (!alive) return;
        if (!r.fight) return setFight(null);
        setView(r.fight);
        if ((r.fight.won || r.fight.lost) && !doneRef.current) {
          doneRef.current = true;
          refreshRef.current(); // result window
        }
      } catch {
        /* keep the last view; the next poll retries */
      }
    };
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 3000);
    return () => { alive = false; clearInterval(t); };
  }, [openIndex, setFight]);

  if (openIndex === null || !game) return null;
  const def = BOSSES.find((b) => b.index === openIndex)!;
  const st = game.fight;
  const hp = view?.hp ?? st?.hp ?? def.hp;
  const hpMax = view?.hpMax ?? st?.hpMax ?? def.hp;
  const endsAt = view?.endsAt ?? st?.endsAt ?? now;
  const cooldowns = view?.cooldowns ?? st?.cooldowns ?? {};
  const over = hp <= 0 || now > endsAt;

  const hit = async (weapon: string) => {
    if (busy || over) return;
    haptic.tap();
    const r = await act<HitResult>("fight_hit", { weapon });
    if (!r) return;
    const id = ++popSeq.current;
    setPops((p) => [...p.slice(-3), { id, dmg: r.dmg }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 900);
    setShake((n) => n + 1);
    setView((v) => (v ? { ...v, hp: r.hp, won: r.won, cooldowns: r.readyAt ? { ...v.cooldowns, [weapon]: r.readyAt } : v.cooldowns } : v));
    if (r.won) {
      doneRef.current = true;
      haptic.ok();
    }
  };

  return (
    <div className="screen fight-view">
      <div className="fight-top">
        <div className="grow minw0">
          <div className="comic fight-name ellipsis">#{def.index} {def.name}</div>
          <div className="small muted ellipsis">{def.title}</div>
        </div>
        <div className="fight-timer comic" title="До конца боя">⏱ {hms(endsAt - now)}</div>
      </div>

      <div className="fight-stage">
        <div key={shake} className={`fight-boss ${shake ? "shake" : ""} ${hp <= 0 ? "dead" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bossArt(def)} alt="" draggable={false} />
        </div>
        {pops.map((p, i) => (
          <span key={p.id} className="hit-pop comic" style={{ left: `${38 + ((p.id * 17) % 28)}%`, top: `${30 + i * 6}%` }}>-{fmtNum(p.dmg)}</span>
        ))}
        {hp <= 0 && <span className="result-stamp comic win">K.O.</span>}
      </div>
      <div className="fight-hp">
        <Bar value={hp} max={hpMax} tone="red" label={`❤ ${fmtNum(hp)} / ${fmtNum(hpMax)}`} />
        <div className="row-c between small muted">
          <span>Награда: <PriceTag price={def.reward} size={13} /></span>
          <span>+ключ #{def.index}</span>
        </div>
      </div>

      <div className="weapon-bar">
        <div className="row-c between weapon-hint">
          <span className="small muted">{over ? "Бой окончен" : "Нажми на оружие, чтобы ударить"}</span>
          <button className="btn-small comic" onClick={() => openSheet("shop")}>+ Оружие</button>
        </div>
        <div className="weapons">
          {game.weapons.map((w) => {
            const left = (cooldowns[w.id] ?? 0) - now;
            const cd = left > 0;
            return (
              <button key={w.id} className={`weapon ${cd ? "cd" : "ready"}`} disabled={!!busy || cd || over} onClick={() => hit(w.id)}>
                <WeaponIcon id={w.id} size={40} />
                {w.qty !== null && <span className="w-qty comic">×{w.qty}</span>}
                <span className="w-name ellipsis">{w.name}</span>
                <span className="w-dmg comic">{fmtNum(w.dmg)}</span>
                {w.qty === null && <span className="w-cd">{cd ? `⏳ ${hms(left)}` : "готов"}</span>}
              </button>
            );
          })}
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

      {!over && (
        <ConfirmButton className="btn-dark comic" disabled={!!busy} confirmText="Нажми ещё раз — бой будет проигран" onConfirm={async () => { if (await act("fight_flee", {}, "Ты сбежал с поля боя")) setFight(null); }}>
          СБЕЖАТЬ
        </ConfirmButton>
      )}
    </div>
  );
}

/** Victory or defeat window: opens on the Boss tab (or in the fight) once the fight is over. Closing returns to the boss list. */
export function ResultModal() {
  const { game, act, busy, setFight, setTab, toast, tab, fight: openFight } = useGame();
  const f = game?.fight;
  if (!f || !(f.won || f.lost) || (tab !== "boss" && openFight === null)) return null;
  const def = BOSSES.find((b) => b.index === f.bossIndex)!;
  const close = async () => {
    const r = await act<VictoryResult>("fight_claim");
    if (!r) return;
    if (r.outcome === "win") haptic.ok();
    if (r.items.length) toast("ok", `Бонус: ${r.items.map((id) => itemById(id)?.name ?? id).join(", ")}!`);
    setTab("boss");
  };
  const win = f.won;
  return (
    <div className="modal-backdrop">
      <div className={`victory ${win ? "" : "defeat"}`}>
        <div className="victory-title comic">{win ? "ПОБЕДА!" : "ПОРАЖЕНИЕ"}</div>
        <div className="victory-boss">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bossArt(def)} alt="" />
          <span className={`result-stamp comic ${win ? "win" : "lose"}`}>{win ? "K.O." : "TIME"}</span>
        </div>
        <div className="comic big center">{win ? `${def.name} повержен` : `${def.name} выстоял 8 часов`}</div>
        {win ? (
          <>
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
          </>
        ) : (
          <div className="small muted center">Осталось {fmtNum(f.hp)} из {fmtNum(f.hpMax)} HP. Прокачайся, закупи оружие и попробуй снова.</div>
        )}
        <button className={win ? "btn-green comic" : "btn-dark comic"} disabled={busy === "fight_claim"} onClick={close}>{win ? "ЗАБРАТЬ НАГРАДУ" : "ЗАКРЫТЬ"}</button>
      </div>
    </div>
  );
}
