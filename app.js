'use strict';
/* Little Log – newborn tracker. The log is kept on the phone (store.js) and synced, end-to-end encrypted, when signed in. */

// ---------- Config ----------
// Entries come in six groups; each group has one colour. The colours were checked as a set (colour-blind separation, contrast on the
// paper background) in this ring order, inner to outer, separately for light and dark mode. On the day clock each group also has its
// own ring and icon, so colour is never the only way to tell them apart.
const GROUPS = [
  { id: 'feed', label: N_('Feeding'), icon: '🍼', types: ['feed'] },
  { id: 'diaper', label: N_('Diapers'), icon: '💧', types: ['diaper'] },
  { id: 'sleep', label: N_('Sleep & night wakings'), icon: '😴', types: ['sleep', 'wake'] },
  { id: 'vomit', label: N_('Vomit'), icon: '🤮', types: ['vomit'] },
  { id: 'play', label: N_('Play'), icon: '🧸', types: ['play'] },
  { id: 'health', label: N_('Health & meds'), icon: '🩺', types: ['health', 'med'] },
];
const RING = ['sleep', 'feed', 'diaper', 'vomit', 'play', 'health'];
const GCOLOR = {
  light: { sleep: '#5b5fc7', feed: '#c9761f', diaper: '#2a9db8', vomit: '#5f8a1f', play: '#a845a8', health: '#c0392b', poo: '#8a5a2b' },
  dark: { sleep: '#7478d8', feed: '#c97a2a', diaper: '#2b9fc0', vomit: '#8a9a2a', play: '#b85ab0', health: '#dd5a4a', poo: '#b98a55' },
};
const groupOf = t => GROUPS.find(g => g.types.includes(t)) || GROUPS[0];
const TYPES = {
  feed:   { label: N_('Feed'),     noun: N_('feed'),       icon: '🍼' },
  diaper: { label: N_('Diaper'),   noun: N_('diaper'),     icon: '💧' },
  sleep:  { label: N_('Sleep'),    noun: N_('sleep'),      icon: '😴' },
  wake:   { label: N_('Night wake'), noun: N_('night wake'), icon: '🌙' },
  vomit:  { label: N_('Vomit'),    noun: N_('vomit'),      icon: '🤮' },
  play:   { label: N_('Play'),     noun: N_('play'),       icon: '🧸' },
  health: { label: N_('Health'),   noun: N_('health note'), icon: '🩺' },
  med:    { label: N_('Meds'),     noun: N_('meds'),       icon: '💊' },
};
for (const [t, T] of Object.entries(TYPES)) T.color = GCOLOR.light[groupOf(t).id];   // plain hex (light) for the few places that need one
const INK = '#2a241c';   // the dark the type colours are mixed with, so icons and text in them stay easy to read
// The answers below are saved in the log in English (so every phone reads them the same) and shown in each phone's language.
const SYMPTOMS = [
  N_('Blue/purple hands or feet'), N_('Blue lips or face'), N_('Clicking joints (hips)'), N_('Belly bulge / hernia'),
  N_('Umbilical cord issue'), N_('Yellow skin (jaundice)'), N_('Rash'), N_('Fever'), N_('Fast / noisy breathing'),
  N_('Excessive crying'), N_('Refusing feeds'), N_('Very sleepy / hard to wake'), N_('Constipation'), N_('Reflux / arching'),
];
// Symptoms worth highlighting; these are not a diagnosis, just a nudge to call the doctor.
const URGENT = ['Blue lips or face', 'Fever', 'Fast / noisy breathing', 'Very sleepy / hard to wake', 'Refusing feeds'];
const STOOL = [N_('Black/tarry'), N_('Green'), N_('Yellow'), N_('Brown'), N_('Red-streaked'), N_('White/pale')];
const STOOL_WARN = ['Red-streaked', 'White/pale'];
const PLAYS = [N_('Tummy time'), N_('Play'), N_('Walk / outing'), N_('Bath'), N_('Skin-to-skin')];
const WAKE_WHY = [N_('Hungry'), N_('Diaper'), N_('Gas / fussy'), N_('Unknown')];
const SIDES = [N_('Left'), N_('Right'), N_('Both')], MILKS = [N_('Breast milk'), N_('Formula')], AMOUNTS = [N_('Spit-up'), N_('Medium'), N_('Large')];

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
// Dates and times in the app's language (i18n.js), with the phone's regional variant of it.
const fmtTime = t => new Date(t).toLocaleTimeString(I18n.locale(), { hour: 'numeric', minute: '2-digit' });
const fmtDate = t => new Date(t).toLocaleDateString(I18n.locale(), { weekday: 'long', month: 'short', day: 'numeric' });
const fmtShort = t => new Date(t).toLocaleDateString(I18n.locale(), { weekday: 'short', month: 'short', day: 'numeric' });
/** The one-letter weekday names, starting with the first day of the week where the phone is. */
const weekLetters = () => { const f = I18n.firstDay(), fmt = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'narrow' }); return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + ((f + i) % 7)))); };
/** "a, b and c" in the app's language. */
const andList = list => { try { return new Intl.ListFormat(I18n.locale(), { type: 'conjunction' }).format(list); } catch (e) { return list.join(', '); } };
const toLocalInput = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = v => new Date(v).getTime();
const fmtDur = m => { m = Math.round(m); if (m < 60) return __('{m}m', { m }); const h = Math.floor(m / 60); return m % 60 ? __('{h}h {m}m', { h, m: m % 60 }) : __('{h}h', { h }); };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const r1 = n => Math.round(n * 10) / 10;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, Math.max(2200, String(msg).length * 60)); }   // longer messages stay longer

// ---------- Event description ----------
function describe(e) { try { return describeEntry(e); } catch (err) { return [__((TYPES[e.type] || {}).label || N_('Entry')), '']; } }
function describeEntry(e) {
  const d = e.data || {}, min = n => __('{n} min', { n });
  switch (e.type) {
    case 'feed':
      if (d.kind === 'solids') return [__('Solids'), [(d.foods || []).map(f => __(f)).join(', '), d.amount && __(d.amount)].filter(Boolean).join(' · ')];
      if (d.kind === 'bottle') return [d.ml ? __('Bottle {ml} ml', { ml: d.ml }) : __('Bottle'), [d.milk && __(d.milk), d.formula].filter(Boolean).join(' · ')];
      return [d.side ? __('Breast – {side}', { side: __(d.side) }) : __('Breast'), d.min ? min(d.min) : ''];
    case 'diaper':
      return [d.pee && d.poo ? __('Pee + Poo') : d.pee ? __('Pee') : d.poo ? __('Poo') : __('Dry'), [d.poo && d.color && __(d.color), d.rash && __('rash')].filter(Boolean).join(', ')];
    case 'sleep': return e.end ? [__('Slept {time}', { time: fmtDur((e.end - e.ts) / MIN) }), __('until {time}', { time: fmtTime(e.end) })] : [__('Sleeping now…'), __('tap to set wake time')];
    case 'wake': return [d.min ? __('Awake {n} min', { n: d.min }) : __('Awake'), d.why ? __(d.why) : ''];
    case 'vomit': return [__('Vomit – {amount}', { amount: __(d.amount || N_('small')) }), d.projectile ? __('projectile') : ''];
    case 'play': return [__(d.activity || 'Play'), d.min ? min(d.min) : ''];
    case 'health': return [(d.symptoms || []).map(x => __(x)).join(', ') || __('Note'), d.temp ? __('Temp {t}°', { t: d.temp }) : ''];
    case 'med': return [d.name || __('Medication'), d.dose || ''];
    case 'trip': return [__('Trip {by}', { by: __(Travel.MEANS[Travel.meansOf(e)].by) }), `${fmtShort(e.ts)} – ${fmtShort(Travel.ends(e) - 1)}`];
    case 'leg': return [__(Travel.MEANS[Travel.meansOf(e)].moving), Number.isFinite(e.end) ? fmtDur((e.end - e.ts) / MIN) : __('under way')];
  }
  return [e.type, ''];
}

// ---------- State ----------
let tab = 'day', viewDay = startOfDay(Date.now()), calMonth = new Date(viewDay), statDays = 7;

// ---------- Children ----------
// A log can have several children (twins, triplets…). Every entry belongs to one; each child has a page of their own with their own colour.
const kids = () => db.baby.kids || (db.baby.kids = Kids.clean(null, db.baby.name, db.baby.birth));
const kidById = id => kids().find(k => k.id === id);
const kidName = k => k.name || __('Baby {n}', { n: kids().indexOf(k) + 1 });
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
/** A tab name too long for its tab (seven tabs on a narrow phone, in a language with long words) is drawn a little smaller, down to
    8.5px, rather than cut off. Measured again only when the language or the width of the screen changes. */
function fitTabs() {
  const bar = $('#tabs'), key = I18n.lang() + ' ' + innerWidth;
  if (!bar || !bar.offsetWidth || fitTabs.key === key) return;   // (hidden behind sign-in: measured once it shows)
  fitTabs.key = key;
  for (const el of bar.querySelectorAll('.tl')) {
    el.style.fontSize = '';
    for (let px = parseFloat(getComputedStyle(el).fontSize); el.scrollWidth > el.clientWidth && px > 8.5;) el.style.fontSize = (px -= 0.5) + 'px';
  }
}
window.addEventListener('resize', () => fitTabs());
function render() {
  if (voyageFirst()) return;   // travel mode is switching: the page changes under the journey in a moment
  document.querySelectorAll('#view details[data-grp]').forEach(d => { d.open ? openGroups.add(d.dataset.grp) : openGroups.delete(d.dataset.grp); });   // keep twirl-downs as the user left them
  if (tab !== 'guide') openGroups.forEach(g => { if (g.startsWith('pix')) openGroups.delete(g); });   // except the Guide's pictures: hidden again next time
  const multi = kids().length > 1, vk = kidById(dayKid()), single = kids()[0];
  theme();
  $('#title').textContent = dayKid() === 'all' ? __('Everyone') : (vk && vk.name ? __("{name}'s Log", { name: vk.name }) : (multi ? __("{name}'s Log", { name: kidName(vk) }) : 'Little Log'));
  I18n.paint();   // the tab names and other text in the page shell
  fitTabs();
  $('#av').innerHTML = vk ? avatar(vk) : ''; $('#av').hidden = !vk;
  const g = Acct.gate();
  document.body.classList.toggle('gated', !!g); $('#helpBtn').hidden = !!g;
  if (g) {
    $('#sleepBanner').hidden = true; $('#syncLine').textContent = ''; $('#kidBar').hidden = true; $('#av').hidden = true; $('#famSw').hidden = true; $('#view').innerHTML = g.html + langMini(); g.bind(); Icons.paint($('#view'));
    $('#langMini').onchange = e => setLanguage(e.target.value); lastScreen = 'signin';
    return;
  }
  syncLine();
  // which family log is shown, for someone in more than one (yours, a sister's children you look after …): tap to switch
  const fam = Acct.famLabel(), fs = $('#famSw'); fs.hidden = !fam;
  if (fam) { fs.innerHTML = `🌳 ${esc(fam)}<span class="chev" aria-hidden="true">›</span>`; fs.setAttribute('aria-label', __('Switch family') + ': ' + fam); fs.onclick = Acct.familySwitcher; Icons.paint(fs); }
  // one tab per child (plus "Everyone" on the Day tab)
  const kb = $('#kidBar'); kb.hidden = !multi;
  if (multi) {
    kb.innerHTML = (tab === 'day' ? `<button data-kid="all" class="${curKid() === 'all' ? 'on' : ''}" aria-pressed="${curKid() === 'all'}" style="--k:#64759f"><span class="av" style="--k:#64759f">★</span>${__h('All')}</button>` : '')
      + kids().map(k => `<button data-kid="${k.id}" class="${dayKid() === k.id ? 'on' : ''}" aria-pressed="${dayKid() === k.id}" style="--k:${k.color};--kl:${Kids.mix(k.color, '#ffffff', 0.45)}">${avatar(k)}${esc(kidName(k))}</button>`).join('');
  }
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const sleepers = kids().map(k => [k, activeSleep(k.id)]).filter(x => x[1]), bn = $('#sleepBanner');
  bn.hidden = !sleepers.length;
  if (sleepers.length) {
    bn.innerHTML = sleepers.map(([k, s], i) => `<div class="brow"><span>😴 ${multi ? `<b>${esc(kidName(k))}</b> ` : ''}${__h('Asleep since {time} ({long})', { time: fmtTime(s.ts), long: fmtDur((Date.now() - s.ts) / MIN) })}</span><button ${i ? '' : 'id="wakeBtn"'} data-wake="${s.id}">${__h('Woke up')}</button></div>`).join('');
    bn.querySelectorAll('[data-wake]').forEach(b => b.onclick = () => { const s = db.events.find(x => x.id === b.dataset.wake); if (!s) return; if (!Sync.can('edit', s)) return toast(__("You can't change this entry")); s.end = Date.now(); s.updated = stamp(); save(); render(); toast(__('Sleep saved')); });
    Icons.paint(bn);
  }
  $('#view').innerHTML = { day: dayView, routine: routineView, month: monthView, stats: statsView, guide: guideView, family: Acct.familyHtml, more: moreView }[tab]();
  bind(); Icons.paint($('#view')); Acct.updateBadge();
  if (!solidsCheck()) milestoneCheck(); autoTour();
}

