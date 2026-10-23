/*
 * Мини-игры во дворе: блэкджек (общий стол до 6 игроков, ставки), зонк (кости), покер и апгрейдер находок.
 * Зонк — 4 уровня сложности (ZONK_LEVELS): 1-й за рубли (первая игра дня бесплатно), 2–4-й за доллары.
 * Апгрейдер: находку из двора (или несколько одинаковых) пробуем превратить в вещь дороже; шанс = стоимость ставки /
 * стоимость цели × 0,9, не больше 75%. Проигрыш — ставка сгорает.
 * Здесь только правила и числа; сервер (server/systems/games.ts) раздаёт карты и кидает кости.
 */
import type { Currency } from "./currencies.ts";
import type { Reward } from "./rewards.ts";

export type GameKind = "zonk";
export interface GameRules { freePerDay: number; price: { currency: Currency; amount: number }; title: string }
export const GAME_RULES: Record<GameKind, GameRules> = {
  zonk: { freePerDay: 1, price: { currency: "RUB", amount: 150 }, title: "Зонк" },
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
export const BJ_TITLES: Record<BjOutcome, string> = { blackjack: "Блэкджек!", win: "Победа!", push: "Ничья", lose: "Проигрыш" };

/** the result of a hand against the dealer once both are done (natural = the first two cards, not after a split) */
export function bjOutcome(player: Card[], dealer: Card[], split = false): BjOutcome {
  const p = handValue(player), d = handValue(dealer);
  if (p > 21) return "lose";
  const pBj = !split && isBlackjack(player);
  if (pBj && !isBlackjack(dealer)) return "blackjack";
  if (isBlackjack(dealer) && !pBj) return "lose";
  if (d > 21 || p > d) return "win";
  return p === d ? "push" : "lose";
}

/*
 * Стол блэкджека во дворе: BJ_SEATS мест, хозяин стола зовёт игроков из своего клана на пустые места, все играют против
 * дилера. Ставка BJ_BET.min…BJ_BET.max USD; сайды по желанию: «Идеальные пары» (две первые карты) и «21+3» (две
 * первые карты + открытая карта дилера), каждый 0…BJ_SIDE_MAX USD. Выплаты как в казино: победа 1:1, блэкджек 3:2,
 * ничья — ставка назад. Дилер добирает до 17 и стоит на мягких 17. Сплит — две карты одного достоинства (до 4 рук,
 * тузы получают по одной карте), удвоение — на двух картах. Бесплатная ставка (BJ_FREE в день) — 1 USD за счёт
 * заведения: выигрыш платится, проигрыш ничего не стоит; её нельзя удвоить или разбить.
 */
export const BJ_SEATS = 6;
export const BJ_BET = { min: 1, max: 25 };
export const BJ_SIDE_MAX = 10;
export const BJ_FREE = { perDay: 3, bet: 1 };
export const BJ_MAX_HANDS = 4;
/** time for a move; time for the others to bet once the first bet is on the table */
export const BJ_TURN_MS = 30_000;
export const BJ_BET_MS = 25_000;
/** what one stake returns for each outcome (the stake included) */
export const BJ_RETURN: Record<BjOutcome, number> = { blackjack: 2.5, win: 2, push: 1, lose: 0 };

export const cardValue = (c: Card) => Math.min(10, c.r);
export const canSplitCards = (cards: Card[]) => cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);

/** «Идеальные пары»: a pair in the first two cards — mixed colours 6:1, same colour 12:1, same suit 25:1 */
export type PairHit = "perfect" | "colored" | "mixed";
export const PP_PAY: Record<PairHit, number> = { mixed: 6, colored: 12, perfect: 25 };
export const PP_TITLES: Record<PairHit, string> = { mixed: "Разноцветная пара", colored: "Цветная пара", perfect: "Идеальная пара" };
const red = (c: Card) => c.s === 1 || c.s === 2;
export function perfectPairs(a: Card, b: Card): PairHit | null {
  if (a.r !== b.r) return null;
  if (a.s === b.s) return "perfect";
  return red(a) === red(b) ? "colored" : "mixed";
}

