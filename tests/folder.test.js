// The family folder: the family's log in their own cloud storage, with no server of ours. Three phones (three cloud accounts) share
// one folder through a fake of the cloud's API (tests/lib/fake-dropbox.js, tests/lib/fake-gdrive.js); the app is built without a
// family server, as the store build is. The whole life of a family folder is walked once per cloud: Dropbox, then Google Drive.
//   node tests/folder.test.js            (FOLDER_CLOUD=dropbox or =google runs one)
const assert = require('assert');
const { setup } = require('./lib/harness');
const { createFakeDropbox } = require('./lib/fake-dropbox');
const { createFakeGoogleDrive } = require('./lib/fake-gdrive');
let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 4).join('\n    ')); } };

const CLOUDS = {
  dropbox: { port: 8160, fake: createFakeDropbox, config: { dropboxKey: 'dbx' }, host: 'www.dropbox.com', scope: /sharing\.write/, back: s => 'app.littlelog.newborn://oauth?code=ok&state=' + s },
  google: { port: 8161, fake: createFakeGoogleDrive, config: { googleClientId: 'gid.apps.googleusercontent.com' }, host: 'accounts.google.com', scope: /auth\/drive(\s|$)/, back: s => 'com.googleusercontent.apps.gid:/oauth2redirect?code=ok&state=' + s },
};

