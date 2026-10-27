'use strict';
/* Notifications on the phone. While a child is logged asleep, the phone asks whether they are still asleep ("Is Leo still asleep?",
   with Woke up and Still asleep right on the notification), so a sleep nobody closed does not run on for hours: after a while from
   the start, then again a few times. None in the quiet hours each parent sets on their own phone (the night): a check that falls in
   them is sent when they end, which also catches a sleep from the evening before. The checks are planned from the log on this phone
   and handed to the phone as local notifications; the settings stay on the phone. Once the routine knows how long a sleep at that
   time usually lasts, the first check comes an hour after the usual end instead (a nap that usually ends at 2:30 is asked about
   at 3:30), unless that is turned off. */
const Notify = (() => {
  const KEY = 'll.notify', MIN = 60000, TYPE = 'll-sleep';
  const DEF = { on: true, after: 120, every: 30, times: 3, quiet: ['19:00', '07:00'], routine: true };
  const clean = c => {
    const o = { ...DEF };
    if (c && typeof c === 'object') {
      if (typeof c.on === 'boolean') o.on = c.on;
      if (typeof c.routine === 'boolean') o.routine = c.routine;
      for (const k of ['after', 'every', 'times']) if (Number.isInteger(c[k]) && c[k] > 0 && c[k] <= 1440) o[k] = c[k];
      if (Array.isArray(c.quiet) && c.quiet.length === 2 && c.quiet.every(t => /^\d\d:\d\d$/.test(t))) o.quiet = [c.quiet[0], c.quiet[1]];
    }
    return o;
  };
  const read = () => { try { return clean(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return clean(null); } };
  let cfg = read(), last = '', busy = false, again = null;
  const listeners = [];
  const P = () => (window.LLPlugins || {}).LocalNotifications;
  const has = () => !!(Native.is && P());
  const mins = t => { const m = /^(\d\d):(\d\d)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  /** Whether `t` falls in the quiet hours (which may run over midnight; the same time twice means none). */
  function quietAt(t, q = cfg.quiet) {
    const a = mins(q[0]), b = mins(q[1]); if (a == null || b == null || a === b) return false;
    const d = new Date(t), m = d.getHours() * 60 + d.getMinutes();
    return a < b ? m >= a && m < b : m >= a || m < b;
  }
  /** The time itself, or the end of the quiet hours it falls in. */
  function allowed(t, q = cfg.quiet) {
    if (!quietAt(t, q)) return t;
    const d = new Date(t); d.setHours(0, mins(q[1]), 0, 0); let e = d.getTime(); if (e <= t) e += 24 * 60 * MIN; return e;
  }
  // a number the phone keeps for each check: from the entry's id and the check's number
  const idFor = (sid, i) => { let h = 7; for (const ch of String(sid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 100000 + (h % 100000) * 10 + i; };
  /** How long a sleep begun at this time of day usually lasts, from the child's routine (the sleep time within 45 minutes of it): the
      minutes, or null when the routine does not know (yet). */
  function usual(events, e, now = Date.now()) {
    const child = childOf(e), mine = events.filter(x => x.type !== 'plan' && !Travel.isTravel(x.type) && childOf(x) === child);
    const R = Routine.find(mine, now); if (!R.enough) return null;
    const d = new Date(e.ts), m = d.getHours() * 60 + d.getMinutes();
    const near = (a, b) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b)) <= Routine.WINDOW;
    const s = R.slots.find(x => x.type === 'sleep' && x.minutes > 0 && near(x.at, m));
    return s ? s.minutes : null;
  }
  /** The checks for the sleeps still open: { id, at, sleep, child, i, usual }, in time order. `after` minutes from the start (or an
      hour after the usual end, once the routine knows it), then every `every` minutes after the one before, `times` in all; each
      moved past the quiet hours; only ones still to come. */
  function plan(events, now = Date.now(), c = cfg) {
    if (!c.on) return [];
    const out = [];
    for (const e of events || []) {
      if (e.type !== 'sleep' || e.end) continue;
      const u = c.routine !== false ? usual(events, e, now) : null;
      let t = e.ts + (u ? u + 60 : c.after) * MIN;
      for (let i = 0; i < c.times; i++) {
        const at = allowed(t, c.quiet);
        if (at > now) out.push({ id: idFor(e.id, i), at, sleep: e.id, child: e.child, i, usual: u });
        t = at + c.every * MIN;
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }
  /** What a check says: the child's name, when they fell asleep and how long that is by then. */
  function text(events, n) {
    const e = events.find(x => x.id === n.sleep), k = n.child && kidById(n.child), name = k ? kidName(k) : __('your child');
    const since = e ? __('Asleep since {time} ({long}).', { time: fmtTime(e.ts), long: fmtDur((n.at - e.ts) / MIN) }) : '';
    const usually = e && n.usual ? ' ' + __('Usually up by about {time}.', { time: fmtTime(e.ts + n.usual * MIN) }) : '';
    return { title: __('Is {name} still asleep?', { name }), body: e ? `${since}${usually} ${__('Tap Woke up when they are awake.')}` : '' };
  }
  async function permission() { if (!has()) return 'none'; try { return (await P().checkPermissions()).display; } catch (e) { return 'denied'; } }
  async function ask() { if (!has()) return 'none'; try { return (await P().requestPermissions()).display; } catch (e) { return 'denied'; } }
  /** Lines the phone up with the plan: the checks it holds that are no longer planned are cancelled, the planned ones are set. Asks
      for permission the first time there is something to send. Nothing happens when nothing changed since last time. */
  async function sync(events, now = Date.now()) {
    if (!has()) return;
    const list = plan(events, now), key = JSON.stringify(list.map(n => [n.id, n.at]));
    if (key === last) return;
    if (busy) { again = events; return; }
    busy = true;
    try {
      let perm = await permission();
      if (perm === 'prompt' || perm === 'prompt-with-rationale') { if (!list.length) return; perm = await ask(); }
      if (perm !== 'granted') { last = key; return; }
      const pending = ((await P().getPending()).notifications || []).filter(n => n.extra && n.extra.ll === 'sleep');
      if (pending.length) await P().cancel({ notifications: pending.map(n => ({ id: n.id })) });
      if (list.length) {
        await P().schedule({ notifications: list.map(n => ({ id: n.id, ...text(events, n), schedule: { at: new Date(n.at), allowWhileIdle: true }, actionTypeId: TYPE, extra: { ll: 'sleep', sleep: n.sleep, child: n.child } })) });
      }
      last = key;
    } catch (e) { /* the phone said no: next time */ } finally {
      busy = false;
      if (again) { const ev = again; again = null; sync(ev); }
    }
  }
  /** Once, at the start: the buttons on the notification, and what a tap on one does (`onAction`). */
  async function init() {
    if (!has()) return;
    try { await P().registerActionTypes({ types: [{ id: TYPE, actions: [{ id: 'woke', title: __('Woke up'), foreground: true }, { id: 'still', title: __('Still asleep'), foreground: false }] }] }); } catch (e) { /* older phone */ }
    try { P().addListener('localNotificationActionPerformed', ev => { const x = (ev && ev.notification && ev.notification.extra) || {}; if (x.ll === 'sleep') listeners.forEach(f => f(ev.actionId || 'tap', x)); }); } catch (e) { /* no events */ }
  }
  return {
    get cfg() { return cfg; },
    /** Changes a setting (kept on this phone). */
    set(o) { cfg = clean({ ...cfg, ...o }); try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* storage blocked */ } last = ''; },
    plan, usual, quietAt, allowed, permission, ask, sync, init, text,
    onAction(f) { listeners.push(f); },
    /** Whether this phone can show notifications at all (the phone app). */
    get available() { return has(); },
  };
})();
