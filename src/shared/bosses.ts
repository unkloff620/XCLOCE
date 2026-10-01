import { bossMarketCap, bossRewardRate, bossRewardXp, BOSS_TOOL_DROPS } from "./economy.ts";

export type BossEnv =
  | "swamp" | "redchart" | "dojo" | "jungle" | "moon" | "storm"
  | "city" | "ocean" | "rug" | "office" | "gas" | "throne";

export interface BossDesign {
  slug: string;
  name: string;
  title: string;
  description: string;
  /** meme-macro captions drawn on the boss art */
  top: string;
  bottom: string;
  env: BossEnv;
}

/**
 * 12 original meme bosses (crypto-meme archetypes, not copies of existing meme characters).
 * After #12 the cycle repeats as harder "remixes" (II, III, …) with a hue shift.
 */
export const BOSS_DESIGNS: BossDesign[] = [
  { slug: "bagholder", name: "BAGHOLDER", title: "Купил на хаях", description: "Купил на самом пике и держит до последнего. Мешки тяжелеют с каждой свечой.", top: "BOUGHT THE TOP", bottom: "STILL HOLDING", env: "redchart" },
  { slug: "copium-hamster", name: "COPIUM HAMSTER", title: "Дышит копиумом", description: "Сидит на копиуме с первого дампа. Уверен, что отскок вот-вот.", top: "IT WILL BOUNCE", bottom: "TRUST ME BRO", env: "storm" },
  { slug: "wen-lambo", name: "WEN LAMBO", title: "Пёс в игрушечной ламбе", description: "Спрашивает «когда ламба» в каждом чате. Пока ездит на пластиковой.", top: "WEN LAMBO?", bottom: "SER PLS", env: "city" },
  { slug: "paper-cat", name: "PAPER HANDS CAT", title: "Бумажные лапки", description: "Продал на −2%. Через час токен сделал ×5. Злится на весь рынок.", top: "SOLD AT -2%", bottom: "IT PUMPED +400%", env: "jungle" },
  { slug: "laser-ape", name: "LASER APE", title: "Обезьяна с лазерами", description: "Поставил лазерные глаза и обещает сотку к Новому году.", top: "100K BY NEW YEAR", bottom: "(WHICH YEAR?)", env: "moon" },
  { slug: "bear-baron", name: "BEAR BARON", title: "Барон медвежьего рынка", description: "Каждый его рёв — минус десять процентов к портфелю.", top: "JUST A CORRECTION", bottom: "-90%", env: "storm" },
  { slug: "rug-wizard", name: "RUG WIZARD", title: "Ковровый маг", description: "Одним движением вытягивает ликвидность из-под ног инвесторов.", top: "TRUST THE DEV", bottom: "DEV LEFT THE CHAT", env: "rug" },
  { slug: "gas-goblin", name: "GAS GOBLIN", title: "Гоблин комиссий", description: "Берёт свою долю с каждой транзакции. И с этой тоже.", top: "SWAP $5", bottom: "FEE: $80", env: "gas" },
  { slug: "chart-astrologer", name: "CHART ASTROLOGER", title: "Астролог графиков", description: "Рисует линии на графике и сверяет их со звёздами.", top: "MERCURY RETROGRADE", bottom: "= BEARISH", env: "moon" },
  { slug: "troll-whale", name: "TROLL WHALE", title: "Кит-тролль", description: "Двигает рынок одним плавником и смеётся над твоим стопом.", top: "MOVED 1 COIN", bottom: "MARKET: -20%", env: "ocean" },
  { slug: "fomo-duck", name: "FOMO DUCK", title: "Утка на FOMO", description: "Заходит на самом верху, потому что «все уже купили».", top: "EVERYONE IS BUYING", bottom: "ME: ALL IN", env: "office" },
  { slug: "meme-king", name: "MEME KING", title: "Король мемов", description: "Правит всеми чартами. Собрал корону из мемов всего интернета.", top: "BOW TO THE KING", bottom: "OF ALL MEMES", env: "throne" },
];

const ROMAN = ["", "", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"];

export interface BossInfo {
  index: number;
  name: string;
  title: string;
  description: string;
  image: string;
  imageHurt: string;
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
    imageHurt: `/assets/bosses/${String(((index - 1) % BOSS_DESIGNS.length) + 1).padStart(2, "0")}-${d.slug}-hurt.svg`,
    hueShift: (cycle - 1) * 55,
    marketCap: mcap,
    rewardRate: bossRewardRate(index),
    rewardUsdFull: Math.round(mcap * bossRewardRate(index) * 100) / 100,
    rewardXp: bossRewardXp(index),
    dropToolId: BOSS_TOOL_DROPS[index] ?? null,
    env: d.env,
  };
}
