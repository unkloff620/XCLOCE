import type { TokenArt } from "./art.ts";

/** Public risk indicators (0..1, higher = riskier). Shown to players as indirect rugpull signals. */
export interface RiskInput {
  liquidity: number;
  holders: number;
  ageMs: number;
  volatility: number;
  devReputation: number; // 0..1, higher = more trusted
  whaleConcentration: number; // 0..1 share held by top wallets
}
export function riskFactors(r: RiskInput) {
  return {
    liquidity: 1 - Math.min(1, r.liquidity / 250_000),
    holders: 1 - Math.min(1, r.holders / 6_000),
    age: r.ageMs < 3_600_000 ? 1 : r.ageMs < 6 * 3_600_000 ? 0.5 : r.ageMs < 24 * 3_600_000 ? 0.2 : 0,
    volatility: Math.min(1, r.volatility / 0.05),
    dev: 1 - r.devReputation,
    whales: r.whaleConcentration,
  };
}
export function riskScore(r: RiskInput): number {
  const f = riskFactors(r);
  const s = 0.3 * f.dev + 0.25 * f.whales + 0.2 * f.liquidity + 0.1 * f.holders + 0.1 * f.age + 0.05 * f.volatility;
  return Math.max(0, Math.min(1, s));
}
export function riskLabel(score: number): { label: string; level: "low" | "mid" | "high" | "extreme" } {
  if (score < 0.3) return { label: "Низкий", level: "low" };
  if (score < 0.5) return { label: "Средний", level: "mid" };
  if (score < 0.7) return { label: "Высокий", level: "high" };
  return { label: "Экстремальный", level: "extreme" };
}

export interface TokenSeed {
  id: string;
  name: string;
  ticker: string;
  description: string;
  art: TokenArt;
  price: number;
  supply: number;
  liquidity: number;
  holders: number;
  volatility: number;
  devReputation: number;
  whaleConcentration: number;
}

/** Starting market. Risk profiles range from "blue chip meme" to "obvious rug". */
export const TOKEN_SEEDS: TokenSeed[] = [
  { id: "dking", name: "DOGE KING", ticker: "DKING", description: "Король всех собак. Корона из чистого хайпа, трон из ликвидности.", art: { creature: "dog", accessory: "crown", hue: 40, skin: "#e3a857", mood: "smug" }, price: 0.0421, supply: 1e9, liquidity: 420_000, holders: 9_200, volatility: 0.012, devReputation: 0.9, whaleConcentration: 0.18 },
  { id: "bcat", name: "BANANA CAT", ticker: "BCAT", description: "Кот в банановом костюме. Никто не знает зачем, но все покупают.", art: { creature: "cat", accessory: "none", hue: 55, skin: "#f4d27a", mood: "happy" }, price: 0.00317, supply: 4.2e9, liquidity: 180_000, holders: 5_100, volatility: 0.018, devReputation: 0.75, whaleConcentration: 0.28 },
  { id: "frog", name: "FROG LORD", ticker: "FROG", description: "Повелитель болотных пампов. Ухмыляется, даже когда падает.", art: { creature: "frog", accessory: "crown", hue: 130, skin: "#5fbf4a", mood: "smug" }, price: 0.000892, supply: 6.9e9, liquidity: 260_000, holders: 7_700, volatility: 0.015, devReputation: 0.82, whaleConcentration: 0.22 },
  { id: "mape", name: "MOON APE", ticker: "MAPE", description: "Обезьяна в солнечных очках. Цель — Луна, план — отсутствует.", art: { creature: "ape", accessory: "shades", hue: 260, skin: "#7a5236", mood: "smug" }, price: 0.0153, supply: 1e9, liquidity: 95_000, holders: 2_400, volatility: 0.022, devReputation: 0.55, whaleConcentration: 0.38 },
  { id: "lcoo", name: "LASER PIGEON", ticker: "LCOO", description: "Голубь с лазерными глазами. Смотрит только вверх.", art: { creature: "pigeon", accessory: "laser", hue: 0, skin: "#8f9bb3", mood: "angry" }, price: 0.000245, supply: 1e10, liquidity: 60_000, holders: 1_650, volatility: 0.026, devReputation: 0.45, whaleConcentration: 0.42 },
  { id: "bwhl", name: "BABY WHALE", ticker: "BWHL", description: "Маленький кит с большими амбициями. Двигает рынок одним плавником.", art: { creature: "fish", accessory: "chain", hue: 200, skin: "#46a8e0", mood: "happy" }, price: 0.0068, supply: 2e9, liquidity: 140_000, holders: 3_900, volatility: 0.016, devReputation: 0.7, whaleConcentration: 0.33 },
  { id: "sham", name: "SAD HAMSTER", ticker: "SHAM", description: "Грустный хомяк, который всё продал на дне. Токен его памяти.", art: { creature: "hamster", accessory: "headband", hue: 330, skin: "#e8b27f", mood: "sad" }, price: 0.00071, supply: 8e9, liquidity: 38_000, holders: 980, volatility: 0.03, devReputation: 0.3, whaleConcentration: 0.55 },
  { id: "tduck", name: "TURBO DUCK", ticker: "TDUCK", description: "Утка на реактивной тяге. Кря — и плюс сорок процентов.", art: { creature: "duck", accessory: "cap", hue: 20, skin: "#f7d548", mood: "happy" }, price: 0.0029, supply: 3e9, liquidity: 72_000, holders: 2_100, volatility: 0.024, devReputation: 0.5, whaleConcentration: 0.4 },
  { id: "zorp", name: "ZORP", ticker: "ZORP", description: "Пришелец утверждает, что знает инсайд с Альфы Центавра.", art: { creature: "alien", accessory: "halo", hue: 160, skin: "#8be36a", mood: "smug" }, price: 0.000057, supply: 5e10, liquidity: 22_000, holders: 540, volatility: 0.034, devReputation: 0.18, whaleConcentration: 0.68 },
  { id: "gbear", name: "GIGA BEAR", ticker: "GBEAR", description: "Медведь, который шортит сам себя. Парадоксально растёт.", art: { creature: "bear", accessory: "chain", hue: 15, skin: "#8b5a3c", mood: "angry" }, price: 0.0112, supply: 1.5e9, liquidity: 115_000, holders: 3_300, volatility: 0.017, devReputation: 0.65, whaleConcentration: 0.3 },
];

/** Word banks for relaunching rugged tokens under a new identity. */
export const NAME_PREFIX = ["BABY", "MEGA", "GIGA", "TURBO", "ROCKET", "DEGEN", "SAD", "LASER", "MOON", "KING", "LORD", "BASED"];
export const NAME_BY_CREATURE: Record<TokenArt["creature"], string[]> = {
  frog: ["FROG", "TOAD", "RIBBIT"], dog: ["DOGE", "SHIBA", "WOOF"], cat: ["CAT", "MEOW", "KITTY"], ape: ["APE", "MONKE"],
  hamster: ["HAMMY", "HAMSTER"], pigeon: ["COO", "PIGEON"], bear: ["BEAR", "GRIZZ"], fish: ["WHALE", "FISH"],
  alien: ["ZORP", "ALIEN"], duck: ["DUCK", "QUACK"],
};
