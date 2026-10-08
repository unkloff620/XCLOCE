import type { Currency } from "./currencies.ts";

/*
 * Дом: оборудование на заднем плане и комнаты. Оба дают боевые бонусы.
 * Бонусы складываются: подсветка (по уровню), каждый купленный стол / монитор / кресло + все купленные комнаты.
 * Черновые цены и бонусы — правятся здесь.
 */

export interface Bonus {
  /** шанс крита, доля (0.05 = 5%) */
  critChance?: number;
  /** добавка к множителю крита (база ×1.5; 0.2 → ×1.7) */
  critDamage?: number;
  /** добавка к урону оружия, доля */
  damage?: number;
  /** +к лимиту энергии (только комнаты) */
  energyMax?: number;
  /** +урон кулака, единиц (только комнаты) */
  fistDamage?: number;
}

export const BASE_CRIT_MULT = 1.5;

export interface Price { currency: Currency; amount: number }

/** One thing for the room that is bought on its own (a desk, a monitor, a chair), in any order. */
export interface PieceDef {
  name: string;
  /** picture in public/assets/home */
  art: string;
  price: Price;
  /** bonus this piece gives while owned (pieces of one kind add up) */
  bonus: Bonus;
}

export interface EquipmentDef {
  id: string;
  name: string;
  description: string;
  /** sequential upgrades (RGB): price of each level and the total bonus on it */
  levels: { price: Price; bonus: Bonus }[];
  /** room things: what stands there for free … */
  base?: { name: string; art: string };
  /** … and the pieces bought one by one (piece k is bit k-1 of the owned mask) */
  pieces?: PieceDef[];
  /** monitors: every owned piece can stand at once (each has its own place); desk and chair: one at a time */
  multi?: boolean;
}

export const EQUIPMENT: EquipmentDef[] = [
  {
    id: "desk", name: "Стол", description: "Всё начинается со стола. Каждый купленный стол даёт свой бонус навсегда, а в комнату ставишь любой.",
    levels: [],
    base: { name: "Стол с Авито", art: "desk-001" },
    pieces: [
      { name: "Ореховый стандарт", art: "desk-002", price: { currency: "RUB", amount: 4000 }, bonus: { critChance: 0.02 } },
      { name: "Мраморный холд", art: "desk-003", price: { currency: "USD", amount: 30 }, bonus: { critChance: 0.01, damage: 0.03 } },
      { name: "Золотой памп", art: "desk-004", price: { currency: "SOL", amount: 0.2 }, bonus: { critChance: 0.02, critDamage: 0.1, damage: 0.03 } },
    ],
  },
  {
    // id stays "monitor2": players who bought monitors keep them (levels became pieces in migration v2-031)
    id: "monitor2", name: "Мониторы", description: "Один экран — для графика, второй — для чата, третий — чтобы видеть, куда бить. Каждый покупается отдельно и усиливает криты.",
    levels: [],
    base: { name: "Старый ламповый", art: "monitor-1" },
    multi: true,
    pieces: [
      { name: "Монитор справа", art: "monitor-right", price: { currency: "RUB", amount: 3000 }, bonus: { critDamage: 0.1 } },
      { name: "Монитор слева", art: "monitor-left", price: { currency: "USD", amount: 30 }, bonus: { critDamage: 0.1 } },
      { name: "Монитор по центру", art: "monitor-center", price: { currency: "SOL", amount: 0.15 }, bonus: { critDamage: 0.15 } },
    ],
  },
  {
    id: "chair", name: "Кресло", description: "Спина прямая — рука твёрдая. Каждое купленное кресло повышает шанс крита навсегда, а сидишь на любом.",
    levels: [],
    base: { name: "Табуретка", art: "seat-1" },
    pieces: [
      { name: "Офисное кресло", art: "chair-1", price: { currency: "RUB", amount: 2500 }, bonus: { critChance: 0.02 } },
      { name: "Геймерское кресло", art: "chair-2", price: { currency: "USD", amount: 25 }, bonus: { critChance: 0.02 } },
      { name: "Трон трейдера", art: "chair-3", price: { currency: "SOL", amount: 0.12 }, bonus: { critChance: 0.03 } },
    ],
  },
  {
    id: "rgb", name: "RGB-подсветка", description: "Всем известно: RGB даёт +15% к скиллу. У нас чуть скромнее.",
    levels: [
      { price: { currency: "RUB", amount: 1200 }, bonus: { critChance: 0.01 } },
      { price: { currency: "RUB", amount: 2400 }, bonus: { critChance: 0.02 } },
      { price: { currency: "USD", amount: 15 }, bonus: { critChance: 0.03, critDamage: 0.05 } },
    ],
  },
];

