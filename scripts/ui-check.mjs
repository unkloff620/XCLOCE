// Checks new UI: HUD energy bar fits, fight screen, market locations, profile sheet — at phone widths.
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:3000";
const browser = await chromium.launch();
const overflow = (sel) => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll(sel)) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || el.closest(".weapons, svg, .fight-stage")) continue;
    if (b.right > vw + 1 || b.left < -1) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} [${Math.round(b.left)}..${Math.round(b.right)}]`);
  }
  return [...new Set(bad)].slice(0, 6);
};
for (const width of [320, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 740 } });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const hud = await page.evaluate(() => {
    const m = document.querySelector(".energy-mini").getBoundingClientRect();
    const panel = document.querySelector(".hud-power").getBoundingClientRect();
    const txt = document.querySelector(".energy-txt");
    return { inside: m.left >= panel.left - 0.5 && m.right <= panel.right + 0.5, textFits: txt.scrollWidth <= txt.clientWidth + 1, barW: Math.round(m.width), panelW: Math.round(panel.width), text: txt.textContent };
  });
  // market
  await page.locator(".nav-btn").nth(1).click();
  await page.waitForTimeout(500);
  const locs = await page.locator(".loc-card").count();
  await page.locator(".loc-card").first().click();
  await page.waitForTimeout(400);
  await page.locator(".btn-task").first().click();
  await page.waitForTimeout(1200);
  const market = await page.evaluate((f) => ({ tasks: document.querySelectorAll(".task").length, firstBar: document.querySelector(".task .bar-label")?.textContent, bad: eval(f)(".app *") }), overflow.toString());
  // profile
  await page.locator(".hud-profile").click();
  await page.waitForTimeout(400);
  const profile = await page.evaluate(() => ({ open: !!document.querySelector(".profile-head"), input: document.querySelector(".field input")?.value }));
  await page.keyboard.press("Escape");
  // fight
  await page.locator(".nav-btn").nth(0).click();
  await page.waitForTimeout(500);
  await page.locator(".btn-attack").first().click();
  await page.waitForTimeout(1500);
  await page.locator(".weapon").first().click();
  await page.waitForTimeout(1500);
  const fight = await page.evaluate((f) => ({
    open: !!document.querySelector(".fight"), weapons: [...document.querySelectorAll(".weapon")].map((w) => w.textContent),
    hp: document.querySelector(".fight-hp .bar-label")?.textContent, rows: [...document.querySelectorAll(".dmg-row")].map((x) => x.textContent), bad: eval(f)(".fight *"),
  }), overflow.toString());
  console.log(width, JSON.stringify({ hud, locs, market, profile, fight }));
  await page.close();
}
await browser.close();
