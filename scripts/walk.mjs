// Click-through check of every screen: runtime errors, horizontal overflow, key elements, a real fight with hits.
// Usage: BASE=http://localhost:3000 node scripts/walk.mjs   (needs `playwright` installed next to it)
import { chromium } from "playwright";

const base = process.env.BASE || "http://localhost:3000";
const out = process.env.OUT || "/tmp";
const browser = await chromium.launch();
const report = [];
for (const width of [320, 390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror " + String(e).slice(0, 160)));
  page.on("console", (m) => m.type() === "error" && errors.push("console " + m.text().slice(0, 160)));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".hud", { timeout: 20000 });
  const routes = ["/", "/bosses", "/bosses/datsik", "/bosses/kedr", "/locations", "/locations/openspace", "/yard", "/shop", "/shop?tab=exchange", "/inventory", "/clans", "/profile"];
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      hud: !!document.querySelector(".hud") && !!document.querySelector(".nav"),
      active: document.querySelector(".nav a.on")?.textContent?.trim(),
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
    }));
    report.push(`${width} ${r} ${JSON.stringify(m)}`);
    if (width === 390) await page.screenshot({ path: `${out}/s${r.replace(/[/?=]/g, "_") || "_home"}.jpg`, type: "jpeg", quality: 55, fullPage: true });
  }
  if (width === 390) {
    // a real fight: start, hit with candles and the mouse
    await page.goto(base + "/bosses/datsik", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /В бой/ }).click();
    await page.waitForSelector(".tray", { timeout: 10000 });
    await page.waitForTimeout(800);
    const before = await page.locator(".arena-top .bar span").textContent();
    await page.locator(".weapon").nth(1).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/fight-anim.jpg`, type: "jpeg", quality: 60 });
    await page.waitForTimeout(900);
    await page.locator(".weapon").nth(0).click();
    await page.waitForTimeout(1500);
    const after = await page.locator(".arena-top .bar span").textContent();
    const tray = await page.locator(".weapon .w-qty").allTextContents();
    report.push(`fight hp ${before} -> ${after} tray ${JSON.stringify(tray)}`);
    await page.screenshot({ path: `${out}/fight.jpg`, type: "jpeg", quality: 60, fullPage: true });
    // a task in the first location
    await page.goto(base + "/locations/openspace", { waitUntil: "networkidle" });
    await page.locator(".task-go").first().click();
    await page.waitForTimeout(800);
    report.push("task " + (await page.locator(".task .bar span").first().textContent()));
    // shop purchase
    await page.goto(base + "/shop", { waitUntil: "networkidle" });
    await page.locator(".offer .btn").first().click();
    await page.waitForTimeout(800);
    report.push("rub after buy " + (await page.locator(".coin-chip b").first().textContent()));
  }
  report.push(`${width} errors ${JSON.stringify(errors.slice(0, 6))}`);
  await page.close();
}
await browser.close();
console.log(report.join("\n"));
