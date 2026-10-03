// End-to-end: the last hit closes the fight screen and opens a centered victory window over the boss list.
// Usage: BASE=http://localhost:3000 node scripts/victory-check.mjs
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
const base = process.env.BASE || "http://localhost:3000";
const guestId = randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { token } = await (await fetch(`${base}/api/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ guestId }) })).json();
const act = async (type, extra = {}) => {
  await sleep(300);
  const r = await fetch(`${base}/api/action`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ type, idem: randomUUID(), ...extra }) });
  return r.json();
};
// 22 fans × 40 + fist 20 = 900 = boss #1 HP; keep one fan for the browser
for (let i = 0; i < 22; i++) await act("buy", { itemId: "w-paper-fan" });
await act("fight_start", { boss: 1 });
await act("fight_hit", { weapon: "fists" });
let last;
for (let i = 0; i < 21; i++) last = await act("fight_hit", { weapon: "w-paper-fan" });
console.log("before last hit: hp", last.result?.hp, last.error?.code ?? "");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 760 } });
await page.addInitScript((id) => localStorage.setItem("xcloce_guest", id), guestId);
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.locator(".boss-banner").click();
await page.waitForTimeout(1200);
const fightOpen = await page.locator(".fight-view").count();
await page.locator(".weapon", { hasText: "Бумажный веер" }).click();
await page.waitForTimeout(2200);
const after = await page.evaluate(() => {
  const m = document.querySelector(".modal-backdrop");
  const v = document.querySelector(".victory")?.getBoundingClientRect();
  return {
    fightClosed: !document.querySelector(".fight-view"),
    bossListVisible: !!document.querySelector(".boss-list"),
    modal: m ? getComputedStyle(m).position : null,
    title: document.querySelector(".victory-title")?.textContent ?? null,
    centered: v ? Math.abs(v.top + v.height / 2 - innerHeight / 2) < 4 : false,
    onScreen: v ? v.top >= 0 && v.bottom <= innerHeight : false,
  };
});
await page.screenshot({ path: "/tmp/victory.jpg", type: "jpeg", quality: 60 });
await page.locator(".victory button").click();
await page.waitForTimeout(1200);
const closed = await page.evaluate(() => ({ modalGone: !document.querySelector(".modal-backdrop"), bossList: !!document.querySelector(".boss-list"), wins: document.querySelector(".bcard-act small")?.textContent }));
console.log(JSON.stringify({ fightOpen, after, closed }));
await browser.close();
