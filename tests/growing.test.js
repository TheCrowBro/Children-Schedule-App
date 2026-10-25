// Growing up: the app grows with each child, from newborn to 18. The stages (school starting at the age it does where the family is, or
// on a first day of school), the Day page's buttons for each age (meals and the potty from a year old, what isn't used behind More), the
// groups named for the children's ages, meals, the potty, milk from a cup, a toddler's health notes, big moments (ideas for each age,
// at the top of their day, starred on the calendar, the Month tab's journal in chapters, on the family tree), all of it shared and
// end-to-end encrypted; the routine, the stats, the doctor's report, travel mode, the milestone sheet when a new stage begins, and the
// Guide's toddler topics, milestones to 5 and notes for the school and teenage years.   node tests/growing.test.js
const assert = require('assert');
/* global Stages, G, mealAt, describe, stageOf, saveProfile, openSheet, openQuick, openMoment, reportBlocks, dkey, Routine, Sync, momentsOf, removeEvent */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 9).join('\n    ')); } };

(async () => {
  const H = await setup({ port: 8136 }), { q, syncNow } = H;
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    await P.emulateMedia({ reducedMotion: 'reduce' });   // (travel mode's journey across the screen has its own test)
    await P.evaluate(() => {
      window.G = {
        /** A birth date `y` years, `m` months and `d` days ago (never a month birthday, so no sheet pops up for it). */
        born: (y, m = 0, d = 3) => {
          const now = new Date(), t = new Date(now); t.setDate(15); t.setFullYear(t.getFullYear() - y); t.setMonth(t.getMonth() - m);
          t.setDate(Math.min(now.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); t.setDate(t.getDate() - d); return dkey(t.getTime());
        },
        /** Child `i` (added if needed) is `y` years and `m` months old; the month's sheets are taken as seen. */
        age: (i, y, m = 0, name) => {
          while (kids().length <= i) kids().push(Kids.make(kids(), name || 'Kid' + kids().length));
          const k = kids()[i]; k.birth = G.born(y, m); if (name) k.name = name;
          (db.meta.ms || (db.meta.ms = {}))[k.id] = 999; (db.meta.solids || (db.meta.solids = {}))[k.id] = 1; saveProfile(); return k.id;
        },
        page: (id, t = 'day') => { setKid(id); tab = t; viewDay = startOfDay(Date.now()); render(); },
        buttons: () => ({ shown: [...document.querySelectorAll('#view .quick [data-add]')].map(b => b.dataset.add), labels: [...document.querySelectorAll('#view .quick [data-add]')].map(b => b.textContent.trim()),
          more: ((document.querySelector('#view .quick [data-addmore]') || {}).dataset || {}).addmore || '' }),
        legend: () => [...document.querySelectorAll('#view .clegend span')].map(s => s.textContent.replace(/\s*\d+\s*$/, '').trim()),
        ev: (type, ts, data, kid, extra = {}) => { const e = { id: 'g' + Math.random().toString(36).slice(2, 9), type, ts, data, note: '', updated: Date.now(), by: Auth.id, child: kid, ...extra }; db.events.push(e); return e; },
        at: (daysAgo, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.getTime(); },
        /** The day `months` months after a birth date. */
        plus: (birth, months) => { const t = new Date(birth + 'T12:00'); t.setMonth(t.getMonth() + months); return dkey(t.getTime()); },
      };
    });
    const leo = await P.evaluate(() => kids()[0].id);
    const sheet = () => P.evaluate(() => !$('#sheet').hidden && $('#sheet h3').textContent.trim());
    const closeSheet = () => P.evaluate(() => { $('#sheet').hidden = $('#sheetBack').hidden = true; });

    await step('the stages of growing up: newborn, baby, toddler, preschooler, school age (from 4 in the UK, 5 in North America, 6 elsewhere, or a first day of school), teenager, grown up', async () => {
      const r = await P.evaluate(() => {
        const of = (y, m, region = 'eu', school = '') => Stages.of(G.born(y, m), { region, school });
        const past = dkey(Date.now() - 30 * 864e5), soon = dkey(Date.now() + 30 * 864e5);
        return [of(0, 1), of(0, 4), of(1, 1), of(3, 1), of(4, 2, 'uk'), of(4, 2, 'na'), of(4, 2, 'eu'), of(5, 1, 'na'), of(5, 1, 'anz'), of(5, 1, 'asia'), of(6, 1, 'latam'),
          of(4, 2, 'eu', past), of(4, 2, 'eu', soon), of(12, 1), of(17, 11), of(18, 0), Stages.of(''), Stages.of('2020-02-30')];
      });
      assert.deepEqual(r, ['newborn', 'baby', 'toddler', 'preschool', 'school', 'preschool', 'preschool', 'school', 'school', 'preschool', 'school', 'school', 'preschool', 'teen', 'teen', 'grown', 'newborn', 'newborn'], JSON.stringify(r));
      const ages = await P.evaluate(() => {
        const ago = d => dkey(Date.now() - d * 864e5);
        return [Stages.age(ago(2), Date.now()), Stages.age(ago(36), Date.now()), Stages.age(G.born(0, 14), Date.now()), Stages.age(G.born(2, 3), Date.now()), Stages.age(G.born(3, 0), Date.now()), Stages.age(G.born(7, 4), Date.now()), Stages.age(ago(-3), Date.now())];
      });
      assert.deepEqual(ages, ['day 3', '5 weeks', '14 months', '2 years 3 months', '3 years', '7 years', '']);
    });

    await step('the Day page grows with the child: a newborn\'s eight buttons, then Meal, Milk and Potty from a year old, a preschooler\'s and a school child\'s days, and the rest behind More', async () => {
      await P.evaluate(() => { G.age(0, 0, 1); G.page(kids()[0].id); });
      let b = await P.evaluate(() => G.buttons());
      assert.deepEqual(b.shown, ['feed', 'diaper', 'sleep', 'wake', 'vomit', 'play', 'health', 'med']); assert.equal(b.more, '', 'a newborn needs no More');
      assert.deepEqual(b.labels.slice(0, 2), ['Feed', 'Diaper']); assert.deepEqual(await P.evaluate(() => G.legend()), ['Feeding', 'Diapers', 'Sleep & night wakings', 'Vomit', 'Play', 'Health & meds']);
      await P.evaluate(() => { G.age(0, 2, 3); G.page(kids()[0].id); });
      b = await P.evaluate(() => G.buttons());
      assert.deepEqual(b.shown, ['meal', 'feed', 'diaper', 'potty', 'sleep', 'health', 'care']); assert.equal(b.more, 'med wake play vomit');
      assert.deepEqual(b.labels.slice(0, 4), ['Meal', 'Milk', 'Diaper', 'Potty'], 'a feed is Milk from a year old');
      assert(/· 2 years 3 months$/.test(await P.textContent('.datenav .d small')), 'how old, in years and months');
      assert.deepEqual((await P.evaluate(() => G.legend())).slice(0, 2), ['Meals & milk', 'Diapers & potty']);
      assert(await P.$('#view .quick [data-addmore] svg[data-n=more]'), 'More has its icon');
      await P.click('#view [data-addmore]'); assert.equal(await sheet(), 'More to log');
      assert.deepEqual(await P.$$eval('#sheet [data-more]', x => x.map(e => e.dataset.more)), ['med', 'wake', 'play', 'vomit']);
      await P.click('#sheet [data-more=play]'); assert.equal(await sheet(), 'Add play', 'each opens its own sheet'); await P.click('#cancel');
      await P.evaluate(() => { G.age(0, 3, 4); G.page(kids()[0].id); });
      b = await P.evaluate(() => G.buttons());
      assert.deepEqual(b.shown, ['meal', 'potty', 'sleep', 'care', 'play', 'health', 'med']); assert.equal(b.more, 'wake vomit diaper feed');
      assert.deepEqual((await P.evaluate(() => G.legend())).slice(0, 2), ['Meals', 'Diapers & potty']);
      await P.evaluate(() => { G.age(0, 7, 2); G.page(kids()[0].id); });
      b = await P.evaluate(() => G.buttons());
      assert.deepEqual(b.shown, ['meal', 'care', 'sleep', 'play', 'study', 'health', 'med']); assert.equal(b.more, 'wake vomit potty diaper feed');
      assert.deepEqual((await P.evaluate(() => G.legend())).slice(0, 2), ['Meals', 'Potty']);
      assert(/· 7 years$/.test(await P.textContent('.datenav .d small')));
    });

    await step('More → Children says each child\'s stage and age', async () => {
      await P.evaluate(() => { G.age(0, 2, 3); tab = 'more'; render(); });
      assert.equal(await P.textContent('.kidrow .kstage'), 'Toddler · 2 years 3 months');
      await P.evaluate(() => { G.age(0, 0, 1); render(); }); assert(/^Newborn · [45] weeks$/.test(await P.textContent('.kidrow .kstage')));
    });

    await step('what the family has been logging lately moves up: three plays in two weeks give a toddler\'s Play a button, and Drop-off goes behind More', async () => {
      await P.evaluate(id => { G.age(0, 2, 3); [1, 3, 5].forEach(d => G.ev('play', G.at(d, 10), { activity: 'Play', min: 20 }, id)); save(); G.page(id); }, leo);
      const b = await P.evaluate(() => G.buttons());
      assert.deepEqual(b.shown, ['meal', 'feed', 'diaper', 'potty', 'sleep', 'health', 'play']); assert.equal(b.more, 'care med wake vomit');
      await P.evaluate(() => { db.events = db.events.filter(e => e.type !== 'play'); save(); render(); });
    });

    await step('a meal: which one (guessed from the time), what they ate (foods closed until wanted), how much; in the day\'s list, the tiles and the stats', async () => {
      assert.deepEqual(await P.evaluate(() => [8, 11.5, 15, 18.5, 23].map(h => { const d = new Date(); d.setHours(Math.floor(h), (h % 1) * 60, 0, 0); return mealAt(d.getTime()); })), ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Snack']);
      await P.click('#view [data-add=meal]'); assert.equal(await sheet(), 'Add meal');
      assert.deepEqual(await P.$$eval('#sheet [name=meal]', x => x.map(i => i.value)), ['Breakfast', 'Lunch', 'Dinner', 'Snack']);
      assert.equal(await P.evaluate(() => $('#sheet [name=meal]:checked').value), await P.evaluate(() => mealAt(Date.now())), 'the meal it probably is now');
      assert.equal(await P.evaluate(() => $('#sheet details.foods').open), false, 'the foods stay closed until wanted');
      assert.equal(await P.$('#sheet details.fgrp[data-fg=allergens] .note'), null, 'no baby advice about starting solids');
      assert.deepEqual(await P.$$eval('#sheet [name=amount]', x => x.map(i => i.value)), ['Hardly any', 'Some', 'Most', 'All of it']);
      await P.click('#sheet [name=meal][value=Dinner]'); await P.click('#sheet details.foods > summary'); await P.click('#sheet details.fgrp[data-fg=grains] > summary');
      await P.click('#sheet [name=food][value=Pasta]'); await P.click('#sheet details.fgrp[data-fg=veg] > summary'); await P.click('#sheet [name=food][value=Peas]');
      assert.equal(await P.textContent('#sheet .fsum'), 'Pasta, Peas'); await P.click('#sheet [name=amount][value=Most]'); await P.click('#save');
      const e = await P.evaluate(() => db.events.filter(x => x.type === 'meal').map(x => ({ data: x.data, d: describe(x) }))[0]);
      assert.deepEqual(e.data, { meal: 'Dinner', foods: ['Pasta', 'Peas'], amount: 'Most' }); assert.deepEqual(e.d, ['Dinner', 'Pasta, Peas · Most']);
      const day = await P.evaluate(() => ({ grp: $('#view details.grp[data-grp=dfeed] .gt').textContent, tiles: [...document.querySelectorAll('#view .tile')].map(t => t.textContent.replace(/\s+/g, ' ').trim()) }));
      assert(/^Meals & milk1 meal$/.test(day.grp.trim()), day.grp);
      await P.evaluate(() => { tab = 'month'; render(); });
      assert(/Meals/.test((await P.$$eval('#view .tile', x => x.map(t => t.textContent)))[0]), 'an older child\'s day starts with meals');
      await P.evaluate(id => { G.ev('meal', G.at(1, 8), { meal: 'Breakfast', foods: [], amount: 'All of it' }, id); G.ev('meal', G.at(1, 10), { meal: 'Snack', foods: [] }, id); G.ev('meal', G.at(1, 12), { meal: 'Lunch', foods: [], amount: 'Hardly any' }, id); save(); tab = 'stats'; render(); }, leo);
      const st = await P.evaluate(() => [...document.querySelectorAll('#view .scard')].map(c => c.querySelector('b').textContent.trim()));
      assert.deepEqual(st.slice(0, 3), ['Meals', 'Potty', 'Sleep'], 'a toddler\'s stats: meals, the potty, sleep (no milk or diapers logged)');
      const meals = await P.textContent('#view .scard'); assert(/Ate most or all of it\s*67\s?%/.test(meals), meals);
    });

    await step('an allergy is flagged at meals too, worded for a child rather than a baby', async () => {
      await P.evaluate(id => { kids()[0].allergies = [{ food: 'Peanut', date: dkey(Date.now() - 864e5 * 40), note: '' }]; saveProfile(); G.page(id); openSheet('meal'); }, leo);
      await P.click('#sheet details.foods > summary'); assert(await P.$('#sheet [name=food][value=Peanut] ~ span .kbad'), 'marked as an allergy in the list');
      await P.click('#sheet details.fgrp[data-fg=allergens] > summary');
      P.dialogs = []; await P.click('#sheet [name=food][value=Peanut]'); await P.click('#save'); await H.sleep(500);
      assert(P.dialogs.some(d => /Leo is allergic to Peanut/.test(d) && !/floppy/.test(d)), JSON.stringify(P.dialogs));
      await P.evaluate(() => { kids()[0].allergies = []; db.events = db.events.filter(e => !(e.type === 'meal' && e.data.foods.includes('Peanut'))); saveProfile(); });
    });

    await step('the potty: pee, poo, nothing yet or stayed dry; on the potty, on the toilet or an accident; asked to go', async () => {
      await P.evaluate(id => G.page(id), leo);
      await P.click('#view [data-add=potty]'); assert.equal(await sheet(), 'Add potty');
      assert.deepEqual(await P.$$eval('#sheet [name=pwhat]', x => x.map(i => i.value)), ['pee', 'poo', 'both', 'none', 'dry']);
      assert.deepEqual(await P.$$eval('#sheet [name=where]', x => x.map(i => i.value)), ['Potty', 'Toilet', 'Accident']);
      await P.click('#sheet [name=pwhat][value=both]'); await P.click('#sheet [name=where][value=Toilet]'); await P.click('#sheet [name=asked]'); await P.click('#save');
      await P.click('#view [data-add=potty]'); await P.click('#sheet [name=where][value=Accident]'); await P.click('#save');
      await P.click('#view [data-add=potty]'); await P.click('#sheet [name=pwhat][value=dry]'); assert.equal(await P.isVisible('#pWhere'), false, 'staying dry happens nowhere in particular'); await P.click('#save');
      await P.click('#view [data-add=potty]'); await P.click('#sheet [name=pwhat][value=none]'); await P.click('#save');
      const r = await P.evaluate(() => db.events.filter(e => e.type === 'potty').sort((a, b) => a.ts - b.ts).map(e => [e.data, describe(e)]));
      assert.deepEqual(r, [[{ pee: true, poo: true, where: 'Toilet', asked: true }, ['Pee + Poo', 'Toilet · asked to go']], [{ pee: true, poo: false, accident: true }, ['Accident: Pee', '']],
        [{ pee: false, poo: false, dry: true }, ['Stayed dry', '']], [{ pee: false, poo: false, where: 'Potty' }, ['Nothing yet', 'Potty']]]);
      const grp = await P.textContent('#view details.grp[data-grp=ddiaper] .gt');
      assert(/1 on the potty · 1 accident/.test(grp), grp);
      await P.evaluate(() => { tab = 'month'; render(); });
      const tile = await P.evaluate(() => [...document.querySelectorAll('#view .tile')].map(t => t.textContent.replace(/\s+/g, ' ').trim()).find(t => /Potty/.test(t)));
      assert(/1\s*Potty\s*1 accident/.test(tile), String(tile));
      await P.evaluate(() => { tab = 'day'; render(); });
    });

    await step('milk from a year old: a cup or a bottle, cow\'s milk or plant milk; a baby\'s feed form is as it was', async () => {
      await P.click('#view [data-add=feed]'); assert.equal(await sheet(), 'Add milk');
      assert.deepEqual(await P.$$eval('#sheet [name=kind]', x => x.map(i => i.value)), ['breast', 'bottle', 'cup']); assert.equal(await P.evaluate(() => $('#sheet [name=kind]:checked').value), 'cup');
      assert.deepEqual(await P.$$eval('#sheet [name=milk]', x => x.map(i => i.value)), ['Breast milk', 'Formula', "Cow's milk", 'Plant milk']);
      await P.fill('#ml', '150'); await P.click("#sheet [name=milk][value=\"Cow's milk\"]"); await P.click('#save');
      assert.deepEqual(await P.evaluate(() => describe(db.events.filter(e => e.type === 'feed').pop())), ['Cup 150 ml', "Cow's milk"]);
      const baby = await P.evaluate(() => { const id = G.age(1, 0, 2, 'Mia'); G.page(id); openSheet('feed'); return [...document.querySelectorAll('#sheet [name=kind]')].map(i => i.value).concat([...document.querySelectorAll('#sheet [name=milk]')].map(i => i.value), $('#sheet h3').textContent.trim()); });
      assert.deepEqual(baby, ['breast', 'bottle', 'solids', 'Breast milk', 'Formula', 'Add feed']); await P.click('#cancel');
    });

    await step('a toddler\'s health notes: the symptoms of an older child, and only a real emergency flagged (a toddler\'s fever is not a newborn\'s)', async () => {
      await P.evaluate(id => G.page(id), leo);
      await P.click('#view [data-add=health]');
      const syms = await P.$$eval('#sheet [name=sym]', x => x.map(i => i.value));
      for (const s of ['Ear pain', 'Sore throat', 'Diarrhea', 'Trouble breathing', 'Fall or injury']) assert(syms.includes(s), s);
      assert(!syms.includes('Umbilical cord issue'), 'no newborn worries');
      P.dialogs = []; await P.click('#sheet [name=sym][value=Fever]'); await P.fill('#temp', '38.6'); await P.click('#save'); await H.sleep(400);
      assert.deepEqual(P.dialogs, [], 'a fever alone is no emergency at this age: ' + JSON.stringify(P.dialogs)); assert.equal(await P.$('#view details.grp.alert'), null);
      await P.click('#view [data-add=health]'); await P.click('#sheet [name=sym][value="Trouble breathing"]'); await P.click('#save'); await H.sleep(400);
      assert(P.dialogs.some(d => /If Leo has trouble breathing/.test(d)), JSON.stringify(P.dialogs)); assert(await P.$('#view details.grp.alert'), 'flagged in the list');
      const newborn = await P.evaluate(() => { G.page(kids()[1].id); openSheet('health'); return [...document.querySelectorAll('#sheet [name=sym]')].map(i => i.value); });
      assert(newborn.includes('Umbilical cord issue') && !newborn.includes('Ear pain'), 'a baby\'s list is as it was'); await P.click('#cancel');
    });

    await step('big moments: saved from the Day page with ideas for the age, at the top of their day, and a first can only be saved once', async () => {
      await P.evaluate(id => G.page(id), leo);
      assert(/First sentence/.test(await P.textContent('#view .momentbtn')), 'the button gives ideas for a toddler');
      await P.click('#view [data-momentnew]'); assert.equal(await sheet(), 'Save a big moment');
      const ideas = await P.$$eval('#sheet .mmideas [name=mmWhat]', x => x.map(i => i.value));
      assert.equal(ideas[0], 'Birthday'); for (const w of ['First sentence', 'Goodbye pacifier', 'First day at daycare', 'First day of preschool']) assert(ideas.includes(w), w);
      assert(await P.$('#sheet details.mmmore [name=mmWhat][value="First steps"]'), 'ideas for other ages, a tap away');
      assert.equal(await P.inputValue('#mmDay'), await P.evaluate(() => dkey(Date.now())));
      await P.click('#sheet [name=mmWhat][value="First sentence"]'); await P.fill('#mmNote', '"More blueberries please"'); await P.click('#mmSave');
      const card = await P.textContent('#view .moment'); assert(/First sentence/.test(card) && /2 years 3 months/.test(card) && /More blueberries please/.test(card), card);
      assert(await P.$('#view .moment svg[data-n=star]'), 'with a star');
      assert.deepEqual(await P.evaluate(() => db.events.filter(e => e.type === 'moment').map(e => e.data)), [{ what: 'First sentence' }]);
      assert.equal(await P.evaluate(() => [...document.querySelectorAll('svg.clock [data-info]')].some(r => (db.events.find(e => e.id === r.dataset.info) || {}).type === 'moment')), false, 'never on the clock');
      await P.click('#view [data-momentnew]');
      assert.equal(await P.$('#sheet [name=mmWhat][value="First sentence"]'), null, 'a first happens once'); assert(await P.$('#sheet [name=mmWhat][value=Birthday]'), 'a birthday every year');
      await P.fill('#mmOwn', 'First time at the beach'); await P.fill('#mmDay', await P.evaluate(() => dkey(Date.now() - 3 * 864e5))); await P.click('#mmSave');
      await P.click('#view [data-momentnew]'); await P.fill('#mmOwn', 'First steps'); await P.fill('#mmDay', await P.evaluate(() => G.plus(kids()[0].birth, 11))); await P.click('#mmSave');
      const all = await P.evaluate(() => momentsOf([kids()[0].id]).map(e => [e.data, dkey(e.ts), describe(e)[0]]));
      assert.deepEqual(all.map(x => x[0]), [{ what: 'First steps' }, { what: 'First time at the beach', own: true }, { what: 'First sentence' }], 'typed in: kept as typed, unless it is one of the ideas');
      assert.equal(await P.evaluate(() => viewDay === startOfDay(Date.now())), false, 'the page shows the day of the moment just saved');
    });

    await step('…starred on the calendar, and kept in the Month tab\'s journal, in chapters for each stage, with how old they were; changed or deleted there', async () => {
      await P.evaluate(() => { tab = 'month'; viewDay = startOfDay(Date.now()); calMonth = new Date(viewDay); render(); });
      const today = await P.evaluate(() => { const b = document.querySelector(`.cal [data-day="${startOfDay(Date.now())}"]`); return { star: !!b.querySelector('.mmark'), label: b.getAttribute('aria-label') }; });
      assert(today.star && /big moment: First sentence/.test(today.label), JSON.stringify(today)); assert(/Big moment/.test(await P.textContent('#view .legend')));
      await P.click('details[data-grp=moments] > summary');
      const j = await P.evaluate(() => [...document.querySelectorAll('details[data-grp=moments] > .mh, details[data-grp=moments] > .moment')].map(x => x.classList.contains('mh') ? '# ' + x.textContent : x.querySelector('b').textContent + ' · ' + x.querySelector('small').textContent));
      assert.equal(j.length, 5, JSON.stringify(j)); assert.deepEqual([j[0], j[2]], ['# Baby', '# Toddler'], 'a chapter for each stage');
      assert(/^First steps · .* · 11 months$/.test(j[1]), j[1]); assert(/^First time at the beach · .* · 2 years 3 months$/.test(j[3]), j[3]);
      assert(/^First sentence · .* · 2 years 3 months$/.test(j[4]), j[4]);
      assert(/3 big moments/.test(await P.textContent('details[data-grp=moments] summary')));
      await P.click('details[data-grp=moments] .moment:has-text("First time at the beach")'); assert.equal(await sheet(), 'Change the big moment');
      assert.equal(await P.inputValue('#mmOwn'), 'First time at the beach'); await P.fill('#mmNote', 'Sand everywhere'); await P.click('#mmSave');
      assert.equal(await P.evaluate(() => db.events.find(e => e.type === 'moment' && e.data.own).note), 'Sand everywhere');
      await P.evaluate(() => { tab = 'month'; render(); }); await P.click('details[data-grp=moments] .moment:has-text("First time at the beach")'); await P.click('#mmDel');
      assert.equal(await P.evaluate(() => momentsOf([kids()[0].id]).length), 2, 'deleted');
    });

    await step('a first day of school starts the school years, whatever the age; a moment for several children at once', async () => {
      const r = await P.evaluate(() => {
        const id = G.age(2, 4, 2, 'Ella'); db.meta.region = 'eu'; const before = stageOf(kids()[2]);
        G.page(id); openMoment(null, { day: Date.now() }); return before;
      });
      assert.equal(r, 'preschool');
      await P.click('#sheet .kidchip:has-text("Mia")'); await P.click('#sheet details.mmmore > summary'); await P.click('#sheet [name=mmWhat][value="First day of school"]'); await P.click('#mmSave');
      const after = await P.evaluate(() => ({ ella: stageOf(kids()[2]), mia: stageOf(kids()[1]), n: db.events.filter(e => e.type === 'moment' && e.data.what === 'First day of school').map(e => kidName(kidById(e.child))).sort() }));
      assert.deepEqual(after.n, ['Ella', 'Mia'], 'saved for each child ticked'); assert.equal(after.ella, 'school');
      assert.equal(after.mia, 'newborn', '(a newborn\'s stage is not moved by it: only from the age school can start)');
      await P.evaluate(() => G.page(kids()[2].id)); assert.deepEqual((await P.evaluate(() => G.legend())).slice(0, 2), ['Meals', 'Potty']);
      await P.evaluate(() => { db.events.filter(e => e.type === 'moment' && e.child === kids()[1].id).forEach(removeEvent); save(); });   // (deleted as the app does, in case it was sent already)
    });

    await step('the All page with a baby and older children: buttons for all of them, the groups named for both', async () => {
      await P.evaluate(() => G.page('all'));
      const b = await P.evaluate(() => G.buttons());
      assert(b.shown.includes('feed') && b.shown.includes('meal') && b.more.length, JSON.stringify(b));
      assert.deepEqual((await P.evaluate(() => G.legend())).slice(0, 2), ['Feeding & meals', 'Diapers & potty']);
    });

    await step('everything new is shared and end-to-end encrypted: another phone sees the meals, the potty and the big moments; the server only ciphertext', async () => {
      const N = await H.addMember(P, 'nan@x.com', 'family', {}, { name: 'Nan' });
      await syncNow(P); await syncNow(N);
      const seen = await N.evaluate(() => ({ types: [...new Set(db.events.map(e => e.type))].sort(), moments: db.events.filter(e => e.type === 'moment').map(e => e.data.what).sort() }));
      for (const t of ['meal', 'potty', 'moment', 'feed']) assert(seen.types.includes(t), t);
      assert.deepEqual(seen.moments, ['First day of school', 'First sentence', 'First steps']);
      await N.evaluate(() => { db.meta.ms = Object.fromEntries(kids().map(k => [k.id, 999])); $('#sheet').hidden = $('#sheetBack').hidden = true; setKid(kids()[0].id); tab = 'day'; viewDay = startOfDay(Date.now()); render(); });
      assert(/First sentence/.test(await N.textContent('#view .moment')), 'on the other phone\'s Day page');
      const rows = await q('select blob from events');
      assert(rows.length >= 10 && rows.every(r => !/First sentence|blueberries|Dinner|Pasta|Toilet|"moment"|"potty"|"meal"/.test(r.blob)), 'ciphertext only');
      await N.click('#view .moment'); assert(/First sentence/.test(await N.textContent('#sheet')), 'tapped, it opens'); await N.evaluate(() => { $('#sheet').hidden = $('#sheetBack').hidden = true; });
      // a phone that was on the version before skipped these kinds of entry; once updated, it fetches everything again, once
      const kinds = ['meal', 'potty', 'moment'], skip = () => N.evaluate(k => { db.events = db.events.filter(e => !k.includes(e.type)); db.meta.pulledAt = new Date(Date.now() + 3600e3).toISOString(); save(true); }, kinds);   // (the cursor well past them)
      const count = () => N.evaluate(k => db.events.filter(e => k.includes(e.type)).length, kinds), had = await count();
      await skip(); await syncNow(N); assert.equal(await count(), 0, '(the sync cursor is past them: an ordinary sync does not fetch them again)');
      await skip(); await N.evaluate(() => { db.meta.kinds = 'feed diaper sleep wake vomit play health med trip leg'; }); await syncNow(N);
      assert.equal(await count(), had, 'after the update, everything the older version skipped is there');
      assert.equal(await N.evaluate(() => db.meta.kinds), await N.evaluate(() => E2EE.KINDS));
      await N.close();
    });

    await step('on the family tree, tapping a child shows their latest big moments', async () => {
      await P.evaluate(() => { tab = 'family'; render(); });
      await P.waitForSelector(`.ftreesvg [data-tk="k:${leo}"]`); await P.click(`.ftreesvg [data-tk="k:${leo}"]`);
      const t = await P.textContent('#sheet'); assert(/Latest big moments/.test(t) && /First sentence/.test(t) && /First steps/.test(t), t);
      assert(t.indexOf('First sentence') < t.indexOf('First steps'), 'newest first'); await closeSheet();
    });

    await step('the routine learns each meal of the day, and cups of milk', async () => {
      const r = await P.evaluate(id => {
        const evs = [];
        for (let d = 1; d <= 6; d++) { evs.push(G.ev('meal', G.at(d, 12, d % 3 * 5), { meal: 'Lunch', foods: ['Pasta'] }, id), G.ev('meal', G.at(d, 7, 30), { meal: 'Breakfast', foods: ['Oats', 'Banana'] }, id), G.ev('feed', G.at(d, 19), { kind: 'cup', ml: 150, milk: "Cow's milk" }, id), G.ev('potty', G.at(d, 9), { pee: true }, id)); }
        const slots = Routine.find(evs, Date.now()).slots;
        db.events = db.events.filter(e => !evs.includes(e)); save();
        return slots.map(s => [s.key, s.meal || s.kind, s.cup || false, (s.foods || []).join('+')]);
      }, leo);
      assert.deepEqual(r, [['meal:Breakfast', 'Breakfast', false, 'Oats+Banana'], ['meal:Lunch', 'Lunch', false, 'Pasta'], ['feed', 'bottle', true, '']], 'the potty keeps no routine');
    });

    await step('the report for the doctor: a toddler\'s meals and potty, without the columns only a baby needs; a baby\'s is as it was', async () => {
      const r = await P.evaluate(() => {
        const head = id => reportBlocks(id, { days: 7 }).blocks.find(b => b.table && b.table.head).table.head, kv = id => reportBlocks(id, { days: 7 }).blocks.find(b => b.kv && b.kv.some(x => /per day/.test(x[0]))).kv.map(x => x[0]);
        G.ev('feed', G.at(1, 9), { kind: 'bottle', ml: 90, milk: 'Formula' }, kids()[1].id); save();
        return { toddler: head(kids()[0].id), glance: kv(kids()[0].id), baby: head(kids()[1].id) };
      });
      assert.deepEqual(r.toddler, ['Date', 'Meals', 'Milk', 'ml', 'Potty', 'Accidents', 'Sleep', 'Night wakings', 'Vomit', 'Health & meds']);
      for (const x of ['Meals per day', 'Milk feeds per day', 'On the potty per day', 'Accidents per day']) assert(r.glance.includes(x), x);
      assert(!r.glance.includes('Pee per day'), 'no diapers logged, so none in the report');
      assert.deepEqual(r.baby, ['Date', 'Feeds', 'ml', 'Pee', 'Poo', 'Sleep', 'Night wakings', 'Vomit', 'Health & meds']);
    });

    await step('travel mode for a toddler: big buttons for a meal, milk, a diaper and sleep; a one-tap potty and a quick meal', async () => {
      await P.evaluate(id => { G.ev('trip', startOfDay(Date.now()), { means: 'car' }, undefined, { child: undefined, end: startOfDay(Date.now()) + 2 * 864e5 }); save(); G.page(id); }, leo);
      assert.deepEqual(await P.$$eval('#view [data-qadd]', x => x.map(b => b.dataset.qadd)), ['meal', 'feed', 'diaper', 'sleep']);
      assert(/More: Potty/.test(await P.textContent('#view .qmore')));
      await P.evaluate(() => openQuick('potty')); await P.click('#sheet [name=qpot][value=accident]'); await H.sleep(200);
      assert.deepEqual(await P.evaluate(() => db.events.filter(e => e.type === 'potty').pop().data), { pee: false, poo: false, accident: true });
      await P.click('#view [data-qadd=meal]'); await P.click('#sheet [name=qeat][value=Some]'); await P.click('#qSave');
      const m = await P.evaluate(() => db.events.filter(e => e.type === 'meal').pop().data); assert.equal(m.amount, 'Some'); assert(['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(m.meal));
      await P.evaluate(() => { db.events = db.events.filter(e => e.type !== 'trip'); save(); render(); });
    });

    await step('a new stage on its month birthday: the milestone sheet says what changes, and offers to keep the birthday as a big moment', async () => {
      const r = await P.evaluate(() => {
        const k = kids()[1], b = new Date(); b.setFullYear(b.getFullYear() - 1); b.setDate(b.getDate() - 2); k.birth = dkey(b.getTime()); delete db.meta.ms[k.id]; saveProfile();
        return dkey(new Date(k.birth + 'T12:00').setFullYear(new Date(k.birth + 'T12:00').getFullYear() + 1));
      });
      await P.evaluate(() => { tab = 'day'; render(); });
      assert.equal(await sheet(), 'Mia is 12 months old');
      assert(/Little Log grows with Mia: Meals and Potty are on the Day page now/.test(await P.textContent('#sheet .grow')));
      await P.click('#msMoment'); assert.equal(await sheet(), 'Save a big moment');
      assert.equal(await P.evaluate(() => $('#sheet [name=mmWhat]:checked').value), 'Birthday'); assert.equal(await P.inputValue('#mmDay'), r, 'on the birthday itself');
      assert.equal(await P.evaluate(() => $('#sheet [name=mmKid]:checked').value), await P.evaluate(() => kids()[1].id)); await P.click('#mmSave');
      assert.equal(await P.evaluate(() => db.events.filter(e => e.type === 'moment' && e.data.what === 'Birthday').length), 1);
    });

    await step('the Guide grows too: toddler topics first, milestones to 5, then what the school and teenage years are about', async () => {
      const heads = () => P.$$eval('#view h2', x => x.map(h => h.textContent.trim()));
      await P.evaluate(id => G.page(id, 'guide'), leo);
      assert.deepEqual(await heads(), ['Right now', 'Toddlers and preschoolers', 'Food', 'Medicines', 'Health checks', 'Month by month', 'Common with newborns']);
      assert.deepEqual(await P.$$eval('#view details.gd[data-grp^=t] .gt b', x => x.map(b => b.textContent)), ['Potty training', 'Picky eating', 'Tantrums', 'Toddler sleep', 'Teeth and the dentist', 'Screens', 'Car seats']);
      assert(/Leo is 2 years 3 months old/.test(await P.textContent('.nowcard')) && /Around 2 years/.test(await P.textContent('.nowcard')));
      const ms = await P.$$eval('#view details.gd[data-grp^=m] .gt b', x => x.map(b => b.textContent)); for (const m of ['30 months', '3 years', '4 years', '5 years']) assert(ms.includes(m), m);
      await P.evaluate(() => { G.age(0, 8, 1); G.page(kids()[0].id, 'guide'); }); assert(/The school years/.test(await P.textContent('.nowcard')));
      await P.evaluate(() => { G.age(0, 13, 1); G.page(kids()[0].id, 'guide'); }); assert(/The teenage years/.test(await P.textContent('.nowcard')));
      await P.evaluate(() => { G.age(0, 0, 2); G.page(kids()[0].id, 'guide'); });
      assert.deepEqual(await heads(), ['Right now', 'Food', 'Common with newborns', 'Medicines', 'Health checks', 'Toddlers and preschoolers', 'Month by month'], 'a baby\'s Guide starts with the baby topics');
    });

    if (process.env.DEBUG) console.log('page errors:', P.errs, 'dialogs:', P.dialogs);
    assert.deepEqual(P.errs, [], 'no errors on the page'); assert.deepEqual(P.csp, []);
  } finally { await H.close(); }
  console.log(`\n${ok} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
