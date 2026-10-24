'use strict';
/* Little Log – newborn tracker. The log is kept on the phone (store.js) and synced, end-to-end encrypted, when signed in. */

// ---------- Config ----------
// Entries come in six groups; each group has one colour. The colours were checked as a set (colour-blind separation, contrast on the
// paper background) in this ring order, inner to outer, separately for light and dark mode. On the day clock each group also has its
// own ring and icon, so colour is never the only way to tell them apart.
const GROUPS = [
  { id: 'feed', label: 'Feeding', icon: '🍼', types: ['feed'] },
  { id: 'diaper', label: 'Diapers', icon: '💧', types: ['diaper'] },
  { id: 'sleep', label: 'Sleep & night wakings', icon: '😴', types: ['sleep', 'wake'] },
  { id: 'vomit', label: 'Vomit', icon: '🤮', types: ['vomit'] },
  { id: 'play', label: 'Play', icon: '🧸', types: ['play'] },
  { id: 'health', label: 'Health & meds', icon: '🩺', types: ['health', 'med'] },
];
const RING = ['sleep', 'feed', 'diaper', 'vomit', 'play', 'health'];
const GCOLOR = {
  light: { sleep: '#5b5fc7', feed: '#c9761f', diaper: '#2a9db8', vomit: '#5f8a1f', play: '#a845a8', health: '#c0392b', poo: '#8a5a2b' },
  dark: { sleep: '#7478d8', feed: '#c97a2a', diaper: '#2b9fc0', vomit: '#8a9a2a', play: '#b85ab0', health: '#dd5a4a', poo: '#b98a55' },
};
const groupOf = t => GROUPS.find(g => g.types.includes(t)) || GROUPS[0];
const TYPES = {
  feed:   { label: 'Feed',     icon: '🍼' },
  diaper: { label: 'Diaper',   icon: '💧' },
  sleep:  { label: 'Sleep',    icon: '😴' },
  wake:   { label: 'Night wake', icon: '🌙' },
  vomit:  { label: 'Vomit',    icon: '🤮' },
  play:   { label: 'Play',     icon: '🧸' },
  health: { label: 'Health',   icon: '🩺' },
  med:    { label: 'Meds',     icon: '💊' },
};
for (const [t, T] of Object.entries(TYPES)) T.color = GCOLOR.light[groupOf(t).id];   // plain hex (light) for the few places that need one
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
      if (d.kind === 'bottle') return [`Bottle ${d.ml ? d.ml + ' ml' : ''}`, [d.milk, d.formula].filter(Boolean).join(' · ')];
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
  const G = dk ? GCOLOR.dark : GCOLOR.light;
  for (const g of GROUPS) set(`--g-${g.id}`, G[g.id]);
  set('--g-poo', G.poo); set('--g-meds', Kids.mix(G.health, dk ? '#1d1b19' : '#ffffff', 0.45));
  for (const t of Object.keys(TYPES)) { const c = G[groupOf(t).id]; set(`--${t}`, c); set(`--${t}-ink`, dk ? Kids.mix(c, '#ffffff', 0.3) : Kids.mix(c, INK, 0.25)); }
  set('--poo-ink', dk ? '#d0b080' : '#7d5a2c');
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dk ? '#1d1b19' : Kids.mix(brand, '#ffffff', 0.86);
}

// ---------- Rendering ----------
function syncLine() { const e = $('#syncLine'); e.textContent = Acct.syncLine(); Icons.paint(e); }
function render() {
  document.querySelectorAll('#view details[data-grp]').forEach(d => { d.open ? openGroups.add(d.dataset.grp) : openGroups.delete(d.dataset.grp); });   // keep twirl-downs as the user left them
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
  $('#view').innerHTML = { day: dayView, month: monthView, stats: statsView, guide: guideView, family: Acct.familyHtml, more: moreView }[tab]();
  bind(); Icons.paint($('#view')); Acct.updateBadge();
  milestoneCheck();
}

function dayView() {
  const evs = eventsOnDay(viewDay), isToday = viewDay === startOfDay(Date.now());
  const q = quad == null ? null : QUADS[quad], inQ = q ? evs.filter(e => quadOf(e.ts, viewDay) === quad) : null;
  return `
  <div class="datenav"><button data-nav="-1" aria-label="Previous day">‹</button>
    <div class="d">${isToday ? 'Today' : fmtDate(viewDay)}<small>${isToday ? fmtDate(viewDay) : ''}${ageText(viewDay)}</small></div>
    <button data-nav="1" aria-label="Next day" ${isToday ? 'disabled' : ''}>›</button></div>
  ${quickButtons()}
  <div class="card clockcard">${clockSvg(evs, viewDay)}${clockLegend(evs)}
    <p class="note hint">Tap a dot to open that entry, or a quarter of the clock to list just those hours.</p></div>
  ${q ? `<div class="card quadlist"><div class="qhead"><span><b>${q.label}</b> <small>${q.range} · ${inQ.length} ${inQ.length === 1 ? 'entry' : 'entries'}</small></span><button class="btn" data-quadclear style="padding:6px 12px">Whole day</button></div>
      ${inQ.length ? inQ.map(evRow).join('') : '<div class="empty">Nothing in these hours.</div>'}</div>`
    : (evs.length ? `<h2>Details</h2>${groupedList(evs)}` : `<div class="empty">Nothing logged yet.${Sync.can('add') ? '<br>Tap a button above to add an entry.' : ''}</div>`)}`;
}

