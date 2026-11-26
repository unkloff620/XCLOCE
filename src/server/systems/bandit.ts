/*
 * «Бандитский фарт» (content/bandit.ts): a spin for roubles (a bet of 1–10), or a free one while any are left (at the
 * bet they were won with). Every rouble bet is 1 experience of the machine. A win is matchboxes (bandit_state.boxes),
 * spent on the chest: BANDIT_CHEST_PRICE boxes — a tattoo piece the player has not got yet (the user 2026-11-26).
 * 3+ revolvers open «Русская рулетка»: ROULETTE_PULLS rounds; each pull loads one into the six chambers and spins the
 * drum (decided here: the shot ROULETTE_SHOT), a click gives ROULETTE_PAY BLUE boxes at once (whatever the bet) (bandit_state.blue;
 * the spins give the red ones), the shot ends it. The horseshoes on a line give the machine's experience.
 * No spin while it is open.
 */
import { GameError, type Queryable } from "../db.ts";
import { grantReward, takeMoney, type Ctx } from "../core.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";
import { BANDIT_BET_MAX, BANDIT_BET_MIN, BANDIT_CHEST_PRICE, ROULETTE_PAY, ROULETTE_PULLS, ROULETTE_SHOT, banditLevel, banditSpin } from "../../content/bandit.ts";

interface Row { free: number; free_bet: number; carry: number; spins: number; won: string | number; xp: string | number; boxes: string | number; blue: string | number; roul_left: number; roul_round: number; roul_pulls: number; roul_bet: number }

async function row(q: Queryable, pid: number): Promise<Row> {
  const [r] = await q.query<Row>("SELECT free, free_bet, carry, spins, won, xp, boxes, blue, roul_left, roul_round, roul_pulls, roul_bet FROM bandit_state WHERE player_id=$1", [pid]);
  return r ?? { free: 0, free_bet: 0, carry: 0, spins: 0, won: 0, xp: 0, boxes: 0, blue: 0, roul_left: 0, roul_round: 0, roul_pulls: 0, roul_bet: 0 };
}

export async function banditView(q: Queryable, pid: number) {
  const r = await row(q, pid);
  const [w] = await q.query<{ amount: string | number }>("SELECT amount FROM wallets WHERE player_id=$1 AND currency='RUB'", [pid]);
  return {
    free: Number(r.free), freeBet: Number(r.free_bet), spins: Number(r.spins), won: Number(r.won), rub: Number(w?.amount ?? 0), xp: Number(r.xp), lvl: banditLevel(Number(r.xp)), boxes: Number(r.boxes), blue: Number(r.blue),
    // the open roulette: the pulls left and made, its bet (where the round is stays here)
    roulette: Number(r.roul_left) > 0 ? { left: Number(r.roul_left), pulls: Number(r.roul_pulls), bet: Number(r.roul_bet) } : null,
  };
}

export async function banditSpinAction(ctx: Ctx, body: { bet?: unknown }) {
  const r = await row(ctx.q, ctx.pid);
  if (Number(r.roul_left) > 0) throw new GameError("roulette_open", "Сначала доиграй русскую рулетку");
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
    [ctx.pid, freeLeft, freeLeft > 0 ? bet : 0, total - pay, pay, (free ? 0 : bet) + s.xpGot],
  );
  // 3+ revolvers: the roulette opens, the round in a chamber 1…6
  if (s.roulette) {
    await ctx.q.query("UPDATE bandit_state SET roul_left=$2, roul_round=0, roul_pulls=0, roul_bet=$3 WHERE player_id=$1", [ctx.pid, ROULETTE_PULLS, bet]);
  }
  const levelBefore = banditLevel(Number(r.xp)).level;
  return { ...s, ...(await banditView(ctx.q, ctx.pid)), levelBefore, bet, paid: free ? 0 : bet, win: pay, wasFree: free, freeLeft };
}

/** «Русская рулетка»: a pull of the trigger — a click gives ROULETTE_PAY blue boxes, the shot ends the game;
 *  `stop`: he puts the revolver down (keeps what he got) */
export async function banditPull(ctx: Ctx, body: { stop?: unknown }) {
  const r = await row(ctx.q, ctx.pid);
  if (Number(r.roul_left) <= 0) throw new GameError("no_roulette", "Рулетки нет");
  if (body.stop) {
    await ctx.q.query("UPDATE bandit_state SET roul_left=0 WHERE player_id=$1", [ctx.pid]);
    return { shot: false, stopped: true, got: 0, ...(await banditView(ctx.q, ctx.pid)) };
  }
  const pull = Number(r.roul_pulls) + 1;
  // a round in, the drum spun: the shot 1 in 6 (roul_round: a test may fix the pull that shoots)
  const shot = Number(r.roul_round) > 0 ? pull === Number(r.roul_round) : ctx.rng() < ROULETTE_SHOT;
  const got = shot ? 0 : ROULETTE_PAY;
  const left = shot ? 0 : Number(r.roul_left) - 1;
  await ctx.q.query("UPDATE bandit_state SET roul_left=$2, roul_pulls=$3, blue=blue+$4 WHERE player_id=$1", [ctx.pid, left, pull, got]);
  return { shot, stopped: false, got, pull, ...(await banditView(ctx.q, ctx.pid)) };
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
