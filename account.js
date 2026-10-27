'use strict';
/* Account, security, family-sharing and cloud-backup UI. Uses helpers/state from app.js lazily (call time only). */
const Acct = (() => {
  const CFG = window.LL_CONFIG || {};
  const L = { step: 'email', email: '', busy: false, err: '', captcha: '', fails: 0 };          // sign-in form
  const F = { loaded: false, loading: false, verified: false, enrollRequested: false, enrollForCreate: false, fp: '', recoveryCode: null, myPhones: [], secCode: '',   // auth state after sign-in
    treeAt: 0, treeTimer: null, keptUnsent: {} };   // (the family tree: when it was last brought up to date, and changes not sent yet in the families kept on the phone)
  const M = { enroll: null, busy: false, err: '' };                                              // two-step verification
  const O = { busy: false, err: '', name: '', birth: '', sex: '', mine: '', create: null };               // onboarding
  let invite = null, pendingJoin = null, waitTimer = null;

  // ---- roles & permissions (mirrors supabase/schema.sql; the server enforces them) -------------
  const PERM_KEYS = [
    ['add_entries', N_('Add entries')], ['edit_own', N_('Edit their own entries')], ['delete_own', N_('Delete their own entries')],
    ['edit_others', N_('Edit entries other people added')], ['delete_others', N_('Delete entries other people added')],
    ['view_health', N_('See health notes and medications')], ['view_people', N_('See who else has access')], ['edit_profile', N_("Change the children's names, birthdays, colours and allergies")]];
  const ROLES = [
    ['parent', N_('Parent'), N_('Full control, including who has access and all settings')],
    ['family', N_('Family member'), N_('Can add entries and change their own; cannot change settings or other people\'s entries')],
    ['caregiver', N_('Caregiver'), N_('You choose exactly what they can do')],
    ['babysitter', N_('Babysitter'), N_('You choose exactly what they can do')],
    ['medical', N_('Medical assistant'), N_('You choose exactly what they can do')],
    ['friend', N_('Friend'), N_('You choose exactly what they can do')]];
  // Relatives (in the family tree) and the people who help (a list of their own, and the ones who can be retired)
  const RELATIVES = ['parent', 'family'], HELPERS = ['caregiver', 'babysitter', 'medical', 'friend'];
  const REASONS = { moved: N_('Moved away'), stopped: N_('No longer helps'), passed: N_('Passed away'), other: N_('Other') };
  /** A role's name, in the app's language. */
  const roleName = r => __((ROLES.find(x => x[0] === r) || [0, r || N_('Member')])[1]);
  const PRESET = role => ({ add_entries: true, edit_own: true, delete_own: true, edit_others: role === 'parent', delete_others: role === 'parent',
    view_health: true, view_people: role === 'parent' || role === 'family', edit_profile: role === 'parent' });
  const LOCKED = role => role === 'parent' ? PERM_KEYS.map(k => k[0]) : role === 'family' ? ['edit_others', 'delete_others', 'edit_profile'] : [];

  function accessFormHtml(prefix, role, perms) {
    const p = { ...PRESET(role), ...(perms || {}) };
    return `<div data-access="${prefix}"><label class="f">${__h('Role')}</label>
      <div class="roles">${ROLES.map(([k, n, d]) => `<label class="role"><input type="radio" name="${prefix}role" value="${k}" ${k === role ? 'checked' : ''}><span><b>${__h(n)}</b><small>${__h(d)}</small></span></label>`).join('')}</div>
      <label class="f">${__h('What they can do')}</label><div class="chips">${PERM_KEYS.map(([k, l]) => chip(prefix + 'perm', k, __h(l), !!p[k])).join('')}</div></div>`;
  }
  /** Wires the role buttons to the check boxes: picking a role loads its defaults and locks what that role may never have. `changed`
      hears each choice (so a page drawn again keeps them). */
  function bindAccess(root, prefix, changed = () => {}) {
    const roles = [...root.querySelectorAll(`[name=${prefix}role]`)], perms = [...root.querySelectorAll(`[name=${prefix}perm]`)];
    const read = () => ({ role: roles.find(r => r.checked).value, perms: Object.fromEntries(perms.map(el => [el.value, el.checked])) });
    const apply = reset => {
      const role = roles.find(r => r.checked).value, pre = PRESET(role), lock = LOCKED(role);
      perms.forEach(el => { if (reset || lock.includes(el.value)) el.checked = !!pre[el.value]; el.disabled = lock.includes(el.value); });
    };
    roles.forEach(r => r.onchange = () => { apply(true); changed(read()); }); perms.forEach(el => el.onchange = () => changed(read())); apply(false);
    return read;
  }

  // ---- helpers ------------------------------------------------------------------------------
  /** An invite link carries the code and, if it came from a QR code, a secret that never goes to the server. */
  function parseJoinLink(text) {
    text = String(text || '').trim(); let code = null, secret = null;
    try { const q = new URL(text).searchParams; code = q.get('join') || q.get('code'); secret = q.get('s'); } catch (e) {}
    code = /^[A-Za-z0-9]{10}$/.test(code || text) ? (code || text).toUpperCase() : null;
    secret = secret && /^[A-Za-z0-9_-]{16,32}$/.test(secret) ? secret : null;
    return code ? { code, secret } : null;
  }
  const parseJoin = text => (parseJoinLink(text) || {}).code || null;
  const ago = t => { const m = (Date.now() - t) / MIN; return m < 1 ? __('just now') : __('{time} ago', { time: fmtDur(m) }); };
  /** An error's message in the app's language (ours are written in English with N_(); the server's are shown as they come). */
  const err = e => __((e && e.message) || String(e));
  const left = iso => { const m = (new Date(iso) - Date.now()) / MIN; return m <= 0 ? __('expired') : __('expires in {time}', { time: fmtDur(m) }); };
  /** A phone's name: the ones the app gives ("android phone") in the app's language, any other as it is. */
  const PHONES = { 'android phone': N_('Android phone'), 'ios phone': 'iPhone', 'web phone': N_('Web browser'), 'phone phone': N_('phone') };
  const phoneName = n => __(PHONES[n] || n || N_('phone'));
  const alertP = t => t ? `<p class="note" style="color:var(--health)" role="alert">${__h(t)}</p>` : '';
  function showSheet(html) {
    const S = $('#sheet'), back = $('#sheetBack'); S.innerHTML = html; Icons.paint(S); S.onchange = null; S.hidden = back.hidden = false;   // (onchange: drop the entry form's handler)
    const close = () => { S.hidden = back.hidden = true; }; back.onclick = close; sheetX(); return close;
  }
  function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }

  // An invite link opened while the app runs (OS hands it over) is remembered until the user is ready (in the Keychain: it holds the QR secret).
  async function init() { try { pendingJoin = JSON.parse(await Native.Secure.get('e2ee.pendingjoin')); } catch (e) { pendingJoin = null; } }
  const clearPending = () => { pendingJoin = null; Native.Secure.remove('e2ee.pendingjoin'); };
  function receiveJoin(text) {
    const link = parseJoinLink(text); if (!link) return false;
    pendingJoin = link; Native.Secure.set('e2ee.pendingjoin', JSON.stringify(link));
    if (Auth.signedIn && F.loaded) processPending().then(render); else render();
    return true;
  }
  async function processPending() {
    const p = pendingJoin; clearPending();
    if (p) await joinWith(p.code, p.secret, true);
  }

  // ---- after sign-in: two-step status, memberships ---------------------------------------------
  async function refreshAuth() {
    F.loading = true; render();
    try {
      F.verified = (await Auth.factors()).some(f => f.status === 'verified');
      const d = await E2EE.ensureDevice().catch(() => E2EE.device); if (d) F.fp = await E2EE.fingerprint(d.pub);   // this phone's key, so it can be approved
      await Sync.loadMemberships(); await Sync.loadMyRequests().catch(() => {});
      const ms = Sync.st.memberships;
      if (ms.length) await Sync.choose((ms.find(m => m.id === db.meta.babyId) || ms[0]).id);
      else if (db.meta.babyId && Sync.st.state !== 'offline') { Sync.run(true); }
    } catch (e) { if (!Auth.signedIn) { await sessionLost(); return; } F.verified = Auth.aal === 'aal2'; }          // offline: trust the session we already have
    F.loading = false; F.loaded = true;
    Sync.start(); render();
    if (pendingJoin && !F.needsMfa()) await processPending().then(render);
  }
  F.needsMfa = () => F.verified && Auth.aal !== 'aal2';
  const enrollNeeded = () => !F.verified && (db.meta.role === 'parent' || F.enrollForCreate || F.enrollRequested);

  // ---- gate -----------------------------------------------------------------------------------
  function gate() {
    if (!Native.is) return { html: appOnlyHtml(), bind() {} };
    if (!Auth.configured) { if (!db.meta.localOnly) return { html: setupHtml(), bind: bindSetup }; }
    else if (!Auth.signedIn && !db.meta.localOnly) return welcomed() ? { html: loginHtml(), bind: bindLogin } : { html: welcomeHtml(), bind: bindWelcome };
    if (Lock.locked) return { html: lockHtml(), bind: bindLock, plain: true };   // (no badge over the lock)
    if (db.meta.backupStep && !Auth.signedIn) return { html: backupHtml(), bind: bindBackupStep };
    if (Auth.configured && Auth.signedIn) {   // (a log kept on this phone only skips the account's screens)
      if (!F.loaded || F.loading) return { html: `<div class="card"><div class="empty">${__h('Loading…')}</div></div>`, bind() {} };
      if (F.needsMfa()) return { html: mfaVerifyHtml(), bind: bindMfaVerify };
      if (enrollNeeded()) return { html: enrollHtml(), bind: bindEnroll };
      if (!db.meta.babyId) return Sync.pendingRequest() ? { html: waitingHtml(), bind: bindWaiting } : { html: onboardHtml(), bind: bindOnboard };
      if (F.recoveryCode) return { html: recoveryHtml(), bind: bindRecovery };
      if (Sync.st.needsAccess) return { html: accessHtml(), bind: bindAccessScreen };
    }
    return null;
  }
  /** The app's badge (the baby with the day clock's rays, as on the icon) and a line about the app, at the top of the first screens, so
      they look like the rest of the app from the first tap. */
  const RAYS = ['#d9a066', '#7fb0a6', '#8a94c0', '#a89bc4', '#d49aa6', '#c9756e', '#7fa6c4', '#a3b17a'];
  const heroHtml = () => `<div class="hero"><svg viewBox="0 0 512 512" width="92" height="92" aria-hidden="true">${RAYS.map((c, i) => [0, 8, 16].map(j => `<rect x="245" y="10" width="22" height="76" rx="11" fill="${c}" transform="rotate(${(i + j) * 15} 256 256)"/>`).join('')).join('')}
    <circle cx="256" cy="256" r="128" fill="#ffffff" stroke="#e8e1d5" stroke-width="5"/><circle cx="196" cy="282" r="17" fill="#f3b9b2" opacity=".75"/><circle cx="316" cy="282" r="17" fill="#f3b9b2" opacity=".75"/>
    <circle cx="212" cy="246" r="13" fill="#4a4337"/><circle cx="300" cy="246" r="13" fill="#4a4337"/><path d="M216 292q40 36 80 0" stroke="#4a4337" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M256 130q-18-24 12-34" stroke="#4a4337" stroke-width="11" fill="none" stroke-linecap="round"/></svg>
    <p>${__h("Your little one's days, in one little log.")}</p></div>`;
  /** A choice on the first screen: a painted icon in a soft wash of one of the day clock's colours, like the Day page's buttons. */
  const tile = (id, icon, group, title, sub, cls = '') => { const c = GCOLOR[Theme.isDark() ? 'dark' : 'light'][group]; return `<button class="btn wbtn ${cls}" id="${id}" style="--c:${c};--cw:${Kids.rgba(c, 0.28)}"><span class="wi">${icon}</span><span><b>${__h(title)}</b><small>${__h(sub)}</small></span></button>`; };
  const appOnlyHtml = () => `<div class="card"><b>${__h('Little Log is a phone app')}</b><p class="note">${__h('This screen only runs inside the Little Log app for iPhone and Android. Please install it from the App Store or Google Play.')}</p></div>`;
  const setupHtml = () => `<div class="card"><b>${__h("Sign-in isn't set up yet")}</b>
    <p class="note">${__h('This copy of Little Log has no account service configured, so family sync and sign-in are unavailable. See {file} to turn them on.', { file: 'SETUP.md' })}</p>
    <button class="btn p" id="localOnly" style="width:100%">${__h('Use on this device only')}</button></div>`;
  const bindSetup = () => { $('#localOnly').onclick = () => { markWelcome(); db.meta.localOnly = true; db.meta.backupStep = true; save(true); render(); }; };

  // ---- the first screen: just this phone, share with family, or restore a backup from another phone ------------------------------
  // The choice is remembered on this phone (like the tours), so the sign-in screen comes straight up next time.
  const W = { step: 'choose', err: '' };
  const welcomed = () => { try { return localStorage.getItem('ll.welcome') === '1'; } catch (e) { return false; } };
  const markWelcome = () => { try { localStorage.setItem('ll.welcome', '1'); } catch (e) { /* storage blocked: it may show again */ } };
  const SHARE_WHY = N_("Sign in with your email to start a log the family shares, or to join one. It is kept safe in the family's cloud, end-to-end encrypted, so a new phone just signs in.");
  const welcomeHtml = () => (W.step === 'restore' ? restoreHtml() : `<div class="card welcome"><b>${__h('How would you like to use Little Log?')}</b>
    ${tile('wLocal', '🔒', 'sleep', N_('Just this phone'), N_('Everything stays on this phone. You can share it with the family later, from the Family tab.'))}
    ${tile('wShare', '👨‍👩‍👧', 'feed', N_('Share with family'), SHARE_WHY)}
    ${tile('wRestore', '☁️', 'diaper', N_('Moving from another phone?'), N_('Restore the backup you made there.'))}</div>`);
  const restoreHtml = () => `<div class="card"><b>☁️ ${__h('Restore a backup')}</b>
    <p class="note">${__h('Type the passphrase you chose when you made the backup, then choose the backup file (from iCloud Drive, Google Drive, Dropbox, OneDrive or wherever you saved it).')}</p>
    <label class="f">${__h('Backup passphrase ({n}+ characters)', { n: Cloud.MIN_PASS })}</label><input id="rsPass" type="password" autocomplete="off">
    <button class="btn p" id="rsFile" style="width:100%;margin-top:12px">${__h('Choose the backup file')}</button><input type="file" id="rsFileIn" accept="application/json,.json" hidden>
    <div class="row"><button class="btn" id="rsBack">${__h('Back')}</button></div>${alertP(W.err)}</div>`;
  function bindWelcome() {
    const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
    on('#wLocal', () => { markWelcome(); db.meta.localOnly = true; db.meta.backupStep = true; save(true); render(); });
    on('#wShare', () => { markWelcome(); render(); });
    on('#wRestore', () => { W.step = 'restore'; W.err = ''; render(); });
    on('#rsBack', () => { W.step = 'choose'; W.err = ''; render(); });
    const passOk = () => { const p = $('#rsPass').value; if (p && p.length >= Cloud.MIN_PASS) return p; W.err = __('Set a backup passphrase ({n}+ characters) first', { n: Cloud.MIN_PASS }); render(); return null; };
    on('#rsFile', () => { if (passOk()) $('#rsFileIn').click(); });
    const fi = $('#rsFileIn');
    if (fi) fi.onchange = async e => {
      const f = e.target.files[0], p = passOk(); e.target.value = ''; if (!f || !p) return;
      Cloud.setPass(p); db.meta.localOnly = true;
      try { applyBackup(await Cloud.fromFile(f)); markWelcome(); W.step = 'choose'; W.err = ''; }   // (applyBackup saves, redraws and says how many entries came back)
      catch (x) { delete db.meta.localOnly; W.err = err(x); render(); }   // (a wrong passphrase: back on the restore card, with the reason)
    };
  }
  // ---- keep a backup: offered once after choosing this phone only; the Day page reminds until one is made --------------------------
  const backupHtml = () => `<div class="card"><b>☁️ ${__h('Keep a backup in the cloud')}</b>
    <p class="note">${__h('If you change or lose your phone, a backup is the only way to get this log back. It is encrypted with a passphrase only you know, and lives in your own iCloud Drive, Google Drive, Dropbox or OneDrive.')}</p>
    <button class="btn p" id="bsGo" style="width:100%">${__h('Set it up')}</button>
    <button class="btn" id="bsLater" style="width:100%;margin-top:8px">${__h('Not now')}</button>
    <p class="note">${__h('You can always do it later: More → Cloud backup. Until then, a note on the Day page reminds you.')}</p></div>`;
  const bindBackupStep = () => {
    $('#bsGo').onclick = () => { delete db.meta.backupStep; save(true); goCloudCard(); };
    $('#bsLater').onclick = () => { delete db.meta.backupStep; save(true); render(); };
  };
  /** More → Cloud backup, scrolled into view and lit for a moment. */
  function goCloudCard() {
    tab = 'more'; render();
    const c = $('#cPass') && $('#cPass').closest('.card'); if (!c) return;   // (no :has(): an older WebView would throw on it)
    const d = c.closest('details'); if (d && !d.open) { d.open = true; openGroups.add(d.dataset.grp); }   // (Cloud backup is a twirl-down on More)
    c.scrollIntoView({ block: 'start' }); c.classList.add('lit'); setTimeout(() => c.classList.remove('lit'), 2500);
  }

  // ---- app lock -------------------------------------------------------------------------------
  /** A PIN pad (digits, delete, ✓) with dots for what was typed, in the element `id`; `idMsg` under it says what went wrong. */
  const padHtml = (id, msg = '') => `<div class="pinpad" id="${id}"><div class="pdots" aria-live="polite"></div>
    <div class="pkeys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(k => `<button type="button" class="pk${k === 'ok' ? ' p' : ''}" data-k="${k}" aria-label="${k === 'del' ? __h('Delete') : k === 'ok' ? __h('Done') : k}">${k === 'del' ? '⌫' : k === 'ok' ? '✓' : k}</button>`).join('')}</div>
    <p class="note" id="${id}Msg" role="alert" style="min-height:1.4em;color:var(--health)">${__h(msg)}</p></div>`;
  /** Wires a pad: onDone(code) runs on ✓, and by itself once `auto` digits are in (the length of the PIN being asked for). */
  function bindPad(id, onDone, auto = 0) {
    const el = $('#' + id); if (!el) return null;
    const typed = bindPad.typed || (bindPad.typed = {}), keys = bindPad.keys || (bindPad.keys = {});
    let code = typed[id] || '';   // (what was typed survives a redraw of the screen, e.g. by a sync)
    const dots = () => { typed[id] = code; el.querySelector('.pdots').textContent = '●'.repeat(code.length) + '○'.repeat(Math.max(0, 4 - code.length)); };
    const done = () => { const c = code; code = ''; dots(); onDone(c); };
    const press = k => {
      if (k === 'del') code = code.slice(0, -1);
      else if (k === 'ok') return done();
      else if (/^\d$/.test(k) && code.length < 8) code += k;
      dots(); if (auto && code.length === auto) done();
    };
    el.querySelectorAll('.pk').forEach(b => b.onclick = () => press(b.dataset.k));
    if (keys[id]) document.removeEventListener('keydown', keys[id], true);   // (the pad drawn before this one)
    const key = e => {   // (a keyboard too: digits, Backspace, Enter)
      if (!document.getElementById(id)) { delete keys[id]; return document.removeEventListener('keydown', key, true); }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName)) return;
      if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Enter') press('ok'); else return;
      e.preventDefault();
    };
    keys[id] = key; document.addEventListener('keydown', key, true);
    dots();
    return { say: m => { const x = $('#' + id + 'Msg'); if (x) x.textContent = m; } };
  }
  /** Forgets what was typed into a pad (a sheet closed, a screen left). */
  const clearPad = id => { if (bindPad.typed) delete bindPad.typed[id]; };
  const waitMsg = ms => __n('Too many tries. Try again in {n} second.', 'Too many tries. Try again in {n} seconds.', Math.max(1, Math.ceil(ms / 1000)));
  const lockHtml = () => {
    const pinMode = Lock.mode === 'pin', bio = Lock.bioAllowed;
    return `<div class="card" style="text-align:center"><div style="font-size:48px">🔒</div><b>${__h('Locked')}</b>
    ${pinMode ? `<p class="note">${__h('Enter your PIN to continue.')}</p>${padHtml('ul', Lock.wait ? waitMsg(Lock.wait) : '')}` : `<p class="note">${__h('Use Face ID, your fingerprint or your phone passcode to continue.')}</p>`}
    ${bio ? `<button class="btn${pinMode ? '' : ' p'}" id="unlock" style="width:100%">${pinMode ? __h('Use Face ID / fingerprint instead') : __h('Unlock')}</button>` : ''}
    <button class="btn" id="lockOut" style="width:100%;margin-top:8px">${pinMode ? __h('Forgot your PIN?') : __h('Sign out')}</button></div>`;
  };
  function bindLock() {
    const go = async () => { if (await Lock.unlock()) render(); };
    if ($('#unlock')) $('#unlock').onclick = go;
    $('#lockOut').onclick = lockOut;
    if (Lock.mode === 'pin') {
      const pad = bindPad('ul', async code => {
        const r = await Lock.checkPin(code);
        if (r.ok) { clearPad('ul'); return render(); }
        pad.say(r.wait ? waitMsg(r.wait) : __('That PIN is not right.')); if (r.wait) tick();
      }, Lock.pinLength);
      const tick = () => {   // (the wait counts down on the screen)
        clearInterval(bindLock.timer);
        bindLock.timer = setInterval(() => { if (!$('#ulMsg')) return clearInterval(bindLock.timer); const w = Lock.wait; pad.say(w ? waitMsg(w) : ''); if (!w) clearInterval(bindLock.timer); }, 1000);
      };
      if (Lock.wait) tick();
      if (!Lock.bioAllowed) return;
    }
    if (!bindLock.auto) { bindLock.auto = true; setTimeout(() => { bindLock.auto = false; if (Lock.locked) go(); }, 150); }
  }
  /** The way out of the lock screen without the PIN or Face ID: this phone is cleared (the log is safe in the cloud, or in a backup). */
  async function lockOut() {
    const msg = Sync.linked() ? __("Sign out? This clears the log from this phone. It stays safe in the family's cloud and comes back when you sign in again.")
      : __('This clears the log on this phone. It comes back only from a backup you made (More → Cloud backup). Continue?');
    if (!confirm(msg)) return;
    if (Sync.linked()) { try { await Sync.run(true); } catch (e) { /* offline: what is unsent is lost, as the message said */ } }
    try { await Auth.signOut(false); } catch (e) { /* not signed in, or offline: the phone is cleared all the same */ }
    await wipeLocal(); render();
  }
  // ---- choosing and changing the PIN (More → App lock) ----
  /** Asks for the current PIN in a sheet, then runs `then`. */
  function askPin(then) {
    const close = showSheet(`<h3>${__h('Enter your current PIN')}</h3>${padHtml('pinPad', Lock.wait ? waitMsg(Lock.wait) : '')}<button class="btn" id="pinCancel" style="width:100%;margin-top:10px">${__h('Cancel')}</button>`);
    $('#pinCancel').onclick = () => { close(); clearPad('pinPad'); render(); };
    const pad = bindPad('pinPad', async code => { const r = await Lock.checkPin(code); if (r.ok) { close(); clearPad('pinPad'); then(); } else pad.say(r.wait ? waitMsg(r.wait) : __('That PIN is not right.')); }, Lock.pinLength);
  }
  /** Chooses a PIN: typed, then typed again. */
  function choosePin(title) {
    let first = '', close = null;
    const show = (note, msg) => { close = showSheet(`<h3>${esc(title)}</h3><p class="note">${__h(note)}</p>${padHtml('pinPad', msg)}<button class="btn" id="pinCancel" style="width:100%;margin-top:10px">${__h('Cancel')}</button>`); $('#pinCancel').onclick = () => { close(); clearPad('pinPad'); render(); }; };
    const step1 = (msg = '') => {
      show(__('4 to 8 digits, known only to you. If you forget it, the only way back in is to clear this phone: a family log comes back from the cloud, a phone-only log from its backup.'), msg);
      bindPad('pinPad', code => { if (!/^\d{4,8}$/.test(code)) return step1(__('A PIN is 4 to 8 digits.')); first = code; step2(); });
    };
    const step2 = () => {
      show(__('Enter it again.'), '');
      bindPad('pinPad', async code => { if (code !== first) return step1(__('The two did not match. Start again.')); const m = await Lock.setPin(code); close(); clearPad('pinPad'); toast(m ? __(m) : __('PIN set')); render(); });
    };
    step1();
  }
  /** More → App lock: Off, the phone's lock, or a PIN (leaving the PIN, or changing it, asks for it first). */
  async function setLockMode(v) {
    const was = Lock.mode; if (v === was) return;
    const apply = async () => {
      if (v === 'pin') return choosePin(__('Choose a PIN'));
      const m = v === 'bio' ? await Lock.useBio() : (await Lock.off(), null);
      if (m) toast(__(m)); render();
    };
    if (was === 'pin') askPin(apply); else apply();
  }

  // ---- sign-in (email code + optional CAPTCHA) -------------------------------------------------
  const loginHtml = () => `<div class="card"><b>${L.step === 'email' ? '📨 ' + __h('Sign in') : '🔑 ' + __h('Check your email')}</b>
    ${L.step === 'email'
      ? `<p class="note">${__h("Enter your email and we'll send you a one-time code. No password needed. First time? This creates your account.")}</p>
         <label class="f">${__h('Email')}</label><input id="lEmail" type="email" inputmode="email" autocomplete="email" value="${esc(L.email)}" placeholder="${__h('you@example.com')}">
         ${CFG.captchaSiteKey ? '<div id="captcha" style="margin-top:12px"></div>' : ''}
         <button class="btn p" id="lSend" style="width:100%;margin-top:12px" ${L.busy ? 'disabled' : ''}>${L.busy ? __h('Sending…') : __h('Email me a code')}</button>
         <button class="btn" id="lLocal" style="width:100%;margin-top:8px">${__h('Just this phone')}</button>`
      : `<p class="note">${__h('We sent a code to **{email}**. It works for 10 minutes.', { email: L.email })}</p>
         <label class="f">${__h('Code')}</label><input id="lCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="12345678">
         <button class="btn p" id="lVerify" style="width:100%;margin-top:12px" ${L.busy ? 'disabled' : ''}>${L.busy ? __h('Checking…') : __h('Sign in')}</button>
         <div class="row"><button class="btn" id="lBack">${__h('Different email')}</button></div>`}
    ${alertP(L.err)}</div>
    ${pendingJoin ? `<div class="card">📨 ${__h('You have a family invite waiting. Sign in to use it.')}</div>` : ''}`;
  async function renderCaptcha() {
    if (!CFG.captchaSiteKey || !$('#captcha')) return;
    try {
      if (!window.turnstile) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.onload = ok; s.onerror = () => no(new Error(N_('Could not load the security check. Are you online?'))); document.head.appendChild(s); });
      window.turnstile.render('#captcha', { sitekey: CFG.captchaSiteKey, theme: 'auto', callback: t => { L.captcha = t; }, 'expired-callback': () => { L.captcha = ''; }, 'error-callback': () => { L.captcha = ''; } });
    } catch (e) { L.err = err(e); const el = $('#captcha'); if (el) el.textContent = L.err; }
  }
  function bindLogin() {
    if ($('#lLocal')) $('#lLocal').onclick = () => { db.meta.localOnly = true; db.meta.backupStep = true; save(true); render(); };
    const go = async fn => { L.busy = true; L.err = ''; render(); try { await fn(); } catch (e) { L.err = err(e); } L.busy = false; render(); };
    // Read the inputs *before* go() re-renders the form (which replaces them).
    const send = () => {
      L.email = $('#lEmail').value.trim(); const cap = L.captcha; L.captcha = '';
      go(async () => {
        if (!/^\S+@\S+\.\S+$/.test(L.email)) throw new Error(N_('Enter a valid email address'));
        if (CFG.captchaSiteKey && !cap) throw new Error(N_('Please complete the security check first'));
        await Auth.sendCode(L.email, cap); L.step = 'code'; L.fails = 0;
      });
    };
    if (L.step === 'email') { $('#lSend').onclick = send; $('#lEmail').onkeydown = e => { if (e.key === 'Enter') send(); }; renderCaptcha(); }
    else {
      const verify = () => {
        const code = $('#lCode').value.replace(/\s/g, '');
        go(async () => {
          if (code.length < 6) throw new Error(N_('Enter the code from the email'));
          try { await Auth.verify(L.email, code); } catch (e) {
            if (++L.fails >= 5) { L.step = 'email'; L.fails = 0; throw new Error(N_('Too many wrong codes. Please request a new one.')); }
            throw e;
          }
          L.step = 'email'; await afterSignIn();
        });
      };
      $('#lVerify').onclick = verify; $('#lCode').onkeydown = e => { if (e.key === 'Enter') verify(); };
      $('#lBack').onclick = () => { L.step = 'email'; L.err = ''; render(); };
    }
  }
  async function afterSignIn() { Lock.reset(); F.loaded = false;   // just authenticated: don't ask for Face ID on top
    F.enrollForCreate = F.enrollRequested = false; refreshAuth(); }

  // ---- two-step verification ------------------------------------------------------------------
  const mfaVerifyHtml = () => `<div class="card"><b>${__h('Two-step verification')}</b>
    <p class="note">${__h('Open your authenticator app and enter the 6-digit code for Little Log.')}</p>
    <label class="f">${__h('Code')}</label><input id="mCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">
    <button class="btn p" id="mGo" style="width:100%;margin-top:12px" ${M.busy ? 'disabled' : ''}>${M.busy ? __h('Checking…') : __h('Continue')}</button>
    ${alertP(M.err)}
    <p class="note">${__h('Lost your authenticator? Ask another parent to reset it from the Family tab, then sign in again.')}</p>
    <button class="btn" id="mOut" style="width:100%">${__h('Sign out')}</button></div>`;
  function bindMfaVerify() {
    const go = async () => {
      const code = $('#mCode').value.replace(/\s/g, ''); if (code.length !== 6) { M.err = N_('Enter the 6-digit code'); return render(); }
      M.busy = true; M.err = ''; render();
      try {
        const f = (await Auth.factors()).find(x => x.status === 'verified'); await Auth.mfaVerify(f.id, code);
        M.busy = false; render(); Sync.run(true); if (pendingJoin) processPending().then(render);
      } catch (e) { M.busy = false; M.err = /invalid|expired/i.test(err(e)) ? N_('That code is not right. Try the newest one.') : err(e); render(); }
    };
    $('#mGo').onclick = go; $('#mCode').onkeydown = e => { if (e.key === 'Enter') go(); }; $('#mOut').onclick = () => signOut(false);
  }
  function enrollHtml() {
    if (!M.enroll && !M.busy) beginEnroll();
    const e = M.enroll, optional = !(db.meta.role === 'parent' || F.enrollForCreate);
    return `<div class="card"><b>${__h('Set up two-step verification')}</b>
      <p class="note">${optional ? __h('Adds a second lock to your account.') : __h('Parents must use two-step verification, because they can see everything and control who has access.')}
      ${__h('Use an authenticator app such as Google Authenticator, Microsoft Authenticator, Authy or 1Password.')}</p>
      ${e ? `<div class="qr" role="img" aria-label="${__h('Authenticator QR code')}">${qrSvg(e.uri)}</div>
        <p class="note">${__h('On this phone?')} <a href="${esc(e.uri)}">${__h('Open your authenticator app')}</a>${__h(', or type this key in:')}</p>
        <div class="code" style="font:700 15px ui-monospace,Menlo,monospace;word-break:break-all;text-align:center">${esc(e.secret)}</div>
        <div class="row"><button class="btn" id="eCopy">${__h('Copy key')}</button></div>
        <label class="f">${__h('Then enter the 6-digit code it shows')}</label><input id="eCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">
        <button class="btn p" id="eGo" style="width:100%;margin-top:12px" ${M.busy ? 'disabled' : ''}>${__h('Turn on')}</button>` : `<div class="empty">${__h('Preparing…')}</div>`}
      ${alertP(M.err)}
      ${optional ? `<button class="btn" id="eCancel" style="width:100%;margin-top:8px">${__h('Not now')}</button>` : `<button class="btn" id="eOut" style="width:100%;margin-top:8px">${__h('Sign out')}</button>`}</div>`;
  }
  async function beginEnroll() {
    M.busy = true;
    try { M.enroll = await Auth.mfaEnroll(); M.err = ''; } catch (e) { M.err = err(e); }
    M.busy = false; render();
  }
  function bindEnroll() {
    if ($('#eCopy')) $('#eCopy').onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(M.enroll.secret) : Promise.reject()).then(() => toast(__('Key copied')), () => toast(__('Press and hold the key to copy it')));
    if ($('#eGo')) $('#eGo').onclick = async () => {
      const code = $('#eCode').value.replace(/\s/g, ''); if (code.length !== 6) { M.err = N_('Enter the 6-digit code'); return render(); }
      M.busy = true; M.err = ''; render();
      try {
        await Auth.mfaVerify(M.enroll.id, code);
        F.verified = true; M.enroll = null; M.busy = false; F.enrollRequested = false;
        if (O.create) { const c = O.create; O.create = null; await createLog(c); } else { render(); toast(__('Two-step verification is on')); Sync.run(true); }
      } catch (e) { M.busy = false; M.err = /invalid|expired/i.test(err(e)) ? N_('That code is not right. Try the newest one.') : err(e); render(); }
    };
    if ($('#eCancel')) $('#eCancel').onclick = () => { F.enrollRequested = F.enrollForCreate = false; M.enroll = null; O.create = null; render(); };
    if ($('#eOut')) $('#eOut').onclick = () => signOut(false);
  }

  // ---- onboarding: create a log or join one ----------------------------------------------------
  const onboardHtml = () => {
    const n = db.events.length;
    return `<div class="card"><b>🌳 ${__h('Welcome, {email}', { email: Auth.email })}</b><p class="note">${__h('Create a log for your baby, or join one a family member shared with you.')}</p>
      <label class="f">${__h('Your name (shown to the family)')}</label><input id="oMine" type="text" maxlength="60" value="${esc(O.mine)}" placeholder="${__h('e.g. Mum')}"></div>
    <div class="card"><b>👶 ${__h('New baby log')}</b>
      <p class="note">${__h('You become a parent (admin). Parents use two-step verification.')}</p>
      <label class="f">${__h("Baby's name")}</label><input id="oName" type="text" value="${esc(O.name || db.baby.name)}" placeholder="${__h('Name')}">
      <label class="f">${__h('Birth date')}</label><input id="oBirth" type="date" value="${esc(O.birth || db.baby.birth)}">
      <label class="f">${__h('Boy or girl')} <small>${__h('(sets their colour – you can change it later)')}</small></label><div class="chips">${chip('oSex', 'boy', __h('Boy'), O.sex === 'boy', '', true)}${chip('oSex', 'girl', __h('Girl'), O.sex === 'girl', '', true)}${chip('oSex', '', __h('Not set'), !O.sex, '', true)}</div>
      <p class="note">${__h('More than one child? Add the others after the log is created (More → Children).')}</p>
      ${n ? `<p class="note">${__hn('Your {n} existing entry on this device will be added to the new log.', 'Your {n} existing entries on this device will be added to the new log.', n)}</p>` : ''}
      <button class="btn p" id="oCreate" style="width:100%;margin-top:12px" ${O.busy ? 'disabled' : ''}>${__h('Create log')}</button></div>
    <div class="card"><b>🔗 ${__h('Join a family log')}</b>
      <p class="note">${__h('Ask a parent for an invite (Family tab → Invite). Scan their QR code or type the code. A parent then approves your request.')}</p>
      <div class="row"><button class="btn" id="oScan">📷 ${__h('Scan QR code')}</button></div>
      <label class="f">${__h('Or enter the invite code')}</label><input id="oCode" type="text" maxlength="10" autocapitalize="characters" placeholder="ABCDE12345">
      <button class="btn" id="oJoin" style="width:100%;margin-top:8px">${__h('Send request')}</button></div>
    ${alertP(O.err)}
    <div class="card"><button class="btn" id="oOut" style="width:100%">${__h('Sign out')}</button></div>`;
  };
  function bindOnboard() {
    const mine = () => { O.mine = $('#oMine').value.trim(); return O.mine; };
    $('#oCreate').onclick = async () => {
      const name = $('#oName').value.trim(); if (!name) return toast(__("Enter your baby's name"));
      const sx = document.querySelector('[name=oSex]:checked'), c = { name, birth: $('#oBirth').value, mine: mine(), sex: sx ? sx.value : '' }; O.name = name; O.birth = c.birth; O.sex = c.sex; O.err = '';
      if (!F.verified) { O.create = c; F.enrollForCreate = true; return render(); }   // two-step verification first
      createLog(c);
    };
    $('#oJoin').onclick = () => { const c = parseJoin($('#oCode').value); mine(); c ? joinWith(c) : toast(__('Invite codes are 10 letters/numbers')); };
    $('#oScan').onclick = () => { mine(); scan(); };
    $('#oOut').onclick = () => signOut(false);
  }
  async function createLog(c) {
    O.busy = true; O.err = ''; render();
    try { F.recoveryCode = await Sync.createBaby(c.name, c.birth, c.mine, c.sex); F.enrollForCreate = false; } catch (e) { O.err = err(e); }
    O.busy = false; render();
  }
  /** Sends a join request; the person gets in only when a parent approves it. */
  async function joinWith(code, secret, fromLink) {
    // A link can arrive from any app or web page, so never act on one without asking.
    if (fromLink && !confirm(__('You were sent an invitation to a baby log. Send a request to join it? A parent has to approve you before you see anything.'))) return;
    if (db.events.length && !db.meta.babyId && !confirm(__n("The {n} entry currently on this device won't be added to the shared log. Continue?", "The {n} entries currently on this device won't be added to the shared log. Continue?", db.events.length))) return;
    try { await Sync.requestJoin(code, O.mine || '', secret); toast(__('Request sent – a parent needs to approve it')); if (db.meta.babyId) tab = 'family'; }
    catch (e) { O.err = err(e); toast(err(e)); }
    render();
  }
  const waitingHtml = () => `<div class="card" style="text-align:center"><div style="font-size:48px">⏳</div><b>${__h('Waiting for approval')}</b>
    <p class="note">${__h('Your request was sent. A parent needs to approve it in the Family tab. This screen updates by itself.')}</p>
    <p class="note">${__h("If you didn't scan a QR code, the parent will ask you to read out this security code for your phone:")}</p>
    <div class="code" style="font:700 17px ui-monospace,Menlo,monospace;margin:8px 0">${esc(F.fp)}</div>
    <button class="btn" id="wCheck" style="width:100%">${__h('Check now')}</button>
    <button class="btn d" id="wCancel" style="width:100%;margin-top:8px">${__h('Cancel request')}</button>
    <button class="btn" id="wOut" style="width:100%;margin-top:8px">${__h('Sign out')}</button></div>`;
  function bindWaiting() {
    const check = async () => { try { if (await Sync.checkApproval()) { toast(__("You're in!")); tab = 'day'; render(); } else if (!Sync.pendingRequest()) render(); } catch (e) {} };
    $('#wCheck').onclick = check;
    $('#wCancel').onclick = async () => { try { await Sync.cancelRequest(Sync.pendingRequest().id); } catch (e) { toast(err(e)); } render(); };
    $('#wOut').onclick = () => signOut(false);
    clearInterval(waitTimer); waitTimer = setInterval(() => { if (!$('#wCheck')) return clearInterval(waitTimer); check(); }, 8000);
  }

  // ---- encryption: recovery code, approving this phone -------------------------------------------
  const recoveryHtml = () => `<div class="card"><b>🔑 ${__h('Save your recovery code')}</b>
    <p class="note">${__h("Everything in this log is end-to-end encrypted, so even we can't read it. If you ever lose all your phones, **this code is the only way back in**, and it can't be looked up later. Write it down and keep it somewhere safe, **not only on this phone**.")}</p>
    <div class="code" style="font:700 17px ui-monospace,Menlo,monospace;text-align:center;word-break:break-all;margin:12px 0">${esc(F.recoveryCode)}</div>
    <div class="row"><button class="btn" id="rcCopy">${__h('Copy')}</button><button class="btn" id="rcShare">${__h('Share…')}</button></div>
    <div class="chips" style="margin:12px 0">${chip('rcAck', 1, __h("I've saved it somewhere safe"), false)}</div>
    <button class="btn p" id="rcDone" style="width:100%">${__h('Continue')}</button></div>`;
  function bindRecovery() {
    $('#rcCopy').onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(F.recoveryCode) : Promise.reject()).then(() => toast(__('Copied. Paste it somewhere safe, then delete the copy here.')), () => toast(__('Press and hold the code to copy it')));
    $('#rcShare').onclick = () => Native.shareText(__('Little Log recovery code'), F.recoveryCode).catch(() => {});
    $('#rcDone').onclick = () => { if (!document.querySelector('[name=rcAck]').checked) return toast(__('Tick the box once you have saved it')); F.recoveryCode = null; db.meta.recoveryAck = true; save(true); render(); };
  }
  const accessHtml = () => `<div class="card"><b>🔐 ${__h('Approve this phone')}</b>
    <p class="note">${__h("Your account has access to this log, but this phone doesn't have its encryption keys yet. A parent (or your other phone) can approve it from the Family tab. They'll ask you to read out this code:")}</p>
    <div class="code" style="font:700 19px ui-monospace,Menlo,monospace;text-align:center;margin:12px 0">${esc(F.fp)}</div>
    <button class="btn" id="aCheck" style="width:100%">${__h('Check again')}</button>
    <label class="f">${__h('Or use your recovery code')}</label><input id="aCode" type="text" autocapitalize="characters" autocomplete="off" placeholder="XXXX-XXXX-XXXX-…">
    <button class="btn p" id="aRecover" style="width:100%;margin-top:8px">${__h('Unlock with recovery code')}</button>
    ${alertP(O.err)}
    <button class="btn" id="aOut" style="width:100%;margin-top:8px">${__h('Sign out')}</button></div>`;
  function bindAccessScreen() {
    const check = async () => { await Sync.run(true); if (!Sync.st.needsAccess) render(); };
    $('#aCheck').onclick = check; $('#aOut').onclick = () => signOut(false);
    $('#aRecover').onclick = async () => {
      const code = $('#aCode').value; if (E2EE.normCode(code).length < 32) { O.err = N_('Enter the whole recovery code'); return render(); }
      O.err = ''; toast(__('Unlocking…'));
      try { await Sync.recover(code); O.err = ''; render(); } catch (e) { O.err = err(e); render(); }
    };
    clearInterval(waitTimer); waitTimer = setInterval(() => { if (!$('#aCheck')) return clearInterval(waitTimer); check(); }, 8000);
  }

  async function wipeLocal() {
    await Sync.dropKept();   // (the other family logs kept on the phone too)
    forgetTree();
    db = { baby: { name: '', birth: '', kids: Kids.clean([]) }, events: [], deleted: [], meta: {} };
    save(true); tab = 'day'; invite = null; F.loaded = false; F.verified = false; F.enrollRequested = F.enrollForCreate = false; M.enroll = null;
    Sync.st.people = []; Sync.st.requests = []; Sync.st.invites = []; Sync.st.memberships = []; Sync.st.myRequests = []; await Lock.clear();
  }
  /** The server ended this session (signed out everywhere, or the refresh token was revoked): clear this phone. */
  async function sessionLost() { await wipeLocal(); L.step = 'email'; L.err = N_('You were signed out. Please sign in again.'); render(); }
  async function signOut(everywhere) {
    if (Sync.linked() && !everywhere) await Sync.run(true);
    const kept = Object.values(await Sync.unsentKept()).reduce((a, n) => a + n, 0);   // (and in the other families kept on the phone)
    if (Sync.linked() && (Sync.st.state !== 'ok' || kept) && !confirm(__('Some changes have not synced yet and would be lost. Sign out anyway?'))) return;
    if (!confirm(everywhere ? __('Sign out of Little Log on ALL your devices? You will need to sign in again everywhere.') : __("Sign out? This clears the baby log from this device (it stays safe, encrypted, in the cloud). Your encryption keys stay in the phone's secure storage so you can sign back in."))) return;
    try { await Auth.signOut(everywhere); } catch (e) { return toast(everywhere ? __('Could not reach the server – try again when online') : err(e)); }
    await wipeLocal(); render();
  }
  async function deleteAccount() {
    const otherParents = Sync.st.people.filter(p => p.role === 'parent' && !p.is_you).length, parent = db.meta.role === 'parent';
    const msg = parent && !otherParents ? __("You are this log's only parent, so the log and all its entries will be DELETED FOR EVERYONE who shares it. (Make another person a parent first to keep it.)") : __('You will leave the shared log; it stays for everyone else.');
    if (!confirm(__('Permanently delete your account?') + '\n\n' + msg + '\n\n' + __('This cannot be undone.'))) return;
    if (!confirm(__('Really delete your account and the data on this device?'))) return;
    try { await Auth.rpc('delete_my_account'); } catch (e) { return toast(err(e)); }
    const uid = Auth.id, babies = Sync.st.memberships.map(m => m.id);
    try { await Auth.signOut(false); } catch (e) {}
    for (const b of babies) await E2EE.forget(b);
    await E2EE.wipeUser(uid); await Cloud.reset(); await wipeLocal(); render(); toast(__('Account deleted'));
  }

  // ---- QR scanning ------------------------------------------------------------------------------
  async function scan() {
    const close = showSheet(`<h3>📷 ${__h('Scan invite QR')}</h3><div class="scan"><video id="scanV" playsinline muted></video></div>
      <p class="note" id="scanMsg">${__h("Point the camera at the QR code on the parent's phone.")}</p>
      <div class="row"><button class="btn" id="scanX">${__h('Cancel')}</button></div>`);
    let stream = null, stop = false;
    const done = () => { stop = true; if (stream) stream.getTracks().forEach(t => t.stop()); close(); };
    $('#scanX').onclick = $('#sheetBack').onclick = done;
    const msg = t => { const m = $('#scanMsg'); if (m) m.textContent = t; };
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
    catch (e) { return msg(__('Camera not available. Allow camera access in your phone settings, or type the code instead.')); }
    const v = $('#scanV'); v.srcObject = stream; await v.play().catch(() => {});
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (stop) return;
      if (v.videoWidth) {
        const k = Math.min(1, 480 / v.videoWidth); cv.width = v.videoWidth * k; cv.height = v.videoHeight * k;
        cx.drawImage(v, 0, 0, cv.width, cv.height);
        const img = cx.getImageData(0, 0, cv.width, cv.height), r = jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
        if (r) { const link = parseJoinLink(r.data); if (link) { done(); return joinWith(link.code, link.secret); } msg(__('That QR code is not a Little Log invite.')); }
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ---- Family tab -------------------------------------------------------------------------------
  function syncLine() {
    if (!Store.st.ok) return '⚠️ ' + __('Cannot save on this phone (storage full?). Your newest entries are only in memory – free up space');
    if (!Sync.linked()) return '';
    const s = Sync.st;
    const base = s.state === 'syncing' ? '⏳ ' + __('Syncing…') : s.state === 'ok' ? '✅ ' + __('Synced {when}', { when: ago(s.at) }) : s.state === 'offline' ? '📴 ' + __('Offline – will sync when connected') : s.state === 'error' ? '⚠️ ' + __('Sync problem') : __('Not synced yet');
    return base + (Sync.isParent() ? '' : ` · ${roleName(db.meta.role)}`);
  }
  /** The Approve and Deny buttons of the request cards in `root` (the Family tab, or the pop-up): requests to join any family you are
      a parent in (the tree shows those of the families not shown). `after` runs once a decision is made. */
  function bindRequests(root, after) {
    const anyReq = id => Sync.st.requests.find(x => x.id === id) || Object.values(Sync.st.familyRequests).flat().find(x => x.id === id);
    const checked = (name, v) => { const c = root.querySelector(`input[name=${name}][value="${v}"]`); return !!(c && c.checked); };
    root.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
      const r = anyReq(b.dataset.approve); if (!r) return;
      if (!r.qrVerified && !checked('vchk', r.id)) return toast(__('Compare the security code with their phone, then tick "It matches"'));
      try { await Sync.decide(r, true, { manualOk: checked('vchk', r.id) }); toast(__('Approved')); } catch (e) { toast(err(e)); }
      after();
    });
    root.querySelectorAll('[data-deny]').forEach(b => b.onclick = async () => { const r = anyReq(b.dataset.deny); if (!r || !confirm(__('Deny this request?'))) return; try { await Sync.decide(r, false); } catch (e) { toast(err(e)); } after(); });
  }
  /** A request to join pops up on a parent's phone as it arrives (once per request while the app runs), to approve or deny there and
      then, or leave for later: it stays on the Family tab, with the badge. Not over a sheet, the tour or the sign-in and lock screens. */
  const prompted = new Set();
  function promptRequests() {
    if (!Sync.isParent() || !Sync.st.requests.length || document.body.classList.contains('gated') || Tour.active() || !$('#sheet').hidden) return;
    const r = Sync.st.requests.find(x => !prompted.has(x.id)); if (!r) return;
    prompted.add(r.id);
    const close = popup(`<h3>👨‍👩‍👧 ${__h('Someone wants to join')}</h3>${reqCard(r)}<div class="row" style="margin-top:12px"><button class="btn" data-close>${__h('Later')}</button></div>`);
    const done = () => { close(); $('#sheet').innerHTML = ''; };   // (nothing of the card lingers in the hidden sheet)
    $('#sheetBack').onclick = done; $('#sheet').querySelectorAll('[data-close]').forEach(b => b.onclick = done);
    bindRequests($('#sheet'), () => { done(); render(); });
  }
  /** A request to join a family log, to approve or deny (`family`: its name, when it is not the log shown). */
  function reqCard(r, family) {
    return `<div class="card"><b>${esc(r.display_name || r.email)}</b><br><small class="note">${esc(r.email)} · ${family ? __h('asked to join {family} as **{role}**', { family, role: roleName(r.role) }) : __h('asked to join as **{role}**', { role: roleName(r.role) })}</small>
      ${r.qrVerified ? `<div class="note" style="margin-top:6px">✅ ${__h('Verified: they scanned your QR code, so this is really their phone.')}</div>`
        : `<div class="note" style="margin-top:6px">⚠️ ${__h('They did not use your QR code. Ask them to read out the security code their phone shows while it waits, and check it matches:')}</div><div class="code mono">${esc(r.fingerprint)}</div><div class="chips">${chip('vchk', r.id, __h('It matches'), false)}</div>`}
      <p class="note">${__h("Approving shares the log's encryption keys with their phone.")}</p>
      <div class="row"><button class="btn p" data-approve="${esc(r.id)}">${__h('Approve')}</button><button class="btn d" data-deny="${esc(r.id)}">${__h('Deny')}</button></div></div>`;
  }

  // ---- the family tree: you, and each family log you are in -----------------------------------------
  /** What a family log is called: "Your family" (the one you are a parent in), after its parents ("Sarah's family") where you may
      see who they are, or else after its children. */
  function famName(m) {
    if (!m) return '';
    if (m.role === 'parent' && Sync.st.memberships.filter(x => x.role === 'parent').length < 2) return __('Your family');
    const ps = (Sync.st.familyPeople[m.id] || []).filter(p => p.role === 'parent').map(p => p.name);
    if (ps.length) return __("{names}'s family", { names: andList(ps) });
    return andList(famKidNames(m));
  }
  const famKids = m => (m.id === db.meta.babyId ? kids() : Kids.clean(m.kids, m.name, m.birth));
  const famKidNames = m => famKids(m).map((k, i) => k.name || __('Baby {n}', { n: i + 1 }));
  /** Bring the tree up to date (new families, requests waiting, names): when the Family tab opens, and every 15 s while one of your requests waits. */
  async function refreshTree() {
    F.treeAt = Date.now();
    F.keptUnsent = await Sync.unsentKept().catch(() => ({}));   // (from the phone: known offline too)
    if (tab === 'family') render();
    const had = Sync.st.memberships.map(m => m.id).join();
    try { await Promise.all([Sync.loadMemberships(), Sync.loadMyRequests()]); } catch (e) { return; }   // (offline: the tree as the phone knows it)
    await Promise.all([Sync.loadFamilyPeople(), Sync.loadFamilyRequests(), Sync.loadRetired(), RELATIVES.includes(db.meta.role) ? Sync.loadTree().catch(() => null) : null]);
    const now = Sync.st.memberships.filter(m => !had.split(',').includes(m.id));
    if (had && now.length) toast(__("You're in: {family}", { family: famName(now[0]) }));
    if (tab === 'family') render();
  }
  // ---- the children's family tree (ftree.js): kept by the parents, sealed like the rest of the log, shown to the relatives -------
  // Whoever this phone has not shown on it before sprouts in (all of it, the first time), remembered on the phone.
  const T = { seen: undefined, grow: {}, acts: {}, for: null, scroll: null, width: 360, center: 180 }, SEEN = 'll.treeSeen';
  function treeSeen() {
    if (T.seen === undefined) { try { const a = JSON.parse(localStorage.getItem(SEEN) || 'null'); T.seen = Array.isArray(a) ? new Set(a) : null; } catch (e) { T.seen = null; } }
    return T.seen;
  }
  const forgetTree = () => { T.seen = undefined; T.grow = {}; T.acts = {}; T.scroll = null; try { localStorage.removeItem(SEEN); } catch (e) { /* nothing kept */ } };
  /** The family logs you are family in (offline before they were loaded: the one shown). */
  const kinFams = () => (Sync.st.memberships.length ? Sync.st.memberships : db.meta.babyId ? [{ id: db.meta.babyId, role: db.meta.role }] : []).filter(m => RELATIVES.includes(m.role));
  /** The relatives in family log `m`, not you. */
  const kinOf = m => (m.id === db.meta.babyId
    ? Sync.st.people.filter(p => RELATIVES.includes(p.role) && !p.is_you).map(p => ({ id: p.user_id, name: p.display_name || __('Member'), role: p.role }))
    : (Sync.st.familyPeople[m.id] || []).map(p => ({ id: p.id, name: p.name || __('Member'), role: p.role })));
  const firstOf = n => ([...String(n || '').trim()][0] || '?').toUpperCase();
  /** A child's age: in weeks, then months, then years. */
  function kidAge(k, now = Date.now()) {
    const mo = Guide.monthsOld(k.birth, now);
    if (mo < 0) return '';
    if (mo < 1) return __n('{n} week', '{n} weeks', Math.max(0, Math.floor((now - new Date(k.birth + 'T00:00').getTime()) / DAY / 7)));
    return mo < 24 ? __n('{n} month', '{n} months', mo) : __n('{n} year', '{n} years', Math.floor(mo / 12));
  }
  // who someone is to the children, by where they are on the tree; adding someone there; whose …, for the sheet
  const KIN = { parent: N_('Parent'), gp: N_('Grandparent'), ggp: N_('Great-grandparent'), sib: N_('Aunt or uncle'), partner: N_('Aunt or uncle'), cousin: N_('Cousin') };
  const ADDS = { parent: N_("Add the children's other parent"), gp: N_('Add a grandparent'), ggp: N_('Add a great-grandparent'), sib: N_('Add an aunt or uncle'), partner: N_('Add a partner'), cousin: N_('Add a cousin') };
  const WHOSE = { gp: N_("{name}'s parent"), ggp: N_("{name}'s parent"), sib: N_("{name}'s brother or sister"), partner: N_("{name}'s partner"), cousin: N_("{name}'s child") };
  // the kinds of tree, and where each is the most common one: the tree is the one where the family comes from (a parent can change it)
  const TREES = { oak: [N_('English oak'), N_('UK & Ireland')], maple: [N_('Red maple'), N_('North America')], beech: [N_('European beech'), N_('Central Europe')],
    birch: [N_('Silver birch'), N_('Northern and Eastern Europe')], olive: [N_('Olive tree'), N_('The Mediterranean and the Middle East')], eucalyptus: [N_('Eucalyptus'), N_('Australia & New Zealand')],
    cherry: [N_('Cherry blossom'), N_('East Asia')], banyan: [N_('Banyan'), N_('South Asia')], mango: [N_('Mango tree'), N_('Southeast Asia')], acacia: [N_('Umbrella acacia'), N_('Africa')], jacaranda: [N_('Jacaranda'), N_('Latin America')] };
  const timeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };
  const autoTree = () => FamilyTree.speciesFor(myRegion(), I18n.lang(), timeZone());
  const swatch = k => { const c = FamilyTree.look(k); return `<i class="ftsw" style="background:${c.crown};border-color:${c.bark}" aria-hidden="true"></i>`; };
  /** Until a parent adds anyone: the children's parents, as the log knows them. */
  const startTree = () => FamilyTree.clean({ parents: Sync.st.people.filter(p => p.role === 'parent').slice(0, 2).map(p => ({ id: 'u' + p.user_id.replace(/-/g, '').slice(0, 12), name: p.display_name, user: p.user_id })) });
  const shownTree = () => (Sync.st.tree !== undefined ? Sync.st.tree : db.meta.tree) || startTree();
  /** Someone's name: as they call themselves in Little Log when they have an account this phone knows, else as written on the tree. */
  function treeName(p) {
    if (p && p.user) {
      const m = Sync.st.people.find(x => x.user_id === p.user); if (m && m.display_name) return m.display_name;
      for (const l of Object.values(Sync.st.familyPeople)) { const q = l.find(x => x.id === p.user); if (q && q.name) return q.name; }
    }
    return (p && p.name) || '';
  }
  /** The tree as the picture draws it, and what tapping each part does. */
  function treeModel(t, edit) {
    const acts = {}, now = Date.now();
    const node = (p, kind) => {
      const nm = treeName(p), key = 'p:' + p.id; acts[key] = () => treeCard(p.id);
      return { key, label: p.call || nm, initial: firstOf(nm), title: [nm, p.call && p.call !== nm ? p.call : '', __(KIN[kind])].filter(Boolean).join(' · '), gone: !!p.gone };
    };
    const here = { id: db.meta.babyId, role: db.meta.role };
    const kidsHere = kids().map(k => { const key = 'k:' + k.id, nm = kidName(k); acts[key] = () => kidCard(here, k, nm); return { key, label: nm, initial: firstOf(nm), title: [nm, kidAge(k, now)].filter(Boolean).join(' · '), color: k.color }; });
    // an aunt or uncle's children: from their own family log when this phone has it (in their colours, to open), else as written
    const cousins = sb => {
      const m = sb.family && Sync.st.memberships.find(x => x.id === sb.family), live = m ? famKids(m) : [], names = m ? famKidNames(m) : [];
      const listed = sb.kids.map((c, i) => {
        const k = c.kid && live.find(x => x.id === c.kid), nm = k ? names[live.indexOf(k)] : treeName(c), key = 'p:' + c.id;
        acts[key] = () => (k ? kidCard(m, k, nm) : treeCard(c.id));
        return { key, label: c.call || nm, initial: firstOf(nm), title: [nm, k && kidAge(k, now), __('Cousin')].filter(Boolean).join(' · '), color: k ? k.color : Kids.PALETTE.other[i % Kids.PALETTE.other.length], gone: !!c.gone };
      });
      const born = live.filter(k => !sb.kids.some(c => c.kid === k.id)).map(k => {   // (born since they were added to the tree)
        const nm = names[live.indexOf(k)], key = `c:${m.id}:${k.id}`; acts[key] = () => kidCard(m, k, nm);
        return { key, label: nm, initial: firstOf(nm), title: [nm, kidAge(k, now), __('Cousin')].filter(Boolean).join(' · '), color: k.color };
      });
      return [...listed, ...born].slice(0, FamilyTree.MAX_KIDS);
    };
    const parents = t.parents.map(par => {
      acts['+gp:p:' + par.id] = () => relativeForm({ kind: 'gp', at: par.id }); acts['+sib:p:' + par.id] = () => relativeForm({ kind: 'sib', at: par.id });
      return { ...node(par, 'parent'),
        gp: par.gp.map(g => { acts['+ggp:p:' + g.id] = () => relativeForm({ kind: 'ggp', at: g.id }); return { ...node(g, 'gp'), gp: g.gp.map(q => node(q, 'ggp')) }; }),
        sibs: par.sibs.map(sb => ({ ...node(sb, 'sib'), partner: sb.partner ? node(sb.partner, 'partner') : null, kids: cousins(sb) })) };
    });
    acts['+parent'] = () => relativeForm({ kind: 'parent' });
    const tr = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, __(v)]));
    return { model: { title: __('Family tree'), rtl: I18n.rtl(), edit, text: tr({ parent: KIN.parent, gp: KIN.gp, ggp: KIN.ggp, sib: KIN.sib }), adds: tr(ADDS), kids: kidsHere, parents }, acts };
  }
  /** The family tree, for the children's relatives; the families you have asked to join, and adding one, for everyone. */
  function treePicHtml() {
    const s = Sync.st, mine = s.myRequests.filter(r => r.status === 'pending');
    const add = `${mine.map(r => `<div class="fam pending"><div class="fhead"><span>⏳ ${__h('Request sent')}<br><small>${__h('Waiting for a parent to approve')}</small></span><button class="btn d" data-cancelreq="${esc(r.id)}">${__h('Cancel')}</button></div></div>`).join('')}
      <button class="btn" id="famAdd" style="width:100%;margin-top:10px">+ ${__h('Add a family')}</button>`;
    if (!RELATIVES.includes(db.meta.role)) return `<div class="card">${add}</div>`;   // (caregivers and the like help the family; its tree is for the family)
    if (T.for !== db.meta.babyId) { T.for = db.meta.babyId; T.scroll = null; }
    const t = shownTree(), edit = Sync.isParent(), { model, acts } = treeModel(t, edit), kind = t.species || autoTree();
    const seen = treeSeen(), now = Date.now();
    let order = 0;
    model.sprout = key => {   // (the time each new part started growing is kept, so a render while it grows carries on)
      if (T.grow[key] == null) { if (seen && seen.has(key)) return null; T.grow[key] = now + Math.min(order++ * 80, 2000); }
      if (now - T.grow[key] > 1000) { delete T.grow[key]; return null; }
      return T.grow[key] - now;
    };
    const { html, keys, width, center } = FamilyTree.draw({ ...model, species: kind, dark: Theme.isDark() });
    Object.assign(T, { acts, width, center });
    const all = new Set([...(seen || []), ...keys]);
    if (!seen || all.size > seen.size) { T.seen = all; try { localStorage.setItem(SEEN, JSON.stringify([...all].slice(-500))); } catch (e) { /* storage blocked: it grows in again next time */ } }
    const bare = !t.parents.some(p => p.gp.length || p.sibs.length);
    return `<h2>🌳 ${__h('Family tree')}</h2><div class="card ftreeimg"><div class="ftreewrap">${html}</div>
      <div class="ftfoot"><p class="note fkind">${swatch(kind)}${__h(TREES[kind][0])} · ${__h(TREES[kind][1])}${edit ? ` <button class="btn ftchange" id="ftKind">${__h('Change tree')}</button>` : ''}</p>
      ${bare ? `<p class="note fhint">${edit ? __h('Tap a + to add grandparents, great-grandparents, aunts, uncles and cousins.') : __h('A parent can add grandparents, aunts, uncles and cousins.')}</p>` : ''}
      ${add}</div></div>`;
  }
  /** The kind of tree (parents): the one that grows most where the family comes from, or the automatic one for where the phone is. */
  function pickTree() {
    const t = shownTree(), cur = t.species || '', auto = autoTree();
    const close = showSheet(`<h3>🌳 ${__h("Your family's tree")}</h3><p class="note" style="margin-top:0">${__h('Pick the tree that grows most where your family comes from. Everyone in the family sees it.')}</p>
      <div class="chips ftkinds">${chip('ftKind', '', `${swatch(auto)}${__h('Automatic: {tree}', { tree: __(TREES[auto][0]) })}`, !cur, '', true)}${FamilyTree.KINDS.map(k => chip('ftKind', k, `${swatch(k)}${__h(TREES[k][0])} <small>${__h(TREES[k][1])}</small>`, cur === k, '', true)).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="ftKindSave">${__h('Save')}</button></div>`);
    $('#sheet [data-close]').onclick = close;
    $('#ftKindSave').onclick = async () => {
      const v = (document.querySelector('#sheet [name=ftKind]:checked') || {}).value || '';
      if (v === cur) return close();
      try { await Sync.loadPeople().catch(() => {}); await Sync.editTree(tr => { if (v) tr.species = v; else delete tr.species; }, startTree()); close(); toast(__('Saved')); render(); }
      catch (e) { toast(err(e)); }
    };
  }
  /** Someone on the tree: who they are to the children, what the children call them, their contact details when they share this log;
      a parent edits them here, and adds an aunt or uncle's partner and children. */
  function treeCard(id) {
    const w = FamilyTree.find(shownTree(), id); if (!w) return;
    const p = w.p, edit = Sync.isParent(), member = p.user && Sync.st.people.find(x => x.user_id === p.user), sib = w.kind === 'sib' ? p : w.kind === 'partner' || w.kind === 'cousin' ? w.up : null;
    const fam = sib && sib.family && Sync.st.memberships.find(m => m.id === sib.family && m.id !== db.meta.babyId);
    const close = showSheet(`<h3>${esc(treeName(p))}</h3>
      <p class="note" style="margin-top:0">${esc([__(KIN[w.kind]), w.kind === 'parent' ? '' : __("{name}'s side", { name: treeName(w.side) })].filter(Boolean).join(' · '))}</p>
      ${p.call ? `<div class="stat"><span>${__h('What the children call them')}<br><b class="sel">${esc(p.call)}</b></span></div>` : ''}
      ${p.gone ? `<p class="note">✦ ${__h('In loving memory')}</p>` : ''}
      ${member ? detailsHtml(member.info || {}, member.email) : ''}
      <div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Close')}</button>${fam ? `<button class="btn" id="tcOpen">${__h('Open {family}', { family: famName(fam) })}</button>` : ''}${edit ? `<button class="btn p" id="tcEdit">${__h('Edit')}</button>` : ''}</div>
      ${edit && w.kind === 'sib' ? `<div class="row">${p.partner ? '' : `<button class="btn" id="tcPartner">+ ${__h('Add a partner')}</button>`}${p.kids.length < FamilyTree.MAX_KIDS ? `<button class="btn" id="tcCousin">+ ${__h('Add a cousin')}</button>` : ''}</div>` : ''}`);
    $('#sheet [data-close]').onclick = close;
    if ($('#tcOpen')) $('#tcOpen').onclick = () => { close(); openFamily(fam.id); };
    if ($('#tcEdit')) $('#tcEdit').onclick = () => relativeForm({ id });
    if ($('#tcPartner')) $('#tcPartner').onclick = () => relativeForm({ kind: 'partner', at: id });
    if ($('#tcCousin')) $('#tcCousin').onclick = () => relativeForm({ kind: 'cousin', at: id });
  }
  /** People this phone knows in Little Log who could be added: relatives in this log, and the parents and family in your relatives'
      family logs (an aunt or uncle picked from their own family brings their partner and children along). */
  function treeCandidates(t, kind) {
    if (kind === 'cousin') return [];
    const on = new Set(FamilyTree.walk(t).map(w => w.p.user).filter(Boolean)), out = [];
    for (const p of Sync.st.people) if (RELATIVES.includes(p.role) && !on.has(p.user_id)) { on.add(p.user_id); out.push({ user: p.user_id, name: p.display_name || __('Member') }); }
    for (const m of kinFams()) {
      if (m.id === db.meta.babyId) continue;
      for (const q of Sync.st.familyPeople[m.id] || []) if (q.id && !on.has(q.id)) { on.add(q.id); out.push({ user: q.id, name: q.name, fam: famName(m), family: q.role === 'parent' ? m.id : null }); }
    }
    return out.slice(0, 12);
  }
  /** An aunt or uncle picked from their own family log: their partner (its other parent) and their children come too. */
  function fromFamily(pick) {
    const m = Sync.st.memberships.find(x => x.id === pick.family); if (!m) return {};
    const partner = (Sync.st.familyPeople[m.id] || []).find(q => q.role === 'parent' && q.id !== pick.user), names = famKidNames(m);
    return { family: m.id, ...(partner ? { partner: { id: FamilyTree.newId(), name: partner.name, user: partner.id } } : {}), kids: famKids(m).map((k, i) => ({ id: FamilyTree.newId(), name: names[i], kid: k.id })) };
  }
  /** Add someone to the tree (kind, at: who they hang from), or change someone on it (id). Parents only. */
  function relativeForm({ kind, at, id }) {
    const t = shownTree(), w = id ? FamilyTree.find(t, id) : null, up = w ? w.up : at ? (FamilyTree.find(t, at) || {}).p : null;
    if (id && !w) return;
    kind = w ? w.kind : kind;
    const p = w ? w.p : {}, picks = w ? [] : treeCandidates(t, kind), whose = WHOSE[kind] && up ? __(WHOSE[kind], { name: treeName(up) }) : '';
    const close = showSheet(`<h3>🌱 ${w ? esc(treeName(p)) : __h(ADDS[kind])}</h3>${whose ? `<p class="note" style="margin-top:0">${esc(whose)}</p>` : ''}
      ${picks.length ? `<label class="f">${__h('Already in Little Log')}</label><div class="chips">${picks.map((c, i) => chip('rlPick', i, `${esc(c.name)}${c.fam ? ` <small>· ${esc(c.fam)}</small>` : ''}`, false, '', true)).join('')}</div>` : ''}
      <label class="f" for="rlName">${__h('Name')}</label><input id="rlName" type="text" maxlength="40" value="${esc(p.name || '')}">
      <label class="f" for="rlCall">${__h('What the children call them')}</label><input id="rlCall" type="text" maxlength="24" value="${esc(p.call || '')}" placeholder="${__h('e.g. Nana, Grandpa Joe')}">
      <div class="chips" style="margin-top:12px">${chip('rlGone', '1', __h('In loving memory'), !!p.gone)}</div>
      <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="rlSave">${w ? __h('Save') : __h('Add')}</button></div>
      ${w ? `<div class="row"><button class="btn d" id="rlRemove">${__h('Remove from the tree')}</button></div>` : ''}`);
    $('#sheet [data-close]').onclick = close;
    const pick = () => picks[(document.querySelector('#sheet [name=rlPick]:checked') || {}).value];
    document.querySelectorAll('#sheet [name=rlPick]').forEach(r => r.onchange = () => { const c = pick(); if (c) $('#rlName').value = c.name; });
    $('#rlName').oninput = () => { const c = pick(); if (c && $('#rlName').value.trim() !== c.name) document.querySelector('#sheet [name=rlPick]:checked').checked = false; };   // (typed someone else)
    const save = async (change, done) => {
      try { await Sync.loadPeople().catch(() => {}); await Sync.editTree(change, startTree()); close(); toast(__(done)); render(); }
      catch (e) { toast(err(e)); }
    };
    $('#rlSave').onclick = () => {
      const name = $('#rlName').value.trim(), call = $('#rlCall').value.trim(), gone = !!document.querySelector('#sheet [name=rlGone]:checked'), c = pick();
      if (!name) return toast(__('Enter a name'));
      if (w) return save(tr => FamilyTree.update(tr, id, { name, call, gone }), N_('Saved'));
      const person = { id: FamilyTree.newId(), name, call, gone, ...(c ? { user: c.user } : {}), ...(c && c.family && kind === 'sib' ? fromFamily(c) : {}) };
      save(tr => FamilyTree.add(tr, kind, at, person), N_('Saved'));
    };
    if ($('#rlRemove')) $('#rlRemove').onclick = () => {
      if (!confirm(__('Remove {name} from the family tree? Anyone added through them goes too.', { name: treeName(p) }))) return;
      save(tr => FamilyTree.remove(tr, id), N_('Removed'));
    };
  }
  /** A child tapped on the tree: their age and allergies, and their day (their family is opened first). */
  function kidCard(m, k, name) {
    const fam = famName(m), al = (k.allergies || []).map(a => __(a.food));
    const big = m.id === db.meta.babyId ? momentsOf([k.id]).slice(-3).reverse() : [];   // (the family shown: its latest big moments)
    const close = showSheet(`<h3 class="kidhead"><span class="av lg" style="--k:${esc(k.color)}">${esc(firstOf(name))}</span>${esc(name)}</h3>
      <p class="note" style="margin-top:0">${[kidAge(k), fam].filter(Boolean).map(esc).join(' · ')}</p>
      ${al.length ? `<p class="note allergyline">⚠️ ${__h('Allergies: {foods}', { foods: al.join(', ') })}</p>` : ''}
      ${big.length ? `<p class="mh">${__h('Latest big moments')}</p>${big.map(e => `<p class="kmo">🌟 <b>${esc(describe(e)[0])}</b> <small>${esc([fmtShort(e.ts), Stages.age(k.birth, e.ts)].filter(Boolean).join(' · '))}</small></p>`).join('')}` : ''}
      <div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Close')}</button><button class="btn p" id="tcDay">${__h("Show {name}'s day", { name })}</button></div>`);
    $('#sheet [data-close]').onclick = close;
    $('#tcDay').onclick = async () => {
      close();
      if (m.id !== db.meta.babyId && !(await openFamily(m.id))) return;
      setKid(k.id); tab = 'day'; viewDay = startOfDay(Date.now()); render(); window.scrollTo(0, 0);
    };
  }
  /** Every family you are family in: its children and relatives (the family shown: everyone in it, to tap), switching, and the
      requests to join one you are a parent in. A twirl-down in place of the family list; it opens by itself when a new request
      waits in it. */
  function famListHtml(person, roles) {
    const s = Sync.st, fams = kinFams();
    if (!fams.length) return '';
    const waitingIn = fams.reduce((n, m) => n + (m.id === db.meta.babyId ? 0 : (s.familyRequests[m.id] || []).length), 0);
    if (waitingIn > (F.waitSeen || 0)) openGroups.add('famlist');
    F.waitSeen = waitingIn;
    const branch = m => {
      const on = m.id === db.meta.babyId, name = famName(m), reqs = on ? [] : s.familyRequests[m.id] || [], kept = F.keptUnsent[m.id] || 0, kin = kinOf(m);
      return `<li class="fam${on ? ' on' : ''}" data-fam="${esc(m.id)}">
        <div class="fhead"><span><b>${esc(name)}</b><br><small>${esc(roleName(m.role))}</small></span>${on ? `<small class="fshow">${__h('Showing')}</small>` : `<button class="btn" data-famopen="${esc(m.id)}">${__h('Open')}</button>`}</div>
        <div class="fkids">${famKids(m).map((k, i) => `<span class="fkid">${avatar(k)}${esc(famKidNames(m)[i])}</span>`).join('')}</div>
        ${on && roles ? `<div class="fpeople">${s.people.filter(p => RELATIVES.includes(p.role)).map(person).join('')}</div>` : kin.length ? `<p class="note fkin">${__h('Family: {names}', { names: andList(kin.map(p => p.name)) })}</p>` : ''}
        ${kept ? `<p class="note">⏳ ${__hn('{n} change not sent yet: it goes when you open this family.', '{n} changes not sent yet: they go when you open this family.', kept)}</p>` : ''}
        ${reqs.map(r => reqCard(r, name)).join('')}</li>`;
    };
    const sub = waitingIn ? '📨 ' + __n('{n} waiting for your approval', '{n} waiting for your approval', waitingIn) : andList(fams.map(famName));
    return `<details class="gd famlist" data-grp="famlist" ${openGroups.has('famlist') ? 'open' : ''}><summary><span class="gi">🌳</span><span class="gt"><b>${__h('Families and relatives')}</b><small>${esc(sub)}</small></span><span class="chev" aria-hidden="true">›</span></summary>
      <ul class="fbranches">${fams.map(branch).join('')}</ul></details>`;
  }
  /** The families you help with (caregiver, babysitter, medical assistant, friend): not part of the tree. */
  function helpFamsHtml() {
    const ms = Sync.st.memberships.filter(m => HELPERS.includes(m.role));
    return ms.length ? `<h2>${__h('Families you help with')}</h2><div class="card fhelp"><ul class="fbranches flat">${ms.map(m => {
      const on = m.id === db.meta.babyId, kept = F.keptUnsent[m.id] || 0;
      return `<li class="fam${on ? ' on' : ''}" data-fam="${esc(m.id)}">
        <div class="fhead"><span><b>${esc(famName(m))}</b><br><small>${esc(roleName(m.role))}</small></span>${on ? `<small class="fshow">${__h('Showing')}</small>` : `<button class="btn" data-famopen="${esc(m.id)}">${__h('Open')}</button>`}</div>
        <div class="fkids">${famKids(m).map((k, i) => `<span class="fkid">${avatar(k)}${esc(famKidNames(m)[i])}</span>`).join('')}</div>
        ${kept ? `<p class="note">⏳ ${__hn('{n} change not sent yet: it goes when you open this family.', '{n} changes not sent yet: they go when you open this family.', kept)}</p>` : ''}</li>`;
    }).join('')}</ul></div>` : '';
  }
  /** Join another family's log: scan the QR code one of its parents shows you (or type its code); they approve the request. */
  function addFamily() {
    const close = showSheet(`<h3>🌳 ${__h('Add a family')}</h3>
      <p class="note">${__h("Looking after someone else's children? Ask one of their parents to open Family → Invite someone in their Little Log, choose what you may do, and show you the QR code. Scan it here. Once they approve, their family appears here: in your family tree if you are family, or with the families you help with. You can switch between families at any time.")}</p>
      <div class="row"><button class="btn p" id="afScan" style="flex:1">📷 ${__h('Scan QR code')}</button></div>
      <label class="f" for="afCode">${__h('Or enter a code')}</label><div class="row"><input id="afCode" type="text" maxlength="10" autocapitalize="characters" placeholder="ABCDE12345" style="flex:2"><button class="btn" id="afJoin">${__h('Send request')}</button></div>
      <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Close')}</button></div>`);
    $('#sheet [data-close]').onclick = close;
    $('#afScan').onclick = () => { close(); scan(); };
    $('#afJoin').onclick = () => { const c = parseJoin($('#afCode').value); if (!c) return toast(__('Invite codes are 10 letters/numbers')); close(); joinWith(c); };
  }
  /** Show another family log (from the tree or the switcher at the top). Resolves true once it shows. */
  async function openFamily(id, btn) {
    const m = Sync.st.memberships.find(x => x.id === id); if (!m || Sync.switching) return false;
    if (btn) { btn.disabled = true; btn.textContent = __('Switching…'); }
    let ok = false;
    try {
      if ((ok = await Sync.choose(id))) { membersLoadedFor = null; F.treeAt = 0; viewDay = startOfDay(Date.now()); toast(__('Now showing {family}', { family: famName(m) })); }
    } catch (e) { toast(__('Could not switch: {reason}', { reason: err(e) })); }
    render(); return ok;
  }
  /** The switcher at the top of the screen, for someone in more than one family log. */
  function familySwitcher() {
    const ms = Sync.st.memberships;
    const close = showSheet(`<h3>🌳 ${__h('Switch family')}</h3>
      ${ms.map(m => `<button class="card fampick${m.id === db.meta.babyId ? ' on' : ''}" data-fampick="${esc(m.id)}"><span><b>${esc(famName(m))}</b><br><small>${esc(famKidNames(m).join(', '))} · ${esc(roleName(m.role))}</small></span>${m.id === db.meta.babyId ? `<small class="fshow">${__h('Showing')}</small>` : ''}</button>`).join('')}
      <div class="row" style="margin-top:6px"><button class="btn" data-close>${__h('Close')}</button><button class="btn" id="fpTree">🌳 ${__h('Family tree')}</button></div>`);
    $('#sheet [data-close]').onclick = close;
    $('#fpTree').onclick = () => { close(); tab = 'family'; render(); };
    document.querySelectorAll('[data-fampick]').forEach(b => b.onclick = () => { if (b.dataset.fampick === db.meta.babyId) return close(); close(); openFamily(b.dataset.fampick); });
  }
  /** The name on the switcher button at the top: shown once there is more than one family log. */
  const famLabel = () => (Sync.st.memberships.length > 1 ? famName(Sync.st.memberships.find(m => m.id === db.meta.babyId)) : '');

  let membersLoadedFor = null;
  // The invite form's role and boxes as last set: the page is drawn again when the family's people and tree arrive (and every 15 s
  // while a request waits), and that must not undo what the parent was choosing.
  let invForm = null, invFormFor = null;
  function familyHtml() {
    if (invFormFor !== db.meta.babyId) { invForm = null; invFormFor = db.meta.babyId; }   // (another family: its own form)
    if (!Auth.configured || !db.meta.babyId) return `<div class="card"><b>${__h('Family sharing is off')}</b><p class="note">${!Auth.configured ? __h("Account service isn't configured (see {file}), so this device keeps its own private log.", { file: 'SETUP.md' }) : Auth.signedIn ? __h('Create a baby log to share it.') : __h(SHARE_WHY)}</p>
      ${Auth.configured && !Auth.signedIn ? `<button class="btn p" id="famShare" style="width:100%">${__h('Share with family')}</button>` : ''}</div>`;
    const s = Sync.st, parent = Sync.isParent();
    if (Date.now() - (F.treeAt || 0) > 30000) refreshTree();
    if (membersLoadedFor !== db.meta.babyId) { membersLoadedFor = db.meta.babyId; Promise.all([Sync.loadPeople(), Sync.loadRetired(), RELATIVES.includes(db.meta.role) ? Sync.loadTree().catch(() => null) : null, parent ? Sync.loadAdmin() : null, Sync.loadDevices(), Sync.myDevices().then(r => { F.myPhones = r; }), Sync.securityCode().then(c => { F.secCode = c; })]).then(() => { if (tab === 'family') render(); }).catch(() => {}); }
    const person = m => `<div class="stat"><button class="pbtn" data-pview="${esc(m.user_id)}"><span>${esc(m.display_name || __('Member'))}${m.is_you ? ` <small>${__h('(you)')}</small>` : ''}<br><small>${m.role ? esc(roleName(m.role)) : ''}${m.info && m.info.relation ? ' · ' + esc(m.info.relation) : ''}${m.email && m.role ? ' · ' + esc(m.email) : ''}</small></span><span class="chev" aria-hidden="true">›</span></button>
      ${parent && !m.is_you ? `<span class="btns"><button class="btn" data-person="${esc(m.user_id)}" style="padding:6px 12px">${__h('Edit')}</button>${HELPERS.includes(m.role) ? `<button class="btn" data-retire="${esc(m.user_id)}" style="padding:6px 12px">${__h('Retire')}</button>` : ''}</span>` : ''}</div>`;
    // with roles shown (people allowed to see the family list): the relatives are in the families twirl-down (in a family you help
    // with, on a list of their own), then the people who help, each list on its own
    const roles = s.people.some(m => m.role), help = roles ? s.people.filter(m => HELPERS.includes(m.role)) : [];
    const kinHere = kinFams().some(m => m.id === db.meta.babyId);   // (you are family in the log shown)
    const retired = s.retired.length ? `<details class="more retired"><summary>${__hn('Retired ({n})', 'Retired ({n})', s.retired.length)}<span class="chev" aria-hidden="true">›</span></summary>
      ${s.retired.map(r => `<div class="stat"><button class="pbtn" data-rview="${esc(r.id)}"><span>${esc(r.display_name)}<br><small>${esc(roleName(r.role))} · ${esc(retiredLine(r))}</small></span><span class="chev" aria-hidden="true">›</span></button></div>`).join('')}</details>` : '';
    const people = `${famListHtml(person, roles && kinHere)}${helpFamsHtml()}
      ${!s.people.length ? `<h2>${__h('People with access')}</h2><div class="card"><div class="note">${__h('Loading…')}</div></div>`
        : roles ? `${kinHere ? '' : `<h2>${__h('Family')}</h2><div class="card">${s.people.filter(m => RELATIVES.includes(m.role)).map(person).join('')}</div>`}
        <h2>${__h('Caregivers and helpers')}</h2><div class="card" id="helpers">${help.map(person).join('') || `<p class="note" style="margin:0">${__h('No caregivers, babysitters or medical assistants yet. A parent invites them below.')}</p>`}${retired}</div>`
        : `<h2>${__h('People with access')}</h2><div class="card">${s.people.map(person).join('')}</div>`}`;
    const reqs = parent && s.requests.length ? `<h2>${__h('Waiting for your approval')}</h2>${s.requests.map(r => reqCard(r)).join('')}` : '';
    const phones = E2EE.hasKeys(db.meta.babyId) ? Sync.pendingPhones() : [];
    const phonesCard = phones.length ? `<h2>${__h('Phones waiting for access')}</h2>${phones.map(d => `<div class="card"><b>${esc(d.person)}</b> · ${esc(phoneName(d.device_name))}
      <div class="note">${__h('Their phone shows a security code. Check it matches:')}</div><div class="code mono">${esc(d.fingerprint)}</div><div class="chips">${chip('vchkp', d.grantee, __h('It matches'), false)}</div>
      <div class="row"><button class="btn p" data-approvephone="${esc(d.grantee)}">${__h('Approve phone')}</button></div></div>`).join('')}` : '';
    const thisId = E2EE.device && E2EE.device.id;
    const encCard = `<h2>${__h('Encryption')}</h2><div class="card">
      <p class="note" style="margin-top:0">🔒 ${__h("Everything in this log is end-to-end encrypted. The server only stores scrambled data and can't read the baby's name, entries or notes.")}</p>
      ${db.meta.unverified ? `<div class="card alert"><b>${__h('Check this security code')}</b><p class="note">${__h("You joined without scanning a QR code. Make sure this code matches the one on a parent's phone. If it doesn't, tell them straight away.")}</p><div class="code mono">${esc(F.secCode)}</div><button class="btn" id="unvOk">${__h('It matches')}</button></div>` : ''}
      ${parent && db.meta.recoveryAck === false ? `<div class="card alert"><b>${__h('No recovery code confirmed')}</b><p class="note">${__h('If you lose your only phone you could lose access for good. Create a recovery code and keep it somewhere safe.')}</p></div>` : ''}
      <div class="stat"><span>${__h('Log security code')}<br><small>${__h('Everyone sharing the log sees the same code')}</small><div class="code mono" style="text-align:start">${esc(F.secCode)}</div></span></div>
      <div class="stat"><span>${__h('My phones')}<br><small>${__h("Remove a lost phone: its keys are deleted and the log's keys are changed")}</small></span></div>
      ${F.myPhones.map(d => `<div class="stat"><span>${esc(phoneName(d.name))}${d.id === thisId ? ` <small>${__h('(this phone)')}</small>` : ''}<br><small>${__h('added {date}', { date: new Date(d.created_at).toLocaleDateString(I18n.locale()) })}</small></span>${d.id === thisId ? '' : `<button class="btn d" data-rmphone="${esc(d.id)}" style="padding:6px 12px">${__h('Remove')}</button>`}</div>`).join('')}
      ${parent ? `<div class="row"><button class="btn" id="newRec">${__h('Create a new recovery code')}</button></div>` : ''}</div>`;
    return `${treePicHtml()}
    <div class="card"><b>${db.baby.name ? __h("{name}'s shared log", { name: db.baby.name }) : __h("Baby's shared log")}</b>
      <div class="stat"><span>${esc(syncLine())}${s.err && s.state === 'error' ? `<br><small>${esc(__(s.err))}</small>` : ''}</span><button class="btn" id="syncNow" style="padding:6px 12px">${__h('Sync now')}</button></div>
      ${s.denied ? `<div class="note" style="margin-top:6px">⚠️ ${__hn('{n} change was not allowed with your access and was undone.', '{n} changes were not allowed with your access and were undone.', s.denied)}</div>` : ''}
      <div class="note" style="margin-top:6px">${__h('Signed in as {email} · {role}', { email: Auth.email, role: roleName(db.meta.role) })}</div></div>
    ${reqs}${phonesCard}
    ${people}
    <details class="gd secshare" data-grp="secshare" ${invite || db.meta.unverified || (parent && db.meta.recoveryAck === false) || openGroups.has('secshare') ? 'open' : ''}><summary><span class="gi">🔐</span><span class="gt"><b>${__h('Security and sharing')}</b><small>${esc(parent ? __('Invites, the activity log, encryption and your phones') : __('Encryption and your phones'))}</small></span><span class="chev" aria-hidden="true">›</span></summary><div class="gdin">
    ${parent ? `<h2>${__h('Invite someone')}</h2><div class="card" id="invCard">
      <p class="note" style="margin-top:0">${__h('Invites work once and last 2 hours. After they scan it, you approve them.')}</p>
      ${accessFormHtml('inv', invForm ? invForm.role : 'caregiver', invForm && invForm.perms)}
      <button class="btn p" id="mkInvite" style="width:100%;margin-top:12px">${__h('Create invite QR code')}</button>
      ${invite ? inviteHtml() : ''}
      ${s.invites.length ? `<h2 style="margin-top:16px">${__h('Open invites')}</h2>${s.invites.map(i => `<div class="stat"><span>${esc(roleName(i.role))}<br><small>${esc(left(i.expires_at))}</small></span>
        <span class="btns"><button class="btn" data-showinv="${esc(i.code)}" style="padding:6px 10px">${__h('Show')}</button><button class="btn d" data-rescind="${esc(i.code)}" style="padding:6px 10px">${__h('Rescind')}</button></span></div>`).join('')}` : ''}</div>
    <h2>${__h('Activity log')}</h2><div class="card"><div class="stat"><span>${__h('Who added, changed or deleted what, and who joined or left.')}<br><small>${__h('Only parents can see this.')}</small></span><button class="btn" id="actBtn" style="padding:6px 12px">${__h('View')}</button></div></div>` : ''}
    ${encCard}</div></details>
    <div class="card"><button class="btn d" id="leave" style="width:100%">${__h('Leave this log')}</button></div>`;
  }
  function inviteHtml() {
    let svg = ''; try { svg = qrSvg(invite.url); } catch (e) { svg = `<p class="note">${__h('Could not draw the QR code – use the code instead.')}</p>`; }
    return `<div class="invite"><div class="qr" role="img" aria-label="${__h('Invite QR code')}">${svg}</div>
      <div class="code">${esc(invite.code)}</div>
      <p class="note">${__h("{role} · works once · lasts 2 hours. They scan this inside Little Log (best: it also proves it's really their phone), or type the code and you compare security codes. You'll get a request to approve.", { role: roleName(invite.role) })}</p>
      <div class="row"><button class="btn" id="invShare">${__h('Share code')}</button></div></div>`;
  }
  function bindFamily() {
    const el = id => document.getElementById(id);
    if (el('famShare')) el('famShare').onclick = () => { delete db.meta.localOnly; markWelcome(); save(true); render(); };   // (a log kept on this phone so far: sign in to share it)
    if (!el('syncNow')) return;
    document.querySelectorAll('[data-pview]').forEach(b => b.onclick = () => viewPerson(b.dataset.pview));   // anyone can open a person's card
    document.querySelectorAll('[data-rview]').forEach(b => b.onclick = () => viewRetired(b.dataset.rview));
    document.querySelectorAll('[data-retire]').forEach(b => b.onclick = () => retirePerson(b.dataset.retire));
    $('#famBadge').hidden = true;
    el('syncNow').onclick = () => Sync.run(true);
    if (el('unvOk')) el('unvOk').onclick = () => { db.meta.unverified = false; save(true); render(); toast(__('Thanks')); };
    document.querySelectorAll('[data-rmphone]').forEach(b => b.onclick = async () => {
      if (!confirm(__('Remove this phone? Its keys are deleted and the log changes to new keys, so it can read nothing new.'))) return;
      try { await Sync.removePhone(b.dataset.rmphone); F.myPhones = await Sync.myDevices(); render(); toast(__('Phone removed')); } catch (e) { toast(err(e)); }
    });
    el('famAdd').onclick = addFamily;
    const pic = document.querySelector('.ftreesvg'), wrap = pic && pic.closest('.ftreewrap');   // a tap on the tree: someone on it, or a bud to add someone
    if (pic) {
      pic.onclick = e => { const n = e.target.closest('[data-tk]'), act = n && T.acts[n.dataset.tk]; if (act) act(); };
      // a tree wider than the screen scrolls sideways: it opens at the trunk, and stays where it was scrolled to
      wrap.scrollLeft = T.scroll != null ? T.scroll : Math.max(0, (T.center * pic.clientWidth) / T.width - wrap.clientWidth / 2);
      wrap.onscroll = () => { T.scroll = wrap.scrollLeft; };
    }
    if (el('ftKind')) el('ftKind').onclick = pickTree;
    document.querySelectorAll('[data-cancelreq]').forEach(b => b.onclick = async () => { try { await Sync.cancelRequest(b.dataset.cancelreq); render(); } catch (e) { toast(err(e)); } });
    document.querySelectorAll('[data-famopen]').forEach(b => b.onclick = () => openFamily(b.dataset.famopen, b));
    clearInterval(F.treeTimer);   // while one of your requests waits, look every 15 s for the approval
    if (Sync.st.myRequests.some(r => r.status === 'pending')) F.treeTimer = setInterval(() => { if (tab !== 'family') return clearInterval(F.treeTimer); refreshTree(); }, 15000);
    bindRequests(document, render);
    el('leave').onclick = async () => {
      if (!confirm(__('Leave this log? You will lose access unless invited again.'))) return;
      try { await Sync.removeMember(Auth.id); membersLoadedFor = null; render(); } catch (e) { toast(err(e)); }
    };
    if (!Sync.isParent()) return;
    const read = bindAccess(el('invCard'), 'inv', a => { invForm = a; });
    el('mkInvite').onclick = async () => {
      const a = read();
      try { const { code, secret } = await Sync.createInvite(a.role, a.perms); invite = { code, role: a.role, secret, url: Sync.inviteUrl(code, secret) }; render(); } catch (e) { toast(err(e)); }
    };
    if (el('invShare')) el('invShare').onclick = () => Native.shareText(__('Little Log invite'), db.baby.name ? __("Join {name}'s log in the Little Log app. Invite code: {code} (valid for 2 hours)", { name: db.baby.name, code: invite.code }) : __("Join our baby's log in the Little Log app. Invite code: {code} (valid for 2 hours)", { code: invite.code })).catch(() => {});
    document.querySelectorAll('[data-showinv]').forEach(b => b.onclick = async () => { const i = Sync.st.invites.find(x => x.code === b.dataset.showinv); const secret = await E2EE.inviteSecret(i.code); invite = { code: i.code, role: i.role, secret, url: Sync.inviteUrl(i.code, secret) }; render(); });
    document.querySelectorAll('[data-rescind]').forEach(b => b.onclick = async () => {
      if (!confirm(__('Rescind this invite? The code stops working immediately.'))) return;
      try { await Sync.rescind(b.dataset.rescind); if (invite && invite.code === b.dataset.rescind) invite = null; render(); } catch (e) { toast(err(e)); }
    });
    const checked = (name, v) => { const c = document.querySelector(`input[name=${name}][value="${v}"]`); return !!(c && c.checked); };
    document.querySelectorAll('[data-approvephone]').forEach(b => b.onclick = async () => {
      const d = Sync.st.devices.find(x => x.grantee === b.dataset.approvephone); if (!d) return;
      if (!checked('vchkp', d.grantee)) return toast(__('Compare the security code with that phone, then tick "It matches"'));
      try { await Sync.approvePhone(d); toast(__('Phone approved')); render(); } catch (e) { toast(err(e)); }
    });
    if (el('newRec')) el('newRec').onclick = async () => {
      if (!confirm(__('Create a new recovery code? The old one stops working.'))) return;
      try { F.recoveryCode = await Sync.newRecoveryCode(); db.meta.recoveryAck = false; save(true); render(); } catch (e) { toast(err(e)); }
    };
    document.querySelectorAll('[data-person]').forEach(b => b.onclick = () => editPerson(b.dataset.person));
    el('actBtn').onclick = showActivity;
  }
  /** A person's card: their contact details (they fill these in themselves), with call buttons. */
  /** A person's contact details (relationship, phones with a Call button, work, notes), as they wrote them. */
  function detailsHtml(i, email) {
    const line = (label, v, call) => (v ? `<div class="stat"><span>${__h(label)}<br><b class="sel">${esc(v)}</b></span>${call && Guide.tel(v) ? `<a class="btn callbtn" href="${esc(Guide.tel(v))}">📞 ${__h('Call')}</a>` : ''}</div>` : '');
    return [line(N_('Relationship'), i.relation), line(N_('Phone'), i.phone, true), line(N_('Email'), email), line(N_('Place of work'), i.work), line(N_('Work phone'), i.workPhone, true), line(N_('Notes'), i.notes)].join('');
  }
  const retiredLine = r => [__('retired {date}', { date: new Date(r.retired_at).toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short', year: 'numeric' }) }), r.reason && REASONS[r.reason] ? __(REASONS[r.reason]) : ''].filter(Boolean).join(' · ');
  /** Retire a caregiver, babysitter, medical assistant or friend who no longer helps: they moved away, stopped, or died. */
  function retirePerson(userId) {
    const p = Sync.st.people.find(x => x.user_id === userId); if (!p || !Sync.isParent()) return;
    const name = p.display_name || __('Member');
    const close = showSheet(`<h3>${__h('Retire {name}', { name })}</h3>
      <p class="note">${__h('For a caregiver, babysitter, medical assistant or friend who no longer helps. Their access ends now, as if they were removed, and the log changes its keys. They stay on the Retired list with their details, and their entries still say who added them. To have them back, invite them again.')}</p>
      <label class="f">${__h('Why (optional)')}</label><div class="chips">${Object.entries(REASONS).map(([v, l]) => chip('rtWhy', v, __h(l), false, '', true)).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn d" id="rtGo">${__h('Retire')}</button></div>`);
    $('#sheet [data-close]').onclick = close;
    $('#rtGo').onclick = async () => {
      const why = (document.querySelector('#sheet [name=rtWhy]:checked') || {}).value || '';
      try { await Sync.retireMember(userId, why); close(); toast(__('{name} is retired', { name })); render(); } catch (e) { toast(err(e)); }
    };
  }
  /** A retired helper: who they were and their details, kept for the family. A parent can delete the note. */
  function viewRetired(id) {
    const r = Sync.st.retired.find(x => x.id === id); if (!r) return;
    const close = showSheet(`<h3>${esc(r.display_name)}</h3><p class="note" style="margin-top:0">${esc(roleName(r.role))} · ${esc(retiredLine(r))}</p>
      ${detailsHtml(r.info || {}) || `<p class="note">${__h('No details were added.')}</p>`}
      <div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Close')}</button></div>
      ${Sync.isParent() ? `<div class="row"><button class="btn d" id="rtForget">${__h('Remove from the list')}</button></div>` : ''}`);
    $('#sheet [data-close]').onclick = close;
    if ($('#rtForget')) $('#rtForget').onclick = async () => {
      if (!confirm(__('Remove {name} from the Retired list? Their details are deleted.', { name: r.display_name }))) return;
      try { await Sync.forgetRetired(id); close(); render(); } catch (e) { toast(err(e)); }
    };
  }
  function viewPerson(userId) {
    const p = Sync.st.people.find(x => x.user_id === userId); if (!p) return;
    const i = p.info || {}, parent = Sync.isParent();
    const info = detailsHtml(i, p.email);
    const f = (id, label, v, type = 'text', max = 60, ph = '') => `<label class="f">${__h(label)}</label><input id="${id}" type="${type}" maxlength="${max}" value="${esc(v || '')}" placeholder="${ph ? __h(ph) : ''}"${type === 'tel' ? ' inputmode="tel" autocomplete="tel"' : ''}>`;
    const form = `<p class="note">${__h('Everyone who can see the family list sees these. They are end-to-end encrypted like the rest of the log.')}</p>
      ${f('dRel', N_('Relationship to the baby'), i.relation, 'text', 40, N_('e.g. Mum, Grandma, Nanny'))}${f('dPhone', N_('Phone'), i.phone, 'tel', 30)}
      ${f('dWork', N_('Place of work'), i.work, 'text', 80)}${f('dWorkPhone', N_('Work phone'), i.workPhone, 'tel', 30)}
      <label class="f">${__h('Notes')}</label><textarea id="dNotes" rows="2" maxlength="300" placeholder="${__h('e.g. best times to call, allergies, car seat in my car')}">${esc(i.notes || '')}</textarea>`;
    const close = showSheet(`<h3>${esc(p.display_name || __('Member'))}${p.is_you ? ` <small class="note">${__h('(you)')}</small>` : ''}</h3>
      <p class="note" style="margin-top:0">${p.role ? esc(roleName(p.role)) : ''}</p>
      ${p.is_you ? form : (info || `<p class="note">${__h('No details yet. People add their own phone number and work details from their phone: Family → tap their name.')}</p>`)}
      <div class="row" style="margin-top:16px"><button class="btn" id="pvClose">${p.is_you ? __h('Cancel') : __h('Close')}</button>${p.is_you ? `<button class="btn p" id="pvSave">${__h('Save')}</button>` : ''}</div>
      ${parent && !p.is_you ? `<div class="row"><button class="btn" id="pvAccess">${__h('Change access')}</button>${HELPERS.includes(p.role) ? `<button class="btn" id="pvRetire">${__h('Retire')}</button>` : ''}</div>` : ''}`);
    $('#pvClose').onclick = close;
    if ($('#pvAccess')) $('#pvAccess').onclick = () => editPerson(userId);
    if ($('#pvRetire')) $('#pvRetire').onclick = () => { close(); retirePerson(userId); };
    if ($('#pvSave')) $('#pvSave').onclick = async () => {
      const d = { relation: $('#dRel').value, phone: $('#dPhone').value, work: $('#dWork').value, workPhone: $('#dWorkPhone').value, notes: $('#dNotes').value };
      try { await Sync.setMyDetails(d); close(); render(); toast(__('Saved')); } catch (e) { toast(err(e)); }
    };
  }
  function editPerson(userId) {
    const p = Sync.st.people.find(x => x.user_id === userId); if (!p) return;
    const close = showSheet(`<h3>${esc(p.display_name || __('Member'))}</h3><p class="note">${esc(p.email || '')}</p>
      <div id="pForm">${accessFormHtml('p', p.role || 'caregiver', p.perms)}</div>
      <div class="row" style="margin-top:16px"><button class="btn" id="pCancel">${__h('Cancel')}</button><button class="btn p" id="pSave">${__h('Save')}</button></div>
      <div class="row"><button class="btn" id="pMfa">${__h('Reset two-step verification')}</button></div>
      <div class="row"><button class="btn d" id="pRemove">${__h('Remove from this log')}</button></div>`);
    const read = bindAccess($('#pForm'), 'p');
    $('#pCancel').onclick = close;
    $('#pSave').onclick = async () => { const a = read(); try { await Sync.setMember(userId, a.role, a.perms); close(); toast(__('Saved')); render(); } catch (e) { toast(err(e)); } };
    $('#pMfa').onclick = async () => { if (!confirm(__('Reset two-step verification for {name}? They will set it up again next time they sign in.', { name: p.display_name }))) return; try { await Sync.resetMfa(userId); toast(__('Reset')); } catch (e) { toast(err(e)); } };
    $('#pRemove').onclick = async () => { if (!confirm(__('Remove {name} from this log? They lose access immediately.', { name: p.display_name }))) return; try { await Sync.removeMember(userId); close(); render(); } catch (e) { toast(err(e)); } };
  }
  // What each line of the activity log says. Names come from the server; the rest is in the app's language.
  const ACT = {
    log_created: l => __('{actor} created the log', l.v), profile_changed: l => __("{actor} changed the children's details", l.v),
    // The server can't see what an entry is (it is encrypted), only whether it is in the private health class.
    entry_added: l => (l.entry_type === 'private' ? __('{actor} added a private (health) entry', l.v) : __('{actor} added an entry', l.v)),
    entry_edited: l => (l.by ? (l.entry_type === 'private' ? __('{actor} edited a private entry added by {author}', l.v) : __('{actor} edited an entry added by {author}', l.v)) : (l.entry_type === 'private' ? __('{actor} edited a private entry', l.v) : __('{actor} edited an entry', l.v))),
    entry_deleted: l => (l.by ? (l.entry_type === 'private' ? __('{actor} deleted a private entry added by {author}', l.v) : __('{actor} deleted an entry added by {author}', l.v)) : (l.entry_type === 'private' ? __('{actor} deleted a private entry', l.v) : __('{actor} deleted an entry', l.v))),
    device_approved: l => __("{actor} approved {person}'s phone", l.v), keys_rotated: l => __('{actor} changed the encryption keys', l.v), recovery_code_changed: l => __('{actor} created a new recovery code', l.v),
    invite_created: l => __('{actor} created a {role} invite', l.v), invite_rescinded: l => __('{actor} rescinded a {role} invite', l.v),
    join_requested: l => __('{email} asked to join as {role}', l.v),
    member_approved: l => __('{actor} approved {email} as {role}', l.v), request_denied: l => __('{actor} denied {email}', l.v),
    role_changed: l => __('{actor} made {person} a {role}', l.v), permissions_changed: l => __('{actor} changed what {person} can do', l.v),
    member_removed: l => __('{actor} removed {person}', l.v), member_retired: l => __('{actor} retired {person}', l.v), tree_changed: l => __('{actor} changed the family tree', l.v), left: l => __('{person} left the log', { person: l.detail.person || l.actor }),
    mfa_reset: l => __('{actor} reset two-step verification for {person}', l.v),
  };
  const activityLine = l => {
    const d = l.detail || {}, by = d.author && d.author !== l.actor ? d.author : '';
    const x = { ...l, detail: d, by, v: { actor: l.actor, author: by, person: d.person, email: d.email, role: d.role ? roleName(d.role) : '' } };
    return ACT[l.action] ? ACT[l.action](x) : l.action;
  };
  async function showActivity() {
    const close = showSheet(`<h3>${__h('Activity log')}</h3><div id="actList"><div class="empty">${__h('Loading…')}</div></div><div class="row" style="margin-top:12px"><button class="btn" id="actMore" hidden>${__h('Older')}</button><button class="btn" id="actClose">${__h('Close')}</button></div>`);
    $('#actClose').onclick = close;
    let before = null, any = false;
    const load = async () => {
      try {
        const rows = await Sync.activity(before);
        const list = $('#actList'); if (!any) list.innerHTML = '';
        any = any || rows.length > 0;
        list.insertAdjacentHTML('beforeend', rows.map(l => `<div class="card" style="padding:8px 12px"><small class="note">${esc(new Date(l.at).toLocaleString(I18n.locale(), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</small><br>${esc(activityLine(l))}</div>`).join(''));
        if (!any) list.innerHTML = `<div class="empty">${__h('Nothing yet.')}</div>`;
        if (rows.length) before = rows[rows.length - 1].id;
        if ($('#actMore')) $('#actMore').hidden = rows.length < 50;
      } catch (e) { $('#actList').innerHTML = `<div class="empty">${esc(err(e))}</div>`; }
    };
    $('#actMore').onclick = load; load();
  }

  // ---- More tab: security, account, cloud backup ------------------------------------------------
  function accountHtml() {
    if (!Auth.configured || !Auth.signedIn) return '';
    const parent = db.meta.role === 'parent', me = Sync.st.people.find(p => p.is_you);
    return `<div class="card"><b>🔐 ${__h('Security & account')}</b>
      <div class="stat"><span>${__h('Signed in as')}<br><small>${esc(Auth.email)}</small></span></div>
      ${Sync.linked() ? `<label class="f" style="display:block;margin:8px 0 4px;color:var(--mute);font-size:13px">${__h('Your name (shown to the family)')}</label><input id="myName" type="text" maxlength="60" value="${esc(me ? me.display_name : '')}">` : ''}
      <div class="stat"><span>${__h('Two-step verification')}<br><small>${F.verified ? (parent ? __h('On (required for parents)') : __h('On')) : __h('Off')}</small></span>
        ${F.verified ? (parent ? '' : `<button class="btn" id="mfaOff" style="padding:6px 12px">${__h('Turn off')}</button>`) : `<button class="btn p" id="mfaOn" style="padding:6px 12px">${__h('Turn on')}</button>`}</div>
      <div class="stat"><span>${__h('App lock')}<br><small>${__h('When Little Log opens, and after time away')}</small></span><span class="chips">${[['off', __('Off')], ['bio', __('Face ID / fingerprint')], ['pin', __('PIN')]].map(([v, l]) => `<label class="chip"><input type="radio" name="lockMode" value="${v}" ${(Lock.mode || 'off') === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</span></div>
      ${Lock.mode === 'pin' ? `<div class="stat"><span>${__h('PIN')}<br><small>${__h('4 to 8 digits, known only to you')}</small></span><span class="btns"><button class="btn" id="pinChange" style="padding:6px 10px">${__h('Change PIN')}</button></span></div>
      ${Lock.bioAvailable ? `<div class="stat"><span>${__h('Also unlock with Face ID / fingerprint')}</span><span class="chips"><label class="chip"><input type="checkbox" id="bioToo" ${Lock.bioToo ? 'checked' : ''}><span>${Lock.bioToo ? __h('On') : __h('Off')}</span></label></span></div>` : ''}` : ''}
      ${Lock.enabled ? `<div class="stat"><span>${__h('Lock after')}<br><small>${__h('when you leave the app')}</small></span><select id="lockMin" style="padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)">${[[0, __('Immediately')], [1, __n('{n} minute', '{n} minutes', 1)], [5, __n('{n} minute', '{n} minutes', 5)], [15, __n('{n} minute', '{n} minutes', 15)]].map(([v, l]) => `<option value="${v}" ${Lock.minutes === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : ''}
      <div class="row"><button class="btn" id="signOut">${__h('Sign out')}</button><button class="btn" id="signOutAll">${__h('Sign out everywhere')}</button></div>
      <div class="row"><button class="btn d" id="delAcct">${__h('Delete account')}</button></div></div>`;
  }
  /** The line under "Security & account" on the More page. */
  function accountSub() { return `${F.verified ? __('Two-step verification on') : __('Two-step verification off')} · ${Lock.mode !== 'off' ? __('App lock on') : __('App lock off')}`; }
  function cloudHtml() {
    const av = Cloud.available(), row = p => {
      const last = Cloud.last(p);
      return `<div class="stat"><span>${esc(Cloud.label(p))}<br><small>${!av[p] ? __h('Not set up by the app owner') : Cloud.connected(p) ? (last ? __h('Last backup {when}', { when: ago(last) }) : __h('Connected')) : __h('Not connected')}</small></span>
      <span class="btns">${!av[p] ? '' : Cloud.connected(p)
        ? `<button class="btn" data-cb="${p}" style="padding:6px 10px">${__h('Back up')}</button><button class="btn" data-cr="${p}" style="padding:6px 10px">${__h('Restore')}</button><button class="btn d" data-cd="${p}" style="padding:6px 10px" aria-label="${__h('Disconnect {service}', { service: Cloud.label(p) })}">✕</button>`
        : `<button class="btn p" data-cc="${p}" style="padding:6px 12px">${__h('Connect')}</button>`}</span></div>`;
    };
    return `<div class="card"><b>☁️ ${__h('Cloud backup')}</b>
      <p class="note">${__h("Keep a private, encrypted copy in your own cloud storage. It is scrambled on this phone with your passphrase, so the provider can't read it. The passphrase is kept in the phone's secure storage. **If you lose it, the backup can't be recovered**, so write it down.")}</p>
      <label class="f" style="display:block;margin:8px 0 4px;color:var(--mute);font-size:13px">${__h('Backup passphrase ({n}+ characters)', { n: Cloud.MIN_PASS })}</label>
      <input id="cPass" type="password" autocomplete="new-password" value="${esc(Cloud.pass)}" placeholder="${Cloud.pass ? '' : __h('Choose a long passphrase')}">
      <div class="row"><button class="btn" id="cSavePass">${__h('Save passphrase')}</button><button class="btn" id="cGenPass">${__h('Generate one')}</button></div>
      <div class="chips" style="margin:10px 0">${chip('cAuto', 1, __h('Back up daily'), Cloud.auto)}</div>
      ${['google', 'dropbox', 'onedrive'].map(row).join('')}
      <div class="stat"><span>${__h('iCloud Drive / Files')}<br><small>${__h('Save the encrypted file with the share sheet')}</small></span><span class="btns"><button class="btn" id="cFileSave" style="padding:6px 10px">${__h('Save')}</button><button class="btn" id="cFileLoad" style="padding:6px 10px">${__h('Restore')}</button></span></div>
      <input type="file" id="cFile" accept="application/json,.json" hidden></div>`;
  }
  function applyBackup(d) {
    if (!d || !Array.isArray(d.events)) throw new Error(N_('That file has no entries in it'));
    if (d.events.length > 200000) throw new Error(N_('That backup is too large'));
    if (!Sync.can('add')) throw new Error(N_('You do not have permission to add entries'));
    const rows = d.events.filter(e => e && typeof e.id === 'string' && (TYPES[e.type] || Travel.isTravel(e.type)) && Number.isFinite(+e.ts))
      .filter(e => Sync.can('health') || !isPrivate(e.type))
      .map(e => ({ ...e, ts: +e.ts, end: e.end == null ? null : +e.end, updated: +e.updated || 0, deleted: false, by: Auth.id || e.by }));
    const n = Sync.merge(rows, true);
    if (d.baby && !db.baby.name && !db.baby.kids.some(k => k.name)) { const kids = Kids.clean(d.baby.kids, String(d.baby.name || ''), String(d.baby.birth || '')); db.baby = { name: kids[0].name, birth: kids[0].birth, kids }; }
    save(); render(); toast(n ? __n('Restored {n} entry', 'Restored {n} entries', n) : __('Nothing new to restore'));
  }
  function bindMoreAccount() {
    const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
    on('#signOut', () => signOut(false)); on('#signOutAll', () => signOut(true)); on('#delAcct', deleteAccount);
    on('#mfaOn', () => { F.enrollRequested = true; M.enroll = null; render(); });
    on('#mfaOff', async () => {
      if (!confirm(__('Turn off two-step verification?'))) return;
      try { for (const f of await Auth.factors()) await Auth.mfaRemove(f.id); F.verified = false; render(); toast(__('Turned off')); } catch (e) { toast(err(e)); }
    });
    if ($('#myName')) $('#myName').onchange = async e => { try { await Sync.setDisplayName(e.target.value); toast(__('Saved')); } catch (x) { toast(err(x)); } };
    document.querySelectorAll('[name=lockMode]').forEach(r => r.onchange = () => setLockMode(r.value));
    if ($('#pinChange')) $('#pinChange').onclick = () => askPin(() => choosePin(__('Choose a new PIN')));
    if ($('#bioToo')) $('#bioToo').onchange = e => { Lock.setBioToo(e.target.checked); render(); };
    if ($('#lockMin')) $('#lockMin').onchange = e => { Lock.setMinutes(+e.target.value); toast(__('Saved')); };
    if (!$('#cPass')) return;
    on('#cSavePass', () => { const m = Cloud.setPass($('#cPass').value); toast(m ? __(m) : __('Passphrase saved in secure storage')); });
    on('#cGenPass', () => {
      const p = Cloud.generatePass();
      showSheet(`<h3>${__h('Your backup passphrase')}</h3><p class="note">${__h("Write this down and keep it somewhere safe. Without it a backup can't be opened. It will be saved in this phone's secure storage.")}</p>
        <div class="code" style="font:700 17px ui-monospace,Menlo,monospace;text-align:center;word-break:break-all;margin:12px 0">${esc(p)}</div>
        <div class="row"><button class="btn" id="gpCancel">${__h('Cancel')}</button><button class="btn p" id="gpUse">${__h("I've written it down")}</button></div>`);
      $('#gpCancel').onclick = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; };
      $('#gpUse').onclick = () => { Cloud.setPass(p); $('#sheet').hidden = $('#sheetBack').hidden = true; render(); toast(__('Passphrase saved')); };
    });
    document.querySelector('[name=cAuto]').onchange = e => { Cloud.auto = e.target.checked; if (e.target.checked && !Cloud.pass) toast(__('Set a passphrase to enable daily backups')); };
    const run = async (label, fn) => { toast(label); try { const m = await fn(); render(); toast(m || __('Done')); } catch (e) { toast(err(e)); } };
    document.querySelectorAll('[data-cc]').forEach(b => b.onclick = () => run(__('Connecting…'), async () => { await Cloud.connect(b.dataset.cc); return __('Finish signing in in the browser window'); }));
    document.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => { Cloud.disconnect(b.dataset.cd); render(); });
    document.querySelectorAll('[data-cb]').forEach(b => b.onclick = () => run(__('Backing up…'), async () => { await Cloud.backup(b.dataset.cb); return __('Backed up to {service}', { service: Cloud.label(b.dataset.cb) }); }));
    document.querySelectorAll('[data-cr]').forEach(b => b.onclick = () => run(__('Restoring…'), async () => { applyBackup(await Cloud.restore(b.dataset.cr)); }));
    on('#cFileSave', async () => { try { const f = await Cloud.toFile(); await Native.saveFile(f.name, await f.text()); db.meta.fileBackupAt = Date.now(); save(true); render(); } catch (e) { if (!/cancel|abort/i.test(e && e.message)) toast(err(e)); } });
    on('#cFileLoad', () => { if (!Cloud.pass || Cloud.pass.length < Cloud.MIN_PASS) return toast(__('Set a backup passphrase ({n}+ characters) first', { n: Cloud.MIN_PASS })); $('#cFile').click(); });
    $('#cFile').onchange = async e => { try { applyBackup(await Cloud.fromFile(e.target.files[0])); } catch (x) { toast(err(x)); } e.target.value = ''; };
  }
  /** Called by app.js after each render/sync to keep the Family tab badge current. */
  function updateBadge() { const b = $('#famBadge'); if (!b) return; const n = Sync.isParent() ? Sync.st.requests.length : 0; b.hidden = !n || tab === 'family'; b.textContent = n; }

  return { init, gate, heroHtml, familyHtml, bindFamily, famLabel, familySwitcher, accountHtml, accountSub, cloudHtml, bindMoreAccount, applyBackup, goCloudCard, syncLine, refreshAuth, processPending, receiveJoin, updateBadge, promptRequests, parseJoin, sessionLost };
})();
