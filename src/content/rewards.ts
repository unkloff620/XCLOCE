import type { Currency } from "./currencies.ts";

/** One reward format for tasks, locations, bosses, yard drops, chests and events. */
export interface Reward {
  xp?: number;
  currencies?: Partial<Record<Currency, number>>;
  items?: { id: string; qty: number }[];
  /** energy is added on top of the regular maximum, never capped */
  energy?: number;
  /** achievement points (the sun): +1 bronze … +5 diamond; what they buy comes later */
  achPoints?: number;
}

export function mergeRewards(...rs: (Reward | undefined)[]): Reward {
  const out: Reward = {};
  for (const r of rs) {
    if (!r) continue;
    if (r.xp) out.xp = (out.xp ?? 0) + r.xp;
    if (r.energy) out.energy = (out.energy ?? 0) + r.energy;
    if (r.achPoints) out.achPoints = (out.achPoints ?? 0) + r.achPoints;
    for (const [c, v] of Object.entries(r.currencies ?? {})) {
      out.currencies = out.currencies ?? {};
      out.currencies[c as Currency] = (out.currencies[c as Currency] ?? 0) + (v ?? 0);
    }
    for (const it of r.items ?? []) {
      out.items = out.items ?? [];
      const e = out.items.find((x) => x.id === it.id);
      if (e) e.qty += it.qty;
      else out.items.push({ ...it });
    }
  }
  return out;
}

/** A part of a reward: currencies, XP and energy times k; items only at the full reward (k ≥ 1). */
export function scaleReward(r: Reward, k: number): Reward {
  if (k >= 1) return r;
  const out: Reward = {};
  if (r.xp) out.xp = Math.floor(r.xp * k);
  if (r.energy) out.energy = Math.floor(r.energy * k);
  for (const [c, v] of Object.entries(r.currencies ?? {})) {
    out.currencies = out.currencies ?? {};
    out.currencies[c as keyof typeof out.currencies] = (v ?? 0) * k;
  }
  return out;
}
