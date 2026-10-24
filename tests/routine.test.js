// The Routine page: the times of day that repeat (within 45 minutes, on more than half of the last week's days), worked out again
// from the log every time so it follows the baby; diapers and the like left out; today's entries ticked off; one page per child.
//   node tests/routine.test.js
const assert = require('assert');
/* global T, routineView */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 5).join('\n    ')); } };

(async () => {
  const H = await setup({ port: 8132 });
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    // A day to test from (today at 3 PM on the page's clock), and entries made `daysAgo` days before it at h:m.
    await P.evaluate(() => {
      const now = new Date(); now.setHours(15, 0, 0, 0);
      window.T = {
        now: now.getTime(),
        at: (daysAgo, h, m = 0, from = now.getTime()) => { const d = new Date(from); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.getTime(); },
        ev: (type, ts, data = {}, x = {}) => ({ id: `${type}-${ts}-${Math.random().toString(36).slice(2, 7)}`, type, ts, data, note: '', ...x }),
        hm: m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`,
        slots: (evs, now = window.T.now) => Routine.find(evs, now).slots.map(s => ({ key: s.key, at: window.T.hm(s.at), from: window.T.hm(s.from), to: window.T.hm(s.to), days: s.days, of: s.of, minutes: s.minutes, ml: s.ml, kind: s.kind, name: s.name, dose: s.dose })),
      };
    });

    await step('a feed at about the same time on most days is part of the routine; feeds at scattered times are not', async () => {
      const r = await P.evaluate(() => {
        const { at, ev, slots } = T, evs = [];
        [-20, -5, 0, 10, 20, 15, -10].forEach((j, i) => evs.push(ev('feed', at(i + 1, 8, 0) + j * 60000, { kind: 'bottle', ml: 120 + i * 2 })));
        for (let i = 1; i <= 7; i++) evs.push(ev('feed', at(i, 11 + (i % 3) * 3, i * 7), { kind: 'breast', min: 12 }));   // here and there
        return slots(evs);
      });
      assert.equal(r.length, 1, JSON.stringify(r));
      assert.deepEqual([r[0].key, r[0].days, r[0].of, r[0].kind, r[0].ml, r[0].from, r[0].to], ['feed', 7, 7, 'bottle', 125, '7:40', '8:20']);
      assert(['8:00', '7:59', '8:01'].includes(r[0].at), 'at about 8:00: ' + r[0].at);
    });

    await step('"about the same time" means within 45 minutes: 7:30 and 8:15 are one routine time, 7:30 and 8:20 are not', async () => {
      const r = await P.evaluate(() => {
        const { at, ev, slots } = T, alt = (a, b) => [1, 2, 3, 4, 5, 6, 7].map(i => ev('feed', i % 2 ? at(i, ...a) : at(i, ...b), { kind: 'breast' }));
        return { within: slots(alt([7, 30], [8, 15])), apart: slots(alt([7, 30], [8, 20])) };
      });
      assert.deepEqual(r.within.map(s => [s.at, s.days, s.from, s.to]), [['7:30', 7, '7:30', '8:15']]);
      assert.deepEqual(r.apart.map(s => [s.at, s.days]), [['7:30', 4]], '4 of 7 days at 7:30 is more than half; 3 at 8:20 is not');
    });

    await step('it needs more than half of the days logged, and at least 3: two days are not enough to tell', async () => {
      const r = await P.evaluate(() => {
        const { at, ev } = T, two = [1, 2].map(i => ev('feed', at(i, 8), {})), five = [1, 2, 3, 4, 5].map(i => ev('nappy', at(i, 9), {})).map(e => ({ ...e, type: 'diaper' }));
        const three = [ev('feed', at(1, 8)), ev('feed', at(2, 8)), ev('feed', at(3, 8)), ev('diaper', at(4, 9)), ev('diaper', at(5, 9)), ev('diaper', at(6, 9))];
        return { two: Routine.find(two, T.now), three: T.slots(three), six: Routine.find(three, T.now).need, five: Routine.find(five, T.now).logged };
      });
      assert.deepEqual([r.two.enough, r.two.logged, r.two.slots.length], [false, 2, 0]);
      assert.deepEqual(r.three, [], '3 of 6 days logged is only half'); assert.equal(r.six, 4); assert.equal(r.five, 5);
    });

    await step('diapers, night wakings, vomiting and health notes are left out, however regular', async () => {
      const r = await P.evaluate(() => {
        const { at, ev, slots } = T, evs = [];
        for (let i = 1; i <= 7; i++) evs.push(ev('diaper', at(i, 9), { pee: true }), ev('wake', at(i, 3), { min: 10 }), ev('vomit', at(i, 12), { amount: 'Spit-up' }), ev('health', at(i, 10), { symptoms: ['Rash'] }));
        return slots(evs);
      });
      assert.deepEqual(r, []);
    });

    await step('naps, night sleep, each kind of play and each medicine have routine times of their own, with how long they usually last', async () => {
      const r = await P.evaluate(() => {
        const { at, ev, slots } = T, evs = [];
        for (let i = 1; i <= 7; i++) {
          evs.push(ev('sleep', at(i, 13), {}, { end: at(i, 14, 30) }), ev('sleep', at(i, 19, 30), {}, { end: at(i - 1, 6) }));
          if (i <= 5) evs.push(ev('play', at(i, 18, 30), { activity: 'Bath', min: 15 }));
          evs.push(ev('play', at(i, 9 + i, 0), { activity: 'Tummy time', min: 5 }));   // tummy time whenever
          evs.push(ev('med', at(i, 9), { name: i === 7 ? '  vitamin d ' : 'Vitamin D', dose: '1 ml' }));
          if (i <= 2) evs.push(ev('med', at(i, 9), { name: 'Iron', dose: '0.5 ml' }));
        }
        return slots(evs);
      });
      const by = Object.fromEntries(r.map(s => [s.key + ' ' + s.at, s]));
      assert.deepEqual(Object.keys(by).sort(), ['med:vitamin d 9:00', 'play:Bath 18:30', 'sleep 13:00', 'sleep 19:30'].sort(), JSON.stringify(r));
      assert.equal(by['sleep 13:00'].minutes, 90); assert.equal(by['sleep 19:30'].minutes, 630, 'the night: 7:30 PM to 6 AM');
      assert.deepEqual([by['play:Bath 18:30'].days, by['play:Bath 18:30'].minutes], [5, 15]);
      assert.deepEqual([by['med:vitamin d 9:00'].name, by['med:vitamin d 9:00'].dose, by['med:vitamin d 9:00'].days], ['Vitamin D', '1 ml', 7], 'the same medicine however it was typed');
    });

    await step('a routine time can cross midnight (11:50 PM one day, 12:10 AM another)', async () => {
      const r = await P.evaluate(() => {
        const { at, ev, slots } = T;
        return slots([1, 2, 3, 4, 5, 6, 7].map(i => ev('feed', i % 2 ? at(i, 23, 50) : at(i, 0, 10))));
      });
      assert.equal(r.length, 1, JSON.stringify(r)); assert.equal(r[0].days, 7);
      assert(['23:50', '23:55', '0:00', '0:05', '0:10'].includes(r[0].at), r[0].at); assert.deepEqual([r[0].from, r[0].to], ['23:50', '0:10']);
    });

    await step('it updates by itself: when the 8:00 feed moves to 7:00, the routine follows within a few days', async () => {
      const r = await P.evaluate(() => {
        const { at, ev } = T, evs = [7, 6, 5, 4].map(i => ev('feed', at(i, 8))).concat([3, 2, 1].map(i => ev('feed', at(i, 7))));
        const then = Routine.find(evs, T.now).slots.map(s => T.hm(s.at));
        evs.push(ev('feed', at(0, 7)), ev('feed', at(-1, 7)));   // today and tomorrow at 7:00 too
        const later = Routine.find(evs, at(-2, 15)).slots.map(s => T.hm(s.at));
        return { then, later };
      });
      assert.deepEqual(r.then, ['8:00'], 'still 8:00 on 4 of the 7 days'); assert.deepEqual(r.later, ['7:00'], 'two days on, 7:00 on 5 of the last 7');
    });

    await step('today: what is done (each entry ticks one routine time), what is due now, what is next; tomorrow\'s first once today\'s are over', async () => {
      const r = await P.evaluate(() => {
        const { at, ev } = T, base = [];
        for (let i = 1; i <= 7; i++) base.push(ev('feed', at(i, 8)), ev('feed', at(i, 8, 40)), ev('sleep', at(i, 13), {}, { end: at(i, 14) }));
        const slots = Routine.find(base, T.now).slots, state = (evs, now) => { const x = Routine.today(slots, evs, now); return { list: x.list.map(o => [T.hm(o.slot.at), o.state, o.entry ? T.hm(new Date(o.entry.ts).getHours() * 60 + new Date(o.entry.ts).getMinutes()) : null]), next: x.next && [T.hm(x.next.slot.at), x.next.tomorrow, x.next.state] }; };
        return {
          early: state(base, at(0, 6)),
          due: state(base, at(0, 7, 30)),
          one: state(base.concat(ev('feed', at(0, 8, 20))), at(0, 10)),
          done: state(base.concat(ev('feed', at(0, 8, 5)), ev('feed', at(0, 8, 45)), ev('sleep', at(0, 13, 10), {}, { end: at(0, 14) })), at(0, 15)),
        };
      });
      assert.deepEqual(r.early.list.map(x => x[1]), ['later', 'later', 'later']); assert.deepEqual(r.early.next, ['8:00', false, 'later']);
      assert.deepEqual(r.due.list.map(x => x[1]), ['now', 'later', 'later'], '7:30 is within 45 minutes of the 8:00 feed, not of the 8:40 one'); assert.deepEqual(r.due.next, ['8:00', false, 'now']);
      assert.deepEqual(r.one.list.filter(x => x[1] === 'done').length, 1, 'one feed at 8:20 ticks one routine time, not both: ' + JSON.stringify(r.one.list));
      assert.deepEqual(r.done.list, [['8:00', 'done', '8:05'], ['8:40', 'done', '8:45'], ['13:00', 'done', '13:10']]); assert.deepEqual(r.done.next, ['8:00', true, 'later'], 'tomorrow\'s first');
    });

    await step('the routine\'s day runs from morning to night (6 AM to 6 AM): the hours after midnight come last, and count with the evening before them', async () => {
      const r = await P.evaluate(() => {
        const { at, ev, hm } = T, base = [];
        for (let i = 1; i <= 7; i++) base.push(ev('feed', at(i, 8)), ev('feed', at(i, 20)), ev('feed', at(i, 2)));   // 8 AM, 8 PM, and a feed at 2 in the night
        const slots = Routine.find(base, T.now).slots, st = (evs, now) => { const x = Routine.today(slots, evs, now); return { list: x.list.map(o => [hm(o.slot.at), o.state]), next: [hm(x.next.slot.at), x.next.tomorrow, x.next.state] }; };
        return {
          order: slots.map(s => hm(s.at)),
          night: st(base, at(0, 2, 30)),   // 2:30 in the night: yesterday's 8 AM and 8 PM are done, the night feed is due
          dawn: st(base.concat(ev('feed', at(0, 2, 10))), at(0, 5, 50)),   // 5:50: the night is over; next is the morning's first
          day: st(base.concat(ev('feed', at(0, 8, 5))), T.now),   // 3 PM: the night feed is still to come, tonight
        };
      });
      assert.deepEqual(r.order, ['8:00', '20:00', '2:00']);
      assert.deepEqual(r.night.list, [['8:00', 'done'], ['20:00', 'done'], ['2:00', 'now']]); assert.deepEqual(r.night.next, ['2:00', false, 'now']);
      assert.deepEqual(r.dawn.list, [['8:00', 'done'], ['20:00', 'done'], ['2:00', 'done']]); assert.deepEqual(r.dawn.next, ['8:00', true, 'later']);
      assert.deepEqual(r.day.list, [['8:00', 'done'], ['20:00', 'later'], ['2:00', 'later']]); assert.deepEqual(r.day.next, ['20:00', false, 'later']);
    });

    // ---------- the page ----------
    await P.evaluate(() => {
      const { at, ev } = T, k = db.baby.kids[0].id, mk = (type, ts, data, x) => ({ ...ev(type, ts, data, x), by: Auth.id, child: k, updated: stamp() });
      for (let i = 1; i <= 7; i++) db.events.push(mk('feed', at(i, 8, i % 3 * 5), { kind: 'bottle', ml: 120 }), mk('sleep', at(i, 13), {}, { end: at(i, 14, 30) }), mk('play', at(i, 18, 30), { activity: 'Bath', min: 15 }), mk('diaper', at(i, 9), { pee: true }));
      db.events.push(mk('feed', at(0, 8, 5), { kind: 'bottle', ml: 110 }));
      save(); tab = 'routine'; render();
    });

    await step('the Routine tab lays the routine out like a day in a calendar: times on the left, parts of the day, a line at the time now', async () => {
      await P.click('[data-tab=routine]');
      const r = await P.evaluate(() => ({
        rows: [...document.querySelectorAll('.rslot')].map(x => [x.querySelector('.rt').textContent, x.querySelector('.rb b').textContent.trim(), x.className.replace(/card|rslot/g, '').trim()]),
        parts: [...document.querySelectorAll('.rpart')].map(x => x.textContent), now: document.querySelectorAll('.rnow').length, how: !!document.querySelector('.rhow'),
      }));
      assert.deepEqual(r.rows.map(x => x[1]), ['Feed', 'Nap', 'Bath'], JSON.stringify(r.rows));
      assert.deepEqual(r.parts, ['Morning', 'Afternoon', 'Evening']); assert.equal(r.now, 1); assert(r.how);
      const feed = await P.textContent('.rslot[data-slot=feed]');
      assert(/8:0\d AM/.test(feed) && /Bottle 120 ml/.test(feed) && /7 of 7 days/.test(feed) && /✓ 8:05 AM/.test(feed), feed);
      assert(/until about 2:30 PM \(1h 30m\)/.test(await P.textContent('.rslot[data-slot=sleep]')));
      assert.equal(await P.$$eval('.rslot[data-slot="play:Bath"] .rs', x => x.length), 1, 'Bath gets a status too');
      assert.equal(await P.$$eval('.rslot[data-slot^="diaper"]', x => x.length), 0, 'no diapers');
    });

    await step('"Next in the routine" says what is coming and when; the routine ticks off what is logged today as it happens', async () => {
      const next = await P.textContent('.rnext');
      // today's feed is logged; a routine time stays "next" until 45 minutes after it (the nap at 1 PM, the bath at 6:30 PM), then tomorrow's feed
      const expected = await P.evaluate(() => { const d = new Date(), m = d.getHours() * 60 + d.getMinutes(); return m < 6 * 60 ? 'Feed' : m <= 13 * 60 + 45 ? 'Nap' : m <= 19 * 60 + 15 ? 'Bath' : 'Feed'; });   // (before 6 AM it is still yesterday's routine, all done)
      assert(next.includes('Next in the routine') && next.includes(expected), next);
      await P.evaluate(() => { const k = db.baby.kids[0].id; db.events.push({ id: 'bath-today', type: 'play', ts: T.at(0, 18, 40), data: { activity: 'Bath', min: 10 }, note: '', by: Auth.id, child: k, updated: stamp() }); save(); render(); });
      assert(/✓ 6:40 PM/.test(await P.textContent('.rslot[data-slot="play:Bath"]')), 'ticked as soon as it is logged');
    });

    await step('each child has their own routine; a child with only a couple of days logged is told it will show up', async () => {
      await P.evaluate(() => {
        db.baby.kids.push({ id: 'k2', name: 'Mia', sex: 'girl', color: '#d0507a' });   // (no birth date: no month-birthday sheet in the way)
        db.events.push({ id: 'mia1', type: 'feed', ts: T.at(1, 10), data: {}, note: '', by: Auth.id, child: 'k2', updated: stamp() }, { id: 'mia2', type: 'feed', ts: T.at(2, 10), data: {}, note: '', by: Auth.id, child: 'k2', updated: stamp() });
        save(); render();
      });
      await P.click('#kidBar [data-kid="k2"]');
      assert(/Your routine will show up here after a few days of logging/.test(await P.textContent('#view')) && /2 days logged in the last week so far/.test(await P.textContent('#view')));
      assert.equal(await P.$$eval('.rslot', x => x.length), 0);
      await P.click(`#kidBar [data-kid="${await P.evaluate(() => db.baby.kids[0].id)}"]`);
      assert.equal(await P.$$eval('.rslot', x => x.length), 3, 'Leo\'s routine again');
    });

    await step('on the page, the night comes last: Morning, Afternoon, Evening, then Night, with the line at the time now where it falls', async () => {
      const k = await P.evaluate(() => db.baby.kids[0].id);
      const r = await P.evaluate(k => {
        for (let i = 1; i <= 7; i++) db.events.push({ id: 'night' + i, type: 'feed', ts: T.at(i, 2, 15), data: { kind: 'bottle', ml: 90 }, note: '', by: Auth.id, child: k, updated: stamp() });
        save(); render();
        const read = html => { const d = document.createElement('div'); d.innerHTML = html; return [...d.querySelectorAll('.rpart, .rslot, .rnow')].map(x => (x.classList.contains('rpart') ? x.textContent : x.classList.contains('rnow') ? 'now' : x.querySelector('.rt').textContent)); };
        return { page: [...document.querySelectorAll('.rpart')].map(x => x.textContent), at3: read(routineView(T.at(0, 3))), at21: read(routineView(T.at(0, 21))), dawn: (() => { const d = document.createElement('div'); d.innerHTML = routineView(T.at(0, 5, 50)); return d.querySelector('.rnext').textContent; })() };
      }, k);
      assert.deepEqual(r.page, ['Morning', 'Afternoon', 'Evening', 'Night']);
      assert.deepEqual(r.at3, ['Morning', '8:05 AM', 'Afternoon', '1:00 PM', 'Evening', '6:30 PM', 'Night', '2:15 AM', 'now'], 'at 3 in the night, the line is in the night, after the 2:15 feed');
      assert.deepEqual(r.at21, ['Morning', '8:05 AM', 'Afternoon', '1:00 PM', 'Evening', '6:30 PM', 'now', 'Night', '2:15 AM'], 'at 9 PM, before the night');
      assert(/at about 8:0\d AM, in 2h 1\dm/.test(r.dawn) && !/tomorrow/.test(r.dawn), 'at 5:50 AM the morning feed is today, not "tomorrow": ' + r.dawn);
      await P.evaluate(() => { db.events = db.events.filter(e => !e.id.startsWith('night')); save(); render(); });
    });

    await step('the ? button walks through the Routine page', async () => {
      await P.click('#helpBtn'); await P.waitForSelector('.tour');
      const titles = [];
      for (let i = 0; i < 5 && await P.$('.tour'); i++) { titles.push(await P.textContent('#tourT')); const nx = await P.$('.tour .tt-next'); if (!nx) break; await nx.click(); await P.waitForTimeout(150); }
      assert.deepEqual(titles.slice(0, 3), ['Next in the routine', 'Your routine', 'It keeps up by itself'], titles.join(' | '));
      if (await P.$('.tour')) await P.keyboard.press('Escape');
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, []); assert.deepEqual(p.csp, []); }
    });
  } catch (e) { failed++; console.log('✗ crashed:', e); } finally { await H.close(); }
  console.log(`\n${failed ? failed + ' FAILED, ' : ''}${ok} passed`); process.exit(failed ? 1 : 0);
})();
