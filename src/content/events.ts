/*
 * Game events: an admin sets a time window (/admin → «События»), a title, a description and effects. While the window
 * is on, the effects change the game's numbers (src/server/config.ts applies them on top of the config) and players see
 * the event's banner. Several events at once stack (multipliers multiply, the lowest fee / boss HP wins).
 */

export type EventEffectId = "energyRegen" | "yardSpeed" | "slotsSpins" | "exchangeFee" | "bossHp";

export interface EventEffectDef {
  id: EventEffectId;
  name: string;
  hint: string;
  /** the value that changes nothing */
  neutral: number;
  min: number;
  max: number;
  step: number;
  /** how the value reads in the banner */
  show: (v: number) => string;
}

export const EVENT_EFFECTS: EventEffectDef[] = [
  { id: "energyRegen", name: "Энергия восстанавливается быстрее", hint: "×N к скорости: 2 — вдвое быстрее", neutral: 1, min: 1, max: 10, step: 0.5, show: (v) => `Энергия ×${v} быстрее` },
  { id: "yardSpeed", name: "Находки во дворе чаще", hint: "×N: 2 — появляются вдвое чаще", neutral: 1, min: 1, max: 10, step: 0.5, show: (v) => `Находки во дворе ×${v} чаще` },
  { id: "slotsSpins", name: "Прокрутки автомата 777", hint: "×N бесплатных прокруток в час", neutral: 1, min: 1, max: 10, step: 1, show: (v) => `Прокрутки 777 ×${v}` },
  { id: "exchangeFee", name: "Комиссия обменника, %", hint: "0 — обмен без комиссии (обычно 5)", neutral: 5, min: 0, max: 5, step: 0.5, show: (v) => (v === 0 ? "Обмен без комиссии" : `Комиссия обменника ${v}%`) },
  { id: "bossHp", name: "HP боссов, % от обычного", hint: "50 — у новых боёв вдвое меньше HP", neutral: 100, min: 10, max: 100, step: 5, show: (v) => `HP боссов ${v}%` },
];

export type EventEffects = Partial<Record<EventEffectId, number>>;

/** keeps only known effects with values inside their range */
export function cleanEffects(v: unknown): EventEffects {
  const out: EventEffects = {};
  if (!v || typeof v !== "object") return out;
  for (const d of EVENT_EFFECTS) {
    const x = (v as Record<string, unknown>)[d.id];
    if (typeof x === "number" && Number.isFinite(x) && x !== d.neutral) out[d.id] = Math.min(d.max, Math.max(d.min, x));
  }
  return out;
}

/** the event's effects as short lines for the banner */
export function effectLines(e: EventEffects): string[] {
  return EVENT_EFFECTS.filter((d) => e[d.id] !== undefined).map((d) => d.show(e[d.id]!));
}

export interface GameEventView { id: number; title: string; description: string; startsAt: number; endsAt: number; effects: EventEffects }
