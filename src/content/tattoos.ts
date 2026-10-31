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
      { id: "tat-ice-face", name: "Снежинка и сосулька-слеза", part: "HEAD" },
      { id: "tat-ice-chest", name: "Белый медведь и звёзды", part: "TORSO" },
      { id: "tat-ice-belly", name: "«Вечная мерзлота»", part: "TORSO" },
      { id: "tat-ice-shoulder-l", name: "Ледяной погон (левый)", part: "SHOULDER_L" },
      { id: "tat-ice-shoulder-r", name: "Ледяной погон (правый)", part: "SHOULDER_R" },
      { id: "tat-ice-arm-l", name: "Колючка с сосульками", part: "ARM_L" },
      { id: "tat-ice-arm-r", name: "Часы без стрелок", part: "ARM_R" },
      { id: "tat-ice-hand", name: "Медведь на льдине", part: "HAND" },
      { id: "tat-ice-knee-l", name: "Звезда на колене (левом)", part: "LEG_L" },
      { id: "tat-ice-knee-r", name: "Звезда на колене (правом)", part: "LEG_R" },
      { id: "tat-ice-shin-l", name: "Кандалы и иней (левая нога)", part: "LEG_L" },
      { id: "tat-ice-shin-r", name: "Кандалы и иней (правая нога)", part: "LEG_R" },
    ],
  },
];

export const TATTOO_IDS = TATTOO_SETS.flatMap((s) => s.pieces.map((p) => p.id));
export const tattooSetOf = (id: string) => TATTOO_SETS.find((s) => s.pieces.some((p) => p.id === id));
export const tattooPiece = (id: string) => TATTOO_SETS.flatMap((s) => s.pieces).find((p) => p.id === id);
export const tattooSetsOfBoss = (bossId: string) => TATTOO_SETS.filter((s) => s.boss === bossId);
