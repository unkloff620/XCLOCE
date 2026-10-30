"use client";
/*
 * Пепе, the event boss: the artist's layers (pepe-data.ts, tools/boss/pepe/assemble.py) drawn as soft meshes on one
 * WebGL canvas and bent by bones placed on the artist's yellow dots — 2-D deformation and turns only, he does not
 * strike at the screen. Every vertex is skinned to the bones of its layer, weighted by how near it lies to each of them,
 * so the elbows, the wrists, the fingers and the brows bend smoothly.
 * What he does: breathes fast and hard with his whole chest (the jumper swells on every breath, the shoulders and the
 * head ride on it, the mouth opens on the breath out), squeezes his fingers together, tosses the pill from hand to hand,
 * raises and knits his brows, blinks (the lids slide over the eyes like shutters) and looks about.
 * `view`: the part of the rig to show ([x, y, w, h] in rig px), e.g. the head and shoulders on the boss list.
 */
import { useEffect, useRef } from "react";
import { PEPE } from "./pepe-data.ts";

type V = readonly [number, number];
const P = PEPE.pts as unknown as Record<string, V>;
const L = PEPE.layers as unknown as Record<string, readonly [number, number, number, number]>;
// the head has holes for the eyes: the whites, the pupils and the four lids lie behind it, the lids slide like shutters
// the far (right) arm goes behind the body; each hand lies over its own sleeve
const ORDER = ["legs", "sleeveR", "handR", "body", "sleeveL", "handL", "whites", "pupils", "lidLL", "lidLR", "lidUL", "lidUR", "head", "mouth", "pill"] as const;
const FACE = new Set<string>(["head", "whites", "pupils", "lidLL", "lidLR", "lidUL", "lidUR"]);
const LID_SLIDE = PEPE.lids as unknown as Record<"UL" | "UR" | "LL" | "LR", number>;
type LayerId = (typeof ORDER)[number];
const mid = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const neck = mid(P.neckL, P.neckR);

/* ---------------- bones ---------------- */
type BoneId = "root" | "chest" | "head" | "browL" | "browR" | "mouthL" | "mouthM" | "mouthR"
  | "armL" | "foreL" | "handL" | "fingL1" | "fingL2" | "armR" | "foreR" | "handR" | "fingR1" | "fingR2";
interface Bone { parent: BoneId | null; pivot: V; /** rest segments the vertices measure their distance to */ segs: [V, V][] }
const seg = (a: V, b: V): [V, V] => [a, b];
const pin = (a: V): [V, V] => [a, a];
const BONES: Record<BoneId, Bone> = {
  root: { parent: null, pivot: P.waist, segs: [seg(P.hipL, P.hipR), pin(P.waist), seg(P.hipL, P.footL), seg(P.hipR, P.footR)] },
  chest: { parent: "root", pivot: P.waist, segs: [seg(P.chest, P.belly), seg(P.neckL, P.chest), seg(P.neckR, P.chest)] },
  head: { parent: "chest", pivot: neck, segs: [pin(P.headTL), pin(P.headTR), pin(P.cheek), pin(P.chinL), pin(P.chinR), seg(neck, mid(P.headTL, P.headTR))] },
  // the brows lift the folds above each eye as a whole (a segment along the brow, not across it: no dents in the lines)
  browL: { parent: "head", pivot: P.browL, segs: [seg([P.browL[0] - 38, P.browL[1] - 8], [P.browL[0] + 38, P.browL[1] - 8])] },
  browR: { parent: "head", pivot: P.browR, segs: [seg([P.browR[0] - 34, P.browR[1] - 8], [P.browR[0] + 34, P.browR[1] - 8])] },
  mouthL: { parent: "head", pivot: P.mouthL, segs: [pin(P.mouthL)] },
  mouthM: { parent: "head", pivot: P.mouthM, segs: [pin(P.mouthM)] },
  mouthR: { parent: "head", pivot: P.mouthR, segs: [pin(P.mouthR)] },
  armL: { parent: "chest", pivot: P.shL, segs: [seg(P.shL, P.elL)] },
  foreL: { parent: "armL", pivot: P.elL, segs: [seg(P.elL, P.wrL)] },
  handL: { parent: "foreL", pivot: P.handL, segs: [seg(P.wrL, P.handL), seg(P.handL, P.fingL1)] },
  fingL1: { parent: "handL", pivot: P.fingL1, segs: [seg(P.fingL1, P.fingL1t)] },
  fingL2: { parent: "handL", pivot: P.handL, segs: [seg(mid(P.handL, P.fingL2t), P.fingL2t)] },
  armR: { parent: "chest", pivot: P.shR, segs: [seg(P.shR, P.elR)] },
  foreR: { parent: "armR", pivot: P.elR, segs: [seg(P.elR, P.wrR)] },
  handR: { parent: "foreR", pivot: P.handR, segs: [seg(P.wrR, P.handR), seg(P.handR, P.fingR2)] },
  fingR1: { parent: "handR", pivot: P.handR, segs: [seg(mid(P.handR, P.fingR1t), P.fingR1t)] },
  fingR2: { parent: "handR", pivot: P.fingR2, segs: [seg(P.fingR2, P.fingR2t)] },
};
/** the bones each layer is skinned to (the rigid ones: a single bone) */
const SKIN: Record<LayerId, BoneId[]> = {
  legs: ["root"],
  body: ["root", "chest"],
  sleeveL: ["chest", "armL", "foreL"],
  sleeveR: ["chest", "armR", "foreR"],
  handL: ["foreL", "handL", "fingL1", "fingL2"],
  handR: ["foreR", "handR", "fingR1", "fingR2"],
  head: ["head", "browL", "browR"],
  // everything seen through the eye holes bends exactly like the head around them (the same bones, the same weights)
  whites: ["head", "browL", "browR"], pupils: ["head", "browL", "browR"],
  lidLL: ["head", "browL", "browR"], lidLR: ["head", "browL", "browR"], lidUL: ["head", "browL", "browR"], lidUR: ["head", "browL", "browR"],
  mouth: ["mouthL", "mouthM", "mouthR"],
  pill: ["root"],
};

