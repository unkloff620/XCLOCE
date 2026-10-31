/**
 * Tattoo sets («наколки»). A piece drops from its boss (one per win in the set's fight mode, a piece the player does not
 * have yet), lies in the inventory and is inked on (or taken off) for free in the hero editor («Наколки»). Owning the
 * whole set adds its bonus to a weapon (server/systems/collection.ts setBonuses). The art: tools/rig/build-tattoos.py.
 * `part` — the place in the hero editor (client/screens/stylist.tsx): HEAD, TORSO, SHOULDER_L/R, ARM_L/R, HAND, LEG_L/R.
 */
export interface TattooPiece { id: string; name: string; part: string }
export interface TattooSet { id: string; name: string; boss: string; mode: "pacan" | "blat" | "avtor"; bonus: { weapon: string; damage: number }; pieces: TattooPiece[] }

export const TATTOO_SETS: TattooSet[] = [
  {
    id: "ice", name: "Вечная мерзлота", boss: "datsik", mode: "pacan", bonus: { weapon: "keyboard", damage: 50 },
    pieces: [
      { id: "tat-ice-face", name: "Снежинка на скуле", part: "HEAD" },
      { id: "tat-ice-neck", name: "Ледяное ожерелье", part: "HEAD" },
      { id: "tat-ice-chest-l", name: "Белый медведь", part: "TORSO" },
      { id: "tat-ice-chest-r", name: "Волк", part: "TORSO" },
      { id: "tat-ice-belly", name: "«Вечная мерзлота»", part: "TORSO" },
      { id: "tat-ice-shoulder-l", name: "Снежная мандала (левое плечо)", part: "SHOULDER_L" },
      { id: "tat-ice-shoulder-r", name: "Снежная мандала (правое плечо)", part: "SHOULDER_R" },
      { id: "tat-ice-biceps-l", name: "Горы и северное сияние", part: "SHOULDER_L" },
      { id: "tat-ice-biceps-r", name: "Заснеженный лес", part: "SHOULDER_R" },
      { id: "tat-ice-elbow-l", name: "Иней на локте (левом)", part: "ARM_L" },
      { id: "tat-ice-elbow-r", name: "Иней на локте (правом)", part: "ARM_R" },
      { id: "tat-ice-forearm-l", name: "Сосульки", part: "ARM_L" },
      { id: "tat-ice-forearm-r", name: "Полярная сова", part: "ARM_R" },
      { id: "tat-ice-hand-l", name: "Снежинка на кисти", part: "ARM_L" },
      { id: "tat-ice-hand-r", name: "Медведь на льдине", part: "HAND" },
      { id: "tat-ice-knee-l", name: "Снежинка на колене (левом)", part: "LEG_L" },
      { id: "tat-ice-knee-r", name: "Снежинка на колене (правом)", part: "LEG_R" },
      { id: "tat-ice-shin-l", name: "Мороз и горы (левая нога)", part: "LEG_L" },
      { id: "tat-ice-shin-r", name: "Мороз и горы (правая нога)", part: "LEG_R" },
      { id: "tat-ice-foot-l", name: "Снежный след (левая стопа)", part: "LEG_L" },
      { id: "tat-ice-foot-r", name: "Снежный след (правая стопа)", part: "LEG_R" },
    ],
  },
];

export const TATTOO_IDS = TATTOO_SETS.flatMap((s) => s.pieces.map((p) => p.id));
export const tattooSetOf = (id: string) => TATTOO_SETS.find((s) => s.pieces.some((p) => p.id === id));
export const tattooPiece = (id: string) => TATTOO_SETS.flatMap((s) => s.pieces).find((p) => p.id === id);
export const tattooSetsOfBoss = (bossId: string) => TATTOO_SETS.filter((s) => s.boss === bossId);
