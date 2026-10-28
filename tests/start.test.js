// The first screen and keeping a backup: a new phone chooses Just this phone (then the keep-a-backup step), Share with family (sign-in,
// which remembers the choice and still offers just this phone) or Restore a backup from another phone; a log kept on the phone only is
// reminded to keep a backup until one is made (put off, the reminder comes back a month later; a saved backup file ends it); the Family
// tab offers to share later and the sign-in keeps the entries; a backup file restores on a new phone, with its passphrase only.
//   node tests/start.test.js
const assert = require('assert');
/* global Cloud */
const { setup } = require('./lib/harness');

let ok = 0, failed = 0;
const step = async (name, fn) => { try { await fn(); ok++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', (e.stack || e.message || e).toString().split('\n').slice(0, 9).join('\n    ')); } };
const ungated = p => p.waitForFunction(() => !document.body.classList.contains('gated') && !!document.querySelector('#view .quick'));

(async () => {
  const H = await setup({ port: 8141 });
  try {
    const P = await H.device({ welcome: true });
    let backup = '';

    await step('a new phone starts with a choice: just this phone, share with family, or restore a backup; sharing leads to sign-in, which remembers the choice and still offers just this phone', async () => {
      await P.waitForSelector('#wLocal');
      assert.deepEqual(await P.evaluate(() => [!!$('#wShare'), !!$('#wRestore'), !!$('#lEmail'), document.body.classList.contains('gated')]), [true, true, false, true]);
      // the badge at the top is the app icon's: rays in the day clock's kinds of line (plain, dashed, dotted, a squiggle, a zigzag, one ending in its dot)
      assert.deepEqual(await P.evaluate(() => { const h = $('.hero svg').innerHTML; return ['height="76"', 'height="32"', 'r="10"', 'q11 9', 'l9 12', 'r="13"'].map(k => h.includes(k)); }), Array(6).fill(true), 'the welcome badge carries every kind of ray');
      await P.click('#wShare'); await P.waitForSelector('#lEmail');
      await P.reload(); await P.waitForSelector('#lEmail'); assert.equal(await P.$('#wLocal'), null, 'the choice is remembered: straight to sign-in');
      await P.click('#lLocal'); await P.waitForSelector('#bsGo');
      assert(/Keep a backup in the cloud/.test(await P.textContent('#view')) && /More → Cloud backup/.test(await P.textContent('#view')));
      await P.click('#bsLater'); await ungated(P);
      assert.equal(await P.evaluate(() => db.meta.localOnly), true);
    });

    await step('the first screen has a tour of its own: it starts by itself on a new phone, says Just this phone is not a one-way door, ? restarts it, and after the choice the home screen\'s tour follows', async () => {
      const T = await H.device({ welcome: true, tour: true }); await T.waitForSelector('#wLocal'); await T.waitForSelector('.tour-tip', { timeout: 5000 }); await T.waitForTimeout(600);
      const at = () => T.evaluate(() => ({ n: document.querySelector('.tt-n').textContent, t: document.querySelector('#tourT').textContent, w: document.querySelector('#tourW').textContent }));
      const s1 = await at(); assert.equal(s1.t, 'Just this phone'); assert.equal(s1.n, '1 of 5'); assert(/not a one-way door/.test(s1.w) && /Share with family/.test(s1.w), s1.w);
      await T.click('.tt-next'); await T.waitForTimeout(500); assert.equal((await at()).t, 'Share with family');
      await T.click('.tt-next'); await T.click('.tt-next'); await T.waitForTimeout(500); assert.equal((await at()).t, 'Your language');
      await T.click('.tt-skip'); assert.equal(await T.$('.tour'), null); assert.equal(await T.evaluate(() => JSON.parse(localStorage.getItem('ll.tours')).welcome), 1, 'seen, even when skipped');
      assert(await T.isVisible('#helpBtn'), '? stays on the first screen'); await T.click('#helpBtn'); await T.waitForSelector('.tour-tip'); assert.equal((await at()).t, 'Just this phone'); await T.keyboard.press('Escape');
      await T.reload(); await T.waitForSelector('#wLocal'); await T.waitForTimeout(1200); assert.equal(await T.$('.tour'), null, 'not again after a restart');
      await T.click('#wLocal'); await T.waitForSelector('#bsLater'); assert.equal(await T.$('.tour'), null, 'nothing on the backup step'); await T.click('#bsLater'); await ungated(T);
      await T.waitForSelector('.tour-tip', { timeout: 5000 }); await T.waitForTimeout(300); assert(/^(A page for each child|Log it in one tap)$/.test((await at()).t), 'then the home screen\'s own tour (one child: no tabs for children): ' + (await at()).t); await T.keyboard.press('Escape');
    });

    await step('a log kept on this phone only is reminded to keep a backup once it has entries; put off, the reminder comes back a month later; Set it up opens More → Cloud backup, lit', async () => {
      assert.equal(await P.$('.backupnudge'), null, 'nothing logged yet: no reminder');
      await P.click('#view .quick [data-add=feed]'); await P.waitForSelector('#save'); await P.click('#save');
      await P.waitForSelector('.backupnudge');
      await P.click('[data-backuplater]'); assert.equal(await P.$('.backupnudge'), null, 'put off');
      await P.evaluate(() => { db.meta.backupNudgeAt = Date.now() - 31 * 864e5; render(); }); assert(await P.$('.backupnudge'), 'back a month later');
      await P.click('[data-backupgo]'); assert.equal(await P.evaluate(() => tab), 'more');
      assert(await P.$('.card.lit #cPass'), 'the Cloud backup card is lit');
    });

    await step('a backup file made from More → Cloud backup counts as a backup: the reminder goes; the file is encrypted', async () => {
      await P.fill('#cPass', 'correct horse battery staple'); await P.click('#cSavePass'); await P.click('#cFileSave');
      await P.waitForFunction(() => db.meta.fileBackupAt > 0);
      backup = await P.evaluate(async () => (await Cloud.toFile()).text());
      assert(/"app":"littlelog"/.test(backup) && !/"type":"feed"/.test(backup), 'an encrypted backup file');
      await P.click('[data-tab=day]'); assert.equal(await P.$('.backupnudge'), null, 'backed up: no reminder');
    });

    await step('moving phones: a new phone restores the backup file with its passphrase (a wrong one is refused), and starts on this phone only with the entries back', async () => {
      const N = await H.device({ welcome: true }); await N.waitForSelector('#wRestore'); await N.click('#wRestore'); await N.waitForSelector('#rsPass');
      await N.click('#rsFile'); assert(/passphrase/.test(await N.textContent('[role=alert]')), 'a passphrase is needed first');
      await N.fill('#rsPass', 'not the right passphrase');
      await N.setInputFiles('#rsFileIn', { name: 'little-log-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
      await N.waitForFunction(() => /Wrong passphrase/.test((document.querySelector('[role=alert]') || {}).textContent || ''));
      assert.equal(await N.evaluate(() => !!db.meta.localOnly), false, 'nothing changed');
      await N.fill('#rsPass', 'correct horse battery staple');
      await N.setInputFiles('#rsFileIn', { name: 'little-log-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
      await ungated(N);
      assert.deepEqual(await N.evaluate(() => [db.meta.localOnly, db.events.length, db.events[0].type]), [true, 1, 'feed']);
      assert(/Restored 1 entry/.test(await N.textContent('#toast')));
      await N.reload(); await ungated(N); assert.equal(await N.$('#wLocal'), null, 'no first screen again');
      assert.deepEqual(N.errs, []);
    });

    await step('the Family tab offers to share later: Share with family leads to sign-in, and the entries wait to be taken into the new log', async () => {
      await P.click('[data-tab=family]'); assert(/Family sharing is off/.test(await P.textContent('#view')) && /a new phone just signs in/.test(await P.textContent('#view')));
      await P.click('#famShare'); await P.waitForSelector('#lEmail');
      await H.signIn(P, 'mum@x.com'); await P.waitForSelector('#oCreate');
      assert.equal(await P.evaluate(() => db.events.length), 1, 'the entry is still there, for the new log to adopt');
    });

    if (process.env.DEBUG) console.log('page errors:', P.errs, 'dialogs:', P.dialogs);
    assert.deepEqual(P.errs, [], 'no errors on the page'); assert.deepEqual(P.csp, []);
  } catch (e) { failed++; console.log('✗ suite:', e.stack || e); }
  finally { await H.close(); }
  console.log(`\n${ok} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
