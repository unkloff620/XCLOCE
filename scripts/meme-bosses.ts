// Original meme-boss illustrations (bold outline, meme-macro captions). Used by scripts/gen-assets.ts.
// Every boss has two states: normal and "hurt" (shown when its market cap is low).

const O = `stroke="#111" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"`;
const O3 = `stroke="#111" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;

type Mood = "smug" | "happy" | "sad" | "angry" | "crazy";

function eyes(cx: number, cy: number, dx: number, r: number, mood: Mood, hurt: boolean): string {
  if (hurt) {
    // squeezed eyes + tears
    return (
      `<path d="M${cx - dx - r} ${cy - r / 2} l${r} ${r / 2} l${-r} ${r / 2}" fill="none" ${O}/>` +
      `<path d="M${cx + dx + r} ${cy - r / 2} l${-r} ${r / 2} l${r} ${r / 2}" fill="none" ${O}/>` +
      `<path d="M${cx - dx} ${cy + r * 0.8} q-6 30 4 60" stroke="#4fc3ff" stroke-width="9" fill="none" stroke-linecap="round" opacity=".9"/>` +
      `<path d="M${cx + dx} ${cy + r * 0.8} q6 30 -4 60" stroke="#4fc3ff" stroke-width="9" fill="none" stroke-linecap="round" opacity=".9"/>`
    );
  }
  const pr = mood === "crazy" ? r * 0.25 : r * 0.45;
  const py = mood === "smug" ? cy + r * 0.25 : cy;
  let s =
    `<ellipse cx="${cx - dx}" cy="${cy}" rx="${r}" ry="${r * (mood === "crazy" ? 1.15 : 1)}" fill="#fff" ${O3}/>` +
    `<ellipse cx="${cx + dx}" cy="${cy}" rx="${r}" ry="${r * (mood === "crazy" ? 1.15 : 1)}" fill="#fff" ${O3}/>` +
    `<circle cx="${cx - dx + r * 0.2}" cy="${py}" r="${pr}" fill="#111"/><circle cx="${cx + dx + r * 0.2}" cy="${py}" r="${pr}" fill="#111"/>`;
  if (mood === "smug") s += `<path d="M${cx - dx - r - 2} ${cy - 2} h${2 * r + 4} M${cx + dx - r - 2} ${cy - 2} h${2 * r + 4}" ${O}/>`;
  if (mood === "angry") s += `<path d="M${cx - dx - r} ${cy - r - 6} l${2 * r} ${r * 0.7} M${cx + dx + r} ${cy - r - 6} l${-2 * r} ${r * 0.7}" ${O}/>`;
  if (mood === "sad") s += `<path d="M${cx - dx - r} ${cy - r + 2} l${2 * r} ${-r * 0.5} M${cx + dx + r} ${cy - r + 2} l${-2 * r} ${-r * 0.5}" ${O}/>`;
  return s;
}

function mouth(cx: number, cy: number, w: number, mood: Mood, hurt: boolean): string {
  if (hurt) return `<path d="M${cx - w} ${cy + 6} q${w / 2} -14 ${w} 0 t${w} 0" fill="none" ${O}/>`;
  if (mood === "happy" || mood === "smug") return `<path d="M${cx - w} ${cy} q${w} ${mood === "smug" ? 18 : 30} ${2 * w} ${mood === "smug" ? -8 : 0}" fill="${mood === "happy" ? "#7a1f2a" : "none"}" ${O}/>`;
  if (mood === "crazy") return `<ellipse cx="${cx}" cy="${cy + 8}" rx="${w * 0.6}" ry="${w * 0.45}" fill="#7a1f2a" ${O}/>`;
  if (mood === "sad") return `<path d="M${cx - w} ${cy + 14} q${w} -22 ${2 * w} 0" fill="none" ${O}/>`;
  return `<path d="M${cx - w} ${cy + 6} h${2 * w}" ${O}/>`;
}

