// Expecting: a date of birth still to come makes the child "expecting": the Day page counts down to the due date, with a contraction
// timer and the hospital bag, until the baby is here and the log begins as usual.   node tests/expecting.test.js
const assert = require('assert');
/* global Stages, dkey, saveProfile, startOfDay, labourStats, E2EE, Auth, kids, stamp, save, render, reportBlocks, removeEvent, db, $ */
/* global tab:writable, viewDay:writable */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 4).join('\n    ')); } };

(async () => {
  const H = await setup({ port: 8141 });
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    /** A date `n` days from today (negative: ago). */
    const due = n => P.evaluate(n => { const d = new Date(); d.setDate(d.getDate() + n); return dkey(d.getTime()); }, n);
    const setBirth = (page, b) => page.evaluate(b => { kids()[0].birth = b; (db.meta.ms || (db.meta.ms = {}))[kids()[0].id] = 999; saveProfile(); tab = 'day'; viewDay = startOfDay(Date.now()); render(); if (!$('#sheet').hidden) $('#sheetBack').click(); }, b);
    let D;
    /** The expecting card's text, or why there is none. */
    const expectText = async page => { await page.waitForSelector('.expect', { timeout: 5000 }).catch(() => {}); const el = await page.$('.expect'); if (!el) throw new Error('no expecting view: ' + (await page.evaluate(() => kids()[0].birth + ' | ' + Stages.of(kids()[0].birth) + ' | ' + document.querySelector('#view').innerText.slice(0, 160).replace(/\n/g, ' ')))); return el.textContent(); };

    await step('a date of birth still to come makes the child expecting: the Day page counts down to the due date, without the baby buttons or the clock', async () => {
      await setBirth(P, await due(10));
      assert.equal(await P.evaluate(() => Stages.of(kids()[0].birth)), 'expecting');
      const t = await expectText(P); assert(/Leo is due in 10 days/.test(t) && /When the baby arrives, set the date of birth/.test(t), t);
      assert(!(await P.$('.quick')), 'no feed, diaper or sleep buttons yet'); assert(!(await P.$('.clockwrap')), 'no clock yet');
      assert(await P.$('.contr'), 'the contraction timer'); assert(await P.$('details[data-grp=bag]'), 'the hospital bag');
      await setBirth(P, await due(0)); assert.equal(await P.evaluate(() => Stages.of(kids()[0].birth)), 'newborn', 'on the due date itself the baby counts as born: the newborn buttons are what the day needs');
      await setBirth(P, await due(1)); assert(/Leo is due in 1 day\b/.test(await expectText(P)));
      await setBirth(P, await due(10));
      assert.equal(await P.evaluate(() => Stages.of('2020-02-30')), 'newborn', 'a date that is not a day counts as it did');
    });

    await step('the contraction timer: Start, the seconds counting, Stop; each one listed with how long and how far apart; the last hour summed up, and the 5-1-1 hint', async () => {
      await P.click('[data-cstart]'); await P.waitForSelector('[data-cstop]');
      const t0 = await P.textContent('#cElapsed'); await P.waitForFunction(t => document.querySelector('#cElapsed').textContent !== t, t0, { timeout: 4000 });
      await P.click('[data-cstop]');
      assert(!(await P.$('[data-cstop]')) && (await P.$('[data-cstart]')), 'ready for the next');
      const rows = await P.$$eval('.contr .stat', r => r.map(x => x.textContent)); assert.equal(rows.length, 1); assert(/\d+ s/.test(rows[0]), rows[0]);
      const e = await P.evaluate(() => db.events.find(x => x.type === 'contraction')); assert(e.end > e.ts && e.end - e.ts >= 1000, 'at least a second');
      assert(!/Last hour/.test(await P.textContent('.contr')), 'one is not a pattern');
      // six more in the last hour, five minutes apart, a minute long each
      await P.evaluate(() => { const now = Date.now(); for (let i = 1; i <= 6; i++) { const ts = now - i * 5 * 60e3; db.events.push({ id: 'c' + i, type: 'contraction', ts, end: ts + 60e3, data: {}, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id }); } save(); render(); });
      const t = await P.textContent('.contr');
      assert(/Last hour: 7 contractions, about \d+ s long, about 5 min apart/.test(t), t);
      assert(/time to call your midwife or the hospital/.test(t), 'the 5-1-1 hint');
      assert.equal(await P.$$eval('.contr .stat', r => r.length), 7, 'latest first');
      assert(/5 min apart/.test(await P.$eval('.contr .stat', r => r.textContent)));
      const st = await P.evaluate(() => { const now = Date.now(), mk = (ago, len) => ({ ts: now - ago * 60e3, end: now - ago * 60e3 + len * 1000 }); return [labourStats([mk(70, 60), mk(50, 60)], now), labourStats([mk(20, 40), mk(10, 50), mk(2, 60)], now), labourStats([mk(5, 30)], now), labourStats([], now)]; });
      assert.deepEqual(st, [{ n: 1, len: 0, gap: 0 }, { n: 3, len: 50, gap: 9 }, { n: 1, len: 0, gap: 0 }, { n: 0, len: 0, gap: 0 }]);
      // further apart: no hint
      await P.evaluate(() => { for (const e of db.events.filter(x => x.type === 'contraction' && /^c[1-6]$/.test(x.id))) removeEvent(e); const now = Date.now(); for (let i = 1; i <= 6; i++) { const ts = now - i * 12 * 60e3; db.events.push({ id: 'd' + i, type: 'contraction', ts, end: ts + 60e3, data: {}, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id }); } save(); render(); });
      const t2 = await P.textContent('.contr'); assert(/about 1[12] min apart/.test(t2) && !/time to call/.test(t2), t2);
    });

    await step('the other parent\'s phone sees the contractions too, the server keeps only ciphertext, and once the baby is here the contractions stay off the day and the report', async () => {
      D = await H.addMember(P, 'dad@x.com', 'family');
      await H.syncNow(P); await H.syncNow(D);
      await D.evaluate(() => { if (!$('#sheet').hidden) $('#sheetBack').click(); tab = 'day'; viewDay = startOfDay(Date.now()); render(); });
      assert(/Leo is due in 10 days/.test(await expectText(D)), 'the due date came with the profile');
      assert.equal(await D.$$eval('.contr .stat', r => r.length), 7, 'the contractions are listed there too');
      const dump = JSON.stringify(await H.q('select * from events')); assert(!/contraction/.test(dump), 'only ciphertext on the server');
      await setBirth(P, await due(-1));
      assert.equal(await P.evaluate(() => Stages.of(kids()[0].birth)), 'newborn');
      assert(await P.$('.quick'), 'the baby buttons'); assert(await P.$('.clockwrap'), 'the clock'); assert(!(await P.$('.expect')));
      assert(!/[Cc]ontraction/.test(await P.textContent('#view')), 'contractions are not entries of the day');
      assert(!/contraction/i.test(await P.evaluate(() => JSON.stringify(reportBlocks(kids()[0].id, { days: 7 })))), 'nor in the doctor\'s report');
      await setBirth(P, await due(10));
    });

    await step('the hospital bag: three lists of what to pack, the ticks counted in the heading, kept on this phone only', async () => {
      const bag = 'details[data-grp=bag]';
      assert.deepEqual(await P.$$eval(`${bag} .mh`, h => h.map(x => x.textContent)), ['For you', 'For the baby', 'For your partner']);
      const n = await P.$$eval(`${bag} [data-bag]`, c => c.length); assert(n >= 18, n + ' things');
      assert(new RegExp(`0 of ${n} packed`).test(await P.textContent(`${bag} summary`)));
      await P.evaluate(() => { document.querySelector('details[data-grp=bag]').open = true; });
      await P.click(`${bag} [data-bag="Birth plan"]`); await P.click(`${bag} [data-bag="A blanket"]`);
      assert(new RegExp(`2 of ${n} packed`).test(await P.textContent(`${bag} summary`)));
      assert.deepEqual(await P.$$eval(`${bag} [data-bag]:checked`, c => c.map(x => x.dataset.bag)), ['Birth plan', 'A blanket']);
      await P.click(`${bag} [data-bag="Birth plan"]`); assert(new RegExp(`1 of ${n} packed`).test(await P.textContent(`${bag} summary`)));
      await P.evaluate(() => save(true));   // (written now rather than on the debounce, which a slow machine may not reach before the reload)
      await P.reload(); await P.waitForSelector('.expect');
      assert.deepEqual(await P.$$eval(`${bag} [data-bag]:checked`, c => c.map(x => x.dataset.bag)), ['A blanket'], 'kept on the phone');
      await H.syncNow(D); await D.evaluate(() => render());
      assert.equal(await D.$$eval(`${bag} [data-bag]:checked`, c => c.length), 0, 'each phone packs its own');
    });

    await step('entries from a hostile writer are cleaned up: a contraction keeps nothing but its times, a tooth needs a real tooth code, a pumping session only known fields', async () => {
      const r = await P.evaluate(async () => {
        const b = db.meta.babyId, sealed = async e => (await E2EE.decryptRow(b, { id: e.id, ...(await E2EE.encryptEntry(b, e)), updated: e.updated })).entry;
        const now = Date.now();
        const c = await sealed({ id: 'h1', type: 'contraction', ts: now - 5000, end: now, data: { evil: '<img src=x>', n: 5 }, note: '', updated: now });
        const t1 = await sealed({ id: 'h2', type: 'tooth', ts: now, data: { tooth: 'XX9', lost: true }, note: '', updated: now });
        const t2 = await sealed({ id: 'h3', type: 'tooth', ts: now, data: { tooth: 'LL1', lost: true, evil: 1 }, note: '', updated: now });
        const p = await sealed({ id: 'h4', type: 'pump', ts: now, data: { side: 'Left', ml: 120, min: -3, store: 'garage', evil: 1 }, note: '', updated: now });
        return [c.data, c.end === now, t1.data.tooth, t2.data, p.data.side, p.data.ml, p.data.min, p.data.store, p.data.evil];
      });
      assert.deepEqual(r, [{}, true, undefined, { tooth: 'LL1', lost: true }, 'Left', 120, 0, undefined, undefined]);
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, [], 'page errors'); assert.deepEqual(p.csp, [], 'CSP'); }
    });
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} expecting checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
