import { GameError, type Queryable } from "../db.ts";
import { addMoney, takeMoney, type Ctx } from "../core.ts";
import { DUEL_ANSWER_MS, DUEL_FEE, DUEL_MAX_OPEN, DUEL_PLAY_MS, DUEL_ROUNDS, DUEL_STAKES } from "../../content/games.ts";
import { startDuelGame } from "./games.ts";
import { schedule } from "./notify.ts";
import { ONLINE_MS } from "./rating.ts";

/* Zonk duels 1 on 1 (content/games.ts «Zonk duels»). Money moves only here; the games are ordinary zonk games with a duel id. */

interface DuelRow {
  id: number; from_id: number; to_id: number; stake: number; status: "open" | "playing" | "done" | "declined" | "cancelled" | "expired";
  from_points: number | null; to_points: number | null; winner_id: number | null; created_at: Date; accepted_at: Date | null;
}
const as = (ctx: Ctx, pid: number): Ctx => ({ ...ctx, pid });
const round2 = (v: number) => Math.round(v * 100) / 100;

/** the pot is paid (or the stakes go back) once both have played */
async function settle(ctx: Ctx, d: DuelRow) {
  const stake = Number(d.stake);
  const a = d.from_points, b = d.to_points;
  let winner: number | null = null;
  if (a !== null && b !== null) winner = a > b ? d.from_id : b > a ? d.to_id : null;
  else if (a !== null) winner = d.from_id;
  else if (b !== null) winner = d.to_id;
  if (winner) await addMoney(as(ctx, winner), "USD", round2(stake * 2 * (1 - DUEL_FEE)), `duel:${d.id}:win`);
  else {
    await addMoney(as(ctx, d.from_id), "USD", stake, `duel:${d.id}:back`);
    await addMoney(as(ctx, d.to_id), "USD", stake, `duel:${d.id}:back`);
  }
  await ctx.q.query("UPDATE duels SET status='done', winner_id=$2, finished_at=$3 WHERE id=$1", [d.id, winner, new Date(ctx.now)]);
  // the result goes to Telegram to whoever is not looking at it right now
  for (const pid of [d.from_id, d.to_id]) if (pid !== ctx.pid) await schedule(ctx.q, pid, "duel_done", ctx.now, { duelId: d.id });
}

/** Calls nobody answered and duels nobody finished in time end here (whoever looks first). */
export async function expireDuels(ctx: Ctx) {
  const stale = await ctx.q.query<DuelRow>(
    `SELECT * FROM duels WHERE (status='open' AND created_at < $1) OR (status='playing' AND accepted_at < $2) FOR UPDATE SKIP LOCKED`,
    [new Date(ctx.now - DUEL_ANSWER_MS), new Date(ctx.now - DUEL_PLAY_MS)],
  );
  for (const d of stale) {
    if (d.status === "open") {
      await addMoney(as(ctx, d.from_id), "USD", Number(d.stake), `duel:${d.id}:expired`);
      await ctx.q.query("UPDATE duels SET status='expired', finished_at=$2 WHERE id=$1", [d.id, new Date(ctx.now)]);
    } else {
      // a game still running in it is closed as it stands
      await ctx.q.query("UPDATE games SET status='done', result=jsonb_build_object('outcome','duel','title','Дуэль: время вышло','points',COALESCE((state->>'total')::int,0),'duel',$1::int) WHERE kind='zonk' AND status='active' AND (state->>'duel')::int = $1", [d.id]);
      await settle(ctx, d);
    }
  }
}

