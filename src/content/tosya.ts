/*
 * «Тося»: he drops in when he feels like it — to check you have eaten today — and sells pies off his tray.
 * A visit: some Moscow days, at a random hour, for TOSYA_HOURS (the same for everybody; the admin can call him in or
 * send him off: config "tosya"). Each player gets his own 3…5 pies a visit; with 5 the first one is free.
 * A pie costs TOSYA_PRICE $, every next one twice as much. What is inside is not known until it is bought: weapons,
 * craft parts, authority, roubles and dollars worth TOSYA_MULT × its price (a free pie as a TOSYA_PRICE one) — then
 * on top (TOSYA_BOOST) roubles ×2/1.2, dollars ÷10, authority ×5, parts ×10, weapons ×2 — every weapon kind in each, and one of
 * Тося's own tattoos (TOSYA_TATTOOS — the sets come later).
 */
import type { Reward } from "./rewards.ts";
import { OFFERS } from "./shop.ts";
import { CURRENCY_DEFS } from "./currencies.ts";
import { PARTS_BY_RARITY, PART_USD } from "./craft-drops.ts";

export const TOSYA_PRICE = 20;
export const TOSYA_MULT = 5;
export const TOSYA_HOURS = 3;
/** the share of Moscow days he comes on, and the hours (МСК) a visit may start at */
export const TOSYA_DAY_CHANCE = 0.6;
export const TOSYA_FIRST_HOUR = 9;
export const TOSYA_LAST_HOUR = 20;
/** authority bought for a dollar (to weigh it against the rest of the pie) */
export const TOSYA_XP_PER_USD = 100;
/** Тося's own tattoos (one in every pie): empty until his sets are drawn */
export const TOSYA_TATTOOS: string[] = [];

/**
 * The admin's control (config "tosya"): `auto` — his own schedule; `off` — he does not come; `run` — started by hand at
 * `at` for TOSYA_HOURS (a new start is a new visit: every tray is full again), then his own schedule again.
 */
export type TosyaMode = { mode: "auto" | "off" | "run"; at: number };
export function cleanTosyaMode(v: unknown): TosyaMode {
  if (v === "off") return { mode: "off", at: 0 };
  const o = (v ?? {}) as { mode?: unknown; at?: unknown };
  if (o.mode === "off") return { mode: "off", at: 0 };
  if (o.mode === "run" && typeof o.at === "number" && o.at > 0) return { mode: "run", at: o.at };
  return { mode: "auto", at: 0 };
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
const seeded = (s: string) => {
  let x = hash(s) || 1;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
};
const MSK = 3 * 3600_000;
const dayOf = (now: number) => new Date(now + MSK).toISOString().slice(0, 10);

/** the visit going on at `now` (its id and when he leaves), or null */
export function tosyaVisit(now: number, m: TosyaMode = { mode: "auto", at: 0 }): { id: string; endsAt: number } | null {
  if (m.mode === "off") return null;
  if (m.mode === "run" && now >= m.at && now < m.at + TOSYA_HOURS * 3600_000) return { id: `run-${m.at}`, endsAt: m.at + TOSYA_HOURS * 3600_000 };
  const day = dayOf(now);
  const midnight = Date.parse(`${day}T00:00:00Z`) - MSK;
  const r = seeded(`tosya:${day}`);
  if (r() >= TOSYA_DAY_CHANCE) return null;
  const start = midnight + (TOSYA_FIRST_HOUR + r() * (TOSYA_LAST_HOUR - TOSYA_FIRST_HOUR)) * 3600_000;
  const end = start + TOSYA_HOURS * 3600_000;
  return now >= start && now < end ? { id: day, endsAt: Math.round(end) } : null;
}

/** when he comes next (ms), or null: stopped by the admin / no visit in the next 60 days */
export function tosyaNextAt(now: number, m: TosyaMode = { mode: "auto", at: 0 }): number | null {
  if (m.mode === "off") return null;
  if (m.mode === "run" && now < m.at) return m.at;
  const first = Date.parse(`${dayOf(now)}T00:00:00Z`) - MSK;
  for (let k = 0; k < 60; k++) {
    const midnight = first + k * 24 * 3600_000;
    const day = dayOf(midnight + 3600_000);
    const r = seeded(`tosya:${day}`);
    if (r() >= TOSYA_DAY_CHANCE) continue;
    const start = Math.round(midnight + (TOSYA_FIRST_HOUR + r() * (TOSYA_LAST_HOUR - TOSYA_FIRST_HOUR)) * 3600_000);
    if (start > now) return start;
  }
  return null;
}

/** how many pies he brought this player on this visit: 3…5 */
export const tosyaPies = (pid: number, visit: string) => 3 + (hash(`pies:${pid}:${visit}`) % 3);

/** the price of the next pie: with five the first is free; then TOSYA_PRICE, doubling with every one bought */
export function tosyaPrice(bought: number, pies: number): number {
  const paid = pies === 5 ? bought - 1 : bought;
  return paid < 0 ? 0 : TOSYA_PRICE * 2 ** paid;
}
/** what a pie holds, in dollars */
export const tosyaValue = (price: number) => (price || TOSYA_PRICE) * TOSYA_MULT;

const RUB_PER_USD = CURRENCY_DEFS.USD.rub;
/** the weapons from the shop and their dollar price */
const WEAPONS = OFFERS.filter((o) => o.section === "weapons" && o.give.item && o.price.currency === "RUB").map((o) => ({ id: o.give.item!, usd: o.price.amount / RUB_PER_USD }));

/**
 * A pie's contents worth `usd` dollars, at random: the value is shared out between weapons, parts, authority, dollars and
 * roubles (roubles take whatever is left, so the whole is exactly the value), plus one of Тося's tattoos.
 */
export function rollPieBase(rng: () => number, usd: number): Reward {
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length) % a.length];
  const w = { weapons: 0.3 + rng(), parts: 0.3 + rng(), xp: 0.3 + rng(), usd: 0.2 + rng() * 0.8, rub: 0.3 + rng() };
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  const share = (k: keyof typeof w) => (usd * w[k]) / sum;
  const items = new Map<string, number>();
  const add = (id: string, n: number) => n > 0 && items.set(id, (items.get(id) ?? 0) + n);
  let spent = 0;
  // weapons: every kind, the share split between them evenly (at least one of each)
  for (const wpn of WEAPONS) {
    const n = Math.max(1, Math.floor(share("weapons") / WEAPONS.length / wpn.usd));
    add(wpn.id, n);
    spent += n * wpn.usd;
  }
  // parts: mostly common, now and then a rare or a very rare one, while the share lasts
  let left = share("parts");
  for (let i = 0; i < 200 && left >= PART_USD.common; i++) {
    const r = rng();
    const rar = r < 0.06 && left >= PART_USD.epic ? "epic" : r < 0.3 && left >= PART_USD.rare ? "rare" : "common";
    add(pick(PARTS_BY_RARITY[rar]), 1);
    left -= PART_USD[rar];
    spent += PART_USD[rar];
  }
  const xp = Math.floor(share("xp") * TOSYA_XP_PER_USD);
  spent += xp / TOSYA_XP_PER_USD;
  const dollars = Math.floor(share("usd"));
  spent += dollars;
  const rub = Math.max(0, Math.round((usd - spent) * RUB_PER_USD));
  if (TOSYA_TATTOOS.length) add(pick(TOSYA_TATTOOS), 1);
  return {
    ...(xp > 0 ? { xp } : {}),
    currencies: { ...(dollars > 0 ? { USD: dollars } : {}), ...(rub > 0 ? { RUB: rub } : {}) },
    items: [...items].map(([id, qty]) => ({ id, qty })),
  };
}

