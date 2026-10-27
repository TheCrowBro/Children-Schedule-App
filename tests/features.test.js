// The day clock, twirl-down groups, month day counts, stats charts, formula, the Guide (pediatrician, milestones) and people's contact
// details – including that the new private data stays end-to-end encrypted.   node tests/features.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
/* global writes24, openDoctor, applyInsets, openPlan, Cal, dkey, LLPlugins, startOfDay, openQuick, reportBlocks, toLocalInput, napTime, saveProfile, Notify */
/* global viewDay:writable */
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
      const pos = await P.evaluate(id => { const c = document.querySelector(`.ray[data-info="${id}"] .dot`); return [+c.getAttribute('cx'), +c.getAttribute('cy')]; }, 'fdiaper' + at(13));
      assert(pos[0] < cx && Math.abs(pos[0] - cx) < 25 && pos[1] > cy + 50, '1 PM is just past the bottom of a 24-hour dial (noon at the bottom): ' + pos);
      const top = await P.evaluate(id => +document.querySelector(`.ray[data-info="${id}"] .dot`).getAttribute('cy'), 'ffeed' + at(1));
      assert(top < cy - 50, '1 AM is near the top');
      const colours = await P.evaluate(() => [...document.querySelectorAll('.clock .ray .dot')].map(d => getComputedStyle(d).fill));
      assert.equal(new Set(colours).size, 4, 'feed, diaper, vomit and sleep each in their own colour: ' + colours);
      assert.equal(await P.$$eval('.clock .sarc', a => a.length), 1, 'the sleep shows as an arc for how long it lasted');
      assert(/Diapers\s*2/.test(await P.textContent('.clegend')), 'the legend counts each group');
    });

    await step('tapping a dot shows that entry without a way to change it (that is in the list below); it also works from the keyboard', async () => {
      await P.click(`.ray[data-info="fvomit${at(19)}"]`); await P.waitForSelector('#infoList');
      const r = await P.evaluate(() => ({ h: $('#sheet h3').textContent, body: $('#sheet').textContent, fields: $('#sheet').querySelectorAll('input, textarea, select, #save, #del').length }));
      assert(/Vomit/.test(r.h) && /Spit-up/.test(r.body) && /7:00 PM/.test(r.body), JSON.stringify(r));
      assert.equal(r.fields, 0, 'nothing to change in it'); assert(/tap it in the list below the clock/.test(r.body));
      // "Show in the list" opens the entry's group and lights the row up; tapping the row is what opens it for changes
      await P.evaluate(() => document.querySelectorAll('details.grp').forEach(d => { d.open = false; }));
      await P.click('#infoList'); await P.waitForSelector('#sheet', { state: 'hidden' });
      const row = `.ev[data-edit="fvomit${at(19)}"]`;
      assert(await P.isVisible(row), 'its group is opened'); assert(await P.$eval(row, x => x.classList.contains('flash')), 'and the row lit up');
      await P.click(row); await P.waitForSelector('#save'); assert(/Edit vomit/.test(await P.textContent('#sheet h3'))); await P.click('#cancel');
      assert.equal(await P.$eval('.clock .hands', g => getComputedStyle(g).pointerEvents), 'none', 'the hands never take a tap meant for an entry at the time now');
      await P.focus(`.ray[data-info="ffeed${at(1)}"]`); await P.keyboard.press('Enter'); await P.waitForSelector('#infoList');
      assert(/Feed/.test(await P.textContent('#sheet h3'))); assert.equal(await P.$$eval('#sheet #save', x => x.length), 0); await P.click('#sheet [data-close]');
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
      assert.deepEqual(await P.$$eval('.clock .ray', r => r.map(x => x.dataset.info).sort()), ['fdiaper' + at(7.5), 'ffeed' + at(1), 'fsleep' + at(2)].sort(), 'AM: midnight to noon');
      assert.equal(await P.textContent('.clock .ampm'), 'a.m.');
      await P.click('[data-half="1"]');
      assert.deepEqual(await P.$$eval('.clock .ray', r => r.map(x => x.dataset.info).sort()), ['fdiaper' + at(13), 'fvomit' + at(19)].sort(), 'PM: noon to midnight');
      const [cx, cy] = await P.evaluate(() => { const c = document.querySelector('svg.clock'); return [+c.dataset.cx, +c.dataset.cy]; });
      const pos = await P.evaluate(id => { const c = document.querySelector(`.ray[data-info="${id}"] .dot`); return [+c.getAttribute('cx'), +c.getAttribute('cy')]; }, 'fdiaper' + at(13));
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

    await step('the numbers on the clock: Roman by default, or easy-to-read upright numbers (24-hour ones where times are written that way), kept on the phone', async () => {
      const nums = () => P.$$eval('.clock text.num', t => t.map(x => [x.textContent, !!x.getAttribute('transform'), x.classList.contains('plain')]));
      assert.deepEqual((await nums()).map(x => x[0]), ['II', 'IV', 'VI', 'VIII', 'X', 'II', 'IV', 'VI', 'VIII', 'X']);
      assert.deepEqual(await P.$$eval('[data-nums]', b => b.map(x => [x.textContent, x.getAttribute('aria-label'), x.getAttribute('aria-pressed')])), [['XII', 'Roman numerals', 'true'], ['123', 'Easy-to-read numbers', 'false']]);
      await P.click('[data-nums="plain"]');
      const h24 = await P.evaluate(() => writes24()), plain = await nums();
      assert.deepEqual(plain.map(x => x[0]), h24 ? ['2', '4', '6', '8', '10', '14', '16', '18', '20', '22'] : ['2', '4', '6', '8', '10', '2', '4', '6', '8', '10']);
      assert(plain.every(x => !x[1] && x[2]), 'upright, in the plain style');
      await P.evaluate(() => { window.realLocale = I18n.locale; I18n.locale = () => 'en-GB'; render(); });   // where times are written 13:00, the afternoon has its own numbers
      assert.deepEqual((await nums()).map(x => x[0]), ['2', '4', '6', '8', '10', '14', '16', '18', '20', '22']);
      await P.evaluate(() => { I18n.locale = window.realLocale; render(); });
      await P.click('[data-face="12"]'); assert.deepEqual((await nums()).map(x => x[0]), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], 'the 12-hour face too');
      await P.click('[data-face="24"]');
      assert.equal(await P.evaluate(async () => { await Store.whenSaved(); return (await Store.peek()).meta.nums; }), 'plain', 'kept on the phone');
      await P.reload(); await P.waitForSelector('svg.clock'); assert((await nums()).every(x => x[2]), 'still plain after a restart');
      await P.click('[data-nums="roman"]'); assert.equal((await nums())[0][0], 'II');
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
      await P.evaluate(() => document.querySelectorAll('.scard details.chx').forEach(d => { d.open = true; }));   // (each chart is a twirl-down of its own)
      const titles = await P.$$eval('.scard:not(.hw)', c => c.map(x => [x.querySelector('b').textContent.trim(), x.querySelectorAll('svg.chart').length]));
      assert.deepEqual(titles.map(t => t[0]), ['Feeding', 'Diapers', 'Sleep', 'Vomit', 'Play', 'Health & meds']);
      assert(titles.every(t => t[1] >= 1), 'a chart in each: ' + JSON.stringify(titles));
      // the diaper chart: today's pee bar is twice the poo bar, and the axis top is a round number at or above the largest value
      const r = await P.evaluate(() => { const c = [...document.querySelectorAll('.scard:not(.hw)')][1], bars = c.querySelectorAll('svg.chart .bar'), last = bars[bars.length - 1].querySelectorAll('path'); const h = p => p.getBBox().height; return { pee: h(last[0]), poo: h(last[1]), top: c.querySelector('.ax:nth-of-type(3)') && [...c.querySelectorAll('svg.chart text.ax')].map(t => t.textContent) }; });
      assert(Math.abs(r.pee / r.poo - 2) < 0.15, `pee ${r.pee} vs poo ${r.poo}`);
      assert(r.top.includes('2'), 'axis labels include the top value: ' + r.top);
      const row = await P.evaluate(() => [...document.querySelectorAll('.scard:not(.hw)')][1].querySelector('.tw tbody tr').textContent);
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
      assert.deepEqual(r.map, ['uk', 'eu', 'anz', 'anz', 'br', 'latam', 'asia', 'mea', 'mea', 'na', 'na', 'na']);
      assert.equal(r.first, 'UK & Ireland'); assert.equal(r.here, 'na', 'this test phone is on UTC, which counts as North America');
      await P.click('[data-tab=day]'); await P.click('[data-add=feed]'); await P.click('[name=kind][value=bottle]'); await P.click('[name=milk][value=Formula]');
      assert.equal(await P.isVisible('#fFormula .flist'), false, 'folded away until tapped');
      await P.click('#fFormula .fcur');
      const regs = await P.$$eval('#fFormula details.freg', d => d.map(x => [x.dataset.region, x.open]));
      assert.deepEqual(regs.map(x => x[0]), ['na', 'latam', 'br', 'uk', 'eu', 'anz', 'asia', 'mea'], 'every region, where you are first');
      assert.deepEqual(regs.map(x => x[1]), [true, false, false, false, false, false, false, false], 'yours open, the rest folded');
      assert(/Where you are/.test(await P.textContent('#fFormula details.freg[data-region=na] > summary')));
      assert.equal(await P.isVisible('#fFormula details.freg[data-region=eu] [data-fv="HiPP Organic PRE"]'), false, 'a folded region hides its formulas');
      await P.click('#fFormula details.freg[data-region=eu] > summary'); await P.click('#fFormula details.freg[data-region=eu] [data-fv="HiPP Organic PRE"]');
      assert.equal(await P.inputValue('#formulaSel'), 'HiPP Organic PRE'); assert.equal(await P.textContent('#fFormula .fv'), 'HiPP Organic PRE');
      assert.equal(await P.isVisible('#fFormula .flist'), false, 'choosing one folds the list away');
      for (const [reg, f] of [['na', 'Enfamil NeuroPro'], ['uk', 'Kendamil Classic First Infant Milk'], ['anz', 'a2 Platinum Premium'], ['asia', 'Meiji Hohoemi'], ['latam', 'NAN Optipro'], ['br', 'NAN Comfor 1'], ['mea', 'Bebelac']]) assert(await P.$(`#fFormula details.freg[data-region=${reg}] [data-fv="${f}"]`), f);
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
      assert.equal(await P.$$eval('details.gd[data-grp^=g]:not([data-grp=gsolids])', d => d.length), 18);
      assert.equal(await P.$$eval('details.gd[data-grp=gsolids]', d => d.length), 1, 'and starting solid foods, under Food');
      await P.click('details[data-grp=gfever] > summary');
      assert(/100\.4°F \(38°C\)/.test(await P.textContent('details[data-grp=gfever]')));
      assert.deepEqual(await P.$$eval('details.gd[data-grp^=m] b', b => b.map(x => x.textContent)), ['1 month', '2 months', '3 months', '4 months', '5 months', '6 months', '7 months', '8 months', '9 months', '10 months', '11 months', '12 months', '15 months', '18 months', '2 years', '30 months', '3 years', '4 years', '5 years']);
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
      // Brazil is a region of its own: its time zones, its formulas, SAMU as the emergency number, school at 6 and a jacaranda
      assert.deepEqual(await P.evaluate(() => [Formulas.regionFor('America/Sao_Paulo'), Formulas.regionFor('America/Manaus'), Formulas.regionFor('America/Argentina/Buenos_Aires'), __(Guide.sos('br')), FamilyTree.speciesFor('br', 'pt'), Stages.schoolAge('br'), __(Formulas.name('br'))]),
        ['br', 'br', 'latam', '192 (SAMU)', 'jacaranda', 6, 'Brazil']);
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
      await P.fill('#dcName', 'Dr. Rivera'); await P.fill('#dcPractice', 'Oak Street Pediatrics'); await P.fill('#dcPhone', '(555) 010-2299'); await P.fill('#dcNurse', '555 010 4000'); await P.fill('#dcAfter', '555 010 3000'); await P.fill('#dcHosp', "St Mary's Children's"); await P.fill('#dcHospPhone', '555 010 5000'); await P.click('#dcSave');
      assert(/Not an emergency\?/.test(await P.textContent('.note.calm')) && /St Mary's Children's, non-emergency line/.test(await P.textContent('.note.calm')), 'the Guide lists the non-emergency lines');
      assert.deepEqual(await P.$$eval('.note.calm a.callbtn', a => a.map(x => x.getAttribute('href'))), ['tel:5550104000', 'tel:5550103000', 'tel:5550105000']);
      assert(/Dr\. Rivera/.test(await P.textContent('#docBtn')));
      await syncNow(P); await syncNow(B); await B.click('[data-tab=guide]'); await B.click('#docBtn');
      assert(/Oak Street Pediatrics/.test(await B.textContent('#sheet')));
      assert.deepEqual(await B.$$eval('#sheet a.callbtn', a => a.map(x => x.getAttribute('href'))), ['tel:5550102299', 'tel:5550104000', 'tel:5550103000', 'tel:5550105000']);
      assert.equal(await B.$('#docEdit'), null, 'no edit button for a babysitter'); await B.click('[data-close]');
      const prof = JSON.stringify(await q('select profile from babies')); assert(!/Rivera|010-2299|5550102299/.test(prof), 'not readable on the server');
    });

    await step('people add their own contact details; family can see them, a babysitter without the people permission cannot, and the server never can', async () => {
      await syncNow(D); await D.click('[data-tab=family]');
      const me = await D.evaluate(() => Auth.id), openList = async X => { await X.waitForSelector('details.famlist'); if (!(await X.evaluate(() => document.querySelector('details.famlist').open))) await X.click('details.famlist > summary'); };
      await openList(D); await D.waitForSelector(`[data-pview="${me}"]`); await D.click(`[data-pview="${me}"]`);   // (you, in your family, in the families list)
      await D.fill('#dRel', 'Dad'); await D.fill('#dPhone', '+1 555 010 4444'); await D.fill('#dWork', 'Riverside Fire Station'); await D.fill('#dWorkPhone', '555 010 5555'); await D.click('#pvSave');
      await P.click('[data-tab=family]'); await P.evaluate(() => Sync.loadPeople()); await P.evaluate(() => render());
      await openList(P); await P.click(`[data-pview="${me}"]`); const t = await P.textContent('#sheet');
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
        return { data: e.data, ago: Math.round((Date.now() - e.ts) / 60000), child: e.child, dashed: document.querySelector(`.ray[data-info="${e.id}"]`).classList.contains('approx'), t: document.querySelector(`.ev[data-edit="${e.id}"] .t`).textContent }; });
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
      for (const [t, first] of [['month', 'The month'], ['stats', 'How far back'], ['guide', 'Your pediatrician'], ['family', 'Family tree'], ['more', 'Language']]) {
        await G.click(`[data-tab=${t}]`); await G.waitForTimeout(700); assert.equal(await G.$('.tour'), null, `${t}: not by itself`);
        await G.click('#helpBtn'); await G.waitForSelector('.tour-tip'); assert.equal((await at()).t, first, t);
        await G.keyboard.press('Escape'); assert.equal(await G.$('.tour'), null, 'Escape closes it');
      }
      await G.reload(); await G.waitForSelector('#tabs'); await G.waitForTimeout(1200); assert.equal(await G.$('.tour'), null, 'not again after a restart');
      await G.emulateMedia({ reducedMotion: 'reduce' }); await G.click('[data-tab=day]'); await G.click('#helpBtn');
      assert.equal(await G.evaluate(() => getComputedStyle(document.querySelector('.tour-box')).transitionDuration), '0s', 'no gliding with reduced motion');
      await G.keyboard.press('Escape');
    });

    await step('every sheet has a big close button in its corner that stays put while the sheet scrolls: the entry form, a pop-up, and the account sheets', async () => {
      const corner = () => P.evaluate(() => { const x = document.querySelector('#sheet .sheetx'), s = $('#sheet'); if (!x || s.hidden) return null; const r = x.getBoundingClientRect(), b = s.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top - b.top), inset: Math.round(b.right - r.right), label: x.getAttribute('aria-label'), inside: r.top >= b.top && r.bottom <= b.bottom }; });
      await P.click('[data-tab=day]'); await P.click('#view .quick [data-add=feed]'); await P.waitForSelector('#save');
      const a = await corner(); assert(a && a.w >= 44 && a.h >= 44 && a.top < 40 && a.inset < 40 && a.label === 'Close' && a.inside, `the entry form: ${JSON.stringify(a)}`);
      await P.evaluate(() => { $('#sheet').scrollTop = 10000; }); const b = await corner(); assert(b.inside && b.top < 40, `still in the corner when scrolled: ${JSON.stringify(b)}`);
      await P.click('#sheet .sheetx'); assert.equal(await P.evaluate(() => $('#sheet').hidden && $('#sheetBack').hidden), true, 'closes the entry form');
      await P.evaluate(() => openDoctor(false)); await P.waitForSelector('#sheet:not([hidden])'); const c = await corner(); assert(c && c.w >= 44 && c.inside, `a pop-up: ${JSON.stringify(c)}`);
      await P.click('#sheet .sheetx'); assert.equal(await P.evaluate(() => $('#sheet').hidden), true, 'closes a pop-up');
      await P.click('[data-tab=family]'); await P.evaluate(() => document.querySelector('#view .pbtn').click()); await P.waitForSelector('#sheet:not([hidden])'); const d = await corner(); assert(d && d.w >= 44 && d.inside, `an account sheet: ${JSON.stringify(d)}`);
      await P.click('#sheet .sheetx'); assert.equal(await P.evaluate(() => $('#sheet').hidden), true, 'closes an account sheet');
      await P.click('[data-tab=day]');
    });

    await step('the phone\'s status and navigation bars (Android 15 draws the app under them): the page keeps out from under them, the tab bar grows by the bar below, and the bar icons follow the theme', async () => {
      const px = (sel, prop) => P.evaluate(([s, q]) => parseFloat(getComputedStyle(document.querySelector(s))[q]), [sel, prop]);
      const tabs0 = await px('#tabs', 'paddingBottom'), body0 = await px('body', 'paddingBottom'), top0 = await px('.top', 'paddingTop');
      await P.evaluate(() => applyInsets({ top: 24, bottom: 48, left: 0, right: 0 }));
      assert.equal(await px('#tabs', 'paddingBottom'), tabs0 + 48, 'the tab bar sits above the navigation bar');
      assert.equal(await px('body', 'paddingBottom'), body0 + 48, 'and the page scrolls clear of it');
      assert(await px('.top', 'paddingTop') >= top0 + 18, 'the header is below the status bar');
      await P.evaluate(() => applyInsets({ top: 0, bottom: 0, left: 0, right: 0 }));
      assert.equal(await px('#tabs', 'paddingBottom'), tabs0);
      assert(/setBars/.test(JSON.stringify(await P.evaluate(() => window.__calls))), 'the bar icons were set to match the theme');
    });

    await step('milk in ml or fl oz: the switch in the feed form converts the number typed, the unit is kept for the whole app (list, stats, More → Units), and the amount is stored in ml', async () => {
      await P.evaluate(() => { db.meta.vol = 'ml'; db.meta.units = 'metric'; viewDay = startOfDay(Date.now()); Store.save(db); render(); });
      await P.click('[data-tab=day]'); await P.click('[data-add=feed]'); await P.click('[name=kind][value=bottle]');
      assert.equal(await P.textContent('#volFlip'), '→ fl oz'); await P.fill('#ml', '90'); await P.click('#volFlip');
      assert.equal(await P.inputValue('#ml'), '3', '90 ml became 3 fl oz'); assert.equal(await P.textContent('#volFlip'), '→ ml');
      assert.equal(await P.textContent('#fBottle label'), 'Amount (fl oz)');
      await P.fill('#ml', '4'); await P.click('#save'); await P.waitForFunction(() => $('#sheet').hidden);
      const stored = await P.evaluate(() => db.events.filter(e => e.type === 'feed' && e.data.kind === 'bottle').map(e => e.data.ml));
      assert(stored.includes(118), 'stored in ml (4 fl oz): ' + JSON.stringify(stored));
      assert(/4 fl oz/.test(await P.textContent('#view')), 'the list shows fl oz');
      await P.click('[data-tab=stats]'); assert(/fl oz per day/.test(await P.textContent('#view')), 'the stats say fl oz');
      await P.click('[data-tab=more]'); assert.equal(await P.isChecked('[name=vol][value=oz]'), true, 'More → Units shows fl oz');
      await P.evaluate(() => { document.querySelector('[name=vol][value=ml]').click(); });
      await P.click('[data-tab=day]'); assert(/118 ml/.test(await P.textContent('#view')), 'back to ml, the same entry reads 118 ml');
      await P.evaluate(() => { db.events = db.events.filter(e => !(e.type === 'feed' && e.data.ml === 118)); Store.save(db); render(); });
    });

    await step('the Guide has a twirl-down of tutorial videos (first meals, first aid, safe sleep… for the ages on the page; potty training and tantrums for a toddler) from health bodies, each a tap that opens YouTube', async () => {
      await P.click('[data-tab=guide]'); await P.evaluate(() => { document.querySelector('details[data-grp=videos]').open = true; });
      const topics = () => P.$$eval('details[data-grp=videos] details.gd .gt b', x => x.map(b => b.textContent));
      const baby = await topics();
      for (const t of ['First meals and starting solids', 'First aid: choking and CPR', 'Safe sleep', 'Newborn care: bathing, swaddling, burping, breastfeeding']) assert(baby.includes(t), t);
      assert(!baby.includes('Potty training') && !baby.includes('Tantrums'), 'not yet for a baby: ' + baby);
      const ids = await P.$$eval('[data-yt]', x => x.map(b => b.dataset.yt)); assert(ids.length >= 10 && ids.every(id => /^[A-Za-z0-9_-]{11}$/.test(id)), `${ids.length} videos with YouTube ids`);
      assert.equal(new Set(ids).size, ids.length, 'no video twice');
      const birth = await P.evaluate(() => kids()[0].birth);
      await P.evaluate(() => { const d = new Date(); d.setMonth(d.getMonth() - 30); kids()[0].birth = d.toLocaleDateString('en-CA'); render(); document.querySelector('details[data-grp=videos]').open = true; });
      const toddler = await topics(); assert(toddler.includes('Potty training') && toddler.includes('Tantrums') && !toddler.includes('Safe sleep'), 'for a toddler: ' + toddler);
      await P.evaluate(b => { kids()[0].birth = b; render(); $('#sheet').hidden = $('#sheetBack').hidden = true; document.querySelector('details[data-grp=videos]').open = true; }, birth);   // (a change of age brings up the stage sheet: closed)
      await P.evaluate(() => { window.opened = []; Native.openExternal = u => window.opened.push(u); document.querySelector('details[data-grp=vidfirstfood]').open = true; });
      await P.click('[data-yt="vLx716dMhTI"]'); assert.deepEqual(await P.evaluate(() => window.opened), ['https://www.youtube.com/watch?v=vLx716dMhTI']);
      await P.click('[data-tab=day]');
    });

    await step('the family calendar goes to the phone: an event becomes a calendar file (.ics) that opens in any calendar app, is shared by email or message, and goes straight into the phone\'s calendar where the app can', async () => {
      const day = await P.evaluate(() => { $('#sheet').hidden = $('#sheetBack').hidden = true; return dkey(Date.now() + 3 * 864e5); });
      await P.evaluate(d => { openPlan(null, { day: new Date(d + 'T00:00').getTime() }); }, day); await P.waitForSelector('#psave');
      await P.click('[name=pkind][value=Appointment]'); await P.fill('#ptitle', 'Dentist'); await P.fill('#ptime', '14:30'); await P.click('#psave');
      const ev = await P.evaluate(() => db.events.find(e => e.type === 'plan' && e.data.title === 'Dentist'));
      const ics = await P.evaluate(id => Cal.ics([Cal.itemOf(db.events.find(e => e.id === id))]), ev.id);
      assert(/BEGIN:VCALENDAR\r\nVERSION:2\.0/.test(ics) && /SUMMARY:Dentist/.test(ics) && /DTSTART:\d{8}T\d{6}Z/.test(ics) && /UID:/.test(ics) && /END:VEVENT/.test(ics), ics);
      assert.equal(await P.evaluate(() => new Date(Cal.ics([{ uid: 'x', title: 'a, b; c', start: Date.UTC(2026, 0, 2, 9, 0), end: Date.UTC(2026, 0, 2, 10, 0) }]).match(/DTSTART:(\d{8}T\d{6}Z)/)[1].replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, '$1-$2-$3T$4:$5:$6Z')).toISOString()), '2026-01-02T09:00:00.000Z', 'times are written in UTC');
      assert(/SUMMARY:a\\, b\\; c/.test(await P.evaluate(() => Cal.ics([{ uid: 'x', title: 'a, b; c', start: 0, end: 1 }]))), 'commas and semicolons are escaped');
      await P.evaluate(() => { window.__calls.length = 0; }); await P.evaluate(id => Cal.addToPhone(db.events.find(e => e.id === id)), ev.id);
      const taken = await P.evaluate(() => window.__calls.filter(c => c[0] === 'calendar')); assert(taken.length === 1 && /^Dentist( \(.*\))?$/.test(taken[0][1]), 'the phone\'s own calendar takes it: ' + JSON.stringify(taken));
      await P.evaluate(() => { window.__calls.length = 0; LLPlugins.Calendar = null; }); await P.evaluate(id => Cal.addToPhone(db.events.find(e => e.id === id)), ev.id);
      assert.deepEqual(await P.evaluate(() => window.__calls.map(c => c[0])), ['writeFile', 'share'], 'without a calendar, the .ics goes to the share sheet');
      await P.evaluate(() => { window.__calls.length = 0; }); await P.evaluate(() => Cal.shareMonth(new Date(Date.now() + 3 * 864e5)));
      assert(/\.ics$/.test((await P.evaluate(() => window.__calls[0]))[1]), 'the month goes as one file');
      await P.evaluate(id => { db.events = db.events.filter(e => e.id !== id); Store.save(db); render(); }, ev.id);
    });

    await step('a poo says whether it was solid or wet: chips on the diaper form (shown for a poo), on the potty form, and as an optional row on the one-tap pop-ups; it shows in the list, the stats and the doctor\'s report', async () => {
      await P.evaluate(() => { viewDay = startOfDay(Date.now()); tab = 'day'; render(); });
      await P.evaluate(() => openSheet('diaper')); assert.equal(await P.isVisible('#dColor'), false, 'a pee-only diaper asks nothing more');
      await P.click('#sheet [name=poo]'); assert(await P.isVisible('#dColor'));
      assert.deepEqual(await P.$$eval('#sheet [name=texture]', x => x.map(i => i.value)), ['Hard', 'Solid', 'Soft', 'Wet / runny']);
      assert.deepEqual(await P.$$eval('#sheet #dColor label.f', x => x.map(l => l.textContent)), ['Solid or wet?', 'Poo colour']);
      await P.click('#sheet [name=texture][value=Soft]'); await P.click('#sheet [name=color][value=Yellow]'); await P.click('#save'); await P.waitForFunction(() => $('#sheet').hidden);
      const d1 = await P.evaluate(() => db.events.filter(e => e.type === 'diaper').sort((a, b) => b.ts - a.ts)[0].data);
      assert.deepEqual([d1.poo, d1.texture, d1.color], [true, 'Soft', 'Yellow']);
      assert(/Soft, Yellow/.test(await P.textContent('#view')), 'the list says "Soft, Yellow"');
      // the one-tap pop-up: the row is optional, and ignored for a pee
      await P.evaluate(() => openQuick('diaper')); assert.equal(await P.textContent('#sheet label.f:has(+ .chips.big [name=qtex])'), 'Solid or wet? (if you like)');
      await P.click('#sheet [name=qtex][value="Wet / runny"]'); await P.click('#sheet [name=qdia][value=poo]'); await P.waitForFunction(() => $('#sheet').hidden);
      const d2 = await P.evaluate(() => db.events.filter(e => e.type === 'diaper').sort((a, b) => b.ts - a.ts)[0].data); assert.deepEqual([d2.poo, d2.texture], [true, 'Wet / runny']);
      await P.evaluate(() => openQuick('diaper')); await P.click('#sheet [name=qtex][value=Hard]'); await P.click('#sheet [name=qdia][value=pee]'); await P.waitForFunction(() => $('#sheet').hidden);
      assert.equal(await P.evaluate(() => db.events.filter(e => e.type === 'diaper').sort((a, b) => b.ts - a.ts)[0].data.texture), undefined, 'a pee keeps no texture');
      await P.click('[data-tab=stats]'); assert(/Solid or wet\s*(Soft ×1, Wet \/ runny ×1|Wet \/ runny ×1, Soft ×1)/.test(await P.textContent('#view')), 'the stats count them');
      const rep = await P.evaluate(() => reportBlocks(db.baby.kids[0].id, { days: 7 }).blocks.flatMap(b => (b.kv || []).map(kv => kv.join(': '))).join('\n'));
      assert(/Solid or wet: (Soft ×1, Wet \/ runny ×1|Wet \/ runny ×1, Soft ×1)/.test(rep), 'and so does the doctor\'s report: ' + rep.split('\n').filter(l => /Solid/.test(l)).join(' | '));
      // the potty form (a toddler's): the chips come with a poo and go with a pee
      await P.click('[data-tab=day]'); await P.evaluate(() => openSheet('potty')); assert.equal(await P.isVisible('#pTexture'), false, 'a pee: no texture');
      await P.click('#sheet [name=pwhat][value=poo]'); assert(await P.isVisible('#pTexture')); await P.click('#sheet [name=texture][value=Solid]'); await P.click('#save'); await P.waitForFunction(() => $('#sheet').hidden);
      const d3 = await P.evaluate(() => db.events.filter(e => e.type === 'potty').sort((a, b) => b.ts - a.ts)[0].data); assert.deepEqual([d3.poo, d3.texture], [true, 'Solid']);
      assert(/Potty · Solid/.test(await P.textContent('#view')), 'the list says where and how');
      await P.evaluate(() => { db.events = db.events.filter(e => !(e.type === 'potty') && !(e.type === 'diaper' && e.data.texture)); Store.save(db); render(); });
    });

    await step('three or more wet, runny poos in a day: the Stats page suggests a tummy bug and when to call', async () => {
      await P.evaluate(() => { const t = Date.now() - 3600e3; for (let i = 0; i < 3; i++) db.events.push({ id: 'runny' + i, type: 'diaper', ts: t + i * 600e3, data: { pee: false, poo: true, texture: 'Wet / runny' }, note: '', updated: stamp(), by: Auth.id, child: db.baby.kids[0].id }); Store.save(db); });
      await P.click('[data-tab=stats]'); assert(/Three or more wet, runny poos in one day can be a tummy bug/.test(await P.textContent('#view')));
      await P.evaluate(() => { db.events = db.events.filter(e => !/^runny/.test(e.id)); Store.save(db); render(); }); assert(!/tummy bug/.test(await P.textContent('#view')));
    });

    await step('a sleep is a nap or a night\'s sleep: the chips follow the time it began until one is chosen (6 AM to 6 PM: a nap), on the sheet and on the "Fell asleep" pop-up; a nap is a dashed ray and arc on the clock, a night\'s sleep a solid one', async () => {
      await P.click('[data-tab=day]');
      const napAt = h => P.evaluate(h => { openSheet('sleep'); const d = new Date(); d.setHours(h, 0, 0, 0); $('#ts').value = toLocalInput(d.getTime()); $('#ts').dispatchEvent(new Event('change', { bubbles: true })); return $('#sheet [name=nap][value="1"]').checked; }, h);
      assert.equal(await napAt(14), true, '2 PM: a nap'); assert.equal(await napAt(20), false, '8 PM: night sleep'); assert.equal(await napAt(3), false, '3 AM: night sleep');
      assert.deepEqual(await P.$$eval('#sheet [name=nap] + span', x => x.map(s => s.textContent.trim())), ['Nap', 'Night sleep'], 'the painted icon leaves no stray character');
      assert(/dashed line on the clock/.test(await P.textContent('#sheet')), 'the sheet says what the toggle changes');
      await P.click('#sheet [name=nap][value="1"]');   // chosen by hand: the time no longer decides
      await P.evaluate(() => { const d = new Date(); d.setHours(22, 0, 0, 0); $('#ts').value = toLocalInput(d.getTime()); $('#ts').dispatchEvent(new Event('change', { bubbles: true })); });
      assert.equal(await P.isChecked('#sheet [name=nap][value="1"]'), true, 'stays a nap once chosen');
      await P.evaluate(() => { const d = new Date(); d.setHours(13, 0, 0, 0); $('#ts').value = toLocalInput(d.getTime()); $('#end').value = toLocalInput(d.getTime() + 90 * 60e3); });
      await P.click('#save'); await P.waitForFunction(() => $('#sheet').hidden);
      const nap = await P.evaluate(() => db.events.filter(e => e.type === 'sleep').sort((a, b) => b.ts - a.ts)[0]);
      assert.equal(nap.data.nap, true); assert(/Napped 1h 30m/.test(await P.textContent('#view')), 'the list says Napped');
      const dash = await P.evaluate(id => ({ ray: getComputedStyle(document.querySelector(`.ray[data-info="${id}"] path`)).strokeDasharray, arc: getComputedStyle(document.querySelector('.clock .sarc.nap')).strokeDasharray, night: getComputedStyle(document.querySelector('.clock .sarc:not(.nap)')).strokeDasharray }), nap.id);
      assert(dash.ray !== 'none' && dash.arc !== 'none', 'the nap is dashed: ' + JSON.stringify(dash)); assert.equal(dash.night, 'none', 'the night\'s sleep (2 to 4 AM, no flag: by its time) stays solid');
      // the pop-up from the Sleep button
      await P.evaluate(() => openQuick('sleep')); assert(/Fell asleep/.test(await P.textContent('#sheet h3')));
      const napNow = await P.evaluate(() => napTime(Date.now())); assert.equal(await P.isChecked('#sheet [name=qnap][value="1"]'), napNow, 'the pop-up follows the time of day');
      await P.click('#sheet [name=qnap][value="0"]'); await P.click('#qSave'); await P.waitForFunction(() => $('#sheet').hidden);
      const s2 = await P.evaluate(() => db.events.filter(e => e.type === 'sleep' && !e.end)[0]); assert.equal(s2.data.nap, false, 'night sleep, as chosen');
      assert(/Asleep since/.test(await P.textContent('#sleepBanner')), 'the banner says Asleep (Napping for a nap)');
      await P.evaluate(id => { const s = db.events.find(e => e.id === id); s.data.nap = true; Store.save(db); render(); }, s2.id); assert(/Napping since/.test(await P.textContent('#sleepBanner')));
      await P.evaluate(() => { db.events = db.events.filter(e => !(e.type === 'sleep' && (!e.end || e.data.nap === true))); Store.save(db); render(); });
    });

    await step('the Routine page shows a nap as soon as it is logged: under "Today so far" before there is a routine, and under "Also today" when it is not one of the routine\'s times', async () => {
      await P.evaluate(() => { $('#sheet').hidden = $('#sheetBack').hidden = true; });
      const kid = await P.evaluate(() => { const k = Kids.make(kids(), 'Zoe'); k.birth = '2025-03-01'; kids().push(k); (db.meta.ms || (db.meta.ms = {}))[k.id] = 999; saveProfile(); setKid(k.id); return k.id; });
      await P.click('[data-tab=routine]'); assert(/Your routine will show up here after a few days/.test(await P.textContent('#view')));
      assert.equal(await P.$$eval('#view h2', h => h.map(x => x.textContent.trim()).filter(t => /today/i.test(t))).then(x => x.length), 0, 'nothing logged yet');
      await P.evaluate(k => { const t = Date.now() - 50 * 60e3; db.events.push({ id: 'znap', type: 'sleep', ts: t, end: t + 40 * 60e3, data: { nap: true }, note: '', updated: stamp(), by: Auth.id, child: k }); db.events.push({ id: 'zdia', type: 'diaper', ts: t, data: { pee: true, poo: false }, note: '', updated: stamp(), by: Auth.id, child: k }); Store.save(db); render(); }, kid);
      assert(/Today so far/.test(await P.textContent('#view')), 'the nap shows at once');
      const rows = await P.$$eval('.routine.today .rslot .rb b', x => x.map(b => b.textContent.trim())); assert(rows.length === 1 && /Napped 40m/.test(rows[0]), 'the nap, not the diaper (the routine leaves diapers out): ' + rows);
      // with a routine: a sleep at a time that is part of it is ticked on its row; one at another time is listed under Also today
      await P.evaluate(k => { const h = (new Date().getHours() + 20) % 24; for (let d = 1; d <= 4; d++) { const t = startOfDay(Date.now()) - d * 864e5 + h * 3600e3; db.events.push({ id: 'zr' + d, type: 'sleep', ts: t, end: t + 3600e3, data: { nap: true }, note: '', updated: stamp(), by: Auth.id, child: k }); } Store.save(db); render(); }, kid);
      assert(/Also today/.test(await P.textContent('#view')) && /Logged today at a time that is not part of the routine/.test(await P.textContent('#view')), 'the routine (a nap four hours before now) and today\'s nap at another time');
      assert.equal(await P.$$eval('.routine.today .rslot', x => x.length), 1);
      await P.evaluate(k => { db.events = db.events.filter(e => e.child !== k); db.baby.kids = db.baby.kids.filter(x => x.id !== k); setKid(db.baby.kids[0].id); saveProfile(); }, kid);
    });

    await step('a drop-off at the grandparents\', a babysitter\'s, a childminder\'s or a friend\'s offers the family\'s own names (the tree\'s grandparents; the babysitters, caregivers and friends in the log), and every place can have a location, remembered for next time', async () => {
      await P.evaluate(() => { db.meta.tree = FamilyTree.clean({ parents: [{ id: 'p1', name: 'Mum', gp: [{ id: 'g1', name: 'Rose', call: 'Nana', gp: [] }, { id: 'g2', name: 'Bill', gp: [{ id: 'gg', name: 'Edith', call: 'Great-nan' }] }], sibs: [{ id: 's1', name: 'Jo', kids: [] }] }] }); Sync.st.tree = db.meta.tree; Store.save(db); });
      await P.evaluate(() => { $('#sheet').hidden = $('#sheetBack').hidden = true; Sync.st.people = [{ id: 'me', display_name: 'Mum', role: 'parent', is_you: true }, { id: 'b1', display_name: 'Tasha', role: 'babysitter' }, { id: 'c1', display_name: 'Kim', role: 'caregiver' }, { id: 'f1', display_name: 'Priya', role: 'friend' }]; });
      await P.click('[data-tab=day]'); await P.evaluate(() => openSheet('care'));
      assert.equal(await P.isVisible('#cWith'), false, 'daycare: no one to pick'); assert(await P.isVisible('#cloc'), 'but a location');
      const names = () => P.$$eval('#cwithNames button', b => b.map(x => x.textContent));
      await P.click('#sheet [name=cplace][value=Grandparents]'); assert.equal(await P.textContent('#cwithL'), 'Which grandparent? (optional)'); assert.deepEqual(await names(), ['Nana', 'Bill', 'Great-nan'], 'the tree\'s grandparents, as the children call them');
      await P.click('#sheet [name=cplace][value=Babysitter]'); assert.equal(await P.textContent('#cwithL'), 'Which babysitter? (optional)'); assert.deepEqual(await names(), ['Tasha']);
      await P.click('#sheet [name=cplace][value=Childminder]'); assert.equal(await P.textContent('#cwithL'), 'Which childminder? (optional)'); assert.deepEqual(await names(), ['Kim']);
      await P.click(`#sheet [name=cplace][value="Friend's house"]`); assert.equal(await P.textContent('#cwithL'), 'Whose house? (optional)'); assert.deepEqual(await names(), ['Priya']);
      await P.click('#sheet [name=cplace][value=Grandparents]'); await P.click('#cwithNames button:has-text("Nana")'); assert.equal(await P.inputValue('#cwith'), 'Nana');
      await P.fill('#cloc', '12 Orchard Lane'); await P.click('#save'); await P.waitForFunction(() => $('#sheet').hidden);
      const c = await P.evaluate(() => db.events.filter(e => e.type === 'care').sort((a, b) => b.ts - a.ts)[0].data); assert.deepEqual([c.place, c.with, c.location], ['Grandparents', 'Nana', '12 Orchard Lane']);
      assert(/At Grandparents since/.test(await P.textContent('#sleepBanner')) && /with Nana · 12 Orchard Lane/.test(await P.textContent('#sleepBanner')), 'the banner says with whom and where');
      await P.evaluate(() => openSheet('care')); assert.equal(await P.inputValue('#cloc'), '12 Orchard Lane', 'the location comes back for the same place');
      await P.click('#sheet [name=cplace][value=Daycare]'); assert.equal(await P.inputValue('#cloc'), '', 'another place: nothing yet'); await P.click('#cancel');
      await P.evaluate(() => { db.events = db.events.filter(e => e.type !== 'care' && e.type !== 'pickup'); Sync.st.people = []; delete db.meta.tree; Sync.st.tree = undefined; Store.save(db); render(); });
    });

    await step('every part of the Guide folds into a twirl-down of its own, closed to start with, except the pediatrician, the health record and Right now', async () => {
      await P.evaluate(() => { $('#sheet').hidden = $('#sheetBack').hidden = true; openGroups.clear(); }); await P.click('[data-tab=guide]');
      const secs = await P.$$eval('#view details.sec', d => d.map(x => [x.dataset.grp, x.open, x.querySelector('summary h2').textContent, x.querySelector('summary small').textContent]));
      assert.deepEqual(secs.map(s => s[2]), ['Food', 'Common with newborns', 'Medicines', 'Play and activities', 'Health checks', 'Toddlers and preschoolers', 'Month by month'], JSON.stringify(secs));
      assert(secs.every(s => !s[1]), 'all closed'); assert(secs.every(s => /^\d+ (topics?|ages?)$/.test(s[3])), 'each says how much is inside: ' + secs.map(s => s[3]).join(', '));
      const open = await P.$$eval('#view h2', h => h.filter(x => !x.closest('details')).map(x => x.textContent.trim()));
      assert(open.every(h => h === 'Right now'), 'the only heading left on the page is Right now: ' + open); assert(await P.isVisible('#docBtn'), 'the pediatrician stays'); assert(await P.isVisible('.recbtn'), 'and the health record');
      await P.click('details.sec[data-grp=secnewborn] > summary'); assert(await P.isVisible('details[data-grp=gfever] > summary'), 'open, the cards inside show');
      await P.click('[data-tab=day]'); await P.click('[data-tab=guide]'); assert.equal(await P.evaluate(() => document.querySelector('details.sec[data-grp=secnewborn]').open), true, 'and it stays open while the app runs');
      await P.evaluate(() => { ['secnewborn', 'sectoddler', 'secschool', 'secteens', 'secpuberty', 'secfood', 'secmeds', 'secplay', 'secchecks', 'secmonths', 'mlang', 'macct', 'mkids', 'mregion', 'munits', 'mlook', 'mcloud', 'mdata', 'mapp', 'mnotify'].forEach(g => openGroups.add(g)); });
    });

    await step('notifications: while a child is logged asleep the phone is asked to check ("Is Leo still asleep?"), after 2 hours then every 30 minutes up to 3 times, never in the quiet hours (7 PM to 7 AM to start with; a check that falls in them waits for their end), with Woke up and Still asleep on it; the sleep ending cancels them', async () => {
      const at = (h, m = 0) => { const x = new Date(); x.setHours(h, m, 0, 0); return x.getTime(); };
      const plan = (ts, now, extra = {}) => P.evaluate(([ts, now, extra]) => Notify.plan([{ id: 's1', type: 'sleep', ts, data: {}, child: 'k' }], now, { on: true, after: 120, every: 30, times: 3, quiet: ['19:00', '07:00'], ...extra }).map(n => { const d = new Date(n.at); return d.getHours() * 60 + d.getMinutes(); }), [ts, now, extra]);
      assert.deepEqual(await plan(at(13), at(13)), [15 * 60, 15 * 60 + 30, 16 * 60], 'a nap at 1 PM: 3, 3:30 and 4 PM');
      assert.deepEqual(await plan(at(13), at(15, 10)), [15 * 60 + 30, 16 * 60], 'only the checks still to come');
      assert.deepEqual(await plan(at(18), at(18)), [7 * 60, 7 * 60 + 30, 8 * 60], 'a sleep at 6 PM: 8 PM is in the quiet hours, so 7 AM, then 7:30 and 8');
      assert.deepEqual(await plan(at(23), at(23)), [7 * 60, 7 * 60 + 30, 8 * 60], 'a night sleep: the morning');
      assert.deepEqual(await plan(at(18), at(18), { quiet: ['22:00', '22:00'] }), [20 * 60, 20 * 60 + 30, 21 * 60], 'the same time twice: no quiet hours');
      assert.deepEqual(await plan(at(13), at(13), { on: false }), [], 'off');
      assert.deepEqual(await plan(at(13), at(13), { after: 60, every: 60, quiet: ['00:00', '00:00'] }), [14 * 60, 15 * 60, 16 * 60], 'the settings');
      // through the (fake) phone: logging a sleep asks for permission the first time, and sets the checks
      await P.evaluate(() => { Notify.set({ on: true, after: 120, every: 30, quiet: ['19:00', '07:00'] }); window.__ntf.pending = []; window.__ntf.asked = 0; window.__ntf.perm = 'prompt'; });
      await P.evaluate(() => { const t = Date.now() - 30 * 60e3; db.events.push({ id: 'ntfs1', type: 'sleep', ts: t, data: { nap: true }, note: '', updated: stamp(), by: Auth.id, child: db.baby.kids[0].id }); save(); render(); });
      await P.waitForFunction(() => window.__ntf.pending.length === 3, null, { timeout: 5000 });
      const r = await P.evaluate(() => ({ asked: window.__ntf.asked, perm: window.__ntf.perm, types: window.__ntf.types, p: window.__ntf.pending.map(n => ({ title: n.title, body: n.body, type: n.actionTypeId, extra: n.extra, at: new Date(n.schedule.at).getTime(), idle: n.schedule.allowWhileIdle })) }));
      assert.equal(r.asked, 1, 'asked once, when there was something to send'); assert.equal(r.perm, 'granted');
      assert.deepEqual(r.types[0].actions.map(a => a.id + ':' + a.title), ['woke:Woke up', 'still:Still asleep'], 'the buttons on the notification');
      assert(r.p.every(n => n.title === 'Is Leo still asleep?' && /^Asleep since .+ \(.+\)\. Tap Woke up when they are awake\.$/.test(n.body) && n.type === 'll-sleep' && n.extra.sleep === 'ntfs1' && n.idle), JSON.stringify(r.p));
      assert(r.p[1].at - r.p[0].at === 30 * 60e3 && r.p[2].at - r.p[1].at === 30 * 60e3, 'half an hour apart: ' + r.p.map(n => n.at));
      await P.click('[data-tab=day]'); await P.click('#wakeBtn'); await P.waitForFunction(() => window.__ntf.pending.length === 0, null, { timeout: 5000 });   // Woke up in the app: nothing left to send
      // the buttons on the notification: Still asleep changes nothing; Woke up ends the sleep now and opens the day
      await P.evaluate(() => { const t = Date.now() - 30 * 60e3; db.events.push({ id: 'ntfs2', type: 'sleep', ts: t, data: { nap: true }, note: '', updated: stamp(), by: Auth.id, child: db.baby.kids[0].id }); save(); render(); });
      await P.waitForFunction(() => window.__ntf.pending.length === 3, null, { timeout: 5000 });
      await P.evaluate(() => window.__emit('ntf.localNotificationActionPerformed', { actionId: 'still', notification: { extra: { ll: 'sleep', sleep: 'ntfs2', child: db.baby.kids[0].id } } }));
      assert.equal(await P.evaluate(() => [db.events.find(e => e.id === 'ntfs2').end === undefined, window.__ntf.pending.length].join()), 'true,3');
      await P.click('[data-tab=month]');
      await P.evaluate(() => window.__emit('ntf.localNotificationActionPerformed', { actionId: 'woke', notification: { extra: { ll: 'sleep', sleep: 'ntfs2', child: db.baby.kids[0].id } } }));
      await P.waitForFunction(() => window.__ntf.pending.length === 0, null, { timeout: 5000 });
      const w = await P.evaluate(() => ({ end: db.events.find(e => e.id === 'ntfs2').end, tab, now: Date.now() })); assert(w.end && w.now - w.end < 5000, 'woke up now'); assert.equal(w.tab, 'day', 'and the day page opens');
      await P.evaluate(() => { db.events = db.events.filter(e => !/^ntfs/.test(e.id)); Store.save(db); render(); });
    });

    await step('More → Notifications: the sleep check on or off, ask after 1 to 3 hours, then every 30 minutes or an hour, and the do-not-disturb hours, kept on this phone; the phone\'s answer is shown', async () => {
      await P.click('[data-tab=more]'); await P.evaluate(() => { document.querySelector('details[data-grp=mnotify]').open = true; });
      await P.waitForFunction(() => /Allowed on this phone/.test(document.querySelector('#ntfState').textContent), null, { timeout: 3000 });
      assert.equal(await P.isChecked('[name=ntfOn][value="1"]'), true); assert.equal(await P.isChecked('[name=ntfAfter][value="120"]'), true); assert.equal(await P.isChecked('[name=ntfEvery][value="30"]'), true);
      assert.equal(await P.inputValue('#ntfFrom'), '19:00'); assert.equal(await P.inputValue('#ntfTo'), '07:00');
      assert(/Sleep check after 2h · quiet 7:00 PM–7:00 AM/.test(await P.textContent('details[data-grp=mnotify] > summary')), await P.textContent('details[data-grp=mnotify] > summary'));
      await P.click('[name=ntfAfter][value="60"]'); await P.fill('#ntfFrom', '20:30'); await P.fill('#ntfTo', '06:30');
      assert.deepEqual(await P.evaluate(() => [Notify.cfg.after, Notify.cfg.quiet, JSON.parse(localStorage.getItem('ll.notify')).after]), [60, ['20:30', '06:30'], 60], 'kept on the phone');
      assert(/after 1h · quiet 8:30 PM–6:30 AM/.test(await P.textContent('details[data-grp=mnotify] > summary')));
      await P.click('[name=ntfOn][value="0"]'); assert.equal(await P.evaluate(() => Notify.cfg.on), false); assert(/Off/.test(await P.textContent('details[data-grp=mnotify] > summary'))); assert.equal(await P.isVisible('#ntfMore'), false);
      await P.evaluate(() => Notify.set({ on: true, after: 120, every: 30, quiet: ['19:00', '07:00'] }));
    });

    await step('once the routine knows how long a sleep at that time usually lasts, the first check comes an hour after the usual end (a nap that usually ends at 2:30 is asked about at 3:30, and the notification says so); a sleep at a time the routine does not know keeps "ask after"; the rule can be turned off', async () => {
      const at = (h, m = 0, d = 0) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, m, 0, 0); return x.getTime(); };
      const kid = await P.evaluate(() => db.baby.kids[0].id);
      const evs = []; for (let d = 1; d <= 4; d++) evs.push({ id: 'rn' + d, type: 'sleep', ts: at(13, 0, d), end: at(14, 30, d), data: { nap: true }, child: kid }, { id: 'rf' + d, type: 'feed', ts: at(8, 0, d), data: { kind: 'bottle', ml: 120 }, child: kid });
      const open = { id: 'rtoday', type: 'sleep', ts: at(13, 5), data: { nap: true }, child: kid };
      const plan = (list, now, extra = {}) => P.evaluate(([list, now, extra]) => Notify.plan(list, now, { on: true, after: 120, every: 30, times: 3, quiet: ['19:00', '07:00'], routine: true, ...extra }).map(n => { const d = new Date(n.at); return [d.getHours() * 60 + d.getMinutes(), n.usual]; }), [list, now, extra]);
      assert.deepEqual(await plan(evs.concat(open), at(13, 10)), [[15 * 60 + 35, 90], [16 * 60 + 5, 90], [16 * 60 + 35, 90]], 'usually 1h 30m: an hour after 2:35, then every half hour');
      assert.deepEqual(await plan(evs.concat(open), at(13, 10), { routine: false }), [[15 * 60 + 5, null], [15 * 60 + 35, null], [16 * 60 + 5, null]], 'turned off: ask after 2 hours');
      assert.deepEqual(await plan(evs.concat({ ...open, ts: at(10, 0) }), at(10, 10)), [[12 * 60, null], [12 * 60 + 30, null], [13 * 60, null]], 'a sleep at 10, not a routine time: ask after 2 hours');
      assert.deepEqual(await plan([open], at(13, 11)), [[15 * 60 + 5, null], [15 * 60 + 35, null], [16 * 60 + 5, null]], 'no routine yet: ask after 2 hours (another minute: the routine is looked at again)');
      const text = await P.evaluate(([list, open]) => { const n = Notify.plan(list, open.ts + 60e3, { on: true, after: 120, every: 30, times: 3, quiet: ['19:00', '07:00'], routine: true })[0]; return Notify.text(list, n).body; }, [evs.concat(open), open]);
      assert(/^Asleep since 1:05 PM \(2h 30m\)\. Usually up by about 2:35 PM\. Tap Woke up when they are awake\.$/.test(text), text);
      await P.click('[data-tab=more]'); await P.evaluate(() => { document.querySelector('details[data-grp=mnotify]').open = true; });
      assert.equal(await P.isChecked('[name=ntfRoutine][value="1"]'), true, 'on to start with'); await P.click('[name=ntfRoutine][value="0"]'); assert.equal(await P.evaluate(() => Notify.cfg.routine), false);
      await P.evaluate(() => Notify.set({ routine: true }));
    });

    const pageErrs = H.pages.flatMap(p => p.errs.concat(p.csp));
    if (pageErrs.length) { failed++; console.log('✗ page errors:', pageErrs); } else { ok++; console.log('✓ no page errors or content-security-policy violations on any phone'); }
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} feature checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
