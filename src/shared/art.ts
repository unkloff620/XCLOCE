/**
 * Procedural meme-token art. Deterministic: same art spec -> same SVG.
 * Used by the client to render token logos and by scripts/gen-assets.ts.
 */
export type Creature = "frog" | "dog" | "cat" | "ape" | "hamster" | "pigeon" | "bear" | "fish" | "alien" | "duck";
export const CREATURES: Creature[] = ["frog", "dog", "cat", "ape", "hamster", "pigeon", "bear", "fish", "alien", "duck"];
export type Accessory = "none" | "crown" | "shades" | "cap" | "laser" | "chain" | "halo" | "headband";
export const ACCESSORIES: Accessory[] = ["none", "crown", "shades", "cap", "laser", "chain", "halo", "headband"];

export interface TokenArt {
  creature: Creature;
  accessory: Accessory;
  hue: number; // background hue
  skin: string; // creature main color
  mood: "smug" | "happy" | "sad" | "angry";
}

const SKIN: Record<Creature, string[]> = {
  frog: ["#5fbf4a", "#7ccf5a", "#4aa96b"],
  dog: ["#e3a857", "#d99a45", "#f0c27a"],
  cat: ["#f2b33d", "#9a9a9a", "#f4d27a"],
  ape: ["#7a5236", "#5e3e28", "#8d6446"],
  hamster: ["#e8b27f", "#f0c79c", "#d79c66"],
  pigeon: ["#8f9bb3", "#a5afc4", "#7b879f"],
  bear: ["#8b5a3c", "#a06a45", "#6f4630"],
  fish: ["#46a8e0", "#5bc0eb", "#f28c38"],
  alien: ["#8be36a", "#a2f08a", "#6fd5a8"],
  duck: ["#f7d548", "#ffe066", "#f2c12e"],
};

