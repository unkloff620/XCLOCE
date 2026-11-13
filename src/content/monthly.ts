import type { Reward } from "./rewards.ts";

/*
 * «От звонка до звонка»: a «делюга» a day, the same for every player. Day N of the month (Moscow) has the N-th task of
 * MONTHLY_TASKS (a month of 28–31 days uses the first 28–31). Done that day → the day is closed. A day that passed
 * unclosed can be bought out for MONTHLY_SKIP_PRICE SOL. Closed days open the rewards: 2, 5, 10, 20 and the chest
 * for every day of the month.
 */

/** what the server counts (server/systems/monthly.ts monthTick) */
export type MonthKind =
  | "hits" | "damage" | "kill" | "yard" | "steps" | "energy" | "stash" | "craft"
  | "poker" | "zonk" | "roach" | "bj" | "bj_win" | "slots" | "upgrader" | "buy"
  | "spit" | "pump" | "fight" | "social";

export interface MonthTask {
  kind: MonthKind;
  target: number;
  title: string;
  href?: string;
  hint?: string;
  /** «kill»: this boss only (none: any boss) */
  boss?: string;
  /** «kill»: in this mode only */
  mode?: "pacan" | "blat" | "avtor";
}

const kill = (boss: string | undefined, title: string, mode?: MonthTask["mode"]): MonthTask =>
  ({ kind: "kill", target: 1, title, href: "/bosses", boss, mode, hint: "Засчитывается любая победа, где ты в бою" });

/** day 1 … day 31 */
export const MONTHLY_TASKS: MonthTask[] = [
  { kind: "hits", target: 20, title: "Ударь босса 20 раз", href: "/bosses" },
  { kind: "yard", target: 5, title: "Подбери 5 вещей во дворе", href: "/yard" },
  { kind: "spit", target: 3, title: "Харкни в 3 игроков", href: "/rating", hint: "Рейтинг → профиль игрока" },
  kill("datsik", "Убей Дацкоу"),
  { kind: "steps", target: 5, title: "Выполни 5 шагов заданий в локациях", href: "/locations" },
  { kind: "poker", target: 5, title: "Сыграй 5 раздач в покер", href: "/yard", hint: "Стол во дворе → Покер" },
  { kind: "pump", target: 5, title: "Накачай бицуху 5 игрокам", href: "/rating", hint: "Рейтинг → профиль игрока" },
  kill("kedr", "Убей Кедра"),
  { kind: "energy", target: 100, title: "Потрать 100 энергии", href: "/locations" },
  { kind: "roach", target: 2, title: "Прихлопни 2 таракана в зонке", href: "/yard", hint: "Он бегает по раме доски" },
  { kind: "fight", target: 5, title: "Наедь на 5 игроков", href: "/rating", hint: "Рейтинг → профиль игрока" },
  kill("mugo", "Убей Мугонатора"),
  { kind: "craft", target: 1, title: "Скрафти любой предмет", href: "/craft", hint: "Крафт: собери вещь из деталей" },
  { kind: "bj_win", target: 1, title: "Выиграй раунд в блэкджек", href: "/yard", hint: "Стол во дворе → Блэкджек" },
  { kind: "stash", target: 1, title: "Найди нычку", href: "/locations", hint: "Нычки находятся в заданиях локаций" },
  kill("garkusha", "Убей Гаркушу в «Блатном»", "blat"),
  { kind: "slots", target: 10, title: "Крутани однорукого бандита 10 раз", href: "/yard" },
  { kind: "damage", target: 5_000, title: "Нанеси 5 000 урона боссам", href: "/bosses" },
  kill("bebyakyan", "Убей Командате"),
  { kind: "spit", target: 10, title: "Харкни в 10 игроков", href: "/rating", hint: "Рейтинг → профиль игрока" },
  { kind: "buy", target: 1, title: "Купи что-нибудь в магазине", href: "/shop" },
  kill("babafey", "Убей Бабафея в «Пацанском»", "pacan"),
  { kind: "yard", target: 15, title: "Подбери 15 вещей во дворе", href: "/yard" },
  { kind: "upgrader", target: 3, title: "Крутани апгрейдер 3 раза", href: "/yard", hint: "Автомат «Апгрейдер» во дворе" },
  kill("vodovoz", "Убей Востока"),
  { kind: "zonk", target: 3, title: "Доиграй 3 партии в зонк", href: "/yard", hint: "Стол во дворе → Зонк" },
  kill("knyaz", "Убей Князя"),
  { kind: "damage", target: 20_000, title: "Нанеси 20 000 урона боссам", href: "/bosses" },
  kill("vadim", "Убей Вадима"),
  kill(undefined, "Убей любого босса в «Авторитетном»", "avtor"),
  { kind: "social", target: 15, title: "Наедь, харкни или накачай бицуху 15 раз", href: "/rating", hint: "Рейтинг → профиль игрока" },
];

/** the task of day `d` (1-based) */
export const monthTaskOf = (d: number): MonthTask | undefined => MONTHLY_TASKS[d - 1];

/** a past day not closed: bought out for this (SOL) */
export const MONTHLY_SKIP_PRICE = 1;

/** the tattoo set of the chest (content/tattoos.ts, 21 pieces, one at random): null until the set is drawn */
export const MONTHLY_TATTOO_SET: string | null = null;

/** the chest for every day of the month: each line a random amount from..to */
export const MONTHLY_CHEST = {
  USD: [200, 410], cases: [4, 7], RUB: [30_000, 100_000], xp: [50_000, 123_560], rugPull: [59, 83], SOL: [3, 5], parts: [30, 60], stashes: [24, 41],
} as const satisfies Record<string, readonly [number, number]>;

/** a case = one opening of «Ящик ништяков» (the achievement points it costs, content/ach-box.ts ACH_BOX_COST) */
export const CASE_POINTS = 5;

export interface MonthTier { id: string; need: number | "all"; reward: Reward; chest?: true }
export const MONTHLY_TIERS: MonthTier[] = [
  { id: "t2", need: 2, reward: { currencies: { USD: 30 } } },
  { id: "t5", need: 5, reward: { items: [{ id: "energy-full", qty: 2 }] } },
  { id: "t10", need: 10, reward: { items: [{ id: "gpu", qty: 40 }] } },
  { id: "t20", need: 20, reward: { achPoints: 4 * CASE_POINTS } },
  { id: "all", need: "all", reward: {}, chest: true },
];
/** days to close for a tier in a month of `days` days */
export const tierNeed = (t: MonthTier, days: number) => (t.need === "all" ? days : Math.min(t.need, days));

/** "2026-11" and its length in days */
export const monthKey = (day: string) => day.slice(0, 7);
export const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
