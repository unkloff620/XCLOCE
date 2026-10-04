/*
 * Home scene layout (scene canvas 1060×1484 = the background picture).
 * Objects: x, y = top-left corner, w = width in scene units; height follows the picture's aspect (h/w); flip = mirror.
 * Upgradable things have a level → picture "<kind>-<level>". Only level 1 is drawn so far.
 */
export const SCENE = { w: 1060, h: 1484 };

export const SCENE_OBJECTS = {
  /** the desk stands behind the character; which desk = the item in the DESK slot (picture desk-<id>, aspect in client/art/desk-data.ts) */
  desk: { x: 140, y: 690, w: 780, aspect: 0.4, flip: false },
  /** on the desk top, right of the character; mirrored so the screen faces the room */
  monitor: { x: 690, y: 560, w: 190, aspect: 1.0, flip: true, equipment: "monitor2" },
  /** on the desk top, left of the character */
  pc: { x: 190, y: 585, w: 120, aspect: 1.4401, flip: true, equipment: "pc" },
} as const;

/** Character placement: the 1000×1400 rig canvas scaled into the scene. */
export const CHARACTER = { x: 130, y: 405, scale: 0.78 };

/** Seat inside the rig canvas (under the hips). */
export const SEAT = { x: 280, y: 670, w: 440, aspect: 1.5 }; // stretched taller: the seat hides under the shorts, the legs stand on the floor

export const ROOM_BG: Record<string, string> = { basic: "room-basic", office: "room-office", penthouse: "room-penthouse" };
/** opaque picture for the blurred backdrop around the scene (a room with a see-through window has a flat copy) */
export const ROOM_BACKDROP: Record<string, string> = { basic: "room-basic", office: "room-office", penthouse: "room-penthouse-flat" };
/** sky panorama drifting behind a see-through window (scene units; built by tools/scene/build-scene.py, SKY_Y/SKY_H) */
export const ROOM_SKY: Record<string, { src: string; y: number; w: number; h: number }> = {
  penthouse: { src: "/assets/home/penthouse-sky.webp", y: 40, w: 2640, h: 880 },
};
/** living light: glows laid over lamps drawn in the room (centre, radius in scene units) */
export const ROOM_LIGHTS: Record<string, { x: number; y: number; r: number; color: string; kind: "lamp" | "strip" }[]> = {
  office: [
    { x: 215, y: 380, r: 120, color: "#ffc46b", kind: "lamp" },
    { x: 843, y: 380, r: 120, color: "#ffc46b", kind: "lamp" },
  ],
  penthouse: [{ x: 530, y: 112, r: 520, color: "#ffb35c", kind: "strip" }],
};