// ---------- Day clock ----------
// A 24-hour dial: midnight at the top, noon at the bottom. Every entry is a ray out of the dial at the time it happened, ending in a dot
// on its group's ring. Sleep also shows as an arc for how long it lasted.
const QUADS = [{ label: 'Night', range: '12 AM – 6 AM' }, { label: 'Morning', range: '6 AM – 12 PM' }, { label: 'Afternoon', range: '12 PM – 6 PM' }, { label: 'Evening', range: '6 PM – 12 AM' }];
let quad = null;
const quadOf = (t, day) => Math.min(3, Math.max(0, Math.floor((t - day) / (6 * 3600e3))));
function clockSvg(evs, day) {
  const C = 170, R0 = 62, RR = { sleep: 82, feed: 98, diaper: 114, vomit: 130, play: 145, health: 160 };
  const frac = t => (t - day) / DAY, ang = f => f * 2 * Math.PI - Math.PI / 2, P = (a, r) => [C + r * Math.cos(a), C + r * Math.sin(a)];
  const f1 = n => n.toFixed(1), xy = (a, r) => P(a, r).map(f1).join(' ');
  const arc = (a0, a1, r) => `M${xy(a0, r)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${xy(a1, r)}`;
  let out = '';
  // quarters (tap targets), the selected one washed in the page colour
  for (let i = 0; i < 4; i++) {
    const a0 = ang(i / 4), a1 = ang((i + 1) / 4);
    out += `<path class="qw ${quad === i ? 'on' : ''}" data-quad="${i}" role="button" tabindex="0" aria-pressed="${quad === i}" aria-label="${QUADS[i].label}, ${QUADS[i].range}" d="M${C} ${C}L${xy(a0, 168)}A168 168 0 0 1 ${xy(a1, 168)}Z"/>`;
  }
  // rings for each group (faint guides) and the dial face
  out += RING.map(g => `<circle class="ring" cx="${C}" cy="${C}" r="${RR[g]}"/>`).join('');
  out += `<circle class="face" cx="${C}" cy="${C}" r="${R0}"/>`;
  for (let h = 0; h < 24; h++) { const a = ang(h / 24), big = h % 6 === 0; out += `<path class="tick${big ? ' big' : ''}" d="M${xy(a, R0 - (big ? 9 : 5))}L${xy(a, R0 - 1)}"/>`; }
  [['12 AM', 0], ['6 AM', 6], ['12 PM', 12], ['6 PM', 18]].forEach(([l, h]) => { const [x, y] = P(ang(h / 24), R0 - 20); out += `<text class="hl" x="${f1(x)}" y="${f1(y + 4)}" text-anchor="middle">${l}</text>`; });
  // sleep arcs
  for (const e of evs) if (e.type === 'sleep') {
    const s0 = Math.max(0, frac(e.ts)), s1 = Math.min(1, frac(e.end || Math.min(Date.now(), day + DAY)));
    if (s1 > s0) out += `<path class="sarc" d="${arc(ang(s0), ang(Math.max(s1, s0 + 0.004)), RR.sleep)}"/>`;
  }
  // rays + dots
  const all = dayKid() === 'all';
  for (const e of evs) {
    const g = groupOf(e.type).id, a = ang(frac(e.ts)), r = RR[g], [x, y] = P(a, r), [d] = describe(e), k = all ? kidById(childOf(e)) : null;
    out += `<g class="ray" data-edit="${e.id}" role="button" tabindex="0" aria-label="${esc(fmtTime(e.ts) + ' ' + TYPES[e.type].label + ': ' + d + (k ? ', ' + kidName(k) : ''))}" style="--c:var(--g-${g})">
      <title>${esc(fmtTime(e.ts) + ' · ' + d + (k ? ' · ' + kidName(k) : ''))}</title>
      <path d="M${xy(a, R0 + 1)}L${xy(a, r - 6)}"/><path class="hitl" d="M${xy(a, R0 + 4)}L${xy(a, r)}"/><circle class="hit" cx="${f1(x)}" cy="${f1(y)}" r="12"/><circle class="dot" cx="${f1(x)}" cy="${f1(y)}" r="6"${k ? ` style="stroke:${k.color}"` : ''}/></g>`;
  }
  // now
  if (day === startOfDay(Date.now())) { const a = ang(frac(Date.now())); out += `<path class="now" d="M${xy(a, 30)}L${xy(a, R0 - 4)}"/><circle class="nowdot" cx="${f1(P(a, R0 - 4)[0])}" cy="${f1(P(a, R0 - 4)[1])}" r="3"/>`; }
  const q = quad == null ? null : QUADS[quad];
  out += `<text class="ctr" x="${C}" y="${C - 2}" text-anchor="middle">${q ? q.label : evs.length}</text><text class="ctr2" x="${C}" y="${C + 14}" text-anchor="middle">${q ? 'selected' : (evs.length === 1 ? 'entry' : 'entries')}</text>`;
  const summary = GROUPS.map(gr => [gr.label, evs.filter(e => gr.types.includes(e.type)).length]).filter(x => x[1]).map(x => `${x[1]} ${x[0].toLowerCase()}`).join(', ');
  return `<svg class="clock" viewBox="0 0 340 340" role="group" aria-label="24-hour clock of the day${summary ? ': ' + esc(summary) : ', no entries'}">${out}</svg>`;
}
function clockLegend(evs) {
  return `<div class="clegend">${GROUPS.map(g => { const n = evs.filter(e => g.types.includes(e.type)).length; return `<span class="${n ? '' : 'zero'}"><i style="--c:var(--g-${g.id})"></i>${g.label} <b>${n}</b></span>`; }).join('')}</div>`;
}
/** One twirl-down per group (pee and poo together, sleep and night wakings together…), each with a one-line summary. */
const openGroups = new Set();
function groupSummary(g, list) {
  const n = list.length, plural = (x, w) => `${x} ${w}${x === 1 ? '' : 's'}`;
  switch (g.id) {
    case 'feed': { const ml = list.reduce((a, e) => a + (+e.data.ml || 0), 0); return plural(n, 'feed') + (ml ? ` · ${ml} ml` : ''); }
    case 'diaper': return `${plural(n, 'diaper')} · ${list.filter(e => e.data.pee).length} pee, ${list.filter(e => e.data.poo).length} poo`;
    case 'sleep': { const sl = list.filter(e => e.type === 'sleep'), w = list.length - sl.length, m = sl.reduce((a, e) => a + ((e.end || Date.now()) - e.ts) / MIN, 0); return [sl.length && `${plural(sl.length, 'sleep')} · ${fmtDur(m)}`, w && plural(w, 'night waking')].filter(Boolean).join(' · '); }
    case 'play': { const m = list.reduce((a, e) => a + (+e.data.min || 0), 0); return plural(n, 'time') + (m ? ` · ${fmtDur(m)}` : ''); }
    case 'health': { const h = list.filter(e => e.type === 'health').length; return [h && plural(h, 'note'), n - h && plural(n - h, 'medicine')].filter(Boolean).join(' · '); }
  }
  return plural(n, 'time');
}
function groupedList(evs, key = 'd') {
  return GROUPS.map(g => {
    const list = evs.filter(e => g.types.includes(e.type)); if (!list.length) return '';
    const id = key + g.id, warn = list.some(isWarn);
    return `<details class="grp ${warn ? 'alert' : ''}" data-grp="${id}" ${openGroups.has(id) ? 'open' : ''} style="--c:var(--g-${g.id})"><summary><span class="gi">${g.icon}</span><span class="gt"><b>${g.label}</b><small>${groupSummary(g, list)}</small></span><span class="chev" aria-hidden="true">›</span></summary>
      <div class="grows">${list.map(evRow).join('')}</div></details>`;
  }).join('');
}
/** Counts for one day, as small tiles. */
function dayCounts(evs, day) {
  const of = t => evs.filter(e => e.type === t), feeds = of('feed'), ml = feeds.reduce((a, e) => a + (+e.data.ml || 0), 0), dia = of('diaper');
  const sleeps = of('sleep'), mins = sleeps.reduce((a, e) => a + (Math.min(e.end || Date.now(), day + DAY) - Math.max(e.ts, day)) / MIN, 0), play = of('play').reduce((a, e) => a + (+e.data.min || 0), 0);
  const tiles = [['feed', '🍼', 'Feeds', feeds.length, ml ? `${ml} ml` : ''], ['diaper', '💧', 'Pee', dia.filter(e => e.data.pee).length, ''], ['poo', '💩', 'Poo', dia.filter(e => e.data.poo).length, ''],
    ['sleep', '😴', 'Sleep', sleeps.length ? fmtDur(mins) : 0, sleeps.length ? `${sleeps.length} ${sleeps.length === 1 ? 'sleep' : 'sleeps'}` : ''], ['sleep', '🌙', 'Night wakings', of('wake').length, ''],
    ['vomit', '🤮', 'Vomit', of('vomit').length, ''], ['play', '🧸', 'Play', play ? fmtDur(play) : of('play').length, ''], ['health', '🩺', 'Health notes', of('health').length, ''], ['health', '💊', 'Medicines', of('med').length, '']]
    .filter((t, i) => i < 4 || t[3]);
  return `<div class="tiles">${tiles.map(([g, ic, l, v, sub]) => `<div class="tile" style="--c:var(--g-${g})"><span class="tv">${ic} <b>${v}</b></span><span class="tl">${l}${sub ? `<small>${sub}</small>` : ''}</span></div>`).join('')}</div>`;
}
const kidTag = e => { if (dayKid() !== 'all') return ''; const k = kidById(childOf(e)); return `<span class="ktag" style="--k:${k.color}">${avatar(k)}${esc(kidName(k))}</span>`; };
const quickButtons = () => Sync.can('add')
  ? `<div class="quick" style="margin-bottom:10px">${Object.entries(TYPES).filter(([k]) => Sync.can('health') || (k !== 'health' && k !== 'med')).map(([k, t]) => `<button data-add="${k}" style="--cw:${Kids.rgba(t.color, 0.3)}"><b>${t.icon}</b>${t.label}</button>`).join('')}</div>` : '';