/** a 2-D affine: [a, b, c, d, e, f] → x' = a x + c y + e, y' = b x + d y + f */
type A = [number, number, number, number, number, number];
const I: A = [1, 0, 0, 1, 0, 0];
const mul = (m: A, n: A): A => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
/** rotate by deg about p, then move by (dx, dy) */
const local = (p: V, deg: number, dx = 0, dy = 0): A => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, p[0] - c * p[0] + s * p[1] + dx, p[1] - s * p[0] - c * p[1] + dy];
};
/** the same, scaled by k about p as well (a forearm coming towards us looks shorter) */
const localK = (p: V, deg: number, k: number): A => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r) * k, s = Math.sin(r) * k;
  return [c, s, -s, c, p[0] - c * p[0] + s * p[1], p[1] - s * p[0] - c * p[1]];
};
const ap = (m: A, x: number, y: number): V => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function distSeg(x: number, y: number, [a, b]: [V, V]) {
  const vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy;
  const t = l ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l)) : 0;
  return Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t);
}

/* ---------------- the motion ---------------- */
interface Pose { local: Record<BoneId, A>; breath: number; /** 0 open … 1 shut */ lid: number; look: number; pill: { at: V; rot: number } }
const ease = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** one fast, heavy breath: a quick gulp in, a longer breath out */
function breathOf(t: number) {
  const ph = (t % 1.15) / 1.15;
  return ph < 0.38 ? ease(ph / 0.38) : 1 - ease((ph - 0.38) / 0.62);
}
// held between the fingers (drawn over the hand), so it rides along when the arm flexes
const inFingers = (a: V, b: V, palm: V): V => { const m = mid(a, b); return [m[0] + (palm[0] - m[0]) * 0.3, m[1] + (palm[1] - m[1]) * 0.3]; };
const PILL_REST_R: V = inFingers(P.fingR1t, P.fingR2t, P.handR);
const PILL_REST_L: V = inFingers(P.fingL1t, P.fingL2t, P.handL);
const PILL_CYCLE = 4.6;

