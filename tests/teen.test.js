// The teenage years and 18: a teenager's Day page, the note when the teenage years start, the Guide's topics for teenagers (first for a
// teenager, after the milestones from 10); the family calendar (an exam, a match, a school holiday for two children: coming up on the Day
// page, marked on the Month tab and listed on its day, changed and deleted; a school holiday giving the routine's school week a break;
// shared end-to-end encrypted); turning 18 (the sheet once, the birthday kept as a big moment, the grown-up card, the book as a PDF with
// every big moment in chapters, the record as a file); an older phone skipping what it doesn't know.   node tests/teen.test.js
const assert = require('assert');
/* global G, describe, saveProfile, openPlan, Routine, E2EE, bookPdf, exportRecord, plansIn, holidayOn, toLocalInput, dkey, viewDay:writable, graduationCheck, download:writable */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 9).join('\n    ')); } };

(async () => {
  const H = await setup({ port: 8139 }), { q, syncNow } = H;
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Sophie', 'Mum');
    await P.emulateMedia({ reducedMotion: 'reduce' });
    await P.evaluate(() => {
      window.G = {
        born: (y, m = 0, d = 3) => {
          const now = new Date(), t = new Date(now); t.setDate(15); t.setFullYear(t.getFullYear() - y); t.setMonth(t.getMonth() - m);
          t.setDate(Math.min(now.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); t.setDate(t.getDate() - d); return dkey(t.getTime());
        },
        age: (i, y, m = 0, name, d = 3) => {
          while (kids().length <= i) kids().push(Kids.make(kids(), name || 'Kid' + kids().length));
          const k = kids()[i]; k.birth = G.born(y, m, d); if (name) k.name = name;
          (db.meta.ms || (db.meta.ms = {}))[k.id] = 999; (db.meta.solids || (db.meta.solids = {}))[k.id] = 1; (db.meta.grownSeen || (db.meta.grownSeen = {}))[k.id] = 1; saveProfile(); return k.id;
        },
        page: (id, t = 'day', day = startOfDay(Date.now())) => { setKid(id); tab = t; viewDay = day; render(); },
        buttons: () => [...document.querySelectorAll('#view .quick [data-add]')].map(b => b.dataset.add),
        ev: (type, ts, data, kid, extra = {}) => { const e = { id: 't' + Math.random().toString(36).slice(2, 9), type, ts, data, note: '', updated: Date.now(), by: Auth.id, child: kid, ...extra }; db.events.push(e); return e; },
        at: (daysAgo, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.getTime(); },
        sheetOpen: () => !$('#sheet').hidden,
      };
      db.meta.region = 'eu';
    });
    const sophie = await P.evaluate(() => G.age(0, 15, 2, 'Sophie'));
    const sheet = () => P.evaluate(() => !$('#sheet').hidden && $('#sheet h3').textContent.trim());

    await step('a teenager\'s Day page: Meal, Sleep, Activity, Homework, Health, Meds and Drop-off, and a note that the teenage years have begun, until it is closed', async () => {
      await P.evaluate(id => { db.meta.stageSeen = {}; G.page(id); }, sophie);
      assert.deepEqual(await P.evaluate(() => G.buttons()), ['meal', 'sleep', 'play', 'study', 'health', 'med', 'care', 'vomit'], 'the baby days are over: no feed, diaper, potty or night waking');
      assert.equal(await P.$('#view .quick [data-addmore]'), null, 'and nothing behind More');
      assert(/Sophie is a teenager: the Guide has topics for the teenage years/.test(await P.textContent('#view .grownote')));
      await P.click('#view [data-stageok]'); assert.equal(await P.evaluate(() => db.meta.stageSeen[kids()[0].id]), 'teen');
      await P.evaluate(id => G.page(id), sophie); assert.equal(await P.$('#view .grownote'), null);
    });

    await step('the Guide: the teenage years first for a teenager; for a school child of 10 or more, after the milestones; not for a younger one', async () => {
      const heads = () => P.$$eval('#view h2', x => x.map(h => h.textContent.trim()));
      await P.evaluate(id => G.page(id, 'guide'), sophie);
      assert.deepEqual(await heads(), ['Right now', 'Puberty', 'Teenagers', 'Play and activities', 'Health checks'], 'no solids, baby medicines, milestones or newborn worries for a teenager');
      assert.deepEqual(await P.$$eval('#view details.gd[data-grp^=n] .gt b', x => x.map(b => b.textContent)), ['Sleep for teenagers', 'Mental health', 'Phones and life online', 'Alcohol, vaping and drugs',
        'Relationships, sex and consent', 'Periods', 'Spots and acne', 'Food, body image and sport', 'Driving and getting about', 'Growing independence']);
      await P.click('details[data-grp=nmind] > summary'); assert(/take it seriously: stay with them/.test(await P.textContent('details[data-grp=nmind]')));
      assert(/The teenage years/.test(await P.textContent('.nowcard')));
      const tom = await P.evaluate(() => G.age(1, 11, 0, 'Tom')); await P.evaluate(id => G.page(id, 'guide'), tom);
      assert.deepEqual(await heads(), ['Right now', 'Puberty', 'School age', 'Play and activities', 'Health checks', 'Teenagers'], 'at 11: puberty and the school years first, the teenage years as what comes next, none of the baby years');
      await P.evaluate(id => { G.age(1, 7, 0); G.page(id, 'guide'); }, tom); assert(!(await heads()).includes('Teenagers') && !(await heads()).includes('Puberty'), 'not at 7');
    });

    await step('the baby days are left out of a teenager\'s pages (no potty in the legends, no formula setting, none of the Guide\'s baby sections), and the Everyone page keeps them all while a younger child is in the family', async () => {
      await P.evaluate(() => G.age(1, 0, 1, 'Tom'));   // (Tom is a baby for this step)
      const legend = () => P.$$eval('#view .clegend span', x => x.map(s => s.textContent.replace(/\s*\d+\s*$/, '').trim()));
      await P.evaluate(id => G.page(id), sophie);
      assert.deepEqual(await legend(), ['Meals', 'Sleep & wake-ups', 'School', 'Vomit', 'Activities & homework', 'Health & meds'], 'no diapers or potty in the clock legend');
      await P.evaluate(id => G.page(id, 'month'), sophie); assert(!/Potty|Diaper/.test(await P.textContent('#view .legend')), 'nor in the month legend');
      await P.evaluate(id => G.page(id, 'more'), sophie);
      assert.deepEqual(await P.evaluate(() => [...document.querySelectorAll('.kidrow')].map(r => [r.querySelector('[data-kn]').value, !!r.querySelector('.fpick')])), [['Sophie', false], ['Tom', true]], 'no formula for the teenager');
      await P.evaluate(id => G.page(id, 'guide'), sophie);
      assert.deepEqual(await P.evaluate(() => [!!document.querySelector('details[data-grp=gsolids]'), !!document.querySelector('details[data-grp=omenu]'), document.querySelectorAll('#view details.gd[data-grp^=m]').length, !!document.querySelector('details[data-grp=credits]')]), [false, false, 0, false], 'no solids, medicines, milestones or picture credits');
      // everyone together: the baby needs it all
      await P.evaluate(() => G.page('all'));
      const b = await P.evaluate(() => G.buttons()); assert(b.includes('feed') && b.includes('diaper'), b.join(','));
      assert(/Diapers/.test((await legend()).join(' ')), 'diapers back in the legend');
      await P.evaluate(() => G.page('all', 'guide'));
      const h = await P.$$eval('#view h2', x => x.map(t => t.textContent.trim())); assert(h.includes('Common with newborns') && h.includes('Month by month') && h.includes('Medicines'), h.join(', '));
      await P.evaluate(() => G.age(1, 7, 0, 'Tom')); await P.evaluate(id => G.page(id), sophie);
    });

    await step('the family calendar: an exam with a time, a school holiday of several days for two children; coming up on the Day page, marked on the Month tab and listed on its day', async () => {
      const tom = await P.evaluate(() => kids()[1].id);
      await P.evaluate(id => G.page(id, 'month'), sophie);
      await P.click('#view [data-plannew]'); assert.equal(await sheet(), 'Add event');
      assert.deepEqual(await P.$$eval('#sheet [name=pkind]', x => x.map(i => i.value)), ['Exam', 'Appointment', 'Match or game', 'Lesson', 'School holiday', 'Party', 'Other']);
      await P.click('#sheet [name=pkind][value=Exam]'); await P.fill('#ptitle', 'Maths exam');
      await P.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 2); $('#pday').value = dkey(d.getTime()); }); await P.fill('#ptime', '09:30'); await P.click('#psave');
      await P.evaluate(() => openPlan(null)); await P.click('#sheet [name=pkind][value="School holiday"]'); await P.fill('#ptitle', 'Half term');
      await P.evaluate(tid => { const a = new Date(); a.setDate(a.getDate() + 3); const b = new Date(a); b.setDate(b.getDate() + 4); $('#pday').value = dkey(a.getTime()); $('#puntil').value = dkey(b.getTime());
        document.querySelector(`#sheet [name=pkid][value="${tid}"]`).checked = true; }, tom);
      await P.click('#psave');
      const r = await P.evaluate(() => db.events.filter(e => e.type === 'plan').map(e => ({ kind: e.data.kind, title: e.data.title, allday: !!e.data.allday, days: e.end ? Math.round((e.end - e.ts) / 864e5) : 1, time: new Date(e.ts).getHours() * 60 + new Date(e.ts).getMinutes(), kid: kidName(kidById(e.child)) })));
      assert.deepEqual(r, [{ kind: 'Exam', title: 'Maths exam', allday: false, days: 1, time: 570, kid: 'Sophie' }, { kind: 'School holiday', title: 'Half term', allday: true, days: 5, time: 0, kid: 'Sophie' }, { kind: 'School holiday', title: 'Half term', allday: true, days: 5, time: 0, kid: 'Tom' }]);
      await P.evaluate(() => G.page('all'));
      const up = await P.$$eval('#view .upcoming .prow', x => x.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
      assert.equal(up.length, 2, 'one row for the holiday of both children: ' + up.join(' | '));
      assert(/Maths exam .* 9:30 AM · Exam · Sophie/.test(up[0]), up[0]); assert(/Half term .* – .* · School holiday · Sophie and Tom/.test(up[1]), up[1]);
      await P.evaluate(() => { tab = 'month'; render(); });
      const marks = await P.evaluate(() => document.querySelectorAll('#view .cal .pmark').length);
      assert(marks >= 1, 'days marked on the calendar'); assert(/On the calendar/.test(await P.textContent('#view .legend')));
      await P.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 2); viewDay = startOfDay(d.getTime()); render(); });
      assert(/Maths exam/.test(await P.textContent('#view .prow')), 'listed on its day');
      await P.click('#view .prow'); assert.equal(await sheet(), 'Edit event'); assert.equal(await P.inputValue('#ptime'), '09:30');
      await P.fill('#ptitle', 'Maths and science exams'); await P.click('#psave');
      assert.equal(await P.evaluate(() => db.events.find(e => e.type === 'plan' && e.data.kind === 'Exam').data.title), 'Maths and science exams');
      // the holiday made for both children changes for both: a day longer, still one row
      await P.evaluate(() => G.page('all')); await P.click('#view .upcoming .prow:nth-of-type(2)');
      assert.deepEqual(await P.$$eval('#sheet [name=pkid]', x => x.map(i => i.checked)), [true, true], 'both children ticked');
      await P.evaluate(() => { const b = new Date($('#puntil').value + 'T00:00'); b.setDate(b.getDate() + 1); $('#puntil').value = dkey(b.getTime()); }); await P.click('#psave');
      assert.deepEqual(await P.evaluate(() => db.events.filter(e => e.type === 'plan' && e.data.kind === 'School holiday').map(e => Math.round((e.end - e.ts) / 864e5))), [6, 6]);
      assert.equal(await P.evaluate(() => document.querySelectorAll('#view .upcoming .prow').length), 2);
    });

    await step('nothing on the calendar goes on the clock, the day\'s list or the stats; the last day can\'t come before the first', async () => {
      await P.evaluate(id => G.page(id), sophie);
      assert.equal(await P.evaluate(() => document.querySelectorAll('#view svg .ray').length), 0, 'no ray for a plan');
      await P.evaluate(() => openPlan(null)); await P.evaluate(() => { $('#pday').value = dkey(Date.now() + 5 * 864e5); $('#puntil').value = dkey(Date.now()); });
      await P.click('#psave'); assert(/The last day must be after the first/.test(await P.textContent('#toast'))); await P.click('#sheet [data-close]');
    });

    await step('a school holiday gives the routine\'s school week a break', async () => {
      const r = await P.evaluate(() => {
        const id = kids()[1].id;
        for (let d = 27; d >= 1; d--) { const wd = new Date(G.at(d, 12)).getDay(); if (wd >= 1 && wd <= 5) G.ev('care', G.at(d, 8, 30), { place: 'School' }, id); if (d <= 7) G.ev('meal', G.at(d, 18), { meal: 'Dinner', foods: [] }, id); }
        const mine = db.events.filter(e => e.child === id), R = Routine.find(mine), hol = db.events.find(e => e.type === 'plan' && e.child === id), off = holidayOn(id);
        const mon = t => { const d = new Date(t); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d.getTime(); };
        const inHol = (() => { for (let t = hol.ts; t < hol.end; t += 864e5) { const d = new Date(t); if (d.getDay() >= 1 && d.getDay() <= 5) { d.setHours(12); return d.getTime(); } } })();
        const after = mon(hol.end + 864e5), has = (t, o) => Routine.today(R.slots, mine, t, o).list.some(o2 => o2.slot.key === 'care:School');
        return { slot: R.slots.some(s => s.key === 'care:School'), during: has(inHol, { off }), without: has(inHol, {}), after: has(after, { off }) };
      });
      assert.deepEqual(r, { slot: true, during: false, without: true, after: true });
    });

    await step('the calendar is shared, end-to-end encrypted; a deleted event goes from the other phone too', async () => {
      await syncNow(P);
      const C = await H.addMember(P, 'nan@x.com', 'family', {}, { name: 'Nan' });
      await syncNow(C);
      assert.deepEqual(await C.evaluate(() => db.events.filter(e => e.type === 'plan').map(e => e.data.title).sort()), ['Half term', 'Half term', 'Maths and science exams']);
      const rows = await q('select blob from events where blob is not null'); assert(rows.every(x => !/Half term|Maths|School holiday|"plan"/.test(x.blob)), 'only ciphertext on the server');
      await P.evaluate(() => { const e = db.events.find(x => x.type === 'plan' && x.data.kind === 'Exam'); openPlan(e); }); P.dialogs = [];
      await P.click('#pdel'); await syncNow(P); await syncNow(C);
      assert.deepEqual(await C.evaluate(() => db.events.filter(e => e.type === 'plan').map(e => e.data.kind)), ['School holiday', 'School holiday']);
      await C.context().close();
    });

    await step('turning 18: a sheet once, to celebrate and keep the day as a big moment; then the grown-up card with the book and the record', async () => {
      await P.evaluate(id => {
        const k = kids().find(x => x.id === id), b = new Date(); b.setFullYear(b.getFullYear() - 18); b.setDate(b.getDate() - 2); k.birth = dkey(b.getTime()); delete db.meta.grownSeen[id]; saveProfile();
        const born = new Date(k.birth + 'T09:00').getTime(), plus = (y, m = 0) => { const t = new Date(born); t.setFullYear(t.getFullYear() + y); t.setMonth(t.getMonth() + m); return t.getTime(); };
        G.ev('moment', born, { what: 'Born' }, id); G.ev('moment', plus(1), { what: 'First steps' }, id, { note: 'Three steps to Grandpa' }); G.ev('moment', plus(5, 9), { what: 'First day of school' }, id);
        G.ev('moment', plus(17), { what: 'Passed the driving test' }, id); G.ev('growth', plus(1), { weight: 9.5, height: 75 }, id); G.ev('growth', plus(10), { weight: 31, height: 138 }, id);
        G.ev('vaccine', plus(12), { name: 'HPV', dose: 1 }, id); save(); G.page(id);
      }, sophie);
      assert.equal(await sheet(), 'Sophie is 18'); assert(/Little Log has grown with Sophie all the way to 18/.test(await P.textContent('#sheet')));
      await P.click('#gMoment'); assert.equal(await sheet(), 'Save a big moment');
      assert.equal(await P.evaluate(() => $('#sheet [name=mmWhat]:checked').value), 'Turned 18'); await P.click('#mmSave');
      await P.evaluate(id => G.page(id), sophie); assert.equal(await P.evaluate(() => G.sheetOpen()), false, 'once only');
      const card = await P.textContent('#view .grown');
      assert(/Sophie is grown up, and Little Log's work is done/.test(card) && /\d+ entries · 5 big moments · since/.test(card), card);
    });

    await step('Sophie\'s book: every big moment in chapters for each stage of growing up, how she grew and her vaccines; and her record as a file', async () => {
      const r = await P.evaluate(async id => { const b = await bookPdf(id); return { file: b.file, pages: b.pages, text: b.text.join('\n'), pdf: String.fromCharCode(...b.bytes.slice(0, 5)) }; }, sophie);
      assert.equal(r.pdf, '%PDF-'); assert.equal(r.file, 'little-log-sophie-book.pdf');
      for (const s of ["Sophie's book", 'Newborn', 'Born', 'Toddler', 'First steps', 'Three steps to Grandpa', 'School age', 'First day of school', 'Teenager', 'Passed the driving test', 'Grown up', 'Turned 18', 'Growth', 'Vaccines', 'HPV · dose 1'])
        assert(r.text.includes(s), s + ' in the book');
      assert(r.text.indexOf('Newborn') < r.text.indexOf('School age') && r.text.indexOf('School age') < r.text.indexOf('Grown up'), 'in order');
      const f = await P.evaluate(id => { let got = null; const keep = download; download = (name, data, type) => { got = { name, data, type }; }; try { exportRecord(id); } finally { download = keep; } return got; }, sophie);
      const j = JSON.parse(f.data); assert.equal(f.name, 'little-log-sophie.json'); assert.equal(j.child.name, 'Sophie');
      assert(j.entries.some(e => e.type === 'moment' && e.data.what === 'Turned 18') && j.entries.some(e => e.type === 'vaccine'), 'every entry, health ones too for a parent');
      assert(!j.entries.some(e => e.type === 'plan'), 'not the calendar');
    });

    await step('an older phone skips what it does not know; calendar entries from a hostile writer are cleaned up', async () => {
      const r = await P.evaluate(async () => {
        const b = db.meta.babyId, e = { id: 'h0stile3', type: 'plan', ts: Date.now() + 864e5, data: { kind: 'Exam', title: 'X'.repeat(500), allday: 'yes', evil: '<img>' }, note: '', updated: Date.now() };
        const s = await E2EE.encryptEntry(b, e), out = await E2EE.decryptRow(b, { id: e.id, ...s, updated: e.updated });
        return out.entry.data;
      });
      assert.deepEqual(r, { kind: 'Exam', title: 'X'.repeat(80) });
    });

    if (process.env.DEBUG) console.log('page errors:', P.errs);
    assert.deepEqual(P.errs, [], 'no errors on the page'); assert.deepEqual(P.csp, []);
  } finally { await H.close(); }
  console.log(`\n${ok} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
