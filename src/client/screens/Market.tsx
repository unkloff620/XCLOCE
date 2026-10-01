"use client";
import { useState } from "react";
import { useGame } from "../store.tsx";
import { LOCATIONS, type LocationDef } from "../../shared/content.ts";
import { itemById } from "../../shared/items.ts";
import { PriceTag, Bar, fmtCur } from "../ui.tsx";
import { UIcon } from "../art/icons.tsx";
import { ItemIcon } from "../art/items.tsx";
import { haptic } from "../telegram.ts";
import type { LocationReward, TaskResult } from "../api.ts";

type Progress = { progress: Record<string, number>; clears: Record<string, number> };

function unlocked(loc: LocationDef, p: Progress) {
  if (loc.index === 1) return true;
  const prev = LOCATIONS.find((l) => l.index === loc.index - 1);
  return !!prev && (p.clears[prev.id] ?? 0) > 0;
}
const doneCount = (loc: LocationDef, p: Progress) => loc.tasks.filter((t) => (p.progress[t.id] ?? 0) >= t.target).length;

export function MarketScreen() {
  const { game, energyNow, nextEnergyIn, openSheet } = useGame();
  const [openId, setOpenId] = useState<string | null>(null);
  const [rewardFor, setRewardFor] = useState<string | null>(null);
  if (!game) return null;
  const p = game.player;
  const prog = game.locations;
  const open = LOCATIONS.find((l) => l.id === openId) ?? null;

  return (
    <div className="screen">
      <div className="screen-title">
        {open ? (
          <button className="back-link comic" onClick={() => setOpenId(null)}>← ЛОКАЦИИ</button>
        ) : (
          <h2 className="comic">MARKET</h2>
        )}
        <span className="muted small">{open ? open.name : "Локации и задания за энергию"}</span>
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

      {open ? (
        <LocationView loc={open} prog={prog} onComplete={() => setRewardFor(open.id)} />
      ) : (
        <div className="loc-list">
          {LOCATIONS.map((l) => {
            const ok = unlocked(l, prog);
            const done = doneCount(l, prog);
            const clears = prog.clears[l.id] ?? 0;
            return (
              <button key={l.id} className={`loc-card ${ok ? "" : "locked"}`} style={{ background: l.bg }} disabled={!ok} onClick={() => setOpenId(l.id)}>
                <span className="loc-emoji">{ok ? l.emoji : "?"}</span>
                <span className="loc-info">
                  <span className="loc-n comic">ЛОКАЦИЯ {l.index}</span>
                  <b className="loc-name comic">{ok ? l.name : "???"}</b>
                  <span className="small loc-sub">{ok ? l.subtitle : `Пройди «${LOCATIONS[l.index - 2]?.name}»`}</span>
                  {ok && <Bar value={done} max={l.tasks.length} tone="gold" label={`${done}/${l.tasks.length} заданий`} />}
                </span>
                <span className="loc-side">
                  {!ok ? <UIcon name="lock" size={26} /> : done === l.tasks.length ? <span className="chip-owned">Награда!</span> : clears > 0 ? <span className="chip-owned">✓ ×{clears}</span> : <span className="loc-go comic">›</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {rewardFor && <LocationRewardModal locId={rewardFor} onClose={() => { setRewardFor(null); setOpenId(null); }} />}
    </div>
  );
}

function LocationView({ loc, prog, onComplete }: { loc: LocationDef; prog: Progress; onComplete: () => void }) {
  const { game, act, busy, energyNow } = useGame();
  if (!game) return null;
  const allDone = doneCount(loc, prog) === loc.tasks.length;
  return (
    <div className="section">
      <section className="loc-head" style={{ background: loc.bg }}>
        <span className="loc-emoji big-emoji">{loc.emoji}</span>
        <div className="grow minw0">
          <b className="comic loc-name">{loc.name}</b>
          <div className="small loc-sub">{loc.subtitle}</div>
          <div className="loc-reward small">
            <span>За всю локацию:</span>
            <PriceTag price={loc.reward.price} size={14} />
            {loc.reward.items.map((id, i) => <ItemIcon key={i} id={id} size={20} />)}
            <span>+{loc.reward.power} ⚔</span>
          </div>
        </div>
      </section>
      {allDone && <button className="btn-yellow comic" onClick={onComplete}>ЗАБРАТЬ НАГРАДУ ЛОКАЦИИ</button>}
      <div className="task-list">
        {loc.tasks.map((t) => {
          const n = prog.progress[t.id] ?? 0;
          const done = n >= t.target;
          const can = !done && energyNow >= t.energy;
          return (
            <div key={t.id} className={`task ${done ? "done" : ""}`}>
              <div className="grow minw0">
                <div className="task-title">{t.title}</div>
                <Bar value={n} max={t.target} tone={done ? "green" : "violet"} label={`${n}/${t.target}`} />
                <div className="task-rew">
                  <span className="muted">шаг:</span>
                  <PriceTag price={{ currency: t.reward.currency, amount: t.reward.amount * (game.weekend ? 2 : 1) }} size={14} />
                  <span>+{t.xp} XP</span>
                  <span className="muted">· готово: +{t.power} ⚔</span>
                </div>
              </div>
              {done ? (
                <span className="chip-owned">✓</span>
              ) : (
                <button
                  className="btn-task comic"
                  disabled={!can || busy === "task"}
                  onClick={async () => {
                    haptic.tap();
                    const r = await act<TaskResult>("task", { taskId: t.id }, (x) => `+${fmtCur(x.reward.amount, x.reward.currency)}${x.done ? " · задание выполнено!" : ""}`);
                    if (r?.locationComplete) onComplete();
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

function LocationRewardModal({ locId, onClose }: { locId: string; onClose: () => void }) {
  const { act, busy } = useGame();
  const loc = LOCATIONS.find((l) => l.id === locId)!;
  const [got, setGot] = useState<LocationReward | null>(null);
  const next = LOCATIONS.find((l) => l.index === loc.index + 1);
  return (
    <div className="modal-backdrop">
      <div className="victory">
        <div className="victory-title comic">ЛОКАЦИЯ ПРОЙДЕНА!</div>
        <div className="loc-head" style={{ background: loc.bg }}>
          <span className="loc-emoji big-emoji">{loc.emoji}</span>
          <b className="comic loc-name">{loc.name}</b>
        </div>
        <div className="battle-rewards">
          <span className="reward"><PriceTag price={loc.reward.price} /></span>
          {loc.reward.items.map((id, i) => <span key={i} className="reward"><ItemIcon id={id} size={24} /> {itemById(id)?.name}</span>)}
          <span className="reward">+{loc.reward.xp} XP</span>
          <span className="reward">+{loc.reward.power} ⚔</span>
        </div>
        {got ? (
          <>
            <div className="small center up">Награда получена!{next && (got.clears === 1 ? ` Открыта локация «${next.name}».` : "")} Задания локации можно пройти заново.</div>
            <button className="btn-green comic" onClick={onClose}>ОК</button>
          </>
        ) : (
          <button className="btn-green comic" disabled={busy === "location_claim"} onClick={async () => {
            const r = await act<LocationReward>("location_claim", { locationId: loc.id });
            if (r) { haptic.ok(); setGot(r); }
          }}>ЗАБРАТЬ НАГРАДУ</button>
        )}
      </div>
    </div>
  );
}
