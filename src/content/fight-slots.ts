import { WEAPONS, itemById } from "./items.ts";

/*
 * The fight's weapon cells: eight of them in a row under the boss, each a weapon and how many of it one tap uses (the packs of the
 * consumables: 1, 10, 50, 100, 500, 1000; the permanent ones always hit once). Set in the fight's weapon panel.
 */
export const FIGHT_SLOTS = 8;
export const FIGHT_PACKS = [1, 10, 50, 100, 500, 1000] as const;
export type FightSlot = { w: string; n: number } | null;
export const DEFAULT_FIGHT_SLOTS: FightSlot[] = WEAPONS.map((w) => ({ w: w.id, n: 1 }));

/** the stored cells cleaned up: FIGHT_SLOTS of them, known weapons, a pack only for a consumable */
export function fightSlots(raw: unknown): FightSlot[] {
  if (!Array.isArray(raw)) return DEFAULT_FIGHT_SLOTS;
  return Array.from({ length: FIGHT_SLOTS }, (_, i) => {
    const s = raw[i] as { w?: unknown; n?: unknown } | null;
    const w = s && typeof s.w === "string" ? itemById(s.w) : null;
    if (!w?.weapon) return null;
    const n = w.weapon.kind === "consumable" && (FIGHT_PACKS as readonly number[]).includes(Number(s!.n)) ? Number(s!.n) : 1;
    return { w: w.id, n };
  });
}
