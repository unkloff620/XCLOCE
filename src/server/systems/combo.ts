import { GameError, type Queryable } from "../db.ts";
import { grantReward, moscowDay, type Ctx } from "../core.ts";
import { COMBO_KEEP, COMBO_MODES, comboMode, comboSequence as seqOf, hasCombo, rollComboReward, type ComboMode } from "../../content/combo.ts";
import { BOSSES, EVENT_FIGHTS } from "../../content/bosses.ts";
import type { Reward } from "../../content/rewards.ts";

/*
 * «Комбо» (content/combo.ts): a player's progress in today's sequence of a boss and a combo mode (combo_progress, one
 * row a Moscow day). The fight remembers the combo mode chosen at its start (fights.combo); every hit of that fight is
 * checked here.
 */

/** the server's secret for the sequences (config «combo.secret»): made once, never sent to the app */
let saltCache: string | null = null;
async function comboSalt(q: Queryable): Promise<string> {
  if (saltCache) return saltCache;
  const read = async () => (await q.query<{ value: string }>("SELECT value FROM config WHERE key='combo.secret'"))[0]?.value ?? null;
  let v = await read();
  if (!v) {
    await q.query("INSERT INTO config (key, value) VALUES ('combo.secret', $1::jsonb) ON CONFLICT (key) DO NOTHING", [JSON.stringify(crypto.randomUUID())]);
    v = await read();
  }
  saltCache = String(v);
  return saltCache;
}
export async function comboSequence(q: Queryable, day: string, bossId: string, mode: ComboMode): Promise<string[]> {
  return seqOf(day, bossId, mode, await comboSalt(q));
}

/** the admin's «Комбо»: today's and tomorrow's sequences of every boss with a combo */
export async function combosAdmin(q: Queryable, now = Date.now()) {
  const days = [moscowDay(now), moscowDay(now + 24 * 3_600_000)];
  const bosses = [...BOSSES, ...EVENT_FIGHTS].filter((b) => hasCombo(b.id));
  return {
    days: await Promise.all(days.map(async (day) => ({
      day,
      bosses: await Promise.all(bosses.map(async (b) => ({
        id: b.id, name: b.name,
        modes: await Promise.all(COMBO_MODES.map(async (m) => ({ mode: m.id, name: m.name, seq: await comboSequence(q, day, b.id, m.id) }))),
      }))),
    }))),
  };
}

interface ComboRow { progress: number; done_at: Date | null; reward: Reward | null; claimed_at: Date | null }

export interface ComboView {
  mode: ComboMode;
  length: number;
  progress: number;
  /** the hits guessed so far (the first `progress` of the sequence) — only these are shown */
  guessed: string[];
  done: boolean;
  claimed: boolean;
  /** the payout, once done */
  reward: Reward | null;
  /** what the last hit did: right, wrong (back to zero / to one), or wrong but kept */
  last?: "right" | "wrong" | "kept";
}

async function rowOf(q: Queryable, pid: number, day: string, bossId: string, mode: ComboMode): Promise<ComboRow | null> {
  const [r] = await q.query<ComboRow>("SELECT progress, done_at, reward, claimed_at FROM combo_progress WHERE player_id=$1 AND day=$2 AND boss_id=$3 AND mode=$4", [pid, day, bossId, mode]);
  return r ?? null;
}

function viewOf(seq: string[], mode: ComboMode, r: ComboRow | null): ComboView {
  const progress = Math.min(seq.length, Number(r?.progress ?? 0));
  return { mode, length: seq.length, progress, guessed: seq.slice(0, progress), done: !!r?.done_at, claimed: !!r?.claimed_at, reward: r?.done_at ? r.reward : null };
}

export async function comboView(q: Queryable, pid: number, bossId: string, mode: string | null, now: number): Promise<ComboView | null> {
  const m = comboMode(mode);
  if (!m) return null;
  const day = moscowDay(now);
  return viewOf(await comboSequence(q, day, bossId, m.id), m.id, await rowOf(q, pid, day, bossId, m.id));
}

