'use strict';
/* Account, family-sharing and cloud-backup UI. Uses helpers/state from app.js lazily (call time only). */
const Acct = (() => {
  const L = { step: 'email', email: '', busy: false, err: '' };   // sign-in form
  const O = { busy: false, err: '' };                             // onboarding form
  let invite = null;                                              // last created invite {code, role, url}
  let memFor = null;                                              // baby whose member list is loaded
  let pendingJoin = null;

  const parseJoin = text => {
    text = String(text || '').trim();
    try { const q = new URL(text).searchParams, c = q.get('join') || q.get('code'); if (c) text = c; } catch (e) {}
    return /^[A-Za-z0-9]{10}$/.test(text) ? text.toUpperCase() : null;
  };
  // An invite link opened in the browser (?join=CODE) is remembered until the user is signed in.
  (() => {
    const c = new URLSearchParams(location.search).get('join');
    if (c) { try { localStorage.setItem('ll.join', c); } catch (e) {} history.replaceState(null, '', location.pathname); }
    try { pendingJoin = parseJoin(localStorage.getItem('ll.join')); } catch (e) {}
  })();
  /** An invite link opened while the app is running (phone app: OS hands it over; browser: not used). */
  function receiveJoin(text) {
    const code = parseJoin(text); if (!code) return false;
    try { localStorage.setItem('ll.join', code); } catch (e) {}
    pendingJoin = code;
    if (Auth.signedIn) processPending().then(render); else render();
    return true;
  }
  const clearPending = () => { pendingJoin = null; try { localStorage.removeItem('ll.join'); } catch (e) {} };

  const ago = t => { const m = (Date.now() - t) / MIN; return m < 1 ? 'just now' : fmtDur(m) + ' ago'; };
  const roleName = r => ({ owner: 'Owner', caregiver: 'Caregiver', viewer: 'View only' }[r] || r);
  const err = e => (e && e.message) || String(e);

  // ---- gate: sign-in / onboarding --------------------------------------------------------------
  function gate() {
    if (!Auth.configured) return db.meta.localOnly ? null : { html: setupHtml(), bind: bindSetup };
    if (!Auth.signedIn) return { html: loginHtml(), bind: bindLogin };
    if (!db.meta.babyId) return { html: onboardHtml(), bind: bindOnboard };
    return null;
  }
  const setupHtml = () => `<div class="card"><b>Sign-in isn't set up yet</b>
    <p class="note">This copy of Little Log has no account service configured, so family sync and email sign-in are unavailable. See <code>SETUP.md</code> to turn them on.</p>
    <button class="btn p" id="localOnly" style="width:100%">Use on this device only</button></div>`;
  const bindSetup = () => { $('#localOnly').onclick = () => { db.meta.localOnly = true; save(true); render(); }; };

  const loginHtml = () => `<div class="card"><b>${L.step === 'email' ? 'Sign in' : 'Check your email'}</b>
    ${L.step === 'email'
      ? `<p class="note">Enter your email and we'll send you a one-time code. No password needed. First time? This creates your account.</p>
         <label class="f">Email</label><input id="lEmail" type="email" inputmode="email" autocomplete="email" value="${esc(L.email)}" placeholder="you@example.com">
         <button class="btn p" id="lSend" style="width:100%;margin-top:12px" ${L.busy ? 'disabled' : ''}>${L.busy ? 'Sending…' : 'Email me a code'}</button>`
      : `<p class="note">We sent a code to <b>${esc(L.email)}</b>. It can take a minute.</p>
         <label class="f">Code</label><input id="lCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456">
         <button class="btn p" id="lVerify" style="width:100%;margin-top:12px" ${L.busy ? 'disabled' : ''}>${L.busy ? 'Checking…' : 'Sign in'}</button>
         <div class="row"><button class="btn" id="lBack">Different email</button><button class="btn" id="lResend">Resend code</button></div>`}
    ${L.err ? `<p class="note" style="color:var(--health)" role="alert">${esc(L.err)}</p>` : ''}</div>
    ${pendingJoin ? '<div class="card">📨 You have a family invite waiting. Sign in to join.</div>' : ''}`;
  function bindLogin() {
    const go = async fn => { L.busy = true; L.err = ''; render(); try { await fn(); } catch (e) { L.err = err(e); } L.busy = false; render(); };
    // Read the inputs *before* go() re-renders the form (which replaces them).
    const send = () => { L.email = $('#lEmail').value.trim(); go(async () => { if (!/^\S+@\S+\.\S+$/.test(L.email)) throw new Error('Enter a valid email address'); await Auth.sendCode(L.email); L.step = 'code'; }); };
    if (L.step === 'email') { $('#lSend').onclick = send; $('#lEmail').onkeydown = e => e.key === 'Enter' && send(); }
    else {
      const verify = () => {
        const code = $('#lCode').value.replace(/\s/g, '');
        go(async () => { if (code.length < 6) throw new Error('Enter the code from the email'); await Auth.verify(L.email, code); L.step = 'email'; await afterLogin(); });
      };
      $('#lVerify').onclick = verify; $('#lCode').onkeydown = e => e.key === 'Enter' && verify();
      $('#lBack').onclick = () => { L.step = 'email'; L.err = ''; render(); };
      $('#lResend').onclick = () => go(() => Auth.sendCode(L.email).then(() => toast('Code sent')));
    }
  }
  async function afterLogin() {
    const ms = await Sync.loadMemberships();
    if (ms.length) Sync.choose((ms.find(m => m.id === db.meta.babyId) || ms[0]).id);
    await processPending();
    Sync.start();
  }
  async function processPending() {
    const code = pendingJoin; clearPending();
    if (!code) return;
    await joinWith(code, true);
  }

  const onboardHtml = () => {
    const n = db.events.length;
    return `<div class="card"><b>Welcome${Auth.email ? ', ' + esc(Auth.email) : ''}</b><p class="note">Create a log for your baby, or join one a family member shared with you.</p></div>
    <div class="card"><b>👶 New baby log</b>
      <label class="f">Baby's name</label><input id="oName" type="text" value="${esc(db.baby.name)}" placeholder="Name">
      <label class="f">Birth date</label><input id="oBirth" type="date" value="${esc(db.baby.birth)}">
      ${n ? `<p class="note">Your ${n} existing entries on this device will be added to the new log.</p>` : ''}
      <button class="btn p" id="oCreate" style="width:100%;margin-top:12px" ${O.busy ? 'disabled' : ''}>Create log</button></div>
    <div class="card"><b>🔗 Join a family log</b>
      <p class="note">Ask a parent to show their invite QR code (Family tab), then scan it or type the code.</p>
      <div class="row"><button class="btn" id="oScan">📷 Scan QR code</button></div>
      <label class="f">Or enter the invite code</label><input id="oCode" type="text" maxlength="10" autocapitalize="characters" placeholder="ABCDE12345">
      <button class="btn" id="oJoin" style="width:100%;margin-top:8px">Join</button></div>
    ${O.err ? `<p class="note" style="color:var(--health)" role="alert">${esc(O.err)}</p>` : ''}
    <div class="card"><button class="btn" id="oOut" style="width:100%">Sign out</button></div>`;
  };
  function bindOnboard() {
    $('#oCreate').onclick = async () => {
      const name = $('#oName').value.trim(); if (!name) return toast('Enter your baby\'s name');
      O.busy = true; O.err = ''; render();
      try { await Sync.createBaby(name, $('#oBirth').value); } catch (e) { O.err = err(e); }
      O.busy = false; render();
    };
    $('#oJoin').onclick = () => { const c = parseJoin($('#oCode').value); c ? joinWith(c) : toast('Invite codes are 10 letters/numbers'); };
    $('#oScan').onclick = scan;
    $('#oOut').onclick = signOut;
  }

  async function joinWith(code, fromLink) {
    const n = db.events.length && !db.meta.babyId;
    if (!confirm(fromLink ? 'You were invited to a shared baby log. Join it?' : 'Join this shared baby log?') ) return;
    if (n && !confirm(`The ${db.events.length} entries currently on this device won't be added to the shared log. Join anyway?`)) return;
    try { await Sync.join(code); toast('Joined!'); tab = 'day'; }
    catch (e) { O.err = err(e); toast(err(e)); }
    render();
  }

  async function signOut() {
    await Sync.run();
    if (Sync.linked() && Sync.st.state !== 'ok' && !confirm('Some changes have not synced yet and would be lost. Sign out anyway?')) return;
    if (!confirm('Sign out? This clears the baby log from this device (it stays safe in the cloud).')) return;
    await Auth.signOut();
    db = { baby: { name: '', birth: '' }, events: [], deleted: [], meta: {} };
    save(true); tab = 'day'; memFor = null; invite = null; render();
  }

  async function deleteAccount() {
    const owner = db.meta.role === 'owner';
    if (!confirm('Permanently delete your account?' + (owner ? ' Because you own this log, it passes to its longest-standing caregiver, or is deleted for everyone if there is none.' : '') + ' This cannot be undone.')) return;
    if (!confirm('Really delete your account and the data on this device?')) return;
    try { await Auth.rpc('delete_my_account'); } catch (e) { return toast(err(e)); }
    await Auth.signOut();
    Cloud.reset();
    db = { baby: { name: '', birth: '' }, events: [], deleted: [], meta: {} };
    save(true); tab = 'day'; memFor = null; invite = null; render(); toast('Account deleted');
  }

  // ---- QR scanning ------------------------------------------------------------------------------
  async function scan() {
    const S = $('#sheet'), back = $('#sheetBack');
    S.innerHTML = `<h3>📷 Scan invite QR</h3><div class="scan"><video id="scanV" playsinline muted></video></div>
      <p class="note" id="scanMsg">Point the camera at the QR code on your family member's phone.</p>
      <div class="row"><button class="btn" id="scanX">Cancel</button></div>`;
    S.hidden = back.hidden = false;
    let stream = null, stop = false;
    const close = () => { stop = true; if (stream) stream.getTracks().forEach(t => t.stop()); S.hidden = back.hidden = true; };
    $('#scanX').onclick = back.onclick = close;
    const msg = t => { const m = $('#scanMsg'); if (m) m.textContent = t; };
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
    catch (e) { return msg('Camera not available. You can also open the invite link, or type the code instead.'); }
    const v = $('#scanV'); v.srcObject = stream; await v.play().catch(() => {});
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (stop) return;
      if (v.videoWidth) {
        const k = Math.min(1, 480 / v.videoWidth); cv.width = v.videoWidth * k; cv.height = v.videoHeight * k;
        cx.drawImage(v, 0, 0, cv.width, cv.height);
        const img = cx.getImageData(0, 0, cv.width, cv.height), r = jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
        if (r) { const code = parseJoin(r.data); if (code) { close(); return joinWith(code); } msg('That QR code is not a Little Log invite.'); }
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
    return base + (Sync.canEdit() ? '' : ' · 👀 view only');
  }
  function familyHtml() {
    if (!Auth.configured || !db.meta.babyId) return `<div class="card"><b>Family sharing is off</b><p class="note">${Auth.configured ? 'Sign in and create a baby log to share it.' : 'Account service isn\'t configured (see SETUP.md), so this device keeps its own private log.'}</p></div>`;
    const s = Sync.st, owner = db.meta.role === 'owner';
    if (memFor !== db.meta.babyId) { memFor = db.meta.babyId; Sync.members().then(() => { if (tab === 'family') render(); }).catch(() => {}); }
    const people = s.members.map(m => `<div class="stat"><span>${esc(m.email || 'Unknown')}${m.user_id === Auth.id ? ' <small>(you)</small>' : ''}<br><small>${roleName(m.role)}</small></span>
      ${owner && m.user_id !== Auth.id ? `<button class="btn d" data-rm="${esc(m.user_id)}" style="padding:6px 12px">Remove</button>` : ''}</div>`).join('') || '<div class="note">Loading…</div>';
    return `
    <div class="card"><b>${esc(db.baby.name || 'Baby')}'s shared log</b>
      <div class="stat"><span>${syncLine()}${s.err && s.state === 'error' ? `<br><small>${esc(s.err)}</small>` : ''}</span><button class="btn" id="syncNow" style="padding:6px 12px">Sync now</button></div>
      <div class="note" style="margin-top:6px">Signed in as ${esc(Auth.email)} · ${roleName(db.meta.role)}</div></div>
    <h2>People with access</h2><div class="card">${people}</div>
    ${owner ? `<h2>Invite someone</h2><div class="card">
      <label class="f" style="display:block;margin:0 0 6px;color:var(--mute);font-size:13px">They can…</label>
      <div class="chips">${chip('irole', 'caregiver', '✍️ Log entries', true, '', true)}${chip('irole', 'viewer', '👀 View only', false, '', true)}</div>
      <button class="btn p" id="mkInvite" style="width:100%;margin-top:12px">Create invite QR code</button>
      ${invite ? inviteHtml() : ''}</div>` : ''}
    <h2>Join another log</h2><div class="card"><div class="row"><button class="btn" id="fScan">📷 Scan QR code</button></div>
      <label class="f" style="display:block;margin:10px 0 4px;color:var(--mute);font-size:13px">Or enter a code</label><div class="row"><input id="fCode" type="text" maxlength="10" autocapitalize="characters" placeholder="ABCDE12345" style="flex:2;padding:10px;font-size:16px"><button class="btn" id="fJoin">Join</button></div></div>
    ${s.memberships.length > 1 ? `<h2>Switch baby</h2><div class="card">${s.memberships.map(m => `<div class="stat"><span>${esc(m.name || 'Baby')}<br><small>${roleName(m.role)}</small></span>${m.id === db.meta.babyId ? '<small>Showing</small>' : `<button class="btn" data-sw="${esc(m.id)}" style="padding:6px 12px">Show</button>`}</div>`).join('')}</div>` : ''}
    ${owner ? '' : '<div class="card"><button class="btn d" id="leave" style="width:100%">Leave this log</button></div>'}`;
  }
  function inviteHtml() {
    let svg = '';
    try { const q = qrcode(0, 'M'); q.addData(invite.url); q.make(); svg = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch (e) { svg = '<p class="note">Could not draw the QR code – share the link instead.</p>'; }
    return `<div class="invite"><div class="qr" role="img" aria-label="Invite QR code">${svg}</div>
      <div class="code">${esc(invite.code)}</div>
      <p class="note">${roleName(invite.role)} · works once · expires in 48 hours. Have them scan this with Little Log (or their phone camera), or send the link.</p>
      <div class="row"><button class="btn" id="invShare">Share link</button><button class="btn" id="invCopy">Copy link</button></div></div>`;
  }
  function bindFamily() {
    const el = id => document.getElementById(id);
    if (!el('syncNow')) return;
    el('syncNow').onclick = () => Sync.run();
    el('fScan').onclick = scan;
    el('fJoin').onclick = () => { const c = parseJoin(el('fCode').value); c ? joinWith(c) : toast('Invite codes are 10 letters/numbers'); };
    if (el('mkInvite')) el('mkInvite').onclick = async () => {
      const role = (document.querySelector('[name=irole]:checked') || {}).value || 'caregiver';
      try { const code = await Sync.invite(role); invite = { code, role, url: Sync.inviteUrl(code) }; render(); } catch (e) { toast(err(e)); }
    };
    if (el('invShare')) {
      el('invShare').onclick = () => navigator.share ? navigator.share({ title: 'Little Log invite', text: `Join ${db.baby.name || 'our baby'}'s log on Little Log`, url: invite.url }).catch(() => {}) : copy();
      el('invCopy').onclick = copy;
    }
    function copy() { (navigator.clipboard ? navigator.clipboard.writeText(invite.url) : Promise.reject()).then(() => toast('Link copied'), () => toast('Copy failed – long-press the code instead')); }
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      if (!confirm('Remove this person? They will lose access to the log.')) return;
      try { await Sync.removeMember(b.dataset.rm); await Sync.members(); render(); } catch (e) { toast(err(e)); }
    });
    document.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { if (confirm('Switch this device to that baby\'s log?')) { Sync.choose(b.dataset.sw); memFor = null; tab = 'day'; render(); } });
    if (el('leave')) el('leave').onclick = async () => {
      if (!confirm('Leave this log? You will lose access unless invited again.')) return;
      try { await Sync.removeMember(Auth.id); render(); } catch (e) { toast(err(e)); }
    };
  }

  // ---- More tab: account + cloud backup ---------------------------------------------------------
  const accountHtml = () => !Auth.configured || !Auth.signedIn ? '' :
    `<div class="card"><b>Account</b><div class="stat"><span>${esc(Auth.email)}</span><button class="btn" id="signOut" style="padding:6px 12px">Sign out</button></div>
     <div class="stat"><span>Delete account<br><small>Removes your sign-in. Shared logs you own pass to a caregiver, or are deleted if you're the only one.</small></span><button class="btn d" id="delAcct" style="padding:6px 12px">Delete</button></div></div>`;

  function cloudHtml() {
    const av = Cloud.available(), row = p => {
      const last = Cloud.last(p);
      return `<div class="stat"><span>${Cloud.label(p)}<br><small>${!av[p] ? 'Not set up by the app owner' : Cloud.connected(p) ? (last ? 'Last backup ' + ago(last) : 'Connected') : 'Not connected'}</small></span>
      <span class="btns">${!av[p] ? '' : Cloud.connected(p)
        ? `<button class="btn" data-cb="${p}" style="padding:6px 10px">Back up</button><button class="btn" data-cr="${p}" style="padding:6px 10px">Restore</button><button class="btn d" data-cd="${p}" style="padding:6px 10px" aria-label="Disconnect ${Cloud.label(p)}">✕</button>`
        : `<button class="btn p" data-cc="${p}" style="padding:6px 12px">Connect</button>`}</span></div>`;
    };
    return `<div class="card"><b>☁️ Cloud backup</b>
      <p class="note">Keep a private, encrypted copy in your own cloud storage. It is scrambled on this device with your passphrase, so the provider can't read it. <b>If you lose the passphrase the backup can't be recovered.</b></p>
      <label class="f" style="display:block;margin:8px 0 4px;color:var(--mute);font-size:13px">Backup passphrase</label>
      <input id="cPass" type="password" autocomplete="new-password" value="${esc(Cloud.pass)}" placeholder="6+ characters" style="width:100%;padding:10px;font-size:16px">
      <div class="chips" style="margin:10px 0">${chip('cAuto', 1, 'Back up daily (Dropbox / OneDrive)', Cloud.auto)}</div>
      ${['google', 'dropbox', 'onedrive'].map(row).join('')}
      <div class="stat"><span>iCloud Drive / Files<br><small>Save the encrypted file with the share sheet</small></span><span class="btns"><button class="btn" id="cFileSave" style="padding:6px 10px">Save</button><button class="btn" id="cFileLoad" style="padding:6px 10px">Restore</button></span></div>
      <input type="file" id="cFile" accept="application/json,.json" hidden></div>`;
  }
  function applyBackup(d) {
    if (!d || !Array.isArray(d.events)) throw new Error('That file has no entries in it');
    const rows = d.events.filter(e => e && typeof e.id === 'string' && TYPES[e.type] && Number.isFinite(+e.ts))
      .map(e => ({ ...e, ts: +e.ts, end: e.end == null ? null : +e.end, updated: +e.updated || 0, deleted: false }));
    const n = Sync.merge(rows, true);
    if (d.baby && !db.baby.name) { db.baby = { name: String(d.baby.name || ''), birth: String(d.baby.birth || '') }; }
    save(); render(); toast(n ? `Restored ${n} entries` : 'Nothing new to restore');
  }
  function bindMoreAccount() {
    if ($('#signOut')) $('#signOut').onclick = signOut;
    if ($('#delAcct')) $('#delAcct').onclick = deleteAccount;
    if (!$('#cPass')) return;
    $('#cPass').onchange = e => { Cloud.pass = e.target.value; toast('Passphrase saved on this device'); };
    document.querySelector('[name=cAuto]').onchange = e => { Cloud.auto = e.target.checked; if (e.target.checked && !Cloud.pass) toast('Set a passphrase to enable daily backups'); };
    const run = async (label, fn) => { toast(label + '…'); try { const m = await fn(); render(); toast(m || 'Done'); } catch (e) { toast(err(e)); } };
    const pass = () => { Cloud.pass = $('#cPass').value; };
    document.querySelectorAll('[data-cc]').forEach(b => b.onclick = () => run('Connecting', () => Cloud.connect(b.dataset.cc)));
    document.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => { Cloud.disconnect(b.dataset.cd); render(); });
    document.querySelectorAll('[data-cb]').forEach(b => b.onclick = () => { pass(); run('Backing up', async () => { await Cloud.backup(b.dataset.cb); return 'Backed up to ' + Cloud.label(b.dataset.cb); }); });
    document.querySelectorAll('[data-cr]').forEach(b => b.onclick = () => { pass(); run('Restoring', async () => { applyBackup(await Cloud.restore(b.dataset.cr)); }); });
    $('#cFileSave').onclick = async () => {
      pass();
      try {
        const f = await Cloud.toFile();
        if (Native.is) await Native.saveFile(f.name, await f.text());
        else if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'Little Log backup' });
        else download(f.name, await f.text(), 'application/json');
      } catch (e) { if (e.name !== 'AbortError') toast(err(e)); }
    };
    $('#cFileLoad').onclick = () => { pass(); try { Cloud.pass.length >= 6 || (() => { throw new Error('Set a backup passphrase (6+ characters) first'); })(); $('#cFile').click(); } catch (e) { toast(err(e)); } };
    $('#cFile').onchange = async e => { try { applyBackup(await Cloud.fromFile(e.target.files[0])); } catch (x) { toast(err(x)); } e.target.value = ''; };
  }

  return { gate, familyHtml, bindFamily, accountHtml, cloudHtml, bindMoreAccount, applyBackup, syncLine, afterLogin, processPending, receiveJoin, hasPending: () => !!pendingJoin };
})();
