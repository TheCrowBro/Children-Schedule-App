'use strict';
/* Little Log – newborn tracker. The log is kept on the phone (store.js) and synced, end-to-end encrypted, when signed in. */

// ---------- Config ----------
const TYPES = {
  feed:   { label: 'Feed',     icon: '🍼', color: '#d9a066' },
  diaper: { label: 'Diaper',   icon: '💧', color: '#7fb0a6' },
  sleep:  { label: 'Sleep',    icon: '😴', color: '#8a94c0' },
  wake:   { label: 'Night wake', icon: '🌙', color: '#a89bc4' },
  vomit:  { label: 'Vomit',    icon: '🤮', color: '#a3b17a' },
  play:   { label: 'Play',     icon: '🧸', color: '#d49aa6' },
  health: { label: 'Health',   icon: '🩺', color: '#c9756e' },
  med:    { label: 'Meds',     icon: '💊', color: '#7fa6c4' },
};
const INK = '#2a241c';   // the dark the type colours are mixed with, so icons and text in them stay easy to read
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
// The log lives in memory (`db`) and is persisted by store.js (IndexedDB). It is loaded once at startup, before the first render.
const emptyDb = () => ({ baby: { name: '', birth: '', kids: Kids.clean([]) }, events: [], deleted: [], meta: {} });
let db = emptyDb();
function normalize(d) {
  if (!d || !Array.isArray(d.events)) d = emptyDb();
  d.baby = d.baby || { name: '', birth: '' };
  d.baby.kids = Kids.clean(d.baby.kids, d.baby.name, d.baby.birth); d.baby.name = d.baby.kids[0].name; d.baby.birth = d.baby.kids[0].birth;
  d.deleted = d.deleted || [];   // tombstones: deletions waiting to sync
  d.meta = d.meta || {};         // babyId, role, sync cursors
  const now = Date.now();
  d.events.forEach(e => { if (!e.updated) e.updated = now; });   // entries from before sync existed
  return d;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// `quiet` saves skip scheduling a sync (used by the sync engine itself).
function save(quiet) {
  Store.save(db);
  if (!quiet) Sync.schedule();
}
/** A timestamp for an edit that is always newer than anything this phone has seen, even if its clock is behind
    (last-write-wins compares these, so a slow clock must not make a fresh edit look old). */
function stamp() {
  const t = Math.max(Date.now(), (db.meta.hlc || 0) + 1);
  db.meta.hlc = t; return t;
}
function removeEvent(ev) {
  db.events = db.events.filter(x => x !== ev);
  db.deleted.push({ id: ev.id, type: ev.type, ts: ev.ts, updated: stamp() });
}

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
function describe(e) { try { return describeEntry(e); } catch (err) { return [(TYPES[e.type] || {}).label || 'Entry', '']; } }
function describeEntry(e) {
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

// ---------- Children ----------
// A log can have several children (twins, triplets…). Every entry belongs to one; each child has a page of their own with their own colour.
const kids = () => db.baby.kids || (db.baby.kids = Kids.clean(null, db.baby.name, db.baby.birth));
const kidById = id => kids().find(k => k.id === id);
const kidName = k => k.name || `Baby ${kids().indexOf(k) + 1}`;
const childOf = e => (e.child && kidById(e.child) ? e.child : kids()[0].id);   // entries from before children existed belong to the first one
let selKid = null, lastKid = null;
/** Which page is open: a child's id, or 'all' (Day tab only). */
function curKid() {
  if (selKid === null) selKid = db.meta.kid || null;
  if (selKid === 'all' && kids().length > 1) return 'all';
  if (!kidById(selKid)) selKid = kids()[0].id;
  return selKid;
}
function setKid(id) { selKid = id; if (id !== 'all') lastKid = id; db.meta.kid = id; Store.save(db); }
/** The child whose numbers the Month and Stats tabs show (Everyone falls back to the last child looked at). */
function viewKid() { const k = curKid(); return k !== 'all' ? k : (kidById(lastKid) ? lastKid : kids()[0].id); }
const dayKid = () => (tab === 'day' ? curKid() : viewKid());
const scoped = () => { const k = dayKid(); return k === 'all' ? db.events : db.events.filter(e => childOf(e) === k); };
const eventsOnDay = day => scoped().filter(e => e.ts >= day && e.ts < day + DAY).sort((a, b) => a.ts - b.ts);
const activeSleep = id => db.events.find(e => e.type === 'sleep' && !e.end && (!id || childOf(e) === id));
const initial = k => esc([...kidName(k)][0] || '?').toUpperCase();
const avatar = (k, cls = '') => `<span class="av ${cls}" style="--k:${k.color}">${initial(k)}</span>`;
const dark = () => !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
/** Colours the whole app in the open child's colour (set as plain hex, so no modern CSS colour functions are needed). */
function theme() {
  const k = kidById(dayKid()), strong = k ? k.color : '#64759f', dk = dark(), R = document.documentElement.style, set = (n, v) => R.setProperty(n, v);
  const brand = dk ? Kids.mix(strong, '#ffffff', 0.38) : strong;
  set('--brand', brand); set('--on-brand', dk ? '#1d1b19' : '#ffffff');
  set('--wash1', Kids.rgba(brand, dk ? 0.22 : 0.20)); set('--wash2', Kids.rgba(brand, dk ? 0.12 : 0.10)); set('--wash3', Kids.rgba(brand, dk ? 0.07 : 0.05));
  for (const [t, T] of Object.entries(TYPES)) { set(`--${t}`, T.color); set(`--${t}-ink`, dk ? Kids.mix(T.color, '#ffffff', 0.25) : Kids.mix(T.color, INK, 0.4)); }
  set('--poo-ink', dk ? '#d0b080' : '#7d5a2c');
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dk ? '#1d1b19' : Kids.mix(brand, '#ffffff', 0.86);
}

// ---------- Rendering ----------
function syncLine() { const e = $('#syncLine'); e.textContent = Acct.syncLine(); Icons.paint(e); }
function render() {
  const multi = kids().length > 1, vk = kidById(dayKid()), single = kids()[0];
  theme();
  $('#title').textContent = dayKid() === 'all' ? 'Everyone' : (vk && vk.name ? `${vk.name}'s Log` : (multi ? `${kidName(vk)}'s Log` : 'Little Log'));
  $('#av').innerHTML = vk ? avatar(vk) : ''; $('#av').hidden = !vk;
  const g = Acct.gate();
  document.body.classList.toggle('gated', !!g);
  if (g) { $('#sleepBanner').hidden = true; $('#syncLine').textContent = ''; $('#kidBar').hidden = true; $('#av').hidden = true; $('#view').innerHTML = g.html; g.bind(); Icons.paint($('#view')); return; }
  syncLine();
  // one tab per child (plus "Everyone" on the Day tab)
  const kb = $('#kidBar'); kb.hidden = !multi;
  if (multi) {
    kb.innerHTML = (tab === 'day' ? `<button data-kid="all" class="${curKid() === 'all' ? 'on' : ''}" aria-pressed="${curKid() === 'all'}" style="--k:#64759f"><span class="av" style="--k:#64759f">★</span>All</button>` : '')
      + kids().map(k => `<button data-kid="${k.id}" class="${dayKid() === k.id ? 'on' : ''}" aria-pressed="${dayKid() === k.id}" style="--k:${k.color};--kl:${Kids.mix(k.color, '#ffffff', 0.45)}">${avatar(k)}${esc(kidName(k))}</button>`).join('');
  }
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const sleepers = kids().map(k => [k, activeSleep(k.id)]).filter(x => x[1]), bn = $('#sleepBanner');
  bn.hidden = !sleepers.length;
  if (sleepers.length) {
    bn.innerHTML = sleepers.map(([k, s], i) => `<div class="brow"><span>😴 ${multi ? `<b>${esc(kidName(k))}</b> ` : ''}Asleep since ${fmtTime(s.ts)} (${fmtDur((Date.now() - s.ts) / MIN)})</span><button ${i ? '' : 'id="wakeBtn"'} data-wake="${s.id}">Woke up</button></div>`).join('');
    bn.querySelectorAll('[data-wake]').forEach(b => b.onclick = () => { const s = db.events.find(x => x.id === b.dataset.wake); if (!s) return; if (!Sync.can('edit', s)) return toast("You can't change this entry"); s.end = Date.now(); s.updated = stamp(); save(); render(); toast('Sleep saved'); });
    Icons.paint(bn);
  }
  $('#view').innerHTML = { day: dayView, month: monthView, stats: statsView, family: Acct.familyHtml, more: moreView }[tab]();
  bind(); Icons.paint($('#view')); Acct.updateBadge();
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
const kidTag = e => { if (dayKid() !== 'all') return ''; const k = kidById(childOf(e)); return `<span class="ktag" style="--k:${k.color}">${avatar(k)}${esc(kidName(k))}</span>`; };
const quickButtons = () => Sync.can('add')
  ? `<div class="quick" style="margin-bottom:10px">${Object.entries(TYPES).filter(([k]) => Sync.can('health') || (k !== 'health' && k !== 'med')).map(([k, t]) => `<button data-add="${k}" style="--cw:${Kids.rgba(t.color, 0.3)}"><b>${t.icon}</b>${t.label}</button>`).join('')}</div>` : '';
/** "added by Dad" – only when the log is shared and the person is known. */
const byLine = e => { const n = Sync.linked() && e.by ? Sync.nameOf(e.by) : ''; return n && n !== 'you' ? `<small>added by ${esc(n)}</small>` : ''; };
function evRow(e) {
  const [a, b] = describe(e), t = TYPES[e.type];
  const warn = (e.type === 'health' && (e.data.symptoms || []).some(s => URGENT.includes(s))) || (e.type === 'diaper' && !!e.data.poo && STOOL_WARN.includes(e.data.color));
  return `<div class="card ev ${warn ? 'alert' : ''}" style="--c:${t.color}" data-edit="${e.id}">
    <div class="t">${fmtTime(e.ts)}</div>
    <div class="b">${kidTag(e)}${t.icon} <b>${esc(a)}</b>${b ? `<small>${esc(b)}</small>` : ''}${e.note ? `<small>“${esc(e.note)}”</small>` : ''}${byLine(e)}</div></div>`;
}
function ageText(day) {
  const k = kidById(dayKid());
  if (!k || !k.birth) return '';
  const d = Math.floor((day - startOfDay(new Date(k.birth + 'T00:00').getTime())) / DAY);
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
  for (const e of scoped()) if (e.type === 'sleep') {
    const end = e.end || Date.now(), s = Math.max(e.ts, day), f = Math.min(end, day + DAY);
    if (f > s) tot += (f - s) / MIN;
  }
  return tot;
}
function dayStats(day) {
  const evs = eventsOnDay(day), of = t => evs.filter(e => e.type === t);
  const feeds = of('feed'), diapers = of('diaper'), sleeps = scoped().filter(e => e.type === 'sleep' && e.end && e.ts >= day && e.ts < day + DAY);
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
  const mine = scoped(), firstLog = mine.length ? Math.min(...mine.map(e => e.ts)) : today;
  const used = S.filter(s => s.day + DAY > firstLog);
  const lbl = s => ({ l: fmtDate(s.day), s: statDays <= 14 ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(s.day).getDay()] : (new Date(s.day).getDate() % 5 === 0 ? new Date(s.day).getDate() : '') });
  const series = k => S.map(s => ({ ...lbl(s), v: s[k] }));
  const sum = k => used.reduce((a, s) => a + s[k], 0), per = k => used.length ? r1(sum(k) / used.length) : 0;
  const gaps = feedGaps(S);
  const card = (title, color, rows, chart) => `<div class="card"><b>${title}</b>${rows.map(([n, v, sm]) => `<div class="stat"><span>${n}${sm ? `<br><small>${sm}</small>` : ''}</span><b>${v}</b></div>`).join('')}${chart || ''}</div>`;
  const flagged = mine.filter(e => e.type === 'health' && e.ts >= addDays(today, -statDays + 1) && (e.data.symptoms || []).length).sort((a, b) => b.ts - a.ts);
  const sym = {}; flagged.forEach(e => e.data.symptoms.forEach(s => sym[s] = (sym[s] || 0) + 1));
  const poo = {}; mine.filter(e => e.type === 'diaper' && e.data.poo && e.ts >= addDays(today, -statDays + 1) && e.data.color).forEach(e => poo[e.data.color] = (poo[e.data.color] || 0) + 1);
  const lowWet = used.length && per('pee') < 6 && ageDays() >= 5;
  return `
  <div class="seg">${[7, 14, 30].map(n => `<button data-range="${n}" class="${n === statDays ? 'on' : ''}">${n} days</button>`).join('')}</div>
  ${kids().length > 1 ? `<h2>${esc(kidName(kidById(viewKid())))}</h2>` : ''}
  ${mine.length ? '' : '<div class="empty">Log a few entries and your stats will show up here.</div>'}
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
function ageDays() { const k = kidById(viewKid()); return k && k.birth ? Math.floor((Date.now() - new Date(k.birth + 'T00:00').getTime()) / DAY) : 99; }

// ---------- More ----------
/** One block per child: name, birth date, boy/girl and colour. Only people who may edit the profile can change them. */
function kidsHtml() {
  const can = Sync.can('profile'), ks = kids(), dis = can ? '' : 'disabled';
  return `<div class="card"><b>${ks.length > 1 ? 'Children' : 'Baby'}</b>${can ? '' : '<p class="note">Only parents can change these.</p>'}
    ${ks.map(k => `<div class="kidrow" style="--k:${k.color}">
      <div class="kh">${avatar(k, 'lg')}<input type="text" data-kn="${k.id}" maxlength="60" value="${esc(k.name)}" placeholder="Name" aria-label="Name" ${dis}></div>
      <label class="f">Birth date</label><input type="date" data-kb="${k.id}" value="${esc(k.birth)}" ${dis}>
      <label class="f">Boy or girl</label><div class="chips">${chip('ks-' + k.id, 'boy', 'Boy', k.sex === 'boy', '', true)}${chip('ks-' + k.id, 'girl', 'Girl', k.sex === 'girl', '', true)}${chip('ks-' + k.id, '', 'Not set', !k.sex, '', true)}</div>
      <label class="f">Colour</label><div class="swatches" role="radiogroup" aria-label="Colour">${Kids.swatches(k.sex).map(c => `<button type="button" class="sw ${c === k.color ? 'on' : ''}" data-kc="${k.id}" data-c="${c}" style="--k:${c}" role="radio" aria-checked="${c === k.color}" aria-label="${c}" ${dis}>${c === k.color ? '✓' : ''}</button>`).join('')}</div>
      ${can && ks.length > 1 ? `<button class="btn d" data-krm="${k.id}" style="margin-top:12px">Remove ${esc(kidName(k))}</button>` : ''}</div>`).join('')}
    ${can && ks.length < Kids.MAX ? '<button class="btn" id="kAdd" style="width:100%;margin-top:6px">+ Add a child (twins, triplets…)</button>' : ''}</div>`;
}
function moreView() {
  return Acct.accountHtml() + `
  ${kidsHtml()}
  ${Acct.cloudHtml()}
  <div class="card"><b>Your data</b><p class="note">${Sync.linked() ? 'Entries are saved on this device and synced to your family log.' : 'Everything is stored only on this device.'} Export a plain-text copy to share with your pediatrician.</p>
    <div class="row"><button class="btn" id="expJson">Backup (JSON)</button><button class="btn" id="expCsv">Export CSV</button></div>
    <div class="row"><button class="btn" id="impJson">Restore from JSON</button></div>
    <input type="file" id="impFile" accept="application/json" hidden></div>
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
$('#kidBar').onclick = e => { const b = e.target.closest('[data-kid]'); if (b) { setKid(b.dataset.kid); render(); window.scrollTo(0, 0); } };
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; if (tab === 'month') calMonth = new Date(viewDay); render(); window.scrollTo(0, 0); } };

function bindMore() {
  /** Keep `name`/`birth` mirroring the first child, then save and (when shared) send the new profile. */
  const commit = (msg) => { db.baby.name = kids()[0].name; db.baby.birth = kids()[0].birth; Sync.linked() ? Sync.pushBaby() : save(); render(); if (msg) toast(msg); };
  const K = id => kidById(id);
  document.querySelectorAll('[data-kn]').forEach(i => i.onchange = () => { const k = K(i.dataset.kn); if (k && Sync.can('profile')) { k.name = i.value.trim().slice(0, 60); commit(); } });
  document.querySelectorAll('[data-kb]').forEach(i => i.onchange = () => { const k = K(i.dataset.kb); if (k && Sync.can('profile')) { k.birth = i.value; commit('Saved'); } });
  kids().forEach(k => document.querySelectorAll(`[name="ks-${k.id}"]`).forEach(r => r.onchange = () => {
    if (!Sync.can('profile') || !r.checked) return;
    k.sex = r.value;
    if (!Kids.group(k.sex).includes(k.color)) k.color = Kids.auto(kids(), k.sex, k.id);   // moved between boy / girl / not set: pick a fresh shade for the new group
    commit();
  }));
  document.querySelectorAll('[data-kc]').forEach(b => b.onclick = () => { const k = K(b.dataset.kc); if (k && Sync.can('profile')) { k.color = b.dataset.c; commit(); } });
  document.querySelectorAll('[data-krm]').forEach(b => b.onclick = () => {
    const k = K(b.dataset.krm); if (!k || !Sync.can('profile') || kids().length < 2) return;
    if (db.events.some(e => e.child === k.id) || (k === kids()[0] && db.events.some(e => !e.child))) return toast(`${kidName(k)} still has entries – open one and move it to another child, or delete them first`);
    if (!confirm(`Remove ${kidName(k)} from this log?`)) return;
    db.baby.kids = kids().filter(x => x !== k); if (selKid === k.id) selKid = null; commit('Removed');
  });
  if ($('#kAdd')) $('#kAdd').onclick = () => { const k = Kids.make(kids()); kids().push(k); setKid(k.id); commit(); const i = document.querySelector(`[data-kn="${k.id}"]`); if (i) i.focus(); };
  $('#expJson').onclick = () => download('little-log-backup.json', JSON.stringify({ app: 'littlelog', v: 1, baby: db.baby, events: db.events }, null, 2), 'application/json');
  $('#expCsv').onclick = () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['child', 'date', 'time', 'type', 'summary', 'details', 'end', 'note'].join(',')].concat([...db.events].sort((a, b) => a.ts - b.ts).map(e => {
      const [a, b] = describe(e);
      return [kidName(kidById(childOf(e))), dkey(e.ts), fmtTime(e.ts), e.type, a, b, e.end ? fmtTime(e.end) : '', e.note].map(q).join(',');
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

  // Who is it for? Only asked when the log has more than one child. New entries can be logged for several at once (e.g. all three fed together).
  const multi = kids().length > 1, here = ev ? childOf(ev) : dayKid();
  const forHtml = !multi ? '' : `<label class="f">${editing ? 'For' : 'For (tick everyone it applies to)'}</label><div class="chips kidchips">${kids().map(k =>
    `<label class="chip kidchip" style="--k:${k.color}"><input type="${editing ? 'radio' : 'checkbox'}" name="kid" value="${k.id}" ${k.id === here ? 'checked' : ''}><span>${avatar(k)}${esc(kidName(k))}</span></label>`).join('')}</div>`;
  $('#sheet').innerHTML = `<h3>${T.icon} ${editing ? 'Edit' : 'Add'} ${T.label.toLowerCase()}</h3>
    ${forHtml}
    <label class="f">${type === 'sleep' ? 'Fell asleep at' : 'Time'}</label><input id="ts" type="datetime-local" value="${toLocalInput(defTs)}">
    <div class="mini">${[5, 15, 30, 60].map(m => `<button type="button" data-ago="${m}">${m < 60 ? m + ' min' : '1 hr'} ago</button>`).join('')}<button type="button" data-ago="0">Now</button></div>
    ${body}
    <label class="f">Note (optional)</label><textarea id="note" rows="2" maxlength="1000" placeholder="Anything worth remembering">${esc(ev ? ev.note : '')}</textarea>
    <div class="row" style="margin-top:16px">${editing && Sync.can('delete', ev) ? '<button class="btn d" id="del">Delete</button>' : ''}<button class="btn" id="cancel">Cancel</button><button class="btn p" id="save">Save</button></div>`;
  Icons.paint($('#sheet')); $('#sheet').hidden = $('#sheetBack').hidden = false;

  const S = $('#sheet'), checked = n => S.querySelector(`[name=${n}]:checked`);
  const val = n => { const c = checked(n); return c ? c.value : ''; };
  const sync = () => {
    if (type === 'feed' && $('#fBreast')) { const b = val('kind') === 'bottle'; $('#fBreast').hidden = b; $('#fBottle').hidden = !b; }
    if (type === 'diaper' && $('#dColor')) $('#dColor').hidden = !checked('poo');
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
    const who = multi ? [...S.querySelectorAll('[name=kid]:checked')].map(c => c.value).filter(id => kidById(id)) : [kids()[0].id];
    if (!who.length) return toast('Choose who this is for');
    if (type === 'sleep' && !end) { for (const id of who) { const cur = activeSleep(id); if (cur && cur !== ev) return toast(`${multi ? kidName(kidById(id)) + ' is' : 'Already'} sleeping – tap “Woke up” first`); } }
    for (const id of who) {
      const rec = ev || { id: uid(), type, by: Auth.id || undefined };
      Object.assign(rec, { ts, data: structuredClone(data), note: $('#note').value.trim(), updated: stamp(), child: id });
      if (type === 'sleep') { if (end) rec.end = end; else delete rec.end; }
      if (!ev) db.events.push(rec);
    }
    if (who.length === 1) { if (dayKid() !== who[0]) setKid(who[0]); } else if (dayKid() !== 'all' && !who.includes(dayKid())) setKid('all');
    save(); close(); viewDay = startOfDay(ts); render(); toast(who.length > 1 ? `Saved for ${who.length} children` : 'Saved');
    if (type === 'diaper' && data.poo && STOOL_WARN.includes(data.color)) setTimeout(() => alert('Red-streaked or pale / white stools can be a sign of a problem. Please tell your pediatrician (and call straight away if your baby seems unwell).'), 300);
    if (type === 'health' && data.symptoms.some(s => URGENT.includes(s))) setTimeout(() => alert('One of these symptoms can be urgent. If your baby has blue lips/face, trouble breathing, a fever (38°C / 100.4°F+ in a newborn) or is hard to wake, call your pediatrician or emergency services now.'), 300);
  };
}

setInterval(() => { if (activeSleep() && tab === 'day') render(); }, 60000);

// Re-render after a background sync, unless the user is in the middle of typing.
Sync.onChange = () => {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return syncLine();
  if (!$('#sheet').hidden) return syncLine();
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
  await Store.init(); db = normalize(await Store.load());   // before anything reads the log
  Icons.init(); Icons.paint(document.querySelector('#tabs')); Icons.paint(document.querySelector('#cover'));
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
  Store.st.onChange = () => { render(); if (!Store.st.ok) toast('Cannot save on this phone – free up space'); };
  if (Store.st.quarantined || Store.st.recovered) setTimeout(() => toast(Store.st.recovered ? 'Your saved log was damaged and has been restored from a recent backup' : 'A damaged copy of the log was set aside; it will be re-downloaded from your family log'), 600);
  if (Native.is) {
    await Promise.all([Auth.init(), Cloud.init(), Acct.init()]);   // secrets come from the Keychain / Keystore
    await Lock.init();
  }
  render();                                            // the gate decides what to show: sign-in, two-step check, lock, or the app
  if (!Native.is) return;
  const launch = await Native.launchUrl();             // app opened from an invite link
  if (launch) { const m = await Cloud.handleOAuthUrl(launch); if (!m) Acct.receiveJoin(launch); }
  if (Auth.configured && Auth.signedIn) { await Acct.refreshAuth(); Cloud.autoBackup(); }
})();
