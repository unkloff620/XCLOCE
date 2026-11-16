/*
 * Clan level from the clan's own experience — only from «Захват» (content/raids.ts: taken buildings and yards).
 * From level n to n+1 takes CLAN_LEVEL_STEP × n / 38 (1→2: 39 474 … 38→39: 1 500 000); the top level is CLAN_LEVEL_MAX.
 */
export const CLAN_LEVEL_STEP = 1_500_000;
export const CLAN_LEVEL_MAX = 50;
/** the experience from level n to n+1 */
export const clanLevelStep = (n: number) => Math.round((CLAN_LEVEL_STEP * n) / 38);
/** the experience a clan needs to be at level n */
export const clanLevelAt = (n: number) => {
  let t = 0;
  for (let k = 1; k < Math.min(n, CLAN_LEVEL_MAX); k++) t += clanLevelStep(k);
  return t;
};
/** the clan's level, where it began and where the next one begins (at the top level: to = from) */
export function clanLevelInfo(xp: number): { level: number; from: number; to: number; max: boolean } {
  const x = Math.max(0, xp);
  let n = 1;
  while (n < CLAN_LEVEL_MAX && clanLevelAt(n + 1) <= x) n++;
  const max = n >= CLAN_LEVEL_MAX;
  return { level: n, from: clanLevelAt(n), to: max ? clanLevelAt(n) : clanLevelAt(n + 1), max };
}

/*
 * The clan boss of the week (Moscow week from Monday 00:00): every clan gets its own copy of one of the drawn bosses
 * (CLAN_BOSS_ROTATION by the week), HP = CLAN_BOSS_HP_PER_MEMBER × members (at least CLAN_BOSS_MIN_MEMBERS) when the
 * first hit lands. Only the clan's members hit it, with their usual weapons. When it falls, everyone who hit gets a prize
 * by their share of the damage (the pool grows with the clan) plus a small floor; a boss alive at the week's end leaves.
 */
export const CLAN_BOSS_ROTATION = ["datsik", "kedr", "mugo", "garkusha", "bebyakyan"] as const;
export const CLAN_BOSS_HP_PER_MEMBER = 25_000;
export const CLAN_BOSS_MIN_MEMBERS = 3;
/** the prize pool per member of the clan (split by the share of the damage) */
export const CLAN_BOSS_POOL_PER_MEMBER = { RUB: 3000, USD: 10, chips: 3, gpu: 1 };
/** everyone who hit it gets at least this */
export const CLAN_BOSS_FLOOR = { RUB: 500, chips: 1 };

/**
 * The clan coat of arms is one string in clans.emblem: "<symbol>" or "<symbol>:<shield style>"
 * (the symbol is the clan logo, the style is the drawn shield; old clans have only the symbol → the gold shield).
 */
export const CLAN_SHIELDS = [
  { id: "gold", name: "Золотой" },
  { id: "silver", name: "Стальной" },
  { id: "iron", name: "Железный" },
  { id: "bronze", name: "Бронзовый" },
  { id: "neon", name: "Неоновый" },
  { id: "round", name: "Круглый" },
  { id: "crown", name: "Королевский" },
] as const;
export type ClanShield = (typeof CLAN_SHIELDS)[number]["id"];
export const isClanShield = (s: string): s is ClanShield => CLAN_SHIELDS.some((x) => x.id === s);
export function parseEmblem(emblem: string): { symbol: string; shield: ClanShield } {
  const [symbol, shield = "gold"] = emblem.split(":");
  return { symbol, shield: isClanShield(shield) ? shield : "gold" };
}
export const joinEmblem = (symbol: string, shield: string) => (shield === "gold" ? symbol : `${symbol}:${shield}`);
