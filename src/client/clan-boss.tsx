"use client";
/*
 * The clan boss of the week on my clan's page (server: systems/clan-boss.ts): one of the drawn bosses with HP for the
 * whole clan, hit with the usual weapons; the members' damage list with shares; when he falls everyone who hit gets a
 * prize by his share (the prize window).
 */
import { useState } from "react";
import Link from "next/link";
import { useGame, useNow } from "./store.tsx";
import { WEAPONS } from "../content/items.ts";
import { bossById } from "../content/bosses.ts";
import { BossRig, hasBossRig } from "./art/boss-rig.tsx";
import { ItemArt } from "./art/items.tsx";
import { Avatar, Bar, RewardChips } from "./ui.tsx";
import { clock, full, short } from "./format.ts";
import { haptic } from "./telegram.ts";
import { sfx, weaponSfx } from "./sound.ts";
import { weaponStats } from "./weapon-stats.ts";
import type { Reward } from "../content/rewards.ts";

export interface ClanBossInfo {
  clanId: number; week: string; bossId: string; hpMax: number; hp: number; killed: boolean; endsAt: number; size: number;
  top: { id: number; name: string; photo: string | null; damage: number; hits: number; share: number }[];
  pool: Reward;
}

/** "3 д 4 ч" for long waits, the clock for the last day */
function until(ms: number) {
  const d = Math.floor(ms / 86_400_000);
  return d < 1 ? clock(ms) : `${d} д ${Math.floor((ms % 86_400_000) / 3_600_000)} ч`;
}

export function ClanBossPanel() {
  const { state, act, busy, toast } = useGame();
  const now = useNow();
  const [ouch, setOuch] = useState(0);
  const [x10, setX10] = useState(false);
  const cb = state?.clanBoss;
  if (!state || !cb) return null;
  const boss = bossById(cb.bossId);
  if (!boss) return null;
  const qtyOf = (id: string) => state.inventory.find((i) => i.id === id)?.qty ?? 0;
  const hit = async (id: string) => {
    const w = WEAPONS.find((x) => x.id === id)!;
    const ready = state.cooldowns[id] ?? 0;
    if (w.weapon!.kind !== "consumable" && ready > now) { haptic.err(); toast(`${w.name} перезаряжается: ещё ${clock(ready - now)}`, "err"); return; }
    haptic.tap();
    weaponSfx(id, 0.6);
    const r = await act<{ damage: number; crit: boolean; killed: boolean }>("clan_boss_hit", { weapon: id, count: x10 && w.weapon!.kind === "consumable" ? 10 : 1 },
      (x) => (x.killed ? "Босс повержен! Призы — в окне наград" : `−${full(x.damage)}${x.crit ? " · КРИТ" : ""}`));
    if (r) {
      setOuch((k) => k + 1);
      if (r.killed) { haptic.big(); sfx("win"); }
    }
  };
  const mine = cb.top.find((t) => t.id === state.player.id);
  return (
    <div className="panel col cb" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b className="display">Клановый босс недели</b>
        <span className="tiny muted">{cb.killed ? "повержен" : `уйдёт через ${until(cb.endsAt - now)}`}</span>
      </div>
      <div className={`cb-stage ${cb.killed ? "down" : ""}`}>
        <div key={ouch} className={`arena-photo cb-photo ${ouch ? "ouch hit" : ""}`}>
          {hasBossRig(boss.id)
            ? <BossRig id={boss.id} hpShare={cb.hp / Math.max(1, cb.hpMax)} />
            // eslint-disable-next-line @next/next/no-img-element
            : boss.photo.full ? <img src={boss.photo.full} alt="" draggable={false} /> : null}
        </div>
        {cb.killed && <span className="cb-stamp display">ПОВЕРЖЕН</span>}
        <span className="cb-name display">{boss.name}</span>
      </div>
      <Bar value={cb.hp} max={cb.hpMax} tone="red" height={22} label={`${full(cb.hp)} / ${full(cb.hpMax)}`} />
      <div className="tiny muted">HP на весь клан ({cb.size} чел.). Бьют только участники. Когда упадёт — каждый, кто бил, получит приз по своей доле урона.</div>

      {!cb.killed && (
        <>
          <div className="cb-tray">
            {WEAPONS.map((w) => {
              const q = qtyOf(w.id);
              const consumable = w.weapon!.kind === "consumable";
              const cd = !consumable ? Math.max(0, (state.cooldowns[w.id] ?? 0) - now) : 0;
              const empty = q < 1;
              return (
                <button key={w.id} type="button" className={`cb-w ${empty ? "empty" : ""} ${cd ? "cd" : ""}`} disabled={empty || !!busy} onClick={() => hit(w.id)} aria-label={w.name}>
                  <ItemArt id={w.id} size={34} />
                  <small className="num">−{short(weaponStats(state, w.id).damage * (x10 && consumable ? 10 : 1))}</small>
                  <i className="num">{cd ? clock(cd) : consumable ? q : ""}</i>
                </button>
              );
            })}
          </div>
          <label className="cb-x10"><input type="checkbox" checked={x10} onChange={(e) => setX10(e.target.checked)} /> бить ×10 (клавиатура, видеокарта, пушка)</label>
        </>
      )}

      <div className="cb-pool">
        <span className="tiny muted">Призовой фонд (делится по вкладу)</span>
        <RewardChips r={cb.pool} size={14} />
      </div>
      {cb.top.length > 0 && (
        <div className="col" style={{ gap: 4 }}>
          {cb.top.map((t, i) => (
            <Link key={t.id} href={`/profile?id=${t.id}`} className={`cb-row ${t.id === state.player.id ? "me" : ""}`}>
              <span className="num">{i + 1}</span>
              <Avatar name={t.name} photo={t.photo} size={28} />
              <b className="ellipsis grow">{t.name}</b>
              <span className="num">{short(t.damage)}</span>
              <span className="cb-share num">{Math.round(t.share * 1000) / 10}%</span>
            </Link>
          ))}
        </div>
      )}
      {!mine && !cb.killed && <div className="tiny muted center">Ты ещё не бил этого босса — начни, пока он не ушёл.</div>}
    </div>
  );
}
