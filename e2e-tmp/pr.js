const { chromium } = require('playwright');
const B = 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const ver = (await fetch(B + '/api/version')).headers.get('x-app-version') || 'dev';
  const H = (t) => ({ 'content-type': 'application/json', authorization: 'Bearer ' + t, 'x-app-version': ver });
  const mk = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript((g) => { try { localStorage.setItem('xc2_guest', g); localStorage.setItem('xc2_leaders_open', '0'); } catch {} }, require('crypto').randomUUID());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('PAGEERR ' + String(e).slice(0, 200)));
    await page.goto(B + '/'); await page.waitForSelector('.nav', { timeout: 60000 }); await page.waitForTimeout(1200);
    const token = await page.evaluate(() => localStorage.getItem('xc2_token'));
    return { page, token };
  };
  const A = (tok, type, body = {}) => fetch(B + '/api/action', { method: 'POST', headers: H(tok), body: JSON.stringify({ type, ...body }) }).then((r) => r.json());
  const S = async (tok) => { const j = await (await fetch(B + '/api/state', { headers: H(tok) })).json(); return j.state ?? j; };
  const x = await mk(), y = await mk();
  for (const p of [x, y]) await A(p.token, 'help_seen', { topic: 'first-steps' });
  const sx = await S(x.token), sy = await S(y.token);
  const al = await (await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 1 }) })).json();
  for (const pid of [sx.player.id, sy.player.id]) for (const c of ['USD', 'RUB']) await fetch(B + '/api/admin', { method: 'POST', headers: H(al.token), body: JSON.stringify({ op: 'edit', id: pid, edit: { op: 'set_money', currency: c, amount: 500 } }) });
  const P = x.page;
  // --- profile of y
  await P.goto(B + '/profile?id=' + sy.player.id); await P.waitForSelector('.pr-rail', { timeout: 30000 }); await P.waitForTimeout(1500);
  console.log('plate', await P.evaluate(() => document.querySelector('.pr-plate')?.innerText.replace(/\n/g, ' | ')));
  console.log('rail', await P.evaluate(() => [...document.querySelectorAll('.pr-btn')].map((e) => e.getAttribute('aria-label') + ':' + e.innerText.replace(/\n/g, ' ')).join(' / ')));
  console.log('scene', !!(await P.$('.pr-page .room-view svg, .pr-page .room-view img')));
  await P.click('.pr-btn[aria-label="Прокачать бицуху"]'); await P.waitForTimeout(1500);
  console.log('after pump', await P.evaluate(() => document.querySelector('.pr-btn[aria-label="Прокачать бицуху"]')?.innerText));
  await P.click('.pr-btn[aria-label="Наехать"]'); await P.waitForTimeout(400);
  console.log('brawl anim', !!(await P.$('.pr-brawl')));
  await P.waitForTimeout(2200);
  console.log('brawl res', await P.evaluate(() => document.querySelector('.pr-brawl-res')?.innerText.replace(/\n/g, ' | ')));
  await P.evaluate(() => document.querySelectorAll('.modal-back').forEach((e) => e.remove()));
  await P.click('.pr-btn[aria-label="Харкнуть"]'); await P.waitForTimeout(400);
  console.log('spit fx', !!(await P.$('.pr-spit')));
  await P.waitForTimeout(1500);
  await P.click('.pr-btn[aria-label="Личное дело"]'); await P.waitForTimeout(1000);
  console.log('dossier tabs', await P.evaluate(() => [...document.querySelectorAll('.dos-tab')].map((e) => e.textContent).join(' / ')));
  console.log('dossier sum', await P.evaluate(() => document.querySelector('.dos-page')?.innerText.replace(/\n/g, ' | ').slice(0, 220)));
  await P.evaluate(() => { const t = [...document.querySelectorAll('.dos-tab')].find((e) => e.textContent === 'Достижения'); t && t.click(); }); await P.waitForTimeout(600);
  console.log('dossier ach', await P.evaluate(() => document.querySelector('.dos-page')?.innerText.replace(/\n/g, ' | ').slice(0, 120)));
  // --- y's messages
  const sy2 = await S(y.token);
  console.log('y notes', JSON.stringify(sy2.notes?.map((n) => [n.kind, n.from, n.unread])));
  // --- invite pop-up: y calls x to a duel
  await A(y.token, 'duel_create', { to: sx.player.id, stake: 1 });
  await P.goto(B + '/'); await P.waitForSelector('.gi', { timeout: 30000 }).catch(() => {});
  console.log('popup', await P.evaluate(() => document.querySelector('.gi')?.innerText.replace(/\n/g, ' | ')));
  await P.click('.gi-b.ok').catch(() => {}); await P.waitForTimeout(4000);
  console.log('after accept url', P.url(), 'zonk open', !!(await P.$('.zb')));
  // --- overflow sweep
  const sweep = async (label) => {
    const bad = await P.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll('button, .btn, .chip, a.btn')) {
        const r = e.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
        const t = (e.innerText || '').trim().replace(/\n/g, ' ');
        if (!t) continue;
        if (e.scrollWidth > e.clientWidth + 2) { out.push('W:' + t.slice(0, 40)); continue; }
        for (const c of e.querySelectorAll('*')) { const q = c.getBoundingClientRect(); if (q.width && (q.left < r.left - 2 || q.right > r.right + 2 || q.top < r.top - 3 || q.bottom > r.bottom + 3) && !c.closest('.side-dot,.msg-count,.yg-badge,.pr-pop')) { out.push('C:' + t.slice(0, 40)); break; } }
      }
      return [...new Set(out)].slice(0, 12);
    });
    console.log('SWEEP', label, JSON.stringify(bad));
  };
  await sweep('zonk');
  await P.evaluate(() => document.querySelectorAll('.modal-back').forEach((e) => e.remove()));
  for (const path of ['/', '/yard', '/shop', '/locations', '/locations/openspace', '/bosses', '/clans', '/profile']) { await P.goto(B + path); await P.waitForTimeout(2500); await sweep(path); }
  await P.goto(B + '/yard'); await P.waitForTimeout(2500); await P.click('.yard-table'); await P.waitForTimeout(800); await P.click('.game-tile[data-game="poker"]'); await P.waitForTimeout(2000); await sweep('poker');
  await b.close(); console.log('DONE');
})().catch((e) => { console.log('ERR', String(e).slice(0, 600)); process.exit(0); });