/** Whoever is feeding the baby sees their allergies at the top of the day. */
function allergyLine() {
  const ks = (dayKid() === 'all' ? kids() : [kidById(dayKid())]).filter(k => k && (k.allergies || []).length);
  return ks.length ? `<p class="note allergyline">⚠️ ${__h('Allergies: {foods}', { foods: ks.map(k => (kids().length > 1 ? kidName(k) + ': ' : '') + k.allergies.map(a => __(a.food)).join(', ')).join(' · ') })}</p>` : '';
}
function dayView() {
  const evs = eventsOnDay(viewDay), isToday = viewDay === startOfDay(Date.now()), twelve = face12(), trip = tripOn(viewDay), TM = trip && Travel.MEANS[Travel.meansOf(trip)];
  const sp = clockSpan(viewDay), shown = evs.filter(e => e.ts >= sp.start && e.ts < sp.start + sp.len);
  const q = quad == null ? null : quadInfo(quad, viewDay), inQ = q ? evs.filter(e => e.ts >= q.start && e.ts < q.end) : null;
  const seg = (attr, opts, cur, label) => `<div class="seg mini" role="group" aria-label="${__h(label)}">${opts.map(([v, l]) => `<button data-${attr}="${v}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}">${__h(l)}</button>`).join('')}</div>`;
  return `${trip ? tripCard(trip) : ''}
  <div class="datenav"><button data-nav="-1" aria-label="${__h('Previous day')}">‹</button>
    <div class="d">${isToday ? __h('Today') : esc(fmtDate(viewDay))}<small>${isToday ? esc(fmtDate(viewDay)) : ''}${esc(ageText(viewDay))}</small></div>
    <button data-nav="1" aria-label="${__h('Next day')}" ${isToday ? 'disabled' : ''}>›</button></div>
  ${allergyLine()}
  ${trip && isToday ? travelQuick() : quickButtons()}
  <div class="clockwrap" style="${GROUPS.map(g => `--g-${g.id}:${(trip ? Travel.PALETTE : GCOLOR).light[g.id]}`).join(';')};--trip:${Travel.ACCENT.light}">${clockSvg(shown, viewDay)}
    <div class="clockctl">${seg('face', [['24', N_('24 h')], ['12', N_('12 h')]], twelve ? '12' : '24', N_('Clock face'))}${twelve ? seg('half', [['0', N_('AM')], ['1', N_('PM')]], String(half), N_('Half of the day')) : ''}${numsSeg()}${trip ? `<span class="artbtn tripart">${TM.icon} ${__h(Art.byId(TM.art).name)}</span>` : `<button class="artbtn" data-art>🎨 ${__h(Art.byId(artOf()).name)}</button>`}</div>
    ${clockLegend(shown)}
    <p class="note hint">${twelve ? (half ? __h('Showing noon to midnight; switch AM and PM for the other half of the day.') : __h('Showing midnight to noon; switch AM and PM for the other half of the day.')) : __h('Midnight is at the top, noon at the bottom.')} ${__h('Tap a dot to see an entry (change it in the list below), or a quarter of the dial for just those hours.')}</p></div>
  ${q ? `<div class="card quadlist"><div class="qhead"><span><b>${esc(q.label)}</b> <small>${esc(q.range)} · ${__hn('{n} entry', '{n} entries', inQ.length)}</small></span><button class="btn" data-quadclear style="padding:6px 12px">${__h('Whole day')}</button></div>
      ${inQ.length ? inQ.map(evRow).join('') : `<div class="empty">${__h('Nothing in these hours.')}</div>`}</div>`
    : (evs.length ? `<h2>${__h('Details')}</h2>${groupedList(evs)}` : `<div class="empty">${__h('Nothing logged yet.')}${Sync.can('add') ? '<br>' + __h('Tap a button above to add an entry.') : ''}</div>`)}
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
const QUAD_NAMES = { day: [N_('Night'), N_('Morning'), N_('Afternoon'), N_('Evening')], am: [N_('Late night'), N_('Early morning'), N_('Morning'), N_('Late morning')], pm: [N_('Early afternoon'), N_('Late afternoon'), N_('Evening'), N_('Night')] };
const fmtHour = t => new Date(t).toLocaleTimeString(I18n.locale(), { hour: 'numeric' });
/** A quarter of the dial: 6 hours on the 24-hour face, 3 hours on the 12-hour one. */
function quadInfo(i, day) {
  const sp = clockSpan(day), q = sp.len / 4, start = sp.start + i * q;
  return { label: __(QUAD_NAMES[face12() ? (half ? 'pm' : 'am') : 'day'][i]), range: `${fmtHour(start)} – ${fmtHour(start + q)}`, start, end: start + q };
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
// The clock's numbers: Roman like a carriage clock, or plain ones that are easier to read (Numbers on the clock, kept on this phone).
const plainNums = () => db.meta.nums === 'plain';
/** Whether times are written with a 24-hour clock where the phone is (13:00 rather than 1 PM). */
const writes24 = () => { try { return /13/.test(new Date(2000, 0, 1, 13).toLocaleTimeString(I18n.locale(), { hour: 'numeric' })); } catch (e) { return false; } };
function numsSeg() {
  const cur = plainNums() ? 'plain' : 'roman';
  return `<div class="seg mini nums" role="group" aria-label="${__h('Numbers on the clock')}">${[['roman', 'XII', N_('Roman numerals')], ['plain', '123', N_('Easy-to-read numbers')]].map(([v, l, name]) =>
    `<button data-nums="${v}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}" aria-label="${__h(name)}" title="${__h(name)}">${l}</button>`).join('')}</div>`;
}
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
  // railway minute track and the hours. 24-hour face: numerals on the even hours, a moon at midnight and a sun at noon.
  // 12-hour face: all twelve numerals, with a.m. or p.m. under the centre.
  dial += `<circle cx="${C.x}" cy="${f1(C.y)}" r="${f1(rr(112))}" fill="none" stroke="${ink}" stroke-opacity=".7" stroke-width=".6"/><circle cx="${C.x}" cy="${f1(C.y)}" r="${f1(rr(118))}" fill="none" stroke="${ink}" stroke-opacity=".7" stroke-width=".6"/>`;
  let ticks = '';
  const marks = twelve ? 60 : 96, every = twelve ? 5 : 4;
  for (let q = 0; q < marks; q++) { const a = ang(q / marks), hr = q % every === 0; ticks += `M${xy(a, rr(hr ? 110 : 112))}L${xy(a, rr(hr ? 120 : 118))}`; }
  dial += `<path d="${ticks}" stroke="${ink}" stroke-opacity=".75" stroke-width=".7"/>`;
  // (Roman numerals turn with the dial; plain numbers stand upright)
  const plain = plainNums(), h24 = plain && writes24();
  const num = (x, y, deg, t) => (plain ? `<text class="num plain" x="${f1(x)}" y="${f1(y)}" text-anchor="middle" dy=".36em" fill="${ink}">${t}</text>`
    : `<text class="num" transform="translate(${f1(x)} ${f1(y)}) rotate(${deg})" text-anchor="middle" dy=".36em" fill="${ink}">${t}</text>`);
  if (twelve) {
    for (let h = 1; h <= 12; h++) { const [x, y] = P(ang(h / 12), rr(plain ? 100 : 101)); dial += num(x, y, h * 30, plain ? String(h) : h === 12 ? 'XII' : ROMAN[h]); }
    dial += `<text class="ampm" x="${C.x}" y="${f1(C.y + rr(15))}" text-anchor="middle" fill="${ink}">${half ? __h('p.m.') : __h('a.m.')}</text>`;
  } else for (let h = 0; h < 24; h += 2) {
    const a = ang(h / 24), [x, y] = P(a, rr(101));
    if (h === 0) dial += `<path transform="translate(${f1(x)} ${f1(y)})" d="M2.5 -6.2A6.4 6.4 0 1 0 2.5 6.2A5 5 0 1 1 2.5 -6.2Z" fill="${gilt}"/>`;
    else if (h === 12) dial += `<g transform="translate(${f1(x)} ${f1(y)})" fill="${gilt}" stroke="${gilt}"><circle r="3.6"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<path d="M0 -5.4V-7.6" transform="rotate(${k * 45})" stroke-width="1.2" stroke-linecap="round"/>`).join('')}</g>`;
    else dial += num(...(plain ? P(a, rr(100)) : [x, y]), h * 15, plain ? String(h24 ? h : h % 12) : ROMAN[h % 12]);
  }
  // quarters (tap targets), washed in the page colour when chosen
  let quads = '';
  for (let i = 0; i < 4; i++) { const a0 = ang(i / 4), a1 = ang((i + 1) / 4); quads += `<path class="qw ${quad === i ? 'on' : ''}" data-quad="${i}" role="button" tabindex="0" aria-pressed="${quad === i}" aria-label="${esc(quadInfo(i, day).label + ', ' + quadInfo(i, day).range)}" d="M${C.x} ${f1(C.y)}L${xy(a0, RD)}A${f1(RD)} ${f1(RD)} 0 0 1 ${xy(a1, RD)}Z"/>`; }
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
    const approx = !!(e.data && e.data.approx), when = approx ? __('about {time}', { time: fmtTime(e.ts) }) : fmtTime(e.ts);
    data += `<g class="ray${approx ? ' approx' : ''}" data-info="${e.id}" role="button" tabindex="0" aria-label="${esc(when + ' ' + __(TYPES[e.type].label) + ': ' + d + (k ? ', ' + kidName(k) : ''))}" style="--c:var(--g-${g})">
      <title>${esc(when + ' · ' + d + (k ? ' · ' + kidName(k) : ''))}</title>
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
  const summary = GROUPS.map(gr => [gr.label, evs.filter(e => gr.types.includes(e.type)).length]).filter(x => x[1]).map(x => __('{group}: {n}', { group: __(x[0]), n: x[1] })).join(', ');
  const what = twelve ? (half ? __('12-hour clock, noon to midnight') : __('12-hour clock, midnight to noon')) : __('24-hour clock of the day, midnight at the top and noon at the bottom');
  return `<svg class="clock" viewBox="0 0 ${F.W} ${F.H}" data-cx="${C.x}" data-cy="${f1(C.y)}" data-painting="${th.id}" data-dial="${twelve ? 12 : 24}" role="group" aria-label="${esc(summary ? __('{clock}: {entries}', { clock: what, entries: summary }) : __('{clock}, no entries', { clock: what }))}">
    <g aria-hidden="true">${frame}${panel}${dial}</g>${quads}<g class="data">${data}</g><g class="hands" aria-hidden="true">${hand}${boss}</g></svg>`;
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
  return `<div class="clegend">${GROUPS.map(g => { const n = evs.filter(e => g.types.includes(e.type)).length; return `<span class="${n ? '' : 'zero'}"><i style="--c:var(--g-${g.id})"></i>${__h(g.label)} <b>${n}</b></span>`; }).join('')}</div>`;
}
/** One twirl-down per group (pee and poo together, sleep and night wakings together…), each with a one-line summary. */
const openGroups = new Set();
function groupSummary(g, list) {
  const n = list.length;
  switch (g.id) {
    case 'feed': {   // (milk feeds, and meals of solid food counted apart)
      const milk = list.filter(e => e.data.kind !== 'solids'), ml = milk.reduce((a, e) => a + (+e.data.ml || 0), 0), meals = n - milk.length;
      return [milk.length && __n('{n} feed', '{n} feeds', milk.length) + (ml ? ' · ' + __('{n} ml', { n: ml }) : ''), meals && `${__('Solids')} ×${meals}`].filter(Boolean).join(' · ');
    }
    case 'diaper': return `${__n('{n} diaper', '{n} diapers', n)} · ${__('{pee} pee, {poo} poo', { pee: list.filter(e => e.data.pee).length, poo: list.filter(e => e.data.poo).length })}`;
    case 'sleep': { const sl = list.filter(e => e.type === 'sleep'), w = list.length - sl.length, m = sl.reduce((a, e) => a + ((e.end || Date.now()) - e.ts) / MIN, 0); return [sl.length && `${__n('{n} sleep', '{n} sleeps', sl.length)} · ${fmtDur(m)}`, w && __n('{n} night waking', '{n} night wakings', w)].filter(Boolean).join(' · '); }
    case 'play': { const m = list.reduce((a, e) => a + (+e.data.min || 0), 0); return __n('{n} time', '{n} times', n) + (m ? ` · ${fmtDur(m)}` : ''); }
    case 'health': { const h = list.filter(e => e.type === 'health').length; return [h && __n('{n} note', '{n} notes', h), n - h && __n('{n} medicine', '{n} medicines', n - h)].filter(Boolean).join(' · '); }
  }
  return __n('{n} time', '{n} times', n);
}
function groupedList(evs, key = 'd') {
  return GROUPS.map(g => {
    const list = evs.filter(e => g.types.includes(e.type)); if (!list.length) return '';
    const id = key + g.id, warn = list.some(isWarn);
    return `<details class="grp ${warn ? 'alert' : ''}" data-grp="${id}" ${openGroups.has(id) ? 'open' : ''} style="--c:var(--g-${g.id})"><summary><span class="gi">${g.icon}</span><span class="gt"><b>${__h(g.label)}</b><small>${esc(groupSummary(g, list))}</small></span><span class="chev" aria-hidden="true">›</span></summary>
      <div class="grows">${list.map(evRow).join('')}</div></details>`;
  }).join('');
}
/** Counts for one day, as small tiles. */
function dayCounts(evs, day) {
  const of = t => evs.filter(e => e.type === t), feeds = of('feed').filter(e => e.data.kind !== 'solids'), ml = feeds.reduce((a, e) => a + (+e.data.ml || 0), 0), dia = of('diaper');
  const sleeps = of('sleep'), mins = sleeps.reduce((a, e) => a + (Math.min(e.end || Date.now(), day + DAY) - Math.max(e.ts, day)) / MIN, 0), play = of('play').reduce((a, e) => a + (+e.data.min || 0), 0);
  const tiles = [['feed', '🍼', N_('Feeds'), feeds.length, ml ? __('{n} ml', { n: ml }) : ''], ['diaper', '💧', N_('Pee'), dia.filter(e => e.data.pee).length, ''], ['poo', '💩', N_('Poo'), dia.filter(e => e.data.poo).length, ''],
    ['sleep', '😴', N_('Sleep'), sleeps.length ? fmtDur(mins) : 0, sleeps.length ? __n('{n} sleep', '{n} sleeps', sleeps.length) : ''], ['sleep', '🌙', N_('Night wakings'), of('wake').length, ''],
    ['feed', '🥄', N_('Solids'), of('feed').length - feeds.length, ''], ['vomit', '🤮', N_('Vomit'), of('vomit').length, ''], ['play', '🧸', N_('Play'), play ? fmtDur(play) : of('play').length, ''], ['health', '🩺', N_('Health notes'), of('health').length, ''], ['health', '💊', N_('Medicines'), of('med').length, '']]
    .filter((t, i) => i < 4 || t[3]);
  return `<div class="tiles">${tiles.map(([g, ic, l, v, sub]) => `<div class="tile" style="--c:var(--g-${g})"><span class="tv">${ic} <b>${esc(v)}</b></span><span class="tl">${__h(l)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`).join('')}</div>`;
}
const kidTag = e => { if (dayKid() !== 'all') return ''; const k = kidById(childOf(e)); return `<span class="ktag" style="--k:${k.color}">${avatar(k)}${esc(kidName(k))}</span>`; };
const quickButtons = () => Sync.can('add')
  ? `<div class="quick" style="margin-bottom:10px">${Object.entries(TYPES).filter(([k]) => Sync.can('health') || (k !== 'health' && k !== 'med')).map(([k, t]) => `<button data-add="${k}" style="--cw:${Kids.rgba(t.color, 0.3)}"><b>${t.icon}</b>${__h(t.label)}</button>`).join('')}</div>` : '';
/** "added by Dad" – only when the log is shared and the person is known. */
const byLine = e => { const n = Sync.linked() && e.by && e.by !== Auth.id ? Sync.nameOf(e.by) : ''; return n ? `<small>${__h('added by {name}', { name: n })}</small>` : ''; };
const isWarn = e => (e.type === 'health' && (e.data.symptoms || []).some(s => URGENT.includes(s))) || (e.type === 'diaper' && !!e.data.poo && STOOL_WARN.includes(e.data.color));
function evRow(e) {
  const [a, b] = describe(e), t = TYPES[e.type];
  return `<div class="card ev ${isWarn(e) ? 'alert' : ''}" style="--c:var(--${e.type})" data-edit="${e.id}">
    <div class="t">${e.data && e.data.approx ? `<span class="approx" title="${__h('About this time')}">~</span>` : ''}${esc(fmtTime(e.ts))}</div>
    <div class="b">${kidTag(e)}${t.icon} <b>${esc(a)}</b>${b ? `<small>${esc(b)}</small>` : ''}${e.note ? `<small>“${esc(e.note)}”</small>` : ''}${byLine(e)}</div></div>`;
}
function ageText(day) {
  const k = kidById(dayKid());
  if (!k || !k.birth) return '';
  const d = Math.floor((day - startOfDay(new Date(k.birth + 'T00:00').getTime())) / DAY);
  if (d < 0) return '';
  return ' · ' + (d < 14 ? __('day {n}', { n: d + 1 }) : __n('{n} week', '{n} weeks', Math.floor(d / 7)));
}

function monthView() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), today = startOfDay(Date.now());
  let cells = '', anyAway = false, anyAllergy = false;
  const tv = travelVars(), firsts = allergyDays([dayKid()]);
  for (let i = 0; i < (first.getDay() - I18n.firstDay() + 7) % 7; i++) cells += '<button class="blank" disabled></button>';
  for (let d = 1; d <= days; d++) {
    const t = new Date(y, m, d).getTime(), evs = eventsOnDay(t), away = Travel.during(db.events, t, addDays(t, 1)), al = firsts.get(dkey(t));
    if (away) anyAway = true; if (al) anyAllergy = true;
    cells += `<button data-day="${t}" class="${t === viewDay ? 'sel' : ''} ${t === today ? 'today' : ''} ${away ? 'tripday' : ''} ${al ? 'allergyday' : ''}"${away ? ` style="${tv}"` : ''} aria-label="${esc([fmtDate(t), away && __('travelling'), al && __('first allergic reaction: {foods}', { foods: andList(al.map(x => __(x.allergy.food))) }), evs.length && __n('{n} entry', '{n} entries', evs.length)].filter(Boolean).join(', '))}">${d}${al ? '<i class="almark" aria-hidden="true">!</i>' : ''}<span class="dots">${GROUPS.filter(g => evs.some(e => g.types.includes(e.type))).map(g => `<i class="dot" style="--c:var(--g-${g.id})"></i>`).join('')}</span></button>`;
  }
  return `
  <div class="datenav"><button data-month="-1" aria-label="${__h('Previous month')}">‹</button>
    <div class="d">${esc(calMonth.toLocaleDateString(I18n.locale(), { month: 'long', year: 'numeric' }))}</div>
    <button data-month="1" aria-label="${__h('Next month')}">›</button></div>
  <div class="cal">${weekLetters().map(d => `<div class="h">${esc(d)}</div>`).join('')}${cells}</div>
  <div class="legend">${GROUPS.map(g => `<span><i style="--c:var(--g-${g.id})"></i>${__h(g.label)}</span>`).join('')}${anyAway ? `<span class="tripkey"><i></i>${__h('Travelling (its own colours)')}</span>` : ''}${anyAllergy ? `<span class="alkey"><i class="almark">!</i>${__h('First allergic reaction')}</span>` : ''}</div>
  ${monthTrip()}
  ${monthDay()}`;
}
/** On the calendar: plan a trip leaving on the day picked (or today), or change the trip that covers it. */
function monthTrip() {
  if (!Sync.can('add')) return '';
  const tr = Travel.during(db.events, viewDay, addDays(viewDay, 1)), today = startOfDay(Date.now());
  if (tr) { if (!Sync.can('edit', tr)) return ''; const M = Travel.MEANS[Travel.meansOf(tr)]; return `<button class="tripbtn" data-tripedit="${tr.id}"><span class="tm">${M.icon}</span><span><b>${__h('Trip {by}', { by: __(M.by) })}</b><small>${__h('{from} – {to}. Tap to change it.', { from: fmtShort(tr.ts), to: fmtShort(Travel.ends(tr) - 1) })}</small></span><span class="chev" aria-hidden="true">›</span></button>`; }
  const from = Math.max(today, viewDay);
  return `<button class="tripbtn" data-tripplan="${from}"><span class="tm">🧳</span><span><b>${__h('Plan a trip')}</b><small>${from === today ? __h('Leaving today: travel mode switches on by itself that day') : __h('Leaving {day}: travel mode switches on by itself that day', { day: fmtShort(from) })}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}

