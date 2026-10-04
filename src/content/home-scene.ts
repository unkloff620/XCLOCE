/*
 * Home scene layout (scene canvas 1060×1484 = the background picture).
 * Objects: x, y = top-left corner, w = width in scene units; height follows the picture's aspect (h/w); flip = mirror.
 * Upgradable things change with their level (content/home.ts EQUIPMENT stages): the desk picture, how many monitors stand on it.
 */
export const SCENE = { w: 1060, h: 1484 };

/** Bottom-anchored places (x, y = top-left for the nominal aspect; the real picture keeps the same bottom line). */
export const SCENE_OBJECTS = {
  /** the desk behind the character; picture = the desk stage (desk-001…004) */
  desk: { x: 140, y: 690, w: 780, aspect: 0.4, flip: false },
  /** monitors on the desk top (the middle hides behind the head, so it comes last):
   *  level 0 — the old CRT on the right; 1 — a flat one in its place; 2 — + left; 3 — + middle */
  monitorOld: { x: 690, y: 555, w: 190, aspect: 1.0, flip: true },
  monitorCenter: { x: 425, y: 579, w: 210, aspect: 0.79, flip: false },
  monitorLeft: { x: 175, y: 545, w: 200, aspect: 1.0, flip: false },
  monitorRight: { x: 685, y: 545, w: 200, aspect: 1.0, flip: false },
  /** the system unit on the floor, right in the corner of the room (its back in the corner of the walls at x≈945, y≈885, the base on the floor in front of it) */
  pc: { x: 868, y: 785, w: 120, aspect: 1.4401, flip: false },
} as const;

/** tap zones (scene units) that open the windows: bigger than the pictures so a finger hits them */
export const SCENE_HOT = {
  monitors: { x: 150, y: 520, w: 760, h: 250, equipment: "monitor2" },
  pc: { x: 845, y: 755, w: 190, h: 235, equipment: "pc" },
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
