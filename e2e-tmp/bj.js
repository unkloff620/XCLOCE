const { chromium } = require('playwright');
const B = 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((g) => { try { localStorage.setItem('xc2_guest', g); localStorage.setItem('xc2_leaders_open', '0'); } catch {} }, require('crypto').randomUUID());
  const P = await ctx.newPage();
  P.on('pageerror', (e) => console.log('PAGEERR ' + String(e).slice(0, 200)));
  await P.goto(B + '/'); await P.waitForSelector('.nav', { timeout: 60000 }); await P.waitForTimeout(1200);
  const token = await P.evaluate(() => localStorage.getItem('xc2_token'));
  const ver = (await fetch(B + '/api/version')).headers.get('x-app-version') || 'dev';
  const H = (t) => ({ 'content-type': 'application/json', authorization: 'Bearer ' + t, 'x-app-version': ver });
  await fetch(B + '/api/action', { method: 'POST', headers: H(token), body: JSON.stringify({ type: 'help_seen', topic: 'first-steps' }) });
  const st = await (await fetch(B + '/api/state', { headers: H(token) })).json(); const pid = (st.state ?? st).player.id;
  const al = await (await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 1 }) })).json();
  await fetch(B + '/api/admin', { method: 'POST', headers: H(al.token), body: JSON.stringify({ op: 'edit', id: pid, edit: { op: 'set_money', currency: 'USD', amount: 100 } }) });
  await P.goto(B + '/yard'); await P.waitForTimeout(3000);
  await P.click('.yard-table'); await P.waitForTimeout(800); await P.click('.game-tile[data-game="blackjack"]'); await P.waitForTimeout(2000);
  const btn = async (t) => P.evaluate((t) => { const x = [...document.querySelectorAll('.bjt-ctrl button, .bjt-lobby button')].find((e) => e.textContent.includes(t)); if (x) { x.click(); return true; } return false; }, t);
  console.log('sit', await btn('Сесть за стол')); await P.waitForTimeout(2000);
  const ctrl = () => P.evaluate(() => document.querySelector('.bjt-ctrl')?.innerText.replace(/\n/g, ' | '));
  console.log('ctrl0', await ctrl());
  await P.click('.bjt-box.big'); await P.waitForTimeout(300);
  console.log('ctrl1', await ctrl());
  await btn('Поставить'); await P.waitForTimeout(2500);
  console.log('after bet', await ctrl());
  for (let k = 0; k < 6; k++) {
    const phase = await P.evaluate(() => document.querySelector('.bjt-ctrl')?.innerText || '');
    if (phase.includes('Без страховки')) { await btn('Без страховки'); await P.waitForTimeout(1500); continue; }
    if (phase.includes('Хватит')) { await btn('Хватит'); await P.waitForTimeout(2500); continue; }
    break;
  }
  console.log('result', await ctrl(), 'cards', await P.$$eval('.bj2-stage .bjc', (e) => e.length));
  await P.waitForTimeout(6500);
  console.log('after clear', await ctrl(), 'cards', await P.$$eval('.bj2-stage .bjc', (e) => e.length));
  console.log('buttons', await P.evaluate(() => [...document.querySelectorAll('.bjt-ctrl button')].map((e) => e.textContent).join(' / ')));
  await b.close(); console.log('DONE');
})().catch((e) => { console.log('ERR', String(e).slice(0, 600)); process.exit(0); });
