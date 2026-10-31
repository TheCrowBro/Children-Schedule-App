// The family folder: the family's log in their own cloud storage, with no server of ours. Three phones (three cloud accounts) share
// one folder through a fake of the cloud's API (tests/lib/fake-dropbox.js, tests/lib/fake-gdrive.js); the app is built without a
// family server, as the store build is. The whole life of a family folder is walked once per cloud: Dropbox, then Google Drive,
// then iCloud Drive through the Files app (a fake of the app's own folder plugin: no sign-in, a folder picked or made where the
// user chooses, shared from the Files app, people invited by name with a join code),
// including what a member's phone with a modified app could try (rewriting the family list, the tree or the keys, writing entries
// in another's name, a request that claims to be someone else, deleting the key files) and how the other phones hold up.
//   node tests/folder.test.js            (FOLDER_CLOUD=dropbox or =google runs one)
const assert = require('assert');
const { setup } = require('./lib/harness');
const { createFakeDropbox } = require('./lib/fake-dropbox');
const { createFakeGoogleDrive } = require('./lib/fake-gdrive');
const { createFakeFiles } = require('./lib/fake-icloud');
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
  let mum, dad, nan, recoveryCode, uncle;
  const epochNow = () => JSON.parse(fake.text('keyring.json')).epoch;
  const devOf = p => p.evaluate(() => E2EE.device.id);
  const userOf = p => p.evaluate(() => Auth.id);
  const signerOf = path => (JSON.parse(fake.text(path)).s || {}).d;

  await step(`the first screen offers the family's own cloud; ${name} connects through the browser and comes back; a parent starts the log: a Little Log folder is made, with the keys, the recovery key, the children and the family list in it, all scrambled, and a README for the family`, async () => {
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
    const note = fake.text('README.txt'); assert(note && /Little Log – please read/.test(note) && /devices, events, join, keys and media/.test(note), 'the note for the family is in the folder: ' + String(note).slice(0, 80));
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

  await step("the family list and the tree are signed: Nan's phone (a caregiver, with a modified app) rewrites the family list making herself a parent, and puts a stranger on the tree; Mum's phone ignores both, says so, and puts the good copies back; Nan stays a caregiver everywhere", async () => {
    await mum.evaluate(() => Sync.editTree(t => { const me = t.parents[0]; return FamilyTree.add(t, 'gp', me.id, { id: FamilyTree.newId(), name: 'Rose', call: 'Nana' }); },
      FamilyTree.clean({ parents: Sync.st.people.filter(p => p.role === 'parent').slice(0, 2).map(p => ({ id: 'u' + p.user_id.replace(/-/g, '').slice(0, 12), name: p.display_name, user: p.user_id })) })));
    await syncNow(nan); await syncNow(dad);
    await nan.evaluate(async () => {   // (what the app never does: written with the main key every member holds, signed with her own phone's key)
      const b = db.meta.babyId, m = JSON.parse(JSON.stringify(Sync.members())); m.members[Auth.id].role = 'parent'; m.members[Auth.id].perms = null;
      const { blob, epoch } = await E2EE.sealDoc(b, 'members', m);
      await Folder.write('members.json', await Folder.signed(b, 'members', 'members.json', { v: 2, epoch, blob, updated: Date.now(), by: Auth.id, seq: 50 }), 'overwrite');
      await Sync.editTree(t => FamilyTree.add(t, 'gp', t.parents[0].id, { id: FamilyTree.newId(), name: 'Stranger', call: 'Nobody' }));
    });
    assert.equal(signerOf('members.json'), await devOf(nan), "Nan's copy is in the folder");
    await syncNow(mum);
    assert((/family list/.test(await mum.evaluate(() => Sync.st.warn)) && /family tree/.test(await mum.evaluate(() => Sync.st.warn))) || await mum.evaluate(() => Sync.st.repaired >= 2), 'Mum\'s phone says what it would not believe, or already put it back: ' + await mum.evaluate(() => Sync.st.warn + ' / ' + Sync.st.repaired));   // (a sync of its own may have come first)
    assert.deepEqual(await mum.evaluate(() => Sync.st.people.map(p => [p.display_name, p.role]).sort()), [['Dad', 'parent'], ['Mum', 'parent'], ['Nan', 'caregiver']], 'Nan is still a caregiver on Mum\'s phone');
    assert.equal(await mum.evaluate(() => Sync.st.tree.parents.flatMap(x => x.gp.map(g => g.name)).join()), 'Rose', 'the stranger never reached the tree');
    assert(await mum.evaluate(() => Sync.st.repaired >= 2), 'put back: ' + await mum.evaluate(() => Sync.st.repaired));
    assert.equal(signerOf('members.json'), await devOf(mum), "Mum's phone put the family list back"); assert(JSON.parse(fake.text('members.json')).seq > 50, 'newer than the forgery');
    assert.equal(signerOf('tree.json'), await devOf(mum), 'and the tree');
    await syncNow(mum); assert.equal(await mum.evaluate(() => Sync.st.warn), '', 'all well again');
    await syncNow(dad); assert.equal(await dad.evaluate(() => Sync.st.people.find(p => p.display_name === 'Nan').role), 'caregiver');
    await syncNow(nan); assert.equal(await nan.evaluate(() => db.meta.role), 'caregiver', 'her own phone would not believe it either');
    assert.equal(await nan.evaluate(() => Sync.st.tree.parents.flatMap(x => x.gp.map(g => g.name)).join()), 'Rose');
  });

  await step("entries are signed by the phone that wrote them, in its own person's name: Nan's phone writes a file under Dad's phone's name, and an entry of her own that claims Dad made it; neither reaches Mum, while Nan's own entries do", async () => {
    const dadId = await userOf(dad), dadDev = await devOf(dad);
    await nan.evaluate(async ([dadId, dadDev]) => {
      const b = db.meta.babyId, k = kids()[0].id, now = Date.now();
      const x = await E2EE.encryptEntry(b, { id: 'forged-1', type: 'feed', ts: now - 400e3, data: { kind: 'bottle', ml: 999 }, note: 'not dad', updated: now, by: dadId, child: k });
      const p = `events/${dadDev}/000050.json`;
      await Folder.write(p, await Folder.signed(b, 'events', p, { v: 2, device: dadDev, by: dadId, at: now, rows: [{ id: 'forged-1', ...x, updated: now, deleted: false, created_by: dadId }] }), 'add');
      db.events.push({ id: 'forged-2', type: 'feed', ts: now - 300e3, data: { kind: 'bottle', ml: 998 }, note: 'not dad either', updated: stamp(), by: dadId, child: k });
      db.events.push({ id: 'n-feed-2', type: 'feed', ts: now - 200e3, data: { kind: 'bottle', ml: 80 }, note: '', updated: stamp(), by: Auth.id, child: k }); save();
    }, [dadId, dadDev]);
    await syncNow(nan); await syncNow(mum);
    const ids = (await entries(mum)).map(e => e.id);
    assert(!ids.includes('forged-1') && !ids.includes('forged-2'), 'the forgeries stayed out: ' + ids.join(','));
    assert(ids.includes('n-feed-2'), "Nan's own entry came");
    assert(await mum.evaluate(() => Sync.st.bad >= 2), 'counted as bad: ' + await mum.evaluate(() => Sync.st.bad));
  });

  await step("the key files are kept safe: keyring.json and littlelog.json are deleted (or emptied) in the cloud; Mum's phone puts them back at its next sync and Dad carries on", async () => {
    const before = fake.text('keyring.json');
    fake.damage('keyring.json'); fake.damage('littlelog.json');
    assert(!fake.paths().includes('keyring.json'), 'gone');
    await syncNow(mum);
    assert(fake.paths().includes('keyring.json') && fake.paths().includes('littlelog.json'), 'back: ' + fake.paths().join(' '));
    assert.equal(JSON.parse(fake.text('keyring.json')).epoch, JSON.parse(before).epoch, 'the same keys');
    assert.equal(JSON.parse(fake.text('littlelog.json')).root.d, await devOf(mum), 'the root is still Mum\'s first phone');
    await add(mum, { id: 'm-feed-after-repair', type: 'feed', ts: Date.now() - 100e3, data: { kind: 'bottle', ml: 70 } }); await syncNow(mum);
    await syncNow(dad); assert.equal(await dad.evaluate(() => Sync.st.state), 'ok'); assert((await entries(dad)).some(e => e.id === 'm-feed-after-repair'));
  });

  await step("a change of keys must come from a parent's phone: Nan's phone sets new keys of its own (a new epoch, grants it signed); Mum's and Dad's phones keep theirs, Mum's says whose phone did it and sets new keys past it for everyone the chain had reached", async () => {
    const ep = epochNow();
    await nan.evaluate(() => E2EE.rotate(db.meta.babyId, db.baby));   // (what a modified app could do: every member holds the main key)
    assert.equal(epochNow(), ep + 1, 'the forged keys are in the folder');
    await syncNow(mum);
    assert.equal(epochNow(), ep + 2, "Mum's phone set new keys past the forged ones"); assert.equal(signerOf(`keys/${await devOf(mum)}.json`), await devOf(mum));
    assert.equal(await mum.evaluate(() => E2EE.epoch(db.meta.babyId)), ep + 2);
    assert(/keys were changed by Nan's phone/.test(await mum.evaluate(() => Sync.st.warn)), 'says whose phone did it: ' + await mum.evaluate(() => Sync.st.warn));
    await add(mum, { id: 'm-feed-newkeys', type: 'feed', ts: Date.now() - 90e3, data: { kind: 'bottle', ml: 75 } }); await syncNow(mum);
    assert.equal(await mum.evaluate(() => Sync.st.warn), '', 'all well again');
    await syncNow(dad); assert.equal(await dad.evaluate(() => E2EE.epoch(db.meta.babyId)), ep + 2, 'Dad followed the real change'); assert((await entries(dad)).some(e => e.id === 'm-feed-newkeys'));
    await syncNow(nan); assert.equal(await nan.evaluate(() => E2EE.epoch(db.meta.babyId)), ep + 2, 'so did Nan\'s phone (still a member, until a parent removes her)'); assert((await entries(nan)).some(e => e.id === 'm-feed-newkeys'));
    assert.equal(signerOf(`keys/${await devOf(nan)}.json`), await devOf(mum), 'her keys are a parent\'s again');
  });

  await step(`a join code: Mum shares the folder with Uncle and gets a code for him; he types it when he asks to join, so the request shows Verified and ${name}'s word on who wrote it, and Mum approves without reading digits; a request that claims to be Uncle but was written by Nan's account is marked and cannot be approved`, async () => {
    await goTab(mum, 'family'); await openShare(mum); await mum.waitForSelector('#shGo');
    await mum.fill('#shEmail', 'uncle@x.com'); await mum.click('input[name=invrole][value=family]'); await mum.click('#shGo');
    await mum.waitForFunction(() => /join code: [A-Z2-9]{4}-[A-Z2-9]{4}/.test(document.querySelector('#toast').textContent));
    const code = /join code: ([A-Z2-9]{4}-[A-Z2-9]{4})/.exec(await mum.textContent('#toast'))[1];
    await mum.evaluate(() => { document.querySelector('#toast').textContent = ''; });
    await mum.waitForFunction(c => document.querySelector('#view').textContent.includes(c), code);   // (shown by the invitation, for later)
    const uncleId = await nan.evaluate(([prov, acct]) => Folder.memberId(prov, acct), [cloud, fake.account('uncle@x.com')]);
    await nan.evaluate(async uncleId => {   // the forgery: a request in Uncle's name, written by Nan's account
      const id = E2EE.uuid(), d = E2EE.device;
      await Folder.write(`join/${id}.json`, { v: 2, device: id, user: uncleId, pub: d.pub, sig: d.spub, name: 'Uncle', email: 'uncle@x.com', platform: 'web', created: Date.now(), proof: null }, 'overwrite');
    }, uncleId);
    uncle = await phone('uncle@x.com'); await toCloud(uncle);
    await uncle.waitForSelector('[data-fjoin]'); await uncle.fill('#oMine', 'Uncle'); await uncle.fill('#oJoinCode', code.toLowerCase()); await uncle.click('[data-fjoin]'); await uncle.waitForSelector('#wCheck');
    await syncNow(mum); await mum.waitForFunction(() => Sync.st.requests.length === 2);
    const reqs = await mum.evaluate(() => Sync.st.requests.map(r => ({ email: r.email, forged: r.forged, verified: r.qrVerified, attested: r.attested })));
    const real = reqs.find(r => !r.forged), bad = reqs.find(r => r.forged);
    assert(real && real.verified && real.attested && real.email === 'uncle@x.com', 'the real request is verified by the code: ' + JSON.stringify(reqs));
    assert(bad && bad.email === 'nan@x.com', "the forgery is marked, with the account that really wrote it: " + JSON.stringify(reqs));
    assert(/Deny it, and tell the family/.test(await mum.textContent('#sheet')) && !/data-approve/.test(await mum.evaluate(() => $('#sheet').innerHTML)), 'the forgery popped up with Deny only');
    await closeSheets(mum); await mum.evaluate(() => Acct.promptRequests()); await closeSheets(mum);   // (both pop-ups put away: decided on the Family tab below)
    await goTab(mum, 'family'); await mum.waitForFunction(() => document.querySelectorAll('#view [data-approve]').length === 1, null, { timeout: 15000 });
    assert(/Verified: they typed the join code/.test(await mum.textContent('#view')) && /Deny it, and tell the family/.test(await mum.textContent('#view')), 'both cards say what they are');
    await mum.evaluate(() => { const r = Sync.st.requests.find(x => x.forged); return Sync.decide(r, true).then(() => { throw new Error('approved a forgery'); }, () => Sync.decide(r, false)); });
    await closeSheets(mum); await mum.click('#view [data-approve]'); await mum.waitForFunction(() => /Approved/.test(document.querySelector('#toast').textContent));   // (no code to tick: the join code vouched for the phone)
    await uncle.click('#wCheck'); await uncle.waitForSelector('#tabs', { timeout: 20000 }); await syncNow(uncle);
    assert.equal(await uncle.evaluate(() => db.meta.role), 'family'); assert.equal(await uncle.evaluate(() => db.meta.unverified), undefined, 'the keys came with the proof: no code to compare');
    assert((await entries(uncle)).some(e => e.id === 'm-feed-newkeys'));
    await syncNow(dad); await closeSheets(dad);
  });

  await step("only the folder's owner can share it on, when they say so: Mum turns Only my phone can share on; Dad's phone (a parent) can no longer share the folder; Mum turns it off again", async () => {
    await goTab(mum, 'family'); await openShare(mum); await mum.waitForSelector('#ownerShare', { timeout: 15000 });
    await mum.click('#ownerShare'); await mum.waitForFunction(() => /Only this phone can share/.test(document.querySelector('#toast').textContent));
    assert(fake.ownerOnly(), 'the cloud setting changed');
    await closeSheets(dad); await syncNow(dad);
    const r = await dad.evaluate(() => Sync.shareWith(['aunt@x.com'], 'family', null, '').then(() => 'shared', e => 'refused: ' + e.message));
    assert(/^refused/.test(r), r); assert(!fake.access('aunt@x.com'));
    await goTab(mum, 'family'); await openShare(mum); await mum.waitForSelector('#ownerShare'); await mum.click('#ownerShare'); await mum.waitForFunction(() => /Every parent can share/.test(document.querySelector('#toast').textContent));
    assert(!fake.ownerOnly());
  });

  await step(`the family folder moved: ${cloud === 'google' ? 'Mum moves it into another folder of her Drive' : 'Dad moves the shared folder into a folder of his named Media'}; every phone carries on, and what each writes still reaches the others`, async () => {
    fake.relocate(cloud === 'google' ? 'mum@x.com' : 'dad@x.com');
    await syncNow(mum); await syncNow(dad);
    assert.equal(await mum.evaluate(() => Sync.st.state), 'ok'); assert.equal(await dad.evaluate(() => Sync.st.state), 'ok');
    await add(dad, { id: 'd-feed-moved', type: 'feed', ts: Date.now() - 85e3, data: { kind: 'bottle', ml: 40 } }); await syncNow(dad); await syncNow(mum);
    assert((await entries(mum)).some(e => e.id === 'd-feed-moved'), "Dad's entry reached Mum");
    await add(mum, { id: 'm-feed-moved', type: 'feed', ts: Date.now() - 84e3, data: { kind: 'bottle', ml: 45 } }); await syncNow(mum); await syncNow(dad);
    assert((await entries(dad)).some(e => e.id === 'm-feed-moved'), "Mum's entry reached Dad");
    assert.equal(await dad.evaluate(() => Sync.st.warn), ''); assert(fake.paths().includes('README.txt') && !fake.paths().some(p => /^media\/little log/i.test(p)), 'the folder reads as itself: ' + fake.paths().filter(p => !/^(events|keys|devices)\//.test(p)).join(' '));
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

  await step(`the cloud's sign-in lapses (${name} rejects the phone's token): the phone keeps the log and offers Reconnect; signing in again through the browser resumes the sync`, async () => {
    fake.expired.add('dad@x.com');
    await dad.evaluate(() => Sync.run(true)); await dad.waitForFunction(() => Sync.st.reconnect === true, null, { timeout: 10000 });
    assert(await dad.evaluate(() => !!db.meta.babyId && db.events.length > 0), 'nothing cleared');
    await goTab(dad, 'family'); await dad.waitForSelector('#fReconnect');
    const n = await dad.evaluate(() => window.__calls.filter(c => c[0] === 'Browser.open').length);
    await dad.click('#fReconnect'); await dad.waitForFunction(k => window.__calls.filter(c => c[0] === 'Browser.open').length > k, n);
    const u = new URL(await dad.evaluate(() => window.__calls.filter(c => c[0] === 'Browser.open').pop()[1])); assert.equal(u.hostname, CL.host);
    fake.expired.delete('dad@x.com');
    await dad.evaluate(url => window.__emit('appUrlOpen', { url }), CL.back(u.searchParams.get('state')));
    await dad.waitForFunction(() => Sync.st.state === 'ok' && !Sync.st.reconnect, null, { timeout: 15000 });
    await add(dad, { id: 'd-feed-3', type: 'feed', ts: Date.now() - 50e3, data: { kind: 'bottle', ml: 60 } }); await syncNow(dad); await syncNow(mum);
    assert((await entries(mum)).some(e => e.id === 'd-feed-3'), 'syncing again');
  });

  await step("removing Nan: the folder is no longer shared with her, the keys change (epoch 2), Dad still reads old and new entries, and Nan's phone loses the log at its next sync", async () => {
    const nanId = await nan.evaluate(() => Auth.id);
    await goTab(mum, 'family'); await mum.waitForSelector(`[data-person="${nanId}"]`); await mum.click(`[data-person="${nanId}"]`); await mum.waitForSelector('#pRemove'); await mum.click('#pRemove');
    await mum.waitForFunction(() => document.querySelector('#sheet').hidden && !Sync.st.people.some(p => p.display_name === 'Nan'), { timeout: 30000 });   // (the sheet closes once the removal, unsharing and key change are done)
    assert(!fake.access('nan@x.com'), 'unshared');
    assert.equal(epochNow(), 4, 'new keys');
    await add(mum, { id: 'm-feed-2', type: 'feed', ts: Date.now() - 100e3, data: { kind: 'bottle', ml: 100 }, note: 'after' });
    await syncNow(mum); await syncNow(dad);
    assert.equal(await dad.evaluate(() => E2EE.epoch(db.meta.babyId)), 4);
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
    assert.equal(signerOf(`keys/${await devOf(mum2)}.json`), 'recovery', 'its grant is signed with the recovery key'); assert.equal(await mum2.evaluate(() => Sync.trust().root.d), await devOf(mum), 'it checks the chain from the root');
    await add(mum2, { id: 'm2-feed-1', type: 'feed', ts: Date.now() - 80e3, data: { kind: 'bottle', ml: 65 } }); await syncNow(mum2); await syncNow(dad); assert((await entries(dad)).some(e => e.id === 'm2-feed-1'), 'what it writes counts on the other phones');
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
    await syncNow(mum); assert.equal(epochNow(), 5, 'keys changed by a parent');
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
  });

  await step("a folder from before signing (no root, nothing signed): the first parent's phone to sync becomes the root and signs what is there; Mum's other phone takes the root from the folder and what each writes reaches the other; no page errors or CSP violations anywhere", async () => {
    const p = H.mum2;
    fake.strip();
    for (const q of [mum, p]) await q.evaluate(async () => { delete db.meta.ftrust; delete db.meta.fgood; save(true); await E2EE.ensureDevice(); });   // (phones that never saw a root; their records get the signing keys back)
    await syncNow(mum);
    assert.equal(JSON.parse(fake.text('littlelog.json')).root.d, await devOf(mum), "Mum's phone is the root now"); assert.equal(signerOf('members.json'), await devOf(mum), 'the family list signed');
    assert.equal(await mum.evaluate(() => Sync.trust().root.d), await devOf(mum));
    await syncNow(p); assert.equal(await p.evaluate(() => Sync.trust() && Sync.trust().root.d), await devOf(mum), 'the other phone took the root');
    await add(p, { id: 'p-feed-legacy', type: 'feed', ts: Date.now() - 60e3, data: { kind: 'bottle', ml: 55 } }); await syncNow(p); await syncNow(mum);
    assert((await entries(mum)).some(e => e.id === 'p-feed-legacy'), 'its entries count'); assert.equal(await mum.evaluate(() => Sync.st.warn), '');
    for (const q of H.pages) { assert.deepEqual(q.errs, [], 'page errors'); assert.deepEqual(q.csp, [], 'CSP violations'); }
  });

  await H.close();
}

/** iCloud Drive: the Files app's folder, through the app's own plugin (faked). Differs from the clouds in what the family does by hand:
    sharing and unsharing happen in the Files app (the fake's shareWith / unshareWith stand for that), a relative picks the shared folder
    in the Files app's picker (willPick), nobody's email is known (people are invited by name, found again by their join code), and the
    cloud says nothing about who wrote a request. */
async function suiteFiles() {
  const H = await setup({ port: 8163, noDb: true, config: { appScheme: 'app.littlelog.newborn' } });   // (no cloud keys: iCloud Drive needs none; the folder plugin is the fake)
  const fake = createFakeFiles(), sleep = H.sleep, syncNow = H.syncNow, entries = H.entries, name = fake.label;
  console.log(`\n-- ${name} (the Files app) --`);
  const phone = (email, opts = {}) => H.device({ welcome: true, ...opts, routes: ctx => fake.install(ctx, email) });
  const connect = async p => { await p.click('[data-fconnect=icloud]'); await p.waitForSelector('#oCreate'); };
  const toCloud = async p => { await p.waitForSelector('#wShare'); await p.click('#wShare'); await p.waitForSelector('[data-fconnect=icloud]'); await connect(p); };
  const goTab = async (p, t) => { await p.click(`[data-tab=${t}]`); await sleep(80); };
  const openShare = async p => { if (!(await p.evaluate(() => (document.querySelector('details.secshare') || {}).open))) await p.click('details.secshare > summary'); };
  const closeSheets = p => p.evaluate(() => { if (!$('#sheet').hidden) { $('#sheet').hidden = $('#sheetBack').hidden = true; $('#sheet').innerHTML = ''; } });
  const sealed = (text, words) => words.every(w => !text.includes(w));
  const add = (p, e) => p.evaluate(e => { const k = kids()[0].id; db.events.push({ note: '', updated: stamp(), by: Auth.id, child: k, ...e }); save(); }, e);
  const shareByName = async (p, who, role, perms) => {
    await goTab(p, 'family'); await openShare(p); await p.waitForSelector('#shGo');
    await p.fill('#shEmail', who); await p.click(`input[name=invrole][value=${role}]`);
    for (const [k, v] of Object.entries(perms || {})) { const c = await p.$(`input[name=invperm][value=${k}]`); if (c && (await c.isChecked()) !== v) await c.click(); }
    await p.click('#shGo'); await p.waitForFunction(() => /join code: [A-Z2-9]{4}-[A-Z2-9]{4}/.test(document.querySelector('#toast').textContent));
    const code = /join code: ([A-Z2-9]{4}-[A-Z2-9]{4})/.exec(await p.textContent('#toast'))[1]; await p.evaluate(() => { document.querySelector('#toast').textContent = ''; });
    return code;
  };
  const joinWith = async (p, who, code, email) => {   // the Files app: the folder is picked there
    await p.fill('#oMine', who); if (code) await p.fill('#oJoinCode', code);
    fake.willPick(email); await p.click('#fjPick'); await p.waitForSelector('#wCheck');
  };
  let mum, dad, nan, recoveryCode;

  await step(`${name} on the first screen connects at once (no browser, no sign-in); a parent starts the log: the folder is made where she chooses, with the keys, the recovery key, the children, the family list and the README in it, all but the README scrambled`, async () => {
    mum = await phone('mum@x.com');
    await mum.waitForSelector('#wShare'); await mum.click('#wShare'); await mum.waitForSelector('[data-fconnect=icloud]');
    assert(/Files app/.test(await mum.textContent('#view')), 'says the folder is shared from the Files app');
    await connect(mum);
    assert.equal(await mum.evaluate(() => window.__calls.filter(c => c[0] === 'Browser.open').length), 0, 'no browser opened');
    assert(/iCloud Drive connected/.test(await mum.textContent('#view')), 'connected, no email to show');
    await mum.fill('#oMine', 'Mum'); await mum.fill('#oName', 'Leo'); await mum.click('input[name=oSex][value=boy]');
    await mum.click('#oCreate'); await mum.waitForSelector('#rcDone', { timeout: 20000 });
    recoveryCode = (await mum.textContent('#view .code')).trim(); assert(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/.test(recoveryCode), 'a recovery code: ' + recoveryCode);
    await mum.click('input[name=rcAck]'); await mum.click('#rcDone'); await mum.waitForSelector('#tabs');
    const fo = fake.only(); assert.equal(fo.owner, 'mum@x.com'); assert(/^Little Log/.test(fo.name), fo.name);
    const paths = fake.paths();
    for (const p of ['littlelog.json', 'keyring.json', 'recovery.json', 'profile.json', 'members.json', 'README.txt']) assert(paths.includes(p), p + ' in ' + paths.join(' '));
    for (const p of ['profile.json', 'members.json', 'recovery.json', 'keyring.json']) assert(sealed(fake.text(p), ['Leo', 'Mum', 'mum@x.com']), p + ' holds no plain names');
    await syncNow(mum); assert.equal(await mum.evaluate(() => Sync.st.state), 'ok'); assert.equal(await mum.evaluate(() => db.meta.role), 'parent');
  });

  await step('an entry becomes a sealed events file; a sync with nothing new is one listing of the folder', async () => {
    await add(mum, { id: 'm-feed-1', type: 'feed', ts: Date.now() - 3600e3, data: { kind: 'bottle', ml: 120 }, note: 'first bottle' });
    await syncNow(mum);
    const ev = fake.paths().filter(p => /^events\//.test(p)); assert.equal(ev.length, 1, JSON.stringify(fake.paths()));
    assert(sealed(fake.text(ev[0]), ['first bottle', '"kind"', '120']), 'sealed');
    const n = fake.calls.length; await syncNow(mum); assert.deepEqual(fake.calls.slice(n), fake.idle, 'nothing new: ' + fake.calls.slice(n).join(','));
  });

  let dadCode;
  await step("sharing by name: Mum shares with Dad (a parent) from the Family tab; the Files app's sharing opens (she adds him there), and she gets his join code; the invitation shows his name and the code", async () => {
    dadCode = await shareByName(mum, 'Dad', 'parent');
    assert(fake.calls.includes('share-sheet'), "the Files app's sharing opened");
    fake.shareWith('dad@x.com');   // (what Mum does in the share sheet: Collaborate, add his Apple ID)
    await mum.waitForFunction(() => /Dad/.test(document.querySelector('#view').textContent) && /Shared, not joined yet/.test(document.querySelector('#view').textContent));
    assert((await mum.textContent('#view')).includes(dadCode), 'the code is shown for later');
  });

  await step('Dad installs the app, connects iCloud Drive, types the join code and picks the shared folder in the Files app; his request shows Verified on Mum\'s phone, she approves without a code to compare, and he is in as a parent; entries flow both ways', async () => {
    dad = await phone('dad@x.com'); await toCloud(dad);
    assert(/Choose the shared folder/.test(await dad.textContent('#view')), 'the join card says to choose the folder');
    await joinWith(dad, 'Dad', dadCode, 'dad@x.com');
    await syncNow(mum); await mum.waitForFunction(() => Sync.st.requests.length === 1);
    const r = await mum.evaluate(() => ({ ...Sync.st.requests[0], fingerprint: undefined }));
    assert(r.qrVerified && r.display_name === 'Dad' && r.role === 'parent' && !r.attested && !r.forged, 'verified by the code, no email: ' + JSON.stringify(r));
    await closeSheets(mum); await mum.evaluate(() => Acct.promptRequests()); await closeSheets(mum);
    await goTab(mum, 'family'); await mum.waitForSelector('#view [data-approve]'); await mum.click('#view [data-approve]'); await mum.waitForFunction(() => /Approved/.test(document.querySelector('#toast').textContent));
    assert(!/Shared, not joined yet/.test(await mum.textContent('#view')), 'the invitation is used up');
    await dad.click('#wCheck'); await dad.waitForSelector('#tabs', { timeout: 20000 }); await syncNow(dad);
    assert.equal(await dad.evaluate(() => db.meta.role), 'parent'); assert.equal(await dad.evaluate(() => db.meta.unverified), undefined, 'the keys came with the proof');
    assert.deepEqual((await entries(dad)).map(e => e.id), ['m-feed-1']);
    await add(dad, { id: 'd-sleep-1', type: 'sleep', ts: Date.now() - 7200e3, end: Date.now() - 5400e3, data: {}, note: 'nap' });
    await syncNow(dad); await syncNow(mum);
    assert.deepEqual((await entries(mum)).map(e => e.id).sort(), ['d-sleep-1', 'm-feed-1']);
    assert.equal(await mum.evaluate(() => Sync.nameOf(db.events.find(e => e.id === 'd-sleep-1').by)), 'Dad');
  });

  await step('Nan joins as a caregiver without health access, with her own join code (on iCloud Drive the code is what ties a request to its invitation: no email is known); a health note never reaches her phone', async () => {
    await add(mum, { id: 'm-health-1', type: 'health', ts: Date.now() - 1800e3, data: { symptoms: ['fever'], temp: 38.2 }, note: 'warm' }); await syncNow(mum);
    const nanCode = await shareByName(mum, 'Nan', 'caregiver', { view_health: false }); fake.shareWith('nan@x.com');
    nan = await phone('nan@x.com'); await toCloud(nan); await joinWith(nan, 'Nan', nanCode, 'nan@x.com');
    await syncNow(mum); await mum.waitForFunction(() => Sync.st.requests.length === 1);
    const req = await mum.evaluate(() => Sync.st.requests[0]); assert.equal(req.role, 'caregiver'); assert.equal(req.perms.view_health, false); assert(req.qrVerified, 'verified by her code');
    await mum.evaluate(r => Sync.decide(r, true), req); await closeSheets(mum);
    await nan.click('#wCheck'); await nan.waitForSelector('#tabs', { timeout: 20000 }); await syncNow(nan);
    await syncNow(dad); await closeSheets(dad);
    assert.equal(await nan.evaluate(() => db.meta.role), 'caregiver'); assert.equal(await nan.evaluate(() => E2EE.hasHealthKey(db.meta.babyId)), false);
    assert.deepEqual((await entries(nan)).map(e => e.id).sort(), ['d-sleep-1', 'm-feed-1'], 'the health note stays out');
  });

  await step("the signatures hold over plain files too: Nan's phone rewrites the family list making herself a parent; Mum's phone ignores it and puts the list back", async () => {
    await nan.evaluate(async () => {
      const b = db.meta.babyId, m = JSON.parse(JSON.stringify(Sync.members())); m.members[Auth.id].role = 'parent'; m.members[Auth.id].perms = null;
      const { blob, epoch } = await E2EE.sealDoc(b, 'members', m);
      await Folder.write('members.json', await Folder.signed(b, 'members', 'members.json', { v: 2, epoch, blob, updated: Date.now(), by: Auth.id, seq: 50 }), 'overwrite');
    });
    await syncNow(mum);
    assert(/family list/.test(await mum.evaluate(() => Sync.st.warn)) || await mum.evaluate(() => Sync.st.repaired >= 1), 'said, or already put back: ' + await mum.evaluate(() => Sync.st.warn + ' / ' + Sync.st.repaired));   // (a sync of its own may have come first)
    assert.equal(await mum.evaluate(() => Sync.st.people.find(p => p.display_name === 'Nan').role), 'caregiver');
    assert.equal((JSON.parse(fake.text('members.json')).s || {}).d, await mum.evaluate(() => E2EE.device.id), "Mum's phone put it back");
    await syncNow(nan); assert.equal(await nan.evaluate(() => db.meta.role), 'caregiver');
  });

  await step("a deleted keyring.json comes back from Mum's phone; removing Nan changes the keys, and once Mum takes her off the folder in the Files app her phone loses the log at its next sync", async () => {
    fake.damage('keyring.json'); await syncNow(mum); assert(fake.paths().includes('keyring.json'), 'back');
    const ep = JSON.parse(fake.text('keyring.json')).epoch, nanId = await nan.evaluate(() => Auth.id);
    await goTab(mum, 'family'); await mum.waitForSelector(`[data-person="${nanId}"]`); await mum.click(`[data-person="${nanId}"]`); await mum.waitForSelector('#pRemove'); await mum.click('#pRemove');
    await mum.waitForFunction(() => document.querySelector('#sheet').hidden && !Sync.st.people.some(p => p.display_name === 'Nan'), { timeout: 30000 });
    assert.equal(JSON.parse(fake.text('keyring.json')).epoch, ep + 1, 'new keys');
    fake.unshareWith('nan@x.com');   // (what Mum does in the Files app: Manage shared folder → remove)
    await nan.evaluate(() => Sync.run(true)); await nan.waitForFunction(() => !db.meta.babyId, { timeout: 15000 });
    assert.equal(await nan.evaluate(() => db.events.length), 0, 'nothing of the log stays');
    await add(mum, { id: 'm-feed-2', type: 'feed', ts: Date.now() - 100e3, data: { kind: 'bottle', ml: 100 } }); await syncNow(mum); await syncNow(dad);
    assert((await entries(dad)).some(e => e.id === 'm-feed-2'), 'Dad reads on with the new keys');
  });

  await step("Mum's new phone picks the folder in the Files app and gets straight in with the recovery code; no page errors or CSP violations anywhere", async () => {
    const mum2 = await phone('mum@x.com'); await toCloud(mum2); await joinWith(mum2, 'Mum', null, 'mum@x.com');
    await mum2.waitForSelector('#wRecover'); await mum2.fill('#wCode', recoveryCode); await mum2.click('#wRecover'); await mum2.waitForSelector('#tabs', { timeout: 20000 });
    await syncNow(mum2); assert.equal(await mum2.evaluate(() => db.meta.role), 'parent'); assert((await entries(mum2)).some(e => e.id === 'm-feed-2'), 'everything is there');
    assert.equal(await mum2.evaluate(() => Sync.trust().root.d), await mum.evaluate(() => E2EE.device.id), 'the chain from the root');
    for (const q of H.pages) { assert.deepEqual(q.errs, [], 'page errors'); assert.deepEqual(q.csp, [], 'CSP violations'); }
  });

  await H.close();
}

(async () => {
  const which = process.env.FOLDER_CLOUD ? [process.env.FOLDER_CLOUD] : [...Object.keys(CLOUDS), 'icloud'];
  for (const cloud of which) await (cloud === 'icloud' ? suiteFiles() : suite(cloud));
  console.log(failed ? `\n${failed} FAILED, ${ok} passed` : `\n${ok} passed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
