/*
 * «Ходки» — the clans take the district's yards. Five yards, one after another (the next opens when the one before is
 * taken). A yard has six ordinary buildings and its main building (twice as big, at the top). A building is taken by
 * fights like the boss fights (weapons); a taken building gives authority and roubles, all of a yard — clan experience,
 * authority and the yard's flag (the flags open the bags of tattoo sets).
 * The fights are each player's own (like a boss: weapons, the building's HP); every win counts for the clan, and the
 * clan takes a building with enough wins — then the next one (from the bottom up, the main one last).
 */

export type BuildingKind = "garage" | "barrack" | "khrush" | "kiosk" | "boiler" | "shop" | "main"
  // the artist's yards
  | "checkpoint" | "tanks" | "pipes" | "office" | "warehouse" | "shed" | "tower" | "booth" | "workshop" | "tent" | "row" | "pavilion";
export const BUILDING_NAMES: Record<BuildingKind, string> = {
  garage: "Гараж", barrack: "Барак", khrush: "Пятиэтажка", kiosk: "Ларёк", boiler: "Котельная", shop: "Магазин", main: "Главное здание",
  checkpoint: "КПП", tanks: "Цистерны", pipes: "Теплотрасса", office: "Контора", warehouse: "Склад",
  shed: "Сарай", tower: "Вышка", booth: "Будка", workshop: "Цех", tent: "Палатка", row: "Торговый ряд", pavilion: "Павильон",
};
/** «… захвачен / захвачена / захвачены!» */
export const takenWord = (k: BuildingKind) => (["boiler", "khrush", "pipes", "office", "tower", "booth", "tent"].includes(k) ? "захвачена" : k === "tanks" ? "захвачены" : "захвачен");

export interface RaidBuilding {
  id: string;
  kind: BuildingKind;
  /** where it stands on the yard picture: the middle of its foot, % of the width and of the height */
  x: number; y: number;
  /** its width, % of the yard picture's width (the main building is bigger) */
  w: number;
  /** its own picture in an artist's yard (<art>/b-<pic>.webp), when two buildings of a kind look different */
  pic?: string;
}
export interface RaidYard {
  id: string;
  n: number;
  name: string;
  subtitle: string;
  /** wins over each of its buildings to take it */
  wins: number;
  /** drawn by the artist as layers: its ground and its own buildings in public/assets/raids/<art>/ (build-yard-art.py).
   *  A yard without its art is closed for now («Закрыто» on its card) */
  art?: string;
  buildings: RaidBuilding[];
}

/**
 * The plan of a yard, in the order of the attack: one building at the bottom, two above it, three above those, then
 * rows of three more (yard n has n−1 of them: 7, 10, 13, 16, 19 buildings with the main one), the main one at the top
 * (twice as big). `kinds` — the ordinary ones, from the bottom up, left to right.
 *
 * The ground: yard-ground2.webp (1024×1536, drawn with places for one, two, three buildings and the main one). A bigger
 * yard is the same picture with its band of three places (GROUND_BAND) repeated: its upper half, the band k more
 * times, its lower half (tools/raids/build-grounds.py → yard-ground-<n>.webp). The positions below are in % of the
 * width and of THAT yard's own ground height.
 */
// in px of the 1024×1536 ground: the band with the row of three (repeated in the bigger yards)
export const GROUND_W = 1024, GROUND_H = 1536, GROUND_BAND = { y: 768, h: 246 };
const SPOTS = [
  { x: 55, y: 88, w: 16 },
  { x: 40.5, y: 74, w: 15 }, { x: 59.5, y: 74, w: 16 },
  { x: 31, y: 58, w: 15.5 }, { x: 51, y: 58, w: 18.5 }, { x: 71, y: 58, w: 17.5 },
];
/** the extra rows of three of yard n */
export const extraRows = (n: number) => Math.max(0, n - 1);
/** yard n's ground height, px */
export const groundH = (n: number) => GROUND_H + extraRows(n) * GROUND_BAND.h;
/** a point of the 1536-high ground (y in %) → y in % of yard n's ground: below the band's top it moves down by the bands */
export const groundY = (n: number, yPct: number) => {
  const px = (yPct / 100) * GROUND_H;
  return ((px >= GROUND_BAND.y ? px + extraRows(n) * GROUND_BAND.h : px) / groundH(n)) * 100;
};
const plan = (yard: string, n: number, kinds: BuildingKind[]): RaidBuilding[] => {
  const k = extraRows(n);
  const spots = [
    ...SPOTS.map((p) => ({ ...p, y: groundY(n, p.y) })),
    // the extra rows: the row of three again, each one band higher (on the band's copies above the first one)
    ...Array.from({ length: k }, (_, j) => SPOTS.slice(3).map((p) => ({ ...p, y: (((p.y / 100) * GROUND_H + (k - 1 - j) * GROUND_BAND.h) / groundH(n)) * 100 }))).flat(),
  ];
  return [
    ...kinds.map((kind, i) => ({ id: `${yard}-${i + 1}`, kind, ...spots[i] })),
    { id: `${yard}-main`, kind: "main" as const, x: 50, y: groundY(n, 38), w: 29 },
  ];
};

