// The day clock, twirl-down groups, month day counts, stats charts, formula, the Guide (pediatrician, milestones) and people's contact
// details – including that the new private data stays end-to-end encrypted.   node tests/features.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 4).join('\n    ')); } };
const lum = h => { const f = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Choose a formula in a picker: open it, open the region it's listed under if it isn't showing, and tap it. */
const pickFormula = async (page, scope, name) => {
  await page.click(`${scope} .fcur`);
  const b = page.locator(`${scope} [data-fv="${name}"]`).first();
  if (!(await b.isVisible())) await b.evaluate(x => { const d = x.closest('details'); if (d) d.open = true; });
  await b.click();
};

(async () => {
  const H = await setup({ port: 8129 }), { q, syncNow } = H;
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    const day0 = await P.evaluate(() => startOfDay(Date.now()));
    const at = h => day0 + h * 3600e3;
    // a known day: feed 1:00, pee 7:30, pee+poo 13:00, vomit 19:00, sleep 2:00–4:00
    await P.evaluate(([a, b, c, d, e, f]) => {
      const add = (type, ts, data, x = {}) => db.events.push({ id: 'f' + type + ts, type, ts, data, note: '', updated: stamp(), by: Auth.id, child: db.baby.kids[0].id, ...x });
      add('feed', a, { kind: 'bottle', ml: 90, milk: 'Formula' }); add('diaper', b, { pee: true, poo: false }); add('diaper', c, { pee: true, poo: true, color: 'Yellow' });
      add('vomit', d, { amount: 'Spit-up' }); add('sleep', e, {}, { end: f }); save(); viewDay = startOfDay(a); tab = 'day'; render();
    }, [at(1), at(7.5), at(13), at(19), at(2), at(4)]);

    await step('the day clock draws one ray per entry, at the right time, in its group\'s colour', async () => {
      assert.equal(await P.$$eval('.clock .ray', r => r.length), 5);
      const [cx, cy] = await P.evaluate(() => { const c = document.querySelector('svg.clock'); return [+c.dataset.cx, +c.dataset.cy]; });
      const pos = await P.evaluate(id => { const c = document.querySelector(`.ray[data-edit="${id}"] .dot`); return [+c.getAttribute('cx'), +c.getAttribute('cy')]; }, 'fdiaper' + at(13));
      assert(pos[0] < cx && Math.abs(pos[0] - cx) < 25 && pos[1] > cy + 50, '1 PM is just past the bottom of a 24-hour dial (noon at the bottom): ' + pos);
      const top = await P.evaluate(id => +document.querySelector(`.ray[data-edit="${id}"] .dot`).getAttribute('cy'), 'ffeed' + at(1));
      assert(top < cy - 50, '1 AM is near the top');
      const colours = await P.evaluate(() => [...document.querySelectorAll('.clock .ray .dot')].map(d => getComputedStyle(d).fill));
      assert.equal(new Set(colours).size, 4, 'feed, diaper, vomit and sleep each in their own colour: ' + colours);
      assert.equal(await P.$$eval('.clock .sarc', a => a.length), 1, 'the sleep shows as an arc for how long it lasted');
      assert(/Diapers\s*2/.test(await P.textContent('.clegend')), 'the legend counts each group');
    });

    await step('tapping a dot opens that entry; it also works from the keyboard', async () => {
      await P.click(`.ray[data-edit="fvomit${at(19)}"]`); await P.waitForSelector('#save');
      assert(/Edit vomit/.test(await P.textContent('#sheet h3'))); await P.click('#cancel');
      await P.focus(`.ray[data-edit="ffeed${at(1)}"]`); await P.keyboard.press('Enter'); await P.waitForSelector('#save');
      assert(/Edit feed/.test(await P.textContent('#sheet h3'))); await P.click('#cancel');
    });

    await step('tapping a quarter of the clock lists only those hours; "Whole day" goes back', async () => {
      await P.click('[data-quad="2"]', { position: { x: 50, y: 50 } });
      const rows = await P.$$eval('.quadlist .ev', r => r.map(x => x.dataset.edit));
      assert.deepEqual(rows, ['fdiaper' + at(13)], 'afternoon has just the 1 PM diaper');
      assert(/Afternoon/.test(await P.textContent('.quadlist')));
      await P.click('[data-quadclear]'); assert.equal(await P.$$eval('.quadlist', x => x.length), 0);
    });

    await step('the clock: a frame of thin soft-gold lines, a painted panel, a white face with a black rim, Roman numerals with a moon at midnight and a sun at noon, and a hand only on today', async () => {
      const r = await P.evaluate(() => ({ nums: [...document.querySelectorAll('.clock text.num')].map(t => t.textContent), moonSun: document.querySelectorAll('.clock g[aria-hidden] path[d^="M2.5 -6.2"], .clock g[aria-hidden] circle[r="3.6"]').length, hand: !!document.querySelector('.clock .hand'), face: document.querySelector('.clock .face').getAttribute('fill'), rim: document.querySelector('.clock .rim').getAttribute('stroke') }));
      assert.deepEqual(r.nums, ['II', 'IV', 'VI', 'VIII', 'X', 'II', 'IV', 'VI', 'VIII', 'X']);
      assert.equal(r.moonSun, 2); assert.equal(r.face, '#fffdf8', 'a white face'); assert.equal(r.rim, '#1f1b16', 'with a black rim');
      const fr = await P.evaluate(() => { const g = document.querySelector('.clock .frame'); return { stroke: g.getAttribute('stroke'), fill: g.getAttribute('fill'), shapes: g.querySelectorAll('path, rect, circle').length, extras: g.querySelectorAll('image, [filter]').length }; });
      assert.deepEqual([fr.stroke, fr.fill, fr.extras], ['#c8aa6e', 'none', 0], 'the frame is plain soft-gold lines: ' + JSON.stringify(fr));
      assert(fr.shapes >= 10, 'handle, finials, cornice, columns, base and feet');
      assert.equal(r.hand, true, "today's clock has the hand");
      await P.click('[data-nav="-1"]'); assert.equal(await P.$$eval('.clock .hand', h => h.length), 0, 'yesterday has none'); await P.click('[data-nav="1"]');
      await P.waitForFunction(() => /^(blob|data):/.test(document.querySelector('.clock image.art').getAttribute('href') || ''), null, { timeout: 10000 });
      const loaded = await P.evaluate(() => new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = document.querySelector('.clock image.art').getAttribute('href'); }));
      assert(loaded && loaded[0] >= 264 && loaded[1] >= 336, 'the painting is a real picture: ' + loaded);
    });

    await step('a 12-hour face shows half the day at a time with all twelve numerals; AM and PM switch halves; the choice sticks', async () => {
      await P.click('[data-face="12"]');
      assert.equal(await P.$eval('svg.clock', c => c.dataset.dial), '12');
      assert.deepEqual(await P.$$eval('.clock text.num', t => t.map(x => x.textContent)), ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']);
      await P.click('[data-half="0"]');
      assert.deepEqual(await P.$$eval('.clock .ray', r => r.map(x => x.dataset.edit).sort()), ['fdiaper' + at(7.5), 'ffeed' + at(1), 'fsleep' + at(2)].sort(), 'AM: midnight to noon');
      assert.equal(await P.textContent('.clock .ampm'), 'a.m.');
      await P.click('[data-half="1"]');
      assert.deepEqual(await P.$$eval('.clock .ray', r => r.map(x => x.dataset.edit).sort()), ['fdiaper' + at(13), 'fvomit' + at(19)].sort(), 'PM: noon to midnight');
      const [cx, cy] = await P.evaluate(() => { const c = document.querySelector('svg.clock'); return [+c.dataset.cx, +c.dataset.cy]; });
      const pos = await P.evaluate(id => { const c = document.querySelector(`.ray[data-edit="${id}"] .dot`); return [+c.getAttribute('cx'), +c.getAttribute('cy')]; }, 'fdiaper' + at(13));
      assert(pos[0] > cx && pos[1] < cy, '1 PM sits at one o\'clock: ' + pos);
      assert(/Diapers\s*1/.test(await P.textContent('.clegend')), 'the legend counts what the dial shows');
      await P.evaluate(() => document.querySelector('[data-quad="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.deepEqual(await P.$$eval('.quadlist .ev', r => r.map(x => x.dataset.edit)), ['fdiaper' + at(13)]);
      assert(/Early afternoon/.test(await P.textContent('.quadlist')) && /12 PM – 3 PM/.test(await P.textContent('.quadlist')), await P.textContent('.quadlist .qhead'));
      await P.click('[data-quadclear]');
      // today: an hour and a minute hand on the half that holds the current time, none on the other half
      const cur = await P.evaluate(() => String(new Date().getHours() >= 12 ? 1 : 0));
      await P.click(`[data-half="${cur}"]`); assert.deepEqual(await P.$$eval('.clock .hand', h => h.map(x => x.dataset.hand).sort()), ['h', 'm']);
      await P.click(`[data-half="${1 - cur}"]`); assert.equal(await P.$$eval('.clock .hand', h => h.length), 0);
      await P.evaluate(() => render()); assert.equal(await P.$eval('svg.clock', c => c.dataset.dial), '12', 'still 12-hour after a refresh');
      assert.equal(await P.evaluate(async () => { await Store.whenSaved(); return (await Store.peek()).meta.clock; }), '12', 'and saved on the phone');
      await P.click('[data-face="24"]'); assert.equal(await P.$$eval('.clock text.num', t => t.length), 10, 'back to the 24-hour face');
      assert.deepEqual(await P.$$eval('.clock .hand', h => h.map(x => x.dataset.hand)), ['d'], 'with its single 24-hour hand');
    });

    await step('every painting draws, quickly, without errors (the eight to choose from and the four travel ones)', async () => {
      const r = await P.evaluate(async () => { const out = []; for (const t of Art.THEMES) { const t0 = performance.now(); const u = await Art.url(t.id, 1); const ok = await new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth > 0); i.onerror = () => res(false); i.src = u; }); out.push([t.id, ok, Math.round(performance.now() - t0)]); } return out; });
      assert.deepEqual(r.map(x => x[0]), ['blossom', 'maple', 'ocean', 'forest', 'mountains', 'garden', 'night', 'classic', 'car', 'plane', 'train', 'ship'], 'the eight to choose from, and one for each way of travelling');
      assert(r.every(x => x[1]), JSON.stringify(r)); assert(r.every(x => x[2] < 3000), 'each under 3 s: ' + JSON.stringify(r));
    });

    await step('the clock art can be changed for a page, and it sticks', async () => {
      assert.equal(await P.evaluate(() => artOf()), 'blossom', 'the first child starts on cherry blossoms');
      await P.click('.artbtn'); await P.waitForSelector('.artgrid');
      assert.equal(await P.$$eval('.artopt', b => b.length), 8);
      await P.click('[data-pick=forest]');
      assert.equal(await P.evaluate(() => [artOf(), db.meta.art[db.baby.kids[0].id], document.querySelector('svg.clock').dataset.painting]).then(x => x.join()), 'forest,forest,forest');
      assert(/Forest/.test(await P.textContent('.artbtn')));
      await P.click('[data-tab=more]'); assert(/Forest/.test(await P.textContent('.card:has([data-art])')), 'More shows the choice too'); await P.click('[data-tab=day]');
    });

    await step('the list below is one twirl-down per group, pee and poo together, closed until tapped, and stays open across updates', async () => {
      const groups = await P.$$eval('details.grp', d => d.map(x => [x.dataset.grp, x.open, x.querySelector('small').textContent]));
      assert.deepEqual(groups.map(g => g[0]), ['dfeed', 'ddiaper', 'dsleep', 'dvomit']);
      assert(groups.every(g => !g[1]), 'closed by default');
      assert.equal(groups[1][2], '2 diapers · 2 pee, 1 poo');
      await P.click('details[data-grp=ddiaper] summary'); await P.evaluate(() => render());
      assert.equal(await P.$eval('details[data-grp=ddiaper]', d => d.open), true, 'still open after the screen refreshes');
      assert.equal(await P.$$eval('details[data-grp=ddiaper] .ev', r => r.length), 2);
    });

    await step('the month view gives the chosen day\'s counts, with the full entries in a twirl-down', async () => {
      await P.click('[data-tab=month]'); await P.click(`[data-day="${day0}"]`);
      const tiles = await P.$$eval('.tile', t => t.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
      assert(tiles.some(t => /^1 Feeds 90 ml/.test(t)) && tiles.some(t => /^2 Pee/.test(t)) && tiles.some(t => /^1 Poo/.test(t)) && tiles.some(t => /^2h Sleep/.test(t)) && tiles.some(t => /^1 Vomit/.test(t)), tiles.join(' | '));
      assert.equal(await P.$eval('details[data-grp=mAll]', d => d.open), false);
      await P.click('details[data-grp=mAll] > summary'); assert.equal(await P.$$eval('details[data-grp=mAll] details.grp', d => d.length), 4);
    });

    await step('every stats section has a chart drawn to scale, with the numbers in a table', async () => {
      await P.click('[data-tab=stats]');
      const titles = await P.$$eval('.scard', c => c.map(x => [x.querySelector('b').textContent.trim(), x.querySelectorAll('svg.chart').length]));
      assert.deepEqual(titles.map(t => t[0]), ['Feeding', 'Diapers', 'Sleep', 'Vomit', 'Play', 'Health & meds']);
      assert(titles.every(t => t[1] >= 1), 'a chart in each: ' + JSON.stringify(titles));
      // the diaper chart: today's pee bar is twice the poo bar, and the axis top is a round number at or above the largest value
      const r = await P.evaluate(() => { const c = [...document.querySelectorAll('.scard')][1], bars = c.querySelectorAll('svg.chart .bar'), last = bars[bars.length - 1].querySelectorAll('path'); const h = p => p.getBBox().height; return { pee: h(last[0]), poo: h(last[1]), top: c.querySelector('.ax:nth-of-type(3)') && [...c.querySelectorAll('svg.chart text.ax')].map(t => t.textContent) }; });
      assert(Math.abs(r.pee / r.poo - 2) < 0.15, `pee ${r.pee} vs poo ${r.poo}`);
      assert(r.top.includes('2'), 'axis labels include the top value: ' + r.top);
      const row = await P.evaluate(() => [...document.querySelectorAll('.scard')][1].querySelector('.tw tbody tr').textContent);
      assert(/2.*1/.test(row), 'the table shows today: ' + row);
    });

    await step('in dark mode the clock keeps its white face, and the entries on it keep the colours checked against white', async () => {
      await P.emulateMedia({ colorScheme: 'dark' }); await P.evaluate(() => Theme.apply(false)); await P.click('[data-tab=day]');
      const r = await P.evaluate(() => ({ face: document.querySelector('.clock .face').getAttribute('fill'), dot: getComputedStyle(document.querySelector('.clock .ray .dot')).fill, legend: getComputedStyle(document.querySelector('.clockwrap .clegend i')).backgroundColor }));
      assert.equal(r.face, '#f1ece3', 'a warm white face at night');
      const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
      assert.equal(r.legend, rgb('#c9761f'), 'the legend matches the dots: ' + r.legend);
      assert([rgb('#c9761f'), rgb('#2a9db8'), rgb('#5b5fc7'), rgb('#5f8a1f'), rgb('#a845a8'), rgb('#c0392b')].includes(r.dot), 'a light-palette colour: ' + r.dot);
      await P.emulateMedia({ colorScheme: 'light' }); await P.evaluate(() => Theme.apply(false));
    });

    await step('group colours stay readable on the paper in light and dark mode (3:1 for marks)', async () => {
      for (const mode of ['light', 'dark']) {
        await P.emulateMedia({ colorScheme: mode }); await P.evaluate(() => Theme.apply(false));   // (switch straight away: no sky in a test)
        const c = await P.evaluate(() => { const s = getComputedStyle(document.documentElement); return { card: mode => (mode === 'dark' ? '#27241f' : '#fffdf9'), g: ['feed', 'diaper', 'sleep', 'vomit', 'play', 'health'].map(g => s.getPropertyValue('--g-' + g).trim()) }; });
        for (const g of c.g) assert(contrast(g, mode === 'dark' ? '#27241f' : '#fffdf9') >= 3, `${mode} ${g}`);
      }
      await P.emulateMedia({ colorScheme: 'light' }); await P.evaluate(() => Theme.apply(false));
    });

    await step('a child\'s usual formula fills in on bottle feeds and is saved with the entry', async () => {
      await P.click('[data-tab=more]'); const k = await P.evaluate(() => db.baby.kids[0].id);
      await pickFormula(P, `.kidrow:has([data-kfs="${k}"])`, 'Similac 360 Total Care');
      assert.equal(await P.evaluate(() => db.baby.kids[0].formula), 'Similac 360 Total Care');
      await P.click('[data-tab=day]'); await P.click('[data-add=feed]'); await P.click('[name=kind][value=bottle]');
      assert.equal(await P.isVisible('#fFormula'), false, 'only asked for formula feeds');
      await P.click('[name=milk][value=Formula]'); assert.equal(await P.inputValue('#formulaSel'), 'Similac 360 Total Care');
      await P.fill('#ml', '120'); await P.click('#save');
      const e = await P.evaluate(() => db.events.find(x => x.data.ml === 120)); assert.equal(e.data.formula, 'Similac 360 Total Care');
      assert.deepEqual(await P.evaluate(id => describe(db.events.find(x => x.id === id)), e.id), ['Bottle 120 ml', 'Formula · Similac 360 Total Care']);
      await syncNow(P);
    });

    const D = await H.addMember(P, 'dad@x.com', 'family', {}, { name: 'Dad' });
    const B = await H.addMember(P, 'sitter@x.com', 'babysitter', { view_people: false }, { name: 'Jess' });

    await step('formula travels end-to-end encrypted and arrives on the other phones', async () => {
      await syncNow(D); const e = await D.evaluate(() => db.events.find(x => x.data.ml === 120)); assert.equal(e.data.formula, 'Similac 360 Total Care');
      assert.equal(await D.evaluate(() => db.baby.kids[0].formula), 'Similac 360 Total Care');
      const dump = JSON.stringify(await q('select * from events')) + JSON.stringify(await q('select profile from babies'));
      assert(!/Similac/.test(dump), 'the server never sees it');
    });

    await step('the formula list: usual and recent ones on top, then a twirl-down for each region (where you are first, and open), and "Other" for any formula', async () => {
      const r = await P.evaluate(() => ({ map: ['Europe/London', 'Europe/Berlin', 'Australia/Sydney', 'Pacific/Auckland', 'America/Sao_Paulo', 'America/Mexico_City', 'Asia/Tokyo', 'Asia/Dubai', 'Africa/Lagos', 'America/Chicago', 'America/Toronto', 'Mars/Base'].map(z => Formulas.regionFor(z)),
        first: Formulas.ordered('uk')[0].name, here: myRegion() }));
      assert.deepEqual(r.map, ['uk', 'eu', 'anz', 'anz', 'latam', 'latam', 'asia', 'mea', 'mea', 'na', 'na', 'na']);
      assert.equal(r.first, 'UK & Ireland'); assert.equal(r.here, 'na', 'this test phone is on UTC, which counts as North America');
      await P.click('[data-tab=day]'); await P.click('[data-add=feed]'); await P.click('[name=kind][value=bottle]'); await P.click('[name=milk][value=Formula]');
      assert.equal(await P.isVisible('#fFormula .flist'), false, 'folded away until tapped');
      await P.click('#fFormula .fcur');
      const regs = await P.$$eval('#fFormula details.freg', d => d.map(x => [x.dataset.region, x.open]));
      assert.deepEqual(regs.map(x => x[0]), ['na', 'latam', 'uk', 'eu', 'anz', 'asia', 'mea'], 'every region, where you are first');
      assert.deepEqual(regs.map(x => x[1]), [true, false, false, false, false, false, false], 'yours open, the rest folded');
      assert(/Where you are/.test(await P.textContent('#fFormula details.freg[data-region=na] > summary')));
      assert.equal(await P.isVisible('#fFormula details.freg[data-region=eu] [data-fv="HiPP Organic PRE"]'), false, 'a folded region hides its formulas');
      await P.click('#fFormula details.freg[data-region=eu] > summary'); await P.click('#fFormula details.freg[data-region=eu] [data-fv="HiPP Organic PRE"]');
      assert.equal(await P.inputValue('#formulaSel'), 'HiPP Organic PRE'); assert.equal(await P.textContent('#fFormula .fv'), 'HiPP Organic PRE');
      assert.equal(await P.isVisible('#fFormula .flist'), false, 'choosing one folds the list away');
      for (const [reg, f] of [['na', 'Enfamil NeuroPro'], ['uk', 'Kendamil Classic First Infant Milk'], ['anz', 'a2 Platinum Premium'], ['asia', 'Meiji Hohoemi'], ['latam', 'NAN Optipro'], ['mea', 'Bebelac']]) assert(await P.$(`#fFormula details.freg[data-region=${reg}] [data-fv="${f}"]`), f);
      await P.click('#fFormula .fcur'); await P.click('#fFormula [data-fv=__other]'); assert.equal(await P.isVisible('#formula'), true, 'Other opens a box to type in');
      await P.fill('#formula', "Grandma's special blend"); await P.fill('#ml', '60'); await P.click('#save');
      assert.equal(await P.evaluate(() => db.events.find(e => e.data && e.data.ml === 60).data.formula), "Grandma's special blend");
      await P.click('[data-add=feed]'); await P.click('[name=kind][value=bottle]'); await P.click('[name=milk][value=Formula]'); await P.click('#fFormula .fcur');
      assert(await P.$('#fFormula .flist > .fopts [data-fv="Grandma\'s special blend"]'), 'a typed-in formula is offered next time, at the top'); await P.click('#cancel');
    });

    await step('a formula given at every formula feed three days running becomes the usual one on every phone, without anyone saving it; mixed days or a hand-picked choice are respected', async () => {
      const L = await P.evaluate(() => { const d = 864e5, t = Date.now(), f = (x, n) => ({ ts: t - n * d, formula: x }), run = (x, ...n) => n.map(i => f(x, i)); return [
        Formulas.learned(run('A', 0, 1, 2)), Formulas.learned(run('A', 0, 1)), Formulas.learned([...run('A', 0, 1, 2), f('B', 0)]),
        Formulas.learned([...run('B', 0, 1, 2), f('A', 3)]), Formulas.learned([f('a', 0), ...run('A', 1, 6)]),
        Formulas.learned([...run('A', 2, 3, 4), f('B', 1), f('A', 1), f('B', 0)]), Formulas.learned([...run('A', 3, 4, 5), ...run('B', 0, 1, 2)]), Formulas.learned([...run('A', 2, 3, 4), ...run('B', 0, 1)])]; });
      assert.deepEqual(L, ['A', '', '', 'B', 'a', 'A', 'B', 'A'], 'three days the same; two is not enough; a mixed day stops a run; a switch is picked up; spelling case and gaps are fine; once settled it stays through a mixed day, until another formula has three days of its own');
      const [leo, mia] = await P.evaluate(() => { const k = Kids.make(kids(), 'Mia', 'girl'); kids().push(k); Sync.pushBaby(); render(); return [kids()[0].id, k.id]; });
      const t0 = await P.evaluate(() => startOfDay(Date.now()));
      await P.evaluate(([id, t0]) => { for (const d of [-2, -2, -1]) db.events.push({ id: uid(), type: 'feed', ts: t0 + d * 864e5 + 9 * 3600e3, data: { kind: 'bottle', ml: 90, milk: 'Formula', formula: 'Enfamil NeuroPro' }, note: '', updated: stamp(), by: Auth.id, child: id }); save(); }, [mia, t0]);
      assert.equal(await P.evaluate(id => `${kidById(id).formula}|${usualFormula(kidById(id))}`, mia), '|', 'two days: not yet');
      await P.click('[data-tab=day]'); await P.click(`[data-kid="${mia}"]`); await P.click('[data-add=feed]'); await P.click('[name=kind][value=bottle]'); await P.click('[name=milk][value=Formula]');
      assert.equal(await P.inputValue('#formulaSel'), '', 'nothing chosen for her yet');
      await syncNow(P); const bid = await P.evaluate(() => db.meta.babyId), [{ profile }] = await q('select profile from babies where id = $1', [bid]);
      await pickFormula(P, '#fFormula', 'Enfamil NeuroPro'); await P.fill('#ml', '100'); await P.click('#save');
      assert.equal(await P.evaluate(id => `${kidById(id).formula}|${usualFormula(kidById(id))}`, mia), '|Enfamil NeuroPro', 'the third day makes it her usual formula, worked out from the feeds');
      assert(/Enfamil NeuroPro is now Mia's usual formula/.test(await P.textContent('#toast')), await P.textContent('#toast'));
      await P.click('[data-add=feed]'); await P.click('[name=kind][value=bottle]'); await P.click('[name=milk][value=Formula]');
      assert.equal(await P.inputValue('#formulaSel'), 'Enfamil NeuroPro', 'and the default from now on');
      assert.equal(await P.textContent('#fFormula .fv'), 'Enfamil NeuroPro'); assert(await P.$('#fFormula .flist > .fopts [data-fv="Enfamil NeuroPro"][aria-pressed=true]'), 'marked at the top'); await P.click('#cancel');
      // the other phone (a family member, who can't change the children's details) works out the same from the shared log, and no phone
      // writes it into the shared profile (so a phone that was offline can never push an old copy of the profile because of it)
      await syncNow(P); await syncNow(D);
      assert.equal(await D.evaluate(id => usualFormula(kidById(id)), mia), 'Enfamil NeuroPro');
      assert.equal((await q('select profile from babies where id = $1', [bid]))[0].profile, profile, 'the profile on the server is untouched');
      // More shows it, and where it came from; a formula picked there by hand wins over the feeds before it
      await P.click('[data-tab=more]'); assert.equal(await P.inputValue(`[data-kfs="${mia}"]`), 'Enfamil NeuroPro');
      assert(/Picked up from the feeds/.test(await P.textContent(`.kidrow:has([data-kfs="${mia}"])`)), 'says it was picked up from the feeds');
      await pickFormula(P, `.kidrow:has([data-kfs="${mia}"])`, 'Similac Advance');
      assert.equal(await P.evaluate(id => `${kidById(id).formula}|${usualFormula(kidById(id))}`, mia), 'Similac Advance|Similac Advance', 'earlier NeuroPro feeds no longer count');
      await syncNow(P); await syncNow(D); assert.equal(await D.evaluate(id => usualFormula(kidById(id)), mia), 'Similac Advance', 'and the choice reaches the other phones');
      await P.click('[data-tab=day]'); await P.click(`[data-kid="${leo}"]`);
    });

    await step('the Guide tab: common newborn issues with when to call, and every month\'s milestones', async () => {
      await P.click('[data-tab=guide]');
      assert.equal(await P.$$eval('details.gd[data-grp^=g]', d => d.length), 18);
      await P.click('details[data-grp=gfever] > summary');
      assert(/100\.4°F \(38°C\)/.test(await P.textContent('details[data-grp=gfever]')));
      assert.deepEqual(await P.$$eval('details.gd[data-grp^=m] b', b => b.map(x => x.textContent)), ['1 month', '2 months', '3 months', '4 months', '5 months', '6 months', '7 months', '8 months', '9 months', '10 months', '11 months', '12 months', '15 months', '18 months', '2 years']);
      assert(/911/.test(await P.textContent('.emer')), 'the emergency line is always on the page');
    });

    await step('the Guide\'s pictures: a twirl-down of their own inside the card, shut until tapped; loaded from the app itself, each with a caption and credit; closing the card or leaving the Guide hides them again', async () => {
      const cards = await P.$$eval('details.gd[data-grp^=g]', d => d.filter(x => x.querySelector(':scope > details.pix')).map(x => x.dataset.grp));
      assert.deepEqual(cards, ['gbelly', 'gjaundice', 'gcord', 'gpoop', 'gskin', 'gfontanelle'], 'the cards with something to show');
      await P.click('details[data-grp=gskin] > summary');
      assert.equal(await P.innerText('details[data-grp=pixskin] > summary small'), '3 photos · tap to show');
      assert.equal(await P.isVisible('details[data-grp=pixskin] img'), false, 'opening the card doesn\'t show them');
      const loaded = async sel => {   // (the page loads pictures as they scroll near; here every one is wanted now)
        await P.$$eval(sel, i => i.forEach(x => { x.loading = 'eager'; }));
        await P.waitForFunction(s => [...document.querySelectorAll(s)].every(i => i.complete && i.naturalWidth > 0), sel, { timeout: 5000 });
      };
      await P.click('details[data-grp=pixskin] > summary'); await loaded('details[data-grp=pixskin] img');
      assert.equal(await P.innerText('details[data-grp=pixskin] > summary small'), '3 photos', 'the hint goes once they show');
      const figs = await P.$$eval('details[data-grp=pixskin] figure', f => f.map(x => { const i = x.querySelector('img'); return { visible: i.checkVisibility(), own: i.src.startsWith(location.origin + '/img/guide/'), alt: i.alt, cap: x.querySelector('figcaption').textContent }; }));
      assert.equal(figs.length, 3);
      for (const f of figs) {
        assert(f.visible && f.own, 'shown, from the app itself (nothing fetched from elsewhere)'); assert(f.alt.length > 30, 'described for screen readers: ' + f.alt);
        assert(/Photo: [^,]+, (CC0 1\.0|Public domain|CC BY-SA [34]\.0)$/.test(f.cap), 'credited: ' + f.cap);
      }
      await P.evaluate(() => render()); assert(await P.isVisible('details[data-grp=pixskin] img'), 'they stay open while you look (a sync redraws the page)');
      await P.click('details[data-grp=gskin] > summary'); await P.waitForFunction(() => !document.querySelector('details[data-grp=pixskin]').open, null, { timeout: 2000 });
      await P.click('details[data-grp=gskin] > summary');
      assert.equal(await P.isVisible('details[data-grp=pixskin] img'), false, 'closing the card hides them again');
      await P.click('details[data-grp=pixskin] > summary'); await P.click('[data-tab=day]'); await P.click('[data-tab=guide]');
      assert.deepEqual(await P.evaluate(() => ['gskin', 'pixskin'].map(g => document.querySelector(`details[data-grp=${g}]`).open)), [true, false], 'after leaving the Guide the card stays open, its pictures don\'t');
      // every picture: the right size, a caption, a description and a full credit (licence and source addresses, and what was changed)
      await P.evaluate(() => document.querySelectorAll('details.gd[data-grp^=g]:has(details.pix), details.pix').forEach(d => { d.open = true; }));
      await loaded('details.pix img');
      const all = await P.$$eval('details.pix img', i => i.map(x => [x.naturalWidth === +x.getAttribute('width') && x.naturalHeight === +x.getAttribute('height'), x.alt.length > 30, x.src.split('/').pop()]));
      assert.equal(all.length, 12); assert.deepEqual(all.filter(x => !x[0] || !x[1]), [], 'sizes and descriptions match the files');
      for (const f of all.map(x => x[2])) assert(fs.statSync(path.join(__dirname, '..', 'img', 'guide', f)).size < 100 * 1024, f + ' is small enough to ship');
      await P.click('details[data-grp=credits] > summary');
      const cr = await P.$$eval('ul.credits li', l => l.map(x => x.textContent));
      assert.equal(cr.length, 12);
      for (const c of cr) {
        assert(/ From https:\/\/commons\.wikimedia\.org\/wiki\/File:\S+/.test(c), 'source: ' + c);
        assert(/Public domain/.test(c) || /\(https:\/\/creativecommons\.org\/(licenses\/by-sa\/[34]\.0|publicdomain\/zero\/1\.0)\/\)/.test(c), 'licence: ' + c);
        assert(/Public domain/.test(c) || /, (cropped|cropped and resized|saved with fewer colours)\.$/.test(c), 'what was changed: ' + c);
      }
      await P.evaluate(() => { [...openGroups].filter(g => /^(gbelly|gjaundice|gcord|gpoop|gskin|gfontanelle|pix|credits)/.test(g)).forEach(g => openGroups.delete(g)); render(); });
    });

    await step('the Guide\'s medicines drop-down: what is safe from what age (US and UK), remedies parents mention with what the evidence says, what never to give, and no doses', async () => {
      assert.equal(await P.isVisible('[data-grp=ofever]'), false, 'closed until opened');
      await P.click('details[data-grp=omenu] > summary');
      assert.deepEqual(await P.$$eval('details[data-grp=omenu] details.med > summary b', b => b.map(x => x.textContent)),
        ['Fever and pain', 'Gas and colic', 'Stuffy nose and colds', 'Diaper rash and skin', 'Teething', 'Vitamins', 'Homeopathic and herbal remedies', 'Never give a baby']);
      assert(/Under 3 months, call your pediatrician before giving any medicine/.test(await P.textContent('details[data-grp=omenu]')));
      await P.click('details[data-grp=ofever] > summary');
      const fever = (await P.textContent('details[data-grp=ofever]')).replace(/\s+/g, ' ');
      assert(/Infants' Tylenol · Calpol · Panadol/.test(fever), 'the brands sold where you are first: ' + fever);
      assert(/From 12 weeks, younger only if your pediatrician says\. \(UK: from 2 months\)/.test(fever) && /From 6 months\. \(UK: from 3 months and over 5 kg/.test(fever), 'the age where you are first: ' + fever);
      await P.click('details[data-grp=oherbal] > summary');
      const herbal = await P.textContent('details[data-grp=oherbal]');
      assert(/Many parents tell of good results/.test(herbal) && /better than a placebo/.test(herbal) && /belladonna/.test(herbal), herbal);
      await P.click('details[data-grp=onever] > summary');
      const never = await P.textContent('details[data-grp=onever]');
      for (const w of ['Aspirin', 'Honey before 12 months', 'benzocaine', 'Cough and cold medicines', 'Teething necklaces']) assert(never.includes(w), w);
      const text = await P.evaluate(() => JSON.stringify([Guide.MEDS_INTRO, Guide.MEDS, Guide.NEVER]));
      assert(!/\d\s*(mg|ml)\b|mg\/kg|teaspoon/i.test(text.replace(/500 ml of formula/g, '')), 'no doses anywhere: they go by weight and come from the pediatrician');
      assert.equal(await P.$$eval('details[data-grp=omenu] .medi .age', a => a.filter(x => !x.textContent.trim()).length), 0, 'every medicine says from what age');
      await P.click('details[data-grp=omenu] > summary');
    });

    await step('"Where you are" in More puts that region first: its formulas, and in the Guide its emergency number, medicine names and ages', async () => {
      await P.click('[data-tab=more]');
      assert.equal(await P.inputValue('#regionSel'), '', 'automatic at first'); assert.equal(await P.textContent('#regionSel option[value=""]'), 'Automatic: North America');
      await P.selectOption('#regionSel', 'uk'); assert.equal(await P.evaluate(() => db.meta.region), 'uk');
      await P.click('[data-tab=day]'); await P.click('[data-add=feed]'); await P.click('[name=kind][value=bottle]'); await P.click('[name=milk][value=Formula]'); await P.click('#fFormula .fcur');
      assert.deepEqual(await P.$$eval('#fFormula details.freg', d => d.slice(0, 2).map(x => [x.dataset.region, x.open])), [['uk', true], ['na', false]]);
      await P.click('#cancel');
      await P.click('[data-tab=guide]'); assert(/Call 999 for blue lips/.test(await P.textContent('.emer')));
      await P.click('details[data-grp=gblue] > summary'); assert(/Call 999 if the lips/.test(await P.textContent('details[data-grp=gblue]')));
      await P.click('details[data-grp=omenu] > summary'); await P.click('details[data-grp=ofever] > summary');
      const uk = (await P.textContent('details[data-grp=ofever]')).replace(/\s+/g, ' ');
      assert(/Calpol · Panadol · Infants' Tylenol/.test(uk) && /From 2 months\. \(US: from 12 weeks/.test(uk) && /Nurofen for Children · Infants' Motrin/.test(uk), uk);
      for (const [reg, sos] of [['eu', 'Call 112'], ['anz', 'Call 000 \\(Australia\\) or 111 \\(New Zealand\\)'], ['asia', 'Call your local emergency number']]) {
        await P.click('[data-tab=more]'); await P.selectOption('#regionSel', reg); await P.click('[data-tab=guide]');
        assert(new RegExp(sos).test(await P.textContent('.emer')), reg);
      }
      const asia = (await P.textContent('details[data-grp=ofever]')).replace(/\s+/g, ' ');
      assert(/US: from 12 weeks, younger only if your pediatrician says\. UK: from 2 months\./.test(asia) && /check the one where you live/.test(asia), 'both rules where labels differ: ' + asia);
      await P.click('[data-tab=more]'); await P.selectOption('#regionSel', ''); assert.equal(await P.evaluate(() => db.meta.region), undefined, 'back to automatic');
      await P.evaluate(() => { openGroups.delete('gblue'); openGroups.delete('omenu'); openGroups.delete('ofever'); });
      await P.click('[data-tab=guide]');
    });

    await step('parents save the pediatrician; everyone else sees the number with a Call button but cannot change it', async () => {
      await P.click('#docBtn'); await P.click('#docEdit');
      await P.fill('#dcName', 'Dr. Rivera'); await P.fill('#dcPractice', 'Oak Street Pediatrics'); await P.fill('#dcPhone', '(555) 010-2299'); await P.fill('#dcAfter', '555 010 3000'); await P.click('#dcSave');
      assert(/Dr\. Rivera/.test(await P.textContent('#docBtn')));
      await syncNow(P); await syncNow(B); await B.click('[data-tab=guide]'); await B.click('#docBtn');
      assert(/Oak Street Pediatrics/.test(await B.textContent('#sheet')));
      assert.deepEqual(await B.$$eval('#sheet a.callbtn', a => a.map(x => x.getAttribute('href'))), ['tel:5550102299', 'tel:5550103000']);
      assert.equal(await B.$('#docEdit'), null, 'no edit button for a babysitter'); await B.click('[data-close]');
      const prof = JSON.stringify(await q('select profile from babies')); assert(!/Rivera|010-2299|5550102299/.test(prof), 'not readable on the server');
    });

    await step('people add their own contact details; family can see them, a babysitter without the people permission cannot, and the server never can', async () => {
      await syncNow(D); await D.click('[data-tab=family]');
      const me = await D.evaluate(() => Auth.id); await D.waitForSelector(`[data-pview="${me}"]`); await D.click(`[data-pview="${me}"]`);
      await D.fill('#dRel', 'Dad'); await D.fill('#dPhone', '+1 555 010 4444'); await D.fill('#dWork', 'Riverside Fire Station'); await D.fill('#dWorkPhone', '555 010 5555'); await D.click('#pvSave');
      await P.click('[data-tab=family]'); await P.evaluate(() => Sync.loadPeople()); await P.evaluate(() => render());
      await P.click(`[data-pview="${me}"]`); const t = await P.textContent('#sheet');
      assert(/Riverside Fire Station/.test(t) && /\+1 555 010 4444/.test(t), t);
      assert.deepEqual(await P.$$eval('#sheet a.callbtn', a => a.map(x => x.getAttribute('href'))), ['tel:+15550104444', 'tel:5550105555']);
      assert.equal(await P.$$eval('#pvAccess', b => b.length), 1, 'a parent also gets "Change access" here'); await P.click('#pvClose');
      const seen = await B.evaluate(async () => (await Auth.rpc('list_people', { p_baby: db.meta.babyId })).filter(p => !p.is_you).map(p => p.details));
      assert(seen.every(d => d === ''), 'the server does not hand details to a babysitter without "see who else has access"');
      const dump = JSON.stringify(await q('select * from members'));
      assert(!/Riverside|4444|5555/.test(dump), 'the server only has ciphertext');
    });

    await step('details are bound to their owner: copied onto someone else\'s row they don\'t open', async () => {
      const ids = await q("select user_id, details, details_epoch from members where details <> ''"); assert.equal(ids.length, 1);
      const mum = await P.evaluate(() => Auth.id);
      await q('update members set details = $1, details_epoch = $2 where user_id = $3', [ids[0].details, ids[0].details_epoch, mum]);
      const info = await P.evaluate(async () => { await Sync.loadPeople(); return Sync.st.people.find(p => p.is_you).info; });
      assert.equal(info, null, 'a moved blob fails to decrypt, so nothing is shown');
      await q("update members set details = '' where user_id = $1", [mum]);
      const r = await D.evaluate(async () => { try { await Auth.rpc('set_my_details', { p_baby: db.meta.babyId, p_blob: 'x'.repeat(5000), p_epoch: 1 }); return 'accepted'; } catch (e) { return e.message; } });
      assert(/too large/.test(r), 'size is capped: ' + r);
    });

    await step('on a child\'s month birthday a milestone sheet appears once', async () => {
      await P.evaluate(() => { const d = new Date(); d.setMonth(d.getMonth() - 2); db.baby.kids[0].birth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; delete db.meta.ms; tab = 'day'; render(); });
      await P.waitForSelector('#msGuide'); assert(/Leo is 2 months old/.test(await P.textContent('#sheet h3')));
      assert(/Smiles when you talk/.test(await P.textContent('#sheet')));
      await P.click('#msGuide'); assert.equal(await P.evaluate(() => tab), 'guide');
      await P.evaluate(() => render()); assert.equal(await P.isVisible('#msGuide'), false, 'not shown again');
      assert(/Leo is 2 months old/.test(await P.textContent('.nowcard')), 'the Guide shows this month for the open child');
    });

    await step('Appearance: match phone, light, dark, or sunrise & sunset; the choice applies at once and is kept from the first paint', async () => {
      await P.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' }); await P.click('[data-tab=more]');
      assert.deepEqual(await P.$$eval('[name=themeMode]', r => r.map(x => x.value)), ['system', 'light', 'dark', 'sun']);
      assert.equal(await P.evaluate(() => Theme.mode), 'system');
      const mode = () => P.evaluate(() => document.documentElement.dataset.mode), until = m => P.waitForFunction(x => document.documentElement.dataset.mode === x, m, { timeout: 6000 });
      await P.emulateMedia({ colorScheme: 'dark' }); await until('dark');
      await P.emulateMedia({ colorScheme: 'light' }); await until('light');
      await P.click('[name=themeMode][value=dark]'); await until('dark');
      assert.equal(await P.evaluate(() => localStorage.getItem('ll.theme')), 'dark');
      assert.equal(await P.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(29, 27, 25)', 'the page really turns dark');
      await P.emulateMedia({ colorScheme: 'light' }); assert.equal(await mode(), 'dark', 'a fixed choice ignores the phone');
      await P.reload(); assert.equal(await mode(), 'dark', 'dark from the very first paint after a restart'); await P.waitForSelector('#tabs');
      await P.click('[data-tab=more]'); await P.click('[name=themeMode][value=sun]'); await P.waitForTimeout(3000);
      assert(/light from .* dark from/.test(await P.textContent('.card:has([name=themeMode]) .note')), 'shows today\'s times');
      await P.click('[name=themeMode][value=light]'); await until('light');
    });

    await step('switching plays a sunset into dark and a sunrise into light, changing the theme while the sky covers the screen; none when motion is reduced', async () => {
      await P.evaluate(() => Theme.set('dark'));
      assert.equal(await P.evaluate(() => `${document.querySelector('.sky').className}|${document.documentElement.dataset.mode}`), 'sky sunset|light', 'a sunset begins, still light underneath');
      await P.waitForFunction(() => document.documentElement.dataset.mode === 'dark', null, { timeout: 3000 });
      assert(await P.$('.sky'), 'the sky still covers the screen as the theme changes');
      await P.waitForFunction(() => !document.querySelector('.sky'), null, { timeout: 4000 });
      await P.evaluate(() => Theme.set('light')); assert.equal(await P.evaluate(() => document.querySelector('.sky').className), 'sky sunrise');
      await P.waitForFunction(() => !document.querySelector('.sky') && document.documentElement.dataset.mode === 'light', null, { timeout: 5000 });
      await P.emulateMedia({ reducedMotion: 'reduce' });
      await P.evaluate(() => Theme.set('dark')); assert.equal(await P.evaluate(() => `${!!document.querySelector('.sky')}|${document.documentElement.dataset.mode}`), 'false|dark', 'reduced motion: straight to dark');
      await P.evaluate(() => Theme.set('light')); await P.emulateMedia({ reducedMotion: 'no-preference' });
      assert.equal(await P.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(246, 242, 236)');
      // changing your mind while the sky still covers the screen: the last choice wins, and the sky that was cut short can't switch it back
      const settled = () => P.waitForTimeout(3000).then(() => P.evaluate(() => `${!!document.querySelector('.sky')}|${document.documentElement.dataset.mode}`));
      await P.evaluate(() => { Theme.set('dark'); Theme.set('light'); }); assert.equal(await settled(), 'false|light', 'Dark then straight back to Light stays light');
      await P.evaluate(() => Theme.set('dark')); await P.waitForTimeout(1500); await P.evaluate(() => Theme.set('light')); assert.equal(await settled(), 'false|light', 'and back to Light just after it turned dark');
      await P.evaluate(() => Theme.set('system')); await P.emulateMedia({ colorScheme: 'dark' }); await P.waitForSelector('.sky.sunset');   // the phone turns dark: a sunset starts
      await P.emulateMedia({ colorScheme: 'light' }); await P.evaluate(() => Theme.apply(false));   // and is light again by the time the app is looked at
      assert.equal(await settled(), 'false|light', 'a jump straight back ends the sunset, which then can\'t turn the screen dark');
      await P.evaluate(() => Theme.set('light'));
    });

    await step('sunrise and sunset are worked out from the time zone (no location), including the polar winter and summer', async () => {
      const r = await P.evaluate(() => {
        const iso = t => new Date(t).toISOString(), at = s => new Date(s).getTime();
        const ny = Theme.sunTimes(at('2026-06-21T16:00:00Z'), 40.71, -74.01), ld = Theme.sunTimes(at('2026-12-21T12:00:00Z'), 51.51, -0.13), sy = Theme.sunTimes(at('2026-12-21T02:00:00Z'), -33.87, 151.21);
        const here = Theme.place(), s = Theme.sunTimes(Date.now(), here.lat, here.lon);
        return { ny: [iso(ny.rise), iso(ny.set)], ld: [iso(ld.rise), iso(ld.set)], sy: [iso(sy.rise), iso(sy.set)],
          tromso: [Theme.sunTimes(at('2026-12-21T12:00:00Z'), 69.65, 18.96).polar, Theme.sunTimes(at('2026-06-21T12:00:00Z'), 69.65, 18.96).polar],
          london: Theme.place('Europe/London'), unknown: Theme.place('Mars/Olympus_Mons'), south: Theme.place('Australia/Lord_Howe'),
          auto: s.polar ? 'polar' : [Theme.resolve('sun', s.rise - 6e4), Theme.resolve('sun', s.rise + 6e4), Theme.resolve('sun', s.set - 6e4), Theme.resolve('sun', s.set + 6e4)].join() };
      });
      const near = (got, want, label) => assert(Math.abs(new Date(got) - new Date(want)) <= 6 * 6e4, `${label}: ${got} vs about ${want}`);
      near(r.ny[0], '2026-06-21T09:25:00Z', 'New York sunrise, 21 June (5:25 AM EDT)'); near(r.ny[1], '2026-06-22T00:31:00Z', 'New York sunset (8:31 PM EDT)');
      near(r.ld[0], '2026-12-21T08:04:00Z', 'London sunrise, 21 December'); near(r.ld[1], '2026-12-21T15:53:00Z', 'London sunset');
      near(r.sy[0], '2026-12-20T18:41:00Z', 'Sydney sunrise, 21 December (5:41 AM AEDT)'); near(r.sy[1], '2026-12-21T09:05:00Z', 'Sydney sunset (8:05 PM AEDT)');
      assert.deepEqual(r.tromso, ['night', 'day'], 'Tromsø: polar night in December, midnight sun in June');
      assert.deepEqual(r.london, { lat: 51.51, lon: -0.13, zone: 'London' });
      assert.equal(r.unknown.lat, 40); assert.equal(r.south.lat, -33, 'an unknown southern zone guesses the southern hemisphere');
      assert.equal(r.auto, 'dark,light,light,dark', 'dark until sunrise, light until sunset, then dark');
    });

    // ---------- travel mode ----------
    const iso = t => new Date(t).toLocaleDateString('en-CA');
    await P.emulateMedia({ reducedMotion: 'reduce' }); await D.emulateMedia({ reducedMotion: 'reduce' });   // (the journey between home and away has its own step)
    const [leo, mia] = await P.evaluate(() => { tab = 'day'; viewDay = startOfDay(Date.now()); db.meta.clock = '24'; quad = null; setKid(kids()[0].id); render(); return kids().map(k => k.id); });
    await step('a "Travelling?" button at the bottom of today asks how (car, plane, train, ship) and when; Start turns the Day tab into a travel page with its own painting and colours', async () => {
      assert(/Travelling\?/.test(await P.textContent('.tripbtn')));
      assert.equal(await P.evaluate(() => document.querySelector('#view').lastElementChild.classList.contains('tripbtn')), true, 'at the bottom of the page');
      await P.click('[data-tripnew]');
      assert.deepEqual(await P.$$eval('[name=means]', r => r.map(x => x.value)), ['car', 'plane', 'train', 'ship']);
      const today = await P.evaluate(() => startOfDay(Date.now()));
      assert.equal(await P.inputValue('#tripFrom'), iso(today), 'leaving today');
      await P.click('[data-len="6"]'); assert.equal(await P.inputValue('#tripTo'), iso(today + 6.5 * 864e5), 'a week');
      await P.click('[name=means][value=plane]'); await P.click('#tripSave');
      const r = await P.evaluate(() => ({ card: document.querySelector('.tripcard').textContent, painting: document.querySelector('svg.clock').dataset.painting, travel: document.body.classList.contains('travel'),
        root: getComputedStyle(document.documentElement).getPropertyValue('--g-feed').trim(), clock: document.querySelector('.clockwrap').style.getPropertyValue('--g-feed'),
        quick: [...document.querySelectorAll('#view [data-qadd]')].map(b => b.dataset.qadd), usual: document.querySelectorAll('#view .quick:not(.tq) [data-add]').length, button: !!document.querySelector('.tripbtn'),
        trips: db.events.filter(e => e.type === 'trip').map(e => [e.data.means, Math.round((e.end - e.ts) / 864e5), e.child || null]) }));
      assert(/Travelling by plane/.test(r.card) && /Day 1 of 7/.test(r.card), r.card);
      assert.equal(r.painting, 'plane', 'a painting to match');
      assert.deepEqual([r.travel, r.root, r.clock], [true, '#8b5f18', '#8b5f18'], 'the travel colours, on the page and on the clock');
      assert.deepEqual(r.quick, ['feed', 'diaper', 'sleep', 'vomit']); assert.equal(r.usual, 0, 'the big travel buttons replace the usual ones'); assert.equal(r.button, false);
      assert.deepEqual(r.trips, [['plane', 7, null]], 'one trip for the whole family');
      await P.click('#helpBtn'); assert.equal(await P.textContent('#tourT'), 'Your trip', 'the travel page has its own tour'); await P.keyboard.press('Escape');
    });

    await step('logging on the move is a tap or two: a diaper saves on the tap, a rough time is kept as an estimate (dashed on the clock, ~ in the list), a bottle takes the usual formula, and "All" ticks every child', async () => {
      await P.click('[data-qadd=diaper]'); await P.click('[name=qago][value="15"]'); await P.click('[name=qdia][value=pee]');
      await P.waitForSelector('#sheet', { state: 'hidden' });
      const d = await P.evaluate(() => { const e = db.events.filter(x => x.type === 'diaper').sort((a, b) => b.updated - a.updated)[0];
        return { data: e.data, ago: Math.round((Date.now() - e.ts) / 60000), child: e.child, dashed: document.querySelector(`.ray[data-edit="${e.id}"]`).classList.contains('approx'), t: document.querySelector(`.ev[data-edit="${e.id}"] .t`).textContent }; });
      assert.deepEqual(d.data, { pee: true, poo: false, rash: false, approx: true }); assert(d.ago >= 15 && d.ago <= 16, d.ago); assert.equal(d.child, leo);
      assert(d.dashed, 'drawn dashed on the clock'); assert(/^~/.test(d.t), d.t);
      await P.click('[data-qadd=feed]'); await P.click('[name=qkind][value=bottle]'); await P.click('[name=qml][value="120"]'); await P.click('[name=qmilk][value=Formula]'); await P.click('#qSave');
      const f = await P.evaluate(() => { const e = db.events.filter(x => x.type === 'feed').sort((a, b) => b.updated - a.updated)[0]; return { data: e.data, usual: usualFormula(kidById(e.child)) }; });
      assert(f.usual, 'Leo has a usual formula by now');
      assert.deepEqual(f.data, { kind: 'bottle', ml: 120, milk: 'Formula', formula: f.usual }, '"just now" is not an estimate');
      await P.click('[data-kid=all]'); await P.click('[data-qadd=vomit]');
      assert.deepEqual(await P.$$eval('[name=qkid]:checked', c => c.map(x => x.value)), [leo, mia]);
      await P.click('[name=qvom][value=Spit-up]'); await P.waitForSelector('#sheet', { state: 'hidden' });
      assert.equal(await P.evaluate(() => db.events.filter(e => e.type === 'vomit' && Math.abs(Date.now() - e.ts) < 60000).length), 2, 'one for each child');
      await P.click(`[data-kid="${leo}"]`);
      // changing an estimated entry keeps it an estimate unless its time is changed
      const id = await P.evaluate(() => db.events.filter(x => x.type === 'diaper' && x.data.approx)[0].id);
      await P.evaluate(i => openSheet(null, db.events.find(e => e.id === i)), id); await P.fill('#note', 'in the airport'); await P.click('#save');
      assert.equal(await P.evaluate(i => db.events.find(e => e.id === i).data.approx, id), true);
    });

    await step('the journey: "Taking off" and "Landed" light up the clock\'s outer track; on a car trip, two hours on the road asks for a break', async () => {
      await P.click('[data-leg]');
      assert(/In the air since/.test(await P.textContent('.legrow')));
      assert.equal(await P.$$eval('svg.clock path.leg', p => p.length), 1, 'the flight shows on the track');
      await P.click('[data-leg]'); assert(/Not flying right now/.test(await P.textContent('.legrow')));
      assert.deepEqual(await P.evaluate(() => db.events.filter(e => e.type === 'leg').map(e => [e.data.means, Number.isFinite(e.end)])), [['plane', true]]);
      await P.click('[data-tripedit]'); await P.click('[name=means][value=car]'); await P.click('#tripSave');
      assert.equal(await P.evaluate(() => document.querySelector('svg.clock').dataset.painting), 'car');
      await P.click('[data-leg]'); await P.evaluate(() => { Travel.moving(db.events).ts = Date.now() - 125 * 60000; render(); });
      assert(await P.$('.legrow.warn'), 'two hours in'); assert(/Time for a break/.test(await P.textContent('.tripcard')));
      await P.click('[data-leg]'); assert(/Break time/.test(await P.textContent('#toast')));
    });

    await step('the trip and the journey are shared, end-to-end encrypted: the other phones get the same travel page', async () => {
      await syncNow(P); await syncNow(D);
      await D.evaluate(() => { tab = 'day'; viewDay = startOfDay(Date.now()); render(); });
      assert(/Travelling by car/.test(await D.textContent('.tripcard')));
      assert.equal(await D.evaluate(() => document.querySelector('svg.clock').dataset.painting), 'car');
      assert.equal(await D.evaluate(() => db.events.filter(e => e.type === 'leg').length), 2);
      const blobs = (await q('select blob from events')).map(r => r.blob).join('');
      assert(!blobs.includes('"means"') && !blobs.includes('"trip"') && !blobs.includes('"approx"'), 'the server only has ciphertext');
    });

    await step('"We\'re home" ends the trip now; past travel days keep their look, and the month view outlines them in their own colours', async () => {
      await P.click('[data-triphome]');
      const r = await P.evaluate(() => ({ card: !!document.querySelector('.tripcard'), travel: document.body.classList.contains('travel'), button: !!document.querySelector('.tripbtn'),
        ended: Date.now() - db.events.find(e => e.type === 'trip').end < 60000, feed: getComputedStyle(document.documentElement).getPropertyValue('--g-feed').trim() }));
      assert.deepEqual(r, { card: false, travel: false, button: true, ended: true, feed: '#c9761f' });
      await P.evaluate(() => { const t = startOfDay(Date.now()); db.events.push({ id: 'oldtrip', type: 'trip', ts: addDays(t, -9), end: addDays(t, -6), data: { means: 'train' }, note: '', updated: stamp(), by: Auth.id }); viewDay = addDays(t, -8); render(); });
      const past = await P.textContent('.tripcard');
      assert(/Travelling by train/.test(past) && /Day 2 of 3 · until/.test(past), past);
      assert.equal(await P.$('[data-triphome]'), null, 'no "We\'re home" on a past trip'); assert.equal(await P.$('.legrow'), null);
      assert.equal(await P.$('#view [data-qadd]'), null, 'adding to a past day uses the usual sheets, which default to that day');
      await P.click('[data-tab=month]');
      const m = await P.evaluate(() => ({ day: document.querySelector(`.cal button[data-day="${viewDay}"]`).classList.contains('tripday'), key: !!document.querySelector('.legend .tripkey'),
        note: document.querySelector('.tripnote').textContent, feed: document.querySelector('.travelday').style.getPropertyValue('--g-feed') }));
      assert.deepEqual(m, { day: true, key: true, note: ' Travelling by train', feed: '#8b5f18' });
      await P.evaluate(() => { removeEvent(db.events.find(e => e.id === 'oldtrip')); viewDay = startOfDay(Date.now()); save(); });
      await P.click('[data-tab=day]');
    });

    await step('a trip coming up waits at the bottom of today, and can be changed or deleted', async () => {
      await P.click('[data-tripnew]'); await P.click('[name=means][value=ship]');
      const start = await P.evaluate(() => addDays(startOfDay(Date.now()), 3));
      await P.fill('#tripFrom', iso(start)); await P.click('[data-len="2"]'); await P.click('#tripSave');
      assert(/switches on by itself/.test(await P.textContent('#toast')));
      assert.equal(await P.$('.tripcard'), null, 'not travelling yet');
      assert(/Trip coming up by ship/.test(await P.textContent('.tripbtn')));
      await P.click('.tripbtn'); await P.click('#tripDel');
      assert(/Travelling\?/.test(await P.textContent('.tripbtn')));
      assert.equal(await P.evaluate(() => db.events.filter(e => e.type === 'trip').length), 1, 'only the trip that happened');
    });

    await step('the calendar always has a way to plan a trip ahead, from the day picked; the trip shows on its days, and overlapping trips are refused', async () => {
      await P.click('[data-tab=month]');
      await P.evaluate(() => { viewDay = addDays(startOfDay(Date.now()), -20); calMonth = new Date(viewDay); render(); });
      assert(/Plan a trip/.test(await P.textContent('#view .tripbtn')) && /Leaving today/.test(await P.textContent('#view .tripbtn')), 'a day gone by: leaving today');
      const day = await P.evaluate(() => addDays(startOfDay(Date.now()), 10));
      await P.evaluate(d => { viewDay = d; calMonth = new Date(d); render(); }, day);
      assert((await P.textContent('#view .tripbtn')).includes(await P.evaluate(d => fmtShort(d), day)), 'leaving on the day picked');
      await P.click('#view [data-tripplan]');
      assert.equal(await P.inputValue('#tripFrom'), iso(day)); assert.equal(await P.textContent('#tripSave'), 'Plan it');
      await P.click('[name=means][value=train]'); await P.click('#tripSave');
      assert(/switches on by itself/.test(await P.textContent('#toast')));
      const m = await P.evaluate(d => ({ tab, picked: viewDay === d, outlined: !!document.querySelector(`.cal button.tripday[data-day="${d}"]`), button: document.querySelector('#view .tripbtn').textContent }), day);
      assert.deepEqual([m.tab, m.picked, m.outlined], ['month', true, true], 'still on the calendar, with the trip\'s days outlined'); assert(/Trip by train/.test(m.button), m.button);
      // a family member (who can add entries, but never change other people's) can plan a trip, but isn't offered to change this one
      await syncNow(P); await syncNow(D);
      const fam = await D.evaluate(d => { tab = 'month'; const b = t => { viewDay = t; calMonth = new Date(t); render(); const e = document.querySelector('#view .tripbtn'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
        const r = [b(d), b(addDays(d, -5))]; tab = 'day'; viewDay = startOfDay(Date.now()); render(); return r; }, day);
      assert.equal(fam[0], '', 'nothing to change on the trip\'s days'); assert(/Plan a trip/.test(fam[1]), fam[1]);
      await P.click('[data-tab=day]'); assert(/Travelling by train/.test(await P.textContent('.tripcard')), 'the Day tab shows the day picked: the trip\'s first day');
      await P.evaluate(() => { viewDay = startOfDay(Date.now()); render(); });
      assert.equal(await P.$('.tripcard'), null, 'today: not travelling yet'); assert(/Trip coming up by train/.test(await P.textContent('.tripbtn')));
      await P.click('[data-tab=month]'); await P.evaluate(d => { viewDay = addDays(d, -1); render(); }, day);
      await P.click('#view [data-tripplan]'); await P.click('#tripSave');
      assert(/overlaps the trip by train/.test(await P.textContent('#toast')), 'one trip at a time'); await P.click('#sheet [data-close]');
      await P.evaluate(() => { db.events.filter(e => e.type === 'trip' && e.ts > Date.now()).forEach(removeEvent); save(); viewDay = startOfDay(Date.now()); render(); });
      await syncNow(P); await syncNow(D);
      await P.click('[data-tab=day]');
    });

    await step('leaving and coming home: a little journey crosses the screen and the page changes under it; with reduced motion it switches straight over', async () => {
      await P.emulateMedia({ reducedMotion: 'no-preference' });
      await P.click('[data-tripnew]'); await P.click('[name=means][value=ship]'); await P.click('#tripSave');
      const s1 = await P.evaluate(() => ({ away: !!document.querySelector('.voyage.away'), msg: (document.querySelector('.voyage .vmsg') || {}).textContent, card: !!document.querySelector('.tripcard') }));
      assert.deepEqual(s1, { away: true, msg: 'Travelling by shipHave a good trip!', card: false }, 'the journey starts and the page waits under it');
      await P.waitForSelector('.tripcard', { timeout: 3000 });
      assert.equal(await P.evaluate(() => getComputedStyle(document.querySelector('.voyage')).opacity), '1', 'fully covered when the page changes');
      await P.waitForSelector('.voyage', { state: 'detached', timeout: 4000 });
      await P.click('[data-triphome]');
      assert.equal(await P.textContent('.voyage.home .vmsg'), 'Welcome homeBack to the usual page');
      await P.waitForSelector('.voyage', { state: 'detached', timeout: 4000 }); assert.equal(await P.$('.tripcard'), null);
      // a trip moved to a later date, or deleted, is no homecoming: the page just changes back
      const tomorrow = iso(await P.evaluate(() => addDays(startOfDay(Date.now()), 1)));
      for (const how of ['moved', 'deleted']) {
        await P.click('[data-tripnew]'); await P.click('#tripSave'); await P.waitForSelector('.voyage', { state: 'detached', timeout: 4000 });
        await P.click('[data-tripedit]');
        if (how === 'moved') { await P.fill('#tripFrom', tomorrow); await P.click('[data-len="2"]'); await P.click('#tripSave'); } else await P.click('#tripDel');
        assert.deepEqual(await P.evaluate(() => [!!document.querySelector('.voyage'), !!document.querySelector('.tripcard')]), [false, false], `${how}: no journey home`);
        if (how === 'moved') { await P.click('.tripbtn'); await P.click('#tripDel'); }
      }
      await P.emulateMedia({ reducedMotion: 'reduce' });
      await P.click('[data-tripnew]'); await P.click('#tripSave');
      assert.deepEqual(await P.evaluate(() => [!!document.querySelector('.voyage'), !!document.querySelector('.tripcard')]), [false, true], 'reduced motion: straight to the travel page');
      await P.click('[data-triphome]'); assert.equal(await P.$('.tripcard'), null);
    });

    // ---------- the tutorial ----------
    await step('the tutorial: on a new phone the home screen\'s tour starts by itself, a box glides from button to button saying why, ? starts each screen\'s own tour, and it only starts by itself once', async () => {
      await P.evaluate(() => { const d = new Date(); d.setMonth(d.getMonth() - 2); kids()[0].birth = d.toLocaleDateString('en-CA'); Sync.pushBaby(); }); await syncNow(P);   // a month birthday is due too
      const G = await H.addMember(P, 'gran@x.com', 'family', {}, { name: 'Gran', tour: true });
      await G.waitForSelector('.tour-tip', { timeout: 5000 });
      assert.equal(await G.isVisible('#msGuide'), false, 'the milestone sheet waits for the tour');
      const at = () => G.evaluate(() => { const b = document.querySelector('.tour-box').getBoundingClientRect(); return { n: document.querySelector('.tt-n').textContent, t: document.querySelector('#tourT').textContent, box: [b.left, b.top, b.width, b.height].map(Math.round) }; });
      await G.waitForTimeout(600);
      const s1 = await at(); assert.equal(s1.t, 'A page for each child'); assert(/^1 of \d+$/.test(s1.n), s1.n);
      const kb = await G.evaluate(() => { const r = document.querySelector('#kidBar').getBoundingClientRect(); return [r.left - 6, r.top - 6].map(Math.round); });
      assert(Math.abs(s1.box[0] - Math.max(4, kb[0])) <= 2 && Math.abs(s1.box[1] - Math.max(4, kb[1])) <= 2, `the box is around the children's tabs: ${s1.box} vs ${kb}`);
      assert(/own colour/.test(await G.textContent('#tourW')), 'and says why');
      await G.click('.tt-next'); await G.waitForTimeout(600); const s2 = await at();
      assert.equal(s2.t, 'Log it in one tap'); assert.notDeepEqual(s2.box, s1.box, 'the box moved to the next button');
      await G.click('.tt-back'); assert.equal((await at()).t, 'A page for each child');
      const n = +s1.n.split(' of ')[1]; for (let i = 0; i < n; i++) await G.click('.tt-next');
      assert.equal(await G.$('.tour'), null, '"Done" ends it');
      assert.equal(await G.evaluate(() => localStorage.getItem('ll.tours')), '{"day":1}');
      await G.waitForSelector('#msGuide', { timeout: 3000 }); await G.click('#sheet [data-close]');   // and then it shows
      for (const [t, first] of [['month', 'The month'], ['stats', 'How far back'], ['guide', 'Your pediatrician'], ['family', 'Your shared log'], ['more', 'Your children']]) {
        await G.click(`[data-tab=${t}]`); await G.waitForTimeout(700); assert.equal(await G.$('.tour'), null, `${t}: not by itself`);
        await G.click('#helpBtn'); await G.waitForSelector('.tour-tip'); assert.equal((await at()).t, first, t);
        await G.keyboard.press('Escape'); assert.equal(await G.$('.tour'), null, 'Escape closes it');
      }
      await G.reload(); await G.waitForSelector('#tabs'); await G.waitForTimeout(1200); assert.equal(await G.$('.tour'), null, 'not again after a restart');
      await G.emulateMedia({ reducedMotion: 'reduce' }); await G.click('[data-tab=day]'); await G.click('#helpBtn');
      assert.equal(await G.evaluate(() => getComputedStyle(document.querySelector('.tour-box')).transitionDuration), '0s', 'no gliding with reduced motion');
      await G.keyboard.press('Escape');
    });

    const pageErrs = H.pages.flatMap(p => p.errs.concat(p.csp));
    if (pageErrs.length) { failed++; console.log('✗ page errors:', pageErrs); } else { ok++; console.log('✓ no page errors or content-security-policy violations on any phone'); }
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} feature checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
