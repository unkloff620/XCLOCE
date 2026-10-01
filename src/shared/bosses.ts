import type { Accessory, Creature } from "./art.ts";
import { bossMarketCap, bossRewardRate, bossRewardXp, BOSS_TOOL_DROPS } from "./economy.ts";

export type BossEnv =
  | "swamp" | "redchart" | "dojo" | "jungle" | "moon" | "storm"
  | "city" | "ocean" | "rug" | "office" | "gas" | "throne";

export interface BossDesign {
  slug: string;
  name: string;
  title: string;
  description: string;
  creature: Creature;
  skin: string;
  mood: "smug" | "happy" | "sad" | "angry";
  accessories: Accessory[];
  env: BossEnv;
}

/** 12 hand-designed bosses. After #12 the cycle repeats as harder "remixes" (II, III, …). */
export const BOSS_DESIGNS: BossDesign[] = [
  { slug: "pond-prophet", name: "Pond Prophet", title: "Пророк из болота", description: "Сидит на листе кувшинки и знает, когда пампить. Почти всегда ошибается.", creature: "frog", skin: "#5fbf4a", mood: "smug", accessories: ["none"], env: "swamp" },
  { slug: "bagholder-hammy", name: "Bagholder Hammy", title: "Держатель мешков", description: "Купил на хаях, держит до последнего. Щёки набиты токенами, которые уже ничего не стоят.", creature: "hamster", skin: "#e8b27f", mood: "sad", accessories: ["headband"], env: "redchart" },
  { slug: "shiba-shogun", name: "Shiba Shogun", title: "Сёгун мемкоинов", description: "Командует армией сиба-холдеров. Меч из чистого хайпа.", creature: "dog", skin: "#e3a857", mood: "angry", accessories: ["headband"], env: "dojo" },
  { slug: "banana-bandit", name: "Banana Bandit", title: "Банановый кот-налётчик", description: "Ворует ликвидность прямо из пулов. Пахнет бананами.", creature: "cat", skin: "#f4d27a", mood: "smug", accessories: ["shades"], env: "jungle" },
  { slug: "moon-ape", name: "Moon Ape", title: "Обезьяна на Луне", description: "Обещал всем луну. Улетел туда один.", creature: "ape", skin: "#7a5236", mood: "happy", accessories: ["shades", "chain"], env: "moon" },
  { slug: "bear-baron", name: "Bear Market Baron", title: "Барон медвежьего рынка", description: "Каждый его рёв минус десять процентов к портфелю.", creature: "bear", skin: "#8b5a3c", mood: "angry", accessories: ["crown"], env: "storm" },
  { slug: "laser-pigeon", name: "Laser Pigeon", title: "Голубь с лазерами", description: "Гадит красными свечами на весь город.", creature: "pigeon", skin: "#8f9bb3", mood: "angry", accessories: ["laser"], env: "city" },
  { slug: "troll-whale", name: "Troll Whale", title: "Кит-тролль", description: "Одна его сделка двигает весь рынок. Смеётся над твоим стопом.", creature: "fish", skin: "#46a8e0", mood: "smug", accessories: ["crown"], env: "ocean" },
  { slug: "rug-wizard", name: "Rug Wizard", title: "Ковровый маг", description: "Вытягивает ковры из-под ног инвесторов силой мысли.", creature: "alien", skin: "#b48cf2", mood: "smug", accessories: ["halo"], env: "rug" },
  { slug: "hamster-ceo", name: "Hamster CEO", title: "Хомяк-гендиректор", description: "Раздаёт обещания вместо дивидендов. Золотая цепь куплена на твои деньги.", creature: "hamster", skin: "#d79c66", mood: "smug", accessories: ["chain", "shades"], env: "office" },
  { slug: "gas-goblin", name: "Gas Fee Goblin", title: "Гоблин комиссий", description: "Берёт свою долю с каждой транзакции. И с этой тоже.", creature: "alien", skin: "#8be36a", mood: "angry", accessories: ["cap"], env: "gas" },
  { slug: "meme-king", name: "MEME KING", title: "Король мемов", description: "Правит всеми чартами. Собрал мемы со всего интернета в одну корону.", creature: "duck", skin: "#ffd23f", mood: "smug", accessories: ["crown", "chain", "laser"], env: "throne" },
];

const ROMAN = ["", "", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"];

export interface BossInfo {
  index: number;
  name: string;
  title: string;
  description: string;
  image: string;
  hueShift: number;
  marketCap: number;
  rewardUsdFull: number;
  rewardRate: number;
  rewardXp: number;
  dropToolId: string | null;
  env: BossEnv;
}

export function bossInfo(index: number): BossInfo {
  const d = BOSS_DESIGNS[(index - 1) % BOSS_DESIGNS.length];
  const cycle = Math.floor((index - 1) / BOSS_DESIGNS.length) + 1;
  const mcap = bossMarketCap(index);
  return {
    index,
    name: d.name + (ROMAN[cycle] ?? ` ${cycle}`),
    title: d.title,
    description: d.description,
    image: `/assets/bosses/${String(((index - 1) % BOSS_DESIGNS.length) + 1).padStart(2, "0")}-${d.slug}.svg`,
    hueShift: (cycle - 1) * 55,
    marketCap: mcap,
    rewardRate: bossRewardRate(index),
    rewardUsdFull: Math.round(mcap * bossRewardRate(index) * 100) / 100,
    rewardXp: bossRewardXp(index),
    dropToolId: BOSS_TOOL_DROPS[index] ?? null,
    env: d.env,
  };
}
