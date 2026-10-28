// Feeding in the baby years: the wake window (awake since when, and when a nap is usually due for the age), pumping (a session logged
// or timed, the milk stash on the Day page with how long each bottle keeps, Used), the formula prep helper (level scoops for the water,
// the tin's scoop size remembered) and the allergen introduction tracker in the Guide (the nine key allergens: offered, again, a
// reaction).   node tests/feeding.test.js
const assert = require('assert');
/* global Stages, dkey, saveProfile, startOfDay, kids, stamp, save, render, openSheet, Auth, db, $, milkStash, leftText, reportBlocks, fmtTime */
/* global tab:writable, viewDay:writable */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 4).join('\n    ')); } };

(async () => {
  const H = await setup({ port: 8142 });
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    /** Leo is `y` years and `m` months old (never on a month birthday); the month's sheets are taken as seen. */
    const age = (y, m) => P.evaluate(([y, m]) => {
      const now = new Date(), t = new Date(now); t.setDate(15); t.setFullYear(t.getFullYear() - y); t.setMonth(t.getMonth() - m);
      t.setDate(Math.min(now.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); t.setDate(t.getDate() - 3);
      const k = kids()[0]; k.birth = dkey(t.getTime()); (db.meta.ms || (db.meta.ms = {}))[k.id] = 999; (db.meta.solids || (db.meta.solids = {}))[k.id] = 1; saveProfile();
      tab = 'day'; viewDay = startOfDay(Date.now()); render(); if (!$('#sheet').hidden) $('#sheetBack').click();
    }, [y, m]);
    const add = (type, ts, data, x = {}) => P.evaluate(([type, ts, data, x]) => { const e = { id: 'f' + type + ts, type, ts, data, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id, ...x }; db.events.push(e); save(); render(); return e.id; }, [type, ts, data, x]);
    const toastSays = re => P.waitForFunction(r => new RegExp(r).test(document.querySelector('#toast').textContent), re.source, { timeout: 5000 });

    await step('the wake window: once a sleep today has ended, the banner says how long the baby has been awake and when a nap is usually due for the age', async () => {
      await age(0, 2);
      assert.deepEqual(await P.evaluate(() => [Stages.wakeWindow(0), Stages.wakeWindow(2), Stages.wakeWindow(5), Stages.wakeWindow(13), Stages.wakeWindow(35), Stages.wakeWindow(36), Stages.wakeWindow(-1)]),
        [{ min: 35, max: 60 }, { min: 60, max: 90 }, { min: 90, max: 150 }, { min: 180, max: 240 }, { min: 300, max: 420 }, null, null]);
      assert(await P.$eval('#sleepBanner', b => b.hidden), 'nothing yet');
      const end = await P.evaluate(() => Math.max(Date.now() - 30 * 60e3, startOfDay(Date.now()) + 60e3));   // (woke up half an hour ago, or just after midnight)
      await add('sleep', end - 60 * 60e3, {}, { end });
      const row = await P.$eval('#sleepBanner .brow.awake', r => r.textContent), want = await P.evaluate(e => [fmtTime(e), Math.round((Date.now() - e) / 60e3), fmtTime(e + 90 * 60e3)], end);
      assert(new RegExp(`Awake since ${want[0]} \\(${want[1]}m\\) · usually ready for a nap by about ${want[2]}`).test(row), row + ' | ' + want);
      // awake far longer than the window: just how long
      await P.evaluate(e => { const s = db.events.find(x => x.type === 'sleep'); s.end = e; s.ts = e - 60 * 60e3; s.updated = stamp(); save(); render(); }, end - 3 * 60 * 60e3);
      const long = await P.$eval('#sleepBanner .brow.awake', r => r.textContent);
      if (end - 3 * 60 * 60e3 >= await P.evaluate(() => startOfDay(Date.now()))) assert(/Awake since .*\(3h \d+m\)$|\(3h\)$/.test(long) && !/ready for a nap/.test(long), long);
      // asleep now: no awake row; and no window past 3 years
      await add('sleep', Date.now() - 10 * 60e3, {});
      assert(!(await P.$('#sleepBanner .brow.awake')) && (await P.$('#sleepBanner [data-wake]')), 'asleep now');
      await P.evaluate(() => { db.events = db.events.filter(e => e.type !== 'sleep' || e.end); save(); });
      await age(3, 2); await add('sleep', end - 60 * 60e3, {}, { end });
      assert(!(await P.$('#sleepBanner .brow.awake')), 'no window for a preschooler');
      await P.evaluate(() => { db.events = []; save(); });
    });

    await step('a pumping session: side, amount, minutes and where the milk went; in the day\'s list; the Milk stash counts the days down and Used takes a bottle out; the timer in the banner', async () => {
      await age(0, 2);
      await P.evaluate(() => openSheet('pump')); await P.waitForSelector('#sheet [name=side]');
      assert(/Pumping/i.test(await P.textContent('#sheet h3')));
      assert.equal(await P.$eval('#sheet [name=side]:checked', r => r.value), 'Both');
      await P.click('#sheet [name=side][value=Left]'); await P.fill('#ml', '120'); await P.fill('#min', '15'); await P.click('#sheet [name=store][value=fridge]'); await P.click('#save');
      const e = await P.evaluate(() => db.events.find(x => x.type === 'pump')); assert.deepEqual(e.data, { side: 'Left', ml: 120, min: 15, store: 'fridge' });
      const list = await P.textContent('#view'); assert(/Left.{0,6}120 ml.{0,6}15 min.{0,6}Fridge/.test(list), list.slice(0, 500));
      const stash = 'details[data-grp=stash]'; assert(/1 bottle · 120 ml/.test(await P.textContent(`${stash} summary`)));
      await P.evaluate(() => { document.querySelector('details[data-grp=stash]').open = true; });
      const row = await P.textContent(`${stash} .stat`); assert(/120 ml · Fridge/.test(row) && /4 days left/.test(row), row);
      // a second bottle with the timer: the banner counts, Done opens the entry to finish it
      await P.evaluate(() => openSheet('pump')); await P.waitForSelector('#pumpStart'); await P.click('#pumpStart');
      assert(/Pumping since/.test(await P.textContent('#sleepBanner .brow.pump')), 'pumping in the banner');
      assert.equal(await P.evaluate(() => db.events.filter(x => x.type === 'pump' && x.end === null).length), 1);
      await P.click('[data-pumpdone]'); await P.waitForSelector('#sheet #ml');
      assert.equal(await P.$eval('#min', i => i.value), '1', 'at least a minute');
      await P.fill('#ml', '90'); await P.click('#sheet [name=store][value=freezer]'); await P.click('#save');
      assert.deepEqual(await P.evaluate(() => milkStash().map(e => [e.data.ml, e.data.store])), [[120, 'fridge'], [90, 'freezer']]);
      assert(/2 bottles · 210 ml/.test(await P.textContent(`${stash} summary`)));
      const rows = await P.$$eval(`${stash} .stat`, r => r.map(x => x.textContent)); assert(/180 days left/.test(rows[1]), rows[1]);
      assert.equal(await P.isVisible('#sleepBanner .brow.pump'), false, 'the banner row is gone');
      await P.click(`${stash} [data-used]`); assert.equal(await P.evaluate(() => milkStash().length), 1); assert(/1 bottle · 90 ml/.test(await P.textContent(`${stash} summary`)));
      assert.deepEqual(await P.evaluate(() => { const now = Date.now(); return [leftText(now + 30 * 3600e3, now), leftText(now + 3600e3, now), leftText(now + 10 * 24 * 3600e3, now), leftText(now - 1, now)]; }), ['30 hours left', '1 hour left', '10 days left', 'past its time']);
      // milk given straight away is not in the stash; pumping stays out of the doctor's report
      await P.evaluate(() => openSheet('pump')); await P.waitForSelector('#sheet #ml'); await P.fill('#ml', '60'); await P.click('#save');
      assert.equal(await P.evaluate(() => milkStash().length), 1);
      assert(!/pump/i.test(await P.evaluate(() => JSON.stringify(reportBlocks(kids()[0].id, { days: 7 })))), 'not in the report');
    });

    await step('the family\'s phones get the stash with the next sync (only ciphertext on the server); a family member who may not change the entry has no Used button', async () => {
      const D = await H.addMember(P, 'dad@x.com', 'family');
      await H.syncNow(P); await H.syncNow(D);
      await D.evaluate(() => { if (!$('#sheet').hidden) $('#sheetBack').click(); tab = 'day'; viewDay = startOfDay(Date.now()); render(); });
      assert(/1 bottle · 90 ml/.test(await D.textContent('details[data-grp=stash] summary')));
      assert.equal(await D.$$eval('details[data-grp=stash] [data-used]', b => b.length), 0);
      const dump = JSON.stringify(await H.q('select * from events')); assert(!/freezer|pump/.test(dump), 'only ciphertext');
    });

    await step('the formula prep helper: level scoops for the water in the bottle, with the scoop size the tin says (1 per 30 ml, or 1 per 60 ml where that is usual), remembered on this phone', async () => {
      await P.evaluate(() => openSheet('feed')); await P.waitForSelector('#sheet [name=kind]');
      await P.click('#sheet [name=kind][value=bottle]'); await P.click('#sheet [name=milk][value=Formula]');
      assert(await P.$eval('#prep', p => p.hidden), 'nothing until an amount');
      await P.fill('#ml', '120');
      const t = await P.$eval('#prep', p => [p.hidden, p.textContent]); assert.equal(t[0], false);
      const per = +(t[1].match(/1 scoop per (\d+) ml/) || [])[1]; assert([30, 60].includes(per), t[1]);
      assert(new RegExp(`About ${per === 60 ? 2 : 4} level scoops in 120 ml of water`).test(t[1]) && /Water first, then the powder/.test(t[1]), t[1]);
      await P.click('#scoopFlip'); const t2 = await P.$eval('#prep', p => p.textContent), per2 = per === 60 ? 30 : 60;
      assert(new RegExp(`About ${per2 === 60 ? 2 : 4} level scoops`).test(t2) && new RegExp(`1 scoop per ${per2} ml`).test(t2), t2 + ' | scoop=' + (await P.evaluate(() => db.meta.scoop)));
      assert.equal(await P.evaluate(() => db.meta.scoop), per2, 'remembered');
      await P.fill('#ml', '100'); assert(new RegExp(`About ${per2 === 60 ? '1.5' : '3.5'} level scoops in 100 ml`).test(await P.$eval('#prep', p => p.textContent)));
      await P.click('#sheet [name=kind][value=breast]'); assert(await P.$eval('#prep', p => p.hidden), 'not for a breastfeed');
      await P.click('#cancel');
    });

    await step('the allergen introduction tracker in the Guide\'s Food section: the nine key allergens; Offered today logs a taste as a solids feed; offer again soon after a week; a Reaction notes the allergy', async () => {
      await age(0, 7);
      const open = () => P.evaluate(() => { tab = 'guide'; render(); document.querySelector('details[data-grp=secfood]').open = true; document.querySelector('details[data-grp=galg]').open = true; });
      await open(); const alg = 'details[data-grp=galg]';
      assert.deepEqual(await P.$$eval(`${alg} .alg b`, b => b.map(x => x.textContent)), ['Peanut', 'Egg', 'Milk (dairy)', 'Wheat', 'Soy', 'Tree nuts', 'Sesame', 'Fish', 'Shellfish']);
      assert.equal(await P.$$eval(`${alg} .alg`, s => s.filter(x => /Not offered yet/.test(x.textContent)).length), 9);
      await P.click(`${alg} [data-offer=peanut]`); await toastSays(/Logged as a solids feed/);
      const feed = await P.evaluate(() => db.events.find(e => e.type === 'feed' && e.data.kind === 'solids')); assert.deepEqual(feed.data, { kind: 'solids', foods: ['Peanut'], amount: 'A taste' });
      await open(); const peanut = await P.$eval(`${alg} .alg`, r => r.textContent);
      assert(/First .* · 1 time(?!s)/.test(peanut) && /Offered again/.test(peanut) && /Reaction/.test(peanut) && !/again soon/.test(peanut), peanut);
      await P.evaluate(() => { const e = db.events.find(x => x.type === 'feed' && x.data.kind === 'solids'); e.ts -= 10 * 864e5; e.updated = stamp(); save(); }); await open();
      const again = await P.$eval(`${alg} .alg`, r => [r.className, r.textContent]); assert(/again/.test(again[0]) && /offer again soon/.test(again[1]), again.join(' | '));
      await P.click(`${alg} [data-offer=peanut]`); await open();
      assert(/2 times/.test(await P.$eval(`${alg} .alg`, r => r.textContent)));
      await P.click(`${alg} [data-react="Peanut"]`); await P.waitForSelector('#alSave');
      assert.equal(await P.$eval('#sheet [name=alFood]:checked', c => c.value), 'Peanut');
      await P.fill('#alDate', await P.evaluate(() => dkey(Date.now()))); await P.click('#alSave'); await toastSays(/Allergy saved/);
      await open(); const after = await P.$eval(`${alg} .alg`, r => r.textContent); assert(/Allergy noted/.test(after) && !/Offered/.test(after), after);
      assert.equal(await P.$$eval(`${alg} .alg`, r => r.length), 9);
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, [], 'page errors'); assert.deepEqual(p.csp, [], 'CSP'); }
    });
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} feeding checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
