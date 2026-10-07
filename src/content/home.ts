import type { Currency } from "./currencies.ts";

/*
 * Дом: оборудование на заднем плане и комнаты. Оба дают боевые бонусы.
 * Бонусы складываются: оборудование (по уровню) + все купленные комнаты.
 * Черновые цены и бонусы — правятся здесь.
 */

export interface Bonus {
  /** шанс крита, доля (0.05 = 5%) */
  critChance?: number;
  /** добавка к множителю крита (база ×1.5; 0.2 → ×1.7) */
  critDamage?: number;
  /** добавка к урону оружия, доля */
  damage?: number;
}

export const BASE_CRIT_MULT = 1.5;

export interface Price { currency: Currency; amount: number }

export interface EquipmentDef {
  id: string;
  name: string;
  description: string;
  /** уровни 1..N: цена покупки этого уровня и суммарный бонус на этом уровне */
  levels: { price: Price; bonus: Bonus }[];
  /** то, что стоит в комнате на уровне 0..N (название + картинка в public/assets/home) — для стола и мониторов */
  stages?: { name: string; art: string }[];
}

export const EQUIPMENT: EquipmentDef[] = [
  {
    id: "desk", name: "Стол", description: "Всё начинается со стола. Чем солиднее стол — тем увереннее удар.",
    levels: [
      { price: { currency: "RUB", amount: 4000 }, bonus: { critChance: 0.02 } },
      { price: { currency: "USD", amount: 30 }, bonus: { critChance: 0.03, damage: 0.03 } },
      { price: { currency: "SOL", amount: 0.2 }, bonus: { critChance: 0.05, critDamage: 0.1, damage: 0.06 } },
    ],
    stages: [
      { name: "Стол с Авито", art: "desk-001" },
      { name: "Ореховый стандарт", art: "desk-002" },
      { name: "Мраморный холд", art: "desk-003" },
      { name: "Золотой памп", art: "desk-004" },
    ],
  },
  {
    // id stays "monitor2": players who bought «Второй монитор» keep their levels and bonus
    id: "monitor2", name: "Мониторы", description: "Один экран — для графика, второй — для чата, третий — чтобы видеть, куда бить. Усиливают криты.",
    levels: [
      { price: { currency: "RUB", amount: 3000 }, bonus: { critDamage: 0.1 } },
      { price: { currency: "USD", amount: 30 }, bonus: { critDamage: 0.2 } },
      { price: { currency: "SOL", amount: 0.15 }, bonus: { critDamage: 0.35 } },
    ],
    stages: [
      { name: "Старый ламповый", art: "monitor-1" },
      { name: "Один монитор", art: "monitor-right" },
      { name: "Два монитора", art: "monitor-left" },
      { name: "Три монитора", art: "monitor-center" },
    ],
  },
  {
    id: "chair", name: "Кресло", description: "Спина прямая — рука твёрдая. Повышает шанс крита.",
    levels: [
      { price: { currency: "RUB", amount: 2500 }, bonus: { critChance: 0.02 } },
      { price: { currency: "USD", amount: 25 }, bonus: { critChance: 0.04 } },
      { price: { currency: "SOL", amount: 0.12 }, bonus: { critChance: 0.07 } },
    ],
    stages: [
      { name: "Табуретка", art: "seat-1" },
      { name: "Офисное кресло", art: "chair-1" },
      { name: "Геймерское кресло", art: "chair-2" },
      { name: "Трон трейдера", art: "chair-3" },
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
}

export const ROOM_DEFS: RoomDef[] = [
  { id: "basic", name: "Каморка", description: "С чего все начинали: облезлые обои, старый стол, ламповый монитор и табуретка.", price: null, bonus: {} },
  { id: "office", name: "Офис трейдера", description: "Стеклянные стены, три графика и кофемашина. Даёт шанс крита.", price: { currency: "USD", amount: 40 }, bonus: { critChance: 0.03 } },
  { id: "penthouse", name: "Пентхаус To The Moon", description: "Вид на Луну, золото и бассейн из стейблкоинов. Урон и сила крита.", price: { currency: "SOL", amount: 0.5 }, bonus: { damage: 0.05, critDamage: 0.15 } },
];

export const equipmentById = (id: string) => EQUIPMENT.find((e) => e.id === id);
/** what stands in the room: the chosen owned stage (decor), else the latest bought one */
export const stageOf = (id: string, levels: Record<string, number>, decor: Record<string, number> = {}) => {
  const e = equipmentById(id);
  const owned = Math.min(levels[id] ?? 0, e?.levels.length ?? 0);
  const pick = decor[id];
  const lv = typeof pick === "number" && pick >= 0 && pick <= owned ? pick : owned;
  return { level: lv, stage: e?.stages?.[lv] };
};
export const roomById = (id: string) => ROOM_DEFS.find((r) => r.id === id);

export function addBonus(a: Bonus, b: Bonus): Bonus {
  return { critChance: (a.critChance ?? 0) + (b.critChance ?? 0), critDamage: (a.critDamage ?? 0) + (b.critDamage ?? 0), damage: (a.damage ?? 0) + (b.damage ?? 0) };
}

/** Trophies: reward items that stand in the room by themselves and add a bonus while owned. */
export const TROPHIES: { id: string; bonus: Bonus }[] = [
  { id: "statue-close", bonus: { critDamage: 0.25 } },
];

/** Total bonus from equipment levels, owned rooms and trophies (weapon talents are added per weapon in combat). */
export function totalBonus(levels: Record<string, number>, rooms: string[], trophies: string[] = []): Required<Bonus> {
  let b: Bonus = {};
  for (const e of [...EQUIPMENT, ...LEGACY_EQUIPMENT]) {
    const lv = levels[e.id] ?? 0;
    if (lv > 0) b = addBonus(b, e.levels[Math.min(lv, e.levels.length) - 1].bonus);
  }
  for (const id of rooms) b = addBonus(b, roomById(id)?.bonus ?? {});
  for (const t of TROPHIES) if (trophies.includes(t.id)) b = addBonus(b, t.bonus);
  return { critChance: Math.min(0.75, b.critChance ?? 0), critDamage: b.critDamage ?? 0, damage: b.damage ?? 0 };
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
