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

/**
 * One boss's tweak (the admin's boss controls in «События»): put in / take out of the game, HP and rewards in % of the
 * usual. Several at once: the latest started decides visibility, HP and rewards multiply.
 */
export interface BossTweak { visible?: boolean; hpPct?: number; rewardPct?: number }

export type EventEffects = Partial<Record<EventEffectId, number>> & {
  bosses?: Record<string, BossTweak>;
  /** an admin's working tweak: players get no event window for it */
  silent?: boolean;
};

/** keeps only known effects with values inside their range */
export function cleanEffects(v: unknown): EventEffects {
  const out: EventEffects = {};
  if (!v || typeof v !== "object") return out;
  for (const d of EVENT_EFFECTS) {
    const x = (v as Record<string, unknown>)[d.id];
    if (typeof x === "number" && Number.isFinite(x) && x !== d.neutral) out[d.id] = Math.min(d.max, Math.max(d.min, x));
  }
  const b = (v as { bosses?: unknown }).bosses;
  if (b && typeof b === "object") {
    for (const [id, t] of Object.entries(b as Record<string, unknown>)) {
      if (!/^[a-z0-9-]{1,40}$/.test(id) || !t || typeof t !== "object") continue;
      const x = t as Record<string, unknown>;
      const tw: BossTweak = {};
      if (typeof x.visible === "boolean") tw.visible = x.visible;
      const pct = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(1000, Math.max(5, Math.round(n))) : undefined);
      if (pct(x.hpPct) !== undefined && pct(x.hpPct) !== 100) tw.hpPct = pct(x.hpPct);
      if (pct(x.rewardPct) !== undefined && pct(x.rewardPct) !== 100) tw.rewardPct = pct(x.rewardPct);
      if (Object.keys(tw).length) (out.bosses ??= {})[id] = tw;
    }
  }
  if ((v as { silent?: unknown }).silent === true) out.silent = true;
  return out;
}

/** the event's effects as short lines for the banner */
export function effectLines(e: EventEffects, bossName: (id: string) => string = (id) => id): string[] {
  const lines = EVENT_EFFECTS.filter((d) => e[d.id] !== undefined).map((d) => d.show(e[d.id]!));
  for (const [id, t] of Object.entries(e.bosses ?? {})) {
    const n = bossName(id);
    if (t.visible === true) lines.push(`${n} в игре`);
    if (t.visible === false) lines.push(`${n} убран из игры`);
    if (t.hpPct) lines.push(`${n}: HP ${t.hpPct}%`);
    if (t.rewardPct) lines.push(`${n}: награды ${t.rewardPct}%`);
  }
  return lines;
}

/** an end date far ahead: «навсегда» for the boss controls */
export const FOREVER = Date.UTC(2100, 0, 1);

export interface GameEventView { id: number; title: string; description: string; startsAt: number; endsAt: number; effects: EventEffects }
