// Crash reports: off until turned on in More → App updates. While on, an error the app did not expect (an exception nothing caught,
// or a promise that failed with nobody listening) is noted on this phone and sent to the Little Log team through the crash-report
// Edge Function (supabase/functions/crash-report), which passes it on by email.
//
// What a report says: what went wrong and where in the app's own code (file, line and column, and the first few lines of the stack),
// the app version, the kind of phone (android, ios, web), the language and the hour. It never carries an entry, a name, an address,
// the account or anything typed: messages are cut short, and anything in them that looks like an email address or a web address is
// blanked before it leaves the phone (and again on the server), as is anything in quotes (a value a parser choked on). Reports go with the project's public key only, never with the sign-in,
// so the server cannot tell whose phone they came from. At most 20 are kept, the same crash only once, and nothing is kept while off.
const Crash = (() => {
  const KEY = 'll.crashes', ON = 'll.crashReports', MAX = 20, cfg = () => window.LL_CONFIG || {};
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* no storage */ } };
  const list = () => { try { const l = JSON.parse(get(KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
  const keep = l => put(KEY, l.length ? JSON.stringify(l.slice(-MAX)) : null);
  /** Text that may leave the phone: one line, no addresses, at most `max` characters. */
  const scrub = (s, max) => String(s == null ? '' : s).replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '"…"').replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[address]').replace(/\b(?:https?|capacitor|file|blob|data):[^\s)]*/gi, '[url]').replace(/\s+/g, ' ').trim().slice(0, max);
  /** Where in the app's own code: app.js:123:45 (the file's name only, never a whole address). */
  const where = (file, line, col) => { const f = String(file || '').split(/[?#]/)[0].split('/').pop(); return f ? scrub(f + (line ? ':' + line + (col ? ':' + col : '') : ''), 80) : ''; };
  /** The first lines of a stack, each with the file's name in place of its address. */
  const frames = stack => String(stack || '').split('\n').map(l => l.trim()).filter(l => /^at\s|@/.test(l)).slice(0, 5)
    .map(l => scrub(l.replace(/\(?(?:(?:https?|capacitor|file):\/\/[^\s)]*\/)?([\w.-]+\.js):(\d+):(\d+)\)?/g, '$1:$2:$3'), 120)).join('\n');
  const on = () => get(ON) === '1';
  const can = () => !!cfg().supabaseUrl;
  const url = () => String(cfg().supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/crash-report';
  let timer = null, sending = false;
  const flushSoon = (ms = 3000) => { clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), ms); };
  /** Turns reports on or off; off also forgets what was noted. */
  const setOn = v => { put(ON, v ? '1' : null); if (v) flushSoon(); else keep([]); };
  /** Notes an error (only while reports are on). */
  function record(msg, file, line, col, stack) {
    if (!on() || !can()) return false;
    const m = scrub(msg, 300); if (!m) return false;
    const at = new Date(); at.setMinutes(0, 0, 0);
    const l = list(), c = { at: at.toISOString().slice(0, 16) + 'Z', msg: m, where: where(file, line, col), stack: frames(stack) };
    if (l.some(x => x.msg === c.msg && x.where === c.where)) return false;   // the same crash again: once is enough
    keep([...l, c]); flushSoon(); return true;
  }
  /** Sends what is waiting: 'sent', 'nothing', 'busy' (too many lately), 'off' or 'failed'. */
  async function flush() {
    if (!on() || !can()) return 'off';
    const l = list(); if (!l.length) return 'nothing';
    if (sending) return 'busy'; sending = true;
    try {
      const f = typeof Native !== 'undefined' && Native.fetch ? Native.fetch : fetch, key = cfg().supabaseKey || '';
      const body = { v: typeof appVersion === 'string' && appVersion ? appVersion : 'dev', platform: (typeof Native !== 'undefined' && Native.platform) || 'web', lang: typeof I18n !== 'undefined' ? I18n.lang() : '', crashes: l };
      const r = await f(url(), { method: 'POST', headers: { 'content-type': 'application/json', apikey: key, Authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
      if (r.ok || r.status === 400) keep([]);   // (what the server will never take is let go)
      return r.ok ? 'sent' : r.status === 429 ? 'busy' : 'failed';
    } catch (e) { return 'failed'; } finally { sending = false; }
  }
  window.addEventListener('error', e => { if (e && e.message) record(e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', e => { const r = e && e.reason; record(r && r.message ? r.message : String(r), '', 0, 0, r && r.stack); });
  if (on()) flushSoon(8000);   // what the last run left behind
  return { on, setOn, can, record, flush, flushSoon, list, clear: () => keep([]), scrub, MAX };
})();