function monthDay() {
  const evs = eventsOnDay(viewDay), away = Travel.during(db.events, viewDay, addDays(viewDay, 1)), M = away && Travel.MEANS[Travel.meansOf(away)];
  const al = allergyDays([dayKid()]).get(dkey(viewDay)) || [];
  return `<h2>${esc(fmtDate(viewDay))}</h2>
  ${al.map(x => `<div class="card alert alcard">⚠️ <b>${__h('First allergic reaction: {foods}', { foods: __(x.allergy.food) })}</b>${x.allergy.note ? `<br><small>${esc(x.allergy.note)}</small>` : ''}</div>`).join('')}
  <div class="${away ? 'travelday' : ''}"${away ? ` style="${travelVars()}"` : ''}>${away ? `<p class="tripnote">${M.icon} ${__h('Travelling {by}', { by: __(M.by) })}</p>` : ''}
  ${evs.length ? `${dayCounts(evs, viewDay)}<details class="more" data-grp="mAll" ${openGroups.has('mAll') ? 'open' : ''}><summary>${__h('All entries for this day')}<span class="chev" aria-hidden="true">›</span></summary>${groupedList(evs, 'm')}</details>` : `<div class="empty">${__h('No entries this day.')}</div>`}</div>
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
  const feeds = of('feed').filter(e => e.data.kind !== 'solids'), diapers = of('diaper'), sleeps = scoped().filter(e => e.type === 'sleep' && e.end && e.ts >= day && e.ts < day + DAY);   // (milk feeds: a meal of solid food is counted on its own)
  return {
    day, feeds: feeds.length, solids: of('feed').length - feeds.length, ml: feeds.reduce((a, e) => a + (+e.data.ml || 0), 0),
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
  const wk = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'narrow' });
  const lbl = d => (n <= 14 ? wk.format(new Date(d)) : (new Date(d).getDate() % 5 === 0 ? String(new Date(d).getDate()) : ''));
  const bar = (x, w, y0, y1, top) => { const h = y0 - y1; if (h <= 0) return ''; const r = top ? Math.min(4, w / 2, h) : 0; return `M${x.toFixed(1)} ${y0.toFixed(1)}V${(y1 + r).toFixed(1)}${r ? `q0 -${r} ${r} -${r}h${(w - 2 * r).toFixed(1)}q${r} 0 ${r} ${r}` : `h${w.toFixed(1)}`}V${y0.toFixed(1)}Z`; };
  let g = [0, max / 2, max].map(v => `<path class="grid" d="M${L} ${y(v).toFixed(1)}H${W}"/><text class="ax" x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${esc(fmt(Math.round(v * 10) / 10))}</text>`).join('');
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
    const t = lbl(d); if (t) g += `<text class="ax" x="${(x0 + band / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(t)}</text>`;
  });
  const legend = series.length > 1 ? `<div class="clegend">${series.map(s => `<span><i style="--c:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  const table = `<details class="tbl"><summary>${__h('Numbers')}<span class="chev" aria-hidden="true">›</span></summary><div class="tw"><table><thead><tr><th>${__h('Day')}</th>${series.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${days.map((d, i) => `<tr><td>${esc(fmtShort(d))}</td>${series.map(s => `<td>${esc(fmt(s.values[i]))}${unit}</td>`).join('')}</tr>`).reverse().join('')}</tbody></table></div></details>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(__n('{what} per day, last {n} day', '{what} per day, last {n} days', n, { what: andList(series.map(s => s.name)) }))}">${g}</svg>${legend}${table}`;
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
  // (titles and row names are given in English and translated here; values come ready to show)
  const card = (icon, title, rows, ch, cls = '') => `<div class="card scard ${cls}"><b>${icon} ${__h(title)}</b>${rows.map(([n, v]) => `<div class="stat"><span>${__h(n)}</span><b>${esc(v)}</b></div>`).join('')}${ch || ''}</div>`;
  const flagged = mine.filter(e => e.type === 'health' && e.ts >= addDays(today, -statDays + 1) && (e.data.symptoms || []).length).sort((a, b) => b.ts - a.ts);
  const sym = {}; flagged.forEach(e => e.data.symptoms.forEach(s => sym[s] = (sym[s] || 0) + 1));
  const poo = {}; mine.filter(e => e.type === 'diaper' && e.data.poo && e.ts >= addDays(today, -statDays + 1) && e.data.color).forEach(e => poo[e.data.color] = (poo[e.data.color] || 0) + 1);
  const lowWet = used.length && per('pee') < 6 && ageDays() >= 5;
  return `
  <div class="seg">${[7, 14, 30].map(n => `<button data-range="${n}" class="${n === statDays ? 'on' : ''}">${__hn('{n} day', '{n} days', n)}</button>`).join('')}</div>
  ${mine.length ? `<button class="btn pdfbtn" id="pdfBtn">📄 ${__h('Report for the doctor (PDF)')}</button>` : ''}
  ${kids().length > 1 ? `<h2>${esc(kidName(kidById(viewKid())))}</h2>` : ''}
  ${mine.length ? '' : `<div class="empty">${__h('Log a few entries and your stats will show up here.')}</div>`}
  ${lowWet ? `<div class="card alert">⚠️ ${__h('Fewer than 6 wet diapers/day on average. After the first week this can signal low intake – worth mentioning to your pediatrician.')}</div>` : ''}
  ${card('🍼', N_('Feeding'), [[N_('Feeds per day'), per('feeds')], [N_('Avg time between feeds'), gaps.length ? fmtDur(avg(gaps)) : '–'], [N_('Bottle ml per day'), per('ml') || '–'], ...(sum('solids') ? [[N_('Solid meals per day'), per('solids')]] : [])],
    chart(days, [{ name: __('feeds'), color: 'var(--g-feed)', values: S.map(s => s.feeds) }]) + (sum('ml') ? `<p class="ch">${__h('Bottle ml per day')}</p>${chart(days, [{ name: __('ml'), color: 'var(--g-feed)', values: S.map(s => s.ml) }])}` : ''))}
  ${card('💧', N_('Diapers'), [[N_('Pee per day'), per('pee')], [N_('Poo per day'), per('poo')], ...(Object.keys(poo).length ? [[N_('Poo colours'), Object.entries(poo).map(([k, v]) => `${__(k)} ×${v}`).join(', ')]] : [])],
    chart(days, [{ name: __('pee'), color: 'var(--g-diaper)', values: S.map(s => s.pee) }, { name: __('poo'), color: 'var(--g-poo)', values: S.map(s => s.poo) }], { mode: 'group' }))}
  ${card('😴', N_('Sleep'), [[N_('Sleep per day'), fmtDur(avg(used.map(s => s.sleep)))], [N_('Longest stretch (avg)'), fmtDur(avg(used.map(s => s.longest)))], [N_('Naps/sleeps per day'), per('naps')], [N_('Night wakings per day'), per('wakes')]],
    chart(days, [{ name: __('hours asleep'), color: 'var(--g-sleep)', values: S.map(s => r1(s.sleep / 60)) }], { fmt: v => __('{h}h', { h: v }) }) + `<p class="ch">${__h('Night wakings per day')}</p>${chart(days, [{ name: __('night wakings'), color: 'var(--g-sleep)', values: S.map(s => s.wakes) }])}`)}
  ${card('🤮', N_('Vomit'), [[N_('Total'), sum('vomit')], [N_('Per day'), per('vomit')]], chart(days, [{ name: __('vomits'), color: 'var(--g-vomit)', values: S.map(s => s.vomit) }]))}
  ${card('🧸', N_('Play'), [[N_('Play per day'), fmtDur(per('play'))]], chart(days, [{ name: __('minutes of play'), color: 'var(--g-play)', values: S.map(s => s.play) }], { fmt: v => __('{m}m', { m: v }) }))}
  ${Sync.can('health') ? card('🩺', N_('Health & meds'), Object.keys(sym).length ? Object.entries(sym).map(([k, v]) => [k, v + '×']) : [[N_('Health notes'), __('none')]],
    chart(days, [{ name: __('health notes'), color: 'var(--g-health)', values: S.map(s => s.health) }, { name: __('medicines'), color: 'var(--g-meds)', values: S.map(s => s.meds) }]), flagged.length ? 'alert' : '') : ''}
  <p class="note">${__h('Stats are for your own tracking and are not medical advice. If something worries you, call your pediatrician. Call emergency services for blue lips/face, trouble breathing, or a baby who is hard to wake.')}</p>`;
}
function ageDays() { const k = kidById(viewKid()); return k && k.birth ? Math.floor((Date.now() - new Date(k.birth + 'T00:00').getTime()) / DAY) : 99; }

// ---------- Routine ----------
// The times of day that keep coming back, laid out like a day in a calendar. routine.js works them out from the last week every time
// the page is drawn, so the routine follows the baby as it changes; today's entries tick off what has been done.
function routineView(now = Date.now()) {
  const k = viewKid(), mine = db.events.filter(e => !Travel.isTravel(e.type) && childOf(e) === k);
  const R = Routine.find(mine, now), T = Routine.today(R.slots, mine, now);
  const clock = m => { const d = new Date(now); d.setHours(0, m, 0, 0); return fmtTime(d.getTime()); };
  const night = s => s.at >= 19 * 60 || s.at < 5 * 60;
  const name = s => (s.key === 'solids' ? __('Solids') : s.type === 'feed' ? __(TYPES.feed.label) : s.type === 'sleep' ? (night(s) ? __('Night sleep') : __('Nap')) : s.type === 'play' ? __(s.activity) : s.name);
  const what = s => {
    if (s.key === 'solids') return (s.foods || []).map(f => __(f)).join(', ');
    if (s.type === 'feed') return s.kind === 'bottle' ? (s.ml ? __('Bottle {ml} ml', { ml: s.ml }) : __('Bottle')) : [__('Breast'), s.minutes && __('{n} min', { n: s.minutes })].filter(Boolean).join(' · ');
    if (s.type === 'sleep') return s.minutes ? __('until about {time} ({long})', { time: clock(s.at + s.minutes), long: fmtDur(s.minutes) }) : '';
    if (s.type === 'play') return s.minutes ? __('{n} min', { n: s.minutes }) : '';
    return s.dose || '';
  };
  const head = kids().length > 1 ? `<h2>${esc(kidName(kidById(k)))}</h2>` : '';
  const how = `<p class="note rhow">${__h('Worked out from the last {days} days: feeds, sleep, play and medicines that happen within {minutes} minutes of the same time on more than half of the days logged. It updates by itself as the routine changes. Diapers are left out.', { days: Routine.DAYS, minutes: Routine.WINDOW })}</p>`;
  if (!R.enough) return `${head}<div class="empty">⏰ ${__h('Your routine will show up here after a few days of logging.')}<br><small>${__hn('{n} day logged in the last week so far.', '{n} days logged in the last week so far.', R.logged)}</small></div>${how}`;
  if (!R.slots.length) return `${head}<div class="empty">⏰ ${__h('No regular times yet.')}<br><small>${__h('Anything that happens at about the same time on most days will show up here.')}</small></div>${how}`;
  const nx = T.next, ni = nx && TYPES[nx.slot.type];
  const next = nx ? `<div class="card rnext" style="--c:var(--${nx.slot.type})"><span class="rni">${nx.slot.key === 'solids' ? '🥄' : ni.icon}</span><span><small>${__h('Next in the routine')}</small><b>${esc(name(nx.slot))}</b><small>${esc(nx.tomorrow && startOfDay(nx.at) > startOfDay(now) ? __('tomorrow at about {time}', { time: fmtTime(nx.at) })
    : nx.state === 'now' ? __('about now ({time})', { time: fmtTime(nx.at) }) : __('at about {time}, in {wait}', { time: fmtTime(nx.at), wait: fmtDur((nx.at - now) / MIN) }))}</small></span></div>` : '';
  // from morning to night: the morning, afternoon and evening, then the night after them (the parts of the day as the clock names them)
  const parts = [[0, 0], [6, 1], [12, 2], [18, 3]];
  let rows = '', part = -1, nowShown = false;
  for (const o of T.list) {
    const s = o.slot, p = parts.filter(([h]) => s.at >= h * 60).pop()[1];
    if (!nowShown && o.at > now) { rows += `<div class="rnow" aria-hidden="true"><span>${esc(fmtTime(now))}</span></div>`; nowShown = true; }
    if (p !== part) { rows += `<h2 class="rpart">${__h(QUAD_NAMES.day[p])}</h2>`; part = p; }
    const range = s.to - s.from >= 5 ? __('usually {from} – {to}', { from: clock(s.from), to: clock(s.to) }) : '';
    const often = __n('{days} of {n} day', '{days} of {n} days', s.of, { days: s.days }), w = what(s);
    const state = o.state === 'done' ? `<span class="rs ok" title="${__h('Done today at {time}', { time: fmtTime(o.entry.ts) })}">✓ ${esc(fmtTime(o.entry.ts))}</span>`
      : o.state === 'now' ? `<span class="rs now">${__h('Due now')}</span>` : nx && !nx.tomorrow && nx.slot === s ? `<span class="rs next">${__h('Up next')}</span>`
        : o.state === 'past' ? `<span class="rs past" title="${__h('Not logged today')}">–</span>` : '';
    rows += `<div class="card rslot ${o.state}" style="--c:var(--${s.type})" data-slot="${esc(s.key)}">
      <div class="rt">${esc(clock(s.at))}</div><div class="rb"><b>${s.key === 'solids' ? '🥄' : TYPES[s.type].icon} ${esc(name(s))}</b>${w ? `<small>${esc(w)}</small>` : ''}<small>${esc([range, often].filter(Boolean).join(' · '))}</small></div>${state}</div>`;
  }
  if (!nowShown) rows += `<div class="rnow" aria-hidden="true"><span>${esc(fmtTime(now))}</span></div>`;
  return `${head}${next}<div class="routine">${rows}</div>${how}`;
}

// ---------- Report for the doctor ----------
// A PDF of one child's log to take to a checkup or send to the doctor: who the child is, the averages, a table of the days, the
// health notes and medicines, and every entry. pdf.js lays it out in the app's language, on US Letter paper in North America and A4
// elsewhere. Only what this phone can see goes in (health notes only for people allowed to see them, as everywhere else).
let reportDays = 14;
/** One child's entries over the last `days` days (from the first entry, if that is later), and the numbers for each day. */
function reportData(kidId, days, now = Date.now()) {
  const to = addDays(startOfDay(now), 1), all = db.events.filter(e => !Travel.isTravel(e.type) && childOf(e) === kidId);
  const from = Math.max(addDays(to, -days), all.length ? startOfDay(Math.min(...all.map(e => e.ts))) : startOfDay(now));
  const evs = all.filter(e => e.ts >= from && e.ts < to).sort((a, b) => a.ts - b.ts), sleeps = all.filter(e => e.type === 'sleep'), byDay = new Map();
  for (const e of evs) { const d = startOfDay(e.ts); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(e); }
  const list = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    const es = byDay.get(d) || [], of = t => es.filter(e => e.type === t), next = addDays(d, 1);
    const asleep = sleeps.reduce((a, e) => a + Math.max(0, Math.min(e.end || now, next) - Math.max(e.ts, d)), 0) / MIN;
    const milk = of('feed').filter(e => e.data.kind !== 'solids');
    list.push({ d, es, feeds: milk.length, solids: of('feed').length - milk.length, ml: milk.reduce((a, e) => a + (+e.data.ml || 0), 0), pee: of('diaper').filter(e => e.data.pee).length,
      poo: of('diaper').filter(e => e.data.poo).length, sleep: asleep, longest: Math.max(0, ...of('sleep').map(e => ((e.end || now) - e.ts) / MIN)),
      wakes: of('wake').length, vomit: of('vomit').length, health: of('health'), meds: of('med') });
  }
  return { from, to, evs, days: list };
}
/** The report as blocks for pdf.js. */
function reportBlocks(kidId, { days, every, notes }, now = Date.now()) {
  const k = kidById(kidId), name = kidName(k), R = reportData(kidId, days, now), used = R.days.filter(x => x.es.length), n = used.length || 1;
  const avg = key => r1(used.reduce((a, x) => a + x[key], 0) / n), count = xs => Object.entries(xs.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).map(([x, c]) => `${x} ×${c}`).join(', ');
  const when = e => `${fmtShort(e.ts)} ${e.data && e.data.approx ? __('about {time}', { time: fmtTime(e.ts) }) : fmtTime(e.ts)}`;
  const born = k.birth ? new Date(k.birth + 'T00:00').getTime() : null, m = born ? Guide.monthsOld(k.birth, now) : -1;
  const age = born == null || m < 0 ? '' : m < 1 ? __n('{n} week', '{n} weeks', Math.max(0, Math.floor((now - born) / DAY / 7))) : __n('{n} month', '{n} months', m);
  const doc = Guide.cleanDoctor(db.baby.doctor), formula = usualFormula(k);
  const health = R.evs.filter(e => e.type === 'health'), meds = R.evs.filter(e => e.type === 'med'), temps = health.filter(e => +e.data.temp > 0);
  const hot = temps.length ? temps.reduce((a, e) => (+e.data.temp > +a.data.temp ? e : a)) : null, vomits = R.evs.filter(e => e.type === 'vomit');
  const blocks = [
    { h: 1, text: name },
    { p: [born && __('Born {date}', { date: new Date(born).toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }) }), age && __('{age} old', { age }), k.sex === 'boy' ? __('Boy') : k.sex === 'girl' ? __('Girl') : ''].filter(Boolean).join(' · '), muted: true },
    { p: `${__('{from} to {to}', { from: fmtShort(R.from), to: fmtShort(R.to - 1) })} · ${__n('{n} day', '{n} days', R.days.length)}`, muted: true },
  ];
  const about = [(k.allergies || []).length ? [__('Allergies'), k.allergies.map(a => (a.date ? `${__(a.food)} (${__('first reaction {date}', { date: fmtDay(a.date) })})` : __(a.food))).join('; ')] : null,
    doc.name || doc.practice ? [__('Pediatrician'), [doc.name, doc.practice, doc.phone].filter(Boolean).join(' · ')] : null, formula ? [__('Usual formula'), formula] : null].filter(Boolean);
  const tried = new Map();
  for (const e of db.events.filter(x => x.type === 'feed' && x.data && x.data.kind === 'solids' && childOf(x) === kidId && x.ts < now).sort((a, b) => a.ts - b.ts)) for (const f of e.data.foods || []) if (!tried.has(f.toLowerCase())) tried.set(f.toLowerCase(), [f, e.ts]);
  if (about.length) blocks.push({ kv: about });
  if (notes) blocks.push({ h: 2, text: __('Questions and notes for the doctor') }, { p: notes });
  blocks.push({ h: 2, text: __('At a glance') });
  if (!R.evs.length) blocks.push({ p: __('Nothing was logged in this period.'), muted: true });
  else {
    blocks.push({ p: __n('Averages over the {n} day with entries.', 'Averages over the {n} days with entries.', used.length), muted: true, size: 8.5 }, { kv: [
      [__('Feeds per day'), String(avg('feeds'))], ...(avg('ml') ? [[__('Bottle ml per day'), __('{n} ml', { n: Math.round(avg('ml')) })]] : []), ...(avg('solids') ? [[__('Solid meals per day'), String(avg('solids'))]] : []),
      [__('Pee per day'), String(avg('pee'))], [__('Poo per day'), String(avg('poo'))],
      ...(R.evs.some(e => e.type === 'diaper' && e.data.poo && e.data.color) ? [[__('Poo colours'), count(R.evs.filter(e => e.type === 'diaper' && e.data.poo && e.data.color).map(e => __(e.data.color)))]] : []),
      [__('Sleep per day'), fmtDur(avg('sleep'))], [__('Longest stretch (avg)'), fmtDur(avg('longest'))], [__('Night wakings per day'), String(avg('wakes'))],
      [__('Vomit'), vomits.length ? __n('{n} time', '{n} times', vomits.length) + (vomits.some(e => e.data.projectile) ? ` (${__('projectile')}: ${vomits.filter(e => e.data.projectile).length})` : '') : __('none')],
      ...(hot ? [[__('Highest temperature'), `${hot.data.temp}° · ${when(hot)}`]] : []),
      ...(health.some(e => (e.data.symptoms || []).length) ? [[__('Symptoms noted'), count(health.flatMap(e => e.data.symptoms || []).map(x => __(x)))]] : []),
      ...(meds.length ? [[__('Medicines given'), count(meds.map(e => [e.data.name || __('Medication'), e.data.dose].filter(Boolean).join(' ')))]] : []),
      ...(tried.size ? [[__('Foods tried (first time)'), [...tried.values()].map(([f, t]) => `${__(f)} (${fmtShort(t)})`).join(', ')]] : []),
    ] });
  }
  blocks.push({ h: 2, text: __('Day by day') }, { table: {
    cols: [{ w: 2.3 }, { w: 1, align: 'center' }, { w: 1.1, align: 'center' }, { w: 1, align: 'center' }, { w: 1, align: 'center' }, { w: 1.3, align: 'center' }, { w: 1.2, align: 'center' }, { w: 1, align: 'center' }, { w: 2.8 }],
    head: [__('Date'), __('Feeds'), __('ml'), __('Pee'), __('Poo'), __('Sleep'), __('Night wakings'), __('Vomit'), __('Health & meds')],
    rows: R.days.map(x => (x.es.length ? [fmtShort(x.d), x.feeds, x.ml || '–', x.pee, x.poo, x.sleep ? fmtDur(x.sleep) : '–', x.wakes, x.vomit,
      [...x.health.map(e => (e.data.symptoms || []).map(s => __(s)).join(', ') || __('Note')), ...x.meds.map(e => e.data.name || __('Medication'))].join('; ')]
      : [fmtShort(x.d), '–', '–', '–', '–', x.sleep ? fmtDur(x.sleep) : '–', '–', '–', __('Nothing logged')]).map(String)),
  } });
  blocks.push({ h: 2, text: __('Health notes and medicines') });
  if (health.length + meds.length) {
    blocks.push({ table: { cols: [{ w: 2.4 }, { w: 2.6 }, { w: 4 }], head: [__('Time'), __('Entry'), __('Details')], rows: R.evs.filter(e => e.type === 'health' || e.type === 'med').map(e => {
      const [a, b] = describe(e);
      return [when(e), a, [b, e.note].filter(Boolean).join(' · ')];
    }) } });
  } else blocks.push({ p: __('No health notes or medicines in this period.'), muted: true });
  if (every && R.evs.length) {
    blocks.push({ h: 2, text: __('Every entry') });
    for (const x of R.days) if (x.es.length) {
      blocks.push({ table: { caption: fmtDate(x.d), cols: [{ w: 1.3 }, { w: 2.2 }, { w: 2.6 }, { w: 2.4 }], rows: x.es.map(e => {
        const [a, b] = describe(e), t = TYPES[e.type];
        return [e.data && e.data.approx ? '~' + fmtTime(e.ts) : fmtTime(e.ts), `${__(t.label)}: ${a}`, b, e.note || ''];
      }) } });
    }
  }
  blocks.push({ gap: 6 }, { p: __('Made with Little Log on {date}. Entries are as the family logged them; this is not a medical record.', { date: fmtDate(now) }), muted: true, size: 8 });
  return { blocks, name, R };
}
/** The PDF of the report: { bytes, pages, text, file (a name to save it as) }. */
async function doctorPdf(kidId, opts) {
  const { blocks, name, R } = reportBlocks(kidId, opts), range = `${fmtShort(R.from)} – ${fmtShort(R.to - 1)}`;
  const slug = name.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'baby';
  const doc = await Pdf.make(blocks, { size: myRegion() === 'na' ? 'letter' : 'a4', rtl: I18n.rtl(), lang: I18n.lang() === I18n.PSEUDO ? 'en' : I18n.lang(),
    title: __('{name}: report for the doctor', { name }), header: `${name} · ${range}`, footer: (n, total) => `Little Log · ${name} · ${__('Page {n} of {total}', { n, total })}` });
  return { ...doc, file: `little-log-${slug}-${dkey(R.from)}-${dkey(R.to - 1)}.pdf` };
}
function openDoctorReport() {
  const ks = kids(), k0 = viewKid();
  const close = popup(`<h3>📄 ${__h('Report for the doctor')}</h3>
    <p class="note">${__h('A PDF of what was logged for one child: the averages, a table of each day, health notes and medicines, and every entry. Share it, print it, or show it at a checkup.')}</p>
    ${ks.length > 1 ? `<label class="f">${__h('Child')}</label><div class="chips">${ks.map(k => chip('rpKid', k.id, esc(kidName(k)), k.id === k0, '', true)).join('')}</div>` : ''}
    <label class="f">${__h('How far back')}</label><div class="chips">${[7, 14, 30, 90].map(n => chip('rpDays', n, __hn('{n} day', '{n} days', n), n === reportDays, '', true)).join('')}</div>
    <div class="chips" style="margin-top:10px">${chip('rpAll', 1, __h('Include every entry'), true)}</div>
    <label class="f" for="rpNotes">${__h('Questions or notes for the doctor (optional)')}</label><textarea id="rpNotes" rows="3" maxlength="1000"></textarea>
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="rpMake">${__h('Make the PDF')}</button></div>`);
  $('#rpMake').onclick = async () => {
    const pick = n => (document.querySelector(`#sheet [name=${n}]:checked`) || {}).value, b = $('#rpMake');
    reportDays = +pick('rpDays') || 14; b.disabled = true; b.textContent = __('Making the PDF…');
    try {
      const r = await doctorPdf(pick('rpKid') || k0, { days: reportDays, every: !!pick('rpAll'), notes: $('#rpNotes').value.trim() });
      close(); download(r.file, r.bytes, 'application/pdf');
    } catch (e) { b.disabled = false; b.textContent = __('Make the PDF'); toast(__('Could not make the PDF. Please try again.')); }
  };
}

