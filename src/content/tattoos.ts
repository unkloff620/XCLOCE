/**
 * Tattoo sets («наколки»). A piece drops from its boss (one per win in the set's fight mode, a piece the player does not
 * have yet), lies in the inventory and is inked on (or taken off) for free in the hero editor («Наколки»). Owning the
 * whole set adds its bonus to a weapon (server/systems/collection.ts setBonuses). The art: tools/rig/build-tattoos.py.
 * `part` — the place in the hero editor (client/screens/stylist.tsx): HEAD, TORSO, SHOULDER_L/R, ARM_L/R, HAND, LEG_L/R.
 */
import { ZARUB_SETS, type ZarubMode } from "./zarub.ts";

export interface TattooPiece { id: string; name: string; part: string }
export interface TattooSet {
  id: string; name: string; boss: string; mode: "pacan" | "blat" | "avtor"; bonus: { weapon: string; damage: number };
  /** more weapons the whole set adds to (Солнце's «Затмение»: the pistol and Rug Pull Gun) */
  extra?: { weapon: string; damage: number }[];
  pieces: TattooPiece[];
}
/** every weapon bonus of a whole set */
export const setBonusList = (s: Pick<TattooSet, "bonus" | "extra">) => [s.bonus, ...(s.extra ?? [])];
/** «+300 к урону «Пистолет», +1000 к урону «Rug Pull Gun»» */
export const setBonusText = (s: Pick<TattooSet, "bonus" | "extra">, weaponName: (id: string) => string | undefined) =>
  setBonusList(s).map((b) => `+${b.damage} к урону «${weaponName(b.weapon) ?? b.weapon}»`).join(", ");

// Дацкоу's two sets: cut by the same 21 places as every other set (they were drawn as single pictures before)
const DATSIK_SETS = (): TattooSet[] => [
  solid("ice", "Вечная мерзлота", "datsik", "pacan", "keyboard", 15),
  solid("king", "Ледяной король", "datsik", "avtor", "gpu", 15),
];

/** the fight mode's name in the dropping text («в «Пацанском»») */
export const TATTOO_MODE_NAME = { pacan: "Пацанском", blat: "Блатном", avtor: "Авторитетном" } as const;
const TATTOO_MODE_SHORT = { pacan: "Пацанский", blat: "Блатной", avtor: "Авторитетный" } as const;

/** the place on the body a piece takes («chest-l»): one tattoo per place — a new one there replaces the old
 *  (the id ends with its place; a set id may hold a dash itself: «tat-zr-ball-chest-l») */
export const tattooZone = (id: string) => [...BACK_ZONES, ...ZONES].find(([z]) => id.endsWith(`-${z}`))?.[0] ?? id.split("-").slice(2).join("-");
/** the inked list with one tattoo per place (the last one wins) */
export function oneTattooPerZone(ids: string[]): string[] {
  const byZone = new Map<string, string>();
  for (const id of ids) byZone.set(tattooZone(id), id);
  return [...byZone.values()];
}

/**
 * Every set (tools/rig/build-tattoos.py SOLID) has 21 pieces, one per place: the artist's tattoo rig (the user 2026-11-24,
 * tools/rig/source/tattoo/_zones) — no face and no right hand any more (their pieces became the traps and the thighs, v2-127).
 */
const ZONES: [string, string, string][] = [
  ["neck", "шея", "HEAD"], ["trap-l", "левая трапеция", "TORSO"], ["trap-r", "правая трапеция", "TORSO"], ["chest-l", "левая грудь", "TORSO"], ["chest-r", "правая грудь", "TORSO"],
  ["belly", "живот", "TORSO"], ["shoulder-l", "левое плечо", "SHOULDER_L"], ["shoulder-r", "правое плечо", "SHOULDER_R"], ["biceps-l", "левый бицепс", "SHOULDER_L"], ["biceps-r", "правый бицепс", "SHOULDER_R"],
  ["forearm-l", "левое предплечье", "ARM_L"], ["forearm-r", "правое предплечье", "ARM_R"], ["hand-l", "левая кисть", "ARM_L"],
  ["thigh-l", "левое бедро", "LEG_L"], ["thigh-r", "правое бедро", "LEG_R"], ["knee-l", "левое колено", "LEG_L"], ["knee-r", "правое колено", "LEG_R"],
  ["shin-l", "левая голень", "LEG_L"], ["shin-r", "правая голень", "LEG_R"], ["foot-l", "левая стопа", "LEG_L"], ["foot-r", "правая стопа", "LEG_R"],
];
/**
 * The back (the user 2026-11-26, the artist's back rig tools/rig/source/tattoo/_back/zones): 21 more places, seen when the
 * hero turns round in the wardrobe. Every set is drawn on the back too (tools/rig/source/tattoo/<set>/back-ink.png, the user 2026-11-26): 42 pieces; the set's
 * bonus asks for all 42 (the user 2026-11-26).
 */
