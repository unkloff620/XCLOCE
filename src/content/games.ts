/*
 * Мини-игры во дворе: блэкджек, зонк (кости) и апгрейдер находок.
 * Блэкджек — 3 бесплатные партии в день, дальше 2 USD; зонк — 1 бесплатная, дальше 2 USD. Выигрыши небольшие.
 * Апгрейдер: находку из двора (или несколько одинаковых) пробуем превратить в вещь дороже; шанс = стоимость ставки /
 * стоимость цели × 0,9, не больше 75%. Проигрыш — ставка сгорает.
 * Здесь только правила и числа; сервер (server/systems/games.ts) раздаёт карты и кидает кости.
 */
import type { Currency } from "./currencies.ts";
import type { Reward } from "./rewards.ts";

export type GameKind = "blackjack" | "zonk";
export interface GameRules { freePerDay: number; price: { currency: Currency; amount: number }; title: string }
export const GAME_RULES: Record<GameKind, GameRules> = {
  blackjack: { freePerDay: 3, price: { currency: "USD", amount: 2 }, title: "Блэкджек" },
  zonk: { freePerDay: 1, price: { currency: "USD", amount: 2 }, title: "Зонк" },
};

/* ---------------- blackjack ---------------- */
/** a card: rank 1 (ace) … 13 (king), suit 0…3 */
export interface Card { r: number; s: number }
export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

/** the best total of a hand: aces count 11 while that does not bust */
export function handValue(cards: Card[]): number {
  let sum = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 1) { aces++; sum += 11; } else sum += Math.min(10, c.r);
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
}
export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards) === 21;

export type BjOutcome = "blackjack" | "win" | "push" | "lose";
/** what a free and a paid game pay for each outcome (a paid push gives the stake back) */
export const BJ_PAY: Record<"free" | "paid", Record<BjOutcome, Reward>> = {
  free: { blackjack: { currencies: { RUB: 150 } }, win: { currencies: { RUB: 100 } }, push: { currencies: { RUB: 30 } }, lose: {} },
  paid: { blackjack: { currencies: { USD: 4.6 } }, win: { currencies: { USD: 3.6 } }, push: { currencies: { USD: 2 } }, lose: {} },
};
export const BJ_TITLES: Record<BjOutcome, string> = { blackjack: "Блэкджек!", win: "Победа!", push: "Ничья", lose: "Проигрыш" };

/** the result once the player stands (the dealer has drawn to 17) */
export function bjOutcome(player: Card[], dealer: Card[]): BjOutcome {
  const p = handValue(player), d = handValue(dealer);
  if (p > 21) return "lose";
  if (isBlackjack(player) && !isBlackjack(dealer)) return "blackjack";
  if (isBlackjack(dealer) && !isBlackjack(player)) return "lose";
  if (d > 21 || p > d) return "win";
  return p === d ? "push" : "lose";
}

/* ---------------- zonk (кости, «Farkle») ---------------- */
/*
 * 6 костей. Очки: 1 = 100, 5 = 50; три одинаковых = номинал × 100 (три единицы = 1000); четыре — вдвое больше трёх,
 * пять — вчетверо, шесть — в 8 раз; стрит 1-2-3-4-5-6 = 1500; три пары = 750.
 * Бросаешь, откладываешь очковые кости и решаешь: бросить оставшиеся или забрать очки. Бросок без очков — «Зонк»:
 * всё набранное сгорает. Отложены все 6 — бросаешь все шесть заново.
 */
export const ZONK_DICE = 6;

/** points of a set of dice where every die must count; null if some die does not score */
export function zonkScore(dice: number[]): number | null {
  if (!dice.length) return null;
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) n[d]++;
  if (dice.length === 6 && n.slice(1).every((x) => x === 1)) return 1500;
  if (dice.length === 6 && n.filter((x) => x === 2).length === 3) return 750;
  let pts = 0;
  for (let f = 1; f <= 6; f++) {
    let c = n[f];
    if (c >= 3) {
      pts += (f === 1 ? 1000 : f * 100) * 2 ** (c - 3);
      c = 0;
    }
    if (f === 1) pts += c * 100;
    else if (f === 5) pts += c * 50;
    else if (c > 0) return null;
  }
  return pts;
}

/** does a roll have anything that scores? */
export function zonkHasScore(dice: number[]): boolean {
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) n[d]++;
  if (n[1] || n[5]) return true;
  if (n.some((x) => x >= 3)) return true;
  if (dice.length === 6 && n.filter((x) => x === 2).length === 3) return true;
  return false;
}

/** the prize for banked points: a free game pays rubles, a paid one dollars (a little less than the stake on average) */
export function zonkPrize(points: number, paid: boolean): Reward {
  if (points <= 0) return {};
  if (paid) return { currencies: { USD: Math.round((points / 400) * 10) / 10 } };
  return { currencies: { RUB: Math.round(points / 5) } };
}

/* ---------------- upgrader ---------------- */
/*
 * Ставка — вещь (обычная из инвентаря, несколько одинаковых, или уже улучшенная). Выбираешь множитель: ×2, ×4, ×8,
 * или шанс: 15%, 30%, 70%. Шанс = 90% / множитель. Получилось — в инвентарь падает УЛУЧШЕННАЯ вещь (с обводкой)
 * стоимостью «ставка × множитель»: это самая дорогая вещь, чья обычная цена не выше этой суммы. Улучшенная вещь
 * продаётся за свою стоимость; в остальном это та же вещь: энергетик даёт ту же энергию, оружие бьёт так же
 * (чтобы ударить им, её берут в бой — она становится обычной). Её можно поставить в апгрейдер снова.
 */
/** what things are worth in the upgrader (rubles): the sell price of yard finds, a fair price for the rest */
export const ITEM_VALUES: Record<string, number> = {
  "bottle-cap": 15, "flyer-passive": 25, "sticker-hodl": 40, spinner: 60, "energy-drink": 90, keyboard: 95,
  "lost-wallet": 150, "energy-pack": 250, gpu: 300, "rug-pull-gun": 2000,
};
export const UPGRADE_EDGE = 0.9;
/** the six buttons: three multipliers and three chances */
export const UPGRADE_MODES = [
  { id: "x2", label: "×2", mult: 2 },
  { id: "x4", label: "×4", mult: 4 },
  { id: "x8", label: "×8", mult: 8 },
  { id: "c15", label: "15%", mult: UPGRADE_EDGE / 0.15 },
  { id: "c30", label: "30%", mult: UPGRADE_EDGE / 0.3 },
  { id: "c70", label: "70%", mult: UPGRADE_EDGE / 0.7 },
] as const;
export type UpgradeMode = (typeof UPGRADE_MODES)[number]["id"];
export const upgradeMode = (id: string) => UPGRADE_MODES.find((m) => m.id === id);
export const upgradeChanceOf = (mult: number) => Math.round((UPGRADE_EDGE / mult) * 10000) / 10000;

/** the thing a win gives for this value: the most expensive item whose plain price fits (at least the cheapest) */
export function upgradeTarget(value: number): string {
  const fits = Object.entries(ITEM_VALUES).filter(([, v]) => v <= value).sort((a, b) => b[1] - a[1]);
  return fits[0]?.[0] ?? "bottle-cap";
}
/** stake value × multiplier, rounded */
export const upgradeValue = (stake: number, mult: number) => Math.max(1, Math.round(stake * mult));
