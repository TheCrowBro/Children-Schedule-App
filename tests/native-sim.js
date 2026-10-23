// Simulates the Capacitor native bridge in Chromium to test the phone-specific code paths
// (OAuth return via custom URL scheme, invite deep links, file saving, Android back button).
// Needs the app served on :8123.  Run: node tests/native-sim.js
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
  const tokenBodies = [];
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.LL_CONFIG={supabaseUrl:'https://fake.supabase.co',supabaseKey:'anon',dropboxKey:'dbx',msClientId:'ms',googleNativeClientId:'123-abc.apps.googleusercontent.com',appScheme:'app.littlelog.newborn'}` }));
  await ctx.route('https://api.dropboxapi.com/oauth2/token', r => { tokenBodies.push(r.request().postData()); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }) }); });
  await ctx.route('https://fake.supabase.co/**', r => r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }));
  // Fake native bridge, installed before the app's scripts run.
  await ctx.addInitScript(() => {
    const listeners = {}, calls = [];
    window.__calls = calls; window.__emit = (ev, data) => (listeners[ev] || []).forEach(f => f(data));
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
      Browser: { open: async o => calls.push(['Browser.open', o.url]), close: async () => calls.push(['Browser.close']) },
      App: { addListener: (ev, f) => (listeners[ev] = listeners[ev] || []).push(f), exitApp: () => calls.push(['App.exitApp']) },
      Filesystem: { writeFile: async o => calls.push(['writeFile', o.path, o.data.length]), getUri: async o => ({ uri: 'file:///cache/' + o.path }) },
      Share: { share: async o => calls.push(['share', o.url]) },
    } };
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8123/');
  let ok = 0; const pass = m => { ok++; console.log('✓', m); };
  const calls = () => p.evaluate(() => window.__calls);

  assert.equal(await p.evaluate(() => Native.is && Native.platform), 'android'); pass('app detects it is running as a phone app');
  assert(!(await p.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.controller))); pass('service worker not used in the phone app');
  assert.equal(await p.evaluate(() => Sync.inviteUrl('ABCDE12345')), 'app.littlelog.newborn://join?join=ABCDE12345'); pass('invite links use the app scheme when no public URL is set');

  // Dropbox sign-in: system browser out, custom-scheme redirect back in
  const out = await p.evaluate(async () => { await Cloud.connect('dropbox'); return window.__calls.find(c => c[0] === 'Browser.open')[1]; });
  const u = new URL(out); assert.equal(u.searchParams.get('redirect_uri'), 'app.littlelog.newborn://oauth'); assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  const state = u.searchParams.get('state');
  await p.evaluate(s => window.__emit('appUrlOpen', { url: 'app.littlelog.newborn://oauth?code=abc&state=' + s }), state);
  await p.waitForFunction(() => Cloud.connected('dropbox'));
  assert(tokenBodies[0].includes(encodeURIComponent('app.littlelog.newborn://oauth')) && tokenBodies[0].includes('code_verifier=')); assert((await calls()).some(c => c[0] === 'Browser.close')); pass('Dropbox sign-in returns through the custom URL scheme (PKCE) and closes the browser');
  // forged return (wrong state) must be refused
  await p.evaluate(() => window.__emit('appUrlOpen', { url: 'app.littlelog.newborn://oauth?code=evil&state=ll-onedrive-forged' })); await p.waitForTimeout(200);
  assert(!(await p.evaluate(() => Cloud.connected('onedrive')))); pass('OAuth return with an unknown state is rejected');

  // Google on the phone uses the reverse-client-id scheme
  const g = await p.evaluate(async () => { window.__calls.length = 0; await Cloud.connect('google'); return window.__calls.find(c => c[0] === 'Browser.open')[1]; });
  assert.equal(new URL(g).searchParams.get('redirect_uri'), 'com.googleusercontent.apps.123-abc:/oauth2redirect'); assert(new URL(g).searchParams.get('scope').includes('drive.appdata')); pass('Google Drive uses system-browser PKCE with the reverse client-id redirect');

  // Invite link opened while signed out is remembered and announced
  await p.evaluate(() => window.__emit('appUrlOpen', { url: 'app.littlelog.newborn://join?join=ABCDE12345' }));
  await p.waitForFunction(() => document.querySelector('#view').textContent.includes('invite waiting')); assert.equal(await p.evaluate(() => localStorage.getItem('ll.join')), 'ABCDE12345'); pass('invite deep link is captured and waits for sign-in');
  await p.evaluate(() => window.__emit('appUrlOpen', { url: 'https://evil.example/?join=bad' })); assert.equal(await p.evaluate(() => localStorage.getItem('ll.join')), 'ABCDE12345'); pass('malformed invite codes are ignored');

  // Files: share sheet instead of <a download>
  await p.evaluate(() => { window.__calls.length = 0; download('little-log.csv', 'a,b\n1,2', 'text/csv'); }); await p.waitForTimeout(100);
  const c2 = await calls(); assert(c2.some(c => c[0] === 'writeFile') && c2.some(c => c[0] === 'share' && c[1].endsWith('little-log.csv'))); pass('exports go through the native share sheet');

  // Android back button, on a page with no backend configured (so the app opens straight to the main screen)
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 800 } });
  await ctx2.addInitScript(() => {
    const L = {}; window.__calls = []; window.__emit = ev => (L[ev] || []).forEach(f => f());
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { App: { addListener: (ev, f) => (L[ev] = L[ev] || []).push(f), exitApp: () => window.__calls.push('exit') }, Browser: {}, Filesystem: {}, Share: {} } };
  });
  const q = await ctx2.newPage(); await q.goto('http://localhost:8123/'); await q.click('#localOnly');
  await q.click('[data-add=feed]'); assert(await q.isVisible('#sheet'));
  await q.evaluate(() => window.__emit('backButton')); assert(await q.isHidden('#sheet')); assert.deepEqual(await q.evaluate(() => window.__calls), []);
  await q.click('[data-tab=stats]'); await q.evaluate(() => window.__emit('backButton')); assert.equal(await q.evaluate(() => tab), 'day'); assert.deepEqual(await q.evaluate(() => window.__calls), []);
  await q.evaluate(() => window.__emit('backButton')); assert.deepEqual(await q.evaluate(() => window.__calls), ['exit']); pass('back button closes the sheet, then returns to Day, then exits');
  assert.deepEqual(errs, []); console.log(`\nall ${ok} native-simulation checks passed`); await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
