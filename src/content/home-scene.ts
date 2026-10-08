/*
 * Home scene layout (scene canvas 1060×1484 = the background picture).
 * Objects: x, y = top-left corner, w = width in scene units; height follows the picture's aspect (h/w); flip = mirror.
 * Room things are bought piece by piece (content/home.ts EQUIPMENT pieces): which desk stands, which monitors, which chair.
 */
export const SCENE = { w: 1060, h: 1484 };

/** Bottom-anchored places (x, y = top-left for the nominal aspect; the real picture keeps the same bottom line). */
export const SCENE_OBJECTS = {
  /** the desk behind the character; picture = the desk stage (desk-001…004) */
  desk: { x: 70, y: 650, w: 920, aspect: 0.4, flip: false },
  /** monitors on the desk top (the middle hides behind the head, so it comes last):
   *  level 0 — the old CRT on the right; 1 — a flat one in its place; 2 — + left; 3 — + middle */
  monitorOld: { x: 650, y: 505, w: 215, aspect: 1.0, flip: true },
  // three in a row across the whole desk, stands on its back edge (the artist's reference): the sides turned in, the middle straight
  monitorCenter: { x: 368, y: 430, w: 309, aspect: 0.79, flip: false },
  monitorLeft: { x: 60, y: 400, w: 304, aspect: 1.0, flip: false },
  monitorRight: { x: 677, y: 400, w: 304, aspect: 1.0, flip: false },
  /** the system unit on the floor, right in the corner of the room (its back in the corner of the walls at x≈945, y≈885, the base on the floor in front of it) */
  pc: { x: 850, y: 756, w: 140, aspect: 1.4401, flip: false },
  /** trophies on the desk: the CLOSE statue (for Утилизатор) on the right end, next to the monitor */
  statueClose: { x: 872, y: 538, w: 108, aspect: 1.6112, flip: false },
} as const;

/** tap zones (scene units) that open the windows: bigger than the pictures so a finger hits them */
export const SCENE_HOT = {
  // the whole back of the room (monitors, desk): opens the room editor
  monitors: { x: 50, y: 390, w: 950, h: 330, equipment: "monitor2" },
  pc: { x: 830, y: 730, w: 200, h: 245, equipment: "pc" },
} as const;

/** the hero's body (head + torso, scene units), laid over the monitors' zone: a tap opens the wardrobe */
export const HERO_HOT = [
  { x: 405, y: 425, w: 235, h: 235 },
  { x: 265, y: 660, w: 520, h: 640 },
] as const;

/** Character placement: the 1000×1400 rig canvas scaled into the scene. */
export const CHARACTER = { x: 130, y: 405, scale: 0.78 };

/** Seat inside the rig canvas (under the hips). */
export const SEAT = { x: 280, y: 670, w: 440, aspect: 1.5 }; // stretched taller: the seat hides under the shorts, the legs stand on the floor

export const ROOM_BG: Record<string, string> = { basic: "room-basic", neon: "room-neon", boxing: "room-boxing", office: "room-office", penthouse: "room-penthouse" };
/** opaque picture for the blurred backdrop around the scene (a room with a see-through window has a flat copy) */
export const ROOM_BACKDROP: Record<string, string> = { basic: "room-basic", neon: "room-neon", boxing: "room-boxing", office: "room-office", penthouse: "room-penthouse-flat" };
/** RGB LED strip (violet → blue) along the ceiling and the sides: polylines in scene units */
export const ROOM_RGB: Record<string, number[][][]> = {
  neon: [
    [[28, 22], [118, 110], [942, 110], [1032, 22]],
    [[0, 918], [118, 850]],
    [[942, 850], [1060, 918]],
    [[118, 110], [118, 850]],
    [[942, 110], [942, 850]],
  ],
};
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
  boxing: [{ x: 528, y: 95, r: 150, color: "#ffc46b", kind: "lamp" }],
};
