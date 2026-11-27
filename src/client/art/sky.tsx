/** A sky drifting left forever: two copies of a seamless tile (the evening sky of the fights by default). */
export function DriftingSky({ className, src = "/assets/yard/sky.webp", copies = 2 }: { className?: string; src?: string; copies?: number }) {
  // the strip slides by half its length and starts over: an even number of copies of the seamless tile (more for a wide sky)
  return (
    <div className={className} aria-hidden="true">
      <div className="yard-sky-strip">
        {Array.from({ length: copies }, (_, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" draggable={false} />
        ))}
      </div>
    </div>
  );
}
