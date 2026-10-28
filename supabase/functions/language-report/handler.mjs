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
import { clean, reply, senderKey } from '../_shared/report.mjs';
export { senderKey };

export const LIMITS = { says: 500, should: 500, body: 8000 };
export const SCREENS = ['day', 'routine', 'month', 'stats', 'guide', 'family', 'more', 'signin', 'other'];
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;   // es, fil, zh-Hans …

export async function handle(req, env, deps) {
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
