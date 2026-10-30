// Shared setup for the heavier tests: builds the real app (with its real CSP), starts a static server, a throwaway Postgres
// running the real schema, the Supabase shim, and a Chromium with a fake native bridge. See e2e.test.js for the same pieces inline.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { execSync } = require('child_process');
const { chromium } = require('playwright');
const { startCluster, freshDb } = require('./pg');
const { createShim, totp } = require('./shim');
const { installFakeNative } = require('./fake-native');

const root = path.join(__dirname, '..', '..');
const SB = 'https://fake.supabase.co';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** opts.config: the app's config.js values instead of the family-server ones (e.g. a store build with no server); opts.noDb: no
    Postgres and no Supabase shim (a suite that never talks to a family server). */
async function setup({ port = 8126, config = null, noDb = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'll-rb-')), www = path.join(tmp, 'www'), APP = `http://localhost:${port}/`;
  fs.writeFileSync(path.join(tmp, 'config.js'), config ? `window.LL_CONFIG=${JSON.stringify(config)}` : `window.LL_CONFIG={supabaseUrl:'${SB}',supabaseKey:'anon',dropboxKey:'dbx',appScheme:'app.littlelog.newborn'}`);
  execSync('node scripts/build-web.js', { cwd: root, env: { ...process.env, LL_CONFIG: path.join(tmp, 'config.js'), LL_OUT: www, LL_PSEUDO: '1' }, stdio: 'pipe' });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const f = path.join(www, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!f.startsWith(www) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(port, r));
  let su = null, shim = null;
  if (!noDb) { const adminUrl = startCluster(), db = await freshDb(adminUrl); su = db.su; shim = createShim(db.url, {}); }
  const exe = process.env.LL_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');   // (the dev sandbox's browser; elsewhere Playwright's own)
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const pages = [];
  const H = { tmp, APP, su, shim, browser, pages, sleep, totp };
  H.q = async (sql, params) => (await su.query(sql, params)).rows;
  H.shim = shim;
  /** A sync, done: waits for one under way, runs one, and tries again when the run coincided with another (then it returns at once and reruns later). */
  H.syncNow = p => p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let k = 0; k < 12; k++) {
      for (let i = 0; i < 400 && Sync.st.state === 'syncing'; i++) await wait(50);
      const at = Sync.st.at; await Sync.run(true);
      if (Sync.st.at !== at || Sync.st.state === 'offline' || Sync.st.state === 'error' || Sync.st.state === 'idle' || Sync.st.state === 'needs-access') return;
      await wait(150);
    }
  });
  /** A new phone. opts.skew shifts that phone's clock (ms); opts.locale sets the phone's language (e.g. 'fr-FR'). */
  H.device = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, ...(opts.locale ? { locale: opts.locale } : {}), ...(opts.video ? { recordVideo: { dir: opts.video, size: { width: 390, height: 800 } } } : {}) });
    await installFakeNative(ctx, opts);
    if (opts.skew) await ctx.addInitScript(off => { const real = Date.now.bind(Date); Date.now = () => real() + off; }, opts.skew);
    if (!opts.tour) await ctx.addInitScript(() => { try { if (!localStorage.getItem('ll.tours')) localStorage.setItem('ll.tours', '{"day":1,"welcome":1}'); } catch (e) { /* no storage */ } });   // (the first-time tour has its own test)
    if (!opts.welcome) await ctx.addInitScript(() => { try { localStorage.setItem('ll.welcome', '1'); } catch (e) { /* no storage */ } });
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { try { ['mlang', 'macct', 'mkids', 'mregion', 'munits', 'mlook', 'mcloud', 'mdata', 'mapp', 'mnotify', 'secnewborn', 'sectoddler', 'secschool', 'secteens', 'secpuberty', 'secfood', 'secmeds', 'secplay', 'secchecks', 'secmonths'].forEach(g => openGroups.add(g)); } catch (e) { /* not the app */ } }));   // (the More page's twirl-downs start closed; the tests click inside them)   // (the first screen has its own test: start.test.js)
    if (shim) await shim.install(ctx);
    if (opts.routes) await opts.routes(ctx);   // (a suite's own fake services, e.g. Dropbox)
    const p = await ctx.newPage(); p.errs = []; p.csp = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) p.csp.push(m.text()); });
    p.on('dialog', d => { (p.dialogs = p.dialogs || []).push(d.message()); return opts.dismiss ? d.dismiss() : d.accept(); });
    await p.goto(APP); pages.push(p); return p;
  };
  H.signIn = async (p, email) => {
    await p.waitForSelector('#lEmail'); await p.fill('#lEmail', email); await p.click('#lSend');
    await p.waitForSelector('#lCode'); await p.fill('#lCode', '12345678'); await p.click('#lVerify');
  };
  /** A parent phone with a fresh log (two-step verification set up, recovery code acknowledged). */
  H.createLog = async (email, name = 'Leo', mine = 'Mum') => {
    const p = await H.device(); await H.signIn(p, email); await p.waitForSelector('#oCreate');
    await p.fill('#oMine', mine); await p.fill('#oName', name); await p.click('#oCreate'); await p.waitForSelector('#eGo');
    const secret = (await p.textContent('.card .code')).trim(); await p.fill('#eCode', totp(secret)); await p.click('#eGo');
    await p.waitForSelector('#rcDone'); const recovery = (await p.textContent('#view .code')).trim();
    await p.click('input[name=rcAck]'); await p.click('#rcDone'); await p.waitForSelector('#tabs');
    return { page: p, secret, recovery };
  };
  /** A member phone, invited and approved through the app's own functions. */
  H.addMember = async (parent, email, role = 'caregiver', perms = {}, opts = {}) => {
    const p = await H.device(opts); await H.signIn(p, email); await p.waitForSelector('#oJoin');
    const code = await parent.evaluate(([r, pm]) => Sync.createInvite(r, pm).then(x => x.code), [role, perms]);
    await p.evaluate(([c, n]) => Sync.requestJoin(c, n, null), [code, opts.name || email.split('@')[0]]);
    await parent.evaluate(() => Sync.loadAdmin());
    const req = await parent.evaluate(e => Sync.st.requests.find(r => r.email === e), email);
    await parent.evaluate(r => Sync.decide(r, true, { manualOk: true }), req);
    await parent.evaluate(() => { if (/data-approve/.test($('#sheet').innerHTML)) { $('#sheet').hidden = $('#sheetBack').hidden = true; $('#sheet').innerHTML = ''; } });   // (the request may have popped up meanwhile: decided here, so away with it)
    assert_(await p.evaluate(() => Sync.checkApproval()), email + ' was approved');
    await p.evaluate(() => { tab = 'day'; render(); }); await p.waitForSelector('#tabs');
    await H.syncNow(p); return p;
  };
  H.entries = p => p.evaluate(() => db.events.map(e => ({ id: e.id, type: e.type, ts: e.ts, data: e.data, note: e.note, end: e.end == null ? null : e.end, child: e.child || null })).sort((a, b) => (a.id < b.id ? -1 : 1)));
  H.close = async () => {
    try { await browser.close(); } catch (e) {} try { if (su) await su.end(); if (shim) await shim.close(); } catch (e) {}
    server.close(); if (startCluster.stop) startCluster.stop(); fs.rmSync(tmp, { recursive: true, force: true });
  };
  return H;
}
function assert_(v, m) { if (!v) throw new Error(m || 'assertion failed'); }
module.exports = { setup };
