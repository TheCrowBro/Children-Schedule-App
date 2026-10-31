// Store screenshots and the feature graphic, from the demo (scripts/build-demo.js) in headless Chromium:
//   node scripts/store-shots.js <demo.html> [out dir, default store/]
// Makes store/android/*.jpg at 1080×1920 (the Play Store takes JPEG or PNG between 320 and 3840 px with sides no more than 2:1),
// store/ios/*.jpg at 1290×2796 (the App Store's 6.7-inch size) and store/feature-graphic.png at 1024×500. JPEG for the screenshots
// keeps the repository small (a sixth of the PNG); the feature graphic stays PNG for its flat colours. The demo's sample family
// is what the screens show; nothing is saved.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const demo = process.argv[2], out = process.argv[3] || path.join(root, 'store');
if (!demo) { console.error('usage: node scripts/store-shots.js <demo.html> [out dir]'); process.exit(1); }

/** The screens, in the order the listing shows them: the tab to open, what to open on it, and the file name. */
const SCREENS = [
  { tab: 'day', name: '1-day' },
  { tab: 'routine', name: '2-routine' },
  { tab: 'month', name: '3-month' },
  { tab: 'stats', name: '4-stats', open: 'details.sec' },
  { tab: 'guide', name: '5-guide' },
  { tab: 'family', name: '6-family' },
];
const SIZES = { android: { width: 360, height: 640, scale: 3 }, ios: { width: 430, height: 932, scale: 3 } };

(async () => {
  const exe = process.env.LL_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  for (const [platform, size] of Object.entries(SIZES)) {
    const dir = path.join(out, platform); fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.scale, colorScheme: 'light' });
    const p = await ctx.newPage();
    // the home screen's tour starts by itself the first time: mark it seen before the page loads, and end it if it starts anyway
    await ctx.addInitScript(() => { try { localStorage.setItem('ll.tours', JSON.stringify({ day: 1, welcome: 1 })); } catch (e) { /* no storage */ } });
    // ... and so does the month-birthday pop-up of the sample babies, and the demo's own "nothing here is saved" line: all out of the picture
    const quiet = () => p.evaluate(() => {
      if (typeof Tour !== 'undefined' && Tour.active()) Tour.end(false);
      const sheet = document.querySelector('#sheet'), back = document.querySelector('#sheetBack');
      if (sheet && !sheet.hidden) { sheet.hidden = true; sheet.innerHTML = ''; if (back) back.hidden = true; }
      const t = document.querySelector('#toast'); if (t) t.textContent = '';
      for (const e of document.querySelectorAll('p,div,small,span')) if (!e.children.length && /^Demo: tap around/.test(e.textContent.trim())) e.style.display = 'none';
    });
    await p.goto('file://' + path.resolve(demo)); await p.waitForTimeout(3000); await quiet(); await p.waitForTimeout(800); await quiet();
    for (const s of SCREENS) {
      await p.evaluate(sel => document.querySelector(sel).click(), `[data-tab=${s.tab}]`); await p.waitForTimeout(700); await quiet(); await p.waitForTimeout(700); await quiet();
      if (s.open) { const d = await p.$(s.open); if (d) { await d.evaluate(e => { e.open = true; }); await p.waitForTimeout(400); } }
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.screenshot({ path: path.join(dir, `${s.name}.jpg`), type: 'jpeg', quality: 92 });
      console.log(platform, s.name, `${size.width * size.scale}×${size.height * size.scale}`);
    }
    await ctx.close();
  }
  // the feature graphic: the icon, the name and one line, on the app's own colours
  const icon = fs.readFileSync(path.join(root, 'resources', 'icon-only.png')).toString('base64');
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1024px;height:500px;background:linear-gradient(135deg,#f6f2ec,#dfe3ec);font-family:Georgia,'Iowan Old Style','Palatino Linotype',serif;color:#4a4337}
    .wrap{display:flex;align-items:center;gap:56px;height:100%;padding:0 96px;box-sizing:border-box}
    img{width:260px;height:260px;border-radius:58px;box-shadow:0 18px 40px rgba(74,67,55,.18)}
    h1{font-size:84px;margin:0 0 14px;font-weight:normal;letter-spacing:-1px}
    p{font-size:33px;margin:0;color:#6b6354;line-height:1.3}
  </style></head><body><div class="wrap"><img src="data:image/png;base64,${icon}" alt=""><div><h1>Little Log</h1>
    <p>Your child's days, logged by the whole family.<br>Encrypted, in your own cloud.</p></div></div></body></html>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(out, 'feature-graphic.png') });
  console.log('feature-graphic 1024×500');
  await ctx.close(); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
