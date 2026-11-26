import type { Reward } from "./rewards.ts";

export interface BossDef {
  id: string;
  /** this boss's own wins a day (instead of FIGHTS_PER_DAY) */
  perDay?: number;
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
   * things this boss unlocks in the shop: one of the ones not unlocked yet drops with BLAT_THING_CHANCE per «Блатной» win (any own hit; `chance` is no longer used);
   * after `pity` wins in a row without luck one of them unlocks for sure. A dropped thing is not given — it opens
   * in the shop and has to be bought there. Which ones, is a secret for the player (shown as «?» x/N)
   */
  wear?: { items: string[]; chance: number; pity: number };
  /** the fight mode his things (and his room) drop in, when not the usual «Блатной» (Утилизатор: «Авторитетный») */
  thingsMode?: "pacan" | "blat" | "avtor";
  /** things the first win (any own hit) opens in the shop for sure; they are bought there too */
  firstWin?: string[];
  /**
   * the boss's set: owning every thing of his `wear` list (worn or not) adds `damage` to every hit of `weapon`
   * (a flat bonus like the weapon's talents, before the room and trophy %)
   */
  /** the clothing set's bonus: flat damage to a weapon (and, for the strongest, to a second one — `also`) */
  set?: { weapon: string; damage: number; also?: { weapon: string; damage: number } };
  /**
   * an event boss (EVENT_FIGHTS, not in the chain): fought only while the admin has him on («Ивенты», cfg.eventBosses),
   * only in «Пацанский» (no other modes, no «Соло»), no pass needed and none given
   */
  event?: boolean;
  /** a mentor (the «Менторы» tab): an event fight that is always on — no admin switch, «Пацанский» only */
  mentor?: boolean;
  /** an event boss fought in every mode (Нитка: «Пацанский», «Блатной», «Авторитетный»; no «Соло») */
  modes?: boolean;
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

/** «Пацанский» HP (×3 «Блатной», ×6 «Авторитетный»): 1 000 (Дацкоу) … 1 000 000 000 (Солнце) — the user's table. */
const HP = [1_000, 10_000, 50_000, 100_000, 500_000, 2_000_000, 3_000_000, 5_000_000, 8_000_000, 30_000_000, 600_000_000, 700_000_000, 1_000_000_000];
const hp = (i: number) => HP[i];
/** Authority for a win: 25 for Дацкоу … 1 000 000 for Солнце (the user's table). */
const XP = [25, 30, 50, 100, 200, 500, 750, 850, 1_000, 1_500, 15_000, 12_000, 1_000_000];
const xp = (i: number) => XP[i];
/** `v`: bump when the pictures are redrawn under the same names, so phones don't keep the old ones from the cache */
const photo = (id: string, has = false, v = "") => {
  const q = v ? `?v=${v}` : "";
  return has ? { portrait: `/bosses/${id}/portrait.webp${q}`, full: `/bosses/${id}/full.webp${q}`, card: `/bosses/${id}/card.webp${q}` } : { portrait: null, full: null };
};

/**
 * Strict order, weakest first: Дацкоу → … → Солнце (final) — the Close hierarchy from the bottom up.
 * Ids stay as they were when a boss got renamed (keys, art folders and fight history are keyed by id).
 */
/** the fight modes in a word, for «Выпадает с Дацкоу (Блатной)» */
export const MODE_SHORT = { pacan: "Пацанский", blat: "Блатной", avtor: "Авторитетный" } as const;
/** the mode a boss's things (his clothes, his room, the first-win things) drop in, in a word */
export const thingsModeName = (b: { event?: unknown; thingsMode?: keyof typeof MODE_SHORT }) => ((b as { mentor?: unknown }).mentor ? "ментор" : b.event ? "ивент" : MODE_SHORT[b.thingsMode ?? "blat"]);
/** «Выпадает с Дацкоу (Блатной)» */
export const thingsFrom = (b: { name: string; event?: unknown; thingsMode?: keyof typeof MODE_SHORT }) => `Выпадает с ${b.name} (${thingsModeName(b)})`;

export const BOSSES: BossDef[] = [
  {
    id: "datsik", order: 1, card: "bronze", name: "Дацкоу", title: "Замороженный подчинённый Бабафея",
    story: "Числится в штате, но давно заморожен. Оттаивает, только когда кто-то пытается пройти мимо.",
    hp: hp(0), reward: { xp: xp(0), currencies: { RUB: 5 } },
    wear: { items: ["tee-white", "jeans", "sneakers"], chance: 0.1, pity: 10 },
    set: { weapon: "fist", damage: 10 },
    theme: { a: "#3a1430", b: "#12081a", accent: "#ff4d6d" }, photo: photo("datsik", true, "2"), // (v2: the new art — the medals and cards show it, not the cached old one)
  },
  {
    id: "kedr", order: 2, card: "bronze", name: "Кедр", title: "Ответственный за сайт ActClose",
    story: "Сайт лежит — Кедр стоит. Сайт стоит — Кедр всё равно стоит, корни глубоко.",
    hp: hp(1), reward: { xp: xp(1), currencies: { PAP: 200 } },
    wear: { items: ["tee-actclose", "shorts-actclose", "badge-actclose"], chance: 0.1, pity: 10 },
    set: { weapon: "gpu", damage: 20 },
    firstWin: ["hand-drum"],
    theme: { a: "#173a26", b: "#07140c", accent: "#3ddc84" }, photo: photo("kedr", true),
  },
  {
    id: "mugo", order: 3, card: "bronze", name: "Мугонатор", title: "Подчинённый Вадима",
    story: "Делает всё, что сказал Вадим. Иногда даже то, что Вадим только подумал.",
    hp: hp(2), reward: { xp: xp(2), currencies: { RUB: 20 } },
    wear: { items: ["tee-sailor", "cap-captain", "mask-diver", "teeth-necklace", "anchor-mugo"], chance: 0.1, pity: 10 },
    set: { weapon: "red-candle", damage: 15 },
    theme: { a: "#163a3a", b: "#061414", accent: "#2ee6c8" }, photo: photo("mugo", true),
  },
  {
    id: "garkusha", order: 4, card: "silver", name: "Гаркуша", title: "Подчинённый Князя",
    story: "Правая рука Князя. Левой подписывает всё, что Князь не успел прочитать.",
    hp: hp(3), reward: { xp: xp(3), currencies: { PAP: 500 } },
    wear: { items: ["jacket-puffer", "pants-black", "sneakers-chunky"], chance: 0.1, pity: 10 },
    set: { weapon: "keyboard", damage: 30 },
    theme: { a: "#3a1a1a", b: "#140707", accent: "#ff6b4a" }, photo: photo("garkusha", true),
  },
  {
    id: "bebyakyan", order: 5, card: "silver", name: "Командате", title: "Подчинённый Востока",
    story: "Командует всеми, кто ниже. Таких пока немного, но он не сдаётся.",
    hp: hp(4), reward: { xp: xp(4), currencies: { PAP: 5_000 } },
    wear: { items: ["bottle-komandate", "jacket-komandate", "pants-komandate", "sneakers-komandate"], chance: 0.1, pity: 10 },
    set: { weapon: "keyboard", damage: 70 },
    theme: { a: "#1c2a4a", b: "#080d1c", accent: "#4da3ff" }, photo: photo("bebyakyan", true),
    keysToUnlock: 1,
  },
  {
    id: "babafey", order: 6, card: "silver", name: "Бабафей", title: "Главный администратор Close Neo",
    story: "Держит Close Neo в ежовых рукавицах. Каждое «ок» стоит три письма и одно совещание.",
    hp: hp(5), reward: { xp: xp(5), currencies: { PAP: 10_000 } },
    theme: { a: "#3a2a10", b: "#140d04", accent: "#ffb020" }, photo: photo("babafey", true),
    // no things yet: the set waits for them (the user's table 2026-11-23)
    set: { weapon: "rug-pull-gun", damage: 90 },
    keysToUnlock: 1,
  },
  {
    id: "vodovoz", order: 7, card: "gold", name: "Восток", title: "Главный администратор Close Vostok",
    story: "Солнце встаёт на востоке, а Восток встаёт раньше Солнца. Проверяет всех ещё до начала смены.",
    hp: hp(6), reward: { xp: xp(6), currencies: { TOOTH: 750 } },
    wear: { items: ["sweater-vostok", "pants-vostok", "headphones-vostok", "sneakers-black"], chance: 0.1, pity: 10 },
    set: { weapon: "keyboard", damage: 40 },
    theme: { a: "#0f3440", b: "#041217", accent: "#38d6ff" }, photo: photo("vodovoz", true, "3"),
    keysToUnlock: 1,
  },
  {
    id: "knyaz", order: 8, card: "gold", name: "Князь", title: "Главный администратор Close Knuaz",
    story: "Правит своим Close как княжеством. Отчёты принимает только в правильном шрифте — шрифт каждый раз новый.",
    hp: hp(7), reward: { xp: xp(7), currencies: { TOOTH: 850 } },
    theme: { a: "#2e1846", b: "#0e0718", accent: "#b06bff" }, photo: photo("knyaz", true),
    // no things yet: the set waits for them (the user's table 2026-11-23)
    set: { weapon: "rug-pull-gun", damage: 150 },
    keysToUnlock: 1,
  },
  {
    id: "vadim", order: 9, card: "platinum", name: "Вадим", title: "Главный администратор Close Vadim",
    story: "Сводит весь Close Vadim в один Excel. Нет тебя в таблице — нет тебя в компании.",
    hp: hp(8), reward: { xp: xp(8), currencies: { PAP: 1_000, TOOTH: 1_000 } },
    wear: { items: ["jacket-vadim", "pants-vadim", "shoes-vadim", "tie-vadim"], chance: 0.1, pity: 10 },
    set: { weapon: "rug-pull-gun", damage: 300 },
    theme: { a: "#3a2416", b: "#140b05", accent: "#ff8a3d" }, photo: photo("vadim", true, "1"),
    keysToUnlock: 1,
  },
  {
    id: "botsman", order: 10, card: "platinum", name: "Боцман", title: "Появляется раз в год — на Новый год",
    story: "Весь год его никто не видел, а в декабре он уже стоит у ёлки. Что-то из себя да представляет.",
    hp: hp(9), reward: { xp: xp(9), currencies: { TOOTH: 1_500 } },
    wear: { items: ["coat-botsman", "gloves-botsman", "pants-botsman", "boots-botsman"], chance: 0.1, pity: 10 },
    set: { weapon: "rug-pull-gun", damage: 280, also: { weapon: "gpu", damage: 300 } },
    theme: { a: "#0f2a44", b: "#050e18", accent: "#5fb8ff" }, photo: photo("botsman", true),
    keysToUnlock: 1,
  },
  {
    id: "utilizator", order: 11, card: "diamond", name: "Утилизатор", title: "Прокси и вся движуха",
    story: "Отвечает за прокси и за всё, что связано с алкоголем. Тусовка не начнётся без его разрешения.",
    hp: hp(10), reward: { xp: xp(10), currencies: { TOOTH: 15_000, PAP: 15_000 } },
    // his things drop in «Авторитетный» (his tattoos — in «Пацанский» and «Блатной»)
    wear: { items: ["vials-utilizator", "mask-gas-utilizator", "apron-utilizator"], chance: 0.1, pity: 10 }, thingsMode: "avtor",
    set: { weapon: "rug-pull-gun", damage: 400 },
    theme: { a: "#2f3416", b: "#0f1106", accent: "#c8f03c" }, photo: photo("utilizator", true),
    keysToUnlock: 1,
  },
  {
    // Фокус is back in the chain (the user 2026-11-25) with his new art (a hacker in a hood: boss-fokus.tsx): 700 000 000
    // HP as before, his card, his room, his set; the old art is «Псих» among the mentors
    id: "fokus", order: 12, card: "diamond", name: "Фокус", title: "Главный и единственный программист",
    story: "Весь код Close написал он один. И только он знает, почему это работает.",
    hp: hp(11), reward: { xp: xp(11), currencies: { TOOTH: 12_000, PAP: 12_000 } },
    theme: { a: "#401624", b: "#16060c", accent: "#ff6b9a" }, photo: photo("fokus", true, "2"), // (v2: the new art)
    set: { weapon: "keyboard", damage: 250 },
    keysToUnlock: 1,
  },
  {
    id: "solntse", order: 13, name: "Солнце", title: "Главный начальник всего Close",
    story: "Светит всем, всегда и без выходных. Чтобы дойти сюда, нужно пройти весь Close.",
    hp: hp(12), reward: { xp: xp(12), currencies: { TOOTH: 2_500, PAP: 1_000 } },
    theme: { a: "#4a2a06", b: "#1a0c02", accent: "#ffd23f" }, photo: photo("solntse", true),
    phases: [{ from: 100, name: "Рассвет" }, { from: 66, name: "Зенит" }, { from: 33, name: "Солнечная буря" }],
    final: true,
    // his things drop in «Авторитетный» (the user 2026-11-23). His tattoo sets:
    // «Кузня» (Пацанский), «Затмение» (Блатной), «Ожог» (Авторитетный) — content/tattoos.ts
    wear: { items: ["tee-solntse", "pants-solntse", "sneakers-solntse"], chance: 0.1, pity: 10 }, thingsMode: "avtor",
    set: { weapon: "rug-pull-gun", damage: 1000 },
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


/**
 * Event bosses with a real fight (the same fights as the chain: the global damage, the weapons, the reward): not in
 * BOSSES, so not in the boss list, the chain or the per-boss achievements. Пепе: art/pepe-rig.tsx, /event/pepe.
 */
export const EVENT_FIGHTS: BossDef[] = [
  {
    id: "pepe", order: 100, name: "Пепе", title: "Ментор", event: true, mentor: true,
    story: "Пришёл из болота и сел на чужую таблетку. Уходить не собирается, пока его не прогонят.",
    hp: 100_000, reward: { xp: 25, currencies: { TOOTH: 25 } },
    theme: { a: "#173d1f", b: "#06140a", accent: "#3ddc84" }, photo: { portrait: "/bosses/pepe/portrait.webp", full: null },
    keysToUnlock: 0,
  },
  {
    // the 14th boss (the user 2026-11-25): a mentor in every mode; opens after a night run of «Опенспейс» (BOSS_ROAD)
    id: "nitka", order: 14, name: "Нитка", title: "Ментор", event: true, mentor: true, modes: true,
    story: "Мотя Нитка ушьёт так, что шва не найдёшь. А если не понравишься — заштопает иголкой прямо по живому.",
    hp: 1_000_000, reward: { xp: 350, currencies: { TOOTH: 300 } },
    theme: { a: "#2b3347", b: "#0e1118", accent: "#9fb3cf" }, photo: { portrait: "/bosses/nitka/portrait.webp", full: "/bosses/nitka/full.webp" },
    // the mentors are a class of bosses like the chain (the user 2026-11-25): Пепе's passes open him
  },
  {
    // «Химик» (the user 2026-11-26): the third «Отморозок» — 30 000 000 HP, every mode, no «Соло» (boss-himik.tsx); between
    // Нитка (1 000 000) and Псих (100 000 000): Нитка's pass opens him, his pass opens Псих
    id: "himik", order: 15, card: "platinum", name: "Химик", title: "Ментор", event: true, mentor: true, modes: true,
    story: "Сорок лет в подвальной лаборатории. Маску носит не от заразы — чтобы не узнали. Колбы не роняет никогда.",
    hp: 30_000_000, reward: { xp: 4_500, currencies: { TOOTH: 3_500, PAP: 3_500 } },
    // his things («Блатной», the user 2026-11-27): the flask in the hand (rig.tsx FlaskHand)
    wear: { items: ["flask-himik"], chance: 0.1, pity: 10 },
    theme: { a: "#16351f", b: "#06120a", accent: "#7dff4a" }, photo: photo("himik", true),
    keysToUnlock: 1,
  },
  {
    // «Псих» (the user 2026-11-25): the old Фокус art (boss-psih.tsx, public/bosses/psih) as a mentor, 100 000 000 HP;
    // every mode, no «Соло»; Нитка's pass opens him, after a night run of «Лунная база» (BOSS_ROAD). Фокус's card,
    // room and set stay with Фокус
    id: "psih", order: 16, card: "diamond", name: "Псих", title: "Ментор", event: true, mentor: true, modes: true,
    story: "Сорвался с катушек прямо за клавиатурой. Теперь у него в руке нож, а не мышка.",
    hp: 100_000_000, reward: { xp: xp(11), currencies: { TOOTH: 12_000, PAP: 12_000 } },
    theme: { a: "#401624", b: "#16060c", accent: "#ff6b9a" }, photo: photo("psih", true),
    keysToUnlock: 1,
  },
];
/** the mentors in their order: like the chain — the first is open, every next one opens with the passes of the one before */
export const MENTORS = EVENT_FIGHTS.filter((b) => b.mentor);
/** the boss whose passes open this one: the one before him in his class (the chain or the mentors); none for the first and the event bosses */
export const prevInClass = (b: BossDef): BossDef | undefined =>
  b.mentor ? MENTORS[MENTORS.findIndex((x) => x.id === b.id) - 1] : b.event ? undefined : BOSSES.find((x) => x.order === b.order - 1);
/** the boss this one's passes open (the next in his class) */
export const nextInClass = (b: BossDef): BossDef | undefined =>
  b.mentor ? MENTORS[MENTORS.findIndex((x) => x.id === b.id) + 1] : b.event ? undefined : BOSSES.find((x) => x.order === b.order + 1);
export const bossById = (id: string) => BOSSES.find((b) => b.id === id) ?? EVENT_FIGHTS.find((b) => b.id === id);
/** the things of a boss's set (his wear list) */
export const bossSetItems = (b: BossDef) => (b.set ? b.wear?.items ?? [] : []);
/** «Дело» of a boss is closed: CASE_WINS wins over him and every thing of his set owned */
export const CASE_WINS = 10;
/** each boss fights in his own room (public/assets/arena/<id>.webp); the rest still in the garage */
// "pepe": the event boss (client/screens/event-pepe.tsx), not in BOSSES
export const BOSS_ARENAS = new Set(["datsik", "kedr", "mugo", "garkusha", "bebyakyan", "babafey", "vodovoz", "pepe", "knyaz", "vadim", "botsman", "utilizator", "fokus", "solntse", "nitka", "himik"]);
export const arenaOf = (bossId: string) => `/assets/arena/${BOSS_ARENAS.has(bossId) ? bossId : "garage"}.webp`;
/** the boss that unlocks this shop item (BossDef.wear), if any */
export const unlockBossOf = (itemId: string) => BOSSES.find((b) => b.wear?.items.includes(itemId) || b.firstWin?.includes(itemId));
/** the thing opens for sure with the first win over its boss (BossDef.firstWin), not by a chance */
export const isFirstWinItem = (itemId: string) => BOSSES.some((b) => b.firstWin?.includes(itemId));
export const keyId = (bossId: string) => `key-${bossId}`;
/** «Связка ключей» (the poker's straight flush): its owner fights the bosses without passes (none are spent) — except these */
export const KEY_RING = "keys-bundle";
export const KEY_RING_EXCEPT = ["vadim", "botsman"];
export const keyRingFits = (b: BossDef) => !b.event && b.order > 1 && !KEY_RING_EXCEPT.includes(b.id);
/**
 * What a boss's pass (item key-<id>) looks like. A pass dropped by boss N opens boss N+1, so it is drawn as the key of
 * the boss it opens (public/assets/items/pass-key-<next id>.webp, tools/items/source/pass-key-<next id>.png): Дацкоу
 * drops the key to Кедр, … Восток the key to Князь. The passes to the last PASS_CARDS.length bosses (Вадим … Солнце) are
 * the pass cards in order, bronze to diamond. The look sets the picture and the name; the dropper's `card` tier still
 * gives the rarity and the medal tier.
 */
export const PASS_CARDS: CardTier[] = ["bronze", "silver", "gold", "platinum", "diamond"];
export type PassLook = { opens: BossDef | undefined } & ({ kind: "key"; art: string } | { kind: "card"; tier: CardTier; art: string });
export function passLook(bossId: string): PassLook {
  const droppers = BOSSES.filter((b) => !b.final);
  const i = droppers.findIndex((b) => b.id === bossId);
  const opens = BOSSES.find((b) => b.order === (droppers[i]?.order ?? 0) + 1);
  const k = i - (droppers.length - PASS_CARDS.length);
  if (i >= 0 && k < 0) return { opens, kind: "key", art: `pass-key-${opens?.id ?? bossId}` };
  // a mentor's («Отморозки»): his own key — the artist's rusty key in his colour (tools/items/mentor-keys.py)
  const mentor = MENTORS.find((m) => m.id === bossId);
  if (mentor) return { opens: nextInClass(mentor), kind: "key", art: `mentor-key-${mentor.id}` };
  // Солнце's pass (it piles up for the bosses still to come) is the diamond card
  if (i < 0) return { opens: MENTORS.find((m) => m.id === bossId) && nextInClass(MENTORS.find((m) => m.id === bossId)!), kind: "card", tier: BOSSES.some((b) => b.id === bossId) ? "diamond" : "bronze", art: `card-${BOSSES.some((b) => b.id === bossId) ? "diamond" : "bronze"}` };
  const tier = PASS_CARDS[Math.max(0, k)];
  return { opens, kind: "card", tier, art: `card-${tier}` };
}
/** Keys of boss N needed to open boss N+1 (bosses after Гаркуша — from Командате on — take one: keysToUnlock: 1). */
export const KEYS_TO_UNLOCK = 3;
/** Personal fight length. */
export const FIGHT_HOURS = 8;
/** Fights per boss per player per Moscow day. Lost or abandoned fights do not count. */
export const FIGHTS_PER_DAY = 7;
/**
 * Bosses are shared: everybody's hits lower HP in every running fight, so with ~100 players a boss falls fast.
 * Every player who was in a won fight gets the FULL reward, the pass, the drop and the medal — even without a single hit
 * (FULL_SHARE / KEY_SHARE are kept only for old configs; the reward no longer depends on them).
 */
export const FULL_SHARE = 0.02;
export const KEY_SHARE = 0.01;
/** a win that earned the pass gives a second pass of the same boss with this chance */
export const EXTRA_KEY_CHANCE = 0.1;
/** reward multiplier for damage dealt in a fight */
export function rewardShare(_myDamage?: number, _hpMax?: number, _full = FULL_SHARE): number {
  return 1;
}
/** a boss's own things (BossDef.wear) in «Блатной»: this chance per win that ONE of the missing things drops, for every boss */
export const BLAT_THING_CHANCE = 0.7;
/** a «Блатной» win gives the boss's thing or his room, not both — both at once only with this luck */
export const BOTH_DROP_CHANCE = 0.05;

/**
 * The road to a boss: a boss opened only after his location was cleared so many times (the user 2026-11-22) — taken
 * away (the user 2026-11-26: «не надо проходить локации»): every boss is open, the previous boss's passes still let you in.
 * A boss put here again gets his road back (loc: the location, times: how many clears, night: its night road).
 */
export const BOSS_ROAD: Record<string, { loc: string; times: number; night?: boolean }> = {};

/** How many keys of the previous boss open this one. */
export function keysNeeded(b: BossDef, defaultKeys: number): number {
  return b.keysToUnlock ?? defaultKeys;
}
