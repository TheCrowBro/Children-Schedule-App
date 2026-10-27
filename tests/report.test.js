// The report for the doctor (a PDF of one child's log, in the app's language, drawn on the phone) and More → Update app.
//   node tests/report.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
/* global doctorPdf, reportDays, LLPlugins, Capacitor */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 5).join('\n    ')); } };
const has = cmd => { try { execFileSync('which', [cmd], { stdio: 'pipe' }); return true; } catch (e) { return false; } };

/** The structure of a PDF made of page pictures: header, objects where the cross-reference table says, pages, images, title. */
function readPdf(buf) {
  const s = buf.toString('latin1');
  assert(s.startsWith('%PDF-1.4\n'), 'a PDF 1.4 header'); assert(s.trimEnd().endsWith('%%EOF'), 'ends with %%EOF');
  const start = +s.match(/startxref\n(\d+)\n%%EOF\s*$/)[1], xref = s.slice(start).split('trailer')[0].trim().split('\n');
  assert.equal(xref[0], 'xref'); const n = +xref[1].split(' ')[1];
  xref.slice(3, 2 + n).forEach((line, i) => { const off = +line.slice(0, 10); assert.equal(s.slice(off, off + String(i + 1).length + 6), `${i + 1} 0 obj`, `object ${i + 1} is where the table says`); });
  const count = +s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)[1];
  const boxes = [...s.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(m => [+m[1], +m[2]]);
  const images = [...s.matchAll(/\/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/g)]
    .map(m => { const at = m.index + m[0].length, len = +m[3]; return { w: +m[1], h: +m[2], jpeg: buf[at] === 0xff && buf[at + 1] === 0xd8 && buf[at + len - 2] === 0xff && buf[at + len - 1] === 0xd9 }; });
  const t = s.match(/\/Title <FEFF([0-9A-F]*)>/)[1], title = Buffer.from(t, 'hex').swap16().toString('utf16le');
  return { count, boxes, images, title, lang: (s.match(/\/Lang \(([^)]*)\)/) || [])[1] };
}

