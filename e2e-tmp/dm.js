const { chromium } = require('playwright');
const B = 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    await ctx.addInitScript((g) => { try { localStorage.setItem('xc2_guest', g); localStorage.setItem('xc2_leaders_open', '0'); } catch {} }, require('crypto').randomUUID());
    const P = await ctx.newPage();
    await P.goto(B + '/'); await P.waitForSelector('.nav', { timeout: 60000 }); await P.waitForTimeout(1200);
    const token = await P.evaluate(() => localStorage.getItem('xc2_token'));
    const ver = (await fetch(B + '/api/version')).headers.get('x-app-version') || 'dev';
    await fetch(B + '/api/action', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, 'x-app-version': ver }, body: JSON.stringify({ type: 'help_seen', topic: 'first-steps' }) });
    await P.goto(B + '/bosses/datsik'); await P.waitForSelector('.door-modes', { timeout: 30000 }); await P.waitForTimeout(1500);
    const box = (s) => P.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round).join(','); }).join(' ; '), s);
    console.log(vp.width, 'solo', await box('.door-solo'), '| modes', await box('.door-modes .mode-btn'), '| panel', await box('.prefight-panel'), '| leaf', await box('.door-leaf'), '| nav', await box('.nav'));
    console.log('overflow', await P.evaluate(() => [...document.querySelectorAll('.door-modes .mode-btn *')].filter((c) => { const p = c.closest('.mode-btn').getBoundingClientRect(); const q = c.getBoundingClientRect(); return q.width && (q.left < p.left - 1 || q.right > p.right + 1); }).map((c) => c.textContent).join('|')));
    await P.click('.door-modes .mode-btn.avtor'); await P.waitForTimeout(300);
    console.log('hint', await P.evaluate(() => document.querySelector('.mode-hint')?.innerText));
    await ctx.close();
  }
  await b.close(); console.log('DONE');
})().catch((e) => { console.log('ERR', String(e).slice(0, 600)); process.exit(0); });