/**
 * Снято с продажи: системник за валюту заменён талантами оружия (content/talents.ts).
 * Уже купленные уровни продолжают давать бонус, но в «Технике» не показываются и не улучшаются.
 */
export const LEGACY_EQUIPMENT: EquipmentDef[] = [
  {
    id: "pc", name: "Мощный системник", description: "Рендерит удары быстрее, чем босс успевает моргнуть. Добавляет урон любому оружию.",
    levels: [
      { price: { currency: "RUB", amount: 5000 }, bonus: { damage: 0.03 } },
      { price: { currency: "USD", amount: 50 }, bonus: { damage: 0.06 } },
      { price: { currency: "SOL", amount: 0.25 }, bonus: { damage: 0.1 } },
    ],
  },
];

export interface RoomDef {
  id: string;
  name: string;
  description: string;
  price: Price | null;
  bonus: Bonus;
  /** a room that drops from a boss: it can be bought only after it dropped (chance per win that earned the pass) */
  drop?: { boss: string; chance: number };
}

export const ROOM_DEFS: RoomDef[] = [
  { id: "basic", name: "Каморка", description: "С чего все начинали: облезлые обои, старый стол, ламповый монитор и табуретка.", price: null, bonus: {} },
  { id: "neon", name: "Неоновая хата", description: "Обои с узором, кот на крыше и RGB-лента под потолком. Выпадает с Кедра. +5 к лимиту энергии.", price: { currency: "RUB", amount: 2000 }, bonus: { energyMax: 5 }, drop: { boss: "kedr", chance: 0.15 } },
  { id: "boxing", name: "Боксёрская", description: "Перчатки на стене, плакаты легенд и полка «для храбрости». Выпадает с Командате. +30 к урону кулака.", price: { currency: "RUB", amount: 4000 }, bonus: { fistDamage: 30 }, drop: { boss: "bebyakyan", chance: 0.15 } },
  { id: "office", name: "Офис трейдера", description: "Стеклянные стены, три графика и кофемашина. Даёт шанс крита.", price: { currency: "USD", amount: 40 }, bonus: { critChance: 0.03 } },
  { id: "penthouse", name: "Пентхаус To The Moon", description: "Вид на Луну, золото и бассейн из стейблкоинов. Урон и сила крита.", price: { currency: "SOL", amount: 0.5 }, bonus: { damage: 0.05, critDamage: 0.15 } },
];

export const equipmentById = (id: string) => EQUIPMENT.find((e) => e.id === id);
/** the room things bought piece by piece */
export const PIECE_EQUIPMENT = EQUIPMENT.filter((e) => e.pieces?.length);
export const hasPiece = (mask: number, k: number) => k >= 1 && ((mask >> (k - 1)) & 1) === 1;
export const piecesCount = (mask: number) => { let n = 0; for (let m = mask; m; m >>= 1) n += m & 1; return n; };
/**
 * What stands in the room. Desk / chair: the chosen piece (0 = the free one) if owned, else the newest owned.
 * Monitors: a mask of the shown monitors (decor), only owned ones; by default every owned monitor stands.
 */
export function placedOf(id: string, pieces: Record<string, number>, decor: Record<string, number> = {}): number {
  const e = equipmentById(id);
  const owned = pieces[id] ?? 0;
  const pick = decor[id];
  if (e?.multi) return typeof pick === "number" && pick >= 0 ? pick & owned : owned;
  if (typeof pick === "number" && (pick === 0 || hasPiece(owned, pick))) return pick;
  for (let k = e?.pieces?.length ?? 0; k >= 1; k--) if (hasPiece(owned, k)) return k;
  return 0;
}
/** the picture of what stands in the room (desk / chair) */
export const placedArt = (id: string, pieces: Record<string, number>, decor: Record<string, number> = {}) => {
  const e = equipmentById(id);
  const k = placedOf(id, pieces, decor);
  return k > 0 ? e?.pieces?.[k - 1]?.art : e?.base?.art;
};
export const roomById = (id: string) => ROOM_DEFS.find((r) => r.id === id);
/** the unlock key of a room that drops from a boss (stored with the shop unlocks) */
export const roomUnlockId = (id: string) => `room:${id}`;
/** extra energy limit the owned rooms give */
export const roomsEnergyBonus = (rooms: string[]) => rooms.reduce((n, id) => n + (roomById(id)?.bonus.energyMax ?? 0), 0);