function poseAt(t: number): Pose {
  const b = breathOf(t);
  const lo: Record<string, A> = {};
  for (const k of Object.keys(BONES)) lo[k] = I;
  // the chest rides up on the breath, the head leans back a little, the shoulders lift
  lo.chest = local(P.waist, 0, 0, -7 * b);
  lo.head = local(neck, -2.2 * b + Math.sin(t * 0.7) * 1.2, 0, -2 * b);
  // the pill: in the right hand, a toss over to the left one, a while there, and back
  const c = t % PILL_CYCLE;
  const fly = (u: number, from: V, to: V, dir: number) => {
    const e = ease(u);
    return { at: [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e - Math.sin(Math.PI * u) * 300] as V, rot: dir * 540 * e };
  };
  // the throwing hand flicks up just before, the catching one gives a little under it
  const flick = (start: number) => { const u = (c - start) / 0.35; return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0; };
  const give = (land: number) => { const u = (c - land) / 0.4; return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0; };
  let pill: Pose["pill"];
  const T1 = 1.6, T2 = 2.35, T3 = 3.85;
  if (c < T1) pill = { at: PILL_REST_R, rot: 0 };
  else if (c < T2) pill = fly((c - T1) / (T2 - T1), PILL_REST_R, PILL_REST_L, -1);
  else if (c < T3) pill = { at: PILL_REST_L, rot: 0 };
  else pill = fly((c - T3) / (PILL_CYCLE - T3), PILL_REST_L, PILL_REST_R, 1);
  // the arm that holds the pill shows off a biceps between the tosses: the upper arm goes out, the forearm comes up at the
  // elbow, a few pumps at the top, and down again in time for the throw
  const curl = (u0: number, u1: number) => {
    if (c < u0 || c > u1) return 0;
    const u = (c - u0) / (u1 - u0);
    const up = u < 0.28 ? ease(u / 0.28) : u > 0.75 ? 1 - ease((u - 0.75) / 0.25) : 1;
    return up * (1 + (u > 0.28 && u < 0.75 ? 0.06 * Math.sin(((u - 0.28) / 0.47) * Math.PI * 6) : 0));
  };
  const cR = curl(0.05, T1 - 0.25), cL = curl(T2 + 0.15, T3 - 0.25);
  // the forearm leads (a curl with the elbow down), the upper arm comes up after it — the fist never swings far out
  const fR = Math.min(1.06, cR * 1.6), fL = Math.min(1.06, cL * 1.6);
  const uR = clamp01((cR - 0.4) / 0.6), uL = clamp01((cL - 0.4) / 0.6);
  const wristR = -24 * flick(T1 - 0.2) + 8 * give(0);
  const wristL = 24 * flick(T3 - 0.2) - 8 * give(T2);
  // the fingers squeeze together now and then (two quick squeezes), each hand on its own beat
  const sq = (ofs: number) => { const u = ((t + ofs) % 3.1) / 3.1; return u < 0.12 ? Math.sin((Math.PI * u) / 0.12) : u > 0.18 && u < 0.3 ? Math.sin((Math.PI * (u - 0.18)) / 0.12) : 0; };
  const sL = sq(0.9), sR = sq(0);
  // a biceps pose: the upper arm out level with the shoulder, the forearm straight up, the fist by the head
  lo.armL = local(P.shL, 2.5 * b + 26 * uL, 0, -2 * b - 6 * uL);
  lo.armR = local(P.shR, -2.5 * b - 34 * uR, 0, -2 * b - 6 * uR);
  // halfway up the forearm points at us: it looks shorter, so the fist does not swing far out to the side
  const shortL = 1 - 0.5 * Math.sin(Math.PI * Math.min(1, fL)), shortR = 1 - 0.4 * Math.sin(Math.PI * Math.min(1, fR));
  lo.foreL = localK(P.elL, -3 * b + 128 * fL, shortL);
  lo.foreR = localK(P.elR, 3 * b - 108 * fR, shortR);
  // the fist turns in a little at the top of the curl
  lo.handL = localK(P.handL, wristL + 4 * b + 20 * cL, 1 / shortL); // the fist keeps its size
  lo.handR = localK(P.handR, wristR - 4 * b - 20 * cR, 1 / shortR);
  lo.fingL1 = local(P.fingL1, -7 * sL);
  lo.fingL2 = local(P.handL, 9 * sL);
  lo.fingR1 = local(P.handR, -9 * sR);
  lo.fingR2 = local(P.fingR2, 8 * sR);
  // brows: raised now and then, knitted on the breath in
  const raise = (() => { const u = (t % 5.3) / 5.3; return u > 0.6 && u < 0.78 ? Math.sin((Math.PI * (u - 0.6)) / 0.18) : 0; })();
  lo.browL = local(P.browL, -2 * raise + 1.5 * b, 0, -6 * raise - 1.5 * b);
  lo.browR = local(P.browR, 2 * raise - 1.5 * b, 0, -6 * raise - 1.5 * b);
  // the mouth: open on the breath out (the middle drops), the corners twitch
  const out = 1 - b;
  lo.mouthM = local(P.mouthM, 0, 0, 7 * out);
  lo.mouthL = local(P.mouthL, 0, -1.5 * out, 2 * out + Math.sin(t * 2.1) * 1.2);
  lo.mouthR = local(P.mouthR, 0, 1.5 * out, 2 * out - Math.sin(t * 1.7) * 1.2);
  // smooth blinks every few seconds (now and then a double one): the lids close fast, stay a moment, open slower
  const shut = (u: number) => (u < 0 ? 0 : u < 0.08 ? ease(u / 0.08) : u < 0.13 ? 1 : u < 0.3 ? 1 - ease((u - 0.13) / 0.17) : 0);
  const n = Math.floor(t / 3.7), bl = t % 3.7;
  const lid = Math.max(shut(bl), n % 3 === 2 ? shut(bl - 0.34) : 0);
  // and the eyes look about
  const look = Math.sin(t * 0.55) > 0.6 ? 1 : Math.sin(t * 0.55) < -0.75 ? -1 : 0;
  return { local: lo as Record<BoneId, A>, breath: b, lid, look, pill };
}

