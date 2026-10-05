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
  /** raster photos in public/bosses/<id>/ — portrait (lists) and full (boss screen); null = placeholder */
  photo: { portrait: string | null; full: string | null };
  /** HP phases in percent (only the final boss has several) */
  phases?: { from: number; name: string }[];
  final?: boolean;
  /** keys of the previous boss needed to open this one (default KEYS_TO_UNLOCK) */
  keysToUnlock?: number;
}

/** 1 000 → 10 000 → 50 000 → … → 10 000 000 (Солнце). Вадим and Боцман bridge Князь → Утилизатор. */
const HP = [1_000, 10_000, 50_000, 150_000, 400_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 5_000_000, 10_000_000];
const hp = (i: number) => HP[i];
/** Authority for a win: 100 for Дацик … 1 500 000 for Солнце (×≈3.3 per boss, ×1.5 across Вадим and Боцман). */
const XP = [100, 350, 1_100, 3_700, 12_000, 40_000, 60_000, 90_000, 135_000, 450_000, 1_500_000];
const xp = (i: number) => XP[i];
const photo = (id: string, has = false) => (has ? { portrait: `/bosses/${id}/portrait.webp`, full: `/bosses/${id}/full.webp` } : { portrait: null, full: null });

/** Strict order from the design: Дацик → … → Солнце (final). */
export const BOSSES: BossDef[] = [
  {
    id: "datsik", order: 1, name: "Дацик", title: "Хранитель входа",
    story: "Первый, кого встречает каждый новичок. Проверяет, умеешь ли ты махать кулаками, и не впечатляется.",
    hp: hp(0), reward: { xp: xp(0), currencies: { SOL: 0.02, RUB: 150 } },
    drop: [{ id: "red-candle", qty: 3, chance: 0.35 }],
    theme: { a: "#3a1430", b: "#12081a", accent: "#ff4d6d" }, photo: photo("datsik", true),
  },
  {
    id: "kedr", order: 2, name: "Кедр", title: "Корни глубоко, бюджет ещё глубже",
    story: "Стоит намертво. Сдвинуть его пробовали многие — сдвинулись только дедлайны.",
    hp: hp(1), reward: { xp: xp(1), currencies: { SOL: 0.03, RUB: 220 } },
    drop: [{ id: "keyboard", qty: 2, chance: 0.3 }],
    theme: { a: "#173a26", b: "#07140c", accent: "#3ddc84" }, photo: photo("kedr"),
  },
  {
    id: "bebyakyan", order: 3, name: "Бебякян", title: "Мастер внезапных созвонов",
    story: "Появляется в календаре раньше, чем ты успел его открыть.",
    hp: hp(2), reward: { xp: xp(2), currencies: { SOL: 0.045, RUB: 300 } },
    drop: [{ id: "keyboard", qty: 3, chance: 0.3 }],
    theme: { a: "#1c2a4a", b: "#080d1c", accent: "#4da3ff" }, photo: photo("bebyakyan"),
  },
  {
    id: "babafey", order: 4, name: "Бабафей", title: "Повелитель согласований",
    story: "Каждое «ок» стоит три письма и одно совещание.",
    hp: hp(3), reward: { xp: xp(3), currencies: { SOL: 0.065, RUB: 420 } },
    drop: [{ id: "gpu", qty: 1, chance: 0.25 }],
    theme: { a: "#3a2a10", b: "#140d04", accent: "#ffb020" }, photo: photo("babafey"),
  },
  {
    id: "vodovoz", order: 5, name: "Водовоз", title: "Тот, кто держит кулер",
    story: "Контролирует главный ресурс офиса. Без него никто не продержится и часа.",
    hp: hp(4), reward: { xp: xp(4), currencies: { SOL: 0.09, RUB: 560 } },
    drop: [{ id: "energy-drink", qty: 3, chance: 0.4 }],
    theme: { a: "#0f3440", b: "#041217", accent: "#38d6ff" }, photo: photo("vodovoz"),
  },
  {
    id: "knyaz", order: 6, name: "Князь", title: "Его светлость отчётности",
    story: "Принимает отчёты только в правильном шрифте. Шрифт каждый раз новый.",
    hp: hp(5), reward: { xp: xp(5), currencies: { SOL: 0.13, RUB: 750 } },
    drop: [{ id: "gpu", qty: 1, chance: 0.35 }],
    theme: { a: "#2e1846", b: "#0e0718", accent: "#b06bff" }, photo: photo("knyaz"),
  },
  {
    id: "vadim", order: 7, name: "Вадим", title: "Главный по таблицам",
    story: "Сводит всю компанию в один Excel. Нет тебя в таблице — нет тебя в компании.",
    hp: hp(6), reward: { xp: xp(6), currencies: { SOL: 0.17, RUB: 820 } },
    drop: [{ id: "gpu", qty: 1, chance: 0.4 }],
    theme: { a: "#3a2416", b: "#140b05", accent: "#ff8a3d" }, photo: photo("vadim"),
  },
  {
    id: "botsman", order: 8, name: "Боцман", title: "Держит курс на дедлайн",
    story: "Свистит в дудку, если кто-то ушёл на обед раньше. Корабль тонет, но отчёт сдан вовремя.",
    hp: hp(7), reward: { xp: xp(7), currencies: { SOL: 0.22, RUB: 880 } },
    drop: [{ id: "rug-pull-gun", qty: 1, chance: 0.15 }],
    theme: { a: "#0f2a44", b: "#050e18", accent: "#5fb8ff" }, photo: photo("botsman"),
  },
  {
    id: "utilizator", order: 9, name: "Утилизатор", title: "Переработчик идей",
    story: "Любая гениальная идея на входе — служебная записка на выходе.",
    hp: hp(8), reward: { xp: xp(8), currencies: { BTC: 0.0003, RUB: 950 } },
    drop: [{ id: "rug-pull-gun", qty: 1, chance: 0.25 }],
    theme: { a: "#2f3416", b: "#0f1106", accent: "#c8f03c" }, photo: photo("utilizator"),
  },
  {
    id: "fokus", order: 10, name: "Фокус", title: "Видит всё, что ты не доделал",
    story: "Последний рубеж перед Солнцем. Смотрит прямо в бэклог.",
    hp: hp(9), reward: { xp: xp(9), currencies: { BTC: 0.0005, RUB: 1200 } },
    drop: [{ id: "rug-pull-gun", qty: 1, chance: 0.35 }],
    theme: { a: "#401624", b: "#16060c", accent: "#ff6b9a" }, photo: photo("fokus"),
    keysToUnlock: 1,
  },
  {
    id: "solntse", order: 11, name: "Солнце", title: "Финальный босс компании",
    story: "Светит всем, всегда и без выходных. Чтобы дойти сюда, нужно пройти всю администрацию.",
    hp: hp(10), reward: { xp: xp(10), currencies: { BTC: 0.001, RUB: 2000 }, items: [{ id: "trophy-sun", qty: 1 }] },
    drop: [{ id: "rug-pull-gun", qty: 2, chance: 0.5 }],
    theme: { a: "#4a2a06", b: "#1a0c02", accent: "#ffd23f" }, photo: photo("solntse"),
    phases: [{ from: 100, name: "Рассвет" }, { from: 66, name: "Зенит" }, { from: 33, name: "Солнечная буря" }],
    final: true,
    keysToUnlock: 1,
  },
];

export const bossById = (id: string) => BOSSES.find((b) => b.id === id);
export const keyId = (bossId: string) => `key-${bossId}`;
/** Keys of boss N needed to open boss N+1. */
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
/** reward multiplier for damage dealt in a fight */
export function rewardShare(myDamage: number, hpMax: number, full = FULL_SHARE): number {
  if (!(myDamage > 0) || !(hpMax > 0)) return 0;
  return Math.min(1, myDamage / (hpMax * full));
}

/** How many keys of the previous boss open this one. */
export function keysNeeded(b: BossDef, defaultKeys: number): number {
  return b.keysToUnlock ?? defaultKeys;
}
