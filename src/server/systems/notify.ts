import type { Queryable } from "../db.ts";
import { nextMoscowMidnight, type Ctx } from "../core.ts";

/*
 * Telegram reminders, the scheduling half. Every reminder is one row per player and kind with the moment it is due;
 * re-arming a kind moves its moment and clears "sent". The sender (server/notify-send.ts) checks right before sending
 * that the reason still holds (energy still full, fight still running, …), so a stale row just goes quiet.
 */

export type NotifyKind = "energy_full" | "fist_ready" | "boss_low" | "streak";

/** Arms a reminder; an unchanged one (same moment and meta) is left as it is, so a sent reminder is not sent again. */
export async function schedule(q: Queryable, pid: number, kind: NotifyKind, dueAt: number, meta: Record<string, unknown> = {}) {
  await q.query(
    `INSERT INTO notifications (player_id, kind, due_at, sent_at, meta) VALUES ($1,$2,$3,NULL,$4)
     ON CONFLICT (player_id, kind) DO UPDATE SET due_at=EXCLUDED.due_at, sent_at=NULL, meta=EXCLUDED.meta
     WHERE notifications.due_at <> EXCLUDED.due_at OR notifications.meta <> EXCLUDED.meta`,
    [pid, kind, new Date(dueAt), JSON.stringify(meta)],
  );
}

export async function cancel(q: Queryable, pid: number, kind: NotifyKind) {
  await q.query("DELETE FROM notifications WHERE player_id=$1 AND kind=$2 AND sent_at IS NULL", [pid, kind]);
}

/** Energy: due when regeneration reaches the maximum. Called with the current energy from the state. */
export async function scheduleEnergy(ctx: Ctx, energy: number, energyAt: number, max = ctx.cfg.energy.max) {
  if (energy >= max) return cancel(ctx.q, ctx.pid, "energy_full");
  const period = ctx.cfg.energy.regenMin * 60_000;
  return schedule(ctx.q, ctx.pid, "energy_full", energyAt + (max - energy) * period);
}

/** Streak: a reminder at 20:00 MSK of the next day, unless the reward is taken by then. */
export async function scheduleStreak(ctx: Ctx, streak: number) {
  return schedule(ctx.q, ctx.pid, "streak", nextMoscowMidnight(ctx.now) + 20 * 3600_000, { streak });
}

/** After a hit: everyone else whose fight with this boss dropped to 20% HP or less gets "finish it!" — once per fight. */
export async function notifyBossLow(ctx: Ctx, bossId: string, bossTotal: number) {
  const rows = await ctx.q.query<{ id: number; player_id: number; hp: number; hp_max: number }>(
    `SELECT id, player_id, hp_max - ($2 - start_total) AS hp, hp_max FROM fights
     WHERE boss_id=$1 AND status='active' AND NOT solo AND ends_at > $3 AND player_id <> $4
       AND hp_max - ($2 - start_total) > 0 AND (hp_max - ($2 - start_total)) * 5 <= hp_max`,
    [bossId, bossTotal, new Date(ctx.now), ctx.pid],
  );
  for (const f of rows) {
    await ctx.q.query(
      `INSERT INTO notifications (player_id, kind, due_at, meta) VALUES ($1,'boss_low',$2,$3)
       ON CONFLICT (player_id, kind) DO UPDATE SET due_at=EXCLUDED.due_at, sent_at=NULL, meta=EXCLUDED.meta
       WHERE notifications.meta->>'fightId' IS DISTINCT FROM EXCLUDED.meta->>'fightId'`,
      [f.player_id, new Date(ctx.now), JSON.stringify({ fightId: f.id, bossId })],
    );
  }
}

export async function notifyView(q: Queryable, pid: number) {
  const [p] = await q.query<{ notify_on: boolean; pm_blocked: boolean; telegram_id: number | null }>("SELECT notify_on, pm_blocked, telegram_id FROM players WHERE id=$1", [pid]);
  return { on: !!p?.notify_on, blocked: !!p?.pm_blocked, available: p?.telegram_id != null };
}

/** The player's switch; `granted` — Telegram just confirmed the bot may write to them. */
export async function setNotify(ctx: Ctx, on: boolean, granted: boolean) {
  await ctx.q.query("UPDATE players SET notify_on=$2, pm_blocked = CASE WHEN $3 THEN false ELSE pm_blocked END WHERE id=$1", [ctx.pid, on, granted]);
  return { on };
}
