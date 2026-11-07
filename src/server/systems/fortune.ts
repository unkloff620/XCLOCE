/* «Колесо удачи» (content/fortune.ts): tickets, spins, the shared jackpot and its last winner. */
import { GameError, type Queryable } from "../db.ts";
import { addItem, grantReward, itemQty, takeItem, takeMoney, type Ctx, type Granted } from "../core.ts";
import type { Config } from "../config.ts";
import { mergeRewards, type Reward } from "../../content/rewards.ts";
import { JACKPOT_ADD, JACKPOT_SEED, KEYCAP_ID, SECTORS, SPIN_ALL_MAX, TICKET_ID, TICKET_PRICE, fortuneLevel, rollSector } from "../../content/fortune.ts";

/** the wheel is in the back yard for everybody once the admin shows it; the admins see it always */
export async function fortuneOn(q: Queryable, pid: number, cfg: Config): Promise<boolean> {
  if (cfg.fortune.on) return true;
  if (!cfg.admins.length) return false;
  const [p] = await q.query<{ telegram_id: number | null }>("SELECT telegram_id FROM players WHERE id=$1", [pid]);
  return !!p?.telegram_id && cfg.admins.includes(Number(p.telegram_id));
}

export interface FortuneView {
  jackpot: number;
  spins: number;
  winner: { id: number; name: string; photo: string | null; amount: number; at: number } | null;
  xp: number; level: number; into: number; need: number;
  /** «ПРИЗ» fell: the cups waiting to be played */
  cups: number;
  tickets: number; keycaps: number;
  price: number; add: number;
}

export async function fortuneView(q: Queryable, pid: number): Promise<FortuneView> {
  const [g] = await q.query<{ jackpot: number; spins: number; winner_id: number | null; winner_amount: number | null; won_at: Date | null; name: string | null; photo: string | null }>(
    "SELECT g.jackpot, g.spins, g.winner_id, g.winner_amount, g.won_at, p.display_name AS name, p.photo_url AS photo FROM fortune_global g LEFT JOIN players p ON p.id = g.winner_id WHERE g.id='_all'");
  const [me] = await q.query<{ xp: number; cups: number }>("SELECT xp, cups FROM fortune_players WHERE player_id=$1", [pid]);
  const xp = Number(me?.xp ?? 0);
  return {
    jackpot: Number(g?.jackpot ?? JACKPOT_SEED),
    spins: Number(g?.spins ?? 0),
    winner: g?.winner_id ? { id: Number(g.winner_id), name: g.name ?? "Игрок", photo: g.photo, amount: Number(g.winner_amount ?? 0), at: g.won_at ? new Date(g.won_at).getTime() : 0 } : null,
    xp, ...fortuneLevel(xp),
    cups: Number(me?.cups ?? 0),
    tickets: await itemQty(q, pid, TICKET_ID),
    keycaps: await itemQty(q, pid, KEYCAP_ID),
    price: TICKET_PRICE, add: JACKPOT_ADD,
  };
}

async function mustBeOn(ctx: Ctx) {
  if (!(await fortuneOn(ctx.q, ctx.pid, ctx.cfg))) throw new GameError("fortune_off", "Колесо удачи пока закрыто");
}

/** tickets for roubles */
export async function fortuneBuy(ctx: Ctx, qty: number) {
  await mustBeOn(ctx);
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000) throw new GameError("bad_request", "Столько билетов не продаём", 400);
  await takeMoney(ctx, "RUB", TICKET_PRICE * qty, `fortune_buy:${qty}`);
  await addItem(ctx, TICKET_ID, qty, "fortune_buy");
  return { bought: qty, paid: TICKET_PRICE * qty, fortune: await fortuneView(ctx.q, ctx.pid) };
}

/** one spin, or every ticket at once (`all`, up to SPIN_ALL_MAX): the sectors fallen, what they gave together */
export async function fortuneSpin(ctx: Ctx, all = false) {
  await mustBeOn(ctx);
  const have = await itemQty(ctx.q, ctx.pid, TICKET_ID);
  if (have < 1) throw new GameError("fortune_no_ticket", "Нет билетов — купи или достань из ящика в магазине");
  const n = all ? Math.min(have, SPIN_ALL_MAX) : 1;
  await takeItem(ctx, TICKET_ID, n, "fortune_spin");
  const hits: number[] = [];
  const rewards: Reward[] = [];
  let xp = 0, cups = 0, empty = 0;
  for (let i = 0; i < n; i++) {
    const k = rollSector(ctx.rng);
    hits.push(k);
    const s = SECTORS[k];
    if (s.kind === "reward" && s.reward) rewards.push(s.reward);
    else if (s.kind === "xp") xp += s.xp ?? 0;
    else if (s.kind === "prize") cups += 1;
    else empty += 1;
  }
  await ctx.q.query(
    `INSERT INTO fortune_players (player_id, xp, spins, cups) VALUES ($1,$2,$3,$4)
     ON CONFLICT (player_id) DO UPDATE SET xp = fortune_players.xp + $2, spins = fortune_players.spins + $3, cups = fortune_players.cups + $4`,
    [ctx.pid, xp, n, cups]);
  // the shared jackpot grows by every spin (one short update of the one row)
  await ctx.q.query("UPDATE fortune_global SET jackpot = jackpot + $1, spins = spins + $2 WHERE id='_all'", [JACKPOT_ADD * n, n]);
  const reward: Granted | null = rewards.length ? await grantReward(ctx, mergeRewards(...rewards), "fortune_spin") : null;
  return { spins: n, hits, last: hits[hits.length - 1], sector: SECTORS[hits[hits.length - 1]].id, reward, xp, cups, empty, fortune: await fortuneView(ctx.q, ctx.pid) };
}
