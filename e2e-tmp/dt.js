const { chromium } = require('playwright');
const B = 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await ctx.addInitScript((g) => { try { localStorage.setItem('xc2_guest', g); localStorage.setItem('xc2_leaders_open', '0'); } catch {} }, require('crypto').randomUUID());
  const P = await ctx.newPage();
  P.on('pageerror', (e) => console.log('PAGEERR ' + String(e).slice(0, 200)));
  await P.goto(B + '/'); await P.waitForSelector('.nav', { timeout: 60000 }); await P.waitForTimeout(1200);
  const token = await P.evaluate(() => localStorage.getItem('xc2_token'));
  const ver = (await fetch(B + '/api/version')).headers.get('x-app-version') || 'dev';
  const H = (t) => ({ 'content-type': 'application/json', authorization: 'Bearer ' + t, 'x-app-version': ver });
  const A = (type, body = {}) => fetch(B + '/api/action', { method: 'POST', headers: H(token), body: JSON.stringify({ type, ...body }) }).then((r) => r.json());
  await A('help_seen', { topic: 'first-steps' });
  const st = await (await fetch(B + '/api/state', { headers: H(token) })).json(); const pid = (st.state ?? st).player.id;
  const al = await (await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 1 }) })).json();
  for (const c of ['USD', 'RUB']) await fetch(B + '/api/admin', { method: 'POST', headers: H(al.token), body: JSON.stringify({ op: 'edit', id: pid, edit: { op: 'set_money', currency: c, amount: 5000 } }) });
  for (let i = 0; i < 2; i++) { const r = await A('poker_play'); if (!r.error && r.result.phase === 'draw') await A('poker_stand'); }
  await A('bj_open');
  for (let i = 0; i < 4; i++) {
    let r = await A('bj_bet', { bet: 5, pp: 0, t3: 0 });
    for (let k = 0; k < 6 && r.result?.table?.phase && r.result.table.phase !== 'betting'; k++) r = r.result.table.phase === 'insurance' ? await A('bj_insure', { take: false }) : await A('bj_move', { move: 'stand' });
    await new Promise((z) => setTimeout(z, 5500));
  }
  const boxes = (sels) => P.evaluate((sels) => sels.map((s) => { const e = document.querySelector(s); if (!e) return s + ':none'; const r = e.getBoundingClientRect(); return s + ':' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','); }).join('  '), sels);
  await P.goto(B + '/yard'); await P.waitForTimeout(3000);
  await P.click('.yard-table'); await P.waitForTimeout(800); await P.click('.game-tile[data-game="poker"]'); await P.waitForTimeout(2500);
  console.log('poker note', await P.evaluate(() => document.querySelector('.dt-note')?.innerText.replace(/\n/g, ' | ')));
  console.log('poker boxes', await boxes(['.dt-note', '.pk-help', '.pkt-top', '.pkt-lvl', '.modal.full > .x']));
  await P.screenshot({ path: '/tmp/pk.png', clip: { x: 0, y: 0, width: 390, height: 260 } });
  await P.click('.dt-note'); await P.waitForTimeout(1200);
  console.log('poker list', await P.evaluate(() => document.querySelector('.dt')?.innerText.replace(/\n/g, ' | ').slice(0, 200)));
  await P.keyboard.press('Escape'); await P.waitForTimeout(500); await P.keyboard.press('Escape'); await P.waitForTimeout(800);
  await P.click('.yard-table'); await P.waitForTimeout(800); await P.click('.game-tile[data-game="blackjack"]'); await P.waitForTimeout(2500);
  console.log('bj note', await P.evaluate(() => document.querySelector('.dt-note')?.innerText.replace(/\n/g, ' | ')));
  console.log('bj boxes', await boxes(['.dt-note', '.bj2-top', '.bj2-top .btn', '.modal.full > .x', '.bjt-dealer']));
  await P.screenshot({ path: '/tmp/bj.png', clip: { x: 0, y: 0, width: 390, height: 260 } });
  await b.close(); console.log('DONE');
})().catch((e) => { console.log('ERR', String(e).slice(0, 600)); process.exit(0); });
