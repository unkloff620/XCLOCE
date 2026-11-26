/*
 * «Бандитский фарт» (content/bandit.ts): a spin for roubles (a bet of 1–10), or a free one while any are left (at the
 * bet they were won with). Every rouble bet is 1 experience of the machine. A win is matchboxes (bandit_state.boxes),
 * spent on the chest: BANDIT_CHEST_PRICE boxes — a tattoo piece the player has not got yet (the user 2026-11-26).
 */
import { GameError, type Queryable } from "../db.ts";
import { grantReward, takeMoney, type Ctx } from "../core.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";
import { BANDIT_BET_MAX, BANDIT_BET_MIN, BANDIT_CHEST_PRICE, banditLevel, banditSpin } from "../../content/bandit.ts";

interface Row { free: number; free_bet: number; carry: number; spins: number; won: string | number; xp: string | number; boxes: string | number }

async function row(q: Queryable, pid: number): Promise<Row> {
  const [r] = await q.query<Row>("SELECT free, free_bet, carry, spins, won, xp, boxes FROM bandit_state WHERE player_id=$1", [pid]);
  return r ?? { free: 0, free_bet: 0, carry: 0, spins: 0, won: 0, xp: 0, boxes: 0 };
}

export async function banditView(q: Queryable, pid: number) {
  const r = await row(q, pid);
  const [w] = await q.query<{ amount: string | number }>("SELECT amount FROM wallets WHERE player_id=$1 AND currency='RUB'", [pid]);
  return { free: Number(r.free), freeBet: Number(r.free_bet), spins: Number(r.spins), won: Number(r.won), rub: Number(w?.amount ?? 0), xp: Number(r.xp), lvl: banditLevel(Number(r.xp)), boxes: Number(r.boxes) };
}

export async function banditSpinAction(ctx: Ctx, body: { bet?: unknown }) {
  const r = await row(ctx.q, ctx.pid);
  const free = Number(r.free) > 0;
  const bet = free ? Number(r.free_bet) : Number(body.bet);
  if (!Number.isInteger(bet) || bet < BANDIT_BET_MIN || bet > BANDIT_BET_MAX) throw new GameError("bad_bet", `Ставка — от ${BANDIT_BET_MIN} до ${BANDIT_BET_MAX} рублей`);
  if (!free) await takeMoney(ctx, "RUB", bet, "bandit:bet");
  const s = banditSpin(bet, ctx.rng, free);
  const total = s.raw + Number(r.carry);
  const pay = Math.floor(total + 1e-9);
  const freeLeft = Math.max(0, Number(r.free) - (free ? 1 : 0)) + s.free;
  await ctx.q.query(
    `INSERT INTO bandit_state (player_id, free, free_bet, carry, spins, won, xp, boxes) VALUES ($1,$2,$3,$4,1,$5,$6,$5)
     ON CONFLICT (player_id) DO UPDATE SET free=$2, free_bet=$3, carry=$4, spins=bandit_state.spins+1, won=bandit_state.won+$5, xp=bandit_state.xp+$6, boxes=bandit_state.boxes+$5`,
    [ctx.pid, freeLeft, freeLeft > 0 ? bet : 0, total - pay, pay, free ? 0 : bet],
  );
  const levelBefore = banditLevel(Number(r.xp)).level;
  return { ...s, ...(await banditView(ctx.q, ctx.pid)), levelBefore, bet, paid: free ? 0 : bet, win: pay, wasFree: free, freeLeft };
}

/** the chest: BANDIT_CHEST_PRICE matchboxes → a tattoo piece of any set the player has not got yet */
export async function banditChest(ctx: Ctx) {
  const [r] = await ctx.q.query<{ boxes: string | number }>(
    "UPDATE bandit_state SET boxes = boxes - $2 WHERE player_id=$1 AND boxes >= $2 RETURNING boxes", [ctx.pid, BANDIT_CHEST_PRICE]);
  if (!r) throw new GameError("no_boxes", `Нужно ${BANDIT_CHEST_PRICE} коробков спичек`);
  const all = TATTOO_SETS.flatMap((s) => s.pieces.map((p) => p.id));
  const have = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id LIKE 'tat-%'", [ctx.pid])).map((x) => x.item_id));
  const left = all.filter((id) => !have.has(id));
  const pool = left.length ? left : all;
  const id = pool[Math.floor(ctx.rng() * pool.length) % pool.length];
  const reward = await grantReward(ctx, { items: [{ id, qty: 1 }] }, "bandit:chest");
  return { tattoo: id, reward, ...(await banditView(ctx.q, ctx.pid)) };
}
