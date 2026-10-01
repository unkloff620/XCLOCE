// Visual QA: captures mobile screenshots of the main screens and the boss art.
// Usage: npm i -D playwright && npx playwright install chromium && BASE=http://localhost:3000 OUT=/tmp/shots node scripts/screenshots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.BASE || "http://localhost:3000";
const out = process.env.OUT || "/tmp/shots";
mkdirSync(out, { recursive: true });
const shot = (page, name, full = true) => page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality, fullPage: full });

const browser = await chromium.launch();
const scale = Number(process.env.SCALE || 1);
const quality = Number(process.env.QUALITY || 55);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await shot(page, "home", false);
await shot(page, "home-full");
const nav = async (i) => { await page.locator(".navbtn").nth(i).click(); await page.waitForTimeout(1500); };
for (const [i, name] of ["boss", "market", "home", "inventory", "social"].entries()) { await nav(i); await shot(page, name); }

const gallery = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: scale });
const ids = ["01-bagholder", "02-copium-hamster", "03-wen-lambo", "04-paper-cat", "05-laser-ape", "06-bear-baron", "07-rug-wizard", "08-gas-goblin", "09-troll-whale", "10-meme-king"];
const grid = (list) => `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(4,300px)">${list.map((i) => `<img src="${base}/assets/bosses/${i}.svg" width="300" height="300">`).join("")}</body>`;
await gallery.setContent(grid(ids)); await gallery.waitForTimeout(1500); await shot(gallery, "bosses");
console.log("errors:", JSON.stringify(errors.slice(0, 10)));
await browser.close();
