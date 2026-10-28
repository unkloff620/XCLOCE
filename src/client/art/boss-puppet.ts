"use client";
/*
 * Puppet warp for the boss rigs: the body, the tail and the arms are drawn as soft meshes (WebGL) instead of stiff
 * cut-outs. The SVG rig (boss-rig.tsx) keeps all its CSS animations — breath, swings, hits, strikes, the scared look —
 * and every frame we read where each bone group is (getScreenCTM) and skin the meshes with those bones:
 * a vertex near a joint is blended between the two bones that meet there, so an elbow, a shoulder or the neck bends
 * in a smooth curve, and the body around a shoulder or under the head moves with them.
 * The SVG copies of these pictures (class "pp") are hidden while the meshes draw; without WebGL nothing changes.
 * Two canvases: "back" under the SVG (tail, the arm behind the body, the body) and "front" over it (forearms, arms).
 */
import { useEffect, type RefObject } from "react";

type M = DOMMatrix;
type Mesh = {
  img: SVGImageElement;
  tex: WebGLTexture | null;
  /** rig px of each vertex */
  pts: Float32Array;
  uv: Float32Array;
  idx: Uint16Array;
  /** per vertex: up to 3 [boneSlot, weight] */
  w: { slot: number; k: number }[][];
  /** the bone groups this mesh uses: 0 = own frame (the image's parent), then parent / children */
  bones: Element[];
  /** the body: it also breathes by itself — the chest widens and lifts a little, the feet stay put */
  body: boolean;
  /** body only: rig box, for the breathing */
  box: [number, number, number, number];
  pos: Float32Array;
  posBuf: WebGLBuffer | null;
  uvBuf: WebGLBuffer | null;
  idxBuf: WebGLBuffer | null;
};

const VS = `attribute vec2 p; attribute vec2 t; uniform vec2 r; varying vec2 v;
void main(){ v = t; gl_Position = vec4(p.x / r.x * 2.0 - 1.0, 1.0 - p.y / r.y * 2.0, 0.0, 1.0); }`;
const FS = `precision mediump float; varying vec2 v; uniform sampler2D s; void main(){ gl_FragColor = texture2D(s, v); }`;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function pivotOf(g: Element): [number, number] | null {
  const v = g.getAttribute("data-pivot");
  if (!v) return null;
  const [x, y] = v.split(",").map(Number);
  return [x, y];
}

