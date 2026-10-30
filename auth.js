'use strict';
/* Email sign-in (one-time code) + two-step verification (TOTP) via Supabase Auth, and an authenticated REST helper.
   The session lives in the iOS Keychain / Android Keystore, never in web storage. Call Auth.init() before use. */
const Auth = (() => {
  const CFG = window.LL_CONFIG || {};
  const K = 'auth.v2';
  const configured = !!(CFG.supabaseUrl && CFG.supabaseKey);
  let s = null;
  const persist = () => (s ? Native.Secure.set(K, JSON.stringify(s)) : Native.Secure.remove(K)).catch(() => {});

  async function raw(path, opt = {}) {
    const r = await Native.fetch(CFG.supabaseUrl.replace(/\/$/, '') + path, opt);
    const txt = await r.text();
    let j = null, junk = false; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { message: txt }; junk = true; }
    // A reply that is not JSON although the request "succeeded" is a captive portal / proxy login page, not our server: treat it as no connection
    // (never as an answer, or the app could mistake it for "you were removed").
    if (r.ok && junk) throw new TypeError(N_('This network is not letting Little Log reach its server (is there a login page?)'));
    if (!r.ok) {
      const err = new Error((j && (j.msg || j.message || j.error_description || j.error)) || __('Request failed ({status})', { status: r.status }));
      err.status = r.status; throw err;
    }
    return j;
  }
  const hdr = tok => ({ apikey: CFG.supabaseKey, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (tok || CFG.supabaseKey) });
  const post = (body, tok) => ({ method: 'POST', body: JSON.stringify(body), headers: hdr(tok) });

  function adopt(j) {
    const u = j.user || {};
    s = { access: j.access_token, refresh: j.refresh_token, exp: j.expires_at ? j.expires_at * 1000 : Date.now() + j.expires_in * 1000, email: u.email || (s && s.email), id: u.id || (s && s.id) };
    return persist();
  }
  let refreshing = null;
  function refresh() {
    if (!refreshing) refreshing = raw('/auth/v1/token?grant_type=refresh_token', post({ refresh_token: s.refresh }))
      .then(adopt)
      .catch(e => { if (e.status === 400 || e.status === 401 || e.status === 403) { s = null; persist(); } throw e; })   // offline errors keep the session
      .finally(() => { refreshing = null; });
    return refreshing;
  }
  async function token() {
    if (!s) throw new Error(N_('Not signed in'));
    if (s.exp - Date.now() < 60000) await refresh();
    return s.access;
  }
  const authed = async (path, method = 'GET', body) => raw(path, { method, headers: hdr(await token()), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const claims = () => { try { return JSON.parse(atob(s.access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return {}; } };
  // the storage bucket (pictures and videos, encrypted on the phone): raw bytes, with the session's token
  const fail = (status, txt) => { let m = ''; try { const j = JSON.parse(txt); m = j.message || j.error || ''; } catch (e) { /* not JSON */ } const err = new Error(m || __('Request failed ({status})', { status })); err.status = status; return err; };
  const gone = (status, txt) => status === 404 || (status === 400 && /not.?found|"404"/i.test(txt));
  const bytesHdr = async more => ({ apikey: CFG.supabaseKey, Authorization: 'Bearer ' + await token(), ...more });

  return {
    configured,
    async init() { try { const v = await Native.Secure.get(K); s = v ? JSON.parse(v) : null; } catch (e) { s = null; } },
    /** Signed in to the family server, or in a family folder (folder.js). */
    get signedIn() { return !!s || (typeof Folder !== 'undefined' && Folder.on); },
    /** A session with the family server (signedIn is also true in a family folder). */
    get hasSession() { return !!s; },
    /** The session's access token (refreshed when it is about to run out), for calls outside this module. */
    accessToken: token,
    get email() { return s ? s.email : (typeof Folder !== 'undefined' && Folder.attached ? Folder.me.email : null); },
    get id() { return s ? s.id : (typeof Folder !== 'undefined' && Folder.attached ? Folder.me.id : null); },
    /** 'aal2' once two-step verification has been completed in this session. */
    get aal() { return s ? (claims().aal || 'aal1') : null; },

    async sendCode(email, captchaToken) {
      await raw('/auth/v1/otp', post({ email, create_user: true, ...(captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {}) }));
    },
    async verify(email, code) { await adopt(await raw('/auth/v1/verify', post({ type: 'email', email, token: code }))); },
    /** global=true also ends the session on every other device. */
    async signOut(global) {
      try { if (s) await raw('/auth/v1/logout?scope=' + (global ? 'global' : 'local'), post({}, s.access)); } catch (e) { if (global) throw e; }
      s = null; await persist();
    },

    // ---- two-step verification (TOTP authenticator app) ----
    async factors() { const u = await authed('/auth/v1/user'); return (u.factors || []).filter(f => f.factor_type === 'totp'); },
    /** Starts enrolment: returns {id, uri, secret}. Abandoned, unverified factors are cleaned up first. */
    async mfaEnroll() {
      for (const f of await this.factors()) if (f.status !== 'verified') await authed('/auth/v1/factors/' + f.id, 'DELETE').catch(() => {});
      const j = await authed('/auth/v1/factors', 'POST', { factor_type: 'totp', issuer: 'Little Log', friendly_name: 'Little Log ' + new Date().toISOString().slice(0, 10) });
      return { id: j.id, uri: j.totp.uri, secret: j.totp.secret };
    },
    /** Completes enrolment or an aal1→aal2 step-up; the session becomes aal2. */
    async mfaVerify(factorId, code) {
      const ch = await authed(`/auth/v1/factors/${factorId}/challenge`, 'POST', {});
      await adopt(await authed(`/auth/v1/factors/${factorId}/verify`, 'POST', { challenge_id: ch.id, code }));
    },
    mfaRemove: id => authed('/auth/v1/factors/' + id, 'DELETE'),

    /** Puts a file in the storage bucket (a file already there is left as it is). */
    async upload(path, bytes) {
      const r = await Native.fetch(CFG.supabaseUrl.replace(/\/$/, '') + path, { method: 'POST', body: bytes, headers: await bytesHdr({ 'Content-Type': 'application/octet-stream' }) }, 180000);
      if (r.ok) return; const txt = await r.text();
      if (r.status === 409 || (r.status === 400 && /already exists/i.test(txt))) return;
      throw fail(r.status, txt);
    },
    /** A file from the storage bucket as a Uint8Array, or null when there is no such file. */
    async download(path) {
      const r = await Native.fetch(CFG.supabaseUrl.replace(/\/$/, '') + path, { headers: await bytesHdr() }, 180000);
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
      const txt = await r.text(); if (gone(r.status, txt)) return null; throw fail(r.status, txt);
    },
    /** Deletes a file from the storage bucket (one that is already gone counts as deleted). */
    async remove(path) {
      const r = await Native.fetch(CFG.supabaseUrl.replace(/\/$/, '') + path, { method: 'DELETE', headers: await bytesHdr() });
      if (r.ok) return; const txt = await r.text(); if (gone(r.status, txt)) return; throw fail(r.status, txt);
    },
    /** PostgREST call: api('/events?...', {method, body, headers}) */
    async api(path, opt = {}) {
      const call = async tok => {
        const o = { method: opt.method || 'GET', headers: { ...hdr(tok), ...(opt.headers || {}) } };
        if (opt.body !== undefined) o.body = JSON.stringify(opt.body);
        return raw('/rest/v1' + path, o);
      };
      try { return await call(await token()); }
      catch (e) {
        // The server says our token has expired although our clock disagrees (a phone with a slow clock never refreshes in time): refresh once and retry.
        if (e.status !== 401 || !s) throw e;
        await refresh(); return call(s.access);
      }
    },
    /** A database function. A project that runs an older schema.sql than this app was built for lacks the newer ones, and PostgREST
        answers "Could not find the function public.x(…) in the schema cache": that becomes plain words about supabase/upgrade.sql,
        the error is marked (e.behind) and onBehind is told, so the app can show the notice (Sync.checkServer). */
    async rpc(name, args) {
      try { return await this.api('/rpc/' + name, { method: 'POST', body: args || {} }); }
      catch (e) {
        if (e.status === 404 && /schema cache/i.test(e.message || '')) {
          e.behind = true; e.message = __('The cloud project is missing {fn}: whoever set it up needs to run {file} in its SQL editor (SETUP.md, Upgrading an existing project).', { fn: name, file: 'supabase/upgrade.sql' });
          if (this.onBehind) this.onBehind(name);
        }
        throw e;
      }
    },
    onBehind: null,
  };
})();