async function suite(cloud) {
  const CL = CLOUDS[cloud];
  const H = await setup({ port: CL.port, noDb: true, config: { ...CL.config, appScheme: 'app.littlelog.newborn' } });
  const fake = CL.fake(), sleep = H.sleep, syncNow = H.syncNow, entries = H.entries, name = fake.label;
  console.log(`\n-- ${name} --`);
  const phone = (email, opts = {}) => H.device({ welcome: true, ...opts, routes: ctx => fake.install(ctx, email) });
  /** The cloud sign-in as the phone does it: the browser opens, the cloud comes back through the app's own URL. */
  const connect = async p => {
    await p.click(`[data-fconnect=${cloud}]`);
    await p.waitForFunction(() => window.__calls.some(c => c[0] === 'Browser.open'));
    const u = new URL(await p.evaluate(() => window.__calls.filter(c => c[0] === 'Browser.open').pop()[1]));
    assert.equal(u.hostname, CL.host); assert(CL.scope.test(u.searchParams.get('scope') || ''), 'asks for the folder scopes: ' + u.searchParams.get('scope'));
    await p.evaluate(url => window.__emit('appUrlOpen', { url }), CL.back(u.searchParams.get('state')));
    await p.waitForSelector('#oCreate');
  };
  const toCloud = async p => { await p.waitForSelector('#wShare'); await p.click('#wShare'); await p.waitForSelector(`[data-fconnect=${cloud}]`); await connect(p); };
  const goTab = async (p, t) => { await p.click(`[data-tab=${t}]`); await sleep(80); };
  const openShare = async p => { if (!(await p.evaluate(() => (document.querySelector('details.secshare') || {}).open))) await p.click('details.secshare > summary'); };
  /** A request to join that popped up on a parent's phone and was decided elsewhere: put away, as Later would. */
  const closeSheets = p => p.evaluate(() => { if (!$('#sheet').hidden) { $('#sheet').hidden = $('#sheetBack').hidden = true; $('#sheet').innerHTML = ''; } });
  const sealed = (text, words) => words.every(w => !text.includes(w));
  const add = (p, e) => p.evaluate(e => { const k = kids()[0].id; db.events.push({ note: '', updated: stamp(), by: Auth.id, child: k, ...e }); save(); }, e);
  let mum, dad, nan, recoveryCode;

  await step(`the first screen offers the family's own cloud; ${name} connects through the browser and comes back; a parent starts the log: a Little Log folder is made, with the keys, the recovery key, the children and the family list in it, all scrambled`, async () => {
    mum = await phone('mum@x.com');
    await mum.waitForSelector('#wShare'); await mum.click('#wShare'); await mum.waitForSelector(`[data-fconnect=${cloud}]`);
    assert(/own cloud/i.test(await mum.textContent('#view')), 'the cloud screen');
    await connect(mum);
    assert(/mum@x\.com/.test(await mum.textContent('#view')), 'connected as mum');
    await mum.fill('#oMine', 'Mum'); await mum.fill('#oName', 'Leo'); await mum.click('input[name=oSex][value=boy]');
    await mum.click('#oCreate'); await mum.waitForSelector('#rcDone', { timeout: 20000 });
    recoveryCode = (await mum.textContent('#view .code')).trim(); assert(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/.test(recoveryCode), 'a recovery code: ' + recoveryCode);
    await mum.click('input[name=rcAck]'); await mum.click('#rcDone'); await mum.waitForSelector('#tabs');
    const fo = fake.only(); assert.equal(fo.owner, 'mum@x.com'); assert(/^Little Log/.test(fo.name), fo.name);
    const paths = fake.paths();
    for (const p of ['littlelog.json', 'keyring.json', 'recovery.json', 'profile.json', 'members.json']) assert(paths.includes(p), p + ' in ' + paths.join(' '));
    assert(paths.some(p => /^devices\/[^/]+\.json$/.test(p)) && paths.some(p => /^keys\/[^/]+\.json$/.test(p)), 'this phone and its keys');
    for (const p of ['profile.json', 'members.json', 'recovery.json', 'keyring.json']) assert(sealed(fake.text(p), ['Leo', 'Mum', 'mum@x.com']), p + ' holds no plain names');
    await syncNow(mum); assert.equal(await mum.evaluate(() => Sync.st.state), 'ok');
    assert.equal(await mum.evaluate(() => Sync.isParent() && db.meta.role), 'parent');
  });

  await step('an entry made on the phone becomes a sealed events file of its own; a sync with nothing new is one small call', async () => {
    await add(mum, { id: 'm-feed-1', type: 'feed', ts: Date.now() - 3600e3, data: { kind: 'bottle', ml: 120 }, note: 'first bottle' });
    await syncNow(mum);
    const ev = fake.paths().filter(p => /^events\//.test(p)); assert.equal(ev.length, 1, JSON.stringify(fake.paths()));
    assert(sealed(fake.text(ev[0]), ['first bottle', '"kind"', '120']), 'sealed');
    const n = fake.calls.length; await syncNow(mum); const made = fake.calls.slice(n);
    assert.deepEqual(made, fake.idle, 'nothing new: ' + made.join(','));
  });

  await step(`sharing out the family: Mum shares the folder with Dad (a parent) and Nan (a caregiver who may not see health notes) from the Family tab; ${name} gives them access, and they are listed as shared, not joined yet`, async () => {
    await goTab(mum, 'family'); await openShare(mum); await mum.waitForSelector('#shGo');
    const share = async (email, role, perms) => {
      await mum.fill('#shEmail', email); await mum.click(`input[name=invrole][value=${role}]`);
      for (const [k, v] of Object.entries(perms || {})) { const c = await mum.$(`input[name=invperm][value=${k}]`); if (c && (await c.isChecked()) !== v) await c.click(); }
      await mum.click('#shGo'); await mum.waitForFunction(() => /Shared with/.test(document.querySelector('#toast').textContent));
      await mum.evaluate(() => { document.querySelector('#toast').textContent = ''; });
    };
    await share('dad@x.com', 'parent'); await share('nan@x.com', 'caregiver', { view_health: false });
    for (const e of ['dad@x.com', 'mum@x.com', 'nan@x.com']) assert(fake.access(e), e + ' has access');
    if (fake.pending('dad@x.com') !== null) assert(fake.pending('dad@x.com') && fake.pending('nan@x.com'), 'invited, not yet in');
    await mum.waitForFunction(() => /nan@x\.com/.test(document.querySelector('#view').textContent));
    assert(/Shared, not joined yet/.test(await mum.textContent('#view')));
  });

  await step(`Dad installs the app, connects ${name}, finds the family folder, asks to join and waits with a security code; the request pops up on Mum's phone, she ticks the code and approves; Dad is in as a parent with Leo's entries, and what he adds reaches Mum`, async () => {
    dad = await phone('dad@x.com'); await toCloud(dad);
    await dad.waitForSelector('[data-fjoin]'); assert(/Little Log/.test(await dad.textContent('#view')), 'the folder is offered');
    await dad.fill('#oMine', 'Dad'); await dad.click('[data-fjoin]');
    await dad.waitForSelector('#wCheck'); const code = (await dad.textContent('#view .code')).trim(); assert(/^\d{5}( \d{5}){5}$/.test(code), 'a security code: ' + code);
    assert(fake.paths().some(p => /^join\//.test(p)), 'the request is in the folder');
    await syncNow(mum); await mum.waitForFunction(() => Sync.st.requests.length === 1);
    await mum.evaluate(() => Acct.promptRequests()); await mum.waitForSelector('#sheet:not([hidden]) [data-approve]');   // (it pops up by itself as the sync finds it; asked for here in case the screen was busy)
    assert((await mum.textContent('#sheet')).includes(code), "the request shows Dad's phone's code");
    await mum.click('#sheet input[name=vchk]'); await mum.click('#sheet [data-approve]'); await mum.waitForFunction(() => /Approved/.test(document.querySelector('#toast').textContent));
    assert(!fake.paths().some(p => /^join\//.test(p)), 'the request is gone'); assert.equal(fake.paths().filter(p => /^keys\//.test(p)).length, 2, "Dad's phone has keys");
    await dad.click('#wCheck'); await dad.waitForSelector('#tabs', { timeout: 20000 });
    await syncNow(dad);
    assert.equal(await dad.evaluate(() => db.meta.role), 'parent');
    assert.deepEqual((await entries(dad)).map(e => e.id), ['m-feed-1']);
    assert.equal(await dad.evaluate(() => db.baby.name), 'Leo');
    await add(dad, { id: 'd-sleep-1', type: 'sleep', ts: Date.now() - 7200e3, end: Date.now() - 5400e3, data: {}, note: 'nap' });
    await syncNow(dad); await syncNow(mum);
    assert.deepEqual((await entries(mum)).map(e => e.id).sort(), ['d-sleep-1', 'm-feed-1']);
    assert.equal(await mum.evaluate(() => Sync.nameOf(db.events.find(e => e.id === 'd-sleep-1').by)), 'Dad');
  });

  await step("Nan joins the same way as a caregiver without health access: she gets the main key only, a health note of Mum's never reaches her phone, her feed reaches everyone, and the family list shows who may do what", async () => {
    await add(mum, { id: 'm-health-1', type: 'health', ts: Date.now() - 1800e3, data: { symptoms: ['fever'], temp: 38.2 }, note: 'warm' });
    await syncNow(mum);
    nan = await phone('nan@x.com'); await toCloud(nan);
    await nan.waitForSelector('[data-fjoin]'); await nan.fill('#oMine', 'Nan'); await nan.click('[data-fjoin]'); await nan.waitForSelector('#wCheck');
    await syncNow(mum); await mum.waitForFunction(() => Sync.st.requests.length === 1);
    const req = await mum.evaluate(() => Sync.st.requests[0]); assert.equal(req.role, 'caregiver'); assert.equal(req.perms.view_health, false);
    await mum.evaluate(r => Sync.decide(r, true, { manualOk: true }), req);
    await mum.evaluate(() => { if (/data-approve/.test($('#sheet').innerHTML)) { $('#sheet').hidden = $('#sheetBack').hidden = true; $('#sheet').innerHTML = ''; } });   // (the request may have popped up meanwhile: decided here)
    await nan.click('#wCheck'); await nan.waitForSelector('#tabs', { timeout: 20000 }); await syncNow(nan);
    await syncNow(dad); await closeSheets(dad);   // (the request popped up on Dad's phone too, a parent's)
    assert.equal(await nan.evaluate(() => db.meta.role), 'caregiver');
    assert.equal(await nan.evaluate(() => E2EE.hasHealthKey(db.meta.babyId)), false, 'no health key');
    assert.deepEqual((await entries(nan)).map(e => e.id).sort(), ['d-sleep-1', 'm-feed-1'], 'the health note stays out');
    await add(nan, { id: 'n-feed-1', type: 'feed', ts: Date.now() - 600e3, data: { kind: 'bottle', ml: 90 } });
    await syncNow(nan); await syncNow(mum); await syncNow(dad);
    assert((await entries(dad)).some(e => e.id === 'n-feed-1'), "Nan's feed reached Dad");
    await goTab(mum, 'family'); await mum.waitForFunction(() => /Nan/.test(document.querySelector('#view').textContent));
    assert.deepEqual(await mum.evaluate(() => Sync.st.people.map(p => [p.display_name, p.role]).sort()), [['Dad', 'parent'], ['Mum', 'parent'], ['Nan', 'caregiver']]);
  });

  await step('pictures: a photo with a big moment goes into the folder sealed, and shows on the other phones', async () => {
    const id = await mum.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#c84'; x.fillRect(0, 0, 64, 48);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); const prep = await Media.fromPhoto(new File([blob], 'p.jpg', { type: 'image/jpeg' }));
      const item = await Media.stage(prep); const k = kids()[0].id;
      db.events.push({ id: 'm-moment-1', type: 'moment', ts: Date.now() - 300e3, data: { what: 'first smile', media: [item] }, note: '', updated: stamp(), by: Auth.id, child: k }); save(); return item.id;
    });
    await syncNow(mum);
    const media = fake.paths().filter(p => /^media\//.test(p)); assert.deepEqual(media.sort(), [`media/${id}`, `media/${id}.t`].sort(), JSON.stringify(fake.paths()));
    await syncNow(dad);
    assert(/^blob:/.test(await dad.evaluate(i => Media.ensure(i + '.t', 'image/jpeg'), id)), "the thumbnail opened on Dad's phone");
  });

  await step('the family tree is sealed in the folder and reaches the other parent; two parents changing it at the same moment both get their change in', async () => {
    await mum.evaluate(() => Sync.editTree(t => { const me = t.parents[0]; return FamilyTree.add(t, 'gp', me.id, { id: FamilyTree.newId(), name: 'Rose', call: 'Nana' }); },
      FamilyTree.clean({ parents: Sync.st.people.filter(p => p.role === 'parent').slice(0, 2).map(p => ({ id: 'u' + p.user_id.replace(/-/g, '').slice(0, 12), name: p.display_name, user: p.user_id })) })));
    assert(fake.paths().includes('tree.json') && sealed(fake.text('tree.json'), ['Rose', 'Nana']), 'sealed in the folder');
    await syncNow(dad);
    assert.equal(await dad.evaluate(() => (Sync.st.tree.parents.find(p => p.gp.length) || { gp: [] }).gp.map(g => g.name).join()), 'Rose');
    // the race: Dad writes (unbeknownst to Mum's phone), then Mum writes on her stale copy; her phone must notice and write again with both
    await dad.evaluate(() => Sync.editTree(t => { const me = t.parents.find(p => p.user === Auth.id) || t.parents[1]; return FamilyTree.add(t, 'gp', me.id, { id: FamilyTree.newId(), name: 'Bill', call: 'Grandpa' }); }));
    await mum.evaluate(() => Sync.editTree(t => { const me = t.parents[0]; return FamilyTree.add(t, 'gp', me.id, { id: FamilyTree.newId(), name: 'Ted', call: 'Grandad' }); }));
    await syncNow(mum); await syncNow(dad);
    const names = p => p.evaluate(() => Sync.st.tree.parents.flatMap(x => x.gp.map(g => g.name)).sort().join());
    assert.equal(await names(mum), 'Bill,Rose,Ted', "Mum's phone has both"); assert.equal(await names(dad), 'Bill,Rose,Ted', "Dad's phone has both");
  });

  await step('offline edits wait and go when the phone is back; the same entry edited on two phones: the newest edit wins everywhere', async () => {
    fake.offline.add('dad@x.com');
    await dad.evaluate(() => { const e = db.events.find(x => x.id === 'm-feed-1'); e.note = 'dad edited offline'; e.updated = stamp(); save(); });
    await dad.evaluate(() => Sync.run(true)); await sleep(400);
    assert.notEqual(await dad.evaluate(() => Sync.st.state), 'ok', 'cannot send while offline');
    await sleep(50); await mum.evaluate(() => { const e = db.events.find(x => x.id === 'm-feed-1'); e.note = 'mum edited later'; e.updated = stamp(); save(); });   // (later by the clock: an edit stamped in the future would wait on the phone until the time came)
    await syncNow(mum);
    fake.offline.delete('dad@x.com'); await syncNow(dad); await syncNow(mum); await syncNow(dad);
    assert.equal(await dad.evaluate(() => db.events.find(x => x.id === 'm-feed-1').note), 'mum edited later');
    assert.equal(await mum.evaluate(() => db.events.find(x => x.id === 'm-feed-1').note), 'mum edited later');
  });

  await step("removing Nan: the folder is no longer shared with her, the keys change (epoch 2), Dad still reads old and new entries, and Nan's phone loses the log at its next sync", async () => {
    const nanId = await nan.evaluate(() => Auth.id);
    await goTab(mum, 'family'); await mum.waitForSelector(`[data-person="${nanId}"]`); await mum.click(`[data-person="${nanId}"]`); await mum.waitForSelector('#pRemove'); await mum.click('#pRemove');
    await mum.waitForFunction(() => document.querySelector('#sheet').hidden && !Sync.st.people.some(p => p.display_name === 'Nan'), { timeout: 30000 });   // (the sheet closes once the removal, unsharing and key change are done)
    assert(!fake.access('nan@x.com'), 'unshared');
    assert.equal(JSON.parse(fake.text('keyring.json')).epoch, 2, 'new keys');
    await add(mum, { id: 'm-feed-2', type: 'feed', ts: Date.now() - 100e3, data: { kind: 'bottle', ml: 100 }, note: 'after' });
    await syncNow(mum); await syncNow(dad);
    assert.equal(await dad.evaluate(() => E2EE.epoch(db.meta.babyId)), 2);
    const ids = (await entries(dad)).map(e => e.id); assert(ids.includes('m-feed-2') && ids.includes('m-feed-1'), 'Dad reads new and old: ' + ids);
    await nan.evaluate(() => Sync.run(true)); await nan.waitForFunction(() => !db.meta.babyId, { timeout: 15000 });
    assert.equal(await nan.evaluate(() => db.events.length), 0, 'nothing of the log stays');
    assert(await nan.$('[data-fconnect], [data-fjoin], #fjCheck'), 'back at the cloud screens');
  });

  await step(`Mum's new phone: the family folder is already in her ${name}; she asks to join and gets straight in with the recovery code; a second new phone is approved from her first phone under Phones waiting for access`, async () => {
    const mum2 = await phone('mum@x.com'); await toCloud(mum2);
    await mum2.waitForSelector('[data-fjoin]'); await mum2.click('[data-fjoin]'); await mum2.waitForSelector('#wRecover');
    await mum2.fill('#wCode', recoveryCode); await mum2.click('#wRecover'); await mum2.waitForSelector('#tabs', { timeout: 20000 });
    await syncNow(mum2); assert.equal(await mum2.evaluate(() => db.meta.role), 'parent'); assert((await entries(mum2)).some(e => e.id === 'm-feed-2'), 'everything is there');
    const mum3 = await phone('mum@x.com'); await toCloud(mum3);
    await mum3.waitForSelector('[data-fjoin]'); await mum3.click('[data-fjoin]'); await mum3.waitForSelector('#wCheck');
    await syncNow(mum); await goTab(mum, 'family'); await mum.waitForSelector('[data-approvephone]', { timeout: 15000 });
    await mum.click('input[name=vchkp]'); await mum.click('[data-approvephone]'); await mum.waitForFunction(() => /Phone approved/.test(document.querySelector('#toast').textContent));
    await mum3.click('#wCheck'); await mum3.waitForSelector('#tabs', { timeout: 20000 }); await syncNow(mum3);
    assert((await entries(mum3)).some(e => e.id === 'm-feed-2'));
    H.mum2 = mum2;
  });

  await step(`a parent leaves (Leave this log): his phone's keys go, the folder leaves his ${name}, and the other parent's phone changes the keys`, async () => {
    await closeSheets(dad); await goTab(dad, 'family'); await dad.waitForSelector('#leave'); await dad.click('#leave'); await dad.waitForFunction(() => !db.meta.babyId, { timeout: 15000 });
    assert(!fake.access('dad@x.com'), 'gone from the share');
    await syncNow(mum); assert.equal(JSON.parse(fake.text('keyring.json')).epoch, 3, 'keys changed by a parent');
    assert.equal(await dad.evaluate(() => db.events.length), 0);
  });

  await step('disconnecting a phone clears it; connecting again finds the family and gets back in with the recovery code; no page errors or CSP violations anywhere', async () => {
    const p = H.mum2;
    await goTab(p, 'more'); await p.waitForSelector('#signOut'); assert(/Disconnect this phone/.test(await p.textContent('#signOut')));
    await p.click('#signOut'); await p.waitForSelector(`[data-fconnect=${cloud}]`, { timeout: 15000 });
    assert.equal(await p.evaluate(() => db.events.length + (db.meta.babyId ? 1 : 0)), 0, 'cleared');
    await connect(p); await p.waitForSelector('[data-fjoin]'); await p.click('[data-fjoin]'); await p.waitForSelector('#wRecover');
    await p.fill('#wCode', recoveryCode); await p.click('#wRecover'); await p.waitForSelector('#tabs', { timeout: 20000 }); await syncNow(p);
    assert((await entries(p)).some(e => e.id === 'm-feed-2'), 'back in');
    for (const q of H.pages) { assert.deepEqual(q.errs, [], 'page errors'); assert.deepEqual(q.csp, [], 'CSP violations'); }
  });

  await H.close();
}

(async () => {
  const which = process.env.FOLDER_CLOUD ? [process.env.FOLDER_CLOUD] : Object.keys(CLOUDS);
  for (const cloud of which) await suite(cloud);
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\n${ok} passed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
