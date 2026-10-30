// Moving a log from a family server into the family's own cloud: a parent's phone fetches everything it does not hold yet, connects
// Google Drive, leaves the server and makes the family folder from what it holds (a new log with new keys: the entries, the pictures
// sent again, the tree, the family's names); a second phone of hers joins the folder with the recovery code and finds it all. The
// server is the shim on a real Postgres, as in the e2e suite; the cloud is the fake Google Drive.
//   node tests/move.test.js
const assert = require('assert');
const { setup } = require('./lib/harness');
const { createFakeGoogleDrive } = require('./lib/fake-gdrive');
let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 4).join('\n    ')); } };

(async () => {
  const H = await setup({ port: 8162, addConfig: { googleClientId: 'gid.apps.googleusercontent.com' } });
  const gd = createFakeGoogleDrive(), sleep = H.sleep, syncNow = H.syncNow, entries = H.entries;
  const sealed = (text, words) => words.every(w => !text.includes(w));
  const add = (p, e) => p.evaluate(e => { const k = kids()[0].id; db.events.push({ note: '', updated: stamp(), by: Auth.id, child: k, ...e }); save(); }, e);
  const back = s => 'com.googleusercontent.apps.gid:/oauth2redirect?code=ok&state=' + s;
  /** The cloud sign-in as the phone does it: the browser opens, Google comes back through the app's own URL. */
  const opens = p => p.evaluate(() => window.__calls.filter(c => c[0] === 'Browser.open').length);
  const signInToGoogle = async (p, before) => {   // before: how many times the browser had opened before the tap that opens it again
    await p.waitForFunction(k => window.__calls.filter(c => c[0] === 'Browser.open').length > k, before, { timeout: 30000 });
    const u = new URL(await p.evaluate(() => window.__calls.filter(c => c[0] === 'Browser.open').pop()[1]));
    assert.equal(u.hostname, 'accounts.google.com'); assert(/auth\/drive(\s|$)/.test(u.searchParams.get('scope') || ''), 'the folder scopes');
    await p.evaluate(url => window.__emit('appUrlOpen', { url }), back(u.searchParams.get('state')));
  };
  let mum, dad, oldId, picture, recoveryCode;

  await step('a family on the server: Mum (a parent) and Dad (a family member) with entries of each, a health note, a picture and the family tree', async () => {
    ({ page: mum } = await H.createLog('mum@x.com'));
    await gd.install(mum.context(), 'mum@x.com');
    dad = await H.addMember(mum, 'dad@x.com', 'family', { add_entries: true, view_health: true, edit_own: true, view_people: true }, { name: 'Dad' });   // (a second parent would need two-step verification, which the helper does not set up)
    await add(dad, { id: 'd-sleep-1', type: 'sleep', ts: Date.now() - 7200e3, end: Date.now() - 5400e3, data: {}, note: 'nap' }); await syncNow(dad);
    await add(mum, { id: 'm-feed-1', type: 'feed', ts: Date.now() - 3600e3, data: { kind: 'bottle', ml: 120 }, note: 'first bottle' });
    await add(mum, { id: 'm-health-1', type: 'health', ts: Date.now() - 1800e3, data: { symptoms: ['fever'], temp: 38.2 }, note: 'warm' });
    picture = await mum.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#48c'; x.fillRect(0, 0, 64, 48);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); const prep = await Media.fromPhoto(new File([blob], 'p.jpg', { type: 'image/jpeg' }));
      const item = await Media.stage(prep); const k = kids()[0].id;
      db.events.push({ id: 'm-moment-1', type: 'moment', ts: Date.now() - 300e3, data: { what: 'first smile', media: [item] }, note: '', updated: stamp(), by: Auth.id, child: k }); save(); return item.id;
    });
    await syncNow(mum);
    await mum.evaluate(() => Sync.editTree(t => { const me = t.parents[0]; return FamilyTree.add(t, 'gp', me.id, { id: FamilyTree.newId(), name: 'Rose', call: 'Nana' }); },
      FamilyTree.clean({ parents: Sync.st.people.filter(p => p.role === 'parent').slice(0, 2).map(p => ({ id: 'u' + p.user_id.replace(/-/g, '').slice(0, 12), name: p.display_name, user: p.user_id })) })));
    await syncNow(mum); await syncNow(dad);
    assert.deepEqual((await entries(dad)).map(e => e.id).sort(), ['d-sleep-1', 'm-feed-1', 'm-health-1', 'm-moment-1']);
    oldId = await mum.evaluate(() => db.meta.babyId);
    // (the picture was made on this phone, so it is here; Dad's phone has only seen its thumbnail: not needed for the move, which is Mum's)
  });

  await step("More offers a parent Move this log to the family's own cloud; Mum moves: the phone syncs, fetches the pictures, Google signs in, the server session ends, the folder is made and the recovery code shows", async () => {
    await mum.click('[data-tab=more]'); await mum.waitForSelector('#moveCloud');
    const before = await opens(mum);
    await mum.click('#moveCloud');   // (the confirmation is accepted by the test's browser)
    await signInToGoogle(mum, before);
    await mum.waitForSelector('#rcDone', { timeout: 30000 });
    recoveryCode = (await mum.textContent('#view .code')).trim(); assert(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/.test(recoveryCode), 'a recovery code: ' + recoveryCode);
    await mum.click('input[name=rcAck]'); await mum.click('#rcDone'); await mum.waitForSelector('#tabs');
    assert.equal(await mum.evaluate(() => Auth.hasSession), false, 'the server session ended');
    assert.equal(await mum.evaluate(() => Folder.on && db.meta.role), 'parent', 'in the family folder, as a parent');
    assert.notEqual(await mum.evaluate(() => db.meta.babyId), oldId, 'a new log');
    assert.deepEqual((await entries(mum)).map(e => e.id).sort(), ['d-sleep-1', 'm-feed-1', 'm-health-1', 'm-moment-1'], 'every entry came along');
    assert.equal(await mum.evaluate(() => db.events.find(e => e.id === 'm-feed-1').by === Auth.id), true, "Mum's entries are hers under her new id");
    assert.equal(await mum.evaluate(() => Sync.nameOf(db.events.find(e => e.id === 'd-sleep-1').by)), 'Dad', "Dad's entries still say Dad");
    assert.equal(await mum.evaluate(() => Sync.st.tree.parents.flatMap(p => p.gp.map(g => g.name)).join()), 'Rose', 'the tree came along');
  });

  await step('the folder holds the whole log, sealed: the entries, the picture and its thumbnail (sent again under the new keys), the tree, the children and the family list; the server sync never ran against the new log', async () => {
    await syncNow(mum); await syncNow(mum);
    const paths = gd.paths();
    for (const p of ['littlelog.json', 'keyring.json', 'recovery.json', 'profile.json', 'members.json', 'tree.json', `media/${picture}`, `media/${picture}.t`]) assert(paths.includes(p), p + ' in ' + paths.join(' '));
    assert(paths.some(p => /^events\//.test(p)), 'the entries');
    for (const p of ['profile.json', 'members.json', 'tree.json']) assert(sealed(gd.text(p), ['Leo', 'Mum', 'Dad', 'Rose', 'mum@x.com', 'dad@x.com']), p + ' holds no plain names');
    assert.equal(await mum.evaluate(() => JSON.parse(JSON.stringify(ServerSync.st)).state), 'idle', 'the server sync stayed idle');
    assert.equal(await mum.evaluate(() => Sync.st.state), 'ok');
  });

  await step("Mum's second phone joins the folder with the recovery code and finds every entry, the tree and the picture; Dad's phone still syncs with the server copy", async () => {
    const p2 = await H.device({ welcome: true, routes: ctx => gd.install(ctx, 'mum@x.com') });
    await p2.waitForSelector('#wShare'); await p2.click('#wShare'); await p2.waitForSelector('#lCloud'); await p2.click('#lCloud'); await p2.waitForSelector('[data-fconnect=google]');
    const before = await opens(p2); await p2.click('[data-fconnect=google]'); await signInToGoogle(p2, before); await p2.waitForSelector('[data-fjoin]'); await p2.click('[data-fjoin]'); await p2.waitForSelector('#wRecover');
    await p2.fill('#wCode', recoveryCode); await p2.click('#wRecover'); await p2.waitForSelector('#tabs', { timeout: 20000 }); await syncNow(p2);
    assert.deepEqual((await entries(p2)).map(e => e.id).sort(), ['d-sleep-1', 'm-feed-1', 'm-health-1', 'm-moment-1']);
    assert.equal(await p2.evaluate(() => Sync.nameOf(db.events.find(e => e.id === 'd-sleep-1').by)), 'Dad');
    assert.equal(await p2.evaluate(() => (Sync.st.tree.parents.find(p => p.gp.length) || { gp: [] }).gp.map(g => g.name).join()), 'Rose');
    assert(/^blob:/.test(await p2.evaluate(i => Media.ensure(i + '.t', 'image/jpeg'), picture)), 'the thumbnail opened from the folder');
    await syncNow(dad); assert.equal(await dad.evaluate(() => Sync.st.state), 'ok', "Dad's server copy still syncs");
    for (const q of H.pages) { assert.deepEqual(q.errs, [], 'page errors'); assert.deepEqual(q.csp, [], 'CSP violations'); }
  });

  await H.close();
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\n${ok} passed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
