import type { Reward } from "./rewards.ts";

export interface BossDef {
  id: string;
  order: number;
  name: string;
  title: string;
  story: string;
  /** draft HP, overridable via config "boss.hp" */
  hp: number;
  /** reward for every victory in a personal fight (the key is added automatically) */
  reward: Reward;
  /** possible extra drop on victory: chance 0..1 */
  drop?: { id: string; qty: number; chance: number }[];
  /** arena colours: background top/bottom and accent */
  theme: { a: string; b: string; accent: string };
  /** raster photos in public/bosses/<id>/ — portrait (lists), full (boss screen), card (waist-up, the boss list); null = placeholder */
  photo: { portrait: string | null; full: string | null; card?: string | null };
  /** HP phases in percent (only the final boss has several) */
  phases?: { from: number; name: string }[];
  final?: boolean;
  /** cards of the previous boss needed to open this one (default KEYS_TO_UNLOCK) */
  keysToUnlock?: number;
  /** the card this boss gives for a win (item key-<id>); the final boss gives none */
  card?: CardTier;
  /**
   * things this boss unlocks in the shop: each one not unlocked yet rolls `chance` per win (from KEY_SHARE damage);
   * after `pity` wins in a row without luck one of them unlocks for sure. A dropped thing is not given — it opens
   * in the shop and has to be bought there. Which ones, is a secret for the player (shown as «?» x/N)
   */
  wear?: { items: string[]; chance: number; pity: number };
}

/** Boss passes «Пропуск» (they used to be keys): the tier only sets the look and the name, every boss has its own card. */
export type CardTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";
export const CARD_TIERS: Record<CardTier, { name: string; rarity: "common" | "rare" | "epic" | "legendary" | "mythic" }> = {
  bronze: { name: "Бронзовый пропуск", rarity: "common" },
  silver: { name: "Серебряный пропуск", rarity: "rare" },
  gold: { name: "Золотой пропуск", rarity: "epic" },
  platinum: { name: "Платиновый пропуск", rarity: "legendary" },
  diamond: { name: "Бриллиантовый пропуск", rarity: "mythic" },
};

/** 1 000 → 10 000 → 50 000 → … → 10 000 000 (Солнце). Подчинённые (Гаркуша, Мугонатор, Вадим, Боцман) fill the gaps. */
const HP = [1_000, 10_000, 50_000, 80_000, 115_000, 150_000, 400_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 5_000_000, 10_000_000];
const hp = (i: number) => HP[i];
/** Authority for a win: 100 for Дацкоу … 1 500 000 for Солнце (×≈3.3 per boss, smaller steps across the inserted bosses). */
const XP = [100, 350, 1_100, 1_700, 2_600, 3_700, 12_000, 40_000, 60_000, 90_000, 135_000, 450_000, 1_500_000];
const xp = (i: number) => XP[i];
const photo = (id: string, has = false) => (has ? { portrait: `/bosses/${id}/portrait.webp`, full: `/bosses/${id}/full.webp`, card: `/bosses/${id}/card.webp` } : { portrait: null, full: null });

/**
 * Strict order, weakest first: Дацкоу → … → Солнце (final) — the Close hierarchy from the bottom up.
 * Ids stay as they were when a boss got renamed (keys, art folders and fight history are keyed by id).
 */
