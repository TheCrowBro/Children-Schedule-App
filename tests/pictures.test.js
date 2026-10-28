// Pictures as they grow (Stats → Pictures of …): a carousel for the first year (newborn and each month birthday) and one for every
// birthday to eighteen, veiled until the first birthday; a picture is an entry of its own, encrypted and synced like a big moment's
// pictures; the 12-month and the first-birthday slots are one picture; a pop-up says once that the second row has opened; and the
// pictures stay out of the Day page and the doctor's report.   node tests/pictures.test.js
const assert = require('assert');
/* global Store, kids, saveProfile, picsOf, picDay, eventsOnDay, reportBlocks, startOfDay, render, openGroups, db, $, Auth, stamp, fmtDay, dkey */
/* global tab:writable, viewDay:writable */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 9).join('\n    ')); } };
const until = async (fn, what, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await new Promise(r => setTimeout(r, 100)); } };

(async () => {
  const H = await setup({ port: 8147 }), { syncNow, shim } = H;
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    await P.emulateMedia({ reducedMotion: 'reduce' });
    const baby = await P.evaluate(() => db.meta.babyId);
    const png = (w, h, color) => P.evaluate(([w, h, c]) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return cv.toDataURL('image/png').split(',')[1]; }, [w, h, color]).then(b64 => Buffer.from(b64, 'base64'));
    const stored = () => [...shim.storage.keys()].filter(k => k.startsWith('media/')).sort();
    // Leo's date of birth: today's day of the month (or the 28th, if today is later), `months` months ago, so he is exactly that old today
    const born = (page, months) => page.evaluate(m => { const t = new Date(), b = new Date(t.getFullYear(), t.getMonth() - m, Math.min(t.getDate(), 28)); kids()[0].birth = `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, '0')}-${String(b.getDate()).padStart(2, '0')}`; saveProfile(); }, months);
    const stats = page => page.evaluate(() => { openGroups.add('mpics'); tab = 'stats'; render(); });
    const tiles = (page, row) => page.$$eval(`#${row} .pic`, xs => xs.map(x => [x.dataset.slot, x.classList.contains('soon') ? 'soon' : x.querySelector('[data-view]') ? 'has' : x.querySelector('[data-pick]') ? 'add' : 'empty', x.classList.contains('now')]));
    const choose = async (page, sel, buf, name = 'pic.png') => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]); await fc.setFiles({ name, mimeType: 'image/png', buffer: buf }); };
    const photos = page => page.evaluate(() => db.events.filter(e => e.type === 'photo').map(e => ({ id: e.id, slot: e.data.slot, media: e.data.media[0].id, w: e.data.media[0].w, h: e.data.media[0].h, ts: e.ts, child: e.child })));
    let first, D;

    await step('without a date of birth the twirl-down asks for one', async () => {
      await P.evaluate(() => { db.meta.ms = { [kids()[0].id]: 99 }; kids()[0].birth = ''; saveProfile(); });   // (the month-birthday sheets are seen already: they would open over the page)
      await stats(P);
      const t = await P.textContent('details[data-grp=mpics]');
      assert(/Pictures of Leo/.test(t) && /No pictures yet/.test(t) && /Add Leo's date of birth under More to start the pictures/.test(t), t);
      assert.equal(await P.$('#picsM'), null);
    });

    await step('at 3 months: the first-year carousel has Newborn and every month to 12, the four reached open to a picture and the rest dimmed with their dates, 3 months marked as now; the growing-up carousel is veiled until the first birthday, with its date', async () => {
      await born(P, 3); await stats(P);
      const m = await tiles(P, 'picsM');
      assert.deepEqual(m.map(x => x[0]), ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12']);
      assert.deepEqual(m.map(x => x[1]), ['add', 'add', 'add', 'add', ...Array(9).fill('soon')], JSON.stringify(m));
      assert.deepEqual(m.filter(x => x[2]).map(x => x[0]), ['m3'], 'the slot for his age now');
      const labels = await P.$$eval('#picsM .pic b', xs => xs.map(x => x.textContent));
      assert.deepEqual(labels.slice(0, 3), ['Newborn', '1 month', '2 months']); assert.equal(labels[12], '12 months');
      assert.equal(await P.$('#picsY'), null, 'no second carousel yet');
      const lock = await P.textContent('.plock'), birthday = await P.evaluate(() => fmtDay(dkey(picDay(kids()[0].birth, 'y1'))));
      assert(lock.includes(`Opens on Leo's first birthday, ${birthday}`), lock);
      const all = await P.textContent('details[data-grp=mpics]');
      assert(/The first year/.test(all) && /Growing up/.test(all) && /The 12-month picture is the first birthday picture too/.test(all));
    });

    await step('a picture for the 3-month slot: an entry of its own dated that day, the picture shrunk to 1600 px and kept on this phone, a thumbnail on the tile, and sent encrypted with the next sync', async () => {
      await choose(P, '#picsM [data-pick=m3]', await png(2400, 1600, '#c0392b'));
      await until(() => P.evaluate(() => db.events.some(e => e.type === 'photo')), 'the entry');
      const [e] = await photos(P); first = e;
      const day = await P.evaluate(() => picDay(kids()[0].birth, 'm3')), kid = await P.evaluate(() => kids()[0].id);
      assert.deepEqual([e.slot, e.w, e.h, e.ts, e.child], ['m3', 1600, 1067, day + 12 * 3600e3, kid], JSON.stringify(e));
      await until(() => P.$('#picsM [data-view=m3] img'), 'the thumbnail on the tile');
      assert.deepEqual((await tiles(P, 'picsM'))[3], ['m3', 'has', true]);
      assert(/1 picture/.test(await P.textContent('details[data-grp=mpics] summary')), 'the twirl-down counts it');
      assert.deepEqual(await P.evaluate(() => db.meta.mediaUp), [e.media], 'waiting to upload');
      await syncNow(P);
      assert.deepEqual(stored(), [`media/${baby}/${e.media}`, `media/${baby}/${e.media}.t`]);
      const full = shim.storage.get(`media/${baby}/${e.media}`);
      assert(full[0] === 1 && full.indexOf(Buffer.from('JFIF')) < 0, 'encrypted: no JPEG inside');
    });

    await step('it stays out of the day: not on the Day page for that day, not in the doctor\'s report; a picture with a slot the app does not know is left alone', async () => {
      const r = await P.evaluate(() => {
        const e = db.events.find(x => x.type === 'photo'), day = startOfDay(e.ts);
        const rep = reportBlocks(kids()[0].id, { days: 400, every: true }).blocks.map(b => JSON.stringify(b)).join('\n');
        db.events.push({ id: 'oddpic', type: 'photo', ts: e.ts, data: { slot: 'm99', media: [{ id: 'abcdefgh', kind: 'photo' }] }, note: '', by: Auth.id, child: kids()[0].id, updated: stamp() });
        tab = 'day'; viewDay = day; render(); const onDay = eventsOnDay(day).length, dayText = $('#view').textContent;
        openGroups.add('mpics'); tab = 'stats'; render();
        const n = [...picsOf(kids()[0].id).keys()];
        db.events = db.events.filter(x => x.id !== 'oddpic'); Store.save(db); render();
        return { onDay, rep: /Picture/.test(rep), dayText: /Picture/.test(dayText), n };
      });
      assert.deepEqual([r.onDay, r.rep, r.dayText, r.n], [0, false, false, ['m3']], JSON.stringify(r));
    });

    await step('the family sees it: Dad\'s phone gets the thumbnail by itself and the picture big when tapped, with the name, the age and the day, and he may keep a copy; a helper who may not add entries sees the pictures but no way to add, replace or remove one', async () => {
      D = await H.addMember(P, 'dad@x.com', 'family', {}, { name: 'Dad' });
      await D.evaluate(() => { db.meta.ms = { [kids()[0].id]: 99 }; if (!$('#sheet').hidden) $('#sheetBack').click(); });   // (the month-birthday sheet opens on his phone the moment he joins)
      await syncNow(D); await stats(D);
      await until(() => D.$('#picsM [data-view=m3] img'), 'the thumbnail on Dad\'s phone');
      await D.click('#picsM [data-view=m3]');
      const im = await until(() => D.evaluate(() => { const i = document.querySelector('#mview img:not(.dim)'); return i && i.complete && i.naturalWidth ? [i.naturalWidth, i.naturalHeight] : null; }), 'the picture in the viewer');
      assert.deepEqual(im, [1600, 1067]);
      const h = await D.textContent('#sheet h3'); assert(/Leo · 3 months/.test(h), h);
      assert(/\d{4}/.test(await D.textContent('#sheet .note')), 'the day under the title');
      assert.deepEqual(await D.evaluate(() => [!!$('#pvReplace'), !!$('#pvRemove'), !!$('#pvSave')]), [false, false, true], 'a relative may keep a copy; changing or removing it is for whoever added it, or a parent (like any entry)');
      await D.click('#sheet [data-close]');
      const C = await H.addMember(P, 'nan@x.com', 'caregiver', { add_entries: false }, { name: 'Nan' });
      await C.evaluate(() => { db.meta.ms = { [kids()[0].id]: 99 }; if (!$('#sheet').hidden) $('#sheetBack').click(); });
      await syncNow(C); await stats(C);
      await until(() => C.$('#picsM [data-view=m3] img'), 'the thumbnail on Nan\'s phone');
      assert.equal(await C.$$eval('[data-pick]', x => x.length), 0, 'no Add a picture for her');
      assert.deepEqual((await tiles(C, 'picsM'))[2], ['m2', 'empty', false], 'an open slot shows as empty');
      await C.click('#picsM [data-view=m3]'); assert.equal(await C.evaluate(() => !!$('#pvReplace') || !!$('#pvRemove')), false, 'nor replace or remove'); await C.click('#sheet [data-close]');
    });

    await step('replace and remove: a new picture takes the old one\'s place in the same entry, the old one leaves this phone and the family\'s storage; Remove takes the entry off every phone', async () => {
      await stats(P); await P.click('#picsM [data-view=m3]'); await P.waitForSelector('#pvReplace');
      await choose(P, '#pvReplace', await png(900, 1200, '#2980b9'));
      await until(() => P.evaluate(id => { const e = db.events.find(x => x.type === 'photo'); return e && e.data.media[0].id !== id; }, first.media), 'a new picture in the entry');
      const [e] = await photos(P);
      assert.deepEqual([e.id, e.slot, e.w, e.h], [first.id, 'm3', 900, 1200], 'the same entry, the new picture (a small one is kept as it is)');
      await until(() => P.evaluate(async id => !(await Store.blobGet(id)) && !(await Store.blobGet(id + '.t')) && (db.meta.mediaDel || []).includes(id), first.media), 'the old one off this phone and due to go from storage');
      await syncNow(P);
      assert.deepEqual(stored(), [`media/${baby}/${e.media}`, `media/${baby}/${e.media}.t`], 'only the new one in storage');
      await syncNow(D); await stats(D);
      await until(() => D.evaluate(id => !!document.querySelector('#picsM [data-view=m3] img') && db.events.find(x => x.type === 'photo').data.media[0].id === id, e.media), 'Dad has the new one');
      await P.click('#picsM [data-view=m3]'); await P.waitForSelector('#pvRemove'); await P.click('#pvRemove');   // ("Remove this picture?" is answered yes)
      await until(() => P.evaluate(() => !db.events.some(x => x.type === 'photo')), 'gone');
      assert.deepEqual((await tiles(P, 'picsM'))[3], ['m3', 'add', true], 'the tile is open again');
      assert.equal(await P.evaluate(() => db.deleted.some(d => d.type === 'photo')), true);
      await syncNow(P); assert.deepEqual(stored(), [], 'nothing left in storage');
      await syncNow(D); assert.equal(await D.evaluate(() => db.events.some(x => x.type === 'photo')), false, 'off Dad\'s phone too');
    });

    await step('turning one: the 12-month sheet says the second row has opened, with See the pictures; the 12-month and the first-birthday slots are one picture; the growing-up carousel runs to 18 years', async () => {
      await P.evaluate(() => { db.meta.ms = { [kids()[0].id]: 11 }; });   // (the 12-month sheet is the one to come)
      await born(P, 12);
      await P.waitForSelector('#picsGo');
      const t = await P.textContent('#sheet');
      assert(/Leo is 12 months old/.test(t) && /Something new on the Stats page/.test(t) && /second row/.test(t) && /every birthday from one to eighteen/.test(t) && /12-month picture is the first birthday picture too/.test(t), t);
      await P.click('#picsGo'); await P.waitForSelector('#picsY');
      assert.equal(await P.evaluate(() => tab), 'stats');
      const y = await tiles(P, 'picsY');
      assert.deepEqual(y.map(x => x[0]), Array.from({ length: 18 }, (_, i) => 'y' + (i + 1)));
      assert.deepEqual([y[0], y[1][1], y[17][1]], [['y1', 'add', true], 'soon', 'soon']);
      assert.deepEqual((await tiles(P, 'picsM')).slice(11), [['m11', 'add', false], ['m12', 'add', true]], 'the 12-month tile is open, and the one for now');
      assert.equal(await P.$('.plock'), null, 'no veil');
      await choose(P, '#picsM [data-pick=y1]', await png(1000, 1000, '#27ae60'));
      await until(() => P.$('#picsY [data-view=y1] img'), 'the first-birthday tile shows it');
      const [a, b] = await P.evaluate(() => [$('#picsM [data-view=y1] img').src, $('#picsY [data-view=y1] img').src]);
      assert.equal(a, b, 'one picture in both carousels');
      assert.deepEqual((await photos(P)).map(e => e.slot), ['y1'], 'kept once, as the first birthday');
      await P.click('#picsY [data-view=y1]'); assert(/Leo · 1 year · 12 months/.test(await P.textContent('#sheet h3')), await P.textContent('#sheet h3')); await P.click('#sheet [data-close]');
      await P.evaluate(() => render()); assert.equal(await P.evaluate(() => $('#sheet').hidden), true, 'the sheet came once');
      // at 2½ the second birthday is the one marked now
      await P.evaluate(() => { db.meta.ms = { [kids()[0].id]: 99 }; }); await born(P, 30);
      assert.deepEqual((await tiles(P, 'picsY')).slice(0, 3), [['y1', 'has', false], ['y2', 'add', true], ['y3', 'soon', false]]);
    });

    await step('the ? tour on the Stats page has a step for the pictures', async () => {
      await stats(P); await P.click('#helpBtn'); await P.waitForSelector('.tour');
      const titles = [];
      for (let i = 0; i < 12 && await P.$('.tour'); i++) { titles.push(await P.textContent('#tourT')); const nx = await P.$('.tour .tt-next'); if (!nx) break; await nx.click(); await P.waitForTimeout(120); }
      assert(titles.includes('Pictures as they grow'), titles.join(' | '));
      if (await P.$('.tour')) await P.keyboard.press('Escape');
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, []); assert.deepEqual(p.csp, []); }
    });
  } catch (e) { failed++; console.log('✗ crashed:', e); } finally { await H.close(); }
  console.log(`\n${failed ? failed + ' FAILED, ' : ''}${ok} passed`); process.exit(failed ? 1 : 0);
})();
