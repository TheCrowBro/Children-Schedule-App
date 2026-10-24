// A stand-in for Supabase's HTTP layer (GoTrue + PostgREST) that runs the REAL schema.sql on a real Postgres.
// Auth: email code, sessions with aal1/aal2, real TOTP (RFC 6238) enrolment + verification, global sign-out.
// REST: the handful of table reads + RPC calls the app uses, executed as role `authenticated` with the session's JWT claims.
const crypto = require('crypto');
const { Client, Pool } = require('pg');

const b64u = b => Buffer.from(b).toString('base64url');
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const base32 = buf => { let bits = '', out = ''; for (const x of buf) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; };
const unbase32 = s => { let bits = ''; for (const ch of s.replace(/=+$/, '')) bits += B32.indexOf(ch).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
function totp(secret, t = Date.now()) {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac('sha1', unbase32(secret)).update(c).digest(), o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

function createShim(superUrl, opts = {}) {
  const o = { code: '12345678', expiresIn: 3600, captcha: false, ...opts };
  const sessions = new Map();     // refresh token -> {sub,email,aal}
  const challenges = new Map();
  let su;   // pool of superuser connections, for the auth side and metadata lookups
  su = new Pool({ connectionString: superUrl, max: 4 });
  const ready = Promise.resolve();
  const jwt = c => `${b64u('{"alg":"HS256"}')}.${b64u(JSON.stringify(c))}.sig`;
  const parse = tok => { try { const c = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url')); return c.exp * 1000 > Date.now() ? c : null; } catch (e) { return null; } };
  const J = (status, body) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: body === undefined ? '' : JSON.stringify(body) });
  const session = (sub, email, aal, refresh) => {
    refresh = refresh || crypto.randomUUID(); sessions.set(refresh, { sub, email, aal });
    const exp = Math.floor(Date.now() / 1000) + o.expiresIn;
    return { access_token: jwt({ sub, email, aal, sid: refresh, role: 'authenticated', exp }), refresh_token: refresh, expires_in: o.expiresIn, expires_at: exp, token_type: 'bearer', user: { id: sub, email } };
  };

  async function auth(req, path, body) {
    const bearer = (req.headers()['authorization'] || '').replace('Bearer ', ''), claims = parse(bearer);
    const m = req.method();
    if (path === '/auth/v1/otp') {
      if (o.captcha && (!body.gotrue_meta_security || body.gotrue_meta_security.captcha_token !== 'captcha-ok')) return J(400, { msg: 'captcha verification process failed' });
      o.sent = (o.sent || 0) + 1; return J(200, {});
    }
    if (path === '/auth/v1/verify') {
      if (body.token !== o.code) return J(403, { msg: 'Token has expired or is invalid' });
      let r = await su.query('select id from auth.users where email=$1', [body.email]);
      if (!r.rows.length) r = await su.query('insert into auth.users(email) values ($1) returning id', [body.email]);
      return J(200, session(r.rows[0].id, body.email, 'aal1'));
    }
    if (path === '/auth/v1/token') {
      const s = sessions.get(body.refresh_token); if (!s) return J(400, { msg: 'Invalid Refresh Token: Refresh Token Not Found' });
      return J(200, session(s.sub, s.email, s.aal, body.refresh_token));
    }
    if (path === '/auth/v1/logout') {
      if (!claims) return J(401, { msg: 'invalid JWT' });
      const scope = new URL(req.url()).searchParams.get('scope');
      for (const [k, v] of sessions) if (v.sub === claims.sub && (scope === 'global' || k === claims.sid)) sessions.delete(k);
      return J(204);
    }
    if (!claims) return J(401, { msg: 'invalid JWT' });
    if (path === '/auth/v1/user') {
      const f = await su.query(`select id, factor_type, status, friendly_name from auth.mfa_factors where user_id=$1`, [claims.sub]);
      return J(200, { id: claims.sub, email: claims.email, factors: f.rows });
    }
    if (path === '/auth/v1/factors' && m === 'POST') {
      const secret = base32(crypto.randomBytes(20));
      const r = await su.query(`insert into auth.mfa_factors(user_id,friendly_name,secret) values ($1,$2,$3) returning id`, [claims.sub, body.friendly_name, secret]);
      return J(200, { id: r.rows[0].id, type: 'totp', totp: { qr_code: '', secret, uri: `otpauth://totp/Little%20Log:${encodeURIComponent(claims.email)}?secret=${secret}&issuer=Little%20Log` } });
    }
    let mm = /^\/auth\/v1\/factors\/([0-9a-f-]+)(\/challenge|\/verify)?$/.exec(path);
    if (mm) {
      const [, fid, act] = mm;
      const f = (await su.query('select * from auth.mfa_factors where id=$1 and user_id=$2', [fid, claims.sub])).rows[0];
      if (!f) return J(404, { msg: 'MFA factor not found' });
      if (!act && m === 'DELETE') {
        if (f.status === 'verified' && claims.aal !== 'aal2') return J(401, { msg: 'AAL2 required to unenroll a verified factor' });
        await su.query('delete from auth.mfa_factors where id=$1', [fid]); return J(200, { id: fid });
      }
      if (act === '/challenge') { const id = crypto.randomUUID(); challenges.set(id, fid); return J(200, { id, expires_at: Date.now() / 1000 + 300 }); }
      if (act === '/verify') {
        if (challenges.get(body.challenge_id) !== fid) return J(400, { msg: 'MFA challenge not found' });
        const ok = [-30000, 0, 30000].some(d => totp(f.secret, Date.now() + d) === body.code);
        if (!ok) return J(400, { msg: 'Invalid TOTP code entered' });
        await su.query(`update auth.mfa_factors set status='verified' where id=$1`, [fid]);
        return J(200, session(claims.sub, claims.email, 'aal2', claims.sid));
      }
    }
    return J(404, { msg: 'unhandled ' + m + ' ' + path });
  }

  // ---- PostgREST subset ----------------------------------------------------------------------
  async function asUser(claims, fn) {
    const c = new Client({ connectionString: superUrl }); await c.connect();
    try {
      await c.query('begin'); await c.query(`set local role ${claims ? 'authenticated' : 'anon'}`);
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ? { sub: claims.sub, email: claims.email, aal: claims.aal } : {})]);
      const r = await fn(c); await c.query('commit'); return r;
    } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { await c.end(); }
  }
  const pgErr = e => J(/permission denied/.test(e.message) ? 403 : 400, { message: e.message, code: e.code });
  async function rest(req, url, body) {
    const bearer = (req.headers()['authorization'] || '').replace('Bearer ', ''), claims = parse(bearer);
    if (!claims) return J(401, { message: 'JWT expired or invalid', code: 'PGRST301' });
    const path = url.pathname.replace('/rest/v1', ''), sp = url.searchParams;
    try {
      const rm = /^\/rpc\/(\w+)$/.exec(path);
      if (rm) {
        const meta = (await su.query(`select p.proretset, p.proargnames, (select array_agg(format_type(t,null)) from unnest(p.proargtypes) t) types
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [rm[1]])).rows[0];
        if (!meta) return J(404, { message: 'function not found' });
        const keys = Object.keys(body || {}), vals = [], args = keys.map((k, i) => {
          const t = meta.types[meta.proargnames.indexOf(k)]; const v = body[k];
          vals.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v); return `${k} => $${i + 1}::${t}`;
        });
        const call = `${rm[1]}(${args.join(', ')})`;
        const rows = await asUser(claims, c => c.query(meta.proretset ? `select to_jsonb(r) j from ${call} r` : `select ${call} j`, vals));
        const out = meta.proretset ? rows.rows.map(r => r.j) : rows.rows[0].j;
        return out === null || out === undefined ? J(204) : J(200, out);
      }
      const table = path.slice(1); if (!['members', 'babies', 'events'].includes(table)) return J(404, { message: 'no such table' });
      const where = [], vals = [];
      for (const [k, v] of sp) {
        if (['select', 'order', 'limit'].includes(k)) continue;
        const [, op, arg] = /^(eq|gt|in)\.(.*)$/.exec(v);
        if (op === 'in') { vals.push(arg.replace(/^\(|\)$/g, '').split(',')); where.push(`t.${k} = any($${vals.length})`); }
        else { vals.push(arg); where.push(`t.${k} ${op === 'eq' ? '=' : '>'} $${vals.length}`); }
      }
      const sel = sp.get('select') || '*', emb = /,\s*babies\(([^)]*)\)/.exec(sel);
      const cols = sel.replace(/,\s*babies\([^)]*\)/, '');
      let sql = `select ${cols === '*' ? 't.*' : cols.split(',').map(c => 't.' + c).join(',')}${emb ? `, (select to_jsonb(b2) from (select ${emb[1]} from babies where id = t.baby_id) b2) as babies` : ''} from ${table} t`;
      if (where.length) sql += ' where ' + where.join(' and ');
      const ord = sp.get('order'); if (ord) { const [c, d] = ord.split('.'); sql += ` order by t.${c} ${d === 'desc' ? 'desc' : 'asc'}`; }
      if (sp.get('limit')) sql += ` limit ${parseInt(sp.get('limit'), 10)}`;
      const r = await asUser(claims, c => c.query(sql, vals));
      const rows = r.rows.map(x => { for (const k of Object.keys(x)) if (x[k] instanceof Date) x[k] = x[k].toISOString().replace('Z', '+00:00'); return x; });
      return J(200, rows);
    } catch (e) { return pgErr(e); }
  }

  return {
    ready, o, sessions, totp,
    /** Install on a Playwright context for https://fake.supabase.co/** */
    async install(ctx, origin = 'https://fake.supabase.co') {
      await ready;
      await ctx.route(origin + '/**', async route => {
        const req = route.request(), url = new URL(req.url());
        if (o.down || ctx.__down) return route.abort('internetdisconnected');
        if (ctx.__hang) return new Promise(() => {});   // the connection stays open and nothing ever comes back
        if (ctx.__flaky && Math.random() < ctx.__flaky) return route.fulfill(J(500, { message: 'injected failure' }));
        if (ctx.__garbage && url.pathname.startsWith('/rest/v1')) return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<html>captive portal login</html>' });
        if (o.refreshFail && url.pathname === '/auth/v1/token') return route.fulfill(J(500, { message: 'auth service unavailable' }));
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        let body = null; try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch (e) {}
        try { route.fulfill(url.pathname.startsWith('/auth/') ? await auth(req, url.pathname, body) : await rest(req, url, body)); }
        catch (e) { route.fulfill(J(500, { message: String(e.stack || e) })); }
      });
    },
    async close() { await su.end(); },
  };
}
module.exports = { createShim, totp };
