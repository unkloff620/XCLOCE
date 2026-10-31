/**
 * Tattoo sets («наколки»). A piece drops from its boss (one per win in the set's fight mode, a piece the player does not
 * have yet), lies in the inventory and is inked on (or taken off) for free in the hero editor («Наколки»). Owning the
 * whole set adds its bonus to a weapon (server/systems/collection.ts setBonuses). The art: tools/rig/build-tattoos.py.
 * `part` — the place in the hero editor (client/screens/stylist.tsx): HEAD, TORSO, SHOULDER_L/R, ARM_L/R, HAND, LEG_L/R.
 */
export interface TattooPiece { id: string; name: string; part: string }
export interface TattooSet { id: string; name: string; boss: string; mode: "pacan" | "blat" | "avtor"; bonus: { weapon: string; damage: number }; pieces: TattooPiece[] }

const DATSIK_SETS: TattooSet[] = [
  {
    id: "ice", name: "Вечная мерзлота", boss: "datsik", mode: "pacan", bonus: { weapon: "keyboard", damage: 50 },
    pieces: [
      { id: "tat-ice-face", name: "Снежинка на скуле", part: "HEAD" },
      { id: "tat-ice-neck", name: "Ледяное ожерелье", part: "HEAD" },
      { id: "tat-ice-chest-l", name: "Белый медведь", part: "TORSO" },
      { id: "tat-ice-chest-r", name: "Волк", part: "TORSO" },
      { id: "tat-ice-belly", name: "«Вечная мерзлота»", part: "TORSO" },
      { id: "tat-ice-shoulder-l", name: "Снежная мандала (левое плечо)", part: "SHOULDER_L" },
      { id: "tat-ice-shoulder-r", name: "Снежная мандала (правое плечо)", part: "SHOULDER_R" },
      { id: "tat-ice-biceps-l", name: "Горы и северное сияние", part: "SHOULDER_L" },
      { id: "tat-ice-biceps-r", name: "Заснеженный лес", part: "SHOULDER_R" },
      { id: "tat-ice-elbow-l", name: "Иней на локте (левом)", part: "ARM_L" },
      { id: "tat-ice-elbow-r", name: "Иней на локте (правом)", part: "ARM_R" },
      { id: "tat-ice-forearm-l", name: "Сосульки", part: "ARM_L" },
      { id: "tat-ice-forearm-r", name: "Полярная сова", part: "ARM_R" },
      { id: "tat-ice-hand-l", name: "Снежинка на кисти", part: "ARM_L" },
      { id: "tat-ice-hand-r", name: "Медведь на льдине", part: "HAND" },
      { id: "tat-ice-knee-l", name: "Снежинка на колене (левом)", part: "LEG_L" },
      { id: "tat-ice-knee-r", name: "Снежинка на колене (правом)", part: "LEG_R" },
      { id: "tat-ice-shin-l", name: "Мороз и горы (левая нога)", part: "LEG_L" },
      { id: "tat-ice-shin-r", name: "Мороз и горы (правая нога)", part: "LEG_R" },
      { id: "tat-ice-foot-l", name: "Снежный след (левая стопа)", part: "LEG_L" },
      { id: "tat-ice-foot-r", name: "Снежный след (правая стопа)", part: "LEG_R" },
    ],
  },
  {
    id: "king", name: "Ледяной король", boss: "datsik", mode: "avtor", bonus: { weapon: "gpu", damage: 100 },
    pieces: [
      { id: "tat-king-face", name: "Ледяная корона на виске", part: "HEAD" },
      { id: "tat-king-neck", name: "Корона из сосулек", part: "HEAD" },
      { id: "tat-king-chest-l", name: "Снежный барс", part: "TORSO" },
      { id: "tat-king-chest-r", name: "Ледяной дракон", part: "TORSO" },
      { id: "tat-king-belly", name: "«Ледяной король»", part: "TORSO" },
      { id: "tat-king-shoulder-l", name: "Ледяные кристаллы (левое плечо)", part: "SHOULDER_L" },
      { id: "tat-king-shoulder-r", name: "Ледяные кристаллы (правое плечо)", part: "SHOULDER_R" },
      { id: "tat-king-biceps-l", name: "Ледяной замок", part: "SHOULDER_L" },
      { id: "tat-king-biceps-r", name: "Корона и меч", part: "SHOULDER_R" },
      { id: "tat-king-elbow-l", name: "Ледяные соты (левый локоть)", part: "ARM_L" },
      { id: "tat-king-elbow-r", name: "Ледяные соты (правый локоть)", part: "ARM_R" },
      { id: "tat-king-forearm-l", name: "Замёрзшая роза", part: "ARM_L" },
      { id: "tat-king-forearm-r", name: "Хвост дракона", part: "ARM_R" },
      { id: "tat-king-hand-l", name: "Корона на кисти", part: "ARM_L" },
      { id: "tat-king-hand-r", name: "Свернувшийся дракон", part: "HAND" },
      { id: "tat-king-knee-l", name: "Кристальная розетка (левое колено)", part: "LEG_L" },
      { id: "tat-king-knee-r", name: "Кристальная розетка (правое колено)", part: "LEG_R" },
      { id: "tat-king-shin-l", name: "Ледопад (левая нога)", part: "LEG_L" },
      { id: "tat-king-shin-r", name: "Ледопад (правая нога)", part: "LEG_R" },
      { id: "tat-king-foot-l", name: "Ледяные шипы (левая стопа)", part: "LEG_L" },
      { id: "tat-king-foot-r", name: "Ледяные шипы (правая стопа)", part: "LEG_R" },
    ],
  },
];

