// Solid foods and allergies: the sheet when a child turns 6 months, the foods in the feed form (with the key allergens to offer early
// marked), marking an allergy with the date of the first reaction (kept in the child's profile, end-to-end encrypted, seen by everyone
// sharing the log), and that first date on the calendar.   node tests/solids.test.js
const assert = require('assert');
/* global openAllergy, solidsCheck, openEntryInfo, doctorPdf, dkey, saveProfile, dayStats, E2EE, Sync, Auth */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 9).join('\n    ')); } };
const monthsAgo = (m, d = 2) => { const t = new Date(); t.setMonth(t.getMonth() - m); t.setDate(t.getDate() - d); return t.toLocaleDateString('en-CA'); };

(async () => {
  const H = await setup({ port: 8134 }), { q, syncNow } = H;
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    const sheetUp = () => P.evaluate(() => !$('#sheet').hidden && $('#sheet h3').textContent);
    const closeSheet = () => P.evaluate(() => { $('#sheet').hidden = $('#sheetBack').hidden = true; });

    await step('the month a child turns 6 months old, a sheet says it is time for solid foods: what readiness looks like, how to start, the allergens to give early, what not to give, and when to call', async () => {
      await P.evaluate(b => { kids()[0].birth = b; delete db.meta.solids; save(); tab = 'day'; render(); }, monthsAgo(6));
      assert.equal(await sheetUp(), '🥄 Time for solid foods');
      const t = await P.textContent('#sheet');
      for (const x of ['Leo is 6 months old', 'Signs your baby is ready', 'How to start', 'Key allergens: early and often', 'Peanut, egg', 'Honey, until 1 year', 'Signs of a reaction', 'If your baby was born early']) assert(t.includes(x), x);
      assert(/Call \S+.* for trouble breathing/.test(t), 'when to call for help');
      await P.click('#solidsGo'); await P.waitForSelector('#fSolids:not([hidden])');
      assert.equal(await P.evaluate(() => $('#sheet [name=kind]:checked').value), 'solids', '"Log a first food" opens the feed form on solids');
      await P.click('#cancel');
      await P.evaluate(() => render()); assert.equal(await sheetUp(), false, 'once is enough');
      await P.reload(); await P.waitForSelector('#tabs'); assert.equal(await sheetUp(), false, 'also after a restart');
    });

    await step('…not at 5 months or 7, and not once solid food is in the child\'s log', async () => {
      for (const [m, solids, want] of [[5, false, false], [7, false, false], [6, true, false], [6, false, true]]) {
        const got = await P.evaluate(([b, s]) => { kids()[0].birth = b; delete db.meta.solids; db.events = db.events.filter(e => e.id !== 'sol0'); if (s) db.events.push({ id: 'sol0', type: 'feed', ts: Date.now() - 864e5, data: { kind: 'solids', foods: ['Banana'] }, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id }); $('#sheet').hidden = $('#sheetBack').hidden = true; return solidsCheck(); }, [monthsAgo(m), solids]);
        assert.equal(got, want, `${m} months${solids ? ', solids logged' : ''}`);
        await closeSheet();
      }
      await P.evaluate(() => { db.events = db.events.filter(e => e.id !== 'sol0'); save(); render(); });
    });

    await step('Feed → solids: a twirl-down of the common first foods by group, the key allergens first and open, each allergen marked "key allergen"', async () => {
      await P.evaluate(() => { tab = 'day'; render(); openSheet('feed'); });
      assert.deepEqual(await P.$$eval('#sheet [name=kind]', x => x.map(i => i.value)), ['breast', 'bottle', 'solids']);
      assert.equal(await P.isVisible('#fSolids'), false, 'only once solids is chosen');
      await P.click('#sheet [name=kind][value=solids]'); assert(await P.isVisible('#fSolids'));
      const r = await P.evaluate(() => ({
        groups: [...document.querySelectorAll('#sheet details.fgrp')].map(d => [d.querySelector('summary').firstChild.textContent.trim(), d.open]),
        marked: [...document.querySelectorAll('#sheet [name=food]')].filter(i => i.closest('label').querySelector('.kal')).map(i => i.value),
        note: $('#sheet details.fgrp[data-fg=allergens] .note').textContent,
      }));
      assert.deepEqual(r.groups, [['Key allergens', true], ['Grains', false], ['Vegetables', false], ['Fruit', false], ['Meat, fish and beans', false]]);
      assert.deepEqual(r.marked, ['Peanut', 'Egg', 'Yogurt', 'Cheese', 'Wheat', 'Soy', 'Tree nuts', 'Sesame', 'Fish', 'Shellfish', 'Pasta', 'Bread', 'Tofu']);
      assert(/from around 6 months.*lowers the chance of a food allergy/.test(r.note) && /ask your pediatrician first/.test(r.note), r.note);
      await P.click('#save'); assert(/Choose at least one food/.test(await P.textContent('#toast')), 'a meal needs a food');
    });

    await step('choose foods (or type another), how much, and save: the entry says what was eaten, and stays readable only on the family\'s phones', async () => {
      await P.click('#sheet [name=food][value=Peanut]');
      await P.evaluate(() => { $('#sheet details.fgrp[data-fg=fruit]').open = true; });
      await P.click('#sheet [name=food][value=Banana]'); await P.fill('#foodOther', 'Kiwi purée'); await P.click('#foodAdd');
      assert.equal(await P.textContent('#sheet .fsum'), 'Peanut, Banana, Kiwi purée', 'the twirl-down says what is chosen');
      await P.click('#sheet [name=amount][value="A few spoons"]'); await P.click('#save');
      const e = await P.evaluate(() => db.events.filter(x => x.data && x.data.kind === 'solids').map(x => [x.data, describe(x)]).pop());
      assert.deepEqual(e, [{ kind: 'solids', foods: ['Peanut', 'Banana', 'Kiwi purée'], amount: 'A few spoons' }, ['Solids', 'Peanut, Banana, Kiwi purée · A few spoons']]);
      await syncNow(P);
      const rows = await q("select count(*)::int n from events where blob ilike '%peanut%' or blob ilike '%kiwi%'");
      assert((await q('select count(*)::int n from events'))[0].n > 0, 'the meal is on the server');
      assert.equal(rows[0].n, 0, 'the server holds only ciphertext');
    });

    let N;
    await step('another phone in the family log gets the meal, foods and all', async () => {
      N = await H.addMember(P, 'nan@x.com', 'caregiver', { view_health: true }, { name: 'Nan' });
      const got = await N.evaluate(() => db.events.filter(x => x.data && x.data.kind === 'solids').map(x => describe(x)));
      assert.deepEqual(got, [['Solids', 'Peanut, Banana, Kiwi purée · A few spoons']]);
    });

    await step('a parent marks an allergy in More → Children: the food, the date of the first reaction, what happened; it is kept in the child\'s profile', async () => {
      await P.evaluate(() => { tab = 'more'; render(); });
      assert(/None marked/.test(await P.textContent('.kidrow')));
      await P.click(`[data-aladd]`); await P.waitForSelector('#alSave');
      assert(/Everyone sharing the log will see it/.test(await P.textContent('#sheet')));
      await P.click('#alSave'); assert(/Choose the food/.test(await P.textContent('#toast')));
      await P.click('#sheet [name=alFood][value=Peanut]');
      const day = await P.evaluate(() => dkey(Date.now() - 3 * 864e5));
      await P.fill('#alDate', day); await P.fill('#alNote', 'hives around the mouth'); await P.click('#alSave');
      assert.deepEqual(await P.evaluate(() => kids()[0].allergies), [{ food: 'Peanut', date: day, note: 'hives around the mouth' }]);
      const row = (await P.textContent('.kidrow .alrow')).replace(/\s+/g, ' ');
      assert(/Peanut/.test(row) && /first reaction \w+ \d+, \d{4} · hives around the mouth/.test(row), row);
      // marking it again with an earlier date keeps the first reaction
      await P.evaluate(d => { openAllergy(kids()[0].id, { foods: ['Peanut'], date: d }); }, await P.evaluate(() => dkey(Date.now() - 5 * 864e5)));
      await P.click('#alSave'); assert.equal(await P.evaluate(() => kids()[0].allergies.length), 1);
      assert.equal(await P.evaluate(() => kids()[0].allergies[0].date), await P.evaluate(() => dkey(Date.now() - 5 * 864e5)), 'the earlier date wins');
      await P.evaluate(d => { openAllergy(kids()[0].id, { foods: ['Peanut'], date: d }); }, day); await P.click('#alSave');
      assert.equal(await P.evaluate(() => kids()[0].allergies[0].date), await P.evaluate(() => dkey(Date.now() - 5 * 864e5)), 'and a later one does not replace it');
    });

    await step('the first date is marked on the calendar, like a day away, and the day says what it was', async () => {
      const first = await P.evaluate(() => kids()[0].allergies[0].date);
      await P.evaluate(() => { tab = 'month'; calMonth = new Date(); render(); });
      const t = await P.evaluate(d => new Date(d + 'T00:00').getTime(), first), sameMonth = await P.evaluate(t => new Date(t).getMonth() === calMonth.getMonth(), t);
      if (!sameMonth) await P.click('[data-month="-1"]');
      const cell = `.cal button[data-day="${t}"]`;
      assert(await P.$eval(cell, b => b.classList.contains('allergyday') && !!b.querySelector('.almark')), 'marked');
      assert(/first allergic reaction: Peanut/.test(await P.$eval(cell, b => b.getAttribute('aria-label'))));
      assert.equal(await P.$$eval('.cal button.allergyday', x => x.length), 1, 'only that day');
      assert(/First allergic reaction/.test(await P.textContent('.legend')), 'the legend explains it');
      await P.click(cell); assert(/First allergic reaction: Peanut/.test(await P.textContent('.alcard')) && /hives around the mouth/.test(await P.textContent('.alcard')));
    });

    await step('everyone sharing the log sees it: the caregiver\'s phone shows the allergy at the top of the day and marks it on the form', async () => {
      await syncNow(P); await syncNow(N); await N.evaluate(() => { tab = 'day'; render(); });
      assert(/Allergies: Peanut/.test(await N.textContent('.allergyline')));
      await N.evaluate(() => openSheet('feed', null, { kind: 'solids' }));
      assert(/allergy/.test(await N.$eval('#sheet [name=food][value=Peanut]', i => i.closest('label').textContent)), 'Peanut is flagged in the foods');
      assert.equal(await N.$$eval('[data-aladd]', x => x.length), 0); await N.evaluate(() => { $('#sheet').hidden = $('#sheetBack').hidden = true; });
      await N.evaluate(() => { tab = 'more'; render(); }); assert.equal(await N.$$eval('[data-aladd], [data-alrm]', x => x.length), 0, 'only parents can change allergies');
      await N.evaluate(() => openAllergy(kids()[0].id)); assert(/Only parents can change these/.test(await N.textContent('#toast')));
      const rows = await q("select count(*)::int n from babies where profile::text ilike '%peanut%' or profile::text ilike '%hives%'");
      assert.equal(rows[0].n, 0, 'the profile on the server is ciphertext');
    });

    await step('logging a food the child is allergic to warns straight away', async () => {
      await P.evaluate(() => { tab = 'day'; render(); openSheet('feed', null, { kind: 'solids' }); });
      await P.click('#sheet [name=food][value=Peanut]'); P.dialogs = []; await P.click('#save');
      await P.waitForFunction(() => true); await P.waitForTimeout(500);
      assert((P.dialogs || []).some(d => /Leo is allergic to Peanut/.test(d) && /trouble breathing/.test(d)), JSON.stringify(P.dialogs));
    });

    await step('an allergy can also be marked from a meal tapped on the clock, with its foods and date filled in', async () => {
      const id = await P.evaluate(() => { const e = db.events.filter(x => x.data && x.data.kind === 'solids')[0]; viewDay = startOfDay(e.ts); render(); return e.id; });
      await P.evaluate(i => openEntryInfo(i), id); await P.click('#infoAllergy'); await P.waitForSelector('#alSave');
      const r = await P.evaluate(() => ({ ticked: [...document.querySelectorAll('#sheet [name=alFood]:checked')].map(i => i.value), date: $('#alDate').value }));
      assert.deepEqual(r.ticked, ['Peanut', 'Banana', 'Kiwi purée']); assert.equal(r.date, await P.evaluate(i => dkey(db.events.find(e => e.id === i).ts), id));
      await P.evaluate(() => { document.querySelectorAll('#sheet [name=alFood]').forEach(c => { c.checked = c.value === 'Kiwi purée'; }); }); await P.click('#alSave');
      assert.deepEqual(await P.evaluate(() => kids()[0].allergies.map(a => a.food)), ['Peanut', 'Kiwi purée']);
    });

    await step('an allergy saved while a sync brings in the profile is kept (the sheet holds no stale copy of the child)', async () => {
      await P.evaluate(() => { tab = 'more'; render(); openAllergy(kids()[0].id); });
      await P.evaluate(() => { db.baby = JSON.parse(JSON.stringify(db.baby)); });   // what a sync does when it brings the profile from the server
      await P.click('#sheet [name=alFood][value=Egg]'); await P.click('#alSave');
      assert.deepEqual(await P.evaluate(() => kids()[0].allergies.map(a => a.food)), ['Peanut', 'Kiwi purée', 'Egg']);
      await P.evaluate(() => { kids()[0].allergies = kids()[0].allergies.filter(a => a.food !== 'Egg'); saveProfile(); }); await syncNow(P);
    });

    await step('a change made on this phone while a sync is under way is not lost under the server\'s older copy: it goes up with the next sync', async () => {
      await syncNow(P);
      const r = await P.evaluate(async () => {
        const real = E2EE.decryptProfile;
        E2EE.decryptProfile = async (...a) => { const p = await real(...a); kids()[0].name = 'Leo James'; Sync.pushBaby(); return p; };   // (saved just as the sync opens the server's copy)
        try { await Sync.run(true); } finally { E2EE.decryptProfile = real; }
        const kept = kids()[0].name; await Sync.run(true);
        return { kept, dirty: !!db.meta.babyDirty, now: kids()[0].name };
      });
      assert.deepEqual(r, { kept: 'Leo James', dirty: false, now: 'Leo James' });
      await syncNow(N); assert.equal(await N.evaluate(() => kids()[0].name), 'Leo James', 'the other phone has it');
      // offline while sending it: kept for later, not dropped
      const off = await P.evaluate(async () => {
        const real = Auth.rpc; Auth.rpc = function (name, ...a) { return name === 'update_baby' ? Promise.reject(new TypeError('Failed to fetch')) : real.call(this, name, ...a); };
        kids()[0].name = 'Leo'; Sync.pushBaby();
        try { await Sync.run(true); } finally { Auth.rpc = real; }
        const kept = [kids()[0].name, !!db.meta.babyDirty]; await Sync.run(true);
        return { kept, after: [kids()[0].name, !!db.meta.babyDirty] };
      });
      assert.deepEqual(off, { kept: ['Leo', true], after: ['Leo', false] });
      await syncNow(N); assert.equal(await N.evaluate(() => kids()[0].name), 'Leo');
    });

    await step('a meal of solid food is counted on its own, not as a milk feed: the day\'s tiles, Stats and the doctor\'s report', async () => {
      await P.evaluate(() => { db.events.push({ id: 'milk1', type: 'feed', ts: Date.now() - 60000, data: { kind: 'bottle', ml: 120, milk: 'Formula' }, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id }); save(); tab = 'month'; viewDay = startOfDay(Date.now()); calMonth = new Date(viewDay); render(); });
      const want = await P.evaluate(() => { const t = db.events.filter(e => e.type === 'feed' && e.ts >= startOfDay(Date.now())); return { milk: t.filter(e => e.data.kind !== 'solids').length, solids: t.filter(e => e.data.kind === 'solids').length }; });
      assert(want.milk >= 1 && want.solids >= 1, JSON.stringify(want));
      const tiles = Object.fromEntries(await P.$$eval('.tiles .tile', ts => ts.map(t => [t.querySelector('.tl').firstChild.textContent, t.querySelector('.tv b').textContent])));
      assert.equal(tiles.Feeds, String(want.milk), JSON.stringify(tiles)); assert.equal(tiles.Solids, String(want.solids), JSON.stringify(tiles));
      assert.deepEqual(await P.evaluate(() => { const x = dayStats(startOfDay(Date.now())); return [x.feeds, x.solids]; }), [want.milk, want.solids]);
      await P.evaluate(() => { tab = 'stats'; render(); });
      assert(/Solid meals per day/.test(await P.textContent('#view')), 'Stats');
      const t = await P.evaluate(async () => (await doctorPdf(kids()[0].id, { days: 7, every: false, notes: '' })).text.flat());
      assert(t.includes('Solid meals per day'), 'the report');
      await P.evaluate(() => { db.events = db.events.filter(e => e.id !== 'milk1'); save(); });
    });

    await step('the PDF for the doctor lists the allergies (with the first reaction) and the foods tried, with the day each was first given', async () => {
      const t = await P.evaluate(async () => (await doctorPdf(kids()[0].id, { days: 14, every: false, notes: '' })).text.flat());
      const al = t[t.indexOf('Allergies') + 1], tried = t[t.indexOf('Foods tried (first time)') + 1];
      assert(/^Peanut \(first reaction \w+ \d+, \d{4}\); Kiwi purée \(first reaction/.test(al), al);
      assert(/^Peanut \(\w{3}, \w{3} \d+\), Banana \(.*\), Kiwi purée \(/.test(tried), tried);
    });

    await step('a parent can remove an allergy; damaged or hostile allergy data in a profile is cleaned up', async () => {
      await P.evaluate(() => { tab = 'more'; render(); });
      P.dialogs = []; await P.click('[data-alrm][data-food="Kiwi purée"]'); assert.deepEqual(await P.evaluate(() => kids()[0].allergies.map(a => a.food)), ['Peanut']);
      const r = await P.evaluate(() => Kids.allergies([null, 7, { food: '  ' }, { food: 'x'.repeat(200), date: '2026-13-45', note: 5 }, { food: 'Egg', date: '2027-01-02', note: '<b>' }, { food: 'egg', date: '2026-12-31' }, ...Array.from({ length: 30 }, (_, i) => ({ food: 'f' + i }))]));
      assert.equal(r.length, 12, 'at most 12'); assert.deepEqual(r[0], { food: 'x'.repeat(60), date: '', note: '' });
      assert.deepEqual(r[1], { food: 'Egg', date: '2026-12-31', note: '<b>' }, 'one per food, the earliest date');
      assert.equal(await P.evaluate(() => Kids.clean([{ id: 'a', allergies: 'nope' }])[0].allergies.length), 0);
    });

    await step('solid meals are a routine of their own; the Guide explains starting solids', async () => {
      const keys = await P.evaluate(() => {
        const k = kids()[0].id, evs = [];
        for (let i = 1; i <= 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); d.setHours(12, 0, 0, 0); evs.push({ type: 'feed', ts: d.getTime(), data: { kind: 'solids', foods: ['Banana'] }, child: k }); d.setHours(12, 10); evs.push({ type: 'feed', ts: d.getTime(), data: { kind: 'bottle', ml: 120 }, child: k }); }
        return Routine.find(evs, Date.now()).slots.map(s => [s.key, s.foods || null]);
      });
      assert.deepEqual(keys.map(k => k[0]).sort(), ['feed', 'solids'], JSON.stringify(keys)); assert.deepEqual(keys.find(k => k[0] === 'solids')[1], ['Banana']);
      assert(keys.some(k => k[0] === 'solids') && keys.some(k => k[0] === 'feed'), 'milk at 12:10 and the meal at 12:00 are two routine times');
      await P.evaluate(() => { tab = 'guide'; render(); document.querySelector('details[data-grp=gsolids]').open = true; });
      assert(/Starting solid foods/.test(await P.textContent('details[data-grp=gsolids] summary')) && /Key allergens: early and often/.test(await P.textContent('details[data-grp=gsolids]')));
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, []); assert.deepEqual(p.csp, []); }
    });
  } catch (e) { failed++; console.log('✗ crashed:', e); } finally { await H.close(); }
  console.log(`\n${failed ? failed + ' FAILED, ' : ''}${ok} passed`); process.exit(failed ? 1 : 0);
})();
