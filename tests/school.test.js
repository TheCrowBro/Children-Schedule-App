// Daycare, preschool and school: a drop-off (the usual place for the age, or the last one; who dropped off; who will pick up, and when),
// the banner while the child is there, and the pick-up logged by whoever does it (a family member who may not change other people's
// entries too); the stay on the clock's outer track and in the list; a day logged afterwards in one go; homework, reading and practice;
// a school child's activities; the routine of the school week (by the day of the week, over 4 weeks); the stats; the note when school
// age starts; the Guide's school-age topics; all of it end-to-end encrypted, and cleaned up when it comes from a hostile writer.
//   node tests/school.test.js
const assert = require('assert');
/* global G, describe, saveProfile, openSheet, Routine, E2EE, atCare, pickupAfter, toLocalInput, dkey, viewDay:writable */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 9).join('\n    ')); } };

(async () => {
  const H = await setup({ port: 8138 }), { q, syncNow } = H;
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Ella', 'Mum');
    await P.emulateMedia({ reducedMotion: 'reduce' });
    await P.evaluate(() => {
      window.G = {
        born: (y, m = 0, d = 3) => {
          const now = new Date(), t = new Date(now); t.setDate(15); t.setFullYear(t.getFullYear() - y); t.setMonth(t.getMonth() - m);
          t.setDate(Math.min(now.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); t.setDate(t.getDate() - d); return dkey(t.getTime());
        },
        age: (i, y, m = 0, name) => {
          while (kids().length <= i) kids().push(Kids.make(kids(), name || 'Kid' + kids().length));
          const k = kids()[i]; k.birth = G.born(y, m); if (name) k.name = name;
          (db.meta.ms || (db.meta.ms = {}))[k.id] = 999; (db.meta.solids || (db.meta.solids = {}))[k.id] = 1; saveProfile(); return k.id;
        },
        page: (id, t = 'day', day = startOfDay(Date.now())) => { setKid(id); tab = t; viewDay = day; render(); },
        buttons: () => ({ shown: [...document.querySelectorAll('#view .quick [data-add]')].map(b => b.dataset.add), labels: [...document.querySelectorAll('#view .quick [data-add]')].map(b => b.textContent.trim()),
          more: ((document.querySelector('#view .quick [data-addmore]') || {}).dataset || {}).addmore || '' }),
        ev: (type, ts, data, kid, extra = {}) => { const e = { id: 's' + Math.random().toString(36).slice(2, 9), type, ts, data, note: '', updated: Date.now(), by: Auth.id, child: kid, ...extra }; db.events.push(e); return e; },
        at: (daysAgo, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.getTime(); },
        ts: t => { $('#ts').value = toLocalInput(t); },
        last: type => db.events.filter(e => e.type === type).sort((a, b) => b.updated - a.updated || b.ts - a.ts)[0],
      };
      db.meta.region = 'eu';
    });
    const ella = await P.evaluate(() => G.age(0, 3, 4, 'Ella'));
    const sheet = () => P.evaluate(() => !$('#sheet').hidden && $('#sheet h3').textContent.trim());
    const checked = n => P.evaluate(x => (document.querySelector(`#sheet [name=${x}]:checked`) || {}).value, n);

    await step('the Day page: a drop-off from 3 months old (behind More for a baby), next to sleep for a toddler and a preschooler, and Drop-off, Activity and Homework for a school child', async () => {
      const at = async (y, m) => { await P.evaluate(([a, b]) => { G.age(0, a, b); G.page(kids()[0].id); }, [y, m]); return P.evaluate(() => G.buttons()); };
      const baby = await at(0, 6); assert.deepEqual(baby.shown, ['feed', 'diaper', 'sleep', 'wake', 'vomit', 'play', 'health', 'bath']); assert.equal(baby.more, 'med care');
      assert.deepEqual((await at(1, 6)).shown, ['meal', 'feed', 'diaper', 'potty', 'sleep', 'bath', 'health', 'care']);
      assert.deepEqual((await at(3, 4)).shown, ['meal', 'potty', 'sleep', 'care', 'play', 'bath', 'health', 'med']);
      const school = await at(7, 0);
      assert.deepEqual(school.shown, ['meal', 'care', 'sleep', 'play', 'study', 'health', 'med', 'wake']); assert.deepEqual(school.labels, ['Meal', 'Drop-off', 'Sleep', 'Activity', 'Homework', 'Health', 'Meds', 'Woke up']);
      await P.evaluate(() => { G.age(0, 3, 4); db.meta.stageSeen = {}; });
    });

    await step('a drop-off: the usual place for the age, who dropped off (this phone\'s person), who picks up and when; the banner says where the child is and who is coming', async () => {
      await P.evaluate(id => { G.page(id); openSheet('care'); G.ts(Date.now() - 2 * 3600e3); }, ella);
      assert.equal(await sheet(), 'Add drop-off'); assert.equal(await checked('cplace'), 'Preschool', 'a preschooler goes to preschool');
      assert.equal(await P.inputValue('#cwho'), 'Mum'); assert.equal(await P.isVisible('#cother'), false);
      await P.fill('#cplan', 'Grandpa Joe'); await P.fill('#cat', '15:15'); await P.click('#save');
      const r = await P.evaluate(() => { const e = G.last('care'); return { data: e.data, d: describe(e), at: atCare(e.child) === e }; });
      assert.deepEqual(r.data, { place: 'Preschool', who: 'Mum', plan: 'Grandpa Joe', at: 915 }); assert(r.at, 'at preschool now');
      assert.deepEqual(r.d, ['Preschool', 'dropped off by Mum · Grandpa Joe picks up at 3:15 PM']);
      const banner = await P.textContent('#sleepBanner'); assert(await P.isVisible('#sleepBanner [data-pickup]'));
      assert(/At Preschool since \d+:\d\d [AP]M\s*Grandpa Joe picks up at 3:15 PM/.test(banner.replace(/\s+/g, ' ')), banner);
      const clock = await P.evaluate(() => ({ arc: document.querySelectorAll('#view svg .carc').length, rays: document.querySelectorAll(`#view svg .ray[data-info="${G.last('care').id}"] path`).length }));
      assert.deepEqual(clock, { arc: 1, rays: 0 }, 'the stay on the outer track, the drop-off a dot without a ray');
    });

    await step('the pick-up: whoever picks up logs it (the planned person first), the stay is over, and the list shows it from when to when', async () => {
      await P.click('#sleepBanner [data-pickup]'); assert.equal(await sheet(), 'Ella picked up');
      assert.deepEqual(await P.$$eval('#sheet [name=pwho]', x => x.map(i => [i.value, i.checked])), [['Grandpa Joe', true], ['Mum', false], ['__other', false]]);
      await P.evaluate(() => { $('#pts').value = toLocalInput(G.last('care').ts - 60e3); }); await P.click('#psave');
      assert(/must be after the drop-off/.test(await P.textContent('#toast')), 'not before the drop-off');
      await P.evaluate(() => { $('#pts').value = toLocalInput(Date.now() - 30 * 60e3); }); await P.click('#psave');
      const r = await P.evaluate(() => { const c = G.last('care'), p = pickupAfter(c); return { pick: p && p.data, when: p && Math.round((Date.now() - p.ts) / 60e3), at: atCare(c.child), d: describe(c), dp: describe(p) }; });
      assert.deepEqual(r.pick, { place: 'Preschool', who: 'Grandpa Joe' }); assert(r.when >= 30 && r.when <= 31, r.when); assert.equal(r.at, null, 'picked up');
      assert(/^until \d+:\d\d [AP]M · dropped off by Mum$/.test(r.d[1]), r.d[1]); assert.deepEqual(r.dp, ['Picked up from Preschool', 'by Grandpa Joe']);
      assert.equal(await P.isVisible('#sleepBanner'), false);
      const day = await P.evaluate(() => startOfDay(G.last('care').ts));
      await P.evaluate(([id, d]) => G.page(id, 'day', d), [ella, day]);
      assert(/Preschool \d+:\d\d [AP]M – \d+:\d\d [AP]M/.test(await P.textContent('#view details.grp[data-grp=dcare] .gt')), 'the day\'s list: from when to when');
    });

    await step('a day logged afterwards in one go: the drop-off, and when the child was picked up (after it)', async () => {
      await P.evaluate(id => { G.page(id); openSheet('care'); G.ts(G.at(3, 8, 30)); $('#cout').value = toLocalInput(G.at(3, 8)); }, ella);
      await P.click('#save'); assert(/must be after the drop-off/.test(await P.textContent('#toast')), 'a pick-up before the drop-off is refused');
      await P.evaluate(() => { $('#cout').value = toLocalInput(G.at(3, 15)); }); await P.click('#save');
      const r = await P.evaluate(() => { const c = db.events.find(e => e.type === 'care' && e.ts === G.at(3, 8, 30)), p = c && pickupAfter(c); return [c && c.data.place, p && p.ts === G.at(3, 15), p && p.data]; });
      assert.deepEqual(r, ['Preschool', true, { place: 'Preschool' }]);
    });

    await step('somewhere else, typed in; the place used last is the one offered next time', async () => {
      await P.evaluate(id => { G.page(id); openSheet('care'); G.ts(Date.now() - 25 * 60e3); $('#cout').value = toLocalInput(Date.now() - 20 * 60e3); }, ella);
      await P.click('#sheet [name=cplace][value=__other]'); assert(await P.isVisible('#cother'));
      await P.click('#save'); assert(/Choose where/.test(await P.textContent('#toast')), 'a place is needed');
      await P.fill('#cother', 'Forest school'); await P.click('#save');
      assert.deepEqual(await P.evaluate(() => { const e = db.events.find(x => x.type === 'care' && x.data.place === 'Forest school'); return [e.data, describe(e)[0], !!pickupAfter(e)]; }), [{ place: 'Forest school', own: true, who: 'Mum' }, 'Forest school', true]);
      await P.evaluate(() => openSheet('care')); assert.equal(await checked('cplace'), '__other'); assert.equal(await P.inputValue('#cother'), 'Forest school'); await P.click('#cancel');
    });

    await step('a family member who may not change other people\'s entries picks up on their own phone; the server keeps only ciphertext', async () => {
      await P.evaluate(id => { G.page(id); openSheet('care'); G.ts(Date.now() - 10 * 60e3); }, ella);
      await P.click('#sheet [name=cplace][value=Daycare]'); await P.fill('#cplan', 'Grandpa'); await P.click('#save'); await syncNow(P);
      const C = await H.addMember(P, 'grandpa@x.com', 'family', {}, { name: 'Grandpa' });
      await C.evaluate(() => { db.meta.ms = { [kids()[0].id]: 999 }; db.meta.solids = { [kids()[0].id]: 1 }; tab = 'day'; render(); });
      await syncNow(C); await C.evaluate(() => render());
      assert(/At Daycare since/.test(await C.textContent('#sleepBanner')), 'Grandpa\'s phone shows where Ella is');
      assert.equal(await C.evaluate(() => Sync.can('edit', db.events.find(e => e.type === 'care' && !pickupAfter(e)))), false, 'he may not change Mum\'s entry');
      await C.click('#sleepBanner [data-pickup]'); assert.equal(await C.evaluate(() => $('#sheet [name=pwho]:checked').value), 'Grandpa');
      await C.click('#psave'); await syncNow(C); await syncNow(P);
      assert.equal(await P.evaluate(id => atCare(id), ella), null, 'Mum\'s phone: picked up');
      assert.deepEqual(await P.evaluate(() => { const p = G.last('pickup'); return [p.data, p.by !== Auth.id]; }), [{ place: 'Daycare', who: 'Grandpa' }, true]);
      const rows = await q("select blob from events where blob is not null");
      assert(rows.length > 4 && rows.every(x => !/Preschool|Daycare|Grandpa|Forest school/.test(x.blob)), 'only ciphertext on the server');
      await C.context().close();
    });

    const noah = await P.evaluate(() => G.age(1, 8, 2, 'Noah'));
    await step('homework, reading and practice: what, the subject, the minutes and, for reading, the pages; on the tiles and in the list', async () => {
      await P.evaluate(id => { G.page(id); openSheet('study'); }, noah);
      assert.equal(await sheet(), 'Add homework'); assert.deepEqual(await P.$$eval('#sheet [name=skind]', x => x.map(i => i.value)), ['Homework', 'Reading', 'Practising']);
      assert.equal(await checked('skind'), 'Homework'); assert.equal(await P.isVisible('#sPages'), false, 'pages only for reading');
      await P.fill('#ssub', 'Maths'); await P.fill('#min', '25'); await P.click('#save');
      await P.evaluate(() => openSheet('study')); await P.click('#sheet [name=skind][value=Reading]'); assert(await P.isVisible('#sPages'));
      await P.fill('#min', '15'); await P.fill('#pages', '12'); await P.click('#save');
      assert.deepEqual(await P.evaluate(() => db.events.filter(e => e.type === 'study').map(e => [e.data, describe(e)])),
        [[{ kind: 'Homework', subject: 'Maths', min: 25 }, ['Homework', 'Maths · 25 min']], [{ kind: 'Reading', min: 15, pages: 12 }, ['Reading', '15 min · 12 pages']]]);
      assert(/Homework 40m/.test(await P.textContent('#view details.grp[data-grp=dplay] .gt')), await P.textContent('#view details.grp[data-grp=dplay] .gt'));
      await P.evaluate(id => G.page(id, 'month'), noah); const tiles = await P.textContent('#view .tiles');
      assert(/Homework/.test(tiles) && /40m/.test(tiles), 'the day\'s tiles: ' + tiles);
    });

    await step('a school child\'s play is an activity (sport, swimming, dance, music…); a preschooler\'s is play', async () => {
      await P.evaluate(id => { G.page(id); openSheet('play'); }, noah);
      assert.deepEqual(await P.$$eval('#sheet [name=activity]', x => x.map(i => i.value)), ['Playing outside', 'Sport', 'Swimming', 'Dance', 'Music', 'Art or crafts', 'Games', 'Club or group']); await P.click('#cancel');
      await P.evaluate(id => { G.page(id); openSheet('play'); }, ella);
      assert.deepEqual(await P.$$eval('#sheet [name=activity]', x => x.map(i => i.value)), ['Play', 'Playing outside', 'Reading together', 'Walk / outing', 'Bath', 'Swimming', 'Music', 'Art or crafts']); await P.click('#cancel');
    });

    await step('the routine learns the school week: a drop-off at the same time on school days over 4 weeks comes back on those days only; swimming on its day', async () => {
      const r = await P.evaluate(id => {
        db.events = db.events.filter(e => e.child !== id);
        for (let d = 27; d >= 1; d--) {
          const wd = new Date(G.at(d, 12)).getDay();
          if (wd >= 1 && wd <= 5) { G.ev('care', G.at(d, 8, 30 + (d % 3)), { place: 'School', who: 'Dad' }, id); G.ev('pickup', G.at(d, 15, 30), { place: 'School', who: 'Mum' }, id); }
          if (wd === 2) G.ev('play', G.at(d, 17), { activity: 'Swimming', min: 45 }, id);
          if (d <= 7) G.ev('meal', G.at(d, 18), { meal: 'Dinner', foods: [] }, id);
        }
        const mine = db.events.filter(e => e.child === id), R = Routine.find(mine), w = R.slots.filter(s => s.weekdays).map(s => [s.key, s.weekdays.join('')]);
        const next = wd => { const t = new Date(); t.setHours(12, 0, 0, 0); while (t.getDay() !== wd) t.setDate(t.getDate() + 1); return t.getTime(); };
        const has = (t, key) => Routine.today(R.slots, mine, t).list.some(o => o.slot.key === key);
        return { w, sat: has(next(6), 'care:School'), mon: has(next(1), 'care:School'), tue: has(next(2), 'play:Swimming'), wed: has(next(3), 'play:Swimming') };
      }, noah);
      assert.deepEqual(r.w.sort(), [['care:School', '12345'], ['pickup:School', '12345'], ['play:Swimming', '2']]);
      assert.deepEqual([r.sat, r.mon, r.tue, r.wed], [false, true, true, false]);
      await P.evaluate(id => G.page(id, 'routine'), noah);
      const today = await P.evaluate(() => new Date(Date.now() - 6 * 3600e3).getDay()), text = await P.textContent('#view');   // (the routine's day runs from 6 AM to 6 AM)
      if (today === 0 || today === 6) assert(/Other days of the week/.test(text) && /Drop-off · School/.test(text) && /Mon – Fri/.test(text), 'at the weekend, school is under the other days');
      else assert(/Drop-off · School/.test(await P.textContent('#view .routine')), 'on a school day, school is in the day');
      assert(/Daycare, school, homework, and lessons and clubs are worked out from the last 4 weeks/.test(text));
    });

    await step('the stats: days at school and the time there (the card is School for a school child, Daycare & school before)', async () => {
      await P.evaluate(id => { G.page(id, 'stats'); }, noah);
      const card = await P.$$eval('#view .scard', x => x.map(c => c.textContent.replace(/\s+/g, ' ')).find(t => /Days there/.test(t)) || '');
      const schoolDays = [1, 2, 3, 4, 5, 6].filter(d => { const wd = new Date(Date.now() - d * 864e5).getDay(); return wd >= 1 && wd <= 5; }).length;   // (the last 7 days: today has no drop-off yet)
      assert(new RegExp(`School ?Days there ?${schoolDays} ?Time there on those days ?(7h|6h 5\\dm)`).test(card), card);
      await P.evaluate(id => { G.page(id, 'stats'); }, ella);
      assert(/Daycare & school/.test(await P.textContent('#view')));
    });

    await step('when school age starts, a note on the Day page says what changes, until it is closed', async () => {
      await P.evaluate(id => { db.meta.stageSeen = {}; G.page(id); }, noah);
      assert(/Noah is at school age: Drop-off and Homework are on the Day page/.test(await P.textContent('#view .grownote')));
      await P.click('#view [data-stageok]'); assert.equal(await P.$('#view .grownote'), null);
      await P.evaluate(id => G.page(id), noah); assert.equal(await P.$('#view .grownote'), null, 'stays closed');
      await P.evaluate(id => G.page(id), ella); assert.equal(await P.$('#view .grownote'), null, 'not for a preschooler');
    });

    await step('the Guide: the school-age topics first for a school child (no toddler topics), after the milestones for a preschooler, none for a toddler', async () => {
      const heads = () => P.$$eval('#view h2', x => x.map(h => h.textContent.trim()));
      await P.evaluate(id => G.page(id, 'guide'), noah);
      assert.deepEqual(await heads(), ['Right now', 'Puberty', 'School age', 'Play and activities', 'Health checks'], 'a school child\'s Guide has none of the baby years (puberty from 8)');
      assert.deepEqual(await P.$$eval('#view details.gd[data-grp^=s] .gt b', x => x.map(b => b.textContent)), ['Sleep for school children', 'Screens and staying safe online', 'Homework and reading', 'Friends and bullying',
        'Food and staying active', 'Teeth', 'Bedwetting', 'Worries and feelings', 'Puberty', 'Head lice', 'Out and about']);
      await P.click('details[data-grp=sworries] > summary'); assert(/take it seriously/.test(await P.textContent('details[data-grp=sworries]')));
      await P.evaluate(id => G.page(id, 'guide'), ella);
      const e = await heads(); assert(e.indexOf('School age') > e.indexOf('Month by month'), e.join(', '));
      await P.evaluate(() => { G.age(2, 1, 6, 'Leo'); G.page(kids()[2].id, 'guide'); }); assert(!(await heads()).includes('School age'));
    });

    await step('from 5 the Guide leaves the baby years out (a 5-year-old keeps the toddler topics and the preschool years\' milestones), from 6 the month-by-month list too; Everyone shows every key part for the ages in the family', async () => {
      const heads = () => P.$$eval('#view h2', x => x.map(h => h.textContent.trim()));
      await P.evaluate(() => { G.age(0, 5, 4); G.page(kids()[0].id, 'guide'); });   // Ella at 5: a preschooler here (school from 6)
      assert.deepEqual(await heads(), ['Right now', 'Toddlers and preschoolers', 'Play and activities', 'Health checks', 'Month by month', 'School age'], 'at 5: no newborn worries, solids or baby medicines');
      assert.deepEqual(await P.$$eval('#view details.gd[data-grp^=m] .gt b', x => x.map(b => b.textContent)), ['3 years', '4 years', '5 years'], 'the preschool years\' milestones only');
      await P.evaluate(() => { G.age(0, 6, 1); G.page(kids()[0].id, 'guide'); });
      assert.deepEqual(await heads(), ['Right now', 'School age', 'Play and activities', 'Health checks'], 'at 6: no month-by-month list either');
      await P.evaluate(() => G.page('all', 'guide'));   // Leo (1), Ella (6) and Noah (8) together
      assert.deepEqual(await heads(), ['Right now', 'Common with newborns', 'Food', 'Medicines', 'Toddlers and preschoolers', 'School age', 'Puberty', 'Play and activities', 'Health checks', 'Month by month'], 'everyone: every key part for the ages in the family, youngest first');
      assert.equal(await P.$$eval('#view .nowcard', x => x.length), 3, 'a card for each child');
      assert.equal(await P.$$eval('#view details.gd[data-grp^=m]', x => x.length), 19, 'all the months, for the toddler');
      await P.evaluate(() => { G.age(0, 3, 4); G.page(kids()[0].id); });
    });

    await step('entries from a hostile writer are cleaned up: only known fields of the right kind, a pick-up time within the day', async () => {
      const r = await P.evaluate(async () => {
        const b = db.meta.babyId, e = { id: 'h0stile', type: 'care', ts: Date.now() - 1000, data: { place: 'School', at: 99999, who: 5, plan: 'A'.repeat(500), evil: '<img src=x>' }, note: '', updated: Date.now() };
        const sealed = await E2EE.encryptEntry(b, e), out = await E2EE.decryptRow(b, { id: e.id, ...sealed, updated: e.updated });
        const s2 = await E2EE.encryptEntry(b, { ...e, id: 'h0stile2', type: 'study', data: { kind: 'Homework', min: -5, pages: 'many', subject: 'Maths' } }), out2 = await E2EE.decryptRow(b, { id: 'h0stile2', ...s2, updated: e.updated });
        return [out.entry.data, out2.entry.data];
      });
      assert.deepEqual(r, [{ place: 'School', plan: 'A'.repeat(60) }, { kind: 'Homework', subject: 'Maths', min: 0 }]);
    });

    if (process.env.DEBUG) console.log('page errors:', P.errs);
    assert.deepEqual(P.errs, [], 'no errors on the page'); assert.deepEqual(P.csp, []);
  } finally { await H.close(); }
  console.log(`\n${ok} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
