// End-to-end: the real app (built into a temp folder, with its real CSP) in desktop Chromium with a fake native bridge,
// talking to a shim that runs the real schema.sql on a real Postgres. Needs: playwright, chromium, ffmpeg, postgres.
//   node tests/e2e.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { execSync } = require('child_process');
const { chromium } = require('playwright');
const EXE = process.env.LL_CHROMIUM || (require('fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');   // (the dev sandbox's browser; elsewhere, as on GitHub's runner, Playwright's own)
const { startCluster, freshDb } = require('./lib/pg');
const { createShim, totp } = require('./lib/shim');
const { installFakeNative } = require('./lib/fake-native');

const root = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'll-e2e-')), www = path.join(tmp, 'www');
const APP = 'http://localhost:8124/', SB = 'https://fake.supabase.co';
let ok = 0, failed = 0;
const pass = m => { ok++; console.log('✓', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const step = async (name, fn) => { try { await fn(); pass(name); } catch (e) { failed++; console.log('✗', name, '\n   ', String(e.message).split('\n').slice(0, 3).join('\n    ')); } };

// ---- build the app exactly as shipped, but with a test config -------------------------------------
fs.writeFileSync(path.join(tmp, 'config.js'), `window.LL_CONFIG={supabaseUrl:'${SB}',supabaseKey:'anon',captchaSiteKey:'test-site',dropboxKey:'dbx',googleClientId:'123-abc.apps.googleusercontent.com',msClientId:'ms',appScheme:'app.littlelog.newborn'}`);
execSync('node scripts/build-web.js', { cwd: root, env: { ...process.env, LL_CONFIG: path.join(tmp, 'config.js'), LL_OUT: www }, stdio: 'pipe' });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(www, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!f.startsWith(www) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise(r => server.listen(8124, r));
  const adminUrl = startCluster(), { url, su } = await freshDb(adminUrl);
  const shim = createShim(url, { captcha: true });
  const browser = await chromium.launch({ ...(EXE ? { executablePath: EXE } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const all = [];
  const turnstile = `window.turnstile={render:(sel,o)=>{setTimeout(()=>o.callback('captcha-ok'),30);return 1}}`;

  async function device(opts = {}) {
    const ctx = await (opts.br || browser).newContext({ viewport: { width: 390, height: 800 } });
    if (opts.native !== false) await installFakeNative(ctx, opts);
    await ctx.addInitScript(() => { try { if (!localStorage.getItem('ll.tours')) localStorage.setItem('ll.tours', '{"day":1,"welcome":1}'); localStorage.setItem('ll.welcome', '1'); } catch (e) { /* no storage */ } });   // (the first-time tour is tested in features, the first screen in start)
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { try { ['mlang', 'macct', 'mkids', 'mregion', 'munits', 'mlook', 'mcloud', 'mdata', 'mapp', 'mnotify', 'secnewborn', 'sectoddler', 'secschool', 'secteens', 'secpuberty', 'secfood', 'secmeds', 'secplay', 'secchecks', 'secmonths'].forEach(g => openGroups.add(g)); } catch (e) { /* not the app */ } }));   // (the More page's twirl-downs start closed)
    await shim.install(ctx);
    await ctx.route('https://challenges.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: turnstile }));
    await ctx.route('https://api.dropboxapi.com/oauth2/token', r => { (opts.tokenCalls || (opts.tokenCalls = [])).push(r.request().postData()); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ access_token: 'dbx-at', refresh_token: 'dbx-rt', expires_in: 14400 }) }); });
    await ctx.route('https://content.dropboxapi.com/**', r => { const q = r.request(); if (q.url().endsWith('/upload')) { shim.dbx = q.postData(); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }); } r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: shim.dbx || '' }); });
    // Mimic Capacitor-Android, which inserts its bridge as an inline <script> right after <head> in index.html.
    await ctx.route(/^http:\/\/localhost:8124\/(index\.html)?$/, async r => {
      const res = await r.fetch(); let html = await res.text();
      assert(html.includes('<head>'), 'index.html must contain a plain <head> tag, where Capacitor injects its bridge');
      r.fulfill({ response: res, body: html.replace('<head>', '<head>\n<script type="text/javascript">window.__capInjected = 1;</script>\n') });
    });
    const p = await ctx.newPage(); p.errs = []; p.csp = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) p.csp.push(m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(opts.url || APP); all.push(p); return p;
  }
  const signIn = async (p, email) => {
    await p.fill('#lEmail', email); await p.waitForFunction(() => true); await sleep(150);
    await p.click('#lSend'); await p.waitForSelector('#lCode'); await p.fill('#lCode', '12345678'); await p.click('#lVerify');
  };
  const secretOf = p => p.evaluate(() => document.querySelector('.card .code').textContent.trim());
  const enterTotp = async (p, secret, sel = '#eCode', btn = '#eGo') => { await p.fill(sel, totp(secret)); await p.click(btn); };
  const q = async (sql, params) => (await su.query(sql, params)).rows;
  // entries sit in twirl-down groups under the day clock: open them all, then tap the entry
  const openEntry = async (p, sel) => { await p.evaluate(() => document.querySelectorAll('details.grp').forEach(d => { d.open = true; })); await p.click('.grows [data-edit]' + sel); };
  const syncNow = async p => { await p.evaluate(() => Sync.run(true)); await p.waitForFunction(() => Sync.st.state !== 'syncing'); };
  const toastText = p => p.evaluate(() => document.querySelector('#toast').textContent);
  const secrets = [];   // everything that must never reach the server in readable form
  const rowOf = async id => (await q('select * from events where id=$1', [id]))[0];
  const idOfType = (p, type) => p.evaluate(t => (db.events.find(e => e.type === t) || {}).id, type);
  /** Decrypt a server row with the given phone's keys. */
  const plainOf = async (p, id) => { const row = await rowOf(id); return p.evaluate(([b, r]) => E2EE.decryptRow(b, r), [await p.evaluate(() => db.meta.babyId), row]); };
  const babyOf = p => p.evaluate(() => db.meta.babyId);
  const epochOnServer = async () => (await q('select epoch from babies order by created_at limit 1'))[0].epoch;
  const keysOf = p => p.evaluate(() => JSON.parse(localStorage.getItem('MOCKSECURE:e2ee.keys.' + db.meta.babyId)));

  // ================= part 1: app-only, sign-in, MFA, create log =================
  await step('outside the phone app, the web page only says "get the app"', async () => {
    const W = await device({ native: false });
    const txt = await W.textContent('#view'); assert(/phone app/.test(txt)); assert(!(await W.isVisible('#tabs')));
    assert(!(await W.$('#lEmail')), 'no sign-in form in a browser');
    assert.equal(await W.evaluate(() => 'serviceWorker' in navigator ? navigator.serviceWorker.controller : null), null);
    await W.context().close();
  });

  const A = await device();
  await step('the strict content-security policy is in place and blocks injected scripts', async () => {
    const csp = await A.evaluate(() => document.querySelector('meta[http-equiv=Content-Security-Policy]').content);
    assert(csp.includes("script-src 'self' https://challenges.cloudflare.com") && csp.includes("connect-src 'self' https://fake.supabase.co") && csp.includes("default-src 'none'"));
    assert.equal(await A.evaluate(() => window.__capInjected), 1, 'the bridge script Capacitor-Android injects before the policy must still run');
    await A.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__pwn = 1'; document.body.appendChild(s); });
    await sleep(100); assert.equal(await A.evaluate(() => window.__pwn), undefined, 'inline script must not run');
    A.csp.length = 0;
  });
  await step('sign-in is required, with a security check (CAPTCHA) before a code is sent', async () => {
    await A.waitForSelector('#lEmail'); assert(!(await A.isVisible('#tabs')));
    const refused = await A.evaluate(() => Auth.sendCode('mum@x.com', '').then(() => 'sent', e => e.message));
    assert(/captcha/.test(refused), 'server must refuse a code request without a CAPTCHA token: ' + refused);
    assert.equal(shim.o.sent || 0, 0);
    await A.type('#lEmail', 'mum@x.comm'); await A.press('#lEmail', 'Backspace'); assert.equal(await A.inputValue('#lEmail'), 'mum@x.com', 'Backspace takes one letter off (Enter sends; the key used to be swallowed)');
    await A.fill('#lEmail', 'mum@x.com'); await sleep(300);                  // let the security check complete
    await A.click('#lSend'); await A.waitForSelector('#lCode'); assert.equal(shim.o.sent, 1);
  });
  await step('five wrong codes force a fresh code; the right code signs in', async () => {
    for (let i = 0; i < 5; i++) { await A.fill('#lCode', '00000000'); await A.click('#lVerify'); await A.waitForFunction(() => !document.querySelector('#lVerify') || !document.querySelector('#lVerify').disabled); if (i < 4) await A.waitForSelector('#lCode'); }
    await A.waitForSelector('#lEmail'); assert(/Too many wrong codes/.test(await A.textContent('[role=alert]')));
    await sleep(200); await A.fill('#lEmail', 'mum@x.com'); await A.click('#lSend'); await A.waitForSelector('#lCode');
    await A.fill('#lCode', '12345678'); await A.click('#lVerify'); await A.waitForSelector('#oCreate');
  });
  let mumSecret, recoveryA;
  await step('a new parent must set up two-step verification before a log is created', async () => {
    await A.fill('#oMine', 'Mum'); await A.fill('#oName', 'Leo'); await A.fill('#oBirth', '2026-10-10'); await A.click('#oCreate');
    await A.waitForSelector('#eGo'); assert(/must use two-step/.test(await A.textContent('#view')));
    assert.equal((await q('select count(*)::int c from babies'))[0].c, 0, 'nothing created yet');
    mumSecret = await secretOf(A);
    await A.fill('#eCode', '000000'); await A.click('#eGo'); await A.waitForFunction(() => /not right/.test(document.body.textContent));
    await enterTotp(A, mumSecret); try { await A.waitForSelector('#rcDone', { timeout: 8000 }); } catch (e) { console.log('DEBUG view:', (await A.textContent('#view')).replace(/\s+/g, ' ').slice(0, 300), '| tabs visible:', await A.isVisible('#tabs'), '| errs:', A.errs); throw e; }
    recoveryA = (await A.textContent('#view .code')).trim(); assert(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/.test(recoveryA), 'recovery code format: ' + recoveryA);
    await A.click('#rcDone'); assert(/Tick the box/.test(await toastText(A)), 'must confirm the code was saved');
    await A.click('input[name=rcAck]'); await A.click('#rcDone'); await A.waitForSelector('#tabs');
    assert.equal(await A.textContent('#title'), "Leo's Log");
    assert.equal(await A.evaluate(() => db.meta.recoveryAck), true);
    const bb = (await q('select profile, epoch from babies'))[0]; assert(!bb.profile.includes('Leo') && !bb.profile.includes('2026'), 'baby name and birthday are not on the server'); assert.equal(bb.epoch, 1);
    assert.equal((await q('select count(*)::int c from key_grants'))[0].c, 2, 'one grant for this phone, one for the recovery key');
    const m = (await q(`select role, display_name from members`))[0]; assert.deepEqual([m.role, m.display_name], ['parent', 'Mum']);
    assert.equal(await A.evaluate(() => Auth.aal), 'aal2');
  });
  await step('sign-in tokens, cloud tokens and passphrase live only in secure storage', async () => {
    const plain = await A.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('MOCKSECURE:'))));
    const secure = await A.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('MOCKSECURE:')));
    assert(secure.includes('MOCKSECURE:auth.v2'), 'session is in the keychain');
    assert(!Object.keys(plain).includes('littlelog.v1') && await A.evaluate(() => Store.usingIndexedDB), 'the log itself lives in IndexedDB, not localStorage');
    const tok = JSON.parse(await A.evaluate(() => localStorage.getItem('MOCKSECURE:auth.v2'))).access;
    assert(!JSON.stringify(plain).includes(tok) && !JSON.stringify(plain).includes('refresh'), 'no token in ordinary storage: ' + Object.keys(plain));
    const baby = await babyOf(A), k = await keysOf(A);
    assert(secure.includes('MOCKSECURE:e2ee.keys.' + baby) && secure.some(x => x.startsWith('MOCKSECURE:e2ee.device.')), 'log keys and this phone\'s private key are in the keychain');
    for (const v of [k.keys['1'].main, k.keys['1'].health]) { assert(!JSON.stringify(plain).includes(v), 'log keys are not in ordinary storage'); secrets.push(v); }
  });
  await step('entries sync to the server, stamped with who made them', async () => {
    await A.click('[data-add=feed]'); await A.click('input[value=bottle]'); await A.fill('#ml', '90'); await A.click('#save');
    await A.waitForFunction(() => Sync.st.state === 'ok' && !db.events.some(e => e.updated > db.meta.pushedAt));
    const [e] = await q('select e.*, m.display_name from events e join members m on m.user_id=e.created_by'); assert.equal(e.display_name, 'Mum');
    assert(!JSON.stringify(e).includes('bottle') && !e.blob.includes('"ml"') && e.sensitive === false && e.epoch === 1, 'the server holds only ciphertext: ' + e.blob.slice(0, 30));
    const d = await plainOf(A, e.id); assert.equal(d.entry.type, 'feed'); assert.equal(d.entry.data.ml, 90);
    assert((await q(`select * from activity where action='entry_added'`)).length === 1);
  });

  await step('encryption is bound to its context: moved, flipped or mis-classed ciphertext is rejected', async () => {
    const r = await A.evaluate(async () => {
      const b = db.meta.babyId, kind = x => Object.keys(x)[0];
      const x = await E2EE.encryptEntry(b, { id: 't1', type: 'feed', ts: 1, data: { x: 1 }, note: 'n', updated: 1, by: 'author-1' }), row = { ...x, id: 't1', updated: 1, created_by: 'someone-else' };
      const h = await E2EE.encryptEntry(b, { id: 't3', type: 'health', ts: 1, data: {}, note: '', updated: 1 }), hrow = { ...h, id: 't3', updated: 1 };
      // someone without the health key plants a health-typed entry in the ordinary class
      const cur = E2EE.keysOf(b)[E2EE.epoch(b)], u8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)), iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await crypto.subtle.importKey('raw', u8(cur.main), 'AES-GCM', false, ['encrypt']);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`ll1|entry|${b}|t4|${E2EE.epoch(b)}|m`) }, key, new TextEncoder().encode(JSON.stringify({ type: 'health', ts: 1, end: null, data: {}, note: 'planted' }))));
      const planted = { id: 't4', blob: btoa(String.fromCharCode(...iv, ...ct)), epoch: E2EE.epoch(b), sensitive: false, updated: 1 };
      const okRow = await E2EE.decryptRow(b, row);
      return { ok: kind(okRow), author: okRow.entry && okRow.entry.by, rollback: kind(await E2EE.decryptRow(b, { ...row, updated: 99 })), clamped: kind(await E2EE.decryptRow(b, { ...row, updated: 0 })), moved: kind(await E2EE.decryptRow(b, { ...row, id: 't2' })), flipped: kind(await E2EE.decryptRow(b, { ...row, sensitive: true })), otherEpoch: kind(await E2EE.decryptRow(b, { ...row, epoch: 9 })),
        healthClass: h.sensitive, healthAsMain: kind(await E2EE.decryptRow(b, { ...hrow, sensitive: false })), planted: kind(await E2EE.decryptRow(b, planted)), noBlobText: !JSON.stringify(x).includes('"n"') };
    });
    assert.deepEqual(r, { ok: 'entry', author: 'author-1', rollback: 'bad', clamped: 'entry', moved: 'bad', flipped: 'bad', otherEpoch: 'locked', healthClass: true, healthAsMain: 'bad', planted: 'bad', noBlobText: true });
  });

  // (parts 2+ are appended below)


  // ================= part 2: invites, approval, roles, permissions =================
  const goTab = async (p, t) => { await p.click(`[data-tab=${t}]`); await sleep(50); };
  /** Waits until no request card is on the page (and no sheet is open); on a timeout, says what the page shows instead. */
  const noRequest = async p => { try { await p.waitForFunction(() => $('#sheet').hidden && !document.querySelector('#view [data-approve]')); } catch (e) { throw new Error('still showing: ' + await p.evaluate(() => JSON.stringify({ tab, sheet: $('#sheet').hidden ? null : $('#sheet').textContent.trim().slice(0, 160), requests: Sync.st.requests.map(r => r.email), card: !!document.querySelector('#view [data-approve]') }))); } };
  const openSec = async p => { await p.waitForSelector('details[data-grp=secshare]'); await p.evaluate(() => { document.querySelector('details[data-grp=secshare]').open = true; }); };   // (Security and sharing is a twirl-down)
  const mkInvite = async (p, role, ticks = [], unticks = []) => {
    await goTab(p, 'family'); await openSec(p); await p.waitForSelector('#invCard');
    await p.click(`input[name=invrole][value=${role}]`);
    for (const k of ticks) await p.click(`input[name=invperm][value=${k}]:not(:checked)`);
    for (const k of unticks) await p.click(`input[name=invperm][value=${k}]:checked`);
    const before = await p.evaluate(() => (document.querySelector('.invite .code') || {}).textContent || '');
    await p.click('#mkInvite'); await p.waitForFunction(b => { const c = document.querySelector('.invite .code'); return c && c.textContent !== b; }, before);
    return (await p.textContent('.invite .code')).trim();
  };
  const pendingFor = async (email) => (await q(`select * from join_requests where email=$1 and status='pending'`, [email]));
  let inviteB, feedId;
  await step('role buttons load sensible defaults and lock what a role may never have', async () => {
    await goTab(A, 'family'); await openSec(A); await A.waitForSelector('#invCard');
    const st = sel => A.evaluate(s => { const e = document.querySelector(s); return { checked: e.checked, disabled: e.disabled }; }, sel);
    await A.click('input[name=invrole][value=family]');
    assert.deepEqual(await st('input[name=invperm][value=edit_others]'), { checked: false, disabled: true }, 'family can never edit others\' entries');
    assert.deepEqual(await st('input[name=invperm][value=edit_profile]'), { checked: false, disabled: true });
    assert.deepEqual(await st('input[name=invperm][value=view_people]'), { checked: true, disabled: false });
    await A.click('input[name=invrole][value=parent]');
    assert.deepEqual(await st('input[name=invperm][value=delete_others]'), { checked: true, disabled: true });
    await A.click('input[name=invrole][value=babysitter]');
    assert.deepEqual(await st('input[name=invperm][value=edit_others]'), { checked: false, disabled: false }, 'babysitter: all configurable');
    assert.deepEqual(await st('input[name=invperm][value=view_people]'), { checked: false, disabled: false });
  });
  await step('a parent creates a family-member invite; the QR code carries the app link', async () => {
    inviteB = await mkInvite(A, 'family');
    const [inv] = await q('select * from invites where code=$1', [inviteB]); assert.equal(inv.role, 'family'); assert.equal(Math.round((new Date(inv.expires_at) - new Date(inv.created_at)) / 60000), 120);
    const decoded = await A.evaluate(async () => {
      const xml = new XMLSerializer().serializeToString(document.querySelector('.invite .qr svg')), img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 400); x.drawImage(img, 0, 0, 400, 400);
      const d = x.getImageData(0, 0, 400, 400); const r = jsQR(d.data, 400, 400); return r && r.data; });
    const m = /^app\.littlelog\.newborn:\/\/join\?join=([A-Z0-9]{10})&s=([A-Za-z0-9_-]{22})$/.exec(decoded); assert(m && m[1] === inviteB, 'QR carries code and secret: ' + decoded); secrets.push(m[2]);
    assert.equal(await A.evaluate(c => E2EE.inviteSecret(c), inviteB), m[2], 'the parent keeps the secret in the keychain');
  });

  const B = await device(); let fpB = '';
  await step('someone who redeems an invite only sends a request – they see nothing until approved', async () => {
    await B.waitForSelector('#lEmail'); await signIn(B, 'dad@x.com'); await B.waitForSelector('#oJoin');
    await B.fill('#oMine', 'Dad'); await B.fill('#oCode', inviteB); await B.click('#oJoin');
    await B.waitForSelector('#wCheck'); assert(/Waiting for approval/.test(await B.textContent('#view')));
    fpB = (await B.textContent('#view .code')).trim(); assert(/^(\d{5} ){5}\d{5}$/.test(fpB), 'phone security code: ' + fpB);
    assert.equal((await pendingFor('dad@x.com')).length, 1);
    assert.equal((await q(`select count(*)::int c from members where email='dad@x.com'`))[0].c, 0);
  });
  await step('the parent sees the request (badge + list) and approves it', async () => {
    await A.evaluate(() => { tab = 'day'; render(); }); await syncNow(A);   // (not a click: the request may already have popped up)
    await A.waitForSelector('#sheet:not([hidden]) [data-approve]'); assert(/Someone wants to join/.test(await A.textContent('#sheet')) && /dad@x.com/.test(await A.textContent('#sheet')), 'the request pops up on the parent\'s phone as it arrives');
    await A.click('#sheet [data-close]'); await A.waitForFunction(() => $('#sheet').hidden, null, { timeout: 5000 });
    await syncNow(A); await sleep(100); assert(await A.evaluate(() => $('#sheet').hidden), 'put off with Later, it does not pop up again while the app runs');
    assert.equal(await A.evaluate(() => document.querySelector('#famBadge').textContent), '1'); assert(await A.isVisible('#famBadge'));
    await goTab(A, 'family'); await A.waitForSelector('[data-approve]'); assert(/dad@x.com/.test(await A.textContent('#view')));
    assert(/did not use your QR code/.test(await A.textContent('#view')), 'typed code: manual comparison required');
    assert.equal((await A.textContent('#view .code.mono')).trim(), fpB, 'the parent sees the same security code the joiner sees');
    await A.click('[data-approve]'); assert(/Compare the security code/.test(await toastText(A)), 'cannot approve without comparing'); assert.equal((await q(`select count(*)::int c from members where email='dad@x.com'`))[0].c, 0);
    await A.click('input[name=vchk]'); await A.click('[data-approve]'); await noRequest(A);
    const g = (await q(`select g.auth, g.tag from key_grants g join devices d on 'd:'||d.id::text = g.grantee join auth.users u on u.id = d.user_id where u.email='dad@x.com'`))[0];
    assert.equal(g.auth, null, 'no QR, so no QR proof on this grant'); assert(g.tag, 'but it carries the key holder\'s MAC');
    const [m] = await q(`select role, display_name from members where email='dad@x.com'`); assert.deepEqual([m.role, m.display_name], ['family', 'Dad']);
    await B.click('#wCheck'); await B.waitForSelector('#tabs'); assert.equal(await B.evaluate(() => db.meta.role), 'family');
  });
  await step('family member: sees the log with names; can change only their own entries; no settings', async () => {
    await goTab(B, 'day'); await syncNow(B); assert(/added by Mum/.test(await B.textContent('#view')), 'shows who added it: ' + (await B.textContent('#view')).slice(0, 300));
    await openEntry(B, ''); assert(/can't change entries added by Mum/.test(await toastText(B)));
    assert(!(await B.isVisible('#sheet')), 'no editor opens for someone else\'s entry');
    await B.click('[data-add=diaper]'); await B.click('input[name=poo]'); await B.click('#save');
    await B.waitForFunction(() => Sync.st.state === 'ok' && !db.events.some(e => e.updated > db.meta.pushedAt));
    await openEntry(B, ':has-text("Pee")'); await B.waitForSelector('#del'); await B.fill('#note', 'wet'); await B.click('#save'); await sleep(100);
    await goTab(B, 'more'); assert(await B.$eval('[data-kn]', e => e.disabled), 'baby profile is read-only for family');
    assert(!(await B.$('#wipe')), 'no "delete all entries"');
    await goTab(B, 'family'); await B.waitForSelector('#syncNow');
    assert(!(await B.$('#invCard')) && !(await B.$('#actBtn')), 'no invites and no activity log for non-parents');
    assert(/Mum/.test(await B.textContent('#view')) && /mum@x.com/.test(await B.textContent('#view')), 'family can see who has access');
    assert(await B.isVisible('#unvOk'), 'joined without a QR code: asked to compare the log security code');
    const codeB = (await B.textContent('#view .card.alert .code')).trim(), codeA = await A.evaluate(() => Sync.securityCode());
    assert.equal(codeB, codeA, 'same log security code on both phones'); await B.click('#unvOk'); assert.equal(await B.evaluate(() => !!db.meta.unverified), false);
  });
  await step('a modified phone cannot get around the rules: the server refuses, the app restores the original', async () => {
    feedId = await idOfType(B, 'feed');
    await B.evaluate(() => { const e = db.events.find(x => x.type === 'feed'); e.data.ml = 999; e.updated = Date.now(); save(true); });
    await syncNow(B);
    { const ml = await B.evaluate(() => db.events.find(x => x.type === 'feed').data.ml); assert.equal(ml, 90, 'restored to the server version, local has ' + ml + ' denied=' + await B.evaluate(() => Sync.st.denied + ' ' + Sync.st.err)); }
    assert.equal((await plainOf(A, feedId)).entry.data.ml, 90, 'server copy unchanged');
    assert.equal(await B.evaluate(() => Sync.st.denied), 1);
    await B.evaluate(() => { removeEvent(db.events.find(x => x.type === 'feed')); save(true); }); await syncNow(B);
    assert.equal(await B.evaluate(() => db.events.filter(x => x.type === 'feed').length), 1, 'deleted entry came back');
    assert.equal((await rowOf(feedId)).deleted, false);
    await B.evaluate(() => { db.events.push({ id: 'forged1', type: 'feed', ts: Date.now(), data: { x: 'y'.repeat(7000) }, note: '', updated: Date.now(), by: Auth.id }); save(true); }); await syncNow(B);
    assert.equal(await B.evaluate(() => db.events.some(x => x.id === 'forged1')), false, 'oversized entry refused and dropped');
  });

  await step('the server (or anyone with database access) cannot rearrange ciphertext: swapped entries are rejected by the phones', async () => {
    const ids = (await q(`select id from events where deleted=false and id not like 'forged%' order by id limit 2`)).map(r => r.id); assert.equal(ids.length, 2);
    const before = await A.evaluate(ids => ids.map(i => JSON.stringify(db.events.find(e => e.id === i))), ids), bad0 = await A.evaluate(() => Sync.st.bad);
    const [r1, r2] = [await rowOf(ids[0]), await rowOf(ids[1])];
    await su.query(`update events set blob=$2, synced_at=clock_timestamp() where id=$1`, [ids[0], r2.blob]); await su.query(`update events set blob=$2, synced_at=clock_timestamp() where id=$1`, [ids[1], r1.blob]);
    await syncNow(A); assert((await A.evaluate(() => Sync.st.bad)) >= bad0 + 2, 'both swapped rows failed authentication');
    assert.deepEqual(await A.evaluate(ids => ids.map(i => JSON.stringify(db.events.find(e => e.id === i))), ids), before, 'local entries were not overwritten');
    await su.query(`update events set blob=$2, synced_at=clock_timestamp() where id=$1`, [ids[0], r1.blob]); await su.query(`update events set blob=$2, synced_at=clock_timestamp() where id=$1`, [ids[1], r2.blob]); await syncNow(A);
  });

  // second browser with a fake camera that shows the next invite QR
  let inviteC, C, b2;
  await step('a caregiver invite with custom check boxes, scanned with the in-app camera', async () => {
    inviteC = await mkInvite(A, 'caregiver', ['edit_others'], ['delete_own']);
    const [inv] = await q('select perms from invites where code=$1', [inviteC]);
    assert.equal(inv.perms.edit_others, true); assert.equal(inv.perms.delete_own, false); assert.equal(inv.perms.view_people, false);
    await A.evaluate(() => { document.querySelector('#tabs').style.display = 'none'; document.querySelector('#toast').hidden = true; document.querySelector('.invite .qr').scrollIntoView(); });
    await (await A.$('.invite .qr')).screenshot({ path: path.join(tmp, 'qr.png') });
    execSync(`ffmpeg -y -loglevel error -loop 1 -i ${tmp}/qr.png -vf "scale=400:400,pad=640:480:120:40:white,format=yuv420p" -t 3 -r 10 ${tmp}/cam.y4m`);
    await A.evaluate(() => { document.querySelector('#tabs').style.display = ''; });
    b2 = await chromium.launch({ ...(EXE ? { executablePath: EXE } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + tmp + '/cam.y4m'] });
    C = await device({ br: b2 }); await signIn(C, 'nan@x.com'); await C.waitForSelector('#oScan');
    await C.fill('#oMine', 'Nan'); await C.click('#oScan'); await C.waitForSelector('#wCheck', { timeout: 20000 });
    assert.equal((await pendingFor('nan@x.com')).length, 1); assert.equal((await q('select used_by from invites where code=$1', [inviteC]))[0].used_by !== null, true, 'invite is single-use');
    await syncNow(A); await A.waitForSelector('#sheet:not([hidden]) [data-approve]');   // (the request pops up on the parent's phone; approved from there)
    assert(/Verified: they scanned your QR code/.test(await A.textContent('#sheet')) && !(await A.$('input[name=vchk]')), 'QR proof checked automatically: nothing to compare');
    await A.click('#sheet [data-approve]'); await noRequest(A);
    await C.click('#wCheck'); await C.waitForSelector('#tabs');
    assert.equal(await C.evaluate(() => !!db.meta.unverified), false, 'the grant carried the parent\'s QR proof, so no manual check is needed');
    assert((await q(`select g.auth from key_grants g join devices d on 'd:'||d.id::text = g.grantee join auth.users u on u.id=d.user_id where u.email='nan@x.com'`))[0].auth, 'grant is authenticated with the QR secret');
    const [m] = await q(`select perms from members where email='nan@x.com'`); assert.equal(m.perms.edit_others, true); assert.equal(m.perms.delete_own, false);
  });
  await step('the check boxes really take effect: this caregiver can edit others\' entries but not delete their own', async () => {
    await syncNow(C); await openEntry(C, ':has-text("Bottle")'); await C.waitForSelector('#save'); assert(!(await C.$('#del')), 'no delete button: delete_own is off'); await C.fill('#note', 'nan was here'); await C.click('#save');
    await C.waitForFunction(() => Sync.st.state === 'ok' && !db.events.some(e => e.updated > db.meta.pushedAt));
    assert.equal((await plainOf(A, feedId)).entry.note, 'nan was here');
    await C.click('[data-add=wake]'); await C.click('#save'); await C.waitForFunction(() => !db.events.some(e => e.updated > db.meta.pushedAt));
    const wakeId = await idOfType(C, 'wake'); await C.evaluate(() => { removeEvent(db.events.find(x => x.type === 'wake')); save(true); }); await syncNow(C);
    assert.equal((await rowOf(wakeId)).deleted, false, 'server refused the delete');
    await goTab(C, 'family'); await C.waitForSelector('#syncNow'); assert(!/mum@x.com/.test(await C.textContent('#view')), 'no emails without the "see who has access" permission');
    assert(/Mum/.test(await C.textContent('#view')), 'but names are visible');
  });
  await step('a parent can change someone\'s access later; health notes disappear when that permission is removed', async () => {
    await goTab(A, 'day'); await A.click('[data-add=health]'); await A.click('input[value="Rash"]'); await A.click('#save'); await A.waitForFunction(() => !db.events.some(e => e.updated > db.meta.pushedAt));
    await goTab(C, 'day'); await syncNow(C); assert(await C.isVisible('[data-add=health]'), 'health button visible while permitted'); assert(await C.evaluate(() => db.events.some(e => e.type === 'health')));
    await goTab(A, 'family'); await A.waitForSelector('#helpers [data-person]'); await A.evaluate(() => Sync.loadPeople());
    const nanId = (await q(`select user_id from members where email='nan@x.com'`))[0].user_id;
    await A.click(`[data-person="${nanId}"]`); await A.waitForSelector('#pSave');
    await A.click('input[name=pperm][value=view_health]:checked'); await A.click('#pSave'); await A.waitForFunction(() => document.querySelector('#sheet').hidden);
    await goTab(C, 'day'); await syncNow(C);
    assert(await C.isVisible('[data-add=feed]') && !(await C.$('[data-add=health]')), 'other buttons remain, health button gone'); assert.equal(await C.evaluate(() => db.events.some(e => e.type === 'health' || e.type === 'med')), false, 'local health entries purged');
    assert.equal((await q(`select perms from members where email='nan@x.com'`))[0].perms.view_health, false);
    // losing health access changes the keys: a parent's phone does it on its next sync
    assert.equal((await q('select rotate_needed from babies'))[0].rotate_needed, true); const ep0 = await epochOnServer();
    await syncNow(A); assert.equal(await epochOnServer(), ep0 + 1, 'keys rotated'); assert.equal((await q('select rotate_needed from babies'))[0].rotate_needed, false);
    await syncNow(C); assert.equal(await C.evaluate(() => E2EE.epoch(db.meta.babyId)), ep0 + 1, 'Nan\'s phone moved to the new epoch');
    assert.equal(await C.evaluate(() => { const k = E2EE.keysOf(db.meta.babyId); return !!k[E2EE.epoch(db.meta.babyId)].health; }), false, 'and got no health key');
    await goTab(A, 'day'); await A.click('[data-add=feed]'); await A.click('input[value=bottle]'); await A.fill('#ml', '60'); await A.click('#save'); await A.waitForFunction(() => !db.events.some(e => e.updated > db.meta.pushedAt));
    await syncNow(C); assert(await C.evaluate(() => db.events.some(e => e.data && e.data.ml === 60)), 'new entries (new key) are readable by people who still have access');
    assert((await q('select count(*)::int c from events where epoch=$1', [ep0 + 1]))[0].c >= 1, 'new entries use the new epoch');
  });
  await step('giving health access back hands the phone the health key; a health key the server made up is refused', async () => {
    const nanId = (await q(`select user_id from members where email='nan@x.com'`))[0].user_id, baby = await babyOf(C), ep = await epochOnServer();
    await goTab(A, 'family'); await A.waitForSelector(`[data-person="${nanId}"]`); await A.click(`[data-person="${nanId}"]`); await A.waitForSelector('#pSave');
    await A.click('input[name=pperm][value=view_health]:not(:checked)'); await A.click('#pSave'); await A.waitForFunction(() => document.querySelector('#sheet').hidden);
    const grantee = (await q(`select 'd:'||d.id::text g from devices d join auth.users u on u.id=d.user_id where u.email='nan@x.com'`))[0].g;
    const real = (await q('select wrap_health from key_grants where baby_id=$1 and grantee=$2', [baby, grantee]))[0].wrap_health; assert(real, 'the parent\'s phone wrapped the health key for Nan\'s phone');
    // before Nan's phone fetches it, the server swaps in a health key of its own
    const forged = await C.evaluate(async ([b, e, g]) => {
      const u8 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0)), cur = E2EE.keysOf(b)[e], r = crypto.getRandomValues(new Uint8Array(32));
      return (await E2EE.makeGrant(b, e, { main: u8(cur.main), health: r }, g, E2EE.device.pub, { health: true })).wrap_health;
    }, [baby, ep, grantee]);
    await su.query('update key_grants set wrap_health=$3 where baby_id=$1 and grantee=$2', [baby, grantee, forged]);
    await goTab(C, 'day'); await syncNow(C);
    assert.match(await C.evaluate(() => Sync.st.err), /health key sent to this phone did not check out/); assert.equal(await C.evaluate(b => E2EE.hasHealthKey(b), baby), false, 'the made-up health key was not accepted');
    await su.query('update key_grants set wrap_health=$3 where baby_id=$1 and grantee=$2', [baby, grantee, real]);   // the genuine one
    await syncNow(C); assert.equal(await C.evaluate(() => Sync.st.state), 'ok'); assert.equal(await C.evaluate(b => E2EE.hasHealthKey(b), baby), true, 'the real health key was fetched');
    assert(await C.isVisible('[data-add=health]') && await C.evaluate(() => db.events.some(e => e.type === 'health')), 'and Nan can see and add health notes again');
  });
  await step('invites can be rescinded, and a rescinded code no longer works', async () => {
    const code = await mkInvite(A, 'friend');
    await A.click(`[data-rescind="${code}"]`); await A.waitForFunction(c => !document.querySelector(`[data-rescind="${c}"]`), code);
    assert.equal((await q('select count(*)::int c from invites where code=$1', [code]))[0].c, 0);
    const r = await C.evaluate(c => Auth.rpc('redeem_invite', { p_code: c }), code); assert.equal(r.status, 'invalid');
  });
  await step('a parent can rename anyone in the log, as the family sees them here: the list, their own name field and the activity log follow; an empty name is refused', async () => {
    const nanId = (await q(`select user_id from members where email='nan@x.com'`))[0].user_id;
    await goTab(A, 'family'); await A.click(`[data-person="${nanId}"]`); await A.waitForSelector('#pName'); assert.equal(await A.inputValue('#pName'), 'Nan');
    await A.fill('#pName', '  Nana  '); await A.click('#pSave'); await A.waitForFunction(() => document.querySelector('#sheet').hidden);
    assert(/Nana/.test(await A.textContent(`[data-pview="${nanId}"]`)), 'the list shows the new name');
    await syncNow(C); await C.evaluate(() => Sync.loadPeople()); await goTab(C, 'more'); assert.equal(await C.$eval('#myName', i => i.value), 'Nana', "Nan's own name field (More → Account) shows it");
    await A.click(`[data-person="${nanId}"]`); await A.waitForSelector('#pName'); await A.fill('#pName', '   '); await A.click('#pSave');
    await A.waitForFunction(() => /Enter a name/.test(document.querySelector('#toast').textContent)); assert.equal(await A.evaluate(() => document.querySelector('#sheet').hidden), false, 'the sheet stays open');
    await A.fill('#pName', 'Nan'); await A.click('#pSave'); await A.waitForFunction(() => document.querySelector('#sheet').hidden);
  });
  await step('a project that runs an older schema.sql than the app: Rename says in plain words that supabase/upgrade.sql is due (not PostgREST\'s "schema cache"), a parent sees the notice on the Family tab and under App updates (a caregiver does not), it names the version when the project has one, and running upgrade.sql clears it', async () => {
    const nanId = (await q(`select user_id from members where email='nan@x.com'`))[0].user_id;
    await q('drop function rename_member(uuid, uuid, text)'); await q('drop function schema_version()');
    await A.evaluate(() => Sync.checkServer(true)); assert.deepEqual(await A.evaluate(() => Sync.st.server), { have: '', behind: true }, 'no schema_version(): a project from before 1.21.0');
    await goTab(A, 'family'); await A.waitForSelector('.servernote');
    assert(await A.evaluate(() => document.querySelector('.servernote').textContent.includes('from before ' + Sync.SCHEMA)), 'the notice says the project is from before the version the app needs');
    await A.click(`[data-person="${nanId}"]`); await A.waitForSelector('#pName'); await A.fill('#pName', 'Nanny'); await A.click('#pSave');
    await A.waitForFunction(() => /supabase\/upgrade\.sql/.test(document.querySelector('#toast').textContent));
    const said = await A.textContent('#toast'); assert(/missing rename_member/.test(said) && !/schema cache/.test(said), 'plain words, naming the function: ' + said);
    assert.equal(await A.evaluate(() => document.querySelector('#sheet').hidden), false, 'the sheet stays open'); await A.click('#pCancel');
    await goTab(A, 'more'); assert(await A.$('#appCard + .servernote'), 'the notice is under App updates too');
    await C.evaluate(() => Sync.checkServer(true)); await goTab(C, 'family'); await sleep(100); assert(!(await C.$('.servernote')), 'a caregiver is not told (nothing they can do)');
    await q(`create function schema_version() returns text language sql immutable as $$ select '1.16.0' $$`); await q('grant execute on function schema_version() to authenticated');
    await A.evaluate(() => Sync.checkServer(true)); await goTab(A, 'family'); await A.waitForSelector('.servernote');
    assert(await A.evaluate(() => document.querySelector('.servernote').textContent.includes('version 1.16.0; this app needs ' + Sync.SCHEMA)), 'with a schema_version(), the notice names it');
    await su.query(fs.readFileSync(path.join(root, 'supabase', 'upgrade.sql'), 'utf8'));   // what the person who set up the project does
    await A.evaluate(() => Sync.checkServer(true)); assert.equal(await A.evaluate(() => Sync.st.server.behind), false);
    await goTab(A, 'family'); await sleep(100); assert(!(await A.$('.servernote')), 'the notice is gone');
    await A.click(`[data-person="${nanId}"]`); await A.waitForSelector('#pName'); await A.fill('#pName', 'Nanny'); await A.click('#pSave'); await A.waitForFunction(() => document.querySelector('#sheet').hidden);
    assert(/Nanny/.test(await A.textContent(`[data-pview="${nanId}"]`)), 'and Rename works');
    await A.click(`[data-person="${nanId}"]`); await A.waitForSelector('#pName'); await A.fill('#pName', 'Nan'); await A.click('#pSave'); await A.waitForFunction(() => document.querySelector('#sheet').hidden);
  });
  await step('the activity log shows who did what – to parents only', async () => {
    await goTab(A, 'family'); await openSec(A); await A.click('#actBtn'); await A.waitForFunction(() => /Dad added an entry/.test(document.querySelector('#actList').textContent));
    const t = await A.textContent('#actList');
    for (const s of ['Mum created the log', 'Dad added an entry', 'Mum added a private (health) entry', 'Mum approved dad@x.com as Family member', 'Nan edited an entry added by Mum', 'changed what Nan can do', 'Mum renamed Nan to Nana', 'rescinded a Friend invite']) assert(t.includes(s), 'missing: ' + s + '\n' + t.slice(0, 600));
    assert(!t.includes('nan was here') && !t.includes('Rash') && t.includes('changed the encryption keys'), 'entry contents are not in the log; key changes are');
    await A.click('#actClose');
  });
  await step('removing a person cuts them off immediately and clears their phone', async () => {
    const nanId = (await q(`select user_id from members where email='nan@x.com'`))[0].user_id, nanKeys = await keysOf(C), babyId = await babyOf(C), ep0 = await epochOnServer();
    await goTab(A, 'family'); await A.click(`[data-person="${nanId}"]`); await A.waitForSelector('#pRemove'); await A.click('#pRemove'); await A.waitForFunction(() => document.querySelector('#sheet').hidden);
    assert.equal((await q('select rotate_needed from babies'))[0].rotate_needed, true, 'removal asks for new keys');
    for (let i = 0; i < 20 && await epochOnServer() !== ep0 + 1; i++) { await syncNow(A); await A.waitForTimeout(250); }   // (on a slow machine the sync the removal itself started may still be running)
    assert.equal(await epochOnServer(), ep0 + 1, 'the keys were changed right after the removal');
    await syncNow(C); await C.waitForSelector('#oCreate'); assert.equal(await C.evaluate(() => db.events.length), 0);
    await goTab(A, 'day'); await A.click('[data-add=diaper]'); await A.click('input[name=poo]'); await A.fill('#note', 'after nan left'); await A.click('#save'); await A.waitForFunction(() => !db.events.some(e => e.updated > db.meta.pushedAt));
    const fresh = (await q('select * from events where epoch=$1 order by synced_at desc limit 1', [ep0 + 1]))[0];
    const withOld = await A.evaluate(([b, row, keys]) => E2EE.decryptWith(keys, b, row).then(x => Object.keys(x)[0]), [babyId, fresh, nanKeys.keys]);
    const withNew = await A.evaluate(([b, row]) => E2EE.decryptRow(b, row).then(x => Object.keys(x)[0]), [babyId, fresh]);
    assert.equal(withOld, 'locked', 'the removed person\'s old keys cannot open anything written after the change'); assert.equal(withNew, 'entry');
    await C.context().close(); await b2.close();
  });



  await step('a forged key change is refused: keys the server makes up are not accepted by phones that hold the real ones', async () => {
    await syncNow(B);   // Dad's phone catches up with the earlier key changes first
    const baby = await babyOf(B), ep = await epochOnServer(), devId = await B.evaluate(() => E2EE.device.id), grantee = 'd:' + devId;
    assert.equal(await B.evaluate(b => E2EE.epoch(b), baby), ep, 'Dad\'s phone is on the current epoch');
    const orig = (await q('select * from key_grants where baby_id=$1 and grantee=$2', [baby, grantee]))[0]; assert(orig, 'Dad\'s phone has a grant');
    // the server (attacker) wraps keys of its own choosing to Dad's phone's public key and announces a new epoch, without anyone's signature
    const forged = await B.evaluate(async ([b, e, d]) => { const rnd = () => crypto.getRandomValues(new Uint8Array(32)); return E2EE.makeGrant(b, e + 1, { main: rnd(), health: rnd() }, 'd:' + d, E2EE.device.pub, { health: true }); }, [baby, ep, devId]);
    await su.query('update babies set epoch=$2 where id=$1', [baby, ep + 1]); await su.query('delete from key_grants where baby_id=$1 and grantee=$2', [baby, grantee]);
    await su.query('insert into key_grants(baby_id,grantee,epoch,wrap_main,wrap_health,auth,tag) values ($1,$2,$3,$4,$5,null,$6)', [baby, grantee, ep + 1, forged.wrap_main, forged.wrap_health, forged.tag]);
    try {
      await syncNow(B);
      assert.match(await B.evaluate(() => Sync.st.err), /not signed by anyone who held the previous keys/); assert.equal(await B.evaluate(b => E2EE.epoch(b), baby), ep, 'the phone did not adopt the made-up keys');
      assert.notEqual(await B.evaluate(() => Sync.st.state), 'ok');
    } finally {   // put the real state back
      await su.query('delete from key_grants where baby_id=$1 and grantee=$2', [baby, grantee]); await su.query('update babies set epoch=$2 where id=$1', [baby, ep]);
      await su.query('insert into key_grants(baby_id,grantee,epoch,wrap_main,wrap_health,auth,tag,granted_by) values ($1,$2,$3,$4,$5,$6,$7,$8)', [baby, grantee, ep, orig.wrap_main, orig.wrap_health, orig.auth, orig.tag, orig.granted_by]);
    }
    await syncNow(B); assert.equal(await B.evaluate(() => Sync.st.state), 'ok');
  });
  await step('a QR joiner refuses keys that arrive without the inviting parent\'s proof (a stripped proof is as bad as a wrong one)', async () => {
    await goTab(A, 'family'); const code = await mkInvite(A, 'friend'), secret = await A.evaluate(c => E2EE.inviteSecret(c), code); secrets.push(secret);
    const E = await device({ launchUrl: `app.littlelog.newborn://join?join=${code}&s=${secret}` });   // opened from the link: the secret rides along
    await signIn(E, 'eve@x.com'); await E.waitForSelector('#wCheck');
    await E.evaluate(() => { Sync.heldCheck = Sync.checkApproval; Sync.checkApproval = async () => false; });   // (the waiting screen polls every 8 s: it must not pick the keys up before the server strips the proof)
    await A.evaluate(() => { tab = 'day'; render(); }); await syncNow(A);   // (not a click: the request may already have popped up)
    await A.waitForSelector('#sheet:not([hidden]) [data-approve]'); assert(/Verified: they scanned your QR code/.test(await A.textContent('#sheet'))); await A.click('#sheet [data-approve]'); await noRequest(A);
    await su.query(`update key_grants set auth=null where grantee in (select 'd:'||d.id::text from devices d join auth.users u on u.id=d.user_id where u.email='eve@x.com')`);   // the server strips the proof
    await E.evaluate(() => { Sync.checkApproval = Sync.heldCheck; });
    await E.click('#wCheck'); await E.waitForFunction(() => /did not come from the parent who invited you/.test((Sync.st.err || '') + document.body.textContent), null, { timeout: 15000 });
    assert.equal(await E.evaluate(() => E2EE.hasKeys(db.meta.babyId)), false, 'no keys were accepted');
    const eve = (await q(`select user_id from members where email='eve@x.com'`))[0].user_id; await A.evaluate(u => Sync.removeMember(u), eve); await syncNow(A);   // tidy up
    await E.context().close();
  });

  // ================= part 3: two-step on a new phone, app lock, backups, deletion, sign out everywhere =================
  let A2;
  await step('a parent signing in on a new phone must pass two-step verification before seeing anything', async () => {
    A2 = await device(); await signIn(A2, 'mum@x.com'); await A2.waitForSelector('#mCode');
    assert(!(await A2.isVisible('#tabs'))); assert.equal(await A2.evaluate(() => db.events.length), 0, 'nothing downloaded yet');
    await A2.fill('#mCode', '000000'); await A2.click('#mGo'); await A2.waitForFunction(() => /not right/.test(document.body.textContent));
    await A2.fill('#mCode', totp(mumSecret)); await A2.click('#mGo'); await A2.waitForSelector('#aCheck');
    assert(!(await A2.isVisible('#tabs')) && /doesn't have its encryption keys/.test(await A2.textContent('#view')), 'signed in and verified, but this phone has no keys yet');
    assert.equal(await A2.evaluate(() => db.events.length), 0); const fpA2 = (await A2.textContent('#view .code')).trim(); assert(/^(\d{5} ){5}\d{5}$/.test(fpA2));
    await goTab(A, 'family'); await syncNow(A); await A.waitForSelector('[data-approvephone]'); assert.equal((await A.textContent('.card:has([data-approvephone]) .code')).trim(), fpA2, 'the approving phone shows the same code');
    await A.click('[data-approvephone]'); assert(/Compare the security code/.test(await toastText(A)), 'cannot approve without comparing');
    await A.click('input[name=vchkp]'); await A.click('[data-approvephone]'); await A.waitForFunction(() => !document.querySelector('[data-approvephone]'));
    await A2.click('#aCheck'); await A2.waitForSelector('#tabs'); await syncNow(A2);
    assert((await A2.evaluate(() => db.events.length)) >= 3, 'entries decrypted on the new phone'); assert.equal(await A2.evaluate(() => db.baby.name), 'Leo', 'and the baby\'s name');
    assert.equal(await A2.evaluate(() => window.__bio.prompts), 0, 'no Face ID prompt right after signing in');
  });
  await step('a parent session without two-step verification gets no data even if the app is bypassed', async () => {
    const r = await A2.evaluate(async () => {   // a raw aal1 session for the same user, straight against the API
      await Auth.sendCode('mum@x.com', 'captcha-ok'); const o = await fetch('https://fake.supabase.co/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'email', email: 'mum@x.com', token: '12345678' }) }).then(r => r.json());
      const h = { apikey: 'anon', Authorization: 'Bearer ' + o.access_token, 'Content-Type': 'application/json' };
      const ev = await fetch('https://fake.supabase.co/rest/v1/events?select=*', { headers: h }).then(r => r.json());
      const push = await fetch('https://fake.supabase.co/rest/v1/rpc/push_events', { method: 'POST', headers: h, body: JSON.stringify({ p_baby: db.meta.babyId, p_rows: [] }) }).then(r => r.json());
      const grant = await fetch('https://fake.supabase.co/rest/v1/rpc/my_grant', { method: 'POST', headers: h, body: JSON.stringify({ p_baby: db.meta.babyId, p_device: E2EE.device.id }) }).then(r => r.json());
      const rec = await fetch('https://fake.supabase.co/rest/v1/rpc/get_recovery', { method: 'POST', headers: h, body: JSON.stringify({ p_baby: db.meta.babyId }) }).then(r => r.json());
      return { ev, msg: push.message, grant: grant.message, rec: rec.message };
    });
    assert.deepEqual(r.ev, []); assert(/no access/.test(r.msg), r.msg); assert(/no access/.test(r.grant) && /no access/.test(r.rec), 'no keys, no recovery material either');
  });
  await step('non-parents can optionally turn two-step verification on and off', async () => {
    await goTab(B, 'more'); await B.click('#mfaOn'); await B.waitForSelector('#eGo'); assert(await B.isVisible('#eCancel'), 'optional for non-parents');
    const sec = await secretOf(B); await B.fill('#eCode', '111111'); await B.click('#eGo'); await B.waitForFunction(() => /not right/.test(document.body.textContent));
    await enterTotp(B, sec); await B.waitForSelector('#tabs'); await goTab(B, 'more'); assert(/On/.test(await B.textContent('#view')) && await B.isVisible('#mfaOff'));
    assert.equal(await B.evaluate(() => Auth.aal), 'aal2');
    await B.click('#mfaOff'); await B.waitForFunction(() => /Off/.test(document.body.textContent) && document.querySelector('#mfaOn'));
    assert.equal((await q(`select count(*)::int c from auth.mfa_factors f join auth.users u on u.id=f.user_id where u.email='dad@x.com'`))[0].c, 0);
  });
  await step('parents cannot turn two-step verification off', async () => {
    await goTab(A2, 'more'); assert(!(await A2.$('#mfaOff')) && /required for parents/.test(await A2.textContent('#view')));
  });

  await step('app lock: on by default, locks on a cold start, stays locked if Face ID fails, unlocks when it succeeds', async () => {
    assert.equal(JSON.parse(await A.evaluate(() => localStorage.getItem('ll.lock'))).mode, 'bio', 'the phone\'s own lock, by default');
    await A.evaluate(() => localStorage.setItem('MOCK_BIO_FAIL', '1')); await A.reload();
    await A.waitForSelector('#unlock'); await sleep(500); assert(await A.isVisible('#unlock'), 'still locked after a failed prompt'); assert(!(await A.isVisible('#tabs')));
    assert(/Locked/.test(await A.textContent('#view')) && (await A.textContent('#view')).split('Little Log').length <= 2, 'says Locked, and names the app at most once');
    await A.evaluate(() => localStorage.removeItem('MOCK_BIO_FAIL')); await A.click('#unlock'); await A.waitForSelector('#tabs');
    assert.equal(await A.textContent('#title'), "Leo's Log");
    const words = await A.evaluate(() => window.__bio.last);   // the phone's prompt: a title, and one warm line that names the app once (not the name twice and Unlock twice)
    assert.equal(words.androidTitle, "Just checking it's you"); assert.equal(words.androidSubtitle, undefined, 'no subtitle repeating the title');
    assert(/Little Log's little log/.test(words.reason) && words.reason.split('Little Log').length === 2, 'one line, the app named once: ' + words.reason);
  });
  await step('app lock: the screen is covered in the app switcher, and re-locks after the chosen time away', async () => {
    await A.evaluate(() => window.__emit('appStateChange', { isActive: false })); assert(await A.isVisible('#cover'), 'cover shown while in background');
    await A.evaluate(() => window.__emit('appStateChange', { isActive: true })); assert(!(await A.isVisible('#cover'))); assert.equal(await A.evaluate(() => Lock.locked), false, 'back within a minute: still unlocked');
    await goTab(A, 'more'); await A.selectOption('#lockMin', '0');
    await A.evaluate(() => { window.__bio.ok = false; window.__emit('appStateChange', { isActive: false }); window.__emit('appStateChange', { isActive: true }); });
    await A.waitForSelector('#unlock'); assert.equal(await A.evaluate(() => Lock.locked), true, 'locked immediately when set to "Immediately"');
    await A.evaluate(() => { window.__bio.ok = true; }); await A.click('#unlock'); await A.waitForSelector('#tabs');
  });
  await step('app lock with a PIN: 4 to 8 digits typed twice in More, kept only as a salted hash in secure storage, asked for on a cold start, wrong PINs refused and slowed down after five, Face ID still offered, and the PIN needed to turn the lock off', async () => {
    const tap = async (digits, pad = '#sheet') => { for (const d of digits) await A.click(`${pad} .pk[data-k="${d}"]`); };
    await goTab(A, 'more'); await A.click('[name=lockMode][value=pin]'); await A.waitForSelector('#pinPad');
    await tap('123'); await A.click('#sheet .pk[data-k=ok]'); assert(/4 to 8 digits/.test(await A.textContent('#pinPadMsg')), 'too short');
    await tap('2468'); await A.click('#sheet .pk[data-k=ok]'); assert(/Enter it again/.test(await A.textContent('#sheet')), 'typed twice');
    await tap('2469'); await A.click('#sheet .pk[data-k=ok]'); assert(/did not match/.test(await A.textContent('#pinPadMsg')));
    await tap('2468'); await A.click('#sheet .pk[data-k=ok]'); await tap('2468'); await A.click('#sheet .pk[data-k=ok]');
    await A.waitForFunction(() => $('#sheet').hidden && Lock.mode === 'pin');
    const kept = await A.evaluate(() => localStorage.getItem('MOCKSECURE:ll.pin'));
    assert(kept && /"hash"/.test(kept) && /"salt"/.test(kept) && !/2468/.test(kept), 'a salted hash in secure storage, never the PIN itself');
    assert.equal(await A.evaluate(() => Object.entries(localStorage).some(([k, v]) => !k.startsWith('MOCKSECURE:') && /2468/.test(v))), false, 'and nothing in ordinary storage');
    assert.equal(JSON.parse(await A.evaluate(() => localStorage.getItem('ll.lock'))).mode, 'pin');
    assert(await A.$('#bioToo'), 'Face ID / fingerprint can stay as a shortcut');
    await A.evaluate(() => localStorage.setItem('MOCK_BIO_FAIL', '1')); await A.reload(); await A.waitForSelector('#ul .pk'); assert(!(await A.isVisible('#tabs')), 'locked on a cold start');
    assert(await A.$('#unlock'), 'the shortcut is offered on the lock screen');
    // (checking a PIN takes a moment: it is hashed; the message is waited for together with the count of tries, and it survives a redraw by a sync)
    const said = (re, n) => A.waitForFunction(([r, n]) => new RegExp(r).test($('#ulMsg').textContent) && ((JSON.parse(localStorage.getItem('MOCKSECURE:ll.pin')) || {}).tries || 0) === n, [re.source, n]);
    for (let i = 1; i <= 4; i++) {
      await tap('1111', '#ul'); await said(/not right/, i);
      if (i === 2) { await syncNow(A); assert(/not right/.test(await A.textContent('#ulMsg')), 'the message survives a redraw by a sync'); }
    }
    await tap('1111', '#ul'); await said(/Try again in \d+ seconds/, 5);
    await A.evaluate(() => { $('#ulMsg').textContent = ''; }); await tap('2468', '#ul'); await said(/Try again in/, 5);   // the right PIN has to wait too
    assert(!(await A.isVisible('#tabs')), 'still locked');
    await A.evaluate(() => { const p = JSON.parse(localStorage.getItem('MOCKSECURE:ll.pin')); p.until = Date.now() - 1; localStorage.setItem('MOCKSECURE:ll.pin', JSON.stringify(p)); });
    await A.reload(); await A.waitForSelector('#ul .pk'); await tap('2468', '#ul'); await A.waitForSelector('#tabs'); assert.equal(await A.textContent('#title'), "Leo's Log");
    await A.evaluate(() => localStorage.removeItem('MOCK_BIO_FAIL'));
    await goTab(A, 'more'); await A.click('[name=lockMode][value=off]'); await A.waitForSelector('#pinPad'); assert(/current PIN/.test(await A.textContent('#sheet')), 'turning the lock off asks for the PIN');
    await tap('2468'); await A.waitForFunction(() => $('#sheet').hidden && Lock.mode === 'off');
    assert.equal(await A.evaluate(() => localStorage.getItem('MOCKSECURE:ll.pin')), null, 'the PIN goes with the lock');
    await A.click('[name=lockMode][value=bio]'); await A.waitForFunction(() => Lock.mode === 'bio');   // (as the later steps expect)
  });

  await step('backup passphrase: 12+ characters, kept in secure storage; a generated one is offered', async () => {
    await goTab(A, 'more'); await A.fill('#cPass', 'short'); await A.click('#cSavePass'); assert(/at least 12/.test(await toastText(A)));
    await A.click('#cGenPass'); await A.waitForSelector('#gpUse'); const gen = (await A.textContent('#sheet .code')).trim();
    assert(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/.test(gen), gen); await A.click('#gpUse'); await sleep(100);
    const plain = await A.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('MOCKSECURE:')))));
    assert(!plain.includes(gen), 'passphrase not in ordinary storage');
    assert(JSON.parse(await A.evaluate(() => localStorage.getItem('MOCKSECURE:cloud.v2'))).pass === gen, 'passphrase is in the keychain');
  });
  await step('Dropbox: sign-in returns through the app link; backup is encrypted with the stronger key derivation; restore works', async () => {
    const opts = {}; await goTab(A, 'more'); await A.click('[data-cc=dropbox]');
    const authUrl = await A.evaluate(() => window.__calls.find(c => c[0] === 'Browser.open')[1]); const u = new URL(authUrl);
    assert.equal(u.searchParams.get('redirect_uri'), 'app.littlelog.newborn://oauth'); assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    await A.evaluate(s => window.__emit('appUrlOpen', { url: 'app.littlelog.newborn://oauth?code=abc&state=' + s }), u.searchParams.get('state'));
    await A.waitForSelector('[data-cb=dropbox]'); await A.click('[data-cb=dropbox]'); await A.waitForFunction(() => Cloud.last('dropbox') > 0);
    const f = JSON.parse(shim.dbx); assert.equal(f.v, 2); assert.equal(f.iter, 600000); assert(!shim.dbx.includes('Leo') && !shim.dbx.includes('feed'));
    const n = await A.evaluate(() => db.events.length); await A.evaluate(() => { db.events = []; save(true); });
    await A.click('[data-cr=dropbox]'); await A.waitForFunction(n => db.events.length === n, n);
    await A.evaluate(s => window.__emit('appUrlOpen', { url: 'app.littlelog.newborn://oauth?code=evil&state=ll-dropbox-forged' }), 0); await sleep(150);
    assert.equal(await A.evaluate(() => Cloud.connected('onedrive')), false, 'a sign-in return with an unknown state is ignored');
  });

  let S, S2, soloCode;
  const E2EE_norm = c => c.replace(/-/g, '');
  await step('deleting your account as the only parent removes the log; the phone returns to sign-in', async () => {
    S = await device(); await signIn(S, 'solo@x.com'); await S.waitForSelector('#oCreate');
    await S.fill('#oName', 'Solo'); await S.click('#oCreate'); await S.waitForSelector('#eGo'); const soloSecret = await secretOf(S); await enterTotp(S, soloSecret); await S.waitForSelector('#rcDone');
    soloCode = (await S.textContent('#view .code')).trim(); await S.click('input[name=rcAck]'); await S.click('#rcDone'); await S.waitForSelector('#tabs');
    await S.click('[data-add=feed]'); await S.click('input[value=bottle]'); await S.fill('#ml', '33'); await S.fill('#note', 'solo note'); await S.click('#save'); await S.waitForFunction(() => Sync.st.state === 'ok' && !db.events.some(e => e.updated > db.meta.pushedAt));
    // the phone is lost: a brand-new phone with only the recovery code gets everything back
    S2 = await device(); await signIn(S2, 'solo@x.com'); await S2.waitForSelector('#mCode'); await S2.fill('#mCode', totp(soloSecret)); await S2.click('#mGo'); await S2.waitForSelector('#aRecover');
    assert(!(await S2.isVisible('#tabs'))); await S2.fill('#aCode', 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA'); await S2.click('#aRecover'); await S2.waitForFunction(() => /not right/.test(document.body.textContent));
    await S2.fill('#aCode', soloCode.toLowerCase()); await S2.click('#aRecover'); await S2.waitForSelector('#tabs');
    await syncNow(S2); const got = await S2.evaluate(() => db.events.find(e => e.type === 'feed')); assert.equal(got.data.ml, 33); assert.equal(got.note, 'solo note'); assert.equal(await S2.evaluate(() => db.baby.name), 'Solo');
    assert.equal((await q(`select count(*)::int c from key_grants g join devices d on 'd:'||d.id::text = g.grantee join auth.users u on u.id=d.user_id where u.email='solo@x.com'`))[0].c, 2, 'the recovered phone registered itself for future key changes');
    secrets.push(soloCode, E2EE_norm(soloCode));
  });

  await step('the server holds no readable data at all: a search of every table finds none of the baby\'s data, notes or keys', async () => {
    const tables = (await q(`select tablename from pg_tables where schemaname='public'`)).map(r => r.tablename); let dump = '';
    for (const t of tables) dump += (await q(`select coalesce(string_agg(to_jsonb(x)::text, E'\n'), '') d from ${t} x`))[0].d + '\n';
    for (const sentinel of ['"Leo"', '"Solo"', '2026-10-10', 'solo note', 'nan was here', 'after nan left', '"wet"', '"Rash"', 'bottle', 'planted', 'Vit D']) assert(!dump.includes(sentinel), 'plaintext leaked to the server: ' + sentinel);
    const ka = await keysOf(A), dev = await A.evaluate(() => E2EE.device);
    for (const k of Object.values(ka.keys)) { secrets.push(k.main); if (k.health) secrets.push(k.health); } secrets.push(dev.priv.d);
    for (const sec of secrets) assert(!dump.includes(sec), 'a secret reached the server: ' + sec.slice(0, 8) + '…');
    assert(dump.length > 5000 && dump.includes('mum@x.com') && dump.includes('"Mum"'), 'sanity: the dump is real and still holds account metadata (emails, names)');
  });

  await step('deleting your account as the only parent removes the log (and its keys); the phone returns to sign-in', async () => {
    assert.equal((await q(`select count(*)::int c from babies where created_by = (select id from auth.users where email='solo@x.com')`))[0].c, 1);
    await goTab(S2, 'more'); await S2.click('#delAcct'); await S2.waitForSelector('#lEmail');
    assert.equal((await q(`select count(*)::int c from babies where created_by in (select id from auth.users where email='solo@x.com')`))[0].c, 0); assert.equal((await q(`select count(*)::int c from auth.users where email='solo@x.com'`))[0].c, 0);
    assert.deepEqual(await S2.evaluate(() => [db.events.length, db.meta.babyId || null, Auth.signedIn]), [0, null, false]);
    assert.equal(await S2.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('MOCKSECURE:e2ee.')).length), 0, 'its keys were erased from the phone');
  });

  await step('removing a lost phone deletes its keys and changes the log\'s keys; that phone can read nothing new', async () => {
    const a2id = await A2.evaluate(() => E2EE.device.id), ep0 = await epochOnServer(), a2keys = await keysOf(A2), babyId = await babyOf(A2);
    await goTab(A, 'family'); await openSec(A); await A.waitForSelector(`[data-rmphone="${a2id}"]`); await A.click(`[data-rmphone="${a2id}"]`); await A.waitForFunction(i => !document.querySelector(`[data-rmphone="${i}"]`), a2id);
    assert.equal((await q(`select count(*)::int c from key_grants where grantee=$1`, ['d:' + a2id]))[0].c, 0, 'its grant is gone'); assert.equal((await q('select rotate_needed from babies where id=$1', [babyId]))[0].rotate_needed, true);
    await syncNow(A); assert.equal(await epochOnServer(), ep0 + 1);
    assert.equal((await q(`select count(*)::int c from key_grants where epoch=$1 and grantee=$2`, [ep0 + 1, 'd:' + a2id]))[0].c, 0, 'and it is not in the new key distribution');
    await goTab(A, 'day'); await A.click('[data-add=feed]'); await A.click('input[value=bottle]'); await A.fill('#ml', '44'); await A.click('#save'); await A.waitForFunction(() => !db.events.some(e => e.updated > db.meta.pushedAt));
    const fresh = (await q('select * from events where epoch=$1 order by synced_at desc limit 1', [ep0 + 1]))[0];
    assert.equal(await A2.evaluate(([b, row, keys]) => E2EE.decryptWith(keys, b, row).then(x => Object.keys(x)[0]), [babyId, fresh, a2keys.keys]), 'locked', 'the removed phone\'s keys cannot open new entries');
    await syncNow(A2); assert.notEqual(await A2.evaluate(() => Sync.st.state), 'ok', 'and it can no longer sync');
  });

  await step('"sign out everywhere" ends every session; a phone that was left signed in is cleared the next time it connects', async () => {
    // the removed phone is back at "approve this phone" (it re-registered, without keys): that is the right place for it to be
    assert(await A2.isVisible('#aCheck'), 'a removed phone has to be approved again');
    await goTab(B, 'more'); await B.click('#signOutAll'); await B.waitForSelector('#lEmail'); assert.equal(await B.evaluate(() => db.events.length), 0);
    assert.equal([...shim.sessions.values()].filter(s => s.email === 'dad@x.com').length, 0, 'server dropped all of Dad\'s sessions');
    await A2.evaluate(() => Auth.signOut(true));   // Mum signs out everywhere (the same call the button makes)
    assert.equal([...shim.sessions.values()].filter(s => s.email === 'mum@x.com').length, 0, 'server dropped all of Mum\'s sessions');
    await A.evaluate(() => { const k = 'MOCKSECURE:auth.v2', s = JSON.parse(localStorage.getItem(k)); s.exp = 0; localStorage.setItem(k, JSON.stringify(s)); });   // her access token has now expired
    await A.reload(); await A.waitForSelector('#lEmail', { timeout: 15000 });
    assert(/signed out/.test(await A.textContent('#view'))); assert.equal(await A.evaluate(async () => { await Store.whenSaved(); return (await Store.peek()).events.length; }), 0, 'baby data wiped from the phone (on disk, not just on screen)');
    assert.equal(await A.evaluate(() => localStorage.getItem('MOCKSECURE:auth.v2')), null);
  });

  for (const p of all) if (p.errs.length) { failed++; console.log('✗ page errors:', p.errs); }
  for (const p of all) if (p.csp.length) { failed++; console.log('✗ CSP violations:', p.csp); }
  await browser.close(); await su.end(); await shim.close(); server.close(); if (startCluster.stop) startCluster.stop(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} end-to-end checks passed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); if (startCluster.stop) startCluster.stop(); process.exit(1); });
