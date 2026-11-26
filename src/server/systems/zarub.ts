import { questOnly } from "./quests.ts";
import { GameError, type Queryable } from "../db.ts";
import { addItem, grantReward, itemQty, moneyHooks, moscowDay, rewardHooks, takeItem, takeMoney, type Ctx, type Granted } from "../core.ts";
import {
  NUGGET, NUGGETS_PER_RING, RING, ZARUB_BAG_PRICES, ZARUB_BOT_NAMES, ZARUB_BOT_TIME, ZARUB_DAILY, ZARUB_JOIN_MS, ZARUB_MODES, ZARUB_RACE_MS,
  ZARUB_SEATS, ZARUB_SETS, ZARUB_SKIP_GOLD, botShare, zarubBagSets, zarubLevel, zarubMode, zarubReward, zarubTasks,
  type ZarubKind, type ZarubMode, type ZarubTask,
} from "../../content/zarub.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";

/*
 * «Зарубы» (content/zarub.ts): a player's race — one seat in zarub_seats (the bots sit there too), its progress per task
 * (the same 8 tasks for the whole race). The game's actions feed it (zarubTick, from quests.ts, combat.ts and the hooks
 * below); the 8th task closed — the place, the reward at once, the зарубный опыт.
 */

interface RaceRow { id: number; mode: ZarubMode; created_at: Date; ends_at: Date; tasks: ZarubTask[] }
interface SeatRow { id: number; race_id: number; player_id: number | null; bot_name: string | null; bot_finish: Date | null; progress: number[]; joined_at: Date; finished_at: Date | null; place: number | null; reward: Granted | null; seen: boolean }

const ms = (d: Date | string | null) => (d ? new Date(d).getTime() : 0);
/** the Moscow midnight before `now` */
const dayStart = (now: number) => Date.parse(`${moscowDay(now)}T00:00:00+03:00`);

async function statsXp(q: Queryable, pid: number) {
  const [r] = await q.query<{ xp: number }>("SELECT xp FROM zarub_stats WHERE player_id=$1", [pid]);
  return Number(r?.xp ?? 0);
}
async function finishedToday(q: Queryable, pid: number, now: number): Promise<Record<string, number>> {
  const rows = await q.query<{ mode: string; n: number }>(
    "SELECT r.mode, COUNT(*)::int AS n FROM zarub_seats s JOIN zarub_races r ON r.id = s.race_id WHERE s.player_id=$1 AND s.finished_at >= $2 GROUP BY r.mode",
    [pid, new Date(dayStart(now))]);
  return Object.fromEntries(rows.map((r) => [r.mode, Number(r.n)]));
}
/** my seat in a race still running (not finished, time not out) */
async function activeSeat(q: Queryable, pid: number, now: number, lock = false) {
  const [s] = await q.query<SeatRow & { mode: ZarubMode; tasks: ZarubTask[]; ends_at: Date; created_at: Date }>(
    `SELECT s.*, r.mode, r.tasks, r.ends_at, r.created_at FROM zarub_seats s JOIN zarub_races r ON r.id = s.race_id
     WHERE s.player_id=$1 AND s.finished_at IS NULL AND r.ends_at > $2 ORDER BY s.id DESC LIMIT 1${lock ? " FOR UPDATE OF s" : ""}`,
    [pid, new Date(now)]);
  return s ?? null;
}

const doneOf = (tasks: ZarubTask[], progress: number[]) => tasks.filter((t, i) => (progress[i] ?? 0) >= t.target).length;
const shareOf = (tasks: ZarubTask[], progress: number[]) => tasks.reduce((a, t, i) => a + Math.min(1, (progress[i] ?? 0) / t.target), 0) / tasks.length;

/** a seat's place when it finishes now: one after everybody already done (players and bots) */
async function placeNow(q: Queryable, raceId: number, now: number) {
  const [r] = await q.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM zarub_seats WHERE race_id=$1 AND (finished_at IS NOT NULL OR (bot_finish IS NOT NULL AND bot_finish <= $2))",
    [raceId, new Date(now)]);
  return Number(r?.n ?? 0) + 1;
}

