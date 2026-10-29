// Speed with a big log: a family that has logged every day for over a year (about ten thousand entries). Each page must stay quick,
// the Stats page over a whole year included, saving must stay cheap, and the page's view of the log must follow every kind of
// change (an entry added, moved to another day, removed, another child shown, entries that arrive from another phone). The budgets
// are loose enough for a slow CI runner and far below what feels sluggish on a phone.   node tests/perf.test.js
const assert = require('assert');
/* global startOfDay, kids, stamp, save, render, Auth, db, Store, Kids, saveProfile, setKid, eventsOnDay, dayStats, removeEvent, Sync */
/* global tab:writable, viewDay:writable, statDays:writable */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 6).join('\n    ')); } };
const BUDGET = { day: 150, routine: 100, month: 150, stats365: 300, stats30: 300, guide: 120, family: 150, more: 120, saveSync: 80, reload: 6000, heapMB: 200, byDay365: 60 };

(async () => {
  const H = await setup({ port: 8152 });
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    const timeRender = (t, extra) => P.evaluate(async ([t, extra]) => {
      tab = t; if (extra) Object.assign(window, extra); const a = [];
      for (let i = 0; i < 3; i++) { const s = performance.now(); render(); a.push(performance.now() - s); await new Promise(r => setTimeout(r, 20)); }
      return Math.round(a.sort((x, y) => x - y)[1]);
    }, [t, extra || null]);

    await step('a log of ten thousand entries over 420 days, for two children', async () => {
      const made = await P.evaluate(() => {
        const DAY = 864e5, now = Date.now(), today = startOfDay(now), k1 = kids()[0];
        k1.birth = new Date(now - 420 * DAY).toISOString().slice(0, 10);
        const k2 = Kids.make(kids(), 'Mia'); k2.birth = '2022-03-10'; kids().push(k2); (db.meta.ms || (db.meta.ms = {}))[k1.id] = 999; db.meta.ms[k2.id] = 999; (db.meta.solids || (db.meta.solids = {}))[k1.id] = 1;
        let n = 0; const ev = (type, ts, data, child, extra = {}) => { db.events.push({ id: 'p' + (n++).toString(36), type, ts, data, note: n % 3 === 0 ? 'note ' + n : '', updated: stamp(), by: Auth.id, child, ...extra }); };
        for (let d = 0; d < 420; d++) {
          const day = today - d * DAY;
          for (let i = 0; i < 7; i++) ev('feed', day + (6 + i * 2.3) * 36e5, i % 2 ? { kind: 'bottle', ml: 90 + (i * 13) % 60, milk: 'Formula' } : { kind: 'breast', side: 'L', min: 15 }, k1.id);
          for (let i = 0; i < 5; i++) ev('diaper', day + (7 + i * 3) * 36e5, { pee: true, poo: i % 2 === 0 }, k1.id);
          for (let i = 0; i < 3; i++) { const s = day + (9 + i * 4) * 36e5; ev('sleep', s, { nap: i < 2 }, k1.id, { end: s + (i < 2 ? 70 : 600) * 60e3 }); }
          ev('play', day + 15 * 36e5, { kind: 'Tummy time', min: 20 }, k1.id);
          for (let i = 0; i < 3; i++) ev('meal', day + (7.5 + i * 5) * 36e5, { meal: ['Breakfast', 'Lunch', 'Dinner'][i], what: 'toast and fruit' }, k2.id);
          for (let i = 0; i < 3; i++) ev('potty', day + (8 + i * 4) * 36e5, { pee: true, poo: i === 1 }, k2.id);
          ev('play', day + 16 * 36e5, { kind: 'Park', min: 60 }, k2.id);
          if (d % 10 === 0) ev('health', day + 18 * 36e5, { temp: 37.1 }, k1.id);
        }
        saveProfile(); save(true); setKid(k1.id); tab = 'day'; viewDay = startOfDay(Date.now()); render();
        return db.events.length;
      });
      assert(made > 9000, 'entries: ' + made);
    });

    await step('every page draws within its budget, the Stats page over a year and over a month included', async () => {
      const got = {};
      for (const [t, extra] of [['day'], ['routine'], ['month'], ['stats365', { statDays: 365 }], ['stats30', { statDays: 30 }], ['guide'], ['family'], ['more']]) {
        got[t] = await timeRender(t.replace(/\d+$/, ''), extra);
      }
      await P.evaluate(() => { tab = 'day'; statDays = 7; render(); });
      const over = Object.entries(got).filter(([k, v]) => v > BUDGET[k]);
      console.log('    ms:', JSON.stringify(got));
      assert.deepEqual(over, [], 'over budget (ms): ' + JSON.stringify(over) + ' of ' + JSON.stringify(BUDGET));
    });

    await step('a year of days is looked up from the page\'s view of the log, not by scanning it each time', async () => {
      const ms = await P.evaluate(() => { const t0 = startOfDay(Date.now()), s = performance.now(); let n = 0; for (let i = 0; i < 365; i++) n += eventsOnDay(t0 - i * 864e5).length; for (let i = 0; i < 365; i++) dayStats(t0 - i * 864e5); return [Math.round(performance.now() - s), n]; });
      console.log('    ms:', ms[0], 'entries seen:', ms[1]);
      assert(ms[1] > 5000 && ms[0] < BUDGET.byDay365, `365 days of lookups took ${ms[0]} ms`);
    });

    await step('the view follows every change: an entry added, moved to another day, removed, another child shown, and one that arrives from another phone', async () => {
      const r = await P.evaluate(() => {
        const today = startOfDay(Date.now()), yday = today - 864e5, out = {};
        const n0 = eventsOnDay(today).length;
        const e = { id: 'perfx', type: 'feed', ts: today + 3 * 36e5, data: { kind: 'bottle', ml: 50 }, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id };
        db.events.push(e); out.added = eventsOnDay(today).length === n0 + 1;   // (before any save: the view notices the log grew)
        e.ts = yday + 3 * 36e5; e.updated = stamp(); save(true); out.moved = eventsOnDay(today).length === n0 && eventsOnDay(yday).some(x => x.id === 'perfx');
        removeEvent(e); out.removed = !eventsOnDay(yday).some(x => x.id === 'perfx');
        setKid(kids()[1].id); out.otherChild = eventsOnDay(today).every(x => x.child === kids()[1].id) && eventsOnDay(today).length > 0;
        setKid(kids()[0].id); out.back = eventsOnDay(today).length === n0;
        return out;
      });
      assert.deepEqual(r, { added: true, moved: true, removed: true, otherChild: true, back: true });
    });

    await step('saving the whole log blocks the page only briefly', async () => {
      const ms = await P.evaluate(async () => { const s = performance.now(); const p = Store.save(db); const sync = performance.now() - s; await p; return [Math.round(sync * 10) / 10, Math.round(performance.now() - s)]; });
      console.log('    ms: blocking', ms[0], 'total', ms[1]);
      assert(ms[0] < BUDGET.saveSync, `blocked for ${ms[0]} ms`);
    });

    let G;
    await step('the whole log goes up, another phone pulls it, and entries from there show on this one without a redraw of the whole view', async () => {
      await H.syncNow(P);
      G = await H.addMember(P, 'gran@x.com', 'family', {});
      assert.equal(await G.evaluate(() => db.events.length), await P.evaluate(() => db.events.length), 'the other phone has it all');
      await G.evaluate(() => { db.events.push({ id: 'fromgran', type: 'diaper', ts: startOfDay(Date.now()) + 5 * 36e5, data: { pee: true }, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id }); save(); });
      await H.syncNow(G); await H.syncNow(P);
      assert(await P.evaluate(() => eventsOnDay(startOfDay(Date.now())).some(e => e.id === 'fromgran')), 'seen here after the sync');
    });

    await step('reopening the app with the big log is quick, and memory stays modest', async () => {
      const t = Date.now(); await P.reload(); await P.waitForSelector('#tabs'); await P.waitForFunction(() => db.events.length > 9000);
      const ms = Date.now() - t, heap = await P.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0));
      console.log('    reload ms:', ms, 'heap MB:', heap);
      assert(ms < BUDGET.reload, `reload took ${ms} ms`); assert(heap < BUDGET.heapMB, `heap ${heap} MB`);
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, [], 'page errors'); assert.deepEqual(p.csp, [], 'CSP'); }
    });
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} speed checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
