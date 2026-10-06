/*
 * What a weapon really hits for, as the server counts it (systems/combat.ts):
 * base damage × (1 + room/equipment/trophy bonus + this weapon's talents); crit = × (1.5 + crit bonuses).
 * Every place that shows a weapon's damage uses this, so the number is the same everywhere.
 */
import type { GameState } from "./api.ts";
import { itemById } from "../content/items.ts";
import { BASE_CRIT_MULT } from "../content/home.ts";
import { weaponTalentBonus } from "../content/talents.ts";

export interface WeaponStats { base: number; damage: number; bonus: number; crit: number; critChance: number }

export function weaponStats(state: GameState | null | undefined, weaponId: string): WeaponStats {
  const base = itemById(weaponId)?.weapon?.damage ?? 0;
  const home = state?.home.bonus ?? { damage: 0, critDamage: 0, critChance: 0 };
  const t = weaponTalentBonus(state?.weaponTalents ?? {}, weaponId);
  const bonus = home.damage + t.damage;
  return { base, damage: Math.round(base * (1 + bonus)), bonus, crit: BASE_CRIT_MULT + home.critDamage + t.critDamage, critChance: home.critChance };
}