const G: BuildingKind = "garage", K: BuildingKind = "kiosk", B: BuildingKind = "barrack", O: BuildingKind = "boiler", S: BuildingKind = "shop", H: BuildingKind = "khrush";
/** every building is taken with WINS wins; each next yard has one building more (7, 8, 9, 10, 11 with the main one) */
export const WINS = 10;
export const RAID_YARDS: RaidYard[] = [
  // the artist's yard (tools/raids/source/garages, build-yard-art.py prints these places): from the gate up
  // the artist's yards (tools/raids/source2/<yard>/, build-yard-v2.py prints these places): from the gate up, the main one last
  { id: "garages", n: 1, name: "Гаражи", subtitle: "Ряды ракушек, где решают все вопросы", wins: WINS, art: "garages", buildings: [
    { id: "garages-1", kind: "shed", x: 39.55, y: 65.93, w: 12.1 },
    { id: "garages-2", kind: "tower", pic: "tower1", x: 71.38, y: 64.53, w: 13.15 },
    { id: "garages-3", kind: "tower", pic: "tower2", x: 23.55, y: 63.73, w: 13.2 },
    { id: "garages-4", kind: "garage", pic: "garage1", x: 80.4, y: 50.47, w: 18.5 },
    { id: "garages-5", kind: "garage", pic: "garage2", x: 61.32, y: 49.73, w: 19.35 },
    { id: "garages-6", kind: "booth", x: 39.15, y: 48.77, w: 19.5 },
    { id: "garages-7", kind: "boiler", x: 18.95, y: 46.63, w: 16.8 },
    { id: "garages-8", kind: "warehouse", x: 82.1, y: 41.53, w: 23.3 },
    { id: "garages-9", kind: "office", x: 21.02, y: 35.0, w: 23.75 },
    { id: "garages-main", kind: "main", x: 55.33, y: 31.93, w: 40.45 },
  ] },
  { id: "promzona", n: 2, name: "Промзона", subtitle: "Котельные, склады и ничейные трубы", wins: WINS, art: "promzona", buildings: [
    { id: "promzona-1", kind: "workshop", pic: "workshop1", x: 44.77, y: 71.3, w: 23.15 },
    { id: "promzona-2", kind: "tower", x: 74.7, y: 68.7, w: 14.3 },
    { id: "promzona-3", kind: "warehouse", pic: "warehouse1", x: 24.02, y: 63.23, w: 26.65 },
    { id: "promzona-4", kind: "warehouse", pic: "warehouse2", x: 81.3, y: 55.23, w: 27.8 },
    { id: "promzona-5", kind: "workshop", pic: "workshop2", x: 45.9, y: 54.63, w: 36.8 },
    { id: "promzona-6", kind: "boiler", x: 19.57, y: 44.3, w: 27.85 },
    { id: "promzona-7", kind: "warehouse", pic: "warehouse3", x: 53.55, y: 40.67, w: 26.3 },
    { id: "promzona-8", kind: "office", x: 83.53, y: 40.47, w: 23.75 },
    { id: "promzona-9", kind: "warehouse", pic: "warehouse4", x: 29.58, y: 30.63, w: 22.55 },
    { id: "promzona-main", kind: "main", x: 65.67, y: 30.63, w: 46.25 },
  ] },
  { id: "rynok", n: 3, name: "Рынок", subtitle: "Ларьки, палатки и свои люди", wins: WINS, art: "rynok", buildings: [
    { id: "rynok-1", kind: "kiosk", pic: "kiosk1", x: 36.95, y: 71.33, w: 18.5 },
    { id: "rynok-2", kind: "tower", x: 72.82, y: 69.33, w: 20.25 },
    { id: "rynok-3", kind: "tent", x: 16.8, y: 61.8, w: 17.6 },
    { id: "rynok-4", kind: "kiosk", pic: "kiosk2", x: 49.35, y: 59.97, w: 15.5 },
    { id: "rynok-5", kind: "row", pic: "row1", x: 59.85, y: 50.8, w: 23.8 },
    { id: "rynok-6", kind: "row", pic: "row2", x: 18.62, y: 48.47, w: 25.55 },
    { id: "rynok-7", kind: "row", pic: "row3", x: 83.8, y: 44.97, w: 23.8 },
    { id: "rynok-8", kind: "row", pic: "row4", x: 47.75, y: 42.5, w: 21.1 },
    { id: "rynok-9", kind: "row", pic: "row5", x: 68.1, y: 37.03, w: 21.1 },
    { id: "rynok-10", kind: "row", pic: "row6", x: 34.9, y: 36.6, w: 21.1 },
    { id: "rynok-11", kind: "pavilion", pic: "pavilion1", x: 17.4, y: 33.6, w: 26.8 },
    { id: "rynok-12", kind: "pavilion", pic: "pavilion2", x: 85.12, y: 31.3, w: 25.25 },
    { id: "rynok-main", kind: "main", x: 50.75, y: 25.1, w: 46.0 },
  ] },
  { id: "panelki", n: 4, name: "Панельки", subtitle: "Пятиэтажки, лавочки и бабки на страже", wins: WINS, buildings: plan("panelki", 4, [H, B, H, S, H, K, H, B, H]) },
  { id: "center", n: 5, name: "Центр района", subtitle: "Главный двор. Кто держит его — держит район", wins: WINS, buildings: plan("center", 5, [S, H, S, H, O, H, S, H, K, H]) },
];
/**
 * The lights of an artist's yard (x, y — the lamp's head, % of its ground picture): street lamps glow and breathe, a
 * few of them buzz and die out for a moment; the gate's beacons blink in turns; the sign's lamps flicker
 * (raids.tsx YardLights, screens.css «rd-lamp»).
 */
