import type { Price } from "./economy.ts";

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";
export type Slot = "hat" | "glasses" | "jacket" | "chain";
export type ItemKind = Slot | "weapon" | "consumable" | "chest" | "key" | "theme";

/** Damage bonuses of an applied room: crit chance (0..1), crit multiplier, extra damage per weapon id (0.25 = +25%). */
export interface RoomBonus { critChance: number; critMult: number; weapons: Record<string, number> }

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  /** power bonus while equipped (gear) */
  power?: number;
  /** rooms: damage bonuses while this room is applied */
  room?: RoomBonus;
  /** weapons: damage per hit (weapons are consumables: one item = one hit) */
  hit?: { dmg: number; cooldownMin: number };
  /** shop price; absent = not sold (drop only) */
  price?: Price;
  unlockLevel?: number;
  /** consumable effect */
  energy?: number;
  /** visual variant used by the hero / icon renderer */
  art: string;
  /** primary colour for art */
  color?: string;
  description: string;
  stackable?: boolean;
}

export const ITEMS: ItemDef[] = [
  // ---------- weapons ----------
  { id: "w-paper-fan", name: "Бумажный веер", kind: "weapon", hit: { dmg: 40, cooldownMin: 0 }, rarity: "common", price: { currency: "RUB", amount: 150 }, art: "fan", color: "#f4f1e8", stackable: true, description: "Для бумажных рук. Лучше, чем ничего." },
  { id: "w-sell-club", name: "Дубина «SELL»", kind: "weapon", hit: { dmg: 80, cooldownMin: 0 }, rarity: "common", price: { currency: "RUB", amount: 300 }, unlockLevel: 2, art: "club", color: "#e63946", stackable: true, description: "Большая красная кнопка на палке." },
  { id: "w-dump-hammer", name: "Dump Hammer", kind: "weapon", hit: { dmg: 200, cooldownMin: 0 }, rarity: "rare", price: { currency: "USD", amount: 8 }, unlockLevel: 4, art: "hammer", color: "#3fa7ff", stackable: true, description: "Одним ударом — минус 30% к графику." },
  { id: "w-ban-hammer", name: "BAN Hammer", kind: "weapon", hit: { dmg: 450, cooldownMin: 0 }, rarity: "epic", price: { currency: "USD", amount: 18 }, unlockLevel: 7, art: "banhammer", color: "#22e58b", stackable: true, description: "Модераторский молот. Банит FUD навсегда." },
  { id: "w-rug-cannon", name: "Rug Cannon", kind: "weapon", hit: { dmg: 900, cooldownMin: 0 }, rarity: "epic", price: { currency: "SOL", amount: 0.25 }, unlockLevel: 10, art: "cannon", color: "#b45cff", stackable: true, description: "Стреляет коврами из-под ног врага." },
  { id: "w-whale-harpoon", name: "Гарпун на китов", kind: "weapon", hit: { dmg: 1800, cooldownMin: 0 }, rarity: "legendary", price: { currency: "BTC", amount: 0.0012 }, unlockLevel: 14, art: "harpoon", color: "#ffb02e", stackable: true, description: "Единственное, чего боятся киты." },
  { id: "w-diamond-fist", name: "Diamond Fist", kind: "weapon", hit: { dmg: 3500, cooldownMin: 0 }, rarity: "mythic", art: "fist", color: "#7cf3ff", stackable: true, description: "Выпадает с MEME KING. Алмазные руки в прямом смысле." },
  // ---------- hats ----------
  { id: "h-cap", name: "Кепка дегена", kind: "hat", rarity: "common", power: 10, price: { currency: "RUB", amount: 3_000 }, art: "cap", color: "#e63946", description: "Козырьком назад, конечно." },
  { id: "h-beanie", name: "Шапка HODL", kind: "hat", rarity: "rare", power: 25, price: { currency: "USD", amount: 25 }, unlockLevel: 3, art: "beanie", color: "#1e7a4a", description: "Тёплая, как вера в отскок." },
  { id: "h-crown", name: "Корона мем-короля", kind: "hat", rarity: "legendary", power: 150, price: { currency: "SOL", amount: 6 }, unlockLevel: 12, art: "crown", color: "#ffd23f", description: "Тяжела корона кита." },
  // ---------- glasses ----------
  { id: "g-shades", name: "Чёрные очки", kind: "glasses", rarity: "common", power: 12, price: { currency: "RUB", amount: 4_000 }, art: "shades", color: "#111", description: "Скрывают слёзы после дампа." },
  { id: "g-neon", name: "Неоновые очки", kind: "glasses", rarity: "rare", power: 30, price: { currency: "USD", amount: 40 }, unlockLevel: 4, art: "neon", color: "#22e58b", description: "Видят зелёные свечи в темноте." },
  { id: "g-laser", name: "Лазерный визор", kind: "glasses", rarity: "epic", power: 90, price: { currency: "USD", amount: 220 }, unlockLevel: 8, art: "laser", color: "#ff2a2a", description: "Лазерные глаза. Сотка к Новому году." },
  // ---------- jackets ----------
  { id: "j-hoodie", name: "Худи дегена", kind: "jacket", rarity: "common", power: 8, price: { currency: "RUB", amount: 2_500 }, art: "hoodie", color: "#2c3142", description: "Классика ночного трейдинга." },
  { id: "j-neon", name: "Неоновая куртка", kind: "jacket", rarity: "rare", power: 35, price: { currency: "USD", amount: 45 }, unlockLevel: 3, art: "jacket", color: "#22e58b", description: "Good memes, stronger people." },
  { id: "j-violet", name: "Куртка Night Trader", kind: "jacket", rarity: "epic", power: 85, price: { currency: "USD", amount: 180 }, unlockLevel: 6, art: "jacket", color: "#8a4dff", description: "Для тех, кто не спит до закрытия свечи." },
  { id: "j-gold", name: "Золотой бомбер", kind: "jacket", rarity: "legendary", power: 200, price: { currency: "BTC", amount: 0.008 }, unlockLevel: 13, art: "jacket", color: "#d4a017", description: "Кит видит кита издалека." },
  // ---------- chains ----------
  { id: "c-silver", name: "Серебряная цепь", kind: "chain", rarity: "common", power: 10, price: { currency: "RUB", amount: 5_000 }, art: "chain", color: "#cfd6e6", description: "Блестит скромно." },
  { id: "c-gold", name: "Золотая цепь", kind: "chain", rarity: "rare", power: 40, price: { currency: "USD", amount: 60 }, unlockLevel: 5, art: "chain", color: "#ffd23f", description: "С кулоном-короной." },
  { id: "c-diamond", name: "Бриллиантовая цепь", kind: "chain", rarity: "epic", power: 110, price: { currency: "SOL", amount: 2 }, unlockLevel: 9, art: "chain", color: "#7cf3ff", description: "Diamond hands, diamond chain." },
  // ---------- consumables ----------
  { id: "x-beer", name: "Бутылка пива", kind: "consumable", rarity: "common", energy: 5, art: "beer", color: "#7a3d0e", description: "+5 энергии. Нашёл во дворе — тёплое, но бодрит.", stackable: true },
  { id: "x-can", name: "Банка энергетика", kind: "consumable", rarity: "common", energy: 15, art: "can", color: "#9dff3a", description: "+15 энергии. Нашёл во дворе, почти полная.", stackable: true },
  { id: "x-energy", name: "Энергетик", kind: "consumable", rarity: "common", energy: 30, price: { currency: "RUB", amount: 1_500 }, art: "can", color: "#22e58b", description: "+30 энергии. Вкус зелёной свечи.", stackable: true },
  { id: "x-mega-energy", name: "Мега-энергетик", kind: "consumable", rarity: "rare", energy: 100, price: { currency: "USD", amount: 12 }, art: "can", color: "#ff3d81", description: "+100 энергии. Сердце стучит как график.", stackable: true },
  { id: "x-chest", name: "Мем-сундук", kind: "chest", rarity: "rare", price: { currency: "USD", amount: 30 }, art: "chest", color: "#d98f3a", description: "Валюта, энергетики, шанс на экипировку.", stackable: true },
  // ---------- room themes ----------
  { id: "t-default", name: "Комната дегена", kind: "theme", rarity: "common", art: "default", description: "Тесно, зато своё." },
  { id: "t-neon", name: "Неоновый город", kind: "theme", rarity: "rare", price: { currency: "RUB", amount: 20_000 }, unlockLevel: 3, art: "neon", description: "Вид на ночной город и зелёную луну.", room: { critChance: 0.1, critMult: 1.5, weapons: { "w-paper-fan": 0.2, "w-sell-club": 0.2 } } },
  { id: "t-moon", name: "Лунная база", kind: "theme", rarity: "epic", price: { currency: "USD", amount: 250 }, unlockLevel: 6, art: "moon", description: "Мы всё-таки долетели.", room: { critChance: 0.12, critMult: 1.5, weapons: { "w-dump-hammer": 0.25, "w-ban-hammer": 0.25 } } },
  { id: "t-penthouse", name: "Пентхаус кита", kind: "theme", rarity: "legendary", price: { currency: "SOL", amount: 5 }, unlockLevel: 10, art: "penthouse", description: "Золото, мрамор и графики во всю стену.", room: { critChance: 0.15, critMult: 2, weapons: { "w-rug-cannon": 0.3, "w-whale-harpoon": 0.3 } } },
];

