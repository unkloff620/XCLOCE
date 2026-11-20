/*
 * «Тося»: he drops in when he feels like it — to check you have eaten today — and sells pies off his tray.
 * A visit: some Moscow days, at a random hour, for TOSYA_HOURS (the same for everybody; the admin can call him in or
 * send him off: config "tosya"). Each player gets his own 3…5 pies a visit.
 * Every pie costs TOSYA_PRICE gold bars. What is inside is not known until it is bought: roubles, weapons, metro tokens
 * and wheel tickets (TOSYA_DROP).
 */
import type { Reward } from "./rewards.ts";
import { OFFERS } from "./shop.ts";
import { TICKET_ID } from "./fortune.ts";

export const TOSYA_PRICE = 8;
/** the chance of one of his tattoos in a pie */
export const TOSYA_TATTOO_CHANCE = 0.5;
export const TOSYA_HOURS = 3;
/** the share of Moscow days he comes on, and the hours (МСК) a visit may start at */
export const TOSYA_DAY_CHANCE = 0.6;
export const TOSYA_FIRST_HOUR = 9;
export const TOSYA_LAST_HOUR = 20;

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

/**
 * His looks: every visit he comes in one of them (the same for everybody, by the visit), and brings its own goods on the
 * tray — pies, gold bars, grenades or fishing spoons; what is inside works the same. The words for the goods in the
 * cases the screens need; `full` — said when the tray is empty.
 */
export interface TosyaLook {
  id: string; name: string; art: string;
  w: { one: string; acc: string; many: string; pl: string; inOne: string; inMany: string; next: string; from: string; brought: string };
  full: string;
}
export const TOSYA_LOOKS: TosyaLook[] = [
  { id: "maid", name: "Домработница", art: "", full: "Тося доволен — ты покушал.",
    w: { one: "пирожок", acc: "пирожок", many: "пирожков", pl: "пирожки", inOne: "В пирожке", inMany: "в пирожках", next: "следующему пирожку", from: "Пирожок от Тоси", brought: "Тося привёз пирожки" } },
  { id: "business", name: "Бизнесмен", art: "-business", full: "Тося доволен — теперь ты при золоте.",
    w: { one: "слиток", acc: "слиток", many: "слитков", pl: "слитки", inOne: "В слитке", inMany: "в слитках", next: "следующему слитку", from: "Слиток от Тоси", brought: "Тося привёз золото" } },
  { id: "military", name: "Военный", art: "-military", full: "Тося доволен — ты вооружён.",
    w: { one: "граната", acc: "гранату", many: "гранат", pl: "гранаты", inOne: "В гранате", inMany: "в гранатах", next: "следующей гранате", from: "Граната от Тоси", brought: "Тося привёз гранаты" } },
  { id: "fisher", name: "Рыбак", art: "-fisher", full: "Тося доволен — теперь у тебя клюёт.",
    w: { one: "блесна", acc: "блесну", many: "блёсен", pl: "блёсны", inOne: "В блесне", inMany: "в блёснах", next: "следующей блесне", from: "Блесна от Тоси", brought: "Тося привёз блёсны" } },
];
/** the look of a visit (the same for everybody) */
export const tosyaLook = (visit: string): TosyaLook => TOSYA_LOOKS[hash(`look:${visit}`) % TOSYA_LOOKS.length];
export const tosyaLookById = (id: string | undefined): TosyaLook => TOSYA_LOOKS.find((l) => l.id === id) ?? TOSYA_LOOKS[0];

/** how many pies he brought this player on this visit: 3…5 */
export const tosyaPies = (pid: number, visit: string) => 3 + (hash(`pies:${pid}:${visit}`) % 3);

/** the price of a pie: every one TOSYA_PRICE gold bars (the user 2026-11-20) */
export function tosyaPrice(_bought: number, _pies: number): number {
  return TOSYA_PRICE;
}

/** the shop's weapons (bought for roubles): the ones a pie may hold */
const WEAPONS = OFFERS.filter((o) => o.section === "weapons" && o.give.item && o.price.currency === "RUB").map((o) => o.give.item!);

/** what is inside (the user 2026-11-20): only roubles, weapons, metro tokens and wheel tickets, each in its range */
export const TOSYA_DROP = { rub: [90, 150], weapons: [60, 95], tokens: [40, 50], tickets: [5, 9] } as const;

/** a pie's contents, at random: the weapons' total split between the kinds (at least one of each) */
export function rollPie(rng: () => number): Reward {
  const between = ([a, b]: readonly [number, number]) => a + Math.floor(rng() * (b - a + 1)) % (b - a + 1);
  const total = between(TOSYA_DROP.weapons);
  const w = WEAPONS.map(() => 0.3 + rng());
  const sum = w.reduce((a, b) => a + b, 0);
  const qty = w.map((x) => Math.max(1, Math.floor((total - WEAPONS.length) * x / sum) + 1));
  qty[0] += Math.max(0, total - qty.reduce((a, b) => a + b, 0));
  return {
    currencies: { RUB: between(TOSYA_DROP.rub), TOKEN: between(TOSYA_DROP.tokens) },
    items: [...WEAPONS.map((id, i) => ({ id, qty: qty[i] })), { id: TICKET_ID, qty: between(TOSYA_DROP.tickets) }],
  };
}