/** all 8 closed: the place, the reward (given at once), the опыт */
async function finish(ctx: Ctx, seat: { id: number; race_id: number; mode: ZarubMode }) {
  const place = await placeNow(ctx.q, seat.race_id, ctx.now);
  const m = zarubMode(seat.mode)!;
  // the day's limit: past it a finish pays nothing (it cannot be started then — this is a race of the day before)
  const today = (await finishedToday(ctx.q, ctx.pid, ctx.now))[seat.mode] ?? 0;
  const paid = today < ZARUB_DAILY;
  const granted = paid ? await grantReward(ctx, zarubReward(seat.mode, place), `zarub:${seat.mode}`) : null;
  if (paid) {
    await ctx.q.query(
      "INSERT INTO zarub_stats (player_id, xp) VALUES ($1,$2) ON CONFLICT (player_id) DO UPDATE SET xp = zarub_stats.xp + EXCLUDED.xp", [ctx.pid, m.xp]);
  }
  await ctx.q.query("UPDATE zarub_seats SET finished_at=$2, place=$3, reward=$4 WHERE id=$1",
    [seat.id, new Date(ctx.now), place, JSON.stringify(granted ? { ...granted, zarubXp: m.xp } : null)]);
}

/** an action counted by today's race tasks of that kind */
export async function zarubTick(ctx: Ctx, kind: ZarubKind, amount = 1) {
  if (!(amount > 0)) return;
  const s = await activeSeat(ctx.q, ctx.pid, ctx.now, true);
  if (!s) return;
  const tasks = s.tasks;
  if (!tasks.some((t) => t.kind === kind)) return;
  const progress = tasks.map((t, i) => Number(s.progress[i] ?? 0));
  let changed = false, done = 0;
  tasks.forEach((t, i) => {
    if (t.kind !== kind || progress[i] >= t.target) return;
    progress[i] = Math.min(t.target, progress[i] + amount);
    if (progress[i] >= t.target) done++;
    changed = true;
  });
  if (!changed) return;
  await ctx.q.query("UPDATE zarub_seats SET progress=$2 WHERE id=$1", [s.id, JSON.stringify(progress)]);
  // «Задания дня»: the race's tasks done
  if (done) await questOnly(ctx, "zarub", done);
  if (doneOf(tasks, progress) >= tasks.length) await finish(ctx, s);
}

// the earned папиросы and авторитет feed their tasks (not an exchange, not a prize, not the zarub's own reward)
const notEarned = (reason: string) => reason.startsWith("exchange") || reason.startsWith("prize:") || reason.startsWith("zarub");
moneyHooks.push(async (ctx, c, amount, reason) => {
  if (c === "PAP" && !notEarned(reason)) await zarubTick(ctx, "pap", Math.floor(amount));
});
rewardHooks.push(async (ctx, got, reason) => {
  if (got.xp > 0 && !notEarned(reason)) await zarubTick(ctx, "xp", got.xp);
});

/** «Погнали»: a seat in a race of this difficulty — a fresh one of the last minutes (instead of a bot), or a new one */
export async function zarubStart(ctx: Ctx, mode: string) {
  const m = zarubMode(mode);
  if (!m) throw new GameError("bad_mode", "Нет таких заруб");
  const { level } = zarubLevel(await statsXp(ctx.q, ctx.pid));
  if (level < m.level) throw new GameError("zarub_locked", `${m.name} — с ${m.level} уровня заруб`);
  if (await activeSeat(ctx.q, ctx.pid, ctx.now)) throw new GameError("zarub_busy", "Сначала закончи начатую зарубу");
  if (((await finishedToday(ctx.q, ctx.pid, ctx.now))[m.id] ?? 0) >= ZARUB_DAILY) throw new GameError("zarub_limit", `На сегодня ${m.name.toLowerCase()} всё: ${ZARUB_DAILY}/${ZARUB_DAILY}`);
  // the old results go away with a new start
  await ctx.q.query("UPDATE zarub_seats SET seen=true WHERE player_id=$1 AND seen=false", [ctx.pid]);
  const now = new Date(ctx.now);
  const [open] = await ctx.q.query<{ id: number }>(
    `SELECT r.id FROM zarub_races r WHERE r.mode=$1 AND r.created_at > $2 AND r.ends_at > $3
       AND EXISTS (SELECT 1 FROM zarub_seats b WHERE b.race_id = r.id AND b.bot_name IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM zarub_seats p WHERE p.race_id = r.id AND p.player_id = $4)
     ORDER BY r.created_at LIMIT 1 FOR UPDATE`,
    [m.id, new Date(ctx.now - ZARUB_JOIN_MS), now, ctx.pid]);
  let raceId: number;
  if (open) {
    raceId = open.id;
    // the slowest bot gives up his seat
    await ctx.q.query(
      "DELETE FROM zarub_seats WHERE id = (SELECT id FROM zarub_seats WHERE race_id=$1 AND bot_name IS NOT NULL ORDER BY bot_finish DESC LIMIT 1)", [raceId]);
  } else {
    const [r] = await ctx.q.query<{ id: number }>("INSERT INTO zarub_races (mode, created_at, ends_at) VALUES ($1,$2,$3) RETURNING id",
      [m.id, now, new Date(ctx.now + ZARUB_RACE_MS)]);
    raceId = r.id;
    await ctx.q.query("UPDATE zarub_races SET tasks=$2 WHERE id=$1", [raceId, JSON.stringify(zarubTasks(m.id, `${raceId}`))]);
    const names = ZARUB_BOT_NAMES.slice();
    const [lo, hi] = ZARUB_BOT_TIME[m.id];
    for (let i = 0; i < ZARUB_SEATS - 1; i++) {
      const name = names.splice(Math.floor(ctx.rng() * names.length) % names.length, 1)[0];
      const at = new Date(ctx.now + lo + Math.floor(ctx.rng() * (hi - lo)));
      await ctx.q.query("INSERT INTO zarub_seats (race_id, bot_name, bot_finish, joined_at) VALUES ($1,$2,$3,$4)", [raceId, name, at, now]);
    }
  }
  await ctx.q.query("INSERT INTO zarub_seats (race_id, player_id, joined_at) VALUES ($1,$2,$3)", [raceId, ctx.pid, now]);
  return zarubView(ctx.q, ctx.pid, ctx.now);
}

