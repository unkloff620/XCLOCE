"use client";
/*
 * A cockroach seen from the side (tools/scene/build-roach.py: the body and three legs from the artist's sheet), drawn
 * in a 660×480 box with its feet on y = 455, head to the left. Six legs: the near three over the body, the far three
 * behind it (darker), in two tripods that swing in turns while the body bobs — a run.
 */
const LEGS = [
  // image, its size, where its hip is in the image, where the hip sits on the body, the leg's angle at rest
  { src: "/assets/yard/roach-leg-1.webp", w: 167, h: 262, hip: [12.5, 60], at: [165, 235], r: 35 },
  { src: "/assets/yard/roach-leg-2.webp", w: 195, h: 262, hip: [30, 20], at: [260, 200], r: 15 },
  { src: "/assets/yard/roach-leg-3.webp", w: 196, h: 262, hip: [10, 77.5], at: [360, 262], r: 0 },
] as const;

function Legs({ far }: { far?: boolean }) {
  return (
    <g className={far ? "rch-far" : undefined} transform={far ? "translate(20 -14)" : undefined}>
      {LEGS.map((l, i) => (
        <g key={i} className={`rch-leg ${(i % 2 === 0) !== !!far ? "a" : "b"}`} style={{ ["--r" as string]: `${l.r}deg`, transformOrigin: `${l.at[0]}px ${l.at[1]}px` }}>
          <image href={l.src} x={l.at[0] - l.hip[0]} y={l.at[1] - l.hip[1]} width={l.w} height={l.h} />
        </g>
      ))}
    </g>
  );
}

export function Roach() {
  return (
    <svg className="rch" viewBox="0 0 660 480" width="100%" height="100%" aria-hidden="true">
      <Legs far />
      <g className="rch-body"><image href="/assets/yard/roach-body.webp" x={0} y={0} width={634} height={362} /></g>
      <Legs />
    </svg>
  );
}
