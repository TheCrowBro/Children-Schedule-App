// The family calendar on the phone: an event from the Month page (an exam, an appointment, a lesson, a trip) goes straight into the
// phone's own calendar where the app can (Android and iOS), and otherwise travels as a calendar file (.ics) through the share sheet, to
// email, messages or Files, which Google Calendar, Apple Calendar and Outlook all open. A whole month can go as one file. Nothing leaves
// the phone unless the user sends it; there is no calendar server.
/* global __, Native, download, kidName, kidById, kids, childOf, Travel, planEnd, planGroup, startOfDay, db, toast, pageKids */
const Cal = (() => {
  const pad = n => String(n).padStart(2, '0');
  const utc = t => { const d = new Date(t); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; };
  const day = t => { const d = new Date(t); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
  const text = v => String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = line => { const out = []; let s = line; while (s.length > 72) { out.push(s.slice(0, 72)); s = ' ' + s.slice(72); } out.push(s); return out.join('\r\n'); };   // (long lines continue on the next, as the format asks)
  /** A calendar file for these items: { uid, title, start, end (the first moment after it), allDay, notes, location }. */
  function ics(items, name = 'Little Log') {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Little Log//Little Log//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${text(name)}`];
    for (const it of items) {
      L.push('BEGIN:VEVENT', `UID:${it.uid}@littlelog`, `DTSTAMP:${utc(Date.now())}`);
      if (it.allDay) L.push(`DTSTART;VALUE=DATE:${day(it.start)}`, `DTEND;VALUE=DATE:${day(it.end)}`);
      else L.push(`DTSTART:${utc(it.start)}`, `DTEND:${utc(it.end)}`);
      L.push(`SUMMARY:${text(it.title)}`);
      if (it.notes) L.push(`DESCRIPTION:${text(it.notes)}`);
      if (it.location) L.push(`LOCATION:${text(it.location)}`);
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }
  /** A plan or a trip from the log as a calendar item: a plan for several children is one item, naming them. */
  function itemOf(e) {
    if (e.type === 'trip') {
      const M = Travel.MEANS[Travel.meansOf(e)];
      return { uid: e.id, title: __('Trip {by}', { by: __(M.by) }), start: startOfDay(e.ts), end: Travel.ends(e), allDay: true, notes: e.note || '' };
    }
    const group = planGroup(e), who = group.map(g => kidName(kidById(childOf(g)))).filter(Boolean), allDay = !!(e.data && e.data.allday), kind = __((e.data && e.data.kind) || 'Other');
    const title = ((e.data && e.data.title) || kind) + (who.length && kids().length > 1 ? ` (${who.join(', ')})` : '');
    return { uid: e.id, title, start: allDay ? startOfDay(e.ts) : e.ts, end: allDay ? planEnd(e) : (Number.isFinite(e.end) ? e.end : e.ts + 60 * 60 * 1000), allDay,
      notes: [e.data && e.data.title ? kind : '', e.note || ''].filter(Boolean).join('\n') };
  }
  const slug = s => String(s || 'calendar').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'calendar';
  /** The file goes to the share sheet on the phone (Calendar, Mail, Messages, Files…) and is downloaded in a browser. */
  async function share(evs, name) {
    const items = evs.map(itemOf), file = `littlelog-${slug(name || (items.length === 1 ? items[0].title : 'calendar'))}.ics`, body = ics(items, name || 'Little Log');
    try { if (Native.is) await Native.saveFile(file, body); else download(file, body, 'text/calendar'); } catch (e) { toast(__('Could not share the calendar file')); }
  }
  /** Into the phone's own calendar when the app can, otherwise as a file. */
  async function addToPhone(e) {
    const it = itemOf(e);
    let done = null;
    try { done = await Native.calendarInsert({ title: it.title, start: it.start, end: it.end, allDay: it.allDay, notes: it.notes || '', location: it.location || '' }); } catch (x) { done = null; }
    if (done === null) return share([e]);   // (no calendar to put it in here: as a file, through the share sheet)
    if (!done) toast(__('Not added'));
  }
  /** Everything on the calendar in that month, for the children on the page, as one file. */
  function shareMonth(month) {
    const m0 = new Date(month.getFullYear(), month.getMonth(), 1).getTime(), m1 = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime();
    const ids = new Set(pageKids().map(k => k.id)), seen = new Set(), list = [];
    for (const e of db.events) {
      if (e.type === 'trip') { if (e.ts < m1 && Travel.ends(e) > m0) list.push(e); continue; }
      if (e.type !== 'plan' || !ids.has(childOf(e)) || e.ts >= m1 || planEnd(e) <= m0) continue;
      const key = [e.data.kind, e.data.title, e.ts, e.end].join('|'); if (seen.has(key)) continue; seen.add(key); list.push(e);
    }
    if (!list.length) return toast(__('Nothing on the calendar this month'));
    return share(list, `${__('Little Log')} ${new Date(m0).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`);
  }
  return { ics, itemOf, share, addToPhone, shareMonth, _fmt: { utc, day, fold } };
})();
