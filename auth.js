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
    if (r.ok && junk) throw new TypeError('This network is not letting Little Log reach its server (is there a login page?)');
    if (!r.ok) {
      const err = new Error((j && (j.msg || j.message || j.error_description || j.error)) || 'Request failed (' + r.status + ')');
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
    if (!s) throw new Error('Not signed in');
    if (s.exp - Date.now() < 60000) await refresh();
    return s.access;
  }
  const authed = async (path, method = 'GET', body) => raw(path, { method, headers: hdr(await token()), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const claims = () => { try { return JSON.parse(atob(s.access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return {}; } };

  return {
    configured,
    async init() { try { const v = await Native.Secure.get(K); s = v ? JSON.parse(v) : null; } catch (e) { s = null; } },
    get signedIn() { return !!s; },
    get email() { return s && s.email; },
    get id() { return s && s.id; },
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
    rpc(name, args) { return this.api('/rpc/' + name, { method: 'POST', body: args || {} }); },
  };
})();
