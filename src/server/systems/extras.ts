import { GameError, type Queryable } from "../db.ts";
import { addMoney, grantReward, takeItem, takeMoney, weighted, type Ctx } from "../core.ts";
import { itemById } from "../../content/items.ts";
import { NICK_RE, RENAME } from "../../content/profile.ts";
import { SLOT_OUTCOMES, SLOT_SYMBOLS, type SlotOutcome, type SlotSymbol } from "../../content/slots.ts";
import type { Config } from "../config.ts";

// ---------------- selling yard finds ----------------
export async function sellItem(ctx: Ctx, itemId: string, qty: number) {
  const def = itemById(itemId);
  const price = def ? ctx.cfg.sell[def.id] : undefined;
  if (!def || !price) throw new GameError("not_sellable", "Это нельзя продать");
  if (!Number.isInteger(qty) || qty < 1 || qty > 9999) throw new GameError("bad_qty", "Некорректное количество");
  const left = await takeItem(ctx, def.id, qty, "sell");
  const got = await addMoney(ctx, "RUB", price * qty, `sell:${def.id}`);
  return { itemId: def.id, qty, got, left };
}

// ---------------- nickname ----------------
export function cleanNick(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export async function renameView(q: Queryable, pid: number, now: number, cfg: Config) {
  const [p] = await q.query<{ name_changed_at: Date | null }>("SELECT name_changed_at FROM players WHERE id=$1", [pid]);
  const next = p?.name_changed_at ? new Date(p.name_changed_at).getTime() + cfg.rename.cooldownH * 3600_000 : 0;
  return { price: { currency: RENAME.currency, amount: cfg.rename.price }, nextAt: next > now ? next : null, min: RENAME.min, max: RENAME.max };
}

export async function rename(ctx: Ctx, raw: string) {
  const nick = cleanNick(raw);
  if (nick.length < RENAME.min || nick.length > RENAME.max) throw new GameError("bad_nick", `Ник: от ${RENAME.min} до ${RENAME.max} символов`);
  if (!NICK_RE.test(nick)) throw new GameError("bad_nick", "Только буквы, цифры, пробел, точка, _ и -");
  const view = await renameView(ctx.q, ctx.pid, ctx.now, ctx.cfg);
  if (view.nextAt) throw new GameError("rename_cooldown", "Ник можно менять раз в 24 часа");
  const [same] = await ctx.q.query<{ id: number; display_name: string }>("SELECT id, display_name FROM players WHERE lower(display_name)=lower($1)", [nick]);
  if (same && same.id !== ctx.pid) throw new GameError("nick_taken", "Такой ник уже занят");
  if (same && same.display_name === nick) throw new GameError("same_nick", "Это и так твой ник");
  await takeMoney(ctx, RENAME.currency, ctx.cfg.rename.price, "rename");
  await ctx.q.query("UPDATE players SET display_name=$2, name_custom=true, name_changed_at=$3 WHERE id=$1", [ctx.pid, nick, new Date(ctx.now)]);
  return { name: nick };
}

// ---------------- slot machine 777 ----------------
export async function slotsView(q: Queryable, pid: number, now: number, cfg: Config) {
  const rows = await q.query<{ created_at: Date }>(
    "SELECT created_at FROM slot_spins WHERE player_id=$1 AND created_at > $2 ORDER BY created_at ASC",
    [pid, new Date(now - 3600_000)],
  );
  const used = rows.length;
  const left = Math.max(0, cfg.slots.perHour - used);
  // the next spin frees up an hour after the oldest spin inside the window
  const nextAt = left > 0 ? null : new Date(rows[used - cfg.slots.perHour].created_at).getTime() + 3600_000;
  return { left, max: cfg.slots.perHour, nextAt };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Reels that show the chosen outcome (and nothing better). */
export function reelsFor(o: SlotOutcome, rng: () => number): SlotSymbol[] {
  if (o.triple) return [o.triple, o.triple, o.triple];
  if (o.kind === "pair") {
    const a = pick(SLOT_SYMBOLS, rng);
    const b = pick(SLOT_SYMBOLS.filter((s) => s !== a), rng);
    const odd = Math.floor(rng() * 3) % 3;
    return [0, 1, 2].map((i) => (i === odd ? b : a));
  }
  const a = pick(SLOT_SYMBOLS, rng);
  const b = pick(SLOT_SYMBOLS.filter((s) => s !== a), rng);
  const c = pick(SLOT_SYMBOLS.filter((s) => s !== a && s !== b), rng);
  return [a, b, c];
}

export async function spinSlots(ctx: Ctx) {
  const v = await slotsView(ctx.q, ctx.pid, ctx.now, ctx.cfg);
  if (v.left < 1) throw new GameError("slots_limit", "Автомат остывает — 3 прокрутки в час");
  const o = weighted(SLOT_OUTCOMES.map((x) => ({ v: x, w: ctx.cfg.slots.weights[x.id] ?? x.weight })), ctx.rng);
  const reels = reelsFor(o, ctx.rng);
  await ctx.q.query("INSERT INTO slot_spins (player_id, outcome, reels, created_at) VALUES ($1,$2,$3,$4)", [ctx.pid, o.id, reels.join(","), new Date(ctx.now)]);
  const hasReward = Object.keys(o.reward).length > 0;
  const reward = hasReward ? await grantReward(ctx, o.reward, `slots:${o.id}`) : null;
  return { outcome: o.id, kind: o.kind, title: o.title, reels, reward, left: v.left - 1 };
}
