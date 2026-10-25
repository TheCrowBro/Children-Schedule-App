// Languages: every text the app shows can be translated (a pseudo-language finds anything that can't), the catalogues are complete
// and sound, choosing a language changes the whole app (right to left for Arabic, Hebrew, Persian and Urdu), and language problems
// can be reported without the app ever knowing where the reports go.   node tests/languages.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
/* global saveProfile, Report, fmtDate, milestoneCheck, openEntryInfo, openAllergy, openDoctorReport, doctorPdf, solidsCheck, Foods, dkey, openArtPicker, openDoctor, openLanguageReport, openMoreTypes, openQuick, openTrip, recentFormulas, startTour, toggleLeg */
const { setup } = require('./lib/harness');
const Cat = require('../scripts/i18n.js');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 6).join('\n    ')); } };

/** Visible text (and the labels screen readers read) that is not marked as translated in the pseudo-language: [text, where]. Text
    marked ⟦…⟧ came through the catalogue; values filled into it are marked «…» and must themselves be translated or plain data. */
const unmarked = (page, data) => page.evaluate(data => {
  const fmt = (o, n) => Array.from({ length: n }, (_, i) => new Intl.DateTimeFormat('en-US', o).format(new Date(2024, o.month ? i : 0, o.month ? 1 : 7 + i)));
  const dates = [...fmt({ weekday: 'long' }, 7), ...fmt({ weekday: 'short' }, 7), ...fmt({ month: 'long' }, 12), ...fmt({ month: 'short' }, 12), 'AM', 'PM',
    ...[2, 3].flatMap(n => new Intl.ListFormat('en-US', { type: 'conjunction' }).format(Array(n).fill('§')).split('§'))];   // (dates, times and lists come from Intl, in its own words)
  const words = [...new Set([...dates, ...data])].filter(Boolean).sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const allowed = new RegExp(`(${words.join('|')})|https?://\\S+|\\S+@\\S+\\.\\S+|#[0-9a-f]{3,6}\\b|\\b[IVX]+\\b|\\b[A-Z0-9]{2,}(?:-[A-Z0-9…]+)+\\b|\\b[A-Z0-9]{8,}\\b`, 'gu');
  const plain = t => !/\p{L}{2,}/u.test(t.replace(allowed, ' '));
  /** What is left of a text once translated parts are taken out; filled-in values are checked on their own as they are met. */
  const bad = [];
  const check = (t, where) => {
    let s = t, prev;
    do { prev = s; s = s.replace(/«([^«»]*)»/g, (m, v) => { const inner = v.replace(/⟦[^⟦⟧]*⟧/g, ' '); if (!plain(inner)) bad.push([`«${v}» in "${t.slice(0, 90)}"`, where]); return ' '; }); } while (s !== prev);
    do { prev = s; s = s.replace(/⟦[^⟦⟧«»]*⟧/g, ' '); } while (s !== prev);
    if (!plain(s)) bad.push([t.trim().slice(0, 120), where]);
  };
  const seen = el => el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0;
  const where = el => el.outerHTML.replace(/\s+/g, ' ').slice(0, 140);
  const skip = el => el.closest('#langSel, #langMini, #lrLang, script, style, title, .code, input[type=hidden]');
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), whole = new Set();
  for (let n; (n = w.nextNode());) {
    let el = n.parentElement, t = n.textContent; if (!el || !t.trim() || skip(el)) continue;
    if (el.tagName === 'tspan') { el = el.closest('text'); if (whole.has(el)) continue; whole.add(el); t = el.textContent; }   // (a label on two lines is one text)
    if (el.tagName === 'OPTION' ? !seen(el.closest('select')) : !seen(el)) continue;
    check(t, where(el));
  }
  for (const el of document.querySelectorAll('[aria-label], [placeholder], [title], img[alt]')) {
    if (skip(el) || (!seen(el) && !el.closest('svg.clock'))) continue;
    for (const a of ['aria-label', 'placeholder', 'title', 'alt']) { const v = el.getAttribute(a); if (v) check(v, `${a} of ${where(el)}`); }
  }
  return bad;
}, data);

