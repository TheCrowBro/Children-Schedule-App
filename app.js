'use strict';
/* Little Log – newborn tracker. All data stays in this browser (localStorage). */

// ---------- Config ----------
const TYPES = {
  feed:   { label: 'Feed',     icon: '🍼', color: '#f59e0b' },
  diaper: { label: 'Diaper',   icon: '💧', color: '#14b8a6' },
  sleep:  { label: 'Sleep',    icon: '😴', color: '#6366f1' },
  wake:   { label: 'Night wake', icon: '🌙', color: '#8b5cf6' },
  vomit:  { label: 'Vomit',    icon: '🤮', color: '#84cc16' },
  play:   { label: 'Play',     icon: '🧸', color: '#ec4899' },
  health: { label: 'Health',   icon: '🩺', color: '#ef4444' },
  med:    { label: 'Meds',     icon: '💊', color: '#0ea5e9' },
};
const SYMPTOMS = [
  'Blue/purple hands or feet', 'Blue lips or face', 'Clicking joints (hips)', 'Belly bulge / hernia',
  'Umbilical cord issue', 'Yellow skin (jaundice)', 'Rash', 'Fever', 'Fast / noisy breathing',
  'Excessive crying', 'Refusing feeds', 'Very sleepy / hard to wake', 'Constipation', 'Reflux / arching',
];
// Symptoms worth highlighting; these are not a diagnosis, just a nudge to call the doctor.
const URGENT = ['Blue lips or face', 'Fever', 'Fast / noisy breathing', 'Very sleepy / hard to wake', 'Refusing feeds'];
const STOOL = ['Black/tarry', 'Green', 'Yellow', 'Brown', 'Red-streaked', 'White/pale'];
const STOOL_WARN = ['Red-streaked', 'White/pale'];
const PLAYS = ['Tummy time', 'Play', 'Walk / outing', 'Bath', 'Skin-to-skin'];
const WAKE_WHY = ['Hungry', 'Diaper', 'Gas / fussy', 'Unknown'];

// ---------- Storage ----------
const KEY = 'littlelog.v1';
let db = load();
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!d || !Array.isArray(d.events)) d = { baby: { name: '', birth: '' }, events: [] };
  d.baby = d.baby || { name: '', birth: '' };
  d.deleted = d.deleted || [];   // tombstones: deletions waiting to sync
  d.meta = d.meta || {};         // babyId, role, sync cursors
  const now = Date.now();
  d.events.forEach(e => { if (!e.updated) e.updated = now; });   // entries from before sync existed
  return d;
}
// `quiet` saves skip scheduling a sync (used by the sync engine itself).
function save(quiet) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Could not save – storage full or blocked'); }
  if (!quiet) Sync.schedule();
}
function removeEvent(ev) {
  db.events = db.events.filter(x => x !== ev);
  db.deleted.push({ id: ev.id, type: ev.type, ts: ev.ts, updated: Date.now() });
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const MIN = 60000, DAY = 86400000;
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const dkey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDate = t => new Date(t).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
const toLocalInput = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = v => new Date(v).getTime();
const fmtDur = m => { m = Math.round(m); if (m < 60) return `${m}m`; return `${Math.floor(m / 60)}h ${m % 60 ? m % 60 + 'm' : ''}`.trim(); };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const r1 = n => Math.round(n * 10) / 10;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }

