// Supabase Edge Function: language-report. See handler.mjs for what it does, and README.md ("Language reports") for setting it up.
//   supabase functions deploy language-report
//   supabase secrets set REPORT_TO=<where reports go> REPORT_FROM="Little Log <reports@your-domain>" RESEND_API_KEY=<key> REPORT_SALT=<random>
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Emails are sent with Resend (https://resend.com).
import { handle, senderKey } from './handler.mjs';

const env = { to: Deno.env.get('REPORT_TO') ?? '', from: Deno.env.get('REPORT_FROM') ?? '' };
const SB = Deno.env.get('SUPABASE_URL') ?? '', SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND = Deno.env.get('RESEND_API_KEY') ?? '', SALT = Deno.env.get('REPORT_SALT') ?? '';   // (its own secret: never the service-role key)

Deno.serve(req => handle(req, env, {
  who: (r: Request) => { if (!SALT) throw new Error('REPORT_SALT is not set'); return senderKey(r, SALT); },   // (unset: the report is refused as unavailable, 503)
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
