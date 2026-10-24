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
const fmtShort = t => new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const toLocalInput = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = v => new Date(v).getTime();
const fmtDur = m => { m = Math.round(m); if (m < 60) return `${m}m`; return `${Math.floor(m / 60)}h ${m % 60 ? m % 60 + 'm' : ''}`.trim(); };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const r1 = n => Math.round(n * 10) / 10;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, Math.max(2200, String(msg).length * 60)); }   // longer messages stay longer

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
    case 'trip': return [`Trip ${Travel.MEANS[Travel.meansOf(e)].by}`, `${fmtShort(e.ts)} – ${fmtShort(Travel.ends(e) - 1)}`];
    case 'leg': return [Travel.MEANS[Travel.meansOf(e)].moving, Number.isFinite(e.end) ? fmtDur((e.end - e.ts) / MIN) : 'under way'];
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
const scoped = () => { const k = dayKid(), log = db.events.filter(e => !Travel.isTravel(e.type)); return k === 'all' ? log : log.filter(e => childOf(e) === k); };
const eventsOnDay = day => scoped().filter(e => e.ts >= day && e.ts < day + DAY).sort((a, b) => a.ts - b.ts);
const activeSleep = id => db.events.find(e => e.type === 'sleep' && !e.end && (!id || childOf(e) === id));
const initial = k => esc([...kidName(k)][0] || '?').toUpperCase();
const avatar = (k, cls = '') => `<span class="av ${cls}" style="--k:${k.color}">${initial(k)}</span>`;
const dark = () => Theme.isDark();   // light or dark, as chosen in More → Appearance (theme.js)
/** Colours the whole app in the open child's colour (set as plain hex, so no modern CSS colour functions are needed). */
function theme() {
  const k = kidById(dayKid()), strong = k ? k.color : '#64759f', dk = dark(), R = document.documentElement.style, set = (n, v) => R.setProperty(n, v);
  const trip = tab === 'day' ? tripOn(viewDay) : null, accent = dk ? Travel.ACCENT.dark : Travel.ACCENT.light;
  const brand = dk ? Kids.mix(strong, '#ffffff', 0.38) : strong, wash = trip ? accent : brand;
  set('--brand', brand); set('--on-brand', dk ? '#1d1b19' : '#ffffff'); set('--trip', accent);
  set('--wash1', Kids.rgba(wash, dk ? 0.22 : 0.20)); set('--wash2', Kids.rgba(wash, dk ? 0.12 : 0.10)); set('--wash3', Kids.rgba(wash, dk ? 0.07 : 0.05));
  for (const [n, v] of paletteVars(trip ? Travel.PALETTE : GCOLOR, dk)) set(n, v);
  document.body.classList.toggle('travel', !!trip);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dk ? '#1d1b19' : Kids.mix(brand, '#ffffff', 0.86);
}

/** The colour variables of a palette (the home set, or the travel set) for light or dark. */
function paletteVars(P, dk) {
  const G = P[dk ? 'dark' : 'light'], v = GROUPS.map(g => [`--g-${g.id}`, G[g.id]]);
  v.push(['--g-poo', G.poo], ['--g-meds', Kids.mix(G.health, dk ? '#1d1b19' : '#ffffff', 0.45)]);
  for (const t of Object.keys(TYPES)) { const c = G[groupOf(t).id]; v.push([`--${t}`, c], [`--${t}-ink`, dk ? Kids.mix(c, '#ffffff', 0.3) : Kids.mix(c, INK, 0.25)]); }
  v.push(['--poo-ink', P === GCOLOR ? (dk ? '#d0b080' : '#7d5a2c') : G.poo]);
  return v;
}
/** Inline style that colours a block in the travel set (a travel day shown outside the travel page, as in the month view). */
const travelVars = () => paletteVars(Travel.PALETTE, dark()).map(([n, v]) => `${n}:${v}`).join(';');

// ---------- Rendering ----------
function syncLine() { const e = $('#syncLine'); e.textContent = Acct.syncLine(); Icons.paint(e); }
function render() {
  if (voyageFirst()) return;   // travel mode is switching: the page changes under the journey in a moment
  document.querySelectorAll('#view details[data-grp]').forEach(d => { d.open ? openGroups.add(d.dataset.grp) : openGroups.delete(d.dataset.grp); });   // keep twirl-downs as the user left them
  if (tab !== 'guide') openGroups.forEach(g => { if (g.startsWith('pix')) openGroups.delete(g); });   // except the Guide's pictures: hidden again next time
  const multi = kids().length > 1, vk = kidById(dayKid()), single = kids()[0];
  theme();
  $('#title').textContent = dayKid() === 'all' ? 'Everyone' : (vk && vk.name ? `${vk.name}'s Log` : (multi ? `${kidName(vk)}'s Log` : 'Little Log'));
  $('#av').innerHTML = vk ? avatar(vk) : ''; $('#av').hidden = !vk;
  const g = Acct.gate();
  document.body.classList.toggle('gated', !!g); $('#helpBtn').hidden = !!g;
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
  milestoneCheck(); autoTour();
}

function dayView() {
  const evs = eventsOnDay(viewDay), isToday = viewDay === startOfDay(Date.now()), twelve = face12(), trip = tripOn(viewDay), TM = trip && Travel.MEANS[Travel.meansOf(trip)];
  const sp = clockSpan(viewDay), shown = evs.filter(e => e.ts >= sp.start && e.ts < sp.start + sp.len);
  const q = quad == null ? null : quadInfo(quad, viewDay), inQ = q ? evs.filter(e => e.ts >= q.start && e.ts < q.end) : null;
  const seg = (attr, opts, cur, label) => `<div class="seg mini" role="group" aria-label="${label}">${opts.map(([v, l]) => `<button data-${attr}="${v}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
  return `${trip ? tripCard(trip) : ''}
  <div class="datenav"><button data-nav="-1" aria-label="Previous day">‹</button>
    <div class="d">${isToday ? 'Today' : fmtDate(viewDay)}<small>${isToday ? fmtDate(viewDay) : ''}${ageText(viewDay)}</small></div>
    <button data-nav="1" aria-label="Next day" ${isToday ? 'disabled' : ''}>›</button></div>
  ${trip && isToday ? travelQuick() : quickButtons()}
  <div class="clockwrap" style="${GROUPS.map(g => `--g-${g.id}:${(trip ? Travel.PALETTE : GCOLOR).light[g.id]}`).join(';')};--trip:${Travel.ACCENT.light}">${clockSvg(shown, viewDay)}
    <div class="clockctl">${seg('face', [['24', '24 h'], ['12', '12 h']], twelve ? '12' : '24', 'Clock face')}${twelve ? seg('half', [['0', 'AM'], ['1', 'PM']], String(half), 'Half of the day') : ''}${trip ? `<span class="artbtn tripart">${TM.icon} ${esc(Art.byId(TM.art).name)}</span>` : `<button class="artbtn" data-art>🎨 ${esc(Art.byId(artOf()).name)}</button>`}</div>
    ${clockLegend(shown)}
    <p class="note hint">${twelve ? `Showing ${half ? 'noon to midnight' : 'midnight to noon'}; switch AM and PM for the other half of the day.` : 'Midnight is at the top, noon at the bottom.'} Tap a dot to open an entry, or a quarter of the dial for just those hours.</p></div>
  ${q ? `<div class="card quadlist"><div class="qhead"><span><b>${q.label}</b> <small>${q.range} · ${inQ.length} ${inQ.length === 1 ? 'entry' : 'entries'}</small></span><button class="btn" data-quadclear style="padding:6px 12px">Whole day</button></div>
      ${inQ.length ? inQ.map(evRow).join('') : '<div class="empty">Nothing in these hours.</div>'}</div>`
    : (evs.length ? `<h2>Details</h2>${groupedList(evs)}` : `<div class="empty">Nothing logged yet.${Sync.can('add') ? '<br>Tap a button above to add an entry.' : ''}</div>`)}
  ${!trip && isToday ? tripButton() : ''}`;
}