/** "added by Dad" – only when the log is shared and the person is known. */
const byLine = e => { const n = Sync.linked() && e.by ? Sync.nameOf(e.by) : ''; return n && n !== 'you' ? `<small>added by ${esc(n)}</small>` : ''; };
const isWarn = e => (e.type === 'health' && (e.data.symptoms || []).some(s => URGENT.includes(s))) || (e.type === 'diaper' && !!e.data.poo && STOOL_WARN.includes(e.data.color));
function evRow(e) {
  const [a, b] = describe(e), t = TYPES[e.type];
  return `<div class="card ev ${isWarn(e) ? 'alert' : ''}" style="--c:var(--${e.type})" data-edit="${e.id}">
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
    cells += `<button data-day="${t}" class="${t === viewDay ? 'sel' : ''} ${t === today ? 'today' : ''}" aria-label="${esc(fmtDate(t))}${evs.length ? ', ' + evs.length + ' entries' : ''}">${d}<span class="dots">${GROUPS.filter(g => evs.some(e => g.types.includes(e.type))).map(g => `<i class="dot" style="--c:var(--g-${g.id})"></i>`).join('')}</span></button>`;
  }
  return `
  <div class="datenav"><button data-month="-1" aria-label="Previous month">‹</button>
    <div class="d">${calMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
    <button data-month="1" aria-label="Next month">›</button></div>
  <div class="cal">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="h">${d}</div>`).join('')}${cells}</div>
  <div class="legend">${GROUPS.map(g => `<span><i style="--c:var(--g-${g.id})"></i>${g.label}</span>`).join('')}</div>
  ${monthDay()}`;
}

function monthDay() {
  const evs = eventsOnDay(viewDay);
  return `<h2>${fmtDate(viewDay)}</h2>
  ${evs.length ? `${dayCounts(evs, viewDay)}<details class="more" data-grp="mAll" ${openGroups.has('mAll') ? 'open' : ''}><summary>All entries for this day<span class="chev" aria-hidden="true">›</span></summary>${groupedList(evs, 'm')}</details>` : '<div class="empty">No entries this day.</div>'}
  ${quickButtons()}`;
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
    wakes: of('wake').length, vomit: of('vomit').length, play: of('play').reduce((a, e) => a + (+e.data.min || 0), 0), health: of('health').length, meds: of('med').length,
    feedTimes: feeds.map(e => e.ts),
  };
}
function feedGaps(list) {
  const t = list.flatMap(s => s.feedTimes).sort((a, b) => a - b), g = [];
  for (let i = 1; i < t.length; i++) { const x = (t[i] - t[i - 1]) / MIN; if (x < 12 * 60) g.push(x); }
  return g;
}
/** A round "nice" top for a chart axis. */
const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
/** A day-by-day bar chart drawn to scale. `series`: [{ name, color (a CSS colour), values: [number per day] }].
    `mode`: 'stack' (parts of one total) or 'group' (side by side). Each bar can be tapped for its numbers; a table sits under it. */
