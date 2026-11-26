"use client";
/*
 * Химик's lab in 1024×1843 (tools/boss/build-himik-room.py, the artist's layers): the evening sky drifts behind the
 * barred window over the houses; the poison boils in the round flask on the burner (its flame flickers), runs up the bend,
 * down the condenser and the pipes and drips into the three cone flasks — they fill up while the round one empties, then
 * it all flows back; the hanging fluorescent lamp swings to and fro (towards us it grows and rises) and blinks, the room
 * darkening with it; the desk lamp on the left blinks too. `stool` — his stool (off in the player's home: his own chair
 * stands there).
 */
import { HIMIK_ROOM as R } from "./arena-himik-data.ts";

const A = "/assets/arena/himik";
const RH = 1843;
const P = { top: "#9dff3a", mid: "#46d10f", deep: "#167a0a", line: "#e2ffa8" };
const box = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x, y: b.y, width: b.w, height: b.h, preserveAspectRatio: "none" as const });
const at = (x: number, y: number) => ({ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" as const });

/** a liquid's body: a wavy surface at y (humps len wide, amp high) from x0 to x1 (+ one len to slide), down to bottom */
function surf(x0: number, x1: number, y: number, bottom: number, amp: number, len: number) {
  let d = `M${x0} ${y}`;
  for (let x = x0, k = 0; x <= x1 + len; x += len / 2, k++) d += ` Q${(x + len / 4).toFixed(1)} ${(y + (k % 2 ? amp : -amp)).toFixed(1)} ${(x + len / 2).toFixed(1)} ${y}`;
  return { top: d, body: `${d} L${x1 + len} ${bottom} L${x0} ${bottom} Z` };
}

export function HimikRoom({ uid = "a", stool = true }: { uid?: string; stool?: boolean }) {
  const s = R.sky, f = R.flask, sm = R["still-mask"];
  const mid = `hmr-m-${uid}`, gid = `hmr-g-${uid}`;
  const vessel = (x: number, w: number, y: number, bottom: number, drop: number, cls: string, i: number) => {
    const a = surf(x - 14, x + w + 4, y, bottom + 4, 1.1, 9), b = surf(x - 14, x + w + 4, y + 0.8, bottom + 4, 0.8, 7);
    return (
      <g key={i} className={`hmr-lvl ${cls}`} style={{ ["--d" as string]: `${drop}px` }}>
        <g className="hmr-wave hmr-wave-b"><path d={b.body} fill={P.deep} opacity={0.7} /></g>
        <g className="hmr-wave hmr-wave-f"><path d={a.body} fill={`url(#${gid})`} opacity={0.9} /><path d={a.top} fill="none" stroke={P.line} strokeWidth={0.7} opacity={0.8} /></g>
      </g>
    );
  };
  return (
    <g className="hmr-live">
      <defs>
        <radialGradient id={`hmr-tube-${uid}`}>
          <stop offset="0" stopColor="#fff1c8" stopOpacity="0.85" />
          <stop offset="0.4" stopColor="#ffcf78" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffb04a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`hmr-glow-${uid}`}>
          <stop offset="0" stopColor="#ffe6a8" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffc46a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff9a3a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`hmr-flame-${uid}`}>
          <stop offset="0" stopColor="#bfe8ff" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="#3aa0ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff7a2a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`hmr-pois-${uid}`}>
          <stop offset="0" stopColor="#9dff3a" stopOpacity="0.5" />
          <stop offset="1" stopColor="#46d10f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`hmr-cone-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe3a0" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffc46a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={P.top} />
          <stop offset="0.4" stopColor={P.mid} />
          <stop offset="1" stopColor={P.deep} />
        </linearGradient>
        <mask id={mid} maskUnits="userSpaceOnUse" x={sm.x} y={sm.y} width={sm.w} height={sm.h}>
          <image href={`${A}/still-mask.webp`} {...box(sm)} />
        </mask>
      </defs>
      <rect x={0} y={0} width={1024} height={RH} fill="#2a2030" />
      {/* the sky drifts behind the window: the tile three times in a row, sliding by one tile */}
      <g className="hmr-sky" style={{ ["--tile" as string]: `${-s.tile}px` }}>
        {[0, 1, 2].map((i) => <image key={i} href={`${A}/sky.webp`} x={s.x + i * s.tile} y={s.y} width={s.tile} height={s.tile} preserveAspectRatio="none" />)}
      </g>
      <image href={`${A}/city.webp`} {...box(R.city)} />
      <image href={`${A}/room.webp`} x={0} y={0} width={1024} height={RH} preserveAspectRatio="none" />
      {/* the desk lamp: its bulb glows and its light falls on the desk; it blinks */}
      <g className="hmr-desk" style={{ mixBlendMode: "screen" }}>
        <ellipse cx={R.desk.pool[0]} cy={R.desk.pool[1]} rx={150} ry={60} fill={`url(#hmr-glow-${uid})`} opacity={0.45} />
        <circle cx={R.desk.bulb[0]} cy={R.desk.bulb[1]} r={52} fill={`url(#hmr-glow-${uid})`} />
      </g>
      <ellipse className="hmr-desk-off" cx={R.desk.bulb[0]} cy={R.desk.bulb[1] + 2} rx={34} ry={15} transform={`rotate(-22 ${R.desk.bulb[0]} ${R.desk.bulb[1]})`}
        fill="#3a2a22" style={{ mixBlendMode: "multiply" }} />
      {stool && <image href={`${A}/stool.webp`} {...box(R.stool)} />}
      <image href={`${A}/rack.webp`} {...box(R.rack)} />
      {/* the burner's flame under the round flask flickers */}
      <g style={{ mixBlendMode: "screen" }}>
        <ellipse className="hmr-flame" cx={R.flame[0]} cy={R.flame[1]} rx={22} ry={11} fill={`url(#hmr-flame-${uid})`} style={at(R.flame[0], R.flame[1] + 6)} />
      </g>
      {/* the distilling glass: the solid copy, the poison in its inside, the see-through copy over it */}
      <image href={`${A}/still-b.webp`} {...box(R["still-b"])} />
      <g mask={`url(#${mid})`}>
        {/* the round flask: it boils (bubbles from the bottom), its level drops while the cone flasks fill */}
        {vessel(f.x, f.w, f.lvl, f.y + f.h, f.low - f.lvl, "hmr-lvl-flask", 0)}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <circle key={i} className="hmr-bub" cx={f.x + f.w * (0.18 + 0.11 * i)} cy={f.y + f.h - 3} r={0.9 + (i % 3) * 0.55}
            fill="rgba(230,255,200,0.8)" style={{ animationDelay: `${(i * 0.37) % 1.6}s`, ["--rise" as string]: `${(f.y + f.h - f.lvl - 4).toFixed(1)}px` }} />
        ))}
        {/* the poison runs through the bend, the condenser and the pipes and drips down the necks */}
        <g className="hmr-flow">
          {R.flow.map((pts, i) => (
            <g key={i}>
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={P.mid} strokeWidth={i ? 2.4 : 3} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} />
              <polyline className="hmr-run" points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={P.line}
                strokeWidth={i ? 2.6 : 3.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 8" />
            </g>
          ))}
        </g>
        {R.cones.map((c, i) => vessel(c.x, c.w, c.full, c.bottom, c.bottom - c.full - 2, `hmr-lvl-cone hmr-lvl-c${i}`, i + 1))}
      </g>
      <image href={`${A}/still-a.webp`} {...box(R["still-a"])} opacity={0.5} />
      <g style={{ mixBlendMode: "screen" }}>
        <ellipse className="hmr-pois-glow" cx={f.x + f.w / 2} cy={f.y + f.h * 0.6} rx={f.w * 0.9} ry={f.h * 0.8} fill={`url(#hmr-pois-${uid})`} />
      </g>
      {/* the room darkens when the hanging lamp blinks off */}
      <rect className="hmr-dark" x={0} y={0} width={1024} height={RH} fill="#0d0710" />
      {/* the hanging lamp swings to and fro round the far wall's vanishing point: towards us it grows and rises; its light
          (the tubes' glow, the light falling down) goes with it and blinks, its copy with the tubes off shows when it's off */}
      <g className="hmr-lamp" style={at(R.vanish[0], R.vanish[1])}>
        <g className="hmr-light" style={{ mixBlendMode: "screen" }}>
          <polygon points={`${R.tubes[0] - 250},${R.tubes[1] + 20} ${R.tubes[0] + 250},${R.tubes[1] + 20} ${R.tubes[0] + 470},${R.tubes[1] + 1250} ${R.tubes[0] - 470},${R.tubes[1] + 1250}`} fill={`url(#hmr-cone-${uid})`} />
          <ellipse cx={R.tubes[0]} cy={R.tubes[1]} rx={330} ry={110} fill={`url(#hmr-tube-${uid})`} />
        </g>
        <image href={`${A}/lamp.webp`} {...box(R.lamp)} />
        <image className="hmr-lamp-off" href={`${A}/lamp-off.webp`} {...box(R["lamp-off"])} />
      </g>
    </g>
  );
}