/** «21+3»: the two cards and the dealer's open card as a three-card poker hand */
export type T3Hit = "suited" | "sflush" | "trips" | "straight" | "flush";
export const T3_PAY: Record<T3Hit, number> = { flush: 5, straight: 10, trips: 30, sflush: 40, suited: 100 };
export const T3_TITLES: Record<T3Hit, string> = { flush: "Флеш", straight: "Стрит", trips: "Тройка", sflush: "Стрит-флеш", suited: "Тройка одной масти" };
export function twentyOnePlus3(a: Card, b: Card, up: Card): T3Hit | null {
  const cs3 = [a, b, up];
  const flush = cs3.every((c) => c.s === a.s);
  const trips = cs3.every((c) => c.r === a.r);
  if (trips) return flush ? "suited" : "trips";
  const rs = cs3.map((c) => c.r).sort((x, y) => x - y);
  const straight = (rs[1] === rs[0] + 1 && rs[2] === rs[1] + 1) || rs.join(",") === "1,12,13";
  if (straight && flush) return "sflush";
  if (straight) return "straight";
  return flush ? "flush" : null;
}

/* ---------------- zonk (кости, «Farkle») ---------------- */
/*
 * 6 костей. Очки: 1 = 100, 5 = 50; три одинаковых = номинал × 100 (три единицы = 1000); четыре — вдвое больше трёх,
 * пять — вчетверо, шесть — в 8 раз; стрит 1-2-3-4-5-6 = 1500; три пары = 750.
 * Партия — ZONK_ROUNDS попыток. В попытке бросаешь, откладываешь очковые кости и решаешь: бросить оставшиеся или
 * записать очки попытки в общий счёт. Бросок без очков — «Зонк»: очки этой попытки сгорают, попытка потрачена.
 * Отложены все 6 — бросаешь все шесть заново. После последней попытки общий счёт даёт награду (zonkPrize).
 */
export const ZONK_DICE = 6;
export const ZONK_ROUNDS = 10;

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

/**
 * Kept dice split into the combinations that score them (how the board signs them under the dice): a straight or three
 * pairs is one group of six; three or more of a face is one group; every lone 1 or 5 is its own group. A die that does
 * not score is its own group with points null. The groups add up to zonkScore when every die scores.
 */
export function zonkGroups(dice: number[]): { dice: number[]; points: number | null }[] {
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) n[d]++;
  if (dice.length === 6 && n.slice(1).every((x) => x === 1)) return [{ dice: [1, 2, 3, 4, 5, 6], points: 1500 }];
  if (dice.length === 6 && n.filter((x) => x === 2).length === 3) return [{ dice: [...dice].sort((a, b) => a - b), points: 750 }];
  const out: { dice: number[]; points: number | null }[] = [];
  for (const f of [1, 5, 2, 3, 4, 6]) {
    const c = n[f];
    if (!c) continue;
    if (c >= 3) out.push({ dice: Array(c).fill(f), points: (f === 1 ? 1000 : f * 100) * 2 ** (c - 3) });
    else for (let k = 0; k < c; k++) out.push({ dice: [f], points: f === 1 ? 100 : f === 5 ? 50 : null });
  }
  // the dice that score nothing go last
  return [...out.filter((x) => x.points !== null), ...out.filter((x) => x.points === null)];
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

/** an attempt can be written down only from this many points (less — keep rolling or risk a zonk) */
export const ZONK_BANK_MIN = 300;

/*
 * Уровни сложности зонка: за ZONK_ROUNDS попыток набери target очков. Набрал — партия сразу кончается победой: награда
 * win и winXp опыта зонка. Не набрал за все попытки или сдался — утешение fail (немного рублей) и 1 опыт.
 * 1-й уровень — вход за рубли и платит рублями (первая игра дня бесплатно); 2–4-й — вход за доллары и платят долларами.
 * Цены посчитаны так, чтобы фармить было невыгодно: при хорошей игре 4000 набирают ~3 партии из 4, 5500 — ~1 из 3,
 * 7000 — ~1 из 8, 10000 — ~1 из 70 (проверено симуляцией, tools/zonk-sim.mjs) — на круг выигрыш чуть меньше входа,
 * в плюс выходит тот, кому везёт и кто вовремя рискует.
 */
