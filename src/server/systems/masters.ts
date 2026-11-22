import { GameError, type Queryable } from "../db.ts";
import { addItem, grantReward, spendEnergy, takeMoney, type Ctx } from "../core.ts";
import { MASTERS, MASTER_FINISH_PARTS, MASTER_PART_CHANCE, finishPay, energyOfStep, masterById, partPrice, pointSteps, stepPay, totalSteps, type MasterDef } from "../../content/masters.ts";

/*
 * «Мастера» (content/masters.ts): his five parts are bought once (master_progress.bought — a bit per part), then his
 * path is walked step by step for energy; at its end the next master opens (runs > 0) and the path starts again.
 */
type Row = { master_id: string; bought: number; steps: number; runs: number; mastery: number };
const ALL = 0b11111;

async function rows(q: Queryable, pid: number): Promise<Map<string, Row>> {
  const r = await q.query<Row>("SELECT master_id, bought, steps, runs, mastery FROM master_progress WHERE player_id=$1", [pid]);
  return new Map(r.map((x) => [x.master_id, { ...x, mastery: Number(x.mastery) }]));
}
const isOpen = (m: MasterDef, mine: Map<string, Row>) => m.n === 1 || (mine.get(MASTERS[m.n - 2].id)?.runs ?? 0) > 0;

export async function mastersView(q: Queryable, pid: number) {
  const mine = await rows(q, pid);
  // the best student of every master: the most «Мастерство» with him (and his clan)
  const best = new Map((await q.query<{ master_id: string; id: number; name: string; photo: string | null; clan: string | null; mastery: number }>(
    `SELECT DISTINCT ON (r.master_id) r.master_id, p.id, p.display_name AS name, p.photo_url AS photo, c.tag AS clan, r.mastery
     FROM master_progress r JOIN players p ON p.id = r.player_id
     LEFT JOIN clan_members cm ON cm.player_id = p.id LEFT JOIN clans c ON c.id = cm.clan_id
     WHERE p.banned_at IS NULL AND r.mastery > 0 ORDER BY r.master_id, r.mastery DESC, r.player_id`,
  )).map((b) => [b.master_id, { id: b.id, name: b.name, photo: b.photo, clan: b.clan, mastery: Number(b.mastery) }]));
  return MASTERS.map((m) => {
    const r = mine.get(m.id);
    return {
      id: m.id, open: isOpen(m, mine), bought: r?.bought ?? 0, steps: r?.steps ?? 0, runs: r?.runs ?? 0, mastery: r?.mastery ?? 0,
      total: totalSteps(m), points: pointSteps(m), best: best.get(m.id) ?? null,
    };
  });
}

function need(id: string) {
  const m = masterById(id);
  if (!m) throw new GameError("bad_master", "Такого мастера нет");
  return m;
}

/** buy one of his five parts (once each): it goes to the inventory */
export async function masterBuy(ctx: Ctx, id: string, slot: number) {
  const m = need(id);
  if (!Number.isInteger(slot) || slot < 0 || slot > 4) throw new GameError("bad_slot", "Такой детали нет");
  const mine = await rows(ctx.q, ctx.pid);
  if (!isOpen(m, mine)) throw new GameError("master_locked", "Сначала пройди обучение у предыдущего мастера");
  const bought = mine.get(m.id)?.bought ?? 0;
  if (bought & (1 << slot)) throw new GameError("bought", "Эта деталь уже куплена");
  const p = partPrice(m, slot);
  await takeMoney(ctx, p.cur, p.amount, `master:${m.id}:${slot}`);
  await addItem(ctx, m.parts[slot], 1, `master:${m.id}`);
  await ctx.q.query(
    `INSERT INTO master_progress (player_id, master_id, bought) VALUES ($1,$2,$3)
     ON CONFLICT (player_id, master_id) DO UPDATE SET bought = master_progress.bought | EXCLUDED.bought`,
    [ctx.pid, m.id, 1 << slot],
  );
  return { masterId: m.id, slot, bought: bought | (1 << slot) };
}

/** one step of the path: energy → папиросы, authority, «Мастерство» and maybe a part; the last step — the path is done */
export async function masterStep(ctx: Ctx, id: string) {
  const m = need(id);
  const mine = await rows(ctx.q, ctx.pid);
  if (!isOpen(m, mine)) throw new GameError("master_locked", "Сначала пройди обучение у предыдущего мастера");
  const r = mine.get(m.id);
  if ((r?.bought ?? 0) !== ALL) throw new GameError("parts_needed", "Сначала купи у мастера все 5 деталей");
  const step = r!.steps;
  const e = energyOfStep(m, step);
  await spendEnergy(ctx, e);
  const pay = stepPay(e);
  const part = ctx.rng() < MASTER_PART_CHANCE ? m.parts[Math.floor(ctx.rng() * m.parts.length) % m.parts.length] : null;
  const got = await grantReward(ctx, { currencies: { PAP: pay.pap }, xp: pay.xp, items: part ? [{ id: part, qty: 1 }] : [] }, `master:${m.id}`);
  const done = step + 1 >= totalSteps(m);
  await ctx.q.query(
    "UPDATE master_progress SET steps=$3, runs = runs + $4, mastery = mastery + $5 WHERE player_id=$1 AND master_id=$2",
    [ctx.pid, m.id, done ? 0 : step + 1, done ? 1 : 0, e],
  );
  const next = done && (r!.runs === 0) ? MASTERS[m.n] ?? null : null;
  // the path walked: its own payout (shown in «Обучение пройдено»)
  let finish = null;
  if (done) {
    const f = finishPay(m);
    const parts = new Map<string, number>();
    for (let i = 0; i < MASTER_FINISH_PARTS; i++) {
      const p = m.parts[Math.floor(ctx.rng() * m.parts.length) % m.parts.length];
      parts.set(p, (parts.get(p) ?? 0) + 1);
    }
    finish = await grantReward(ctx, { currencies: { PAP: f.pap, TOOTH: f.tooth }, xp: f.xp, items: [...parts].map(([id, qty]) => ({ id, qty })) }, `master:${m.id}:done`);
  }
  return { masterId: m.id, energy: e, mastery: e, reward: got, part, done, finish, opened: next?.id ?? null };
}