// ---------- Solid foods and allergies ----------
// From around 6 months babies start solid foods: Feed → Solids lists the common first foods in twirl-downs, with the key allergens
// (best offered early and often) marked. A food a child reacts to can be marked as an allergy with the date of the first reaction;
// allergies are part of the child's profile (More → Children), so everyone sharing the log sees them, and that first date is marked
// on the calendar. The month a child turns 6 months old, a sheet says it is time to start (solidsCheck).
const allergiesOf = id => (kidById(id) || {}).allergies || [];
const allergicTo = (id, food) => allergiesOf(id).find(a => Foods.same(a.food, food));
/** A date of the log (YYYY-MM-DD) in words: 3 March 2027. */
const fmtDay = key => new Date(key + 'T00:00').toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' });
/** Save the children's profile (and send it when the log is shared). */
function saveProfile(msg) { db.baby.name = kids()[0].name; db.baby.birth = kids()[0].birth; Sync.linked() ? Sync.pushBaby() : save(); render(); if (msg) toast(msg); }
/** The foods of a solid meal: a twirl-down of the common first foods by group (the key allergens first, marked as such), any food the
    child is allergic to flagged, and room for any other food. */
function foodsPicker(picked, kidIds) {
  const allergic = f => kidIds.some(id => allergicTo(id, f));
  const one = f => chip('food', f, `${__h(f)}${Foods.allergen(f) ? ` <small class="kal">${__h('key allergen')}</small>` : ''}${allergic(f) ? ` <small class="kbad">⚠️ ${__h('allergy')}</small>` : ''}`, picked.includes(f), allergic(f) ? 'warn' : '');
  return `<details class="foods" open><summary><span>${__h('Foods')} <small class="fsum">${esc(picked.map(f => __(f)).join(', '))}</small></span><span class="chev" aria-hidden="true">›</span></summary>
    ${Foods.GROUPS.map(g => `<details class="fgrp" data-fg="${g.id}"${g.id === 'allergens' || g.items.some(([f]) => picked.includes(f)) ? ' open' : ''}><summary>${__h(g.name)}<span class="chev" aria-hidden="true">›</span></summary>
      ${g.id === 'allergens' ? `<p class="note">${__h('Offering these from around 6 months, one new one at a time and then often, lowers the chance of a food allergy. If your baby has severe eczema or already has a food allergy, ask your pediatrician first.')}</p>` : ''}
      <div class="chips">${g.items.map(([f]) => one(f)).join('')}</div></details>`).join('')}
    <div class="chips" id="foodTyped">${picked.filter(f => !Foods.known(f)).map(one).join('')}</div>
    <div class="row addfood"><input id="foodOther" type="text" maxlength="60" placeholder="${__h('Another food')}" aria-label="${__h('Another food')}"><button type="button" class="btn" id="foodAdd">${__h('Add')}</button></div></details>`;
}
/** Mark one or more foods as an allergy of a child, with the date of the first reaction and what happened. */
function openAllergy(kidId, pre = {}) {
  if (!Sync.can('profile')) return toast(__('Only parents can change these.'));
  const name = kidName(kidById(kidId)), common = Foods.GROUPS[0].items.map(([f]) => f), picked = pre.foods || [];
  const close = popup(`<h3>⚠️ ${__h('Mark an allergy')}</h3><p class="note">${__h('For {name}. Everyone sharing the log will see it, so whoever feeds {name} knows.', { name })}</p>
    <label class="f">${__h('Which food?')}</label><div class="chips" id="alFoods">${[...common, ...picked.filter(f => !common.includes(f))].map(f => chip('alFood', f, __h(f), picked.includes(f), 'warn')).join('')}</div>
    <div class="row addfood"><input id="alOther" type="text" maxlength="60" placeholder="${__h('Another food')}" aria-label="${__h('Another food')}"><button type="button" class="btn" id="alAdd">${__h('Add')}</button></div>
    <label class="f" for="alDate">${__h('Date of the first reaction')}</label><input id="alDate" type="date" value="${esc(pre.date || dkey(Date.now()))}" max="${dkey(Date.now())}">
    <label class="f" for="alNote">${__h('What happened (optional)')}</label><textarea id="alNote" rows="2" maxlength="120" placeholder="${__h('e.g. hives around the mouth')}"></textarea>
    <p class="call">${__h('Call {sos} for trouble breathing, swelling of the lips, tongue or face, or if your baby goes floppy or pale.', { sos: __(Guide.sos(myRegion())) })}</p>
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="alSave">${__h('Save')}</button></div>`);
  $('#alAdd').onclick = () => { const v = $('#alOther').value.trim().slice(0, 60); if (!v) return; $('#alOther').value = ''; $('#alFoods').insertAdjacentHTML('beforeend', chip('alFood', v, esc(v), true, 'warn')); };
  $('#alSave').onclick = () => {
    const k = kidById(kidId);   // (looked up again: a sync may have brought a newer profile while the sheet was open)
    if (!k) return close();
    const foods = [...document.querySelectorAll('#sheet [name=alFood]:checked')].map(c => c.value), date = $('#alDate').value, note = $('#alNote').value.trim();
    if (!foods.length) return toast(__('Choose the food'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > dkey(Date.now())) return toast(__('Please pick a date'));
    const before = k.allergies || [], fresh = foods.filter(f => !before.some(a => Foods.same(a.food, f)));
    k.allergies = Kids.allergies([...before, ...foods.map(food => ({ food, date, note }))]);
    // the profile (every child and the pediatrician) is stored encrypted with a size limit: say so rather than fail to save
    if (before.length + fresh.length > 12 || new TextEncoder().encode(JSON.stringify({ kids: Kids.clean(kids()), doctor: Guide.cleanDoctor(db.baby.doctor) })).length > 5600) {
      k.allergies = before; return toast(__('There is no room for more allergies for {name}: remove one, or shorten the notes.', { name }));
    }
    close(); saveProfile(__('Allergy saved for {name}', { name }));
  };
}
/** What starting solids is about: in the sheet at 6 months, and in the Guide. */
function solidsGuideHtml(sos) {
  const list = xs => `<ul>${xs.map(x => `<li>${__h(x)}</li>`).join('')}</ul>`;
  return `<p class="mh">${__h('Signs your baby is ready')}</p>${list([N_('Sits up with a little support and holds their head steady'), N_('Looks at food, picks it up and brings it to the mouth'), N_('Swallows food instead of pushing it back out with the tongue')])}
    <p class="mh">${__h('How to start')}</p>${list([N_('Once a day at first: a few spoonfuls of smooth food, or soft pieces they can hold'), N_('Iron-rich foods early on: iron-fortified baby cereal, meat, lentils and beans'), N_('One new food at a time, a couple of days apart, so you can tell what suits them'), N_('Breast milk or formula is still their main food until about 1 year')])}
    <p class="mh">${__h('Key allergens: early and often')}</p><p>${__h("Peanut, egg, cow's milk, wheat, soy, tree nuts, sesame, fish and shellfish. Offering them from around 6 months, one at a time, and then regularly lowers the chance of a food allergy. If your baby has severe eczema or already has a food allergy, ask your pediatrician first.")}</p>
    <p class="mh">${__h('Not yet')}</p>${list([N_('Honey, until 1 year'), N_('Whole nuts, whole grapes and other foods they could choke on (cut round foods into quarters)'), N_("Cow's milk as a drink, until 1 year (in cooking and in yogurt it is fine)"), N_('Salt and added sugar')])}
    <p class="call">${__h('Signs of a reaction: hives, swelling or vomiting soon after eating. Call {sos} for trouble breathing, swelling of the lips, tongue or face, or if your baby goes floppy or pale.', { sos })}</p>
    <p class="note">${__h('If your baby was born early, ask your pediatrician when to start.')}</p>`;
}
/** The month a child turns 6 months old, once on each phone (and not if solid food is already in their log): time for solid foods. */
function solidsCheck() {
  if (!$('#sheet').hidden || Acct.gate() || Tour.active() || !Tour.seen('day')) return false;
  const seen = db.meta.solids || (db.meta.solids = {});
  const k = kids().find(x => x.birth && Guide.monthsOld(x.birth) === 6 && !seen[x.id] && !db.events.some(e => e.type === 'feed' && e.data && e.data.kind === 'solids' && childOf(e) === x.id));
  if (!k) return false;
  seen[k.id] = 1; Store.save(db);
  const close = popup(`<h3>🥄 ${__h('Time for solid foods')}</h3><p><b>${__h('{name} is 6 months old: most babies start solid foods around now, alongside breast milk or formula.', { name: kidName(k) })}</b></p>
    ${solidsGuideHtml(__(Guide.sos(myRegion())))}
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Not now')}</button>${Sync.can('add') ? `<button class="btn p" id="solidsGo">${__h('Log a first food')}</button>` : ''}</div>`);
  if ($('#solidsGo')) $('#solidsGo').onclick = () => { close(); tab = 'day'; setKid(k.id); viewDay = startOfDay(Date.now()); render(); openSheet('feed', null, { kind: 'solids' }); };
  return true;
}
/** The first date of each allergy, by day (YYYY-MM-DD): [{ kid, allergy }] for the children `ids`. */
function allergyDays(ids) {
  const m = new Map();
  for (const id of ids) for (const a of allergiesOf(id)) if (a.date) { if (!m.has(a.date)) m.set(a.date, []); m.get(a.date).push({ kid: kidById(id), allergy: a }); }
  return m;
}

// ---------- Guide ----------
function doctorHtml() {
  const d = (db.baby.doctor || {}), set = d.name || d.phone || d.practice;
  return `<button class="docbtn" id="docBtn"><span class="di">🩺</span><span><b>${__h('Pediatrician')}</b><small>${set ? esc([d.name, d.practice].filter(Boolean).join(' · ')) + (d.phone ? ' · ' + esc(d.phone) : '') : __h('Add their name and number')}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}
function guideView() {
  const ks = [kidById(viewKid())].filter(k => k && k.birth), now = Date.now();
  const cur = ks.map(k => [k, Guide.monthsOld(k.birth, now)]).filter(([, m]) => m >= 0);
  const ms = Object.entries(Guide.MILESTONES), sos = __(Guide.sos(myRegion()));
  return `${doctorHtml()}
  <p class="note emer"><b>${__h('Emergency?')}</b> ${__h('Call {sos} for blue lips or face, trouble breathing, a baby who is hard to wake, or a seizure.', { sos })}</p>
  ${cur.length ? `<h2>${__h('Right now')}</h2>${cur.map(([k, m]) => { const key = ms.map(([n]) => +n).filter(n => n <= Math.max(1, m)).pop() || 1, M = Guide.MILESTONES[key];
    const age = m < 1 ? __n('{n} week', '{n} weeks', Math.max(0, Math.floor((now - new Date(k.birth + 'T00:00').getTime()) / DAY / 7))) : __n('{n} month', '{n} months', m);
    return `<div class="card nowcard" style="--k:${k.color}">${kids().length > 1 ? avatar(k) + ' ' : ''}<b>${__h('{name} is {age} old', { name: kidName(k), age })}</b>
      <p class="note">${m < 1 ? __h('The first month is mostly feeding, sleeping and getting to know each other. Here is what is common around one month:') : __h('Around {age}:', { age: __(M.title) })}</p><ul>${M.does.map(x => `<li>${__h(x)}</li>`).join('')}</ul></div>`; }).join('')}` : ''}
  <h2>${__h('Food')}</h2>
  <details class="gd" data-grp="gsolids" ${openGroups.has('gsolids') ? 'open' : ''}><summary><span class="gi">🥄</span><span class="gt"><b>${__h('Starting solid foods')}</b><small>${__h('From around 6 months, with the key allergens early')}</small></span><span class="chev" aria-hidden="true">›</span></summary>
    ${solidsGuideHtml(sos)}</details>
  <h2>${__h('Common with newborns')}</h2>
  ${Guide.COMMON.map(c => `<details class="gd" data-grp="g${c.id}" ${openGroups.has('g' + c.id) ? 'open' : ''}><summary><span class="gi">${c.icon}</span><span class="gt"><b>${__h(c.title)}</b></span><span class="chev" aria-hidden="true">›</span></summary>
    <p>${__h(c.body)}</p>${c.call ? `<p class="call">${__h(c.call, { sos })}</p>` : ''}${picsHtml(c.id)}</details>`).join('')}
  <h2>${__h('Medicines')}</h2>
  ${medsHtml()}
  <h2>${__h('Month by month')}</h2>
  ${ms.map(([n, M]) => milestoneDetails(+n, M)).join('')}
  <p class="note">${__h("General information from AAP, CDC, FDA and NHS parent guidance, not medical advice. Every baby develops at their own pace; if your baby was born early, count from the due date. If you're ever worried, call your pediatrician, you don't need to wait for a checkup.")}</p>
  ${I18n.lang() === 'en' ? '' : `<p class="note">${__h('This translation was made with the help of AI and may have mistakes. In an emergency, call {sos}. If something reads wrong, tell us: More → Language → Report a language issue.', { sos })}</p>`}
  ${picCreditsHtml()}`;
}
/** A common worry's pictures, in a twirl-down of their own inside its card. It stays shut until someone chooses to look, and shuts again
    when the card closes or the Guide is left, so nobody comes across them by surprise. */
function picsHtml(id) {
  const list = Guide.PICS[id]; if (!list) return '';
  const photos = list.filter(p => !p.drawing).length, drawings = list.length - photos;
  const what = andList([photos && __n('{n} photo', '{n} photos', photos), drawings && __n('{n} drawing', '{n} drawings', drawings)].filter(Boolean));
  return `<details class="pix" data-grp="pix${id}" ${openGroups.has('pix' + id) ? 'open' : ''}><summary><span class="gi">📷</span><span class="gt"><b>${__h('Pictures')}</b><small>${esc(what)}<span class="pshut"> · ${__h('tap to show')}</span></small></span><span class="chev" aria-hidden="true">›</span></summary>
    ${list.map(p => `<figure><img src="${esc(Guide.picSrc(p.file))}" width="${p.w}" height="${p.h}" alt="${__h(p.alt)}" loading="lazy" decoding="async"${p.max ? ` style="max-width:${p.max}px"` : ''}><figcaption>${__h(p.text)}<small>${__h(p.drawing ? 'Drawing: {by}, {licence}' : 'Photo: {by}, {licence}', { by: p.by, licence: __(p.lic) })}</small></figcaption></figure>`).join('')}</details>`;
}
/** Who made each picture, under which licence, where it comes from and what we changed. */
function picCreditsHtml() {
  return `<details class="gd" data-grp="credits" ${openGroups.has('credits') ? 'open' : ''}><summary><span class="gi">📷</span><span class="gt"><b>${__h('Picture credits')}</b><small>${__h('From Wikimedia Commons, under free licences')}</small></span><span class="chev" aria-hidden="true">›</span></summary>
    <ul class="credits">${Guide.credits().map(c => `<li><b>${__h(c.name)}</b>: ${__h(c.drawing ? 'drawing by {by}, {licence}' : 'photo by {by}, {licence}', { by: c.by, licence: __(c.lic) })}${c.licUrl ? ` <span class="url">(${esc(c.licUrl)})</span>` : ''}. ${__h('From')} <span class="url">${esc(c.page)}</span>${c.edit ? `, ${__h(c.edit)}` : ''}.</li>`).join('')}</ul>
    <p class="note">${__h('Our versions of the CC BY-SA pictures are shared under the same licence.')}</p></details>`;
}
/** A medicine's brand names, those sold where you are first. */
const medBrands = (i, here) => { const at = b => (!i.where || !i.where[b] || i.where[b].split(' ').includes(here) ? 0 : 1), list = __(i.brands).split(' · '); return list.map((b, n) => [at(b), n, b]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]).join(' · '); };
/** From what age: one rule, or the US and UK ones (yours first, the other smaller; both elsewhere, where labels differ by country). */
function medAge(age, here) {
  if (typeof age === 'string') return __h(age);
  const cap = t => t.charAt(0).toLocaleUpperCase(I18n.locale()) + t.slice(1), us = __(age.us), uk = __(age.uk);
  if (here === 'na') return `${esc(cap(us))}. <small>(${__h('UK: {age}', { age: uk })})</small>`;
  if (here === 'uk') return `${esc(cap(uk))}. <small>(${__h('US: {age}', { age: us })})</small>`;
  return `${__h('US: {us}. UK: {uk}.', { us, uk })} <small>${__h('Ages on labels differ by country: check the one where you live.')}</small>`;
}
/** Over-the-counter medicines: one drop-down holding a drop-down per kind (fever and pain, colic, …) and the things never to give. */
function medsHtml() {
  const here = myRegion();
  const tw = (id, icon, title, sub, body, cls = '') => `<details class="gd ${cls}" data-grp="${id}" ${openGroups.has(id) ? 'open' : ''}><summary><span class="gi">${icon}</span><span class="gt"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="chev" aria-hidden="true">›</span></summary>${body}</details>`;
  const item = i => `<div class="medi"><b>${__h(i.name)}</b>${i.brands ? `<small>${esc(medBrands(i, here))}</small>` : ''}<p class="age">${medAge(i.age, here)}</p><p>${__h(i.body)}</p></div>`;
  const kinds = Guide.MEDS.map(c => tw('o' + c.id, c.icon, __(c.title), c.items.map(i => __(i.name)).join(' · '),
    `${c.note ? `<p class="note">${__h(c.note)}</p>` : ''}${c.items.map(item).join('')}${c.warn ? `<p class="call">${__h(c.warn)}</p>` : ''}`, 'med'));
  const never = tw('onever', '⚠️', __('Never give a baby'), '', `<ul>${Guide.NEVER.map(x => `<li>${__h(x)}</li>`).join('')}</ul>`, 'med never');
  return tw('omenu', '💊', __('Over-the-counter medicines'), __('What is safe from what age, remedies parents mention, and what never to give'),
    `<div class="medbody"><p class="call">${__h(Guide.MEDS_INTRO[0])}</p><p class="note">${__h(Guide.MEDS_INTRO[1])}</p>${kinds.join('')}${never}</div>`, 'medmenu');
}
const milestoneBody = M => `${M.does.length ? `<p class="mh">${__h('What many babies do')}</p><ul>${M.does.map(x => `<li>${__h(x)}</li>`).join('')}</ul>` : ''}
  ${M.notice.length ? `<p class="mh">${__h('What parents often notice')}</p><ul>${M.notice.map(x => `<li>${__h(x)}</li>`).join('')}</ul>` : ''}
  ${M.visit ? `<p class="mh">${__h('Checkup')}</p><p>${__h(M.visit)}</p>` : ''}${M.ask ? `<p class="call">${__h(M.ask)}</p>` : ''}`;
const milestoneDetails = (n, M) => `<details class="gd" data-grp="m${n}" ${openGroups.has('m' + n) ? 'open' : ''}><summary><span class="gi">🌟</span><span class="gt"><b>${__h(M.title)}</b></span><span class="chev" aria-hidden="true">›</span></summary>${milestoneBody(M)}</details>`;
/** Choose the painting around a page's clock (kept on this phone). */
function openArtPicker(forId = dayKid()) {
  const cur = artOf(forId), multi = kids().length > 1;
  const whom = !multi ? __h('For this phone.') : forId === 'all' ? __h('For the All page on this phone.') : __h("For {name}'s page on this phone.", { name: kidName(kidById(forId)) });
  const close = popup(`<h3>🎨 ${__h('Clock art')}</h3><p class="note">${whom}</p>
    <div class="artgrid">${Art.THEMES.filter(t => !t.travel).map(t => { const u = Art.peek(t.id, 0.7); return `<button class="artopt ${t.id === cur ? 'on' : ''}" data-pick="${t.id}" aria-pressed="${t.id === cur}"><span class="thumb" style="background:${t.base}"><img alt="" data-th="${t.id}"${u ? ` src="${u}"` : ''}><i></i></span><span class="an">${__h(t.name)}</span></button>`; }).join('')}</div>
    ${multi && forId !== 'all' ? `<div class="chips" style="margin-top:12px">${chip('artAll', 1, __h('Use it for every child'), false)}</div>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Done')}</button></div>`);
  $('#sheet').querySelectorAll('img[data-th]').forEach(img => { if (!img.getAttribute('src')) Art.url(img.dataset.th, 0.7).then(u => { img.src = u; }); });
  $('#sheet').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    const every = $('#sheet').querySelector('[name=artAll]:checked');
    (every ? kids().map(k => k.id).concat('all') : [forId]).forEach(id => setArt(id, b.dataset.pick));
    close(); render(); toast(__(Art.byId(b.dataset.pick).name));
  });
}
/** What an entry on the clock is, without changing anything: entries are changed in the list below the clock. */
function openEntryInfo(id) {
  const e = db.events.find(x => x.id === id); if (!e) return;
  const [a, b] = describe(e), T = TYPES[e.type] || {}, k = kids().length > 1 ? kidById(childOf(e)) : null, approx = !!(e.data && e.data.approx);
  const when = `${fmtDate(e.ts)} · ${approx ? __('about {time}', { time: fmtTime(e.ts) }) : fmtTime(e.ts)}`;
  const close = popup(`<h3>${T.icon || ''} ${__h(T.label || N_('Entry'))}</h3>
    <p class="note">${esc(when)}</p>${k ? `<p><span class="ktag" style="--k:${k.color}">${avatar(k)}${esc(kidName(k))}</span></p>` : ''}
    <p class="infob"><b>${esc(a)}</b>${b ? `<br>${esc(b)}` : ''}</p>${e.note ? `<p>“${esc(e.note)}”</p>` : ''}${byLine(e)}
    ${Sync.can('edit', e) ? `<p class="note">${__h('To change or delete it, tap it in the list below the clock.')}</p>` : ''}
    ${e.type === 'feed' && e.data.kind === 'solids' && Sync.can('profile') ? `<button class="btn" id="infoAllergy" style="width:100%;margin-top:6px">⚠️ ${__h('Mark an allergy')}</button>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Close')}</button><button class="btn p" id="infoList">${__h('Show in the list')}</button></div>`);
  $('#infoList').onclick = () => { close(); showInList(id); };
  if ($('#infoAllergy')) $('#infoAllergy').onclick = () => openAllergy(childOf(e), { foods: e.data.foods || [], date: dkey(e.ts) });
}
/** Scroll to an entry in the day's list (opening its group) and light it up for a moment. */
function showInList(id) {
  const find = () => document.querySelector(`#view .ev[data-edit="${CSS.escape(id)}"]`);
  if (!find() && quad != null) { quad = null; render(); }   // (it may be outside the quarter that is listed)
  const row = find(); if (!row) return;
  const grp = row.closest('details'); if (grp && !grp.open) { grp.open = true; if (grp.dataset.grp) openGroups.add(grp.dataset.grp); }
  row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 2200);
}
/** A small sheet for things that aren't entries (pediatrician, milestones). */
function popup(html) {
  const S = $('#sheet'), back = $('#sheetBack'); S.innerHTML = html; S.onchange = null; Icons.paint(S); S.hidden = back.hidden = false;
  const close = () => { S.hidden = back.hidden = true; }; back.onclick = close; S.querySelectorAll('[data-close]').forEach(b => b.onclick = close); return close;
}
function openDoctor(edit) {
  const d = Guide.cleanDoctor(db.baby.doctor), can = Sync.can('profile');
  const line = (label, v, call) => (v ? `<div class="stat"><span>${__h(label)}<br><b class="sel">${esc(v)}</b></span>${call && Guide.tel(v) ? `<a class="btn callbtn" href="${esc(Guide.tel(v))}">📞 ${__h('Call')}</a>` : ''}</div>` : '');
  if (!edit) {
    const info = [line(N_('Doctor'), d.name), line(N_('Practice'), d.practice), line(N_('Phone'), d.phone, true), line(N_('After hours / nurse line'), d.after, true), line(N_('Address'), d.address), line(N_('Notes'), d.notes)].join('');
    const close = popup(`<h3>🩺 ${__h('Pediatrician')}</h3>${info || `<p class="note">${__h('No pediatrician saved yet.')} ${can ? __h('Add their details so everyone looking after the baby has the number.') : __h('A parent can add them.')}</p>`}
      <div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Close')}</button>${can ? `<button class="btn p" id="docEdit">${info ? __h('Edit') : __h('Add details')}</button>` : ''}</div>`);
    if ($('#docEdit')) $('#docEdit').onclick = () => { close(); openDoctor(true); };
    return;
  }
  const f = (id, label, v, max, type = 'text') => `<label class="f">${__h(label)}</label><input id="${id}" type="${type}" maxlength="${max}" value="${esc(v)}"${type === 'tel' ? ' inputmode="tel"' : ''}>`;
  const close = popup(`<h3>🩺 ${__h('Pediatrician')}</h3><p class="note">${__h('Shared with everyone in the log, end-to-end encrypted.')}</p>
    ${f('dcName', N_('Doctor'), d.name, 60)}${f('dcPractice', N_('Practice or clinic'), d.practice, 80)}${f('dcPhone', N_('Phone'), d.phone, 30, 'tel')}${f('dcAfter', N_('After hours / nurse line'), d.after, 30, 'tel')}${f('dcAddr', N_('Address'), d.address, 120)}
    <label class="f">${__h('Notes')}</label><textarea id="dcNotes" rows="2" maxlength="200">${esc(d.notes)}</textarea>
    <div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="dcSave">${__h('Save')}</button></div>`);
  $('#dcSave').onclick = () => {
    db.baby.doctor = Guide.cleanDoctor({ name: $('#dcName').value, practice: $('#dcPractice').value, phone: $('#dcPhone').value, after: $('#dcAfter').value, address: $('#dcAddr').value, notes: $('#dcNotes').value });
    Sync.linked() ? Sync.pushBaby() : save(); close(); render(); toast(__('Saved'));
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
  const names = who.map(kidName), age = __(M.title);
  popup(`<h3>🌟 ${who.length > 1 ? __h('{names} are {age} old', { names: andList(names), age }) : __h('{name} is {age} old', { name: names[0], age })}</h3><p class="note">${__h("Every baby is different; this is what's common around now.")}</p>${milestoneBody(M)}
    <div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Close')}</button><button class="btn p" id="msGuide">${__h('More in the Guide')}</button></div>`);
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
    <button type="button" class="fcur" aria-expanded="false" ${dis}><span class="fv">${esc(cur) || __h('Choose a formula…')}</span><span class="chev" aria-hidden="true">›</span></button>
    <div class="flist" hidden>${lately.length ? `<p class="fh">${__h('Usual and recent')}</p><div class="fopts">${lately.map(opt).join('')}</div>` : ''}
      ${Formulas.ordered(here).map(r => `<details class="freg" data-region="${r.id}" ${r.id === here ? 'open' : ''}><summary><span>${__h(r.name)}${r.id === here ? ` <small>${__h('Where you are')}</small>` : ''}</span><span class="chev" aria-hidden="true">›</span></summary><div class="fopts">${r.items.map(opt).join('')}</div></details>`).join('')}
      <button type="button" class="fopt fo-other" data-fv="__other">${__h('Other (type it in)…')}</button></div>
    <input type="text" class="fother" maxlength="60" placeholder="${__h("Type the formula's name")}" ${attrs.txt} ${dis} hidden></div>`;
}
/** Show `v` as a picker's choice (no change event: used to suggest the usual formula). */
function setPick(fp, v) {
  fp.querySelector('input[type=hidden]').value = v; fp.querySelector('.fv').textContent = v === '__other' ? __('Other') : v || __('Choose a formula…');
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
  const by = __(M.by);
  const journey = live && today ? `<div class="legrow ${rest ? 'warn' : ''}"><span>${leg ? `${__h('**{what}** since {time}', { what: __(M.moving), time: fmtTime(leg.ts) })} · <span class="nw">${esc(fmtDur(mins))}</span>` : __h(M.still)}</span>${can ? `<button class="btn tbtn" data-leg>${__h(leg ? M.stop : M.go)}</button>` : ''}</div>
    ${rest ? `<p class="call">${__h('Time for a break: many car seat makers advise taking young babies out of the seat at least every 2 hours.')}</p>` : ''}
    ${leg && m === 'plane' ? `<p class="note">${__h('Coming in to land? Offer a feed, a bottle or a pacifier: swallowing helps their ears.')}</p>` : ''}` : '';
  return `<div class="card tripcard"><div class="th"><span class="tm">${M.icon}</span><span class="tt"><b>${__h('Travelling {by}', { by })}</b><small>${live ? __h('Day {n} of {days} · back {date}', { n, days, date: fmtShort(last) }) : __h('Day {n} of {days} · until {date}', { n, days, date: fmtShort(last) })}</small></span></div>
    ${journey}
    <details class="tips" data-grp="ttips" ${openGroups.has('ttips') ? 'open' : ''}><summary>${__h('Tips for travelling {by}', { by })}<span class="chev" aria-hidden="true">›</span></summary><ul>${Travel.TIPS[m].map(t => `<li>${__h(t)}</li>`).join('')}</ul></details>
    ${Sync.can('edit', tr) ? `<div class="row"><button class="btn" data-tripedit="${tr.id}">${__h('Change trip')}</button>${live && today ? `<button class="btn" data-triphome>${__h("We're home")}</button>` : ''}</div>` : ''}</div>`;
}
/** At the bottom of today's page: switch to travel mode, or the trip coming up. */
function tripButton() {
  if (!Sync.can('add')) return '';
  const up = Travel.upcoming(db.events, Date.now());
  if (up) { const M = Travel.MEANS[Travel.meansOf(up)]; return `<button class="tripbtn" data-tripedit="${up.id}"><span class="tm">${M.icon}</span><span><b>${__h('Trip coming up {by}', { by: __(M.by) })}</b><small>${__h('{from} – {to}. Tap to change it.', { from: fmtShort(up.ts), to: fmtShort(Travel.ends(up) - 1) })}</small></span><span class="chev" aria-hidden="true">›</span></button>`; }
  return `<button class="tripbtn" data-tripnew><span class="tm">🧳</span><span><b>${__h('Travelling?')}</b><small>${__h('Switch to travel mode for the trip: quicker logging and a clock to match the journey')}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}
/** Travel: the four things logged most, as big buttons with one-tap sheets; the rest are one more tap away. */
function travelQuick() {
  if (!Sync.can('add')) return '';
  const P = Travel.PALETTE.light, label = { feed: N_('Feed'), diaper: N_('Diaper'), sleep: N_('Asleep'), vomit: N_('Spit-up') };
  return `<div class="quick tq">${Object.keys(label).map(k => `<button data-qadd="${k}" style="--cw:${Kids.rgba(P[groupOf(k).id], 0.3)}"><b>${TYPES[k].icon}</b>${__h(label[k])}</button>`).join('')}</div>
    <button class="qmore" data-qmore>${Sync.can('health') ? __h('More: play, night waking, health and medicine') : __h('More: play, night waking')}</button>`;
}
function openMoreTypes() {
  const types = ['play', 'wake', 'health', 'med'].filter(k => Sync.can('health') || (k !== 'health' && k !== 'med'));
  const close = popup(`<h3>${__h('More to log')}</h3><div class="quick">${types.map(k => `<button data-more="${k}"><b>${TYPES[k].icon}</b>${__h(TYPES[k].label)}</button>`).join('')}</div>
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Close')}</button></div>`);
  $('#sheet').querySelectorAll('[data-more]').forEach(b => b.onclick = () => { close(); openSheet(b.dataset.more); });
}
/** Plan a trip or change one: how you're travelling, and from when until when. A new trip leaves on `start` (a day; today by default). */
function openTrip(ev, start) {
  if (ev ? !Sync.can('edit', ev) : !Sync.can('add')) return toast(__("You don't have permission to do that"));
  const today = startOfDay(Date.now()), from = ev ? startOfDay(ev.ts) : Math.max(today, start || today), to = ev ? startOfDay(Travel.ends(ev) - 1) : addDays(from, 2), cur = ev ? Travel.meansOf(ev) : 'car';
  const close = popup(`<h3>🧳 ${ev ? __h('Your trip') : __h('Plan a trip')}</h3>
    <label class="f">${__h('How are you travelling?')}</label>
    <div class="means">${Travel.KINDS.map(k => `<label class="mean"><input type="radio" name="means" value="${k}" ${k === cur ? 'checked' : ''}><span><b>${Travel.MEANS[k].icon}</b>${__h(Travel.MEANS[k].label)}</span></label>`).join('')}</div>
    <div class="dates"><span><label class="f" for="tripFrom">${__h('Leaving')}</label><input type="date" id="tripFrom" value="${dkey(from)}"></span><span><label class="f" for="tripTo">${__h('Back home')}</label><input type="date" id="tripTo" value="${dkey(to)}"></span></div>
    <div class="mini">${[[0, N_('Just today')], [2, N_('3 days')], [6, N_('A week')], [13, N_('Two weeks')]].map(([n, l]) => `<button type="button" data-len="${n}">${__h(l)}</button>`).join('')}</div>
    <p class="note">${__h("Plan it as far ahead as you like: travel mode switches on by itself on the day you leave, and off after the day you're back, on every phone sharing this log.")}</p>
    <div class="row" style="margin-top:14px">${ev && Sync.can('delete', ev) ? `<button class="btn d" id="tripDel">${__h('Delete')}</button>` : ''}<button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="tripSave">${__h('Save')}</button></div>`);
  const S = $('#sheet'), F = $('#tripFrom'), T = $('#tripTo'), day = v => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00').getTime() : NaN);
  const label = () => { if (!ev) $('#tripSave').textContent = day(F.value) > today ? __('Plan it') : __('Start'); };
  S.querySelectorAll('[data-len]').forEach(b => b.onclick = () => { const f = day(F.value); if (f) T.value = dkey(addDays(f, +b.dataset.len)); });
  F.onchange = label; label();
  $('#tripSave').onclick = () => {
    const f = day(F.value), t = day(T.value), now = Date.now();
    if (!f || !t) return toast(__('Pick both dates'));
    if (t < f) return toast(__('The day back is before the day you leave'));
    if (t - f > 92 * DAY) return toast(__('A trip can be up to three months'));
    // one trip at a time (one that has already ended may share its last day with a new one)
    const clash = db.events.find(e => e.type === 'trip' && e !== ev && Travel.ends(e) > now && e.ts < addDays(t, 1) && Travel.ends(e) > f);
    if (clash) return toast(__('That overlaps the trip {by} ({from} – {to}). Change that one instead.', { by: __(Travel.MEANS[Travel.meansOf(clash)].by), from: fmtShort(clash.ts), to: fmtShort(Travel.ends(clash) - 1) }));
    const rec = ev || { id: uid(), type: 'trip', by: Auth.id || undefined };
    Object.assign(rec, { ts: f, end: addDays(t, 1), data: { means: (S.querySelector('[name=means]:checked') || {}).value || 'car' }, note: '', updated: stamp() });
    if (!ev) db.events.push(rec);
    if (tab === 'month') { viewDay = f; calMonth = new Date(f); } else viewDay = startOfDay(now);   // the calendar shows the trip's days
    save(); close(); quad = null; render(); window.scrollTo(0, 0);
    if (!voyage) toast(f > now ? __('Saved: travel mode switches on by itself on {day}', { day: fmtShort(f) }) : __('Travel mode is on'));
  };
  if ($('#tripDel')) $('#tripDel').onclick = () => { if (!confirm(__('Delete this trip? What you logged during it stays.'))) return; removeEvent(ev); save(); close(); render(); toast(__('Trip deleted')); };
}
/** "We're home": the trip ends now (and so does a leg of the journey still running). */
function endTrip() {
  const now = Date.now(), tr = Travel.at(db.events, now), leg = Travel.moving(db.events);
  if (!tr) return;
  if (!Sync.can('edit', tr)) return toast(__("You can't change this trip"));
  tr.end = now; tr.updated = stamp();
  if (leg && Sync.can('edit', leg)) { leg.end = Math.max(now, leg.ts + MIN); leg.updated = stamp(); }
  save(); render(); window.scrollTo(0, 0); if (!voyage) toast(__('Welcome home'));
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
    <p class="vmsg"><b>${away ? __h('Travelling {by}', { by: __(M.by) }) : __h('Welcome home')}</b><small>${away ? __h('Have a good trip!') : __h('Back to the usual page')}</small></p>`;
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
    if (!Sync.can('edit', leg)) return toast(__("You can't change this"));
    leg.end = Math.max(now, leg.ts + MIN); leg.updated = stamp(); save(); render();
    return toast(m === 'car' ? __('Break time: a stretch out of the car seat, a feed and a fresh diaper') : __(M.stop));
  }
  if (!Sync.can('add')) return toast(__("You don't have permission to do that"));
  db.events.push({ id: uid(), type: 'leg', ts: now, data: { means: m }, note: '', updated: stamp(), by: Auth.id || undefined });
  save(); render();
  toast(m === 'plane' ? __('Offer a feed, bottle or pacifier for takeoff: swallowing helps their ears') : __('{what}. Safe travels!', { what: __(M.moving) }));
}
/** Travel: a short sheet of big one-tap answers. A rough time is fine ("about 15 minutes ago"); such times are kept as estimates. */
function openQuick(type) {
  if (!Sync.can('add')) return toast(__("You don't have permission to do that"));
  const T = TYPES[type], multi = kids().length > 1, page = dayKid(), pre = page === 'all' ? kids().map(k => k.id) : [page];
  const prev = db.events.filter(e => e.type === type && pre.includes(childOf(e))).sort((a, b) => b.ts - a.ts)[0], pd = (prev && prev.data) || {};
  const big = (name, opts, cur, cls = '') => `<div class="chips big ${cls}">${opts.map(([v, l]) => chip(name, v, l, String(v) === String(cur), '', true)).join('')}</div>`;   // (labels come as HTML)
  const near = (v, list) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const who = multi ? `<div class="chips kidchips">${kids().map(k => `<label class="chip kidchip" style="--k:${k.color}"><input type="checkbox" name="qkid" value="${k.id}" ${pre.includes(k.id) ? 'checked' : ''}><span>${avatar(k)}${esc(kidName(k))}</span></label>`).join('')}</div>` : '';
  const ML = [60, 90, 120, 150, 180];
  let body = '', instant = false, title = __(T.label);
  const ifYouLike = ` <small>${__h('(if you like)')}</small>`;
  if (type === 'feed') body = `<label class="f">${__h('Bottle or breast?')}</label>${big('qkind', [['bottle', '🍼 ' + __h('Bottle')], ['breast', __h('Breast')]], pd.kind || 'bottle')}
    <div id="qBottle"><label class="f">${__h('About how much?')}</label>${big('qml', ML.map(v => [v, __h('{n} ml', { n: v })]), pd.ml ? near(+pd.ml, ML) : 90)}${big('qmilk', [['Formula', __h('Formula')], ['Breast milk', __h('Breast milk')]], pd.milk || 'Formula')}</div>
    <div id="qBreast"><label class="f">${__h('Side')}${ifYouLike}</label>${big('qside', SIDES.map(v => [v, __h(v)]), '')}
      <label class="f">${__h('About how long?')}${ifYouLike}</label>${big('qmin', [5, 10, 15, 20, 30].map(v => [v, __h('{n} min', { n: v })]), '')}</div>`;
  if (type === 'diaper') { instant = true; body = `<label class="f">${__h('Tap one to save')}</label>${big('qdia', [['pee', '💧 ' + __h('Pee')], ['poo', '💩 ' + __h('Poo')], ['both', __h('Pee + Poo')]], '', 'save')}`; }
  if (type === 'vomit') { instant = true; title = __('Spit-up'); body = `<label class="f">${__h('Tap one to save')}</label>${big('qvom', [['Spit-up', __h('A little')], ['Large', __h('More than usual')]], '', 'save')}`; }
  if (type === 'sleep') title = __('Fell asleep');
  const close = popup(`<h3>${T.icon} ${esc(title)}</h3>${who}<label class="f">${__h('When?')}</label>${big('qago', [[0, __h('Just now')], [15, __h('~{n} min ago', { n: 15 })], [30, __h('~{n} min ago', { n: 30 })], [60, __h('~1 hr ago')]], 0)}
    ${body}<div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Cancel')}</button>${instant ? '' : `<button class="btn p" id="qSave">${__h('Save')}</button>`}</div>`);
  const S = $('#sheet'), val = n => { const c = S.querySelector(`[name=${n}]:checked`); return c ? c.value : ''; };
  const sync = () => { if ($('#qBottle')) { const b = val('qkind') === 'bottle'; $('#qBottle').hidden = !b; $('#qBreast').hidden = b; } };
  S.onchange = sync; sync();
  const commit = () => {
    const ids = multi ? [...S.querySelectorAll('[name=qkid]:checked')].map(c => c.value).filter(id => kidById(id)) : [kids()[0].id];
    if (!ids.length) return toast(__('Choose who this is for'));
    const ago = +val('qago') || 0, ts = Date.now() - ago * MIN, est = ago ? { approx: true } : {};
    let data = { ...est };
    if (type === 'feed') data = val('qkind') === 'breast' ? { kind: 'breast', ...(val('qside') ? { side: val('qside') } : {}), ...(val('qmin') ? { min: +val('qmin') } : {}), ...est } : { kind: 'bottle', ml: +val('qml') || 90, milk: val('qmilk') || 'Formula', ...est };
    if (type === 'diaper') { const v = val('qdia'); data = { pee: v !== 'poo', poo: v !== 'pee', rash: false, ...est }; }
    if (type === 'vomit') data = { amount: val('qvom') || 'Spit-up', projectile: false, ...est };
    if (type === 'sleep') { const busy = ids.find(id => activeSleep(id)); if (busy) return toast(__('{name} is already asleep', { name: kidName(kidById(busy)) })); }
    for (const id of ids) {
      const d = structuredClone(data);
      if (type === 'feed' && d.kind === 'bottle' && d.milk === 'Formula') { const f = usualFormula(kidById(id)); if (f) d.formula = f; }
      db.events.push({ id: uid(), type, ts, data: d, note: '', updated: stamp(), by: Auth.id || undefined, child: id });
    }
    if (ids.length === 1) { if (dayKid() !== ids[0]) setKid(ids[0]); } else if (dayKid() !== 'all' && !ids.includes(dayKid())) setKid('all');
    save(); close(); viewDay = startOfDay(ts); render(); toast(ids.length > 1 ? __n('Saved for {n} child', 'Saved for {n} children', ids.length) : __('Saved'));
  };
  S.querySelectorAll('.save input').forEach(i => i.onclick = () => setTimeout(commit));   // one tap saves
  if ($('#qSave')) $('#qSave').onclick = commit;
}

// ---------- Tutorial ----------
// What each screen's tour points at, and why it's there (tour.js shows them). Steps for things that aren't on the screen right now (one
// child, no permission, no trip) are left out by themselves.
const TOURS = {
  day: [
    { sel: '#kidBar', title: N_('A page for each child'), why: N_('Each child has their own page in their own colour. "All" shows everyone together.') },
    { sel: '#view .quick', title: N_('Log it in one tap'), why: N_('Tap what just happened. The time is filled in for you, with shortcuts for a few minutes ago.') },
    { sel: '#sleepBanner', title: N_('Asleep right now'), why: N_('While your baby sleeps the timer runs here. Tap "Woke up" when they wake.') },
    { sel: 'svg.clock', title: N_('The day at a glance'), why: N_('Each entry is a ray out to the time it happened, in its own colour. Tap a dot to see what it was, or a quarter of the dial for just those hours.') },
    { sel: '.clockctl .seg', title: N_('24 or 12 hours'), why: N_('The whole day on one dial, or a classic 12-hour face with AM and PM.') },
    { sel: '.clockctl .artbtn', title: N_('Choose the painting'), why: N_('Pick the watercolour around the clock, for each child.') },
    { sel: '.datenav', title: N_('Other days'), why: N_('Use the arrows to look back at earlier days.') },
    { sel: '#view details.grp', title: N_('Every detail'), why: N_('Everything from the day, grouped: feeds, diapers, sleep and more. Tap a group to open it.') },
    { sel: '.tripbtn', title: N_('Going on a trip?'), why: N_('Travel mode gives you bigger buttons, rough times that are quick to log, and a clock to match the journey.') },
    { sel: '#tabs', title: N_('Everything else'), why: N_('The month, stats, the Guide with medicines and milestones, family sharing, and settings.') },
    { sel: '#helpBtn', title: N_('Help on every screen'), why: N_('Tap ? on any screen for a tour of it.') },
  ],
  travel: [
    { sel: '.tripcard', title: N_('Your trip'), why: N_('How you are travelling and until when. Change it any time, or tap "We\'re home" to end it.') },
    { sel: '.legrow', title: N_('The journey'), why: N_('Tap when you set off and when you stop. Time on the move lights up the clock\'s outer ring, and long drives get a reminder to take a break.') },
    { sel: '.quick.tq', title: N_('Big buttons for busy moments'), why: N_('Each opens a short sheet: tap a rough time and an answer. "About 15 minutes ago" is fine; estimated times show with a ~.') },
    { sel: '.qmore', title: N_('The rest'), why: N_('Play, night wakings, health notes and medicines are one more tap away.') },
    { sel: 'svg.clock', title: N_('A travel clock'), why: N_('The painting matches how you travel, and travel days have their own colours, so they stand out later in the month view.') },
    { sel: '#helpBtn', title: N_('Help on every screen'), why: N_('Tap ? on any screen for a tour of it.') },
  ],
  month: [
    { sel: '.cal', title: N_('The month'), why: N_('Dots show what was logged each day. Days away travelling are outlined.') },
    { sel: '.cal button.sel', title: N_('Pick a day'), why: N_('Tap a day to see its numbers below.') },
    { sel: '#view .tripbtn', title: N_('Plan a trip'), why: N_('Plan trips ahead: pick the day you leave, then tap here. Travel mode switches on by itself that day.') },
    { sel: '#view .tiles', title: N_('The day in numbers'), why: N_('Feeds, diapers, sleep and more for the day you picked.') },
    { sel: 'details[data-grp=mAll]', title: N_('Every entry'), why: N_('Open this to see each entry of that day, and tap one to change it.') },
    { sel: '#view .quick', title: N_('Add to that day'), why: N_('Log something you forgot, on the day you picked.') },
  ],
  routine: [
    { sel: '#view .rnext', title: N_('Next in the routine'), why: N_('What usually comes next, and how long until then.') },
    { sel: '#view .routine', title: N_('Your routine'), why: N_('Feeds, sleep, play and medicines that happen at about the same time on most days. A tick shows what is done today.') },
    { sel: '#view .rhow', title: N_('It keeps up by itself'), why: N_('It is worked out again from the last week every time, so it changes when your baby\'s routine does.') },
  ],
  stats: [
    { sel: '#view .seg', title: N_('How far back'), why: N_('Look at the last 7, 14 or 30 days.') },
    { sel: '#pdfBtn', title: N_('For the doctor'), why: N_('A PDF of everything logged, to share or print for a checkup.') },
    { sel: '#view .chart', title: N_('A chart for each section'), why: N_('Drawn to scale, one bar per day. Tap a bar for its numbers.') },
    { sel: '#view details.tbl', title: N_('The exact numbers'), why: N_('Each chart has a table with every day\'s numbers, handy for a checkup.') },
  ],
  guide: [
    { sel: '#docBtn', title: N_('Your pediatrician'), why: N_('Save their details once, and everyone sharing the log gets a Call button.') },
    { sel: '.emer', title: N_('Emergencies'), why: N_('The signs that need emergency help straight away.') },
    { sel: '.nowcard', title: N_('Right now'), why: N_('What is common at your baby\'s age.') },
    { sel: '#view details.gd[data-grp^=g]', title: N_('Common worries'), why: N_('What is normal with a newborn, and when to call. Some have pictures, kept out of sight until you tap them.') },
    { sel: 'details[data-grp=omenu]', title: N_('Medicines'), why: N_('Over-the-counter medicines that are safe from what age, remedies parents mention, and what never to give.') },
    { sel: '#view details.gd[data-grp^=m]', title: N_('Month by month'), why: N_('Milestones for every month. A reminder pops up on each month birthday.') },
  ],
  family: [
    { sel: '.ftreeimg', title: N_('Family tree'), why: N_('You, your family and your relatives\' families, drawn as a tree that grows as people join. Tap someone for their details, a child for their day, or a family to switch to it.') },
    { sel: '#famAdd', title: N_('Add a family'), why: N_('Looking after someone else\'s children? Scan the QR code one of their parents shows you. Once they approve it, their family is on this page: in your family tree if you are family, or with the families you help with.') },
    { sel: '#syncNow', title: N_('Your shared log'), why: N_('When this phone last synced. Tap to sync now.') },
    { sel: 'details[data-grp=famlist]', title: N_('Families and relatives'), why: N_('Your family and your relatives\' families, with their children. Open one to switch; requests to join a family you are a parent in wait here for you.') },
    { sel: '#view .pbtn', title: N_('People'), why: N_('Everyone with access and their role. Tap a person for their contact details.') },
    { sel: '#helpers', title: N_('Caregivers and helpers'), why: N_('Caregivers, babysitters, medical assistants and friends, on a list of their own. Tap one for their details; a parent can retire someone who no longer helps.') },
    { sel: '#invCard', title: N_('Invite someone'), why: N_('Make a one-time QR code. You approve them before they see anything.') },
    { sel: '#actBtn', title: N_('Activity'), why: N_('Who added, changed or deleted what. Only parents see this.') },
    { sel: '#view .code.mono', title: N_('Security code'), why: N_('Everyone sharing the log sees the same code: a quick check that only your family has the keys.') },
    { sel: '#view .card', title: N_('Family sharing'), why: N_('Sign in to share the log with family and caregivers, end-to-end encrypted.') },
  ],
  more: [
    { sel: '.kidrow', title: N_('Your children'), why: N_('Names, birth dates and colours. "Add a child" for twins or triplets.') },
    { sel: '.kidrow .fpick', title: N_('Usual formula'), why: N_('Pick it from the list; each region folds open. After three days of the same formula it is picked for you.') },
    { sel: '#regionSel', title: N_('Where you are'), why: N_('Formulas sold here come first, and the Guide gives your emergency number and medicine names first.') },
    { sel: '.card:has([data-art])', title: N_('Clock art'), why: N_('The painting around each child\'s clock.') },
    { sel: '.card:has([name=themeMode])', title: N_('Light or dark'), why: N_('Match your phone, pick one, or follow sunrise and sunset.') },
    { sel: '#expCsv', title: N_('Your data'), why: N_('Back up the log, or export a copy for your pediatrician.') },
  ],
};
/** The tour of the screen that is showing: the Day tab on a travel day has its own. */
const tourPage = () => (tab === 'day' && tripOn(viewDay) ? 'travel' : tab);
function startTour() {
  if (Acct.gate()) return;
  const page = tourPage();
  if (!$('#sheet').hidden) $('#sheet').hidden = $('#sheetBack').hidden = true;
  const steps = TOURS[page] || [], skipFamily = page === 'family' && document.querySelector('#syncNow');   // signed in: the "sharing is off" card isn't there
  const shown = (skipFamily ? steps.filter(s => s.sel !== '#view .card') : steps).map(s => ({ ...s, title: __(s.title), why: __(s.why) }));
  if (!Tour.start(shown, () => { if (page === 'day') { Tour.mark('day'); render(); } })) toast(__('Nothing to show on this screen yet'));
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
  return `<div class="card"><b>${ks.length > 1 ? __h('Children') : __h('Baby')}</b>${can ? '' : `<p class="note">${__h('Only parents can change these.')}</p>`}
    ${ks.map(k => `<div class="kidrow" style="--k:${k.color}">
      <div class="kh">${avatar(k, 'lg')}<input type="text" data-kn="${k.id}" maxlength="60" value="${esc(k.name)}" placeholder="${__h('Name')}" aria-label="${__h('Name')}" ${dis}></div>
      <label class="f">${__h('Birth date')}</label><input type="date" data-kb="${k.id}" value="${esc(k.birth)}" ${dis}>
      <label class="f">${__h('Boy or girl')}</label><div class="chips">${chip('ks-' + k.id, 'boy', __h('Boy'), k.sex === 'boy', '', true)}${chip('ks-' + k.id, 'girl', __h('Girl'), k.sex === 'girl', '', true)}${chip('ks-' + k.id, '', __h('Not set'), !k.sex, '', true)}</div>
      <label class="f">${__h('Usual formula')}</label>${formulaPicker({ sel: `data-kfs="${k.id}" aria-label="${__h('Usual formula')}"`, txt: `data-kft="${k.id}" aria-label="${__h('Formula name')}"` }, usualFormula(k), recentFormulas([k]), dis)}
      <p class="note" style="margin:4px 0 0">${learnedFormula(k) && learnedFormula(k) !== k.formula ? __h('Picked up from the feeds: it was given at every formula feed three days running.') : __h('When one formula is given at every formula feed three days running, it becomes the usual one.')}</p>
      <label class="f">${__h('Allergies')}</label>${(k.allergies || []).length ? k.allergies.map(a => `<div class="stat alrow"><span>⚠️ <b>${__h(a.food)}</b><br><small>${esc([a.date && __('first reaction {date}', { date: fmtDay(a.date) }), a.note].filter(Boolean).join(' · '))}</small></span>${can ? `<button class="btn d" data-alrm="${k.id}" data-food="${esc(a.food)}" aria-label="${__h('Remove {name}', { name: __(a.food) })}" style="padding:6px 12px">✕</button>` : ''}</div>`).join('') : `<p class="note" style="margin:0">${__h('None marked.')}</p>`}
      ${can ? `<button class="btn" data-aladd="${k.id}" style="margin-top:6px">⚠️ ${__h('Mark an allergy')}</button>` : ''}
      <label class="f">${__h('Colour')}</label><div class="swatches" role="radiogroup" aria-label="${__h('Colour')}">${Kids.swatches(k.sex).map(c => `<button type="button" class="sw ${c === k.color ? 'on' : ''}" data-kc="${k.id}" data-c="${c}" style="--k:${c}" role="radio" aria-checked="${c === k.color}" aria-label="${c}" ${dis}>${c === k.color ? '✓' : ''}</button>`).join('')}</div>
      ${can && ks.length > 1 ? `<button class="btn d" data-krm="${k.id}" style="margin-top:12px">${__h('Remove {name}', { name: kidName(k) })}</button>` : ''}</div>`).join('')}
    ${can && ks.length < Kids.MAX ? `<button class="btn" id="kAdd" style="width:100%;margin-top:6px">+ ${__h('Add a child')}</button>` : ''}</div>`;
}
/** Where you are: the formula list and the Guide put this region first (kept on this phone). */
function regionHtml() {
  const cur = Formulas.REGIONS.some(r => r.id === db.meta.region) ? db.meta.region : '';
  return `<div class="card"><b>📍 ${__h('Where you are')}</b>
    <select id="regionSel" class="fsel" aria-label="${__h('Where you are')}" style="margin-top:10px"><option value=""${cur ? '' : ' selected'}>${__h('Automatic: {region}', { region: __(Formulas.name(Formulas.regionFor())).replace(/ \(.*\)$/, '') })}</option>
      ${Formulas.REGIONS.map(r => `<option value="${r.id}"${r.id === cur ? ' selected' : ''}>${__h(r.name)}</option>`).join('')}</select>
    <p class="note">${__h("Formulas sold here come first in the formula list, and the Guide gives this region's emergency number, medicine names and ages first.")}${cur ? '' : ' ' + __h("Worked out from your phone's time zone.")} ${__h('Kept on this phone.')}</p></div>`;
}
/** The language choices: the phone's (the first, automatic) and every language there is a catalogue for, each named in itself. */
const langOptions = chosen => `<option value=""${chosen ? '' : ' selected'}>${__h('Automatic: {language}', { language: I18n.label(I18n.auto()) })}</option>
  ${I18n.LANGS.map(l => `<option value="${l.id}" lang="${l.id}"${l.id === chosen ? ' selected' : ''}>${esc(I18n.label(l.id))}</option>`).join('')}`;
/** Language (kept on this phone), and a way to tell us when a translation reads wrong. */
function languageHtml() {
  return `<div class="card" id="langCard"><b>🌐 ${__h('Language')}</b>
    <select id="langSel" class="fsel" aria-label="${__h('Language')}" style="margin-top:10px">${langOptions(I18n.chosen())}</select>
    <p class="note">${__h("The app follows your phone's language unless you choose one here. Kept on this phone.")}${I18n.lang() === 'en' ? '' : ' ' + __h('Translations were made with the help of AI and may have mistakes.')}</p>
    ${Report.can() ? `<button class="btn" id="langReport" style="width:100%">${__h('Report a language issue')}</button>` : ''}</div>`;
}
/** The language picker on the sign-in and other screens before the app opens, for anyone who can't read the language they're in. */
const langMini = () => `<div class="langmini"><label>🌐 <select id="langMini" aria-label="${__h('Language')}">${langOptions(I18n.chosen())}</select></label></div>`;
async function setLanguage(code) { await I18n.set(code); render(); toast(I18n.label(I18n.lang())); }
/** Reports of language problems go through the app's server, which passes them on by email. Where they go is kept on the server (an
    encrypted secret there, see supabase/functions/language-report), never in the app; the report carries only what is typed into it. */
const Report = {
  url: () => { const u = (window.LL_CONFIG || {}).supabaseUrl; return u ? u.replace(/\/$/, '') + '/functions/v1/language-report' : ''; },
  can: () => !!Report.url(),
  /** 'sent', 'busy' (too many lately), 'invalid' or 'failed'. */
  async send(body) {
    const cfg = window.LL_CONFIG || {}, token = Auth.signedIn ? await Auth.accessToken().catch(() => '') : '';
    const r = await Native.fetch(Report.url(), { method: 'POST', headers: { 'content-type': 'application/json', apikey: cfg.supabaseKey || '', Authorization: 'Bearer ' + (token || cfg.supabaseKey || '') }, body: JSON.stringify(body) });
    return r.ok ? 'sent' : r.status === 429 ? 'busy' : r.status === 400 ? 'invalid' : 'failed';
  },
};
let lastScreen = 'day';   // the screen before More, where a language problem was probably seen
function openLanguageReport() {
  const screens = [['day', N_('Day')], ['routine', N_('Routine')], ['month', N_('Month')], ['stats', N_('Stats')], ['guide', N_('Guide')], ['family', N_('Family')], ['more', N_('More')], ['signin', N_('Signing in')], ['other', N_('Somewhere else')]];
  const close = popup(`<h3>🌐 ${__h('Report a language issue')}</h3>
    <p class="note">${__h('Words that are wrong, hard to understand, or not translated: tell the Little Log team.')}</p>
    <label class="f" for="lrLang">${__h('Language')}</label><select id="lrLang" class="fsel">${I18n.LANGS.map(l => `<option value="${l.id}" lang="${l.id}"${l.id === I18n.lang() ? ' selected' : ''}>${esc(I18n.label(l.id))}</option>`).join('')}</select>
    <label class="f" for="lrWhere">${__h('Where did you see it?')}</label><select id="lrWhere" class="fsel">${screens.map(([v, l]) => `<option value="${v}"${v === lastScreen ? ' selected' : ''}>${__h(l)}</option>`).join('')}</select>
    <label class="f" for="lrSays">${__h('What does it say?')}</label><textarea id="lrSays" rows="3" maxlength="500" placeholder="${__h('Copy or type the words that read wrong')}"></textarea>
    <label class="f" for="lrShould">${__h('What should it say?')} <small>${__h('(if you know)')}</small></label><textarea id="lrShould" rows="3" maxlength="500"></textarea>
    <p class="note">${__h('Only what you type here is sent, with the language and the screen. Nothing from your log or your account.')}</p>
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="lrSend">${__h('Send')}</button></div>`);
  $('#lrSend').onclick = async () => {
    const says = $('#lrSays').value.trim(), b = $('#lrSend');
    if (!says) { $('#lrSays').focus(); return toast(__('Write what it says first')); }
    b.disabled = true; b.textContent = __('Sending…');
    let r = 'failed';
    try { r = await Report.send({ lang: $('#lrLang').value, screen: $('#lrWhere').value, says, should: $('#lrShould').value.trim(), platform: Native.platform || 'web' }); } catch (e) { /* offline */ }
    if (r === 'sent') { close(); return toast(__('Thank you! Your report was sent.')); }
    b.disabled = false; b.textContent = __('Send');
    toast(r === 'busy' ? __('Thanks, we have had a lot of reports from you lately. Please try again in an hour.') : r === 'invalid' ? __('Write what it says first') : __("Couldn't send it. Check you're online and try again."));
  };
}
function artHtml() {
  const pages = (kids().length > 1 ? [...kids().map(k => [k.id, kidName(k)]), ['all', __('All')]] : [[kids()[0].id, kidName(kids()[0])]]);
  return `<div class="card"><b>🎨 ${__h('Clock art')}</b><p class="note">${__h('The watercolour painting around the day clock. Kept on this phone.')}</p>
    ${pages.map(([id, name]) => `<div class="stat"><span>${esc(name)}<br><small>${__h(Art.byId(artOf(id)).name)}</small></span><button class="btn" data-art="${id}" style="padding:6px 12px">${__h('Change')}</button></div>`).join('')}</div>`;
}
/** Light, dark, matching the phone, or following sunrise and sunset (kept on this phone). */
function appearanceHtml() {
  const m = Theme.mode, s = Theme.todaySun();
  const opts = [['system', N_('Match phone')], ['light', N_('Light')], ['dark', N_('Dark')], ['sun', N_('Sunrise & sunset')]];
  const sun = s.polar ? (s.polar === 'day' ? __h("The sun doesn't set here today, so it stays light.") : __h("The sun doesn't rise here today, so it stays dark."))
    : __h('Today: light from {rise}, dark from {set}.', { rise: fmtTime(s.rise), set: fmtTime(s.set) });
  return `<div class="card"><b>🌗 ${__h('Appearance')}</b>
    <div class="chips" style="margin-top:10px">${opts.map(([v, l]) => chip('themeMode', v, __h(l), m === v, '', true)).join('')}</div>
    <p class="note">${m === 'sun' ? sun + ' ' + (s.zone ? __h("Estimated for the {zone} time zone; your location isn't used.", { zone: s.zone }) : __h("Estimated from your time zone; your location isn't used."))
      : m === 'system' ? __h("Follows your phone's light or dark setting.") : __h('Switching plays a little sunrise or sunset.')}</p></div>`;
}
function moreView() {
  return languageHtml() + Acct.accountHtml() + `
  ${kidsHtml()}
  ${regionHtml()}
  ${artHtml()}
  ${appearanceHtml()}
  ${Acct.cloudHtml()}
  <div class="card"><b>${__h('Your data')}</b><p class="note">${Sync.linked() ? __h('Entries are saved on this device and synced to your family log.') : __h('Everything is stored only on this device.')} ${__h('Export a plain-text copy to share with your pediatrician.')}</p>
    <div class="row"><button class="btn" id="expJson">${__h('Backup (JSON)')}</button><button class="btn" id="expCsv">${__h('Export CSV')}</button></div>
    <div class="row"><button class="btn" id="expPdf">📄 ${__h('Report for the doctor (PDF)')}</button></div>
    <div class="row"><button class="btn" id="impJson">${__h('Restore from JSON')}</button></div>
    <input type="file" id="impFile" accept="application/json" hidden></div>
  <div class="card" id="appCard"><b>${__h('App updates')}</b><p class="note"><span id="appVer"></span>${__h('New versions of Little Log come through the app store.')}</p>
    <div class="row"><button class="btn" id="appUpdate">${__h('Update app')}</button></div></div>
  ${Sync.isParent() ? `<div class="card"><button class="btn d" id="wipe" style="width:100%">${__h('Delete all entries')}</button></div>` : ''}`;
}
/** More → Update app: the app's page in its store, where an update is one tap (the phone app can't replace itself). */
function updateApp() {
  const url = Native.storeUrl();
  if (url) return Native.openExternal(url);
  toast(Native.is ? __('Open the App Store, tap your picture at the top, and update Little Log from the list there.') : __('In the phone app, this opens the app store to update Little Log.'));
}

// ---------- Bindings ----------
function bind() {
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => openSheet(b.dataset.add));
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const ev = db.events.find(e => e.id === b.dataset.edit); Sync.can('edit', ev) ? openSheet(null, ev) : toast(ev && ev.by ? __("You can't change entries added by {name}", { name: Sync.nameOf(ev.by) || __('someone else') }) : __("You can't change entries")); });
  document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { viewDay = addDays(viewDay, +b.dataset.nav); quad = null; render(); });
  document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { viewDay = +b.dataset.day; quad = null; render(); });
  document.querySelectorAll('[data-month]').forEach(b => b.onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + +b.dataset.month, 1); render(); });
  document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { statDays = +b.dataset.range; render(); });
  document.querySelectorAll('[data-quad]').forEach(b => b.onclick = () => { quad = quad === +b.dataset.quad ? null : +b.dataset.quad; render(); });
  document.querySelectorAll('[data-quadclear]').forEach(b => b.onclick = () => { quad = null; render(); });
  document.querySelectorAll('[data-face]').forEach(b => b.onclick = () => { db.meta.clock = b.dataset.face; Store.save(db); quad = null; render(); });
  document.querySelectorAll('[data-half]').forEach(b => b.onclick = () => { half = +b.dataset.half; quad = null; render(); });
  document.querySelectorAll('[data-nums]').forEach(b => b.onclick = () => { db.meta.nums = b.dataset.nums; Store.save(db); render(); });
  document.querySelectorAll('[data-info]').forEach(b => b.onclick = () => openEntryInfo(b.dataset.info));
  document.querySelectorAll('#pdfBtn, #expPdf').forEach(b => b.onclick = openDoctorReport);
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
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { if (b.dataset.tab === 'more' && tab !== 'more') lastScreen = tab; tab = b.dataset.tab; if (tab === 'month') calMonth = new Date(viewDay); render(); window.scrollTo(0, 0); } };

