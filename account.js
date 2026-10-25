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
  /** Wires the role buttons to the check boxes: picking a role loads its defaults and locks what that role may never have. */
  function bindAccess(root, prefix) {
    const roles = [...root.querySelectorAll(`[name=${prefix}role]`)], perms = [...root.querySelectorAll(`[name=${prefix}perm]`)];
    const apply = reset => {
      const role = roles.find(r => r.checked).value, pre = PRESET(role), lock = LOCKED(role);
      perms.forEach(el => { if (reset || lock.includes(el.value)) el.checked = !!pre[el.value]; el.disabled = lock.includes(el.value); });
    };
    roles.forEach(r => r.onchange = () => apply(true)); apply(false);
    return () => ({ role: roles.find(r => r.checked).value, perms: Object.fromEntries(perms.map(el => [el.value, el.checked])) });
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
    const close = () => { S.hidden = back.hidden = true; }; back.onclick = close; return close;
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
    else if (!Auth.signedIn) return { html: loginHtml(), bind: bindLogin };
    if (Lock.locked) return { html: lockHtml(), bind: bindLock };
    if (Auth.configured) {
      if (!F.loaded || F.loading) return { html: `<div class="card"><div class="empty">${__h('Loading…')}</div></div>`, bind() {} };
      if (F.needsMfa()) return { html: mfaVerifyHtml(), bind: bindMfaVerify };
      if (enrollNeeded()) return { html: enrollHtml(), bind: bindEnroll };
      if (!db.meta.babyId) return Sync.pendingRequest() ? { html: waitingHtml(), bind: bindWaiting } : { html: onboardHtml(), bind: bindOnboard };
      if (F.recoveryCode) return { html: recoveryHtml(), bind: bindRecovery };
      if (Sync.st.needsAccess) return { html: accessHtml(), bind: bindAccessScreen };
    }
    return null;
  }
  const appOnlyHtml = () => `<div class="card"><b>${__h('Little Log is a phone app')}</b><p class="note">${__h('This screen only runs inside the Little Log app for iPhone and Android. Please install it from the App Store or Google Play.')}</p></div>`;
  const setupHtml = () => `<div class="card"><b>${__h("Sign-in isn't set up yet")}</b>
    <p class="note">${__h('This copy of Little Log has no account service configured, so family sync and sign-in are unavailable. See {file} to turn them on.', { file: 'SETUP.md' })}</p>
    <button class="btn p" id="localOnly" style="width:100%">${__h('Use on this device only')}</button></div>`;
  const bindSetup = () => { $('#localOnly').onclick = () => { db.meta.localOnly = true; save(true); render(); }; };

  // ---- app lock -------------------------------------------------------------------------------
  const lockHtml = () => `<div class="card" style="text-align:center"><div style="font-size:48px">🔒</div><b>${__h('Little Log is locked')}</b>
    <p class="note">${__h('Use Face ID, your fingerprint or your phone passcode to continue.')}</p>
    <button class="btn p" id="unlock" style="width:100%">${__h('Unlock')}</button>
    <button class="btn" id="lockOut" style="width:100%;margin-top:8px">${__h('Sign out')}</button></div>`;
  function bindLock() {
    const go = async () => { if (await Lock.unlock()) render(); };
    $('#unlock').onclick = go; $('#lockOut').onclick = () => signOut(false);
    if (!bindLock.auto) { bindLock.auto = true; setTimeout(() => { bindLock.auto = false; if (Lock.locked) go(); }, 150); }
  }

  // ---- sign-in (email code + optional CAPTCHA) -------------------------------------------------
  const loginHtml = () => `<div class="card"><b>${L.step === 'email' ? __h('Sign in') : __h('Check your email')}</b>
    ${L.step === 'email'
      ? `<p class="note">${__h("Enter your email and we'll send you a one-time code. No password needed. First time? This creates your account.")}</p>
         <label class="f">${__h('Email')}</label><input id="lEmail" type="email" inputmode="email" autocomplete="email" value="${esc(L.email)}" placeholder="${__h('you@example.com')}">
         ${CFG.captchaSiteKey ? '<div id="captcha" style="margin-top:12px"></div>' : ''}
         <button class="btn p" id="lSend" style="width:100%;margin-top:12px" ${L.busy ? 'disabled' : ''}>${L.busy ? __h('Sending…') : __h('Email me a code')}</button>`
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
    if (L.step === 'email') { $('#lSend').onclick = send; $('#lEmail').onkeydown = e => e.key === 'Enter' && send(); renderCaptcha(); }
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
      $('#lVerify').onclick = verify; $('#lCode').onkeydown = e => e.key === 'Enter' && verify();
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
    $('#mGo').onclick = go; $('#mCode').onkeydown = e => e.key === 'Enter' && go(); $('#mOut').onclick = () => signOut(false);
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
    return `<div class="card"><b>${__h('Welcome, {email}', { email: Auth.email })}</b><p class="note">${__h('Create a log for your baby, or join one a family member shared with you.')}</p>
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
    db = { baby: { name: '', birth: '', kids: Kids.clean([]) }, events: [], deleted: [], meta: {} };
    save(true); tab = 'day'; invite = null; F.loaded = false; F.verified = false; F.enrollRequested = F.enrollForCreate = false; M.enroll = null;
    Sync.st.people = []; Sync.st.requests = []; Sync.st.invites = []; Sync.st.memberships = []; Sync.st.myRequests = []; Lock.reset();
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
    await Promise.all([Sync.loadFamilyPeople(), Sync.loadFamilyRequests(), Sync.loadRetired()]);
    const now = Sync.st.memberships.filter(m => !had.split(',').includes(m.id));
    if (had && now.length) toast(__("You're in: {family}", { family: famName(now[0]) }));
    if (tab === 'family') render();
  }
  function treeHtml() {
    const s = Sync.st, mine = s.myRequests.filter(r => r.status === 'pending'), me = s.people.find(p => p.is_you);
    const branch = m => {
      const on = m.id === db.meta.babyId, name = famName(m), reqs = on ? [] : s.familyRequests[m.id] || [], waiting = on && Sync.isParent() ? s.requests.length : 0, kept = F.keptUnsent[m.id] || 0;
      const kin = on ? s.people.filter(p => RELATIVES.includes(p.role) && !p.is_you).map(p => p.display_name) : (s.familyPeople[m.id] || []).map(p => p.name);
      return `<li class="fam${on ? ' on' : ''}" data-fam="${esc(m.id)}">
        <div class="fhead"><span><b>${esc(name)}</b><br><small>${esc(roleName(m.role))}</small></span>${on ? `<small class="fshow">${__h('Showing')}</small>` : `<button class="btn" data-famopen="${esc(m.id)}">${__h('Open')}</button>`}</div>
        <div class="fkids">${famKids(m).map((k, i) => `<span class="fkid">${avatar(k)}${esc(famKidNames(m)[i])}</span>`).join('')}</div>
        ${RELATIVES.includes(m.role) && kin.length ? `<p class="note fkin">${__h('Family: {names}', { names: andList(kin) })}</p>` : ''}
        ${kept ? `<p class="note">⏳ ${__hn('{n} change not sent yet: it goes when you open this family.', '{n} changes not sent yet: they go when you open this family.', kept)}</p>` : ''}
        ${waiting ? `<p class="note fwait">📨 ${__hn('{n} waiting for your approval (below)', '{n} waiting for your approval (below)', waiting)}</p>` : ''}
        ${reqs.map(r => reqCard(r, name)).join('')}</li>`;
    };
    return `<h2>🌳 ${__h('Family tree')}</h2><div class="card ftree">
      <div class="froot"><span class="av lg">${esc(((me && me.display_name) || Auth.email || '?').trim().charAt(0).toUpperCase())}</span><span><b>${__h('You')}</b>${me && me.display_name ? `<br><small>${esc(me.display_name)}</small>` : ''}</span></div>
      <ul class="fbranches">${s.memberships.filter(m => RELATIVES.includes(m.role)).map(branch).join('')}
        ${mine.map(r => `<li class="fam pending"><div class="fhead"><span>⏳ ${__h('Request sent')}<br><small>${__h('Waiting for a parent to approve')}</small></span><button class="btn d" data-cancelreq="${esc(r.id)}">${__h('Cancel')}</button></div></li>`).join('')}</ul>
      <button class="btn" id="famAdd" style="width:100%;margin-top:10px">+ ${__h('Add a family')}</button></div>
      ${s.memberships.some(m => HELPERS.includes(m.role)) ? `<h2>${__h('Families you help with')}</h2><div class="card fhelp"><ul class="fbranches flat">${s.memberships.filter(m => HELPERS.includes(m.role)).map(branch).join('')}</ul></div>` : ''}`;
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
  /** Show another family log (from the tree or the switcher at the top). */
  async function openFamily(id, btn) {
    const m = Sync.st.memberships.find(x => x.id === id); if (!m || Sync.switching) return;
    if (btn) { btn.disabled = true; btn.textContent = __('Switching…'); }
    try {
      if (await Sync.choose(id)) { membersLoadedFor = null; F.treeAt = 0; viewDay = startOfDay(Date.now()); toast(__('Now showing {family}', { family: famName(m) })); }
    } catch (e) { toast(__('Could not switch: {reason}', { reason: err(e) })); }
    render();
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
  function familyHtml() {
    if (!Auth.configured || !db.meta.babyId) return `<div class="card"><b>${__h('Family sharing is off')}</b><p class="note">${Auth.configured ? __h('Create a baby log to share it.') : __h("Account service isn't configured (see {file}), so this device keeps its own private log.", { file: 'SETUP.md' })}</p></div>`;
    const s = Sync.st, parent = Sync.isParent();
    if (Date.now() - (F.treeAt || 0) > 30000) refreshTree();
    if (membersLoadedFor !== db.meta.babyId) { membersLoadedFor = db.meta.babyId; Promise.all([Sync.loadPeople(), Sync.loadRetired(), parent ? Sync.loadAdmin() : null, Sync.loadDevices(), Sync.myDevices().then(r => { F.myPhones = r; }), Sync.securityCode().then(c => { F.secCode = c; })]).then(() => { if (tab === 'family') render(); }).catch(() => {}); }
    const person = m => `<div class="stat"><button class="pbtn" data-pview="${esc(m.user_id)}"><span>${esc(m.display_name || __('Member'))}${m.is_you ? ` <small>${__h('(you)')}</small>` : ''}<br><small>${m.role ? esc(roleName(m.role)) : ''}${m.info && m.info.relation ? ' · ' + esc(m.info.relation) : ''}${m.email && m.role ? ' · ' + esc(m.email) : ''}</small></span><span class="chev" aria-hidden="true">›</span></button>
      ${parent && !m.is_you ? `<span class="btns"><button class="btn" data-person="${esc(m.user_id)}" style="padding:6px 12px">${__h('Edit')}</button>${HELPERS.includes(m.role) ? `<button class="btn" data-retire="${esc(m.user_id)}" style="padding:6px 12px">${__h('Retire')}</button>` : ''}</span>` : ''}</div>`;
    // with roles shown (people allowed to see the family list): relatives, then the people who help, each list on its own
    const roles = s.people.some(m => m.role), kin = s.people.filter(m => !roles || RELATIVES.includes(m.role)), help = roles ? s.people.filter(m => HELPERS.includes(m.role)) : [];
    const retired = s.retired.length ? `<details class="more retired"><summary>${__hn('Retired ({n})', 'Retired ({n})', s.retired.length)}<span class="chev" aria-hidden="true">›</span></summary>
      ${s.retired.map(r => `<div class="stat"><button class="pbtn" data-rview="${esc(r.id)}"><span>${esc(r.display_name)}<br><small>${esc(roleName(r.role))} · ${esc(retiredLine(r))}</small></span><span class="chev" aria-hidden="true">›</span></button></div>`).join('')}</details>` : '';
    const people = !s.people.length ? `<h2>${__h('People with access')}</h2><div class="card"><div class="note">${__h('Loading…')}</div></div>`
      : roles ? `<h2>${__h('Family')}</h2><div class="card">${kin.map(person).join('')}</div>
        <h2>${__h('Caregivers and helpers')}</h2><div class="card" id="helpers">${help.map(person).join('') || `<p class="note" style="margin:0">${__h('No caregivers, babysitters or medical assistants yet. A parent invites them below.')}</p>`}${retired}</div>`
      : `<h2>${__h('People with access')}</h2><div class="card">${s.people.map(person).join('')}</div>`;
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
    return `${treeHtml()}
    <div class="card"><b>${db.baby.name ? __h("{name}'s shared log", { name: db.baby.name }) : __h("Baby's shared log")}</b>
      <div class="stat"><span>${esc(syncLine())}${s.err && s.state === 'error' ? `<br><small>${esc(__(s.err))}</small>` : ''}</span><button class="btn" id="syncNow" style="padding:6px 12px">${__h('Sync now')}</button></div>
      ${s.denied ? `<div class="note" style="margin-top:6px">⚠️ ${__hn('{n} change was not allowed with your access and was undone.', '{n} changes were not allowed with your access and were undone.', s.denied)}</div>` : ''}
      <div class="note" style="margin-top:6px">${__h('Signed in as {email} · {role}', { email: Auth.email, role: roleName(db.meta.role) })}</div></div>
    ${reqs}${phonesCard}
    ${people}
    ${parent ? `<h2>${__h('Invite someone')}</h2><div class="card" id="invCard">
      <p class="note" style="margin-top:0">${__h('Invites work once and last 2 hours. After they scan it, you approve them.')}</p>
      ${accessFormHtml('inv', 'caregiver')}
      <button class="btn p" id="mkInvite" style="width:100%;margin-top:12px">${__h('Create invite QR code')}</button>
      ${invite ? inviteHtml() : ''}
      ${s.invites.length ? `<h2 style="margin-top:16px">${__h('Open invites')}</h2>${s.invites.map(i => `<div class="stat"><span>${esc(roleName(i.role))}<br><small>${esc(left(i.expires_at))}</small></span>
        <span class="btns"><button class="btn" data-showinv="${esc(i.code)}" style="padding:6px 10px">${__h('Show')}</button><button class="btn d" data-rescind="${esc(i.code)}" style="padding:6px 10px">${__h('Rescind')}</button></span></div>`).join('')}` : ''}</div>
    <h2>${__h('Activity')}</h2><div class="card"><div class="stat"><span>${__h('Who added, changed or deleted what, and who joined or left.')}<br><small>${__h('Only parents can see this.')}</small></span><button class="btn" id="actBtn" style="padding:6px 12px">${__h('View')}</button></div></div>` : ''}
    ${encCard}
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
    document.querySelectorAll('[data-cancelreq]').forEach(b => b.onclick = async () => { try { await Sync.cancelRequest(b.dataset.cancelreq); render(); } catch (e) { toast(err(e)); } });
    document.querySelectorAll('[data-famopen]').forEach(b => b.onclick = () => openFamily(b.dataset.famopen, b));
    clearInterval(F.treeTimer);   // while one of your requests waits, look every 15 s for the approval
    if (Sync.st.myRequests.some(r => r.status === 'pending')) F.treeTimer = setInterval(() => { if (tab !== 'family') return clearInterval(F.treeTimer); refreshTree(); }, 15000);
    // requests to join any family you are a parent in (the tree shows those of the families not shown)
    const anyReq = id => Sync.st.requests.find(x => x.id === id) || Object.values(Sync.st.familyRequests).flat().find(x => x.id === id);
    const checked = (name, v) => { const c = document.querySelector(`input[name=${name}][value="${v}"]`); return !!(c && c.checked); };
    document.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
      const r = anyReq(b.dataset.approve); if (!r) return;
      if (!r.qrVerified && !checked('vchk', r.id)) return toast(__('Compare the security code with their phone, then tick "It matches"'));
      try { await Sync.decide(r, true, { manualOk: checked('vchk', r.id) }); toast(__('Approved')); render(); } catch (e) { toast(err(e)); render(); }
    });
    document.querySelectorAll('[data-deny]').forEach(b => b.onclick = async () => { const r = anyReq(b.dataset.deny); if (!r || !confirm(__('Deny this request?'))) return; try { await Sync.decide(r, false); render(); } catch (e) { toast(err(e)); render(); } });
    el('leave').onclick = async () => {
      if (!confirm(__('Leave this log? You will lose access unless invited again.'))) return;
      try { await Sync.removeMember(Auth.id); membersLoadedFor = null; render(); } catch (e) { toast(err(e)); }
    };
    if (!Sync.isParent()) return;
    const read = bindAccess(el('invCard'), 'inv');
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
    member_removed: l => __('{actor} removed {person}', l.v), member_retired: l => __('{actor} retired {person}', l.v), left: l => __('{person} left the log', { person: l.detail.person || l.actor }),
    mfa_reset: l => __('{actor} reset two-step verification for {person}', l.v),
  };
  const activityLine = l => {
    const d = l.detail || {}, by = d.author && d.author !== l.actor ? d.author : '';
    const x = { ...l, detail: d, by, v: { actor: l.actor, author: by, person: d.person, email: d.email, role: d.role ? roleName(d.role) : '' } };
    return ACT[l.action] ? ACT[l.action](x) : l.action;
  };
  async function showActivity() {
    const close = showSheet(`<h3>${__h('Activity')}</h3><div id="actList"><div class="empty">${__h('Loading…')}</div></div><div class="row" style="margin-top:12px"><button class="btn" id="actMore" hidden>${__h('Older')}</button><button class="btn" id="actClose">${__h('Close')}</button></div>`);
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
      <div class="stat"><span>${__h('App lock')}<br><small>${__h('Face ID / fingerprint / passcode')}</small></span><span class="chips"><label class="chip"><input type="checkbox" id="lockOn" ${Lock.enabled ? 'checked' : ''}><span>${Lock.enabled ? __h('On') : __h('Off')}</span></label></span></div>
      ${Lock.enabled ? `<div class="stat"><span>${__h('Lock after')}<br><small>${__h('when you leave the app')}</small></span><select id="lockMin" style="padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)">${[[0, __('Immediately')], [1, __n('{n} minute', '{n} minutes', 1)], [5, __n('{n} minute', '{n} minutes', 5)], [15, __n('{n} minute', '{n} minutes', 15)]].map(([v, l]) => `<option value="${v}" ${Lock.minutes === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : ''}
      <div class="row"><button class="btn" id="signOut">${__h('Sign out')}</button><button class="btn" id="signOutAll">${__h('Sign out everywhere')}</button></div>
      <div class="row"><button class="btn d" id="delAcct">${__h('Delete account')}</button></div></div>`;
  }
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
      .filter(e => Sync.can('health') || (e.type !== 'health' && e.type !== 'med'))
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
    if ($('#lockOn')) $('#lockOn').onchange = async e => { const m = await Lock.set(e.target.checked); if (m) toast(__(m)); render(); };
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
    on('#cFileSave', async () => { try { const f = await Cloud.toFile(); await Native.saveFile(f.name, await f.text()); } catch (e) { if (!/cancel|abort/i.test(e && e.message)) toast(err(e)); } });
    on('#cFileLoad', () => { if (!Cloud.pass || Cloud.pass.length < Cloud.MIN_PASS) return toast(__('Set a backup passphrase ({n}+ characters) first', { n: Cloud.MIN_PASS })); $('#cFile').click(); });
    $('#cFile').onchange = async e => { try { applyBackup(await Cloud.fromFile(e.target.files[0])); } catch (x) { toast(err(x)); } e.target.value = ''; };
  }
  /** Called by app.js after each render/sync to keep the Family tab badge current. */
  function updateBadge() { const b = $('#famBadge'); if (!b) return; const n = Sync.isParent() ? Sync.st.requests.length : 0; b.hidden = !n || tab === 'family'; b.textContent = n; }

  return { init, gate, familyHtml, bindFamily, famLabel, familySwitcher, accountHtml, cloudHtml, bindMoreAccount, applyBackup, syncLine, refreshAuth, processPending, receiveJoin, updateBadge, parseJoin, sessionLost };
})();
