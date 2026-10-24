// The day clock, twirl-down groups, month day counts, stats charts, formula, the Guide (pediatrician, milestones) and people's contact
// details – including that the new private data stays end-to-end encrypted.   node tests/features.test.js
const assert = require('assert');
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 4).join('\n    ')); } };
const lum = h => { const f = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

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

    await step('every painting draws, quickly, without errors', async () => {
      const r = await P.evaluate(async () => { const out = []; for (const t of Art.THEMES) { const t0 = performance.now(); const u = await Art.url(t.id, 1); const ok = await new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth > 0); i.onerror = () => res(false); i.src = u; }); out.push([t.id, ok, Math.round(performance.now() - t0)]); } return out; });
      assert.deepEqual(r.map(x => x[0]), ['blossom', 'maple', 'ocean', 'forest', 'mountains', 'garden', 'night', 'classic']);
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
      await P.emulateMedia({ colorScheme: 'dark' }); await P.click('[data-tab=day]');
      const r = await P.evaluate(() => ({ face: document.querySelector('.clock .face').getAttribute('fill'), dot: getComputedStyle(document.querySelector('.clock .ray .dot')).fill, legend: getComputedStyle(document.querySelector('.clockwrap .clegend i')).backgroundColor }));
      assert.equal(r.face, '#f1ece3', 'a warm white face at night');
      const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
      assert.equal(r.legend, rgb('#c9761f'), 'the legend matches the dots: ' + r.legend);
      assert([rgb('#c9761f'), rgb('#2a9db8'), rgb('#5b5fc7'), rgb('#5f8a1f'), rgb('#a845a8'), rgb('#c0392b')].includes(r.dot), 'a light-palette colour: ' + r.dot);
      await P.emulateMedia({ colorScheme: 'light' }); await P.evaluate(() => render());
    });

    await step('group colours stay readable on the paper in light and dark mode (3:1 for marks)', async () => {
      for (const mode of ['light', 'dark']) {
        await P.emulateMedia({ colorScheme: mode }); await P.evaluate(() => render());
        const c = await P.evaluate(() => { const s = getComputedStyle(document.documentElement); return { card: mode => (mode === 'dark' ? '#27241f' : '#fffdf9'), g: ['feed', 'diaper', 'sleep', 'vomit', 'play', 'health'].map(g => s.getPropertyValue('--g-' + g).trim()) }; });
        for (const g of c.g) assert(contrast(g, mode === 'dark' ? '#27241f' : '#fffdf9') >= 3, `${mode} ${g}`);
      }
      await P.emulateMedia({ colorScheme: 'light' }); await P.evaluate(() => render());
    });

    await step('a child\'s usual formula fills in on bottle feeds and is saved with the entry', async () => {
      await P.click('[data-tab=more]'); const k = await P.evaluate(() => db.baby.kids[0].id);
      const f = P.locator(`[data-kf="${k}"]`); await f.fill('Similac 360 Total Care'); await f.blur();
      assert.equal(await P.evaluate(() => db.baby.kids[0].formula), 'Similac 360 Total Care');
      await P.click('[data-tab=day]'); await P.click('[data-add=feed]'); await P.click('[name=kind][value=bottle]');
      assert.equal(await P.isVisible('#formula'), false, 'only asked for formula feeds');
      await P.click('[name=milk][value=Formula]'); assert.equal(await P.inputValue('#formula'), 'Similac 360 Total Care');
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

    await step('the Guide tab: common newborn issues with when to call, and every month\'s milestones', async () => {
      await P.click('[data-tab=guide]');
      assert.equal(await P.$$eval('details.gd[data-grp^=g]', d => d.length), 18);
      await P.click('details[data-grp=gfever] > summary');
      assert(/100\.4°F \(38°C\)/.test(await P.textContent('details[data-grp=gfever]')));
      assert.deepEqual(await P.$$eval('details.gd[data-grp^=m] b', b => b.map(x => x.textContent)), ['1 month', '2 months', '3 months', '4 months', '5 months', '6 months', '7 months', '8 months', '9 months', '10 months', '11 months', '12 months', '15 months', '18 months', '2 years']);
      assert(/911/.test(await P.textContent('.emer')), 'the emergency line is always on the page');
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

    const pageErrs = H.pages.flatMap(p => p.errs.concat(p.csp));
    if (pageErrs.length) { failed++; console.log('✗ page errors:', pageErrs); } else { ok++; console.log('✓ no page errors or content-security-policy violations on any phone'); }
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} feature checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