(async () => {
  const H = await setup({ port: 8131 }), { syncNow } = H;
  try {
    // ---------- the catalogues ----------
    await step('the English catalogue is up to date with the code, every text has an id of its own, and the 31 languages are listed with their own names', async () => {
      const { strings, problems } = Cat.extract();
      assert.deepEqual(problems, []);
      const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', 'en.json'), 'utf8')).strings;
      const key = s => s.map(x => x.id + '|' + (x.en || x.one + '|' + x.other) + '|' + (x.note || '')).sort().join('\n');
      assert.equal(key(file), key(strings), 'lang/en.json is out of date: run `node scripts/i18n.js extract`');
      assert(strings.length > 1000, strings.length);
      const P = await H.device(); const langs = await P.evaluate(() => I18n.LANGS.map(l => [l.id, l.name, l.rtl]));
      assert.equal(langs.length, 32); assert.deepEqual(langs.filter(l => l[2]).map(l => l[0]), ['ar', 'he', 'fa', 'ur']);
      // an iPhone only tells the app (and its web view) the phone's language when the app says it has that language
      const plist = fs.readFileSync(path.join(__dirname, '..', 'ios', 'App', 'App', 'Info.plist'), 'utf8');
      const ios = [...((plist.split('<key>CFBundleLocalizations</key>')[1] || '').split('</array>')[0]).matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1]);
      assert.deepEqual(ios, langs.map(l => l[0]), 'Info.plist CFBundleLocalizations lists every language');
      await P.context().close();
    });

    await step('every translation keeps its placeholders, **bold** and plural forms, and covers the whole catalogue', async () => {
      const codes = Cat.languages();
      assert.equal(codes.length, 31, 'a catalogue for every language but English: ' + codes.join(' '));
      for (const code of codes) {
        const r = Cat.check(code);
        assert.deepEqual(r.issues.slice(0, 5), [], `${code}: ${r.issues.length} problem(s)`);
        assert.equal(r.done, r.total, code);
      }
    });

    // ---------- every screen, in the pseudo-language ----------
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    const data = () => P.evaluate(() => [
      'Little Log', 'SETUP.md', ...kids().map(k => k.name), 'Mum', 'Gran', ...Formulas.REGIONS.flatMap(r => r.items), ...recentFormulas(kids()),
      ...Guide.MEDS.flatMap(c => c.items.flatMap(i => (i.brands || '').split(' · '))), ...Object.values(Guide.PICS).flat().map(p => p.by), 'CC BY-SA 3.0', 'CC BY-SA 4.0', 'CC0 1.0',
      'Dropbox', 'OneDrive', 'Google Drive', 'Google', 'Apple', 'iPhone', 'Android', 'Face ID', 'Google Authenticator', 'Microsoft Authenticator', 'Authy', '1Password',
      ...I18n.LANGS.map(l => l.name), Theme.todaySun().zone || '',
      ...db.events.flatMap(e => [e.note, e.data && e.data.name, e.data && e.data.dose, e.data && e.data.formula, ...((e.data && e.data.foods) || []).filter(f => !Foods.known(f))]),
      ...kids().flatMap(k => (k.allergies || []).flatMap(a => [a.note, Foods.known(a.food) ? '' : a.food])), window.qNotes || '']);   // (what people type in is shown as typed)
    const found = [];
    const look = async (what, page = P, extra = []) => { for (const [t, where] of await unmarked(page, [...(await data()), ...extra])) found.push(`${what}: ${t}\n      at ${where}`); };
    const openAll = (page = P) => page.evaluate(() => document.querySelectorAll('#view details, #sheet details').forEach(d => { d.open = true; }));
    const sheet = async (fn, what, arg) => { await P.evaluate(fn, arg); await P.waitForSelector('#sheet:not([hidden])'); await openAll(); await look(what); await P.evaluate(() => { $('#sheet').hidden = $('#sheetBack').hidden = true; }); };
    await P.emulateMedia({ reducedMotion: 'reduce' });   // (no journey across the screen when travel mode switches on)
    await P.evaluate(async () => { await I18n.set('qps'); render(); });

    await step('in the pseudo-language every screen, sheet, tour and message comes from the catalogue (nothing is left in English)', async () => {
      // a day with one of everything, a sleep still going, and a second child
      await P.evaluate(() => {
        const t = startOfDay(Date.now()), h = 3600e3, k = kids()[0].id, add = (type, ts, data, x = {}) => db.events.push({ id: 'q' + type + ts, type, ts, data, note: '', updated: stamp(), by: Auth.id, child: k, ...x });
        add('feed', t + h, { kind: 'bottle', ml: 90, milk: 'Formula', formula: 'Similac Advance' }); add('feed', t + 2 * h, { kind: 'breast', side: 'Left', min: 12 });
        add('diaper', t + 3 * h, { pee: true, poo: true, color: 'Green', rash: true }); add('wake', t + 4 * h, { min: 10, why: 'Hungry' });
        add('vomit', t + 5 * h, { amount: 'Medium', projectile: true }); add('play', t + 6 * h, { activity: 'Tummy time', min: 15 });
        add('health', t + 7 * h, { symptoms: ['Fever', 'Rash'], temp: 38.2 }); add('med', t + 8 * h, { name: 'Vitamin D', dose: '1 ml' });
        add('sleep', t + 9 * h, {}, { end: t + 10 * h }); add('sleep', Date.now() - 20 * 60e3, {}); add('feed', t + 11 * h, { kind: 'bottle', ml: 60, milk: 'Breast milk', approx: true });
        add('feed', t + 12 * h, { kind: 'solids', foods: ['Peanut', 'Banana', 'Kiwi'], amount: 'A taste' });
        for (let i = 1; i <= 7; i++) { add('feed', addDays(t, -i) + 8 * h, { kind: 'bottle', ml: 120 }); add('feed', addDays(t, -i) + 12 * h, { kind: 'solids', foods: ['Banana', 'Kiwi'] }); add('sleep', addDays(t, -i) + 13 * h, {}, { end: addDays(t, -i) + 14.5 * h }); add('play', addDays(t, -i) + 18.5 * h, { activity: 'Bath', min: 15 }); add('med', addDays(t, -i) + 9 * h, { name: 'Vitamin D', dose: '1 ml' }); }   // (a week with a routine)
        kids()[0].allergies = [{ food: 'Peanut', date: dkey(t), note: 'hives around the mouth' }, { food: 'Kiwi', date: dkey(addDays(t, -2)), note: '' }];
        kids().push(Kids.make(kids())); kids()[1].name = 'Mia'; save(); saveProfile(); tab = 'day'; viewDay = t; render();   // (sent like a parent's change, so a sync doesn't put back the server's copy)
      });
      await openAll(); await look('day');
      await P.evaluate(() => { quad = 1; render(); }); await look('day, a quarter of the clock');
      await P.evaluate(() => { quad = null; db.meta.clock = '12'; render(); }); await look('day, 12-hour clock');
      await P.evaluate(() => { db.meta.clock = '24'; setKid('all'); render(); }); await look('day, everyone');
      await P.evaluate(() => { setKid(kids()[0].id); viewDay = addDays(viewDay, -1); render(); }); await look('day, an empty day');
      await P.evaluate(() => { tab = 'routine'; render(); }); await look('routine');
      await P.evaluate(() => { setKid(kids()[1].id); render(); }); await look('routine, too soon to tell'); await P.evaluate(() => { setKid(kids()[0].id); render(); });
      await P.evaluate(() => { viewDay = startOfDay(Date.now()); tab = 'month'; render(); }); await openAll(); await look('month');
      await P.evaluate(() => { viewDay = addDays(startOfDay(Date.now()), -2); render(); }); await look('month, the first day of an allergy');
      await P.evaluate(() => { tab = 'stats'; statDays = 30; render(); }); await openAll(); await look('stats');
      await P.evaluate(() => { tab = 'guide'; render(); }); await openAll(); await look('guide');
      await P.evaluate(() => { tab = 'family'; render(); }); await syncNow(P); await P.evaluate(() => render()); await openAll(); await look('family');
      for (const m of ['system', 'light', 'dark', 'sun']) { await P.evaluate(mode => { Theme.set(mode); tab = 'more'; render(); }, m); await openAll(); await look('more, appearance ' + m); }
      await P.evaluate(() => Theme.set('system'));
      // sheets
      for (const type of ['feed', 'diaper', 'sleep', 'wake', 'vomit', 'play', 'health', 'med']) {
        await sheet(t => openSheet(t), 'new ' + type, type);
        await sheet(t => openSheet(null, db.events.find(e => e.type === t)), 'edit ' + type, type);
      }
      await sheet(() => openDoctor(false), 'pediatrician'); await sheet(() => openDoctor(true), 'pediatrician form');
      await sheet(() => openArtPicker(kids()[0].id), 'clock art'); await sheet(() => openTrip(null), 'trip');
      await sheet(() => openLanguageReport(), 'language report'); await sheet(() => openMoreTypes(), 'more to log');
      await sheet(() => openSheet('feed', null, { kind: 'solids' }), 'new feed, solids');
      await sheet(() => openSheet(null, db.events.find(e => e.data && e.data.kind === 'solids')), 'edit feed, solids');
      await sheet(() => openEntryInfo(db.events.find(e => e.data && e.data.kind === 'solids').id), 'an entry tapped on the clock');
      await sheet(() => openAllergy(kids()[0].id, { foods: ['Peanut', 'Kiwi'], date: dkey(Date.now()) }), 'mark an allergy');
      await sheet(() => openDoctorReport(), 'report for the doctor');
      await sheet(() => { tab = 'family'; render(); document.querySelector('.ftreesvg [data-tk^="k:"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }, 'a child tapped on the family tree');
      // the family tree: adding someone, someone on it (remembered), and changing them
      await sheet(() => { tab = 'family'; render(); document.querySelector('.ftreesvg [data-tk^="+gp:"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }, 'adding a grandparent to the family tree');
      await P.evaluate(() => Sync.editTree(t => FamilyTree.add(t, 'gp', t.parents[0].id, { id: 'gran0001', name: 'Gran', call: 'Gran', gone: true }), FamilyTree.clean({ parents: [{ id: 'mum00001', name: 'Mum', user: Auth.id }] })));
      await sheet(() => { tab = 'family'; render(); document.querySelector('.ftreesvg [data-tk="p:gran0001"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }, 'someone on the family tree');
      await sheet(() => { tab = 'family'; render(); document.querySelector('.ftreesvg [data-tk="p:gran0001"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); document.querySelector('#tcEdit').click(); }, 'changing someone on the family tree');
      await P.evaluate(() => { tab = 'family'; render(); }); await look('family, with a family tree');
      await sheet(() => { tab = 'family'; render(); document.querySelector('#ftKind').click(); }, 'choosing the kind of tree');
      await sheet(() => { const k = kids()[1], d = new Date(); d.setMonth(d.getMonth() - 6); d.setDate(d.getDate() - 2); k.birth = dkey(d.getTime()); delete db.meta.solids; Tour.mark('day'); solidsCheck(); }, 'time for solid foods');
      // the PDF for the doctor: every line written on its pages
      const pdfText = await P.evaluate(async () => { window.qNotes = 'Is her sleep normal?'; const r = await doctorPdf(kids()[0].id, { days: 14, every: true, notes: window.qNotes }); return r.text.flat(); });
      await P.evaluate(lines => { const d = document.createElement('div'); d.id = 'pdfText'; d.innerHTML = `<p>${esc(lines.join(' '))}</p>`; $('#view').prepend(d); }, pdfText);   // (joined up again: a long text is wrapped over several lines)
      await look('the PDF for the doctor'); await P.evaluate(() => $('#pdfText').remove());
      await sheet(() => { const k = kids()[0]; k.birth = new Date(Date.now() - 64 * 864e5).toLocaleDateString('en-CA'); db.meta.ms = {}; Tour.mark('day'); milestoneCheck(); }, 'milestone');
      // travel mode: the page, the quick sheets, the journey
      await P.evaluate(() => { tab = 'day'; db.events.push({ id: 'qtrip', type: 'trip', ts: startOfDay(Date.now()), end: addDays(startOfDay(Date.now()), 3), data: { means: 'car' }, note: '', updated: stamp(), by: Auth.id }); render(); });
      await P.evaluate(() => toggleLeg()); await P.evaluate(() => { Travel.moving(db.events).ts = Date.now() - 125 * 60e3; render(); }); await openAll(); await look('travel page');
      for (const t of ['feed', 'diaper', 'sleep', 'vomit']) await sheet(x => openQuick(x), 'quick ' + t, t);
      // every screen's tour, step by step
      for (const t of ['day', 'routine', 'month', 'stats', 'guide', 'family', 'more']) {
        await P.evaluate(x => { tab = x; render(); startTour(); }, t);
        for (let i = 0; i < 15 && (await P.$('.tour-tip')); i++) { await look('tour of ' + t); await P.click('.tt-next'); }
      }
      // before signing in: the sign-in screen, the code, the first steps
      const G = await H.device(); await G.evaluate(async () => { await I18n.set('qps'); render(); });
      await look('sign in', G); await G.fill('#lEmail', 'nan@x.com'); await G.click('#lSend'); await G.waitForSelector('#lCode'); await look('sign-in code', G);
      await G.fill('#lCode', '12345678'); await G.click('#lVerify'); await G.waitForSelector('#oCreate'); await look('welcome', G);
      if (process.env.I18N_DUMP) fs.writeFileSync(process.env.I18N_DUMP, found.join('\n'));
      assert.deepEqual(found, [], `${found.length} text(s) not translatable:\n    ${found.slice(0, 40).join('\n    ')}`);
    });

    await step('no text is written straight into a message, a dialog, an error people see or the page: it all goes through the catalogue', async () => {
      const espree = require('espree'), bad = [], root = path.join(__dirname, '..');
      const INTERNAL = new Set(['no key', 'storage blocked', 'write aborted', 'shape', 'cancelled']);   // (caught inside the app, never shown)
      const words = t => /\p{L}{2,}/u.test(String(t).replace(/<[^>]*>/g, ' ').replace(/&\w+;/g, ' '));
      const literal = n => n && ((n.type === 'Literal' && typeof n.value === 'string' && words(n.value) && !INTERNAL.has(n.value)) || (n.type === 'TemplateLiteral' && words(n.quasis.map(q => q.value.cooked).join('§'))));
      for (const f of ['app.js', 'account.js', 'sync.js', 'e2ee.js', 'cloud.js', 'auth.js', 'lock.js', 'native.js', 'tour.js', 'store.js', 'travel.js']) {
        const ast = espree.parse(fs.readFileSync(path.join(root, f), 'utf8'), { ecmaVersion: 2023, loc: true });
        (function walk(n) {
          if (!n || typeof n.type !== 'string') return;
          const c = n.callee, name = c && (c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && c.property.name);
          if ((n.type === 'CallExpression' || n.type === 'NewExpression') && ['toast', 'confirm', 'alert', 'msg', 'Error', 'TypeError', 'shareText', 'authenticate', 'popup', 'showSheet'].includes(name) && literal(n.arguments[0])) bad.push(`${f}:${n.loc.start.line} ${name}()`);
          if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && ['textContent', 'innerHTML', 'title', 'placeholder'].includes(n.left.property.name) && literal(n.right)) bad.push(`${f}:${n.loc.start.line} .${n.left.property.name} =`);
          for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string' && k !== 'loc') walk(v); }
        })(ast);
      }
      assert.deepEqual(bad, []);
    });

    await step('the pseudo-language marks filled-in values, so English passed into a translated sentence would be caught', async () => {
      const r = await P.evaluate(() => [__('Travelling {by}', { by: 'by car' }), __('Travelling {by}', { by: __('by car') }), __n('{n} feed', '{n} feeds', 3)]);
      assert.deepEqual(r, ['⟦Travelling «by car»⟧', '⟦Travelling «⟦by car⟧»⟧', '⟦«3» feeds⟧']);
      const before = (await unmarked(P, await data())).length;
      await P.evaluate(() => { document.querySelector('#view').insertAdjacentHTML('afterbegin', `<p id="leak">${__h('Travelling {by}', { by: 'by car' })} Plain English</p>`); });
      const leak = (await unmarked(P, await data())).map(x => x[0]); await P.evaluate(() => document.querySelector('#leak').remove());
      assert.equal(leak.length - before, 2, 'both the English value and the plain English are found: ' + leak.join(' | '));
    });

    await step('the spreadsheet export (CSV) has its column names and the kinds of entry in the language too', async () => {
      const csv = await P.evaluate(() => new Promise(done => { const was = window.download; window.download = (name, text) => { window.download = was; done(text); }; tab = 'more'; render(); document.querySelector('#expCsv').click(); }));
      const cells = line => (line.match(/"((?:[^"]|"")*)"/g) || []).map(c => c.slice(1, -1));
      const [head, ...rows] = csv.split('\n').map(cells);
      assert.equal(head.length, 8); assert(head.every(h => /^⟦.+⟧$/.test(h)), 'column names: ' + head);
      assert(rows.length > 3 && rows.every(r => r[3].startsWith('⟦')), 'kinds of entry: ' + rows.map(r => r[3]).join(' | '));
    });

    // ---------- real languages ----------
    await P.evaluate(async () => { await I18n.set(''); tab = 'day'; db.events = db.events.filter(e => e.type !== 'trip' && e.type !== 'leg'); save(); render(); });
    await step('choosing a language in More changes the whole app at once, is kept on this phone after a restart, and "Automatic" follows the phone', async () => {
      await P.click('[data-tab=more]'); assert.equal(await P.inputValue('#langSel'), '', 'automatic at first');
      assert.equal(await P.textContent('#langSel option[value=""]'), 'Automatic: English');
      await P.selectOption('#langSel', 'es'); await P.waitForFunction(() => document.documentElement.lang === 'es');   // (once its catalogue has loaded)
      const r = await P.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, tabs: [...document.querySelectorAll('#tabs .tl')].map(t => t.textContent), stored: localStorage.getItem('ll.lang'), card: document.querySelector('#langCard b').textContent }));
      assert.deepEqual([r.lang, r.dir, r.stored], ['es', 'ltr', 'es']);
      assert.notDeepEqual(r.tabs, ['Day', 'Month', 'Stats', 'Guide', 'Family', 'More'], 'the tabs are in Spanish: ' + r.tabs);
      assert.notEqual(await P.evaluate(() => __('Language')), 'Language', 'the Language card itself is in Spanish');
      await P.reload(); await P.waitForSelector('#tabs');
      assert.equal(await P.evaluate(() => [I18n.lang(), document.documentElement.lang].join()), 'es,es', 'still Spanish after a restart');
      await P.evaluate(async () => { await I18n.set(''); render(); });
      assert.equal(await P.evaluate(() => I18n.lang()), 'en', 'automatic: the phone (English here)');
      const F = await H.device({ locale: 'fr-FR' }); await F.waitForSelector('#lEmail');
      assert.equal(await F.evaluate(() => [I18n.lang(), document.documentElement.lang, I18n.chosen()].join()), 'fr,fr,', 'a French phone opens in French, without choosing');
      assert.notEqual(await F.textContent('#view .card b'), 'Sign in');
      await F.context().close();
    });

    await step('Arabic, Hebrew, Persian and Urdu run right to left; the others left to right', async () => {
      for (const [code, dir] of [['ar', 'rtl'], ['he', 'rtl'], ['fa', 'rtl'], ['ur', 'rtl'], ['hi', 'ltr'], ['zh-Hans', 'ltr']]) {
        const d = await P.evaluate(async c => { await I18n.set(c); render(); return [document.documentElement.dir, getComputedStyle(document.querySelector('#view')).direction]; }, code);
        assert.deepEqual(d, [dir, dir], code);
      }
      const x = await P.evaluate(() => { tab = 'day'; render(); const t = [...document.querySelectorAll('#tabs button')].map(b => b.getBoundingClientRect().left); return t[0] > t[5]; });
      assert.equal(x, false, '(Chinese) the Day tab is on the left');
      const r = await P.evaluate(async () => { await I18n.set('ar'); render(); const t = [...document.querySelectorAll('#tabs button')].map(b => b.getBoundingClientRect().left); return t[0] > t[5]; });
      assert.equal(r, true, 'in Arabic the Day tab is on the right');
      // the rest of the layout mirrors too: "previous day" on the right with its arrow turned, the colour bar of a group on the right
      const side = () => P.evaluate(() => { const [prev, next] = document.querySelectorAll('.datenav>button'), g = getComputedStyle(document.querySelector('details.grp>summary'));
        return { prevRight: prev.getBoundingClientRect().left > next.getBoundingClientRect().left, turned: getComputedStyle(prev).transform !== 'none', bar: [g.borderLeftWidth, g.borderRightWidth] }; });
      assert.deepEqual(await side(), { prevRight: true, turned: true, bar: ['0px', '6px'] }, 'Arabic');
      await P.evaluate(async () => { await I18n.set('zh-Hans'); render(); });
      assert.deepEqual(await side(), { prevRight: false, turned: false, bar: ['6px', '0px'] }, 'Chinese');
    });

    await step('on a narrow phone (320 px) every tab name fits its tab in every language: a long one is drawn a little smaller, never cut off', async () => {
      const was = await P.evaluate(() => { tab = 'day'; return I18n.lang(); });
      await P.setViewportSize({ width: 320, height: 700 });
      const cut = [], smaller = [];
      for (const code of await P.evaluate(() => I18n.LANGS.map(l => l.id))) {
        const r = await P.evaluate(async c => { await I18n.set(c); render(); return [...document.querySelectorAll('#tabs .tl')].map(e => [e.textContent, e.scrollWidth <= e.clientWidth, parseFloat(getComputedStyle(e).fontSize)]); }, code);
        for (const [t, fits, px] of r) { if (!fits || px < 8.5) cut.push(`${code} ${t} ${px}px`); else if (px < 11) smaller.push(code); }
      }
      assert.deepEqual(cut, []);
      assert(smaller.length > 0, 'some names had to be made smaller at this width');
      await P.setViewportSize({ width: 390, height: 800 });
      const back = await P.evaluate(async c => { await I18n.set(c); render(); return [...document.querySelectorAll('#tabs .tl')].map(e => getComputedStyle(e).fontSize); }, was);
      assert.deepEqual([...new Set(back)], ['11px'], 'back to full size on a wider screen');
    });

    await step('counts use each language\'s plural forms, dates and times its own formats (with Western digits), and the week starts where the phone is', async () => {
      const r = await P.evaluate(async () => {
        const out = {};
        for (const c of ['ru', 'pl', 'ar', 'ja']) { await I18n.set(c); out[c] = [1, 2, 5, 21].map(n => __n('{n} feed', '{n} feeds', n)); }
        await I18n.set('fr'); out.fr = fmtDate(new Date(2026, 9, 29).getTime()); out.time = fmtTime(new Date(2026, 9, 29, 15, 5).getTime());
        await I18n.set('ar'); out.ar_date = fmtDate(new Date(2026, 9, 29).getTime());
        return out;
      });
      const forms = xs => new Set(xs.map(x => x.replace(/\d+/, ''))).size;   // (the word, without its number)
      assert.equal(forms(r.ru), 3, 'Russian has three forms for 1, 2, 5 (21 like 1): ' + r.ru); assert.equal(r.ru[0].replace('1', ''), r.ru[3].replace('21', ''));
      assert.equal(forms(r.pl), 3, 'Polish: ' + r.pl); assert.equal(new Set(r.ja.map(x => x.replace(/\d+/, ''))).size, 1, 'Japanese has one form: ' + r.ja);
      assert(/jeudi 29 oct/.test(r.fr), r.fr); assert.equal(r.time, '15:05', 'a 24-hour clock in French');
      assert(/29/.test(r.ar_date) && !/[٠-٩]/.test(r.ar_date), 'Arabic dates with Western digits: ' + r.ar_date);
      await P.evaluate(async () => { await I18n.set(''); render(); });
    });

    await step('a text with no translation yet falls back to English rather than showing nothing', async () => {
      const r = await P.evaluate(async () => { await I18n.set('de'); const id = I18n.idOf('Plan a trip'), had = I18n.__('Plan a trip'); I18n.add('de', { [id]: undefined }); const now = I18n.__('Plan a trip'); I18n.add('de', { [id]: had }); return [had, now]; });
      assert.notEqual(r[0], 'Plan a trip', 'translated'); assert.equal(r[1], 'Plan a trip', 'English when missing');
      await P.evaluate(async () => { await I18n.set(''); render(); });
    });

    // ---------- reporting a language problem ----------
    await step('"Report a language issue" sends what was typed, the language and the screen to the server, which emails it on; the app never sees where it goes', async () => {
      const to = H.shim.o.reportTo, mail = H.shim.o.mail, sent = [];
      P.on('request', r => { if (r.url().includes('/functions/') && r.method() === 'POST') sent.push(r.postData() || ''); });
      await P.click('[data-tab=guide]'); await P.click('[data-tab=more]'); await P.click('#langReport'); await P.waitForSelector('#lrSend');
      assert.deepEqual(await P.evaluate(() => [$('#lrLang').value, $('#lrWhere').value]), ['en', 'guide'], 'the language in use, and the screen before More');
      await P.click('#lrSend'); assert(/Write what it says first/.test(await P.textContent('#toast'))); assert.equal(mail.length, 0, 'nothing sent without a text');
      await P.selectOption('#lrLang', 'es'); await P.fill('#lrSays', 'Planear un viage'); await P.fill('#lrShould', 'Planear un viaje\u0007');
      await P.click('#lrSend'); await P.waitForSelector('#sheet', { state: 'hidden' });
      assert(/Thank you/.test(await P.textContent('#toast')));
      assert.equal(mail.length, 1); const m = mail[0];
      assert.equal(m.to, to, 'to the address the server holds'); assert.equal(m.subject, 'Little Log language report: es (guide)');
      assert(m.text.includes('It says:\nPlanear un viage') && m.text.includes('It should say:\nPlanear un viaje') && !m.text.includes('\u0007'), m.text);
      assert(!m.text.includes('mum@x.com') && !m.text.includes(await P.evaluate(() => Auth.id)), 'who sent it is not in the email');
      assert(sent.length === 1 && !sent[0].includes(to), 'the app only sent the report');
      const www = path.join(H.tmp, 'www'), files = [];
      (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(www);
      for (const f of files) assert(!fs.readFileSync(f, 'utf8').includes(to), 'the address is not in ' + path.relative(www, f));
      // and no real address anywhere in what is published: only placeholders and the tests' made-up ones
      const OK = /@(example\.(com|test)|little-log\.example|your-domain|x\.com|resend\.dev)\b/;
      const langs = fs.readdirSync(path.join(__dirname, '..', 'lang')).map(f => 'lang/' + f);
      for (const f of ['app.js', 'account.js', 'i18n.js', 'README.md', 'TESTING.md', 'supabase/functions/language-report/handler.mjs', 'supabase/functions/language-report/index.ts', 'supabase/schema.sql', ...langs]) {
        const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), emails = (t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []).filter(e => !OK.test(e));
        assert.deepEqual(emails, [], 'addresses in ' + f);
      }
    });

    await step('reports are limited (5 an hour from one person), a failure says so, and the sheet stays open to try again', async () => {
      const send = () => P.evaluate(() => Report.send({ lang: 'en', screen: 'day', says: 'x', platform: 'web' }));
      const r = []; for (let i = 0; i < 5; i++) r.push(await send());
      assert.deepEqual(r, ['sent', 'sent', 'sent', 'sent', 'busy'], '(one was sent in the step before)');
      const toastSays = re => P.waitForFunction(r => new RegExp(r).test(document.querySelector('#toast').textContent), re.source, { timeout: 5000 });
      await P.evaluate(() => openLanguageReport()); await P.fill('#lrSays', 'x'); await P.click('#lrSend');
      await toastSays(/try again in an hour/); assert(await P.isVisible('#lrSend'), 'still open');
      await H.q(`delete from report_limits`); H.shim.o.mailDown = true;
      await P.click('#lrSend'); await toastSays(/Couldn't send it/);
      H.shim.o.mailDown = false; await P.click('#lrSend'); await P.waitForSelector('#sheet', { state: 'hidden' });
      assert.equal(await P.evaluate(() => Report.send({ lang: 'xx-bad!', screen: 'day', says: 'x' })), 'invalid', 'the server checks what it gets');
    });

    await step('the report handler on its own: CORS for the app, only POST, checks every field, never mentions the address, and hashes who sent it', async () => {
      const { handle, senderKey } = await import(path.join(__dirname, '..', 'supabase', 'functions', 'language-report', 'handler.mjs'));
      const env = { to: 'secret@example.test', from: 'x <a@b.c>' }, out = [];
      const deps = (o = {}) => ({ who: async () => 'k', allow: async () => (o.allow === undefined ? true : o.allow), send: async m => { if (o.fail) throw new Error('x'); out.push(m); } });
      const req = (body, method = 'POST', headers = {}) => new Request('https://x.test/functions/v1/language-report', { method, headers, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
      const good = { lang: 'pt', screen: 'more', says: 'a'.repeat(900), should: 'b' };
      const res = async (r, e = env, d = deps()) => { const x = await handle(r, e, d); const t = await x.text(); assert(!t.includes('secret@example.test'), t); return [x.status, x.headers.get('access-control-allow-origin')]; };
      assert.deepEqual(await res(req(null, 'OPTIONS')), [204, '*']); assert.deepEqual(await res(req(null, 'GET')), [405, '*']);
      assert.deepEqual(await res(req(good), { to: '', from: '' }), [503, '*'], 'not set up yet');
      assert.equal((await res(req('{nope')))[0], 400); assert.equal((await res(req({ ...good, lang: 'English' })))[0], 400); assert.equal((await res(req({ ...good, screen: 'x' })))[0], 400);
      assert.equal((await res(req({ ...good, says: '   ' })))[0], 400); assert.equal((await res(req('x'.repeat(9000))))[0], 413);
      assert.equal((await res(req(good), env, deps({ allow: false })))[0], 429); assert.equal((await res(req(good), env, { ...deps(), allow: async () => { throw new Error('db'); } }))[0], 503);
      assert.equal((await res(req(good), env, deps({ fail: true })))[0], 502);
      assert.equal((await res(req(good)))[0], 200); assert.equal(out.at(-1).text.split('\n')[5].length, 500, 'long text is cut at 500');
      const tok = c => 'x.' + Buffer.from(JSON.stringify(c)).toString('base64url') + '.y';
      const k1 = await senderKey(req(good, 'POST', { authorization: 'Bearer ' + tok({ role: 'authenticated', sub: 'user-1' }) }), 's');
      const k2 = await senderKey(req(good, 'POST', { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), 's');
      assert(/^[0-9a-f]{64}$/.test(k1) && /^[0-9a-f]{64}$/.test(k2) && k1 !== k2, 'hashes');
      assert.notEqual(k1, await senderKey(req(good, 'POST', { authorization: 'Bearer ' + tok({ role: 'authenticated', sub: 'user-1' }) }), 'other salt'), 'salted');
      assert.equal(k2, await senderKey(req(good, 'POST', { 'x-forwarded-for': '203.0.113.9' }), 's'), 'the same sender, the same key');
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, [], 'page errors'); assert.deepEqual(p.csp, [], 'CSP'); }
    });
  } finally { await H.close(); }
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\nall ${ok} language checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
