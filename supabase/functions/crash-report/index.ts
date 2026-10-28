// Supabase Edge Function: crash-report. See handler.mjs for what it does, and SETUP.md §6 for setting it up: it uses the same secrets
// as language-report, so once those are set this is just
//   supabase functions deploy crash-report
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Emails are sent with Resend (https://resend.com).
import { handle, senderKey } from './handler.mjs';

const env = { to: Deno.env.get('REPORT_TO') ?? '', from: Deno.env.get('REPORT_FROM') ?? '' };
const SB = Deno.env.get('SUPABASE_URL') ?? '', SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND = Deno.env.get('RESEND_API_KEY') ?? '', SALT = Deno.env.get('REPORT_SALT') ?? '';   // (its own secret: never the service-role key)

Deno.serve(req => handle(req, env, {
  who: (r: Request) => { if (!SALT) throw new Error('REPORT_SALT is not set'); return senderKey(r, SALT + '/crash'); },   // (unset: the report is refused as unavailable, 503)
  // the limits live in the database (language_report_allow in schema.sql), which only this service role may call
  async allow(key: string) {
    const r = await fetch(`${SB}/rest/v1/rpc/language_report_allow`, {
      method: 'POST', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_key: key }),
    });
    if (!r.ok) throw new Error('limit check failed: ' + r.status);
    return (await r.json()) === true;
  },
  async send(m: { to: string; from: string; subject: string; text: string }) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, text: m.text }),
    });
    if (!r.ok) throw new Error('email failed: ' + r.status);
  },
}));
