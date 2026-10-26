// Pictures and short videos with a big moment: a picture is shrunk, kept on the phone, shown as a thumbnail under the card and sent
// encrypted with the next sync (the picture and a thumbnail; the server sees no JPEG); another phone fetches the thumbnail by itself and
// the picture when tapped; a video up to a minute, with a frame as its thumbnail (longer, bigger and unreadable files are refused);
// pictures taken off and deleted moments leave the family's storage; a moment saved for two children shares its pictures until the last
// copy goes; added offline, sent later; the book draws the pictures.   node tests/media.test.js
const assert = require('assert');
/* global Media, Store, Pdf, bookPdf, saveProfile */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 9).join('\n    ')); } };
const until = async (fn, what, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await new Promise(r => setTimeout(r, 100)); } };

(async () => {
  const H = await setup({ port: 8140 }), { syncNow, shim } = H;
  try {
    const { page: P } = await H.createLog('mum@x.com', 'Leo', 'Mum');
    await P.emulateMedia({ reducedMotion: 'reduce' });
    const baby = await P.evaluate(() => db.meta.babyId);
    const png = Buffer.from(await P.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1600; const x = c.getContext('2d'); x.fillStyle = '#c0392b'; x.fillRect(0, 0, 2400, 1600); x.fillStyle = '#fff'; x.fillRect(300, 200, 900, 700); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
    const sheet = () => P.evaluate(() => !$('#sheet').hidden && $('#sheet h3').textContent.trim());
    const stored = () => [...shim.storage.keys()].filter(k => k.startsWith('media/')).sort();
    const toastSays = (page, re, what) => until(() => page.evaluate(r => new RegExp(r).test($('#toast').textContent), re.source), what);
    let pic, D, webm;

    await step('a picture goes with a big moment: shrunk to 1600 px, kept on this phone, shown as a thumbnail under the card, and sent encrypted with the next sync (the picture and a thumbnail; the server never sees a JPEG)', async () => {
      await P.click('#view [data-momentnew]'); assert.equal(await sheet(), 'Save a big moment');
      assert(/Up to 4 pictures and one video of up to a minute/.test(await P.textContent('#sheet')), 'the limits are stated');
      await P.setInputFiles('#mmPicFile', { name: 'beach.png', mimeType: 'image/png', buffer: png });
      await P.waitForSelector('#mmMedia .mthumb img');
      await P.fill('#mmOwn', 'First time at the beach'); await P.click('#mmSave');
      const ev = await P.evaluate(() => db.events.find(e => e.type === 'moment'));
      assert.equal(ev.data.media.length, 1); pic = ev.data.media[0];
      assert.deepEqual([pic.kind, pic.w, pic.h, pic.mime, pic.bytes > 1000, /^[a-z0-9]{8,}$/.test(pic.id)], ['photo', 1600, 1067, 'image/jpeg', true, true], JSON.stringify(pic));
      assert.deepEqual(await P.evaluate(() => db.meta.mediaUp), [pic.id], 'waiting to upload');
      assert((await P.$eval('#view .mstrip .mthumb img', i => i.src)).startsWith('blob:'), 'a thumbnail under the card');
      assert.deepEqual(await P.evaluate(async id => [!!(await Store.blobGet(id)), !!(await Store.blobGet(id + '.t'))], pic.id), [true, true], 'kept on this phone');
      await syncNow(P);
      assert.deepEqual(stored(), [`media/${baby}/${pic.id}`, `media/${baby}/${pic.id}.t`], 'two files in the family\'s storage');
      const full = shim.storage.get(`media/${baby}/${pic.id}`), th = shim.storage.get(`media/${baby}/${pic.id}.t`);
      assert(full.length > th.length && th.length < 60000, `sizes: ${full.length} and ${th.length}`);
      assert(full[0] === 1 && !(full[15] === 0xff && full[16] === 0xd8) && full.indexOf(Buffer.from('JFIF')) < 0, 'encrypted: no JPEG inside');
      assert.deepEqual(await P.evaluate(() => db.meta.mediaUp), [], 'sent');
    });

    await step('the family sees it: another phone gets the thumbnail by itself, and the picture when tapped (decrypted, then kept on that phone too)', async () => {
      D = await H.addMember(P, 'dad@x.com', 'family', {}, { name: 'Dad' });
      await syncNow(D);
      await until(() => D.$('#view .mstrip .mthumb img'), 'the thumbnail on Dad\'s phone');
      await D.click('#view .mstrip .mthumb');
      const im = await until(() => D.evaluate(() => { const i = document.querySelector('#mview img:not(.dim)'); return i && i.complete && i.naturalWidth ? [i.naturalWidth, i.naturalHeight] : null; }), 'the picture in the viewer');
      assert.deepEqual(im, [1600, 1067]);
      assert(/First time at the beach/.test(await D.textContent('#sheet h3')));
      assert.equal(await D.evaluate(async id => !!(await Store.blobGet(id)), pic.id), true, 'kept on Dad\'s phone');
      await D.click('#sheet [data-close]');
    });

    await step('a video: up to a minute and 60 MB, kept as it is with a frame as its thumbnail, one per moment; a longer or bigger one, and a file that isn\'t a picture or a video, are refused', async () => {
      webm = Buffer.from(await P.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d'), rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' }), chunks = [];
        rec.ondataavailable = e => chunks.push(e.data); let f = 0; const iv = setInterval(() => { x.fillStyle = `hsl(${(f++ * 25) % 360},70%,50%)`; x.fillRect(0, 0, 320, 240); }, 66);
        rec.start(100); await new Promise(r => setTimeout(r, 1600)); const stopped = new Promise(r => { rec.onstop = r; }); rec.stop(); await stopped; clearInterval(iv);
        const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s);
      }), 'base64');
      assert(webm.length > 1000, 'a video was recorded');
      await P.click('#view .moment'); assert.equal(await sheet(), 'Change the big moment');
      // the limits first
      await P.evaluate(() => { Media.MAX.seconds = 0.5; });
      await P.setInputFiles('#mmVidFile', { name: 'clip.webm', mimeType: 'video/webm', buffer: webm }); await toastSays(P, /longer than a minute/, 'too long');
      await P.evaluate(() => { Media.MAX.seconds = 60; Media.MAX.videoBytes = 100; });
      await P.setInputFiles('#mmVidFile', { name: 'clip.webm', mimeType: 'video/webm', buffer: webm }); await toastSays(P, /too big/, 'too big');
      await P.evaluate(() => { Media.MAX.videoBytes = 60 * 1024 * 1024; });
      await P.setInputFiles('#mmPicFile', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await toastSays(P, /isn't a picture or a video/, 'not a picture');
      assert.equal(await P.$$eval('#mmMedia .mthumb', x => x.length), 1, 'nothing was added');
      // then the video itself
      await P.setInputFiles('#mmVidFile', { name: 'clip.webm', mimeType: 'video/webm', buffer: webm });
      await P.waitForSelector('#mmMedia .mthumb .play');
      assert.equal(await P.$eval('#mmVid', b => b.disabled), true, 'one video at most');
      await P.setInputFiles('#mmVidFile', { name: 'clip.webm', mimeType: 'video/webm', buffer: webm }); await toastSays(P, /Up to 4 pictures and one video/, 'a second video is refused');
      assert.equal(await P.$$eval('#mmMedia .mthumb', x => x.length), 2, 'the picture and the one video');
      await P.click('#mmSave');
      const v = await P.evaluate(() => db.events.find(e => e.type === 'moment').data.media[1]);
      assert.deepEqual([v.kind, v.w, v.h, v.mime, v.dur > 0.5 && v.dur < 5], ['video', 320, 240, 'video/webm', true], JSON.stringify(v));
      await syncNow(P); assert.equal(stored().length, 4, 'the video and its thumbnail went up too');
      await syncNow(D); await until(() => D.$$eval('#view .mstrip .mthumb img', x => x.length === 2), 'both thumbnails on Dad\'s phone');
      await D.click('#view .mstrip .mthumb:nth-child(2)');
      await until(() => D.$('#mview video[src^="blob:"]'), 'the video in the viewer'); await D.click('#sheet [data-close]');
    });

    await step('taken off: a video removed from a moment, and a deleted moment, leave the family\'s storage with the next sync; a moment saved for two children shares its picture until the last copy goes', async () => {
      await P.click('#view .moment'); await P.click('#mmMedia .mthumb:nth-child(2) .x'); await P.click('#mmSave');
      assert.equal(await P.evaluate(() => db.events.find(e => e.type === 'moment').data.media.length), 1);
      await syncNow(P); assert.deepEqual(stored(), [`media/${baby}/${pic.id}`, `media/${baby}/${pic.id}.t`], 'the video is gone from storage');
      await P.evaluate(() => { kids().push(Kids.make(kids(), 'Mia')); saveProfile(); });
      await P.click('#view [data-momentnew]'); await P.evaluate(() => document.querySelectorAll('#sheet [name=mmKid]').forEach(c => { c.checked = true; }));
      await P.setInputFiles('#mmPicFile', { name: 'snow.png', mimeType: 'image/png', buffer: png }); await P.waitForSelector('#mmMedia .mthumb img');
      await P.fill('#mmOwn', 'First snow'); await P.click('#mmSave');
      const snow = await P.evaluate(() => db.events.filter(e => e.type === 'moment' && e.data.what === 'First snow').map(e => e.data.media[0].id));
      assert.equal(snow.length, 2); assert.equal(snow[0], snow[1], 'one picture, both children');
      await syncNow(P); assert.equal(stored().length, 4);
      await P.evaluate(() => { setKid(kids()[1].id); render(); }); await P.click('#view .moment'); await P.click('#mmDel');   // (Mia's copy)
      await syncNow(P); assert.equal(stored().length, 4, 'Leo\'s copy still has the picture');
      await P.evaluate(() => { setKid(kids()[0].id); render(); const e = db.events.find(x => x.type === 'moment' && x.data.what === 'First snow'); removeEvent(e); save(); render(); });
      await syncNow(P); assert.equal(stored().length, 2, 'now it is gone');
      assert.equal(await P.evaluate(async id => (await Store.blobGet(id)) === null, snow[0]), true, 'and off this phone');
    });

    await step('offline: a picture added without a connection is kept on this phone and goes up when the connection is back', async () => {
      P.context().__down = true;
      await P.click('#view [data-momentnew]'); await P.setInputFiles('#mmPicFile', { name: 'bath.png', mimeType: 'image/png', buffer: png }); await P.waitForSelector('#mmMedia .mthumb img');
      await P.fill('#mmOwn', 'First bath'); await P.click('#mmSave');
      await syncNow(P); const id = await P.evaluate(() => db.events.find(e => e.data.what === 'First bath').data.media[0].id);
      assert.deepEqual(await P.evaluate(() => [db.meta.mediaUp, Sync.st.state]), [[id], 'offline']);
      assert(await P.$('#view .mstrip .mthumb img'), 'shown from this phone meanwhile');
      P.context().__down = false; await syncNow(P);
      assert(stored().includes(`media/${baby}/${id}`), 'sent once back online'); assert.deepEqual(await P.evaluate(() => db.meta.mediaUp), []);
    });

    await step('the book draws the pictures: a row of them under the moment, scaled to fit the page', async () => {
      const r = await P.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#48c'; x.fillRect(0, 0, 400, 300);
        const img = { img: c, w: 400, h: 300 };
        const plain = (await Pdf.make([{ h: 1, text: 'Book' }])).bytes.length, withPics = (await Pdf.make([{ h: 1, text: 'Book' }, { imgs: [img, img, img] }])).bytes.length;
        const book = await bookPdf(kids()[0].id);
        return { plain, withPics, pages: book.pages, file: book.file };
      });
      assert(r.withPics > r.plain + 2000, `pictures make the page bigger: ${r.plain} → ${r.withPics}`); assert(r.pages >= 1 && /book\.pdf$/.test(r.file), JSON.stringify(r));
    });

    if (process.env.DEBUG) console.log('page errors:', P.errs, 'dialogs:', P.dialogs);
    assert.deepEqual(P.errs, [], 'no errors on the page'); assert.deepEqual(D.errs, [], 'no errors on Dad\'s phone'); assert.deepEqual(P.csp, []);
  } catch (e) { failed++; console.log('✗ suite:', e.stack || e); }
  finally { await H.close(); }
  console.log(`\n${ok} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
