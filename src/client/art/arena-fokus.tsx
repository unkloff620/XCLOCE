"use client";
/*
 * Фокус's room (tools/boss/build-fokus-room.py), alive in its own 1060×1484 units: the fan in the round window spins,
 * the ivy top right sways, the tree behind the window stirs; and the day turns into the night and back, fast (one
 * cycle — screens.css «Фокус's room», --fkr-cycle): the sun crosses the window left to right, then the moon, the day and
 * the night skies cross-fade (stars at night), the room goes dark at night and the lamp lights it, the window's light
 * falls on the floor with the fan's turning shadow in it, and the things on the floor (the cat, the cans, the chip
 * bags) cast shadows that swing from the right to the left as the sun (then the moon) goes over. All the motions run on
 * one clock (the same cycle, started together). Also the home room «Берлога кодера» (content/home-scene.ts).
 */
import { FOKUS_ROOM } from "./arena-fokus-data.ts";

const R = FOKUS_ROOM;
const A = "/assets/arena/fokus";
type Box = { x: number; y: number; w: number; h: number };
const PROPS = ["prop-0", "prop-1", "prop-2", "prop-3"] as const;
/** the ceiling lamp's bulb */
const LAMP = { x: 530, y: 142 };
/** a few stars in the window (fixed spots; each twinkles on its own beat) */
const STARS: [number, number, number][] = [
  [330, 300, 1.6], [372, 236, 1.2], [418, 330, 1.9], [455, 210, 1.3], [500, 280, 1.1], [560, 230, 1.7], [606, 300, 1.2],
  [650, 250, 1.5], [700, 320, 1.3], [612, 392, 1.0], [395, 405, 1.2], [470, 372, 1.4], [742, 380, 1.1], [520, 352, 1.0],
];

