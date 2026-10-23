// End-to-end test against an in-memory fake of the Supabase + Dropbox APIs. Needs: playwright, ffmpeg, chromium,
// and the app served on :8123  (python3 -m http.server 8123).  Run: node tests/e2e.js [tmpdir]
const { chromium } = require('playwright');
const assert = require('assert');
const APP = 'http://localhost:8123/';
const SB = 'https://fake.supabase.co';

// ---------- fake Supabase ----------
const srv = { users: {}, babies: {}, members: [], invites: {}, events: [], seq: 0, n: 0, dbx: null, dbxTokenCalls: [] };
const nowIso = () => new Date(Date.now() + (++srv.seq)).toISOString();
const J = (status, body) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
const eq = (u, k) => { const v = u.searchParams.get(k); return v && v.startsWith('eq.') ? v.slice(3) : null; };
function rest(req, u, uid, body) {
  const p = u.pathname.replace('/rest/v1', ''), m = req.method();
  const role = b => (srv.members.find(x => x.baby_id === b && x.user_id === uid) || {}).role;
  if (!uid) return J(401, { message: 'JWT missing' });
  if (p === '/rpc/create_baby') { const id = 'b' + (++srv.n); srv.babies[id] = { name: body.p_name, birth: body.p_birth }; srv.members.push({ baby_id: id, user_id: uid, email: srv.byId[uid], role: 'owner', joined_at: nowIso() }); return J(200, id); }
  if (p === '/rpc/create_invite') { if (role(body.p_baby) !== 'owner') return J(400, { message: 'only the owner can invite' }); const code = ('INV' + (++srv.n) + 'ABCDEFGHIJ').slice(0, 10).toUpperCase(); srv.invites[code] = { baby_id: body.p_baby, role: body.p_role, used: false }; return J(200, code); }
  if (p === '/rpc/redeem_invite') { const i = srv.invites[body.p_code]; if (!i || i.used) return J(400, { message: 'This invite is invalid or has expired' }); i.used = true; if (!role(i.baby_id)) srv.members.push({ baby_id: i.baby_id, user_id: uid, email: srv.byId[uid], role: i.role, joined_at: nowIso() }); return J(200, i.baby_id); }
  if (p === '/members') {
    if (m === 'DELETE') { srv.members = srv.members.filter(x => !(x.baby_id === eq(u, 'baby_id') && x.user_id === eq(u, 'user_id'))); return J(204); }
    const bid = eq(u, 'baby_id'), uu = eq(u, 'user_id');
    let rows = srv.members.filter(x => (!bid || x.baby_id === bid) && (!uu || x.user_id === uu));
    rows = rows.filter(x => role(x.baby_id));                      // RLS: only babies I belong to
    if ((u.searchParams.get('select') || '').includes('babies(')) rows = rows.map(x => ({ ...x, babies: srv.babies[x.baby_id] }));
    return J(200, rows);
  }
  if (p === '/babies') { const id = eq(u, 'id'); if (m === 'PATCH') { if (!['owner', 'caregiver'].includes(role(id))) return J(200, []); Object.assign(srv.babies[id], body); return J(204); } return J(200, role(id) ? [srv.babies[id]] : []); }
  if (p === '/events') {
    if (m === 'GET') { const b = eq(u, 'baby_id'); if (!role(b)) return J(200, []); const since = u.searchParams.get('synced_at').slice(3); return J(200, srv.events.filter(e => e.baby_id === b && e.synced_at > since).sort((a, b) => a.synced_at < b.synced_at ? -1 : 1).slice(0, +u.searchParams.get('limit'))); }
    if (m === 'POST') { for (const r of body) { if (!['owner', 'caregiver'].includes(role(r.baby_id))) return J(403, { message: 'row-level security' }); const i = srv.events.findIndex(e => e.baby_id === r.baby_id && e.id === r.id); if (i >= 0) { if (r.updated <= srv.events[i].updated) continue; srv.events[i] = { ...r, synced_at: nowIso() }; } else srv.events.push({ ...r, synced_at: nowIso() }); } return J(201); }
  }
  return J(404, { message: 'unhandled ' + m + ' ' + p });
}
srv.byId = {};
async function wire(ctx) {
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.LL_CONFIG={supabaseUrl:'${SB}',supabaseKey:'anon',dropboxKey:'dbxkey'}` }));
  await ctx.route(SB + '/**', async route => {
    const req = route.request(), u = new URL(req.url());
    if (srv.down) return route.abort('internetdisconnected');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const body = req.postData() ? JSON.parse(req.postData()) : null, auth = req.headers()['authorization'] || '', uid = auth.startsWith('Bearer tok-') ? auth.slice(11) : null;
    const path = u.pathname;
    if (path === '/auth/v1/otp') return route.fulfill(J(200, {}));
    if (path === '/auth/v1/verify') { if (body.token !== '123456') return route.fulfill(J(403, { msg: 'Token has expired or is invalid' })); const id = srv.users[body.email] || (srv.users[body.email] = 'u' + (++srv.n)); srv.byId[id] = body.email; return route.fulfill(J(200, { access_token: 'tok-' + id, refresh_token: 'r-' + id, expires_in: 3600, user: { id, email: body.email } })); }
    if (path === '/auth/v1/logout') return route.fulfill(J(204));
    return route.fulfill(rest(req, u, uid, body));
  });
  // fake Dropbox
  await ctx.route('https://www.dropbox.com/oauth2/authorize*', r => { const u = new URL(r.request().url()); assert(u.searchParams.get('code_challenge') && u.searchParams.get('code_challenge_method') === 'S256'); r.fulfill({ status: 302, headers: { location: `${APP}?code=abc123&state=${u.searchParams.get('state')}` } }); });
  await ctx.route('https://api.dropboxapi.com/oauth2/token', r => { srv.dbxTokenCalls.push(r.request().postData()); r.fulfill(J(200, { access_token: 'dbx-at', refresh_token: 'dbx-rt', expires_in: 14400 })); });
  await ctx.route('https://content.dropboxapi.com/**', r => { const req = r.request(); if (req.url().endsWith('/upload')) { srv.dbx = req.postData(); return r.fulfill(J(200, {})); } r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: srv.dbx || '' }); });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function device(browser, url = APP) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, permissions: [] });
  await wire(ctx);
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto(url); return p;
}
async function signIn(p, email) {
  await p.fill('#lEmail', email); await p.click('#lSend'); await p.waitForSelector('#lCode');
  await p.fill('#lCode', '123456'); await p.click('#lVerify');
}
const syncNow = async p => { await p.evaluate(() => Sync.run()); await p.waitForFunction(() => Sync.st.state !== 'syncing'); };
const count = p => p.evaluate(() => db.events.length);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let ok = 0; const pass = m => { ok++; console.log('✓', m); };

  // A: sign-in is required
  const A = await device(b);
  assert(await A.isVisible('#lEmail')); assert(!(await A.isVisible('#tabs'))); pass('app is gated behind email sign-in');
  // wrong code
  await A.fill('#lEmail', 'a@x.com'); await A.click('#lSend'); await A.waitForSelector('#lCode'); await A.fill('#lCode', '000000'); await A.click('#lVerify');
  await A.waitForSelector('[role=alert]'); assert((await A.textContent('[role=alert]')).includes('invalid')); pass('wrong code shows an error');
  await A.fill('#lCode', '123456'); await A.click('#lVerify');
  await A.waitForSelector('#oCreate'); pass('signed in → onboarding');
  await A.fill('#oName', 'Leo'); await A.fill('#oBirth', '2026-10-10'); await A.click('#oCreate');
  await A.waitForSelector('#tabs'); assert((await A.textContent('#title')) === "Leo's Log"); pass('created baby log');

  // A logs a feed
  await A.click('[data-add=feed]'); await A.click('input[value=bottle]'); await A.fill('#ml', '90'); await A.click('#save');
  await A.waitForFunction(() => Sync.st.state === 'ok' && !db.events.some(e => e.updated > db.meta.pushedAt)); assert.equal(srv.events.length, 1); pass('entry pushed to cloud');

  // invite QR
  await A.click('[data-tab=family]'); await A.click('#mkInvite'); await A.waitForSelector('.qr svg');
  const code = (await A.textContent('.invite .code')).trim();
  const decoded = await A.evaluate(async () => {
    const svg = document.querySelector('.qr svg'); const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 400); x.drawImage(img, 0, 0, 400, 400);
    const d = x.getImageData(0, 0, 400, 400); const r = jsQR(d.data, 400, 400); return r && r.data;
  });
  assert.equal(decoded, APP + '?join=' + code); pass('invite QR renders and decodes back to the join link');

  // B joins via link, as caregiver
  const B = await device(b, decoded);
  assert((await B.textContent('#view')).includes('invite waiting')); 
  await signIn(B, 'b@x.com');
  await B.waitForSelector('#tabs'); await syncNow(B);
  assert.equal(await count(B), 1); assert.equal(await B.evaluate(() => db.meta.role), 'caregiver'); assert((await B.textContent('#title')) === "Leo's Log"); pass('relative joined via invite link and received existing entries');
  assert.equal(await B.evaluate(() => location.search), ''); pass('join code stripped from URL');

  // invite is single use
  const B2 = await device(b); await signIn(B2, 'b2@x.com'); await B2.waitForSelector('#oJoin');
  await B2.fill('#oCode', code); await B2.click('#oJoin'); await sleep(400);
  assert(await B2.isVisible('#oJoin')); pass('used invite cannot be reused'); await B2.context().close();

  // B logs; A receives. Then A edits same entry later: last write wins
  await B.click('[data-add=diaper]'); await B.click('input[name=poo]'); await B.click('input[value=Yellow]'); await B.click('#save');
  await B.waitForFunction(() => Sync.st.state === 'ok' && !db.events.some(e => e.updated > db.meta.pushedAt));
  await syncNow(A); assert.equal(await count(A), 2); pass('entry from relative arrives on parent device');
  // concurrent edit conflict: both edit the feed; B's edit is newer
  await A.evaluate(() => { const e = db.events.find(e => e.type === 'feed'); e.data.ml = 100; e.updated = Date.now() - 5000; save(true); });
  await B.evaluate(() => { const e = db.events.find(e => e.type === 'feed'); e.data.ml = 120; e.updated = Date.now(); save(true); });
  await syncNow(B); await syncNow(A); await syncNow(B);
  assert.equal(await A.evaluate(() => db.events.find(e => e.type === 'feed').data.ml), 120);
  assert.equal(await B.evaluate(() => db.events.find(e => e.type === 'feed').data.ml), 120); pass('conflict resolved: newest edit wins on both devices');

  // delete propagates
  await A.click('[data-tab=day]'); await A.evaluate(() => { removeEvent(db.events.find(e => e.type === 'diaper')); save(); });
  await syncNow(A); await syncNow(B); assert.equal(await count(B), 1); assert.equal(await A.evaluate(() => db.deleted.length), 0); pass('deletion syncs to other device; tombstones pruned');

  // offline edits sync later
  srv.down = true;
  await B.evaluate(() => { db.events.push({ id: 'off1', type: 'vomit', ts: Date.now(), data: { amount: 'Medium' }, note: '', updated: Date.now() }); save(); });
  await syncNow(B); assert.equal(await B.evaluate(() => Sync.st.state), 'offline');
  srv.down = false; await syncNow(B); await syncNow(A); assert.equal(await count(A), 2); pass('offline entries sync once back online');

  // viewer
  await A.click('[data-tab=family]'); await A.click('input[value=viewer]'); await A.click('#mkInvite');
  await A.waitForFunction(old => document.querySelector('.invite .code') && document.querySelector('.invite .code').textContent.trim() !== old, code);
  const vcode = (await A.textContent('.invite .code')).trim();
  const C = await device(b, APP + '?join=' + vcode); await signIn(C, 'c@x.com'); await C.waitForSelector('#tabs'); await syncNow(C);
  assert.equal(await count(C), 2); assert(!(await C.isVisible('[data-add=feed]'))); assert((await C.textContent('#syncLine')).includes('view only')); pass('viewer sees data but has no add buttons');
  await C.evaluate(() => { db.events.push({ id: 'sneak', type: 'feed', ts: Date.now(), data: {}, note: '', updated: Date.now() }); }); await syncNow(C);
  assert(!srv.events.some(e => e.id === 'sneak')); pass('viewer writes are never pushed (and server would reject them)');

  // owner removes C
  await A.click('[data-tab=family]'); await A.waitForSelector('[data-rm]', { timeout: 5000 }).catch(() => {});
  await A.evaluate(async () => { await Sync.members(); }); await A.click('[data-tab=more]'); await A.click('[data-tab=family]');
  const rm = await A.$$('[data-rm]'); assert.equal(rm.length, 2); await rm[1].click(); await sleep(500);
  await syncNow(C); assert(await C.isVisible('#oCreate')); assert.equal(await count(C), 0); pass('removed member loses access and local copy is cleared');

  // sign out clears device
  await B.click('[data-tab=more]'); await B.click('#signOut'); await B.waitForSelector('#lEmail'); assert.deepEqual(await B.evaluate(() => [db.events.length, db.meta.babyId || null]), [0, null]); pass('sign out returns to login and clears local log');

  // crypto
  const cr = await A.evaluate(async () => { const f = await Cloud.encrypt('{"hello":"baby"}', 'pw-123456'); let wrong = ''; try { await Cloud.decrypt(f, 'nope-nope'); } catch (e) { wrong = e.message; } return { back: await Cloud.decrypt(f, 'pw-123456'), wrong, leak: f.includes('baby') }; });
  assert.equal(cr.back, '{"hello":"baby"}'); assert(cr.wrong.includes('Wrong passphrase')); assert(!cr.leak); pass('backup encryption round-trips; wrong passphrase rejected; plaintext not in file');

  // Dropbox connect (PKCE redirect) + backup + restore onto fresh device
  await A.click('[data-tab=more]'); await A.fill('#cPass', 'pw-123456'); await A.press('#cPass', 'Tab');
  await A.click('[data-cc=dropbox]'); await A.waitForURL(/code=|more|localhost:8123\/$/); await A.waitForFunction(() => Cloud.connected('dropbox'));
  assert(srv.dbxTokenCalls[0].includes('code_verifier=')); assert(srv.dbxTokenCalls[0].includes('grant_type=authorization_code')); pass('Dropbox OAuth (PKCE) connects after redirect');
  await A.click('[data-tab=more]'); await A.click('[data-cb=dropbox]'); await A.waitForFunction(() => Cloud.last('dropbox') > 0);
  assert(srv.dbx && !srv.dbx.includes('feed') && !srv.dbx.includes('Leo')); pass('encrypted backup uploaded to Dropbox (no plaintext)');
  const evBefore = await count(A);
  await A.evaluate(() => { db.events = []; save(true); });
  await A.click('[data-tab=more]'); await A.click('[data-cr=dropbox]'); await A.waitForFunction(n => db.events.length === n, evBefore); pass('restore from Dropbox brings entries back');


  // In-app camera scan: show a real invite QR to a fake webcam on a new device
  const { execSync } = require('child_process');
  await A.click('[data-tab=more]'); await A.click('[data-tab=family]');
  const prev = (await A.$('.invite .code')) ? (await A.textContent('.invite .code')).trim() : '';
  await A.click('input[value=caregiver]'); await A.click('#mkInvite');
  await A.waitForFunction(old => document.querySelector('.invite .code') && document.querySelector('.invite .code').textContent.trim() !== old, prev);
  const scode = (await A.textContent('.invite .code')).trim();
  const dir = process.argv[2] || require('os').tmpdir();
  await A.evaluate(() => { document.querySelector('#tabs').style.display = 'none'; document.querySelector('#toast').hidden = true; document.querySelector('.qr').scrollIntoView(); });
  await (await A.$('.qr')).screenshot({ path: dir + '/qr.png' });
  execSync(`ffmpeg -y -loglevel error -loop 1 -i ${dir}/qr.png -vf "scale=400:400,pad=640:480:120:40:white,format=yuv420p" -t 3 -r 10 ${dir}/cam.y4m`);
  const b2 = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + dir + '/cam.y4m'] });
  const D = await device(b2); await signIn(D, 'd@x.com'); await D.waitForSelector('#oScan');
  await D.click('#oScan'); await D.waitForSelector('#tabs', { timeout: 15000 }); await syncNow(D);
  assert.equal(await D.evaluate(() => db.meta.role), 'caregiver'); assert(srv.invites[scode].used); pass('in-app camera scanned the invite QR and joined');
  assert.deepEqual(D.errs, []); await b2.close();
  for (const p of [A, B, C]) assert.deepEqual(p.errs, [], 'page errors: ' + p.errs);
  console.log(`\nall ${ok} checks passed`);
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
