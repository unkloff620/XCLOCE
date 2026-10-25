/*
 * What a weapon really hits for, as the server counts it (systems/combat.ts):
 * (base damage + this weapon's talent damage) × (1 + room/equipment/trophy bonus); crit = × (1.5 + crit bonuses).
 * Every place that shows a weapon's damage uses this, so the number is the same everywhere.
 */
import type { GameState } from "./api.ts";
import { itemById } from "../content/items.ts";
import { BASE_CRIT_MULT } from "../content/home.ts";
import { critChanceOf, weaponTalentBonus } from "../content/talents.ts";

export interface WeaponStats { base: number; damage: number; bonus: number; flat: number; crit: number; critChance: number }

export function weaponStats(state: GameState | null | undefined, weaponId: string): WeaponStats {
  const base = itemById(weaponId)?.weapon?.damage ?? 0;
  const home = state?.home.bonus ?? { damage: 0, critDamage: 0, critChance: 0 };
  const t = weaponTalentBonus(state?.weaponTalents ?? {}, weaponId);
  const bonus = home.damage;
  // the room's fist bonus and the complete boss sets' bonus (Командате's set: the keyboard +30)
  const flat = t.flat + (weaponId === "fist" ? (home as { fistDamage?: number }).fistDamage ?? 0 : 0) + (state?.setBonus?.[weaponId] ?? 0);
  return { base, damage: Math.round((base + flat) * (1 + bonus)), bonus, flat, crit: BASE_CRIT_MULT + home.critDamage + t.critDamage, critChance: critChanceOf(home.critChance, t.critChance) };
}
