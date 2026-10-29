// Several children in one log (twins, triplets): their own pages and colours, entries for one or several of them, sharing across phones,
// permissions, privacy, hostile input, and the look (contrast, no emoji left over).   node tests/children.test.js
const assert = require('assert');
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 4).join('\n    ')); } };
const lum = h => { const f = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const dist = (a, b) => Math.hypot(...[1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)));
const EMOJI = /[\u{1F300}-\u{1FAFF}⚠✅⚙☁⏳]/u;

(async () => {
  const H = await setup({ port: 8128 }), { q } = H;
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    const ids = () => P.evaluate(() => db.baby.kids.map(k => k.id));
    const kid = (p, i) => p.evaluate(i => db.baby.kids[i], i);
    const more = async () => { await P.click('[data-tab=more]'); };
    const nameKid = async (id, name) => { const l = P.locator(`[data-kn="${id}"]`); await l.fill(name); await l.blur(); };

    await step('the colours are readable (white text passes 4.5:1) and every shade in a group is clearly different', async () => {
      const pal = await P.evaluate(() => Kids.PALETTE);
      for (const [g, list] of Object.entries(pal)) {
        for (const c of list) assert(contrast(c, '#ffffff') >= 4.5, `${g} ${c} contrast ${contrast(c, '#ffffff').toFixed(2)}`);
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert(dist(list[i], list[j]) >= 40, `${g}: ${list[i]} and ${list[j]} are too alike`);
      }
      const inks = await P.evaluate(() => Object.fromEntries(Object.keys(TYPES).map(t => [t, getComputedStyle(document.documentElement).getPropertyValue(`--${t}-ink`).trim()])));
      for (const [t, c] of Object.entries(inks)) assert(/^#[0-9a-f]{6}$/i.test(c) && contrast(c, '#fffdf9') >= 4.2, `${t} icon colour ${c}`);
    });

    await step('a parent adds more children; boys get blues, girls get reds, and no two share a shade', async () => {
      await more();
      const first = (await ids())[0];
      await P.click(`[name="ks-${first}"][value=boy]`);
      await P.click('#kAdd'); let all = await ids(); await nameKid(all[1], 'Mia'); await P.click(`[name="ks-${all[1]}"][value=girl]`);
      await P.click('#kAdd'); all = await ids(); await nameKid(all[2], 'Sam'); await P.click(`[name="ks-${all[2]}"][value=boy]`);
      await P.click('#kAdd'); all = await ids(); await nameKid(all[3], 'Zoe'); await P.click(`[name="ks-${all[3]}"][value=girl]`);
      const ks = await P.evaluate(() => db.baby.kids), pal = await P.evaluate(() => Kids.PALETTE);
      assert.deepEqual(ks.map(k => k.name), ['Leo', 'Mia', 'Sam', 'Zoe']);
      assert(pal.boy.includes(ks[0].color) && pal.boy.includes(ks[2].color), 'boys are blue');
      assert(pal.girl.includes(ks[1].color) && pal.girl.includes(ks[3].color), 'girls are red');
      assert.equal(new Set(ks.map(k => k.color)).size, 4, 'four different colours: ' + ks.map(k => k.color));
      assert.equal(await P.evaluate(() => db.baby.name), 'Leo', 'the first child still mirrors the older name field');
    });

    await step('a parent can change a child\'s colour, and the choice sticks and syncs', async () => {
      await more(); const ks = await P.evaluate(() => db.baby.kids), pal = await P.evaluate(() => Kids.PALETTE);
      const want = pal.boy.find(c => !ks.map(k => k.color).includes(c));
      await P.click(`[data-kc="${ks[2].id}"][data-c="${want}"]`);
      assert.equal((await kid(P, 2)).color, want);
      assert.equal(await P.evaluate(() => getComputedStyle(document.querySelector('.sw.on')).boxShadow !== 'none'), true, 'the chosen swatch is marked (not by colour alone)');
      assert(await P.evaluate(w => document.querySelector(`[data-kc][data-c="${w}"].on`).textContent.includes('✓'), want), 'with a tick');
      // moving a child between boy / girl hands them a fresh shade from the right group
      await P.click(`[name="ks-${ks[3].id}"][value=boy]`);
      const z = await kid(P, 3); assert(pal.boy.includes(z.color), 'Zoe is now in the blue group: ' + z.color);
      await P.click(`[name="ks-${ks[3].id}"][value=girl]`); assert(pal.girl.includes((await kid(P, 3)).color));
      await H.syncNow(P);
    });

    const D = await H.addMember(P, 'dad@x.com', 'family', {}, { name: 'Dad' });
    await step('other people see the same children and colours, but only parents can change them', async () => {
      await H.syncNow(D);
      const a = await P.evaluate(() => db.baby.kids), b = await D.evaluate(() => db.baby.kids);
      assert.deepEqual(b, a, 'same children, same colours on the second phone');
      assert.equal(await D.evaluate(() => document.querySelectorAll('#kidBar [data-kid]').length), 5, 'a tab per child, plus All');
      await D.click('[data-tab=more]');
      assert.equal(await D.$$eval('[data-kn], [data-kb], [data-kc]', els => els.every(e => e.disabled)), true, 'all fields are read-only for a family member');
      assert.equal(await D.$$eval('#kAdd, [data-krm]', e => e.length), 0, 'no add / remove buttons');
      await D.evaluate(() => { db.baby.kids[0].name = 'HACKED'; Sync.pushBaby(); });
      await D.evaluate(() => Sync.run(true)); await H.syncNow(P);
      assert.equal((await kid(P, 0)).name, 'Leo', 'the server refused a family member\'s profile change and the parent\'s name stands');
    });

    await step('each child has their own page; one entry can be logged for several children at once', async () => {
      await P.click('[data-tab=day]'); await P.click('[data-kid]:nth-child(2)');   // Leo (nth-child 1 is "All")
      assert.equal(await P.textContent('#title'), "Leo's Log");
      await P.click('[data-add=feed]');
      const boxes = await P.$$('[name=kid]'); assert.equal(boxes.length, 4, 'four children to choose from');
      assert.equal(await P.$$eval('[name=kid]:checked', e => e.length), 1, 'the open child is pre-ticked');
      await P.click('[name=kid][value]:nth-of-type(1)').catch(() => {});
      await P.evaluate(() => { document.querySelectorAll('[name=kid]').forEach((c, i) => { c.checked = i < 3; }); });   // Leo, Mia, Sam
      await P.click('[name=kind][value=bottle]'); await P.fill('#ml', '90'); await P.click('#save');
      const feeds = await P.evaluate(() => db.events.filter(e => e.type === 'feed').map(e => ({ id: e.id, child: e.child, ml: e.data.ml })));
      assert.equal(feeds.length, 3); assert.equal(new Set(feeds.map(f => f.id)).size, 3, 'separate entries'); assert.equal(new Set(feeds.map(f => f.child)).size, 3);
      assert(feeds.every(f => f.ml === 90));
      assert.equal(await P.evaluate(() => document.querySelectorAll('.card.ev').length), 1, "Leo's page shows only Leo's feed");
      // log something for Zoe alone
      const ks = await P.evaluate(() => db.baby.kids);
      await P.click(`[data-kid="${ks[3].id}"]`); await P.click('[data-add=diaper]'); await P.click('#save');
      assert.equal(await P.evaluate(() => document.querySelectorAll('.card.ev').length), 1);
      assert.equal(await P.evaluate(() => db.events.filter(e => e.type === 'diaper')[0].child), ks[3].id);
      await P.click('[data-kid=all]');
      assert.equal(await P.textContent('#title'), 'Everyone'); assert.equal(await P.evaluate(() => document.querySelectorAll('.card.ev').length), 4, 'Everyone shows all of them');
      assert.equal(await P.evaluate(() => document.querySelectorAll('.card.ev .ktag').length), 4, 'each tagged with whose it is');
      // an entry made on a phone with no child at all (older entries) belongs to the first child
      await P.evaluate(() => { db.events.push({ id: 'legacy1', type: 'play', ts: Date.now(), data: { activity: 'Play' }, note: '', updated: stamp(), by: Auth.id }); save(); render(); });
      await P.click(`[data-kid="${ks[0].id}"]`); assert.equal(await P.evaluate(() => scoped().some(e => e.id === 'legacy1')), true);
      await P.click(`[data-kid="${ks[1].id}"]`); assert.equal(await P.evaluate(() => scoped().some(e => e.id === 'legacy1')), false);
    });

    await step('another phone gets each entry under the right child, and the theme follows the child', async () => {
      await H.syncNow(P); await H.syncNow(D);
      const a = await H.entries(P), b = await H.entries(D); assert.deepEqual(b, a);
      const ks = await D.evaluate(() => db.baby.kids);
      await D.click('[data-tab=day]'); await D.click(`[data-kid="${ks[1].id}"]`);
      assert.equal(await D.evaluate(() => scoped().every(e => childOf(e) === db.baby.kids[1].id)), true);
      const brand = await D.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim());
      assert.equal(brand.toLowerCase(), ks[1].color, "Mia's page is in Mia's colour");
      await D.click(`[data-kid="${ks[0].id}"]`);
      assert.equal((await D.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim())).toLowerCase(), ks[0].color);
    });

    await step('Month and Stats count only the open child', async () => {
      const ks = await P.evaluate(() => db.baby.kids);
      await P.click('[data-tab=stats]'); await P.click(`[data-kid="${ks[3].id}"]`);
      const t = await P.textContent('#view'); assert(t.includes('ZOE'.toLowerCase()) || /zoe/i.test(t), 'stats are headed with the child\'s name');
      assert.equal(await P.evaluate(() => dayStats(startOfDay(Date.now())).feeds), 0, "Zoe has no feeds, even though others do");
      await P.click(`[data-kid="${ks[0].id}"]`); assert.equal(await P.evaluate(() => dayStats(startOfDay(Date.now())).feeds), 1);
      await P.click('[data-tab=month]'); assert.equal(await P.evaluate(() => eventsOnDay(startOfDay(Date.now())).every(e => childOf(e) === db.baby.kids[0].id)), true);
    });

    await step('two children can be asleep at once; each has their own "Woke up", and the same child cannot fall asleep twice', async () => {
      const ks = await P.evaluate(() => db.baby.kids);
      await P.click('[data-tab=day]'); await P.click(`[data-kid="${ks[0].id}"]`);
      await P.click('[data-add=sleep]'); await P.evaluate(() => { document.querySelectorAll('[name=kid]').forEach((c, i) => { c.checked = i < 2; }); }); await P.click('#save');
      assert.equal(await P.$$eval('#sleepBanner .brow', e => e.length), 2, 'two sleepers');
      await P.click('[data-add=sleep]'); await P.click('#save'); await P.click('#cancel');   // Leo again: refused, the sheet stays open
      assert.equal(await P.evaluate(() => db.events.filter(e => e.type === 'sleep').length), 2, 'refused: Leo is already asleep');
      await P.click('#wakeBtn'); await P.click('#wakeUp');   // (Woke up asks: up for good)
      assert.equal(await P.$$eval('#sleepBanner .brow:not(.awake)', e => e.length), 1, 'one still asleep');
      await P.evaluate(() => db.events.filter(e => e.type === 'sleep' && !e.end).forEach(e => { e.end = Date.now(); e.updated = stamp(); })); await P.evaluate(() => render());
    });

    await step('a child with entries cannot be removed until their entries are moved; an empty one can', async () => {
      const ks = await P.evaluate(() => db.baby.kids);
      await more(); await P.click(`[data-krm="${ks[1].id}"]`);
      assert.equal((await ids()).length, 4, 'Mia still has entries, so she stays');
      // move Mia's feed to Zoe via the edit sheet
      const mia = await P.evaluate(id => db.events.filter(e => e.child === id).map(e => e.id), ks[1].id);
      await P.evaluate(ids => { for (const id of ids) { const e = db.events.find(x => x.id === id); e.child = db.baby.kids[3].id; e.updated = stamp(); } save(); render(); }, mia);
      await P.click(`[data-krm="${ks[1].id}"]`);
      assert.equal((await ids()).length, 3, 'Mia is gone now');
      assert.deepEqual((await P.evaluate(() => db.baby.kids.map(k => k.name))), ['Leo', 'Sam', 'Zoe']);
      await H.syncNow(P); await H.syncNow(D);
      assert.deepEqual(await D.evaluate(() => db.baby.kids.map(k => k.name)), ['Leo', 'Sam', 'Zoe'], 'the other phone follows');
    });

    await step('the server holds none of it in readable form: names, colours, birth dates and which child an entry belongs to are all sealed', async () => {
      const kidsJson = await P.evaluate(() => JSON.stringify(db.baby.kids));
      const dump = JSON.stringify(await q('select * from babies')) + JSON.stringify(await q('select * from events')) + JSON.stringify(await q('select * from activity'));
      for (const k of JSON.parse(kidsJson)) { assert(!dump.includes(`"${k.name}"`) && !dump.includes(k.color) && !dump.includes(`"${k.id}"`), `leak: ${k.name}`); }
      assert(!/"Zoe"|"Sam"|Mia/.test(dump), 'names stay out of the server, including the activity log');
    });

    await step('hostile or old data cannot break the children list or an entry\'s owner', async () => {
      const r = await P.evaluate(async () => {
        const many = Array.from({ length: 30 }, (_, i) => ({ id: 'k' + i, name: 'x'.repeat(500), birth: 'nope', sex: 'robot', color: 'url(javascript:1)' }));
        const cleaned = Kids.clean([...many, { id: 'k0' }, { id: '<b>' }, null, 5], 'A', '');
        const legacy = Kids.clean(undefined, 'Leo', '2026-01-01');
        const b = db.meta.babyId, x = await E2EE.encryptEntry(b, { id: 'h1', type: 'feed', ts: 1, data: {}, note: '', updated: 5, by: 'u', child: '"><img src=x onerror=alert(1)>' });
        const d = await E2EE.decryptRow(b, { id: 'h1', ...x, updated: 5, deleted: false, created_by: 'u' });
        return { n: cleaned.length, colors: cleaned.map(k => k.color), names: cleaned.map(k => k.name.length), sexes: cleaned.map(k => k.sex), births: cleaned.map(k => k.birth), legacy, child: d.entry && d.entry.child };
      });
      assert.equal(r.n, 8, 'capped at eight'); assert(r.colors.every(c => /^#[0-9a-f]{6}$/.test(c)), 'colours are always plain hex'); assert(r.names.every(n => n <= 60));
      assert(r.sexes.every(s => s === ''), 'unknown sex ignored'); assert(r.births.every(b => b === ''), 'bad birth dates dropped');
      assert.equal(r.legacy.length, 1); assert.equal(r.legacy[0].id, 'c1'); assert.equal(r.legacy[0].name, 'Leo');
      assert.equal(r.child, undefined, 'a forged owner id is dropped, so the entry falls back to the first child');
    });

    await step('no emoji are left on any screen: icons replace them everywhere, and the page never has an unnamed icon button', async () => {
      const ks = await P.evaluate(() => db.baby.kids);
      for (const t of ['day', 'month', 'stats', 'family', 'more']) {
        await P.click(`[data-tab=${t}]`); const txt = await P.evaluate(() => document.body.innerText);
        assert(!EMOJI.test(txt), `${t}: emoji left: ${(txt.match(EMOJI) || [])[0]}`);
        assert((await P.$$('svg.ic')).length > 3, `${t}: icons drawn`);
      }
      await P.click('[data-tab=day]'); await P.click(`[data-kid="${ks[0].id}"]`); await P.click('[data-add=health]');
      assert(!EMOJI.test(await P.evaluate(() => document.querySelector('#sheet').innerText)), 'sheet');
      await P.click('#cancel');
      assert.equal(await P.evaluate(() => [...document.querySelectorAll('svg.ic')].every(s => s.getAttribute('aria-hidden') === 'true')), true, 'decorative icons are hidden from screen readers (their words sit next to them)');
    });

    await step('the page text stays readable on every child\'s theme', async () => {
      const ks = await P.evaluate(() => db.baby.kids);
      for (const k of ks) {
        await P.click(`[data-kid="${k.id}"]`);
        const c = await P.evaluate(() => { const s = getComputedStyle(document.documentElement); return { brand: s.getPropertyValue('--brand').trim(), on: s.getPropertyValue('--on-brand').trim(), mute: s.getPropertyValue('--mute').trim(), ink: s.getPropertyValue('--ink').trim() }; });
        assert(contrast(c.brand, c.on === '#fff' ? '#ffffff' : c.on) >= 4.5, `${k.name}: buttons ${c.brand} on ${c.on}`);
      }
      const m = await P.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mute').trim());
      assert(contrast(m, '#fffdf9') >= 4.5 && contrast(m, '#f6f2ec') >= 4.5, 'secondary text ' + m);
    });

    await step('each child can have their own clock painting, or one painting for everyone', async () => {
      const ks = await P.evaluate(() => db.baby.kids);
      await P.click('[data-tab=day]'); await P.click(`[data-kid="${ks[0].id}"]`); const a0 = await P.evaluate(() => artOf());
      await P.click(`[data-kid="${ks[1].id}"]`); const a1 = await P.evaluate(() => artOf());
      assert.notEqual(a0, a1, 'siblings start with different paintings');
      await P.click('.artbtn'); await P.waitForSelector('.artgrid'); await P.click('[name=artAll]'); await P.click('[data-pick=night]');
      assert.deepEqual(await P.evaluate(() => [...db.baby.kids.map(k => artOf(k.id)), artOf('all')]), Array(ks.length + 1).fill('night'));
    });

    const pageErrs = H.pages.flatMap(p => p.errs.concat(p.csp));
    if (pageErrs.length) { failed++; console.log('✗ page errors:', pageErrs); } else { ok++; console.log('✓ no page errors or content-security-policy violations on any phone'); }
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} children checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
