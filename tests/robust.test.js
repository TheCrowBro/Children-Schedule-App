// Robustness: hostile input, randomized multi-phone convergence under outages / restarts / server errors, and targeted failure scenarios.
//   node tests/robust.test.js        (FUZZ_SEEDS=7,99 FUZZ_STEPS=70 to change the random runs)
const assert = require('assert');
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
let afterStep = async () => {};
const step = async (name, fn) => { if (process.env.ONLY && !name.includes(process.env.ONLY)) return; const t0 = Date.now(); try { await fn(); ok++; console.log('✓', name, `(${((Date.now() - t0) / 1000).toFixed(1)}s)`); } catch (e) { failed++; console.log('✗', name, '\n   ', String(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')); } finally { await afterStep(); } };
const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

(async () => {
  const H = await setup(), { q, sleep, syncNow } = H;
  try {
    const { page: P } = await H.createLog('mum@x.com');
    const X = await H.addMember(P, 'dad@x.com', 'caregiver', { edit_others: true, delete_others: true });
    const Y = await H.addMember(P, 'nan@x.com', 'caregiver', { edit_others: true, delete_others: true });
    const phones = [P, X, Y], ctxOf = p => p.context();
    // whatever a step breaks on purpose (outages, hangs, 500s) is switched off again afterwards, even if the step failed
    afterStep = async () => { for (const p of H.pages) { const c = p.context(); c.__down = false; c.__flaky = 0; c.__garbage = false; c.__hang = false; } H.shim.o.refreshFail = false; H.shim.o.expiresIn = 3600; await Promise.all(H.pages.map(p => p.evaluate(() => { try { delete LL_CONFIG.netTimeoutMs; } catch (e) { /* ignore */ } }).catch(() => {}))); };
    const settle = async () => { for (const p of phones) { ctxOf(p).__down = false; ctxOf(p).__flaky = 0; ctxOf(p).__garbage = false; } for (let r = 0; r < 3; r++) for (const p of phones) await syncNow(p); };
    const serverTruth = async () => {   // every live row, decrypted by the parent's phone
      const rows = await q('select * from events where deleted=false order by id'), baby = await P.evaluate(() => db.meta.babyId);
      return P.evaluate(async ([b, rs]) => { const out = []; for (const r of rs) { const d = await E2EE.decryptRow(b, r); out.push(d.entry ? { id: d.entry.id, type: d.entry.type, ts: d.entry.ts, data: d.entry.data, note: d.entry.note, end: d.entry.end == null ? null : d.entry.end, child: d.entry.child || null } : { id: r.id, undecryptable: true }); } return out; }, [baby, rows]);
    };
    const converged = async label => {
      await settle(); const sets = []; for (const p of phones) sets.push(await H.entries(p));
      for (let i = 1; i < sets.length; i++) {
        const a = new Map(sets[0].map(e => [e.id, JSON.stringify(e)])), b = new Map(sets[i].map(e => [e.id, JSON.stringify(e)])), d = [];
        for (const [id, v] of a) if (!b.has(id)) d.push(`only on phone 0: ${id}`); else if (b.get(id) !== v) d.push(`differs ${id}: ${v} vs ${b.get(id)}`);
        for (const id of b.keys()) if (!a.has(id)) d.push(`only on phone ${i}: ${id}`);
        assert.equal(d.length, 0, `${label}: phone ${i} differs from phone 0:\n      ${d.slice(0, 6).join('\n      ')}`);
      }
      assert.deepEqual(await serverTruth(), sets[0], `${label}: phones differ from what the server holds`);
      for (const p of phones) { const pend = await p.evaluate(() => ({ dirty: db.events.filter(e => e.updated > db.meta.pushedAt).length, tomb: db.deleted.length, bad: Sync.st.bad, state: Sync.st.state })); assert.deepEqual(pend, { dirty: 0, tomb: 0, bad: 0, state: 'ok' }, `${label}: leftovers ${JSON.stringify(pend)}`); }
      return sets[0];
    };

    // ---------------------------------------------------------------------------------------
    await step('hostile text (names, notes, baby name) is shown as plain text everywhere and never runs', async () => {
      const XSS = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"'><svg onload=window.__xss=3>`;
      const Z = await H.addMember(P, 'z@x.com', 'family', {}, { name: XSS });
      await P.evaluate(x => { db.events.push({ id: uid(), type: 'feed', ts: Date.now(), data: { kind: 'bottle', ml: 5 }, note: x, updated: stamp(), by: Auth.id }); db.baby.kids[0].name = x; db.baby.name = x; Sync.pushBaby(); Sync.setDisplayName(x); save(); }, XSS);
      for (const p of [P, X, Z]) await syncNow(p); await syncNow(P);
      for (const p of [P, X, Z]) {
        for (const t of ['day', 'month', 'stats', 'family', 'more']) { await p.click(`[data-tab=${t}]`); await sleep(120); }
        if (p === P) { await p.click('[data-tab=family]'); await p.click('#actBtn'); await sleep(500); }
        const r = await p.evaluate(() => ({ xss: window.__xss, imgs: document.querySelectorAll('#view img, #sheet img, #title img').length, scripts: document.querySelectorAll('#view script, #sheet script, #title script').length, handlers: document.querySelectorAll('[onerror],[onload],[onclick]').length, text: document.body.textContent }));
        assert.equal(r.xss, undefined, 'script ran'); assert.deepEqual([r.imgs, r.scripts, r.handlers], [0, 0, 0], 'markup was injected');
        if (p === P) await p.evaluate(() => document.querySelector('#actClose') && document.querySelector('#actClose').click());
      }
      await X.click('[data-tab=day]'); await X.waitForFunction(() => document.querySelector('#view').textContent.includes('<img src=x onerror='));   // visible as literal text
      assert((await X.textContent('#title')).includes('<img src=x'), 'baby name shown literally in the title');
      await P.click('[data-tab=family]'); assert((await P.textContent('#view')).includes('<img src=x'), 'hostile display names are literal text');
      await P.evaluate(() => { db.events.filter(e => e.note.includes('<img')).forEach(removeEvent); save(); }); await converged('after the hostile-text test');
    });

    // ---------------------------------------------------------------------------------------
    const seeds = (process.env.FUZZ_SEEDS || '7,99').split(',').map(Number), steps = +(process.env.FUZZ_STEPS || 60);
    for (const seed of seeds) await step(`random use by three phones (seed ${seed}, ${steps} steps): outages, 500s, restarts, concurrent edits and deletes all converge, nothing is lost`, async () => {
      const R = rng(seed), pick = a => a[Math.floor(R() * a.length)], created = new Set(), deleted = new Set(), log = [];
      for (let i = 0; i < steps; i++) {
        const p = pick(phones), n = phones.indexOf(p), roll = R(), ctx = ctxOf(p);
        if (roll < 0.30) { const id = await p.evaluate(r => { const type = ['feed', 'diaper', 'sleep', 'vomit', 'play'][r % 5], data = { feed: { kind: 'bottle', ml: r % 200 }, diaper: { pee: true }, sleep: {}, vomit: { amount: 'Medium' }, play: { activity: 'Play', min: r % 60 } }[type]; const e = { id: uid(), type, ts: Date.now(), data, note: 'n' + r, updated: stamp(), by: Auth.id }; db.events.push(e); save(); return e.id; }, Math.floor(R() * 1e6)); created.add(id); log.push(`${n}:add`); }
        else if (roll < 0.50) { const id = await p.evaluate(r => { const e = db.events[r % (db.events.length || 1)]; if (!e) return null; e.note = 'edit' + r; e.updated = stamp(); save(); return e.id; }, Math.floor(R() * 1e6)); log.push(`${n}:edit`); void id; }
        else if (roll < 0.58) { const id = await p.evaluate(r => { const e = db.events[r % (db.events.length || 1)]; if (!e) return null; removeEvent(e); save(); return e.id; }, Math.floor(R() * 1e6)); if (id) deleted.add(id); log.push(`${n}:del`); }
        else if (roll < 0.70) { ctx.__down = !ctx.__down; log.push(`${n}:${ctx.__down ? 'offline' : 'online'}`); }
        else if (roll < 0.78) { ctx.__flaky = ctx.__flaky ? 0 : 0.4; log.push(`${n}:flaky=${ctx.__flaky}`); }
        else if (roll < 0.86) { await p.reload(); await p.waitForSelector('#tabs', { timeout: 20000 }); log.push(`${n}:restart`); }
        else { await syncNow(p); log.push(`${n}:sync`); }
      }
      try {
        const final = await converged(`seed ${seed}`);
        const have = new Set(final.map(e => e.id));
        // Entries created and never deleted by anyone must survive (edits may race deletes, so deleted ones may or may not remain).
        for (const id of created) if (!deleted.has(id)) assert(have.has(id), `entry ${id} was lost. Steps: ${log.join(' ')}`);
        for (const id of have) assert(created.has(id) || id, 'unexpected entry');
      } catch (e) { e.message += `\n    steps: ${log.join(' ')}`; throw e; }
    });

    // ---------------------------------------------------------------------------------------
    await step('server down during upload: entries survive an app restart while offline, then arrive intact', async () => {
      ctxOf(P).__down = true;
      const ids = await P.evaluate(() => [1, 2, 3].map(i => { const e = { id: uid(), type: 'feed', ts: Date.now(), data: { ml: 100 + i }, note: 'offline' + i, updated: stamp(), by: Auth.id }; db.events.push(e); save(); return e.id; }));
      await syncNow(P); assert.equal(await P.evaluate(() => Sync.st.state), 'offline');
      await P.reload(); await P.waitForSelector('#tabs'); assert.deepEqual(await P.evaluate(i => i.filter(x => db.events.some(e => e.id === x)).length, ids), 3, 'entries are still there after a restart while offline');
      ctxOf(P).__down = false; await syncNow(P); await syncNow(X); assert.equal(await X.evaluate(i => i.filter(x => db.events.some(e => e.id === x)).length, ids), 3);
      await converged('after outage');
    });
    await step('a captive-portal / garbage response is survived, and sync recovers by itself', async () => {
      ctxOf(P).__garbage = true; await P.evaluate(() => { db.events.push({ id: uid(), type: 'feed', ts: Date.now(), data: {}, note: 'during-garbage', updated: stamp(), by: Auth.id }); save(); });
      await syncNow(P); assert.notEqual(await P.evaluate(() => Sync.st.state), 'ok'); assert(await P.isVisible('#tabs'), 'the app still works');
      ctxOf(P).__garbage = false; await P.evaluate(() => Sync.run(true)); await converged('after garbage');
    });
    await step('repeated failures back off instead of hammering the server; a manual sync still tries', async () => {
      ctxOf(P).__flaky = 1; let hits = 0; await P.context().route('https://fake.supabase.co/rest/v1/**', r => { hits++; r.fallback(); });
      await syncNow(P); const first = hits; for (let i = 0; i < 5; i++) await P.evaluate(() => Sync.run());   // background triggers
      assert.equal(hits, first, 'background retries are held back after a failure');
      await syncNow(P); assert(hits > first, 'but a manual sync is attempted'); ctxOf(P).__flaky = 0; await P.context().unroute('https://fake.supabase.co/rest/v1/**'); await converged('after backoff');
    });
    await step('ten simultaneous syncs neither fail nor duplicate anything', async () => {
      const before = (await q('select count(*)::int c from events'))[0].c;
      await P.evaluate(() => Promise.all(Array.from({ length: 10 }, () => Sync.run(true)))); await converged('parallel syncs');
      assert.equal((await q('select count(*)::int c from events'))[0].c, before);
    });
    await step('a double-tap on Save creates one entry, not two', async () => {
      await P.click('[data-tab=day]'); const n0 = await P.evaluate(() => db.events.length);
      await P.click('[data-add=diaper]'); await P.dblclick('#save'); await sleep(300); assert.equal(await P.evaluate(() => db.events.length), n0 + 1);
    });
    await step('a failing token refresh keeps the session; the app recovers when the service does', async () => {
      await P.evaluate(() => { const k = 'MOCKSECURE:auth.v2', s = JSON.parse(localStorage.getItem(k)); s.exp = 0; localStorage.setItem(k, JSON.stringify(s)); });
      H.shim.o.refreshFail = true; await P.reload(); await P.waitForSelector('#tabs'); await syncNow(P);
      assert.equal(await P.evaluate(() => Auth.signedIn), true, 'still signed in while the auth service is down'); assert(await P.isVisible('#tabs'));
      H.shim.o.refreshFail = false; await syncNow(P); assert.equal(await P.evaluate(() => Sync.st.state), 'ok');
    });

    await step('saving fails (disk full): a loud warning appears, the entry still reaches the server, and saving resumes afterwards', async () => {
      await P.evaluate(() => { window.__realPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException('quota', 'QuotaExceededError'); }; });
      await P.evaluate(() => { db.events.push({ id: 'full1', type: 'feed', ts: Date.now(), data: {}, note: 'disk-full', updated: stamp(), by: Auth.id }); save(); });
      await P.waitForFunction(() => !Store.st.ok); assert(/Cannot save on this phone/.test(await P.textContent('#syncLine')), 'visible warning');
      await syncNow(P); assert.equal((await q(`select count(*)::int c from events where id='full1'`))[0].c, 1, 'the entry was still uploaded');
      await P.evaluate(() => { IDBObjectStore.prototype.put = window.__realPut; save(true); });
      await P.waitForFunction(() => Store.st.ok); assert(!/Cannot save/.test(await P.textContent('#syncLine')));
      assert.equal(await P.evaluate(async () => { await Store.whenSaved(); return (await Store.peek()).events.some(e => e.id === 'full1'); }), true, 'now on disk');
    });
    await step('a damaged local copy is set aside and restored from backup; with no backup the log is re-downloaded from the family log', async () => {
      const corrupt = key => P.evaluate(k => new Promise((res, rej) => { const r = indexedDB.open('littlelog'); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); k.forEach(x => t.objectStore('kv').put(x === 'db' ? 'garbage, not a log' : 'also garbage', x)); t.oncomplete = () => { r.result.close(); res(); }; }; r.onerror = rej; }), key);
      await corrupt(['db']); await P.reload(); await P.waitForSelector('#tabs');
      assert.equal(await P.evaluate(() => Store.st.recovered), true, 'restored from the backup copy'); assert((await P.evaluate(() => Store.quarantine())).length >= 1, 'the damaged copy was kept aside, not deleted');
      await converged('after restoring from backup');
      await corrupt(['db', 'db.bak']); await P.reload(); await P.waitForSelector('#tabs');
      assert.equal(await P.evaluate(() => Store.st.quarantined), true); await sleep(1500); await converged('after losing the local copy completely');
    });

    await step('phone clocks that are slow or fast do not make edits vanish, and an expired token is refreshed even when the phone\'s clock disagrees', async () => {
      H.shim.o.expiresIn = 25;   // short-lived sign-in tokens
      const S = await H.addMember(P, 'slow@x.com', 'caregiver', { edit_others: true }, { skew: -3600e3 });
      H.shim.o.expiresIn = 3600;
      const id = await P.evaluate(() => { const e = { id: uid(), type: 'feed', ts: Date.now(), data: {}, note: 'p0', updated: stamp(), by: Auth.id }; db.events.push(e); save(); return e.id; });
      await syncNow(P); await syncNow(S); assert.equal(await S.evaluate(i => db.events.some(e => e.id === i), id), true, 'slow phone got the entry: ' + JSON.stringify(await S.evaluate(() => ({ state: Sync.st.state, err: Sync.st.err, n: db.events.length, signedIn: Auth.signedIn }))));
      await sleep(30000);   // the phone thinks its token is good for another hour; the server knows better
      await S.evaluate(i => { const e = db.events.find(x => x.id === i); e.note = 'slow-edit'; e.updated = stamp(); save(); }, id);
      await syncNow(S); assert.equal(await S.evaluate(() => Sync.st.state), 'ok', 'refreshed the token and retried');
      await syncNow(P); assert.equal(await P.evaluate(i => db.events.find(e => e.id === i).note, id), 'slow-edit', 'a one-hour-slow phone\'s fresh edit is not discarded as old');
      const F = await H.addMember(P, 'fast@x.com', 'caregiver', { edit_others: true }, { skew: 600e3 });
      await syncNow(F);
      await F.evaluate(i => { const e = db.events.find(x => x.id === i); e.note = 'fast-edit'; e.updated = stamp(); save(); }, id); await syncNow(F);
      await syncNow(P); await P.evaluate(i => { const e = db.events.find(x => x.id === i); e.note = 'p-after'; e.updated = stamp(); save(); }, id); await syncNow(P);
      await syncNow(F); assert.equal(await F.evaluate(i => db.events.find(e => e.id === i).note, id), 'p-after', 'a later edit still wins over a fast phone\'s earlier one');
    });

    await step('a connection that hangs forever times out instead of freezing sync, and sync resumes afterwards', async () => {
      await P.evaluate(() => { db.events.push({ id: uid(), type: 'feed', ts: Date.now(), data: {}, note: 'during-hang', updated: stamp(), by: Auth.id }); save(); });
      await P.evaluate(() => { LL_CONFIG.netTimeoutMs = 2500; });   // (30 s in real use)
      ctxOf(P).__hang = true; const t0 = Date.now(); await syncNow(P); const took = Date.now() - t0; await P.evaluate(() => { delete LL_CONFIG.netTimeoutMs; });
      const stateWhileHung = await P.evaluate(() => Sync.st.state + ' / ' + Sync.st.err); ctxOf(P).__hang = false;
      assert(took < 20000, `gave up after ${took}ms`); assert(stateWhileHung.startsWith('offline'), 'reported as a network problem: ' + stateWhileHung); await syncNow(P); assert.equal(await P.evaluate(() => Sync.st.state), 'ok'); await converged('after the hang');
    });
    await step('an entry with unexpected contents (written with valid keys) cannot crash any screen', async () => {
      const baby = await P.evaluate(() => db.meta.babyId);
      // Craft entries the way a buggy or hostile writer could: right keys, wrong shapes.
      const crafted = await P.evaluate(async b => {
        const cur = E2EE.keysOf(b)[E2EE.epoch(b)], u8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)), te = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', u8(cur.main), 'AES-GCM', false, ['encrypt']), out = [];
        const weird = [
          { type: 'feed', data: { kind: { x: 1 }, ml: 'lots', min: [1], side: 5, milk: null } }, { type: 'diaper', data: 'not an object' }, { type: 'sleep', data: null },
          { type: 'vomit', data: { amount: { a: 1 }, projectile: 'yes' } }, { type: 'play', data: { activity: ['a'], min: Infinity } }, { type: 'wake', data: { min: -5, why: 12 } },
          { type: 'feed', data: { ml: 1e300, min: -1e300 }, note: 'x'.repeat(5000) }, { type: 'feed', data: { ml: 5 }, end: 'soon' },
        ];
        for (let i = 0; i < weird.length; i++) {
          const id = 'weird' + i, epoch = E2EE.epoch(b), iv = crypto.getRandomValues(new Uint8Array(12)), w = weird[i], updated = Date.now() + i;
          const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(`ll1|entry|${b}|${id}|${epoch}|m`) }, key, te.encode(JSON.stringify({ type: w.type, ts: Date.now() - i * 1000, end: w.end === undefined ? null : w.end, data: w.data, note: w.note || '', u: updated, a: null }))));
          out.push({ id, blob: btoa(String.fromCharCode(...iv, ...ct)), epoch, updated });
        }
        return out;
      }, baby);
      for (const r of crafted) await H.su.query(`insert into events(baby_id,id,blob,epoch,sensitive,updated,deleted,created_by) values ($1,$2,$3,$4,false,$5,false,(select user_id from members where email='mum@x.com'))`, [baby, r.id, r.blob, r.epoch, r.updated]);
      for (const p of phones) {
        await syncNow(p);
        for (const t of ['day', 'month', 'stats', 'family', 'more', 'day']) { await p.click(`[data-tab=${t}]`); await sleep(100); }
        const got = await p.evaluate(() => db.events.filter(e => e.id.startsWith('weird')).length); assert.equal(got, 8, 'the entries arrive (sanitized), they are not dropped or fatal');
        assert(await p.isVisible('#tabs'), 'the app still works'); assert(await p.evaluate(() => document.querySelector('#view').textContent.length > 20));
        const ml = await p.evaluate(() => db.events.filter(e => e.id.startsWith('weird')).map(e => (e.data || {}).ml)); assert(ml.every(v => v === undefined || (Number.isFinite(v) && v >= 0 && v <= 1e6)), 'numbers are clamped: ' + ml);
        assert.equal(await p.evaluate(() => Math.max(...db.events.filter(e => e.id.startsWith('weird')).map(e => e.note.length))), 1000, 'notes are capped');
      }
      await H.su.query(`update events set deleted=true, blob='', updated=updated+1000, synced_at=clock_timestamp() where id like 'weird%'`); for (const p of phones) await syncNow(p);
    });
    await step('an invite link from another app asks first, and doing nothing sends no request', async () => {
      const code = await P.evaluate(() => Sync.createInvite('friend', {}).then(x => x.code)); const before = (await q('select count(*)::int c from join_requests'))[0].c;
      const L = await H.device({ launchUrl: `app.littlelog.newborn://join?join=${code}`, dismiss: true }); await H.signIn(L, 'link@x.com'); await sleep(2500);
      assert((L.dialogs || []).some(m => /invitation to a baby log/.test(m)), 'asked: ' + JSON.stringify(L.dialogs));
      assert.equal((await q('select count(*)::int c from join_requests'))[0].c, before, 'declined: nothing was sent');
    });

    await step('12,000 entries: uploads, downloads on another phone, and the screens stay fast', async () => {
      const t0 = Date.now();
      await P.evaluate(n => { const now = Date.now(); for (let i = 0; i < n; i++) db.events.push({ id: 'big' + i + '_' + Math.random().toString(36).slice(2, 6), type: 'feed', ts: now - i * 60000, data: { kind: 'bottle', ml: 60 + (i % 60) }, note: '', updated: stamp(), by: Auth.id }); save(); }, 12000);
      await syncNow(P); const up = Date.now() - t0; assert.equal((await q(`select count(*)::int c from events where id like 'big%'`))[0].c, 12000);
      const t1 = Date.now(); await syncNow(X); const down = Date.now() - t1; assert.equal(await X.evaluate(() => db.events.filter(e => e.id.startsWith('big')).length), 12000);
      const r = await P.evaluate(() => { const t = performance.now(); tab = 'month'; render(); const a = performance.now() - t; statDays = 30; tab = 'stats'; render(); const b = performance.now() - t - a; tab = 'day'; render(); return { month: Math.round(a), stats: Math.round(b) }; });
      console.log(`    upload ${(up / 1000).toFixed(1)}s, download ${(down / 1000).toFixed(1)}s, month view ${r.month}ms, stats ${r.stats}ms`);
      assert(r.month < 2000 && r.stats < 2000, 'screens render in under 2s: ' + JSON.stringify(r));
      assert.equal(await P.evaluate(async () => { await Store.whenSaved(); return (await Store.peek()).events.length; }) >= 12000, true, 'all of it persisted on the phone');
      await converged('after the large sync');
    });

    for (const p of H.pages) { assert.deepEqual(p.errs, [], 'page errors: ' + p.errs); assert.deepEqual(p.csp, [], 'CSP violations: ' + p.csp); }
    ok++; console.log('✓ no page errors or content-security-policy violations on any phone');
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} robustness checks passed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
