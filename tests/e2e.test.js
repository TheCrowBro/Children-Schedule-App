// End-to-end: the real app (built into a temp folder, with its real CSP) in desktop Chromium with a fake native bridge,
// talking to a shim that runs the real schema.sql on a real Postgres. Needs: playwright, chromium, ffmpeg, postgres.
//   node tests/e2e.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { execSync } = require('child_process');
const { chromium } = require('playwright');
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
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const all = [];
  const turnstile = `window.turnstile={render:(sel,o)=>{setTimeout(()=>o.callback('captcha-ok'),30);return 1}}`;

  async function device(opts = {}) {
    const ctx = await (opts.br || browser).newContext({ viewport: { width: 390, height: 800 } });
    if (opts.native !== false) await installFakeNative(ctx, opts);
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
  const syncNow = async p => { await p.evaluate(() => Sync.run()); await p.waitForFunction(() => Sync.st.state !== 'syncing'); };
  const toastText = p => p.evaluate(() => document.querySelector('#toast').textContent);

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
    await A.fill('#lEmail', 'mum@x.com'); await sleep(300);                  // let the security check complete
    await A.click('#lSend'); await A.waitForSelector('#lCode'); assert.equal(shim.o.sent, 1);
  });
  await step('five wrong codes force a fresh code; the right code signs in', async () => {
    for (let i = 0; i < 5; i++) { await A.fill('#lCode', '00000000'); await A.click('#lVerify'); await A.waitForFunction(() => !document.querySelector('#lVerify') || !document.querySelector('#lVerify').disabled); if (i < 4) await A.waitForSelector('#lCode'); }
    await A.waitForSelector('#lEmail'); assert(/Too many wrong codes/.test(await A.textContent('[role=alert]')));
    await sleep(200); await A.fill('#lEmail', 'mum@x.com'); await A.click('#lSend'); await A.waitForSelector('#lCode');
    await A.fill('#lCode', '12345678'); await A.click('#lVerify'); await A.waitForSelector('#oCreate');
  });
  let mumSecret;
  await step('a new parent must set up two-step verification before a log is created', async () => {
    await A.fill('#oMine', 'Mum'); await A.fill('#oName', 'Leo'); await A.fill('#oBirth', '2026-10-10'); await A.click('#oCreate');
    await A.waitForSelector('#eGo'); assert(/must use two-step/.test(await A.textContent('#view')));
    assert.equal((await q('select count(*)::int c from babies'))[0].c, 0, 'nothing created yet');
    mumSecret = await secretOf(A);
    await A.fill('#eCode', '000000'); await A.click('#eGo'); await A.waitForFunction(() => /not right/.test(document.body.textContent));
    await enterTotp(A, mumSecret); await A.waitForSelector('#tabs');
    assert.equal(await A.textContent('#title'), "Leo's Log");
    const m = (await q(`select role, display_name from members`))[0]; assert.deepEqual([m.role, m.display_name], ['parent', 'Mum']);
    assert.equal(await A.evaluate(() => Auth.aal), 'aal2');
  });
  await step('sign-in tokens, cloud tokens and passphrase live only in secure storage', async () => {
    const plain = await A.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('MOCKSECURE:'))));
    const secure = await A.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('MOCKSECURE:')));
    assert(secure.includes('MOCKSECURE:auth.v2'), 'session is in the keychain');
    const tok = JSON.parse(await A.evaluate(() => localStorage.getItem('MOCKSECURE:auth.v2'))).access;
    assert(!JSON.stringify(plain).includes(tok) && !JSON.stringify(plain).includes('refresh'), 'no token in ordinary storage: ' + Object.keys(plain));
  });
  await step('entries sync to the server, stamped with who made them', async () => {
    await A.click('[data-add=feed]'); await A.click('input[value=bottle]'); await A.fill('#ml', '90'); await A.click('#save');
    await A.waitForFunction(() => Sync.st.state === 'ok' && !db.events.some(e => e.updated > db.meta.pushedAt));
    const [e] = await q('select e.*, m.display_name from events e join members m on m.user_id=e.created_by'); assert.equal(e.display_name, 'Mum'); assert.equal(e.data.ml, 90);
    assert((await q(`select * from activity where action='entry_added'`)).length === 1);
  });

  // (parts 2+ are appended below)


  // ================= part 2: invites, approval, roles, permissions =================
  const goTab = async (p, t) => { await p.click(`[data-tab=${t}]`); await sleep(50); };
  const mkInvite = async (p, role, ticks = [], unticks = []) => {
    await goTab(p, 'family'); await p.waitForSelector('#invCard');
    await p.click(`input[name=invrole][value=${role}]`);
    for (const k of ticks) await p.click(`input[name=invperm][value=${k}]:not(:checked)`);
    for (const k of unticks) await p.click(`input[name=invperm][value=${k}]:checked`);
    const before = await p.evaluate(() => (document.querySelector('.invite .code') || {}).textContent || '');
    await p.click('#mkInvite'); await p.waitForFunction(b => { const c = document.querySelector('.invite .code'); return c && c.textContent !== b; }, before);
    return (await p.textContent('.invite .code')).trim();
  };
  const pendingFor = async (email) => (await q(`select * from join_requests where email=$1 and status='pending'`, [email]));
  let inviteB;
  await step('role buttons load sensible defaults and lock what a role may never have', async () => {
    await goTab(A, 'family'); await A.waitForSelector('#invCard');
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
    assert.equal(decoded, 'app.littlelog.newborn://join?join=' + inviteB);
  });

  const B = await device(); let dadSecretless = true;
  await step('someone who redeems an invite only sends a request – they see nothing until approved', async () => {
    await B.waitForSelector('#lEmail'); await signIn(B, 'dad@x.com'); await B.waitForSelector('#oJoin');
    await B.fill('#oMine', 'Dad'); await B.fill('#oCode', inviteB); await B.click('#oJoin');
    await B.waitForSelector('#wCheck'); assert(/Waiting for approval/.test(await B.textContent('#view')));
    assert.equal((await pendingFor('dad@x.com')).length, 1);
    assert.equal((await q(`select count(*)::int c from members where email='dad@x.com'`))[0].c, 0);
  });
  await step('the parent sees the request (badge + list) and approves it', async () => {
    await goTab(A, 'day'); await syncNow(A);
    assert.equal(await A.evaluate(() => document.querySelector('#famBadge').textContent), '1'); assert(await A.isVisible('#famBadge'));
    await goTab(A, 'family'); await A.waitForSelector('[data-approve]'); assert(/dad@x.com/.test(await A.textContent('#view')));
    await A.click('[data-approve]'); await A.waitForFunction(() => !document.querySelector('[data-approve]'));
    const [m] = await q(`select role, display_name from members where email='dad@x.com'`); assert.deepEqual([m.role, m.display_name], ['family', 'Dad']);
    await B.click('#wCheck'); await B.waitForSelector('#tabs'); assert.equal(await B.evaluate(() => db.meta.role), 'family');
  });
  await step('family member: sees the log with names; can change only their own entries; no settings', async () => {
    await goTab(B, 'day'); await syncNow(B); assert(/added by Mum/.test(await B.textContent('#view')), 'shows who added it: ' + (await B.textContent('#view')).slice(0, 300));
    await B.click('[data-edit]'); assert(/can't change entries added by Mum/.test(await toastText(B)));
    assert(!(await B.isVisible('#sheet')), 'no editor opens for someone else\'s entry');
    await B.click('[data-add=diaper]'); await B.click('input[name=poo]'); await B.click('#save');
    await B.waitForFunction(() => Sync.st.state === 'ok' && !db.events.some(e => e.updated > db.meta.pushedAt));
    await B.click('[data-edit]:has-text("Pee")'); await B.waitForSelector('#del'); await B.fill('#note', 'wet'); await B.click('#save'); await sleep(100);
    await goTab(B, 'more'); assert(await B.$eval('#bName', e => e.disabled), 'baby profile is read-only for family');
    assert(!(await B.$('#wipe')), 'no "delete all entries"');
    await goTab(B, 'family'); await B.waitForSelector('#syncNow');
    assert(!(await B.$('#invCard')) && !(await B.$('#actBtn')), 'no invites and no activity log for non-parents');
    assert(/Mum/.test(await B.textContent('#view')) && /mum@x.com/.test(await B.textContent('#view')), 'family can see who has access');
  });
  await step('a modified phone cannot get around the rules: the server refuses, the app restores the original', async () => {
    await B.evaluate(() => { const e = db.events.find(x => x.type === 'feed'); e.data.ml = 999; e.updated = Date.now(); save(true); });
    await syncNow(B);
    { const ml = await B.evaluate(() => db.events.find(x => x.type === 'feed').data.ml); assert.equal(ml, 90, 'restored to the server version, local has ' + ml + ' denied=' + await B.evaluate(() => Sync.st.denied + ' ' + Sync.st.err)); }
    assert.equal((await q(`select data from events where type='feed'`))[0].data.ml, 90);
    assert.equal(await B.evaluate(() => Sync.st.denied), 1);
    await B.evaluate(() => { removeEvent(db.events.find(x => x.type === 'feed')); save(true); }); await syncNow(B);
    assert.equal(await B.evaluate(() => db.events.filter(x => x.type === 'feed').length), 1, 'deleted entry came back');
    assert.equal((await q(`select deleted from events where type='feed'`))[0].deleted, false);
    await B.evaluate(() => { db.events.push({ id: 'forged1', type: 'feed', ts: Date.now(), data: { x: 'y'.repeat(5000) }, note: '', updated: Date.now(), by: Auth.id }); save(true); }); await syncNow(B);
    assert.equal(await B.evaluate(() => db.events.some(x => x.id === 'forged1')), false, 'oversized entry refused and dropped');
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
    b2 = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + tmp + '/cam.y4m'] });
    C = await device({ br: b2 }); await signIn(C, 'nan@x.com'); await C.waitForSelector('#oScan');
    await C.fill('#oMine', 'Nan'); await C.click('#oScan'); await C.waitForSelector('#wCheck', { timeout: 20000 });
    assert.equal((await pendingFor('nan@x.com')).length, 1); assert.equal((await q('select used_by from invites where code=$1', [inviteC]))[0].used_by !== null, true, 'invite is single-use');
    await syncNow(A); await goTab(A, 'family'); await A.waitForSelector('[data-approve]'); await A.click('[data-approve]'); await A.waitForFunction(() => !document.querySelector('[data-approve]'));
    await C.click('#wCheck'); await C.waitForSelector('#tabs');
    const [m] = await q(`select perms from members where email='nan@x.com'`); assert.equal(m.perms.edit_others, true); assert.equal(m.perms.delete_own, false);
  });
  await step('the check boxes really take effect: this caregiver can edit others\' entries but not delete their own', async () => {
    await syncNow(C); await C.click('[data-edit]:has-text("Bottle")'); await C.waitForSelector('#save'); assert(!(await C.$('#del')), 'no delete button: delete_own is off'); await C.fill('#note', 'nan was here'); await C.click('#save');
    await C.waitForFunction(() => Sync.st.state === 'ok' && !db.events.some(e => e.updated > db.meta.pushedAt));
    assert.equal((await q(`select note from events where type='feed'`))[0].note, 'nan was here');
    await C.click('[data-add=wake]'); await C.click('#save'); await C.waitForFunction(() => !db.events.some(e => e.updated > db.meta.pushedAt));
    await C.evaluate(() => { removeEvent(db.events.find(x => x.type === 'wake')); save(true); }); await syncNow(C);
    assert.equal((await q(`select deleted from events where type='wake'`))[0].deleted, false, 'server refused the delete');
    await goTab(C, 'family'); await C.waitForSelector('#syncNow'); assert(!/mum@x.com/.test(await C.textContent('#view')), 'no emails without the "see who has access" permission');
    assert(/Mum/.test(await C.textContent('#view')), 'but names are visible');
  });
  await step('a parent can change someone\'s access later; health notes disappear when that permission is removed', async () => {
    await goTab(A, 'day'); await A.click('[data-add=health]'); await A.click('input[value="Rash"]'); await A.click('#save'); await A.waitForFunction(() => !db.events.some(e => e.updated > db.meta.pushedAt));
    await goTab(C, 'day'); await syncNow(C); assert(await C.isVisible('[data-add=health]'), 'health button visible while permitted'); assert(await C.evaluate(() => db.events.some(e => e.type === 'health')));
    await goTab(A, 'family'); await A.waitForSelector('[data-person]'); await A.evaluate(() => Sync.loadPeople());
    await A.click('[data-person]:near(:text("Nan"))').catch(() => {});
    const nanId = (await q(`select user_id from members where email='nan@x.com'`))[0].user_id;
    await A.click(`[data-person="${nanId}"]`); await A.waitForSelector('#pSave');
    await A.click('input[name=pperm][value=view_health]:checked'); await A.click('#pSave'); await A.waitForFunction(() => document.querySelector('#sheet').hidden);
    await goTab(C, 'day'); await syncNow(C);
    assert(await C.isVisible('[data-add=feed]') && !(await C.$('[data-add=health]')), 'other buttons remain, health button gone'); assert.equal(await C.evaluate(() => db.events.some(e => e.type === 'health' || e.type === 'med')), false, 'local health entries purged');
    assert.equal((await q(`select perms from members where email='nan@x.com'`))[0].perms.view_health, false);
  });
  await step('invites can be rescinded, and a rescinded code no longer works', async () => {
    const code = await mkInvite(A, 'friend');
    await A.click(`[data-rescind="${code}"]`); await A.waitForFunction(c => !document.querySelector(`[data-rescind="${c}"]`), code);
    assert.equal((await q('select count(*)::int c from invites where code=$1', [code]))[0].c, 0);
    const r = await C.evaluate(c => Auth.rpc('redeem_invite', { p_code: c }), code); assert.equal(r.status, 'invalid');
  });
  await step('the activity log shows who did what – to parents only', async () => {
    await goTab(A, 'family'); await A.click('#actBtn'); await A.waitForFunction(() => /added a diaper entry/.test(document.querySelector('#actList').textContent));
    const t = await A.textContent('#actList');
    for (const s of ['Mum created the log', 'Dad added a diaper entry', 'Mum approved dad@x.com as Family member', 'Nan edited a feed entry added by Mum', 'changed what Nan can do', 'rescinded a Friend invite']) assert(t.includes(s), 'missing: ' + s + '\n' + t.slice(0, 600));
    assert(!t.includes('nan was here') && !t.includes('Rash'), 'entry contents are not in the log');
    await A.click('#actClose');
  });
  await step('removing a person cuts them off immediately and clears their phone', async () => {
    const nanId = (await q(`select user_id from members where email='nan@x.com'`))[0].user_id;
    await goTab(A, 'family'); await A.click(`[data-person="${nanId}"]`); await A.waitForSelector('#pRemove'); await A.click('#pRemove'); await A.waitForFunction(() => document.querySelector('#sheet').hidden);
    await syncNow(C); await C.waitForSelector('#oCreate'); assert.equal(await C.evaluate(() => db.events.length), 0);
    await C.context().close(); await b2.close();
  });


  // ================= part 3: two-step on a new phone, app lock, backups, deletion, sign out everywhere =================
  let A2;
  await step('a parent signing in on a new phone must pass two-step verification before seeing anything', async () => {
    A2 = await device(); await signIn(A2, 'mum@x.com'); await A2.waitForSelector('#mCode');
    assert(!(await A2.isVisible('#tabs'))); assert.equal(await A2.evaluate(() => db.events.length), 0, 'nothing downloaded yet');
    await A2.fill('#mCode', '000000'); await A2.click('#mGo'); await A2.waitForFunction(() => /not right/.test(document.body.textContent));
    await A2.fill('#mCode', totp(mumSecret)); await A2.click('#mGo'); await A2.waitForSelector('#tabs');
    await syncNow(A2); assert((await A2.evaluate(() => db.events.length)) >= 3);
    assert.equal(await A2.evaluate(() => window.__bio.prompts), 0, 'no Face ID prompt right after signing in');
  });
  await step('a parent session without two-step verification gets no data even if the app is bypassed', async () => {
    const r = await A2.evaluate(async () => {   // a raw aal1 session for the same user, straight against the API
      await Auth.sendCode('mum@x.com', 'captcha-ok'); const o = await fetch('https://fake.supabase.co/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'email', email: 'mum@x.com', token: '12345678' }) }).then(r => r.json());
      const h = { apikey: 'anon', Authorization: 'Bearer ' + o.access_token, 'Content-Type': 'application/json' };
      const ev = await fetch('https://fake.supabase.co/rest/v1/events?select=*', { headers: h }).then(r => r.json());
      const push = await fetch('https://fake.supabase.co/rest/v1/rpc/push_events', { method: 'POST', headers: h, body: JSON.stringify({ p_baby: db.meta.babyId, p_rows: [] }) }).then(r => r.json());
      return { ev, msg: push.message };
    });
    assert.deepEqual(r.ev, []); assert(/no access/.test(r.msg), r.msg);
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
    assert.equal(JSON.parse(await A.evaluate(() => localStorage.getItem('ll.lock'))).enabled, true);
    await A.evaluate(() => localStorage.setItem('MOCK_BIO_FAIL', '1')); await A.reload();
    await A.waitForSelector('#unlock'); await sleep(500); assert(await A.isVisible('#unlock'), 'still locked after a failed prompt'); assert(!(await A.isVisible('#tabs')));
    assert(/locked/.test(await A.textContent('#view')));
    await A.evaluate(() => localStorage.removeItem('MOCK_BIO_FAIL')); await A.click('#unlock'); await A.waitForSelector('#tabs');
    assert.equal(await A.textContent('#title'), "Leo's Log");
  });
  await step('app lock: the screen is covered in the app switcher, and re-locks after the chosen time away', async () => {
    await A.evaluate(() => window.__emit('appStateChange', { isActive: false })); assert(await A.isVisible('#cover'), 'cover shown while in background');
    await A.evaluate(() => window.__emit('appStateChange', { isActive: true })); assert(!(await A.isVisible('#cover'))); assert.equal(await A.evaluate(() => Lock.locked), false, 'back within a minute: still unlocked');
    await goTab(A, 'more'); await A.selectOption('#lockMin', '0');
    await A.evaluate(() => { window.__bio.ok = false; window.__emit('appStateChange', { isActive: false }); window.__emit('appStateChange', { isActive: true }); });
    await A.waitForSelector('#unlock'); assert.equal(await A.evaluate(() => Lock.locked), true, 'locked immediately when set to "Immediately"');
    await A.evaluate(() => { window.__bio.ok = true; }); await A.click('#unlock'); await A.waitForSelector('#tabs');
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

  let S;
  await step('deleting your account as the only parent removes the log; the phone returns to sign-in', async () => {
    S = await device(); await signIn(S, 'solo@x.com'); await S.waitForSelector('#oCreate');
    await S.fill('#oName', 'Solo'); await S.click('#oCreate'); await S.waitForSelector('#eGo'); await enterTotp(S, await secretOf(S)); await S.waitForSelector('#tabs');
    assert.equal((await q(`select count(*)::int c from babies where name='Solo'`))[0].c, 1);
    await goTab(S, 'more'); await S.click('#delAcct'); await S.waitForSelector('#lEmail');
    assert.equal((await q(`select count(*)::int c from babies where name='Solo'`))[0].c, 0); assert.equal((await q(`select count(*)::int c from auth.users where email='solo@x.com'`))[0].c, 0);
    assert.deepEqual(await S.evaluate(() => [db.events.length, db.meta.babyId || null, Auth.signedIn]), [0, null, false]);
  });

  await step('"sign out everywhere" ends every session; a phone that was left signed in is cleared the next time it connects', async () => {
    await goTab(A2, 'more'); await A2.click('#signOutAll'); await A2.waitForSelector('#lEmail'); assert.equal(await A2.evaluate(() => db.events.length), 0);
    assert.equal([...shim.sessions.values()].filter(s => s.email === 'mum@x.com').length, 0, 'server dropped all of Mum\'s sessions');
    await A.evaluate(() => { const k = 'MOCKSECURE:auth.v2', s = JSON.parse(localStorage.getItem(k)); s.exp = 0; localStorage.setItem(k, JSON.stringify(s)); });   // her access token has now expired
    await A.reload(); await A.waitForSelector('#lEmail', { timeout: 15000 });
    assert(/signed out/.test(await A.textContent('#view'))); assert.equal(await A.evaluate(() => JSON.parse(localStorage.getItem('littlelog.v1')).events.length), 0, 'baby data wiped from the phone');
    assert.equal(await A.evaluate(() => localStorage.getItem('MOCKSECURE:auth.v2')), null);
  });

  for (const p of all) if (p.errs.length) { failed++; console.log('✗ page errors:', p.errs); }
  for (const p of all) if (p.csp.length) { failed++; console.log('✗ CSP violations:', p.csp); }
  await browser.close(); await su.end(); await shim.close(); server.close(); if (startCluster.stop) startCluster.stop(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} end-to-end checks passed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); if (startCluster.stop) startCluster.stop(); process.exit(1); });
