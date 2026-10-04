/** The evening sky drifting left forever: two copies of a seamless tile (public/assets/yard/sky.webp). */
export function DriftingSky({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="yard-sky-strip">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/yard/sky.webp" alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/yard/sky.webp" alt="" draggable={false} />
      </div>
    </div>
  );
}