// ---------- Day clock ----------
// A French carriage clock: a gilt case with fluted columns, and a painted porcelain panel with a 24-hour dial on it (midnight at the
// top under the moon, noon at the bottom under the sun). Every entry is a ray from the centre to the hour it happened, ending in a dot
// on its group's ring; sleep also shows as an arc for how long it lasted. The painting is chosen per child (Clock art).
// The face can also be a classic 12-hour one (Clock face: 24 h / 12 h, kept on this phone). A 12-hour face shows half the day at a time,
// AM or PM, so morning and evening entries never sit on top of each other; on today it has an hour and a minute hand.
let quad = null, half = new Date().getHours() >= 12 ? 1 : 0;   // the chosen quarter of the dial; which half a 12-hour face shows
const HOUR = 3600e3;
const face12 = () => db.meta.clock === '12';
/** The time the dial covers: the whole day (24-hour face) or its AM or PM half (12-hour face). */
const clockSpan = day => (face12() ? { start: day + half * 12 * HOUR, len: 12 * HOUR } : { start: day, len: DAY });
const QUAD_NAMES = { day: ['Night', 'Morning', 'Afternoon', 'Evening'], am: ['Late night', 'Early morning', 'Morning', 'Late morning'], pm: ['Early afternoon', 'Late afternoon', 'Evening', 'Night'] };
const fmtHour = t => new Date(t).toLocaleTimeString([], { hour: 'numeric' });
/** A quarter of the dial: 6 hours on the 24-hour face, 3 hours on the 12-hour one. */
function quadInfo(i, day) {
  const sp = clockSpan(day), q = sp.len / 4, start = sp.start + i * q;
  return { label: QUAD_NAMES[face12() ? (half ? 'pm' : 'am') : 'day'][i], range: `${fmtHour(start)} – ${fmtHour(start + q)}`, start, end: start + q };
}
const ART_ORDER = ['blossom', 'ocean', 'forest', 'maple', 'mountains', 'garden', 'night', 'classic'];
/** The painting on a page: chosen on this phone, or a different default for each child. */
function artOf(id = dayKid()) {
  const m = db.meta.art || {};
  if (m[id] && Art.byId(m[id]).id === m[id]) return m[id];
  if (id === 'all') return 'garden';
  const i = kids().findIndex(k => k.id === id);
  return ART_ORDER[Math.max(0, i) % ART_ORDER.length];
}
function setArt(id, theme) { (db.meta.art || (db.meta.art = {}))[id] = theme; Store.save(db); }
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
function clockSvg(evs, day) {
  // The frame is a carriage-clock outline in thin soft-gold lines, like the lines of the dial, so the dial stays the focus. The painting
  // is a picture drawn once and reused. The dial is a plain white face with a black rim, the same in light and dark mode, so the entries
  // on it always read the same way.
  const trip = tab === 'day' ? tripOn(day) : null, th = Art.byId(trip ? Travel.MEANS[Travel.meansOf(trip)].art : artOf()), dk = dark(), F = Art.FRAME, K = F.k, PW = Art.W * K, PH = Art.H * K;
  const C = { x: F.x + Art.DIAL.x * K, y: F.y + Art.DIAL.y * K }, RD = Art.DIAL.r * K, rr = r => r * K;
  const RR = { sleep: rr(90), feed: rr(78), diaper: rr(66), vomit: rr(54), play: rr(42), health: rr(30) };
  const sp = clockSpan(day), twelve = face12(), frac = t => (t - sp.start) / sp.len, ang = fr => fr * 2 * Math.PI - Math.PI / 2, P = (a, r) => [C.x + r * Math.cos(a), C.y + r * Math.sin(a)];
  const f1 = n => n.toFixed(1), xy = (a, r) => P(a, r).map(f1).join(' ');
  const arc = (a0, a1, r) => `M${xy(a0, r)}A${f1(r)} ${f1(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${xy(a1, r)}`;
  const ink = '#1f1b16', gilt = '#b8862b', gold = dk ? '#8f7c55' : '#c8aa6e';
  const pic = (cls, attr, u) => `<image class="${cls}" ${attr} preserveAspectRatio="none"${u ? ` href="${u}" xlink:href="${u}"` : ''}/>`;
  const fill = (sel, p) => p.then(u => document.querySelectorAll(sel).forEach(im => { im.setAttribute('href', u); im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', u); }));
  const artUrl = Art.peek(th.id);
  if (!artUrl) fill(`.clock image.art[data-theme="${th.id}"]`, Art.url(th.id));
  const box = (x, y, w, h, r = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
  const frame = `<g class="frame" fill="none" stroke="${gold}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M101 36V17Q101 12 106 12H234Q239 12 239 17V36"/><path d="M21 34V36M319 34V36"/><circle cx="21" cy="31" r="3"/><circle cx="319" cy="31" r="3"/>
    ${box(9, 36, 322, 12)}${box(9, 406, 322, 12)}${box(14, 48, 14, 358, 1.5)}${box(312, 48, 14, 358, 1.5)}<path d="M14 418Q21 427 28 418M312 418Q319 427 326 418"/>
    <path d="M14 42H326M14 412H326M21 52V402M319 52V402" stroke-width=".6" stroke-opacity=".75"/></g>`;
  const panel = `<clipPath id="cc-panel"><rect x="${F.x}" y="${F.y}" width="${f1(PW)}" height="${f1(PH)}" rx="2.5"/></clipPath>
    <g clip-path="url(#cc-panel)"><rect x="${F.x}" y="${F.y}" width="${f1(PW)}" height="${f1(PH)}" fill="${th.base}"/>${pic('art', `data-theme="${th.id}" x="${F.x}" y="${F.y}" width="${f1(PW)}" height="${f1(PH)}"`, artUrl)}${dk ? `<rect x="${F.x}" y="${F.y}" width="${f1(PW)}" height="${f1(PH)}" fill="#120f0b" opacity=".3"/>` : ''}</g>
    <rect x="${F.x}" y="${F.y}" width="${f1(PW)}" height="${f1(PH)}" rx="2.5" fill="none" stroke="${gold}" stroke-width=".8"/>`;
  let dial = `<circle class="face" cx="${C.x}" cy="${f1(C.y)}" r="${f1(RD)}" fill="${dk ? '#f1ece3' : '#fffdf8'}"/><circle class="rim" cx="${C.x}" cy="${f1(C.y)}" r="${f1(RD)}" fill="none" stroke="${ink}" stroke-width="1.6"/>`;
  // railway minute track and the hours. 24-hour face: Roman numerals on the even hours, a moon at midnight and a sun at noon.
  // 12-hour face: all twelve numerals, with a.m. or p.m. under the centre.
  dial += `<circle cx="${C.x}" cy="${f1(C.y)}" r="${f1(rr(112))}" fill="none" stroke="${ink}" stroke-opacity=".7" stroke-width=".6"/><circle cx="${C.x}" cy="${f1(C.y)}" r="${f1(rr(118))}" fill="none" stroke="${ink}" stroke-opacity=".7" stroke-width=".6"/>`;
  let ticks = '';
  const marks = twelve ? 60 : 96, every = twelve ? 5 : 4;
  for (let q = 0; q < marks; q++) { const a = ang(q / marks), hr = q % every === 0; ticks += `M${xy(a, rr(hr ? 110 : 112))}L${xy(a, rr(hr ? 120 : 118))}`; }
  dial += `<path d="${ticks}" stroke="${ink}" stroke-opacity=".75" stroke-width=".7"/>`;
  if (twelve) {
    for (let h = 1; h <= 12; h++) { const [x, y] = P(ang(h / 12), rr(101)); dial += `<text class="num" transform="translate(${f1(x)} ${f1(y)}) rotate(${h * 30})" text-anchor="middle" dy=".36em" fill="${ink}">${h === 12 ? 'XII' : ROMAN[h]}</text>`; }
    dial += `<text class="ampm" x="${C.x}" y="${f1(C.y + rr(15))}" text-anchor="middle" fill="${ink}">${half ? 'p.m.' : 'a.m.'}</text>`;
  } else for (let h = 0; h < 24; h += 2) {
    const a = ang(h / 24), [x, y] = P(a, rr(101));
    if (h === 0) dial += `<path transform="translate(${f1(x)} ${f1(y)})" d="M2.5 -6.2A6.4 6.4 0 1 0 2.5 6.2A5 5 0 1 1 2.5 -6.2Z" fill="${gilt}"/>`;
    else if (h === 12) dial += `<g transform="translate(${f1(x)} ${f1(y)})" fill="${gilt}" stroke="${gilt}"><circle r="3.6"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<path d="M0 -5.4V-7.6" transform="rotate(${k * 45})" stroke-width="1.2" stroke-linecap="round"/>`).join('')}</g>`;
    else dial += `<text class="num" transform="translate(${f1(x)} ${f1(y)}) rotate(${h * 15})" text-anchor="middle" dy=".36em" fill="${ink}">${ROMAN[h % 12]}</text>`;
  }
  // quarters (tap targets), washed in the page colour when chosen
  let quads = '';
  for (let i = 0; i < 4; i++) { const a0 = ang(i / 4), a1 = ang((i + 1) / 4); quads += `<path class="qw ${quad === i ? 'on' : ''}" data-quad="${i}" role="button" tabindex="0" aria-pressed="${quad === i}" aria-label="${quadInfo(i, day).label}, ${quadInfo(i, day).range}" d="M${C.x} ${f1(C.y)}L${xy(a0, RD)}A${f1(RD)} ${f1(RD)} 0 0 1 ${xy(a1, RD)}Z"/>`; }
  let data = RING.map(g => `<circle class="ring" cx="${C.x}" cy="${f1(C.y)}" r="${f1(RR[g])}"/>`).join('');
  for (const e of scoped()) if (e.type === 'sleep') {   // every sleep that overlaps what the dial shows, even one that began before it
    const s0 = Math.max(0, frac(e.ts)), s1 = Math.min(1, frac(e.end || Date.now()));
    if (s1 > s0) data += `<path class="sarc" d="${arc(ang(s0), ang(Math.max(s1, s0 + 0.004)), RR.sleep)}"/>`;
  }
  // the journey: time on the move lights up the outer (railway) track of the dial, in the travel colour
  if (trip) for (const l of Travel.legs(db.events, sp.start, sp.start + sp.len, Date.now())) {
    const s0 = Math.max(0, frac(l.ts)), s1 = Math.min(1, frac(Number.isFinite(l.end) ? l.end : Date.now()));
    if (s1 > s0) data += `<path class="leg" d="${arc(ang(s0), ang(Math.max(s1, s0 + 0.004)), rr(115))}"/>`;
  }
  const all = dayKid() === 'all';
  for (const e of evs) {
    const g = groupOf(e.type).id, a = ang(frac(e.ts)), r = RR[g], [x, y] = P(a, r), [d] = describe(e), k = all ? kidById(childOf(e)) : null;
    const about = e.data && e.data.approx ? 'about ' : '';
    data += `<g class="ray${about ? ' approx' : ''}" data-edit="${e.id}" role="button" tabindex="0" aria-label="${esc(about + fmtTime(e.ts) + ' ' + TYPES[e.type].label + ': ' + d + (k ? ', ' + kidName(k) : ''))}" style="--c:var(--g-${g})">
      <title>${esc(about + fmtTime(e.ts) + ' · ' + d + (k ? ' · ' + kidName(k) : ''))}</title>
      <path d="M${xy(a, rr(17))}L${xy(a, r - rr(5))}"/><path class="hitl" d="M${xy(a, rr(20))}L${xy(a, r)}"/><circle class="hit" cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr(10))}"/><circle class="dot" cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr(4.6))}"${k ? ` style="stroke:${k.color}"` : ''}/></g>`;
  }
  // blued-steel hands at the current time, when it is on the dial: one 24-hour hand, or an hour and a minute hand; then the centre boss
  let hand = '';
  const steel = '#24356b', hy = (L, k) => f1(C.y - L * k);
  const spade = (kind, deg, L) => `<path class="hand" data-hand="${kind}" transform="rotate(${deg.toFixed(2)} ${C.x} ${f1(C.y)})" fill="${steel}" d="M${C.x - 1.2} ${f1(C.y + 14)}L${C.x - 1.2} ${hy(L, 0.727)}C${C.x - 6.5} ${hy(L, 0.747)} ${C.x - 7.5} ${hy(L, 0.808)} ${C.x - 4.8} ${hy(L, 0.848)}C${C.x - 2.6} ${hy(L, 0.879)} ${C.x - 0.8} ${hy(L, 0.909)} ${C.x} ${hy(L, 1)}C${C.x + 0.8} ${hy(L, 0.909)} ${C.x + 2.6} ${hy(L, 0.879)} ${C.x + 4.8} ${hy(L, 0.848)}C${C.x + 7.5} ${hy(L, 0.808)} ${C.x + 6.5} ${hy(L, 0.747)} ${C.x + 1.2} ${hy(L, 0.727)}L${C.x + 1.2} ${f1(C.y + 14)}Z"/>`;
  const needle = (deg, L) => `<path class="hand" data-hand="m" transform="rotate(${deg.toFixed(2)} ${C.x} ${f1(C.y)})" fill="${steel}" d="M${C.x - 0.9} ${f1(C.y + 16)}L${C.x - 0.9} ${hy(L, 0.86)}L${C.x - 3.2} ${hy(L, 0.92)}L${C.x} ${hy(L, 1)}L${C.x + 3.2} ${hy(L, 0.92)}L${C.x + 0.9} ${hy(L, 0.86)}L${C.x + 0.9} ${f1(C.y + 16)}Z"/>`;
  const now = Date.now();
  if (now >= sp.start && now < sp.start + sp.len) {
    const h = handAngles(now, sp);
    hand = twelve ? needle(h.m, rr(106)) + spade('h', h.h, rr(70)) : spade('d', h.d, rr(99));
  }
  const boss = `<circle cx="${C.x}" cy="${f1(C.y)}" r="5.2" fill="#fffdf8" stroke="${ink}" stroke-width="1.2"/><circle cx="${C.x}" cy="${f1(C.y)}" r="1.6" fill="${ink}"/>`;
  const summary = GROUPS.map(gr => [gr.label, evs.filter(e => gr.types.includes(e.type)).length]).filter(x => x[1]).map(x => `${x[1]} ${x[0].toLowerCase()}`).join(', ');
  const what = twelve ? `12-hour clock, ${half ? 'noon to midnight' : 'midnight to noon'}` : '24-hour clock of the day, midnight at the top and noon at the bottom';
  return `<svg class="clock" viewBox="0 0 ${F.W} ${F.H}" data-cx="${C.x}" data-cy="${f1(C.y)}" data-painting="${th.id}" data-dial="${twelve ? 12 : 24}" role="group" aria-label="${what}${summary ? ': ' + esc(summary) : ', no entries'}">
    <g aria-hidden="true">${frame}${panel}${dial}</g>${quads}<g class="data">${data}</g><g aria-hidden="true">${hand}${boss}</g></svg>`;
}
/** Where the hands point (degrees): the 24-hour hand, and the hour and minute hands of a 12-hour face. */
function handAngles(now, sp) {
  const d = new Date(now), min = d.getMinutes() + d.getSeconds() / 60;
  return { d: ((now - sp.start) / sp.len) * 360, h: ((d.getHours() % 12) * 60 + min) / 2, m: min * 6 };
}
/** Keep the hands moving without redrawing the screen. */
function tickHands() {
  const svg = document.querySelector('svg.clock'); if (!svg || tab !== 'day') return;
  const now = Date.now(), sp = clockSpan(viewDay); if (now < sp.start || now >= sp.start + sp.len) return;
  const h = handAngles(now, sp);
  svg.querySelectorAll('.hand').forEach(el => el.setAttribute('transform', `rotate(${h[el.dataset.hand].toFixed(2)} ${svg.dataset.cx} ${svg.dataset.cy})`));
}
setInterval(tickHands, 20000);
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
    <div class="t">${e.data && e.data.approx ? '<span class="approx" title="About this time">~</span>' : ''}${fmtTime(e.ts)}</div>
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
  let cells = '', anyAway = false;
  const tv = travelVars();
  for (let i = 0; i < first.getDay(); i++) cells += '<button class="blank" disabled></button>';
  for (let d = 1; d <= days; d++) {
    const t = new Date(y, m, d).getTime(), evs = eventsOnDay(t), away = Travel.during(db.events, t, addDays(t, 1));
    if (away) anyAway = true;
    cells += `<button data-day="${t}" class="${t === viewDay ? 'sel' : ''} ${t === today ? 'today' : ''} ${away ? 'tripday' : ''}"${away ? ` style="${tv}"` : ''} aria-label="${esc(fmtDate(t))}${away ? ', travelling' : ''}${evs.length ? ', ' + evs.length + ' entries' : ''}">${d}<span class="dots">${GROUPS.filter(g => evs.some(e => g.types.includes(e.type))).map(g => `<i class="dot" style="--c:var(--g-${g.id})"></i>`).join('')}</span></button>`;
  }
  return `
  <div class="datenav"><button data-month="-1" aria-label="Previous month">‹</button>
    <div class="d">${calMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
    <button data-month="1" aria-label="Next month">›</button></div>
  <div class="cal">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="h">${d}</div>`).join('')}${cells}</div>
  <div class="legend">${GROUPS.map(g => `<span><i style="--c:var(--g-${g.id})"></i>${g.label}</span>`).join('')}${anyAway ? '<span class="tripkey"><i></i>Travelling (its own colours)</span>' : ''}</div>
  ${monthTrip()}
  ${monthDay()}`;
}
/** On the calendar: plan a trip leaving on the day picked (or today), or change the trip that covers it. */
function monthTrip() {
  if (!Sync.can('add')) return '';
  const tr = Travel.during(db.events, viewDay, addDays(viewDay, 1)), today = startOfDay(Date.now());
  if (tr) { if (!Sync.can('edit', tr)) return ''; const M = Travel.MEANS[Travel.meansOf(tr)]; return `<button class="tripbtn" data-tripedit="${tr.id}"><span class="tm">${M.icon}</span><span><b>Trip ${M.by}</b><small>${fmtShort(tr.ts)} – ${fmtShort(Travel.ends(tr) - 1)}. Tap to change it.</small></span><span class="chev" aria-hidden="true">›</span></button>`; }
  const from = Math.max(today, viewDay);
  return `<button class="tripbtn" data-tripplan="${from}"><span class="tm">🧳</span><span><b>Plan a trip</b><small>Leaving ${from === today ? 'today' : fmtShort(from)}: travel mode switches on by itself that day</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}

function monthDay() {
  const evs = eventsOnDay(viewDay), away = Travel.during(db.events, viewDay, addDays(viewDay, 1)), M = away && Travel.MEANS[Travel.meansOf(away)];
  return `<h2>${fmtDate(viewDay)}</h2>
  <div class="${away ? 'travelday' : ''}"${away ? ` style="${travelVars()}"` : ''}>${away ? `<p class="tripnote">${M.icon} Travelling ${M.by}</p>` : ''}
  ${evs.length ? `${dayCounts(evs, viewDay)}<details class="more" data-grp="mAll" ${openGroups.has('mAll') ? 'open' : ''}><summary>All entries for this day<span class="chev" aria-hidden="true">›</span></summary>${groupedList(evs, 'm')}</details>` : '<div class="empty">No entries this day.</div>'}</div>
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
  <p class="note emer"><b>Emergency?</b> Call ${esc(Guide.sos(myRegion()))} for blue lips or face, trouble breathing, a baby who is hard to wake, or a seizure.</p>
  ${cur.length ? `<h2>Right now</h2>${cur.map(([k, m]) => { const key = ms.map(([n]) => +n).filter(n => n <= Math.max(1, m)).pop() || 1, M = Guide.MILESTONES[key];
    return `<div class="card nowcard" style="--k:${k.color}">${kids().length > 1 ? avatar(k) + ' ' : ''}<b>${esc(kidName(k))} is ${m < 1 ? (w => `${w} week${w === 1 ? '' : 's'}`)(Math.max(0, Math.floor((now - new Date(k.birth + 'T00:00').getTime()) / DAY / 7))) : `${m} month${m === 1 ? '' : 's'}`} old</b>
      <p class="note">${m < 1 ? 'The first month is mostly feeding, sleeping and getting to know each other. Here is what is common around one month:' : `Around ${M.title}:`}</p><ul>${M.does.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`; }).join('')}` : ''}
  <h2>Common with newborns</h2>
  ${Guide.COMMON.map(c => `<details class="gd" data-grp="g${c.id}" ${openGroups.has('g' + c.id) ? 'open' : ''}><summary><span class="gi">${c.icon}</span><span class="gt"><b>${esc(c.title)}</b></span><span class="chev" aria-hidden="true">›</span></summary>
    <p>${esc(c.body)}</p>${c.call ? `<p class="call">${esc(Guide.local(c.call, myRegion()))}</p>` : ''}${picsHtml(c.id)}</details>`).join('')}
  <h2>Medicines</h2>
  ${medsHtml()}
  <h2>Month by month</h2>
  ${ms.map(([n, M]) => milestoneDetails(+n, M)).join('')}
  <p class="note">General information from AAP, CDC, FDA and NHS parent guidance, not medical advice. Every baby develops at their own pace; if your baby was born early, count from the due date. If you're ever worried, call your pediatrician, you don't need to wait for a checkup.</p>
  ${picCreditsHtml()}`;
}
/** A common worry's pictures, in a twirl-down of their own inside its card. It stays shut until someone chooses to look, and shuts again
    when the card closes or the Guide is left, so nobody comes across them by surprise. */
function picsHtml(id) {
  const list = Guide.PICS[id]; if (!list) return '';
  const n = (k, w) => (k ? `${k} ${w}${k > 1 ? 's' : ''}` : ''), photos = list.filter(p => !p.drawing).length;
  return `<details class="pix" data-grp="pix${id}" ${openGroups.has('pix' + id) ? 'open' : ''}><summary><span class="gi">📷</span><span class="gt"><b>Pictures</b><small>${[n(photos, 'photo'), n(list.length - photos, 'drawing')].filter(Boolean).join(' and ')}<span class="pshut"> · tap to show</span></small></span><span class="chev" aria-hidden="true">›</span></summary>
    ${list.map(p => `<figure><img src="${esc(Guide.picSrc(p.file))}" width="${p.w}" height="${p.h}" alt="${esc(p.alt)}" loading="lazy" decoding="async"${p.max ? ` style="max-width:${p.max}px"` : ''}><figcaption>${esc(p.text)}<small>${p.drawing ? 'Drawing' : 'Photo'}: ${esc(p.by)}, ${esc(p.lic)}</small></figcaption></figure>`).join('')}</details>`;
}
/** Who made each picture, under which licence, where it comes from and what we changed. */
function picCreditsHtml() {
  return `<details class="gd" data-grp="credits" ${openGroups.has('credits') ? 'open' : ''}><summary><span class="gi">📷</span><span class="gt"><b>Picture credits</b><small>From Wikimedia Commons, under free licences</small></span><span class="chev" aria-hidden="true">›</span></summary>
    <ul class="credits">${Guide.credits().map(c => `<li><b>${esc(c.name)}</b>: ${c.drawing ? 'drawing' : 'photo'} by ${esc(c.by)}, ${esc(c.lic)}${c.licUrl ? ` <span class="url">(${esc(c.licUrl)})</span>` : ''}. From <span class="url">${esc(c.page)}</span>${c.edit ? `, ${esc(c.edit)}` : ''}.</li>`).join('')}</ul>
    <p class="note">Our versions of the CC BY-SA pictures are shared under the same licence.</p></details>`;
}
/** A medicine's brand names, those sold where you are first. */
const medBrands = (i, here) => { const at = b => (!i.where || !i.where[b] || i.where[b].split(' ').includes(here) ? 0 : 1), list = i.brands.split(' · '); return list.map((b, n) => [at(b), n, b]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]).join(' · '); };
/** From what age: one rule, or the US and UK ones (yours first, the other smaller; both elsewhere, where labels differ by country). */
function medAge(age, here) {
  if (typeof age === 'string') return esc(age);
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  if (here === 'na') return `${esc(cap(age.us))}. <small>(UK: ${esc(age.uk)})</small>`;
  if (here === 'uk') return `${esc(cap(age.uk))}. <small>(US: ${esc(age.us)})</small>`;
  return `US: ${esc(age.us)}. UK: ${esc(age.uk)}. <small>Ages on labels differ by country: check the one where you live.</small>`;
}
/** Over-the-counter medicines: one drop-down holding a drop-down per kind (fever and pain, colic, …) and the things never to give. */
function medsHtml() {
  const here = myRegion();
  const tw = (id, icon, title, sub, body, cls = '') => `<details class="gd ${cls}" data-grp="${id}" ${openGroups.has(id) ? 'open' : ''}><summary><span class="gi">${icon}</span><span class="gt"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="chev" aria-hidden="true">›</span></summary>${body}</details>`;
  const item = i => `<div class="medi"><b>${esc(i.name)}</b>${i.brands ? `<small>${esc(medBrands(i, here))}</small>` : ''}<p class="age">${medAge(i.age, here)}</p><p>${esc(i.body)}</p></div>`;
  const kinds = Guide.MEDS.map(c => tw('o' + c.id, c.icon, c.title, c.items.map(i => i.name).join(' · '),
    `${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}${c.items.map(item).join('')}${c.warn ? `<p class="call">${esc(c.warn)}</p>` : ''}`, 'med'));
  const never = tw('onever', '⚠️', 'Never give a baby', '', `<ul>${Guide.NEVER.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`, 'med never');
  return tw('omenu', '💊', 'Over-the-counter medicines', 'What is safe from what age, remedies parents mention, and what never to give',
    `<div class="medbody"><p class="call">${esc(Guide.MEDS_INTRO[0])}</p><p class="note">${esc(Guide.MEDS_INTRO[1])}</p>${kinds.join('')}${never}</div>`, 'medmenu');
}
const milestoneBody = M => `${M.does.length ? `<p class="mh">What many babies do</p><ul>${M.does.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${M.notice.length ? `<p class="mh">What parents often notice</p><ul>${M.notice.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${M.visit ? `<p class="mh">Checkup</p><p>${esc(M.visit)}</p>` : ''}${M.ask ? `<p class="call">${esc(M.ask)}</p>` : ''}`;
const milestoneDetails = (n, M) => `<details class="gd" data-grp="m${n}" ${openGroups.has('m' + n) ? 'open' : ''}><summary><span class="gi">🌟</span><span class="gt"><b>${esc(M.title)}</b></span><span class="chev" aria-hidden="true">›</span></summary>${milestoneBody(M)}</details>`;
/** Choose the painting around a page's clock (kept on this phone). */
function openArtPicker(forId = dayKid()) {
  const cur = artOf(forId), multi = kids().length > 1, who = forId === 'all' ? 'the All page' : `${kidName(kidById(forId))}'s page`;
  const close = popup(`<h3>🎨 Clock art</h3><p class="note">${multi ? `For ${esc(who)} on this phone.` : 'For this phone.'}</p>
    <div class="artgrid">${Art.THEMES.filter(t => !t.travel).map(t => { const u = Art.peek(t.id, 0.7); return `<button class="artopt ${t.id === cur ? 'on' : ''}" data-pick="${t.id}" aria-pressed="${t.id === cur}"><span class="thumb" style="background:${t.base}"><img alt="" data-th="${t.id}"${u ? ` src="${u}"` : ''}><i></i></span><span class="an">${t.name}</span></button>`; }).join('')}</div>
    ${multi && forId !== 'all' ? `<div class="chips" style="margin-top:12px">${chip('artAll', 1, 'Use it for every child', false)}</div>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn" data-close>Done</button></div>`);
  $('#sheet').querySelectorAll('img[data-th]').forEach(img => { if (!img.getAttribute('src')) Art.url(img.dataset.th, 0.7).then(u => { img.src = u; }); });
  $('#sheet').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const every = $('#sheet').querySelector('[name=artAll]:checked');
    (every ? kids().map(k => k.id).concat('all') : [forId]).forEach(id => setArt(id, b.dataset.pick));
    close(); render(); toast(Art.byId(b.dataset.pick).name);
  });
}
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
  if (!$('#sheet').hidden || Acct.gate() || Tour.active() || !Tour.seen('day')) return;   // (after the first tour of the home screen)
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

// ---------- Formula ----------
/** One child's formula feeds since `since` ([{ ts, formula }]). */
const formulaFeeds = (k, since = 0) => db.events.filter(e => e.type === 'feed' && e.data && e.data.milk === 'Formula' && e.data.formula && e.ts > since && childOf(e) === k.id).map(e => ({ ts: e.ts, formula: e.data.formula }));
/** The formula the feeds have settled on for a child since a parent last chose one by hand (see Formulas.learned), or ''. */
const learnedFormula = k => Formulas.learned(formulaFeeds(k, k.formulaAt || 0));
/** The formula to suggest for a child: what the feeds have settled on, else the one a parent chose. Worked out on every phone from the
    shared log, so it is never written back into the profile by itself. */
const usualFormula = k => (k ? learnedFormula(k) || k.formula || '' : '');
/** Formulas given to these children in the last 30 days, most recent first (for the top of the list). */
function recentFormulas(ks) {
  const since = Date.now() - 30 * DAY, seen = new Map();
  for (const k of ks) for (const f of formulaFeeds(k, since)) if (!seen.has(f.formula) || seen.get(f.formula) < f.ts) seen.set(f.formula, f.ts);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 6);
}
/** Where this phone is (More → Where you are), or a guess from its time zone. The formula list and the Guide put this region first. */
const myRegion = () => (Formulas.REGIONS.some(r => r.id === db.meta.region) ? db.meta.region : Formulas.regionFor());
/** The formula picker: a button showing the choice, opening a list with the usual and recent formulas on top, then a twirl-down for each
    region (where you are first, and open), then "Other". The value lives in a hidden field (`attrs.sel`), read like any other field. */
function formulaPicker(attrs, cur, recent, dis = '') {
  const lately = [...new Set([cur, ...recent].filter(Boolean))], here = myRegion();
  const opt = v => `<button type="button" class="fopt" data-fv="${esc(v)}" aria-pressed="${v === cur}">${esc(v)}</button>`;
  return `<div class="fpick"><input type="hidden" ${attrs.sel} value="${esc(cur)}">
    <button type="button" class="fcur" aria-expanded="false" ${dis}><span class="fv">${esc(cur) || 'Choose a formula…'}</span><span class="chev" aria-hidden="true">›</span></button>
    <div class="flist" hidden>${lately.length ? `<p class="fh">Usual and recent</p><div class="fopts">${lately.map(opt).join('')}</div>` : ''}
      ${Formulas.ordered(here).map(r => `<details class="freg" data-region="${r.id}" ${r.id === here ? 'open' : ''}><summary><span>${esc(r.name)}${r.id === here ? ' <small>Where you are</small>' : ''}</span><span class="chev" aria-hidden="true">›</span></summary><div class="fopts">${r.items.map(opt).join('')}</div></details>`).join('')}
      <button type="button" class="fopt fo-other" data-fv="__other">Other (type it in)…</button></div>
    <input type="text" class="fother" maxlength="60" placeholder="Type the formula's name" ${attrs.txt} ${dis} hidden></div>`;
}
/** Show `v` as a picker's choice (no change event: used to suggest the usual formula). */
function setPick(fp, v) {
  fp.querySelector('input[type=hidden]').value = v; fp.querySelector('.fv').textContent = v === '__other' ? 'Other' : v || 'Choose a formula…';
  fp.querySelectorAll('[data-fv]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.fv === v)));
}
/** Open and close the formula pickers under `root`; choosing one closes the list and sends a change event from the hidden field. */
function bindFormulaPickers(root) {
  root.querySelectorAll('.fpick').forEach(fp => {
    const val = fp.querySelector('input[type=hidden]'), btn = fp.querySelector('.fcur'), list = fp.querySelector('.flist'), other = fp.querySelector('.fother');
    const show = open => { list.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    btn.onclick = () => show(list.hidden);
    fp.querySelectorAll('[data-fv]').forEach(b => b.onclick = () => {
      setPick(fp, b.dataset.fv); show(false); other.hidden = b.dataset.fv !== '__other';
      if (!other.hidden) other.focus(); else btn.focus();
      val.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

// ---------- Travel ----------
// A trip turns the Day tab into a travel page for its days (travel.js): the painting matches the way you travel, the entries take the
// travel colours, logging is a tap or two, and the journey shows on the clock. The trip is shared with everyone in the log.
/** The trip that makes a day a travel day: today, the one going on now; other days, one covering any of the day. */
function tripOn(day) {
  const now = Date.now();
  return day === startOfDay(now) ? Travel.at(db.events, now) : Travel.during(db.events, day, addDays(day, 1));
}
/** The top of a travel day: the trip, the journey under way (with a reminder to stop on long drives), and tips for this way of travelling. */
function tripCard(tr) {
  const m = Travel.meansOf(tr), M = Travel.MEANS[m], now = Date.now(), live = tr.ts <= now && now < Travel.ends(tr), today = viewDay === startOfDay(now);
  const first = startOfDay(tr.ts), last = startOfDay(Travel.ends(tr) - 1), days = Math.round((last - first) / DAY) + 1, n = Math.min(days, Math.max(1, Math.round((viewDay - first) / DAY) + 1));
  const leg = live && today ? Travel.moving(db.events) : null, mins = leg ? (now - leg.ts) / MIN : 0, rest = !!leg && m === 'car' && mins >= 120;
  const can = leg ? Sync.can('edit', leg) : Sync.can('add');
  const journey = live && today ? `<div class="legrow ${rest ? 'warn' : ''}"><span>${leg ? `<b>${M.moving}</b> since ${fmtTime(leg.ts)} · <span class="nw">${fmtDur(mins)}</span>` : M.still}</span>${can ? `<button class="btn tbtn" data-leg>${leg ? M.stop : M.go}</button>` : ''}</div>
    ${rest ? '<p class="call">Time for a break: many car seat makers advise taking young babies out of the seat at least every 2 hours.</p>' : ''}
    ${leg && m === 'plane' ? '<p class="note">Coming in to land? Offer a feed, a bottle or a pacifier: swallowing helps their ears.</p>' : ''}` : '';
  return `<div class="card tripcard"><div class="th"><span class="tm">${M.icon}</span><span class="tt"><b>Travelling ${M.by}</b><small>Day ${n} of ${days} · ${live ? 'back' : 'until'} ${fmtShort(last)}</small></span></div>
    ${journey}
    <details class="tips" data-grp="ttips" ${openGroups.has('ttips') ? 'open' : ''}><summary>Tips for travelling ${M.by}<span class="chev" aria-hidden="true">›</span></summary><ul>${Travel.TIPS[m].map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
    ${Sync.can('edit', tr) ? `<div class="row"><button class="btn" data-tripedit="${tr.id}">Change trip</button>${live && today ? '<button class="btn" data-triphome>We\'re home</button>' : ''}</div>` : ''}</div>`;
}
/** At the bottom of today's page: switch to travel mode, or the trip coming up. */
function tripButton() {
  if (!Sync.can('add')) return '';
  const up = Travel.upcoming(db.events, Date.now());
  if (up) { const M = Travel.MEANS[Travel.meansOf(up)]; return `<button class="tripbtn" data-tripedit="${up.id}"><span class="tm">${M.icon}</span><span><b>Trip coming up ${M.by}</b><small>${fmtShort(up.ts)} – ${fmtShort(Travel.ends(up) - 1)}. Tap to change it.</small></span><span class="chev" aria-hidden="true">›</span></button>`; }
  return `<button class="tripbtn" data-tripnew><span class="tm">🧳</span><span><b>Travelling?</b><small>Switch to travel mode for the trip: quicker logging and a clock to match the journey</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}
/** Travel: the four things logged most, as big buttons with one-tap sheets; the rest are one more tap away. */
function travelQuick() {
  if (!Sync.can('add')) return '';
  const P = Travel.PALETTE.light, label = { feed: 'Feed', diaper: 'Diaper', sleep: 'Asleep', vomit: 'Spit-up' };
  return `<div class="quick tq">${Object.keys(label).map(k => `<button data-qadd="${k}" style="--cw:${Kids.rgba(P[groupOf(k).id], 0.3)}"><b>${TYPES[k].icon}</b>${label[k]}</button>`).join('')}</div>
    <button class="qmore" data-qmore>More: play, night waking${Sync.can('health') ? ', health and medicine' : ''}</button>`;
}
function openMoreTypes() {
  const types = ['play', 'wake', 'health', 'med'].filter(k => Sync.can('health') || (k !== 'health' && k !== 'med'));
  const close = popup(`<h3>More to log</h3><div class="quick">${types.map(k => `<button data-more="${k}"><b>${TYPES[k].icon}</b>${TYPES[k].label}</button>`).join('')}</div>
    <div class="row" style="margin-top:14px"><button class="btn" data-close>Close</button></div>`);
  $('#sheet').querySelectorAll('[data-more]').forEach(b => b.onclick = () => { close(); openSheet(b.dataset.more); });
}
/** Plan a trip or change one: how you're travelling, and from when until when. A new trip leaves on `start` (a day; today by default). */
function openTrip(ev, start) {
  if (ev ? !Sync.can('edit', ev) : !Sync.can('add')) return toast("You don't have permission to do that");
  const today = startOfDay(Date.now()), from = ev ? startOfDay(ev.ts) : Math.max(today, start || today), to = ev ? startOfDay(Travel.ends(ev) - 1) : addDays(from, 2), cur = ev ? Travel.meansOf(ev) : 'car';
  const close = popup(`<h3>🧳 ${ev ? 'Your trip' : 'Plan a trip'}</h3>
    <label class="f">How are you travelling?</label>
    <div class="means">${Travel.KINDS.map(k => `<label class="mean"><input type="radio" name="means" value="${k}" ${k === cur ? 'checked' : ''}><span><b>${Travel.MEANS[k].icon}</b>${Travel.MEANS[k].label}</span></label>`).join('')}</div>
    <div class="dates"><span><label class="f" for="tripFrom">Leaving</label><input type="date" id="tripFrom" value="${dkey(from)}"></span><span><label class="f" for="tripTo">Back home</label><input type="date" id="tripTo" value="${dkey(to)}"></span></div>
    <div class="mini">${[[0, 'Just today'], [2, '3 days'], [6, 'A week'], [13, 'Two weeks']].map(([n, l]) => `<button type="button" data-len="${n}">${l}</button>`).join('')}</div>
    <p class="note">Plan it as far ahead as you like: travel mode switches on by itself on the day you leave, and off after the day you're back, on every phone sharing this log.</p>
    <div class="row" style="margin-top:14px">${ev && Sync.can('delete', ev) ? '<button class="btn d" id="tripDel">Delete</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn p" id="tripSave">Save</button></div>`);
  const S = $('#sheet'), F = $('#tripFrom'), T = $('#tripTo'), day = v => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00').getTime() : NaN);
  const label = () => { if (!ev) $('#tripSave').textContent = day(F.value) > today ? 'Plan it' : 'Start'; };
  S.querySelectorAll('[data-len]').forEach(b => b.onclick = () => { const f = day(F.value); if (f) T.value = dkey(addDays(f, +b.dataset.len)); });
  F.onchange = label; label();
  $('#tripSave').onclick = () => {
    const f = day(F.value), t = day(T.value), now = Date.now();
    if (!f || !t) return toast('Pick both dates');
    if (t < f) return toast('The day back is before the day you leave');
    if (t - f > 92 * DAY) return toast('A trip can be up to three months');
    // one trip at a time (one that has already ended may share its last day with a new one)
    const clash = db.events.find(e => e.type === 'trip' && e !== ev && Travel.ends(e) > now && e.ts < addDays(t, 1) && Travel.ends(e) > f);
    if (clash) return toast(`That overlaps the trip ${Travel.MEANS[Travel.meansOf(clash)].by} (${fmtShort(clash.ts)} – ${fmtShort(Travel.ends(clash) - 1)}). Change that one instead.`);
    const rec = ev || { id: uid(), type: 'trip', by: Auth.id || undefined };
    Object.assign(rec, { ts: f, end: addDays(t, 1), data: { means: (S.querySelector('[name=means]:checked') || {}).value || 'car' }, note: '', updated: stamp() });
    if (!ev) db.events.push(rec);
    if (tab === 'month') { viewDay = f; calMonth = new Date(f); } else viewDay = startOfDay(now);   // the calendar shows the trip's days
    save(); close(); quad = null; render(); window.scrollTo(0, 0);
    if (!voyage) toast(f > now ? `Saved: travel mode switches on by itself on ${fmtShort(f)}` : 'Travel mode is on');
  };
  if ($('#tripDel')) $('#tripDel').onclick = () => { if (!confirm('Delete this trip? What you logged during it stays.')) return; removeEvent(ev); save(); close(); render(); toast('Trip deleted'); };
}
/** "We're home": the trip ends now (and so does a leg of the journey still running). */
function endTrip() {
  const now = Date.now(), tr = Travel.at(db.events, now), leg = Travel.moving(db.events);
  if (!tr) return;
  if (!Sync.can('edit', tr)) return toast("You can't change this trip");
  tr.end = now; tr.updated = stamp();
  if (leg && Sync.can('edit', leg)) { leg.end = Math.max(now, leg.ts + MIN); leg.updated = stamp(); }
  save(); render(); window.scrollTo(0, 0); if (!voyage) toast('Welcome home');
}
// When travel mode switches on or off for today (a trip starting or ending: here, on another phone, or on the day itself) while the Day
// tab shows today, a little journey crosses the screen and the page changes under it, like the sunset between light and dark.
let awayFor, voyage = null;
/** True when this render has to wait: a journey is about to cover the screen, and the page changes then. */
function voyageFirst() {
  if (voyage && !voyage.open) return true;
  const tr = Travel.at(db.events, Date.now()), id = tr ? tr.id : '', was = awayFor;
  awayFor = id;
  if (was === undefined || was === id || voyage || tab !== 'day' || viewDay !== startOfDay(Date.now()) || Acct.gate()) return false;
  if (document.hidden || !document.body.animate || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return false;
  const left = !tr && db.events.find(e => e.id === was && e.ts <= Date.now());   // back home (not a trip deleted, or moved to a later date)
  if (!tr && !left) return false;
  playVoyage(!!tr, Travel.meansOf(tr || left));
  return true;
}
/** Off on a trip (from the house, out of the screen) or home again (back to the house), along a dashed path. */
function playVoyage(away, m) {
  const M = Travel.MEANS[m], air = m === 'plane', W = innerWidth / 100, H = innerHeight / 100, D = 2600;
  const P = air ? [[-12, 78], [22, 76], [50, 44], [112, 20]] : [[-12, 64], [28, 54], [66, 72], [112, 60]];   // in % of the screen
  const pt = t => { const u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]; return [0, 1].map(k => w.reduce((a, c, i) => a + c * P[i][k], 0)); };
  const [t0, t1, th] = away ? [0.2, 1, 0.2] : [0, 0.72, 0.8];   // where the vehicle starts and stops, and where the house is (along the path)
  const el = document.createElement('div'), [hx, hy] = pt(th);
  el.className = `voyage ${away ? 'away' : 'home'}`; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<i class="vsky"></i><svg class="vpath" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M${P[0]}C${P[1]} ${P[2]} ${P[3]}"/></svg>
    <span class="vhome" style="left:${hx}vw;top:${hy}vh">${Icons.svg('home')}</span><span class="vgo">${Icons.svg(m)}</span>
    <p class="vmsg"><b>${away ? `Travelling ${M.by}` : 'Welcome home'}</b><small>${away ? 'Have a good trip!' : 'Back to the usual page'}</small></p>`;
  document.body.appendChild(el);
  const frames = [];
  for (let i = 0; i <= 16; i++) {
    const t = t0 + ((t1 - t0) * i) / 16, [x, y] = pt(t), [a, b] = pt(Math.max(0, t - 0.01)), [c, d] = pt(Math.min(1, t + 0.01));
    frames.push({ transform: `translate(${x.toFixed(2)}vw, ${y.toFixed(2)}vh) rotate(${((Math.atan2((d - b) * H, (c - a) * W) * 180) / Math.PI + (air ? 90 : 0)).toFixed(1)}deg)` });
  }
  const move = { duration: D * 0.68, delay: D * 0.1, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' };
  el.animate([{ opacity: 0, easing: 'ease-out' }, { opacity: 1, offset: 0.28 }, { opacity: 1, offset: 0.74, easing: 'ease-in' }, { opacity: 0 }], { duration: D, fill: 'forwards' });   // fully covered when the page changes
  el.querySelector('.vgo').animate(frames, move);
  el.querySelector('.vpath').animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: `inset(0 ${Math.max(0, 100 - pt(t1)[0]).toFixed(1)}% 0 0)` }], move);
  el.querySelector('.vhome').animate(away ? [{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1)', offset: 0.3 }, { transform: 'translate(-50%,-50%) scale(.9)', opacity: 0.5 }]
    : [{ transform: 'translate(-50%,-50%) scale(.8)', opacity: 0.5 }, { transform: 'translate(-50%,-50%) scale(.8)', opacity: 0.5, offset: 0.72 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.82 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: D, fill: 'both' });
  el.querySelector('.vmsg').animate([{ opacity: 0, transform: 'translateY(12px)', easing: 'ease-out' }, { opacity: 1, transform: 'none', offset: 0.3 }, { opacity: 1, offset: 0.74 }, { opacity: 0 }], { duration: D, fill: 'both' });
  voyage = { open: false };
  setTimeout(() => { voyage.open = true; render(); }, D * 0.36);   // the page changes while the journey covers it
  setTimeout(() => { el.remove(); voyage = null; }, D);
}
/** Set off / stopped: the legs of the journey, shown along the clock's outer track. */
function toggleLeg() {
  const now = Date.now(), tr = Travel.at(db.events, now); if (!tr) return;
  const m = Travel.meansOf(tr), M = Travel.MEANS[m], leg = Travel.moving(db.events);
  if (leg) {
    if (!Sync.can('edit', leg)) return toast("You can't change this");
    leg.end = Math.max(now, leg.ts + MIN); leg.updated = stamp(); save(); render();
    return toast(m === 'car' ? 'Break time: a stretch out of the car seat, a feed and a fresh diaper' : M.stop);
  }
  if (!Sync.can('add')) return toast("You don't have permission to do that");
  db.events.push({ id: uid(), type: 'leg', ts: now, data: { means: m }, note: '', updated: stamp(), by: Auth.id || undefined });
  save(); render();
  toast(m === 'plane' ? 'Offer a feed, bottle or pacifier for takeoff: swallowing helps their ears' : `${M.moving}. Safe travels!`);
}
/** Travel: a short sheet of big one-tap answers. A rough time is fine ("about 15 minutes ago"); such times are kept as estimates. */
function openQuick(type) {
  if (!Sync.can('add')) return toast("You don't have permission to do that");
  const T = TYPES[type], multi = kids().length > 1, page = dayKid(), pre = page === 'all' ? kids().map(k => k.id) : [page];
  const prev = db.events.filter(e => e.type === type && pre.includes(childOf(e))).sort((a, b) => b.ts - a.ts)[0], pd = (prev && prev.data) || {};
  const big = (name, opts, cur, cls = '') => `<div class="chips big ${cls}">${opts.map(([v, l]) => chip(name, v, l, String(v) === String(cur), '', true)).join('')}</div>`;
  const near = (v, list) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const who = multi ? `<div class="chips kidchips">${kids().map(k => `<label class="chip kidchip" style="--k:${k.color}"><input type="checkbox" name="qkid" value="${k.id}" ${pre.includes(k.id) ? 'checked' : ''}><span>${avatar(k)}${esc(kidName(k))}</span></label>`).join('')}</div>` : '';
  const ML = [60, 90, 120, 150, 180];
  let body = '', instant = false, title = T.label;
  if (type === 'feed') body = `<label class="f">Bottle or breast?</label>${big('qkind', [['bottle', '🍼 Bottle'], ['breast', 'Breast']], pd.kind || 'bottle')}
    <div id="qBottle"><label class="f">About how much?</label>${big('qml', ML.map(v => [v, v + ' ml']), pd.ml ? near(+pd.ml, ML) : 90)}${big('qmilk', [['Formula', 'Formula'], ['Breast milk', 'Breast milk']], pd.milk || 'Formula')}</div>
    <div id="qBreast"><label class="f">Side <small>(if you like)</small></label>${big('qside', [['Left', 'Left'], ['Right', 'Right'], ['Both', 'Both']], '')}
      <label class="f">About how long? <small>(if you like)</small></label>${big('qmin', [5, 10, 15, 20, 30].map(v => [v, v + ' min']), '')}</div>`;
  if (type === 'diaper') { instant = true; body = `<label class="f">Tap one to save</label>${big('qdia', [['pee', '💧 Pee'], ['poo', '💩 Poo'], ['both', 'Both']], '', 'save')}`; }
  if (type === 'vomit') { instant = true; title = 'Spit-up'; body = `<label class="f">Tap one to save</label>${big('qvom', [['Spit-up', 'A little'], ['Large', 'More than usual']], '', 'save')}`; }
  if (type === 'sleep') title = 'Fell asleep';
  const close = popup(`<h3>${T.icon} ${title}</h3>${who}<label class="f">When?</label>${big('qago', [[0, 'Just now'], [15, '~15 min ago'], [30, '~30 min ago'], [60, '~1 hr ago']], 0)}
    ${body}<div class="row" style="margin-top:16px"><button class="btn" data-close>Cancel</button>${instant ? '' : '<button class="btn p" id="qSave">Save</button>'}</div>`);
  const S = $('#sheet'), val = n => { const c = S.querySelector(`[name=${n}]:checked`); return c ? c.value : ''; };
  const sync = () => { if ($('#qBottle')) { const b = val('qkind') === 'bottle'; $('#qBottle').hidden = !b; $('#qBreast').hidden = b; } };
  S.onchange = sync; sync();
  const commit = () => {
    const ids = multi ? [...S.querySelectorAll('[name=qkid]:checked')].map(c => c.value).filter(id => kidById(id)) : [kids()[0].id];
    if (!ids.length) return toast('Choose who this is for');
    const ago = +val('qago') || 0, ts = Date.now() - ago * MIN, est = ago ? { approx: true } : {};
    let data = { ...est };
    if (type === 'feed') data = val('qkind') === 'breast' ? { kind: 'breast', ...(val('qside') ? { side: val('qside') } : {}), ...(val('qmin') ? { min: +val('qmin') } : {}), ...est } : { kind: 'bottle', ml: +val('qml') || 90, milk: val('qmilk') || 'Formula', ...est };
    if (type === 'diaper') { const v = val('qdia'); data = { pee: v !== 'poo', poo: v !== 'pee', rash: false, ...est }; }
    if (type === 'vomit') data = { amount: val('qvom') || 'Spit-up', projectile: false, ...est };
    if (type === 'sleep') { const busy = ids.find(id => activeSleep(id)); if (busy) return toast(`${kidName(kidById(busy))} is already asleep`); }
    for (const id of ids) {
      const d = structuredClone(data);
      if (type === 'feed' && d.kind === 'bottle' && d.milk === 'Formula') { const f = usualFormula(kidById(id)); if (f) d.formula = f; }
      db.events.push({ id: uid(), type, ts, data: d, note: '', updated: stamp(), by: Auth.id || undefined, child: id });
    }
    if (ids.length === 1) { if (dayKid() !== ids[0]) setKid(ids[0]); } else if (dayKid() !== 'all' && !ids.includes(dayKid())) setKid('all');
    save(); close(); viewDay = startOfDay(ts); render(); toast(ids.length > 1 ? `Saved for ${ids.length} children` : 'Saved');
  };
  S.querySelectorAll('.save input').forEach(i => i.onclick = () => setTimeout(commit));   // one tap saves
  if ($('#qSave')) $('#qSave').onclick = commit;
}

// ---------- Tutorial ----------
// What each screen's tour points at, and why it's there (tour.js shows them). Steps for things that aren't on the screen right now (one
// child, no permission, no trip) are left out by themselves.
const TOURS = {
  day: [
    { sel: '#kidBar', title: 'A page for each child', why: 'Each child has their own page in their own colour. "All" shows everyone together.' },
    { sel: '#view .quick', title: 'Log it in one tap', why: 'Tap what just happened. The time is filled in for you, with shortcuts for a few minutes ago.' },
    { sel: '#sleepBanner', title: 'Asleep right now', why: 'While your baby sleeps the timer runs here. Tap "Woke up" when they wake.' },
    { sel: 'svg.clock', title: 'The day at a glance', why: 'Each entry is a ray out to the time it happened, in its own colour. Tap a dot to open it, or a quarter of the dial for just those hours.' },
    { sel: '.clockctl .seg', title: '24 or 12 hours', why: 'The whole day on one dial, or a classic 12-hour face with AM and PM.' },
    { sel: '.clockctl .artbtn', title: 'Choose the painting', why: 'Pick the watercolour around the clock, for each child.' },
    { sel: '.datenav', title: 'Other days', why: 'Use the arrows to look back at earlier days.' },
    { sel: '#view details.grp', title: 'Every detail', why: 'Everything from the day, grouped: feeds, diapers, sleep and more. Tap a group to open it.' },
    { sel: '.tripbtn', title: 'Going on a trip?', why: 'Travel mode gives you bigger buttons, rough times that are quick to log, and a clock to match the journey.' },
    { sel: '#tabs', title: 'Everything else', why: 'The month, stats, the Guide with medicines and milestones, family sharing, and settings.' },
    { sel: '#helpBtn', title: 'Help on every screen', why: 'Tap ? on any screen for a tour of it.' },
  ],
  travel: [
    { sel: '.tripcard', title: 'Your trip', why: 'How you are travelling and until when. Change it any time, or tap "We\'re home" to end it.' },
    { sel: '.legrow', title: 'The journey', why: 'Tap when you set off and when you stop. Time on the move lights up the clock\'s outer ring, and long drives get a reminder to take a break.' },
    { sel: '.quick.tq', title: 'Big buttons for busy moments', why: 'Each opens a short sheet: tap a rough time and an answer. "About 15 minutes ago" is fine; estimated times show with a ~.' },
    { sel: '.qmore', title: 'The rest', why: 'Play, night wakings, health notes and medicines are one more tap away.' },
    { sel: 'svg.clock', title: 'A travel clock', why: 'The painting matches how you travel, and travel days have their own colours, so they stand out later in the month view.' },
    { sel: '#helpBtn', title: 'Help on every screen', why: 'Tap ? on any screen for a tour of it.' },
  ],
  month: [
    { sel: '.cal', title: 'The month', why: 'Dots show what was logged each day. Days away travelling are outlined.' },
    { sel: '.cal button.sel', title: 'Pick a day', why: 'Tap a day to see its numbers below.' },
    { sel: '#view .tripbtn', title: 'Plan a trip', why: 'Plan trips ahead: pick the day you leave, then tap here. Travel mode switches on by itself that day.' },
    { sel: '#view .tiles', title: 'The day in numbers', why: 'Feeds, diapers, sleep and more for the day you picked.' },
    { sel: 'details[data-grp=mAll]', title: 'Every entry', why: 'Open this to see each entry of that day, and tap one to change it.' },
    { sel: '#view .quick', title: 'Add to that day', why: 'Log something you forgot, on the day you picked.' },
  ],
  stats: [
    { sel: '#view .seg', title: 'How far back', why: 'Look at the last 7, 14 or 30 days.' },
    { sel: '#view .chart', title: 'A chart for each section', why: 'Drawn to scale, one bar per day. Tap a bar for its numbers.' },
    { sel: '#view details.tbl', title: 'The exact numbers', why: 'Each chart has a table with every day\'s numbers, handy for a checkup.' },
  ],
  guide: [
    { sel: '#docBtn', title: 'Your pediatrician', why: 'Save their details once, and everyone sharing the log gets a Call button.' },
    { sel: '.emer', title: 'Emergencies', why: 'The signs that need emergency help straight away.' },
    { sel: '.nowcard', title: 'Right now', why: 'What is common at your baby\'s age.' },
    { sel: '#view details.gd[data-grp^=g]', title: 'Common worries', why: 'What is normal with a newborn, and when to call. Some have pictures, kept out of sight until you tap them.' },
    { sel: 'details[data-grp=omenu]', title: 'Medicines', why: 'Over-the-counter medicines that are safe from what age, remedies parents mention, and what never to give.' },
    { sel: '#view details.gd[data-grp^=m]', title: 'Month by month', why: 'Milestones for every month. A reminder pops up on each month birthday.' },
  ],
  family: [
    { sel: '#syncNow', title: 'Your shared log', why: 'When this phone last synced. Tap to sync now.' },
    { sel: '#view .pbtn', title: 'People', why: 'Everyone with access and their role. Tap a person for their contact details.' },
    { sel: '#invCard', title: 'Invite someone', why: 'Make a one-time QR code. You approve them before they see anything.' },
    { sel: '#actBtn', title: 'Activity', why: 'Who added, changed or deleted what. Only parents see this.' },
    { sel: '#view .code.mono', title: 'Security code', why: 'Everyone sharing the log sees the same code: a quick check that only your family has the keys.' },
    { sel: '#fScan', title: 'Join another log', why: 'Scan the QR code from someone else\'s log to ask to join it.' },
    { sel: '#view .card', title: 'Family sharing', why: 'Sign in to share the log with family and caregivers, end-to-end encrypted.' },
  ],
  more: [
    { sel: '.kidrow', title: 'Your children', why: 'Names, birth dates and colours. "Add a child" for twins or triplets.' },
    { sel: '.kidrow .fpick', title: 'Usual formula', why: 'Pick it from the list; each region folds open. After three days of the same formula it is picked for you.' },
    { sel: '#regionSel', title: 'Where you are', why: 'Formulas sold here come first, and the Guide gives your emergency number and medicine names first.' },
    { sel: '.card:has([data-art])', title: 'Clock art', why: 'The painting around each child\'s clock.' },
    { sel: '.card:has([name=themeMode])', title: 'Light or dark', why: 'Match your phone, pick one, or follow sunrise and sunset.' },
    { sel: '#expCsv', title: 'Your data', why: 'Back up the log, or export a copy for your pediatrician.' },
  ],
};
/** The tour of the screen that is showing: the Day tab on a travel day has its own. */
const tourPage = () => (tab === 'day' && tripOn(viewDay) ? 'travel' : tab);
function startTour() {
  if (Acct.gate()) return;
  const page = tourPage();
  if (!$('#sheet').hidden) $('#sheet').hidden = $('#sheetBack').hidden = true;
  const steps = TOURS[page] || [], skipFamily = page === 'family' && document.querySelector('#syncNow');   // signed in: the "sharing is off" card isn't there
  if (!Tour.start(skipFamily ? steps.filter(s => s.sel !== '#view .card') : steps, () => { if (page === 'day') { Tour.mark('day'); render(); } })) toast('Nothing to show on this screen yet');
}
/** The home screen's tour starts by itself the first time, once nothing else is open. */
function autoTour() {
  if (tab !== 'day' || Tour.active() || Tour.seen('day') || Acct.gate() || !$('#sheet').hidden || tripOn(viewDay)) return;
  clearTimeout(autoTour.t); autoTour.t = setTimeout(() => { if (tab === 'day' && !Tour.active() && !Tour.seen('day') && $('#sheet').hidden && !Acct.gate() && !tripOn(viewDay)) startTour(); }, 500);   // (still so after a sync?)
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
      <label class="f">Usual formula</label>${formulaPicker({ sel: `data-kfs="${k.id}" aria-label="Usual formula"`, txt: `data-kft="${k.id}" aria-label="Formula name"` }, usualFormula(k), recentFormulas([k]), dis)}
      <p class="note" style="margin:4px 0 0">${learnedFormula(k) && learnedFormula(k) !== k.formula ? 'Picked up from the feeds: it was given at every formula feed three days running.' : 'When one formula is given at every formula feed three days running, it becomes the usual one.'}</p>
      <label class="f">Colour</label><div class="swatches" role="radiogroup" aria-label="Colour">${Kids.swatches(k.sex).map(c => `<button type="button" class="sw ${c === k.color ? 'on' : ''}" data-kc="${k.id}" data-c="${c}" style="--k:${c}" role="radio" aria-checked="${c === k.color}" aria-label="${c}" ${dis}>${c === k.color ? '✓' : ''}</button>`).join('')}</div>
      ${can && ks.length > 1 ? `<button class="btn d" data-krm="${k.id}" style="margin-top:12px">Remove ${esc(kidName(k))}</button>` : ''}</div>`).join('')}
    ${can && ks.length < Kids.MAX ? '<button class="btn" id="kAdd" style="width:100%;margin-top:6px">+ Add a child</button>' : ''}</div>`;
}
/** Where you are: the formula list and the Guide put this region first (kept on this phone). */
function regionHtml() {
  const cur = Formulas.REGIONS.some(r => r.id === db.meta.region) ? db.meta.region : '';
  return `<div class="card"><b>📍 Where you are</b>
    <select id="regionSel" class="fsel" aria-label="Where you are" style="margin-top:10px"><option value=""${cur ? '' : ' selected'}>Automatic: ${esc(Formulas.name(Formulas.regionFor()).replace(/ \(.*\)$/, ''))}</option>
      ${Formulas.REGIONS.map(r => `<option value="${r.id}"${r.id === cur ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
    <p class="note">Formulas sold here come first in the formula list, and the Guide gives this region's emergency number, medicine names and ages first.${cur ? '' : " Worked out from your phone's time zone."} Kept on this phone.</p></div>`;
}
function artHtml() {
  const pages = (kids().length > 1 ? [...kids().map(k => [k.id, kidName(k)]), ['all', 'All']] : [[kids()[0].id, kidName(kids()[0])]]);
  return `<div class="card"><b>🎨 Clock art</b><p class="note">The watercolour painting around the day clock. Kept on this phone.</p>
    ${pages.map(([id, name]) => `<div class="stat"><span>${esc(name)}<br><small>${esc(Art.byId(artOf(id)).name)}</small></span><button class="btn" data-art="${id}" style="padding:6px 12px">Change</button></div>`).join('')}</div>`;
}
/** Light, dark, matching the phone, or following sunrise and sunset (kept on this phone). */
function appearanceHtml() {
  const m = Theme.mode, s = Theme.todaySun(), where = s.zone ? ` for the ${esc(s.zone)} time zone` : ' from your time zone';
  const opts = [['system', 'Match phone'], ['light', 'Light'], ['dark', 'Dark'], ['sun', 'Sunrise & sunset']];
  return `<div class="card"><b>🌗 Appearance</b>
    <div class="chips" style="margin-top:10px">${opts.map(([v, l]) => chip('themeMode', v, l, m === v, '', true)).join('')}</div>
    <p class="note">${m === 'sun' ? (s.polar ? `The sun ${s.polar === 'day' ? "doesn't set" : "doesn't rise"} here today, so it stays ${s.polar === 'day' ? 'light' : 'dark'}.` : `Today: light from ${fmtTime(s.rise)}, dark from ${fmtTime(s.set)}.`) + ` Estimated${where}; your location isn't used.`
      : m === 'system' ? "Follows your phone's light or dark setting." : 'Switching plays a little sunrise or sunset.'}</p></div>`;
}
function moreView() {
  return Acct.accountHtml() + `
  ${kidsHtml()}
  ${regionHtml()}
  ${artHtml()}
  ${appearanceHtml()}
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
  document.querySelectorAll('[data-face]').forEach(b => b.onclick = () => { db.meta.clock = b.dataset.face; Store.save(db); quad = null; render(); });
  document.querySelectorAll('[data-half]').forEach(b => b.onclick = () => { half = +b.dataset.half; quad = null; render(); });
  document.querySelectorAll('details[data-grp]').forEach(d => d.ontoggle = () => {
    d.open ? openGroups.add(d.dataset.grp) : openGroups.delete(d.dataset.grp);
    if (!d.open) d.querySelectorAll('details.pix[open]').forEach(p => { p.open = false; });   // closing a card hides its pictures again
  });
  document.querySelectorAll('.bar[data-tip]').forEach(b => b.onclick = () => toast(b.dataset.tip));
  document.querySelectorAll('svg [role=button]').forEach(b => b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  if ($('#docBtn')) $('#docBtn').onclick = () => openDoctor(false);
  document.querySelectorAll('[data-qadd]').forEach(b => b.onclick = () => openQuick(b.dataset.qadd));
  document.querySelectorAll('[data-qmore]').forEach(b => b.onclick = openMoreTypes);
  document.querySelectorAll('[data-tripnew]').forEach(b => b.onclick = () => openTrip(null));
  document.querySelectorAll('[data-tripplan]').forEach(b => b.onclick = () => openTrip(null, +b.dataset.tripplan));
  document.querySelectorAll('[data-tripedit]').forEach(b => b.onclick = () => { const t = db.events.find(e => e.id === b.dataset.tripedit); if (t) openTrip(t); });
  document.querySelectorAll('[data-triphome]').forEach(b => b.onclick = endTrip);
  document.querySelectorAll('[data-leg]').forEach(b => b.onclick = toggleLeg);
  document.querySelectorAll('[data-art]').forEach(b => b.onclick = () => openArtPicker(b.dataset.art || dayKid()));
  if (tab === 'more') { bindMore(); Acct.bindMoreAccount(); }
  if (tab === 'family') Acct.bindFamily();
}
$('#kidBar').onclick = e => { const b = e.target.closest('[data-kid]'); if (b) { setKid(b.dataset.kid); render(); window.scrollTo(0, 0); } };
$('#helpBtn').onclick = startTour;
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; if (tab === 'month') calMonth = new Date(viewDay); render(); window.scrollTo(0, 0); } };

function bindMore() {
  document.querySelectorAll('[name=themeMode]').forEach(r => r.onchange = () => { if (r.checked) { Theme.set(r.value); render(); } });
  $('#regionSel').onchange = e => { if (e.target.value) db.meta.region = e.target.value; else delete db.meta.region; Store.save(db); render(); toast(`Where you are: ${Formulas.name(myRegion())}`); };
  bindFormulaPickers($('#view'));
  /** Keep `name`/`birth` mirroring the first child, then save and (when shared) send the new profile. */
  const commit = (msg) => { db.baby.name = kids()[0].name; db.baby.birth = kids()[0].birth; Sync.linked() ? Sync.pushBaby() : save(); render(); if (msg) toast(msg); };
  const K = id => kidById(id);
  document.querySelectorAll('[data-kn]').forEach(i => i.onchange = () => { const k = K(i.dataset.kn); if (k && Sync.can('profile')) { k.name = i.value.trim().slice(0, 60); commit(); } });
  const setFormula = (k, name) => { k.formula = name.trim().slice(0, 60); k.formulaAt = Date.now(); commit('Saved'); };   // feeds before now don't count towards learning another
  document.querySelectorAll('[data-kfs]').forEach(sel => sel.onchange = () => {
    const k = K(sel.dataset.kfs), other = document.querySelector(`[data-kft="${sel.dataset.kfs}"]`);
    if (!k || !Sync.can('profile')) return;
    if (sel.value === '__other') { other.hidden = false; other.focus(); return; }
    setFormula(k, sel.value);
  });
  document.querySelectorAll('[data-kft]').forEach(i => i.onchange = () => { const k = K(i.dataset.kft); if (k && Sync.can('profile') && i.value.trim()) setFormula(k, i.value); });
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
      return [Travel.isTravel(e.type) ? '' : kidName(kidById(childOf(e))), dkey(e.ts), fmtTime(e.ts), e.type, a, b, e.end ? fmtTime(e.end) : '', e.note].map(q).join(',');   // (a trip is everyone's)
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

/** The child a feed is for (to suggest their formula): the entry's own, else the open page's, else the first. */
const feedKid = ev => kidById(ev ? childOf(ev) : dayKid()) || kids()[0];
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
      <div id="fFormula"><label class="f">Which formula</label>${formulaPicker({ sel: 'id="formulaSel" aria-label="Which formula"', txt: 'id="formula" aria-label="Formula name"' }, ev ? d.formula || '' : usualFormula(feedKid(ev)), recentFormulas(ev ? [feedKid(ev)] : kids()))}</div></div>`;
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
  bindFormulaPickers(S);
  const val = n => { const c = checked(n); return c ? c.value : ''; };
  const sync = () => {
    if (type === 'feed' && $('#fBreast')) {
      const b = val('kind') === 'bottle'; $('#fBreast').hidden = b; $('#fBottle').hidden = !b; $('#fFormula').hidden = val('milk') !== 'Formula';
      $('#formula').hidden = $('#formulaSel').value !== '__other';
      // logging for several children: suggest the first ticked child's usual formula, until a formula is picked by hand
      const first = S.querySelector('[name=kid]:checked');
      if (!ev && first && !S.dataset.formulaPicked) { const u = usualFormula(kidById(first.value)); if (u) setPick(S.querySelector('.fpick'), u); }
    }
    if (type === 'diaper' && $('#dColor')) $('#dColor').hidden = !checked('poo');
  };
  S.onchange = e => { if (e && e.target && (e.target.id === 'formulaSel' || e.target.id === 'formula')) S.dataset.formulaPicked = '1'; sync(); };
  delete S.dataset.formulaPicked; sync();
  S.querySelectorAll('[data-ago]').forEach(b => b.onclick = () => { $('#ts').value = toLocalInput(Date.now() - b.dataset.ago * MIN); });
  const en = S.querySelector('[data-endnow]'); if (en) en.onclick = () => { $('#end').value = toLocalInput(Date.now()); };
  const close = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; };
  $('#sheetBack').onclick = $('#cancel').onclick = close;
  if ($('#del')) $('#del').onclick = () => { if (confirm('Delete this entry?')) { removeEvent(ev); save(); close(); render(); toast('Deleted'); } };
  $('#save').onclick = () => {
    const ts = fromLocalInput($('#ts').value);
    if (!ts) return toast('Please pick a time');
    const n = id => { const v = $(id).value; return v === '' ? undefined : +v; };
    const formulaName = () => { const sel = $('#formulaSel'); return sel ? (sel.value === '__other' ? $('#formula').value : sel.value).trim().slice(0, 60) : ''; };
    let data = {}, end;
    if (type === 'feed') data = val('kind') === 'bottle' ? { kind: 'bottle', ml: n('#ml'), milk: val('milk'), ...(val('milk') === 'Formula' && formulaName() ? { formula: formulaName() } : {}) } : { kind: 'breast', side: val('side'), min: n('#min') };
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
    if (ev && ev.data && ev.data.approx && Math.floor(ts / MIN) === Math.floor(ev.ts / MIN)) data.approx = true;   // still the estimated time
    const who = multi ? [...S.querySelectorAll('[name=kid]:checked')].map(c => c.value).filter(id => kidById(id)) : [kids()[0].id];
    if (!who.length) return toast('Choose who this is for');
    if (type === 'sleep' && !end) { for (const id of who) { const cur = activeSleep(id); if (cur && cur !== ev) return toast(`${multi ? kidName(kidById(id)) + ' is' : 'Already'} sleeping – tap “Woke up” first`); } }
    const usualBefore = new Map(who.map(id => [id, type === 'feed' ? usualFormula(kidById(id)) : '']));
    for (const id of who) {
      const rec = ev || { id: uid(), type, by: Auth.id || undefined };
      Object.assign(rec, { ts, data: structuredClone(data), note: $('#note').value.trim(), updated: stamp(), child: id });
      if (type === 'sleep') { if (end) rec.end = end; else delete rec.end; }
      if (!ev) db.events.push(rec);
    }
    if (who.length === 1) { if (dayKid() !== who[0]) setKid(who[0]); } else if (dayKid() !== 'all' && !who.includes(dayKid())) setKid('all');
    save(); close(); viewDay = startOfDay(ts); render(); toast(who.length > 1 ? `Saved for ${who.length} children` : 'Saved');
    const settled = type === 'feed' ? who.filter(id => learnedFormula(kidById(id)) && usualFormula(kidById(id)) !== usualBefore.get(id)) : [];
    if (settled.length) toast(`${usualFormula(kidById(settled[0]))} is now ${settled.map(id => kidName(kidById(id))).join(' and ')}'s usual formula`);
    if (type === 'diaper' && data.poo && STOOL_WARN.includes(data.color)) setTimeout(() => alert('Red-streaked or pale / white stools can be a sign of a problem. Please tell your pediatrician (and call straight away if your baby seems unwell).'), 300);
    if (type === 'health' && data.symptoms.some(s => URGENT.includes(s))) setTimeout(() => alert('One of these symptoms can be urgent. If your baby has blue lips/face, trouble breathing, a fever (38°C / 100.4°F+ in a newborn) or is hard to wake, call your pediatrician or emergency services now.'), 300);
  };
}

setInterval(() => { if ((activeSleep() || Travel.moving(db.events)) && tab === 'day') render(); }, 60000);

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
  if (Tour.active()) { Tour.end(false); return true; }
  if (!$('#sheet').hidden) { $('#sheetBack').click(); return true; }
  if (tab !== 'day') { tab = 'day'; render(); return true; }
  return false;
});
Lock.onChange = () => render();
Sync.onSessionLost = () => Acct.sessionLost();
(async () => {
  await Store.init(); db = normalize(await Store.load());   // before anything reads the log
  Icons.init(); Icons.paint(document.querySelector('#tabs')); Icons.paint(document.querySelector('#cover')); Icons.paint(document.querySelector('#helpBtn'));
  Theme.onChange = () => render();
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
