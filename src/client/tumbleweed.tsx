"use client";
import { useEffect, useRef } from "react";

/**
 * The tumbleweed of the loading screen: a physical body — gravity, an invisible floor (the ground of the picture), the
 * wind pushing it to the left, a bounce that loses energy on every landing (and a bump of a stone now and then throws it
 * up again), the spin from its roll on the ground (in the air it keeps spinning, slowing a little). Off the left edge it
 * comes back from the right.
 */
/** inside: the first time it is already on the screen (a short load: no wait for it to come in) */
export function Tumbleweed({ inside = false }: { inside?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const shade = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current, b = body.current, im = img.current, sh = shade.current;
    if (!el || !b || !im || !sh) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let W = el.clientWidth, H = el.clientHeight;
    const size = () => b.clientWidth || 120;
    // px, px/s; y — the height above the floor
    let x = 0, y = 0, vx = 0, vy = 0, ang = 0, spin = 0;
    const reset = () => {
      W = el.clientWidth; H = el.clientHeight;
      x = W + size() * 0.6; y = H * (0.05 + Math.random() * 0.12); vx = -(W * (0.7 + Math.random() * 0.25)); vy = 0;
    };
    reset();
    if (inside) x = W * (0.35 + Math.random() * 0.55);
    let last = 0, raf = 0;
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      const dt = last ? Math.min(0.033, (t - last) / 1000) : 0;
      last = t;
      if (!dt) return;
      const s = size(), r = s / 2, g = H * 2.6;
      // the wind: a steady push to the left with gusts, the air drag holding it back
      // a strong wind: it crosses the screen in about a second and a half, the gusts push it on harder
      const wind = -W * (0.8 + 0.25 * Math.sin(t / 700) + 0.15 * Math.sin(t / 260));
      vx += (wind - vx) * 1.6 * dt;
      vy -= g * dt;
      x += vx * dt;
      y += vy * dt;
      if (y <= 0) {
        // the landing: it loses most of its fall; a stone under it now and then throws it higher
        y = 0;
        const bump = Math.random() < 0.3 ? H * (0.45 + Math.random() * 0.4) : 0;
        vy = Math.max(-vy * 0.55, bump);
        if (vy < H * 0.05) vy = 0;
        vx *= 0.92;
        spin = vx / r;
      } else spin *= 1 - 0.3 * dt;
      // rolling on the ground: the spin is the speed over the radius; in the air it keeps the last one
      if (y === 0) spin = vx / r;
      ang += spin * dt * (180 / Math.PI);
      if (x < -s * 1.2) reset();
      b.style.transform = `translate(${x - r}px, ${-y}px)`;
      im.style.transform = `rotate(${ang}deg)`;
      const k = Math.max(0.35, 1 - y / (H * 0.35));
      sh.style.transform = `translateX(${x - r}px) scale(${k.toFixed(3)})`;
      sh.style.opacity = k.toFixed(3);
    };
    raf = requestAnimationFrame(step);
    const onResize = () => { W = el.clientWidth; H = el.clientHeight; };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [inside]);
  return (
    <div ref={box} className="boot-tw-area" aria-hidden="true">
      <i ref={shade} className="boot-tw-shadow" />
      <div ref={body} className="boot-tw">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} src="/assets/loading/tumbleweed.webp" alt="" draggable={false} />
      </div>
    </div>
  );
}