export const BOSSES: BossDef[] = [
  {
    id: "datsik", order: 1, card: "bronze", name: "Дацкоу", title: "Замороженный подчинённый Бабафея",
    story: "Числится в штате, но давно заморожен. Оттаивает, только когда кто-то пытается пройти мимо.",
    hp: hp(0), reward: { xp: xp(0), currencies: { SOL: 0.02, RUB: 150 } },
    drop: [{ id: "keyboard", qty: 1, chance: 0.35 }],
    wear: { items: ["tee-white", "jeans", "sneakers"], chance: 0.1, pity: 10 },
    theme: { a: "#3a1430", b: "#12081a", accent: "#ff4d6d" }, photo: photo("datsik", true),
  },
  {
    id: "kedr", order: 2, card: "bronze", name: "Кедр", title: "Ответственный за сайт ActClose",
    story: "Сайт лежит — Кедр стоит. Сайт стоит — Кедр всё равно стоит, корни глубоко.",
    hp: hp(1), reward: { xp: xp(1), currencies: { SOL: 0.03, RUB: 220 } },
    drop: [{ id: "keyboard", qty: 2, chance: 0.3 }],
    wear: { items: ["slippers", "shorts-remote"], chance: 0.1, pity: 10 },
    theme: { a: "#173a26", b: "#07140c", accent: "#3ddc84" }, photo: photo("kedr", true),
  },
  {
    id: "bebyakyan", order: 3, card: "bronze", name: "Командате", title: "Подчинённый Востока",
    story: "Командует всеми, кто ниже. Таких пока немного, но он не сдаётся.",
    hp: hp(2), reward: { xp: xp(2), currencies: { SOL: 0.045, RUB: 300 } },
    drop: [{ id: "keyboard", qty: 3, chance: 0.3 }],
    wear: { items: ["tee-pump"], chance: 0.1, pity: 10 },
    theme: { a: "#1c2a4a", b: "#080d1c", accent: "#4da3ff" }, photo: photo("bebyakyan", true),
  },
  {
    id: "garkusha", order: 4, card: "silver", name: "Гаркуша", title: "Подчинённый Князя",
    story: "Правая рука Князя. Левой подписывает всё, что Князь не успел прочитать.",
    hp: hp(3), reward: { xp: xp(3), currencies: { SOL: 0.052, RUB: 340 } },
    drop: [{ id: "keyboard", qty: 3, chance: 0.35 }],
    wear: { items: ["cap-moon"], chance: 0.1, pity: 10 },
    theme: { a: "#3a1a1a", b: "#140707", accent: "#ff6b4a" }, photo: photo("garkusha", true),
  },
  {
    id: "mugo", order: 5, card: "silver", name: "Мугонатор", title: "Подчинённый Вадима",
    story: "Делает всё, что сказал Вадим. Иногда даже то, что Вадим только подумал.",
    hp: hp(4), reward: { xp: xp(4), currencies: { SOL: 0.058, RUB: 380 } },
    drop: [{ id: "energy-drink", qty: 2, chance: 0.35 }],
    wear: { items: ["gold-chain"], chance: 0.1, pity: 10 },
    theme: { a: "#163a3a", b: "#061414", accent: "#2ee6c8" }, photo: photo("mugo"),
    keysToUnlock: 1,
  },
  {
    id: "babafey", order: 6, card: "silver", name: "Бабафей", title: "Главный администратор Close Neo",
    story: "Держит Close Neo в ежовых рукавицах. Каждое «ок» стоит три письма и одно совещание.",
    hp: hp(5), reward: { xp: xp(5), currencies: { SOL: 0.065, RUB: 420 } },
    drop: [{ id: "gpu", qty: 1, chance: 0.25 }],
    wear: { items: ["hoodie-hodl"], chance: 0.1, pity: 10 },
    theme: { a: "#3a2a10", b: "#140d04", accent: "#ffb020" }, photo: photo("babafey"),
    keysToUnlock: 1,
  },
  {
    id: "vodovoz", order: 7, card: "gold", name: "Восток", title: "Главный администратор Close Vostok",
    story: "Солнце встаёт на востоке, а Восток встаёт раньше Солнца. Проверяет всех ещё до начала смены.",
    hp: hp(6), reward: { xp: xp(6), currencies: { SOL: 0.09, RUB: 560 } },
    drop: [{ id: "energy-drink", qty: 3, chance: 0.4 }],
    theme: { a: "#0f3440", b: "#041217", accent: "#38d6ff" }, photo: photo("vodovoz"),
    keysToUnlock: 1,
  },
  {
    id: "knyaz", order: 8, card: "gold", name: "Князь", title: "Главный администратор Close Knuaz",
    story: "Правит своим Close как княжеством. Отчёты принимает только в правильном шрифте — шрифт каждый раз новый.",
    hp: hp(7), reward: { xp: xp(7), currencies: { SOL: 0.13, RUB: 750 } },
    drop: [{ id: "gpu", qty: 1, chance: 0.35 }],
    theme: { a: "#2e1846", b: "#0e0718", accent: "#b06bff" }, photo: photo("knyaz"),
    keysToUnlock: 1,
  },
  {
    id: "vadim", order: 9, card: "platinum", name: "Вадим", title: "Главный администратор Close Vadim",
    story: "Сводит весь Close Vadim в один Excel. Нет тебя в таблице — нет тебя в компании.",
    hp: hp(8), reward: { xp: xp(8), currencies: { SOL: 0.17, RUB: 820 } },
    drop: [{ id: "gpu", qty: 1, chance: 0.4 }],
    theme: { a: "#3a2416", b: "#140b05", accent: "#ff8a3d" }, photo: photo("vadim"),
    keysToUnlock: 1,
  },
  {
    id: "botsman", order: 10, card: "platinum", name: "Боцман", title: "Появляется раз в год — на Новый год",
    story: "Весь год его никто не видел, а в декабре он уже стоит у ёлки. Что-то из себя да представляет.",
    hp: hp(9), reward: { xp: xp(9), currencies: { SOL: 0.22, RUB: 880 } },
    drop: [{ id: "rug-pull-gun", qty: 1, chance: 0.15 }],
    theme: { a: "#0f2a44", b: "#050e18", accent: "#5fb8ff" }, photo: photo("botsman"),
    keysToUnlock: 1,
  },
  {
    id: "utilizator", order: 11, card: "diamond", name: "Утилизатор", title: "Прокси и вся движуха",
    story: "Отвечает за прокси и за всё, что связано с алкоголем. Тусовка не начнётся без его разрешения.",
    hp: hp(10), reward: { xp: xp(10), currencies: { BTC: 0.0003, RUB: 950 }, items: [{ id: "statue-close", qty: 1 }] },
    drop: [{ id: "rug-pull-gun", qty: 1, chance: 0.25 }],
    theme: { a: "#2f3416", b: "#0f1106", accent: "#c8f03c" }, photo: photo("utilizator"),
    keysToUnlock: 1,
  },
  {
    id: "fokus", order: 12, card: "diamond", name: "Фокус", title: "Главный и единственный программист",
    story: "Весь код Close написал он один. И только он знает, почему это работает.",
    hp: hp(11), reward: { xp: xp(11), currencies: { BTC: 0.0005, RUB: 1200 } },
    drop: [{ id: "rug-pull-gun", qty: 1, chance: 0.35 }],
    theme: { a: "#401624", b: "#16060c", accent: "#ff6b9a" }, photo: photo("fokus"),
    keysToUnlock: 1,
  },
  {
    id: "solntse", order: 13, name: "Солнце", title: "Главный начальник всего Close",
    story: "Светит всем, всегда и без выходных. Чтобы дойти сюда, нужно пройти весь Close.",
    hp: hp(12), reward: { xp: xp(12), currencies: { BTC: 0.001, RUB: 2000 }, items: [{ id: "trophy-sun", qty: 1 }] },
    drop: [{ id: "rug-pull-gun", qty: 2, chance: 0.5 }],
    theme: { a: "#4a2a06", b: "#1a0c02", accent: "#ffd23f" }, photo: photo("solntse"),
    phases: [{ from: 100, name: "Рассвет" }, { from: 66, name: "Зенит" }, { from: 33, name: "Солнечная буря" }],
    final: true,
    keysToUnlock: 1,
  },
];
/**
 * Bosses without drawn art are hidden for now: not in the lists, profile, medals and achievements, and a fight with them
 * cannot be started (old data — keys, fights, items — stays). A boss comes back by itself once his art is added
 * (photo has=true). ALL_BOSSES=1 (the tests) shows them all.
 */
