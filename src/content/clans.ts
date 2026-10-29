/*
 * Clan level from the total boss damage of its members.
 * Level 1 at 5 000, level 2 at 11 000, then every step is 1 000 longer than the one before:
 * 5 000 → 11 000 → 18 000 → 26 000 → 35 000 …  (threshold of level n = 4 000·n + 500·n·(n+1))
 */
export const clanLevelAt = (n: number) => (n <= 0 ? 0 : 4000 * n + 500 * n * (n + 1));

export function clanLevelInfo(damage: number): { level: number; from: number; to: number } {
  const d = Math.max(0, damage);
  let n = Math.max(0, Math.floor((-9 + Math.sqrt(81 + (8 * d) / 1000)) / 2) - 1);
  while (clanLevelAt(n + 1) <= d) n++;
  return { level: n, from: clanLevelAt(n), to: clanLevelAt(n + 1) };
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
