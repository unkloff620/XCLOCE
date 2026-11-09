/*
 * «Ходки» — the clans take the district's yards. Five yards, one after another (the next opens when the one before is
 * taken). A yard has six ordinary buildings and its main building (twice as big, at the top). A building is taken by
 * fights like the boss fights (weapons); a taken building gives authority and roubles, all of a yard — clan experience,
 * authority and the yard's flag (the flags open the bags of tattoo sets).
 * Step 1: the look (the yard cards, the yard with its buildings). The fights and the rewards come next.
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
  /** wins over the yard's buildings to take it (shown on the card) */
  wins: number;
  buildings: RaidBuilding[];
}

/**
 * The plan of a yard, in the order of the attack: one building at the bottom, two above it, three above those, the main
 * one at the top (twice as big). `kinds` — the six ordinary ones, from the bottom up, left to right.
 */
// in % of the yard's ground picture (public/assets/raids/yard-ground2.webp, 1024×1536, drawn with places for them)
const SPOTS = [
  { x: 56, y: 88, w: 20 },
  { x: 38.5, y: 74, w: 19 }, { x: 61, y: 74, w: 20 },
  { x: 27.5, y: 58, w: 19 }, { x: 51.5, y: 58, w: 23 }, { x: 77, y: 58, w: 22 },
];
const plan = (yard: string, kinds: BuildingKind[]): RaidBuilding[] => [
  ...kinds.map((kind, i) => ({ id: `${yard}-${i + 1}`, kind, ...SPOTS[i] })),
  { id: `${yard}-main`, kind: "main" as const, x: 50, y: 38, w: 34 },
];

export const RAID_YARDS: RaidYard[] = [
  { id: "garages", n: 1, name: "Гаражи", subtitle: "Ряды ракушек, где решают все вопросы", wins: 10, buildings: plan("garages", ["garage", "kiosk", "garage", "barrack", "garage", "boiler"]) },
  { id: "promzona", n: 2, name: "Промзона", subtitle: "Котельные, склады и ничейные трубы", wins: 20, buildings: plan("promzona", ["boiler", "garage", "shop", "boiler", "barrack", "kiosk"]) },
  { id: "rynok", n: 3, name: "Рынок", subtitle: "Ларьки, палатки и свои люди", wins: 30, buildings: plan("rynok", ["kiosk", "shop", "kiosk", "shop", "kiosk", "garage"]) },
  { id: "panelki", n: 4, name: "Панельки", subtitle: "Пятиэтажки, лавочки и бабки на страже", wins: 40, buildings: plan("panelki", ["khrush", "barrack", "khrush", "shop", "khrush", "kiosk"]) },
  { id: "center", n: 5, name: "Центр района", subtitle: "Главный двор. Кто держит его — держит район", wins: 50, buildings: plan("center", ["shop", "khrush", "shop", "khrush", "boiler", "khrush"]) },
];
export const raidYardById = (id: string) => RAID_YARDS.find((y) => y.id === id);