const BACK_ZONES: [string, string, string][] = [
  ["b-crown", "затылок", "BACK"], ["b-nape", "загривок", "BACK"], ["b-upper", "лопатки", "BACK"], ["b-middle", "середина спины", "BACK"], ["b-lower", "поясница", "BACK"],
  ["b-delt-l", "левая дельта", "BACK"], ["b-delt-r", "правая дельта", "BACK"], ["b-triceps-l", "левый трицепс", "BACK"], ["b-triceps-r", "правый трицепс", "BACK"],
  ["b-elbow-l", "левый локоть", "BACK"], ["b-elbow-r", "правый локоть", "BACK"], ["b-forearm-l", "левое предплечье сзади", "BACK"], ["b-forearm-r", "правое предплечье сзади", "BACK"],
  ["b-hip-l", "левый бок бедра", "BACK"], ["b-thigh-l", "левое бедро сзади", "BACK"], ["b-thigh-r", "правое бедро сзади", "BACK"], ["b-hip-r", "правый бок бедра", "BACK"],
  ["b-calf-l", "левая икра", "BACK"], ["b-calf-r", "правая икра", "BACK"], ["b-foot-l", "левая пятка", "BACK"], ["b-foot-r", "правая пятка", "BACK"],
];
/** the back's places, in the editor's order */
export const TATTOO_BACK_ZONES = BACK_ZONES.map(([z]) => z);
export const isBackTattoo = (id: string) => BACK_ZONES.some(([z]) => id.endsWith(`-${z}`));
/** a tattoo place's name in words (the editor's grid): «левое плечо» */
export const TATTOO_ZONE_NAME: Record<string, string> = Object.fromEntries([...ZONES, ...BACK_ZONES].map(([z, place]) => [z, place]));
const solid = (id: string, name: string, boss: string, mode: TattooSet["mode"], weapon: string, damage: number): TattooSet => ({
  id, name, boss, mode, bonus: { weapon, damage },
  pieces: [...ZONES, ...BACK_ZONES].map(([z, place, part]) => ({ id: `tat-${id}-${z}`, name: `${name}: ${place}`, part })),
});
/** the pieces a set's bonus asks for: every piece, the back's too (42 in a set with a back) */
export const bonusPieces = (s: TattooSet) => s.pieces;
/** sets from «Ящик ништяков» (boss "box"): a box opened for achievement points drops a piece with BOX_TATTOO_CHANCE */
export const BOX_TATTOO_CHANCE = 0.2;
const boxSet = (id: string, name: string, weapon: string, damage: number): TattooSet => ({ ...solid(id, name, "box", "pacan", weapon, damage) });

