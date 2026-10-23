'use strict';
/* Email sign-in via Supabase Auth (one-time code), plus an authenticated REST helper. */
const Auth = (() => {
  const CFG = window.LL_CONFIG || {};
  const K = 'littlelog.auth.v1';
  const configured = !!(CFG.supabaseUrl && CFG.supabaseKey);
  let s = null;
  try { s = JSON.parse(localStorage.getItem(K)); } catch (e) {}
  const persist = () => { try { s ? localStorage.setItem(K, JSON.stringify(s)) : localStorage.removeItem(K); } catch (e) {} };

  async function raw(path, opt = {}) {
    const r = await fetch(CFG.supabaseUrl.replace(/\/$/, '') + path, opt);
    const txt = await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { message: txt }; }
    if (!r.ok) {
      const err = new Error((j && (j.msg || j.message || j.error_description || j.error)) || 'Request failed (' + r.status + ')');
      err.status = r.status; throw err;
    }
    return j;
  }
  const json = (body, tok) => ({
    method: 'POST', body: JSON.stringify(body),
    headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (tok || CFG.supabaseKey) },
  });
  function adopt(j) {
    s = { access: j.access_token, refresh: j.refresh_token, exp: j.expires_at ? j.expires_at * 1000 : Date.now() + j.expires_in * 1000, email: j.user.email, id: j.user.id };
    persist();
  }

  let refreshing = null;
  function refresh() {
    if (!refreshing) refreshing = raw('/auth/v1/token?grant_type=refresh_token', json({ refresh_token: s.refresh }))
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

  return {
    configured,
    get signedIn() { return !!s; },
    get email() { return s && s.email; },
    get id() { return s && s.id; },
    async sendCode(email) { await raw('/auth/v1/otp', json({ email, create_user: true })); },
    async verify(email, code) { adopt(await raw('/auth/v1/verify', json({ type: 'email', email, token: code }))); },
    async signOut() {
      try { if (s) await raw('/auth/v1/logout', json({}, s.access)); } catch (e) {}
      s = null; persist();
    },
    /** PostgREST call: api('/events?...', {method, body, headers}) */
    async api(path, opt = {}) {
      const tok = await token();
      const o = { method: opt.method || 'GET', headers: { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', ...(opt.headers || {}) } };
      if (opt.body !== undefined) o.body = JSON.stringify(opt.body);
      return raw('/rest/v1' + path, o);
    },
    rpc(name, args) { return this.api('/rpc/' + name, { method: 'POST', body: args || {} }); },
  };
})();
