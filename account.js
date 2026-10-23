'use strict';
/* Account, security, family-sharing and cloud-backup UI. Uses helpers/state from app.js lazily (call time only). */
const Acct = (() => {
  const CFG = window.LL_CONFIG || {};
  const L = { step: 'email', email: '', busy: false, err: '', captcha: '', fails: 0 };          // sign-in form
  const F = { loaded: false, loading: false, verified: false, enrollRequested: false, enrollForCreate: false };   // auth state after sign-in
  const M = { enroll: null, busy: false, err: '' };                                              // two-step verification
  const O = { busy: false, err: '', name: '', birth: '', mine: '', create: null };               // onboarding
  let invite = null, pendingJoin = null, waitTimer = null;

  // ---- roles & permissions (mirrors supabase/schema.sql; the server enforces them) -------------
  const PERM_KEYS = [
    ['add_entries', 'Add entries'], ['edit_own', 'Edit their own entries'], ['delete_own', 'Delete their own entries'],
    ['edit_others', 'Edit entries other people added'], ['delete_others', 'Delete entries other people added'],
    ['view_health', 'See health notes and medications'], ['view_people', 'See who else has access'], ['edit_profile', "Change the baby's name and birthday"]];
  const ROLES = [
    ['parent', 'Parent', 'Full control, including who has access and all settings'],
    ['family', 'Family member', 'Can add entries and change their own; cannot change settings or other people\'s entries'],
    ['caregiver', 'Caregiver', 'You choose exactly what they can do'],
    ['babysitter', 'Babysitter', 'You choose exactly what they can do'],
    ['friend', 'Friend', 'You choose exactly what they can do']];
  const roleName = r => (ROLES.find(x => x[0] === r) || [0, r || 'Member'])[1];
  const PRESET = role => ({ add_entries: true, edit_own: true, delete_own: true, edit_others: role === 'parent', delete_others: role === 'parent',
    view_health: true, view_people: role === 'parent' || role === 'family', edit_profile: role === 'parent' });
  const LOCKED = role => role === 'parent' ? PERM_KEYS.map(k => k[0]) : role === 'family' ? ['edit_others', 'delete_others', 'edit_profile'] : [];

  function accessFormHtml(prefix, role, perms) {
    const p = { ...PRESET(role), ...(perms || {}) };
    return `<div data-access="${prefix}"><label class="f">Role</label>
      <div class="roles">${ROLES.map(([k, n, d]) => `<label class="role"><input type="radio" name="${prefix}role" value="${k}" ${k === role ? 'checked' : ''}><span><b>${n}</b><small>${esc(d)}</small></span></label>`).join('')}</div>
      <label class="f">What they can do</label><div class="chips">${PERM_KEYS.map(([k, l]) => chip(prefix + 'perm', k, esc(l), !!p[k])).join('')}</div></div>`;
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
  const parseJoin = text => {
    text = String(text || '').trim();
    try { const q = new URL(text).searchParams, c = q.get('join') || q.get('code'); if (c) text = c; } catch (e) {}
    return /^[A-Za-z0-9]{10}$/.test(text) ? text.toUpperCase() : null;
  };
  const ago = t => { const m = (Date.now() - t) / MIN; return m < 1 ? 'just now' : fmtDur(m) + ' ago'; };
  const err = e => (e && e.message) || String(e);
  const left = iso => { const m = (new Date(iso) - Date.now()) / MIN; return m <= 0 ? 'expired' : 'expires in ' + fmtDur(m); };
  const alertP = t => t ? `<p class="note" style="color:var(--health)" role="alert">${esc(t)}</p>` : '';
  function showSheet(html) {
    const S = $('#sheet'), back = $('#sheetBack'); S.innerHTML = html; S.hidden = back.hidden = false;
    const close = () => { S.hidden = back.hidden = true; }; back.onclick = close; return close;
  }
  function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }

  // An invite link opened while the app runs (OS hands it over) is remembered until the user is ready.
  try { pendingJoin = parseJoin(localStorage.getItem('ll.join')); } catch (e) {}
  const clearPending = () => { pendingJoin = null; try { localStorage.removeItem('ll.join'); } catch (e) {} };
  function receiveJoin(text) {
    const code = parseJoin(text); if (!code) return false;
    try { localStorage.setItem('ll.join', code); } catch (e) {}
    pendingJoin = code;
    if (Auth.signedIn && F.loaded) processPending().then(render); else render();
    return true;
  }
  async function processPending() {
    const code = pendingJoin; clearPending();
    if (code) await joinWith(code);
  }

  // ---- after sign-in: two-step status, memberships ---------------------------------------------
  async function refreshAuth() {
    F.loading = true; render();
    try {
      F.verified = (await Auth.factors()).some(f => f.status === 'verified');
      await Sync.loadMemberships(); await Sync.loadMyRequests().catch(() => {});
      const ms = Sync.st.memberships;
      if (ms.length) Sync.choose((ms.find(m => m.id === db.meta.babyId) || ms[0]).id);
      else if (db.meta.babyId && Sync.st.state !== 'offline') { Sync.run(); }
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
      if (!F.loaded || F.loading) return { html: '<div class="card"><div class="empty">Loading…</div></div>', bind() {} };
      if (F.needsMfa()) return { html: mfaVerifyHtml(), bind: bindMfaVerify };
      if (enrollNeeded()) return { html: enrollHtml(), bind: bindEnroll };
      if (!db.meta.babyId) return Sync.pendingRequest() ? { html: waitingHtml(), bind: bindWaiting } : { html: onboardHtml(), bind: bindOnboard };
    }
    return null;
  }
  const appOnlyHtml = () => `<div class="card"><b>Little Log is a phone app</b><p class="note">This screen only runs inside the Little Log app for iPhone and Android. Please install it from the App Store or Google Play.</p></div>`;
  const setupHtml = () => `<div class="card"><b>Sign-in isn't set up yet</b>
    <p class="note">This copy of Little Log has no account service configured, so family sync and sign-in are unavailable. See <code>SETUP.md</code> to turn them on.</p>
    <button class="btn p" id="localOnly" style="width:100%">Use on this device only</button></div>`;
  const bindSetup = () => { $('#localOnly').onclick = () => { db.meta.localOnly = true; save(true); render(); }; };

  // ---- app lock -------------------------------------------------------------------------------
  const lockHtml = () => `<div class="card" style="text-align:center"><div style="font-size:48px">🔒</div><b>Little Log is locked</b>
    <p class="note">Use Face ID, your fingerprint or your phone passcode to continue.</p>
    <button class="btn p" id="unlock" style="width:100%">Unlock</button>
    <button class="btn" id="lockOut" style="width:100%;margin-top:8px">Sign out</button></div>`;
  function bindLock() {
    const go = async () => { if (await Lock.unlock()) render(); };
    $('#unlock').onclick = go; $('#lockOut').onclick = () => signOut(false);
    if (!bindLock.auto) { bindLock.auto = true; setTimeout(() => { bindLock.auto = false; if (Lock.locked) go(); }, 150); }
  }

  // ---- sign-in (email code + optional CAPTCHA) -------------------------------------------------
  const loginHtml = () => `<div class="card"><b>${L.step === 'email' ? 'Sign in' : 'Check your email'}</b>
    ${L.step === 'email'
      ? `<p class="note">Enter your email and we'll send you a one-time code. No password needed. First time? This creates your account.</p>
         <label class="f">Email</label><input id="lEmail" type="email" inputmode="email" autocomplete="email" value="${esc(L.email)}" placeholder="you@example.com">
         ${CFG.captchaSiteKey ? '<div id="captcha" style="margin-top:12px"></div>' : ''}
         <button class="btn p" id="lSend" style="width:100%;margin-top:12px" ${L.busy ? 'disabled' : ''}>${L.busy ? 'Sending…' : 'Email me a code'}</button>`
      : `<p class="note">We sent a code to <b>${esc(L.email)}</b>. It works for 10 minutes.</p>
         <label class="f">Code</label><input id="lCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="12345678">
         <button class="btn p" id="lVerify" style="width:100%;margin-top:12px" ${L.busy ? 'disabled' : ''}>${L.busy ? 'Checking…' : 'Sign in'}</button>
         <div class="row"><button class="btn" id="lBack">Different email</button></div>`}
    ${alertP(L.err)}</div>
    ${pendingJoin ? '<div class="card">📨 You have a family invite waiting. Sign in to use it.</div>' : ''}`;
  let captchaId = null;
  async function renderCaptcha() {
    if (!CFG.captchaSiteKey || !$('#captcha')) return;
    try {
      if (!window.turnstile) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.onload = ok; s.onerror = () => no(new Error('Could not load the security check. Are you online?')); document.head.appendChild(s); });
      captchaId = window.turnstile.render('#captcha', { sitekey: CFG.captchaSiteKey, theme: 'auto', callback: t => { L.captcha = t; }, 'expired-callback': () => { L.captcha = ''; }, 'error-callback': () => { L.captcha = ''; } });
    } catch (e) { L.err = err(e); const el = $('#captcha'); if (el) el.textContent = L.err; }
  }
  function bindLogin() {
    const go = async fn => { L.busy = true; L.err = ''; render(); try { await fn(); } catch (e) { L.err = err(e); } L.busy = false; render(); };
    // Read the inputs *before* go() re-renders the form (which replaces them).
    const send = () => {
      L.email = $('#lEmail').value.trim(); const cap = L.captcha; L.captcha = '';
      go(async () => {
        if (!/^\S+@\S+\.\S+$/.test(L.email)) throw new Error('Enter a valid email address');
        if (CFG.captchaSiteKey && !cap) throw new Error('Please complete the security check first');
        await Auth.sendCode(L.email, cap); L.step = 'code'; L.fails = 0;
      });
    };
    if (L.step === 'email') { $('#lSend').onclick = send; $('#lEmail').onkeydown = e => e.key === 'Enter' && send(); renderCaptcha(); }
    else {
      const verify = () => {
        const code = $('#lCode').value.replace(/\s/g, '');
        go(async () => {
          if (code.length < 6) throw new Error('Enter the code from the email');
          try { await Auth.verify(L.email, code); } catch (e) {
            if (++L.fails >= 5) { L.step = 'email'; L.fails = 0; throw new Error('Too many wrong codes. Please request a new one.'); }
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
  const mfaVerifyHtml = () => `<div class="card"><b>Two-step verification</b>
    <p class="note">Open your authenticator app and enter the 6-digit code for Little Log.</p>
    <label class="f">Code</label><input id="mCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">
    <button class="btn p" id="mGo" style="width:100%;margin-top:12px" ${M.busy ? 'disabled' : ''}>${M.busy ? 'Checking…' : 'Continue'}</button>
    ${alertP(M.err)}
    <p class="note">Lost your authenticator? Ask another parent to reset it from the Family tab, then sign in again.</p>
    <button class="btn" id="mOut" style="width:100%">Sign out</button></div>`;
  function bindMfaVerify() {
    const go = async () => {
      const code = $('#mCode').value.replace(/\s/g, ''); if (code.length !== 6) { M.err = 'Enter the 6-digit code'; return render(); }
      M.busy = true; M.err = ''; render();
      try {
        const f = (await Auth.factors()).find(x => x.status === 'verified'); await Auth.mfaVerify(f.id, code);
        M.busy = false; render(); Sync.run(); if (pendingJoin) processPending().then(render);
      } catch (e) { M.busy = false; M.err = /invalid|expired/i.test(err(e)) ? 'That code is not right. Try the newest one.' : err(e); render(); }
    };
    $('#mGo').onclick = go; $('#mCode').onkeydown = e => e.key === 'Enter' && go(); $('#mOut').onclick = () => signOut(false);
  }
  function enrollHtml() {
    if (!M.enroll && !M.busy) beginEnroll();
    const e = M.enroll, optional = !(db.meta.role === 'parent' || F.enrollForCreate);
    return `<div class="card"><b>Set up two-step verification</b>
      <p class="note">${optional ? 'Adds a second lock to your account.' : 'Parents must use two-step verification, because they can see everything and control who has access.'}
      Use an authenticator app such as Google Authenticator, Microsoft Authenticator, Authy or 1Password.</p>
      ${e ? `<div class="qr" role="img" aria-label="Authenticator QR code">${qrSvg(e.uri)}</div>
        <p class="note">On this phone? <a href="${esc(e.uri)}">Open your authenticator app</a>, or type this key in:</p>
        <div class="code" style="font:700 15px ui-monospace,Menlo,monospace;word-break:break-all;text-align:center">${esc(e.secret)}</div>
        <div class="row"><button class="btn" id="eCopy">Copy key</button></div>
        <label class="f">Then enter the 6-digit code it shows</label><input id="eCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">
        <button class="btn p" id="eGo" style="width:100%;margin-top:12px" ${M.busy ? 'disabled' : ''}>Turn on</button>` : '<div class="empty">Preparing…</div>'}
      ${alertP(M.err)}
      ${optional ? '<button class="btn" id="eCancel" style="width:100%;margin-top:8px">Not now</button>' : '<button class="btn" id="eOut" style="width:100%;margin-top:8px">Sign out</button>'}</div>`;
  }
  async function beginEnroll() {
    M.busy = true;
    try { M.enroll = await Auth.mfaEnroll(); M.err = ''; } catch (e) { M.err = err(e); }
    M.busy = false; render();
  }
  function bindEnroll() {
    if ($('#eCopy')) $('#eCopy').onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(M.enroll.secret) : Promise.reject()).then(() => toast('Key copied'), () => toast('Press and hold the key to copy it'));
    if ($('#eGo')) $('#eGo').onclick = async () => {
      const code = $('#eCode').value.replace(/\s/g, ''); if (code.length !== 6) { M.err = 'Enter the 6-digit code'; return render(); }
      M.busy = true; M.err = ''; render();
      try {
        await Auth.mfaVerify(M.enroll.id, code);
        F.verified = true; M.enroll = null; M.busy = false; F.enrollRequested = false;
        if (O.create) { const c = O.create; O.create = null; await createLog(c); } else { render(); toast('Two-step verification is on'); Sync.run(); }
      } catch (e) { M.busy = false; M.err = /invalid|expired/i.test(err(e)) ? 'That code is not right. Try the newest one.' : err(e); render(); }
    };
    if ($('#eCancel')) $('#eCancel').onclick = () => { F.enrollRequested = F.enrollForCreate = false; M.enroll = null; O.create = null; render(); };
    if ($('#eOut')) $('#eOut').onclick = () => signOut(false);
  }

  // ---- onboarding: create a log or join one ----------------------------------------------------
  const onboardHtml = () => {
    const n = db.events.length;
    return `<div class="card"><b>Welcome, ${esc(Auth.email)}</b><p class="note">Create a log for your baby, or join one a family member shared with you.</p>
      <label class="f">Your name (shown to the family)</label><input id="oMine" type="text" maxlength="60" value="${esc(O.mine)}" placeholder="e.g. Mum"></div>
    <div class="card"><b>👶 New baby log</b>
      <p class="note">You become a parent (admin). Parents use two-step verification.</p>
      <label class="f">Baby's name</label><input id="oName" type="text" value="${esc(O.name || db.baby.name)}" placeholder="Name">
      <label class="f">Birth date</label><input id="oBirth" type="date" value="${esc(O.birth || db.baby.birth)}">
      ${n ? `<p class="note">Your ${n} existing entries on this device will be added to the new log.</p>` : ''}
      <button class="btn p" id="oCreate" style="width:100%;margin-top:12px" ${O.busy ? 'disabled' : ''}>Create log</button></div>
    <div class="card"><b>🔗 Join a family log</b>
      <p class="note">Ask a parent for an invite (Family tab → Invite). Scan their QR code or type the code. A parent then approves your request.</p>
      <div class="row"><button class="btn" id="oScan">📷 Scan QR code</button></div>
      <label class="f">Or enter the invite code</label><input id="oCode" type="text" maxlength="10" autocapitalize="characters" placeholder="ABCDE12345">
      <button class="btn" id="oJoin" style="width:100%;margin-top:8px">Send request</button></div>
    ${alertP(O.err)}
    <div class="card"><button class="btn" id="oOut" style="width:100%">Sign out</button></div>`;
  };
  function bindOnboard() {
    const mine = () => { O.mine = $('#oMine').value.trim(); return O.mine; };
    $('#oCreate').onclick = async () => {
      const name = $('#oName').value.trim(); if (!name) return toast("Enter your baby's name");
      const c = { name, birth: $('#oBirth').value, mine: mine() }; O.name = name; O.birth = c.birth; O.err = '';
      if (!F.verified) { O.create = c; F.enrollForCreate = true; return render(); }   // two-step verification first
      createLog(c);
    };
    $('#oJoin').onclick = () => { const c = parseJoin($('#oCode').value); mine(); c ? joinWith(c) : toast('Invite codes are 10 letters/numbers'); };
    $('#oScan').onclick = () => { mine(); scan(); };
    $('#oOut').onclick = () => signOut(false);
  }
  async function createLog(c) {
    O.busy = true; O.err = ''; render();
    try { await Sync.createBaby(c.name, c.birth, c.mine); F.enrollForCreate = false; } catch (e) { O.err = err(e); }
    O.busy = false; render();
  }
  /** Sends a join request; the person gets in only when a parent approves it. */
  async function joinWith(code) {
    if (db.events.length && !db.meta.babyId && !confirm(`The ${db.events.length} entries currently on this device won't be added to the shared log. Continue?`)) return;
    try { await Sync.requestJoin(code, O.mine || ''); toast('Request sent – a parent needs to approve it'); if (db.meta.babyId) tab = 'family'; }
    catch (e) { O.err = err(e); toast(err(e)); }
    render();
  }
  const waitingHtml = () => `<div class="card" style="text-align:center"><div style="font-size:48px">⏳</div><b>Waiting for approval</b>
    <p class="note">Your request was sent. A parent needs to approve it in the Family tab. This screen updates by itself.</p>
    <button class="btn" id="wCheck" style="width:100%">Check now</button>
    <button class="btn d" id="wCancel" style="width:100%;margin-top:8px">Cancel request</button>
    <button class="btn" id="wOut" style="width:100%;margin-top:8px">Sign out</button></div>`;
  function bindWaiting() {
    const check = async () => { try { if (await Sync.checkApproval()) { toast('You\'re in!'); tab = 'day'; render(); } else if (!Sync.pendingRequest()) render(); } catch (e) {} };
    $('#wCheck').onclick = check;
    $('#wCancel').onclick = async () => { try { await Sync.cancelRequest(Sync.pendingRequest().id); } catch (e) { toast(err(e)); } render(); };
    $('#wOut').onclick = () => signOut(false);
    clearInterval(waitTimer); waitTimer = setInterval(() => { if (!$('#wCheck')) return clearInterval(waitTimer); check(); }, 8000);
  }

  async function wipeLocal() {
    db = { baby: { name: '', birth: '' }, events: [], deleted: [], meta: {} };
    save(true); tab = 'day'; invite = null; F.loaded = false; F.verified = false; F.enrollRequested = F.enrollForCreate = false; M.enroll = null;
    Sync.st.people = []; Sync.st.requests = []; Sync.st.invites = []; Sync.st.memberships = []; Sync.st.myRequests = []; Lock.reset();
  }
  /** The server ended this session (signed out everywhere, or the refresh token was revoked): clear this phone. */
  async function sessionLost() { await wipeLocal(); L.step = 'email'; L.err = 'You were signed out. Please sign in again.'; render(); }
  async function signOut(everywhere) {
    if (Sync.linked() && !everywhere) await Sync.run();
    if (Sync.linked() && Sync.st.state !== 'ok' && !confirm('Some changes have not synced yet and would be lost. Sign out anyway?')) return;
    if (!confirm(everywhere ? 'Sign out of Little Log on ALL your devices? You will need to sign in again everywhere.' : 'Sign out? This clears the baby log from this device (it stays safe in the cloud).')) return;
    try { await Auth.signOut(everywhere); } catch (e) { return toast(everywhere ? 'Could not reach the server – try again when online' : err(e)); }
    await wipeLocal(); render();
  }
  async function deleteAccount() {
    const otherParents = Sync.st.people.filter(p => p.role === 'parent' && !p.is_you).length, parent = db.meta.role === 'parent';
    const msg = parent && !otherParents ? "You are this log's only parent, so the log and all its entries will be DELETED FOR EVERYONE who shares it. (Make another person a parent first to keep it.)" : 'You will leave the shared log; it stays for everyone else.';
    if (!confirm('Permanently delete your account?\n\n' + msg + '\n\nThis cannot be undone.')) return;
    if (!confirm('Really delete your account and the data on this device?')) return;
    try { await Auth.rpc('delete_my_account'); } catch (e) { return toast(err(e)); }
    try { await Auth.signOut(false); } catch (e) {}
    await Cloud.reset(); await wipeLocal(); render(); toast('Account deleted');
  }

  // ---- QR scanning ------------------------------------------------------------------------------
  async function scan() {
    const close = showSheet(`<h3>📷 Scan invite QR</h3><div class="scan"><video id="scanV" playsinline muted></video></div>
      <p class="note" id="scanMsg">Point the camera at the QR code on the parent's phone.</p>
      <div class="row"><button class="btn" id="scanX">Cancel</button></div>`);
    let stream = null, stop = false;
    const done = () => { stop = true; if (stream) stream.getTracks().forEach(t => t.stop()); close(); };
    $('#scanX').onclick = $('#sheetBack').onclick = done;
    const msg = t => { const m = $('#scanMsg'); if (m) m.textContent = t; };
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
    catch (e) { return msg('Camera not available. Allow camera access in your phone settings, or type the code instead.'); }
    const v = $('#scanV'); v.srcObject = stream; await v.play().catch(() => {});
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (stop) return;
      if (v.videoWidth) {
        const k = Math.min(1, 480 / v.videoWidth); cv.width = v.videoWidth * k; cv.height = v.videoHeight * k;
        cx.drawImage(v, 0, 0, cv.width, cv.height);
        const img = cx.getImageData(0, 0, cv.width, cv.height), r = jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
        if (r) { const code = parseJoin(r.data); if (code) { done(); return joinWith(code); } msg('That QR code is not a Little Log invite.'); }
      }
      requestAnimationFrame(tick);
    };
    tick();
  }

  // ---- Family tab -------------------------------------------------------------------------------
  function syncLine() {
    if (!Sync.linked()) return '';
    const s = Sync.st;
    const base = s.state === 'syncing' ? '⏳ Syncing…' : s.state === 'ok' ? `✅ Synced ${ago(s.at)}` : s.state === 'offline' ? '📴 Offline – will sync when connected' : s.state === 'error' ? '⚠️ Sync problem' : 'Not synced yet';
    return base + (Sync.isParent() ? '' : ` · ${roleName(db.meta.role)}`);
  }
  let membersLoadedFor = null;
  function familyHtml() {
    if (!Auth.configured || !db.meta.babyId) return `<div class="card"><b>Family sharing is off</b><p class="note">${Auth.configured ? 'Create a baby log to share it.' : "Account service isn't configured (see SETUP.md), so this device keeps its own private log."}</p></div>`;
    const s = Sync.st, parent = Sync.isParent();
    if (membersLoadedFor !== db.meta.babyId) { membersLoadedFor = db.meta.babyId; Promise.all([Sync.loadPeople(), parent ? Sync.loadAdmin() : null]).then(() => { if (tab === 'family') render(); }).catch(() => {}); }
    const people = s.people.map(m => `<div class="stat"><span>${esc(m.display_name || 'Member')}${m.is_you ? ' <small>(you)</small>' : ''}<br><small>${m.role ? esc(roleName(m.role)) : ''}${m.email && m.role ? ' · ' : ''}${esc(m.email || '')}</small></span>
      ${parent && !m.is_you ? `<button class="btn" data-person="${esc(m.user_id)}" style="padding:6px 12px">Edit</button>` : ''}</div>`).join('') || '<div class="note">Loading…</div>';
    const reqs = parent && s.requests.length ? `<h2>Waiting for your approval</h2>${s.requests.map(r => `<div class="card"><b>${esc(r.display_name || r.email)}</b><br><small class="note">${esc(r.email)} · asked to join as <b>${esc(roleName(r.role))}</b></small>
      <div class="row"><button class="btn p" data-approve="${esc(r.id)}">Approve</button><button class="btn d" data-deny="${esc(r.id)}">Deny</button></div></div>`).join('')}` : '';
    const mineReq = s.myRequests.filter(r => r.status === 'pending');
    return `
    <div class="card"><b>${esc(db.baby.name || 'Baby')}'s shared log</b>
      <div class="stat"><span>${syncLine()}${s.err && s.state === 'error' ? `<br><small>${esc(s.err)}</small>` : ''}</span><button class="btn" id="syncNow" style="padding:6px 12px">Sync now</button></div>
      ${s.denied ? `<div class="note" style="margin-top:6px">⚠️ ${s.denied} change${s.denied > 1 ? 's were' : ' was'} not allowed with your access and ${s.denied > 1 ? 'were' : 'was'} undone.</div>` : ''}
      <div class="note" style="margin-top:6px">Signed in as ${esc(Auth.email)} · ${esc(roleName(db.meta.role))}</div></div>
    ${reqs}
    <h2>People with access</h2><div class="card">${people}</div>
    ${parent ? `<h2>Invite someone</h2><div class="card" id="invCard">
      <p class="note" style="margin-top:0">Invites work once and last 2 hours. After they scan it, you approve them.</p>
      ${accessFormHtml('inv', 'caregiver')}
      <button class="btn p" id="mkInvite" style="width:100%;margin-top:12px">Create invite QR code</button>
      ${invite ? inviteHtml() : ''}
      ${s.invites.length ? `<h2 style="margin-top:16px">Open invites</h2>${s.invites.map(i => `<div class="stat"><span>${esc(roleName(i.role))}<br><small>${esc(left(i.expires_at))}</small></span>
        <span class="btns"><button class="btn" data-showinv="${esc(i.code)}" style="padding:6px 10px">Show</button><button class="btn d" data-rescind="${esc(i.code)}" style="padding:6px 10px">Rescind</button></span></div>`).join('')}` : ''}</div>
    <h2>Activity</h2><div class="card"><div class="stat"><span>Who added, changed or deleted what, and who joined or left.<br><small>Only parents can see this.</small></span><button class="btn" id="actBtn" style="padding:6px 12px">View</button></div></div>` : ''}
    <h2>Join another log</h2><div class="card">
      ${mineReq.length ? mineReq.map(r => `<div class="stat"><span>⏳ Request sent<br><small>Waiting for a parent to approve</small></span><button class="btn d" data-cancelreq="${esc(r.id)}" style="padding:6px 12px">Cancel</button></div>`).join('') : ''}
      <div class="row"><button class="btn" id="fScan">📷 Scan QR code</button></div>
      <label class="f" style="display:block;margin:10px 0 4px;color:var(--mute);font-size:13px">Or enter a code</label><div class="row"><input id="fCode" type="text" maxlength="10" autocapitalize="characters" placeholder="ABCDE12345" style="flex:2"><button class="btn" id="fJoin">Send request</button></div></div>
    ${s.memberships.length > 1 ? `<h2>Switch baby</h2><div class="card">${s.memberships.map(m => `<div class="stat"><span>${esc(m.name || 'Baby')}<br><small>${esc(roleName(m.role))}</small></span>${m.id === db.meta.babyId ? '<small>Showing</small>' : `<button class="btn" data-sw="${esc(m.id)}" style="padding:6px 12px">Show</button>`}</div>`).join('')}</div>` : ''}
    <div class="card"><button class="btn d" id="leave" style="width:100%">Leave this log</button></div>`;
  }
  function inviteHtml() {
    let svg = ''; try { svg = qrSvg(invite.url); } catch (e) { svg = '<p class="note">Could not draw the QR code – use the code instead.</p>'; }
    return `<div class="invite"><div class="qr" role="img" aria-label="Invite QR code">${svg}</div>
      <div class="code">${esc(invite.code)}</div>
      <p class="note">${esc(roleName(invite.role))} · works once · lasts 2 hours. They scan this inside Little Log, or type the code. You'll get a request to approve.</p>
      <div class="row"><button class="btn" id="invShare">Share code</button></div></div>`;
  }
  function bindFamily() {
    const el = id => document.getElementById(id);
    if (!el('syncNow')) return;
    $('#famBadge').hidden = true;
    el('syncNow').onclick = () => Sync.run();
    el('fScan').onclick = scan;
    el('fJoin').onclick = () => { const c = parseJoin(el('fCode').value); c ? joinWith(c) : toast('Invite codes are 10 letters/numbers'); };
    document.querySelectorAll('[data-cancelreq]').forEach(b => b.onclick = async () => { try { await Sync.cancelRequest(b.dataset.cancelreq); render(); } catch (e) { toast(err(e)); } });
    document.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { if (confirm("Switch this device to that baby's log?")) { Sync.choose(b.dataset.sw); membersLoadedFor = null; tab = 'day'; render(); } });
    el('leave').onclick = async () => {
      if (!confirm('Leave this log? You will lose access unless invited again.')) return;
      try { await Sync.removeMember(Auth.id); membersLoadedFor = null; render(); } catch (e) { toast(err(e)); }
    };
    if (!Sync.isParent()) return;
    const read = bindAccess(el('invCard'), 'inv');
    el('mkInvite').onclick = async () => {
      const a = read();
      try { const code = await Sync.createInvite(a.role, a.perms); invite = { code, role: a.role, url: Sync.inviteUrl(code) }; render(); } catch (e) { toast(err(e)); }
    };
    if (el('invShare')) el('invShare').onclick = () => navigator.share ? navigator.share({ title: 'Little Log invite', text: `Join ${db.baby.name || 'our baby'}'s log in the Little Log app. Invite code: ${invite.code} (valid for 2 hours)` }).catch(() => {}) : toast('Read the code out, or show the QR code');
    document.querySelectorAll('[data-showinv]').forEach(b => b.onclick = () => { const i = Sync.st.invites.find(x => x.code === b.dataset.showinv); invite = { code: i.code, role: i.role, url: Sync.inviteUrl(i.code) }; render(); });
    document.querySelectorAll('[data-rescind]').forEach(b => b.onclick = async () => {
      if (!confirm('Rescind this invite? The code stops working immediately.')) return;
      try { await Sync.rescind(b.dataset.rescind); if (invite && invite.code === b.dataset.rescind) invite = null; render(); } catch (e) { toast(err(e)); }
    });
    document.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => { try { await Sync.decide(b.dataset.approve, true); toast('Approved'); render(); } catch (e) { toast(err(e)); render(); } });
    document.querySelectorAll('[data-deny]').forEach(b => b.onclick = async () => { if (!confirm('Deny this request?')) return; try { await Sync.decide(b.dataset.deny, false); render(); } catch (e) { toast(err(e)); render(); } });
    document.querySelectorAll('[data-person]').forEach(b => b.onclick = () => editPerson(b.dataset.person));
    el('actBtn').onclick = showActivity;
  }
  function editPerson(userId) {
    const p = Sync.st.people.find(x => x.user_id === userId); if (!p) return;
    const close = showSheet(`<h3>${esc(p.display_name || 'Member')}</h3><p class="note">${esc(p.email || '')}</p>
      <div id="pForm">${accessFormHtml('p', p.role || 'caregiver', p.perms)}</div>
      <div class="row" style="margin-top:16px"><button class="btn" id="pCancel">Cancel</button><button class="btn p" id="pSave">Save</button></div>
      <div class="row"><button class="btn" id="pMfa">Reset two-step verification</button></div>
      <div class="row"><button class="btn d" id="pRemove">Remove from this log</button></div>`);
    const read = bindAccess($('#pForm'), 'p');
    $('#pCancel').onclick = close;
    $('#pSave').onclick = async () => { const a = read(); try { await Sync.setMember(userId, a.role, a.perms); close(); toast('Saved'); render(); } catch (e) { toast(err(e)); } };
    $('#pMfa').onclick = async () => { if (!confirm(`Reset two-step verification for ${p.display_name}? They will set it up again next time they sign in.`)) return; try { await Sync.resetMfa(userId); toast('Reset'); } catch (e) { toast(err(e)); } };
    $('#pRemove').onclick = async () => { if (!confirm(`Remove ${p.display_name} from this log? They lose access immediately.`)) return; try { await Sync.removeMember(userId); close(); render(); } catch (e) { toast(err(e)); } };
  }
  const ACT = {
    log_created: l => `${l.actor} created the log`, profile_changed: l => `${l.actor} changed the baby's name or birthday`,
    entry_added: l => `${l.actor} added a ${l.entry_type} entry`,
    entry_edited: l => `${l.actor} edited a ${l.entry_type} entry${l.detail.author && l.detail.author !== l.actor ? ` added by ${l.detail.author}` : ''}`,
    entry_deleted: l => `${l.actor} deleted a ${l.entry_type} entry${l.detail.author && l.detail.author !== l.actor ? ` added by ${l.detail.author}` : ''}`,
    invite_created: l => `${l.actor} created a ${roleName(l.detail.role)} invite`, invite_rescinded: l => `${l.actor} rescinded a ${roleName(l.detail.role)} invite`,
    join_requested: l => `${l.detail.email} asked to join as ${roleName(l.detail.role)}`,
    member_approved: l => `${l.actor} approved ${l.detail.email} as ${roleName(l.detail.role)}`, request_denied: l => `${l.actor} denied ${l.detail.email}`,
    role_changed: l => `${l.actor} made ${l.detail.person} a ${roleName(l.detail.role)}`, permissions_changed: l => `${l.actor} changed what ${l.detail.person} can do`,
    member_removed: l => `${l.actor} removed ${l.detail.person}`, left: l => `${l.detail.person || l.actor} left the log`,
    mfa_reset: l => `${l.actor} reset two-step verification for ${l.detail.person}`,
  };
  async function showActivity() {
    const close = showSheet('<h3>Activity</h3><div id="actList"><div class="empty">Loading…</div></div><div class="row" style="margin-top:12px"><button class="btn" id="actMore" hidden>Older</button><button class="btn" id="actClose">Close</button></div>');
    $('#actClose').onclick = close;
    let before = null, any = false;
    const load = async () => {
      try {
        const rows = await Sync.activity(before);
        const list = $('#actList'); if (!any) list.innerHTML = '';
        any = any || rows.length > 0;
        list.insertAdjacentHTML('beforeend', rows.map(l => `<div class="card" style="padding:8px 12px"><small class="note">${esc(new Date(l.at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</small><br>${esc((ACT[l.action] || (x => x.action))(l))}</div>`).join(''));
        if (!any) list.innerHTML = '<div class="empty">Nothing yet.</div>';
        if (rows.length) before = rows[rows.length - 1].id;
        $('#actMore').hidden = rows.length < 50;
      } catch (e) { $('#actList').innerHTML = `<div class="empty">${esc(err(e))}</div>`; }
    };
    $('#actMore').onclick = load; load();
  }

  // ---- More tab: security, account, cloud backup ------------------------------------------------
  function accountHtml() {
    if (!Auth.configured || !Auth.signedIn) return '';
    const parent = db.meta.role === 'parent', me = Sync.st.people.find(p => p.is_you);
    return `<div class="card"><b>🔐 Security & account</b>
      <div class="stat"><span>Signed in as<br><small>${esc(Auth.email)}</small></span></div>
      ${Sync.linked() ? `<label class="f" style="display:block;margin:8px 0 4px;color:var(--mute);font-size:13px">Your name (shown to the family)</label><input id="myName" type="text" maxlength="60" value="${esc(me ? me.display_name : '')}">` : ''}
      <div class="stat"><span>Two-step verification<br><small>${F.verified ? 'On' + (parent ? ' (required for parents)' : '') : 'Off'}</small></span>
        ${F.verified ? (parent ? '' : '<button class="btn" id="mfaOff" style="padding:6px 12px">Turn off</button>') : '<button class="btn p" id="mfaOn" style="padding:6px 12px">Turn on</button>'}</div>
      <div class="stat"><span>App lock<br><small>Face ID / fingerprint / passcode</small></span><span class="chips"><label class="chip"><input type="checkbox" id="lockOn" ${Lock.enabled ? 'checked' : ''}><span>${Lock.enabled ? 'On' : 'Off'}</span></label></span></div>
      ${Lock.enabled ? `<div class="stat"><span>Lock after<br><small>when you leave the app</small></span><select id="lockMin" style="padding:8px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)">${[[0, 'Immediately'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes']].map(([v, l]) => `<option value="${v}" ${Lock.minutes === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
      <div class="row"><button class="btn" id="signOut">Sign out</button><button class="btn" id="signOutAll">Sign out everywhere</button></div>
      <div class="row"><button class="btn d" id="delAcct">Delete account</button></div></div>`;
  }
  function cloudHtml() {
    const av = Cloud.available(), row = p => {
      const last = Cloud.last(p);
      return `<div class="stat"><span>${Cloud.label(p)}<br><small>${!av[p] ? 'Not set up by the app owner' : Cloud.connected(p) ? (last ? 'Last backup ' + ago(last) : 'Connected') : 'Not connected'}</small></span>
      <span class="btns">${!av[p] ? '' : Cloud.connected(p)
        ? `<button class="btn" data-cb="${p}" style="padding:6px 10px">Back up</button><button class="btn" data-cr="${p}" style="padding:6px 10px">Restore</button><button class="btn d" data-cd="${p}" style="padding:6px 10px" aria-label="Disconnect ${Cloud.label(p)}">✕</button>`
        : `<button class="btn p" data-cc="${p}" style="padding:6px 12px">Connect</button>`}</span></div>`;
    };
    return `<div class="card"><b>☁️ Cloud backup</b>
      <p class="note">Keep a private, encrypted copy in your own cloud storage. It is scrambled on this phone with your passphrase, so the provider can't read it. The passphrase is kept in the phone's secure storage. <b>If you lose it, the backup can't be recovered</b>, so write it down.</p>
      <label class="f" style="display:block;margin:8px 0 4px;color:var(--mute);font-size:13px">Backup passphrase (${Cloud.MIN_PASS}+ characters)</label>
      <input id="cPass" type="password" autocomplete="new-password" value="${esc(Cloud.pass)}" placeholder="${Cloud.pass ? '' : 'Choose a long passphrase'}">
      <div class="row"><button class="btn" id="cSavePass">Save passphrase</button><button class="btn" id="cGenPass">Generate one</button></div>
      <div class="chips" style="margin:10px 0">${chip('cAuto', 1, 'Back up daily', Cloud.auto)}</div>
      ${['google', 'dropbox', 'onedrive'].map(row).join('')}
      <div class="stat"><span>iCloud Drive / Files<br><small>Save the encrypted file with the share sheet</small></span><span class="btns"><button class="btn" id="cFileSave" style="padding:6px 10px">Save</button><button class="btn" id="cFileLoad" style="padding:6px 10px">Restore</button></span></div>
      <input type="file" id="cFile" accept="application/json,.json" hidden></div>`;
  }
  function applyBackup(d) {
    if (!d || !Array.isArray(d.events)) throw new Error('That file has no entries in it');
    if (!Sync.can('add')) throw new Error('You do not have permission to add entries');
    const rows = d.events.filter(e => e && typeof e.id === 'string' && TYPES[e.type] && Number.isFinite(+e.ts))
      .filter(e => Sync.can('health') || (e.type !== 'health' && e.type !== 'med'))
      .map(e => ({ ...e, ts: +e.ts, end: e.end == null ? null : +e.end, updated: +e.updated || 0, deleted: false, by: Auth.id || e.by }));
    const n = Sync.merge(rows, true);
    if (d.baby && !db.baby.name) { db.baby = { name: String(d.baby.name || ''), birth: String(d.baby.birth || '') }; }
    save(); render(); toast(n ? `Restored ${n} entries` : 'Nothing new to restore');
  }
  function bindMoreAccount() {
    const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
    on('#signOut', () => signOut(false)); on('#signOutAll', () => signOut(true)); on('#delAcct', deleteAccount);
    on('#mfaOn', () => { F.enrollRequested = true; M.enroll = null; render(); });
    on('#mfaOff', async () => {
      if (!confirm('Turn off two-step verification?')) return;
      try { for (const f of await Auth.factors()) await Auth.mfaRemove(f.id); F.verified = false; render(); toast('Turned off'); } catch (e) { toast(err(e)); }
    });
    if ($('#myName')) $('#myName').onchange = async e => { try { await Sync.setDisplayName(e.target.value); toast('Saved'); } catch (x) { toast(err(x)); } };
    if ($('#lockOn')) $('#lockOn').onchange = async e => { const m = await Lock.set(e.target.checked); if (m) toast(m); render(); };
    if ($('#lockMin')) $('#lockMin').onchange = e => { Lock.setMinutes(+e.target.value); toast('Saved'); };
    if (!$('#cPass')) return;
    on('#cSavePass', () => { const m = Cloud.setPass($('#cPass').value); toast(m || 'Passphrase saved in secure storage'); });
    on('#cGenPass', () => {
      const p = Cloud.generatePass();
      showSheet(`<h3>Your backup passphrase</h3><p class="note">Write this down and keep it somewhere safe. Without it a backup can't be opened. It will be saved in this phone's secure storage.</p>
        <div class="code" style="font:700 17px ui-monospace,Menlo,monospace;text-align:center;word-break:break-all;margin:12px 0">${esc(p)}</div>
        <div class="row"><button class="btn" id="gpCancel">Cancel</button><button class="btn p" id="gpUse">I've written it down</button></div>`);
      $('#gpCancel').onclick = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; };
      $('#gpUse').onclick = () => { Cloud.setPass(p); $('#sheet').hidden = $('#sheetBack').hidden = true; render(); toast('Passphrase saved'); };
    });
    document.querySelector('[name=cAuto]').onchange = e => { Cloud.auto = e.target.checked; if (e.target.checked && !Cloud.pass) toast('Set a passphrase to enable daily backups'); };
    const run = async (label, fn) => { toast(label + '…'); try { const m = await fn(); render(); toast(m || 'Done'); } catch (e) { toast(err(e)); } };
    document.querySelectorAll('[data-cc]').forEach(b => b.onclick = () => run('Connecting', async () => { await Cloud.connect(b.dataset.cc); return 'Finish signing in in the browser window'; }));
    document.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => { Cloud.disconnect(b.dataset.cd); render(); });
    document.querySelectorAll('[data-cb]').forEach(b => b.onclick = () => run('Backing up', async () => { await Cloud.backup(b.dataset.cb); return 'Backed up to ' + Cloud.label(b.dataset.cb); }));
    document.querySelectorAll('[data-cr]').forEach(b => b.onclick = () => run('Restoring', async () => { applyBackup(await Cloud.restore(b.dataset.cr)); }));
    on('#cFileSave', async () => { try { const f = await Cloud.toFile(); await Native.saveFile(f.name, await f.text()); } catch (e) { if (!/cancel|abort/i.test(err(e))) toast(err(e)); } });
    on('#cFileLoad', () => { if (!Cloud.pass || Cloud.pass.length < Cloud.MIN_PASS) return toast(`Set a backup passphrase (${Cloud.MIN_PASS}+ characters) first`); $('#cFile').click(); });
    $('#cFile').onchange = async e => { try { applyBackup(await Cloud.fromFile(e.target.files[0])); } catch (x) { toast(err(x)); } e.target.value = ''; };
  }
  /** Called by app.js after each render/sync to keep the Family tab badge current. */
  function updateBadge() { const b = $('#famBadge'); if (!b) return; const n = Sync.isParent() ? Sync.st.requests.length : 0; b.hidden = !n || tab === 'family'; b.textContent = n; }

  return { gate, familyHtml, bindFamily, accountHtml, cloudHtml, bindMoreAccount, applyBackup, syncLine, refreshAuth, processPending, receiveJoin, updateBadge, parseJoin, sessionLost };
})();
