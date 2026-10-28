// The potty chart on the Stats page (stars, accidents, dry nights, the streak, a reward chart to print), the teething chart in the
// health record (a mouth to tap, each tooth dated as it comes in and falls out, on every phone) and the handover card (the day so far
// as text or a picture, for whoever has the child next).   node tests/charts.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
/* global dkey, saveProfile, startOfDay, kids, stamp, save, render, Auth, db, $, pottyStreak, openRecord, handoverText, addDays, reportBlocks, Pdf, fmtTime */
/* global tab:writable, viewDay:writable */
const { setup } = require('./lib/harness');
const has = cmd => { try { execFileSync('which', [cmd], { stdio: 'pipe' }); return true; } catch (e) { return false; } };

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 4).join('\n    ')); } };

(async () => {
  const H = await setup({ port: 8143 });
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    const age = (y, m) => P.evaluate(([y, m]) => {
      const now = new Date(), t = new Date(now); t.setDate(15); t.setFullYear(t.getFullYear() - y); t.setMonth(t.getMonth() - m);
      t.setDate(Math.min(now.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); t.setDate(t.getDate() - 3);
      const k = kids()[0]; k.birth = dkey(t.getTime()); (db.meta.ms || (db.meta.ms = {}))[k.id] = 999; (db.meta.solids || (db.meta.solids = {}))[k.id] = 1; saveProfile();
      tab = 'day'; viewDay = startOfDay(Date.now()); render(); if (!$('#sheet').hidden) $('#sheetBack').click();
    }, [y, m]);
    const add = (type, ts, data, x = {}) => P.evaluate(([type, ts, data, x]) => { const e = { id: 'f' + type + ts, type, ts, data, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id, ...x }; db.events.push(e); save(); render(); return e.id; }, [type, ts, data, x]);
    /** The next file the page makes (download), with the first bytes. */
    const nextFile = (trigger) => P.evaluate(sel => new Promise(done => {
      const was = window.download; window.download = (name, data, type) => { window.download = was; done({ name, type, head: Array.from(data.slice(0, 5)), len: data.length }); };
      document.querySelector(sel).click();
    }), trigger);
    const day0 = await P.evaluate(() => startOfDay(Date.now()));

    await step('the potty chart on the Stats page: two weeks of stars, accidents and dry nights, the streak of days with a star and no accident', async () => {
      await age(2, 6);
      const potty = (daysAgo, h, data) => add('potty', day0 - daysAgo * 864e5 + h * 3600e3, data);
      await potty(0, 9, { pee: true }); await potty(0, 15, { poo: true }); await potty(1, 10, { pee: true }); await potty(1, 16, { accident: true });
      await potty(2, 8, { pee: true, poo: true }); await potty(2, 7, { dry: true }); await potty(3, 9, { pee: true }); await potty(5, 11, { accident: true });
      await P.evaluate(() => { tab = 'stats'; render(); });
      const chart = '.pottychart'; assert(await P.$(chart), 'the chart on the Stats page');
      assert.equal(await P.$$eval(`${chart} .pday`, d => d.length), 14);
      const days = await P.$$eval(`${chart} .pday`, d => d.map(x => [x.querySelectorAll('.stars .ic').length, x.querySelector('.oops').textContent.length, !!x.querySelector('.dry'), x.classList.contains('today')]));
      assert.deepEqual(days.slice(-6), [[0, 1, false, false], [0, 0, false, false], [1, 0, false, false], [1, 0, true, false], [1, 1, false, false], [2, 0, false, true]], JSON.stringify(days));
      assert(/1 day in a row with a star and no accident/.test(await P.textContent(chart)), 'the streak stops at yesterday\'s accident');
      const st = await P.evaluate(() => { const d = (stars, oops) => ({ stars, oops, dry: false }); return [pottyStreak([d(1, 0), d(2, 0), d(0, 0)]), pottyStreak([d(1, 0), d(1, 0), d(1, 0)]), pottyStreak([d(1, 0), d(1, 1), d(1, 0)]), pottyStreak([d(0, 0), d(0, 1)]), pottyStreak([])]; });
      assert.deepEqual(st, [2, 3, 1, 0, 0], 'today without a star yet does not break a streak; an accident does');
      await P.evaluate(() => { const e = db.events.find(x => x.type === 'potty' && x.data.accident && x.ts > Date.now() - 2 * 864e5); e.data = { pee: true }; e.updated = stamp(); save(); render(); });
      assert(/4 days in a row/.test(await P.textContent(chart)), 'four days once yesterday\'s accident turns out to be a star');
      await P.evaluate(() => { tab = 'guide'; render(); }); assert(!(await P.$(chart)), 'only on Stats');
    });

    await step('a reward chart to print: a PDF with the last four weeks of stars and four empty weeks to fill in by hand', async () => {
      await P.evaluate(() => { tab = 'stats'; render(); const was = Pdf.make; Pdf.make = async (...a) => { const d = await was(...a); window.__pdf = d; return d; }; });
      const f = await nextFile('[data-pottypdf]');
      assert.equal(f.name, 'little-log-leo-potty-chart.pdf'); assert.equal(f.type, 'application/pdf'); assert.equal(String.fromCharCode(...f.head), '%PDF-');
      const text = await P.evaluate(() => JSON.stringify(window.__pdf.text));   // (the pages, each its lines)
      assert(/Leo's potty chart/.test(text) && /The last four weeks/.test(text) && /The next four weeks/.test(text), text.slice(0, 300));
      assert((text.match(/★/g) || []).length >= 6, 'the stars so far: ' + (text.match(/★/g) || []).length);
      assert.equal(await P.evaluate(() => window.__pdf.pages), 1);
    });

    await step('the teething chart in the health record: a mouth of 20 first teeth to tap, each dated the day it came in and the day it fell out, with what usually happens; removed again', async () => {
      await age(0, 8);
      await P.evaluate(() => openRecord(kids()[0].id)); await P.waitForSelector('.mouth');
      assert.equal(await P.$$eval('.mouth [data-tooth]', t => t.length), 20);
      assert(/No teeth yet: the first is usually a lower front tooth at 6 to 10 months/.test(await P.textContent('.teeth')));
      assert.equal(await P.$eval('.mouth [data-tooth=LL1]', t => t.getAttribute('aria-label')), 'lower left central incisor');
      assert.equal(await P.$eval('.mouth [data-tooth=UR5]', t => t.getAttribute('aria-label')), 'upper right second molar');
      const day = await P.evaluate(() => dkey(Date.now() - 3 * 864e5));
      await P.click('.mouth [data-tooth=LL1]'); await P.waitForSelector('#toothIn');
      assert(/lower left central incisor/.test(await P.textContent('#sheet h3'))); assert(/Usually comes in at 6 to 10 months and falls out at 6 to 7 years/.test(await P.textContent('#sheet')));
      await P.fill('#toothDay', day); await P.click('#toothIn'); await P.waitForSelector('#sheet', { state: 'hidden' });
      assert.deepEqual(await P.evaluate(() => db.events.filter(e => e.type === 'tooth').map(e => [e.data, dkey(e.ts)])), [[{ tooth: 'LL1' }, day]]);
      assert(await P.$('.mouth [data-tooth=LL1].in'), 'drawn as in'); assert(/1 tooth so far/.test(await P.textContent('.teeth')));
      assert(/lower left central incisor/.test(await P.$eval('.teeth .stat', r => r.textContent)));
      await P.click('.mouth [data-tooth=LR1]'); await P.waitForSelector('#toothIn'); await P.click('#toothIn'); await P.waitForSelector('#sheet', { state: 'hidden' });
      assert(/2 teeth so far/.test(await P.textContent('.teeth')));
      await P.click('.mouth [data-tooth=LL1]'); await P.waitForSelector('#toothOut'); assert(!(await P.$('#toothIn')), 'it is in already');
      await P.click('#toothOut'); await P.waitForSelector('#sheet', { state: 'hidden' });
      assert(await P.$('.mouth [data-tooth=LL1].out'), 'drawn as out'); assert(/out /.test(await P.$eval('.teeth .stat', r => r.textContent)));
      assert(/1 tooth so far/.test(await P.textContent('.teeth')), 'one left in the mouth');
      await P.click('.mouth [data-tooth=LL1]'); await P.waitForSelector('#toothRm'); await P.click('#toothRm'); await P.waitForSelector('#sheet', { state: 'hidden' });
      assert.equal(await P.evaluate(() => db.events.filter(e => e.type === 'tooth' && e.data.tooth === 'LL1').length), 0);
      assert(!(await P.$('.mouth [data-tooth=LL1].in')) && !(await P.$('.mouth [data-tooth=LL1].out')), 'blank again');
      await P.evaluate(() => { tab = 'day'; viewDay = startOfDay(Date.now()); render(); }); assert(!/incisor/.test(await P.textContent('#view')), 'teeth are not entries of the day');
      assert(!/incisor|tooth/i.test(await P.evaluate(() => JSON.stringify(reportBlocks(kids()[0].id, { days: 7 })))), 'nor in the doctor\'s report');
    });

    await step('the family\'s phones have the chart too (ciphertext on the server); a helper who may not add entries can look but not tap', async () => {
      const D = await H.addMember(P, 'dad@x.com', 'family', {}, { name: 'Dad' }), C = await H.addMember(P, 'nan@x.com', 'caregiver', { add_entries: false }, { name: 'Nan' });
      await H.syncNow(P); await H.syncNow(D); await H.syncNow(C);
      for (const p of [D, C]) { await p.evaluate(() => { if (!$('#sheet').hidden) $('#sheetBack').click(); openRecord(kids()[0].id); }); await p.waitForSelector('.mouth'); assert(await p.$('.mouth [data-tooth=LR1].in'), 'the tooth is there'); }
      await C.click('.mouth [data-tooth=UL1]'); assert(/permission/.test(await C.textContent('#toast'))); assert(await C.$eval('#sheet', s => s.hidden), 'no sheet');
      const dump = JSON.stringify(await H.q('select * from events')); assert(!/tooth|LR1/.test(dump), 'only ciphertext');
    });

    await step('the handover card: the day so far in a few lines (feeds, diapers, sleep, medicines, notes, allergies), shared as text or as a picture; another day too', async () => {
      await age(0, 4);
      await P.evaluate(() => { db.events = []; kids()[0].allergies = [{ food: 'Peanut', date: dkey(Date.now() - 7 * 864e5), note: '' }]; saveProfile(); save(); });
      const at = h => day0 + h * 3600e3;
      await add('feed', at(9), { kind: 'bottle', ml: 90, milk: 'Formula' }, { note: 'took it slowly' }); await add('diaper', at(10), { pee: true }); await add('diaper', at(12), { pee: true, poo: true });
      await add('sleep', at(13), {}, { end: at(14.5) }); await add('med', at(15), { name: 'Vitamin D', dose: '1 drop' });
      const text = await P.evaluate(() => handoverText()), t = h => P.evaluate(x => fmtTime(x), at(h));
      const lines = text.split('\n'); assert(/^Leo · /.test(lines[0]), lines[0]);
      assert(new RegExp(`^Feeds: 1 \\(last ${await t(9)}: .*90 ml`).test(lines[1]), lines[1]);
      assert.equal(lines[2], `Diapers: 2 wet, 1 poo (last ${await t(12)})`);
      assert.equal(lines[3], `Sleep: 1 times, 1h 30m in all (last woke at ${await t(14.5)})`);
      assert.equal(lines[4], `Medicines: ${await t(15)} Vitamin D · 1 drop`);
      assert.equal(lines[5], `Notes: ${await t(9)} “took it slowly”`);
      assert(/^Allergies: Peanut/.test(lines[6]), lines[6]); assert.equal(lines.length, 7);
      await P.evaluate(() => { tab = 'day'; viewDay = startOfDay(Date.now()); render(); });
      assert.equal(await P.textContent('#shareDay'), ' Share today so far');
      await P.click('#shareDay'); await P.waitForSelector('#handText');
      assert.equal(await P.$eval('#sheet .hand', p => p.textContent), text);
      await P.evaluate(() => { window.__calls.length = 0; }); await P.click('#handText'); await P.waitForSelector('#sheet', { state: 'hidden' });
      assert.deepEqual(await P.evaluate(() => window.__calls.map(c => c[0])), ['share'], 'the phone\'s share sheet');
      await P.click('#shareDay'); await P.waitForSelector('#handPic');
      const f = await nextFile('#handPic'); assert.equal(f.name, 'little-log-today.png'); assert.equal(f.type, 'image/png'); assert.deepEqual(f.head.slice(0, 4), [0x89, 0x50, 0x4e, 0x47]); assert(f.len > 2000, 'a real picture');
      await P.waitForSelector('#sheet', { state: 'hidden' });
      await P.evaluate(() => { viewDay = addDays(viewDay, -1); render(); }); assert(!(await P.$('#shareDay')), 'nothing to share on an empty day');
      await add('feed', at(-15), { kind: 'breast', min: 10 }); assert.equal(await P.textContent('#shareDay'), ' Share this day');
      assert(/^Leo · /.test(await P.evaluate(() => handoverText())) && /Feeds: 1/.test(await P.evaluate(() => handoverText())));
      if (has('pdfinfo')) fs.writeFileSync(path.join(H.tmp, 'noop'), '');   // (poppler is used by the report suite; nothing to render here)
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, [], 'page errors'); assert.deepEqual(p.csp, [], 'CSP'); }
    });
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} chart checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