// ---------- Event description ----------
function describe(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'feed':
      if (d.kind === 'bottle') return [`Bottle ${d.ml ? d.ml + ' ml' : ''}`, d.milk || ''];
      return [`Breast${d.side ? ' – ' + d.side : ''}`, d.min ? d.min + ' min' : ''];
    case 'diaper': {
      const w = [d.pee && 'Pee', d.poo && 'Poo'].filter(Boolean).join(' + ') || 'Dry';
      return [w, [d.poo && d.color, d.rash && 'rash'].filter(Boolean).join(', ')];
    }
    case 'sleep': return e.end ? [`Slept ${fmtDur((e.end - e.ts) / MIN)}`, `until ${fmtTime(e.end)}`] : ['Sleeping now…', 'tap to set wake time'];
    case 'wake': return [`Awake ${d.min ? d.min + ' min' : ''}`, d.why || ''];
    case 'vomit': return [`Vomit – ${d.amount || 'small'}`, d.projectile ? 'projectile' : ''];
    case 'play': return [d.activity || 'Play', d.min ? d.min + ' min' : ''];
    case 'health': return [(d.symptoms || []).join(', ') || 'Note', d.temp ? `Temp ${d.temp}°` : ''];
    case 'med': return [d.name || 'Medication', d.dose || ''];
  }
  return [e.type, ''];
}

// ---------- State ----------
let tab = 'day', viewDay = startOfDay(Date.now()), calMonth = new Date(viewDay), statDays = 7;
const eventsOnDay = day => db.events.filter(e => e.ts >= day && e.ts < day + DAY).sort((a, b) => a.ts - b.ts);
const activeSleep = () => db.events.find(e => e.type === 'sleep' && !e.end);

// ---------- Rendering ----------
function render() {
  $('#title').textContent = db.baby.name ? `${db.baby.name}'s Log` : 'Little Log';
  const g = Acct.gate();
  document.body.classList.toggle('gated', !!g);
  if (g) { $('#sleepBanner').hidden = true; $('#syncLine').textContent = ''; $('#view').innerHTML = g.html; g.bind(); return; }
  $('#syncLine').textContent = Acct.syncLine();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const s = activeSleep(), bn = $('#sleepBanner');
  bn.hidden = !s;
  if (s) { bn.innerHTML = `<span>😴 Asleep since ${fmtTime(s.ts)} (${fmtDur((Date.now() - s.ts) / MIN)})</span><button id="wakeBtn">Woke up</button>`; $('#wakeBtn').onclick = () => { if (!Sync.can('edit', s)) return toast("You can't change this entry"); s.end = Date.now(); s.updated = Date.now(); save(); render(); toast('Sleep saved'); }; }
  $('#view').innerHTML = { day: dayView, month: monthView, stats: statsView, family: Acct.familyHtml, more: moreView }[tab]();
  bind(); Acct.updateBadge();
}

function dayView() {
  const evs = eventsOnDay(viewDay), isToday = viewDay === startOfDay(Date.now());
  const counts = t => evs.filter(e => e.type === t).length;
  const pills = [
    counts('feed') && `🍼 ${counts('feed')} feeds`,
    evs.filter(e => e.type === 'diaper' && e.data.pee).length && `💧 ${evs.filter(e => e.type === 'diaper' && e.data.pee).length} pee`,
    evs.filter(e => e.type === 'diaper' && e.data.poo).length && `💩 ${evs.filter(e => e.type === 'diaper' && e.data.poo).length} poo`,
    sleepMinutesOn(viewDay) && `😴 ${fmtDur(sleepMinutesOn(viewDay))}`,
    counts('vomit') && `🤮 ${counts('vomit')}`,
  ].filter(Boolean).map(p => `<span class="pill">${p}</span>`).join('');
  return `
  <div class="datenav"><button data-nav="-1" aria-label="Previous day">‹</button>
    <div class="d">${isToday ? 'Today' : fmtDate(viewDay)}<small>${isToday ? fmtDate(viewDay) : ''}${ageText(viewDay)}</small></div>
    <button data-nav="1" aria-label="Next day" ${isToday ? 'disabled' : ''}>›</button></div>
  ${quickButtons()}
  <div class="summary">${pills}</div>
  ${evs.length ? evs.map(evRow).join('') : `<div class="empty">Nothing logged yet.${Sync.can('add') ? '<br>Tap a button above to add an entry.' : ''}</div>`}`;
}
const quickButtons = () => Sync.can('add')
  ? `<div class="quick" style="margin-bottom:10px">${Object.entries(TYPES).filter(([k]) => Sync.can('health') || (k !== 'health' && k !== 'med')).map(([k, t]) => `<button data-add="${k}"><b>${t.icon}</b>${t.label}</button>`).join('')}</div>` : '';