export type YardLight = { x: number; y: number; k?: "buzz" | "beacon" | "sign" | "moths" | "spark" | "smoke" };
export const YARD_LIGHTS: Record<string, YardLight[]> = {
  // the yards were redrawn (2026-11-22): their lamps are to be placed anew on the new grounds
};

/** the yard can be raided (its art is in; the others are «Закрыто» for now) */
export const yardReady = (y: RaidYard) => !!y.art;

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

/*
 * The rules of a capture (the yard's number n, the building's row from the bottom):
 *  - the rows grow harder: the bottom building ×1, the two above it ×1.5, the three above those ×2, the main one ×3 —
 *    its HP and its rewards; the later yards give more (YARD_K) and need more wins (RaidYard.wins);
 *  - a taken building: the clan gets its experience and influence, every member who won a fight over it in this
 *    capture — the yard's flags; the whole yard: a bonus on top (clan experience, influence, flags);
 *  - a taken yard rests for RAID_YARD_COOLDOWN_MS, then it can be taken again (from the bottom building);
 *  - the clan's level comes only from this experience (CLAN_RAID_XP): yard №1 once — level 2, all five once — level 10,
 *    all five ~10 times — level 100.
 */
/** the yards' weight: the rewards of yard n are YARD_K[n-1] times those of the first one */
export const YARD_K = [1, 1.4, 1.8, 2.2, 2.6];
const yk = (n: number) => YARD_K[n - 1] ?? 1;
/** the building's row multiplier: its HP and its rewards (from the bottom up: 1, 1.5, 1.5, 2, 2, 2; the main one 3) */
export const rowK = (b: RaidBuilding) => {
  if (b.kind === "main") return 3;
  const i = Number(b.id.split("-").pop()) - 1;
  return i === 0 ? 1 : i <= 2 ? 1.5 : 2;
};
const r10 = (x: number) => Math.round(x / 10) * 10;
/** a win over a building gives (one fight): authority and roubles */
export const buildingReward = (yardN: number, b: RaidBuilding) => ({ xp: r10(250 * yardN * rowK(b)), rub: r10(2_000 * yardN * rowK(b)) });
/** wins over a building to take it (the yard's count — the same for all its buildings; the main one is harder by its HP) */
export const buildingWins = (y: RaidYard) => y.wins;

