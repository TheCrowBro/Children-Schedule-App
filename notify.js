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
  /** How long a sleep begun at this time of day usually lasts: the median of the child's sleeps at about that time (within 45 minutes)
      over the last 7 days, one per day, when they come on days enough for the routine's own rule (3, and more than half of the days
      logged); null when the routine does not know (yet). A straight pass over the log: the routine's full search is slow on a big one. */
  const memo = new Map();   // (once per sleep and minute, not on every redraw)
  const minutesOf = t => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
  const dayOf = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function usual(events, e, now = Date.now()) {
    const key = `${e.id}|${Math.floor(now / MIN)}`;
    if (memo.has(key)) return memo.get(key);
    const child = childOf(e), from = now - Routine.DAYS * 24 * 60 * MIN, m = minutesOf(e.ts);
    const near = (a, b) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b)) <= Routine.WINDOW;
    const days = new Set(), hits = new Map();   // the days with entries; the length of the sleep at about this time on each (the longest)
    for (const x of events) {
      if (x.ts < from || x.ts >= now || x.id === e.id || x.type === 'plan' || x.type === 'photo' || x.type === 'tooth' || x.type === 'contraction' || Travel.isTravel(x.type) || childOf(x) !== child) continue;
      const d = dayOf(x.ts); days.add(d);
      if (x.type === 'sleep' && x.end > x.ts && near(minutesOf(x.ts), m)) { const len = (x.end - x.ts) / MIN; if (!hits.has(d) || hits.get(d) < len) hits.set(d, len); }
    }
    const need = Math.max(Routine.MIN_DAYS, Math.floor(days.size / 2) + 1);
    let v = null;
    if (hits.size >= need) { const a = [...hits.values()].sort((p, q) => p - q); v = Math.round(a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2); }
    if (memo.size > 50) memo.clear();
    memo.set(key, v); return v;
  }
  /** The checks for the sleeps still open: { id, at, sleep, child, i, usual }, in time order. `after` minutes from the start (or an
      hour after the usual end, once the routine knows it), then every `every` minutes after the one before, `times` in all; each
      moved past the quiet hours; only ones still to come. */
  function plan(events, now = Date.now(), c = cfg) {
    if (!c.on) return [];
    const out = [], latest = new Map();   // one sleep per child: the latest still open (a child sleeps once at a time; older ones left open are stale)
    const paused = new Set((events || []).filter(w => w.type === 'wake' && w.data && w.data.sleep && !w.end).map(w => w.data.sleep));   // (up for a moment: no check)
    for (const e of events || []) if (e.type === 'sleep' && !e.end && !paused.has(e.id)) { const k = e.child || '', cur = latest.get(k); if (!cur || e.ts > cur.ts) latest.set(k, e); }
    for (const e of latest.values()) {
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