/** today's combos of every boss and mode: done or not (the pre-fight picker marks the done ones) */
export async function combosToday(q: Queryable, pid: number, now: number): Promise<Record<string, { progress: number; done: boolean; claimed: boolean }>> {
  const rows = await q.query<{ boss_id: string; mode: string; progress: number; done_at: Date | null; claimed_at: Date | null }>(
    "SELECT boss_id, mode, progress, done_at, claimed_at FROM combo_progress WHERE player_id=$1 AND day=$2", [pid, moscowDay(now)]);
  return Object.fromEntries(rows.map((r) => [`${r.boss_id}:${r.mode}`, { progress: Number(r.progress), done: !!r.done_at, claimed: !!r.claimed_at }]));
}

/** a hit in a fight with a combo: checked against the next step */
export async function comboHit(ctx: Ctx, bossId: string, mode: string | null, weaponId: string): Promise<ComboView | null> {
  const m = comboMode(mode);
  if (!m) return null;
  const day = moscowDay(ctx.now);
  const seq = await comboSequence(ctx.q, day, bossId, m.id);
  const r = await rowOf(ctx.q, ctx.pid, day, bossId, m.id);
  if (r?.done_at) return viewOf(seq, m.id, r);
  const before = Number(r?.progress ?? 0);
  let progress: number;
  let last: ComboView["last"];
  if (seq[before] === weaponId) {
    progress = before + 1;
    last = "right";
  } else if (before > 0 && ctx.rng() < COMBO_KEEP) {
    progress = before;
    last = "kept";
  } else {
    // back to zero — or to one, when this hit is the sequence's first
    progress = seq[0] === weaponId ? 1 : 0;
    last = "wrong";
  }
  const done = progress >= seq.length;
  // done: the payout is the player's at once (the window only shows what came)
  const reward = done ? rollComboReward(m.id, ctx.rng) : null;
  const at = done ? new Date(ctx.now) : null;
  await ctx.q.query(
    `INSERT INTO combo_progress (player_id, day, boss_id, mode, progress, done_at, reward, claimed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$6)
     ON CONFLICT (player_id, day, boss_id, mode) DO UPDATE SET progress = EXCLUDED.progress, done_at = EXCLUDED.done_at, reward = EXCLUDED.reward, claimed_at = EXCLUDED.claimed_at`,
    [ctx.pid, day, bossId, m.id, progress, at, reward ? JSON.stringify(reward) : null],
  );
  const granted = reward ? await grantReward(ctx, reward, `combo:${bossId}:${m.id}`) : null;
  return { ...viewOf(seq, m.id, { progress, done_at: at, reward: (granted as Reward | null) ?? reward, claimed_at: at }), last };
}

/** an old done combo whose payout was not given yet (before it came at once): «Забрать» */
export async function comboClaim(ctx: Ctx, bossId: string, mode: string) {
  const m = comboMode(mode);
  if (!m) throw new GameError("bad_mode", "Нет такого комбо");
  const [r] = await ctx.q.query<{ day: string; reward: Reward }>(
    `UPDATE combo_progress SET claimed_at=$4 WHERE (player_id, day, boss_id, mode) = (
       SELECT player_id, day, boss_id, mode FROM combo_progress WHERE player_id=$1 AND boss_id=$2 AND mode=$3 AND done_at IS NOT NULL AND claimed_at IS NULL ORDER BY day DESC LIMIT 1
     ) RETURNING day, reward`,
    [ctx.pid, bossId, m.id, new Date(ctx.now)],
  );
  if (!r) throw new GameError("combo_none", "Забирать нечего");
  return { boss: bossId, mode: m.id, reward: await grantReward(ctx, r.reward, `combo:${bossId}:${m.id}`) };
}
