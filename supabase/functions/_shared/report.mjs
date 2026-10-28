// Shared by the Edge Functions that pass reports on by email (language-report, crash-report): the CORS headers for the app, a cleaner
// for plain text, the reply helper and the hashed key the limits count by. Each function that imports it is deployed with it.

export const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };

/** Plain text: no control characters (except line breaks), trimmed, at most `max` characters. */
// eslint-disable-next-line no-control-regex
export const clean = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').trim().slice(0, max) : '');

/** A JSON reply with the CORS headers (`null` for an empty one). */
export const reply = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...CORS, ...(body === null ? {} : { 'content-type': 'application/json' }) } });

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