export const bossHasArt = (b: BossDef) => !!b.photo.full || (typeof process !== "undefined" && process.env?.ALL_BOSSES === "1");
/** `over` — the admin's boss controls in «События» (server: cfg.bossOpen; client: state.openBosses) put a boss in or out */
export const bossOpen = (b: BossDef, over?: Record<string, boolean>) => over?.[b.id] ?? bossHasArt(b);
export const OPEN_BOSSES = (over?: Record<string, boolean>): BossDef[] => BOSSES.filter((b) => bossOpen(b, over));
/** client side: the bosses the server says are in the game (state.openBosses), by art until it answers */
export const bossesIn = (ids?: string[] | null): BossDef[] => (ids ? BOSSES.filter((b) => ids.includes(b.id)) : OPEN_BOSSES());


export const bossById = (id: string) => BOSSES.find((b) => b.id === id);
/** each boss fights in his own room (public/assets/arena/<id>.webp); the rest still in the garage */
export const BOSS_ARENAS = new Set(["kedr", "bebyakyan"]);
export const arenaOf = (bossId: string) => `/assets/arena/${BOSS_ARENAS.has(bossId) ? bossId : "garage"}.webp`;
/** the boss that unlocks this shop item (BossDef.wear), if any */
export const unlockBossOf = (itemId: string) => BOSSES.find((b) => b.wear?.items.includes(itemId));
export const keyId = (bossId: string) => `key-${bossId}`;
/** Keys of boss N needed to open boss N+1 (bosses after Гаркуша — from Мугонатор on — take one: keysToUnlock: 1). */
export const KEYS_TO_UNLOCK = 3;
/** Personal fight length. */
export const FIGHT_HOURS = 8;
/** Fights per boss per player per Moscow day. Lost or abandoned fights do not count. */
export const FIGHTS_PER_DAY = 7;
/**
 * Bosses are shared: everybody's hits lower HP in every running fight, so with ~100 players a boss falls fast.
 * The win reward therefore follows your own part: full reward from FULL_SHARE of the boss HP dealt in that fight,
 * proportionally less below it, and the key (and the drop) only from KEY_SHARE. No damage — no reward.
 */
export const FULL_SHARE = 0.02;
export const KEY_SHARE = 0.01;
/** a win that earned the pass gives a second pass of the same boss with this chance */
export const EXTRA_KEY_CHANCE = 0.1;
/** reward multiplier for damage dealt in a fight */
export function rewardShare(myDamage: number, hpMax: number, full = FULL_SHARE): number {
  if (!(myDamage > 0) || !(hpMax > 0)) return 0;
  return Math.min(1, myDamage / (hpMax * full));
}

/** How many keys of the previous boss open this one. */
export function keysNeeded(b: BossDef, defaultKeys: number): number {
  return b.keysToUnlock ?? defaultKeys;
}