/** "added by Dad" – only when the log is shared and the person is known. */
const byLine = e => { const n = Sync.linked() && e.by ? Sync.nameOf(e.by) : ''; return n && n !== 'you' ? `<small>added by ${esc(n)}</small>` : ''; };
function evRow(e) {
  const [a, b] = describe(e), t = TYPES[e.type];
  const warn = e.type === 'health' && (e.data.symptoms || []).some(s => URGENT.includes(s));
  return `<div class="card ev ${warn ? 'alert' : ''}" style="--c:${t.color}" data-edit="${e.id}">
    <div class="t">${fmtTime(e.ts)}</div>
    <div class="b">${t.icon} <b>${esc(a)}</b>${b ? `<small>${esc(b)}</small>` : ''}${e.note ? `<small>“${esc(e.note)}”</small>` : ''}${byLine(e)}</div></div>`;
}
function ageText(day) {
  if (!db.baby.birth) return '';
  const d = Math.floor((day - startOfDay(new Date(db.baby.birth + 'T00:00').getTime())) / DAY);
  if (d < 0) return '';
  return (d < 14 ? ` · day ${d + 1}` : ` · ${Math.floor(d / 7)} weeks`);
}

function monthView() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), today = startOfDay(Date.now());
  let cells = '';
  for (let i = 0; i < first.getDay(); i++) cells += '<button class="blank" disabled></button>';
  for (let d = 1; d <= days; d++) {
    const t = new Date(y, m, d).getTime(), evs = eventsOnDay(t);
    const kinds = [...new Set(evs.map(e => e.type))];
    cells += `<button data-day="${t}" class="${t === viewDay ? 'sel' : ''} ${t === today ? 'today' : ''}">${d}<span class="dots">${kinds.map(k => `<i class="dot" style="--c:${TYPES[k].color}"></i>`).join('')}</span></button>`;
  }
  return `
  <div class="datenav"><button data-month="-1" aria-label="Previous month">‹</button>
    <div class="d">${calMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
    <button data-month="1" aria-label="Next month">›</button></div>
  <div class="cal">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="h">${d}</div>`).join('')}${cells}</div>
  <div class="legend">${Object.values(TYPES).map(t => `<span><i style="--c:${t.color}"></i>${t.label}</span>`).join('')}</div>
  <h2>${fmtDate(viewDay)}</h2>
  ${quickButtons()}
  ${eventsOnDay(viewDay).map(evRow).join('') || '<div class="empty">No entries this day.</div>'}`;
}

// ---------- Stats ----------
function sleepMinutesOn(day) {
  let tot = 0;
  for (const e of db.events) if (e.type === 'sleep') {
    const end = e.end || Date.now(), s = Math.max(e.ts, day), f = Math.min(end, day + DAY);
    if (f > s) tot += (f - s) / MIN;
  }
  return tot;
}
function dayStats(day) {
  const evs = eventsOnDay(day), of = t => evs.filter(e => e.type === t);
  const feeds = of('feed'), diapers = of('diaper'), sleeps = db.events.filter(e => e.type === 'sleep' && e.end && e.ts >= day && e.ts < day + DAY);
  return {
    day, feeds: feeds.length, ml: feeds.reduce((a, e) => a + (+e.data.ml || 0), 0),
    pee: diapers.filter(e => e.data.pee).length, poo: diapers.filter(e => e.data.poo).length,
    sleep: sleepMinutesOn(day), longest: Math.max(0, ...sleeps.map(e => (e.end - e.ts) / MIN)), naps: sleeps.length,
    wakes: of('wake').length, vomit: of('vomit').length, play: of('play').reduce((a, e) => a + (+e.data.min || 0), 0),
    feedTimes: feeds.map(e => e.ts),
  };
}
function feedGaps(list) {
  const t = list.flatMap(s => s.feedTimes).sort((a, b) => a - b), g = [];
  for (let i = 1; i < t.length; i++) { const x = (t[i] - t[i - 1]) / MIN; if (x < 12 * 60) g.push(x); }
  return g;
}
function bars(vals, color, fmt = v => v) {
  const max = Math.max(...vals.map(v => v.v), 1);
  return `<div class="bars" style="--c:${color}">${vals.map(v => `<div title="${esc(v.l)}: ${fmt(v.v)}"><i style="height:${v.v / max * 100}%"></i></div>`).join('')}</div>
  <div class="barlbl">${vals.map(v => `<span>${esc(v.s)}</span>`).join('')}</div>`;
}
function statsView() {
  const today = startOfDay(Date.now());
  const days = Array.from({ length: statDays }, (_, i) => addDays(today, i - statDays + 1));
  const S = days.map(dayStats);
  // Ignore days before anything was logged so averages aren't dragged down.
  const firstLog = db.events.length ? Math.min(...db.events.map(e => e.ts)) : today;
  const used = S.filter(s => s.day + DAY > firstLog);
  const lbl = s => ({ l: fmtDate(s.day), s: statDays <= 14 ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(s.day).getDay()] : (new Date(s.day).getDate() % 5 === 0 ? new Date(s.day).getDate() : '') });
  const series = k => S.map(s => ({ ...lbl(s), v: s[k] }));
  const sum = k => used.reduce((a, s) => a + s[k], 0), per = k => used.length ? r1(sum(k) / used.length) : 0;
  const gaps = feedGaps(S);
  const card = (title, color, rows, chart) => `<div class="card"><b>${title}</b>${rows.map(([n, v, sm]) => `<div class="stat"><span>${n}${sm ? `<br><small>${sm}</small>` : ''}</span><b>${v}</b></div>`).join('')}${chart || ''}</div>`;
  const flagged = db.events.filter(e => e.type === 'health' && e.ts >= addDays(today, -statDays + 1) && (e.data.symptoms || []).length).sort((a, b) => b.ts - a.ts);
  const sym = {}; flagged.forEach(e => e.data.symptoms.forEach(s => sym[s] = (sym[s] || 0) + 1));
  const poo = {}; db.events.filter(e => e.type === 'diaper' && e.data.poo && e.ts >= addDays(today, -statDays + 1) && e.data.color).forEach(e => poo[e.data.color] = (poo[e.data.color] || 0) + 1);
  const lowWet = used.length && per('pee') < 6 && ageDays() >= 5;
  return `
  <div class="seg">${[7, 14, 30].map(n => `<button data-range="${n}" class="${n === statDays ? 'on' : ''}">${n} days</button>`).join('')}</div>
  ${db.events.length ? '' : '<div class="empty">Log a few entries and your stats will show up here.</div>'}
  ${lowWet ? '<div class="card alert">⚠️ Fewer than 6 wet diapers/day on average. After the first week this can signal low intake – worth mentioning to your pediatrician.</div>' : ''}
  ${card('🍼 Feeding', TYPES.feed.color, [['Feeds per day', per('feeds')], ['Avg time between feeds', gaps.length ? fmtDur(avg(gaps)) : '–'], ['Bottle ml per day', per('ml') || '–']], bars(series('feeds'), TYPES.feed.color))}
  ${card('💧 Diapers', TYPES.diaper.color, [['Pee per day', per('pee')], ['Poo per day', per('poo')], ...(Object.keys(poo).length ? [['Poo colours', Object.entries(poo).map(([k, v]) => `${k} ×${v}`).join(', ')]] : [])], bars(series('pee'), TYPES.diaper.color))}
  ${card('😴 Sleep', TYPES.sleep.color, [['Sleep per day', fmtDur(avg(used.map(s => s.sleep)))], ['Longest stretch (avg)', fmtDur(avg(used.map(s => s.longest)))], ['Naps/sleeps per day', per('naps')], ['Night wakings per day', per('wakes')]], bars(S.map(s => ({ ...lbl(s), v: r1(s.sleep / 60) })), TYPES.sleep.color, v => v + 'h'))}
  ${card('🤮 Vomit', TYPES.vomit.color, [['Total', sum('vomit')], ['Per day', per('vomit')]], bars(series('vomit'), TYPES.vomit.color))}
  ${card('🧸 Play', TYPES.play.color, [['Play per day', fmtDur(per('play'))]], bars(series('play'), TYPES.play.color, v => v + 'm'))}
  <div class="card ${flagged.length ? 'alert' : ''}"><b>🩺 Health notes</b>
    ${Object.keys(sym).length ? Object.entries(sym).map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>${v}×</b></div>`).join('') : '<div class="note">Nothing logged in this period.</div>'}</div>
  <p class="note">Stats are for your own tracking and are not medical advice. If something worries you, call your pediatrician. Call emergency services for blue lips/face, trouble breathing, or a baby who is hard to wake.</p>`;
}
function ageDays() { return db.baby.birth ? Math.floor((Date.now() - new Date(db.baby.birth + 'T00:00').getTime()) / DAY) : 99; }