/** on top of the even split (TOSYA_BOOST): roubles ×2 / 1.2, dollars ÷10, authority ×5, parts ×10, weapons ×2 */
export const TOSYA_BOOST = { rub: 2 / 1.2, usd: 0.1, xp: 5, parts: 10, weapons: 2 };
const PART_SET = new Set([...PARTS_BY_RARITY.common, ...PARTS_BY_RARITY.rare, ...PARTS_BY_RARITY.epic]);
const WEAPON_SET = new Set(WEAPONS.map((w) => w.id));
export function rollPie(rng: () => number, usd: number): Reward {
  const r = rollPieBase(rng, usd);
  const rub = Math.round((r.currencies?.RUB ?? 0) * TOSYA_BOOST.rub);
  const dollars = Math.round((r.currencies?.USD ?? 0) * TOSYA_BOOST.usd);
  return {
    ...(r.xp ? { xp: r.xp * TOSYA_BOOST.xp } : {}),
    currencies: { ...(dollars > 0 ? { USD: dollars } : {}), ...(rub > 0 ? { RUB: rub } : {}) },
    items: (r.items ?? []).map((it) => ({ id: it.id, qty: it.qty * (PART_SET.has(it.id) ? TOSYA_BOOST.parts : WEAPON_SET.has(it.id) ? TOSYA_BOOST.weapons : 1) })),
  };
}

/** the dollar worth of a reward by the same prices (tests: a pie holds TOSYA_MULT × its price) */
export function tosyaWorth(r: Reward): number {
  let v = (r.xp ?? 0) / TOSYA_XP_PER_USD + (r.currencies?.USD ?? 0) + (r.currencies?.RUB ?? 0) / RUB_PER_USD;
  for (const it of r.items ?? []) {
    const wpn = WEAPONS.find((x) => x.id === it.id);
    if (wpn) v += wpn.usd * it.qty;
    else for (const rar of ["common", "rare", "epic"] as const) if (PARTS_BY_RARITY[rar].includes(it.id)) v += PART_USD[rar] * it.qty;
  }
  return v;
}
