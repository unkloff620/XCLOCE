import type { Reward } from "./rewards.ts";

/** One thing that can lie on the ground in the yard. `weight` is relative (draft, overridable via config "yard.drops"). */
export interface YardDrop {
  id: string;
  name: string;
  /** icon id for the client (an item id or a currency icon) */
  icon: string;
  weight: number;
  reward: Reward;
}

export const YARD_SPAWN_MIN = 5;
export const YARD_MAX_ITEMS = 5;

// Mostly папиросы; every other find 1%, the roubles 0.5% (the user 2026-11-22). Weights are per mille.
export const YARD_DROPS: YardDrop[] = [
  { id: "papirosy", name: "Папиросы", icon: "PAP", weight: 955, reward: { currencies: { PAP: 10 } } },
  { id: "coins", name: "Мелочь из-под лавки", icon: "coins", weight: 5, reward: { currencies: { RUB: 25 } } },
  // «Крафт»: a part lies on the ground (which one is rolled when it appears — the drop id becomes the part's id)
  { id: "parts-common", name: "Деталь", icon: "part-nails", weight: 10, reward: {} },
  { id: "parts-rare", name: "Редкая деталь", icon: "part-battery", weight: 10, reward: {} },
  { id: "energy-drink", name: "Энергетик", icon: "energy-drink", weight: 10, reward: { items: [{ id: "energy-drink", qty: 1 }] } },
  { id: "keyboard", name: "Нож", icon: "keyboard", weight: 10, reward: { items: [{ id: "keyboard", qty: 1 }] } },
];

/*
 * Time of day in the yard (Moscow time): the picture is tinted to match.
 * day 8–17, evening 17–22, night 22–5, morning 5–8.
 */
export type YardTime = "morning" | "day" | "evening" | "night";
export function yardTime(now: number): YardTime {
  const h = new Date(now + 3 * 3600_000).getUTCHours();
  return h >= 22 || h < 5 ? "night" : h < 8 ? "morning" : h < 17 ? "day" : "evening";
}
/** at night some finds could be likelier — none now: the chances are fixed (the user 2026-11-22) */
export const NIGHT_BOOST: Record<string, number> = {};
