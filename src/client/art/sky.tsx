/** A sky drifting left forever: two copies of a seamless tile (the evening sky of the fights by default). */
export function DriftingSky({ className, src = "/assets/yard/sky.webp" }: { className?: string; src?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="yard-sky-strip">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} />
      </div>
    </div>
  );
}
