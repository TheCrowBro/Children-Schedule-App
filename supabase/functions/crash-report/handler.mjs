// Crash reports from the app (More → App updates → Crash reports: off until a person turns it on), passed on by email.
//
// As with language reports, where the email goes is the REPORT_TO secret of this function, never in the app or in this repository,
// and nothing sent back mentions it. A report carries what the app noted when something went wrong: the error's words, where in the
// app's own code it happened, the app version, the kind of phone, the language and the hour. The app sends it with the project's
// public key only, never with a sign-in, so nothing here can tell whose phone it came from; a hash of the address the request came
// from is used only to limit how many reports one phone can make (the limits are shared with language reports: 5 an hour from one
// sender, 200 a day from everyone). Anything that looks like an email address or a web address is blanked, as the app already did.
//
// The same handler runs in the Edge Function (index.ts, Deno) and in the tests (Node); `deps` is as for language-report.
import { clean, reply, senderKey } from '../_shared/report.mjs';
export { senderKey };

export const LIMITS = { body: 64000, crashes: 20, msg: 300, where: 80, stack: 700 };
export const PLATFORMS = ['android', 'ios', 'web'];
const VERSION = /^[\w.-]{1,20}$/, LANG = /^([a-z]{2,3}(-[A-Za-z]{2,4})?)?$/, HOUR = /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/;
/** Anything in quotes, addresses and web addresses blanked (the app does this before sending; the server does it again). */
export const blank = s => s.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '"…"').replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[address]').replace(/\b(?:https?|capacitor|file|blob|data):[^\s)]*/gi, '[url]');
const safe = (v, max) => blank(clean(v, max * 2)).slice(0, max);

export async function handle(req, env, deps) {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  if (!env.to || !env.from) return reply(503, { error: 'not-configured' });

  let raw = '', b;
  try { raw = await req.text(); } catch (e) { return reply(400, { error: 'bad-request' }); }
  if (raw.length > LIMITS.body) return reply(413, { error: 'too-large' });
  try { b = JSON.parse(raw); } catch (e) { return reply(400, { error: 'bad-json' }); }
  if (!b || typeof b !== 'object' || !Array.isArray(b.crashes)) return reply(400, { error: 'bad-json' });
  const r = { v: clean(b.v, 20), platform: clean(b.platform, 16), lang: clean(b.lang, 16) };
  if (!VERSION.test(r.v) || !PLATFORMS.includes(r.platform) || !LANG.test(r.lang)) return reply(400, { error: 'invalid' });
  const crashes = b.crashes.slice(0, LIMITS.crashes).filter(c => c && typeof c === 'object')
    .map(c => ({ at: clean(c.at, 20), msg: safe(c.msg, LIMITS.msg).replace(/\n/g, ' '), where: safe(c.where, LIMITS.where).replace(/\n/g, ' '), stack: safe(c.stack, LIMITS.stack) }))
    .filter(c => c.msg && (!c.at || HOUR.test(c.at)));
  if (!crashes.length) return reply(400, { error: 'invalid' });

  let ok;
  try { ok = await deps.allow(await deps.who(req)); } catch (e) { return reply(503, { error: 'unavailable' }); }
  if (!ok) return reply(429, { error: 'too-many' });

  const subject = `Little Log crash report: ${r.v} (${r.platform}${crashes.length > 1 ? `, ${crashes.length} crashes` : ''})`;
  const text = [`Version: ${r.v}`, `Phone: ${r.platform}`, `Language: ${r.lang || 'unknown'}`, '',
    crashes.map((c, i) => [`#${i + 1}  ${c.at || 'hour unknown'}  ${c.where || 'place unknown'}`, c.msg, c.stack].filter(Boolean).join('\n')).join('\n\n'), '',
    '—', 'Sent from Little Log (More → App updates → Crash reports). Who sent it is not included, and the app sent it without a sign-in.'].join('\n');
  try { await deps.send({ to: env.to, from: env.from, subject, text }); } catch (e) { return reply(502, { error: 'send-failed' }); }
  return reply(200, { ok: true });
}
