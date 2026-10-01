import type { Currency, Price } from "./economy.ts";

// ---------------- Bosses ----------------
export interface BossDef {
  index: number;
  slug: string;
  name: string;
  title: string;
  hp: number;
  reward: Price;
  xp: number;
  /** permanent power gained per victory */
  power: number;
  /** chance to drop a chest per win */
  chestChance: number;
  /** guaranteed one-time drop on the first victory */
  firstWinItem?: string;
  top: string;
  bottom: string;
  env: string;
}

export const BOSSES: BossDef[] = [
  { index: 1, slug: "bagholder", name: "BAGHOLDER", title: "Купил на хаях", hp: 900, reward: { currency: "RUB", amount: 900 }, xp: 30, power: 3, chestChance: 0.05, top: "BOUGHT THE TOP", bottom: "STILL HOLDING", env: "redchart" },
  { index: 2, slug: "copium-hamster", name: "COPIUM HAMSTER", title: "Дышит копиумом", hp: 2_000, reward: { currency: "RUB", amount: 2_000 }, xp: 55, power: 6, chestChance: 0.06, firstWinItem: "h-cap", top: "IT WILL BOUNCE", bottom: "TRUST ME BRO", env: "storm" },
  { index: 3, slug: "wen-lambo", name: "WEN LAMBO", title: "Пёс в игрушечной ламбе", hp: 3_800, reward: { currency: "USD", amount: 12 }, xp: 85, power: 9, chestChance: 0.07, top: "WEN LAMBO?", bottom: "SER PLS", env: "city" },
  { index: 4, slug: "paper-cat", name: "PAPER HANDS CAT", title: "Бумажные лапки", hp: 6_500, reward: { currency: "USD", amount: 22 }, xp: 120, power: 12, chestChance: 0.08, firstWinItem: "g-neon", top: "SOLD AT -2%", bottom: "IT PUMPED +400%", env: "jungle" },
  { index: 5, slug: "laser-ape", name: "LASER APE", title: "Обезьяна с лазерами", hp: 10_000, reward: { currency: "USD", amount: 40 }, xp: 160, power: 15, chestChance: 0.09, top: "100K BY NEW YEAR", bottom: "(WHICH YEAR?)", env: "moon" },
  { index: 6, slug: "bear-baron", name: "BEAR BARON", title: "Барон медвежьего рынка", hp: 14_500, reward: { currency: "SOL", amount: 0.4 }, xp: 210, power: 18, chestChance: 0.1, firstWinItem: "w-ban-hammer", top: "JUST A CORRECTION", bottom: "-90%", env: "storm" },
  { index: 7, slug: "rug-wizard", name: "RUG WIZARD", title: "Ковровый маг", hp: 19_000, reward: { currency: "SOL", amount: 0.7 }, xp: 270, power: 21, chestChance: 0.11, top: "TRUST THE DEV", bottom: "DEV LEFT THE CHAT", env: "rug" },
  { index: 8, slug: "gas-goblin", name: "GAS GOBLIN", title: "Гоблин комиссий", hp: 28_000, reward: { currency: "SOL", amount: 1.1 }, xp: 340, power: 24, chestChance: 0.12, top: "SWAP $5", bottom: "FEE: $80", env: "gas" },
  { index: 9, slug: "troll-whale", name: "TROLL WHALE", title: "Кит-тролль", hp: 40_000, reward: { currency: "BTC", amount: 0.004 }, xp: 420, power: 27, chestChance: 0.14, top: "MOVED 1 COIN", bottom: "MARKET: -20%", env: "ocean" },
  { index: 10, slug: "meme-king", name: "MEME KING", title: "Король мемов", hp: 55_000, reward: { currency: "BTC", amount: 0.008 }, xp: 520, power: 30, chestChance: 0.16, firstWinItem: "w-diamond-fist", top: "BOW TO THE KING", bottom: "OF ALL MEMES", env: "throne" },
];
export function bossByIndex(i: number) {
  return BOSSES.find((b) => b.index === i);
}
export function bossImage(b: Pick<BossDef, "index" | "slug">) {
  return `/assets/bosses/${String(b.index).padStart(2, "0")}-${b.slug}.svg`;
}
/** Losing a battle still gives a little XP. */
export const LOSS_XP_SHARE = 0.25;

