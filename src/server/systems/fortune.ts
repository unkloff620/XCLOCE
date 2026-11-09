/* «Колесо удачи» (content/fortune.ts): tickets, spins, the shared jackpot and its last winner. */
import { GameError, type Queryable } from "../db.ts";
import { addItem, grantReward, itemQty, takeItem, takeMoney, type Ctx, type Granted } from "../core.ts";
import type { Config } from "../config.ts";
import { STASH_IDS } from "../../content/stashes.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";
import { mergeRewards, type Reward } from "../../content/rewards.ts";
import { BAG_TATTOO_CHANCE, bagById, rollBagLoot, JACKPOT_ADD, JACKPOT_SEED, KEYCAP_ID, SECTORS, SPIN_ALL_MAX, TICKET_ID, TICKET_PRICE, fortuneLevel, rollCups, rollSector, type Cup } from "../../content/fortune.ts";

/** the wheel is in the back yard for everybody once the admin shows it; the admins see it always */
export async function fortuneOn(q: Queryable, pid: number, cfg: Config): Promise<boolean> {
  if (cfg.fortune.on) return true;
  return isAdminPlayer(q, pid, cfg);
}

/** the player is one of the admins (by Telegram id): they see what is not shown to the players yet */
export async function isAdminPlayer(q: Queryable, pid: number, cfg: Config): Promise<boolean> {
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
  /** a cups game started and not finished (the prizes shown) */
  cupsLayout: Cup[] | null;
  tickets: number; keycaps: number;
  price: number; add: number;
}

