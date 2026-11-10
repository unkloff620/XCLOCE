/*
 * Frames of a page with a boss puppet (WebGL) as the player sees it — for checking animations by eye.
 * Run under a virtual screen: xvfb-run -a node tools/boss/capture-puppet.cjs <browser profile> <out dir> <url> [frames] [gap ms] [clip x,y,w,h]
 * (headless Chromium does not show WebGL canvases on screenshots; each frame copies the canvases into pictures in place).
 */
const { chromium } = require('playwright');
(async () => {
  const [profile, out, url, n = '24', gap = '40', clip = '0,200,400,420'] = process.argv.slice(2);
  const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 400, height: 860 }, headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  await ctx.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return g.call(this, t, Object.assign({}, o, { preserveDrawingBuffer: true })); }; });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForSelector(".br-pup", { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(4000);
  const [x, y, w, h] = clip.split(',').map(Number);
  for (let i = 0; i < +n; i++) {
    await p.evaluate(() => {
      document.querySelectorAll('img.cvsnap').forEach((e) => e.remove());
      document.querySelectorAll('.br-pup canvas').forEach((c) => {
        const im = document.createElement('img');
        im.className = 'cvsnap';
        im.src = c.toDataURL();
        const cs = getComputedStyle(c);
        Object.assign(im.style, { position: 'absolute', left: c.offsetLeft + 'px', top: c.offsetTop + 'px', width: c.offsetWidth + 'px', height: c.offsetHeight + 'px', zIndex: cs.zIndex, transform: c.style.transform, transformOrigin: c.style.transformOrigin, pointerEvents: 'none' });
        c.parentNode.insertBefore(im, c);
        c.style.visibility = 'hidden';
      });
    });
    await p.waitForTimeout(30);
    await p.screenshot({ path: `${out}/b${i}.png`, clip: { x, y, width: w, height: h } });
    await p.evaluate(() => document.querySelectorAll('.br-pup canvas').forEach((c) => { c.style.visibility = ''; }));
    await p.waitForTimeout(+gap);
  }
  await ctx.close();
})();