// ---------------- Market tasks (spend energy) ----------------
export interface TaskDef {
  id: string;
  title: string;
  description: string;
  energy: number;
  unlockLevel: number;
  reward: Price;
  xp: number;
  power: number;
  /** chance of a bonus drop and which item */
  drop?: { item: string; chance: number };
  icon: string;
}
export const TASKS: TaskDef[] = [
  { id: "t-chat", title: "Пост в крипто-чате", description: "Напиши «gm» и пару ракет. Классика.", energy: 5, unlockLevel: 1, reward: { currency: "RUB", amount: 350 }, xp: 5, power: 1, drop: { item: "x-energy", chance: 0.06 }, icon: "chat" },
  { id: "t-shill", title: "Шиллинг мемкоина", description: "Убеди трёх знакомых, что это следующий ×100.", energy: 10, unlockLevel: 1, reward: { currency: "RUB", amount: 800 }, xp: 10, power: 1, icon: "megaphone" },
  { id: "t-scalp", title: "Скальпинг", description: "Зашёл, вышел, плюс доллар. Повторить.", energy: 15, unlockLevel: 2, reward: { currency: "USD", amount: 9 }, xp: 15, power: 2, icon: "chart" },
  { id: "t-meme", title: "Нарисовать мем", description: "Вирусный мем поднимает хайп и тебя вместе с ним.", energy: 20, unlockLevel: 3, reward: { currency: "USD", amount: 14 }, xp: 22, power: 3, drop: { item: "x-chest", chance: 0.05 }, icon: "brush" },
  { id: "t-arb", title: "Арбитраж между биржами", description: "Купил дешевле, продал дороже. Пока никто не заметил.", energy: 25, unlockLevel: 5, reward: { currency: "SOL", amount: 0.12 }, xp: 30, power: 3, icon: "swap" },
  { id: "t-airdrop", title: "Фарм аирдропа", description: "Сотня кликов в тестнете. Вдруг повезёт.", energy: 30, unlockLevel: 7, reward: { currency: "SOL", amount: 0.18 }, xp: 38, power: 4, drop: { item: "x-chest", chance: 0.15 }, icon: "gift" },
  { id: "t-mining", title: "Майнинг на ферме", description: "Видеокарты гудят, счёт за свет растёт.", energy: 40, unlockLevel: 10, reward: { currency: "BTC", amount: 0.0012 }, xp: 50, power: 5, icon: "chip" },
  { id: "t-whale", title: "Охота на китов", description: "Следи за кошельками китов и заходи раньше них.", energy: 50, unlockLevel: 14, reward: { currency: "BTC", amount: 0.002 }, xp: 65, power: 6, drop: { item: "x-mega-energy", chance: 0.1 }, icon: "whale" },
];
export function taskById(id: string) {
  return TASKS.find((t) => t.id === id);
}

// ---------------- Chest loot ----------------
export const CHEST_LOOT: { weight: number; reward?: Price; item?: string }[] = [
  { weight: 30, reward: { currency: "RUB", amount: 5_000 } },
  { weight: 25, reward: { currency: "USD", amount: 25 } },
  { weight: 12, reward: { currency: "SOL", amount: 0.2 } },
  { weight: 15, item: "x-energy" },
  { weight: 6, item: "x-mega-energy" },
  { weight: 4, item: "g-shades" },
  { weight: 4, item: "c-silver" },
  { weight: 2, item: "w-dump-hammer" },
  { weight: 1.5, item: "c-gold" },
  { weight: 0.5, item: "g-laser" },
];

// ---------------- Daily login reward ----------------
export const DAILY_COOLDOWN_MS = 20 * 3_600_000;
export const DAILY_STREAK_RESET_MS = 48 * 3_600_000;
export interface DailyReward { reward?: Price; item?: string; label: string }
export const DAILY_REWARDS: DailyReward[] = [
  { reward: { currency: "RUB", amount: 2_000 }, label: "2 000 ₽" },
  { item: "x-energy", label: "Энергетик" },
  { reward: { currency: "USD", amount: 15 }, label: "$15" },
  { reward: { currency: "RUB", amount: 6_000 }, label: "6 000 ₽" },
  { item: "x-chest", label: "Сундук" },
  { reward: { currency: "SOL", amount: 0.2 }, label: "0.2 SOL" },
  { item: "x-mega-energy", label: "Мега-энергетик" },
];

// ---------------- Daily missions ----------------
export type Metric = "tasks" | "energy" | "fights" | "wins" | "shop" | "login";
export interface MissionDef { id: string; title: string; metric: Metric; target: number; reward: Price; xp: number; power: number }
export const MISSIONS: MissionDef[] = [
  { id: "m-login", title: "Зайти в игру", metric: "login", target: 1, reward: { currency: "RUB", amount: 500 }, xp: 10, power: 1 },
  { id: "m-tasks5", title: "Выполни 5 заданий на Market", metric: "tasks", target: 5, reward: { currency: "RUB", amount: 1_500 }, xp: 25, power: 2 },
  { id: "m-energy100", title: "Потрать 100 энергии", metric: "energy", target: 100, reward: { currency: "USD", amount: 8 }, xp: 30, power: 2 },
  { id: "m-fight3", title: "Нападай на боссов 3 раза", metric: "fights", target: 3, reward: { currency: "USD", amount: 6 }, xp: 25, power: 2 },
  { id: "m-win5", title: "Победи боссов 5 раз", metric: "wins", target: 5, reward: { currency: "USD", amount: 15 }, xp: 40, power: 4 },
  { id: "m-shop", title: "Купи что-нибудь в магазине", metric: "shop", target: 1, reward: { currency: "RUB", amount: 1_000 }, xp: 15, power: 1 },
];
export function missionById(id: string) {
  return MISSIONS.find((m) => m.id === id);
}

// ---------------- Events (always-on live ops, shown in the Events panel) ----------------
export interface EventDef { id: string; title: string; description: string; kind: "weekend" | "info" }
export const EVENTS: EventDef[] = [
  { id: "e-weekend", title: "Weekend Pump ×2", description: "По субботам и воскресеньям (UTC) награды за задания Market удваиваются.", kind: "weekend" },
  { id: "e-keys", title: "Охота за ключами", description: "Каждая победа над боссом даёт его ключ. 3 ключа открывают следующего босса.", kind: "info" },
];
export function isWeekend(t: number): boolean {
  const d = new Date(t).getUTCDay();
  return d === 0 || d === 6;
}

// ---------------- Clans ----------------
export const CLAN_CREATE_PRICE: Price = { currency: "RUB", amount: 10_000 };
export const CLAN_MAX_MEMBERS = 30;

export type { Currency };
