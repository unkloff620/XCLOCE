/*
 * «Ходки» — the clans take the district's yards. Five yards, one after another (the next opens when the one before is
 * taken). A yard has six ordinary buildings and its main building (twice as big, at the top). A building is taken by
 * fights like the boss fights (weapons); a taken building gives authority and roubles, all of a yard — clan experience,
 * authority and the yard's flag (the flags open the bags of tattoo sets).
 * The fights are each player's own (like a boss: weapons, the building's HP); every win counts for the clan, and the
 * clan takes a building with enough wins — then the next one (from the bottom up, the main one last).
 */

export type BuildingKind = "garage" | "barrack" | "khrush" | "kiosk" | "boiler" | "shop" | "main";
export const BUILDING_NAMES: Record<BuildingKind, string> = {
  garage: "Гараж", barrack: "Барак", khrush: "Пятиэтажка", kiosk: "Ларёк", boiler: "Котельная", shop: "Магазин", main: "Главное здание",
};

export interface RaidBuilding {
  id: string;
  kind: BuildingKind;
  /** where it stands on the yard picture: the middle of its foot, % of the width and of the height */
  x: number; y: number;
  /** its width, % of the yard picture's width (the main building is bigger) */
  w: number;
}
export interface RaidYard {
  id: string;
  n: number;
  name: string;
  subtitle: string;
  /** wins over each of its buildings to take it (the main one — twice as many) */
  wins: number;
  buildings: RaidBuilding[];
}

/**
 * The plan of a yard, in the order of the attack: one building at the bottom, two above it, three above those, the main
 * one at the top (twice as big). `kinds` — the six ordinary ones, from the bottom up, left to right.
 */
// in % of the yard's ground picture (public/assets/raids/yard-ground2.webp, 1024×1536, drawn with places for them)
// a phone shows only the middle ~70% of the picture's width (it covers the screen), so the outer ones are pulled in a bit
const SPOTS = [
  { x: 55, y: 88, w: 16 },
  { x: 40.5, y: 74, w: 15 }, { x: 59.5, y: 74, w: 16 },
  { x: 31, y: 58, w: 15.5 }, { x: 51, y: 58, w: 18.5 }, { x: 71, y: 58, w: 17.5 },
];
const plan = (yard: string, kinds: BuildingKind[]): RaidBuilding[] => [
  ...kinds.map((kind, i) => ({ id: `${yard}-${i + 1}`, kind, ...SPOTS[i] })),
  { id: `${yard}-main`, kind: "main" as const, x: 50, y: 38, w: 29 },
];

export const RAID_YARDS: RaidYard[] = [
  { id: "garages", n: 1, name: "Гаражи", subtitle: "Ряды ракушек, где решают все вопросы", wins: 10, buildings: plan("garages", ["garage", "kiosk", "garage", "barrack", "garage", "boiler"]) },
  { id: "promzona", n: 2, name: "Промзона", subtitle: "Котельные, склады и ничейные трубы", wins: 20, buildings: plan("promzona", ["boiler", "garage", "shop", "boiler", "barrack", "kiosk"]) },
  { id: "rynok", n: 3, name: "Рынок", subtitle: "Ларьки, палатки и свои люди", wins: 30, buildings: plan("rynok", ["kiosk", "shop", "kiosk", "shop", "kiosk", "garage"]) },
  { id: "panelki", n: 4, name: "Панельки", subtitle: "Пятиэтажки, лавочки и бабки на страже", wins: 40, buildings: plan("panelki", ["khrush", "barrack", "khrush", "shop", "khrush", "kiosk"]) },
  { id: "center", n: 5, name: "Центр района", subtitle: "Главный двор. Кто держит его — держит район", wins: 50, buildings: plan("center", ["shop", "khrush", "shop", "khrush", "boiler", "khrush"]) },
];
export const raidYardById = (id: string) => RAID_YARDS.find((y) => y.id === id);

/**
 * The life of a yard (on every yard's ground, in % of its picture): trees swaying in the wind and little people walking
 * slowly back and forth along the paths (public/assets/raids/tree<n>.webp, man<n>.webp).
 */
export const YARD_TREES: { n: number; x: number; y: number; w: number }[] = [
  { n: 1, x: 19, y: 50, w: 10 }, { n: 2, x: 82, y: 41, w: 6 }, { n: 3, x: 22, y: 81, w: 8 },
  { n: 1, x: 79, y: 87, w: 9 }, { n: 3, x: 67, y: 30, w: 7 },
];
export const YARD_WALKERS: { n: number; from: [number, number]; to: [number, number]; s: number }[] = [
  { n: 1, from: [20, 64.5], to: [44, 64], s: 26 },
  { n: 2, from: [46, 77.5], to: [63, 75.5], s: 30 },
  { n: 3, from: [40, 46], to: [47, 55], s: 22 },
  { n: 4, from: [33, 89.5], to: [53, 92], s: 24 },
  { n: 5, from: [60, 44], to: [74, 49.5], s: 28 },
];

/** a win over a building gives (the yard's number makes it bigger): authority and roubles */
export const buildingReward = (yardN: number, main: boolean) => ({ xp: (main ? 600 : 250) * yardN, rub: (main ? 5_000 : 2_000) * yardN });
/** wins over a building to take it: the yard's count (the main one — twice as many) */
export const buildingWins = (y: RaidYard, main: boolean) => y.wins * (main ? 2 : 1);

/** the building's HP in one fight */
export const BUILDING_HP = 100_000;
export const MAIN_HP = 150_000;
export const buildingHp = (main: boolean) => (main ? MAIN_HP : BUILDING_HP);
/** a taken yard gives each clan member who won a fight there: authority and the yard's flag; the clan — its experience */
export const yardReward = (n: number) => ({ clanXp: 1_000 * n, xp: 2_000 * n, flag: flagId(n) });
/** the yards' flags (items): «Флаг двора» with 1…5 stars, the bags of tattoo sets are opened for them */
export const flagId = (n: number) => `raid-flag-${n}`;
export const FLAG_IDS = [1, 2, 3, 4, 5].map(flagId);
export const buildingById = (id: string) => {
  for (const y of RAID_YARDS) { const b = y.buildings.find((x) => x.id === id); if (b) return { yard: y, b }; }
  return null;
};