/** Boss keys (key-1 … key-10) are generated, stackable items. */
export function keyItem(bossIndex: number): ItemDef {
  return { id: `key-${bossIndex}`, name: `Ключ босса #${bossIndex}`, kind: "key", rarity: bossIndex >= 9 ? "legendary" : bossIndex >= 6 ? "epic" : bossIndex >= 3 ? "rare" : "common", art: "key", description: `Нужен, чтобы открыть босса #${bossIndex + 1}.`, stackable: true };
}

export function itemById(id: string): ItemDef | undefined {
  if (id.startsWith("key-")) {
    const n = Number(id.slice(4));
    return Number.isInteger(n) && n >= 1 && n <= 50 ? keyItem(n) : undefined;
  }
  return ITEMS.find((i) => i.id === id);
}

export const SLOTS: Slot[] = ["hat", "glasses", "jacket", "chain"];
/** Equipped gear. `weapon` is legacy (weapons are consumables now) and is ignored. */
export type Loadout = Partial<Record<Slot | "weapon", string>>;
export const DEFAULT_THEME = "t-default";

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];

/** Bare fists: always available, cannot be bought. */
export const FISTS = { id: "fists", name: "Кулаки", hit: { dmg: 20, cooldownMin: 60 } } as const;
/** Damage and cooldown of a weapon id ("fists" recharge 1 h; weapon items are spent, no cooldown). */
export function weaponHit(id: string): { dmg: number; cooldownMin: number } | null {
  if (id === FISTS.id) return FISTS.hit;
  return itemById(id)?.hit ?? null;
}

const NO_BONUS: RoomBonus = { critChance: 0, critMult: 1.5, weapons: {} };
/** Bonuses of the applied room (the default room gives none). */
export function roomBonus(themeId: string | null | undefined): RoomBonus {
  return itemById(themeId ?? "")?.room ?? NO_BONUS;
}
/** Expected (non-crit) damage of a weapon with the room's bonus. */
export function weaponDamage(weaponId: string, room: RoomBonus): number {
  const base = weaponHit(weaponId)?.dmg ?? 0;
  return Math.round(base * (1 + (room.weapons[weaponId] ?? 0)));
}
/** Short Russian description of a room bonus, e.g. "Крит 10% ×1.5 · +20% Бумажный веер". */
export function describeRoom(room: RoomBonus): string[] {
  const out: string[] = [];
  if (room.critChance > 0) out.push(`Крит ${Math.round(room.critChance * 100)}% · урон ×${room.critMult}`);
  for (const [id, k] of Object.entries(room.weapons)) out.push(`+${Math.round(k * 100)}% урона: ${itemById(id)?.name ?? id}`);
  return out;
}
