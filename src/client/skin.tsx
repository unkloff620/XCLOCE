"use client";
import type { ReactNode } from "react";
import { SKIN_SLOTS, skinUrl } from "../shared/skin.ts";

/**
 * Global CSS for uploaded skins: 9-slice frames (border-image) and cover backgrounds are applied by selector,
 * so every panel / button with that class picks up the picture while its text stays on top.
 */
export function SkinStyles() {
  const rules: string[] = [];
  for (const s of SKIN_SLOTS) {
    const url = skinUrl(s.key);
    if (!url || !s.selector) continue;
    const sels = s.selector.split(",").map((x) => x.trim());
    const all = sels.join(", ");
    if (s.kind === "nine" && s.slice) {
      const w = s.slice / 3;
      const pad = s.pad ? `padding:${s.pad.map((p) => `${p}px`).join(" ")}!important;` : "";
      const keepPad = s.pad && s.pad.every((p) => p === 0) ? "" : pad;
      rules.push(`${all}{border-style:solid!important;border-width:0!important;border-color:transparent!important;border-image:url("${url}") ${s.slice} fill / ${w}px stretch!important;background:none!important;box-shadow:none!important;clip-path:none!important;${keepPad}}`);
      rules.push(sels.map((x) => `${x} > .panel-art`).join(", ") + "{display:none!important}");
      // card frames keep transparent margins above/below the frame line — pull neighbouring cards closer
    } else if (s.kind === "cover") {
      rules.push(`${all}{background-image:url("${url}")!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important}`);
    }
  }
  if (!rules.length) return null;
  return <style dangerouslySetInnerHTML={{ __html: rules.join("\n") }} />;
}

/** Uploaded picture for a slot, or the drawn fallback. */
export function SkinImg({ k, fallback, className, alt = "" }: { k: string; fallback: ReactNode; className?: string; alt?: string }) {
  const url = skinUrl(k);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className={`skin-img ${className ?? ""}`} src={url} alt={alt} draggable={false} /> : <>{fallback}</>;
}
export { skinUrl };