export async function fortuneView(q: Queryable, pid: number): Promise<FortuneView> {
  const [g] = await q.query<{ jackpot: number; spins: number; winner_id: number | null; winner_amount: number | null; won_at: Date | null; name: string | null; photo: string | null }>(
    "SELECT g.jackpot, g.spins, g.winner_id, g.winner_amount, g.won_at, p.display_name AS name, p.photo_url AS photo FROM fortune_global g LEFT JOIN players p ON p.id = g.winner_id WHERE g.id='_all'");
  const [me] = await q.query<{ xp: number; cups: number; cups_layout: Cup[] | null }>("SELECT xp, cups, cups_layout FROM fortune_players WHERE player_id=$1", [pid]);
  const xp = Number(me?.xp ?? 0);
  return {
    jackpot: Number(g?.jackpot ?? JACKPOT_SEED),
    spins: Number(g?.spins ?? 0),
    winner: g?.winner_id ? { id: Number(g.winner_id), name: g.name ?? "Игрок", photo: g.photo, amount: Number(g.winner_amount ?? 0), at: g.won_at ? new Date(g.won_at).getTime() : 0 } : null,
    xp, ...fortuneLevel(xp),
    cups: Number(me?.cups ?? 0),
    cupsLayout: me?.cups_layout ?? null,
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
  await takeMoney(ctx, "USD", TICKET_PRICE * qty, `fortune_buy:${qty}`);
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

/** a cups game: the nine prizes, shown to the player before the cups are shuffled (a game already started comes back as it was) */
export async function fortuneCupsStart(ctx: Ctx) {
  await mustBeOn(ctx);
  const [me] = await ctx.q.query<{ cups: number; cups_layout: Cup[] | null }>("SELECT cups, cups_layout FROM fortune_players WHERE player_id=$1 FOR UPDATE", [ctx.pid]);
  if (me?.cups_layout) return { layout: me.cups_layout, fortune: await fortuneView(ctx.q, ctx.pid) };
  if (!me || Number(me.cups) < 1) throw new GameError("fortune_no_cups", "Чашки — за сектор «ПРИЗ» на колесе");
  const layout = rollCups(ctx.rng);
  await ctx.q.query("UPDATE fortune_players SET cups = cups - 1, cups_layout = $2 WHERE player_id=$1", [ctx.pid, JSON.stringify(layout)]);
  return { layout, fortune: await fortuneView(ctx.q, ctx.pid) };
}

/** a cup lifted: what is under it is drawn by the weights; the jackpot goes to the player whole and starts again */
export async function fortuneCupsPick(ctx: Ctx, index: number) {
  await mustBeOn(ctx);
  const [me] = await ctx.q.query<{ cups_layout: Cup[] | null }>("SELECT cups_layout FROM fortune_players WHERE player_id=$1 FOR UPDATE", [ctx.pid]);
  const layout = me?.cups_layout;
  if (!layout) throw new GameError("fortune_no_cups", "Сначала выпади «ПРИЗ» на колесе");
  if (!Number.isInteger(index) || index < 0 || index >= layout.length) throw new GameError("bad_request", "Нет такой чашки", 400);
  // every cup is as likely as any other (the jackpot too): the lifted one gets what lies under a random cup
  const j = Math.floor(ctx.rng() * layout.length) % layout.length;
  const final = layout.slice();
  [final[index], final[j]] = [final[j], final[index]];
  const cup = final[index];
  await ctx.q.query("UPDATE fortune_players SET cups_layout = NULL, cups_played = cups_played + 1, jackpots = jackpots + $2 WHERE player_id=$1", [ctx.pid, cup.kind === "jackpot" ? 1 : 0]);
  let jackpot = 0;
  let reward: Granted | null = null;
  if (cup.kind === "jackpot") {
    const [g] = await ctx.q.query<{ jackpot: number }>("SELECT jackpot FROM fortune_global WHERE id='_all' FOR UPDATE");
    jackpot = Number(g?.jackpot ?? JACKPOT_SEED);
    await ctx.q.query("UPDATE fortune_global SET jackpot=$1, winner_id=$2, winner_amount=$3, won_at=$4 WHERE id='_all'", [JACKPOT_SEED, ctx.pid, jackpot, new Date(ctx.now)]);
    reward = await grantReward(ctx, { currencies: { USD: jackpot } }, "fortune_jackpot");
  } else if (cup.reward) reward = await grantReward(ctx, cup.reward, `fortune_cup:${cup.kind}`);
  return { index, kind: cup.kind, final, reward, jackpot, fortune: await fortuneView(ctx.q, ctx.pid) };
}

/** a bag opened for keycaps: one prize, and with BAG_TATTOO_CHANCE a piece of its set not owned yet */
export async function fortuneBagOpen(ctx: Ctx, id: string) {
  await mustBeOn(ctx);
  const bag = bagById(id);
  if (!bag) throw new GameError("bad_request", "Нет такой сумки", 400);
  const have = await itemQty(ctx.q, ctx.pid, KEYCAP_ID);
  if (have < bag.price) throw new GameError("fortune_no_keycaps", `Нужно ${bag.price} кнопок клавиатуры`);
  await takeItem(ctx, KEYCAP_ID, bag.price, `fortune_bag:${bag.id}`);
  const l = rollBagLoot(bag, ctx.rng);
  const loot: Reward = mergeRewards({ xp: l.xp, currencies: { RUB: l.rub, USD: l.usd } },
    ...Array.from({ length: l.stash }, () => ({ items: [{ id: STASH_IDS[Math.floor(ctx.rng() * STASH_IDS.length) % STASH_IDS.length], qty: 1 }] })));
  let tattoo: string | null = null;
  const set = TATTOO_SETS.find((s) => s.id === bag.set);
  if (set && ctx.rng() < BAG_TATTOO_CHANCE) {
    const all = set.pieces.map((p) => p.id);
    const own = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [ctx.pid, all])).map((x) => x.item_id));
    const left = all.filter((x) => !own.has(x));
    if (left.length) { tattoo = left[Math.floor(ctx.rng() * left.length) % left.length]; loot.items = [...(loot.items ?? []), { id: tattoo, qty: 1 }]; }
  }
  const reward = await grantReward(ctx, mergeRewards(loot), `fortune_bag:${bag.id}`);
  return { bag: bag.id, reward, tattoo, fortune: await fortuneView(ctx.q, ctx.pid) };
}