export function skinFor(creature: Creature, n: number): string {
  const list = SKIN[creature];
  return list[Math.abs(n) % list.length];
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function eyes(mood: TokenArt["mood"], y: number, dx: number, cx = 50, r = 6): string {
  const lid =
    mood === "smug"
      ? `<path d="M${cx - dx - r - 1} ${y - 1}h${2 * r + 2}M${cx + dx - r - 1} ${y - 1}h${2 * r + 2}" stroke="#1a1a1a" stroke-width="3"/>`
      : mood === "angry"
        ? `<path d="M${cx - dx - r} ${y - r - 2}l${2 * r} ${r - 1}M${cx + dx + r} ${y - r - 2}l${-2 * r} ${r - 1}" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round"/>`
        : mood === "sad"
          ? `<path d="M${cx - dx - r} ${y - r + 1}l${2 * r} ${-3}M${cx + dx + r} ${y - r + 1}l${-2 * r} ${-3}" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>`
          : "";
  const pupilY = mood === "smug" ? y + 1.5 : y;
  return (
    `<circle cx="${cx - dx}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${cx + dx}" cy="${y}" r="${r}" fill="#fff"/>` +
    `<circle cx="${cx - dx + 1.5}" cy="${pupilY}" r="${r * 0.45}" fill="#111"/><circle cx="${cx + dx + 1.5}" cy="${pupilY}" r="${r * 0.45}" fill="#111"/>` +
    lid
  );
}

function mouth(mood: TokenArt["mood"], y: number, w = 14, cx = 50, color = "#3a1a1a"): string {
  if (mood === "happy") return `<path d="M${cx - w} ${y}q${w} ${w * 0.9} ${2 * w} 0" fill="#7a2a2a" stroke="${color}" stroke-width="2"/>`;
  if (mood === "sad") return `<path d="M${cx - w * 0.8} ${y + 5}q${w * 0.8} ${-8} ${w * 1.6} 0" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
  if (mood === "angry") return `<path d="M${cx - w * 0.8} ${y + 3}h${w * 1.6}" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>`;
  return `<path d="M${cx - w} ${y}q${w * 1.2} ${6} ${2 * w} ${-4}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
}

export function creatureSvg(a: TokenArt): string {
  const s = a.skin;
  const d = shade(s, -35);
  const l = shade(s, 35);
  switch (a.creature) {
    case "frog":
      return (
        `<ellipse cx="50" cy="62" rx="32" ry="24" fill="${s}"/><circle cx="34" cy="40" r="13" fill="${s}"/><circle cx="66" cy="40" r="13" fill="${s}"/>` +
        `<ellipse cx="50" cy="70" rx="22" ry="10" fill="${l}" opacity=".5"/>` +
        eyes(a.mood, 40, 16, 50, 8) +
        `<path d="M28 64q22 ${a.mood === "sad" ? -4 : 12} 44 0" fill="none" stroke="${d}" stroke-width="4" stroke-linecap="round"/>`
      );
    case "dog":
      return (
        `<path d="M24 30l10 22-14 2zM76 30l-10 22 14 2z" fill="${d}"/><ellipse cx="50" cy="56" rx="28" ry="26" fill="${s}"/>` +
        `<ellipse cx="50" cy="68" rx="16" ry="12" fill="#f6e6c8"/><ellipse cx="50" cy="61" rx="5" ry="3.5" fill="#222"/>` +
        eyes(a.mood, 48, 11, 50, 5) + mouth(a.mood, 71, 7)
      );
    case "cat":
      return (
        `<path d="M24 26l14 18-18 6zM76 26l-14 18 18 6z" fill="${s}"/><ellipse cx="50" cy="58" rx="29" ry="25" fill="${s}"/>` +
        `<path d="M30 44l8 3M70 44l-8 3" stroke="${d}" stroke-width="3"/>` +
        eyes(a.mood, 54, 12, 50, 6) +
        `<path d="M47 63l3 3 3-3z" fill="#e88"/>` + mouth(a.mood, 69, 6) +
        `<path d="M22 62h14M22 67h14M64 62h14M64 67h14" stroke="#333" stroke-width="1.2" opacity=".6"/>`
      );
    case "ape":
      return (
        `<circle cx="22" cy="54" r="9" fill="${d}"/><circle cx="78" cy="54" r="9" fill="${d}"/><ellipse cx="50" cy="54" rx="28" ry="29" fill="${s}"/>` +
        `<ellipse cx="50" cy="62" rx="20" ry="17" fill="#d9b48f"/>` + eyes(a.mood, 47, 10, 50, 5) +
        `<circle cx="46" cy="60" r="1.6" fill="#333"/><circle cx="54" cy="60" r="1.6" fill="#333"/>` + mouth(a.mood, 69, 9)
      );
    case "hamster":
      return (
        `<circle cx="30" cy="34" r="8" fill="${d}"/><circle cx="70" cy="34" r="8" fill="${d}"/><ellipse cx="50" cy="58" rx="32" ry="27" fill="${s}"/>` +
        `<ellipse cx="30" cy="64" rx="10" ry="8" fill="#f7d9c4"/><ellipse cx="70" cy="64" rx="10" ry="8" fill="#f7d9c4"/>` +
        eyes(a.mood, 50, 12, 50, 5) + `<circle cx="50" cy="60" r="3" fill="#d66"/>` + mouth(a.mood, 66, 6)
      );
    case "pigeon":
      return (
        `<ellipse cx="50" cy="60" rx="26" ry="28" fill="${s}"/><path d="M36 74q14 8 28 0v6q-14 6-28 0z" fill="#6fb38f" opacity=".7"/>` +
        `<circle cx="42" cy="46" r="7" fill="#ffa64d"/><circle cx="42" cy="46" r="3" fill="#111"/>` +
        `<circle cx="60" cy="46" r="7" fill="#ffa64d"/><circle cx="60" cy="46" r="3" fill="#111"/>` +
        `<path d="M47 54l6 0-3 9z" fill="#3b3b3b"/>`
      );
    case "bear":
      return (
        `<circle cx="28" cy="34" r="10" fill="${s}"/><circle cx="72" cy="34" r="10" fill="${s}"/><circle cx="28" cy="34" r="5" fill="${d}"/><circle cx="72" cy="34" r="5" fill="${d}"/>` +
        `<ellipse cx="50" cy="57" rx="29" ry="27" fill="${s}"/><ellipse cx="50" cy="66" rx="13" ry="10" fill="${l}"/>` +
        eyes(a.mood, 50, 11, 50, 5) + `<ellipse cx="50" cy="61" rx="5" ry="3.5" fill="#222"/>` + mouth(a.mood, 70, 6)
      );
    case "fish":
      return (
        `<path d="M78 56l16-14v28z" fill="${d}"/><ellipse cx="48" cy="56" rx="32" ry="23" fill="${s}"/>` +
        `<path d="M40 40q8-10 18 0" fill="${d}"/>` + eyes(a.mood, 50, 0, 32, 7) + mouth(a.mood, 64, 5, 26)
      );
    case "alien":
      return (
        `<path d="M50 22c22 0 32 16 32 30 0 18-16 32-32 32S18 70 18 52c0-14 10-30 32-30z" fill="${s}"/>` +
        `<ellipse cx="37" cy="52" rx="9" ry="13" fill="#111" transform="rotate(-20 37 52)"/><ellipse cx="63" cy="52" rx="9" ry="13" fill="#111" transform="rotate(20 63 52)"/>` +
        `<circle cx="34" cy="47" r="2.5" fill="#fff"/><circle cx="60" cy="47" r="2.5" fill="#fff"/>` + mouth(a.mood, 72, 6)
      );
    case "duck":
      return (
        `<ellipse cx="50" cy="54" rx="28" ry="28" fill="${s}"/><ellipse cx="50" cy="66" rx="18" ry="7" fill="#ff8c2b"/>` +
        `<path d="M32 66q18 6 36 0" stroke="#d96d10" stroke-width="2" fill="none"/>` + eyes(a.mood, 48, 11, 50, 6)
      );
  }
}

export function accessorySvg(a: TokenArt): string {
  switch (a.accessory) {
    case "crown":
      return `<path d="M32 30l6-14 6 9 6-12 6 12 6-9 6 14z" fill="#ffd23f" stroke="#c99a00" stroke-width="1.5"/>`;
    case "shades":
      return `<path d="M26 44h48v3l-4 8h-14l-4-6h-4l-4 6H30l-4-8z" fill="#0b0b0f"/><path d="M30 46l8 0" stroke="#5ff" stroke-width="1.5" opacity=".7"/>`;
    case "cap":
      return `<path d="M24 36q26-26 52 0z" fill="#e63946"/><path d="M60 34h26q-2 6-14 6h-12z" fill="#b8202c"/>`;
    case "laser":
      return `<path d="M30 46L2 30M66 46L98 30" stroke="#ff2a2a" stroke-width="4" stroke-linecap="round"/><path d="M30 46L2 30M66 46L98 30" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`;
    case "chain":
      return `<path d="M30 80q20 14 40 0" fill="none" stroke="#ffd23f" stroke-width="4" stroke-dasharray="4 2"/><circle cx="50" cy="90" r="5" fill="#ffd23f"/>`;
    case "halo":
      return `<ellipse cx="50" cy="16" rx="18" ry="5" fill="none" stroke="#fff6a8" stroke-width="3"/>`;
    case "headband":
      return `<path d="M22 38q28-10 56 0v6q-28-10-56 0z" fill="#ff3d81"/><path d="M76 40l10 6-8 2z" fill="#ff3d81"/>`;
    default:
      return "";
  }
}

/** Full logo SVG (100x100, round badge). */
export function tokenLogoSvg(a: TokenArt): string {
  const bg1 = `hsl(${a.hue} 70% 45%)`;
  const bg2 = `hsl(${(a.hue + 40) % 360} 75% 25%)`;
  const id = `g${a.hue}${a.creature}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<defs><radialGradient id="${id}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient></defs>` +
    `<circle cx="50" cy="50" r="50" fill="url(#${id})"/>` +
    `<g>${creatureSvg(a)}${accessorySvg(a)}</g></svg>`
  );
}

export function svgDataUri(svg: string): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
