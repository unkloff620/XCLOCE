// Verifies uploaded skins are applied: 9-slice frames by selector, images in nav / side buttons / items / bosses.
// Usage (server running with test files in public/skin): BASE=http://localhost:3000 node scripts/skin-check.mjs
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 760 } });
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const bi = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).borderImageSource.slice(0, 60) : "missing"; };
  const img = (sel) => [...document.querySelectorAll(sel)].map((i) => i.getAttribute("src")?.split("?")[0]);
  const profile = document.querySelector(".hud .hud-profile");
  const pr = profile.getBoundingClientRect();
  const name = document.querySelector(".hud-name").getBoundingClientRect();
  return {
    profileFrame: bi(".hud .hud-profile"), cellFrame: bi(".hud .money"), artHidden: getComputedStyle(document.querySelector(".hud .hud-profile > .panel-art")).display,
    nameInside: name.left >= pr.left && name.right <= pr.right && name.top >= pr.top && name.bottom <= pr.bottom,
    nav: img(".nav-btn img"), side: img(".side-btn img"),
  };
});
await page.locator(".nav-btn").nth(4).click(); // any tab so the menu image switches to -on / normal
await page.locator(".nav-btn").nth(3).click();
await page.waitForTimeout(500);
const inv = await page.evaluate(() => ({ greenBtn: document.querySelector(".btn-green") ? getComputedStyle(document.querySelector(".btn-green")).borderImageSource.slice(0, 50) : "none on screen" }));
await page.locator(".nav-btn").nth(0).click();
await page.waitForTimeout(500);
const boss = await page.evaluate(() => {
  const card = document.querySelector(".bcard");
  const btn = document.querySelector(".bcard .btn-attack");
  return {
    cardArt: card.querySelector(".bcard-art")?.getAttribute("src")?.split("?")[0] ?? null,
    cardRatio: +(card.getBoundingClientRect().width / card.getBoundingClientRect().height).toFixed(2),
    attackText: btn.textContent.trim(),
    counter: card.querySelector(".bcard-act small")?.textContent,
    rewards: [...card.querySelectorAll(".bcard-tile")].map((t) => t.title + " " + t.textContent),
    cardOverflow: [...card.querySelectorAll(".bcard-main *")].filter((e) => e.getBoundingClientRect().right > card.getBoundingClientRect().right + 1).length,
  };
});
await page.screenshot({ path: "/tmp/skin-check.jpg", type: "jpeg", quality: 60 });
console.log(JSON.stringify({ ...r, ...inv, ...boss }, null, 1));
await browser.close();
