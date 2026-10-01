// UI check at phone widths: HUD/nav always visible, centered shop, market, profile, fight (banner on Home), yard.
// Saves screenshots to $SHOTS (default /tmp/shots). Usage: BASE=http://localhost:3000 node scripts/ui-check.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = process.env.BASE || "http://localhost:3000";
const shots = process.env.SHOTS || "/tmp/shots";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
const overflow = (sel) => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll(sel)) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || el.closest(".weapons, svg, .fight-stage, .yard-stage, .boss-banner")) continue;
    if (b.right > vw + 1 || b.left < -1) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} [${Math.round(b.left)}..${Math.round(b.right)}]`);
  }
  return [...new Set(bad)].slice(0, 6);
};
const visible = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const b = el.getBoundingClientRect();
  return b.top >= -1 && b.bottom <= innerHeight + 1 && b.height > 0;
};
for (const width of [320, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 760 }, deviceScaleFactor: 1 });
  const shot = (name) => page.screenshot({ path: `${shots}/${width}-${name}.jpg`, type: "jpeg", quality: 70 });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot("home");
  const hud = await page.evaluate(() => {
    const txt = document.querySelector(".energy-txt");
    return { textFits: txt.scrollWidth <= txt.clientWidth + 1, text: txt.textContent, navArt: document.querySelectorAll(".nav-art").length, panelArt: document.querySelectorAll(".panel-art").length, banner: !!document.querySelector(".boss-banner") };
  });
  // shop must be centered
  await page.locator(".side-btn", { hasText: "Магазин" }).click();
  await page.waitForTimeout(500);
  const shop = await page.evaluate(() => {
    const b = document.querySelector(".sheet").getBoundingClientRect();
    return { centerDy: Math.round(b.top + b.height / 2 - innerHeight / 2), top: Math.round(b.top), bottom: Math.round(innerHeight - b.bottom) };
  });
  await shot("shop");
  await page.keyboard.press("Escape");
  // yard
  await page.locator(".side-btn", { hasText: "Двор" }).click();
  await page.waitForTimeout(1800);
  const yardItems = await page.locator(".yard-item").count();
  if (yardItems) await page.locator(".yard-item").first().click();
  await page.waitForTimeout(900);
  const yard = await page.evaluate((f) => ({ items: document.querySelectorAll(".yard-item").length, toast: document.querySelector(".toast")?.textContent ?? null, hud: !!document.querySelector(".hud"), nav: !!document.querySelector(".nav"), bad: eval(f)(".app *") }), overflow.toString());
  await shot("yard");
  // market
  await page.locator(".nav-btn").nth(1).click();
  await page.waitForTimeout(500);
  const market = await page.evaluate((f) => ({ yardClosed: !document.querySelector(".yard-view"), locs: document.querySelectorAll(".loc-card").length, bad: eval(f)(".app *") }), overflow.toString());
  // fight
  await page.locator(".nav-btn").nth(0).click();
  await page.waitForTimeout(500);
  await page.locator(".btn-attack").first().click();
  await page.waitForTimeout(1500);
  await page.locator(".weapon").first().click();
  await page.waitForTimeout(1500);
  const fight = await page.evaluate((args) => ({
    open: !!document.querySelector(".fight-view"), hudVisible: eval(args.v)(".hud"), navVisible: eval(args.v)(".nav"), weaponBarVisible: eval(args.v)(".weapon-bar"),
    timer: document.querySelector(".fight-timer")?.textContent, hp: document.querySelector(".fight-hp .bar-label")?.textContent,
    weapons: [...document.querySelectorAll(".weapon")].map((w) => w.textContent), rows: document.querySelectorAll(".dmg-row").length, bad: eval(args.f)(".app *"),
  }), { f: overflow.toString(), v: visible.toString() });
  await shot("fight");
  // flicker check: the damage list must not disappear between polls
  let flicker = 0;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(500);
    if ((await page.locator(".dmg-row").count()) === 0) flicker++;
  }
  // nav returns to Home and shows the boss banner
  await page.locator(".nav-btn").nth(2).click();
  await page.waitForTimeout(800);
  const home = await page.evaluate(() => ({ fightClosed: !document.querySelector(".fight-view"), banner: document.querySelector(".boss-banner")?.textContent ?? null }));
  await shot("home-banner");
  console.log(width, JSON.stringify({ hud, shop, yard, yardItems, market, fight, flicker, home }));
  await page.close();
}
await browser.close();