/** the fight mode's name in the dropping text («в «Пацанском»») */
export const TATTOO_MODE_NAME = { pacan: "Пацанском", blat: "Блатном", avtor: "Авторитетном" } as const;

/** the place on the body a piece takes («chest-l»): one tattoo per place — a new one there replaces the old */
export const tattooZone = (id: string) => id.split("-").slice(2).join("-");
/** the inked list with one tattoo per place (the last one wins) */
export function oneTattooPerZone(ids: string[]): string[] {
  const byZone = new Map<string, string>();
  for (const id of ids) byZone.set(tattooZone(id), id);
  return [...byZone.values()];
}

/**
 * The solid sets of the bosses after Дацкоу (tools/rig/build-tattoos.py SOLID): 21 places that join each other — the
 * further the boss, the more of the body the set covers (Восток — a full suit).
 */
const ZONES: [string, string, string][] = [
  ["face", "лицо", "HEAD"], ["neck", "шея", "HEAD"], ["chest-l", "левая грудь", "TORSO"], ["chest-r", "правая грудь", "TORSO"], ["belly", "живот", "TORSO"],
  ["shoulder-l", "левое плечо", "SHOULDER_L"], ["shoulder-r", "правое плечо", "SHOULDER_R"], ["biceps-l", "левый бицепс", "SHOULDER_L"], ["biceps-r", "правый бицепс", "SHOULDER_R"],
  ["elbow-l", "левый локоть", "ARM_L"], ["elbow-r", "правый локоть", "ARM_R"], ["forearm-l", "левое предплечье", "ARM_L"], ["forearm-r", "правое предплечье", "ARM_R"],
  ["hand-l", "левая кисть", "ARM_L"], ["hand-r", "правая кисть", "HAND"], ["knee-l", "левое колено", "LEG_L"], ["knee-r", "правое колено", "LEG_R"],
  ["shin-l", "левая голень", "LEG_L"], ["shin-r", "правая голень", "LEG_R"], ["foot-l", "левая стопа", "LEG_L"], ["foot-r", "правая стопа", "LEG_R"],
];
const solid = (id: string, name: string, boss: string, mode: TattooSet["mode"], weapon: string, damage: number): TattooSet => ({
  id, name, boss, mode, bonus: { weapon, damage },
  pieces: ZONES.map(([z, place, part]) => ({ id: `tat-${id}-${z}`, name: `${name}: ${place}`, part })),
});
export const TATTOO_SETS: TattooSet[] = [
  ...DATSIK_SETS,
  solid("taiga", "Тайга", "kedr", "pacan", "mouse", 60), solid("roots", "Корни", "kedr", "avtor", "gpu", 120),
  solid("shark", "Акулья пасть", "mugo", "pacan", "red-candle", 80), solid("kraken", "Кракен", "mugo", "avtor", "gpu", 150),
  solid("cash", "Нал", "garkusha", "pacan", "keyboard", 100), solid("gold", "Золотой запас", "garkusha", "avtor", "rug-pull-gun", 200),
  solid("ring", "Ринг", "bebyakyan", "pacan", "fist", 120), solid("fire", "Огненный кулак", "bebyakyan", "avtor", "rug-pull-gun", 250),
  solid("izba", "Изба", "babafey", "pacan", "keyboard", 150), solid("firebird", "Жар-птица", "babafey", "avtor", "rug-pull-gun", 300),
  solid("jackpot", "Джекпот", "vodovoz", "pacan", "gpu", 200), solid("sunrise", "Восход", "vodovoz", "avtor", "rug-pull-gun", 400),
];

export const TATTOO_IDS = TATTOO_SETS.flatMap((s) => s.pieces.map((p) => p.id));
export const tattooSetOf = (id: string) => TATTOO_SETS.find((s) => s.pieces.some((p) => p.id === id));
export const tattooPiece = (id: string) => TATTOO_SETS.flatMap((s) => s.pieces).find((p) => p.id === id);
export const tattooSetsOfBoss = (bossId: string) => TATTOO_SETS.filter((s) => s.boss === bossId);
