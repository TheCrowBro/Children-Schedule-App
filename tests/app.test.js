// The app itself: crash reports (off until turned on; what is kept and what is sent, with nothing about the person; the server's
// checks and limits), tablets and phones on their side (the clock beside the entries, two columns elsewhere), and the account deletion
// that is in the app.   node tests/app.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
/* global Crash, Report, render, Store, startOfDay, followToday, Lock */
/* global viewDay:writable, calMonth:writable */
/* global tab:writable */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 4).join('\n    ')); } };
const shot = async (p, name) => { if (process.env.LL_SHOTS) await p.screenshot({ path: path.join(process.env.LL_SHOTS, name + '.png'), fullPage: false }); };

(async () => {
  const H = await setup({ port: 8140 });
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    const more = () => P.evaluate(() => { tab = 'more'; render(); });
    const toastSays = re => P.waitForFunction(r => new RegExp(r).test(document.querySelector('#toast').textContent), re.source, { timeout: 5000 });

    await step('crash reports are off until turned on: nothing is noted, and More → App updates says what a report would carry', async () => {
      await more();
      assert.equal(await P.$$eval('[name=crashOn]', l => l.length), 2, 'On and Off');
      assert.equal(await P.isChecked('[name=crashOn][value="0"]'), true);
      assert.equal(await P.evaluate(() => Crash.on()), false);
      assert.equal(await P.evaluate(() => Crash.record('boom', 'app.js', 1, 2, 'Error: boom\n    at x (https://localhost/app.js:1:2)')), false, 'not kept while off');
      assert.deepEqual(await P.evaluate(() => Crash.list()), []);
      const t = await P.$eval('#appCard', e => e.textContent);
      assert(/Never an entry, a name, an address/.test(t) && /without your sign-in/.test(t), t);
      assert(!(await P.$('#crashSend')), 'no Send now while off');
    });

    await step('turned on, an error is noted with where in the app\'s code it happened, addresses and web addresses blanked, the same crash once, at most 20, and real errors on the page are caught', async () => {
      await P.click('[name=crashOn][value="1"]');
      assert.equal(await P.evaluate(() => Crash.on()), true); assert(await P.$('#crashSend'), 'Send now appears');
      assert(/Nothing waiting/.test(await P.textContent('#crashN')));
      const kept = await P.evaluate(() => { Crash.record('Cannot read x of undefined for mum@x.com at https://example.com/a?b=1', 'https://localhost/app.js?v=3', 12, 34, 'TypeError: x\n    at save (https://localhost/app.js:12:34)\n    at HTMLButtonElement.onclick (https://localhost/app.js:99:9)'); return Crash.list(); });
      assert.equal(kept.length, 1); const c = kept[0];
      assert.equal(c.where, 'app.js:12:34');
      assert(/\[address\]/.test(c.msg) && /\[url\]/.test(c.msg) && !/mum@|example\.com/.test(c.msg), c.msg);
      assert(/^\d{4}-\d\d-\d\dT\d\d:00Z$/.test(c.at), 'the hour only: ' + c.at);
      assert(/at save app\.js:12:34/.test(c.stack) && /onclick app\.js:99:9/.test(c.stack) && !/localhost/.test(c.stack), c.stack);
      assert.equal(await P.evaluate(() => Crash.record('Cannot read x of undefined for mum@x.com at https://example.com/a?b=1', 'app.js', 12, 34)), false, 'the same crash again is not kept twice');
      await P.evaluate(() => { for (let i = 0; i < 30; i++) Crash.record('crash ' + i, 'app.js', i, 1); });
      assert.equal(await P.evaluate(() => Crash.list().length), 20);
      await P.evaluate(() => { Crash.clear(); setTimeout(() => { throw new Error('a real one'); }, 0); setTimeout(() => Promise.reject(new Error('nobody listening')), 0); });
      await P.waitForFunction(() => Crash.list().length === 2, null, { timeout: 5000 });
      const real = await P.evaluate(() => Crash.list());
      P.errs = P.errs.filter(m => !/a real one|nobody listening/.test(m));   // (thrown on purpose)
      assert(real.some(x => /a real one/.test(x.msg)), JSON.stringify(real));
      assert(real.some(x => /nobody listening/.test(x.msg)), JSON.stringify(real));
      await more(); assert(/2 reports waiting/.test(await P.textContent('#crashN')));
    });

    await step('what is waiting goes with the public key only (never the sign-in) and is emailed on without saying who; sent ones are let go; Send now', async () => {
      H.shim.o.mail.length = 0;
      await P.evaluate(() => { Crash.clear(); Crash.record('boom at save', 'app.js', 5, 6, 'Error: boom\n    at save (https://localhost/app.js:5:6)'); });
      const reqs = []; const seen = r => { if (/crash-report/.test(r.url())) reqs.push(r.headers()); }; P.on('request', seen);
      assert.equal(await P.evaluate(() => Crash.flush()), 'sent'); P.off('request', seen);
      assert.equal(reqs.length, 1); assert.equal(reqs[0].authorization, 'Bearer anon', 'the public key, not the session');
      const m = H.shim.o.mail.at(-1);
      assert.equal(m.to, H.shim.o.reportTo); assert(/crash report: dev \((android|web)\)/.test(m.subject), m.subject);   // (the test phone's platform)
      assert(/boom at save/.test(m.text) && /app\.js:5:6/.test(m.text) && /without a sign-in/.test(m.text), m.text);
      assert(!/mum|Leo|x\.com/.test(m.text), 'nothing about the person: ' + m.text);
      assert.deepEqual(await P.evaluate(() => Crash.list()), [], 'sent ones are let go');
      assert.equal(await P.evaluate(() => Crash.flush()), 'nothing');
      await P.evaluate(() => Crash.record('again', 'app.js', 1, 1)); await more();
      assert(/1 report waiting/.test(await P.textContent('#crashN')));
      await P.click('#crashSend'); await toastSays(/Thank you/);
      assert.equal(await P.evaluate(() => Crash.list().length), 0); assert(/Nothing waiting/.test(await P.textContent('#crashN')));
    });

    await step('the limits (5 an hour from one phone) keep a report for later; language reports count apart; off forgets what was noted; the choice survives a restart', async () => {
      await H.q('delete from report_limits');
      const r = []; for (let i = 0; i < 6; i++) r.push(await P.evaluate(i => { Crash.record('limit ' + i, 'app.js', 1, 1); return Crash.flush(); }, i));
      assert.deepEqual(r, ['sent', 'sent', 'sent', 'sent', 'sent', 'busy']);
      assert.equal(await P.evaluate(() => Crash.list().length), 1, 'kept to try later');
      assert.equal(await P.evaluate(() => Report.send({ lang: 'en', screen: 'day', says: 'x', platform: 'web' })), 'sent', 'a language report from the same phone');
      await more(); await P.click('#crashSend'); await toastSays(/a lot of reports/);
      await H.q('delete from report_limits');
      await P.reload(); await P.waitForSelector('.quick');
      assert.equal(await P.evaluate(() => Crash.on()), true, 'still on after a restart'); assert.equal(await P.evaluate(() => Crash.list().length), 1, 'still waiting');
      await more(); await P.click('[name=crashOn][value="0"]');
      assert.equal(await P.evaluate(() => Crash.on()), false); assert.deepEqual(await P.evaluate(() => Crash.list()), [], 'off forgets');
      assert.equal(await P.evaluate(() => Crash.flush()), 'off');
    });

    await step('the crash-report handler on its own: CORS for the app, only POST, every field checked, addresses blanked again, cut to size, the limits, and never the address', async () => {
      const { handle, senderKey, LIMITS } = await import(path.join(__dirname, '..', 'supabase', 'functions', 'crash-report', 'handler.mjs'));
      const env = { to: 'secret@example.test', from: 'x <a@b.c>' }, out = [];
      const deps = (o = {}) => ({ who: async () => 'k', allow: async () => (o.allow === undefined ? true : o.allow), send: async m => { if (o.fail) throw new Error('x'); out.push(m); } });
      const req = (body, method = 'POST', headers = {}) => new Request('https://x.test/functions/v1/crash-report', { method, headers, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
      const good = { v: '1.13.0', platform: 'android', lang: 'fr', crashes: [{ at: '2026-10-28T14:00Z', msg: 'boom', where: 'app.js:1:2', stack: 'at x app.js:1:2' }] };
      const res = async (r, e = env, d = deps()) => { const x = await handle(r, e, d); const t = await x.text(); assert(!t.includes('secret@example.test'), t); return [x.status, x.headers.get('access-control-allow-origin')]; };
      assert.deepEqual(await res(req(null, 'OPTIONS')), [204, '*']); assert.deepEqual(await res(req(null, 'GET')), [405, '*']);
      assert.deepEqual(await res(req(good), { to: '', from: '' }), [503, '*'], 'not set up yet');
      assert.equal((await res(req('{nope')))[0], 400); assert.equal((await res(req({ ...good, v: 'one point two!' })))[0], 400); assert.equal((await res(req({ ...good, platform: 'tv' })))[0], 400);
      assert.equal((await res(req({ ...good, lang: 'French' })))[0], 400); assert.equal((await res(req({ ...good, crashes: [] })))[0], 400); assert.equal((await res(req({ ...good, crashes: 'x' })))[0], 400);
      assert.equal((await res(req({ ...good, crashes: [{ msg: '  ' }] })))[0], 400); assert.equal((await res(req({ ...good, crashes: [{ msg: 'x', at: 'yesterday' }] })))[0], 400, 'a time that is not an hour');
      assert.equal((await res(req('x'.repeat(LIMITS.body + 1))))[0], 413);
      assert.equal((await res(req(good), env, deps({ allow: false })))[0], 429); assert.equal((await res(req(good), env, { ...deps(), allow: async () => { throw new Error('db'); } }))[0], 503);
      assert.equal((await res(req(good), env, deps({ fail: true })))[0], 502);
      assert.equal((await res(req(good)))[0], 200); assert(/1\.13\.0 \(android\)$/.test(out.at(-1).subject) && /Language: fr/.test(out.at(-1).text), out.at(-1).subject);
      const many = { ...good, lang: '', crashes: Array.from({ length: 25 }, (_, i) => ({ msg: `crash ${i} by mum@x.com see https://x.test/p?q=1 ok`, where: 'w'.repeat(200), stack: 's'.repeat(1500) })) };
      assert.equal((await res(req(many)))[0], 200);
      const t = out.at(-1).text; assert(/20 crashes/.test(out.at(-1).subject), out.at(-1).subject);
      assert(!/mum@x\.com|x\.test/.test(t) && /\[address\]/.test(t) && /\[url\] ok/.test(t), 'blanked again: ' + t.slice(0, 200));
      assert(/crash 19/.test(t) && !/crash 20/.test(t), 'at most 20'); assert(/Language: unknown/.test(t));
      assert(new RegExp(`  w{${LIMITS.where}}\\n`).test(t) && !new RegExp(`w{${LIMITS.where + 1}}`).test(t), 'where is cut'); assert(new RegExp(`^s{${LIMITS.stack}}$`, 'm').test(t) && !new RegExp(`s{${LIMITS.stack + 1}}`).test(t), 'the stack is cut');
      const k = await senderKey(req(good, 'POST', { 'x-forwarded-for': '203.0.113.9' }), 's/crash');
      assert(/^[0-9a-f]{64}$/.test(k)); assert.notEqual(k, await senderKey(req(good, 'POST', { 'x-forwarded-for': '203.0.113.9' }), 's'), 'salted apart from language reports');
      const lr = await import(path.join(__dirname, '..', 'supabase', 'functions', 'language-report', 'handler.mjs'));
      assert.equal((await lr.handle(req({ lang: 'pt', screen: 'more', says: 'olá' }), env, deps())).status, 200, 'language reports still work on the shared helpers');
    });

    await step('on a tablet the Day page puts the clock beside the entries and the other pages use two columns; a phone on its side too; a phone upright as before; the first screen stays narrow', async () => {
      await P.setViewportSize({ width: 1024, height: 768 });
      await P.evaluate(() => { tab = 'day'; render(); });
      const day = await P.evaluate(() => { const v = document.querySelector('#view'), cw = v.querySelector('.clockwrap').getBoundingClientRect(), q = v.querySelector('.quick').getBoundingClientRect(); return { display: getComputedStyle(v).display, tab: v.dataset.page, clockRight: cw.right, quickLeft: q.left, clockLeft: cw.left }; });
      assert.equal(day.display, 'grid'); assert.equal(day.tab, 'day'); assert(day.clockRight <= day.quickLeft && day.clockLeft < 100, 'the clock on the left: ' + JSON.stringify(day));
      await shot(P, 'tablet-day');
      for (const t of ['stats', 'guide', 'more', 'month']) {
        await P.evaluate(x => { tab = x; render(); }, t);
        assert.equal(await P.evaluate(() => getComputedStyle(document.querySelector('#view')).columnCount), '2', t + ' in two columns');
        await shot(P, 'tablet-' + t);
      }
      await P.evaluate(() => { tab = 'routine'; render(); }); assert.equal(await P.evaluate(() => getComputedStyle(document.querySelector('#view')).columnCount), 'auto', 'the routine stays one column');
      const w = await P.$eval('#view', v => v.getBoundingClientRect().width); assert(w <= 721, 'and narrow: ' + w);
      await shot(P, 'tablet-routine');
      await P.setViewportSize({ width: 844, height: 390 }); await P.evaluate(() => { tab = 'day'; render(); });
      assert.equal(await P.evaluate(() => getComputedStyle(document.querySelector('#view')).display), 'grid', 'a phone on its side');
      const clockW = await P.$eval('.clock', c => c.getBoundingClientRect().width); assert(clockW <= 241, 'the clock fits the height: ' + clockW);
      await shot(P, 'landscape-day');
      await P.setViewportSize({ width: 390, height: 800 }); await P.evaluate(() => render());
      assert.equal(await P.evaluate(() => getComputedStyle(document.querySelector('#view')).display), 'block', 'upright as before');
      assert.equal(await P.$eval('.clock', c => Math.round(c.getBoundingClientRect().width)), 358);
      const G = await H.device(); await G.setViewportSize({ width: 1024, height: 768 }); await G.waitForSelector('#lEmail');
      assert.equal(await G.evaluate(() => document.querySelector('#view').dataset.page), 'signin');
      const gw = await G.$eval('#view', v => v.getBoundingClientRect().width); assert(gw <= 721, 'the first screen stays narrow: ' + gw);
      await shot(G, 'tablet-signin');
    });

    await step('deleting the account is in the app: More → Account has Delete account, which calls delete_my_account on the server (proved end to end in the e2e suite)', async () => {
      await more(); assert(await P.$('#delAcct'), 'the button');
      const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
      assert(/create (or replace )?function delete_my_account/.test(schema), 'the server-side function');
      assert(/delete_my_account/.test(fs.readFileSync(path.join(__dirname, '..', 'account.js'), 'utf8')), 'called from the app');
    });

    await step('the day follows the calendar: paused overnight and resumed, the page is on the new today; a day gone back to on purpose stays through a short pause and returns after a long one; midnight while open; the Month page too; a new entry on a past day says so', async () => {
      const skew = ms => P.evaluate(ms => { if (!window.__real) window.__real = Date.now.bind(Date); Date.now = () => window.__real() + ms; }, ms);
      const pause = async ms => { await P.evaluate(() => window.__emit('appStateChange', { isActive: false })); await skew(ms); await P.evaluate(() => window.__emit('appStateChange', { isActive: true })); await P.waitForFunction(() => viewDay === startOfDay(Date.now()) || Date.now() - shownAt < 1000, null, { timeout: 3000 }).catch(() => {}); };   // (the resume is handled a moment later)
      const shown = () => P.evaluate(() => [viewDay === startOfDay(Date.now()), document.querySelector('.datenav .d').textContent.slice(0, 5)]);
      await more(); await P.click('[name=lockMode][value=off]'); await P.waitForFunction(() => Lock.mode === 'off');   // (the app lock would cover the page after a day away: its own tests are in e2e)
      await P.evaluate(() => { tab = 'day'; viewDay = startOfDay(Date.now()); render(); });
      await pause(24 * 3600e3); assert.deepEqual(await shown(), [true, 'Today'], 'resumed the next day: today; ' + JSON.stringify(await P.evaluate(() => [viewDay, startOfDay(Date.now()), Date.now(), tab, Lock.mode, document.querySelector('.datenav .d') && document.querySelector('.datenav .d').textContent])));
      await P.click('[data-nav="-1"]'); assert.equal((await shown())[0], false, 'yesterday, on purpose');
      await pause(24 * 3600e3 + 10 * 60e3); assert.equal((await shown())[0], false, 'ten minutes away: still the day chosen');
      await pause(24 * 3600e3 + 2 * 3600e3); assert.deepEqual(await shown(), [true, 'Today'], 'two hours away: back to today');
      await skew(50 * 3600e3); assert.equal((await shown())[0], false, 'midnight passed while the app stayed open');   // (a day after the last pause, whatever the time of day)
      assert.equal(await P.evaluate(() => followToday(false)), true, 'the minute timer moves it'); assert.deepEqual(await shown(), [true, 'Today']);
      await P.evaluate(() => { tab = 'month'; calMonth = new Date(2020, 0, 1); render(); });
      await pause(50 * 3600e3 + 10 * 60e3); assert.equal(await P.evaluate(() => calMonth.getFullYear()), 2020, 'a short pause keeps the month');
      await pause(50 * 3600e3 + 3 * 3600e3); assert.equal(await P.evaluate(() => calMonth.getFullYear() === new Date(Date.now()).getFullYear() && calMonth.getMonth() === new Date(Date.now()).getMonth()), true, 'a long pause: this month again');
      await P.evaluate(() => { tab = 'day'; viewDay = startOfDay(Date.now()); render(); }); await P.click('[data-nav="-1"]'); await P.click('[data-add=feed]'); await P.waitForSelector('#sheet #ts');
      assert(/goes on .*, not today/.test(await P.textContent('#sheet .pastday')), 'the sheet says which day'); assert.equal(await P.$eval('#ts', i => i.value.slice(11)), '12:00', 'noon of that day');
      await P.click('#cancel'); await P.evaluate(() => { viewDay = startOfDay(Date.now()); render(); }); await P.click('[data-add=feed]'); await P.waitForSelector('#sheet #ts');
      assert(!(await P.$('#sheet .pastday')), 'nothing to say on today'); await P.click('#cancel');
      await P.evaluate(() => { Date.now = window.__real; tab = 'day'; viewDay = startOfDay(Date.now()); calMonth = new Date(viewDay); render(); });
    });

    await step('signing out takes the decrypted pictures, the backup copy and quarantined copies off the phone along with the log', async () => {
      await P.evaluate(async () => { await Store.blobPut('pic1', new Blob(['x'])); });
      assert.equal(await P.evaluate(async () => !!(await Store.blobGet('pic1'))), true, 'a picture kept on the phone');
      await more(); await P.click('#signOut'); await P.waitForSelector('#lEmail');
      assert.equal(await P.evaluate(async () => await Store.blobGet('pic1')), null, 'gone with the log');
      assert.equal(await P.evaluate(() => db.events.length), 0);
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, [], 'page errors'); assert.deepEqual(p.csp, [], 'CSP'); }
    });
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} app checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