export function addBonus(a: Bonus, b: Bonus): Bonus {
  return { critChance: (a.critChance ?? 0) + (b.critChance ?? 0), critDamage: (a.critDamage ?? 0) + (b.critDamage ?? 0), damage: (a.damage ?? 0) + (b.damage ?? 0), energyMax: (a.energyMax ?? 0) + (b.energyMax ?? 0), fistDamage: (a.fistDamage ?? 0) + (b.fistDamage ?? 0) };
}

/** Trophies: reward items that stand in the room by themselves and add a bonus while owned. */
export const TROPHIES: { id: string; bonus: Bonus }[] = [
  { id: "statue-close", bonus: { critDamage: 0.25 } },
];

/** Total bonus from equipment levels, owned rooms and trophies (weapon talents are added per weapon in combat). */
export function totalBonus(levels: Record<string, number>, rooms: string[], trophies: string[] = [], pieces: Record<string, number> = {}): Required<Bonus> {
  let b: Bonus = {};
  for (const e of [...EQUIPMENT, ...LEGACY_EQUIPMENT]) {
    if (e.pieces?.length) {
      e.pieces.forEach((pc, i) => { if (hasPiece(pieces[e.id] ?? 0, i + 1)) b = addBonus(b, pc.bonus); });
      continue;
    }
    const lv = levels[e.id] ?? 0;
    if (lv > 0) b = addBonus(b, e.levels[Math.min(lv, e.levels.length) - 1].bonus);
  }
  for (const id of rooms) b = addBonus(b, roomById(id)?.bonus ?? {});
  for (const t of TROPHIES) if (trophies.includes(t.id)) b = addBonus(b, t.bonus);
  return { critChance: Math.min(0.75, b.critChance ?? 0), critDamage: b.critDamage ?? 0, damage: b.damage ?? 0, energyMax: b.energyMax ?? 0, fistDamage: b.fistDamage ?? 0 };
}

/* ---------------- внешность ---------------- */
export const HAIR_STYLES = [
  { id: "bald", name: "Лысый" },
  { id: "sidepart", name: "Зачёс" },
  { id: "slick", name: "Кок" },
  { id: "shaggy", name: "Лохматый" },
  { id: "spiky", name: "Ёжик" },
] as const;
/** hair and skin colours are baked into the art by tools/rig/build-look.py — keep the lists in sync */
export const HAIR_COLORS = ["#4a2c1a", "#1d1a24", "#c9822f", "#f0d27a", "#b8401f", "#8d6bff", "#3fd2ff", "#e8e8f0"] as const;
/** iris colours, baked into pupils-<i>.webp by tools/rig/build-eyes.py (0 is the original dark iris) — keep in sync */
export const EYE_COLORS = ["#2a2a33", "#7a4a26", "#2f6fd6", "#2e9e5b", "#8a98a8", "#9b5de5", "#e0a32f", "#d63a3a"] as const;
export const SKIN_TONES = [
  { base: "#f8d5b4", shade: "#e2ad85" },
  { base: "#fcb477", shade: "#d28b5b" },
  { base: "#dda57a", shade: "#b97c52" },
  { base: "#b97a4e", shade: "#94592f" },
  { base: "#8a5534", shade: "#683c20" },
  { base: "#5e3a24", shade: "#432717" },
] as const;

export interface Look { hair: string; hairColor: number; eyes: number; skin: number }
export const DEFAULT_LOOK: Look = { hair: "bald", hairColor: 0, eyes: 0, skin: 1 };

export function normalizeLook(v: unknown): Look {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const idx = (x: unknown, n: number, d: number) => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x < n ? x : d);
  return {
    hair: typeof o.hair === "string" && HAIR_STYLES.some((h) => h.id === o.hair) ? o.hair : DEFAULT_LOOK.hair,
    hairColor: idx(o.hairColor, HAIR_COLORS.length, DEFAULT_LOOK.hairColor),
    eyes: idx(o.eyes, EYE_COLORS.length, DEFAULT_LOOK.eyes),
    skin: idx(o.skin, SKIN_TONES.length, DEFAULT_LOOK.skin),
  };
}

/* ---------------- подсказки [?] ---------------- */
export const HELP_TOPICS = ["bosses", "boss", "yard", "slots", "home", "home-menu", "yard-menu", "exchange", "locations", "clans", "shop", "computer", "talents", "tutorial", "blackjack", "zonk", "upgrader"] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];