function worldOf(lo: Record<BoneId, A>): Record<BoneId, A> {
  const w = {} as Record<BoneId, A>;
  const get = (id: BoneId): A => {
    if (w[id]) return w[id];
    const p = BONES[id].parent;
    w[id] = p ? mul(get(p), lo[id]) : lo[id];
    return w[id];
  };
  for (const id of Object.keys(BONES) as BoneId[]) get(id);
  return w;
}

/* ---------------- the meshes ---------------- */
interface Mesh { id: LayerId; rest: Float32Array; uv: Float32Array; idx: Uint16Array; w: Float32Array; bones: BoneId[]; tex: WebGLTexture | null; pos: Float32Array; pb: WebGLBuffer | null; ub: WebGLBuffer | null; ib: WebGLBuffer | null; n: number }
const CELL = 7; // rig px between vertices

function buildMesh(gl: WebGLRenderingContext, id: LayerId, img: HTMLImageElement): Mesh {
  const [x0, y0, w, h] = L[id];
  // which cells hold something (no triangles over empty air)
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext("2d")!;
  cx.drawImage(img, 0, 0);
  const alpha = cx.getImageData(0, 0, cv.width, cv.height).data;
  const nx = Math.max(2, Math.ceil(w / CELL)), ny = Math.max(2, Math.ceil(h / CELL));
  const filled = (i: number, j: number) => {
    const ax = Math.floor((i / nx) * cv.width), bx = Math.min(cv.width, Math.ceil(((i + 1) / nx) * cv.width));
    const ay = Math.floor((j / ny) * cv.height), by = Math.min(cv.height, Math.ceil(((j + 1) / ny) * cv.height));
    for (let y = ay; y < by; y += 2) for (let x = ax; x < bx; x += 2) if (alpha[(y * cv.width + x) * 4 + 3] > 4) return true;
    return false;
  };
  const rest: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { rest.push(x0 + (w * i) / nx, y0 + (h * j) / ny); uv.push(i / nx, j / ny); }
  const v = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (filled(i, j)) idx.push(v(i, j), v(i + 1, j), v(i, j + 1), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
  const bones = SKIN[id];
  const n = rest.length / 2;
  const wt = new Float32Array(n * bones.length);
  for (let k = 0; k < n; k++) {
    const x = rest[k * 2], y = rest[k * 2 + 1];
    let sum = 0;
    for (let b = 0; b < bones.length; b++) {
      const d = Math.min(...BONES[bones[b]].segs.map((s) => distSeg(x, y, s)));
      // the face handles reach only near their points; the body bones blend over a wider band
      // the fingers blend softly (no cracks between them), the arms and the body a little sharper
      const id0 = bones[b];
      const fall = id0.startsWith("brow") ? 34 : id0.startsWith("mouth") ? 60 : id0.startsWith("fing") || id0 === "handL" || id0 === "handR" ? 40 : id0.startsWith("arm") || id0.startsWith("fore") ? 30 : 22;
      const q = 1 / Math.pow(d / fall + 0.05, id0.startsWith("fing") || id0.startsWith("brow") ? 2.5 : 4);
      wt[k * bones.length + b] = q; sum += q;
    }
    // the brows only move what is near them: the rest of the head stays with the head
    // the face: a smooth oval field around each brow (no dents in the drawn lines), the rest stays with the head
    if (FACE.has(id)) {
      const field = (c: V) => { const r = Math.hypot((x - c[0]) / 62, (y - c[1] + 6) / 44); return ease(clamp01(1 - r)); };
      const fL = field(P.browL), fR = field(P.browR);
      const hb = bones.indexOf("head"), bl = bones.indexOf("browL"), br = bones.indexOf("browR");
      for (let q = 0; q < bones.length; q++) wt[k * bones.length + q] = 0;
      wt[k * bones.length + bl] = fL; wt[k * bones.length + br] = fR; wt[k * bones.length + hb] = Math.max(0, 1 - fL - fR);
      sum = 1;
    }
    for (let b = 0; b < bones.length; b++) wt[k * bones.length + b] /= sum || 1;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const m: Mesh = { id, rest: new Float32Array(rest), uv: new Float32Array(uv), idx: new Uint16Array(idx), w: wt, bones, tex, pos: new Float32Array(rest.length), pb: gl.createBuffer(), ub: gl.createBuffer(), ib: gl.createBuffer(), n };
  gl.bindBuffer(gl.ARRAY_BUFFER, m.ub); gl.bufferData(gl.ARRAY_BUFFER, m.uv, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
  return m;
}

/** the jumper swells on the breath in: wider at the chest, the hem stays */
function swell(x: number, y: number, b: number): V {
  const top = P.neckL[1], bot = P.waist[1];
  const u = clamp01((y - top) / (bot - top));
  const g = Math.sin(Math.PI * Math.min(1, u * 1.25)) * (1 - u * 0.4);
  return [P.chest[0] + (x - P.chest[0]) * (1 + 0.07 * b * g), y - 5 * b * g * (1 - u)];
}

const VS = `attribute vec2 p; attribute vec2 t; uniform vec4 r; varying vec2 v;
void main(){ v = t; vec2 q = (p - r.xy) / r.zw; gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0); }`;
const FS = `precision mediump float; varying vec2 v; uniform sampler2D s; uniform float a;
void main(){ gl_FragColor = texture2D(s, v) * a; }`;

export function PepeRig({ view, className }: { view?: readonly [number, number, number, number]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = view ?? [0, 0, PEPE.w, PEPE.h];
  const key = box.join(",");
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const aP = gl.getAttribLocation(pr, "p"), aT = gl.getAttribLocation(pr, "t");
    const uR = gl.getUniformLocation(pr, "r"), uA = gl.getUniformLocation(pr, "a");
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    let alive = true, raf = 0;
    const meshes: Mesh[] = [];
    Promise.all(ORDER.map((id) => new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `/bosses/pepe/rig/${id}.webp`; })))
      .then((imgs) => { if (alive) imgs.forEach((im, i) => meshes.push(buildMesh(gl, ORDER[i], im))); })
      .catch(() => undefined);
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!meshes.length) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
      if (!W || !H) return;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      // fit the view box into the canvas, keeping its proportions (bottom-centred)
      const k = Math.min(W / box[2], H / box[3]);
      const vw = W / k, vh = H / k;
      gl.uniform4f(uR, box[0] - (vw - box[2]) / 2, box[1] - (vh - box[3]), vw, vh);
      const t = (now - t0) / 1000;
      const pose = poseAt(t);
      const wd = worldOf(pose.local);
      for (const m of meshes) {
        const nb = m.bones.length;
        for (let v = 0; v < m.n; v++) {
          let x = m.rest[v * 2], y = m.rest[v * 2 + 1];
          if (m.id === "body") [x, y] = swell(x, y, pose.breath);
          if (m.id === "pupils") x += pose.look * 5;
          if (m.id.startsWith("lid")) y += LID_SLIDE[m.id.slice(3) as "UL"] * pose.lid;
          let ox = 0, oy = 0;
          if (m.id === "pill") {
            const c = mid(P.pillA, P.pillB), r = (pose.pill.rot * Math.PI) / 180;
            const dx = x - c[0], dy = y - c[1];
            ox = pose.pill.at[0] + dx * Math.cos(r) - dy * Math.sin(r); oy = pose.pill.at[1] + dx * Math.sin(r) + dy * Math.cos(r);
            // in a hand it moves with that hand
            const inR = pose.pill.at === PILL_REST_R, inL = pose.pill.at === PILL_REST_L;
            if (inR || inL) { const q = ap(wd[inR ? "handR" : "handL"], ox, oy); ox = q[0]; oy = q[1]; }
          } else {
            for (let b = 0; b < nb; b++) {
              const wt = m.w[v * nb + b];
              if (wt < 1e-4) continue;
              const q = ap(wd[m.bones[b]], x, y);
              ox += q[0] * wt; oy += q[1] * wt;
            }
          }
          m.pos[v * 2] = ox; m.pos[v * 2 + 1] = oy;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, m.pb); gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.ub); gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
        gl.bindTexture(gl.TEXTURE_2D, m.tex);
        gl.uniform1f(uA, 1);
        gl.drawElements(gl.TRIANGLES, m.idx.length, gl.UNSIGNED_SHORT, 0);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className={className} style={{ display: "block", width: "100%", height: "100%" }} aria-hidden="true" />;
}
