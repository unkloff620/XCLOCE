/*
 * Home scene layout (scene canvas 1060×1484 = the background picture).
 * Objects: x, y = top-left corner, w = width in scene units; height follows the picture's aspect (h/w); flip = mirror.
 * Upgradable things have a level → picture "<kind>-<level>". Only level 1 is drawn so far.
 */
export const SCENE = { w: 1060, h: 1484 };

export const SCENE_OBJECTS = {
  /** stands on the floor in front of the back wall */
  desk: { x: 548, y: 598, w: 420, aspect: 0.9403, flip: false },
  /** on the desk top, in front of the shelf; mirrored so the screen faces the room */
  monitor: { x: 680, y: 522, w: 190, aspect: 1.0, flip: true, equipment: "monitor2" },
  /** on the floor to the right of the desk, mirrored */
  pc: { x: 925, y: 833, w: 120, aspect: 1.4401, flip: true, equipment: "pc" },
} as const;

/** Character placement: the 1000×1400 rig canvas scaled into the scene. */
export const CHARACTER = { x: 130, y: 405, scale: 0.78 };

/** Seat inside the rig canvas (under the hips). */
export const SEAT = { x: 250, y: 640, w: 500, aspect: 1.2068 };

export const ROOM_BG: Record<string, string> = { basic: "room-basic", office: "room-basic", penthouse: "room-basic" };