// ---------- More ----------
function moreView() {
  return Acct.accountHtml() + `
  <div class="card"><b>Baby</b>
    <label class="f" style="display:block;margin-top:8px">Name<input id="bName" type="text" value="${esc(db.baby.name)}" style="width:100%;padding:10px;font-size:16px"></label>
    <label class="f" style="display:block;margin-top:8px">Birth date<input id="bBirth" type="date" value="${esc(db.baby.birth)}" style="width:100%;padding:10px;font-size:16px"></label></div>
  ${Acct.cloudHtml()}
  <div class="card"><b>Your data</b><p class="note">${Sync.linked() ? 'Entries are saved on this device and synced to your family log.' : 'Everything is stored only on this device.'} Export a plain-text copy to share with your pediatrician.</p>
    <div class="row"><button class="btn" id="expJson">Backup (JSON)</button><button class="btn" id="expCsv">Export CSV</button></div>
    <div class="row"><button class="btn" id="impJson">Restore from JSON</button></div>
    <input type="file" id="impFile" accept="application/json" hidden></div>
  <div class="card"><b>Install</b><p class="note">Open this page in your phone browser and choose “Add to Home Screen” – it then works like an app, even offline.</p></div>
  ${Sync.isParent() ? '<div class="card"><button class="btn d" id="wipe" style="width:100%">Delete all entries</button></div>' : ''}`;
}

