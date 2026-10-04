"use client";
import { useState } from "react";
import { ACHIEVEMENTS, achievementById } from "../content/achievements.ts";
import { Icon, type IconName } from "./art/icons.tsx";
import { Modal, RewardChips } from "./ui.tsx";
import { useGame } from "./store.tsx";
import { haptic } from "./telegram.ts";
import { full } from "./format.ts";

export interface AchRow { id: string; progress: number; target: number; done: boolean; claimed: boolean; at: number | null }

/** A hexagonal medal in its tier colour; grey until earned. */
export function BadgeMedal({ id, earned, size = 54 }: { id: string; earned: boolean; size?: number }) {
  const def = achievementById(id);
  if (!def) return null;
  return (
    <span className={`badge-medal tier-${def.tier} ${earned ? "" : "locked"}`} style={{ width: size, height: size * 1.1 }}>
      <Icon name={def.icon as IconName} size={size * 0.52} />
    </span>
  );
}

/** Profile block: all badges; on your own profile the reached ones can be collected. */
export function BadgesPanel({ rows, self, onClaimed }: { rows: AchRow[]; self: boolean; onClaimed?: () => void }) {
  const { act, busy } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  const earned = rows.filter((r) => r.claimed || r.done).length;
  const sel = open ? rows.find((r) => r.id === open) : null;
  const def = open ? achievementById(open) : null;
  const claim = async (id: string) => {
    const r = await act("achievement_claim", { id }, "Награда за достижение получена");
    if (r) {
      haptic.big();
      onClaimed?.();
      setOpen(null);
    }
  };
  // ready ones first, then earned, then the rest in catalogue order
  const order = (r: AchRow) => (r.done && !r.claimed && self ? 0 : r.claimed ? 1 : 2);
  const sorted = [...rows].sort((a, b) => order(a) - order(b) || ACHIEVEMENTS.findIndex((x) => x.id === a.id) - ACHIEVEMENTS.findIndex((x) => x.id === b.id));
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="small muted">ДОСТИЖЕНИЯ</span>
        <span className="tiny muted num">{earned}/{rows.length}</span>
      </div>
      <div className="badge-grid">
        {sorted.map((r) => {
          const ready = self && r.done && !r.claimed;
          return (
            <button key={r.id} className={`badge-cell ${ready ? "ready" : ""}`} onClick={() => setOpen(r.id)} title={achievementById(r.id)?.name}>
              <BadgeMedal id={r.id} earned={r.claimed || r.done} />
              {ready && <i className="side-dot" />}
              <span className="badge-name">{achievementById(r.id)?.name}</span>
            </button>
          );
        })}
      </div>
      {sel && def && (
        <Modal title={def.name} onClose={() => setOpen(null)}>
          <div className="col" style={{ alignItems: "center", gap: 10, textAlign: "center" }}>
            <BadgeMedal id={def.id} earned={sel.claimed || sel.done} size={84} />
            <div>{def.hint}</div>
            <div className="ach-bar" style={{ ["--p" as string]: `${Math.round((sel.progress / sel.target) * 100)}%` }}><i /><span className="num">{full(sel.progress)} / {full(sel.target)}</span></div>
            <div className="col" style={{ alignItems: "center", gap: 4 }}>
              <span className="tiny muted">Награда</span>
              <RewardChips r={def.reward} size={16} />
            </div>
            {self && sel.done && !sel.claimed && (
              <button className="btn gold block" disabled={busy === "achievement_claim"} onClick={() => claim(sel.id)}>Забрать награду</button>
            )}
            {sel.claimed && <span className="chip green">Получено</span>}
          </div>
        </Modal>
      )}
    </div>
  );
}
