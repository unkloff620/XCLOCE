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
  { index: 1, slug: "chill-guy", name: "Chill Guy", title: "Ему пофиг на графики", hp: 900, reward: { currency: "RUB", amount: 900 }, xp: 30, power: 3, chestChance: 0.05, top: "BOUGHT THE TOP", bottom: "STILL HOLDING", env: "redchart" },
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
/** XP for a single hit, as a share of the boss kill XP. */
export const HIT_XP_SHARE = 0.05;

// ---------------- Market: locations with tasks (spend energy) ----------------
export interface LocationTask {
  id: string;
  title: string;
  /** energy per step */
  energy: number;
  /** steps to complete the task (progress N/target) */
  target: number;
  /** reward for every step */
  reward: Price;
  xp: number;
  /** power for completing the whole task */
  power: number;
}
export interface LocationDef {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  emoji: string;
  bg: string;
  tasks: LocationTask[];
  /** reward for completing all tasks of the location */
  reward: { price: Price; items: string[]; xp: number; power: number };
}
const T = (id: string, title: string, energy: number, target: number, reward: Price, xp: number, power: number): LocationTask => ({ id, title, energy, target, reward, xp, power });
export const LOCATIONS: LocationDef[] = [
  {
    id: "loc-basement", index: 1, name: "Мамкин подвал", subtitle: "Здесь начинается путь каждого дегена", emoji: "🏚️", bg: "linear-gradient(135deg,#3b2a1e,#1a120c)",
    tasks: [
      T("b-monitor", "Протереть монитор от чипсов", 5, 5, { currency: "RUB", amount: 120 }, 3, 1),
      T("b-wallet", "Завести первый кошелёк", 5, 6, { currency: "RUB", amount: 150 }, 3, 1),
      T("b-gm", "Написать «gm» в 10 чатов", 5, 10, { currency: "RUB", amount: 150 }, 3, 1),
      T("b-videos", "Посмотреть видео «как стать миллионером»", 10, 6, { currency: "RUB", amount: 300 }, 5, 2),
      T("b-first-coin", "Купить первый мемкоин", 10, 5, { currency: "RUB", amount: 400 }, 6, 2),
    ],
    reward: { price: { currency: "RUB", amount: 5_000 }, items: ["x-chest"], xp: 80, power: 5 },
  },
  {
    id: "loc-chat", index: 2, name: "Крипто-чат", subtitle: "Шиллинг, FUD и бесконечные ракеты", emoji: "💬", bg: "linear-gradient(135deg,#1e3a5f,#0d1a2b)",
    tasks: [
      T("c-shill", "Шиллить мемкоин", 10, 8, { currency: "RUB", amount: 450 }, 6, 2),
      T("c-fud", "Разоблачить FUD", 10, 8, { currency: "RUB", amount: 500 }, 6, 2),
      T("c-memes", "Запостить 20 мемов", 10, 10, { currency: "RUB", amount: 400 }, 6, 2),
      T("c-ama", "Провести AMA с котом", 15, 6, { currency: "USD", amount: 4 }, 10, 3),
      T("c-mod", "Забанить скамеров", 15, 6, { currency: "USD", amount: 5 }, 10, 3),
    ],
    reward: { price: { currency: "USD", amount: 40 }, items: ["x-energy", "x-chest"], xp: 150, power: 8 },
  },
  {
    id: "loc-exchange", index: 3, name: "Офис биржи", subtitle: "Графики, свечи и кофе литрами", emoji: "🏦", bg: "linear-gradient(135deg,#123d2c,#081a12)",
    tasks: [
      T("e-scalp", "Скальпинг на минутках", 15, 8, { currency: "USD", amount: 5 }, 10, 3),
      T("e-short", "Зашортить хомяков", 15, 8, { currency: "USD", amount: 6 }, 10, 3),
      T("e-arb", "Арбитраж между биржами", 20, 6, { currency: "USD", amount: 9 }, 14, 4),
      T("e-listing", "Пролоббировать листинг", 20, 6, { currency: "SOL", amount: 0.05 }, 14, 4),
      T("e-margin", "Пережить маржин-колл", 25, 5, { currency: "SOL", amount: 0.07 }, 18, 5),
    ],
    reward: { price: { currency: "SOL", amount: 1 }, items: ["x-mega-energy", "x-chest"], xp: 260, power: 12 },
  },
  {
    id: "loc-farm", index: 4, name: "Майнинг-ферма", subtitle: "Гул видеокарт и счёт за свет", emoji: "⛏️", bg: "linear-gradient(135deg,#4a2a0a,#1c0f03)",
    tasks: [
      T("f-cards", "Собрать риг из видеокарт", 20, 6, { currency: "SOL", amount: 0.06 }, 16, 4),
      T("f-cool", "Починить охлаждение", 20, 6, { currency: "SOL", amount: 0.06 }, 16, 4),
      T("f-power", "Договориться с электриком", 25, 5, { currency: "SOL", amount: 0.08 }, 20, 5),
      T("f-pool", "Подключиться к пулу", 25, 5, { currency: "BTC", amount: 0.0006 }, 20, 5),
      T("f-halving", "Пережить халвинг", 30, 5, { currency: "BTC", amount: 0.0008 }, 25, 6),
    ],
    reward: { price: { currency: "BTC", amount: 0.008 }, items: ["x-mega-energy", "x-chest", "x-chest"], xp: 400, power: 18 },
  },
  {
    id: "loc-moon", index: 5, name: "Луна", subtitle: "To the moon — буквально", emoji: "🌕", bg: "linear-gradient(135deg,#2c2152,#0e0a1f)",
    tasks: [
      T("m-rocket", "Заправить ракету хайпом", 30, 5, { currency: "BTC", amount: 0.0008 }, 25, 6),
      T("m-lambo", "Припарковать ламбу в кратере", 30, 5, { currency: "BTC", amount: 0.0009 }, 25, 6),
      T("m-flag", "Воткнуть флаг $DOGE", 35, 4, { currency: "BTC", amount: 0.0012 }, 30, 7),
      T("m-aliens", "Продать NFT пришельцам", 35, 4, { currency: "BTC", amount: 0.0012 }, 30, 7),
      T("m-whales", "Отбиться от лунных китов", 40, 4, { currency: "BTC", amount: 0.0015 }, 35, 8),
    ],
    reward: { price: { currency: "BTC", amount: 0.02 }, items: ["x-mega-energy", "x-chest", "x-chest", "x-chest"], xp: 700, power: 30 },
  },
];
export function locationById(id: string) {
  return LOCATIONS.find((l) => l.id === id);
}
export function locationTask(taskId: string) {
  for (const loc of LOCATIONS) {
    const t = loc.tasks.find((x) => x.id === taskId);
    if (t) return { loc, task: t };
  }
  return null;
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
  { id: "m-tasks5", title: "Сделай 5 шагов заданий на Market", metric: "tasks", target: 5, reward: { currency: "RUB", amount: 1_500 }, xp: 25, power: 2 },
  { id: "m-energy100", title: "Потрать 100 энергии", metric: "energy", target: 100, reward: { currency: "USD", amount: 8 }, xp: 30, power: 2 },
  { id: "m-fight3", title: "Нанеси 3 удара боссам", metric: "fights", target: 3, reward: { currency: "USD", amount: 6 }, xp: 25, power: 2 },
  { id: "m-win1", title: "Победи босса", metric: "wins", target: 1, reward: { currency: "USD", amount: 15 }, xp: 40, power: 4 },
  { id: "m-shop", title: "Купи что-нибудь в магазине", metric: "shop", target: 1, reward: { currency: "RUB", amount: 1_000 }, xp: 15, power: 1 },
];
export function missionById(id: string) {
  return MISSIONS.find((m) => m.id === id);
}

// ---------------- Events (always-on live ops, shown in the Events panel) ----------------
export interface EventDef { id: string; title: string; description: string; kind: "weekend" | "info" }
export const EVENTS: EventDef[] = [
  { id: "e-weekend", title: "Weekend Pump ×2", description: "По субботам и воскресеньям (UTC) награды за шаги заданий Market удваиваются.", kind: "weekend" },
  { id: "e-keys", title: "Охота за ключами", description: "Урон всех игроков общий: каждый удар любого игрока бьёт и твоего босса. Победа даёт ключ, 3 ключа открывают следующего босса.", kind: "info" },
];
export function isWeekend(t: number): boolean {
  const d = new Date(t).getUTCDay();
  return d === 0 || d === 6;
}

// ---------------- Clans ----------------
export const CLAN_CREATE_PRICE: Price = { currency: "RUB", amount: 10_000 };
export const CLAN_MAX_MEMBERS = 30;

export type { Currency };
