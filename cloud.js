'use strict';
/* Encrypted backups to the user's own cloud storage.
   The backup file is encrypted in the browser (AES-GCM, key from a passphrase via PBKDF2), so the storage
   provider only ever sees ciphertext. Dropbox / OneDrive use OAuth code+PKCE; Google Drive uses Google
   Identity Services. iCloud has no web API, so it goes through the system share sheet ("Save to Files"). */
const Cloud = (() => {
  const CFG = window.LL_CONFIG || {};
  const K = 'littlelog.cloud.v1';
  const FILE = 'little-log-backup.json';
  // Browser: come back to this page. Phone app: come back through a custom URL scheme the OS routes to the app.
  const googleScheme = () => 'com.googleusercontent.apps.' + (CFG.googleNativeClientId || '').replace('.apps.googleusercontent.com', '');
  const REDIRECT = p => !Native.is ? location.origin + location.pathname : p === 'google' ? googleScheme() + ':/oauth2redirect' : Native.scheme + '://oauth';
  let c = { tokens: {}, pass: '', auto: false, last: {} };
  try { Object.assign(c, JSON.parse(localStorage.getItem(K)) || {}); } catch (e) {}
  const persist = () => { try { localStorage.setItem(K, JSON.stringify(c)); } catch (e) {} };

  // ---- crypto ----------------------------------------------------------------------------------
  const b64 = u8 => btoa(String.fromCharCode(...u8));
  const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  async function keyFrom(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(text, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pass, salt), new TextEncoder().encode(text)));
    return JSON.stringify({ app: 'littlelog', v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
  }
  async function decrypt(file, pass) {
    let o; try { o = JSON.parse(file); } catch (e) { throw new Error('That is not a Little Log backup'); }
    if (o.app !== 'littlelog' || !o.ct) throw new Error('That is not a Little Log backup');
    try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, await keyFrom(pass, unb64(o.salt)), unb64(o.ct))); }
    catch (e) { throw new Error('Wrong passphrase, or the file is damaged'); }
  }

  // ---- OAuth (PKCE) for Dropbox and OneDrive ---------------------------------------------------
  const rnd = n => b64(crypto.getRandomValues(new Uint8Array(n))).replace(/[+/=]/g, '').slice(0, n);
  async function challenge(v) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
  const PKCE = {
    dropbox: { id: () => CFG.dropboxKey, auth: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token', extra: { token_access_type: 'offline' } },
    // Google Drive inside the phone app: Google blocks its web sign-in in embedded webviews, so use the
    // system browser + PKCE with an "iOS"-type OAuth client (custom-scheme redirect, no client secret).
    google: { id: () => CFG.googleNativeClientId, auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/drive.appdata', extra: { access_type: 'offline', prompt: 'consent' } },
    onedrive: { id: () => CFG.msClientId, auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: 'Files.ReadWrite.AppFolder offline_access', extra: { response_mode: 'query' } },
  };
  async function tokenCall(p, body) {
    const r = await fetch(PKCE[p].token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: PKCE[p].id(), ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || 'Sign-in with ' + p + ' failed');
    c.tokens[p] = { access: j.access_token, refresh: j.refresh_token || (c.tokens[p] && c.tokens[p].refresh), exp: Date.now() + (j.expires_in || 3600) * 1000 };
    persist();
  }
  async function connectPkce(p) {
    const verifier = rnd(64), state = 'll-' + p + '-' + rnd(12), redirect = REDIRECT(p);
    localStorage.setItem('ll.pkce', JSON.stringify({ verifier, state, redirect }));   // survives the app being backgrounded
    const u = new URLSearchParams({ client_id: PKCE[p].id(), response_type: 'code', redirect_uri: redirect, state, code_challenge: await challenge(verifier), code_challenge_method: 'S256', ...PKCE[p].extra });
    if (PKCE[p].scope) u.set('scope', PKCE[p].scope);
    const url = PKCE[p].auth + '?' + u;
    if (Native.is) await Native.openUrl(url); else location.href = url;
  }
  /** Finishes an OAuth redirect given its query params. Returns a message to show the user, or null if not ours. */
  async function finishOAuth(q) {
    const state = q.get('state') || '', m = /^ll-(dropbox|onedrive|google)-/.exec(state);
    if (!m) return null;
    let saved; try { saved = JSON.parse(localStorage.getItem('ll.pkce')); } catch (e) {}
    localStorage.removeItem('ll.pkce');
    if (!saved || saved.state !== state) return 'Cloud sign-in was cancelled or expired. Please try again.';
    if (q.get('error')) return 'Cloud sign-in was cancelled.';
    try { await tokenCall(m[1], { grant_type: 'authorization_code', code: q.get('code'), redirect_uri: saved.redirect, code_verifier: saved.verifier }); return 'Connected to ' + label(m[1]); }
    catch (e) { return e.message; }
  }
  /** Browser: call on page load. */
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    if (!/^ll-/.test(q.get('state') || '')) return null;
    history.replaceState(null, '', REDIRECT());
    return finishOAuth(q);
  }
  /** Phone app: call with the URL the OS opened us with. Returns a message, or null if it is not an OAuth return. */
  async function handleOAuthUrl(url) {
    let q; try { q = new URL(url).searchParams; } catch (e) { return null; }
    const msg = await finishOAuth(q);
    if (msg) Native.closeBrowser();
    return msg;
  }
  async function pkceToken(p) {
    const t = c.tokens[p];
    if (!t) throw new Error('Not connected');
    if (t.exp - Date.now() < 60000) {
      if (!t.refresh) throw new Error('Session expired – reconnect ' + label(p));
      await tokenCall(p, { grant_type: 'refresh_token', refresh_token: t.refresh });
    }
    return c.tokens[p].access;
  }

  // ---- Google Drive (Google Identity Services token flow, hidden appDataFolder) ---------------
  let gisLoad = null;
  const loadGis = () => gisLoad || (gisLoad = new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.onload = ok; s.onerror = () => { gisLoad = null; no(new Error('Could not reach Google (are you online?)')); }; document.head.appendChild(s);
  }));
  async function googleToken(interactive) {
    const t = c.tokens.google;
    if (t && t.exp - Date.now() > 60000) return t.access;
    await loadGis();
    return new Promise((ok, no) => {
      google.accounts.oauth2.initTokenClient({
        client_id: CFG.googleClientId, scope: 'https://www.googleapis.com/auth/drive.appdata',
        callback: r => { if (r.error) return no(new Error('Google sign-in failed: ' + r.error)); c.tokens.google = { access: r.access_token, exp: Date.now() + r.expires_in * 1000 }; persist(); ok(r.access_token); },
        error_callback: e => no(new Error('Google sign-in was cancelled')),
      }).requestAccessToken({ prompt: interactive ? '' : 'none' });
    });
  }

  // ---- provider operations ----------------------------------------------------------------------
  const NAMES = { dropbox: 'Dropbox', onedrive: 'OneDrive', google: 'Google Drive' };
  // Google uses the OAuth browser flow on the phone, and the Google Identity Services popup on the web.
  const gtoken = interactive => Native.is ? pkceToken('google') : googleToken(interactive);
  const label = p => NAMES[p] || p;
  const available = () => ({ dropbox: !!CFG.dropboxKey, onedrive: !!CFG.msClientId, google: Native.is ? !!CFG.googleNativeClientId : !!CFG.googleClientId });
  const connected = p => !!c.tokens[p];
  async function ok(r, what) { if (!r.ok) { const e = new Error(what + ' failed (' + r.status + ')'); e.status = r.status; throw e; } return r; }

  const ops = {
    dropbox: {
      async put(text) { const t = await pkceToken('dropbox'); await ok(await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Dropbox-API-Arg': JSON.stringify({ path: '/' + FILE, mode: 'overwrite', mute: true }), 'Content-Type': 'application/octet-stream' }, body: text }), 'Dropbox upload'); },
      async get() { const t = await pkceToken('dropbox'); const r = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Dropbox-API-Arg': JSON.stringify({ path: '/' + FILE }) } }); if (r.status === 409) throw new Error('No backup found in Dropbox yet'); return (await ok(r, 'Dropbox download')).text(); },
    },
    onedrive: {
      async put(text) { const t = await pkceToken('onedrive'); await ok(await fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${FILE}:/content`, { method: 'PUT', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/octet-stream' }, body: text }), 'OneDrive upload'); },
      async get() { const t = await pkceToken('onedrive'); const r = await fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${FILE}:/content`, { headers: { Authorization: 'Bearer ' + t } }); if (r.status === 404) throw new Error('No backup found in OneDrive yet'); return (await ok(r, 'OneDrive download')).text(); },
    },
    google: {
      async find(t) { const r = await ok(await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${FILE}'`)}&fields=files(id)`, { headers: { Authorization: 'Bearer ' + t } }), 'Google Drive lookup'); return ((await r.json()).files || [])[0]; },
      async put(text, interactive) {
        const t = await gtoken(interactive), f = await this.find(t);
        if (f) return void await ok(await fetch(`https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: text }), 'Google Drive upload');
        const bd = 'llb' + rnd(10);
        const body = `--${bd}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: FILE, parents: ['appDataFolder'] })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${bd}--`;
        await ok(await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'multipart/related; boundary=' + bd }, body }), 'Google Drive upload');
      },
      async get(interactive) { const t = await gtoken(interactive), f = await this.find(t); if (!f) throw new Error('No backup found in Google Drive yet'); return (await ok(await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { headers: { Authorization: 'Bearer ' + t } }), 'Google Drive download')).text(); },
    },
  };

  const needPass = () => { if (!c.pass || c.pass.length < 6) throw new Error('Set a backup passphrase (6+ characters) first'); };
  const payload = () => JSON.stringify({ app: 'littlelog', v: 1, baby: db.baby, events: db.events });

  return {
    available, connected, label, NAMES, handleRedirect, handleOAuthUrl, encrypt, decrypt,
    get pass() { return c.pass; }, set pass(v) { c.pass = v; persist(); },
    get auto() { return c.auto; }, set auto(v) { c.auto = !!v; persist(); },
    last: p => c.last[p] || 0,
    connect(p) { return p === 'google' && !Native.is ? googleToken(true).then(() => 'Connected to Google Drive') : connectPkce(p); },
    /** Forget all connections and the passphrase (used when the account is deleted). */
    reset() { c = { tokens: {}, pass: '', auto: false, last: {} }; persist(); },
    disconnect(p) { delete c.tokens[p]; persist(); },
    async backup(p, interactive = true) { needPass(); await ops[p].put(await encrypt(payload(), c.pass), interactive); c.last[p] = Date.now(); persist(); },
    /** Returns the decoded backup object; the caller merges it into the local log. */
    async restore(p) { needPass(); return JSON.parse(await decrypt(await ops[p].get(true), c.pass)); },
    /** Encrypted backup as a file the user can save to Files / iCloud Drive (or anywhere). */
    async toFile() { needPass(); return new File([await encrypt(payload(), c.pass)], FILE, { type: 'application/json' }); },
    async fromFile(file) { needPass(); return JSON.parse(await decrypt(await file.text(), c.pass)); },
    /** Daily silent backup to every connected provider that can refresh without a prompt. */
    async autoBackup() {
      if (!c.auto || !c.pass) return;
      for (const p of ['dropbox', 'onedrive', ...(Native.is ? ['google'] : [])]) {
        if (connected(p) && Date.now() - (c.last[p] || 0) > 22 * 3600e3) { try { await this.backup(p, false); } catch (e) {} }
      }
    },
  };
})();
