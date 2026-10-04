"use client";
import { useState } from "react";
import { ACH_CATEGORIES, ACHIEVEMENTS, TIER_COLORS, TIER_NAMES, achievementById, type AchCategory, type AchTier } from "../content/achievements.ts";
import { Icon, type IconName } from "./art/icons.tsx";
import { Modal, RewardChips } from "./ui.tsx";
import { useGame } from "./store.tsx";
import { haptic } from "./telegram.ts";
import { full, short } from "./format.ts";

export interface AchRow { id: string; progress: number; target: number; done: boolean; claimed: boolean; at: number | null }

/** A hexagonal medal in its tier colour (bronze → diamond); grey until earned. */
export function BadgeMedal({ icon, tier, earned, size = 54 }: { icon: string; tier: AchTier | 0; earned: boolean; size?: number }) {
  // drawn achievement pictures sit inside the same medal as the simple icons, at the same size
  const art = icon.startsWith("ach-");
  return (
    <span className={`badge-wrap ${art ? "art" : ""} ${earned ? "" : "locked"}`} style={{ width: size, height: size * 1.1 }}>
      <span className={`badge-medal tier-${tier} ${earned ? "" : "locked"}`} style={{ width: size, height: size * 1.1 }}>
        {!art && <Icon name={icon as IconName} size={size * 0.6} />}
      </span>
      {art && <span className="badge-art"><Icon name={icon as IconName} size={size * 0.74} /></span>}
    </span>
  );
}

const TIERS: AchTier[] = [1, 2, 3, 4, 5];

function catState(c: AchCategory, rows: Map<string, AchRow>, self: boolean) {
  const tiers = TIERS.map((t) => rows.get(`${c.id}-${t}`));
  // a tier counts as earned once collected (others' profiles: once reached)
  const earned = tiers.filter((r) => r && (r.claimed || (!self && r.done))).length as AchTier | 0;
  const reached = tiers.filter((r) => r?.done).length;
  const ready = self ? tiers.find((r) => r?.done && !r.claimed) ?? null : null;
  const progress = tiers[0]?.progress ?? 0;
  const next = c.targets[Math.min(4, reached)];
  return { tiers, earned, reached, ready, progress, next };
}

/** Profile block: one row per category with five coloured steps; on your own profile reached steps are collected. */
export function BadgesPanel({ rows, self, onClaimed }: { rows: AchRow[]; self: boolean; onClaimed?: () => void }) {
  const { act, busy } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const total = rows.filter((r) => r.claimed || (!self && r.done)).length;
  const claim = async (id: string) => {
    const r = await act("achievement_claim", { id }, "Награда за достижение получена");
    if (r) {
      haptic.big();
      onClaimed?.();
    }
  };
  const cat = open ? ACH_CATEGORIES.find((c) => c.id === open) : null;
  const cs = cat ? catState(cat, byId, self) : null;
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="small muted">ДОСТИЖЕНИЯ</span>
        <span className="tiny muted num">{total}/{ACHIEVEMENTS.length}</span>
      </div>
      <div className="col" style={{ gap: 8 }}>
        {ACH_CATEGORIES.map((c) => {
          const s = catState(c, byId, self);
          const maxed = s.reached >= 5;
          const pct = maxed ? 100 : Math.min(100, Math.round((s.progress / s.next) * 100));
          return (
            <div key={c.id} role="button" tabIndex={0} className={`ach-row ${s.ready ? "ready" : ""}`} onClick={() => setOpen(c.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(c.id)}>
              <BadgeMedal icon={c.icon} tier={s.earned} earned={s.earned > 0} size={44} />
              <span className="ach-main">
                <span className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <b className="ach-name">{c.name}</b>
                  <span className="ach-steps" aria-label={`${s.earned} из 5`}>
                    {TIERS.map((t, i) => {
                      const r = s.tiers[i];
                      const on = !!r && (r.claimed || (!self && r.done));
                      return <i key={t} className={`${on ? "on" : r?.done ? "due" : ""}`} style={{ ["--c" as string]: TIER_COLORS[t] }} title={`${TIER_NAMES[t]}: ${full(c.targets[i])}`} />;
                    })}
                  </span>
                </span>
                <span className="ach-bar sm" style={{ ["--p" as string]: `${pct}%`, ["--c" as string]: TIER_COLORS[Math.min(5, s.reached + 1) as AchTier] }}>
                  <i /><span className="num">{maxed ? "всё собрано" : `${short(s.progress)} / ${short(s.next)}`}</span>
                </span>
              </span>
              {/* collected right here, one after another; the row itself opens the details */}
              {s.ready && (
                <button className="btn gold sm ach-take" disabled={busy === "achievement_claim"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void claim(s.ready!.id);
                  }}>Забрать</button>
              )}
            </div>
          );
        })}
      </div>
      {cat && cs && (
        <Modal title={cat.name} onClose={() => setOpen(null)}>
          <div className="col" style={{ gap: 8 }}>
            <div className="small muted center">Прогресс: <b className="num" style={{ color: "var(--ink)" }}>{full(cs.progress)}</b></div>
            {TIERS.map((t, i) => {
              const r = cs.tiers[i];
              const def = achievementById(`${cat.id}-${t}`);
              if (!def) return null;
              const got = !!r?.claimed;
              const due = self && !!r?.done && !got;
              return (
                <div key={t} className={`ach-tier ${got ? "got" : due ? "due" : ""}`} style={{ ["--c" as string]: TIER_COLORS[t] }}>
                  <BadgeMedal icon={cat.icon} tier={t} earned={got || (!self && !!r?.done) || due} size={38} />
                  <span className="grow col" style={{ gap: 3, minWidth: 0 }}>
                    <b style={{ color: TIER_COLORS[t] }}>{TIER_NAMES[t]} · <span className="num">{full(def.target)}</span></b>
                    <span className="tiny muted">{def.hint}</span>
                    <RewardChips r={def.reward} size={13} />
                  </span>
                  {got ? <span className="quest-ok display">✓</span> : due ? (
                    <button className="btn gold sm" disabled={busy === "achievement_claim"} onClick={() => claim(def.id)}>Забрать</button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
