// Reports of language problems, sent from the app (More → Language → Report a language issue) and passed on by email.
//
// Where the email goes is never in the app or in this repository: it is the REPORT_TO secret of this function, kept encrypted by
// Supabase (`supabase secrets set REPORT_TO=…`). Nothing this function sends back mentions it. A report carries only what the person
// typed, the language and the screen; who sent it is not passed on (a hash of the account, or of the address the request came from,
// is used only to limit how many reports one sender can make).
//
// The same handler runs in the Edge Function (index.ts, Deno) and in the tests (Node), so `deps` brings everything from outside:
//   who(req)  → a key for the sender (already hashed)      allow(key) → true while the sender is under the limits
//   send({ to, from, subject, text })                        throws when the email could not be sent

export const LIMITS = { says: 500, should: 500, body: 8000 };
export const SCREENS = ['day', 'month', 'stats', 'guide', 'family', 'more', 'signin', 'other'];
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;   // es, fil, zh-Hans …
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };

/** Plain text: no control characters (except line breaks), trimmed, at most `max` characters. */
// eslint-disable-next-line no-control-regex
const clean = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').trim().slice(0, max) : '');

export async function handle(req, env, deps) {
  const reply = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...CORS, ...(body === null ? {} : { 'content-type': 'application/json' }) } });
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  if (!env.to || !env.from) return reply(503, { error: 'not-configured' });

  let raw = '', b;
  try { raw = await req.text(); } catch (e) { return reply(400, { error: 'bad-request' }); }
  if (raw.length > LIMITS.body) return reply(413, { error: 'too-large' });
  try { b = JSON.parse(raw); } catch (e) { return reply(400, { error: 'bad-json' }); }
  if (!b || typeof b !== 'object') return reply(400, { error: 'bad-json' });
  const r = { lang: clean(b.lang, 16), screen: clean(b.screen, 16), says: clean(b.says, LIMITS.says), should: clean(b.should, LIMITS.should), platform: clean(b.platform, 16) };
  if (!LANG.test(r.lang) || !SCREENS.includes(r.screen) || !r.says) return reply(400, { error: 'invalid' });

  let ok;
  try { ok = await deps.allow(await deps.who(req)); } catch (e) { return reply(503, { error: 'unavailable' }); }
  if (!ok) return reply(429, { error: 'too-many' });

  const subject = `Little Log language report: ${r.lang} (${r.screen})`;
  const text = [`Language: ${r.lang}`, `Screen: ${r.screen}`, `Phone: ${r.platform || 'unknown'}`, '', 'It says:', r.says, '', 'It should say:', r.should || '(not given)', '',
    '—', 'Sent from Little Log (More → Language → Report a language issue). Who sent it is not included.'].join('\n');
  try { await deps.send({ to: env.to, from: env.from, subject, text }); } catch (e) { return reply(502, { error: 'send-failed' }); }
  return reply(200, { ok: true });
}

/** A key for limiting how often someone can report: the account when signed in (from the session the gateway has already checked),
    else the address the request came from; always hashed with a secret salt, so no account id or address is kept. */
export async function senderKey(req, salt) {
  let who = '';
  try {
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), part = tok.split('.')[1];
    const claims = part ? JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) : {};
    if (claims.role === 'authenticated' && claims.sub) who = 'u:' + claims.sub;
  } catch (e) { /* no session */ }
  if (!who) who = 'ip:' + ((req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + who));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