/** a task bought out for слитки */
export async function zarubSkip(ctx: Ctx, index: number) {
  const s = await activeSeat(ctx.q, ctx.pid, ctx.now, true);
  if (!s) throw new GameError("zarub_none", "Нет начатой зарубы");
  const t = s.tasks[index];
  if (!t) throw new GameError("bad_request", "Нет такого задания", 400);
  const progress = s.tasks.map((x, i) => Number(s.progress[i] ?? 0));
  if (progress[index] >= t.target) throw new GameError("zarub_done", "Задание уже выполнено");
  await takeMoney(ctx, "GOLD", ZARUB_SKIP_GOLD, `zarub_skip:${t.kind}`);
  progress[index] = t.target;
  await ctx.q.query("UPDATE zarub_seats SET progress=$2 WHERE id=$1", [s.id, JSON.stringify(progress)]);
  if (doneOf(s.tasks, progress) >= s.tasks.length) await finish(ctx, s);
  return zarubView(ctx.q, ctx.pid, ctx.now);
}

/** the finished (or timed-out) race's window closed */
export async function zarubClose(ctx: Ctx) {
  await ctx.q.query(
    `UPDATE zarub_seats s SET seen=true FROM zarub_races r WHERE r.id = s.race_id AND s.player_id=$1 AND s.seen=false
       AND (s.finished_at IS NOT NULL OR r.ends_at <= $2)`, [ctx.pid, new Date(ctx.now)]);
  return zarubView(ctx.q, ctx.pid, ctx.now);
}

/** «Переплавить»: every 15 самородков into an кольцо */
export async function zarubMelt(ctx: Ctx) {
  const n = Math.floor((await itemQty(ctx.q, ctx.pid, NUGGET)) / NUGGETS_PER_RING);
  if (n < 1) throw new GameError("zarub_few", `Нужно ${NUGGETS_PER_RING} самородков`);
  await takeItem(ctx, NUGGET, n * NUGGETS_PER_RING, "zarub_melt");
  await addItem(ctx, RING, n, "zarub_melt");
  return { melted: n, ...(await zarubView(ctx.q, ctx.pid, ctx.now)) };
}

/** a bag of a difficulty opened for кольца: a piece of its 3 sets not owned yet */
export async function zarubBag(ctx: Ctx, mode: string, bag: number) {
  const m = zarubMode(mode);
  if (!m || !Number.isInteger(bag) || bag < 0 || bag > 2) throw new GameError("bad_request", "Нет такой сумки", 400);
  const { level } = zarubLevel(await statsXp(ctx.q, ctx.pid));
  if (level < m.level) throw new GameError("zarub_locked", `${m.name} — с ${m.level} уровня заруб`);
  const all = zarubBagSets(m.id, bag).flatMap((z) => TATTOO_SETS.find((s) => s.id === z.id)!.pieces.map((p) => p.id));
  const own = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [ctx.pid, all])).map((r) => r.item_id));
  const left = all.filter((id) => !own.has(id));
  if (!left.length) throw new GameError("zarub_bag_empty", "Все наколки этой сумки уже твои");
  const price = ZARUB_BAG_PRICES[m.id][bag];
  if ((await itemQty(ctx.q, ctx.pid, RING)) < price) throw new GameError("zarub_no_rings", `Нужно ${price} колец`);
  await takeItem(ctx, RING, price, `zarub_bag:${m.id}:${bag}`);
  const tattoo = left[Math.floor(ctx.rng() * left.length) % left.length];
  const reward = await grantReward(ctx, { items: [{ id: tattoo, qty: 1 }] }, `zarub_bag:${m.id}:${bag}`);
  return { tattoo, reward, ...(await zarubView(ctx.q, ctx.pid, ctx.now)) };
}