export function FokusRoom({ uid = "a" }: { uid?: string }) {
  const img = (n: string, cls?: string) => {
    const b = (R as unknown as Record<string, Box>)[n];
    return <image className={cls} href={`${A}/${n}.webp`} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" />;
  };
  const box = (n: string) => (R as unknown as Record<string, Box>)[n];
  const at = (x: number, y: number) => ({ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" as const });
  const [wx, wy] = R.win;
  const gr = R.glassR + 3;
  const pr = box("propeller");
  const fan = { x: pr.x + pr.w / 2, y: pr.y + pr.h / 2 };
  // a thing on the floor and its shadow: the same picture as a soft dark silhouette, flipped down from the thing's foot
  // and skewed by the light (screens.css fkr-shadow)
  const thing = (n: string) => {
    const b = box(n);
    return (
      <g key={n}>
        <g className="fkr-shadow" style={at(b.x + b.w / 2, b.y + b.h - 2)}>
          <image href={`${A}/${n}.webp`} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" filter={`url(#fkr-sil-${uid})`} />
        </g>
        {img(n, n === "cat" ? "fkr-cat" : undefined)}
      </g>
    );
  };
  return (
    <g className="fkr-live">
      <defs>
        <clipPath id={`fkr-win-${uid}`}><circle cx={wx} cy={wy} r={gr} /></clipPath>
        {/* the shadow: the picture's shape only, dark and soft */}
        <filter id={`fkr-sil-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feColorMatrix type="matrix" values="0 0 0 0 0.05  0 0 0 0 0.03  0 0 0 0 0.06  0 0 0 1 0" />
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
        <radialGradient id={`fkr-sun-${uid}`}>
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="0.32" stopColor="#ffe9a0" />
          <stop offset="0.36" stopColor="#ffd36a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb040" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`fkr-moon-${uid}`}>
          <stop offset="0" stopColor="#f4f7ff" />
          <stop offset="0.3" stopColor="#dfe6f5" />
          <stop offset="0.34" stopColor="#aac4ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#7d9cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`fkr-pool-${uid}`}>
          <stop offset="0" stopColor="#ffd9a0" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#ffb870" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ff9a50" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`fkr-mpool-${uid}`}>
          <stop offset="0" stopColor="#b9ccff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#7d9cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`fkr-lamp-${uid}`}>
          <stop offset="0" stopColor="#ffe2a8" stopOpacity="0.95" />
          <stop offset="0.25" stopColor="#ffc46b" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff9a40" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* behind the window: the skies, the stars, the sun and the moon, the tree on its hill */}
      <g clipPath={`url(#fkr-win-${uid})`}>
        <rect x={wx - gr} y={wy - gr} width={gr * 2} height={gr * 2} fill="#1a2140" />
        <g className="fkr-drift">
          <image className="fkr-night" href={`${A}/sky-night.webp`} x={wx - gr - 40} y={wy - R["sky-night"].h / 2} width={R["sky-night"].w} height={R["sky-night"].h} preserveAspectRatio="none" />
          <image className="fkr-day" href={`${A}/sky-day.webp`} x={wx - gr - 40} y={wy - R["sky-day"].h / 2} width={R["sky-day"].w} height={R["sky-day"].h} preserveAspectRatio="none" />
        </g>
        <g className="fkr-stars">
          {STARS.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r * 1.6} fill="#fff" style={{ animationDelay: `${-i * 0.37}s` }} />)}
        </g>
        <g className="fkr-sun"><circle cx={0} cy={0} r={120} fill={`url(#fkr-sun-${uid})`} /></g>
        <g className="fkr-moon">
          <circle cx={0} cy={0} r={110} fill={`url(#fkr-moon-${uid})`} />
          <circle cx={-9} cy={-6} r={6} fill="#c9d2e6" />
          <circle cx={11} cy={9} r={4.5} fill="#c9d2e6" />
          <circle cx={6} cy={-14} r={3} fill="#cfd7ea" />
        </g>
        <g className="fkr-tree" style={at(452, 642)}>{img("tree")}</g>
      </g>
      <image href={`${A}/room.webp`} x={0} y={0} width={1060} height={1484} preserveAspectRatio="none" />
      {/* the light through the window: a warm glow round it by day */}
      <circle className="fkr-winglow" cx={wx} cy={wy} r={gr * 1.5} fill={`url(#fkr-pool-${uid})`} style={{ mixBlendMode: "screen" }} />
      {/* the window's light on the floor, the fan's shadow turning in it: by day warm (it moves against the sun), at night pale */}
      <g className="fkr-floor">
        <g className="fkr-pool-sun" style={{ mixBlendMode: "screen" }}><ellipse cx={0} cy={0} rx={260} ry={92} fill={`url(#fkr-pool-${uid})`} /></g>
        <g className="fkr-pool-moon" style={{ mixBlendMode: "screen" }}><ellipse cx={0} cy={0} rx={240} ry={84} fill={`url(#fkr-mpool-${uid})`} /></g>
        <g className="fkr-fanshadow">
          <g transform="scale(0.62 0.21)">
            <g className="fkr-spin" style={at(0, 0)}>
              <image href={`${A}/propeller.webp`} x={-pr.w / 2} y={-pr.h / 2} width={pr.w} height={pr.h} preserveAspectRatio="none" filter={`url(#fkr-sil-${uid})`} />
            </g>
          </g>
        </g>
      </g>
      {/* the cat on the bed and the things on the floor, each with its shadow */}
      {thing("cat")}
      {PROPS.map((n) => thing(n))}
      {/* the fan spins in the window */}
      <g className="fkr-spin fkr-fan" style={at(fan.x, fan.y)}>{img("propeller")}</g>
      {/* the ivy sways from where it hangs */}
      <g className="fkr-plant" style={at(box("plant").x + box("plant").w * 0.62, box("plant").y + 6)}>{img("plant")}</g>
      {/* the night: the room goes dark and blue; the lamp lights it */}
      <rect className="fkr-night-tint" x={0} y={0} width={1060} height={1484} fill="#0b1433" style={{ mixBlendMode: "multiply" }} />
      <rect className="fkr-dusk-tint" x={0} y={0} width={1060} height={1484} fill="#ff7a3a" style={{ mixBlendMode: "soft-light" }} />
      <g className="fkr-lamp" style={{ mixBlendMode: "screen" }}>
        <ellipse cx={LAMP.x} cy={LAMP.y} rx={170} ry={150} fill={`url(#fkr-lamp-${uid})`} />
        <ellipse cx={LAMP.x} cy={1180} rx={420} ry={190} fill={`url(#fkr-lamp-${uid})`} opacity={0.35} />
      </g>
    </g>
  );
}