export async function createDuel(ctx: Ctx, to: number, stake: number) {
  if (!(DUEL_STAKES as readonly number[]).includes(stake)) throw new GameError("bad_stake", "Такой ставки нет");
  if (to === ctx.pid) throw new GameError("self_duel", "С собой не сыграть");
  const [p] = await ctx.q.query<{ id: number }>("SELECT id FROM players WHERE id=$1 AND banned_at IS NULL", [to]);
  if (!p) throw new GameError("no_player", "Игрок не найден");
  const [n] = await ctx.q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM duels WHERE from_id=$1 AND status='open'", [ctx.pid]);
  if (Number(n.n) >= DUEL_MAX_OPEN) throw new GameError("duel_limit", `Не больше ${DUEL_MAX_OPEN} вызовов сразу — подожди ответа`);
  const [dup] = await ctx.q.query("SELECT 1 FROM duels WHERE status IN ('open','playing') AND ((from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1))", [ctx.pid, to]);
  if (dup) throw new GameError("duel_exists", "С этим игроком дуэль уже идёт");
  await takeMoney(ctx, "USD", stake, `duel:call:${to}`);
  const [row] = await ctx.q.query<{ id: number }>("INSERT INTO duels (from_id, to_id, stake, created_at) VALUES ($1,$2,$3,$4) RETURNING id", [ctx.pid, to, stake, new Date(ctx.now)]);
  // he gets a Telegram message (the sender skips players who are in the game right now)
  const [me] = await ctx.q.query<{ display_name: string }>("SELECT display_name FROM players WHERE id=$1", [ctx.pid]);
  await schedule(ctx.q, to, "duel_call", ctx.now, { duelId: row.id, from: me?.display_name ?? "Игрок", stake });
  return { duelId: row.id };
}

async function lock(ctx: Ctx, id: number): Promise<DuelRow> {
  const [d] = await ctx.q.query<DuelRow>("SELECT * FROM duels WHERE id=$1 FOR UPDATE", [id]);
  if (!d || (d.from_id !== ctx.pid && d.to_id !== ctx.pid)) throw new GameError("no_duel", "Дуэль не найдена", 404);
  return d;
}

/** the called one answers: yes (pays his stake) or no (the caller's stake goes back); the caller may take an open call back */
export async function answerDuel(ctx: Ctx, id: number, answer: "accept" | "decline" | "cancel") {
  const d = await lock(ctx, id);
  if (d.status !== "open") throw new GameError("duel_closed", "Этот вызов уже закрыт");
  if (answer === "cancel") {
    if (d.from_id !== ctx.pid) throw new GameError("not_yours", "Отменить может только тот, кто вызвал");
    await addMoney(ctx, "USD", Number(d.stake), `duel:${d.id}:cancel`);
    await ctx.q.query("UPDATE duels SET status='cancelled', finished_at=$2 WHERE id=$1", [d.id, new Date(ctx.now)]);
    return { duelId: d.id, status: "cancelled" };
  }
  if (d.to_id !== ctx.pid) throw new GameError("not_yours", "Ответить может только тот, кого вызвали");
  if (answer === "decline") {
    await addMoney(as(ctx, d.from_id), "USD", Number(d.stake), `duel:${d.id}:declined`);
    await ctx.q.query("UPDATE duels SET status='declined', finished_at=$2 WHERE id=$1", [d.id, new Date(ctx.now)]);
    return { duelId: d.id, status: "declined" };
  }
  await takeMoney(ctx, "USD", Number(d.stake), `duel:${d.id}:accept`);
  await ctx.q.query("UPDATE duels SET status='playing', accepted_at=$2 WHERE id=$1", [d.id, new Date(ctx.now)]);
  return { duelId: d.id, status: "playing" };
}

/** my game in a duel starts (once) */
export async function playDuel(ctx: Ctx, id: number) {
  const d = await lock(ctx, id);
  if (d.status !== "playing") throw new GameError("duel_not_playing", "Дуэль ещё не принята или уже закончилась");
  const mineDone = d.from_id === ctx.pid ? d.from_points !== null : d.to_points !== null;
  const [started] = await ctx.q.query("SELECT 1 FROM games WHERE player_id=$1 AND kind='zonk' AND (state->>'duel')::int = $2", [ctx.pid, d.id]);
  if (mineDone || started) throw new GameError("duel_played", "Свою партию в этой дуэли ты уже начал");
  return (await startDuelGame(ctx, d.id, DUEL_ROUNDS)).game;
}

/** a duel game ended: write the points down, settle when both have played */
export async function duelScore(ctx: Ctx, id: number, points: number) {
  const [d] = await ctx.q.query<DuelRow>("SELECT * FROM duels WHERE id=$1 FOR UPDATE", [id]);
  if (!d || d.status !== "playing") return;
  const col = d.from_id === ctx.pid ? "from_points" : d.to_id === ctx.pid ? "to_points" : null;
  if (!col) return;
  await ctx.q.query(`UPDATE duels SET ${col}=$2 WHERE id=$1`, [id, points]);
  const [after] = await ctx.q.query<DuelRow>("SELECT * FROM duels WHERE id=$1", [id]);
  if (after.from_points !== null && after.to_points !== null) await settle(ctx, after);
}

