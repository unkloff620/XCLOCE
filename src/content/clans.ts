/*
 * Clan level from the clan's own experience — only from «Захват» (content/raids.ts: taken buildings and yards).
 * CLAN_LEVEL_XP — the experience of one full capture of yard №1 (level 2); up to level 10 every level costs that much
 * (all five yards once ≈ level 10), after it — 0,9 of it (all five yards ~10 times ≈ level 100).
 */
export const CLAN_LEVEL_XP = 19_300;
export const clanLevelAt = (n: number) => (n <= 1 ? 0 : n <= 10 ? CLAN_LEVEL_XP * (n - 1) : Math.round(CLAN_LEVEL_XP * (9 + 0.9 * (n - 10))));
export function clanLevelInfo(xp: number): { level: number; from: number; to: number } {
  const x = Math.max(0, xp);
  let n = 1;
  while (clanLevelAt(n + 1) <= x) n++;
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
