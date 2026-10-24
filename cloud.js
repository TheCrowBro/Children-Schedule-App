'use strict';
/* Encrypted backups to the user's own cloud storage (phone app only).
   The backup file is encrypted on the phone (AES-GCM, key from a passphrase via PBKDF2) so the storage provider only
   sees ciphertext. Dropbox, OneDrive and Google Drive sign in through the system browser (OAuth code + PKCE) and return
   to the app via its URL scheme. iCloud has no web API, so it goes through the share sheet ("Save to Files").
   Tokens and the passphrase are kept in the Keychain / Keystore. Call Cloud.init() before use. */
const Cloud = (() => {
  const CFG = window.LL_CONFIG || {};
  const K = 'cloud.v2', PKCE_K = 'pkce.v1';
  const FILE = 'little-log-backup.json';
  const KDF_ITER = 600000, KDF_ITER_V1 = 250000, MIN_PASS = 12;
  let c = { tokens: {}, pass: '', auto: false, last: {} };
  const persist = () => Native.Secure.set(K, JSON.stringify(c)).catch(() => {});

  // ---- crypto ----------------------------------------------------------------------------------
  const b64 = u8 => btoa(String.fromCharCode(...u8));
  const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  async function keyFrom(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(text, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pass, salt, KDF_ITER), new TextEncoder().encode(text)));
    return JSON.stringify({ app: 'littlelog', v: 2, iter: KDF_ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
  }
  async function decrypt(file, pass) {
    let o; try { o = JSON.parse(file); } catch (e) { throw new Error('That is not a Little Log backup'); }
    if (o.app !== 'littlelog' || !o.ct) throw new Error('That is not a Little Log backup');
    const iter = Math.min(+o.iter || KDF_ITER_V1, 5000000);   // v1 files had no `iter` field
    try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, await keyFrom(pass, unb64(o.salt), iter), unb64(o.ct))); }
    catch (e) { throw new Error('Wrong passphrase, or the file is damaged'); }
  }
  /** A random passphrase (~120 bits) in groups of four, e.g. K7QM-2XWD-… (unambiguous characters). */
  function generatePass() {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(24));
    return Array.from(r, (x, i) => A[x % A.length] + (i % 4 === 3 && i < 23 ? '-' : '')).join('');
  }

  // ---- OAuth (PKCE) through the system browser --------------------------------------------------
  const rnd = n => b64(crypto.getRandomValues(new Uint8Array(n))).replace(/[+/=]/g, '').slice(0, n);
  async function challenge(v) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
  // Google needs an OAuth client of type "iOS": it allows a custom-scheme redirect and needs no client secret.
  const googleScheme = () => 'com.googleusercontent.apps.' + (CFG.googleClientId || '').replace('.apps.googleusercontent.com', '');
  const redirect = p => p === 'google' ? googleScheme() + ':/oauth2redirect' : Native.scheme + '://oauth';
  const PKCE = {
    dropbox: { id: () => CFG.dropboxKey, auth: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token', extra: { token_access_type: 'offline' } },
    onedrive: { id: () => CFG.msClientId, auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: 'Files.ReadWrite.AppFolder offline_access', extra: { response_mode: 'query' } },
    google: { id: () => CFG.googleClientId, auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/drive.appdata', extra: { access_type: 'offline', prompt: 'consent' } },
  };
  async function tokenCall(p, body) {
    const r = await Native.fetch(PKCE[p].token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: PKCE[p].id(), ...body }).toString() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || 'Sign-in with ' + label(p) + ' failed');
    c.tokens[p] = { access: j.access_token, refresh: j.refresh_token || (c.tokens[p] && c.tokens[p].refresh), exp: Date.now() + (j.expires_in || 3600) * 1000 };
    await persist();
  }
  async function connect(p) {
    const verifier = rnd(64), state = 'll-' + p + '-' + rnd(12), redir = redirect(p);
    await Native.Secure.set(PKCE_K, JSON.stringify({ verifier, state, redirect: redir }));
    const u = new URLSearchParams({ client_id: PKCE[p].id(), response_type: 'code', redirect_uri: redir, state, code_challenge: await challenge(verifier), code_challenge_method: 'S256', ...PKCE[p].extra });
    if (PKCE[p].scope) u.set('scope', PKCE[p].scope);
    await Native.openUrl(PKCE[p].auth + '?' + u);
  }
  /** Call with the URL the OS opened the app with. Returns a message to show, or null if it is not a cloud sign-in return. */
  async function handleOAuthUrl(url) {
    let q; try { q = new URL(url).searchParams; } catch (e) { return null; }
    const state = q.get('state') || '', m = /^ll-(dropbox|onedrive|google)-/.exec(state);
    if (!m) return null;
    let saved; try { saved = JSON.parse(await Native.Secure.get(PKCE_K)); } catch (e) {}
    await Native.Secure.remove(PKCE_K);
    Native.closeBrowser();
    if (!saved || saved.state !== state) return 'Cloud sign-in was cancelled or expired. Please try again.';
    if (q.get('error')) return 'Cloud sign-in was cancelled.';
    try { await tokenCall(m[1], { grant_type: 'authorization_code', code: q.get('code'), redirect_uri: saved.redirect, code_verifier: saved.verifier }); return 'Connected to ' + label(m[1]); }
    catch (e) { return e.message; }
  }
  async function token(p) {
    const t = c.tokens[p];
    if (!t) throw new Error('Not connected');
    if (t.exp - Date.now() < 60000) {
      if (!t.refresh) throw new Error('Session expired – reconnect ' + label(p));
      await tokenCall(p, { grant_type: 'refresh_token', refresh_token: t.refresh });
    }
    return c.tokens[p].access;
  }

  // ---- provider operations ----------------------------------------------------------------------
  const NAMES = { dropbox: 'Dropbox', onedrive: 'OneDrive', google: 'Google Drive' };
  const label = p => NAMES[p] || p;
  const available = () => ({ dropbox: !!CFG.dropboxKey, onedrive: !!CFG.msClientId, google: !!CFG.googleClientId });
  const connected = p => !!c.tokens[p];
  async function ok(r, what) { if (!r.ok) { const e = new Error(what + ' failed (' + r.status + ')'); e.status = r.status; throw e; } return r; }

  const ops = {
    dropbox: {
      async put(text) { const t = await token('dropbox'); await ok(await Native.fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Dropbox-API-Arg': JSON.stringify({ path: '/' + FILE, mode: 'overwrite', mute: true }), 'Content-Type': 'application/octet-stream' }, body: text }), 'Dropbox upload'); },
      async get() { const t = await token('dropbox'); const r = await Native.fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Dropbox-API-Arg': JSON.stringify({ path: '/' + FILE }) } }); if (r.status === 409) throw new Error('No backup found in Dropbox yet'); return (await ok(r, 'Dropbox download')).text(); },
    },
    onedrive: {
      async put(text) { const t = await token('onedrive'); await ok(await Native.fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${FILE}:/content`, { method: 'PUT', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/octet-stream' }, body: text }), 'OneDrive upload'); },
      async get() { const t = await token('onedrive'); const r = await Native.fetch(`https://graph.microsoft.com/v1.0/me/drive/special/approot:/${FILE}:/content`, { headers: { Authorization: 'Bearer ' + t } }); if (r.status === 404) throw new Error('No backup found in OneDrive yet'); return (await ok(r, 'OneDrive download')).text(); },
    },
    google: {
      async find(t) { const r = await ok(await Native.fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${FILE}'`)}&fields=files(id)`, { headers: { Authorization: 'Bearer ' + t } }), 'Google Drive lookup'); return ((await r.json()).files || [])[0]; },
      async put(text) {
        const t = await token('google'), f = await this.find(t);
        if (f) return void await ok(await Native.fetch(`https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: text }), 'Google Drive upload');
        const bd = 'llb' + rnd(10);
        const body = `--${bd}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: FILE, parents: ['appDataFolder'] })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${bd}--`;
        await ok(await Native.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'multipart/related; boundary=' + bd }, body }), 'Google Drive upload');
      },
      async get() { const t = await token('google'), f = await this.find(t); if (!f) throw new Error('No backup found in Google Drive yet'); return (await ok(await Native.fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { headers: { Authorization: 'Bearer ' + t } }), 'Google Drive download')).text(); },
    },
  };

  const needPass = () => { if (!c.pass || c.pass.length < MIN_PASS) throw new Error(`Set a backup passphrase (${MIN_PASS}+ characters) first`); };
  const payload = () => JSON.stringify({ app: 'littlelog', v: 1, baby: db.baby, events: db.events });

  return {
    MIN_PASS, available, connected, label, NAMES, handleOAuthUrl, encrypt, decrypt, generatePass, connect,
    async init() { try { const v = await Native.Secure.get(K); if (v) c = { tokens: {}, pass: '', auto: false, last: {}, ...JSON.parse(v) }; } catch (e) {} },
    get pass() { return c.pass; },
    /** Returns an error message if the passphrase is too weak, else null; saves it when valid. */
    setPass(v) { if (v && v.length < MIN_PASS) return `Use at least ${MIN_PASS} characters`; c.pass = v; persist(); return null; },
    get auto() { return c.auto; }, set auto(v) { c.auto = !!v; persist(); },
    last: p => c.last[p] || 0,
    /** Forget all connections and the passphrase (account deleted / signed out). */
    reset() { c = { tokens: {}, pass: '', auto: false, last: {} }; return Native.Secure.remove(K); },
    disconnect(p) { delete c.tokens[p]; persist(); },
    async backup(p) { needPass(); await ops[p].put(await encrypt(payload(), c.pass)); c.last[p] = Date.now(); persist(); },
    /** Returns the decoded backup object; the caller merges it into the local log. */
    async restore(p) { needPass(); return JSON.parse(await decrypt(await ops[p].get(), c.pass)); },
    /** Encrypted backup as a file the user can save to Files / iCloud Drive (or anywhere). */
    async toFile() { needPass(); return new File([await encrypt(payload(), c.pass)], FILE, { type: 'application/json' }); },
    async fromFile(file) { needPass(); if (file.size > 25e6) throw new Error('That file is too large to be a Little Log backup'); return JSON.parse(await decrypt(await file.text(), c.pass)); },
    /** Daily silent backup to every connected provider. */
    async autoBackup() {
      if (!c.auto || !c.pass) return;
      for (const p of ['dropbox', 'onedrive', 'google']) {
        if (connected(p) && Date.now() - (c.last[p] || 0) > 22 * 3600e3) { try { await this.backup(p); } catch (e) {} }
      }
    },
  };
})();
