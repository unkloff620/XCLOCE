/*
 * Home scene layout (scene canvas 1060×1484 = the background picture).
 * Objects: x, y = top-left corner, w = width in scene units; height follows the picture's aspect (h/w).
 * Upgradable things have a level → picture "<kind>-<level>". Only level 1 is drawn so far.
 */
export const SCENE = { w: 1060, h: 1484 };

export const SCENE_OBJECTS = {
  desk: { x: 520, y: 400, w: 500, aspect: 0.9403 },
  monitor: { x: 600, y: 250, w: 230, aspect: 1.0, equipment: "monitor2" },
  pc: { x: 850, y: 318, w: 130, aspect: 1.4401, equipment: "pc" },
} as const;

/** Character placement: the 1000×1400 rig canvas scaled into the scene. */
export const CHARACTER = { x: 130, y: 430, scale: 0.8 };

/** Seat inside the rig canvas (under the hips). */
export const SEAT = { x: 320, y: 845, w: 360, aspect: 1.2068 };

export const ROOM_BG: Record<string, string> = { basic: "room-basic", office: "room-basic", penthouse: "room-basic" };