export type ZonkLevel = 1 | 2 | 3 | 4;
export interface ZonkLevelDef { level: ZonkLevel; target: number; entry: { currency: Currency; amount: number }; win: Reward; winXp: number; fail: Reward }
export const ZONK_LEVELS: ZonkLevelDef[] = [
  { level: 1, target: 4000, entry: { currency: "RUB", amount: 150 }, win: { currencies: { RUB: 170 } }, winXp: 10, fail: { currencies: { RUB: 20 } } },
  { level: 2, target: 5500, entry: { currency: "USD", amount: 3 }, win: { currencies: { USD: 7 } }, winXp: 15, fail: { currencies: { RUB: 30 } } },
  { level: 3, target: 7000, entry: { currency: "USD", amount: 5 }, win: { currencies: { USD: 30 } }, winXp: 25, fail: { currencies: { RUB: 50 } } },
  { level: 4, target: 10000, entry: { currency: "USD", amount: 10 }, win: { currencies: { USD: 400 } }, winXp: 50, fail: { currencies: { RUB: 80 } } },
];
export const zonkLevelDef = (level: number) => ZONK_LEVELS.find((l) => l.level === level);
export const ZONK_FAIL_XP = 1;
/** zonk experience: every ZONK_XP_PER_LEVEL xp is a level */
export const ZONK_XP_PER_LEVEL = 100;
export function zonkXpLevel(xp: number): { level: number; from: number; to: number } {
  const level = Math.floor(Math.max(0, xp) / ZONK_XP_PER_LEVEL);
  return { level, from: level * ZONK_XP_PER_LEVEL, to: (level + 1) * ZONK_XP_PER_LEVEL };
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
/** a spin of the upgrader: the first ones of a Moscow day are free, then each costs `price` */
export const UPGRADE_RULES = { freePerDay: 3, price: { currency: "RUB" as const, amount: 500 } };
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

/* ---------------- poker (пять карт сразу) ---------------- */
/*
 * Платная игра: POKER_RULES.price за раздачу, не больше POKER_RULES.perDay раздач в сутки (МСК). Сразу сдаётся 5 карт
 * из полной колоды, комбинация даёт награду из POKER_HANDS. Каждая раздача даёт опыт покера (xp комбинации); уровень
 * покера добавляет к денежной награде POKER_LEVEL_BONUS за уровень (до POKER_BONUS_LEVELS).
 * Шулерство: с 20 уровня покера после раздачи можно заменить карту на столе (нажать на неё — придёт новая из колоды),
 * с 50 — две замены, со 100 — три (POKER_CHEATS). Комбинация считается после замен.
 */
export const POKER_RULES = { perDay: 20, price: { currency: "USD" as const, amount: 3 } };
export type PokerHand = "royal" | "sflush" | "quads" | "full" | "flush" | "straight" | "trips" | "twopair" | "pair" | "high";
export interface PokerHandDef { id: PokerHand; name: string; xp: number; pay: Reward; sample: Card[] }
const cs = (s: string): Card[] => s.split(" ").map((t) => ({ r: RANKS.indexOf(t.slice(0, -1) as (typeof RANKS)[number]), s: "shdc".indexOf(t.slice(-1)) }));
/** from the best down; the sample is what the row in the table shows */
export const POKER_HANDS: PokerHandDef[] = [
  { id: "royal", name: "Роял-флеш", xp: 100, pay: { currencies: { USD: 3000 }, items: [{ id: "rug-pull-gun", qty: 3 }] }, sample: cs("10s Js Qs Ks As") },
  { id: "sflush", name: "Стрит-флеш", xp: 60, pay: { currencies: { USD: 1000 }, items: [{ id: "rug-pull-gun", qty: 1 }] }, sample: cs("5h 6h 7h 8h 9h") },
  { id: "quads", name: "Каре", xp: 30, pay: { currencies: { USD: 300 }, items: [{ id: "gpu", qty: 2 }] }, sample: cs("9s 9h 9d 9c Ks") },
  { id: "full", name: "Фулл-хаус", xp: 16, pay: { currencies: { USD: 90 }, items: [{ id: "energy-pack", qty: 2 }] }, sample: cs("Qh Qs Qd 7c 7h") },
  { id: "flush", name: "Флеш", xp: 12, pay: { currencies: { USD: 55 }, items: [{ id: "energy-pack", qty: 1 }] }, sample: cs("2d 6d 9d Jd Kd") },
  { id: "straight", name: "Стрит", xp: 10, pay: { currencies: { USD: 35 }, items: [{ id: "energy-drink", qty: 3 }] }, sample: cs("4c 5h 6s 7d 8c") },
  { id: "trips", name: "Тройка", xp: 6, pay: { currencies: { USD: 14 } }, sample: cs("8s 8h 8d 3c Js") },
  { id: "twopair", name: "Две пары", xp: 4, pay: { currencies: { USD: 7 } }, sample: cs("Js Jh 4d 4c Ah") },
  { id: "pair", name: "Пара", xp: 2, pay: { currencies: { USD: 2 } }, sample: cs("10h 10c 3s 7d Kc") },
  { id: "high", name: "Старшая карта", xp: 1, pay: {}, sample: cs("2s 6h 9d Jc Kh") },
];
export const pokerHandDef = (id: PokerHand) => POKER_HANDS.find((h) => h.id === id)!;

/** the best combination of five cards and which of them make it (a lone high card: just that card) */
export function pokerHand(cards: Card[]): { hand: PokerHand; used: number[] } {
  const hi = (r: number) => (r === 1 ? 14 : r);
  const all = cards.map((_, i) => i);
  const byRank = new Map<number, number[]>();
  cards.forEach((c, i) => byRank.set(c.r, [...(byRank.get(c.r) ?? []), i]));
  const groups = [...byRank.values()].sort((a, b) => b.length - a.length);
  const flush = cards.length === 5 && cards.every((c) => c.s === cards[0].s);
  const ranks = [...new Set(cards.map((c) => hi(c.r)))].sort((a, b) => a - b);
  const wheel = ranks.join(",") === "2,3,4,5,14";
  const straight = cards.length === 5 && ranks.length === 5 && (ranks[4] - ranks[0] === 4 || wheel);
  if (straight && flush) return { hand: ranks[0] === 10 ? "royal" : "sflush", used: all };
  if (groups[0].length === 4) return { hand: "quads", used: groups[0] };
  if (groups[0].length === 3 && groups[1]?.length === 2) return { hand: "full", used: all };
  if (flush) return { hand: "flush", used: all };
  if (straight) return { hand: "straight", used: all };
  if (groups[0].length === 3) return { hand: "trips", used: groups[0] };
  if (groups[0].length === 2 && groups[1]?.length === 2) return { hand: "twopair", used: [...groups[0], ...groups[1]].sort((a, b) => a - b) };
  if (groups[0].length === 2) return { hand: "pair", used: groups[0] };
  const top = cards.reduce((b, c, i) => (hi(c.r) > hi(cards[b].r) ? i : b), 0);
  return { hand: "high", used: [top] };
}

/* poker experience: level L needs POKER_XP_STEP × L + L × (L − 1) / 2 xp in total (level 20 ≈ 390, 50 ≈ 1725, 100 ≈ 5950) */
export const POKER_XP_STEP = 10;
export const POKER_MAX_LEVEL = 100;
/** the money bonus grows with the level up to this one */
export const POKER_BONUS_LEVELS = 20;
export const POKER_LEVEL_BONUS = 0.015;
export const pokerXpFor = (level: number) => POKER_XP_STEP * level + (level * (level - 1)) / 2;
/** card swaps after the deal, by poker level (the best that fits) */
export const POKER_CHEATS = [{ level: 100, swaps: 3 }, { level: 50, swaps: 2 }, { level: 20, swaps: 1 }] as const;
export const pokerCheats = (level: number) => POKER_CHEATS.find((c) => level >= c.level)?.swaps ?? 0;
export function pokerLevel(xp: number): { level: number; from: number; to: number | null } {
  let level = 0;
  while (level < POKER_MAX_LEVEL && xp >= pokerXpFor(level + 1)) level++;
  return { level, from: pokerXpFor(level), to: level >= POKER_MAX_LEVEL ? null : pokerXpFor(level + 1) };
}
/** a combination's prize at a poker level: the money grows by POKER_LEVEL_BONUS per level, the items stay */
export function pokerPay(hand: PokerHand, level: number): Reward {
  const base = pokerHandDef(hand).pay;
  if (!base.currencies) return base;
  const k = 1 + POKER_LEVEL_BONUS * Math.min(level, POKER_BONUS_LEVELS);
  const currencies = Object.fromEntries(Object.entries(base.currencies).map(([c, v]) => [c, Math.round((v ?? 0) * k * 100) / 100]));
  return { ...base, currencies };
}