/** my calls, the calls to me, the duels going on and the last finished ones */
export async function duelsView(q: Queryable, pid: number) {
  const rows = await q.query<DuelRow & { from_name: string; to_name: string; from_photo: string | null; to_photo: string | null }>(
    `SELECT d.*, a.display_name AS from_name, b.display_name AS to_name, a.photo_url AS from_photo, b.photo_url AS to_photo
     FROM duels d JOIN players a ON a.id = d.from_id JOIN players b ON b.id = d.to_id
     WHERE (d.from_id=$1 OR d.to_id=$1) AND (d.status IN ('open','playing') OR d.finished_at > now() - interval '3 days')
     ORDER BY d.id DESC LIMIT 12`,
    [pid],
  );
  // both games of every duel: the points of each attempt and the running total (the rival's is seen live)
  const games = rows.length ? await q.query<{ player_id: number; duel: number; scores: { points: number; zonk: boolean }[] | null; total: number | null; status: string }>(
    `SELECT player_id, (state->>'duel')::int AS duel, state->'scores' AS scores, COALESCE((result->>'points')::int, (state->>'total')::int) AS total, status
     FROM games WHERE kind='zonk' AND state->>'duel' IS NOT NULL AND (state->>'duel')::int = ANY($1::int[])`,
    [rows.map((d) => d.id)],
  ) : [];
  const gameOf = (duel: number, player: number) => games.find((x) => Number(x.duel) === duel && x.player_id === player);
  const rounds = (x: ReturnType<typeof gameOf>) => (x?.scores ?? []).slice(0, DUEL_ROUNDS).map((r) => (r.zonk ? 0 : Number(r.points) || 0));
  return rows.map((d) => {
    const me = d.from_id === pid;
    const rid = me ? d.to_id : d.from_id;
    const mg = gameOf(d.id, pid), rg = gameOf(d.id, rid);
    const myPts = me ? d.from_points : d.to_points, rivalPts = me ? d.to_points : d.from_points;
    return {
      id: d.id, status: d.status, stake: Number(d.stake), mine: me,
      rival: { id: rid, name: me ? d.to_name : d.from_name, photo: me ? d.to_photo : d.from_photo },
      myPoints: myPts, rivalPoints: rivalPts ?? (rg ? Number(rg.total ?? 0) : null),
      rivalDone: rivalPts !== null, started: !!mg, won: d.status === "done" ? (d.winner_id === null ? null : d.winner_id === pid) : null,
      pot: round2(Number(d.stake) * 2 * (1 - DUEL_FEE)),
      myRounds: rounds(mg), rivalRounds: rounds(rg), rivalPlaying: rg?.status === "active",
    };
  });
}

/** whom to call: by name, or (empty search) who is in the game now, my clan and my last rivals */
export async function duelRivals(q: Queryable, pid: number, search: string, now: number) {
  const name = search.replace(/[%_\\]/g, "").trim().slice(0, 32);
  const rows = name
    ? await q.query<{ id: number; display_name: string; photo_url: string | null; last_seen_at: Date; xp: number }>(
      `SELECT id, display_name, photo_url, last_seen_at, xp FROM players WHERE banned_at IS NULL AND id <> $1 AND display_name ILIKE $2
       ORDER BY last_seen_at DESC NULLS LAST LIMIT 20`, [pid, `%${name}%`])
    : await q.query<{ id: number; display_name: string; photo_url: string | null; last_seen_at: Date; xp: number }>(
      `SELECT p.id, p.display_name, p.photo_url, p.last_seen_at, p.xp FROM players p
       WHERE p.banned_at IS NULL AND p.id <> $1 AND (
         p.last_seen_at > $2
         OR p.id IN (SELECT m.player_id FROM clan_members m WHERE m.clan_id = (SELECT clan_id FROM clan_members WHERE player_id=$1))
         OR p.id IN (SELECT CASE WHEN from_id=$1 THEN to_id ELSE from_id END FROM duels WHERE from_id=$1 OR to_id=$1))
       ORDER BY p.last_seen_at DESC NULLS LAST LIMIT 20`, [pid, new Date(now - ONLINE_MS)]);
  return {
    players: rows.map((r) => ({ id: r.id, name: r.display_name, photo: r.photo_url, xp: Number(r.xp), online: !!r.last_seen_at && new Date(r.last_seen_at).getTime() > now - ONLINE_MS })),
  };
}
