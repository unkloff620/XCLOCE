/*
 * «Мастера» (the second tab of the locations, the user 2026-11-22): 16 craftsmen, one after another. A master is learned
 * from on a path of 7 points (like the locations' road): every step costs energy, pays a little and gives «Мастерство»
 * (the bulb, one per energy spent) and, with MASTER_PART_CHANCE, one of his five parts. Before the first lesson the
 * five parts are bought from him (each once; they lie on his table). The whole path costs `energy` (the user's list);
 * walked to the end — the next master opens, and the path starts again (the parts keep dropping).
 * The best student of a master — the most «Мастерство» with him.
 */
import type { Currency } from "./currencies.ts";

export interface MasterDef {
  id: string;
  n: number;
  name: string;
  motto: string;
  /** the energy of the whole path */
  energy: number;
  /** his five parts (craft parts, content/craft.ts): bought to start, then they drop on his path */
  parts: string[];
}

const M = (n: number, name: string, motto: string, energy: number, parts: string[]): MasterDef => ({
  id: `m${String(n).padStart(2, "0")}`, n, name, motto, energy, parts: parts.map((p) => `part-${p}`),
});
export const MASTERS: MasterDef[] = [
  M(1, "Сява Гвоздь", "Сколотит нары за перекур", 443, ["nails", "screw", "board", "glue", "clothespin"]),
  M(2, "Мотя Нитка", "Ушьёт так, что шва не найдёшь", 542, ["thread", "needle", "zipper", "rag", "sock"]),
  M(3, "Жора Изолента", "Скрутит провода на глаз", 647, ["tape", "wire", "scotch", "clip", "battery"]),
  M(4, "Боря Шайба", "Любую гайку на ощупь", 942, ["nut", "bolt", "washer", "spring", "wrench"]),
  M(5, "Колян Жесть", "Из консервы сделает броню", 1002, ["can", "cork", "straw", "metal", "pliers"]),
  M(6, "Гена Спичка", "Огонёк найдётся всегда", 1008, ["matches", "stub", "lighter", "fuse", "gasoline"]),
  M(7, "Лёха Стекло", "Режет стекло взглядом", 1164, ["cup", "bottle", "glass", "mirror", "lens"]),
  M(8, "Вова Цепь", "Скуёт цепь из ничего", 1224, ["stone", "file", "hacksaw", "hammer", "chain"]),
  M(9, "Толик Колесо", "Переобует и самосвал", 1240, ["hose", "funnel", "tire", "wheel", "bearing"]),
  M(10, "Миша Паяльник", "Спаяет хоть чёрта", 1425, ["copper", "bulb", "cable", "speaker", "solder"]),
  M(11, "Дед Кулибин", "Изобретёт то, что уже есть", 1607, ["gear", "clamp", "drill", "magnet", "motor"]),
  M(12, "Рома Химик", "Сварит всё, кроме борща", 1700, ["sponge", "plastic", "paint", "sulfur", "saltpeter"]),
  M(13, "Стас Кварц", "Время у него не убегает", 1837, ["pencil", "button", "string", "gyro", "quartz"]),
  M(14, "Тёма Микросхема", "Взломает и не вспотеет", 1967, ["staples", "bag", "cooler", "accu", "chip"]),
  M(15, "Профессор Тесла", "Искрит даже в тишине", 2103, ["rubber-band", "blade", "laser", "neodym", "tesla"]),
  M(16, "Вор Титан", "Последний, кто учит всему", 2249, ["pipe", "screwdriver", "pump", "carbon", "titanium"]),
];
export const masterById = (id: string) => MASTERS.find((m) => m.id === id);

/** a step's part: one of the master's five, with this chance */
export const MASTER_PART_CHANCE = 0.2;
/** the points of the path */
export const MASTER_POINTS = 7;

/**
 * The prices of his five parts (the user's: the first master 1120, 1250 папирос, 2 рубля, 1304, 1370 папирос). They
 * grow with every master — папиросы up to 10 000 at most, рубли up to 30; from the 4th master the second part is paid
 * in зубы, from the 9th the fourth one too.
 */
const PAP_BASE = [1120, 1250, 0, 1304, 1370];
const GROW = Math.pow(10_000 / 1370, 1 / 15);
export function partPrice(m: MasterDef, slot: number): { cur: Currency; amount: number } {
  const k = m.n - 1;
  if (slot === 2) return { cur: "RUB", amount: Math.min(30, Math.round(2 + (28 * k) / 15)) };
  const amount = k === 0 ? PAP_BASE[slot] : Math.min(10_000, Math.round((PAP_BASE[slot] * Math.pow(GROW, k)) / 10) * 10);
  const tooth = (slot === 1 && m.n >= 4) || (slot === 3 && m.n >= 9);
  return { cur: tooth ? "TOOTH" : "PAP", amount };
}

/** a step's energy: 5 at the first master, 10 at the last */
export const stepEnergy = (m: MasterDef) => 5 + Math.floor(((m.n - 1) * 5) / 15);
/** the steps of the whole path (the last one costs what is left of `energy`) */
export const totalSteps = (m: MasterDef) => Math.ceil(m.energy / stepEnergy(m));
export const energyOfStep = (m: MasterDef, i: number) => (i < totalSteps(m) - 1 ? stepEnergy(m) : m.energy - stepEnergy(m) * (totalSteps(m) - 1));
/** the steps of each of the 7 points (the later points a little longer) */
export function pointSteps(m: MasterDef): number[] {
  const s = totalSteps(m);
  const base = Math.floor(s / MASTER_POINTS), extra = s % MASTER_POINTS;
  return Array.from({ length: MASTER_POINTS }, (_, i) => base + (i >= MASTER_POINTS - extra ? 1 : 0));
}
/** a step's pay besides the part: папиросы and authority by its energy */
export const stepPay = (e: number) => ({ pap: e * 4, xp: e * 5 });
/**
 * The whole path walked (the user 2026-11-23): a payout like a location's — папиросы, зубы, authority by the path's
 * energy, and MASTER_FINISH_PARTS of his parts (each one of the five at random).
 */
export const MASTER_FINISH_PARTS = 3;
export const finishPay = (m: MasterDef) => ({ pap: m.energy * 10, tooth: Math.round(m.energy / 20), xp: m.energy * 8 });