export interface ZarubRival { name: string; me: boolean; bot: boolean; share: number; done: number; place: number | null; photo: string | null }
export interface ZarubRaceView {
  mode: ZarubMode;
  endsAt: number;
  tasks: { kind: ZarubKind; target: number; progress: number }[];
  done: number;
  rivals: ZarubRival[];
  finished: boolean;
  timedOut: boolean;
  place: number | null;
  reward: (Granted & { zarubXp?: number }) | null;
}

async function raceView(q: Queryable, pid: number, now: number): Promise<ZarubRaceView | null> {
  const [s] = await q.query<SeatRow & { mode: ZarubMode; tasks: ZarubTask[]; ends_at: Date }>(
    `SELECT s.*, r.mode, r.tasks, r.ends_at FROM zarub_seats s JOIN zarub_races r ON r.id = s.race_id
     WHERE s.player_id=$1 AND (s.seen=false OR (s.finished_at IS NULL AND r.ends_at > $2)) ORDER BY s.id DESC LIMIT 1`, [pid, new Date(now)]);
  if (!s) return null;
  const seats = await q.query<SeatRow & { display_name: string | null; photo_url: string | null }>(
    "SELECT s.*, p.display_name, p.photo_url FROM zarub_seats s LEFT JOIN players p ON p.id = s.player_id WHERE s.race_id=$1", [s.race_id]);
  const tasks = s.tasks;
  // the places: who finished, in their order (the bots by their time)
  const at = (x: SeatRow) => (x.player_id ? ms(x.finished_at) : ms(x.bot_finish) <= now ? ms(x.bot_finish) : 0);
  const order = seats.filter((x) => at(x) > 0).sort((a, b) => at(a) - at(b) || a.id - b.id);
  const placeOf = (x: SeatRow) => (x.player_id && x.place ? x.place : (() => { const i = order.findIndex((o) => o.id === x.id); return i >= 0 ? i + 1 : null; })());
  const rivals: ZarubRival[] = seats.map((x) => {
    const bot = !x.player_id;
    const share = bot ? botShare(ms(x.joined_at), ms(x.bot_finish), now) : x.finished_at ? 1 : shareOf(tasks, x.progress ?? []);
    return {
      name: bot ? x.bot_name ?? "?" : x.display_name ?? "?", me: x.player_id === pid, bot, photo: bot ? null : x.photo_url,
      share, done: bot ? Math.min(tasks.length, Math.floor(share * tasks.length)) : doneOf(tasks, x.progress ?? []), place: placeOf(x),
    };
  }).sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.share - a.share);
  const progress = tasks.map((_, i) => Number(s.progress[i] ?? 0));
  return {
    mode: s.mode, endsAt: ms(s.ends_at),
    tasks: tasks.map((t, i) => ({ kind: t.kind, target: t.target, progress: Math.min(t.target, progress[i]) })),
    done: doneOf(tasks, progress), rivals,
    finished: !!s.finished_at, timedOut: !s.finished_at && ms(s.ends_at) <= now,
    place: s.place, reward: s.reward,
  };
}

export async function zarubView(q: Queryable, pid: number, now: number) {
  const xp = await statsXp(q, pid);
  const lv = zarubLevel(xp);
  const today = await finishedToday(q, pid, now);
  const ids = TATTOO_SETS.filter((s) => s.boss === "zarub").flatMap((s) => s.pieces.map((p) => p.id));
  const own = new Set((await q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [pid, ids])).map((r) => r.item_id));
  return {
    xp, level: lv.level, levelFrom: lv.from, levelTo: lv.to,
    rings: await itemQty(q, pid, RING), nuggets: await itemQty(q, pid, NUGGET),
    modes: ZARUB_MODES.map((m) => ({ id: m.id, open: lv.level >= m.level, today: today[m.id] ?? 0 })),
    bags: Object.fromEntries(ZARUB_MODES.map((m) => [m.id, [0, 1, 2].map((b) => ({
      price: ZARUB_BAG_PRICES[m.id][b],
      sets: zarubBagSets(m.id, b).map((z) => {
        const pieces = TATTOO_SETS.find((s) => s.id === z.id)!.pieces;
        return { id: z.id, name: z.name, damage: z.damage, weapon: ZARUB_SETS[m.id].weapon, have: pieces.filter((p) => own.has(p.id)).length, total: pieces.length };
      }),
    }))])) as Record<ZarubMode, { price: number; sets: { id: string; name: string; damage: number; weapon: string; have: number; total: number }[] }[]>,
    race: await raceView(q, pid, now),
  };
}
export type ZarubView = Awaited<ReturnType<typeof zarubView>>;