function chart(days, series, { fmt = v => String(v), unit = '', mode = 'stack' } = {}) {
  const W = 320, H = 132, L = 30, B = 18, T = 8, n = days.length, band = (W - L) / n;
  const tot = i => (mode === 'stack' ? series.reduce((a, s) => a + s.values[i], 0) : Math.max(...series.map(s => s.values[i])));
  const max = niceMax(Math.max(0, ...days.map((_, i) => tot(i)))), y = v => T + (H - T - B) * (1 - v / max);
  const lbl = d => (n <= 14 ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(d).getDay()] : (new Date(d).getDate() % 5 === 0 ? String(new Date(d).getDate()) : ''));
  const bar = (x, w, y0, y1, top) => { const h = y0 - y1; if (h <= 0) return ''; const r = top ? Math.min(4, w / 2, h) : 0; return `M${x.toFixed(1)} ${y0.toFixed(1)}V${(y1 + r).toFixed(1)}${r ? `q0 -${r} ${r} -${r}h${(w - 2 * r).toFixed(1)}q${r} 0 ${r} ${r}` : `h${w.toFixed(1)}`}V${y0.toFixed(1)}Z`; };
  let g = [0, max / 2, max].map(v => `<path class="grid" d="M${L} ${y(v).toFixed(1)}H${W}"/><text class="ax" x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${fmt(Math.round(v * 10) / 10)}</text>`).join('');
  days.forEach((d, i) => {
    const x0 = L + i * band, tip = `${fmtDate(d)}: ${series.map(s => `${fmt(s.values[i])}${unit} ${s.name}`).join(', ')}`;
    let shapes = '';
    if (mode === 'stack') {
      const w = Math.max(2, band * 0.62), x = x0 + (band - w) / 2; let acc = 0;
      series.forEach((s, k) => { const v = s.values[i]; if (!v) return; const y0 = y(acc) - (acc ? 2 : 0), y1 = y(acc + v); acc += v; const last = !series.slice(k + 1).some(t => t.values[i]); shapes += `<path d="${bar(x, w, y0, y1, last)}" fill="${s.color}"/>`; });
    } else {
      const w = Math.max(1.5, (band * 0.7 - (series.length - 1) * 2) / series.length);
      series.forEach((s, k) => { const v = s.values[i]; if (v) shapes += `<path d="${bar(x0 + band * 0.15 + k * (w + 2), w, y(0), y(v), true)}" fill="${s.color}"/>`; });
    }
    g += `<g class="bar" data-tip="${esc(tip)}"><title>${esc(tip)}</title><rect class="hit" x="${x0.toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${H - T - B}"/>${shapes}</g>`;
    const t = lbl(d); if (t) g += `<text class="ax" x="${(x0 + band / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${t}</text>`;
  });
  const legend = series.length > 1 ? `<div class="clegend">${series.map(s => `<span><i style="--c:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  const table = `<details class="tbl"><summary>Numbers<span class="chev" aria-hidden="true">›</span></summary><div class="tw"><table><thead><tr><th>Day</th>${series.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${days.map((d, i) => `<tr><td>${esc(new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))}</td>${series.map(s => `<td>${fmt(s.values[i])}${unit}</td>`).join('')}</tr>`).reverse().join('')}</tbody></table></div></details>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.name).join(' and '))} per day, last ${n} days">${g}</svg>${legend}${table}`;
}
function statsView() {
  const today = startOfDay(Date.now());
  const days = Array.from({ length: statDays }, (_, i) => addDays(today, i - statDays + 1));
  const S = days.map(dayStats);
  // Ignore days before anything was logged so averages aren't dragged down.
  const mine = scoped(), firstLog = mine.length ? Math.min(...mine.map(e => e.ts)) : today;
  const used = S.filter(s => s.day + DAY > firstLog);
  const sum = k => used.reduce((a, s) => a + s[k], 0), per = k => used.length ? r1(sum(k) / used.length) : 0;
  const gaps = feedGaps(S);
  const card = (title, rows, ch, cls = '') => `<div class="card scard ${cls}"><b>${title}</b>${rows.map(([n, v, sm]) => `<div class="stat"><span>${n}${sm ? `<br><small>${sm}</small>` : ''}</span><b>${v}</b></div>`).join('')}${ch || ''}</div>`;
  const flagged = mine.filter(e => e.type === 'health' && e.ts >= addDays(today, -statDays + 1) && (e.data.symptoms || []).length).sort((a, b) => b.ts - a.ts);
  const sym = {}; flagged.forEach(e => e.data.symptoms.forEach(s => sym[s] = (sym[s] || 0) + 1));
  const poo = {}; mine.filter(e => e.type === 'diaper' && e.data.poo && e.ts >= addDays(today, -statDays + 1) && e.data.color).forEach(e => poo[e.data.color] = (poo[e.data.color] || 0) + 1);
  const lowWet = used.length && per('pee') < 6 && ageDays() >= 5;
  return `
  <div class="seg">${[7, 14, 30].map(n => `<button data-range="${n}" class="${n === statDays ? 'on' : ''}">${n} days</button>`).join('')}</div>
  ${kids().length > 1 ? `<h2>${esc(kidName(kidById(viewKid())))}</h2>` : ''}
  ${mine.length ? '' : '<div class="empty">Log a few entries and your stats will show up here.</div>'}
  ${lowWet ? '<div class="card alert">⚠️ Fewer than 6 wet diapers/day on average. After the first week this can signal low intake – worth mentioning to your pediatrician.</div>' : ''}
  ${card('🍼 Feeding', [['Feeds per day', per('feeds')], ['Avg time between feeds', gaps.length ? fmtDur(avg(gaps)) : '–'], ['Bottle ml per day', per('ml') || '–']],
    chart(days, [{ name: 'feeds', color: 'var(--g-feed)', values: S.map(s => s.feeds) }]) + (sum('ml') ? `<p class="ch">Bottle ml per day</p>${chart(days, [{ name: 'ml', color: 'var(--g-feed)', values: S.map(s => s.ml) }])}` : ''))}
  ${card('💧 Diapers', [['Pee per day', per('pee')], ['Poo per day', per('poo')], ...(Object.keys(poo).length ? [['Poo colours', Object.entries(poo).map(([k, v]) => `${k} ×${v}`).join(', ')]] : [])],
    chart(days, [{ name: 'pee', color: 'var(--g-diaper)', values: S.map(s => s.pee) }, { name: 'poo', color: 'var(--g-poo)', values: S.map(s => s.poo) }], { mode: 'group' }))}
  ${card('😴 Sleep', [['Sleep per day', fmtDur(avg(used.map(s => s.sleep)))], ['Longest stretch (avg)', fmtDur(avg(used.map(s => s.longest)))], ['Naps/sleeps per day', per('naps')], ['Night wakings per day', per('wakes')]],
    chart(days, [{ name: 'hours asleep', color: 'var(--g-sleep)', values: S.map(s => r1(s.sleep / 60)) }], { fmt: v => v + 'h' }) + `<p class="ch">Night wakings per day</p>${chart(days, [{ name: 'night wakings', color: 'var(--g-sleep)', values: S.map(s => s.wakes) }])}`)}
  ${card('🤮 Vomit', [['Total', sum('vomit')], ['Per day', per('vomit')]], chart(days, [{ name: 'vomits', color: 'var(--g-vomit)', values: S.map(s => s.vomit) }]))}
  ${card('🧸 Play', [['Play per day', fmtDur(per('play'))]], chart(days, [{ name: 'minutes of play', color: 'var(--g-play)', values: S.map(s => s.play) }], { fmt: v => v + 'm' }))}
  ${Sync.can('health') ? card('🩺 Health & meds', Object.keys(sym).length ? Object.entries(sym).map(([k, v]) => [esc(k), v + '×']) : [['Health notes', 'none']],
    chart(days, [{ name: 'health notes', color: 'var(--g-health)', values: S.map(s => s.health) }, { name: 'medicines', color: 'var(--g-meds)', values: S.map(s => s.meds) }]), flagged.length ? 'alert' : '') : ''}
  <p class="note">Stats are for your own tracking and are not medical advice. If something worries you, call your pediatrician. Call emergency services for blue lips/face, trouble breathing, or a baby who is hard to wake.</p>`;
}
function ageDays() { const k = kidById(viewKid()); return k && k.birth ? Math.floor((Date.now() - new Date(k.birth + 'T00:00').getTime()) / DAY) : 99; }

// ---------- Guide ----------
function doctorHtml() {
  const d = (db.baby.doctor || {}), set = d.name || d.phone || d.practice;
  return `<button class="docbtn" id="docBtn"><span class="di">🩺</span><span><b>Pediatrician</b><small>${set ? esc([d.name, d.practice].filter(Boolean).join(' · ')) + (d.phone ? ' · ' + esc(d.phone) : '') : 'Add their name and number'}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}
