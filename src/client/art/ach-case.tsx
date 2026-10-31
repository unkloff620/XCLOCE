/*
 * «Ящик ништяков» — the aluminium case on the dealer's counter (layers: tools/shop/build-case.py → case-data.ts).
 * While a box can be opened (`ready`), something lives inside: a light glows in it, the lid knocks up and drops back,
 * the latches rattle, flip open, dangle and snap shut again (screens.css «ac-»). Otherwise the case just stands.
 */
import { CASE_ASPECT, CASE_LAYERS } from "./case-data.ts";

type LayerId = keyof typeof CASE_LAYERS;

function L({ n, className }: { n: LayerId; className?: string }) {
  const b = CASE_LAYERS[n];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`ac-l ${className ?? ""}`} src={`/assets/shop/v2/case-${n}.webp`} alt="" draggable={false}
      style={{ left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` }} />
  );
}

/** `label`: written on the lid (how many cases are ready) — it rides with the lid */
export function AchCase({ ready, className, label }: { ready?: boolean; className?: string; label?: string }) {
  return (
    <span className={`ach-case ${ready ? "ready" : ""} ${className ?? ""}`} style={{ aspectRatio: CASE_ASPECT }} aria-hidden="true">
      <L n="inner" />
      {ready && <span className="ac-glow" />}
      <L n="base" />
      <span className="ac-lid"><L n="lid" />{label && <b className="ac-label num">{label}</b>}</span>
      {ready && <span className="ac-leak" />}
      <L n="latch-l" className="ac-latch" />
      <L n="latch-r" className="ac-latch r" />
      {ready && [0, 1, 2, 3, 4].map((i) => <i key={i} className="ac-spark" style={{ left: `${22 + i * 14}%`, animationDelay: `${1.15 + i * 0.13}s` }} />)}
    </span>
  );
}
