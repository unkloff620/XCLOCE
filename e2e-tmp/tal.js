const { chromium } = require('playwright');
const B = 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((g) => { try { localStorage.setItem('xc2_guest', g); } catch {} }, require('crypto').randomUUID());
  const P = await ctx.newPage();
  P.on('pageerror', (e) => console.log('PAGEERR ' + String(e).slice(0, 300)));
  await P.goto(B + '/'); await P.waitForSelector('.nav', { timeout: 60000 }); await P.waitForTimeout(1200);
  const token = await P.evaluate(() => localStorage.getItem('xc2_token'));
  const ver = (await fetch(B + '/api/version')).headers.get('x-app-version') || 'dev';
  const H = (t) => ({ 'content-type': 'application/json', authorization: 'Bearer ' + t, 'x-app-version': ver });
  const A = (type, body = {}) => fetch(B + '/api/action', { method: 'POST', headers: H(token), body: JSON.stringify({ type, ...body }) }).then((r) => r.json());
  for (const t of ['first-steps', 'tutorial', 'talents', 'exchange']) await A('help_seen', { topic: t });
  const st = await (await fetch(B + '/api/state', { headers: H(token) })).json(); const pid = (st.state ?? st).player.id;
  const al = await (await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: 1 }) })).json();
  await fetch(B + '/api/admin', { method: 'POST', headers: H(al.token), body: JSON.stringify({ op: 'edit', id: pid, edit: { op: 'set_talents', value: 40 } }) });
  let r = await A('talent_up', { weapon: 'fist', branch: 'n1' }); console.log('locked:', JSON.stringify(r.error));
  r = await A('talent_up', { weapon: '_biceps', branch: 's1' }); console.log('biceps up:', JSON.stringify(r.result));
  const st2 = await (await fetch(B + '/api/state', { headers: H(token) })).json();
  console.log('energyMax', (st2.state ?? st2).player.energyMax);
  await P.goto(B + '/profile'); await P.waitForTimeout(3500);
  console.log('tabs', await P.evaluate(() => [...document.querySelectorAll('.dos-tab')].map((e) => e.innerText).join('|')));
  for (const name of ['Таланты', 'Нычки', 'Новости']) {
    const ok = await P.evaluate((n) => { const t = [...document.querySelectorAll('.dos-tab')].find((e) => e.innerText.trim() === n.toUpperCase() || e.innerText.trim() === n); if (t) { t.click(); return true; } return false; }, name);
    await P.waitForTimeout(1200);
    console.log(name, ok, await P.evaluate(() => (document.querySelector('.dos-page')?.innerText ?? '').replace(/\n/g, ' | ').slice(0, 260)));
    if (name === 'Таланты') {
      console.log(' stops', await P.evaluate(() => document.querySelectorAll('.tp-stop').length), 'now', await P.evaluate(() => document.querySelector('.tp-stop.now')?.getAttribute('aria-label')));
      console.log(' road', await P.evaluate(() => { const r = document.querySelector('.tp-road')?.getBoundingClientRect(); const m = document.querySelector('.tp-map'); return r && [Math.round(r.width), Math.round(r.height), m?.scrollHeight]; }));
      await P.evaluate(() => document.querySelector('.tp-stop.now')?.click()); await P.waitForTimeout(1200);
      console.log(' after tap', await P.evaluate(() => document.querySelector('.tp-stop.now')?.getAttribute('aria-label')));
      const pos = await P.evaluate(() => [...document.querySelectorAll('.tp-stop')].slice(0, 7).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)].join(','); }).join(' ; '));
      console.log(' pos', pos);
    }
  }
  await b.close(); console.log('DONE');
})().catch((e) => { console.log('ERR', String(e).slice(0, 600)); process.exit(0); });