function bandage(x: number, y: number, rot = -20): string {
  return `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - 26}" y="${y - 9}" width="52" height="18" rx="6" fill="#f2d6b3" ${O3}/><rect x="${x - 8}" y="${y - 9}" width="16" height="18" fill="#e2bf96"/><circle cx="${x - 3}" cy="${y - 2}" r="1.6" fill="#b08a63"/><circle cx="${x + 3}" cy="${y + 3}" r="1.6" fill="#b08a63"/></g>`;
}
function sweat(x: number, y: number): string {
  return `<path d="M${x} ${y} q-10 16 0 22 q10 -6 0 -22z" fill="#8fd8ff" ${O3}/>`;
}

export function memeBoss(slug: string, hurt: boolean): string {
  switch (slug) {
    case "chill-guy": {
      const m: Mood = "happy";
      return (
        `<path d="M120 360 q-6 -110 80 -116 q86 6 80 116z" fill="#3a6fd8" ${O}/>` +
        `<path d="M182 248 l18 30 18 -30" fill="#fff" ${O3}/>` +
        // bags
        `<g><path d="M64 300 q-26 40 10 64 h60 q30 -26 6 -64 q-10 -10 -38 -10 q-28 0 -38 10z" fill="#b58a4a" ${O}/><path d="M86 290 q14 -18 28 0" fill="none" ${O}/><text x="104" y="346" text-anchor="middle" font-size="34" font-weight="900" fill="#5a3d16" font-family="Arial Black, sans-serif">$</text></g>` +
        `<g><path d="M268 300 q-26 40 10 64 h60 q30 -26 6 -64 q-10 -10 -38 -10 q-28 0 -38 10z" fill="#b58a4a" ${O}/><path d="M290 290 q14 -18 28 0" fill="none" ${O}/><text x="308" y="346" text-anchor="middle" font-size="34" font-weight="900" fill="#5a3d16" font-family="Arial Black, sans-serif">$</text></g>` +
        `<path d="M132 300 l-24 -6 M268 300 l24 -6" ${O}/>` +
        // head
        `<ellipse cx="200" cy="170" rx="74" ry="80" fill="#f1c9a0" ${O}/>` +
        `<path d="M134 140 q20 -64 70 -60 q48 4 62 56 q-20 -20 -62 -22 q-44 0 -70 26z" fill="#4a3426" ${O3}/>` +
        eyes(200, 170, 28, 15, m, hurt) + mouth(200, 210, 28, m, hurt) +
        (hurt ? bandage(240, 120) : sweat(268, 150))
      );
    }
    case "chill-house": {
      const m: Mood = "smug";
      return (
        `<ellipse cx="200" cy="270" rx="120" ry="90" fill="#e8b27f" ${O}/>` +
        `<ellipse cx="200" cy="290" rx="70" ry="54" fill="#f7dcc1"/>` +
        `<circle cx="120" cy="140" r="26" fill="#d79c66" ${O}/><circle cx="280" cy="140" r="26" fill="#d79c66" ${O}/>` +
        `<ellipse cx="200" cy="190" rx="100" ry="82" fill="#e8b27f" ${O}/>` +
        `<ellipse cx="130" cy="214" rx="28" ry="22" fill="#f7cfb1"/><ellipse cx="270" cy="214" rx="28" ry="22" fill="#f7cfb1"/>` +
        eyes(200, 178, 36, 14, m, hurt) +
        // copium mask + tank
        `<path d="M168 210 q32 -16 64 0 l-6 36 q-26 12 -52 0z" fill="#7be0b0" ${O}/>` +
        `<path d="M200 246 q20 60 100 60" fill="none" stroke="#111" stroke-width="9"/><path d="M200 246 q20 60 100 60" fill="none" stroke="#a7f3d0" stroke-width="4"/>` +
        `<rect x="296" y="250" width="56" height="104" rx="22" fill="#22c55e" ${O}/><text x="324" y="310" text-anchor="middle" font-size="13" font-weight="900" fill="#053d1e" font-family="Arial Black, sans-serif" transform="rotate(-90 324 304)">COPIUM</text>` +
        (hurt ? bandage(150, 136, 15) + mouth(200, 266, 18, m, true) : "")
      );
    }
    case "wen-lambo": {
      const m: Mood = "happy";
      return (
        // toy car
        `<path d="M60 300 q10 -50 70 -56 h120 q50 4 86 40 l10 40 q-4 18 -24 18 H80 q-24 0 -20 -42z" fill="#e63946" ${O}/>` +
        `<path d="M140 250 l20 -34 h70 l36 34z" fill="#9fd8ff" ${O3}/>` +
        `<circle cx="118" cy="346" r="26" fill="#222" ${O}/><circle cx="118" cy="346" r="10" fill="#bbb"/>` +
        `<circle cx="300" cy="346" r="26" fill="#222" ${O}/><circle cx="300" cy="346" r="10" fill="#bbb"/>` +
        `<text x="210" y="304" text-anchor="middle" font-size="20" font-weight="900" fill="#fff" font-family="Arial Black, sans-serif">LAMBO™</text>` +
        // dog head popping out
        `<path d="M146 120 l16 -60 34 48z M254 120 l-16 -60 -34 48z" fill="#d99a45" ${O}/>` +
        `<ellipse cx="200" cy="160" rx="72" ry="66" fill="#e3a857" ${O}/>` +
        `<ellipse cx="200" cy="190" rx="42" ry="32" fill="#f6e6c8" ${O3}/><ellipse cx="200" cy="172" rx="12" ry="8" fill="#111"/>` +
        eyes(200, 146, 30, 12, m, hurt) + mouth(200, 196, 16, m, hurt) +
        (hurt ? bandage(158, 104, -30) : `<path d="M240 190 q20 40 4 52" fill="#ff7ab0" ${O3}/>`)
      );
    }
    case "paper-cat": {
      const m: Mood = "angry";
      return (
        `<ellipse cx="200" cy="300" rx="104" ry="70" fill="#9a9a9a" ${O}/>` +
        `<path d="M124 110 l12 -62 50 44z M276 110 l-12 -62 -50 44z" fill="#9a9a9a" ${O}/>` +
        `<ellipse cx="200" cy="170" rx="96" ry="84" fill="#a8a8a8" ${O}/>` +
        eyes(200, 160, 36, 16, m, hurt) +
        `<path d="M192 194 l8 8 8 -8z" fill="#ff7ab0" ${O3}/>` + mouth(200, 216, 18, m, hurt) +
        `<path d="M108 196 h48 M110 212 h46 M244 196 h48 M246 212 h46" stroke="#111" stroke-width="3"/>` +
        // paper hands
        `<path d="M70 300 l40 -24 l26 14 l10 -14 l20 10 l-8 30 l-50 26z" fill="#f4f1e8" ${O}/><path d="M86 304 l40 -12 M92 318 l36 -10" stroke="#bbb" stroke-width="3"/>` +
        `<path d="M330 300 l-40 -24 l-26 14 l-10 -14 l-20 10 l8 30 l50 26z" fill="#f4f1e8" ${O}/><path d="M314 304 l-40 -12 M308 318 l-36 -10" stroke="#bbb" stroke-width="3"/>` +
        (hurt ? bandage(250, 110, 25) : "")
      );
    }
    case "laser-ape": {
      const m: Mood = "smug";
      return (
        `<path d="M100 370 q0 -110 100 -110 q100 0 100 110z" fill="#5e3e28" ${O}/>` +
        `<circle cx="104" cy="180" r="32" fill="#5e3e28" ${O}/><circle cx="296" cy="180" r="32" fill="#5e3e28" ${O}/>` +
        `<ellipse cx="200" cy="170" rx="94" ry="96" fill="#7a5236" ${O}/>` +
        `<ellipse cx="200" cy="200" rx="66" ry="56" fill="#d9b48f" ${O3}/>` +
        (hurt
          ? eyes(200, 160, 34, 14, m, true)
          : `<path d="M166 160 L0 110 M234 160 L400 110" stroke="#ff2a2a" stroke-width="18" stroke-linecap="round"/><path d="M166 160 L0 110 M234 160 L400 110" stroke="#fff" stroke-width="6" stroke-linecap="round"/>` +
            `<circle cx="166" cy="160" r="16" fill="#ff2a2a" ${O3}/><circle cx="234" cy="160" r="16" fill="#ff2a2a" ${O3}/><circle cx="166" cy="160" r="6" fill="#fff"/><circle cx="234" cy="160" r="6" fill="#fff"/>`) +
        `<circle cx="188" cy="196" r="5" fill="#111"/><circle cx="212" cy="196" r="5" fill="#111"/>` + mouth(200, 226, 26, m, hurt) +
        (hurt ? bandage(250, 100) : "")
      );
    }
    case "bear-baron": {
      const m: Mood = "angry";
      return (
        `<path d="M300 60 v150 l30 -30 M300 210 l-30 -30" stroke="#ff3b5c" stroke-width="16" fill="none" stroke-linecap="round" opacity=".9"/>` +
        `<path d="M96 372 q-4 -120 104 -126 q108 6 104 126z" fill="#6f4630" ${O}/>` +
        `<circle cx="120" cy="120" r="30" fill="#8b5a3c" ${O}/><circle cx="280" cy="120" r="30" fill="#8b5a3c" ${O}/>` +
        `<ellipse cx="200" cy="180" rx="96" ry="86" fill="#8b5a3c" ${O}/>` +
        `<ellipse cx="200" cy="214" rx="46" ry="34" fill="#c99a72" ${O3}/><ellipse cx="200" cy="200" rx="14" ry="10" fill="#111"/>` +
        eyes(200, 168, 36, 13, m, hurt) + mouth(200, 226, 18, m, hurt) +
        // top hat + monocle
        `<rect x="140" y="38" width="120" height="66" rx="6" fill="#1a1a1a" ${O}/><rect x="112" y="98" width="176" height="18" rx="8" fill="#1a1a1a" ${O}/><rect x="140" y="80" width="120" height="12" fill="#b3283c"/>` +
        (hurt ? `<path d="M248 150 l12 30 -10 24" stroke="#111" stroke-width="3" fill="none"/>` : `<circle cx="236" cy="168" r="22" fill="none" stroke="#ffd23f" stroke-width="5"/><path d="M256 180 q10 30 -4 60" stroke="#ffd23f" stroke-width="3" fill="none"/>`)
      );
    }
    case "rug-wizard": {
      const m: Mood = "smug";
      return (
        // carpet being pulled
        `<path d="M20 330 q120 -40 230 0 l-6 30 q-110 -36 -220 0z" fill="#b3283c" ${O}/><path d="M40 334 q100 -30 196 2" stroke="#ffd23f" stroke-width="4" fill="none" stroke-dasharray="10 8"/>` +
        `<path d="M24 360 l-14 14 M60 352 l-10 16 M100 346 l-6 16" stroke="#111" stroke-width="3"/>` +
        `<path d="M200 380 l40 -170 h60 l40 170z" fill="#5b2fa8" ${O}/>` +
        `<path d="M234 214 l-60 100" stroke="#5b2fa8" stroke-width="30" stroke-linecap="round"/><path d="M234 214 l-60 100" ${O} fill="none" opacity=".4"/>` +
        `<circle cx="172" cy="318" r="14" fill="#f1c9a0" ${O3}/>` +
        `<ellipse cx="270" cy="170" rx="52" ry="54" fill="#f1c9a0" ${O}/>` +
        `<path d="M226 186 q44 110 88 0 q-20 18 -44 18 q-24 0 -44 -18z" fill="#eee" ${O}/>` +
        eyes(270, 162, 20, 10, m, hurt) +
        `<path d="M206 130 L270 10 L334 130 z" fill="#5b2fa8" ${O}/><path d="M214 128 h112" stroke="#ffd23f" stroke-width="8"/>` +
        `<path d="M262 60 l6 -12 6 12 -12 -8 h12z" fill="#ffd23f"/>` +
        (hurt ? bandage(240, 120, -10) + mouth(270, 196, 14, m, true) : "")
      );
    }
    case "gas-goblin": {
      const m: Mood = "angry";
      return (
        `<path d="M110 372 q-6 -110 90 -116 q96 6 90 116z" fill="#4a5a2a" ${O}/>` +
        `<path d="M96 150 l-70 -40 l40 70z M304 150 l70 -40 l-40 70z" fill="#7cc95a" ${O}/>` +
        `<ellipse cx="200" cy="172" rx="94" ry="80" fill="#8be36a" ${O}/>` +
        eyes(200, 160, 34, 15, m, hurt) +
        `<path d="M188 190 q12 18 24 0" fill="#6fbf4e" ${O3}/>` +
        (hurt ? mouth(200, 222, 30, m, true) : `<path d="M160 216 q40 30 80 0 z" fill="#3a0d16" ${O}/><path d="M170 218 l6 10 6 -8 6 10 6 -10 6 10 6 -8 6 8" stroke="#fff" stroke-width="3" fill="none"/>`) +
        // jar of coins
        `<rect x="250" y="270" width="80" height="92" rx="14" fill="#cfe9ff" fill-opacity=".7" ${O}/><rect x="244" y="258" width="92" height="18" rx="5" fill="#8a5a1a" ${O3}/>` +
        `<circle cx="276" cy="340" r="12" fill="#ffd23f" ${O3}/><circle cx="302" cy="334" r="12" fill="#ffd23f" ${O3}/><circle cx="290" cy="312" r="12" fill="#ffd23f" ${O3}/>` +
        `<text x="290" y="300" text-anchor="middle" font-size="16" font-weight="900" fill="#111" font-family="Arial Black, sans-serif">GAS</text>` +
        (hurt ? bandage(160, 110, -15) : "")
      );
    }
    case "chart-astrologer": {
      const m: Mood = "crazy";
      return (
        `<ellipse cx="200" cy="250" rx="110" ry="110" fill="#7a5a9a" ${O}/>` +
        `<ellipse cx="200" cy="280" rx="70" ry="64" fill="#cbb6e6"/>` +
        `<path d="M110 160 l-10 -60 50 40z M290 160 l10 -60 -50 40z" fill="#7a5a9a" ${O}/>` +
        `<circle cx="160" cy="190" r="40" fill="#fff6c8" ${O}/><circle cx="240" cy="190" r="40" fill="#fff6c8" ${O}/>` +
        (hurt ? eyes(200, 190, 40, 18, m, true) : `<circle cx="160" cy="190" r="16" fill="#111"/><circle cx="240" cy="190" r="16" fill="#111"/><circle cx="154" cy="184" r="5" fill="#fff"/><circle cx="234" cy="184" r="5" fill="#fff"/>`) +
        `<path d="M186 226 l14 20 14 -20z" fill="#ffb02e" ${O3}/>` +
        // star hat
        `<path d="M120 130 q80 -120 160 0 z" fill="#2a1d6a" ${O}/><path d="M160 96 l4 -10 4 10 -10 -6 h12z M220 70 l5 -12 5 12 -12 -7 h14z" fill="#ffd23f"/>` +
        // crystal ball with chart
        `<circle cx="200" cy="330" r="42" fill="#9fd8ff" fill-opacity=".85" ${O}/><polyline points="166,342 182,330 194,338 210,316 232,326" fill="none" stroke="#ff3b5c" stroke-width="4"/>` +
        `<rect x="170" y="364" width="60" height="14" rx="4" fill="#8a5a1a" ${O3}/>`
      );
    }
    case "troll-whale": {
      const m: Mood = "smug";
      return (
        `<path d="M300 250 l70 -60 v120z" fill="#2f86c2" ${O}/>` +
        `<ellipse cx="190" cy="250" rx="150" ry="110" fill="#46a8e0" ${O}/>` +
        `<path d="M60 270 q130 80 260 0 q-20 70 -130 74 q-110 -4 -130 -74z" fill="#d6f0ff" ${O3}/>` +
        eyes(150, 210, 44, 16, m, hurt) +
        (hurt ? mouth(160, 280, 40, m, true) : `<path d="M90 262 q90 70 180 -6 q-80 30 -180 6z" fill="#7a1f2a" ${O}/><path d="M104 268 h150" stroke="#fff" stroke-width="7"/>`) +
        // spout
        `<path d="M190 140 q-4 -40 -30 -60 M190 140 q4 -44 30 -64 M190 140 v-70" stroke="#9fe3ff" stroke-width="8" stroke-linecap="round" fill="none"/>` +
        (hurt ? bandage(150, 170, 10) : sweat(250, 190))
      );
    }
    case "fomo-duck": {
      const m: Mood = "crazy";
      return (
        `<ellipse cx="200" cy="292" rx="116" ry="76" fill="#f7d548" ${O}/>` +
        `<ellipse cx="200" cy="172" rx="86" ry="82" fill="#ffe066" ${O}/>` +
        eyes(200, 160, 34, 20, m, hurt) +
        `<ellipse cx="200" cy="214" rx="54" ry="20" fill="#ff8c2b" ${O}/>` +
        (hurt ? `<path d="M166 214 h68" stroke="#111" stroke-width="3"/>` : `<path d="M160 214 q40 18 80 0" fill="#c45a10" stroke="#111" stroke-width="3"/>`) +
        // phone with green candle
        `<rect x="270" y="236" width="60" height="100" rx="10" fill="#111" ${O}/><rect x="278" y="248" width="44" height="74" rx="4" fill="#0b1f14"/>` +
        (hurt
          ? `<rect x="294" y="256" width="12" height="58" fill="#ff3b5c"/><path d="M300 250 v70" stroke="#ff3b5c" stroke-width="3"/>`
          : `<rect x="294" y="262" width="12" height="52" fill="#22e58b"/><path d="M300 252 v70" stroke="#22e58b" stroke-width="3"/>`) +
        `<path d="M250 300 q20 -10 30 -2" stroke="#f7d548" stroke-width="22" stroke-linecap="round"/>` +
        (hurt ? bandage(240, 110, 20) : sweat(120, 140) + sweat(286, 120))
      );
    }
    case "meme-king":
    default: {
      const m: Mood = "smug";
      return (
        `<path d="M70 380 q20 -150 130 -150 q110 0 130 150z" fill="#b3283c" ${O}/><path d="M120 380 l80 -120 80 120" fill="#7a1525"/>` +
        `<ellipse cx="200" cy="200" rx="104" ry="96" fill="#b45cff" ${O}/>` +
        eyes(200, 196, 38, 16, m, hurt) + mouth(200, 244, 30, m, hurt) +
        `<path d="M118 120 l14 -64 30 40 38 -62 38 62 30 -40 14 64z" fill="#ffd23f" ${O}/>` +
        `<circle cx="162" cy="96" r="7" fill="#ff3d81"/><circle cx="200" cy="80" r="8" fill="#3fa7ff"/><circle cx="238" cy="96" r="7" fill="#22e58b"/>` +
        `<path d="M318 380 L340 170" stroke="#8a5a1a" stroke-width="10" stroke-linecap="round"/><circle cx="342" cy="160" r="18" fill="#ffd23f" ${O3}/>` +
        (hurt ? bandage(150, 150, -25) + `<path d="M250 70 l10 20 -8 18" stroke="#111" stroke-width="4" fill="none"/>` : "")
      );
    }
  }
}

/** Classic meme-macro caption (white, heavy, black outline). */
export function caption(text: string, y: number): string {
  const size = text.length > 16 ? 26 : text.length > 12 ? 30 : 36;
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<text x="200" y="${y}" text-anchor="middle" font-size="${size}" font-weight="900" fill="#fff" stroke="#000" stroke-width="7" paint-order="stroke" stroke-linejoin="round" font-family="Impact, 'Anton', 'Arial Black', 'Helvetica Neue', sans-serif" letter-spacing="1">${esc}</text>`;
}