/** the child bones of a group: its own bone sub-groups (one level, through plain wrappers) */
function childBones(g: Element): Element[] {
  const out: Element[] = [];
  const seen = new Set<string>();
  for (const c of Array.from(g.children)) {
    if (c.tagName.toLowerCase() !== "g" || !c.hasAttribute("data-pivot")) continue;
    // an arm split in two copies (shoulder behind, forearm in front) is one joint
    const k = c.getAttribute("class") ?? "";
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function buildMesh(gl: WebGLRenderingContext, img: SVGImageElement): Mesh {
  const x = +img.getAttribute("x")!, y = +img.getAttribute("y")!, w = +img.getAttribute("width")!, h = +img.getAttribute("height")!;
  // about one vertex per 22 rig px, at least 6 a side
  const nx = Math.max(6, Math.min(26, Math.round(w / 22))), ny = Math.max(6, Math.min(36, Math.round(h / 22)));
  const pts: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    pts.push(x + (w * i) / nx, y + (h * j) / ny);
    uv.push(i / nx, j / ny);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  // bones: own frame (the image's parent group), its parent (when the own group is a joint), its child joints
  const own = img.parentElement!;
  const bones: Element[] = [own];
  const ownPivot = pivotOf(own);
  const parent = ownPivot ? own.parentElement : null;
  if (parent) bones.push(parent);
  const kids = childBones(own);
  bones.push(...kids);
  const size = (el: Element) => {
    // the size of the part that hangs on a joint: data-pp-size when the rig says so, else its first image
    const given = el.getAttribute("data-pp-size");
    if (given) return +given;
    const im = el.querySelector("image");
    return im ? Math.min(+im.getAttribute("width")!, +im.getAttribute("height")!) : 80;
  };
  const W: { slot: number; k: number }[][] = [];
  for (let n = 0; n < pts.length / 2; n++) {
    const px = pts[n * 2], py = pts[n * 2 + 1];
    const ws: { slot: number; k: number }[] = [{ slot: 0, k: 1 }];
    // blend towards the parent near our own joint
    if (parent && ownPivot) {
      const R = Math.max(16, Math.min(70, size(own) * 0.42));
      const f = 0.5 * (1 - smooth(0, R, Math.hypot(px - ownPivot[0], py - ownPivot[1])));
      if (f > 0.002) { ws[0].k -= f; ws.push({ slot: 1, k: f }); }
    }
    // and towards each child near its joint
    kids.forEach((kid, i) => {
      const pv = pivotOf(kid);
      if (!pv) return;
      const R = Math.max(16, Math.min(70, size(kid) * 0.42));
      const f = 0.5 * (1 - smooth(0, R, Math.hypot(px - pv[0], py - pv[1])));
      if (f > 0.002) { ws[0].k -= f; ws.push({ slot: (parent ? 2 : 1) + i, k: f }); }
    });
    W.push(ws);
  }
  const mesh: Mesh = {
    img, tex: null, pts: new Float32Array(pts), uv: new Float32Array(uv), idx: new Uint16Array(idx), w: W, bones,
    body: img.getAttribute("data-pp-body") === "1", box: [x, y, w, h],
    pos: new Float32Array(pts.length), posBuf: gl.createBuffer(), uvBuf: gl.createBuffer(), idxBuf: gl.createBuffer(),
  };
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
  return mesh;
}

function setup(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true }) as WebGLRenderingContext | null;
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  return { gl, aP: gl.getAttribLocation(prog, "p"), aT: gl.getAttribLocation(prog, "t"), uR: gl.getUniformLocation(prog, "r") };
}

function loadTex(gl: WebGLRenderingContext, href: string): Promise<WebGLTexture | null> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      res(t);
    };
    im.onerror = () => res(null);
    im.src = href;
  });
}

/**
 * Runs the puppet for one rig: `wrap` holds the two canvases and the SVG; the pictures to warp carry data-pp="back" or
 * "front" (in drawing order), the bone groups carry data-pivot="x,y" (rig px).
 */
