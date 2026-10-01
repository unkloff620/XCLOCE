// Layout sanity check: horizontal overflow and elements spilling out of the viewport on small phones.
// Usage (with playwright installed): BASE=http://localhost:3000 node scripts/layout-check.mjs
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:3000";
const browser = await chromium.launch();
for (const width of [320, 360, 390, 768]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  for (let tab = 0; tab < 5; tab++) {
    await page.locator(".navbtn").nth(tab).click();
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const bad = [];
      for (const el of document.querySelectorAll(".app *")) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || getComputedStyle(el).position === "fixed") continue;
        if (el.closest(".scroll-x, .balances, svg")) continue;
        if (b.right > vw + 1 || b.left < -1) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} [${Math.round(b.left)}..${Math.round(b.right)}]`);
      }
      return { scrollW: document.documentElement.scrollWidth, vw, bad: [...new Set(bad)].slice(0, 8) };
    });
    console.log(width, ["home", "market", "boss", "quests", "more"][tab], r.scrollW > r.vw ? `OVERFLOW ${r.scrollW}>${r.vw}` : "ok", r.bad.join(" | "));
  }
  await page.close();
}
await browser.close();