function bindMore() {
  $('#appUpdate').onclick = updateApp;
  Native.version().then(v => { const el = $('#appVer'); if (v && el) el.textContent = __('Version {version}', { version: v }) + ' · '; });
  document.querySelectorAll('[name=themeMode]').forEach(r => r.onchange = () => { if (r.checked) { Theme.set(r.value); render(); } });
  $('#regionSel').onchange = e => { if (e.target.value) db.meta.region = e.target.value; else delete db.meta.region; Store.save(db); render(); toast(__('Where you are: {region}', { region: __(Formulas.name(myRegion())) })); };
  $('#langSel').onchange = e => setLanguage(e.target.value);
  if ($('#langReport')) $('#langReport').onclick = openLanguageReport;
  bindFormulaPickers($('#view'));
  /** Keep `name`/`birth` mirroring the first child, then save and (when shared) send the new profile. */
  const commit = saveProfile, K = id => kidById(id);
  document.querySelectorAll('[data-aladd]').forEach(b => b.onclick = () => openAllergy(b.dataset.aladd));
  document.querySelectorAll('[data-alrm]').forEach(b => b.onclick = () => {
    const k = K(b.dataset.alrm); if (!k || !Sync.can('profile')) return;
    if (!confirm(__('Remove {food} from {name}\'s allergies?', { food: __(b.dataset.food), name: kidName(k) }))) return;
    k.allergies = (k.allergies || []).filter(a => a.food !== b.dataset.food); commit(__('Removed'));
  });
  document.querySelectorAll('[data-kn]').forEach(i => i.onchange = () => { const k = K(i.dataset.kn); if (k && Sync.can('profile')) { k.name = i.value.trim().slice(0, 60); commit(); } });
  const setFormula = (k, name) => { k.formula = name.trim().slice(0, 60); k.formulaAt = Date.now(); commit(__('Saved')); };   // feeds before now don't count towards learning another
  document.querySelectorAll('[data-kfs]').forEach(sel => sel.onchange = () => {
    const k = K(sel.dataset.kfs), other = document.querySelector(`[data-kft="${sel.dataset.kfs}"]`);
    if (!k || !Sync.can('profile')) return;
    if (sel.value === '__other') { other.hidden = false; other.focus(); return; }
    setFormula(k, sel.value);
  });
  document.querySelectorAll('[data-kft]').forEach(i => i.onchange = () => { const k = K(i.dataset.kft); if (k && Sync.can('profile') && i.value.trim()) setFormula(k, i.value); });
  document.querySelectorAll('[data-kb]').forEach(i => i.onchange = () => { const k = K(i.dataset.kb); if (k && Sync.can('profile')) { k.birth = i.value; commit(__('Saved')); } });
  kids().forEach(k => document.querySelectorAll(`[name="ks-${k.id}"]`).forEach(r => r.onchange = () => {
    if (!Sync.can('profile') || !r.checked) return;
    k.sex = r.value;
    if (!Kids.group(k.sex).includes(k.color)) k.color = Kids.auto(kids(), k.sex, k.id);   // moved between boy / girl / not set: pick a fresh shade for the new group
    commit();
  }));
  document.querySelectorAll('[data-kc]').forEach(b => b.onclick = () => { const k = K(b.dataset.kc); if (k && Sync.can('profile')) { k.color = b.dataset.c; commit(); } });
  document.querySelectorAll('[data-krm]').forEach(b => b.onclick = () => {
    const k = K(b.dataset.krm); if (!k || !Sync.can('profile') || kids().length < 2) return;
    if (db.events.some(e => e.child === k.id) || (k === kids()[0] && db.events.some(e => !e.child))) return toast(__('{name} still has entries – open one and move it to another child, or delete them first', { name: kidName(k) }));
    if (!confirm(__('Remove {name} from this log?', { name: kidName(k) }))) return;
    db.baby.kids = kids().filter(x => x !== k); if (selKid === k.id) selKid = null; commit(__('Removed'));
  });
  if ($('#kAdd')) $('#kAdd').onclick = () => { const k = Kids.make(kids()); kids().push(k); setKid(k.id); commit(); const i = document.querySelector(`[data-kn="${k.id}"]`); if (i) i.focus(); };
  $('#expJson').onclick = () => download('little-log-backup.json', JSON.stringify({ app: 'littlelog', v: 1, baby: db.baby, events: db.events }, null, 2), 'application/json');
  $('#expCsv').onclick = () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [[N_('Child'), N_('Date'), N_('Time'), N_('Type'), N_('Summary'), N_('Details'), N_('End'), N_('Note')].map(h => q(__(h))).join(',')].concat([...db.events].sort((a, b) => a.ts - b.ts).map(e => {
      const [a, b] = describe(e);
      return [Travel.isTravel(e.type) ? '' : kidName(kidById(childOf(e))), dkey(e.ts), fmtTime(e.ts), TYPES[e.type] ? __(TYPES[e.type].label) : a, a, b, e.end ? fmtTime(e.end) : '', e.note].map(q).join(',');   // (a trip is everyone's)
    }));
    download('little-log.csv', rows.join('\n'), 'text/csv');
  };
  $('#impJson').onclick = () => $('#impFile').click();
  $('#impFile').onchange = async e => {
    try { Acct.applyBackup(JSON.parse(await e.target.files[0].text())); }
    catch (err) { toast(err.message && err.message.startsWith('That file') ? __(err.message) : __('That file is not a valid backup')); }
    e.target.value = '';
  };
  if ($('#wipe')) $('#wipe').onclick = () => {
    const msg = [__('Delete ALL entries?'), Sync.linked() && __('This also deletes them for everyone sharing this log.'), __('This cannot be undone.')].filter(Boolean).join(' ');
    if (confirm(msg) && confirm(__('Really delete everything?'))) { [...db.events].forEach(removeEvent); save(); render(); }
  };
}
function download(name, text, type) {
  if (Native.is) return Native.saveFile(name, text).catch(e => { if (!/cancel/i.test(e.message)) toast(__('Could not share the file')); });
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Entry sheet ----------
const chip = (name, val, label, checked, cls = '', radio = false) =>
  `<label class="chip ${cls}"><input type="${radio ? 'radio' : 'checkbox'}" name="${name}" value="${esc(val)}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
/** Radio chips whose values are saved as they are (in English) and shown in the app's language. */
const radios = (name, opts, cur, cls) => `<div class="chips">${opts.map(o => chip(name, o, __h(o), o === cur, cls, true)).join('')}</div>`;
const num = (id, v, ph, step = 1) => `<input id="${id}" type="number" inputmode="decimal" min="0" step="${step}" value="${v ?? ''}" placeholder="${__h(ph)}">`;

/** The child a feed is for (to suggest their formula): the entry's own, else the open page's, else the first. */
const feedKid = ev => kidById(ev ? childOf(ev) : dayKid()) || kids()[0];
function openSheet(type, ev, pre) {
  const editing = !!ev;
  type = ev ? ev.type : type;
  if (editing ? !Sync.can('edit', ev) : !Sync.can('add')) return toast(__("You don't have permission to do that"));
  if ((type === 'health' || type === 'med') && !Sync.can('health')) return toast(__("You don't have access to health notes"));
  const d = (ev && ev.data) || pre || {}, T = TYPES[type];
  // New entries default to now, or to noon of the viewed day when browsing past days.
  const defTs = ev ? ev.ts : (viewDay === startOfDay(Date.now()) ? Date.now() : viewDay + 12 * 60 * MIN);
  let body = '';
  const L = t => `<label class="f">${__h(t)}</label>`;
  if (type === 'feed') body = `
    ${L(N_('Type'))}${radios('kind', [N_('breast'), N_('bottle'), N_('solids')], d.kind || 'breast')}
    <div id="fBreast">${L(N_('Side'))}${radios('side', SIDES, d.side)}${L(N_('Minutes'))}${num('min', d.min, N_('e.g. 15'))}</div>
    <div id="fBottle">${L(N_('Amount (ml)'))}${num('ml', d.ml, N_('e.g. 90'))}${L(N_('Milk'))}${radios('milk', MILKS, d.milk)}
      <div id="fFormula">${L(N_('Which formula'))}${formulaPicker({ sel: `id="formulaSel" aria-label="${__h('Which formula')}"`, txt: `id="formula" aria-label="${__h('Formula name')}"` }, ev ? d.formula || '' : usualFormula(feedKid(ev)), recentFormulas(ev ? [feedKid(ev)] : kids()))}</div></div>
    <div id="fSolids">${foodsPicker(d.foods || [], ev ? [childOf(ev)] : dayKid() === 'all' ? kids().map(k => k.id) : [dayKid()])}${L(N_('How much'))}${radios('amount', Foods.PORTIONS, d.amount)}</div>`;
  if (type === 'diaper') body = `
    ${L(N_('What was in it?'))}<div class="chips">${chip('pee', 1, '💧 ' + __h('Pee'), d.pee ?? !editing)}${chip('poo', 1, '💩 ' + __h('Poo'), d.poo)}${chip('rash', 1, __h('Rash'), d.rash, 'warn')}</div>
    <div id="dColor">${L(N_('Poo colour'))}${radios('color', STOOL, d.color, '')}</div>`;
  if (type === 'sleep') body = `
    <label class="f">${__h('Woke up at')} <small>${__h('(leave empty if still asleep)')}</small></label><input id="end" type="datetime-local" value="${ev && ev.end ? toLocalInput(ev.end) : ''}">
    <div class="mini"><button type="button" data-endnow>${__h('Now')}</button></div>`;
  if (type === 'wake') body = `${L(N_('Awake for (minutes)'))}${num('min', d.min, N_('e.g. 20'))}${L(N_('Why?'))}${radios('why', WAKE_WHY, d.why)}`;
  if (type === 'vomit') body = `${L(N_('Amount'))}${radios('amount', AMOUNTS, d.amount || 'Spit-up')}<div class="chips" style="margin-top:12px">${chip('projectile', 1, __h('Projectile'), d.projectile, 'warn')}</div>`;
  if (type === 'play') body = `${L(N_('Activity'))}${radios('activity', PLAYS, d.activity || 'Tummy time')}${L(N_('Minutes'))}${num('min', d.min, N_('e.g. 10'))}`;
  if (type === 'health') body = `${L(N_('Check anything you noticed'))}<div class="chips">${SYMPTOMS.map(s => chip('sym', s, __h(s), (d.symptoms || []).includes(s), 'warn')).join('')}</div>${L(N_('Temperature (°)'))}${num('temp', d.temp, N_('optional'), 0.1)}`;
  if (type === 'med') body = `${L(N_('Medicine / vitamin'))}<input id="mname" type="text" value="${esc(d.name || '')}" placeholder="${__h('e.g. Vitamin D')}">${L(N_('Dose'))}<input id="mdose" type="text" value="${esc(d.dose || '')}" placeholder="${__h('e.g. 1 ml')}">`;

  // Who is it for? Only asked when the log has more than one child. New entries can be logged for several at once (e.g. all three fed together).
  const multi = kids().length > 1, here = ev ? childOf(ev) : dayKid();
  const forHtml = !multi ? '' : `<label class="f">${editing ? __h('For') : __h('For (tick everyone it applies to)')}</label><div class="chips kidchips">${kids().map(k =>
    `<label class="chip kidchip" style="--k:${k.color}"><input type="${editing ? 'radio' : 'checkbox'}" name="kid" value="${k.id}" ${k.id === here ? 'checked' : ''}><span>${avatar(k)}${esc(kidName(k))}</span></label>`).join('')}</div>`;
  $('#sheet').innerHTML = `<h3>${T.icon} ${editing ? __h('Edit {what}', { what: __(T.noun) }) : __h('Add {what}', { what: __(T.noun) })}</h3>
    ${forHtml}
    ${L(type === 'sleep' ? N_('Fell asleep at') : N_('Time'))}<input id="ts" type="datetime-local" value="${toLocalInput(defTs)}">
    <div class="mini">${[5, 15, 30, 60].map(m => `<button type="button" data-ago="${m}">${m < 60 ? __h('{n} min ago', { n: m }) : __h('1 hr ago')}</button>`).join('')}<button type="button" data-ago="0">${__h('Now')}</button></div>
    ${body}
    ${L(N_('Note (optional)'))}<textarea id="note" rows="2" maxlength="1000" placeholder="${__h('Anything worth remembering')}">${esc(ev ? ev.note : '')}</textarea>
    <div class="row" style="margin-top:16px">${editing && Sync.can('delete', ev) ? `<button class="btn d" id="del">${__h('Delete')}</button>` : ''}<button class="btn" id="cancel">${__h('Cancel')}</button><button class="btn p" id="save">${__h('Save')}</button></div>`;
  Icons.paint($('#sheet')); $('#sheet').hidden = $('#sheetBack').hidden = false;

  const S = $('#sheet'), checked = n => S.querySelector(`[name=${n}]:checked`);
  bindFormulaPickers(S);
  const val = n => { const c = checked(n); return c ? c.value : ''; };
  const sync = () => {
    if (type === 'feed' && $('#fBreast')) {
      const kind = val('kind'), b = kind === 'bottle'; $('#fBreast').hidden = kind !== 'breast'; $('#fBottle').hidden = !b; $('#fSolids').hidden = kind !== 'solids'; $('#fFormula').hidden = val('milk') !== 'Formula';
      S.querySelector('.fsum').textContent = [...S.querySelectorAll('[name=food]:checked')].map(c => __(c.value)).join(', ');
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
  if ($('#foodAdd')) $('#foodAdd').onclick = () => { const v = $('#foodOther').value.trim().slice(0, 60); if (!v) return; $('#foodOther').value = ''; $('#foodTyped').insertAdjacentHTML('beforeend', chip('food', v, esc(v), true)); sync(); };
  const en = S.querySelector('[data-endnow]'); if (en) en.onclick = () => { $('#end').value = toLocalInput(Date.now()); };
  const close = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; };
  $('#sheetBack').onclick = $('#cancel').onclick = close;
  if ($('#del')) $('#del').onclick = () => { if (confirm(__('Delete this entry?'))) { removeEvent(ev); save(); close(); render(); toast(__('Deleted')); } };
  $('#save').onclick = () => {
    const ts = fromLocalInput($('#ts').value);
    if (!ts) return toast(__('Please pick a time'));
    const n = id => { const v = $(id).value; return v === '' ? undefined : +v; };
    const formulaName = () => { const sel = $('#formulaSel'); return sel ? (sel.value === '__other' ? $('#formula').value : sel.value).trim().slice(0, 60) : ''; };
    let data = {}, end;
    if (type === 'feed') data = val('kind') === 'bottle' ? { kind: 'bottle', ml: n('#ml'), milk: val('milk'), ...(val('milk') === 'Formula' && formulaName() ? { formula: formulaName() } : {}) }
      : val('kind') === 'solids' ? { kind: 'solids', foods: [...S.querySelectorAll('[name=food]:checked')].map(c => c.value), ...(val('amount') ? { amount: val('amount') } : {}) } : { kind: 'breast', side: val('side'), min: n('#min') };
    if (data.kind === 'solids' && !data.foods.length) return toast(__('Choose at least one food'));
    if (type === 'diaper') {
      data = { pee: !!checked('pee'), poo: !!checked('poo'), rash: !!checked('rash') };
      if (data.poo) data.color = val('color');
      if (!data.pee && !data.poo && !confirm(__('Save as a dry diaper?'))) return;
    }
    if (type === 'sleep') { end = $('#end').value ? fromLocalInput($('#end').value) : undefined; if (end && end <= ts) return toast(__('Wake time must be after bedtime')); }
    if (type === 'wake') data = { min: n('#min'), why: val('why') };
    if (type === 'vomit') data = { amount: val('amount'), projectile: !!checked('projectile') };
    if (type === 'play') data = { activity: val('activity'), min: n('#min') };
    if (type === 'health') {
      data = { symptoms: [...S.querySelectorAll('[name=sym]:checked')].map(c => c.value), temp: n('#temp') };
      if (!data.symptoms.length && !data.temp && !$('#note').value.trim()) return toast(__('Tick a symptom or add a note'));
    }
    if (type === 'med') { data = { name: $('#mname').value.trim(), dose: $('#mdose').value.trim() }; if (!data.name) return toast(__('Enter a name')); }
    if (ev && ev.data && ev.data.approx && Math.floor(ts / MIN) === Math.floor(ev.ts / MIN)) data.approx = true;   // still the estimated time
    const who = multi ? [...S.querySelectorAll('[name=kid]:checked')].map(c => c.value).filter(id => kidById(id)) : [kids()[0].id];
    if (!who.length) return toast(__('Choose who this is for'));
    if (type === 'sleep' && !end) { for (const id of who) { const cur = activeSleep(id); if (cur && cur !== ev) return toast(multi ? __('{name} is sleeping – tap “Woke up” first', { name: kidName(kidById(id)) }) : __('Already sleeping – tap “Woke up” first')); } }
    const usualBefore = new Map(who.map(id => [id, type === 'feed' ? usualFormula(kidById(id)) : '']));
    for (const id of who) {
      const rec = ev || { id: uid(), type, by: Auth.id || undefined };
      Object.assign(rec, { ts, data: structuredClone(data), note: $('#note').value.trim(), updated: stamp(), child: id });
      if (type === 'sleep') { if (end) rec.end = end; else delete rec.end; }
      if (!ev) db.events.push(rec);
    }
    if (who.length === 1) { if (dayKid() !== who[0]) setKid(who[0]); } else if (dayKid() !== 'all' && !who.includes(dayKid())) setKid('all');
    save(); close(); viewDay = startOfDay(ts); render(); toast(who.length > 1 ? __n('Saved for {n} child', 'Saved for {n} children', who.length) : __('Saved'));
    const settled = type === 'feed' ? who.filter(id => learnedFormula(kidById(id)) && usualFormula(kidById(id)) !== usualBefore.get(id)) : [];
    if (settled.length) toast(__("{formula} is now {names}'s usual formula", { formula: usualFormula(kidById(settled[0])), names: andList(settled.map(id => kidName(kidById(id)))) }));
    const risky = data.kind === 'solids' ? who.flatMap(id => data.foods.filter(f => allergicTo(id, f)).map(f => [id, f])) : [];
    if (risky.length) setTimeout(() => alert(__('{name} is allergic to {food}. Watch closely, and call {sos} for trouble breathing, swelling of the lips, tongue or face, or if your baby goes floppy or pale.', { name: kidName(kidById(risky[0][0])), food: __(risky[0][1]), sos: __(Guide.sos(myRegion())) })), 300);
    if (type === 'diaper' && data.poo && STOOL_WARN.includes(data.color)) setTimeout(() => alert(__('Red-streaked or pale / white stools can be a sign of a problem. Please tell your pediatrician (and call straight away if your baby seems unwell).')), 300);
    if (type === 'health' && data.symptoms.some(s => URGENT.includes(s))) setTimeout(() => alert(__('One of these symptoms can be urgent. If your baby has blue lips/face, trouble breathing, a fever (38°C / 100.4°F+ in a newborn) or is hard to wake, call your pediatrician or emergency services now.')), 300);
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
  if (m) { tab = 'more'; render(); return toast(__(m)); }
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
  await Promise.all([I18n.init(), Store.init()]); db = normalize(await Store.load());   // before anything reads the log, or shows text
  Icons.init(); Icons.paint(document.querySelector('#tabs')); Icons.paint(document.querySelector('#cover')); Icons.paint(document.querySelector('#helpBtn'));
  Theme.onChange = () => render();
  Store.st.onChange = () => { render(); if (!Store.st.ok) toast(__('Cannot save on this phone – free up space')); };
  if (Store.st.quarantined || Store.st.recovered) setTimeout(() => toast(Store.st.recovered ? __('Your saved log was damaged and has been restored from a recent backup') : __('A damaged copy of the log was set aside; it will be re-downloaded from your family log')), 600);
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