export function usePuppet(wrap: RefObject<HTMLDivElement | null>, key: string, size: { w: number; h: number }, enabled: boolean) {
  useEffect(() => {
    const root = wrap.current;
    if (!root || !enabled) return;
    const svg = root.querySelector("svg") as SVGSVGElement | null;
    const back = root.querySelector("canvas.br-pup-back") as HTMLCanvasElement | null;
    const front = root.querySelector("canvas.br-pup-front") as HTMLCanvasElement | null;
    if (!svg || !back || !front) return;
    const B = setup(back), F = setup(front);
    if (!B || !F) return;
    let dead = false;
    let raf = 0;
    const layers = [
      { ctx: B, canvas: back, meshes: [] as Mesh[] },
      { ctx: F, canvas: front, meshes: [] as Mesh[] },
    ];
    const imgs = Array.from(svg.querySelectorAll<SVGImageElement>("image[data-pp]"));
    for (const im of imgs) {
      const L = im.getAttribute("data-pp") === "front" ? layers[1] : layers[0];
      L.meshes.push(buildMesh(L.ctx.gl, im));
    }
    Promise.all(layers.flatMap((L) => L.meshes.map(async (m) => {
      m.tex = await loadTex(L.ctx.gl, m.img.getAttribute("href")!);
    }))).then(() => {
      if (dead) return;
      root.dataset.on = "1";
      raf = requestAnimationFrame(frame);
    });
    const cache = new Map<Element, M>();
    const rel = (el: Element, inv: M): M => {
      let m = cache.get(el);
      if (!m) {
        const c = (el as SVGGraphicsElement).getScreenCTM();
        m = c ? inv.multiply(c as unknown as DOMMatrix) : new DOMMatrix();
        cache.set(el, m);
      }
      return m;
    };
    // a browser that leaves CSS motion out of getScreenCTM would freeze the puppet: if no bone moved in the first
    // 2 s, give the pictures back to the SVG
    let first: string | null = null;
    let moved = false;
    const started = performance.now();
    const probe = svg.querySelector(".br-breath");
    function frame(now: number) {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      if (!moved && probe) {
        const c = (probe as SVGGraphicsElement).getCTM();
        const k = c ? `${c.a.toFixed(4)},${c.d.toFixed(4)},${c.f.toFixed(2)}` : "";
        if (first === null) first = k;
        else if (k !== first) moved = true;
        if (!moved && now - started > 2000) {
          dead = true;
          cancelAnimationFrame(raf);
          delete root!.dataset.on;
          return;
        }
      }
      const sc = svg!.getScreenCTM();
      if (!sc) return;
      const inv = (sc as unknown as DOMMatrix).inverse();
      cache.clear();
      // the whole rig's own motion (the scared sway, the beaten-in pop) is on the SVG element: the canvases copy it
      const cs = getComputedStyle(svg!);
      for (const c of [back!, front!]) {
        if (c.style.transform !== cs.transform) c.style.transform = cs.transform;
        if (c.style.transformOrigin !== cs.transformOrigin) c.style.transformOrigin = cs.transformOrigin;
        if (c.style.opacity !== cs.opacity) c.style.opacity = cs.opacity;
      }
      const cw = root!.clientWidth, ch = root!.clientHeight;
      if (!cw || !ch) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // the SVG's viewBox → the canvas: preserveAspectRatio xMidYMax meet
      const s = Math.min(cw / size.w, ch / size.h);
      const ox = (cw - size.w * s) / 2, oy = ch - size.h * s;
      for (const L of layers) {
        const { gl, aP, aT, uR } = L.ctx;
        const pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
        if (L.canvas.width !== pw || L.canvas.height !== ph) { L.canvas.width = pw; L.canvas.height = ph; }
        gl.viewport(0, 0, pw, ph);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uR, pw, ph);
        for (const m of L.meshes) {
          if (!m.tex) continue;
          const mats = m.bones.map((b) => rel(b, inv));
          const n = m.pts.length / 2;
          // the body's own breath: a soft swell of the chest (most at a third from the top), the legs still
          const [bx, by, bw, bh] = m.box;
          const br = m.body ? (Math.sin((now / 3400) * Math.PI * 2) + 1) / 2 : 0;
          for (let v = 0; v < n; v++) {
            let x = m.pts[v * 2], y = m.pts[v * 2 + 1];
            if (br) {
              const t = (y - by) / bh;
              const g = Math.max(0, 1 - Math.abs(t - 0.3) / 0.32);
              const cx = bx + bw / 2;
              x = cx + (x - cx) * (1 + 0.016 * br * g);
              y -= 2.2 * br * g * (1 - t);
            }
            let X = 0, Y = 0;
            for (const { slot, k } of m.w[v]) {
              const t = mats[slot];
              X += k * (t.a * x + t.c * y + t.e);
              Y += k * (t.b * x + t.d * y + t.f);
            }
            m.pos[v * 2] = (ox + X * s) * dpr;
            m.pos[v * 2 + 1] = (oy + Y * s) * dpr;
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, m.posBuf);
          gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(aP);
          gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, m.uvBuf);
          gl.enableVertexAttribArray(aT);
          gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idxBuf);
          gl.bindTexture(gl.TEXTURE_2D, m.tex);
          gl.drawElements(gl.TRIANGLES, m.idx.length, gl.UNSIGNED_SHORT, 0);
        }
      }
    }
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      delete root.dataset.on;
      for (const L of layers) L.ctx.gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [wrap, key, size.w, size.h, enabled]);
}
