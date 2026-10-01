"use client";
import { useEffect, useState } from "react";
import { useGame } from "../store.tsx";
import { BOSSES, bossImage } from "../../shared/content.ts";
import { ATTACKS_PER_DAY, KEYS_TO_UNLOCK } from "../../shared/economy.ts";
import { itemById } from "../../shared/items.ts";
import { Bar, PriceTag, fmtNum, countdown } from "../ui.tsx";
import { UIcon } from "../art/icons.tsx";
import { ItemIcon } from "../art/items.tsx";
import { haptic } from "../telegram.ts";
import type { BattleResult } from "../api.ts";

export function BossScreen() {
  const { game, act, busy, setBattle, now } = useGame();
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
          const chance = Math.round(b.winChance * 100);
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
                  <Bar value={b.hp} max={b.hp} tone="red" label={`${fmtNum(b.hp)} HP`} />
                </div>
                <div className="boss-meta">
                  <span title="Награда"><PriceTag price={b.reward} size={14} /></span>
                  <span title="Побед">🏆 {b.wins}</span>
                  {!locked && <span className={chance >= 70 ? "up" : chance >= 30 ? "warn-t" : "down"} title="Шанс победы">🎯 {chance}%</span>}
                </div>
              </div>
              <div className="boss-act">
                {!locked ? (
                  <>
                    <button
                      className="btn-attack comic"
                      disabled={b.attemptsLeft <= 0 || busy === "attack"}
                      onClick={async () => {
                        haptic.tap();
                        const r = await act<BattleResult>("attack", { boss: b.index });
                        if (r) setBattle(r);
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
      <p className="muted small center">Победа даёт ключ этого босса. {KEYS_TO_UNLOCK} ключа открывают следующего. Сила растёт от заданий, побед и экипировки.</p>
    </div>
  );
}

export function BattleModal() {
  const { battle, setBattle } = useGame();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!battle) return;
    setStep(0);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setStep(i);
      if (i <= battle.hits.length) haptic.tap();
      if (i > battle.hits.length) {
        clearInterval(t);
        if (battle.win) haptic.ok(); else haptic.err();
      }
    }, 260);
    return () => clearInterval(t);
  }, [battle]);
  if (!battle) return null;
  const def = BOSSES.find((b) => b.index === battle.bossIndex)!;
  const dealt = battle.hits.slice(0, step).reduce((s, h) => s + h.dmg, 0);
  const done = step > battle.hits.length;
  const last = battle.hits[Math.min(step, battle.hits.length) - 1];
  return (
    <div className="modal-backdrop" onClick={() => done && setBattle(null)}>
      <div className={`battle ${done ? (battle.win ? "won" : "lost") : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="battle-name comic">{def.name}</div>
        <div className={`battle-boss ${step > 0 && !done ? "shake" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bossImage(def)} alt="" />
          {last && !done && <span key={step} className={`hit-pop comic ${last.crit ? "crit" : ""}`}>-{fmtNum(last.dmg)}{last.crit ? "!" : ""}</span>}
          {done && <span className={`result-stamp comic ${battle.win ? "win" : "lose"}`}>{battle.win ? "VICTORY" : "DEFEAT"}</span>}
        </div>
        <Bar value={Math.max(0, battle.hp - dealt)} max={battle.hp} tone="red" label={`${fmtNum(Math.max(0, battle.hp - dealt))} / ${fmtNum(battle.hp)}`} />
        <div className="small muted center">Твоя сила: {fmtNum(battle.power)} · удар {Math.min(step, battle.hits.length)}/{battle.hits.length}</div>
        {done && (
          <div className="battle-rewards">
            {battle.win ? (
              <>
                {battle.reward && <span className="reward"><PriceTag price={battle.reward} /></span>}
                {battle.key && <span className="reward"><ItemIcon id={battle.key} size={26} /> ключ</span>}
                {battle.items.map((id) => <span key={id} className="reward"><ItemIcon id={id} size={26} /> {itemById(id)?.name}</span>)}
                <span className="reward">+{battle.xp} XP</span>
                <span className="reward">+{def.power} ⚔</span>
              </>
            ) : (
              <span className="reward">+{battle.xp} XP · прокачай силу и возвращайся</span>
            )}
          </div>
        )}
        {done && <button className="btn-green comic" onClick={() => setBattle(null)}>{battle.attemptsLeft > 0 ? `OK · осталось ${battle.attemptsLeft}` : "OK"}</button>}
      </div>
    </div>
  );
}