(async () => {
  const H = await setup({ port: 8133 });
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    // ten days of a log: feeds, diapers (one red-streaked), sleep, a vomit, a fever with a temperature, vitamin D, a pediatrician
    await P.evaluate(() => {
      const t0 = startOfDay(Date.now()), h = 3600e3, k = kids()[0].id, add = (type, ts, data, x = {}) => db.events.push({ id: `r${type}${ts}`, type, ts, data, note: '', updated: stamp(), by: Auth.id, child: k, ...x });
      for (let i = 0; i < 10; i++) {
        const d = addDays(t0, -i);
        [2, 6, 10, 14, 18, 22].forEach((hr, j) => add('feed', d + hr * h, j % 2 ? { kind: 'bottle', ml: 90 + i, milk: 'Formula', formula: 'Similac Advance' } : { kind: 'breast', side: 'Left', min: 15 }));
        add('diaper', d + 7 * h, { pee: true, poo: true, color: i === 3 ? 'Red-streaked' : 'Yellow' }); add('diaper', d + 15 * h, { pee: true });
        add('sleep', d + 13 * h, {}, { end: d + 15 * h }); add('wake', d + 3 * h, { min: 10, why: 'Hungry' });
      }
      add('vomit', t0 - 2 * 864e5 + 11 * h, { amount: 'Large', projectile: true });
      add('health', t0 - 864e5 + 9 * h, { symptoms: ['Fever'], temp: 38.4 }, { note: 'after the vaccines' }); add('med', t0 - 864e5 + 9.5 * h, { name: 'Vitamin D', dose: '1 ml' });
      db.baby.doctor = Guide.cleanDoctor({ name: 'Dr Rivera', practice: 'Elm Street Clinic', phone: '555 0100' }); db.meta.region = 'uk';
      save(); tab = 'stats'; render();
    });

    await step('Stats has a "Report for the doctor (PDF)" button; it asks which days, whether to put in every entry, and for questions to the doctor', async () => {
      await P.click('#pdfBtn'); await P.waitForSelector('#rpMake');
      const r = await P.evaluate(() => ({ days: [...document.querySelectorAll('#sheet [name=rpDays]')].map(x => [x.value, x.checked]), all: $('#sheet [name=rpAll]').checked, notes: !!$('#rpNotes'), kids: document.querySelectorAll('#sheet [name=rpKid]').length }));
      assert.deepEqual(r.days, [['7', false], ['14', true], ['30', false], ['90', false]]); assert.equal(r.all, true); assert(r.notes); assert.equal(r.kids, 0, 'one child: nothing to choose');
      await P.evaluate(() => { $('#sheet').hidden = $('#sheetBack').hidden = true; tab = 'more'; render(); });
      assert(await P.isVisible('#expPdf'), 'and in More → Your data');
    });

    let pdf;
    await step('"Make the PDF" makes a real PDF and hands it to the phone to save or share', async () => {
      await P.evaluate(() => { window.got = null; const was = window.download; window.download = (name, bytes, type) => { window.got = { name, type, bytes: Array.from(bytes) }; window.download = was; }; });
      await P.click('#expPdf'); await P.waitForSelector('#rpMake');
      await P.click('#sheet [name=rpDays][value="7"]'); await P.fill('#rpNotes', 'Is the red streak something to worry about?');
      await P.click('#rpMake'); await P.waitForFunction(() => window.got, null, { timeout: 30000 });
      const got = await P.evaluate(() => window.got);
      assert.equal(got.type, 'application/pdf'); assert(/^little-log-leo-\d{4}-\d\d-\d\d-\d{4}-\d\d-\d\d\.pdf$/.test(got.name), got.name);
      pdf = Buffer.from(got.bytes); fs.writeFileSync(path.join(H.tmp, 'report.pdf'), pdf);
      const r = readPdf(pdf);
      assert(r.count >= 2 && r.count === r.images.length, `${r.count} pages, ${r.images.length} pictures`);
      assert(r.boxes.every(([w, h]) => w === 595.28 && h === 841.89), 'A4 in the UK: ' + JSON.stringify(r.boxes[0]));
      assert(r.images.every(i => i.jpeg && i.w === 1654 && i.h === 2339), 'each page a whole JPEG at 200 dpi: ' + JSON.stringify(r.images[0]));
      assert.equal(r.title, 'Leo: report for the doctor'); assert.equal(r.lang, 'en');
      assert.equal(await P.evaluate(() => reportDays), 7, 'the choice of days is remembered for next time');
    });

    await step('poppler reads it: the page count, size and title match, and every page renders', async () => {
      if (!has('pdfinfo') || !has('pdftoppm')) return console.log('    (poppler-utils not installed: skipped)');
      const info = execFileSync('pdfinfo', [path.join(H.tmp, 'report.pdf')]).toString();
      assert(/Title:\s+Leo: report for the doctor/.test(info) && /Page size:\s+595.28 x 841.89 pts \(A4\)/.test(info), info);
      assert.equal(+info.match(/Pages:\s+(\d+)/)[1], readPdf(pdf).count);
      execFileSync('pdftoppm', ['-r', '20', '-png', path.join(H.tmp, 'report.pdf'), path.join(H.tmp, 'pg')]);
      assert.equal(fs.readdirSync(H.tmp).filter(f => /^pg-\d+\.png$/.test(f)).length, readPdf(pdf).count);
    });

    await step('what is in it: the child, the questions, the averages, every day of the period, the health notes and medicines, and every entry', async () => {
      const r = await P.evaluate(async () => { const x = await doctorPdf(kids()[0].id, { days: 7, every: true, notes: 'Is the red streak something to worry about?' }); return { pages: x.pages, text: x.text }; });
      const all = r.text.flat(), first = r.text[0];
      assert.equal(first[0], 'Leo'); assert(all.includes('Is the red streak something to worry about?'));
      for (const t of ['Questions and notes for the doctor', 'At a glance', 'Day by day', 'Health notes and medicines', 'Every entry', 'Feeds per day', 'Bottle ml per day', 'Pee per day', 'Poo per day', 'Sleep per day', 'Wake-ups per night', 'Highest temperature', 'Symptoms noted', 'Medicines given', 'Pediatrician', 'Usual formula']) assert(all.includes(t), t + ' is in it');
      assert(all.some(l => /^Dr Rivera · Elm Street Clinic · 555 0100$/.test(l)), 'the pediatrician');
      assert(all.some(l => /^Yellow ×\d+, Red-streaked ×1$/.test(l)), 'poo colours with how often');
      assert(all.some(l => /^38\.4° · /.test(l)), 'the highest temperature, with when'); assert(all.includes('Vitamin D 1 ml ×1'));
      assert.equal(all.filter(l => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [A-Z][a-z]{2} \d{1,2}$/.test(l)).length >= 7, true, 'a row for each of the 7 days');
      assert(all.includes('Fever') && all.some(l => /Temp 38\.4° · after the vaccines/.test(l)), 'the health note, its temperature and its note');
      assert(all.some(l => l === 'Feed: Bottle 90 ml'), 'each entry, described as in the app');
      r.text.forEach((pg, i) => assert(pg.includes(`Little Log · Leo · Page ${i + 1} of ${r.pages}`), 'page numbers on page ' + (i + 1)));
      const without = await P.evaluate(async () => (await doctorPdf(kids()[0].id, { days: 7, every: false, notes: '' })).text.flat());
      assert(!without.includes('Every entry') && !without.includes('Questions and notes for the doctor'), 'without every entry or questions when not wanted');
    });

    await step('US Letter paper in North America; right to left in Arabic, with the text drawn from the right', async () => {
      const r = await P.evaluate(async () => { db.meta.region = 'na'; const x = await doctorPdf(kids()[0].id, { days: 7, every: false, notes: '' }); db.meta.region = 'uk'; return Array.from(x.bytes); });
      assert.deepEqual(readPdf(Buffer.from(r)).boxes[0], [612, 792]);
      // where the ink is on the first lines of page 1: from the left margin in English, from the right one in Arabic
      const side = lang => P.evaluate(async l => {
        await I18n.set(l); const x = await doctorPdf(kids()[0].id, { days: 7, every: false, notes: '' }); await I18n.set('');
        const s = new TextDecoder('latin1').decode(x.bytes), m = s.match(/\/DCTDecode \/Length (\d+) >>\nstream\n/), at = m.index + m[0].length;
        const img = await createImageBitmap(new Blob([x.bytes.slice(at, at + +m[1])], { type: 'image/jpeg' })), c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d');
        g.drawImage(img, 0, 0); const band = g.getImageData(0, Math.round(img.height * 0.04), img.width, Math.round(img.height * 0.05)).data;
        let lo = img.width, hi = 0;
        for (let i = 0; i < band.length; i += 4) if (band[i] < 120) { const px = (i / 4) % img.width; lo = Math.min(lo, px); hi = Math.max(hi, px); }
        return { lo: lo / img.width, hi: hi / img.width, rtl: document.documentElement.dir };
      }, lang);
      const en = await side('en'), ar = await side('ar');
      assert(en.lo < 0.1 && en.hi < 0.5, 'English starts at the left: ' + JSON.stringify(en));
      assert(ar.hi > 0.9 && ar.lo > 0.5, 'Arabic starts at the right: ' + JSON.stringify(ar));
    });

    await step('on the phone, the PDF is written as a file and the share sheet opens (to save it, print it, or send it)', async () => {
      await P.evaluate(async () => { window.__calls.length = 0; const x = await doctorPdf(kids()[0].id, { days: 7, every: false, notes: '' }); await Native.saveFile('report.pdf', x.bytes); });
      const calls = await P.evaluate(() => window.__calls.map(c => c.slice(0, 2)));
      assert.deepEqual(calls, [['writeFile', 'report.pdf'], ['share', 'file:///cache/report.pdf']]);
      const b64 = await P.evaluate(async () => { const x = await doctorPdf(kids()[0].id, { days: 7, every: false, notes: '' }); let out = null; const was = LLPlugins.Filesystem.writeFile; LLPlugins.Filesystem.writeFile = async o => { out = o; }; await Native.saveFile('r.pdf', x.bytes); LLPlugins.Filesystem.writeFile = was; return [out.encoding || null, out.data.slice(0, 12)]; });
      assert.deepEqual(b64, [null, Buffer.from('%PDF-1.4\n').toString('base64').slice(0, 12)], 'as bytes (base64), not as text');
    });

    await step('More → Update app opens the app\'s page in its store: Google Play on Android, the App Store on an iPhone once its number is set', async () => {
      await P.evaluate(() => { tab = 'more'; render(); window.opened = []; Native.openExternal = u => window.opened.push(u); });
      await P.click('#appUpdate');
      assert.deepEqual(await P.evaluate(() => window.opened), ['https://play.google.com/store/apps/details?id=app.littlelog.newborn']);
      await P.evaluate(() => { window.opened = []; window.realPlatform = Capacitor.getPlatform; Capacitor.getPlatform = () => 'ios'; });
      await P.click('#appUpdate'); assert(/Open the App Store/.test(await P.textContent('#toast')), 'no App Store number yet: how to update by hand');
      await P.evaluate(() => { LL_CONFIG.appStoreId = '1234567890'; }); await P.click('#appUpdate');
      assert.deepEqual(await P.evaluate(() => window.opened), ['https://apps.apple.com/app/id1234567890']);
      await P.evaluate(() => { Capacitor.getPlatform = window.realPlatform; delete LL_CONFIG.appStoreId; });
    });

    await step('it shows the version of the app on the phone', async () => {
      await P.evaluate(() => { LLPlugins.App.getInfo = async () => ({ version: '1.4', build: '17' }); tab = 'more'; render(); });
      await P.waitForFunction(() => /Version 1\.4 \(17\)/.test($('#appCard').textContent));
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, []); assert.deepEqual(p.csp, []); }
    });
  } catch (e) { failed++; console.log('✗ crashed:', e); } finally { await H.close(); }
  console.log(`\n${failed ? failed + ' FAILED, ' : ''}${ok} passed`); process.exit(failed ? 1 : 0);
})();
