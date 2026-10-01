// Generates all static game art into public/assets. Run: npm run assets
// (node --experimental-strip-types scripts/gen-assets.ts). Output is committed to the repo.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { accessorySvg, creatureSvg, type TokenArt } from "../src/shared/art.ts";
import { BOSS_DESIGNS, type BossEnv } from "../src/shared/bosses.ts";
import { caption, memeBoss } from "./meme-bosses.ts";
import { DUMP_TOOLS, EQUIPMENT } from "../src/shared/economy.ts";

const OUT = join(import.meta.dirname, "..", "public", "assets");
function save(dir: string, name: string, svg: string) {
  mkdirSync(join(OUT, dir), { recursive: true });
  writeFileSync(join(OUT, dir, name), svg.replace(/\s+\n/g, "\n"));
}

// ---------------- Boss environments ----------------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function candles(seed: number, color: "red" | "green" | "mixed", y0: number, h: number, opacity = 0.35): string {
  const r = rng(seed);
  let out = "";
  let y = y0;
  for (let x = 10; x < 400; x += 22) {
    const up = color === "green" ? r() > 0.25 : color === "red" ? r() > 0.75 : r() > 0.5;
    const len = 10 + r() * h;
    y += up ? -len * 0.4 : len * 0.4;
    y = Math.max(40, Math.min(360, y));
    const c = up ? "#22e58b" : "#ff3b5c";
    out += `<line x1="${x + 5}" y1="${y - len / 2 - 8}" x2="${x + 5}" y2="${y + len / 2 + 8}" stroke="${c}" stroke-width="2" opacity="${opacity}"/>`;
    out += `<rect x="${x}" y="${y - len / 2}" width="10" height="${len}" rx="2" fill="${c}" opacity="${opacity}"/>`;
  }
  return out;
}
function stars(seed: number, n: number): string {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < n; i++) out += `<circle cx="${(r() * 400).toFixed(1)}" cy="${(r() * 260).toFixed(1)}" r="${(r() * 1.8 + 0.4).toFixed(2)}" fill="#fff" opacity="${(r() * 0.7 + 0.2).toFixed(2)}"/>`;
  return out;
}
function bg(top: string, bottom: string): string {
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="55%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="400" height="400" fill="url(#sky)"/>`;
}
function env(e: BossEnv): string {
  switch (e) {
    case "swamp":
      return bg("#0f2a1f", "#0a1510") + stars(1, 20) + `<circle cx="320" cy="70" r="30" fill="#e8f5c8" opacity=".8"/>` +
        `<path d="M0 300q60-30 120 0t120 0 160 0v100H0z" fill="#123d2a"/><path d="M0 330q80-20 160 0t240 0v70H0z" fill="#0d2e20"/>` +
        `<ellipse cx="200" cy="350" rx="150" ry="22" fill="#2f8f4e"/><path d="M200 350l40-10-10 14z" fill="#0d2e20"/>` +
        `<path d="M30 300v-80M45 300v-60M360 300v-90M372 300v-55" stroke="#2c6b3d" stroke-width="4"/><ellipse cx="30" cy="218" rx="5" ry="14" fill="#6b4a2a"/><ellipse cx="360" cy="208" rx="5" ry="14" fill="#6b4a2a"/>`;
    case "redchart":
      return bg("#2a0a12", "#12060a") + candles(2, "red", 120, 50, 0.45) + `<path d="M0 360h400" stroke="#ff3b5c" opacity=".3"/>` +
        `<text x="200" y="60" text-anchor="middle" font-family="monospace" font-size="38" font-weight="700" fill="#ff3b5c" opacity=".25">-87.4%</text>`;
    case "dojo":
      return bg("#3a1d10", "#1a0d08") + `<circle cx="200" cy="150" r="110" fill="#e63946" opacity=".55"/>` +
        `<path d="M40 110h320l-30-25H70z" fill="#5a2a14"/><rect x="70" y="110" width="14" height="250" fill="#5a2a14"/><rect x="316" y="110" width="14" height="250" fill="#5a2a14"/>` +
        `<rect x="0" y="340" width="400" height="60" fill="#2a160c"/><path d="M0 340h400" stroke="#8a5a34" stroke-width="3"/>`;
    case "jungle":
      return bg("#103a24", "#081a10") +
        `<path d="M0 0q60 80 0 160M400 0q-70 90 0 180M60 0q30 60-20 120M340 0q-30 70 20 130" stroke="#1f7a3e" stroke-width="18" fill="none" opacity=".7"/>` +
        `<g fill="#ffd23f" opacity=".9"><path d="M40 300q20-30 40-10q-20 0-40 10z"/><path d="M330 280q20-30 40-10q-20 0-40 10z"/><path d="M300 330q20-30 40-10q-20 0-40 10z"/></g>` +
        `<rect y="350" width="400" height="50" fill="#0b2414"/>`;
    case "moon":
      return bg("#0a0a2a", "#05050f") + stars(5, 80) + `<circle cx="80" cy="80" r="24" fill="#3a6bd8"/><path d="M62 74q10-6 20 4" stroke="#2fb36b" stroke-width="6" fill="none"/>` +
        `<ellipse cx="200" cy="400" rx="300" ry="90" fill="#bfc3cc"/><circle cx="110" cy="345" r="16" fill="#a3a8b3"/><circle cx="300" cy="360" r="22" fill="#a3a8b3"/><circle cx="220" cy="335" r="9" fill="#a3a8b3"/>` +
        `<path d="M320 320v-60l30 10-30 10" stroke="#ddd" stroke-width="3" fill="#22e58b"/>`;
    case "storm":
      return bg("#1b1f2e", "#0b0d14") + candles(6, "red", 90, 70, 0.3) +
        `<path d="M260 0l-30 90h30l-40 100" stroke="#ffe066" stroke-width="5" fill="none" opacity=".8"/>` +
        `<ellipse cx="100" cy="50" rx="110" ry="40" fill="#2b3044"/><ellipse cx="300" cy="40" rx="120" ry="42" fill="#30364c"/>` +
        `<rect y="350" width="400" height="50" fill="#121520"/>`;
    case "city":
      return bg("#1a1033", "#0c0818") + stars(7, 30) +
        `<g fill="#140c28">${[0, 50, 90, 150, 200, 260, 310, 350].map((x, i) => `<rect x="${x}" y="${200 + ((i * 37) % 90)}" width="${40 + (i % 3) * 10}" height="300"/>`).join("")}</g>` +
        `<g fill="#ffd23f" opacity=".5">${Array.from({ length: 40 }, (_, i) => `<rect x="${(i * 53) % 390}" y="${260 + ((i * 29) % 120)}" width="5" height="7"/>`).join("")}</g>`;
    case "ocean":
      return bg("#0a3050", "#04121f") +
        `<g fill="none" stroke="#5bc0eb" stroke-width="3" opacity=".35"><path d="M0 120q50-20 100 0t100 0 100 0 100 0"/><path d="M0 170q50-20 100 0t100 0 100 0 100 0"/></g>` +
        `<g fill="#9fe3ff" opacity=".35"><circle cx="60" cy="260" r="6"/><circle cx="80" cy="230" r="4"/><circle cx="340" cy="280" r="7"/><circle cx="320" cy="250" r="3"/></g>` +
        `<path d="M0 360q100-30 200 0t200 0v40H0z" fill="#e8d29a" opacity=".6"/>`;
    case "rug":
      return bg("#2a0f3d", "#12061c") + stars(9, 40) +
        `<path d="M40 330q160-60 320 0l-10 30q-150-50-300 0z" fill="#b3283c"/><path d="M60 330q140-45 280 0" stroke="#ffd23f" stroke-width="3" fill="none" stroke-dasharray="8 6"/>` +
        `<g stroke="#ffd23f" stroke-width="2"><path d="M42 333l-12 12M360 333l12 12"/></g>`;
    case "office":
      return bg("#1d2433", "#0f131c") +
        `<rect x="30" y="60" width="140" height="110" rx="6" fill="#0b0f18" stroke="#2c3550" stroke-width="3"/>` + `<g transform="translate(30 60) scale(.35 .3)">${candles(10, "green", 250, 40, 0.9)}</g>` +
        `<rect x="230" y="60" width="140" height="110" rx="6" fill="#0b0f18" stroke="#2c3550" stroke-width="3"/>` + `<g transform="translate(230 60) scale(.35 .3)">${candles(11, "red", 150, 40, 0.9)}</g>` +
        `<rect y="330" width="400" height="70" fill="#3a2a1e"/><rect x="40" y="320" width="320" height="16" rx="4" fill="#5a3f2c"/>`;
    case "gas":
      return bg("#20240c", "#0d0f05") +
        `<g opacity=".5" fill="#8be36a"><circle cx="70" cy="90" r="30"/><circle cx="110" cy="70" r="22"/><circle cx="320" cy="110" r="34"/><circle cx="280" cy="80" r="20"/></g>` +
        `<rect x="40" y="200" width="60" height="150" rx="8" fill="#e63946"/><rect x="52" y="215" width="36" height="30" rx="3" fill="#111"/><text x="70" y="236" text-anchor="middle" font-family="monospace" font-size="14" fill="#8be36a">GWEI</text>` +
        `<rect y="350" width="400" height="50" fill="#14170a"/>`;
    case "throne":
      return bg("#3a2a05", "#140d02") + `<rect x="0" y="0" width="400" height="400" fill="url(#glow)"/>` +
        `<path d="M110 360V150l30-40 30 40 30-50 30 50 30-40 30 40v210z" fill="#7a5a10" stroke="#ffd23f" stroke-width="4"/>` +
        `<rect x="0" y="350" width="400" height="50" fill="#5a0f1a"/><path d="M0 352h400" stroke="#ffd23f" stroke-width="3"/>` +
        `<g fill="#ffd23f">${[40, 90, 310, 360].map((x) => `<circle cx="${x}" cy="${330 - (x % 7) * 4}" r="10"/><text x="${x}" y="${334 - (x % 7) * 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#7a5a10">$</text>`).join("")}</g>`;
  }
}

rmSync(join(OUT, "bosses"), { recursive: true, force: true });
for (const [i, d] of BOSS_DESIGNS.entries()) {
  for (const hurt of [false, true]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${env(d.env)}
<ellipse cx="200" cy="378" rx="130" ry="14" fill="#000" opacity=".35"/>
<g>${memeBoss(d.slug, hurt)}</g>${hurt ? '<rect width="400" height="400" fill="#ff0030" opacity=".12"/>' : ""}
${caption(d.top, 52)}${caption(d.bottom, 386)}</svg>`;
    save("bosses", `${String(i + 1).padStart(2, "0")}-${d.slug}${hurt ? "-hurt" : ""}.svg`, svg);
  }
}

// ---------------- Dump tools ----------------
const RARITY_COLORS: Record<string, [string, string]> = {
  common: ["#8b93a7", "#3a3f4d"], rare: ["#3fa7ff", "#0f3a66"], epic: ["#b45cff", "#3d1366"],
  legendary: ["#ffb02e", "#6b3a00"], mythic: ["#ff3d81", "#5c0a2a"],
};
const TOOL_ART: Record<string, string> = {
  paper: `<path d="M30 70l10-40 16 6 6-12 10 6-6 40z" fill="#f4f1e8" stroke="#bbb" stroke-width="2"/><path d="M38 52l18 4M36 60l20 4" stroke="#bbb" stroke-width="2"/><path d="M60 30q10 4 12 14" stroke="#fff" stroke-width="3" fill="none"/>`,
  button: `<ellipse cx="50" cy="66" rx="30" ry="10" fill="#555"/><rect x="20" y="50" width="60" height="16" fill="#555"/><ellipse cx="50" cy="50" rx="30" ry="10" fill="#777"/><ellipse cx="50" cy="44" rx="22" ry="8" fill="#e63946"/><rect x="28" y="36" width="44" height="8" fill="#e63946"/><ellipse cx="50" cy="36" rx="22" ry="8" fill="#ff5a66"/><text x="50" y="40" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" font-family="sans-serif">SELL</text>`,
  bot: `<rect x="28" y="34" width="44" height="36" rx="8" fill="#9aa4b8"/><rect x="34" y="42" width="32" height="14" rx="4" fill="#0b0f18"/><circle cx="42" cy="49" r="3" fill="#ff3b5c"/><circle cx="58" cy="49" r="3" fill="#ff3b5c"/><path d="M50 34v-10" stroke="#9aa4b8" stroke-width="3"/><circle cx="50" cy="22" r="4" fill="#ff3b5c"/><path d="M38 64h24" stroke="#0b0f18" stroke-width="3"/>`,
  whale: `<path d="M18 56q4-22 34-22 26 0 30 18l10-10v24l-10-6q-6 18-32 18-28 0-32-22z" fill="#3fa7ff"/><circle cx="34" cy="50" r="3" fill="#111"/><path d="M48 34q-4-10 2-14M52 34q4-10-2-14" stroke="#9fe3ff" stroke-width="3" fill="none"/><rect x="40" y="56" width="22" height="12" rx="3" fill="#ffd23f"/>`,
  terminal: `<rect x="16" y="26" width="68" height="44" rx="6" fill="#141a2a" stroke="#b45cff" stroke-width="3"/><polyline points="22,60 34,50 42,56 54,38 64,46 78,32" fill="none" stroke="#22e58b" stroke-width="3"/><rect x="40" y="70" width="20" height="8" fill="#555"/><rect x="30" y="78" width="40" height="5" rx="2" fill="#777"/>`,
  nuke: `<circle cx="50" cy="52" r="26" fill="#ffd23f"/><circle cx="50" cy="52" r="6" fill="#111"/><path d="M50 52l-13-22a26 26 0 0 1 26 0zM50 52l26 0a26 26 0 0 1-13 22zM50 52l-13 22a26 26 0 0 1-13-22z" fill="#111"/>`,
  cannon: `<rect x="22" y="40" width="50" height="20" rx="6" fill="#4a4f5c" transform="rotate(-20 47 50)"/><circle cx="36" cy="66" r="12" fill="#6b4a2a" stroke="#3a2a1a" stroke-width="3"/><path d="M70 30q8-6 14 2-4 8-14 6z" fill="#b3283c"/><path d="M72 32h10" stroke="#ffd23f" stroke-width="2" stroke-dasharray="2 2"/>`,
  machine: `<rect x="20" y="30" width="60" height="44" rx="6" fill="#5c6270"/><rect x="28" y="38" width="20" height="14" fill="#111"/><text x="38" y="49" text-anchor="middle" font-size="9" fill="#ff3b5c" font-family="monospace">-99</text><circle cx="64" cy="45" r="8" fill="#ffb02e"/><path d="M28 62h44" stroke="#ff3b5c" stroke-width="4"/><path d="M34 30l6-10h20l6 10" fill="#3a3f4d"/>`,
  swan: `<path d="M30 70q-6-20 16-24 18-2 22 12 4-24-8-30-10-4-12 6" fill="none" stroke="#0b0b0f" stroke-width="7" stroke-linecap="round"/><path d="M26 70q24 10 50-2-8 14-26 14-18 0-24-12z" fill="#0b0b0f"/><path d="M54 30l8 2-8 3z" fill="#ff3d81"/>`,
};
for (const t of DUMP_TOOLS) {
  const [c1, c2] = RARITY_COLORS[t.rarity];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="r" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
<rect x="2" y="2" width="96" height="96" rx="20" fill="url(#r)"/><rect x="2" y="2" width="96" height="96" rx="20" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>${TOOL_ART[t.effect]}</svg>`;
  save("dump-tools", `${t.id}.svg`, svg);
}

rmSync(join(OUT, "rooms"), { recursive: true, force: true }); // rooms are rendered live by src/client/room/Room.tsx

// ---------------- Currency icons ----------------
const CUR: Record<string, string> = {
  rub: `<circle cx="50" cy="50" r="46" fill="#3b82f6"/><text x="50" y="66" text-anchor="middle" font-size="48" font-weight="800" fill="#fff" font-family="sans-serif">₽</text>`,
  usd: `<circle cx="50" cy="50" r="46" fill="#16a34a"/><text x="50" y="67" text-anchor="middle" font-size="50" font-weight="800" fill="#fff" font-family="sans-serif">$</text>`,
  sol: `<circle cx="50" cy="50" r="46" fill="#111827"/><defs><linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#9945ff"/><stop offset="1" stop-color="#14f195"/></linearGradient></defs><g fill="url(#s)"><path d="M32 34h40l-8 8H24z"/><path d="M24 46h40l8 8H32z"/><path d="M32 58h40l-8 8H24z"/></g>`,
  btc: `<circle cx="50" cy="50" r="46" fill="#f7931a"/><text x="52" y="67" text-anchor="middle" font-size="48" font-weight="800" fill="#fff" font-family="sans-serif" transform="rotate(12 50 50)">₿</text>`,
  energy: `<circle cx="50" cy="50" r="46" fill="#3a2a05"/><path d="M56 14L26 56h20l-6 30 32-44H52z" fill="#ffd23f"/>`,
  xp: `<circle cx="50" cy="50" r="46" fill="#3d1366"/><path d="M50 18l9 20 22 2-16 15 5 22-20-12-20 12 5-22-16-15 22-2z" fill="#b45cff"/>`,
  damage: `<circle cx="50" cy="50" r="46" fill="#5c0a1a"/><path d="M50 16l8 20 20-6-10 18 16 12-20 2 2 20-16-12-16 12 2-20-20-2 16-12-10-18 20 6z" fill="#ff3b5c"/>`,
};
for (const [k, v] of Object.entries(CUR)) save("icons", `${k}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${v}</svg>`);

// ---------------- UI: logo + effects ----------------
save("ui", "logo.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22e58b"/><stop offset="1" stop-color="#3fa7ff"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="#0b0e17"/><path d="M24 24l52 52M76 24L24 76" stroke="url(#l)" stroke-width="14" stroke-linecap="round"/><circle cx="50" cy="50" r="9" fill="#ff3d81"/></svg>`);
save("effects", "explosion.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4l9 24 22-12-8 24 25 6-23 12 15 20-25-6-3 26-12-22-14 20 1-25-24 4 16-19-20-14 25-3-6-25 21 14z" fill="#ffb02e"/><path d="M50 22l6 16 15-6-5 16 16 6-16 6 7 15-16-6-4 16-6-15-12 11 3-16-16-1 13-11-10-13 16 2 1-16z" fill="#fff3b0"/></svg>`);
save("effects", "coin.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#ffd23f" stroke="#c99a00" stroke-width="6"/><text x="50" y="66" text-anchor="middle" font-size="44" font-weight="800" fill="#a87b00" font-family="sans-serif">$</text></svg>`);

console.log("assets generated in", OUT);