// ---------- Bindings ----------
function bind() {
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => openSheet(b.dataset.add));
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const ev = db.events.find(e => e.id === b.dataset.edit); Sync.can('edit', ev) ? openSheet(null, ev) : toast(`You can't change entries${ev && ev.by ? ' added by ' + (Sync.nameOf(ev.by) || 'someone else') : ''}`); });
  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { viewDay = addDays(viewDay, +b.dataset.nav); render(); });
  document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { viewDay = +b.dataset.day; render(); });
  document.querySelectorAll('[data-month]').forEach(b => b.onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + +b.dataset.month, 1); render(); });
  document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { statDays = +b.dataset.range; render(); });
  if (tab === 'more') { bindMore(); Acct.bindMoreAccount(); }
  if (tab === 'family') Acct.bindFamily();
}
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; if (tab === 'month') calMonth = new Date(viewDay); render(); window.scrollTo(0, 0); } };

function bindMore() {
  $('#bName').disabled = $('#bBirth').disabled = !Sync.can('profile');
  $('#bName').onchange = e => { db.baby.name = e.target.value.trim(); Sync.linked() ? Sync.pushBaby() : save(); render(); };
  $('#bBirth').onchange = e => { db.baby.birth = e.target.value; Sync.linked() ? Sync.pushBaby() : save(); toast('Saved'); };
  $('#expJson').onclick = () => download('little-log-backup.json', JSON.stringify({ app: 'littlelog', v: 1, baby: db.baby, events: db.events }, null, 2), 'application/json');
  $('#expCsv').onclick = () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['date', 'time', 'type', 'summary', 'details', 'end', 'note'].join(',')].concat([...db.events].sort((a, b) => a.ts - b.ts).map(e => {
      const [a, b] = describe(e);
      return [dkey(e.ts), fmtTime(e.ts), e.type, a, b, e.end ? fmtTime(e.end) : '', e.note].map(q).join(',');
    }));
    download('little-log.csv', rows.join('\n'), 'text/csv');
  };
  $('#impJson').onclick = () => $('#impFile').click();
  $('#impFile').onchange = async e => {
    try { Acct.applyBackup(JSON.parse(await e.target.files[0].text())); }
    catch (err) { toast(err.message && err.message.startsWith('That file') ? err.message : 'That file is not a valid backup'); }
    e.target.value = '';
  };
  if ($('#wipe')) $('#wipe').onclick = () => {
    const shared = Sync.linked() ? ' This also deletes them for everyone sharing this log.' : '';
    if (confirm('Delete ALL entries?' + shared + ' This cannot be undone.') && confirm('Really delete everything?')) { [...db.events].forEach(removeEvent); save(); render(); }
  };
}
function download(name, text, type) {
  if (Native.is) return Native.saveFile(name, text).catch(e => { if (!/cancel/i.test(e.message)) toast('Could not share the file'); });
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Entry sheet ----------
const chip = (name, val, label, checked, cls = '', radio = false) =>
  `<label class="chip ${cls}"><input type="${radio ? 'radio' : 'checkbox'}" name="${name}" value="${esc(val)}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
const radios = (name, opts, cur, cls) => `<div class="chips">${opts.map(o => chip(name, o, esc(o), o === cur, cls, true)).join('')}</div>`;
const num = (id, v, ph, step = 1) => `<input id="${id}" type="number" inputmode="decimal" min="0" step="${step}" value="${v ?? ''}" placeholder="${ph}">`;

function openSheet(type, ev) {
  const editing = !!ev;
  type = ev ? ev.type : type;
  if (editing ? !Sync.can('edit', ev) : !Sync.can('add')) return toast("You don't have permission to do that");
  if ((type === 'health' || type === 'med') && !Sync.can('health')) return toast("You don't have access to health notes");
  const d = (ev && ev.data) || {}, T = TYPES[type];
  // New entries default to now, or to noon of the viewed day when browsing past days.
  const defTs = ev ? ev.ts : (viewDay === startOfDay(Date.now()) ? Date.now() : viewDay + 12 * 60 * MIN);
  let body = '';
  if (type === 'feed') body = `
    <label class="f">Type</label>${radios('kind', ['breast', 'bottle'], d.kind || 'breast')}
    <div id="fBreast"><label class="f">Side</label>${radios('side', ['Left', 'Right', 'Both'], d.side)}<label class="f">Minutes</label>${num('min', d.min, 'e.g. 15')}</div>
    <div id="fBottle"><label class="f">Amount (ml)</label>${num('ml', d.ml, 'e.g. 90')}<label class="f">Milk</label>${radios('milk', ['Breast milk', 'Formula'], d.milk)}</div>`;
  if (type === 'diaper') body = `
    <label class="f">What was in it?</label><div class="chips">${chip('pee', 1, '💧 Pee', d.pee ?? !editing)}${chip('poo', 1, '💩 Poo', d.poo)}${chip('rash', 1, 'Rash', d.rash, 'warn')}</div>
    <div id="dColor"><label class="f">Poo colour</label>${radios('color', STOOL, d.color, '')}</div>`;
  if (type === 'sleep') body = `
    <label class="f">Woke up at <small>(leave empty if still asleep)</small></label><input id="end" type="datetime-local" value="${ev && ev.end ? toLocalInput(ev.end) : ''}">
    <div class="mini"><button type="button" data-endnow>Now</button></div>`;
  if (type === 'wake') body = `<label class="f">Awake for (minutes)</label>${num('min', d.min, 'e.g. 20')}<label class="f">Why?</label>${radios('why', WAKE_WHY, d.why)}`;
  if (type === 'vomit') body = `<label class="f">Amount</label>${radios('amount', ['Spit-up', 'Medium', 'Large'], d.amount || 'Spit-up')}<div class="chips" style="margin-top:12px">${chip('projectile', 1, 'Projectile', d.projectile, 'warn')}</div>`;
  if (type === 'play') body = `<label class="f">Activity</label>${radios('activity', PLAYS, d.activity || 'Tummy time')}<label class="f">Minutes</label>${num('min', d.min, 'e.g. 10')}`;
  if (type === 'health') body = `<label class="f">Check anything you noticed</label><div class="chips">${SYMPTOMS.map(s => chip('sym', s, esc(s), (d.symptoms || []).includes(s), 'warn')).join('')}</div><label class="f">Temperature (°)</label>${num('temp', d.temp, 'optional', 0.1)}`;
  if (type === 'med') body = `<label class="f">Medicine / vitamin</label><input id="mname" type="text" value="${esc(d.name || '')}" placeholder="e.g. Vitamin D"><label class="f">Dose</label><input id="mdose" type="text" value="${esc(d.dose || '')}" placeholder="e.g. 1 ml">`;

  $('#sheet').innerHTML = `<h3>${T.icon} ${editing ? 'Edit' : 'Add'} ${T.label.toLowerCase()}</h3>
    <label class="f">${type === 'sleep' ? 'Fell asleep at' : 'Time'}</label><input id="ts" type="datetime-local" value="${toLocalInput(defTs)}">
    <div class="mini">${[5, 15, 30, 60].map(m => `<button type="button" data-ago="${m}">${m < 60 ? m + ' min' : '1 hr'} ago</button>`).join('')}<button type="button" data-ago="0">Now</button></div>
    ${body}
    <label class="f">Note (optional)</label><textarea id="note" rows="2" placeholder="Anything worth remembering">${esc(ev ? ev.note : '')}</textarea>
    <div class="row" style="margin-top:16px">${editing && Sync.can('delete', ev) ? '<button class="btn d" id="del">Delete</button>' : ''}<button class="btn" id="cancel">Cancel</button><button class="btn p" id="save">Save</button></div>`;
  $('#sheet').hidden = $('#sheetBack').hidden = false;

  const S = $('#sheet'), checked = n => S.querySelector(`[name=${n}]:checked`);
  const val = n => { const c = checked(n); return c ? c.value : ''; };
  const sync = () => {
    if (type === 'feed') { const b = val('kind') === 'bottle'; $('#fBreast').hidden = b; $('#fBottle').hidden = !b; }
    if (type === 'diaper') $('#dColor').hidden = !checked('poo');
  };
  S.onchange = sync; sync();
  S.querySelectorAll('[data-ago]').forEach(b => b.onclick = () => { $('#ts').value = toLocalInput(Date.now() - b.dataset.ago * MIN); });
  const en = S.querySelector('[data-endnow]'); if (en) en.onclick = () => { $('#end').value = toLocalInput(Date.now()); };
  const close = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; };
  $('#sheetBack').onclick = $('#cancel').onclick = close;
  if ($('#del')) $('#del').onclick = () => { if (confirm('Delete this entry?')) { removeEvent(ev); save(); close(); render(); toast('Deleted'); } };
  $('#save').onclick = () => {
    const ts = fromLocalInput($('#ts').value);
    if (!ts) return toast('Please pick a time');
    const n = id => { const v = $(id).value; return v === '' ? undefined : +v; };
    let data = {}, end;
    if (type === 'feed') data = val('kind') === 'bottle' ? { kind: 'bottle', ml: n('#ml'), milk: val('milk') } : { kind: 'breast', side: val('side'), min: n('#min') };
    if (type === 'diaper') {
      data = { pee: !!checked('pee'), poo: !!checked('poo'), rash: !!checked('rash') };
      if (data.poo) data.color = val('color');
      if (!data.pee && !data.poo && !confirm('Save as a dry diaper?')) return;
    }
    if (type === 'sleep') { end = $('#end').value ? fromLocalInput($('#end').value) : undefined; if (end && end <= ts) return toast('Wake time must be after bedtime'); }
    if (type === 'wake') data = { min: n('#min'), why: val('why') };
    if (type === 'vomit') data = { amount: val('amount'), projectile: !!checked('projectile') };
    if (type === 'play') data = { activity: val('activity'), min: n('#min') };
    if (type === 'health') {
      data = { symptoms: [...S.querySelectorAll('[name=sym]:checked')].map(c => c.value), temp: n('#temp') };
      if (!data.symptoms.length && !data.temp && !$('#note').value.trim()) return toast('Tick a symptom or add a note');
    }
    if (type === 'med') { data = { name: $('#mname').value.trim(), dose: $('#mdose').value.trim() }; if (!data.name) return toast('Enter a name'); }
    if (type === 'sleep' && !end) { const cur = activeSleep(); if (cur && cur !== ev) return toast('Already sleeping – tap “Woke up” first'); }
    const rec = ev || { id: uid(), type, by: Auth.id || undefined };
    Object.assign(rec, { ts, data, note: $('#note').value.trim(), updated: Date.now() });
    if (type === 'sleep') { if (end) rec.end = end; else delete rec.end; }
    if (!ev) db.events.push(rec);
    save(); close(); viewDay = startOfDay(ts); render(); toast('Saved');
    if (type === 'health' && data.symptoms.some(s => URGENT.includes(s))) setTimeout(() => alert('One of these symptoms can be urgent. If your baby has blue lips/face, trouble breathing, a fever (38°C / 100.4°F+ in a newborn) or is hard to wake, call your pediatrician or emergency services now.'), 300);
  };
}

setInterval(() => { if (activeSleep() && tab === 'day') render(); }, 60000);

// Re-render after a background sync, unless the user is in the middle of typing.
Sync.onChange = () => {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return $('#syncLine').textContent = Acct.syncLine();
  if (!$('#sheet').hidden) return $('#syncLine').textContent = Acct.syncLine();
  render();
};
// Phone app: links opened by the OS (invite links, cloud sign-in returns) and the Android back button.
Native.onUrl(async url => {
  const m = await Cloud.handleOAuthUrl(url);
  if (m) { tab = 'more'; render(); return toast(m); }
  Acct.receiveJoin(url);
});
Native.onBack(() => {
  if (!$('#sheet').hidden) { $('#sheetBack').click(); return true; }
  if (tab !== 'day') { tab = 'day'; render(); return true; }
  return false;
});
Lock.onChange = () => render();
Sync.onSessionLost = () => Acct.sessionLost();
(async () => {
  if (Native.is) {
    await Promise.all([Auth.init(), Cloud.init()]);   // secrets come from the Keychain / Keystore
    await Lock.init();
  }
  render();                                            // the gate decides what to show: sign-in, two-step check, lock, or the app
  if (!Native.is) return;
  const launch = await Native.launchUrl();             // app opened from an invite link
  if (launch) { const m = await Cloud.handleOAuthUrl(launch); if (!m) Acct.receiveJoin(launch); }
  if (Auth.configured && Auth.signedIn) { await Acct.refreshAuth(); Cloud.autoBackup(); }
})();