/** the building's HP in one fight: 100 000 × its row */
export const BUILDING_HP = 33_000;
export const buildingHp = (b: RaidBuilding) => BUILDING_HP * rowK(b);
/*
 * Influence (влияние): the clan's weight in a yard, it only grows. Every capture adds it: a full capture of yard n gives
 * YARD_INFLUENCE[n-1] — 70% spread over its buildings by their rows, the rest for the whole yard. The clan with the
 * most influence in a yard stands on its card (the stamp in the corner).
 */
export const YARD_INFLUENCE = [390, 870, 1_510, 2_025, 2_860];
const r5 = (x: number) => Math.round(x / 5) * 5;
const rowSum = (y: RaidYard) => y.buildings.reduce((t, b) => t + rowK(b), 0);
/** a full capture of yard n: the clan's experience and the flags (of one who won over every building) */
export const YARD_CLAN_XP = [7_820, 17_420, 30_280, 40_520, 57_140];
export const YARD_FLAGS = [20, 45, 75, 100, 140];
/** the most flags of yard n one can hold (no more are given above it) */
export const FLAG_MAX = [80, 180, 300, 400, 560];
/** 70% of a yard's total spread over its buildings by their rows, the rest for the whole yard */
const share = (total: number, n: number, b: RaidBuilding, round: (x: number) => number) => round(total * 0.7 * rowK(b) / rowSum(RAID_YARDS[n - 1]));
/** a taken building: the clan's experience and influence; every member who won a fight over it — the yard's flags */
export const buildingTake = (yardN: number, b: RaidBuilding) => ({
  clanXp: share(YARD_CLAN_XP[yardN - 1] ?? 0, yardN, b, r10), influence: share(YARD_INFLUENCE[yardN - 1] ?? 0, yardN, b, r5),
  flags: Math.max(1, share(YARD_FLAGS[yardN - 1] ?? 0, yardN, b, Math.round)), flag: flagId(yardN),
});
/** the whole yard taken: a bonus on top — the rest of the yard's totals */
export const yardReward = (n: number) => {
  const y = RAID_YARDS[n - 1];
  const sum = (f: (t: ReturnType<typeof buildingTake>) => number) => y.buildings.reduce((t, b) => t + f(buildingTake(n, b)), 0);
  return {
    clanXp: (YARD_CLAN_XP[n - 1] ?? 0) - sum((t) => t.clanXp), influence: (YARD_INFLUENCE[n - 1] ?? 0) - sum((t) => t.influence),
    flags: (YARD_FLAGS[n - 1] ?? 0) - sum((t) => t.flags), flag: flagId(n),
  };
};
/** a full capture of yard n: the clan's experience and influence, the flags of one who won over every building */
export const yardTotal = (y: RaidYard) => {
  const bonus = yardReward(y.n);
  return y.buildings.reduce((t, b) => {
    const r = buildingTake(y.n, b);
    return { clanXp: t.clanXp + r.clanXp, influence: t.influence + r.influence, flags: t.flags + r.flags };
  }, { clanXp: bonus.clanXp, influence: bonus.influence, flags: bonus.flags });
};
/** a taken yard rests this long before it can be taken again */
export const RAID_YARD_COOLDOWN_MS = 2 * 3_600_000;

/** the yards' flags (items): «Флаг двора» with 1…5 stars, the bags of tattoo sets are opened for them */
export const flagId = (n: number) => `raid-flag-${n}`;
export const FLAG_IDS = [1, 2, 3, 4, 5].map(flagId);
/**
 * «Сумки за флаги»: the bag of yard n is opened for RAID_BAG_PRICES[n-1] of its flags and gives one piece of its tattoo set
 * the player does not have yet; when the set is whole, roubles instead (RAID_BAG_RUB × n).
 */
export const RAID_BAG_SETS = ["garages", "industry", "market", "blocks", "oldtown"];
export const RAID_BAG_PRICES = [20, 45, 75, 100, 140];
export const RAID_BAG_RUB = 5_000;
export const buildingById = (id: string) => {
  for (const y of RAID_YARDS) { const b = y.buildings.find((x) => x.id === id); if (b) return { yard: y, b }; }
  return null;
};