export const TATTOO_SETS: TattooSet[] = [
  ...DATSIK_SETS(),
  solid("taiga", "Тайга", "kedr", "pacan", "gpu", 30), solid("roots", "Корни", "kedr", "avtor", "gpu", 25),
  solid("shark", "Акулья пасть", "mugo", "pacan", "keyboard", 40), solid("kraken", "Кракен", "mugo", "avtor", "gpu", 45),
  solid("cash", "Нал", "garkusha", "pacan", "keyboard", 70), solid("gold", "Золотой запас", "garkusha", "avtor", "rug-pull-gun", 50),
  solid("ring", "Ринг", "bebyakyan", "pacan", "keyboard", 55), solid("fire", "Огненный кулак", "bebyakyan", "avtor", "rug-pull-gun", 100),
  solid("izba", "Изба", "babafey", "pacan", "gpu", 110), solid("firebird", "Жар-птица", "babafey", "avtor", "rug-pull-gun", 70),
  solid("jackpot", "Джекпот", "vodovoz", "pacan", "gpu", 140), solid("sunrise", "Восход", "vodovoz", "avtor", "rug-pull-gun", 180),
  solid("safe", "Сейф", "knyaz", "pacan", "rug-pull-gun", 170), solid("realm", "Княжество", "knyaz", "avtor", "rug-pull-gun", 170),
  solid("ducky", "Уточка", "vadim", "pacan", "gpu", 180), solid("racer", "Тачка", "vadim", "avtor", "rug-pull-gun", 200),
  solid("dragon", "Дракон додзё", "botsman", "pacan", "gpu", 250), solid("cyber", "Кибер", "botsman", "avtor", "rug-pull-gun", 250),
  // Утилизатор: tattoos in «Пацанский» and «Блатной», his thing in «Авторитетный» (bosses.ts thingsMode)
  solid("ut-acid", "Кислота", "utilizator", "pacan", "gpu", 190), solid("ut-storm", "Гроза", "utilizator", "blat", "rug-pull-gun", 350),
  // Солнце (the user 2026-11-24): a set in every mode; «Авторитетный» also drops his things (bosses.ts thingsMode)
  solid("kuznya", "Кузня", "solntse", "pacan", "rug-pull-gun", 750),
  { ...solid("zatmenie", "Затмение", "solntse", "blat", "gpu", 300), extra: [{ weapon: "rug-pull-gun", damage: 1000 }] },
  solid("ozhog", "Ожог", "solntse", "avtor", "rug-pull-gun", 1000),
  // Пепе (the event boss, content/bosses.ts EVENT_FIGHTS): one piece per win, «Пацанский» only
  solid("swamp", "Болото", "pepe", "pacan", "rug-pull-gun", 100),
  // Нитка (the mentor, the user 2026-11-25): light sets on bare skin — «Игла» +30 Ствол +50 Нож, «Шов» +55 Ствол +40 Нож,
  // «Портной» +100 Пушка +40 Нож
  { ...solid("igla", "Игла", "nitka", "pacan", "gpu", 30), extra: [{ weapon: "keyboard", damage: 50 }] },
  { ...solid("shov", "Шов", "nitka", "blat", "gpu", 55), extra: [{ weapon: "keyboard", damage: 40 }] },
  { ...solid("portnoy", "Портной", "nitka", "avtor", "rug-pull-gun", 100), extra: [{ weapon: "keyboard", damage: 40 }] },
  // Фокус (the user's table 2026-11-23: «Пацанский» +420 Пушка, «Авторитетный» +270 Ствол; drawn 2026-11-27 as 90s prison ink)
  solid("disketa", "Дискета", "fokus", "pacan", "rug-pull-gun", 420), solid("pautina", "Паутина", "fokus", "avtor", "gpu", 270),
  // Химик (the mentor, 30 000 000 HP — as Боцман: ~250 a set) and Псих (100 000 000 HP — between Боцман and Утилизатор:
  // ~300 a set), the bonuses scaled by HP from the bosses before them (the user 2026-11-27)
  // Химик: «Яд» (~85% of the skin), «Формула» — a light net of molecules on bare skin
  { ...solid("yad", "Яд", "himik", "pacan", "gpu", 200), extra: [{ weapon: "keyboard", damage: 50 }] },
  { ...solid("formula", "Формула", "himik", "avtor", "rug-pull-gun", 220), extra: [{ weapon: "keyboard", damage: 50 }] },
  // Псих (the mentor, the user 2026-11-27): «Порезы» in «Пацанский», «Безумие» in «Авторитетный»
  { ...solid("porezy", "Порезы", "psih", "pacan", "gpu", 250), extra: [{ weapon: "keyboard", damage: 60 }] },
  { ...solid("bezumie", "Безумие", "psih", "avtor", "rug-pull-gun", 300), extra: [{ weapon: "keyboard", damage: 60 }] },
  // Тося's sets (boss "tosya"): every pie he sells holds one piece (content/tosya.ts)
  solid("oven", "Пирожковая", "tosya", "pacan", "gpu", 200), solid("maid", "Горничная", "tosya", "pacan", "keyboard", 150),
  solid("yakuza", "Кухня якудзы", "tosya", "pacan", "rug-pull-gun", 300),
  boxSet("samurai", "Самурай", "rug-pull-gun", 300), boxSet("viking", "Викинг", "rug-pull-gun", 300), boxSet("inferno", "Преисподняя", "rug-pull-gun", 300),
  // the «Ящики со взломом» event (content/heist.ts, boss "heist"): a piece now and then from a picked box
  solid("dynamite", "Динамит", "heist", "pacan", "rug-pull-gun", 300), solid("masks", "Маски", "heist", "pacan", "gpu", 200),
  solid("nightshift", "Ночная смена", "heist", "pacan", "keyboard", 100),
  // «Колесо удачи» (content/fortune.ts FORTUNE_BAGS, boss "fortune"): one set per bag, a piece with BAG_TATTOO_CHANCE
  solid("luck", "Фарт", "fortune", "pacan", "keyboard", 150), solid("hustler", "Барыга", "fortune", "pacan", "gpu", 200),
  solid("katran", "Катран", "fortune", "pacan", "rug-pull-gun", 300), solid("smotr", "Смотрящий", "fortune", "pacan", "rug-pull-gun", 400),
  // «Захват» (content/raids.ts RAID_BAGS, boss "raids"): the bag of each yard, opened for its flags, holds its set
  solid("garages", "Гаражи", "raids", "pacan", "gpu", 250), solid("industry", "Промзона", "raids", "pacan", "rug-pull-gun", 350),
  solid("market", "Рынок", "raids", "pacan", "gpu", 350), solid("blocks", "Панельки", "raids", "pacan", "rug-pull-gun", 450),
  solid("oldtown", "Старый центр", "raids", "pacan", "rug-pull-gun", 600),
  // poker's cases (content/games.ts POKER_CASES, boss "poker"): one set a case
  solid("pk-mast", "Масть", "poker", "pacan", "gpu", 300), solid("pk-bluff", "Блеф", "poker", "pacan", "rug-pull-gun", 450),
  solid("pk-royal", "Роял-флеш", "poker", "pacan", "rug-pull-gun", 650),
  // «Сходняк» (content/shodnyak.ts SHOD_SETS, boss "shodnyak"): prizes of the top-3 clans of the week
  solid("shod-domes", "Купола", "shodnyak", "pacan", "rug-pull-gun", 500), solid("shod-bear", "Медведь", "shodnyak", "pacan", "gpu", 450),
  solid("shod-raven", "Ворон", "shodnyak", "pacan", "rug-pull-gun", 650),
  // «Зарубы» (content/zarub.ts, boss "zarub"): 9 sets a difficulty, from the bags opened for кольца
  ...(Object.keys(ZARUB_SETS) as ZarubMode[]).flatMap((m) => ZARUB_SETS[m].sets.map((z) => solid(z.id, z.name, "zarub", m, ZARUB_SETS[m].weapon, z.damage))),
];
export const BOX_TATTOO_SETS = TATTOO_SETS.filter((s) => s.boss === "box");
/** where a set's pieces drop, in words: «с Дацкоу в «Пацанском»» / «из Ящика ништяков» */
export const tattooSource = (s: TattooSet, bossName: (id: string) => string | undefined) =>
  s.boss === "box" ? "из Ящика ништяков (шанс 20%)" : s.boss === "tosya" ? "из пирожков Тоси" : s.boss === "heist" ? "из ящиков ивента «Взлом»" : s.boss === "fortune" ? "из сумок «Колеса удачи»" : s.boss === "raids" ? "из сумок за флаги «Захвата»" : s.boss === "shodnyak" ? "за топ-3 клана на «Сходняке»" : s.boss === "poker" ? "из чемоданов покера" : s.boss === "zarub" ? "из сумок Заруб" : `с ${bossName(s.boss) ?? s.boss} (${TATTOO_MODE_SHORT[s.mode]})`;

export const TATTOO_IDS = TATTOO_SETS.flatMap((s) => s.pieces.map((p) => p.id));
export const tattooSetOf = (id: string) => TATTOO_SETS.find((s) => s.pieces.some((p) => p.id === id));
export const tattooPiece = (id: string) => TATTOO_SETS.flatMap((s) => s.pieces).find((p) => p.id === id);
export const tattooSetsOfBoss = (bossId: string) => TATTOO_SETS.filter((s) => s.boss === bossId);
