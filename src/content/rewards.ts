import type { Currency } from "./currencies.ts";

/** One reward format for tasks, locations, bosses, yard drops, chests and events. */
export interface Reward {
  xp?: number;
  currencies?: Partial<Record<Currency, number>>;
  items?: { id: string; qty: number }[];
  /** energy is added on top of the regular maximum, never capped */
  energy?: number;
}

export function mergeRewards(...rs: (Reward | undefined)[]): Reward {
  const out: Reward = {};
  for (const r of rs) {
    if (!r) continue;
    if (r.xp) out.xp = (out.xp ?? 0) + r.xp;
    if (r.energy) out.energy = (out.energy ?? 0) + r.energy;
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
