// The health record, for every age: measurements against the CDC growth charts (percentiles, a chart with the percentile lines), in kg
// and cm or pounds and inches; vaccines and doctor visits; the record's page (from the Guide, More and Stats); kept private like health
// notes (a helper without health access gets none of it, the server keeps it under the health key); the doctor's report; the Day page
// and the milestone sheet leading to it; the Guide's health checks.   node tests/health.test.js
const assert = require('assert');
/* global Growth, openSheet, openRecord, reportBlocks, describe, saveProfile, dkey, G, usUnits */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 9).join('\n    ')); } };

(async () => {
  const H = await setup({ port: 8137 }), { q, syncNow } = H;
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    await P.emulateMedia({ reducedMotion: 'reduce' });
    await P.evaluate(() => {
      window.G = {
        born: (y, m = 0, d = 3) => { const now = new Date(), t = new Date(now); t.setDate(15); t.setFullYear(t.getFullYear() - y); t.setMonth(t.getMonth() - m); t.setDate(Math.min(now.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); t.setDate(t.getDate() - d); return dkey(t.getTime()); },
        kid: (i, y, m, sex, name) => { while (kids().length <= i) kids().push(Kids.make(kids(), name || 'Kid' + kids().length)); const k = kids()[i]; k.birth = G.born(y, m); k.sex = sex; if (name) k.name = name; (db.meta.ms || (db.meta.ms = {}))[k.id] = 999; (db.meta.solids || (db.meta.solids = {}))[k.id] = 1; saveProfile(); return k.id; },
        ev: (type, ts, data, kid) => { const e = { id: 'h' + Math.random().toString(36).slice(2, 9), type, ts, data, note: '', updated: stamp(), by: Auth.id, child: kid }; db.events.push(e); return e; },
        ago: days => Date.now() - days * 864e5,
      };
      db.meta.region = 'eu';
    });
    const leo = await P.evaluate(() => G.kid(0, 1, 2, 'boy'));
    const sheet = () => P.evaluate(() => !$('#sheet').hidden && $('#sheet h3').textContent.trim());

    await step('percentiles from the CDC growth charts: the charts\' own 3rd, 50th and 97th percentile values come out as those percentiles; none without boy or girl, or past a chart\'s ages', async () => {
      // rows of the CDC tables (www.cdc.gov/growthcharts/data/zscore): [chart kind, sex, months, P3, P50, P97]
      const rows = [['weight', 'boy', 0, 2.355450986, 3.530203168, 4.446488308], ['weight', 'girl', 12.5, 7.93103031, 9.666089185, 11.85539095], ['height', 'boy', 24, 79.91084447, 86.45220101, 93.02265441],
        ['head', 'boy', 0, 31.48762321, 35.81366835, 38.85417217], ['height', 'girl', 120.5, 125.9599043, 138.2111552, 151.2919534]];
      const r = await P.evaluate(rs => rs.map(([kind, sex, m, p3, p50, p97]) => [p3, p50, p97].map(x => { const p = Growth.percentile(kind, sex, m, x); return p && Math.round(p.pct * 10) / 10; })), rows);
      r.forEach((ps, i) => ps.forEach((p, j) => assert(p !== null && Math.abs(p - [3, 50, 97][j]) < 0.6, `${rows[i].slice(0, 3)}: ${p} for the ${[3, 50, 97][j]}th`)));
      const inv = await P.evaluate(() => Math.abs(Growth.at('weight', 'boy', 0, 50) - 3.530203168));
      assert(inv < 0.005, 'and back from a percentile to the value');
      const none = await P.evaluate(() => [Growth.percentile('weight', '', 12, 10), Growth.percentile('head', 'boy', 40, 50), Growth.percentile('bmi', 'girl', 12, 16), Growth.percentile('weight', 'boy', 300, 70)]);
      assert.deepEqual(none, [null, null, null, null]);
    });

    await step('a measurement in kg and cm, with the percentiles shown as it is typed; it is checked for numbers that can\'t be right', async () => {
      await P.evaluate(id => { setKid(id); tab = 'day'; render(); openSheet('growth'); }, leo);
      assert.equal(await sheet(), 'Add measurement'); assert(await P.$('#gc'), 'head size for a child under 3');
      await P.fill('#gw', '10.2'); await P.fill('#gh', '77');
      const note = await P.textContent('#gpct');
      assert(/^Weight: \d+(st|nd|rd|th) percentile · Length or height: \d+(st|nd|rd|th) percentile$/.test(note), note);
      await P.click('#save');
      assert.deepEqual(await P.evaluate(() => { const e = db.events.filter(x => x.type === 'growth').pop(); return [e.data, describe(e)]; }), [{ weight: 10.2, height: 77 }, ['10.2 kg · 77 cm', '']]);
      await P.evaluate(() => openSheet('growth')); await P.fill('#gw', '102'); P.dialogs = []; await P.click('#save');
      assert.equal(await sheet(), 'Add measurement', 'refused'); assert(/check the numbers and the units/.test(await P.textContent('#toast')));
      await P.fill('#gw', ''); await P.click('#save'); assert(/at least one measurement/.test(await P.textContent('#toast'))); await P.click('#cancel');
    });

    await step('…or in pounds and inches (More → Units, or in North America by default), saved in kg and cm', async () => {
      assert.equal(await P.evaluate(() => { delete db.meta.units; db.meta.region = 'na'; return usUnits(); }), true, 'North America: pounds and inches');
      await P.evaluate(() => { db.meta.region = 'eu'; tab = 'more'; render(); });
      assert.deepEqual(await P.$$eval('[name=units]', x => x.map(i => [i.value, i.checked])), [['metric', true], ['us', false]]);
      await P.click('[name=units][value=us]'); assert.equal(await P.evaluate(() => db.meta.units), 'us');
      await P.evaluate(() => openSheet('growth')); await P.fill('#gwlb', '22'); await P.fill('#gwoz', '8'); await P.fill('#gh', '30.3'); await P.click('#save');
      const r = await P.evaluate(() => { const e = db.events.filter(x => x.type === 'growth').pop(); return [e.data, describe(e)]; });
      assert.deepEqual(r, [{ weight: 10.206, height: 77 }, ['22 lb 8 oz · 30.3 in', '']]);
      await P.click('[name=units][value=metric]').catch(async () => { await P.evaluate(() => { tab = 'more'; render(); }); await P.click('[name=units][value=metric]'); });
      assert.equal(await P.evaluate(() => db.meta.units), 'metric');
    });

    await step('vaccines from the list or typed in, with the dose, where and the batch number; doctor visits with what kind, who (the pediatrician filled in) and why', async () => {
      await P.evaluate(() => { db.baby.doctor = { name: 'Dr Lee' }; saveProfile(); tab = 'day'; render(); openSheet('vaccine'); });
      assert.equal(await P.isVisible('#vother'), false);
      await P.selectOption('#vname', '6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B)'); await P.click('#sheet [name=vdose][value="2"]');
      await P.fill('#vplace', 'Riverside Clinic'); await P.fill('#vbatch', 'AB123'); await P.click('#save');
      await P.evaluate(() => openSheet('vaccine')); await P.selectOption('#vname', '__other'); assert(await P.isVisible('#vother'));
      await P.fill('#vother', 'Hepatitis A and typhoid'); await P.click('#save');
      await P.evaluate(() => openSheet('vaccine')); await P.click('#save'); assert(/Choose the vaccine/.test(await P.textContent('#toast'))); await P.click('#cancel');
      await P.evaluate(() => openSheet('visit')); assert.equal(await P.inputValue('#vwho'), 'Dr Lee');
      assert.deepEqual(await P.$$eval('#sheet [name=vkind]', x => x.map(i => i.value)), ['Checkup', 'Unwell', 'Dentist', 'Eyes', 'Hearing', 'Specialist', 'Hospital', 'Urgent care or ER']);
      await P.click('#sheet [name=vkind][value=Unwell]'); await P.fill('#vwhy', 'Ear infection'); await P.fill('#note', 'Antibiotics for a week'); await P.click('#save');
      const r = await P.evaluate(() => db.events.filter(e => e.type === 'vaccine' || e.type === 'visit').map(e => [e.type, e.data, describe(e)]));
      assert.deepEqual(r, [
        ['vaccine', { name: '6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B)', dose: 2, place: 'Riverside Clinic', batch: 'AB123' }, ['6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B)', 'dose 2 · Riverside Clinic']],
        ['vaccine', { name: 'Hepatitis A and typhoid', own: true }, ['Hepatitis A and typhoid', '']],
        ['visit', { kind: 'Unwell', who: 'Dr Lee', why: 'Ear infection' }, ['Unwell', 'Dr Lee · Ear infection']]]);
      const grp = await P.textContent('#view details.grp[data-grp=dhealth] .gt'); assert(/5 for the health record/.test(grp), grp);
    });

    await step('the health record: from the Guide, More and Stats; the child, the latest measurements with percentiles, a chart over the CDC lines, vaccines by vaccine, visits; back to where it was opened from', async () => {
      await P.evaluate(id => { G.ev('growth', G.ago(300), { weight: 7.9, height: 68, head: 44 }, id); G.ev('growth', G.ago(120), { weight: 9.2, height: 73.5, head: 46 }, id);
        G.ev('vaccine', G.ago(350), { name: '6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B)', dose: 1 }, id); save(); tab = 'guide'; render(); }, leo);
      assert(/2 vaccines · 1 visit · 4 measurements|3 vaccines · 1 visit · 4 measurements/.test(await P.textContent('#view [data-record]')), await P.textContent('#view [data-record]'));
      await P.click('#view [data-record]');
      assert.equal(await P.evaluate(() => tab), 'health'); assert(/Leo's health record/.test(await P.textContent('.rechead')) && /Boy/.test(await P.textContent('.rechead')));
      assert.equal(await P.evaluate(() => document.querySelector('#tabs .on').dataset.tab), 'guide', 'the Guide tab stays lit');
      const stats = await P.$$eval('.recgrowth .stat', x => x.map(s => s.textContent.replace(/\s+/g, ' ').trim()));
      assert.equal(stats.length, 3, 'weight, length and head (no BMI under 2)'); assert(/^Weight.*10\.2 kg\s*\d+(st|nd|rd|th) percentile$/.test(stats[0]), stats[0]);
      const chart = await P.evaluate(() => ({ lines: document.querySelectorAll('svg.gchart .pline').length, mid: document.querySelectorAll('svg.gchart .pline.mid').length, dots: document.querySelectorAll('svg.gchart .kdot').length,
        labels: [...document.querySelectorAll('svg.gchart .plab')].map(t => t.textContent), kinds: [...document.querySelectorAll('[data-gkind]')].map(b => b.dataset.gkind), aria: document.querySelector('svg.gchart').getAttribute('aria-label') }));
      assert.deepEqual([chart.lines, chart.mid, chart.dots, chart.labels, chart.kinds], [5, 1, 4, ['3', '15', '50', '85', '97'], ['weight', 'height', 'head']], JSON.stringify(chart));
      assert(/^Weight, 10\.2\d? kg, \d+(st|nd|rd|th) percentile$/.test(chart.aria), chart.aria);   // (two were saved in the same minute)
      await P.click('[data-gkind=head]'); assert.equal(await P.evaluate(() => document.querySelectorAll('svg.gchart .kdot').length), 2, 'two head measurements');
      const vac = await P.$$eval('.vaccines .vrow', x => x.map(v => [v.querySelector('b').textContent.trim(), v.querySelectorAll('.vdose').length]));
      assert.deepEqual(vac, [['6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B)', 2], ['Hepatitis A and typhoid', 1]], 'by vaccine, oldest dose first');
      assert(/Unwell/.test(await P.textContent('.visits')) && /Antibiotics for a week/.test(await P.textContent('.visits')));
      await P.click('.vaccines .vdose'); assert.equal(await sheet(), 'Edit vaccine', 'a dose opens to change it'); await P.click('#cancel');
      await P.click('[data-recback]'); assert.equal(await P.evaluate(() => tab), 'guide', 'back to the Guide');
      await P.evaluate(() => { tab = 'more'; render(); }); await P.click('.kidrow [data-record]'); await P.click('[data-recback]'); assert.equal(await P.evaluate(() => tab), 'more', 'back to More');
      await P.evaluate(() => { tab = 'stats'; render(); }); assert(await P.$('#view [data-record]'), 'and from Stats');
    });

    await step('the record is private: a caregiver who may not see health notes gets none of it (no button, no entries), and the server keeps it under the health key', async () => {
      const C = await H.addMember(P, 'sitter@x.com', 'caregiver', { view_health: false }, { name: 'Sam' });
      await syncNow(P); await syncNow(C);
      const r = await C.evaluate(() => ({ kinds: [...new Set(db.events.map(e => e.type))], btn: (tab = 'guide', render(), !!document.querySelector('[data-record]')) }));
      assert(!r.kinds.some(k => ['vaccine', 'visit', 'growth'].includes(k)), JSON.stringify(r.kinds)); assert.equal(r.btn, false);
      await C.evaluate(() => openRecord(kids()[0].id)); assert.notEqual(await C.evaluate(() => tab), 'health'); assert(/access to health notes/.test(await C.textContent('#toast')));
      const ids = await P.evaluate(() => db.events.filter(e => ['vaccine', 'visit', 'growth'].includes(e.type)).map(e => e.id));
      const rows = await q('select id, sensitive, blob from events where id = any($1)', [ids]);
      assert.equal(rows.length, ids.length); assert(rows.every(x => x.sensitive === true && !/Riverside|AB123|Ear infection|6-in-1/.test(x.blob)), 'sealed with the health key');
      await C.context().close();
    });

    await step('the report for the doctor has the health record: every measurement with its percentiles, the vaccines, and the visits in the period', async () => {
      const r = await P.evaluate(id => { const b = reportBlocks(id, { days: 30 }).blocks, i = t => b.findIndex(x => x.h === 2 && x.text === t); return { growth: b[i('Growth') + 1].table, vaccines: b[i('Vaccines') + 1].table, visits: b[i('Doctor visits') + 1].table, cdc: b.some(x => x.p === 'Percentiles from the CDC growth charts.') }; }, leo);
      assert.deepEqual(r.growth.head, ['Date', 'Age', 'Weight', 'Length or height', 'Head']); assert.equal(r.growth.rows.length, 4);
      assert(r.growth.rows.some(row => /^10\.2 kg \(\d+(st|nd|rd|th) percentile\)$/.test(row[2])), JSON.stringify(r.growth.rows)); assert(r.cdc);
      assert.deepEqual(r.vaccines.head, ['Vaccine', 'Date', 'Where']);
      assert.deepEqual(r.vaccines.rows.map(x => x[0]), ['6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B) · dose 1', '6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B) · dose 2', 'Hepatitis A and typhoid']);
      assert.deepEqual(r.visits.rows.map(x => [x[1], x[2], x[3]]), [['Unwell', 'Dr Lee', 'Ear infection · Antibiotics for a week']]);
    });

    await step('the Day page: the health sheet leads to a vaccine, a visit or a measurement; the milestone sheet keeps its checkup in the record', async () => {
      await P.evaluate(() => { tab = 'day'; render(); openSheet('health'); });
      assert.deepEqual(await P.$$eval('#sheet [data-switch]', x => x.map(b => b.dataset.switch)), ['vaccine', 'visit', 'growth']);
      await P.click('#sheet [data-switch=visit]'); assert.equal(await sheet(), 'Add doctor visit'); await P.click('#cancel');
      await P.evaluate(() => { const k = kids()[0], d = new Date(); d.setMonth(d.getMonth() - 2); d.setDate(d.getDate() - 2); k.birth = dkey(d.getTime()); delete db.meta.ms[k.id]; saveProfile(); tab = 'day'; render(); });
      assert.equal(await sheet(), 'Leo is 2 months old'); await P.click('#msVisit');
      assert.equal(await sheet(), 'Add doctor visit'); assert.equal(await P.evaluate(() => $('#sheet [name=vkind]:checked').value), 'Checkup'); await P.click('#cancel');
      await P.evaluate(() => { kids()[0].birth = G.born(1, 2); db.meta.ms[kids()[0].id] = 999; saveProfile(); });
    });

    await step('the Guide\'s health checks: vaccines (with when to call), checkups, and what growth chart percentiles mean', async () => {
      await P.evaluate(() => { tab = 'guide'; render(); });
      assert.deepEqual(await P.$$eval('#view details.gd[data-grp^=h] .gt b', x => x.map(b => b.textContent)), ['Vaccines', 'Checkups', 'Growth charts']);
      await P.click('details[data-grp=hvaccines] > summary'); assert(/Call 911 straight away/.test(await P.textContent('details[data-grp=hvaccines]')) || /straight away/.test(await P.textContent('details[data-grp=hvaccines]')));
      await P.click('details[data-grp=hgrowth] > summary'); assert(/CDC growth charts/.test(await P.textContent('details[data-grp=hgrowth]')));
    });

    await step('with two children a measurement is one child\'s: the one whose record is open, with a head size only under 3 and that child\'s percentiles', async () => {
      const ella = await P.evaluate(() => G.kid(1, 7, 3, 'girl', 'Ella'));
      await P.evaluate(id => openRecord(id, 'guide'), ella); await P.click('#view [data-add=growth]');
      assert.deepEqual(await P.$$eval('#sheet [name=kid]', x => x.map(i => [i.type, i.checked])), [['radio', false], ['radio', true]], 'one child, Ella ticked');
      assert.equal(await P.isVisible('#gc'), false, 'no head size at 7');
      await P.fill('#gw', '23'); await P.fill('#gh', '122');
      assert(/BMI: \d+(st|nd|rd|th) percentile/.test(await P.textContent('#gpct')), await P.textContent('#gpct'));
      await P.click(`#sheet [name=kid][value="${leo}"]`); assert(await P.isVisible('#gc'), 'Leo, at 1, has a head size');
      assert(!/BMI/.test(await P.textContent('#gpct')), 'and no BMI');
      await P.click(`#sheet [name=kid][value="${ella}"]`); await P.click('#save');
      assert.deepEqual(await P.evaluate(() => db.events.filter(e => e.type === 'growth' && e.data.weight === 23).map(e => [e.child, e.data])), [[ella, { weight: 23, height: 122 }]]);
    });

    if (process.env.DEBUG) console.log('page errors:', P.errs);
    assert.deepEqual(P.errs, [], 'no errors on the page'); assert.deepEqual(P.csp, []);
  } finally { await H.close(); }
  console.log(`\n${ok} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
