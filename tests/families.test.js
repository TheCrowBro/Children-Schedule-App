// More than one family: someone with their own family log who also looks after a sister's children and, now and then, a
// brother-in-law's. The family tree in the Family tab shows every family log they are in; another family is added by scanning
// an invite from one of its parents (who approves it), requests to join any family they are a parent in are approved from the
// tree, and switching between families is quick and loses nothing, even offline.   node tests/families.test.js
const assert = require('assert');
/* global Store */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, +process.env.LINES || 9).join('\n    ')); } };

(async () => {
  const H = await setup({ port: 8135 }), { syncNow } = H;
  try {
    const { page: J } = await H.createLog('jo@x.com', 'Leo', 'Jo');        // you, with your own family
    const { page: S } = await H.createLog('sarah@x.com', 'Ava', 'Sarah');  // your sister
    const { page: T } = await H.createLog('tom@x.com', 'Noah', 'Tom');     // your brother-in-law
    const invite = (P, role, perms) => P.evaluate(([r, p]) => Sync.createInvite(r, p).then(x => x.code), [role, perms]);
    const approveAll = async P => { await P.evaluate(() => Sync.loadAdmin()); for (const r of await P.evaluate(() => Sync.st.requests)) await P.evaluate(x => Sync.decide(x, true, { manualOk: true }), r); };
    const tree = () => J.evaluate(() => [...document.querySelectorAll('.ftree .fam')].map(f => ({
      name: f.querySelector('.fhead b') ? f.querySelector('.fhead b').textContent : '', pending: f.classList.contains('pending'), on: f.classList.contains('on'),
      kids: [...f.querySelectorAll('.fkid')].map(k => k.lastChild.textContent.trim()), role: (f.querySelector('.fhead small') || {}).textContent || '',   // (a child's name comes after the initial in its circle)
    })));
    const family = () => J.evaluate(() => { tab = 'family'; render(); });
    const askToJoin = async code => {
      await family(); await J.evaluate(() => { document.querySelector('#toast').textContent = ''; });
      await J.click('#famAdd'); await J.fill('#afCode', code); await J.click('#afJoin');
      await J.waitForFunction(() => /Request sent/.test(document.querySelector('#toast').textContent));
    };
    const ids = {};
    for (const [k, P] of [['jo', J], ['sarah', S], ['tom', T]]) ids[k] = await P.evaluate(() => db.meta.babyId);
    await J.evaluate(() => { const k = kids()[0].id; db.events.push({ id: 'jo-own', type: 'feed', ts: Date.now() - 3600e3, data: { kind: 'bottle', ml: 120 }, note: 'at home', updated: stamp(), by: Auth.id, child: k }); save(); });
    await syncNow(J);
    await S.evaluate(() => { const k = kids()[0].id; db.events.push({ id: 'sarah-1', type: 'sleep', ts: Date.now() - 7200e3, end: Date.now() - 5400e3, data: {}, note: 'nap', updated: stamp(), by: Auth.id, child: k }); save(); });
    await syncNow(S);

    await step('the Family tab starts with a family tree: you, and your family with its children; "Add a family" says how to join another', async () => {
      await family();
      assert.deepEqual(await tree(), [{ name: 'Your family', pending: false, on: true, kids: ['Leo'], role: 'Parent' }]);
      assert(/You/.test(await J.textContent('.ftree .froot')));
      assert.equal(await J.isVisible('#famSw'), false, 'no family switcher with one family');
      await J.click('#famAdd');
      assert(/Looking after someone else's children\? Ask one of their parents/.test(await J.textContent('#sheet')) && await J.isVisible('#afScan') && await J.isVisible('#afCode'));
      await J.click('#sheet [data-close]');
    });

    await step('asking to join the sister\'s family: the request waits on the tree; once she approves, her family appears, named after her, with her children', async () => {
      await askToJoin(await invite(S, 'family', {}));   // (as family: relatives' families are the family tree)
      assert.deepEqual((await tree()).map(f => [f.pending, f.name]), [[false, 'Your family'], [true, '']]);
      assert(/Waiting for a parent to approve/.test(await J.textContent('.ftree .fam.pending')));
      await approveAll(S);
      // the tree looks again every 15 seconds while a request waits
      await J.waitForFunction(() => document.querySelectorAll('.ftree .fam:not(.pending)').length === 2, null, { timeout: 40000 });
      assert(/You're in: Sarah's family/.test(await J.textContent('#toast')));
      assert.deepEqual(await tree(), [{ name: 'Your family', pending: false, on: true, kids: ['Leo'], role: 'Parent' }, { name: "Sarah's family", pending: false, on: false, kids: ['Ava'], role: 'Family member' }]);
      assert(/Family: Sarah/.test(await J.textContent(`.ftree .fam[data-fam="${ids.sarah}"]`)), 'with the relatives in it');
      assert.equal(await J.isVisible('#famSw'), true, 'the switcher at the top, now there are two'); assert(/Your family/.test(await J.textContent('#famSw')));
    });

    await step('opening the sister\'s family shows her children and her log; what is logged there reaches her phone', async () => {
      await J.click(`[data-famopen="${ids.sarah}"]`);
      await J.waitForFunction(id => db.meta.babyId === id && !Sync.switching, ids.sarah);
      assert(/Now showing Sarah's family/.test(await J.textContent('#toast')));
      await syncNow(J);
      const r = await J.evaluate(() => ({ kids: kids().map(k => k.name), events: db.events.map(e => e.id), role: db.meta.role, top: document.querySelector('#famSw').textContent }));
      assert.deepEqual(r.kids, ['Ava']); assert(r.events.includes('sarah-1') && !r.events.includes('jo-own'), JSON.stringify(r.events)); assert.equal(r.role, 'family'); assert(/Sarah's family/.test(r.top));
      await J.evaluate(() => { db.events.push({ id: 'jo-at-sarahs', type: 'diaper', ts: Date.now() - 600e3, data: { pee: true }, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id }); save(); });
      await syncNow(J); await syncNow(S);
      assert(await S.evaluate(() => db.events.some(e => e.id === 'jo-at-sarahs')), 'Sarah sees it');
      await family(); assert.deepEqual((await tree()).map(f => [f.name, f.on]), [['Your family', false], ["Sarah's family", true]]);
      // joined with a typed code, not the QR code: her keys came early (for the tree), but the security code must still be compared
      assert(/Check this security code/.test(await J.textContent('#view')), 'asked to compare the security code');
    });

    await step('switching back is instant and loses nothing, even offline: a change not sent yet stays with its family and goes when it is open again', async () => {
      J.context().__down = true;   // no connection
      await J.evaluate(() => { db.events.push({ id: 'offline-at-sarahs', type: 'feed', ts: Date.now() - 300e3, data: { kind: 'bottle', ml: 90 }, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id }); save(); });
      await J.click('#famSw'); await J.waitForSelector('#sheet [data-fampick]');
      assert.deepEqual(await J.$$eval('#sheet [data-fampick] b', b => b.map(x => x.textContent)), ['Your family', "Sarah's family"]);
      await J.click(`#sheet [data-fampick="${ids.jo}"]`);
      await J.waitForFunction(id => db.meta.babyId === id && !Sync.switching, ids.jo);
      const r = await J.evaluate(async () => ({ kids: kids().map(k => k.name), events: db.events.map(e => e.id), kept: await Store.parkedIds(), unsent: await Sync.unsentKept() }));
      assert.deepEqual(r.kids, ['Leo']); assert.deepEqual(r.events, ['jo-own'], 'your own family, from the phone (no connection needed)');
      assert.deepEqual(r.kept, [ids.sarah], "the sister's family is kept on the phone"); assert.deepEqual(r.unsent, { [ids.sarah]: 1 });
      await family(); await J.waitForFunction(id => /1 change not sent yet: it goes when you open this family/.test(document.querySelector(`.ftree .fam[data-fam="${id}"]`).textContent), ids.sarah);
      J.context().__down = false;
      await J.click(`[data-famopen="${ids.sarah}"]`); await J.waitForFunction(id => db.meta.babyId === id && !Sync.switching, ids.sarah);
      await syncNow(J); await syncNow(S);
      assert(await S.evaluate(() => db.events.some(e => e.id === 'offline-at-sarahs')), 'sent once the family was open again');
      assert(await J.evaluate(() => db.events.some(e => e.id === 'jo-at-sarahs') && db.events.some(e => e.id === 'sarah-1')), 'her family kept everything too');
      assert.deepEqual(await J.evaluate(() => Store.parkedIds()), [ids.jo], 'now your own family is the one kept');
    });

    let G;
    await step('requests to join any family she is a parent in wait on the tree, to approve without leaving the family she is looking at', async () => {
      J.context().__down = false;
      await J.click('#famSw'); await J.click(`#sheet [data-fampick="${ids.jo}"]`); await J.waitForFunction(id => db.meta.babyId === id && !Sync.switching, ids.jo);
      const code = await invite(J, 'family', { add_entries: true, view_people: true });
      await J.evaluate(() => { tab = 'family'; render(); }); await J.click(`[data-famopen="${ids.sarah}"]`); await J.waitForFunction(id => db.meta.babyId === id && !Sync.switching, ids.sarah);
      G = await H.device(); await H.signIn(G, 'gran@x.com'); await G.waitForSelector('#oJoin');
      await G.evaluate(c => Sync.requestJoin(c, 'Gran', null), code);
      await J.evaluate(() => Sync.loadFamilyRequests()); await family();
      const card = await J.textContent(`.ftree .fam[data-fam="${ids.jo}"]`);
      assert(/Gran/.test(card) && /asked to join Your family as Family member/.test(card), card);
      const rid = await J.evaluate(id => Sync.st.familyRequests[id][0].id, ids.jo);
      await J.click(`[data-approve="${rid}"]`); assert(/Compare the security code/.test(await J.textContent('#toast')), 'not without comparing the security code');
      await J.click(`.ftree input[name=vchk][value="${rid}"]`); await J.click(`[data-approve="${rid}"]`);
      await J.waitForFunction(() => /Approved/.test(document.querySelector('#toast').textContent));
      assert.equal(await J.evaluate(() => db.meta.babyId), ids.sarah, 'still looking at the sister\'s family');
      assert.equal(await G.evaluate(() => Sync.checkApproval()), true, 'Gran is in');
      await syncNow(G); assert.deepEqual(await G.evaluate(() => [kids().map(k => k.name), db.events.map(e => e.id)]), [['Leo'], ['jo-own']], 'and sees your family');
    });

    let A;
    await step('the family shown lists its family and, apart from them, its caregivers, babysitters and medical assistants; a parent retires one who no longer helps', async () => {
      await J.click('#famSw'); await J.click(`#sheet [data-fampick="${ids.jo}"]`); await J.waitForFunction(id => db.meta.babyId === id && !Sync.switching, ids.jo);
      const code = await invite(J, 'medical', {});
      A = await H.device(); await H.signIn(A, 'amy@x.com'); await A.waitForSelector('#oJoin');
      await A.evaluate(c => Sync.requestJoin(c, 'Amy', null), code); await approveAll(J);
      assert.equal(await A.evaluate(() => Sync.checkApproval()), true); await syncNow(A);
      await A.evaluate(() => Sync.setMyDetails({ relation: 'Visiting nurse', phone: '(555) 010-2468', work: 'Westside Pediatrics', workPhone: '', notes: '' }));
      await A.evaluate(() => { db.events.push({ id: 'amy-1', type: 'health', ts: Date.now() - 900e3, data: { temp: 37.2 }, note: 'checkup', updated: stamp(), by: Auth.id, child: kids()[0].id }); save(); });
      await syncNow(A); await syncNow(J);
      const amy = await A.evaluate(() => Auth.id), gran = await G.evaluate(() => Auth.id);
      await J.evaluate(() => Sync.loadPeople()); await family();
      const lists = await J.evaluate(() => [...document.querySelectorAll('#view h2')].map(h => h.textContent));
      assert(lists.includes('Family') && lists.includes('Caregivers and helpers'), JSON.stringify(lists));
      const helpers = await J.textContent('#helpers');
      assert(/Amy/.test(helpers) && /Medical assistant/.test(helpers) && !/Gran/.test(helpers), helpers);
      assert.equal(await J.$$eval(`[data-retire="${gran}"]`, x => x.length), 0, 'relatives are never retired');
      await J.click(`#helpers [data-pview="${amy}"]`);
      const card = await J.textContent('#sheet'); assert(/\(555\) 010-2468/.test(card) && /Westside Pediatrics/.test(card) && /Visiting nurse/.test(card), 'her details: ' + card);
      await J.click('#pvRetire');
      assert(/Retire Amy/.test(await J.textContent('#sheet h3')) && /Their access ends now/.test(await J.textContent('#sheet')));
      await J.click('#sheet input[name=rtWhy][value=moved]'); await J.click('#rtGo');
      await J.waitForFunction(() => /Amy is retired/.test(document.querySelector('#toast').textContent));
      // her access ends: her phone loses the family
      await syncNow(A); assert.equal(await A.evaluate(() => db.meta.babyId), null, 'no access any more');
      // she stays on the Retired list, with her details, and her entries still say who added them
      await family(); const ret = await J.textContent('#helpers details.retired'); assert(/Retired \(1\)/.test(ret) && /Amy/.test(ret) && /Moved away/.test(ret), ret);
      assert.equal(await J.evaluate(u => Sync.nameOf(u), amy), 'Amy', 'her entries still say who added them');
      assert(!/Amy/.test(await J.evaluate(() => [...document.querySelectorAll('#helpers > .stat')].map(x => x.textContent).join())), 'no longer among the helpers');
      assert((await J.evaluate(() => Sync.activity().then(r => r.map(l => l.action)))).includes('member_retired'), 'in the activity log');
      await J.evaluate(() => { document.querySelector('#helpers details.retired').open = true; });
      await J.click('#helpers [data-rview]'); assert(/Westside Pediatrics/.test(await J.textContent('#sheet')), 'her details are kept');
      await J.click('#rtForget'); await J.waitForFunction(() => !document.querySelector('#helpers details.retired'));
    });

    await step('a family she helps with (not a relative\'s) is listed apart from the family tree, named after its children; a request still waiting can be cancelled', async () => {
      await askToJoin(await invite(T, 'babysitter', { add_entries: true }));
      assert.equal((await tree()).filter(f => f.pending).length, 1);
      await J.click('.ftree .fam.pending [data-cancelreq]'); await J.waitForFunction(() => !document.querySelector('.ftree .fam.pending'));
      await askToJoin(await invite(T, 'babysitter', { add_entries: true }));
      await approveAll(T);
      await J.waitForFunction(() => document.querySelectorAll('.fhelp .fam').length === 1, null, { timeout: 40000 });
      assert.deepEqual((await tree()).map(f => [f.name, f.kids.join(), f.role]), [['Your family', 'Leo', 'Parent'], ["Sarah's family", 'Ava', 'Family member']], 'the family tree: relatives only');
      const helped = await J.evaluate(() => [...document.querySelectorAll('.fhelp .fam')].map(f => [f.querySelector('.fhead b').textContent, f.querySelector('.fhead small').textContent]));
      assert.deepEqual(helped, [['Noah', 'Babysitter']]);
      assert(/Families you help with/.test(await J.textContent('#view')));
    });

    await step('removed from a family: it leaves the app, and nothing of it stays on the phone', async () => {
      await J.click(`[data-famopen="${ids.tom}"]`); await J.waitForFunction(id => db.meta.babyId === id && !Sync.switching, ids.tom); await syncNow(J);
      await J.click('#famSw'); await J.click(`#sheet [data-fampick="${ids.jo}"]`); await J.waitForFunction(id => db.meta.babyId === id && !Sync.switching, ids.jo);
      assert((await J.evaluate(() => Store.parkedIds())).includes(ids.tom));
      const jo = await J.evaluate(() => Auth.id);
      await T.evaluate(u => Sync.loadPeople().then(() => Sync.removeMember(u)), jo);
      await J.evaluate(() => Sync.loadMemberships()); await family();
      assert.deepEqual((await tree()).map(f => f.name), ['Your family', "Sarah's family"]); assert.equal(await J.$('.fhelp'), null, 'and the list of families she helps with is gone');
      assert(!(await J.evaluate(() => Store.parkedIds())).includes(ids.tom), "the brother-in-law's family is gone from the phone");
    });

    await step('signing out clears every family from the phone, after a warning when one of them has changes not sent yet', async () => {
      J.context().__down = true;
      await J.click(`[data-famopen="${ids.sarah}"]`); await J.waitForFunction(id => db.meta.babyId === id && !Sync.switching, ids.sarah);
      await J.evaluate(() => { db.events.push({ id: 'late', type: 'wake', ts: Date.now() - 60e3, data: {}, note: '', updated: stamp(), by: Auth.id, child: kids()[0].id }); save(); });
      await J.click('#famSw'); await J.click(`#sheet [data-fampick="${ids.jo}"]`); await J.waitForFunction(id => db.meta.babyId === id && !Sync.switching, ids.jo);
      J.context().__down = false; await syncNow(J);
      J.dialogs = [];
      await J.evaluate(() => { tab = 'more'; render(); }); await J.click('#signOut');
      await J.waitForSelector('#lEmail');
      assert((J.dialogs || []).some(d => /Some changes have not synced yet/.test(d)), JSON.stringify(J.dialogs));
      assert.deepEqual(await J.evaluate(() => Store.parkedIds()), [], 'no family left on the phone');
      assert.equal(await J.evaluate(() => db.events.length), 0);
    });

    await step('no page errors or content-security-policy violations', async () => {
      for (const p of H.pages) { assert.deepEqual(p.errs, []); assert.deepEqual(p.csp, []); }
    });
  } catch (e) { failed++; console.log('✗ crashed:', e); } finally { await H.close(); }
  console.log(`\n${failed ? failed + ' FAILED, ' : ''}${ok} passed`); process.exit(failed ? 1 : 0);
})();
