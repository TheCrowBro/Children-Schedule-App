'use strict';
/* The routine: the times of day that keep coming back. Little Log looks at the last 7 days before today. A feed, a meal, a sleep, a
   kind of play or a medicine that happens within 45 minutes of the same time on more than half of the days that were logged (and on
   at least 3 of them) is part of the routine. Nothing is stored: it is worked out again from the log every time, so it moves with the
   child when their routine changes. Diapers, the potty, night wakings, vomiting and health notes are left out: they don't keep to a
   clock.
   The routine's day runs from morning to night: from 6 AM to 6 the next morning, so the hours after midnight come last, with the
   evening before them. */
const Routine = (() => {
  const WINDOW = 45, DAYS = 7, MIN_DAYS = 3, MIN = 60000, DAY_START = 6 * 60;
  const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const back = (t, n) => { const d = new Date(t); d.setDate(d.getDate() - n); return d.getTime(); };
  const minutesOf = t => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
  /** The time `m` minutes after midnight on the day of `t` (so a change to or from summer time lands on the right clock time). */
  const onDay = (t, m) => { const d = new Date(dayStart(t)); d.setHours(0, m, 0, 0); return d.getTime(); };
  /** Minutes into the routine's day (which starts at 6 AM): the hours after midnight come last. */
  const inDay = m => (m - DAY_START + 1440) % 1440;
  /** The start (6 AM) of the routine's day that `t` falls in: until 6 in the morning it is still the day before. */
  const dayOf = t => { const s = onDay(t, DAY_START); return t >= s ? s : onDay(back(t, 1), DAY_START); };
  /** When the time `m` (minutes after midnight) comes in the routine's day that starts at `d0`. */
  const timeIn = (d0, m) => onDay(m >= DAY_START ? d0 : back(d0, -1), m);
  const median = xs => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const most = xs => { const c = new Map(); let best = '', bn = 0; for (const x of xs) { const n = (c.get(x) || 0) + 1; c.set(x, n); if (n > bn) { bn = n; best = x; } } return best; };

  /** Which routine an entry belongs to: all milk feeds together, all of a baby's meals of solid food together, each meal of the day
      (breakfast, lunch, dinner, snacks) on its own, all sleeps together, and each kind of play and each medicine on its own. */
  function keyOf(e) {
    const d = e.data || {};
    if (e.type === 'feed') return d.kind === 'solids' ? 'solids' : 'feed';   // (meals of solid food keep their own times)
    if (e.type === 'meal') return 'meal:' + (d.meal || 'Meal');
    if (e.type === 'sleep') return 'sleep';
    if (e.type === 'play') return 'play:' + (d.activity || 'Play');
    if (e.type === 'med') { const n = String(d.name || '').trim().toLowerCase().replace(/\s+/g, ' '); return n ? 'med:' + n : null; }
    return null;
  }

  /** The window of `win` minutes that holds the most days: [{ o, m }] with one time per day (the one nearest the middle). */
  function bestWindow(occ, win) {
    const s = occ.map(o => ({ o, m: o.m })).sort((a, b) => a.m - b.m), n = s.length;
    const ext = s.concat(s.map(x => ({ o: x.o, m: x.m + 1440 })));   // (just after midnight follows just before it)
    let best = null;
    for (let i = 0; i < n; i++) {
      const inWin = [];
      for (let j = i; j < i + n && ext[j].m - ext[i].m <= win; j++) inWin.push(ext[j]);
      const mid = median(inWin.map(x => x.m)), perDay = new Map();
      for (const x of inWin) { const p = perDay.get(x.o.day); if (!p || Math.abs(x.m - mid) < Math.abs(p.m - mid)) perDay.set(x.o.day, x); }
      const picked = [...perDay.values()], ms = picked.map(x => x.m), spread = Math.max(...ms) - Math.min(...ms);
      if (!best || picked.length > best.picked.length || (picked.length === best.picked.length && spread < best.spread)) best = { picked, spread };
    }
    return best;
  }

  function slotOf(key, picked, logged) {
    const ms = picked.map(x => x.m), es = picked.map(x => x.o.e), type = es[0].type, d = e => e.data || {};
    const slot = { key, type, at: Math.round(median(ms)) % 1440, from: Math.min(...ms) % 1440, to: Math.max(...ms) % 1440, days: picked.length, of: logged, entries: es };
    if (type === 'sleep') { const long = es.filter(e => e.end > e.ts).map(e => (e.end - e.ts) / MIN); if (long.length) slot.minutes = Math.round(median(long)); }
    if (type === 'play') { slot.activity = key.slice(5); const m = es.map(e => +d(e).min).filter(x => x > 0); if (m.length) slot.minutes = Math.round(median(m)); }
    if (type === 'med') { slot.name = most(es.map(e => String(d(e).name || '').trim())); slot.dose = most(es.map(e => String(d(e).dose || '').trim()).filter(Boolean)); }
    if (key === 'solids' || type === 'meal') { const c = new Map(); for (const f of es.flatMap(e => d(e).foods || [])) c.set(f, (c.get(f) || 0) + 1); slot.foods = [...c].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]); }
    if (key === 'solids') slot.kind = 'solids';
    if (type === 'meal') slot.meal = key.slice(5);
    else if (type === 'feed') {
      const bottles = es.filter(e => d(e).kind === 'bottle' || d(e).kind === 'cup');   // (a cup of milk is measured like a bottle)
      slot.kind = bottles.length * 2 > es.length ? 'bottle' : 'breast';   // what it usually is
      if (slot.kind === 'bottle' && es.filter(e => d(e).kind === 'cup').length * 2 > bottles.length) slot.cup = true;
      const ml = bottles.map(e => +d(e).ml).filter(x => x > 0), m = es.filter(e => d(e).kind !== 'bottle' && d(e).kind !== 'cup').map(e => +d(e).min).filter(x => x > 0);
      if (slot.kind === 'bottle' && ml.length) slot.ml = Math.round(median(ml) / 5) * 5;
      if (slot.kind === 'breast' && m.length) slot.minutes = Math.round(median(m));
    }
    return slot;
  }

  /** The routine in one child's log, as it stands at `now`: { slots (from morning to night), logged (days with entries), need (days a time
      must repeat on), enough (whether there are days enough to tell) }. A slot: { key, type, at, from, to (minutes after midnight),
      days, of, entries, and what it usually is: minutes, ml, kind, activity, meal, foods, name, dose }. */
  function find(events, now = Date.now(), { days = DAYS, window = WINDOW } = {}) {
    const today = dayStart(now), from = back(today, days);
    const recent = events.filter(e => e.ts >= from && e.ts < today);
    const logged = new Set(recent.map(e => dayStart(e.ts))).size, need = Math.max(MIN_DAYS, Math.floor(logged / 2) + 1);
    if (logged < MIN_DAYS) return { slots: [], logged, need, enough: false };
    const groups = new Map();
    for (const e of recent) { const k = keyOf(e); if (k) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push({ e, day: dayStart(e.ts), m: minutesOf(e.ts) }); } }
    const slots = [];
    for (const [key, occ] of groups) {
      let left = occ;
      while (left.length >= need) {
        const best = bestWindow(left, window);
        if (best.picked.length < need) break;
        slots.push(slotOf(key, best.picked, logged));
        const used = new Set(best.picked.map(x => x.o)); left = left.filter(o => !used.has(o));
      }
    }
    return { slots: slots.sort((a, b) => inDay(a.at) - inDay(b.at) || a.key.localeCompare(b.key)), logged, need, enough: true };
  }

  /** How each slot is going in the routine's day that `now` falls in (6 AM to 6 AM): { state: 'done' (with the entry), 'now', 'later'
      or 'past', at (its time that day) }; each entry counts for one slot at most, the nearest. Plus `next`: the first slot still to
      come (that day, or else the first of the next day: `tomorrow`). */
  function today(slots, events, now = Date.now(), { window = WINDOW } = {}) {
    const d0 = dayOf(now), mine = events.filter(e => e.ts >= back(d0, 1) && e.ts < back(d0, -2));
    const out = slots.map(s => ({ slot: s, at: timeIn(d0, s.at), state: 'later', entry: null }));
    const taken = new Set();
    for (const o of [...out].sort((a, b) => a.at - b.at)) {
      let best = null;
      for (const e of mine) if (keyOf(e) === o.slot.key && !taken.has(e) && Math.abs(e.ts - o.at) <= window * MIN && (!best || Math.abs(e.ts - o.at) < Math.abs(best.ts - o.at))) best = e;
      if (best) { taken.add(best); o.state = 'done'; o.entry = best; }
      else if (now >= o.at - window * MIN && now <= o.at + window * MIN) o.state = 'now';
      else if (now > o.at) o.state = 'past';
    }
    const ahead = out.filter(o => o.state === 'now' || o.state === 'later').sort((a, b) => a.at - b.at)[0];
    const first = [...out].sort((a, b) => a.at - b.at)[0];
    const at = first && timeIn(back(d0, -1), first.slot.at);
    const next = ahead ? { ...ahead, tomorrow: false } : first ? { slot: first.slot, at, state: at - now <= window * MIN ? 'now' : 'later', entry: null, tomorrow: true } : null;
    return { list: out, next };
  }

  return { WINDOW, DAYS, MIN_DAYS, DAY_START, find, today, keyOf };
})();