function guideView() {
  const ks = [kidById(viewKid())].filter(k => k && k.birth), now = Date.now();
  const cur = ks.map(k => [k, Guide.monthsOld(k.birth, now)]).filter(([, m]) => m >= 0);
  const ms = Object.entries(Guide.MILESTONES);
  return `${doctorHtml()}
  <p class="note emer"><b>Emergency?</b> Call 911 (or your local emergency number) for blue lips or face, trouble breathing, a baby who is hard to wake, or a seizure.</p>
  ${cur.length ? `<h2>Right now</h2>${cur.map(([k, m]) => { const key = ms.map(([n]) => +n).filter(n => n <= Math.max(1, m)).pop() || 1, M = Guide.MILESTONES[key];
    return `<div class="card nowcard" style="--k:${k.color}">${kids().length > 1 ? avatar(k) + ' ' : ''}<b>${esc(kidName(k))} is ${m < 1 ? (w => `${w} week${w === 1 ? '' : 's'}`)(Math.max(0, Math.floor((now - new Date(k.birth + 'T00:00').getTime()) / DAY / 7))) : `${m} month${m === 1 ? '' : 's'}`} old</b>
      <p class="note">${m < 1 ? 'The first month is mostly feeding, sleeping and getting to know each other. Here is what is common around one month:' : `Around ${M.title}:`}</p><ul>${M.does.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`; }).join('')}` : ''}
  <h2>Common with newborns</h2>
  ${Guide.COMMON.map(c => `<details class="gd" data-grp="g${c.id}" ${openGroups.has('g' + c.id) ? 'open' : ''}><summary><span class="gi">${c.icon}</span><span class="gt"><b>${esc(c.title)}</b></span><span class="chev" aria-hidden="true">›</span></summary>
    <p>${esc(c.body)}</p>${c.call ? `<p class="call">${esc(c.call)}</p>` : ''}</details>`).join('')}
  <h2>Month by month</h2>
  ${ms.map(([n, M]) => milestoneDetails(+n, M)).join('')}
  <p class="note">General information from AAP and CDC parent guidance, not medical advice. Every baby develops at their own pace; if your baby was born early, count from the due date. If you're ever worried, call your pediatrician, you don't need to wait for a checkup.</p>`;
}
const milestoneBody = M => `${M.does.length ? `<p class="mh">What many babies do</p><ul>${M.does.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${M.notice.length ? `<p class="mh">What parents often notice</p><ul>${M.notice.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${M.visit ? `<p class="mh">Checkup</p><p>${esc(M.visit)}</p>` : ''}${M.ask ? `<p class="call">${esc(M.ask)}</p>` : ''}`;
const milestoneDetails = (n, M) => `<details class="gd" data-grp="m${n}" ${openGroups.has('m' + n) ? 'open' : ''}><summary><span class="gi">🌟</span><span class="gt"><b>${esc(M.title)}</b></span><span class="chev" aria-hidden="true">›</span></summary>${milestoneBody(M)}</details>`;
/** A small sheet for things that aren't entries (pediatrician, milestones). */
function popup(html) {
  const S = $('#sheet'), back = $('#sheetBack'); S.innerHTML = html; S.onchange = null; Icons.paint(S); S.hidden = back.hidden = false;
  const close = () => { S.hidden = back.hidden = true; }; back.onclick = close; S.querySelectorAll('[data-close]').forEach(b => b.onclick = close); return close;
}
function openDoctor(edit) {
  const d = Guide.cleanDoctor(db.baby.doctor), can = Sync.can('profile');
  const line = (label, v, call) => (v ? `<div class="stat"><span>${label}<br><b class="sel">${esc(v)}</b></span>${call && Guide.tel(v) ? `<a class="btn callbtn" href="${esc(Guide.tel(v))}">📞 Call</a>` : ''}</div>` : '');
  if (!edit) {
    const info = [line('Doctor', d.name), line('Practice', d.practice), line('Phone', d.phone, true), line('After hours / nurse line', d.after, true), line('Address', d.address), line('Notes', d.notes)].join('');
    const close = popup(`<h3>🩺 Pediatrician</h3>${info || `<p class="note">No pediatrician saved yet.${can ? ' Add their details so everyone looking after the baby has the number.' : ' A parent can add them.'}</p>`}
      <div class="row" style="margin-top:16px"><button class="btn" data-close>Close</button>${can ? `<button class="btn p" id="docEdit">${info ? 'Edit' : 'Add details'}</button>` : ''}</div>`);
    if ($('#docEdit')) $('#docEdit').onclick = () => { close(); openDoctor(true); };
    return;
  }
  const f = (id, label, v, max, type = 'text') => `<label class="f">${label}</label><input id="${id}" type="${type}" maxlength="${max}" value="${esc(v)}"${type === 'tel' ? ' inputmode="tel"' : ''}>`;
  const close = popup(`<h3>🩺 Pediatrician</h3><p class="note">Shared with everyone in the log, end-to-end encrypted.</p>
    ${f('dcName', 'Doctor', d.name, 60)}${f('dcPractice', 'Practice or clinic', d.practice, 80)}${f('dcPhone', 'Phone', d.phone, 30, 'tel')}${f('dcAfter', 'After hours / nurse line', d.after, 30, 'tel')}${f('dcAddr', 'Address', d.address, 120)}
    <label class="f">Notes</label><textarea id="dcNotes" rows="2" maxlength="200">${esc(d.notes)}</textarea>
    <div class="row" style="margin-top:16px"><button class="btn" data-close>Cancel</button><button class="btn p" id="dcSave">Save</button></div>`);
  $('#dcSave').onclick = () => {
    db.baby.doctor = Guide.cleanDoctor({ name: $('#dcName').value, practice: $('#dcPractice').value, phone: $('#dcPhone').value, after: $('#dcAfter').value, address: $('#dcAddr').value, notes: $('#dcNotes').value });
    Sync.linked() ? Sync.pushBaby() : save(); close(); render(); toast('Saved');
  };
}
/** Once a month, on each child's "month birthday", a sheet with what's common at that age. Remembered per phone. */
function milestoneCheck() {
  if (!$('#sheet').hidden || Acct.gate()) return;
  const seen = db.meta.ms || (db.meta.ms = {});
  const due = kids().map(k => [k, Guide.monthsOld(k.birth)]).filter(([k, m]) => Guide.MILESTONES[m] && (seen[k.id] || 0) < m);
  if (!due.length) return;
  // twins and triplets reach the same month together: one sheet for all of them
  const m = due[0][1], M = Guide.MILESTONES[m], who = due.filter(x => x[1] === m).map(x => x[0]);
  who.forEach(k => { seen[k.id] = m; }); Store.save(db);
  const names = who.map(kidName), list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  popup(`<h3>🌟 ${esc(list)} ${who.length > 1 ? 'are' : 'is'} ${M.title} old</h3><p class="note">Every baby is different; this is what's common around now.</p>${milestoneBody(M)}
    <div class="row" style="margin-top:16px"><button class="btn" data-close>Close</button><button class="btn p" id="msGuide">More in the Guide</button></div>`);
  $('#msGuide').onclick = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; tab = 'guide'; render(); window.scrollTo(0, 0); };
}

// ---------- More ----------
/** One block per child: name, birth date, boy/girl and colour. Only people who may edit the profile can change them. */
function kidsHtml() {
  const can = Sync.can('profile'), ks = kids(), dis = can ? '' : 'disabled';
  return `<div class="card"><b>${ks.length > 1 ? 'Children' : 'Baby'}</b>${can ? '' : '<p class="note">Only parents can change these.</p>'}
    ${ks.map(k => `<div class="kidrow" style="--k:${k.color}">
      <div class="kh">${avatar(k, 'lg')}<input type="text" data-kn="${k.id}" maxlength="60" value="${esc(k.name)}" placeholder="Name" aria-label="Name" ${dis}></div>
      <label class="f">Birth date</label><input type="date" data-kb="${k.id}" value="${esc(k.birth)}" ${dis}>
      <label class="f">Boy or girl</label><div class="chips">${chip('ks-' + k.id, 'boy', 'Boy', k.sex === 'boy', '', true)}${chip('ks-' + k.id, 'girl', 'Girl', k.sex === 'girl', '', true)}${chip('ks-' + k.id, '', 'Not set', !k.sex, '', true)}</div>
      <label class="f">Formula <small>(if they have formula)</small></label><input type="text" data-kf="${k.id}" maxlength="60" value="${esc(k.formula || '')}" placeholder="Brand and type, e.g. Similac 360 Total Care" ${dis}>
      <label class="f">Colour</label><div class="swatches" role="radiogroup" aria-label="Colour">${Kids.swatches(k.sex).map(c => `<button type="button" class="sw ${c === k.color ? 'on' : ''}" data-kc="${k.id}" data-c="${c}" style="--k:${c}" role="radio" aria-checked="${c === k.color}" aria-label="${c}" ${dis}>${c === k.color ? '✓' : ''}</button>`).join('')}</div>
      ${can && ks.length > 1 ? `<button class="btn d" data-krm="${k.id}" style="margin-top:12px">Remove ${esc(kidName(k))}</button>` : ''}</div>`).join('')}
    ${can && ks.length < Kids.MAX ? '<button class="btn" id="kAdd" style="width:100%;margin-top:6px">+ Add a child</button>' : ''}</div>`;
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
  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { viewDay = addDays(viewDay, +b.dataset.nav); quad = null; render(); });
  document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { viewDay = +b.dataset.day; quad = null; render(); });
  document.querySelectorAll('[data-month]').forEach(b => b.onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + +b.dataset.month, 1); render(); });
  document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { statDays = +b.dataset.range; render(); });
  document.querySelectorAll('[data-quad]').forEach(b => b.onclick = () => { quad = quad === +b.dataset.quad ? null : +b.dataset.quad; render(); });
  document.querySelectorAll('[data-quadclear]').forEach(b => b.onclick = () => { quad = null; render(); });
  document.querySelectorAll('details[data-grp]').forEach(d => d.ontoggle = () => { d.open ? openGroups.add(d.dataset.grp) : openGroups.delete(d.dataset.grp); });
  document.querySelectorAll('.bar[data-tip]').forEach(b => b.onclick = () => toast(b.dataset.tip));
  document.querySelectorAll('svg [role=button]').forEach(b => b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  if ($('#docBtn')) $('#docBtn').onclick = () => openDoctor(false);
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
  document.querySelectorAll('[data-kf]').forEach(i => i.onchange = () => { const k = K(i.dataset.kf); if (k && Sync.can('profile')) { k.formula = i.value.trim().slice(0, 60); commit('Saved'); } });
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
    <div id="fBottle"><label class="f">Amount (ml)</label>${num('ml', d.ml, 'e.g. 90')}<label class="f">Milk</label>${radios('milk', ['Breast milk', 'Formula'], d.milk)}
      <div id="fFormula"><label class="f">Which formula</label><input id="formula" type="text" maxlength="60" value="${esc(ev ? d.formula || '' : ((kidById(ev ? childOf(ev) : (dayKid() === 'all' ? '' : dayKid())) || kids()[0]).formula || ''))}" placeholder="e.g. Similac 360 Total Care"></div></div>`;
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
    if (type === 'feed' && $('#fBreast')) { const b = val('kind') === 'bottle'; $('#fBreast').hidden = b; $('#fBottle').hidden = !b; $('#fFormula').hidden = val('milk') !== 'Formula'; }
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
    if (type === 'feed') data = val('kind') === 'bottle' ? { kind: 'bottle', ml: n('#ml'), milk: val('milk'), ...(val('milk') === 'Formula' && $('#formula').value.trim() ? { formula: $('#formula').value.trim().slice(0, 60) } : {}) } : { kind: 'breast', side: val('side'), min: n('#min') };
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
