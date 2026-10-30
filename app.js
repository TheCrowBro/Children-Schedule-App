'use strict';
/* Little Log – newborn tracker. The log is kept on the phone (store.js) and synced, end-to-end encrypted, when signed in. */

// ---------- Config ----------
// Entries come in six groups; each group has one colour. The colours were checked as a set (colour-blind separation, contrast on the
// paper background) in this ring order, inner to outer, separately for light and dark mode. On the day clock each group also has its
// own ring and icon, so colour is never the only way to tell them apart. As a child grows the groups keep their colours: meals join
// the feeds and the potty joins the diapers (big moments are kept apart, in gold, and never go on the clock).
const GROUPS = [
  { id: 'feed', label: N_('Feeding'), icon: '🍼', types: ['feed', 'meal', 'pump'] },
  { id: 'diaper', label: N_('Diapers'), icon: '💧', types: ['diaper', 'potty'] },
  { id: 'sleep', label: N_('Sleep & wake-ups'), icon: '😴', types: ['sleep', 'wake'] },
  { id: 'care', label: N_('Daycare & school'), icon: '🏫', types: ['care', 'pickup'] },
  { id: 'vomit', label: N_('Vomit'), icon: '🤮', types: ['vomit'] },
  { id: 'play', label: N_('Play'), icon: '🧸', types: ['play', 'study'] },
  { id: 'health', label: N_('Health & meds'), icon: '🩺', types: ['health', 'med', 'vaccine', 'visit', 'growth'] },
];
const RING = ['sleep', 'feed', 'diaper', 'vomit', 'play', 'health'];   // (daycare and school have no ring: a stay lights up the dial's outer track)
const GCOLOR = {
  light: { sleep: '#5b5fc7', feed: '#c9761f', diaper: '#2a9db8', vomit: '#5f8a1f', play: '#a845a8', health: '#c0392b', poo: '#8a5a2b', moment: '#a47414', care: '#55708c', bath: '#3f8fbf' },
  dark: { sleep: '#7478d8', feed: '#c97a2a', diaper: '#2b9fc0', vomit: '#8a9a2a', play: '#b85ab0', health: '#dd5a4a', poo: '#b98a55', moment: '#d3a548', care: '#8ba6c2', bath: '#5aa5d2' },
};
const groupOf = t => GROUPS.find(g => g.types.includes(t)) || GROUPS[0];
/** A type's colour in a palette: its group's, or gold for a big moment. */
const colorOf = (t, P) => (t === 'moment' ? P.moment || GCOLOR.light.moment : P[groupOf(t).id]);
const TYPES = {
  feed:   { label: N_('Feed'),     noun: N_('feed'),       icon: '🍼' },
  diaper: { label: N_('Diaper'),   noun: N_('diaper'),     icon: '💧' },
  sleep:  { label: N_('Sleep'),    noun: N_('sleep'),      icon: '😴' },
  wake:   { label: N_('Woke up'), noun: N_('wake-up'), icon: '🌙' },
  vomit:  { label: N_('Vomit'),    noun: N_('vomit'),      icon: '🤮' },
  play:   { label: N_('Play'),     noun: N_('play'),       icon: '🧸' },
  bath:   { label: N_('Bath'),     noun: N_('bath'),       icon: '🛁' },   // (a button of its own; the entry is play, with Bath as the activity)
  pump:   { label: N_('Pumping'),  noun: N_('pumping session'), icon: '🍶' },   // (a parent's pumping session, with the milk stash)
  contraction: { label: N_('Contraction'), noun: N_('contraction'), icon: '⏱' },   // (before the birth: the contraction timer)
  tooth:  { label: N_('Tooth'),    noun: N_('tooth'),      icon: '🦷' },   // (the teething chart in the health record)
  health: { label: N_('Health'),   noun: N_('health note'), icon: '🩺' },
  med:    { label: N_('Meds'),     noun: N_('meds'),       icon: '💊' },
  meal:   { label: N_('Meal'),     noun: N_('meal'),       icon: '🍽' },
  potty:  { label: N_('Potty'),    noun: N_('potty'),      icon: '🚽' },
  moment: { label: N_('Big moment'), noun: N_('big moment'), icon: '🌟' },
  vaccine: { label: N_('Vaccine'), noun: N_('vaccine'), icon: '💉' },
  visit:  { label: N_('Doctor visit'), noun: N_('doctor visit'), icon: '🏥' },
  growth: { label: N_('Growth'), noun: N_('measurement'), icon: '📏' },
  care:   { label: N_('Drop-off'), noun: N_('drop-off'), icon: '🏫' },
  pickup: { label: N_('Pick-up'), noun: N_('pick-up'), icon: '🎒' },
  study:  { label: N_('Homework'), noun: N_('homework'), icon: '📚' },
  plan:   { label: N_('Calendar'), noun: N_('event'), icon: '🗓' },
};
// Health notes, medicines and the health record (vaccines, doctor visits, measurements) are private: only people allowed to see health
// notes get them, under their own key (e2ee.js keeps the same list).
const PRIVATE = ['health', 'med', 'vaccine', 'visit', 'growth'];
const isPrivate = t => PRIVATE.includes(t);
// Entries kept apart from the day's lists, the routine and the report: the calendar, the pictures as they grow, the teeth, the contractions.
const OFF_DAY = ['plan', 'photo', 'tooth', 'contraction'];
const offDay = t => OFF_DAY.includes(t);
for (const [t, T] of Object.entries(TYPES)) T.color = colorOf(t, GCOLOR.light);   // plain hex (light) for the few places that need one
TYPES.bath.color = GCOLOR.light.bath;   // (water blue)
/** A bath: logged as play, drawn as a water ripple on the clock, with its own button and icon. */
const isBath = e => e.type === 'play' && !!(e.data && e.data.activity === 'Bath');
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
// Solid or wet: how a poo was (hard pellets hint at constipation; a run of wet ones at a tummy bug). Saved in English, like the colours.
const STOOL_TEXTURE = [N_('Hard'), N_('Solid'), N_('Soft'), N_('Wet / runny')], RUNNY = 'Wet / runny';
const PLAYS = [N_('Tummy time'), N_('Play'), N_('Walk / outing'), N_('Bath'), N_('Skin-to-skin')];
const WAKE_WHY = [N_('Hungry'), N_('Diaper'), N_('Gas / fussy'), N_('Pain'), N_('Unknown')];
// Where expressed milk went after a pumping session, and how long it keeps there (CDC: 4 hours out, 4 days in the fridge, 6 months in the freezer).
const STORES = { fridge: N_('Fridge'), freezer: N_('Freezer'), now: N_('Given now') }, STORE_HOURS = { fridge: 96, freezer: 180 * 24 };
const SIDES = [N_('Left'), N_('Right'), N_('Both')], MILKS = [N_('Breast milk'), N_('Formula')], AMOUNTS = [N_('Spit-up'), N_('Medium'), N_('Large')];
// From a year old: milk from a cup too, and cow's milk or another milk instead of formula.
const MILKS_OLDER = [...MILKS, N_("Cow's milk"), N_('Plant milk')];
// What a toddler or an older child might be unwell with (the list above is for babies).
const KID_SYMPTOMS = [
  N_('Fever'), N_('Cough'), N_('Runny or stuffy nose'), N_('Sore throat'), N_('Ear pain'), N_('Tummy ache'), N_('Diarrhea'), N_('Vomiting'), N_('Constipation'),
  N_('Rash'), N_('Teething'), N_('Headache'), N_('Fall or injury'), N_('Trouble breathing'), N_('Blue lips or face'), N_('Very sleepy / hard to wake'),
];
const KID_URGENT = ['Trouble breathing', 'Blue lips or face', 'Very sleepy / hard to wake'];
const MEALS = [N_('Breakfast'), N_('Lunch'), N_('Dinner'), N_('Snack')], EATEN = [N_('Hardly any'), N_('Some'), N_('Most'), N_('All of it')];
/** The meal it probably is at the time `t`. */
const mealAt = t => { const h = new Date(t).getHours() + new Date(t).getMinutes() / 60; return h >= 4 && h < 10.5 ? 'Breakfast' : h >= 11 && h < 14 ? 'Lunch' : h >= 17 && h < 21 ? 'Dinner' : 'Snack'; };
// The potty: what happened (one answer), and where.
const POTTY = [['pee', '💧 ', N_('Pee')], ['poo', '💩 ', N_('Poo')], ['both', '', N_('Pee + Poo')], ['none', '', N_('Nothing yet')], ['dry', '', N_('Stayed dry')]];
const POTTY_WHERE = [N_('Potty'), N_('Toilet'), N_('Accident')];
// The health record: vaccines (saved in English and shown in each phone's language; one typed in is kept as typed) and kinds of visit.
const VACCINES = [N_('6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B)'), N_('Diphtheria, tetanus and whooping cough (DTaP)'), N_('Polio (IPV)'), N_('Hib'), N_('Hepatitis B'),
  N_('Rotavirus'), N_('Pneumococcal (PCV)'), N_('MenB'), N_('MenC'), N_('MenACWY'), N_('Measles, mumps and rubella (MMR)'), N_('MMRV (with chickenpox)'), N_('Chickenpox (varicella)'),
  N_('Hepatitis A'), N_('Flu'), N_('COVID-19'), N_('RSV'), N_('BCG (tuberculosis)'), N_('HPV'), N_('Tetanus, diphtheria and whooping cough booster (Tdap)'), N_('Typhoid'), N_('Japanese encephalitis'), N_('Yellow fever')];
const VISITS = [N_('Checkup'), N_('Unwell'), N_('Dentist'), N_('Eyes'), N_('Hearing'), N_('Specialist'), N_('Hospital'), N_('Urgent care or ER')];
// School: homework, reading, practising an instrument. Play as a child grows: a toddler's kinds of play, then a school child's activities.
const STUDY = [N_('Homework'), N_('Reading'), N_('Practising')];   // (practising an instrument, or a sport)
const PLAYS_KID = [N_('Play'), N_('Playing outside'), N_('Reading together'), N_('Walk / outing'), N_('Bath'), N_('Swimming'), N_('Music'), N_('Art or crafts')];
const ACTIVITIES = [N_('Playing outside'), N_('Sport'), N_('Swimming'), N_('Dance'), N_('Music'), N_('Art or crafts'), N_('Games'), N_('Club or group')];

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
  schoolDays = null; freshView();   // (a first day of school may have been saved or deleted; the page's view of the log is rebuilt)
  Store.save(db);
  if (!quiet) Sync.schedule();
  Notify.sync(db.events);   // (a sleep begun or ended: the phone's "still asleep?" checks follow)
}
/** A timestamp for an edit that is always newer than anything this phone has seen, even if its clock is behind
    (last-write-wins compares these, so a slow clock must not make a fresh edit look old). */
function stamp() {
  const t = Math.max(Date.now(), (db.meta.hlc || 0) + 1);
  db.meta.hlc = t; return t;
}
function removeEvent(ev) {
  db.events = db.events.filter(x => x !== ev); freshView();
  db.deleted.push({ id: ev.id, type: ev.type, ts: ev.ts, updated: stamp() });
  const media = (ev.data || {}).media; if (Array.isArray(media) && media.length) Media.discard(media.map(m => m.id));   // (its pictures and videos go too, unless another child's copy of the moment has them)
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
/** A number the way the app's language writes it (Western digits), with at most `d` decimals. */
const fmtNum = (x, d = 1) => new Intl.NumberFormat(I18n.locale(), { maximumFractionDigits: d }).format(x);
// Weight and length: in kg and cm, or in pounds and inches (More → Units; in North America by default). Saved in kg and cm.
const LB = 0.45359237, IN = 2.54;
const usUnits = () => (db.meta.units ? db.meta.units === 'us' : myRegion() === 'na');
const OZ = 29.5735;   // ml in a US fluid ounce
/** Milk amounts in fl oz rather than ml: ml until switched, in More → Units or with the switch in the feed form (kept on this phone). */
const volOz = () => db.meta.vol === 'oz';
/** An amount kept in ml, shown in the unit chosen: "90 ml" or "3 fl oz". */
const fmtVol = ml => (volOz() ? __('{n} fl oz', { n: fmtNum(ml / OZ, 1) }) : __('{n} ml', { n: fmtNum(ml, 0) }));
/** The number to put in an input for an amount kept in ml, and the ml an input's number means. */
const volIn = ml => (ml == null || ml === '' ? '' : volOz() ? Math.round(ml / OZ * 10) / 10 : ml);
const volOut = v => (v == null || v === '' ? v : volOz() ? Math.round(v * OZ) : v);
/** A weight (kg) in the phone's units: 12.4 kg, or 27 lb 5 oz. */
function fmtWeight(kg) {
  if (!usUnits()) return __('{n} kg', { n: fmtNum(kg, 2) });
  const oz = Math.round((kg / LB) * 16);
  return __('{lb} lb {oz} oz', { lb: Math.floor(oz / 16), oz: oz % 16 });
}
/** A length (cm) in the phone's units: 86.5 cm, or 34.1 in. */
const fmtLength = cm => (usUnits() ? __('{n} in', { n: fmtNum(cm / IN, 1) }) : __('{n} cm', { n: fmtNum(cm, 1) }));
const r1 = n => Math.round(n * 10) / 10;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, Math.max(2200, String(msg).length * 60)); }   // longer messages stay longer

// ---------- Event description ----------
function describe(e) { try { return describeEntry(e); } catch (err) { return [__((TYPES[e.type] || {}).label || N_('Entry')), '']; } }
function describeEntry(e) {
  const d = e.data || {}, min = n => __('{n} min', { n });
  switch (e.type) {
    case 'feed':
      if (d.kind === 'solids') return [__('Solids'), [(d.foods || []).map(f => __(f)).join(', '), d.amount && __(d.amount)].filter(Boolean).join(' · ')];
      if (d.kind === 'bottle') return [d.ml ? __('Bottle {amt}', { amt: fmtVol(d.ml) }) : __('Bottle'), [d.milk && __(d.milk), d.formula].filter(Boolean).join(' · ')];
      if (d.kind === 'cup') return [d.ml ? __('Cup {amt}', { amt: fmtVol(d.ml) }) : __('Cup'), [d.milk && __(d.milk), d.formula].filter(Boolean).join(' · ')];
      return [d.side ? __('Breast – {side}', { side: __(d.side) }) : __('Breast'), d.min ? min(d.min) : ''];
    case 'diaper':
      return [d.pee && d.poo ? __('Pee + Poo') : d.pee ? __('Pee') : d.poo ? __('Poo') : __('Dry'), [d.poo && d.texture && __(d.texture), d.poo && d.color && __(d.color), d.rash && __('rash')].filter(Boolean).join(', ')];
    case 'sleep': { const t = { time: fmtDur((e.end - e.ts) / MIN) }; return e.end ? [isNap(e) ? __('Napped {time}', t) : __('Slept {time}', t), __('until {time}', { time: fmtTime(e.end) })] : [isNap(e) ? __('Napping now…') : __('Sleeping now…'), __('tap to set wake time')]; }
    case 'wake': return [d.min ? __('Awake {n} min', { n: d.min }) : d.sleep && !e.end && db.events.some(s => s.id === d.sleep && s.type === 'sleep' && !s.end) ? __('Awake now…') : __('Awake'), d.why ? __(d.why) : ''];
    case 'vomit': return [__('Vomit – {amount}', { amount: __(d.amount || N_('small')) }), d.projectile ? __('projectile') : ''];
    case 'play': return [__(d.activity || 'Play'), d.min ? min(d.min) : ''];
    case 'health': return [(d.symptoms || []).map(x => __(x)).join(', ') || __('Note'), d.temp ? __('Temp {t}°', { t: d.temp }) : ''];
    case 'med': return [d.name || __('Medication'), d.dose || ''];
    case 'meal': return [__(d.meal || 'Meal'), [(d.foods || []).map(f => __(f)).join(', '), d.amount && __(d.amount)].filter(Boolean).join(' · ')];
    case 'potty': {
      const what = d.dry ? __('Stayed dry') : d.pee && d.poo ? __('Pee + Poo') : d.pee ? __('Pee') : d.poo ? __('Poo') : d.accident ? '' : __('Nothing yet');
      return [d.accident ? (what ? __('Accident: {what}', { what }) : __('Accident')) : what, [!d.dry && !d.accident && __(d.where || 'Potty'), d.poo && d.texture && __(d.texture), d.asked && __('asked to go')].filter(Boolean).join(' · ')];
    }
    case 'moment': return [d.own ? d.what || '' : __(d.what || 'Big moment'), ''];
    case 'photo': return [__('Picture'), picOk(d.slot) ? picLabel(picKey(d.slot)) : ''];
    case 'pump': return [__('Pumping'), e.end === null ? __('under way') : [d.side && __(d.side), d.ml && fmtVol(d.ml), d.min && __('{n} min', { n: d.min }), d.store && d.store !== 'now' && __(STORES[d.store]), d.used && __('used')].filter(Boolean).join(' · ')];
    case 'contraction': return [__('Contraction'), e.end ? __('{n} s', { n: Math.round((e.end - e.ts) / 1000) }) : __('under way')];
    case 'tooth': return [toothName(d.tooth), d.lost ? __('fell out') : __('came in')];
    case 'vaccine': return [d.own ? d.name || '' : __(d.name || 'Vaccine'), [d.dose && __('dose {n}', { n: d.dose }), d.place].filter(Boolean).join(' · ')];
    case 'visit': return [__(d.kind || 'Checkup'), [d.who, d.why].filter(Boolean).join(' · ')];
    case 'growth': return [[d.weight && fmtWeight(d.weight), d.height && fmtLength(d.height)].filter(Boolean).join(' · ') || __('Measurement'), d.head ? __('head {size}', { size: fmtLength(d.head) }) : ''];
    case 'care': { const out = pickupAfter(e); return [placeName(d), [out ? __('until {time}', { time: fmtTime(out.ts) }) : '', withText(d), d.who && __('dropped off by {name}', { name: d.who }), out ? '' : planText(d), d.location].filter(Boolean).join(' · ')]; }
    case 'pickup': return [d.place ? __('Picked up from {place}', { place: placeName(d) }) : __('Picked up'), d.who ? __('by {name}', { name: d.who }) : ''];
    case 'plan': return [d.title || __(d.kind || 'Other'), [planWhen(e), d.title && __(d.kind || 'Other')].filter(Boolean).join(' · ')];
    case 'study': return [__(d.kind || 'Homework'), [d.subject, d.min && __('{n} min', { n: d.min }), d.pages && __n('{n} page', '{n} pages', d.pages)].filter(Boolean).join(' · ')];
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
// The log as the page sees it, built once and reused until something changes: the entries in scope (the child shown, or everyone),
// grouped by the day they fall on, the sleeps (they can span midnight) and the drop-offs. A page like Stats asks for hundreds of days;
// without this each day scanned the whole log. Any change goes through save() or removeEvent(), which start it afresh, and the key
// below catches a log swapped or grown by a sync or a switch of child.
let logView = null;
function viewOf() {
  const k = dayKid(), v = logView;
  if (v && v.events === db.events && v.n === db.events.length && v.hlc === db.meta.hlc && v.kid === k) return v;
  const all = db.events, list = [], byDay = new Map(), sleeps = [], care = [];
  for (const e of all) {
    if (e.type === 'care') care.push(e);
    if (Travel.isTravel(e.type) || e.type === 'moment' || offDay(e.type) || (k !== 'all' && childOf(e) !== k)) continue;
    list.push(e); if (e.type === 'sleep') sleeps.push(e);
    const d = startOfDay(e.ts), a = byDay.get(d); if (a) a.push(e); else byDay.set(d, [e]);
  }
  for (const a of byDay.values()) a.sort((x, y) => x.ts - y.ts);
  return logView = { events: all, n: all.length, hlc: db.meta.hlc, kid: k, list, byDay, sleeps, care };
}
const freshView = () => { logView = null; };
const scoped = () => viewOf().list;   // (big moments are kept apart)
const eventsOnDay = day => { const a = viewOf().byDay.get(day); return a ? a.slice() : []; };
const activeSleep = id => db.events.find(e => e.type === 'sleep' && !e.end && (!id || childOf(e) === id));
// A wake-up in the middle of a sleep ("back to sleep soon"): a wake entry linked to the sleep (data.sleep), open until "Asleep again";
// the sleep itself goes on as it was. Drawn dashed on the clock (its ray and its moon).
const pauseOf = s => db.events.find(w => w.type === 'wake' && w.data && w.data.sleep === s.id && !w.end);
const pausedSleep = id => { const s = activeSleep(id); return s && pauseOf(s) ? s : null; };
const isPause = w => w.type === 'wake' && !!(w.data && w.data.sleep);
/** The sleep is over, at `at`: a pause still open is closed with it (one the sleep ended on stands as a plain wake-up, no length). */
function endSleep(s, at = Date.now()) {
  s.end = at; s.updated = stamp();
  for (const w of db.events) if (isPause(w) && w.data.sleep === s.id && !w.end) {
    if (at > w.ts + MIN) { w.end = at; w.data.min = Math.round((at - w.ts) / MIN); } else { w.end = w.ts; delete w.data.min; }
    w.updated = stamp();
  }
}
/** Asleep again after a pause: the wake-up gets its length; the sleep goes on. */
function resumeSleep(w, at = Date.now()) { w.end = Math.max(at, w.ts); w.data.min = Math.max(1, Math.round((w.end - w.ts) / MIN)); w.updated = stamp(); }
/** The Sleep button while the child shown is up for a moment means asleep again: no sheet. (Everyone, with a mix: the sheet asks who.) */
function resumeIfPaused() {
  if (viewDay !== startOfDay(Date.now())) return false;   // (a past day is being looked at: a sleep is being logged for it)
  const ids = dayKid() === 'all' ? kids().map(k => k.id) : [dayKid()], ps = ids.map(id => pausedSleep(id)).filter(Boolean);
  if (!ps.length || ps.length !== ids.length) return false;
  for (const s of ps) { const w = pauseOf(s); if (!Sync.can('edit', w)) return false; resumeSleep(w); }
  save(); render(); toast(__('Asleep again – the sleep goes on')); return true;
}
/** "Woke up" at the top: up for good (the sleep ends now), or back to sleep soon (the sleep goes on; the wake-up is noted, with why). */
function askWoke(s) {
  if (!Sync.can('edit', s)) return toast(__("You can't change this entry"));
  const k = kids().length > 1 ? kidById(childOf(s)) : null, tag = k ? `<p><span class="ktag" style="--k:${k.color}">${avatar(k)}${esc(kidName(k))}</span></p>` : '';
  const close = popup(`<h3>🌙 ${__h('Woke up')}</h3>${tag}<p class="note">${__h('Up for good, or back to sleep soon?')}</p>
    <button class="btn p wakechoice" id="wakeSoon">😴 <span><b>${__h('Back to sleep soon')}</b><small>${__h('the sleep goes on; the wake-up is noted')}</small></span></button>
    <button class="btn wakechoice" id="wakeUp">☀️ <span><b>${__h('Up for good')}</b><small>${__h('the sleep ends now')}</small></span></button>
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Cancel')}</button></div>`);
  $('#wakeUp').onclick = () => { endSleep(s); save(); close(); render(); toast(__('Sleep saved')); };
  $('#wakeSoon').onclick = () => {
    const close2 = popup(`<h3>🌙 ${__h('Woke up')}</h3>${tag}<p class="note">${__h('What woke them? Tap one to save')}</p>
      <div class="chips big save">${WAKE_WHY.map(v => chip('wwhy', v, __h(v), false, '', true)).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn" id="wakeSkip">${__h('Skip')}</button></div>`);
    const note = why => {
      if (s.end || !db.events.includes(s)) return close2();   // (ended meanwhile, on another phone)
      db.events.push({ id: uid(), type: 'wake', ts: Date.now(), data: { ...(why ? { why } : {}), sleep: s.id }, note: '', updated: stamp(), by: Auth.id || undefined, child: childOf(s) });
      save(); close2(); render(); toast(__('Noted. Tap “Asleep again” when they are back asleep.'));
    };
    $('#sheet').querySelectorAll('.save input').forEach(i => i.onclick = () => setTimeout(() => note(i.value)));
    $('#wakeSkip').onclick = () => note('');
  };
}
/** A nap or a night's sleep: as marked on the entry, or else by when it began (from 6 AM to 6 PM, a nap). Naps are drawn dashed on the clock. */
const napTime = ts => { const h = new Date(ts).getHours(); return h >= 6 && h < 18; };
const isNap = e => (e.data && typeof e.data.nap === 'boolean' ? e.data.nap : napTime(e.ts));
const initial = k => esc([...kidName(k)][0] || '?').toUpperCase();
const avatar = (k, cls = '') => `<span class="av ${cls}" style="--k:${k.color}">${initial(k)}</span>`;

// ---------- Growing up ----------
// Each child's stage of life (stages.js) decides what the Day page offers and what its groups are called, and what the Guide shows first.
let schoolDays = null;   // (worked out again whenever the log changes or a screen is drawn)
/** The day a child's first day of school was saved as a big moment ('' if it wasn't). */
function schoolDay(id) {
  if (!schoolDays) {
    schoolDays = new Map();
    for (const e of db.events) if (e.type === 'moment' && e.data && !e.data.own && e.data.what === Stages.SCHOOL_DAY) { const k = childOf(e), d = dkey(e.ts); if (!schoolDays.has(k) || d < schoolDays.get(k)) schoolDays.set(k, d); }
  }
  return schoolDays.get(id) || '';
}
/** A child's stage on the day `t`. */
const stageOf = (k, t = Date.now()) => (k ? Stages.of(k.birth, { t, region: myRegion(), school: schoolDay(k.id) }) : 'newborn');
/** The children a page is about: the one whose page it is, or everyone on the All page. */
const pageKids = () => (dayKid() === 'all' ? kids() : [kidById(dayKid())].filter(Boolean));
/** Whether every child on the page has reached the stage `s` ('toddler': a year old). */
const allFrom = s => pageKids().every(k => Stages.from(stageOf(k), s));
/** A group's name on the page, for the children's ages: feeding becomes meals, and diapers the potty. */
function gLabel(g) {
  const ss = pageKids().map(k => stageOf(k)), past = x => ss.length && ss.every(y => Stages.from(y, x)), some = x => ss.some(y => Stages.from(y, x));
  if (g.id === 'feed') return past('preschool') ? N_('Meals') : past('toddler') ? N_('Meals & milk') : some('toddler') ? N_('Feeding & meals') : g.label;
  if (g.id === 'diaper') return past('school') ? N_('Potty') : some('toddler') ? N_('Diapers & potty') : g.label;
  if (g.id === 'care') return past('school') ? N_('School') : g.label;
  if (g.id === 'play') return past('school') ? N_('Activities & homework') : some('school') ? N_('Play & homework') : g.label;
  return g.label;
}
/** A type's name on the page: from a year old, a feed is milk; from the school years, play is an activity. */
const tLabel = t => (t === 'feed' && allFrom('toddler') ? N_('Milk') : t === 'play' && allFrom('school') ? N_('Activity') : TYPES[t].label);
/** The kinds of play for the children on the page: a baby's, a toddler's, or a school child's activities. */
const playKinds = ks => (ks.length && ks.every(k => Stages.from(stageOf(k), 'school')) ? ACTIVITIES : ks.length && ks.every(k => Stages.from(stageOf(k), 'toddler')) ? PLAYS_KID : PLAYS);

// ---------- Daycare and school ----------
// A drop-off (at daycare, preschool, school, a childminder's, the grandparents'…) starts a stay; the pick-up after it ends it. They
// are two entries, so whoever picks the child up logs it themselves and never has to change someone else's entry. A drop-off can say
// who will pick up and when, for the rest of the family to see.
const STAY = 16 * 3600e3;   // (a stay is over by the next morning, whether or not a pick-up was logged)
/** The pick-up that ended a drop-off: the first entry after it for the same child, if that is a pick-up (and within the day). */
function pickupAfter(e) {
  let next = null;
  for (const x of db.events) if ((x.type === 'care' || x.type === 'pickup') && x !== e && x.ts > e.ts && x.ts <= e.ts + STAY && childOf(x) === childOf(e) && (!next || x.ts < next.ts)) next = x;
  return next && next.type === 'pickup' ? next : null;
}
/** Where a child is now when they were dropped off and not picked up yet (the drop-off), or null. */
function atCare(id, now = Date.now()) {
  let last = null;
  for (const x of db.events) if ((x.type === 'care' || x.type === 'pickup') && childOf(x) === id && x.ts <= now && x.ts > now - STAY && (!last || x.ts > last.ts)) last = x;
  return last && last.type === 'care' ? last : null;
}
/** A place's name: one of Stages.CARE in the app's language, or as typed. */
const placeName = d => (d.own ? d.place || '' : __(d.place || 'Daycare'));
/** The time `m` minutes after midnight, the way the phone writes times. */
const clockAt = m => { const t = new Date(); t.setHours(0, m, 0, 0); return fmtTime(t.getTime()); };
/** Who will pick up, and when, as the drop-off says. */
const planText = d => (d.plan && Number.isInteger(d.at) ? __('{name} picks up at {time}', { name: d.plan, time: clockAt(d.at) }) : d.plan ? __('{name} picks up', { name: d.plan })
  : Number.isInteger(d.at) ? __('pick-up at {time}', { time: clockAt(d.at) }) : '');
/** Who has the child there (the grandparent, the babysitter…), and the rest of a drop-off's line: the pick-up plan and the place's location. */
const withText = d => (d.with ? __('with {name}', { name: d.with }) : '');
const careLine = d => [withText(d), planText(d), d.location].filter(Boolean).join(' · ');
/** The names of the people in the family's log (to choose who drops off and who picks up), and this phone's own. */
const people = () => (Sync.st && Sync.st.people) || [];
const peopleNames = () => [...new Set(people().map(p => (p.display_name || '').trim()).filter(Boolean))].slice(0, 8);
const myName = () => ((people().find(p => p.is_you) || {}).display_name || '').trim();
/** When a child reaches school age or the teenage years: a note at the top of the Day page about what changes, until it is closed
    (kept on this phone). */
const STAGE_NOTE = { school: ['🏫', N_('{name} is at school age: Drop-off and Homework are on the Day page, the routine learns the school week, and the Guide has topics for school children.')],
  teen: ['🌱', N_('{name} is a teenager: the Guide has topics for the teenage years, and the calendar in the Month tab keeps exams, matches, lessons and appointments.')] };
function stageNote() {
  const seen = db.meta.stageSeen || {}, ks = pageKids().filter(k => k.birth && STAGE_NOTE[stageOf(k)] && seen[k.id] !== stageOf(k));
  if (!ks.length) return '';
  const st = stageOf(ks[0]), same = ks.filter(k => stageOf(k) === st), [icon, text] = STAGE_NOTE[st];
  return `<div class="card grownote"><p>${icon} ${__h(text, { name: andList(same.map(kidName)) })}</p><button class="btn" data-stageok="${same.map(k => k.id).join(' ')}" data-stage="${st}">${__h('Close')}</button></div>`;
}
// Notes that come with an age rather than a stage, shown on the Day page until closed: a good time to begin swim lessons, from the first
// birthday (not from 6: by then it is a Guide topic). Closing is kept per child on this phone, like the stage notes.
const AGE_NOTES = [{ id: 'swim', from: 12, until: 72, icon: '🏊', text: N_("A good time to begin swim lessons for {name}: lessons from around age 1 can lower a toddler's risk of drowning, and most children can learn real water skills by 4. Lessons never replace watching: stay within arm's reach near any water. More under Play and activities in the Guide.") }];
function ageNote() {
  const seen = db.meta.noteSeen || {}, now = Date.now();
  for (const n of AGE_NOTES) {
    const ks = pageKids().filter(k => { const m = k.birth ? Stages.months(k.birth, now) : -1; return m >= n.from && m < n.until && !(seen[k.id] || {})[n.id]; });
    if (ks.length) return `<div class="card agenote"><p>${n.icon} ${__h(n.text, { name: andList(ks.map(kidName)) })}</p><button class="btn" data-noteok="${ks.map(k => k.id).join(' ')}" data-note="${n.id}">${__h('Close')}</button></div>`;
  }
  return '';
}

// ---------- 18: Little Log's work is done ----------
// When a child turns 18, a sheet celebrates it (once) and offers to keep it as a big moment; their Day page then says so, with their
// book (a PDF of every big moment in chapters for each stage of growing up, how they grew and their vaccines) and their whole record
// as a file to hand over. Logging goes on as before for anyone who wants it.
/** A child's entries (not the travel ones), oldest first. */
const entriesOf = id => db.events.filter(e => childOf(e) === id && !Travel.isTravel(e.type)).sort((a, b) => a.ts - b.ts);
/** A name made safe for a file name. */
const slugOf = name => name.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'child';
/** The years in numbers: entries, big moments, and since when. */
function yearsText(k) {
  const mine = entriesOf(k.id), n = mine.filter(e => e.type === 'moment').length;
  return [__n('{n} entry', '{n} entries', mine.length), __n('{n} big moment', '{n} big moments', n), mine.length && __('since {date}', { date: fmtDay(dkey(mine[0].ts)) })].filter(Boolean).join(' · ');
}
function grownCard() {
  const ks = pageKids(); if (ks.length !== 1 || stageOf(ks[0]) !== 'grown') return '';
  const k = ks[0];
  return `<div class="card grown"><p>🎓 ${__h("{name} is grown up, and Little Log's work is done. Everything stays here, and you can go on logging.", { name: kidName(k) })}</p><small>${esc(yearsText(k))}</small>
    <div class="row"><button class="btn" data-book="${k.id}">📖 ${__h("{name}'s book", { name: kidName(k) })}</button><button class="btn" data-export="${k.id}">📄 ${__h('The record as a file')}</button></div></div>`;
}
/** A log kept on this phone only, with entries and no backup yet: a reminder to keep one in the cloud, in case the phone is changed or
    lost. Put off, it comes back a month later; a backup to a drive or a saved backup file ends it. */
function backupNudge() {
  if (!Native.is || Sync.linked() || !db.events.length || typeof Cloud.last !== 'function') return '';
  if (db.meta.fileBackupAt || ['google', 'dropbox', 'onedrive'].some(p => Cloud.last(p))) return '';
  if (db.meta.backupNudgeAt && Date.now() - db.meta.backupNudgeAt < 30 * DAY) return '';
  return `<div class="card grownote backupnudge"><p>☁️ ${__h('Keep a backup in the cloud, in case you change or lose your phone.')}</p><span class="row"><button class="btn p" data-backupgo>${__h('Set it up')}</button><button class="btn" data-backuplater>${__h('Not now')}</button></span></div>`;
}
/** On (or after) a child's 18th birthday, once: a sheet to celebrate it, with the book and a way to keep the day as a big moment. */
function graduationCheck() {
  if (!$('#sheet').hidden || Acct.gate() || Tour.active() || !Tour.seen('day')) return;
  const seen = db.meta.grownSeen || (db.meta.grownSeen = {}), k = kids().find(x => x.birth && Stages.months(x.birth, Date.now()) >= 216 && !seen[x.id]);
  if (!k) return;
  seen[k.id] = 1; Store.save(db);
  const name = kidName(k), day = new Date(k.birth + 'T12:00'); day.setFullYear(day.getFullYear() + 18);
  const close = popup(`<h3>🎓 ${__h('{name} is 18', { name })}</h3><p>${__h("Little Log has grown with {name} all the way to 18. Its work is done: everything stays here, and {name}'s book keeps it all.", { name })}</p>
    <p class="note">${esc(yearsText(k))}</p>
    ${Sync.can('add') && !momentsOf([k.id]).some(e => e.data.what === 'Turned 18') ? `<button class="btn" id="gMoment" style="width:100%">🌟 ${__h('Save it as a big moment')}</button>` : ''}
    <div class="row" style="margin-top:12px"><button class="btn" data-close>${__h('Close')}</button><button class="btn p" id="gBook">📖 ${__h('Make the book')}</button></div>`);
  if ($('#gMoment')) $('#gMoment').onclick = () => openMoment(null, { kid: k.id, what: 'Turned 18', day: Math.min(day.getTime(), Date.now()) });
  $('#gBook').onclick = () => { close(); makeBook(k.id); };
}
/** A picture for the book: the full one if this phone has it or can fetch it, else its thumbnail; null when neither can be had. */
async function mediaImage(m) {
  for (const name of [m.id, m.id + '.t']) {
    try { const u = await Media.ensure(name, name === m.id ? m.mime : 'image/jpeg'), im = new Image(); im.src = u; await im.decode(); return { img: im, w: im.naturalWidth, h: im.naturalHeight }; }
    catch (e) { /* the thumbnail, then */ }
  }
  return null;
}
/** A child's book: their big moments in chapters for each stage of growing up, how they grew, their vaccines, and the years in numbers. */
async function bookPdf(id) {
  const k = kidById(id), name = kidName(k), health = Sync.can('health'), blocks = [{ h: 1, text: __("{name}'s book", { name }) }];
  blocks.push({ kv: [[__('Born'), k.birth ? fmtDay(k.birth) : '–'], [__('In Little Log'), yearsText(k)]] });
  let ch = '';
  for (const e of momentsOf([k.id])) {
    const st = stageOf(k, e.ts); if (st !== ch) { blocks.push({ h: 2, text: __(Stages.byId(st).name) }); ch = st; }
    blocks.push({ p: [describe(e)[0], fmtDay(dkey(e.ts)), k.birth && Stages.age(k.birth, e.ts)].filter(Boolean).join(' · '), bold: true });
    if (e.note) blocks.push({ p: e.note, muted: true });
    const imgs = []; for (const m of (e.data.media || []).filter(x => x.kind === 'photo')) { const im = await mediaImage(m); if (im) imgs.push(im); }
    if (imgs.length) blocks.push({ imgs });
  }
  if (health) {   // (how they grew: the measurement nearest each birthday; the vaccines)
    const g = entriesOf(k.id).filter(e => e.type === 'growth'), byYear = new Map();
    for (const e of g) { const m = k.birth ? ageMonths(k, e.ts) : -1, y = Math.round(m / 12); if (m < 0 || Math.abs(m - y * 12) > 4) continue; const cur = byYear.get(y); if (!cur || Math.abs(m - y * 12) < Math.abs(ageMonths(k, cur.ts) - y * 12)) byYear.set(y, e); }
    if (byYear.size) blocks.push({ h: 2, text: __('Growth') }, { table: { cols: [{ w: 2 }, { w: 2 }, { w: 2.4 }, { w: 2.4 }], head: [__('Age'), __('Date'), __('Weight'), __('Length or height')],
      rows: [...byYear].sort((a, b) => a[0] - b[0]).map(([, e]) => [Stages.age(k.birth, e.ts), fmtShort(e.ts), e.data.weight ? fmtWeight(e.data.weight) : '–', e.data.height ? fmtLength(e.data.height) : '–']) } });
    const v = entriesOf(k.id).filter(e => e.type === 'vaccine');
    if (v.length) blocks.push({ h: 2, text: __('Vaccines') }, { table: { cols: [{ w: 5 }, { w: 2 }], head: [__('Vaccine'), __('Date')], rows: v.map(e => [[describe(e)[0], e.data.dose && __('dose {n}', { n: e.data.dose })].filter(Boolean).join(' · '), fmtShort(e.ts)]) } });
  }
  blocks.push({ gap: 14 }, { p: __('Made with Little Log on {date}.', { date: fmtDay(dkey(Date.now())) }), muted: true, size: 8 });
  const doc = await Pdf.make(blocks, { size: myRegion() === 'na' ? 'letter' : 'a4', rtl: I18n.rtl(), lang: I18n.lang() === I18n.PSEUDO ? 'en' : I18n.lang(),
    title: __("{name}'s book", { name }), header: name, footer: (n, total) => `Little Log · ${name} · ${__('Page {n} of {total}', { n, total })}` });
  return { ...doc, file: `little-log-${slugOf(name)}-book.pdf` };
}
async function makeBook(id) {
  toast(__('Making the PDF…'));
  try { const r = await bookPdf(id); download(r.file, r.bytes, 'application/pdf'); } catch (e) { toast(__('Could not make the PDF. Please try again.')); }
}
/** A child's whole record as a file (JSON), to hand over: their details and every entry this phone may see. */
function exportRecord(id) {
  const k = kidById(id), list = entriesOf(id).filter(e => !offDay(e.type) && (Sync.can('health') || !isPrivate(e.type))), iso = t => new Date(t).toISOString();
  const out = { app: 'Little Log', made: iso(Date.now()), child: { name: k.name || '', birth: k.birth || '', sex: k.sex || '', allergies: (k.allergies || []).map(a => ({ food: a.food, date: a.date || '', note: a.note || '' })) },
    entries: list.map(e => ({ type: e.type, at: iso(e.ts), ...(Number.isFinite(e.end) ? { until: iso(e.end) } : {}), data: e.data || {}, ...(e.note ? { note: e.note } : {}) })) };
  download(`little-log-${slugOf(kidName(k))}.json`, JSON.stringify(out, null, 1), 'application/json');
}

// ---------- The family calendar ----------
// What is coming up: exams, appointments, matches, lessons, school holidays, parties… Entries of their own (type plan, often in the
// future), kept off the day's list and the clock: the Day page shows the next week's, the Month tab marks their days and lists them,
// and a school holiday gives the routine's school week a break.
const PLAN_KINDS = [N_('Exam'), N_('Appointment'), N_('Match or game'), N_('Lesson'), N_('School holiday'), N_('Party'), N_('Other')];
const PLAN_ICON = { Exam: '📚', Appointment: '🏥', Lesson: '📖', 'School holiday': '☀' };
const planIcon = e => PLAN_ICON[e.data.kind] || '🗓';
/** The end of a plan: the end of its last day. */
const planEnd = e => (Number.isFinite(e.end) ? e.end : startOfDay(e.ts) + DAY);
/** The plans of some children that touch the time from `t0` to `t1`, soonest first. */
const plansIn = (ids, t0, t1) => { const set = new Set(ids); return db.events.filter(e => e.type === 'plan' && set.has(childOf(e)) && e.ts < t1 && planEnd(e) > t0).sort((a, b) => a.ts - b.ts); };
/** Whether a child has a school holiday on the day of `t`. */
const holidayOn = id => t => db.events.some(e => e.type === 'plan' && e.data.kind === 'School holiday' && childOf(e) === id && startOfDay(e.ts) <= t && planEnd(e) > t);
/** When a plan is: its day and time, or its first and last days. */
function planWhen(e) {
  const last = planEnd(e) - 1, d = t => new Date(t).toLocaleDateString(I18n.locale(), { weekday: 'short', day: 'numeric', month: 'short' });
  return startOfDay(last) === startOfDay(e.ts) ? [d(e.ts), !e.data.allday && fmtTime(e.ts)].filter(Boolean).join(' · ') : `${d(e.ts)} – ${d(last)}`;
}
/** Plans as rows: one row for the same plan made for several children, with their names. */
function planRows(list) {
  const seen = new Map();
  for (const e of list) { const key = [e.data.kind, e.data.title, e.ts, e.end].join('|'); if (seen.has(key)) seen.get(key).kids.push(childOf(e)); else seen.set(key, { e, kids: [childOf(e)] }); }
  return [...seen.values()].map(({ e, kids: ids }) => `<button class="card prow" data-plan="${e.id}"><span class="pi">${planIcon(e)}</span><span class="pb"><b>${esc(e.data.title || __(e.data.kind || 'Other'))}</b>
    <small>${esc([planWhen(e), e.data.title && __(e.data.kind || 'Other'), kids().length > 1 && andList(ids.map(id => kidName(kidById(id))))].filter(Boolean).join(' · '))}</small></span></button>`).join('');
}
/** The Day page: what is on the calendar in the next week, for the children on the page. */
function comingUp() {
  const t0 = startOfDay(Date.now()), list = plansIn(pageKids().map(k => k.id), t0, addDays(t0, 8));
  return list.length ? `<div class="upcoming"><h2>🗓 ${__h('Coming up')}</h2>${planRows(list)}</div>` : '';
}
/** The same plan made for several children (one entry each): those this person may change. */
const planKey = e => [e.data.kind, e.data.title, e.ts, e.end].join('|');
const planGroup = ev => db.events.filter(e => e.type === 'plan' && (e === ev || (planKey(e) === planKey(ev) && Sync.can('edit', e))));
/** Add or change something on the calendar: what kind, what, the day (and time, or the days), and for whom (changing a plan made for
    several children changes it for all of them, and a child unticked loses it). */
function openPlan(ev, pre = {}) {
  if (ev ? !Sync.can('edit', ev) : !Sync.can('add')) return toast(__("You don't have permission to do that"));
  const group = ev ? planGroup(ev) : [], mine = new Set(group.map(childOf));
  const d = (ev && ev.data) || {}, multi = kids().length > 1, here = dayKid() === 'all' ? kids()[0].id : dayKid(), ticked = id => (ev ? mine.has(id) : id === here);
  const hhmm = t => { const x = new Date(t); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  const close = popup(`<h3>🗓 ${ev ? __h('Edit {what}', { what: __('event') }) : __h('Add {what}', { what: __('event') })}</h3>
    ${multi ? `<label class="f">${__h('For (tick everyone it applies to)')}</label><div class="chips kidchips">${kids().map(k => `<label class="chip kidchip" style="--k:${k.color}"><input type="checkbox" name="pkid" value="${k.id}" ${ticked(k.id) ? 'checked' : ''}><span>${avatar(k)}${esc(kidName(k))}</span></label>`).join('')}</div>` : ''}
    <label class="f">${__h('What kind?')}</label>${radios('pkind', PLAN_KINDS, d.kind || 'Other')}
    <label class="f">${__h('What (optional)')}</label><input id="ptitle" type="text" maxlength="80" value="${esc(d.title || '')}" placeholder="${__h('e.g. Maths exam')}">
    <label class="f">${__h('Day')}</label><input id="pday" type="date" value="${dkey(ev ? ev.ts : pre.day || Date.now())}">
    <label class="f">${__h('Time (optional)')}</label><input id="ptime" type="time" value="${ev && !d.allday ? hhmm(ev.ts) : ''}">
    <label class="f">${__h('Last day (optional, for more than one day)')}</label><input id="puntil" type="date" value="${ev && startOfDay(planEnd(ev) - 1) !== startOfDay(ev.ts) ? dkey(planEnd(ev) - 1) : ''}">
    <label class="f">${__h('Note (optional)')}</label><textarea id="pnote" rows="2" maxlength="1000">${esc(ev ? ev.note : '')}</textarea>
    ${ev ? `<div class="row" style="margin-top:14px"><button class="btn" id="pcal">📅 ${__h('Add to phone calendar')}</button><button class="btn" id="pshare">✉️ ${__h('Share as a calendar file')}</button></div>` : ''}
    <div class="row" style="margin-top:16px">${ev && Sync.can('delete', ev) ? `<button class="btn d" id="pdel">${__h('Delete')}</button>` : ''}<button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="psave">${__h('Save')}</button></div>`);
  Icons.paint($('#sheet'));
  $('#psave').onclick = () => {
    const S = $('#sheet'), kind = (S.querySelector('[name=pkind]:checked') || {}).value || 'Other', title = $('#ptitle').value.trim().slice(0, 80), dv = $('#pday').value, tv = $('#ptime').value, uv = $('#puntil').value, isDay = v => /^\d{4}-\d\d-\d\d$/.test(v);
    if (!isDay(dv)) return toast(__('Choose the day'));
    const at = /^\d\d:\d\d$/.test(tv), start = new Date(`${dv}T${at ? tv : '00:00'}`).getTime(), last = isDay(uv) ? new Date(uv + 'T00:00').getTime() : 0;
    if (last && last < startOfDay(start)) return toast(__('The last day must be after the first'));
    const who = multi ? [...S.querySelectorAll('[name=pkid]:checked')].map(c => c.value).filter(id => kidById(id)) : [kids()[0].id];
    if (!who.length) return toast(__('Choose who this is for'));
    const data = { kind, ...(title ? { title } : {}), ...(at ? {} : { allday: true }) }, end = last > startOfDay(start) ? addDays(last, 1) : undefined;
    for (const e of group) if (!who.includes(childOf(e)) && Sync.can('delete', e)) removeEvent(e);   // (a child unticked)
    for (const id of who) {
      const old = group.find(e => childOf(e) === id), rec = old || { id: uid(), type: 'plan', by: Auth.id || undefined };
      Object.assign(rec, { ts: start, data: structuredClone(data), note: $('#pnote').value.trim(), updated: stamp(), child: id });
      if (end) rec.end = end; else delete rec.end;
      if (!old) db.events.push(rec);
    }
    save(); close(); render(); toast(__('Saved'));
  };
  if ($('#pdel')) $('#pdel').onclick = () => { if (confirm(__('Delete this entry?'))) { group.filter(e => Sync.can('delete', e)).forEach(removeEvent); save(); close(); render(); toast(__('Deleted')); } };
  if ($('#pcal')) $('#pcal').onclick = () => Cal.addToPhone(ev);
  if ($('#pshare')) $('#pshare').onclick = () => Cal.share([ev]);
}
/** Names to choose from for who drops off or picks up: the family's people, then the names used lately. */
const whoNames = () => [...new Set([...peopleNames(), ...db.events.filter(e => e.type === 'care' || e.type === 'pickup').sort((a, b) => b.ts - a.ts).slice(0, 40)
  .flatMap(e => [e.data.who, e.data.plan]).map(x => (x || '').trim()).filter(Boolean)])].slice(0, 8);
/** The places where someone of the family's own has the child: whose names to offer (the tree's grandparents and great-grandparents; the
    babysitters, caregivers and friends in the log), and how to ask. */
const CARE_WITH = {
  Grandparents: { tree: ['gp', 'ggp'], roles: ['family'], label: N_('Which grandparent? (optional)') },
  Babysitter: { roles: ['babysitter'], label: N_('Which babysitter? (optional)') },
  Childminder: { roles: ['caregiver'], label: N_('Which childminder? (optional)') },
  "Friend's house": { roles: ['friend'], label: N_('Whose house? (optional)') },
};
const careWithLabel = pl => (CARE_WITH[pl] ? CARE_WITH[pl].label : N_('Who looks after them there? (optional)'));
/** The names to offer for a place: from the family tree first, else the people of that role in the log; and whoever was named for the
    place before. */
const careNames = pl => {
  const c = CARE_WITH[pl] || {}, t = (Sync.st && Sync.st.tree) || db.meta.tree;
  const tree = c.tree && t && Array.isArray(t.parents) ? FamilyTree.walk(t).filter(w => c.tree.includes(w.kind) && !w.p.gone).map(w => w.p.call || w.p.name) : [];
  const log = tree.length && c.tree ? [] : people().filter(p => (c.roles || []).includes(p.role) && !p.is_you).map(p => p.display_name);
  const before = db.events.filter(e => e.type === 'care' && e.data.place === pl && e.data.with).sort((a, b) => b.ts - a.ts).map(e => e.data.with);
  return [...new Set([...tree, ...log, ...before].map(x => (x || '').trim()).filter(Boolean))].slice(0, 8);
};
/** Where a place is, as typed the last time a child was dropped off there (the log is shared, so every phone offers it). */
const lastLocation = (place, own) => { const e = db.events.filter(e => e.type === 'care' && e.data.location && !!e.data.own === !!own && e.data.place === place).sort((a, b) => b.ts - a.ts)[0]; return e ? e.data.location : ''; };
/** The pick-up after a drop-off (the banner's button): who picked the child up (the one planned, this phone's person, or another) and when. */
function openPickup(c) {
  if (!Sync.can('add')) return toast(__("You don't have permission to do that"));
  const k = kidById(childOf(c)), names = [...new Set([c.data.plan, myName(), ...whoNames()].map(x => (x || '').trim()).filter(Boolean))].slice(0, 6);
  const close = popup(`<h3>🎒 ${__h('{name} picked up', { name: kidName(k) })}</h3><p class="note">${__h('At {place} since {time}', { place: placeName(c.data), time: fmtTime(c.ts) })}</p>
    <label class="f">${__h('Who picked up?')}</label><div class="chips">${names.map((n, i) => chip('pwho', n, esc(n), i === 0, '', true)).join('')}${chip('pwho', '__other', __h('Someone else'), !names.length, '', true)}</div>
    <input id="pwhoOther" type="text" maxlength="60" placeholder="${__h('Name')}" aria-label="${__h('Name')}"${names.length ? ' hidden' : ''}>
    <label class="f">${__h('Time')}</label><input id="pts" type="datetime-local" value="${toLocalInput(Date.now())}">
    <div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="psave">${__h('Save')}</button></div>`);
  const S = $('#sheet'), pick = () => (S.querySelector('[name=pwho]:checked') || {}).value;
  S.onchange = () => { $('#pwhoOther').hidden = pick() !== '__other'; };
  $('#psave').onclick = () => {
    const v = pick(), who = (v === '__other' ? $('#pwhoOther').value : v || '').trim().slice(0, 60), ts = fromLocalInput($('#pts').value) || Date.now();
    if (ts <= c.ts) return toast(__('The pick-up must be after the drop-off'));
    db.events.push({ id: uid(), type: 'pickup', ts, data: { place: c.data.place, ...(c.data.own ? { own: true } : {}), ...(who ? { who } : {}) }, note: '', updated: stamp(), by: Auth.id || undefined, child: childOf(c) });
    save(); close(); render(); toast(__('Saved'));
  };
}
/** Each stay (a drop-off and its pick-up, or now) that overlaps the time from `t0` to `t1`, for one child or all. */
function stays(t0, t1, kid) {
  return viewOf().care.filter(e => (!kid || kid === 'all' || childOf(e) === kid) && e.ts < t1 && e.ts > t0 - STAY).map(e => {
    const out = pickupAfter(e), end = out ? out.ts : Math.min(Date.now(), e.ts + STAY);
    return { e, out, start: e.ts, end, open: !out && atCare(childOf(e)) === e };
  }).filter(s => s.end > t0);
}
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
  const G = { moment: GCOLOR[dk ? 'dark' : 'light'].moment, ...P[dk ? 'dark' : 'light'] }, v = GROUPS.map(g => [`--g-${g.id}`, G[g.id]]), paper = dk ? '#1d1b19' : '#ffffff';
  v.push(['--g-poo', G.poo], ['--g-meds', Kids.mix(G.health, paper, 0.45)], ['--g-snack', Kids.mix(G.feed, paper, 0.45)], ['--g-oops', Kids.mix(G.diaper, paper, 0.5)], ['--g-moment', G.moment], ['--g-bath', G.bath]);
  for (const t of Object.keys(TYPES)) { const c = colorOf(t, G); v.push([`--${t}`, c], [`--${t}-ink`, dk ? Kids.mix(c, '#ffffff', 0.3) : Kids.mix(c, INK, 0.25)]); }
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
  shownAt = Date.now(); schoolDays = null; freshView();
  document.querySelectorAll('#view details[data-grp]').forEach(d => { d.open ? openGroups.add(d.dataset.grp) : openGroups.delete(d.dataset.grp); });   // keep twirl-downs as the user left them
  if (tab !== 'guide') openGroups.forEach(g => { if (g.startsWith('pix')) openGroups.delete(g); });   // except the Guide's pictures: hidden again next time
  const multi = kids().length > 1, vk = kidById(dayKid()), single = kids()[0];
  theme();
  $('#title').textContent = dayKid() === 'all' ? __('Everyone') : (vk && vk.name ? __("{name}'s Log", { name: vk.name }) : (multi ? __("{name}'s Log", { name: kidName(vk) }) : 'Little Log'));
  I18n.paint();   // the tab names and other text in the page shell
  fitTabs();
  $('#av').innerHTML = vk ? avatar(vk) : ''; $('#av').hidden = !vk;
  const g = Acct.gate();
  $('#view').dataset.page = g ? 'signin' : tab;   // (wide screens lay each page out in its own way: style.css)
  document.body.classList.toggle('gated', !!g); gateTour = g ? g.tour || null : null; $('#helpBtn').hidden = !!g && !gateTour;
  if (g) {
    $('#sleepBanner').hidden = true; $('#syncLine').textContent = ''; $('#kidBar').hidden = true; $('#av').hidden = true; $('#famSw').hidden = true; $('#view').innerHTML = (g.plain ? '' : Acct.heroHtml()) + g.html + langMini(); g.bind(); Icons.paint($('#view'));
    $('#langMini').onchange = e => setLanguage(e.target.value); lastScreen = 'signin';
    if (gateTour) autoTour();   // (the first screen's tour starts by itself the first time)
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
  if (tab === 'health' && !Sync.can('health')) tab = recordFrom;   // (access to health notes was taken away)
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === (tab === 'health' ? recordFrom : tab)));
  // asleep now, and at daycare or school now (with who picks up, and when)
  const sleepers = kids().map(k => [k, activeSleep(k.id)]).filter(x => x[1]), away = kids().map(k => [k, atCare(k.id)]).filter(x => x[1]), bn = $('#sleepBanner');
  const pumping = db.events.filter(e => e.type === 'pump' && e.end === null), awake = kids().map(k => [k, awakeSince(k)]).filter(x => x[1]);
  bn.hidden = !sleepers.length && !away.length && !pumping.length && !awake.length;
  if (!bn.hidden) {
    bn.innerHTML = sleepers.map(([k, s], i) => {
      const w = pauseOf(s), who = multi ? `<b>${esc(kidName(k))}</b> ` : '', t = { time: fmtTime(s.ts), long: fmtDur((Date.now() - s.ts) / MIN) };
      if (w) return `<div class="brow paused"><span>🌙 ${who}${__h('Up since {time} ({long}) · asleep since {start}', { time: fmtTime(w.ts), long: fmtDur((Date.now() - w.ts) / MIN), start: fmtTime(s.ts) })}${w.data.why ? `<small>${__h(w.data.why)}</small>` : ''}</span><span class="acts"><button ${i ? '' : 'id="asleepBtn"'} data-resume="${w.id}">${__h('Asleep again')}</button><button class="ghost" ${i ? '' : 'id="upBtn"'} data-upforgood="${s.id}">${__h('Up for good')}</button></span></div>`;
      return `<div class="brow"><span>😴 ${who}${isNap(s) ? __h('Napping since {time} ({long})', t) : __h('Asleep since {time} ({long})', t)}</span><button ${i ? '' : 'id="wakeBtn"'} data-wake="${s.id}">${__h('Woke up')}</button></div>`;
    }).join('')
      + away.map(([k, c]) => `<div class="brow care"><span>🏫 ${multi ? `<b>${esc(kidName(k))}</b> ` : ''}${__h('At {place} since {time}', { place: placeName(c.data), time: fmtTime(c.ts) })}${careLine(c.data) ? `<small>${esc(careLine(c.data))}</small>` : ''}</span>${Sync.can('add') ? `<button data-pickup="${c.id}">${__h('Picked up')}</button>` : ''}</div>`).join('')
      + pumping.map(e => `<div class="brow pump"><span>🍶 ${multi ? `<b>${esc(kidName(kidById(childOf(e))))}</b> ` : ''}${__h('Pumping since {time} ({long})', { time: fmtTime(e.ts), long: fmtDur((Date.now() - e.ts) / MIN) })}</span>${Sync.can('edit', e) ? `<button class="btn" data-pumpdone="${e.id}">${__h('Done')}</button>` : ''}</div>`).join('')
      + awake.map(([k, a]) => `<div class="brow awake"><span>☀️ ${multi ? `<b>${esc(kidName(k))}</b> ` : ''}${a.hint ? __h('Awake since {time} ({long}) · usually ready for a nap by about {at}', { time: fmtTime(a.since), long: fmtDur(a.mins), at: fmtTime(a.by) }) : __h('Awake since {time} ({long})', { time: fmtTime(a.since), long: fmtDur(a.mins) })}</span></div>`).join('');
    bn.querySelectorAll('[data-wake]').forEach(b => b.onclick = () => { const s = db.events.find(x => x.id === b.dataset.wake); if (s) askWoke(s); });
    bn.querySelectorAll('[data-resume]').forEach(b => b.onclick = () => { const w = db.events.find(x => x.id === b.dataset.resume); if (!w) return; if (!Sync.can('edit', w)) return toast(__("You can't change this entry")); resumeSleep(w); save(); render(); toast(__('Asleep again – the sleep goes on')); });
    bn.querySelectorAll('[data-upforgood]').forEach(b => b.onclick = () => { const s = db.events.find(x => x.id === b.dataset.upforgood); if (!s) return; if (!Sync.can('edit', s)) return toast(__("You can't change this entry")); const w = pauseOf(s); endSleep(s, w ? w.ts : Date.now()); save(); render(); toast(__('Sleep saved')); });   // (up since the wake-up: the sleep ended then)
    bn.querySelectorAll('[data-pumpdone]').forEach(b => b.onclick = () => { const e = db.events.find(x => x.id === b.dataset.pumpdone); if (!e) return; e.end = Date.now(); e.data = { ...e.data, min: Math.max(1, Math.round((e.end - e.ts) / MIN)) }; e.updated = stamp(); save(); openSheet(null, e); });
    bn.querySelectorAll('[data-pickup]').forEach(b => b.onclick = () => { const c = db.events.find(x => x.id === b.dataset.pickup); if (c) openPickup(c); });
    Icons.paint(bn);
  }
  $('#view').innerHTML = { day: dayView, routine: routineView, month: monthView, stats: statsView, guide: guideView, family: Acct.familyHtml, more: moreView, health: recordView }[tab]();
  bind(); Icons.paint($('#view')); Acct.updateBadge();
  if (!solidsCheck()) { milestoneCheck(); graduationCheck(); } autoTour();
  Notify.sync(db.events);
}

/** Whoever is feeding the baby sees their allergies at the top of the day. */
function allergyLine() {
  const ks = (dayKid() === 'all' ? kids() : [kidById(dayKid())]).filter(k => k && (k.allergies || []).length);
  return ks.length ? `<p class="note allergyline">⚠️ ${__h('Allergies: {foods}', { foods: ks.map(k => (kids().length > 1 ? kidName(k) + ': ' : '') + k.allergies.map(a => allergyText(a)).join(', ')).join(' · ') })}</p>` : '';
}
function dayView() {
  const ek = dayKid() !== 'all' ? kidById(dayKid()) : null; if (ek && stageOf(ek) === 'expecting') return expectingView(ek);   // (before the birth: a page of its own)
  const evs = eventsOnDay(viewDay), isToday = viewDay === startOfDay(Date.now()), twelve = face12(), trip = tripOn(viewDay), TM = trip && Travel.MEANS[Travel.meansOf(trip)];
  const sp = clockSpan(viewDay), shown = evs.filter(e => e.ts >= sp.start && e.ts < sp.start + sp.len);
  const q = quad == null ? null : quadInfo(quad, viewDay), inQ = q ? evs.filter(e => e.ts >= q.start && e.ts < q.end) : null;
  const seg = (attr, opts, cur, label) => `<div class="seg mini" role="group" aria-label="${__h(label)}">${opts.map(([v, l]) => `<button data-${attr}="${v}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}">${__h(l)}</button>`).join('')}</div>`;
  return `${trip ? tripCard(trip) : ''}
  <div class="datenav"><button data-nav="-1" aria-label="${__h('Previous day')}">‹</button>
    <div class="d">${isToday ? __h('Today') : esc(fmtDate(viewDay))}<small>${isToday ? esc(fmtDate(viewDay)) : ''}${esc(ageText(viewDay))}</small></div>
    <button data-nav="1" aria-label="${__h('Next day')}" ${isToday ? 'disabled' : ''}>›</button></div>
  ${allergyLine()}
  ${isToday ? stageNote() + ageNote() + grownCard() + backupNudge() : ''}
  ${momentCards(viewDay)}
  ${isToday ? comingUp() + stashHtml() : ''}
  ${trip && isToday ? travelQuick() : quickButtons()}
  <div class="clockwrap" style="${GROUPS.map(g => `--g-${g.id}:${(trip ? Travel.PALETTE : GCOLOR)[dark() ? 'dark' : 'light'][g.id]}`).join(';')};--g-bath:${GCOLOR[dark() ? 'dark' : 'light'].bath};--paper:${dark() ? '#3a342d' : '#fffdf8'};--trip:${Travel.ACCENT[dark() ? 'dark' : 'light']}">${clockSvg(shown, viewDay)}
    <div class="clockctl">${seg('face', [['24', N_('24 h')], ['12', N_('12 h')]], twelve ? '12' : '24', N_('Clock face'))}${twelve ? seg('half', [['0', N_('AM')], ['1', N_('PM')]], String(half), N_('Half of the day')) : ''}${numsSeg()}${trip ? `<span class="artbtn tripart">${TM.icon} ${__h(Art.byId(TM.art).name)}</span>` : `<button class="artbtn" data-art>🎨 ${__h(Art.byId(artOf()).name)}</button>`}</div>
    ${clockLegend(shown)}
    <p class="note hint">${twelve ? (half ? __h('Showing noon to midnight; switch AM and PM for the other half of the day.') : __h('Showing midnight to noon; switch AM and PM for the other half of the day.')) : __h('Midnight is at the top, noon at the bottom.')} ${__h('Tap a dot to see an entry (change it in the list below), or a quarter of the dial for just those hours.')}</p></div>
  ${q ? `<div class="card quadlist"><div class="qhead"><span><b>${esc(q.label)}</b> <small>${esc(q.range)} · ${__hn('{n} entry', '{n} entries', inQ.length)}</small></span><button class="btn" data-quadclear>${__h('Whole day')}</button></div>
      ${inQ.length ? inQ.map(evRow).join('') : `<div class="empty">${__h('Nothing in these hours.')}</div>`}</div>`
    : (evs.length ? `<h2>${__h('Details')}</h2>${groupedList(evs)}` : `<div class="empty">${__h('Nothing logged yet.')}${Sync.can('add') ? '<br>' + __h('Tap a button above to add an entry.') : ''}</div>`)}
  ${momentButton()}
  ${evs.length ? `<button class="btn sharebtn" id="shareDay">📤 ${isToday ? __h('Share today so far') : __h('Share this day')}</button>` : ''}
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
  // is a picture drawn once and reused. The dial is a white face with a black rim by day; in dark mode it goes dark, with pale lines and
  // the night palette for the entries, so it is easy on the eyes at 3 in the morning.
  const trip = tab === 'day' ? tripOn(day) : null, th = Art.byId(trip ? Travel.MEANS[Travel.meansOf(trip)].art : artOf()), dk = dark(), F = Art.FRAME, K = F.k, PW = Art.W * K, PH = Art.H * K;
  const C = { x: F.x + Art.DIAL.x * K, y: F.y + Art.DIAL.y * K }, RD = Art.DIAL.r * K, rr = r => r * K;
  const RR = { sleep: rr(90), feed: rr(78), diaper: rr(66), vomit: rr(54), play: rr(42), health: rr(30) };
  const symbols = db.meta.dots !== 'plain';   // (More → Appearance and clock art: a symbol of the entry at the end of each ray, or a plain dot)
  const sp = clockSpan(day), twelve = face12(), frac = t => (t - sp.start) / sp.len, ang = fr => fr * 2 * Math.PI - Math.PI / 2, P = (a, r) => [C.x + r * Math.cos(a), C.y + r * Math.sin(a)];
  const f1 = n => n.toFixed(1), xy = (a, r) => P(a, r).map(f1).join(' ');
  // a poo's ray is a squiggle: a wave along the ray from the centre to its dot (five waves, drawn as a fine polyline)
  // a bath's ray is a water ripple: two gentle waves side by side along the ray (three waves each, as fine polylines)
  const rippled = (a, r0, r1) => { const n = 24, amp = rr(1.8), gap = rr(1.5), ux = Math.cos(a), uy = Math.sin(a); let d = ''; for (const s of [-1, 1]) for (let i = 0; i <= n; i++) { const t = i / n, r = r0 + (r1 - r0) * t, o = amp * Math.sin(t * 6 * Math.PI) + s * gap; d += (i ? 'L' : 'M') + f1(C.x + r * ux - o * uy) + ' ' + f1(C.y + r * uy + o * ux); } return d; };
  const wavy = (a, r0, r1) => { const n = 30, amp = rr(2.2), ux = Math.cos(a), uy = Math.sin(a); let d = ''; for (let i = 0; i <= n; i++) { const t = i / n, r = r0 + (r1 - r0) * t, o = amp * Math.sin(t * 10 * Math.PI); d += (i ? 'L' : 'M') + f1(C.x + r * ux - o * uy) + ' ' + f1(C.y + r * uy + o * ux); } return d; };
  const arc = (a0, a1, r) => `M${xy(a0, r)}A${f1(r)} ${f1(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${xy(a1, r)}`;
  const ink = dk ? '#e8dfcf' : '#1f1b16', gilt = '#b8862b', gold = dk ? '#8f7c55' : '#c8aa6e', paper = dk ? '#2a2622' : '#fffdf8';
  const pic = (cls, attr, u) => `<image class="${cls}" ${attr} preserveAspectRatio="none"${u ? ` href="${u}" xlink:href="${u}"` : ''}/>`;
  const fill = (sel, p) => p.then(u => document.querySelectorAll(sel).forEach(im => { im.setAttribute('href', u); im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', u); }));
  const artUrl = Art.peek(th.id, 2.5, dk);   // (in dark mode, the painting's night-time scene)
  if (!artUrl) fill(`.clock image.art[data-theme="${th.id}"][data-night="${dk ? 1 : 0}"]`, Art.url(th.id, 2.5, dk));
  const box = (x, y, w, h, r = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
  const frame = `<g class="frame" fill="none" stroke="${gold}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M101 36V17Q101 12 106 12H234Q239 12 239 17V36"/><path d="M21 34V36M319 34V36"/><circle cx="21" cy="31" r="3"/><circle cx="319" cy="31" r="3"/>
    ${box(9, 36, 322, 12)}${box(9, 406, 322, 12)}${box(14, 48, 14, 358, 1.5)}${box(312, 48, 14, 358, 1.5)}<path d="M14 418Q21 427 28 418M312 418Q319 427 326 418"/>
    <path d="M14 42H326M14 412H326M21 52V402M319 52V402" stroke-width=".6" stroke-opacity=".75"/></g>`;
  // a chosen quarter: its name, and under it the hours it covers, written in the carrying handle at the top (squeezed to the handle's
  // width once drawn, in a language whose words are wider: bind())
  const qh = quad == null ? null : quadInfo(quad, day);
  const handle = qh ? `<text class="qname" x="170" y="21" text-anchor="middle" fill="${ink}">${esc(qh.label)}</text><text class="qtime" x="170" y="32" text-anchor="middle" fill="${ink}">${esc(qh.range)}</text>` : '';
  const panel = `<clipPath id="cc-panel"><rect x="${F.x}" y="${F.y}" width="${f1(PW)}" height="${f1(PH)}" rx="2.5"/></clipPath>
    <g clip-path="url(#cc-panel)"><rect x="${F.x}" y="${F.y}" width="${f1(PW)}" height="${f1(PH)}" fill="${dk ? '#1a2240' : th.base}"/>${pic('art', `data-theme="${th.id}" data-night="${dk ? 1 : 0}" x="${F.x}" y="${F.y}" width="${f1(PW)}" height="${f1(PH)}"`, artUrl)}</g>
    <rect x="${F.x}" y="${F.y}" width="${f1(PW)}" height="${f1(PH)}" rx="2.5" fill="none" stroke="${gold}" stroke-width=".8"/>`;
  let dial = `<circle class="face" cx="${C.x}" cy="${f1(C.y)}" r="${f1(RD)}" fill="${paper}"/><circle class="rim" cx="${C.x}" cy="${f1(C.y)}" r="${f1(RD)}" fill="none" stroke="${ink}" stroke-width="1.6"/>`;
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
  // the day of the week, in a small window above the centre like a watch's day dial (the phone's language)
  dial += `<text class="wday" x="${C.x}" y="${f1(C.y - rr(14))}" text-anchor="middle" fill="${ink}">${esc(new Date(day).toLocaleDateString(I18n.locale(), { weekday: 'short' }))}</text>`;
  // quarters (tap targets), washed in the page colour when chosen
  let quads = '';
  for (let i = 0; i < 4; i++) { const a0 = ang(i / 4), a1 = ang((i + 1) / 4); quads += `<path class="qw ${quad === i ? 'on' : ''}" data-quad="${i}" role="button" tabindex="0" aria-pressed="${quad === i}" aria-label="${esc(quadInfo(i, day).label + ', ' + quadInfo(i, day).range)}" d="M${C.x} ${f1(C.y)}L${xy(a0, RD)}A${f1(RD)} ${f1(RD)} 0 0 1 ${xy(a1, RD)}Z"/>`; }
  let data = RING.map(g => `<circle class="ring" cx="${C.x}" cy="${f1(C.y)}" r="${f1(RR[g])}"/>`).join('');
  for (const e of scoped()) if (e.type === 'sleep') {   // every sleep that overlaps what the dial shows, even one that began before it
    const s0 = Math.max(0, frac(e.ts)), s1 = Math.min(1, frac(e.end || Date.now()));
    if (s1 > s0) data += `<path class="sarc${isNap(e) ? ' nap' : ''}" d="${arc(ang(s0), ang(Math.max(s1, s0 + 0.004)), RR.sleep)}"/>`;   // (a nap: dashed)
  }
  // the journey: time on the move lights up the outer (railway) track of the dial, in the travel colour
  if (trip) for (const l of Travel.legs(db.events, sp.start, sp.start + sp.len, Date.now())) {
    const s0 = Math.max(0, frac(l.ts)), s1 = Math.min(1, frac(Number.isFinite(l.end) ? l.end : Date.now()));
    if (s1 > s0) data += `<path class="leg" d="${arc(ang(s0), ang(Math.max(s1, s0 + 0.004)), rr(115))}"/>`;
  }
  // a stay at daycare or school (drop-off to pick-up, or until now) lights up the same outer track, in its own colour
  if (!trip) for (const st of stays(sp.start, sp.start + sp.len, dayKid())) {
    const s0 = Math.max(0, frac(st.start)), s1 = Math.min(1, frac(st.end));
    if (s1 > s0) data += `<path class="carc" d="${arc(ang(s0), ang(Math.max(s1, s0 + 0.004)), rr(115))}"/>`;
  }
  const all = dayKid() === 'all';
  for (const e of evs) {
    // (a drop-off and a pick-up are dots on the outer track, without a ray)
    const g = groupOf(e.type).id, a = ang(frac(e.ts)), pin = g === 'care', r = pin ? rr(115) : RR[g], [x, y] = P(a, r), [d] = describe(e), k = all ? kidById(childOf(e)) : null;
    const approx = !!(e.data && e.data.approx), when = approx ? __('about {time}', { time: fmtTime(e.ts) }) : fmtTime(e.ts);
    // the kinds of line: a nap and a snack dashed, a poo a squiggle, a bath a water ripple, an estimated time dotted; a wake-up that was
    // a pause in a sleep (back to sleep soon) dashed too, its moon as well
    const snack = e.type === 'meal' && !!(e.data && e.data.meal === 'Snack'), poo = (e.type === 'diaper' || e.type === 'potty') && !!(e.data && e.data.poo), bath = isBath(e), pause = isPause(e);
    // the dot at the end of the ray is a small paper disc with a symbol of the entry on it: a bottle, a spoon for solids, a drop, a poo, a moon…
    const sym = Icons.nameOf(bath ? TYPES.bath.icon : e.type === 'feed' && e.data && e.data.kind === 'solids' ? '🥄' : poo ? '💩' : TYPES[e.type].icon) || 'star';
    data += `<g class="ray${approx ? ' approx' : ''}${e.type === 'sleep' && isNap(e) ? ' nap' : ''}${snack ? ' snack' : ''}${poo ? ' poo' : ''}${bath ? ' bath' : ''}${pause ? ' pause' : ''}" data-info="${e.id}" role="button" tabindex="0" aria-label="${esc(when + ' ' + __(tLabel(bath ? 'bath' : e.type)) + ': ' + d + (k ? ', ' + kidName(k) : ''))}" style="--c:var(--g-${bath ? 'bath' : g})">
      <title>${esc(when + ' · ' + d + (k ? ' · ' + kidName(k) : ''))}</title>
      ${pin ? '' : `<path d="${poo ? wavy(a, rr(17), r - rr(5)) : bath ? rippled(a, rr(17), r - rr(5)) : `M${xy(a, rr(17))}L${xy(a, r - rr(5))}`}"/><path class="hitl" d="M${xy(a, rr(20))}L${xy(a, r)}"/>`}<circle class="hit" cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr(10))}"/><circle class="dot${symbols ? '' : ' plain'}" cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr(symbols ? 7.3 : 4.6))}"${k ? ` style="stroke:${k.color}"` : ''}/>${symbols ? `<g class="sym" transform="translate(${f1(x)} ${f1(y)})"><g class="mini" data-n="${sym}"><g transform="scale(${(rr(11.8) / 32).toFixed(3)}) translate(-16 -16)">${Icons.mini(sym)}</g></g></g>` : ''}</g>`;
  }
  // blued-steel hands at the current time, when it is on the dial: one 24-hour hand, or an hour and a minute hand; then the centre boss
  let hand = '';
  const steel = dk ? '#9fb1e6' : '#24356b', hy = (L, k) => f1(C.y - L * k);
  const spade = (kind, deg, L) => `<path class="hand" data-hand="${kind}" transform="rotate(${deg.toFixed(2)} ${C.x} ${f1(C.y)})" fill="${steel}" d="M${C.x - 1.2} ${f1(C.y + 14)}L${C.x - 1.2} ${hy(L, 0.727)}C${C.x - 6.5} ${hy(L, 0.747)} ${C.x - 7.5} ${hy(L, 0.808)} ${C.x - 4.8} ${hy(L, 0.848)}C${C.x - 2.6} ${hy(L, 0.879)} ${C.x - 0.8} ${hy(L, 0.909)} ${C.x} ${hy(L, 1)}C${C.x + 0.8} ${hy(L, 0.909)} ${C.x + 2.6} ${hy(L, 0.879)} ${C.x + 4.8} ${hy(L, 0.848)}C${C.x + 7.5} ${hy(L, 0.808)} ${C.x + 6.5} ${hy(L, 0.747)} ${C.x + 1.2} ${hy(L, 0.727)}L${C.x + 1.2} ${f1(C.y + 14)}Z"/>`;
  const needle = (deg, L) => `<path class="hand" data-hand="m" transform="rotate(${deg.toFixed(2)} ${C.x} ${f1(C.y)})" fill="${steel}" d="M${C.x - 0.9} ${f1(C.y + 16)}L${C.x - 0.9} ${hy(L, 0.86)}L${C.x - 3.2} ${hy(L, 0.92)}L${C.x} ${hy(L, 1)}L${C.x + 3.2} ${hy(L, 0.92)}L${C.x + 0.9} ${hy(L, 0.86)}L${C.x + 0.9} ${f1(C.y + 16)}Z"/>`;
  const now = Date.now();
  if (now >= sp.start && now < sp.start + sp.len) {
    const h = handAngles(now, sp);
    hand = twelve ? needle(h.m, rr(106)) + spade('h', h.h, rr(70)) : spade('d', h.d, rr(99));
  }
  const boss = `<circle cx="${C.x}" cy="${f1(C.y)}" r="5.2" fill="${paper}" stroke="${ink}" stroke-width="1.2"/><circle cx="${C.x}" cy="${f1(C.y)}" r="1.6" fill="${ink}"/>`;
  const summary = GROUPS.map(gr => [gLabel(gr), evs.filter(e => gr.types.includes(e.type)).length]).filter(x => x[1]).map(x => __('{group}: {n}', { group: __(x[0]), n: x[1] })).join(', ');
  const what = twelve ? (half ? __('12-hour clock, noon to midnight') : __('12-hour clock, midnight to noon')) : __('24-hour clock of the day, midnight at the top and noon at the bottom');
  return `<svg class="clock" viewBox="0 0 ${F.W} ${F.H}" data-cx="${C.x}" data-cy="${f1(C.y)}" data-painting="${th.id}" data-dial="${twelve ? 12 : 24}" role="group" aria-label="${esc(summary ? __('{clock}: {entries}', { clock: what, entries: summary }) : __('{clock}, no entries', { clock: what }))}">
    <g aria-hidden="true">${frame}${panel}${dial}${handle}</g>${quads}<g class="data">${data}</g><g class="hands" aria-hidden="true">${hand}${boss}</g></svg>`;
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
/** The groups that belong on this page: those with entries in `evs`, and those with something to log for the children's ages (daycare
    and school only once a child may go; no diapers or potty on a teenager's page). The Everyone page keeps them all while a younger
    child needs them. */
function groupsOnPage(evs) {
  const { shown, more } = dayButtons(), can = new Set([...shown, ...more]);
  return GROUPS.filter(g => evs.some(e => g.types.includes(e.type)) || g.types.some(t => can.has(t)));
}
function clockLegend(evs) {
  return `<div class="clegend">${groupsOnPage(evs).map(g => { const n = evs.filter(e => g.types.includes(e.type)).length;
    return `<span class="${n ? '' : 'zero'}"><i style="--c:var(--g-${g.id})">${db.meta.dots !== 'plain' ? g.icon : ''}</i>${__h(gLabel(g))} <b>${n}</b></span>`; }).join('')}</div>`;
}
/** One twirl-down per group (pee and poo together, sleep and wake-ups together…), each with a one-line summary. */
const openGroups = new Set();
function groupSummary(g, list) {
  const n = list.length;
  switch (g.id) {
    case 'feed': {   // (milk feeds, and meals counted apart: a baby's solid food, an older child's meals)
      const milk = list.filter(e => e.type === 'feed' && e.data.kind !== 'solids'), ml = milk.reduce((a, e) => a + (+e.data.ml || 0), 0), solids = list.filter(e => e.type === 'feed' && e.data.kind === 'solids').length, meals = n - milk.length - solids;
      const drinks = milk.length && (allFrom('toddler') ? `${__('Milk')} ×${milk.length}` : __n('{n} feed', '{n} feeds', milk.length));
      return [meals && __n('{n} meal', '{n} meals', meals), drinks && drinks + (ml ? ' · ' + fmtVol(ml) : ''), solids && `${__('Solids')} ×${solids}`].filter(Boolean).join(' · ');
    }
    case 'diaper': {   // (diapers, and the potty)
      const dia = list.filter(e => e.type === 'diaper'), pot = list.filter(e => e.type === 'potty'), oops = pot.filter(e => e.data.accident).length;
      return [dia.length && `${__n('{n} diaper', '{n} diapers', dia.length)} · ${__('{pee} pee, {poo} poo', { pee: dia.filter(e => e.data.pee).length, poo: dia.filter(e => e.data.poo).length })}`,
        pot.length && [__n('{n} on the potty', '{n} on the potty', pot.filter(e => !e.data.accident && (e.data.pee || e.data.poo)).length), oops && __n('{n} accident', '{n} accidents', oops)].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
    }
    case 'sleep': { const sl = list.filter(e => e.type === 'sleep'), w = list.length - sl.length, m = sl.reduce((a, e) => a + ((e.end || Date.now()) - e.ts) / MIN, 0); return [sl.length && `${__n('{n} sleep', '{n} sleeps', sl.length)} · ${fmtDur(m)}`, w && __n('{n} wake-up', '{n} wake-ups', w)].filter(Boolean).join(' · '); }
    case 'play': {   // (and homework)
      const pl = list.filter(e => e.type === 'play'), st = list.filter(e => e.type === 'study'), m = xs => xs.reduce((a, e) => a + (+e.data.min || 0), 0);
      return [pl.length && __n('{n} time', '{n} times', pl.length) + (m(pl) ? ` · ${fmtDur(m(pl))}` : ''), st.length && `${__('Homework')} ${m(st) ? fmtDur(m(st)) : '×' + st.length}`].filter(Boolean).join(' · ');
    }
    case 'care':   // (each stay: where, from when to when)
      return list.filter(e => e.type === 'care').map(e => { const out = pickupAfter(e); return `${placeName(e.data)} ${fmtTime(e.ts)}${out ? ' – ' + fmtTime(out.ts) : ''}`; }).join(' · ') || __n('{n} pick-up', '{n} pick-ups', n);
    case 'health': {   // (and what went in the health record: vaccines, doctor visits, measurements)
      const h = list.filter(e => e.type === 'health').length, m = list.filter(e => e.type === 'med').length, r = n - h - m;
      return [h && __n('{n} note', '{n} notes', h), m && __n('{n} medicine', '{n} medicines', m), r && __n('{n} for the health record', '{n} for the health record', r)].filter(Boolean).join(' · ');
    }
  }
  return __n('{n} time', '{n} times', n);
}
function groupedList(evs, key = 'd') {
  return GROUPS.map(g => {
    const list = evs.filter(e => g.types.includes(e.type)); if (!list.length) return '';
    const id = key + g.id, warn = list.some(isWarn);
    return `<details class="grp ${warn ? 'alert' : ''}" data-grp="${id}" ${openGroups.has(id) ? 'open' : ''} style="--c:var(--g-${g.id})"><summary><span class="gi">${g.icon}</span><span class="gt"><b>${__h(gLabel(g))}</b><small>${esc(groupSummary(g, list))}</small></span><span class="chev" aria-hidden="true">›</span></summary>
      <div class="grows">${list.map(evRow).join('')}</div></details>`;
  }).join('');
}
/** Counts for one day, as small tiles. */
function dayCounts(evs, day) {
  const of = t => evs.filter(e => e.type === t), feeds = of('feed').filter(e => e.data.kind !== 'solids'), ml = feeds.reduce((a, e) => a + (+e.data.ml || 0), 0), dia = of('diaper');
  const sleeps = of('sleep'), mins = sleeps.reduce((a, e) => a + (Math.min(e.end || Date.now(), day + DAY) - Math.max(e.ts, day)) / MIN, 0), play = of('play').reduce((a, e) => a + (+e.data.min || 0), 0);
  const pot = of('potty'), oops = pot.filter(e => e.data.accident).length, older = allFrom('toddler'), study = of('study').reduce((a, e) => a + (+e.data.min || 0), 0);
  const careMin = stays(day, day + DAY, dayKid()).reduce((a, st) => a + (Math.min(st.end, day + DAY) - Math.max(st.start, day)) / MIN, 0);   // (time at daycare or school that day)
  const T = { feeds: ['feed', '🍼', older ? N_('Milk') : N_('Feeds'), feeds.length, ml ? fmtVol(ml) : ''], pee: ['diaper', '💧', N_('Pee'), dia.filter(e => e.data.pee).length, ''], poo: ['poo', '💩', N_('Poo'), dia.filter(e => e.data.poo).length, ''],
    sleep: ['sleep', '😴', N_('Sleep'), sleeps.length ? fmtDur(mins) : 0, sleeps.length ? __n('{n} sleep', '{n} sleeps', sleeps.length) : ''], wakes: ['sleep', '🌙', N_('Wake-ups'), of('wake').length, ''],
    solids: ['feed', '🥄', N_('Solids'), of('feed').length - feeds.length, ''], meals: ['feed', '🍽', N_('Meals'), of('meal').length, ''],
    potty: ['diaper', '🚽', N_('Potty'), pot.filter(e => !e.data.accident && (e.data.pee || e.data.poo)).length, oops ? __n('{n} accident', '{n} accidents', oops) : ''], vomit: ['vomit', '🤮', N_('Vomit'), of('vomit').length, ''],
    play: ['play', '🧸', N_('Play'), play ? fmtDur(play) : of('play').length, ''], health: ['health', '🩺', N_('Health notes'), of('health').length, ''], meds: ['health', '💊', N_('Medicines'), of('med').length, ''],
    record: ['health', '📋', N_('Health record'), of('vaccine').length + of('visit').length + of('growth').length, ''],
    care: ['care', '🏫', N_('Daycare & school'), careMin ? fmtDur(careMin) : 0, ''], study: ['play', '📚', N_('Homework'), study ? fmtDur(study) : of('study').length, ''] };
  // a baby's day starts with feeds and diapers; an older child's with meals and sleep (the rest show when there are any)
  const order = older ? ['meals', 'sleep', 'care', 'feeds', 'potty', 'pee', 'poo', 'wakes', 'solids', 'vomit', 'play', 'study', 'health', 'meds', 'record'] : ['feeds', 'pee', 'poo', 'sleep', 'wakes', 'care', 'solids', 'meals', 'potty', 'vomit', 'play', 'study', 'health', 'meds', 'record'];
  const tiles = order.map(k => T[k]).filter((t, i) => i < (older ? 2 : 4) || t[3] || t[4]);
  return `<div class="tiles">${tiles.map(([g, ic, l, v, sub]) => `<div class="tile" style="--c:var(--g-${g})"><span class="tv">${ic} <b>${esc(v)}</b></span><span class="tl">${__h(l)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>`).join('')}</div>`;
}
const kidTag = e => { if (dayKid() !== 'all') return ''; const k = kidById(childOf(e)); return `<span class="ktag" style="--k:${k.color}">${avatar(k)}${esc(kidName(k))}</span>`; };
/** How many entries of each type the children on the page had in the last two weeks. */
function usedLately() {
  const ids = new Set(pageKids().map(k => k.id)), since = Date.now() - 14 * DAY, n = {};
  for (const e of db.events) if (e.ts > since && ids.has(childOf(e))) { const t = isBath(e) ? 'bath' : e.type; n[t] = (n[t] || 0) + 1; }
  return n;
}
/** The Day page's buttons for the children's ages (stages.js), with what the family has been logging lately moved up: { shown, more }. */
const dayButtons = () => Stages.buttons(pageKids().map(k => stageOf(k)), usedLately(), t => Sync.can('health') || !isPrivate(t));
function quickButtons() {
  if (!Sync.can('add')) return '';
  const { shown, more } = dayButtons();
  return `<div class="quick${shown.length + (more.length ? 1 : 0) === 9 ? ' nine' : ''}" style="margin-bottom:10px">${shown.map(k => `<button data-add="${k}" style="--cw:${Kids.rgba(TYPES[k].color, 0.3)}"><b>${TYPES[k].icon}</b>${__h(tLabel(k))}</button>`).join('')}${more.length ? `<button data-addmore="${more.join(' ')}" aria-label="${__h('More to log')}"><b>⚙</b>${__h('More')}</button>` : ''}</div>`;
}
/** "added by Dad" – only when the log is shared and the person is known. */
const byLine = e => { const n = Sync.linked() && e.by && e.by !== Auth.id ? Sync.nameOf(e.by) : ''; return n ? `<small>${__h('added by {name}', { name: n })}</small>` : ''; };
const urgentFor = e => (Stages.from(stageOf(kidById(childOf(e)), e.ts), 'toddler') ? KID_URGENT : URGENT);
const isWarn = e => (e.type === 'health' && (e.data.symptoms || []).some(s => urgentFor(e).includes(s))) || (e.type === 'diaper' && !!e.data.poo && STOOL_WARN.includes(e.data.color));
function evRow(e) {
  const [a, b] = describe(e), t = isBath(e) ? TYPES.bath : TYPES[e.type];
  return `<div class="card ev ${isWarn(e) ? 'alert' : ''}" style="--c:var(--${e.type})" data-edit="${e.id}">
    <div class="t">${e.data && e.data.approx ? `<span class="approx" title="${__h('About this time')}">~</span>` : ''}${esc(fmtTime(e.ts))}</div>
    <div class="b">${kidTag(e)}${t.icon} <b>${esc(a)}</b>${b ? `<small>${esc(b)}</small>` : ''}${e.note ? `<small>“${esc(e.note)}”</small>` : ''}${byLine(e)}</div></div>`;
}
function ageText(day) {
  const k = kidById(dayKid()), a = k ? Stages.age(k.birth, day) : '';
  return a ? ' · ' + a : '';
}

function monthView() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), today = startOfDay(Date.now());
  let cells = '', anyAway = false, anyAllergy = false, anyMoment = false, anyPlan = false;
  const tv = travelVars(), firsts = allergyDays([dayKid()]), big = new Map(), plans = plansIn(pageKids().map(k => k.id), first.getTime(), new Date(y, m + 1, 1).getTime());
  for (const e of momentsOf(pageKids().map(k => k.id))) { const key = dkey(e.ts); if (!big.has(key)) big.set(key, []); big.get(key).push(describe(e)[0]); }
  for (let i = 0; i < (first.getDay() - I18n.firstDay() + 7) % 7; i++) cells += '<button class="blank" disabled></button>';
  for (let d = 1; d <= days; d++) {
    const t = new Date(y, m, d).getTime(), evs = eventsOnDay(t), away = Travel.during(db.events, t, addDays(t, 1)), al = firsts.get(dkey(t)), mo = big.get(dkey(t));
    const pl = plans.filter(e => e.ts < addDays(t, 1) && planEnd(e) > t), pn = new Set(pl.map(e => [e.data.kind, e.data.title, e.ts, e.end].join('|'))).size, hol = pl.some(e => e.data.kind === 'School holiday');
    if (away) anyAway = true; if (al) anyAllergy = true; if (mo) anyMoment = true; if (pn) anyPlan = true;
    cells += `<button data-day="${t}" class="${t === viewDay ? 'sel' : ''} ${t === today ? 'today' : ''} ${away ? 'tripday' : ''} ${al ? 'allergyday' : ''} ${mo ? 'momentday' : ''} ${pl.length ? 'planday' : ''} ${hol ? 'holday' : ''}"${away ? ` style="${tv}"` : ''} aria-label="${esc([fmtDate(t), away && __('travelling'), al && __('first allergic reaction: {foods}', { foods: andList(al.map(x => __(x.allergy.food))) }), mo && __('big moment: {what}', { what: andList(mo) }), pn && __n('{n} on the calendar', '{n} on the calendar', pn), evs.length && __n('{n} entry', '{n} entries', evs.length)].filter(Boolean).join(', '))}">${d}${al ? '<i class="almark" aria-hidden="true">!</i>' : ''}${mo ? '<i class="mmark" aria-hidden="true">★</i>' : ''}${pn ? '<i class="pmark" aria-hidden="true">◆</i>' : ''}<span class="dots">${GROUPS.filter(g => evs.some(e => g.types.includes(e.type))).map(g => `<i class="dot" style="--c:var(--g-${g.id})"></i>`).join('')}</span></button>`;
  }
  const inMonth = scoped().filter(e => e.ts >= first.getTime() && e.ts < new Date(y, m + 1, 1).getTime());
  return `
  <div class="datenav"><button data-month="-1" aria-label="${__h('Previous month')}">‹</button>
    <div class="d">${esc(calMonth.toLocaleDateString(I18n.locale(), { month: 'long', year: 'numeric' }))}</div>
    <button data-month="1" aria-label="${__h('Next month')}">›</button></div>
  <div class="cal">${weekLetters().map(d => `<div class="h">${esc(d)}</div>`).join('')}${cells}</div>
  <div class="legend">${groupsOnPage(inMonth).map(g => `<span><i style="--c:var(--g-${g.id})"></i>${__h(gLabel(g))}</span>`).join('')}${anyAway ? `<span class="tripkey"><i></i>${__h('Travelling (its own colours)')}</span>` : ''}${anyPlan ? `<span class="plankey"><i>◆</i>${__h('On the calendar')}</span>` : ''}${anyAllergy ? `<span class="alkey"><i class="almark">!</i>${__h('First allergic reaction')}</span>` : ''}${anyMoment ? `<span class="mmkey"><i class="mmark">★</i>${__h('Big moment')}</span>` : ''}</div>
  ${monthTrip()}
  ${Sync.can('add') ? `<button class="planbtn" data-plannew><span class="tm">🗓</span><span><b>${__h('Add to the calendar')}</b><small>${__h('Exams, appointments, matches, lessons, school holidays…')}</small></span></button>` : ''}
  <button class="btn icsbtn" id="monthIcs">📅 ${__h("Share this month's calendar")}<small>${__h('A calendar file for Google Calendar, Apple Calendar or Outlook, by email or message')}</small></button>
  ${monthDay()}
  ${momentsJournal()}`;
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
  const pl = plansIn(pageKids().map(k => k.id), viewDay, addDays(viewDay, 1));
  return `<h2>${esc(fmtDate(viewDay))}</h2>
  ${momentCards(viewDay)}
  ${pl.length ? `<p class="mh">🗓 ${__h('On the calendar')}</p>${planRows(pl)}` : ''}
  ${al.map(x => `<div class="card alert alcard">⚠️ <b>${__h('First allergic reaction: {foods}', { foods: __(x.allergy.food) })}</b>${x.allergy.note ? `<br><small>${esc(x.allergy.note)}</small>` : ''}</div>`).join('')}
  <div class="${away ? 'travelday' : ''}"${away ? ` style="${travelVars()}"` : ''}>${away ? `<p class="tripnote">${M.icon} ${__h('Travelling {by}', { by: __(M.by) })}</p>` : ''}
  ${evs.length ? `${dayCounts(evs, viewDay)}<details class="more" data-grp="mAll" ${openGroups.has('mAll') ? 'open' : ''}><summary>${__h('All entries for this day')}<span class="chev" aria-hidden="true">›</span></summary>${groupedList(evs, 'm')}</details>` : `<div class="empty">${__h('No entries this day.')}</div>`}</div>
  ${quickButtons()}`;
}

// ---------- Stats ----------
function sleepMinutesOn(day) {
  let tot = 0;
  for (const e of viewOf().sleeps) {
    const end = e.end || Date.now(), s = Math.max(e.ts, day), f = Math.min(end, day + DAY);
    if (f > s) tot += (f - s) / MIN;
  }
  return tot;
}
function dayStats(day) {
  const evs = eventsOnDay(day), of = t => evs.filter(e => e.type === t);
  const feeds = of('feed').filter(e => e.data.kind !== 'solids'), diapers = of('diaper'), sleeps = evs.filter(e => e.type === 'sleep' && e.end);   // (milk feeds: a meal of solid food is counted on its own)
  return {
    day, feeds: feeds.length, solids: of('feed').length - feeds.length, ml: feeds.reduce((a, e) => a + (+e.data.ml || 0), 0),
    pee: diapers.filter(e => e.data.pee).length, poo: diapers.filter(e => e.data.poo).length, runny: [...diapers, ...of('potty')].filter(e => e.data.poo && e.data.texture === RUNNY).length,
    sleep: sleepMinutesOn(day), longest: Math.max(0, ...sleeps.map(e => (e.end - e.ts) / MIN)), naps: sleeps.length,
    wakes: of('wake').length, vomit: of('vomit').length, play: of('play').reduce((a, e) => a + (+e.data.min || 0), 0), health: of('health').length, meds: of('med').length,
    feedTimes: feeds.map(e => e.ts),
    meals: of('meal').filter(e => e.data.meal !== 'Snack').length, snacks: of('meal').filter(e => e.data.meal === 'Snack').length,
    rated: of('meal').filter(e => EATEN.includes(e.data.amount)).length, ateWell: of('meal').filter(e => e.data.amount === 'Most' || e.data.amount === 'All of it').length,
    potty: of('potty').filter(e => !e.data.accident && (e.data.pee || e.data.poo)).length, accidents: of('potty').filter(e => e.data.accident).length,
    asked: of('potty').filter(e => e.data.asked).length, dry: of('potty').filter(e => e.data.dry).length,
    care: stays(day, day + DAY, dayKid()).reduce((a, st) => a + (Math.min(st.end, day + DAY) - Math.max(st.start, day)) / MIN, 0), study: of('study').reduce((a, e) => a + (+e.data.min || 0), 0),
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
function chart(days, series, { fmt = v => String(v), unit = '', mode = 'stack', period = 'day' } = {}) {
  const W = 320, H = 104, L = 30, B = 18, T = 8, n = days.length, band = (W - L) / n;
  const tot = i => (mode === 'stack' ? series.reduce((a, s) => a + s.values[i], 0) : Math.max(...series.map(s => s.values[i])));
  const max = niceMax(Math.max(0, ...days.map((_, i) => tot(i)))), y = v => T + (H - T - B) * (1 - v / max);
  const wk = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'narrow' }), mo = new Intl.DateTimeFormat(I18n.locale(), { month: 'narrow' }), moY = new Intl.DateTimeFormat(I18n.locale(), { month: 'long', year: 'numeric' });
  const every = Math.ceil(n / 6);   // (a label on every few weeks)
  const lbl = (d, i) => (period === 'month' ? mo.format(new Date(d)) : period === 'week' ? (i % every === 0 ? fmtShort(d) : '')
    : n <= 14 ? wk.format(new Date(d)) : (new Date(d).getDate() % 5 === 0 ? String(new Date(d).getDate()) : ''));
  const when = d => (period === 'month' ? moY.format(new Date(d)) : period === 'week' ? __('Week of {date}', { date: fmtDate(d) }) : fmtDate(d));
  const bar = (x, w, y0, y1, top) => { const h = y0 - y1; if (h <= 0) return ''; const r = top ? Math.min(4, w / 2, h) : 0; return `M${x.toFixed(1)} ${y0.toFixed(1)}V${(y1 + r).toFixed(1)}${r ? `q0 -${r} ${r} -${r}h${(w - 2 * r).toFixed(1)}q${r} 0 ${r} ${r}` : `h${w.toFixed(1)}`}V${y0.toFixed(1)}Z`; };
  let g = [0, max / 2, max].map(v => `<path class="grid" d="M${L} ${y(v).toFixed(1)}H${W}"/><text class="ax" x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${esc(fmt(Math.round(v * 10) / 10))}</text>`).join('');
  days.forEach((d, i) => {
    const x0 = L + i * band, tip = `${when(d)}: ${series.map(s => `${fmt(s.values[i])}${unit} ${s.name}`).join(', ')}`;
    let shapes = '';
    if (mode === 'stack') {
      const w = Math.max(2, band * 0.62), x = x0 + (band - w) / 2; let acc = 0;
      series.forEach((s, k) => { const v = s.values[i]; if (!v) return; const y0 = y(acc) - (acc ? 2 : 0), y1 = y(acc + v); acc += v; const last = !series.slice(k + 1).some(t => t.values[i]); shapes += `<path d="${bar(x, w, y0, y1, last)}" fill="${s.color}"/>`; });
    } else {
      const w = Math.max(1.5, (band * 0.7 - (series.length - 1) * 2) / series.length);
      series.forEach((s, k) => { const v = s.values[i]; if (v) shapes += `<path d="${bar(x0 + band * 0.15 + k * (w + 2), w, y(0), y(v), true)}" fill="${s.color}"/>`; });
    }
    g += `<g class="bar" data-tip="${esc(tip)}"><title>${esc(tip)}</title><rect class="hit" x="${x0.toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${H - T - B}"/>${shapes}</g>`;
    const t = lbl(d, i); if (t) g += `<text class="ax" x="${(x0 + band / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(t)}</text>`;
  });
  const legend = series.length > 1 ? `<div class="clegend">${series.map(s => `<span><i style="--c:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  const note = period === 'day' ? '' : `<p class="cnote">${period === 'month' ? __h('An average day in each month') : __h('An average day in each week')}</p>`;
  const table = `<details class="tbl"><summary>${__h('Numbers')}<span class="chev" aria-hidden="true">›</span></summary><div class="tw"><table><thead><tr><th>${period === 'month' ? __h('Month') : period === 'week' ? __h('Week of') : __h('Day')}</th>${series.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${days.map((d, i) => `<tr><td>${esc(period === 'month' ? moY.format(new Date(d)) : fmtShort(d))}</td>${series.map(s => `<td>${esc(fmt(s.values[i]))}${unit}</td>`).join('')}</tr>`).reverse().join('')}</tbody></table></div></details>`;
  const label = period === 'month' ? __n('{what} per day, by month, last {n} month', '{what} per day, by month, last {n} months', n, { what: andList(series.map(s => s.name)) })
    : period === 'week' ? __n('{what} per day, by week, last {n} week', '{what} per day, by week, last {n} weeks', n, { what: andList(series.map(s => s.name)) })
    : __n('{what} per day, last {n} day', '{what} per day, last {n} days', n, { what: andList(series.map(s => s.name)) });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>${legend}${note}${table}`;
}
function statsView() {
  const today = startOfDay(Date.now());
  const days = Array.from({ length: statDays }, (_, i) => addDays(today, i - statDays + 1));
  const S = days.map(dayStats);
  // Ignore days before anything was logged so averages aren't dragged down.
  const mine = scoped(), firstLog = mine.length ? Math.min(...mine.map(e => e.ts)) : today;
  const used = S.filter(s => s.day + DAY > firstLog);
  const sum = k => used.reduce((a, s) => a + s[k], 0), per = k => used.length ? r1(sum(k) / used.length) : 0, perVol = () => (sum('ml') ? fmtVol(sum('ml') / used.length) : '–');
  const gaps = feedGaps(S);
  // Over 30 days the charts show an average day for each week (or each month over a year), so the bars stay readable.
  const period = statDays > 200 ? 'month' : statDays > 31 ? 'week' : 'day';
  const buckets = [];   // (groups of day stats, oldest first; the last week ends today, months are calendar months)
  if (period === 'day') S.forEach(s => buckets.push([s]));
  else if (period === 'week') for (let i = S.length; i > 0; i -= 7) buckets.unshift(S.slice(Math.max(0, i - 7), i));
  else S.forEach(s => { const d = new Date(s.day), key = d.getFullYear() * 12 + d.getMonth(), last = buckets[buckets.length - 1]; if (last && last.key === key) last.push(s); else { const b = [s]; b.key = key; buckets.push(b); } });
  const X = buckets.map(b => b[0].day);
  const vals = f => buckets.map(b => { const u = b.filter(s => s.day + DAY > firstLog); return u.length ? r1(u.reduce((a, s) => a + f(s), 0) / u.length) : 0; });
  const opts = o => ({ ...o, period });
  // (titles and row names are given in English and translated here; values come ready to show; each chart folds open on its own)
  const card = (icon, title, rows, charts, cls = '') => `<div class="card scard ${cls}"><b>${icon} ${__h(title)}</b>${rows.map(([n, v]) => `<div class="stat"><span>${__h(n)}</span><b>${esc(v)}</b></div>`).join('')}${(charts || []).map(([name, ch], i) => {
    const id = 'sc' + title.replace(/\W/g, '') + i; return `<details class="chx" data-grp="${id}" ${openGroups.has(id) ? 'open' : ''}><summary><span class="gt">📊 ${__h(name)}</span><span class="chev" aria-hidden="true">›</span></summary>${ch}</details>`; }).join('')}</div>`;
  const flagged = mine.filter(e => e.type === 'health' && e.ts >= addDays(today, -statDays + 1) && (e.data.symptoms || []).length).sort((a, b) => b.ts - a.ts);
  const sym = {}; flagged.forEach(e => e.data.symptoms.forEach(s => sym[s] = (sym[s] || 0) + 1));
  const poo = {}; mine.filter(e => e.type === 'diaper' && e.data.poo && e.ts >= addDays(today, -statDays + 1) && e.data.color).forEach(e => poo[e.data.color] = (poo[e.data.color] || 0) + 1);
  // solid or wet, for the diapers and for the potty (a row each, when it was noted)
  const tex = t => { const o = {}; mine.filter(e => e.type === t && e.data.poo && e.ts >= addDays(today, -statDays + 1) && e.data.texture).forEach(e => o[e.data.texture] = (o[e.data.texture] || 0) + 1); return Object.keys(o).length ? [[N_('Solid or wet'), Object.entries(o).map(([k, v]) => `${__(k)} ×${v}`).join(', ')]] : []; };
  const runny = used.some(s => s.runny >= 3);
  const lowWet = used.length && per('pee') < 6 && ageDays() >= 5 && !allFrom('toddler');
  const older = allFrom('toddler'), has = k => sum(k) > 0, pct = x => new Intl.NumberFormat(I18n.locale(), { style: 'percent' }).format(x);
  return `
  <div class="seg">${[7, 14, 30].map(n => `<button data-range="${n}" class="${n === statDays ? 'on' : ''}">${__hn('{n} day', '{n} days', n)}</button>`).join('')}</div>
  <div class="seg" style="margin-top:0">${[[91, __h('3 months')], [182, __h('6 months')], [365, __h('1 year')]].map(([n, l]) => `<button data-range="${n}" class="${n === statDays ? 'on' : ''}">${l}</button>`).join('')}</div>
  ${mine.length ? `<button class="btn pdfbtn" id="pdfBtn">📄 ${__h('Report for the doctor (PDF)')}</button>` : ''}
  ${kids().length > 1 ? `<h2>${esc(kidName(kidById(viewKid())))}</h2>` : ''}
  ${Sync.can('health') ? recordButton(kidById(viewKid())) : ''}
  ${heightWeightCard(kidById(viewKid()))}
  ${picturesFold(kidById(viewKid()))}
  ${mine.length ? '' : `<div class="empty">${__h('Log a few entries and your stats will show up here.')}</div>`}
  ${lowWet ? `<div class="card alert">⚠️ ${__h('Fewer than 6 wet diapers/day on average. After the first week this can signal low intake – worth mentioning to your pediatrician.')}</div>` : ''}
  ${runny ? `<div class="card alert">⚠️ ${__h('Three or more wet, runny poos in one day can be a tummy bug. Offer feeds or drinks often, and call your pediatrician if it goes on past a day, there is blood, or they are peeing less than usual.')}</div>` : ''}
  ${older ? card('🍽', N_('Meals'), [[N_('Meals per day'), per('meals')], [N_('Snacks per day'), per('snacks')], ...(sum('rated') ? [[N_('Ate most or all of it'), pct(sum('ateWell') / sum('rated'))]] : [])],
    [[N_('Meals and snacks per day'), chart(X, [{ name: __('meals'), color: 'var(--g-feed)', values: vals(s => s.meals) }, { name: __('snacks'), color: 'var(--g-snack)', values: vals(s => s.snacks) }], opts())]]) : ''}
  ${!older || has('feeds') ? card('🍼', older ? N_('Milk') : N_('Feeding'), older ? [[N_('Milk feeds per day'), per('feeds')], [volOz() ? N_('Milk fl oz per day') : N_('Milk ml per day'), perVol()]]
    : [[N_('Feeds per day'), per('feeds')], [N_('Avg time between feeds'), gaps.length ? fmtDur(avg(gaps)) : '–'], [volOz() ? N_('Bottle fl oz per day') : N_('Bottle ml per day'), perVol()], ...(sum('solids') ? [[N_('Solid meals per day'), per('solids')]] : [])],
    [[N_('Feeds per day'), chart(X, [{ name: __('feeds'), color: 'var(--g-feed)', values: vals(s => s.feeds) }], opts())], ...(sum('ml') ? [[older ? (volOz() ? N_('Milk fl oz per day') : N_('Milk ml per day')) : (volOz() ? N_('Bottle fl oz per day') : N_('Bottle ml per day')), chart(X, [{ name: volOz() ? __('fl oz') : __('ml'), color: 'var(--g-feed)', values: vals(s => (volOz() ? s.ml / OZ : s.ml)) }], opts())]] : [])]) : ''}
  ${(older && !allFrom('school')) || has('potty') || has('accidents') || has('dry') ? card('🚽', N_('Potty'), [[N_('On the potty per day'), per('potty')], [N_('Accidents per day'), per('accidents')], [N_('Asked to go'), sum('asked')], ...(has('dry') ? [[N_('Stayed dry'), sum('dry')]] : []), ...tex('potty')],
    [[N_('Potty and accidents per day'), chart(X, [{ name: __('on the potty'), color: 'var(--g-diaper)', values: vals(s => s.potty) }, { name: __('accidents'), color: 'var(--g-oops)', values: vals(s => s.accidents) }], opts({ mode: 'group' }))]]) : ''}
  ${pottyChartHtml(kidById(viewKid()))}
  ${!older || has('pee') || has('poo') ? card('💧', N_('Diapers'), [[N_('Pee per day'), per('pee')], [N_('Poo per day'), per('poo')], ...tex('diaper'), ...(Object.keys(poo).length ? [[N_('Poo colours'), Object.entries(poo).map(([k, v]) => `${__(k)} ×${v}`).join(', ')]] : [])],
    [[N_('Pee and poo per day'), chart(X, [{ name: __('pee'), color: 'var(--g-diaper)', values: vals(s => s.pee) }, { name: __('poo'), color: 'var(--g-poo)', values: vals(s => s.poo) }], opts({ mode: 'group' }))]]) : ''}
  ${card('😴', N_('Sleep'), [[N_('Sleep per day'), fmtDur(avg(used.map(s => s.sleep)))], [N_('Longest stretch (avg)'), fmtDur(avg(used.map(s => s.longest)))], [N_('Naps/sleeps per day'), per('naps')], [N_('Wake-ups per night'), per('wakes')]],
    [[N_('Hours asleep per day'), chart(X, [{ name: __('hours asleep'), color: 'var(--g-sleep)', values: vals(s => s.sleep / 60) }], opts({ fmt: v => __('{h}h', { h: v }) }))], [N_('Wake-ups per night'), chart(X, [{ name: __('wake-ups'), color: 'var(--g-sleep)', values: vals(s => s.wakes) }], opts())]])}
  ${!older || has('vomit') ? card('🤮', N_('Vomit'), [[N_('Total'), sum('vomit')], [N_('Per day'), per('vomit')]], [[N_('Vomits per day'), chart(X, [{ name: __('vomits'), color: 'var(--g-vomit)', values: vals(s => s.vomit) }], opts())]]) : ''}
  ${!older || has('play') ? card('🧸', allFrom('school') ? N_('Activities') : N_('Play'), [[allFrom('school') ? N_('Activities per day') : N_('Play per day'), fmtDur(per('play'))]], [[allFrom('school') ? N_('Minutes of activities per day') : N_('Minutes of play per day'), chart(X, [{ name: __('minutes of play'), color: 'var(--g-play)', values: vals(s => s.play) }], opts({ fmt: v => __('{m}m', { m: v }) }))]]) : ''}
  ${has('care') ? card('🏫', allFrom('school') ? N_('School') : N_('Daycare & school'), [[N_('Days there'), used.filter(s => s.care > 0).length], [N_('Time there on those days'), fmtDur(avg(used.filter(s => s.care > 0).map(s => s.care)))]],
    [[N_('Hours there per day'), chart(X, [{ name: __('hours there'), color: 'var(--g-care)', values: vals(s => s.care / 60) }], opts({ fmt: v => __('{h}h', { h: v }) }))]]) : ''}
  ${has('study') ? card('📚', N_('Homework'), [[N_('Homework per day'), fmtDur(per('study'))]], [[N_('Minutes of homework per day'), chart(X, [{ name: __('minutes of homework'), color: 'var(--g-play)', values: vals(s => s.study) }], opts({ fmt: v => __('{m}m', { m: v }) }))]]) : ''}
  ${Sync.can('health') ? card('🩺', N_('Health & meds'), Object.keys(sym).length ? Object.entries(sym).map(([k, v]) => [k, v + '×']) : [[N_('Health notes'), __('none')]],
    [[N_('Health notes and medicines per day'), chart(X, [{ name: __('health notes'), color: 'var(--g-health)', values: vals(s => s.health) }, { name: __('medicines'), color: 'var(--g-meds)', values: vals(s => s.meds) }], opts())]], flagged.length ? 'alert' : '') : ''}
  <p class="note">${__h('Stats are for your own tracking and are not medical advice. If something worries you, call your pediatrician. Call emergency services for blue lips/face, trouble breathing, or a baby who is hard to wake.')}</p>`;
}
function ageDays() { const k = kidById(viewKid()); return k && k.birth ? Math.floor((Date.now() - new Date(k.birth + 'T00:00').getTime()) / DAY) : 99; }

// ---------- Pictures as they grow ----------
// Two carousels in a twirl-down on the Stats page: a picture at each month birthday of the first year (newborn to 12 months), and one on
// every birthday from one to eighteen. Each picture is an entry of type 'photo' ({ slot, media: [the picture] }, dated the day the child
// reached that age), so it is encrypted, synced and shared like a big moment's pictures (media.js), and it is kept out of the day's
// lists, the stats and the report. The 12-month and the first-birthday slot are one picture ('y1'). The second carousel stays veiled
// until the first birthday; the 12-month sheet (milestoneCheck) then says what is new.
const PIC_MONTHS = Array.from({ length: 13 }, (_, i) => 'm' + i), PIC_YEARS = Array.from({ length: 18 }, (_, i) => 'y' + (i + 1));
const picKey = s => (s === 'm12' ? 'y1' : s);
const picOk = s => typeof s === 'string' && (PIC_MONTHS.includes(s) || PIC_YEARS.includes(s));
const picMonths = s => (s[0] === 'y' ? 12 * +s.slice(1) : +s.slice(1));
/** The day (local midnight) a child born on `birth` reaches `slot`: the same day of the month, or the last day of a shorter month. */
function picDay(birth, slot) {
  const [y, m, d] = birth.split('-').map(Number), n = picMonths(slot);
  return new Date(y, m - 1 + n, Math.min(d, new Date(y, m + n, 0).getDate())).getTime();
}
const picLabel = s => (s === 'm0' ? __('Newborn') : s[0] === 'y' ? __n('{n} year', '{n} years', +s.slice(1)) : __n('{n} month', '{n} months', +s.slice(1)));
/** A child's pictures by slot: the newest entry for each (two phones adding the same slot offline both keep theirs; the newer shows). */
function picsOf(id) {
  const m = new Map();
  for (const e of db.events) {
    if (e.type !== 'photo' || childOf(e) !== id || !e.data || !picOk(e.data.slot) || !Array.isArray(e.data.media) || !e.data.media[0]) continue;
    const k = picKey(e.data.slot), o = m.get(k); if (!o || (e.updated || 0) > (o.updated || 0)) m.set(k, e);
  }
  return m;
}
let picSlot = ''; const picScroll = {};   // (the slot a picture is being chosen for; where each carousel was scrolled to)
/** The two carousels (the first year by month, then growing up by year, veiled until the first birthday) and the line under the title. */
function picturesParts(k) {
  const name = kidName(k);
  if (!k.birth) return { sub: __('No pictures yet'), body: `<p class="note">${__h("Add {name}'s date of birth under More to start the pictures.", { name })}</p>` };
  const today = startOfDay(Date.now()), pics = picsOf(k.id), can = Sync.can('add'), one = picDay(k.birth, 'y1') <= today;
  const reached = s => picDay(k.birth, s) <= today, cur = { m: PIC_MONTHS.filter(reached).pop(), y: PIC_YEARS.filter(reached).pop() };
  Media.prime([...pics.values()].map(e => e.data.media[0]));
  const tile = s => {
    const key = picKey(s), e = pics.get(key), m = e && e.data.media[0], u = m && Media.url(m.id + '.t'), is = reached(s);
    const date = new Date(picDay(k.birth, s)).toLocaleDateString(I18n.locale(), s[0] === 'y' ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
    const box = e ? `<button type="button" class="pthumb${u ? '' : ' wait'}" data-view="${key}" aria-label="${esc(picLabel(s))}">${u ? `<img src="${u}" alt="">` : '<span class="ph">🖼</span>'}</button>`
      : is && can ? `<button type="button" class="pthumb add" data-pick="${key}" aria-label="${__h('Add a picture')}"><span class="ph">📷</span><small>${__h('Add a picture')}</small></button>`
        : `<span class="pthumb empty">${is ? '<span class="ph">🖼</span>' : ''}</span>`;
    return `<div class="pic${is ? '' : ' soon'}${s === cur.m || s === cur.y ? ' now' : ''}" data-slot="${s}">${box}<b>${esc(picLabel(s))}</b><small>${esc(date)}</small></div>`;
  };
  const row = (id, list) => `<div class="prow"><button type="button" class="parr" data-pscroll="-1" data-row="${id}" aria-label="${__h('Back')}">‹</button><div class="pics" id="${id}">${list.map(tile).join('')}</div><button type="button" class="parr" data-pscroll="1" data-row="${id}" aria-label="${__h('Next')}">›</button></div>`;
  const n = [...new Set(PIC_MONTHS.concat(one ? PIC_YEARS : []).map(picKey))].filter(s => pics.has(s)).length;
  const body = `<h2>${__h('The first year')}</h2><p class="note">${__h('A picture at each month birthday, from newborn to 12 months.')}</p>${row('picsM', PIC_MONTHS)}
    <h2>${__h('Growing up')}</h2><p class="note">${__h('A picture on every birthday, from one to eighteen. The 12-month picture is the first birthday picture too.')}</p>
    ${one ? row('picsY', PIC_YEARS) : `<div class="pveil"><div class="pics" aria-hidden="true">${PIC_YEARS.slice(0, 4).map(s => `<div class="pic soon"><span class="pthumb empty"></span><b>${esc(picLabel(s))}</b></div>`).join('')}</div><div class="plock">🔒 ${__h("Opens on {name}'s first birthday, {date}", { name, date: fmtDay(dkey(picDay(k.birth, 'y1'))) })}</div></div>`}
    <input type="file" id="picFile" accept="image/*" hidden>`;
  return { sub: n ? __n('{n} picture', '{n} pictures', n) : __('No pictures yet'), body };
}
/** The Pictures twirl-down on the Stats page. */
function picturesFold(k) { if (!k) return ''; const p = picturesParts(k); return fold('pics', '📷', __('Pictures of {name}', { name: kidName(k) }), p.sub, p.body); }
function pickPicture(key) { picSlot = key; const f = $('#picFile'); if (f) { f.value = ''; f.click(); } }
/** Keeps a chosen file as the picture for a slot (shrunk, on this phone, then up with the next sync); an earlier picture there goes. */
async function addPicture(k, key, file) {
  if (!k || !picOk(key)) return;
  const old = picsOf(k.id).get(key);
  if (old ? !Sync.can('edit', old) : !Sync.can('add')) return toast(__("You don't have permission to do that"));
  const prep = await Media.fromPhoto(file); if (prep.error) return toast(prep.error);
  const item = await Media.stage(prep);
  if (old) { const prev = old.data.media.map(m => m.id); old.data = { slot: key, media: [item] }; old.updated = stamp(); Media.discard(prev); }
  else db.events.push({ id: uid(), type: 'photo', ts: picDay(k.birth, key) + 12 * 60 * MIN, data: { slot: key, media: [item] }, note: '', by: Auth.id || undefined, child: k.id, updated: stamp() });
  save(); render();
}
function removePicture(k, key) {
  const e = picsOf(k.id).get(key); if (!e) return;
  if (!Sync.can('delete', e)) return toast(__("You don't have permission to do that"));
  if (!confirm(__('Remove this picture?'))) return;
  removeEvent(e); save(); render();
}
/** One of the pictures, big: replace it, take it off, or keep a copy (Save or share). */
async function openPicView(k, key) {
  const e = picsOf(k.id).get(key); if (!e) return;
  const m = e.data.media[0], label = key === 'y1' ? `${picLabel('y1')} · ${picLabel('m12')}` : picLabel(key);
  const close = popup(`<h3>📷 ${esc(kidName(k))} · ${esc(label)}</h3><p class="note">${esc(fmtDay(dkey(e.ts)))}</p><div class="mview" id="mview"></div>
    <div class="row" style="margin-top:12px"><button class="btn" data-close>${__h('Close')}</button>${Sync.can('edit', e) ? `<button type="button" class="btn" id="pvReplace">${__h('Replace')}</button>` : ''}${Sync.can('delete', e) ? `<button type="button" class="btn d" id="pvRemove">${__h('Remove')}</button>` : ''}<button type="button" class="btn" id="pvSave">${__h('Save or share')}</button></div>`);
  if ($('#pvReplace')) $('#pvReplace').onclick = () => { close(); pickPicture(key); };
  if ($('#pvRemove')) $('#pvRemove').onclick = () => { close(); removePicture(k, key); };
  $('#pvSave').onclick = async () => {
    try { await Media.ensure(m.id, m.mime); const blob = await Store.blobGet(m.id); if (!blob) throw new Error(N_("Couldn't load it. Check the connection and try again.")); download(`little-log-${slugOf(kidName(k))}-${key}.jpg`, new Uint8Array(await blob.arrayBuffer()), m.mime); }
    catch (err) { toast(__(err.message)); }
  };
  const box = $('#mview'), t = Media.url(m.id + '.t'); box.innerHTML = t ? `<img src="${t}" alt="" class="dim">` : `<span class="ph">${__h('Loading…')}</span>`;
  try { const u = await Media.ensure(m.id, m.mime); if (box.isConnected) box.innerHTML = `<img src="${u}" alt="">`; } catch (err) { if (box.isConnected) toast(__(err.message)); }
}
// ---------- Before the birth ----------
// A child whose date of birth is still to come is "expecting": the Day page is a countdown to the due date, a contraction timer and the
// hospital bag. Contractions are entries ({ ts, end }) so the other parent's phone sees them too; the bag's ticks stay on this phone.
const BAG = [
  [N_('For you'), [N_('ID, insurance card and maternity notes'), N_('Birth plan'), N_('Phone and a long charger'), N_('Comfortable clothes and a nightdress'), N_('Toiletries, lip balm and hair ties'), N_('Snacks and a water bottle'), N_('Nursing bra and breast pads'), N_('Maternity pads and comfortable underwear'), N_('Slippers and warm socks'), N_('An outfit to go home in')]],
  [N_('For the baby'), [N_('Car seat, fitted in the car'), N_('Two or three outfits and a hat'), N_('Diapers and wipes'), N_('A blanket'), N_('Formula and bottles, if not breastfeeding')]],
  [N_('For your partner'), [N_('A change of clothes'), N_('Snacks and coins for the machines'), N_('A camera or phone, charged')]],
];
/** Contractions in the last hour: how many, how long on average (seconds) and how far apart (minutes, from start to start). */
function labourStats(list, now = Date.now()) {
  const hour = list.filter(e => e.end && e.ts >= now - 60 * MIN);
  if (hour.length < 2) return { n: hour.length, len: 0, gap: 0 };
  const len = hour.reduce((a, e) => a + (e.end - e.ts) / 1000, 0) / hour.length, gaps = hour.slice(1).map((e, i) => (e.ts - hour[i].ts) / MIN);
  return { n: hour.length, len: Math.round(len), gap: Math.round(gaps.reduce((a, g) => a + g, 0) / gaps.length) };
}
function contractionsHtml(k) {
  const list = db.events.filter(e => e.type === 'contraction' && childOf(e) === k.id).sort((a, b) => a.ts - b.ts), open = list.find(e => e.end === null), done = list.filter(e => e.end), st = labourStats(list);
  const rows = done.slice(-12).reverse().map((e, i, arr) => { const prev = arr[i + 1]; return `<div class="stat"><span>${esc(fmtTime(e.ts))}</span><b>${__h('{n} s', { n: Math.round((e.end - e.ts) / 1000) })}</b><small>${prev ? esc(__('{n} min apart', { n: Math.round((e.ts - prev.ts) / MIN) })) : ''}</small></div>`; }).join('');
  const hint = st.n >= 6 && st.gap <= 6 && st.len >= 50 ? `<p class="call">${__h('Contractions about 5 minutes apart, lasting about a minute, for an hour: time to call your midwife or the hospital.')}</p>` : '';
  return `<div class="card contr"><b>⏱ ${__h('Contractions')}</b>
    ${Sync.can('add') ? (open ? `<button class="btn p" data-cstop="${open.id}">${__h('Stop')} · <span id="cElapsed" data-since="${open.ts}">${__h('{n} s', { n: Math.round((Date.now() - open.ts) / 1000) })}</span></button>` : `<button class="btn p" data-cstart="${k.id}">${__h('Start a contraction')}</button>`) : ''}
    <p class="note">${__h('Tap when one starts and again when it ends. The list shows how long each lasted and how far apart they are.')}</p>
    ${st.n >= 2 ? `<p class="note"><b>${__h('Last hour: {n} contractions, about {len} s long, about {gap} min apart', { n: st.n, len: st.len, gap: st.gap })}</b></p>` : ''}${hint}${rows}</div>`;
}
function bagHtml(k) {
  const ticks = (db.meta.bag || {})[k.id] || {}, all = BAG.flatMap(([, items]) => items), packed = all.filter(i => ticks[i]).length;
  return `<details class="gd" data-grp="bag" ${openGroups.has('bag') ? 'open' : ''}><summary><span class="gi">🎒</span><span class="gt"><b>${__h('Hospital bag')}</b><small>${__h('{n} of {total} packed', { n: packed, total: all.length })}</small></span><span class="chev" aria-hidden="true">›</span></summary><div class="gdin">
    ${BAG.map(([who, items]) => `<p class="mh">${__h(who)}</p>${items.map(i => `<label class="chip bag${ticks[i] ? ' on' : ''}"><input type="checkbox" data-bag="${esc(i)}" data-kid="${k.id}" ${ticks[i] ? 'checked' : ''}><span>${__h(i)}</span></label>`).join('')}`).join('')}
    <p class="note">${__h('Ticks are kept on this phone.')}</p></div></details>`;
}
function expectingView(k) {
  const name = kidName(k), days = Math.round((startOfDay(new Date(k.birth + 'T12:00').getTime()) - startOfDay(Date.now())) / DAY);
  return `<div class="card expect"><b>🎈 ${__hn('{name} is due in {n} day', '{name} is due in {n} days', Math.max(1, days), { name })}</b>
    <p class="note">${esc(fmtDay(k.birth))} · ${__h('When the baby arrives, set the date of birth under More and the log begins.')}</p></div>
    ${contractionsHtml(k)}${bagHtml(k)}`;
}

// ---------- Pumping and the milk stash ----------
/** How long a baby has been awake since their last sleep today, with the usual wake window for their age (stages.js): { since, mins, by, hint } or null. */
function awakeSince(k) {
  if (!k.birth || activeSleep(k.id)) return null;
  const w = Stages.wakeWindow(Guide.monthsOld(k.birth)); if (!w) return null;
  const now = Date.now(), last = db.events.filter(e => e.type === 'sleep' && childOf(e) === k.id && e.end && e.end <= now).sort((a, b) => b.end - a.end)[0];
  if (!last || last.end < startOfDay(now)) return null;
  const mins = (now - last.end) / MIN;
  return { since: last.end, mins, by: last.end + w.max * MIN, hint: mins <= w.max + 30 };
}
/** Expressed milk in the fridge or freezer that hasn't been used: the pumping sessions with an amount, oldest first. */
const milkStash = () => db.events.filter(e => e.type === 'pump' && e.data && e.data.ml > 0 && STORE_HOURS[e.data.store] && !e.data.used).sort((a, b) => a.ts - b.ts);
const keepsUntil = e => e.ts + STORE_HOURS[e.data.store] * 3600e3;
function leftText(until, now = Date.now()) {
  const h = (until - now) / 3600e3;
  if (h <= 0) return __('past its time'); if (h < 48) return __n('{n} hour left', '{n} hours left', Math.max(1, Math.round(h)));
  return __n('{n} day left', '{n} days left', Math.round(h / 24));
}
function stashHtml() {
  const list = milkStash(); if (!list.length) return '';
  const total = list.reduce((a, e) => a + e.data.ml, 0), now = Date.now();
  return `<details class="gd stash" data-grp="stash" ${openGroups.has('stash') ? 'open' : ''}><summary><span class="gi">🍶</span><span class="gt"><b>${__h('Milk stash')}</b><small>${__hn('{n} bottle · {amount}', '{n} bottles · {amount}', list.length, { amount: fmtVol(total) })}</small></span><span class="chev" aria-hidden="true">›</span></summary><div class="gdin">
    ${list.map(e => { const until = keepsUntil(e), past = until <= now; return `<div class="stat"><span>${esc(fmtVol(e.data.ml))} · ${__h(STORES[e.data.store])}<br><small>${__h('expressed {when}', { when: fmtShort(e.ts) + ' ' + fmtTime(e.ts) })} · <span class="${past ? 'warn' : ''}">${esc(leftText(until, now))}</span></small></span>${Sync.can('edit', e) ? `<button class="btn mini" data-used="${e.id}">${__h('Used')}</button>` : ''}</div>`; }).join('')}
    <p class="note">${__h('Expressed milk keeps about 4 days in the fridge and 6 months in the freezer. Tap Used when a bottle is given.')}</p></div></details>`;
}

// ---------- Allergen introduction ----------
// The nine key allergens, offered from around 6 months and then often: what the solids entries say about each, in the Guide's Food section.
const ALLERGENS = [['peanut', N_('Peanut'), 'Peanut'], ['egg', N_('Egg'), 'Egg'], ['milk', N_('Milk (dairy)'), 'Yogurt'], ['wheat', N_('Wheat'), 'Wheat'], ['soy', N_('Soy'), 'Soy'], ['nuts', N_('Tree nuts'), 'Tree nuts'], ['sesame', N_('Sesame'), 'Sesame'], ['fish', N_('Fish'), 'Fish'], ['shellfish', N_('Shellfish'), 'Shellfish']];
function allergenHtml(k) {
  if (!k) return '';
  const feeds = db.events.filter(e => e.type === 'feed' && e.data && e.data.kind === 'solids' && childOf(e) === k.id), now = Date.now();
  const rows = ALLERGENS.map(([id, name, food]) => {
    const days = [...new Set(feeds.filter(e => (e.data.foods || []).some(f => Foods.allergen(f) === id)).map(e => dkey(e.ts)))].sort(), n = days.length, last = n ? new Date(days[n - 1] + 'T12:00').getTime() : 0;
    const allergy = (k.allergies || []).some(a => (a.kind || '') === '' && Foods.allergen(a.food) === id), again = n && n < 4 && now - last > 7 * DAY;
    const state = allergy ? `<span class="warn">${__h('Allergy noted')}</span>` : !n ? __h('Not offered yet') : __hn('First {date} · {n} time', 'First {date} · {n} times', n, { date: fmtShort(new Date(days[0] + 'T12:00').getTime()) });
    return `<div class="stat alg${again ? ' again' : ''}"><span><b>${__h(name)}</b><br><small>${state}${again ? ' · ' + __h('offer again soon') : ''}</small></span>${!allergy && Sync.can('add') ? `<span class="row"><button class="btn mini" data-offer="${id}" data-kid="${k.id}">${n ? __h('Offered again') : __h('Offered today')}</button>${n ? `<button class="btn mini d" data-react="${esc(food)}" data-kid="${k.id}">${__h('Reaction')}</button>` : ''}</span>` : ''}</div>`;
  }).join('');
  return `<details class="gd" data-grp="galg" ${openGroups.has('galg') ? 'open' : ''}><summary><span class="gi">🥜</span><span class="gt"><b>${__h('Allergen introduction')}</b><small>${__h('The nine to offer early and often')}</small></span><span class="chev" aria-hidden="true">›</span></summary><div class="gdin">
    <p class="note">${__h('From around 6 months, one new one at a time, then a few times a week: that lowers the chance of a food allergy. Offered today logs a taste as a solids feed; Reaction notes an allergy.')}</p>${rows}</div></details>`;
}

// ---------- Teeth ----------
// The 20 first teeth by quadrant (UL, UR, LL, LR) and place from the middle (1 central incisor … 5 second molar), with when they usually
// come in (months) and fall out (years). Each tooth is an entry ({ tooth, lost }, dated the day), so every phone has the chart.
const TOOTH_NAMES = { 1: N_('central incisor'), 2: N_('lateral incisor'), 3: N_('canine'), 4: N_('first molar'), 5: N_('second molar') };
const TOOTH_WHERE = { UL: N_('upper left'), UR: N_('upper right'), LL: N_('lower left'), LR: N_('lower right') };
const TOOTH_IN = { U1: [8, 12], U2: [9, 13], U3: [16, 22], U4: [13, 19], U5: [25, 33], L1: [6, 10], L2: [10, 16], L3: [17, 23], L4: [14, 18], L5: [23, 31] }, TOOTH_OUT = { 1: [6, 7], 2: [7, 8], 3: [9, 12], 4: [9, 11], 5: [10, 12] };
const TOOTH_RE = /^[UL][LR][1-5]$/;
const toothName = code => (TOOTH_RE.test(code || '') ? __('{where} {tooth}', { where: __(TOOTH_WHERE[code.slice(0, 2)]), tooth: __(TOOTH_NAMES[code[2]]) }) : __('Tooth'));
/** A child's teeth by code: { in: the entry when it came in, out: the entry when it fell out }. */
function teethOf(id) {
  const m = new Map();
  for (const e of db.events) if (e.type === 'tooth' && childOf(e) === id && e.data && TOOTH_RE.test(e.data.tooth || '')) { const t = m.get(e.data.tooth) || {}; if (e.data.lost) t.out = e; else if (!t.in || e.ts < t.in.ts) t.in = e; m.set(e.data.tooth, t); }
  return m;
}
function teethHtml(k) {
  const teeth = teethOf(k.id), n = [...teeth.values()].filter(t => t.in && !t.out).length;
  // the mouth: the upper arch above, the lower below, the molars at the back
  const tooth = (q, i) => { const code = q + i, t = teeth.get(code), up = q[0] === 'U', side = q[1] === 'L' ? -1 : 1, a = (i - 0.5) * 0.32, x = 100 + side * Math.sin(a) * 78, y = up ? 58 - Math.cos(a) * 45 : 82 + Math.cos(a) * 45;
    return `<g class="tooth${t && t.out ? ' out' : t && t.in ? ' in' : ''}" data-tooth="${code}" role="button" tabindex="0" aria-label="${esc(toothName(code))}"><title>${esc(toothName(code))}</title><ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${i >= 4 ? 9 : 7}" ry="${i >= 4 ? 8 : 9}"/></g>`; };
  const svg = `<svg class="mouth" viewBox="0 0 200 140" aria-label="${__h('Teeth')}">${['UL', 'UR', 'LL', 'LR'].flatMap(q => [1, 2, 3, 4, 5].map(i => tooth(q, i))).join('')}</svg>`;
  const list = [...teeth].filter(([, t]) => t.in).sort((a, b) => a[1].in.ts - b[1].in.ts).map(([code, t]) => `<div class="stat"><span>${esc(toothName(code))}</span><b>${esc(fmtShort(t.in.ts))}${t.out ? ` · ${__h('out {date}', { date: fmtShort(t.out.ts) })}` : ''}</b></div>`).join('');
  return `<div class="card teeth"><p class="note">${n ? __hn('{n} tooth so far. Tap a tooth to add or change it.', '{n} teeth so far. Tap a tooth to add or change it.', n) : __h('No teeth yet: the first is usually a lower front tooth at 6 to 10 months. Tap a tooth when it comes in.')}</p>${svg}${list}</div>`;
}
function openTooth(k, code) {
  if (!Sync.can('add')) return toast(__("You don't have permission to do that"));
  const t = teethOf(k.id).get(code) || {}, i = code[2], [a, b] = TOOTH_IN[code[0] + i], [c, d] = TOOTH_OUT[i];
  const close = popup(`<h3>🦷 ${esc(toothName(code))}</h3><p class="note">${__h('Usually comes in at {a} to {b} months and falls out at {c} to {d} years.', { a, b, c, d })}</p>
    <label class="f">${__h('Date')}</label><input type="date" id="toothDay" value="${dkey(Date.now())}" max="${dkey(Date.now())}">
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Close')}</button>${t.in ? `${t.out ? '' : `<button class="btn" id="toothOut">${__h('Fell out')}</button>`}<button class="btn d" id="toothRm">${__h('Remove')}</button>` : `<button class="btn p" id="toothIn">${__h('Came in')}</button>`}</div>`);
  const day = () => { const v = $('#toothDay').value; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00').getTime() : Date.now(); };
  const add = lost => { db.events.push({ id: uid(), type: 'tooth', ts: day(), data: { tooth: code, ...(lost ? { lost: true } : {}) }, note: '', by: Auth.id || undefined, child: k.id, updated: stamp() }); save(); close(); render(); };
  if ($('#toothIn')) $('#toothIn').onclick = () => add(false);
  if ($('#toothOut')) $('#toothOut').onclick = () => add(true);
  if ($('#toothRm')) $('#toothRm').onclick = () => { for (const e of db.events.filter(x => x.type === 'tooth' && childOf(x) === k.id && x.data && x.data.tooth === code)) if (Sync.can('delete', e)) removeEvent(e); save(); close(); render(); };
}

// ---------- The potty chart ----------
/** The last n days of potty training: stars (times on the potty), accidents and dry nights per day, oldest first. */
function pottyDays(k, n = 14, now = Date.now()) {
  const t0 = startOfDay(now);
  return Array.from({ length: n }, (_, i) => { const d = addDays(t0, i - n + 1), evs = db.events.filter(e => e.type === 'potty' && childOf(e) === k.id && e.ts >= d && e.ts < d + DAY && e.data);
    return { day: d, stars: evs.filter(e => !e.data.accident && (e.data.pee || e.data.poo)).length, oops: evs.filter(e => e.data.accident).length, dry: evs.some(e => e.data.dry) }; });
}
/** Days in a row with a star and no accident, up to today (or yesterday, while today has no star yet). */
function pottyStreak(days) { const list = [...days].reverse(); if (list.length && !list[0].stars && !list[0].oops) list.shift(); let n = 0; for (const d of list) { if (d.stars && !d.oops) n++; else break; } return n; }
function pottyChartHtml(k) {
  if (!k) return '';
  const days = pottyDays(k); if (!days.some(d => d.stars || d.oops || d.dry)) return '';
  const streak = pottyStreak(days), today = startOfDay(Date.now()), wd = t => new Date(t).toLocaleDateString(I18n.locale(), { weekday: 'narrow' });
  return `<div class="card scard pottychart"><b>🌟 ${__h('Potty chart')}</b>${streak ? `<p class="note"><b>${__hn('{n} day in a row with a star and no accident!', '{n} days in a row with a star and no accident!', streak)}</b></p>` : ''}
    <div class="pgrid">${days.map(d => `<div class="pday${d.day === today ? ' today' : ''}" title="${esc(fmtShort(d.day))}"><small>${esc(wd(d.day))}</small><span class="stars">${'🌟'.repeat(Math.min(d.stars, 3))}${d.stars > 3 ? `+${d.stars - 3}` : ''}</span><span class="oops">${'●'.repeat(Math.min(d.oops, 3))}</span>${d.dry ? '<span class="dry">😴</span>' : ''}</div>`).join('')}</div>
    <p class="note">${__h('The last two weeks: a star for each time on the potty, a dot for each accident, a moon for a dry night.')}</p>
    <button class="btn" data-pottypdf="${k.id}">📄 ${__h('Print a reward chart (PDF)')}</button></div>`;
}
/** A reward chart to print: four weeks with the stars so far, then empty boxes to fill in by hand (with stickers, if you like). */
async function pottyPdf(k) {
  const name = kidName(k), days = pottyDays(k, 28), cols = Array(7).fill({ w: 1, align: 'center' }), box = '\n\n', weeks = [];
  for (let i = 0; i < 28; i += 7) weeks.push(days.slice(i, i + 7).map(d => (d.stars ? '★'.repeat(Math.min(d.stars, 3)) : '') + box));
  const blocks = [{ h: 1, text: __("{name}'s potty chart", { name }) }, { p: __('A star for each time on the potty. Fill in the empty boxes together, and plan a treat for a full row!'), muted: true },
    { h: 3, text: __('The last four weeks') }, { table: { cols, head: days.slice(0, 7).map(d => new Date(d.day).toLocaleDateString(I18n.locale(), { weekday: 'short' })), rows: weeks } }, { gap: 16 },
    { h: 3, text: __('The next four weeks') }, { table: { cols, head: Array(7).fill(' '), rows: Array.from({ length: 4 }, () => Array(7).fill(box)) } }];
  try { const doc = await Pdf.make(blocks, { size: myRegion() === 'na' ? 'letter' : 'a4', rtl: I18n.rtl(), lang: I18n.lang() === I18n.PSEUDO ? 'en' : I18n.lang() }); download(`little-log-${slugOf(name)}-potty-chart.pdf`, doc.bytes, 'application/pdf'); }
  catch (e) { toast(__('Could not make the PDF')); }
}

// ---------- Handing over ----------
/** The viewed day so far, as a few lines to hand to a babysitter or a grandparent: feeds, diapers, sleep, medicines, notes, allergies. */
function handoverText(day = viewDay) {
  const k = dayKid() !== 'all' ? kidById(dayKid()) : null, evs = eventsOnDay(day), lines = [], of = t => evs.filter(e => e.type === t), last = l => fmtTime(l[l.length - 1].ts);
  const what = e => describe(e).filter(Boolean).join(' · ');
  lines.push(`${k ? kidName(k) : __('Everyone')} · ${fmtDate(day)}`);
  const feeds = of('feed'); if (feeds.length) lines.push(__('Feeds: {n} (last {time}: {what})', { n: feeds.length, time: last(feeds), what: what(feeds[feeds.length - 1]) }));
  const meals = of('meal'); if (meals.length) lines.push(__('Meals: {list}', { list: meals.map(what).join(', ') }));
  const dia = of('diaper'); if (dia.length) lines.push(__('Diapers: {wet} wet, {poo} poo (last {time})', { wet: dia.filter(e => e.data.pee).length, poo: dia.filter(e => e.data.poo).length, time: last(dia) }));
  const potty = of('potty'); if (potty.length) lines.push(__('Potty: {n} times, {oops} accidents', { n: potty.filter(e => !e.data.accident && (e.data.pee || e.data.poo)).length, oops: potty.filter(e => e.data.accident).length }));
  const sl = of('sleep'), open = sl.find(e => !e.end);
  if (open) lines.push(__('Asleep since {time}', { time: fmtTime(open.ts) }));
  else if (sl.length) lines.push(__('Sleep: {n} times, {long} in all (last woke at {time})', { n: sl.length, long: fmtDur(sl.reduce((a, e) => a + ((e.end || Date.now()) - e.ts) / MIN, 0)), time: fmtTime(Math.max(...sl.map(e => e.end || e.ts))) }));
  const meds = of('med'); if (meds.length) lines.push(__('Medicines: {list}', { list: meds.map(e => `${fmtTime(e.ts)} ${what(e)}`).join(', ') }));
  const health = of('health'); if (health.length) lines.push(__('Health: {list}', { list: health.map(what).join(', ') }));
  const notes = evs.filter(e => e.note).map(e => `${fmtTime(e.ts)} “${e.note}”`); if (notes.length) lines.push(__('Notes: {list}', { list: notes.join(' · ') }));
  const al = k ? (k.allergies || []).map(a => allergyText(a)) : kids().flatMap(x => (x.allergies || []).map(a => kidName(x) + ': ' + allergyText(a))); if (al.length) lines.push(__('Allergies: {foods}', { foods: al.join(', ') }));
  return lines.join('\n');
}
/** The same lines as a picture (a cream card), for the apps that share pictures better than text. */
async function handoverImage(text) {
  const lines = text.split('\n'), W = 720, LH = 34, c = document.createElement('canvas'); c.width = W; c.height = 110 + lines.length * LH; const x = c.getContext('2d');
  x.fillStyle = '#fbf7ef'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#2a241c';
  x.font = '700 30px Georgia, "Times New Roman", serif'; x.fillText(lines[0], 36, 56);
  x.font = '22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  lines.slice(1).forEach((l, i) => x.fillText(l.length > 60 ? l.slice(0, 58) + '…' : l, 36, 100 + i * LH));
  x.font = 'italic 16px Georgia, serif'; x.fillStyle = '#8a8075'; x.fillText('Little Log', 36, c.height - 18);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  download('little-log-today.png', new Uint8Array(await blob.arrayBuffer()), 'image/png');
}
function openHandover() {
  const text = handoverText(), title = __('Today so far');
  const close = popup(`<h3>📤 ${__h(title)}</h3><pre class="hand">${esc(text)}</pre>
    <div class="row" style="margin-top:12px"><button class="btn" data-close>${__h('Close')}</button><button class="btn p" id="handText">${__h('Share as text')}</button><button class="btn" id="handPic">${__h('Share as a picture')}</button></div>`);
  $('#handText').onclick = async () => {
    try { if (Native.is) await Native.shareText(title, text); else if (navigator.share) await navigator.share({ title, text }); else { await navigator.clipboard.writeText(text); toast(__('Copied: paste it into a message')); } close(); }
    catch (e) { if (!/cancel|abort/i.test(e.message || '')) toast(__('Could not share')); }
  };
  $('#handPic').onclick = async () => { try { await handoverImage(text); close(); } catch (e) { toast(__('Could not share')); } };
}

// ---------- Routine ----------
// The times of day that keep coming back, laid out like a day in a calendar. routine.js works them out from the last week every time
// the page is drawn, so the routine follows the baby as it changes; today's entries tick off what has been done.
/** Days of the week in the phone's language: "Mon – Fri" (and "Sun – Thu"), or "Mon, Wed and Fri". 0 is Sunday. */
function weekdaysText(ws) {
  const day = w => new Intl.DateTimeFormat(I18n.locale(), { weekday: 'short' }).format(new Date(2024, 0, 7 + w));   // (7 January 2024 was a Sunday)
  for (let r = 0; r < 7 && ws.length > 2 && ws.length < 7; r++) {   // (a run of days, also across the weekend)
    const x = ws.map(w => (w - r + 7) % 7).sort((a, b) => a - b);
    if (x.every((w, i) => !i || w === x[i - 1] + 1) && x[0] === 0) return `${day(r)} – ${day((x[x.length - 1] + r) % 7)}`;
  }
  return ws.length === 7 ? __('every day') : andList(ws.map(day));
}
function routineView(now = Date.now()) {
  const k = viewKid(), mine = db.events.filter(e => !Travel.isTravel(e.type) && !offDay(e.type) && childOf(e) === k);
  const R = Routine.find(mine, now), T = Routine.today(R.slots, mine, now, { off: holidayOn(k) });
  const clock = m => { const d = new Date(now); d.setHours(0, m, 0, 0); return fmtTime(d.getTime()); };
  const night = s => s.at >= 19 * 60 || s.at < 5 * 60;
  const name = s => (s.key === 'solids' ? __('Solids') : s.type === 'feed' ? __(tLabel('feed')) : s.type === 'meal' ? __(s.meal) : s.type === 'sleep' ? (night(s) ? __('Night sleep') : __('Nap')) : s.type === 'play' ? __(s.activity)
    : s.type === 'care' || s.type === 'pickup' ? `${__(TYPES[s.type].label)} · ${placeName(s)}` : s.type === 'study' ? __(s.kind) : s.name);
  const what = s => {
    if (s.key === 'solids' || s.type === 'meal') return (s.foods || []).map(f => __(f)).join(', ');
    if (s.type === 'feed') return s.kind === 'bottle' ? (s.ml ? (s.cup ? __('Cup {amt}', { amt: fmtVol(s.ml) }) : __('Bottle {amt}', { amt: fmtVol(s.ml) })) : s.cup ? __('Cup') : __('Bottle')) : [__('Breast'), s.minutes && __('{n} min', { n: s.minutes })].filter(Boolean).join(' · ');
    if (s.type === 'sleep') return s.minutes ? __('until about {time} ({long})', { time: clock(s.at + s.minutes), long: fmtDur(s.minutes) }) : '';
    if (s.type === 'play' || s.type === 'study') return s.minutes ? __('{n} min', { n: s.minutes }) : '';
    if (s.type === 'care' || s.type === 'pickup') return '';
    return s.dose || '';
  };
  const head = kids().length > 1 ? `<h2>${esc(kidName(kidById(k)))}</h2>` : '';
  const how = `<p class="note rhow">${allFrom('toddler') ? __h('Worked out from the last {days} days: meals, milk, sleep, play and medicines that happen within {minutes} minutes of the same time on more than half of the days logged. It updates by itself as the routine changes. Diapers and the potty are left out.', { days: Routine.DAYS, minutes: Routine.WINDOW })
    : __h('Worked out from the last {days} days: feeds, sleep, play and medicines that happen within {minutes} minutes of the same time on more than half of the days logged. It updates by itself as the routine changes. Diapers are left out.', { days: Routine.DAYS, minutes: Routine.WINDOW })}</p>`;
  // today's entries no routine time accounts for (a nap just logged, a feed at an unusual hour), and before there is a routine everything
  // logged today, so the page shows the day as it happens (the routine's day starts at 6 AM)
  const d0 = (() => { const d = new Date(now); d.setHours(0, Routine.DAY_START, 0, 0); return d.getTime() <= now ? d.getTime() : d.getTime() - DAY; })();
  const matched = new Set(T.list.map(o => o.entry).filter(Boolean));
  const extra = mine.filter(e => e.ts >= d0 && e.ts <= now && Routine.keyOf(e) && !matched.has(e)).sort((a, b) => a.ts - b.ts);
  const todayHtml = (title, note) => (extra.length ? `<h2>${__h(title)}</h2>${note ? `<p class="note rhow">${__h(note)}</p>` : ''}<div class="routine today">${extra.map(e => {
    const [t, w] = describe(e), detail = e.type === 'sleep' && !e.end ? '' : w;
    return `<div class="card rslot rtoday" style="--c:var(--${e.type})" data-entry="${esc(e.id)}"><div class="rt">${esc(fmtTime(e.ts))}</div><div class="rb"><b>${e.data && e.data.kind === 'solids' ? '🥄' : TYPES[e.type].icon} ${esc(t)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</div></div>`;
  }).join('')}</div>` : '');
  if (!R.enough) return `${head}${todayHtml(N_('Today so far'))}<div class="empty">⏰ ${__h('Your routine will show up here after a few days of logging.')}<br><small>${__hn('{n} day logged in the last week so far.', '{n} days logged in the last week so far.', R.logged)}</small></div>${how}`;
  if (!R.slots.length) return `${head}${todayHtml(N_('Today so far'))}<div class="empty">⏰ ${__h('No regular times yet.')}<br><small>${__h('Anything that happens at about the same time on most days will show up here.')}</small></div>${how}`;
  const nx = T.next, slotIcon = s => (s.key === 'solids' ? '🥄' : s.type === 'play' && s.activity === 'Bath' ? TYPES.bath.icon : TYPES[s.type].icon);
  const next = nx ? `<div class="card rnext" style="--c:var(--${nx.slot.type})"><span class="rni">${slotIcon(nx.slot)}</span><span><small>${__h('Next in the routine')}</small><b>${esc(name(nx.slot))}</b><small>${esc(nx.tomorrow && startOfDay(nx.at) > startOfDay(now) ? __('tomorrow at about {time}', { time: fmtTime(nx.at) })
    : nx.state === 'now' ? __('about now ({time})', { time: fmtTime(nx.at) }) : __('at about {time}, in {wait}', { time: fmtTime(nx.at), wait: fmtDur((nx.at - now) / MIN) }))}</small></span></div>` : '';
  // from morning to night: the morning, afternoon and evening, then the night after them (the parts of the day as the clock names them)
  const parts = [[0, 0], [6, 1], [12, 2], [18, 3]];
  let rows = '', part = -1, nowShown = false;
  for (const o of T.list) {
    const s = o.slot, p = parts.filter(([h]) => s.at >= h * 60).pop()[1];
    if (!nowShown && o.at > now) { rows += `<div class="rnow" aria-hidden="true"><span>${esc(fmtTime(now))}</span></div>`; nowShown = true; }
    if (p !== part) { rows += `<h2 class="rpart">${__h(QUAD_NAMES.day[p])}</h2>`; part = p; }
    const range = s.to - s.from >= 5 ? __('usually {from} – {to}', { from: clock(s.from), to: clock(s.to) }) : '';
    const often = s.weekdays ? weekdaysText(s.weekdays) : __n('{days} of {n} day', '{days} of {n} days', s.of, { days: s.days }), w = what(s);
    const state = o.state === 'done' ? `<span class="rs ok" title="${__h('Done today at {time}', { time: fmtTime(o.entry.ts) })}">✓ ${esc(fmtTime(o.entry.ts))}</span>`
      : o.state === 'now' ? `<span class="rs now">${__h('Due now')}</span>` : nx && !nx.tomorrow && nx.slot === s ? `<span class="rs next">${__h('Up next')}</span>`
        : o.state === 'past' ? `<span class="rs past" title="${__h('Not logged today')}">–</span>` : '';
    rows += `<div class="card rslot ${o.state}" style="--c:var(--${s.type})" data-slot="${esc(s.key)}">
      <div class="rt">${esc(clock(s.at))}</div><div class="rb"><b>${slotIcon(s)} ${esc(name(s))}</b>${w ? `<small>${esc(w)}</small>` : ''}<small>${esc([range, often].filter(Boolean).join(' · '))}</small></div>${state}</div>`;
  }
  if (!nowShown) rows += `<div class="rnow" aria-hidden="true"><span>${esc(fmtTime(now))}</span></div>`;
  // the times that keep to other days of the week (school on a Sunday, swimming on Tuesdays)
  const today = new Set(T.list.map(o => o.slot)), week = R.slots.filter(s => s.weekdays && !today.has(s));
  const weekHtml = week.length ? `<h2>${__h('Other days of the week')}</h2><div class="routine week">${week.map(s => `<div class="card rslot" style="--c:var(--${s.type})" data-slot="${esc(s.key)}">
    <div class="rt">${esc(clock(s.at))}</div><div class="rb"><b>${slotIcon(s)} ${esc(name(s))}</b>${what(s) ? `<small>${esc(what(s))}</small>` : ''}<small>${esc(weekdaysText(s.weekdays))}</small></div></div>`).join('')}</div>` : '';
  const weekly = R.slots.some(s => s.weekdays) ? `<p class="note rhow">${__h('Daycare, school, homework, and lessons and clubs are worked out from the last 4 weeks, for each day of the week.')}</p>` : '';
  return `${head}${next}<div class="routine">${rows}</div>${todayHtml(N_('Also today'), N_('Logged today at a time that is not part of the routine (yet).'))}${weekHtml}${how}${weekly}`;
}

// ---------- Report for the doctor ----------
// A PDF of one child's log to take to a checkup or send to the doctor: who the child is, the averages, a table of the days, the
// health notes and medicines, and every entry. pdf.js lays it out in the app's language, on US Letter paper in North America and A4
// elsewhere. Only what this phone can see goes in (health notes only for people allowed to see them, as everywhere else).
let reportDays = 14;
/** One child's entries over the last `days` days (from the first entry, if that is later), and the numbers for each day. */
function reportData(kidId, days, now = Date.now()) {
  const to = addDays(startOfDay(now), 1), all = db.events.filter(e => !Travel.isTravel(e.type) && !offDay(e.type) && e.type !== 'pump' && childOf(e) === kidId);   // (what happened to the child, not the calendar or a parent's pumping)
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
      wakes: of('wake').length, vomit: of('vomit').length, health: of('health'), meds: of('med'), meals: of('meal').length,
      potty: of('potty').filter(e => !e.data.accident && (e.data.pee || e.data.poo)).length, accidents: of('potty').filter(e => e.data.accident).length });
  }
  return { from, to, evs, days: list };
}
/** The report as blocks for pdf.js. */
function reportBlocks(kidId, { days, every, notes }, now = Date.now()) {
  const k = kidById(kidId), name = kidName(k), R = reportData(kidId, days, now), used = R.days.filter(x => x.es.length), n = used.length || 1;
  const avg = key => r1(used.reduce((a, x) => a + x[key], 0) / n), count = xs => Object.entries(xs.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).map(([x, c]) => `${x} ×${c}`).join(', ');
  const when = e => `${fmtShort(e.ts)} ${e.data && e.data.approx ? __('about {time}', { time: fmtTime(e.ts) }) : fmtTime(e.ts)}`;
  const born = k.birth ? new Date(k.birth + 'T00:00').getTime() : null, m = born ? Guide.monthsOld(k.birth, now) : -1;
  const age = born == null || m < 0 ? '' : m < 1 ? __n('{n} week', '{n} weeks', Math.max(0, Math.floor((now - born) / DAY / 7))) : m < 24 ? __n('{n} month', '{n} months', m) : Stages.age(k.birth, now);
  const older = Stages.from(stageOf(k, now), 'toddler'), anyOf = key => R.days.some(x => x[key]);   // (an older child's report leaves out what isn't logged any more)
  const doc = Guide.cleanDoctor(db.baby.doctor), formula = usualFormula(k);
  const health = R.evs.filter(e => e.type === 'health'), meds = R.evs.filter(e => e.type === 'med'), temps = health.filter(e => +e.data.temp > 0);
  const hot = temps.length ? temps.reduce((a, e) => (+e.data.temp > +a.data.temp ? e : a)) : null, vomits = R.evs.filter(e => e.type === 'vomit');
  const blocks = [
    { h: 1, text: name },
    { p: [born && __('Born {date}', { date: new Date(born).toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }) }), age && __('{age} old', { age }), k.sex === 'boy' ? __('Boy') : k.sex === 'girl' ? __('Girl') : ''].filter(Boolean).join(' · '), muted: true },
    { p: `${__('{from} to {to}', { from: fmtShort(R.from), to: fmtShort(R.to - 1) })} · ${__n('{n} day', '{n} days', R.days.length)}`, muted: true },
  ];
  const about = [(k.allergies || []).length ? [__('Allergies'), k.allergies.map(a => allergyText(a, true)).join('; ')] : null,
    doc.name || doc.practice ? [__('Pediatrician'), [doc.name, doc.practice, doc.phone, doc.nurse && __('nurse line {phone}', { phone: doc.nurse })].filter(Boolean).join(' · ')] : null,
    doc.hospital || doc.hospPhone ? [__('Hospital'), [doc.hospital, doc.hospPhone].filter(Boolean).join(' · ')] : null, formula ? [__('Usual formula'), formula] : null].filter(Boolean);
  const tried = new Map();
  for (const e of db.events.filter(x => x.type === 'feed' && x.data && x.data.kind === 'solids' && childOf(x) === kidId && x.ts < now).sort((a, b) => a.ts - b.ts)) for (const f of e.data.foods || []) if (!tried.has(f.toLowerCase())) tried.set(f.toLowerCase(), [f, e.ts]);
  if (about.length) blocks.push({ kv: about });
  if (notes) blocks.push({ h: 2, text: __('Questions and notes for the doctor') }, { p: notes });
  blocks.push({ h: 2, text: __('At a glance') });
  if (!R.evs.length) blocks.push({ p: __('Nothing was logged in this period.'), muted: true });
  else {
    blocks.push({ p: __n('Averages over the {n} day with entries.', 'Averages over the {n} days with entries.', used.length), muted: true, size: 8.5 }, { kv: [
      ...(anyOf('meals') ? [[__('Meals per day'), String(avg('meals'))]] : []),
      ...(!older || anyOf('feeds') ? [[older ? __('Milk feeds per day') : __('Feeds per day'), String(avg('feeds'))]] : []), ...(avg('ml') ? [[older ? (volOz() ? __('Milk fl oz per day') : __('Milk ml per day')) : (volOz() ? __('Bottle fl oz per day') : __('Bottle ml per day')), fmtVol(avg('ml'))]] : []), ...(avg('solids') ? [[__('Solid meals per day'), String(avg('solids'))]] : []),
      ...(anyOf('potty') || anyOf('accidents') ? [[__('On the potty per day'), String(avg('potty'))], [__('Accidents per day'), String(avg('accidents'))]] : []),
      ...(!older || anyOf('pee') || anyOf('poo') ? [[__('Pee per day'), String(avg('pee'))], [__('Poo per day'), String(avg('poo'))]] : []),
      ...(R.evs.some(e => e.type === 'diaper' && e.data.poo && e.data.color) ? [[__('Poo colours'), count(R.evs.filter(e => e.type === 'diaper' && e.data.poo && e.data.color).map(e => __(e.data.color)))]] : []),
      ...(R.evs.some(e => (e.type === 'diaper' || e.type === 'potty') && e.data.poo && e.data.texture) ? [[__('Solid or wet'), count(R.evs.filter(e => (e.type === 'diaper' || e.type === 'potty') && e.data.poo && e.data.texture).map(e => __(e.data.texture)))]] : []),
      [__('Sleep per day'), fmtDur(avg('sleep'))], [__('Longest stretch (avg)'), fmtDur(avg('longest'))], [__('Wake-ups per night'), String(avg('wakes'))],
      [__('Vomit'), vomits.length ? __n('{n} time', '{n} times', vomits.length) + (vomits.some(e => e.data.projectile) ? ` (${__('projectile')}: ${vomits.filter(e => e.data.projectile).length})` : '') : __('none')],
      ...(hot ? [[__('Highest temperature'), `${hot.data.temp}° · ${when(hot)}`]] : []),
      ...(health.some(e => (e.data.symptoms || []).length) ? [[__('Symptoms noted'), count(health.flatMap(e => e.data.symptoms || []).map(x => __(x)))]] : []),
      ...(meds.length ? [[__('Medicines given'), count(meds.map(e => [e.data.name || __('Medication'), e.data.dose].filter(Boolean).join(' ')))]] : []),
      ...(tried.size ? [[__('Foods tried (first time)'), [...tried.values()].map(([f, t]) => `${__(f)} (${fmtShort(t)})`).join(', ')]] : []),
    ] });
  }
  // the health record (for people who may see it): every measurement with its percentiles, every vaccine, and the period's visits
  if (Sync.can('health')) {
    const rec = t => db.events.filter(e => e.type === t && childOf(e) === kidId && e.ts < now).sort((a, b) => a.ts - b.ts);
    const growth = rec('growth'), vaccines = rec('vaccine'), visits = rec('visit').filter(e => e.ts >= R.from), sexed = (k.sex === 'boy' || k.sex === 'girl') && k.birth;
    const withPct = (kind, e, v, text) => { const p = sexed && Growth.percentile(kind, k.sex, ageMonths(k, e.ts), v); return p ? `${text} (${pctText(p.pct)})` : text; };
    if (growth.length) {
      blocks.push({ h: 2, text: __('Growth') }, { table: { cols: [{ w: 1.6 }, { w: 1.6 }, { w: 2.6 }, { w: 2.6 }, { w: 2.4 }], head: [__('Date'), __('Age'), __('Weight'), __('Length or height'), __('Head')],
        rows: growth.slice(-16).map(e => [fmtShort(e.ts), k.birth ? Stages.age(k.birth, e.ts) : '', e.data.weight ? withPct('weight', e, e.data.weight, fmtWeight(e.data.weight)) : '–',
          e.data.height ? withPct('height', e, e.data.height, fmtLength(e.data.height)) : '–', e.data.head ? withPct('head', e, e.data.head, fmtLength(e.data.head)) : '–']) } });
      if (sexed) blocks.push({ p: __('Percentiles from the CDC growth charts.'), muted: true, size: 8 });
    }
    // (the dose goes with the vaccine's name: in many languages the word for a medicine's dose is an amount, not a dose number)
    if (vaccines.length) blocks.push({ h: 2, text: __('Vaccines') }, { table: { cols: [{ w: 5 }, { w: 2 }, { w: 3 }], head: [__('Vaccine'), __('Date'), __('Where')],
      rows: vaccines.map(e => [[describe(e)[0], e.data.dose && __('dose {n}', { n: e.data.dose })].filter(Boolean).join(' · '), fmtShort(e.ts), [e.data.place, e.data.batch].filter(Boolean).join(' · ')]) } });
    if (visits.length) blocks.push({ h: 2, text: __('Doctor visits') }, { table: { cols: [{ w: 1.6 }, { w: 2 }, { w: 2.4 }, { w: 4 }], head: [__('Date'), __('Visit'), __('Who'), __('Notes')],
      rows: visits.map(e => [fmtShort(e.ts), __(e.data.kind || 'Checkup'), e.data.who || '', [e.data.why, e.note].filter(Boolean).join(' · ')]) } });
  }
  // the columns of the table: a baby's always; an older child's meals and potty, and only what was logged in the period
  const C = (head, w, v, on = true, align = 'center') => ({ head, w, v, on, align });
  const cols = [C(__('Date'), 2.3, x => fmtShort(x.d), true, 'left'), C(__('Meals'), 1.1, x => x.meals, anyOf('meals')), C(older ? __('Milk') : __('Feeds'), 1, x => x.feeds, !older || anyOf('feeds')),
    C(volOz() ? __('fl oz') : __('ml'), 1.1, x => (x.ml ? (volOz() ? fmtNum(x.ml / OZ, 1) : x.ml) : '–'), !older || anyOf('ml')), C(__('Potty'), 1.1, x => x.potty, anyOf('potty') || anyOf('accidents')), C(__('Accidents'), 1.3, x => x.accidents, anyOf('accidents')),
    C(__('Pee'), 1, x => x.pee, !older || anyOf('pee')), C(__('Poo'), 1, x => x.poo, !older || anyOf('poo')), C(__('Sleep'), 1.3, x => (x.sleep ? fmtDur(x.sleep) : '–')),
    C(__('Wake-ups'), 1.2, x => x.wakes), C(__('Vomit'), 1, x => x.vomit),
    C(__('Health & meds'), 2.8, x => [...x.health.map(e => (e.data.symptoms || []).map(s => __(s)).join(', ') || __('Note')), ...x.meds.map(e => e.data.name || __('Medication'))].join('; '), true, 'left')].filter(c => c.on);
  blocks.push({ h: 2, text: __('Day by day') }, { table: {
    cols: cols.map(c => (c.align === 'left' ? { w: c.w } : { w: c.w, align: c.align })), head: cols.map(c => c.head),
    rows: R.days.map(x => cols.map((c, i) => (x.es.length ? c.v(x) : i === 0 ? c.v(x) : c.head === __('Sleep') ? c.v(x) : i === cols.length - 1 ? __('Nothing logged') : '–')).map(String)),
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
// Allergies to more than food: medicines and medical things, vaccines, insect stings and the environment, each with how bad it was.
const ALLERGY_KINDS = [['food', N_('Food')], ['medicine', N_('Medicine or medical')], ['vaccine', N_('Vaccine')], ['sting', N_('Insect sting')], ['environment', N_('Environment')], ['other', N_('Other')]];
const ALLERGY_COMMON = {
  medicine: [N_('Penicillin'), N_('Amoxicillin'), N_('Cephalosporins'), N_('Sulfa antibiotics'), N_('Ibuprofen'), N_('Aspirin'), N_('Paracetamol / acetaminophen'), N_('Codeine'), N_('Local anaesthetic'), N_('Latex'), N_('Plasters / adhesive')],
  vaccine: [N_('Egg (some flu and yellow fever vaccines)'), N_('Gelatin'), N_('Neomycin'), N_('A vaccine (say which in the note)')],
  sting: [N_('Bee'), N_('Wasp'), N_('Hornet'), N_('Ant'), N_('Mosquito')],
  environment: [N_('Pollen'), N_('Dust mites'), N_('Cats'), N_('Dogs'), N_('Mould'), N_('Grass')],
  other: [],
};
const ALLERGY_WHICH = { food: N_('Which food?'), medicine: N_('Which medicine?'), vaccine: N_('Which vaccine or ingredient?'), sting: N_('Which insect?'), environment: N_('What in the environment?'), other: N_('What is it to?') };
// Medicines sold under other names, or in the same family as one a child is allergic to: the medicine form warns about these too.
const MED_FAMILIES = {
  penicillin: ['amoxicillin', 'ampicillin', 'augmentin', 'co-amoxiclav', 'amoxiclav', 'flucloxacillin', 'piperacillin', 'penicillin'],
  amoxicillin: ['amoxil', 'augmentin', 'co-amoxiclav', 'amoxiclav', 'amoxicillin'],
  cephalosporins: ['cephalexin', 'cefalexin', 'keflex', 'cefdinir', 'ceftriaxone', 'cefuroxime', 'cefaclor', 'cef'],
  'sulfa antibiotics': ['sulfamethoxazole', 'trimethoprim', 'bactrim', 'septra', 'co-trimoxazole', 'sulfa'],
  ibuprofen: ['advil', 'motrin', 'nurofen', 'brufen', 'ibuprofen'],
  aspirin: ['aspirin', 'salicylate', 'disprin'],
  'paracetamol / acetaminophen': ['paracetamol', 'acetaminophen', 'tylenol', 'calpol', 'panadol', 'dafalgan', 'doliprane'],
  codeine: ['codeine', 'co-codamol'],
  latex: ['latex'],
};
/** Allergies to a medicine a child has, for a medicine's name as typed: the allergy's own name, or one of the family's names. */
function medAllergies(kidIds, name) {
  const t = String(name || '').trim().toLowerCase(); if (!t) return [];
  return kidIds.flatMap(id => allergiesOf(id).filter(a => a.kind === 'medicine').filter(a => {
    const n = a.food.toLowerCase(); return t.includes(n) || n.includes(t) || (MED_FAMILIES[n] || []).some(x => t.includes(x));
  }).map(a => ({ kid: kidById(id), allergy: a })));
}
/** An allergy in a few words: "Peanut", "Penicillin (medicine)", "Bee (sting · serious · adrenaline pen)". */
function allergyText(a, withDate) {
  const bits = [a.kind && __((ALLERGY_KINDS.find(([k]) => k === a.kind) || [])[1] || a.kind), a.severity === 'serious' ? __('serious') : a.severity === 'mild' ? __('mild') : '', a.epi && __('adrenaline pen'), withDate && a.date && __('first reaction {date}', { date: fmtDay(a.date) })].filter(Boolean);
  return bits.length ? `${__(a.food)} (${bits.join(' · ')})` : __(a.food);
}
const allergicTo = (id, food) => allergiesOf(id).find(a => Foods.same(a.food, food));
/** A date of the log (YYYY-MM-DD) in words: 3 March 2027. */
const fmtDay = key => new Date(key + 'T00:00').toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' });
/** Save the children's profile (and send it when the log is shared). */
function saveProfile(msg) { db.baby.name = kids()[0].name; db.baby.birth = kids()[0].birth; Sync.linked() ? Sync.pushBaby() : save(); render(); if (msg) toast(msg); }
/** The foods of a solid meal: a twirl-down of the common first foods by group (the key allergens first, marked as such), any food the
    child is allergic to flagged, and room for any other food. */
function foodsPicker(picked, kidIds, { open = true, baby = true } = {}) {
  const allergic = f => kidIds.some(id => allergicTo(id, f));
  const one = f => chip('food', f, `${__h(f)}${Foods.allergen(f) ? ` <small class="kal">${__h('key allergen')}</small>` : ''}${allergic(f) ? ` <small class="kbad">⚠️ ${__h('allergy')}</small>` : ''}`, picked.includes(f), allergic(f) ? 'warn' : '');
  return `<details class="foods"${open ? ' open' : ''}><summary><span>${__h('Foods')} <small class="fsum">${esc(picked.map(f => __(f)).join(', '))}</small></span><span class="chev" aria-hidden="true">›</span></summary>
    ${Foods.GROUPS.map(g => `<details class="fgrp" data-fg="${g.id}"${(baby && g.id === 'allergens') || g.items.some(([f]) => picked.includes(f)) ? ' open' : ''}><summary>${__h(g.name)}<span class="chev" aria-hidden="true">›</span></summary>
      ${g.id === 'allergens' && baby ? `<p class="note">${__h('Offering these from around 6 months, one new one at a time and then often, lowers the chance of a food allergy. If your baby has severe eczema or already has a food allergy, ask your pediatrician first.')}</p>` : ''}
      <div class="chips">${g.items.map(([f]) => one(f)).join('')}</div></details>`).join('')}
    <div class="chips" id="foodTyped">${picked.filter(f => !Foods.known(f)).map(one).join('')}</div>
    <div class="row addfood"><input id="foodOther" type="text" maxlength="60" placeholder="${__h('Another food')}" aria-label="${__h('Another food')}"><button type="button" class="btn" id="foodAdd">${__h('Add')}</button></div></details>`;
}
/** Mark one or more foods as an allergy of a child, with the date of the first reaction and what happened. */
function openAllergy(kidId, pre = {}) {
  if (!Sync.can('profile')) return toast(__('Only parents can change these.'));
  const name = kidName(kidById(kidId)), picked = pre.foods || [];
  let kind = ALLERGY_KINDS.some(([k]) => k === pre.kind) ? pre.kind : 'food';
  const commonOf = k => (k === 'food' ? Foods.GROUPS[0].items.map(([f]) => f) : ALLERGY_COMMON[k] || []);
  const chipsOf = k => [...commonOf(k), ...picked.filter(f => !commonOf(k).includes(f))].map(f => chip('alFood', f, __h(f), picked.includes(f), 'warn')).join('');
  const close = popup(`<h3>⚠️ ${__h('Mark an allergy')}</h3><p class="note">${__h('For {name}. Everyone sharing the log will see it, so whoever looks after {name} knows.', { name })}</p>
    <label class="f">${__h('Allergic to…')}</label><div class="chips">${ALLERGY_KINDS.map(([k, l]) => chip('alKind', k, __h(l), k === kind, '', true)).join('')}</div>
    <label class="f" id="alWhich">${__h(ALLERGY_WHICH[kind])}</label><div class="chips" id="alFoods">${chipsOf(kind)}</div>
    <div class="row addfood"><input id="alOther" type="text" maxlength="60" placeholder="${__h('Another one')}" aria-label="${__h('Another one')}"><button type="button" class="btn" id="alAdd">${__h('Add')}</button></div>
    <label class="f">${__h('How bad was it?')}</label><div class="chips">${[['', N_('Not sure')], ['mild', N_('Mild: hives, itching, an upset tummy')], ['serious', N_('Serious: trouble breathing, swelling, or needed emergency care')]].map(([v, l]) => chip('alSev', v, __h(l), v === (pre.severity || ''), v === 'serious' ? 'warn' : '', true)).join('')}</div>
    <div class="chips">${chip('alEpi', 1, __h('Carries an adrenaline auto-injector (EpiPen)'), !!pre.epi, 'warn')}</div>
    <label class="f" for="alDate">${__h('Date of the first reaction')}</label><input id="alDate" type="date" value="${esc(pre.date || dkey(Date.now()))}" max="${dkey(Date.now())}">
    <label class="f" for="alNote">${__h('What happened (optional)')}</label><textarea id="alNote" rows="2" maxlength="120" placeholder="${__h('e.g. hives around the mouth')}"></textarea>
    <p class="call">${__h('Call {sos} for trouble breathing, swelling of the lips, tongue or face, or if your baby goes floppy or pale.', { sos: __(Guide.sos(myRegion())) })}</p>
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="alSave">${__h('Save')}</button></div>`);
  $('#alAdd').onclick = () => { const v = $('#alOther').value.trim().slice(0, 60); if (!v) return; $('#alOther').value = ''; $('#alFoods').insertAdjacentHTML('beforeend', chip('alFood', v, esc(v), true, 'warn')); };
  document.querySelectorAll('#sheet [name=alKind]').forEach(r => r.onchange = () => { if (!r.checked) return; kind = r.value; $('#alWhich').textContent = __(ALLERGY_WHICH[kind]); $('#alFoods').innerHTML = chipsOf(kind); });
  $('#alSave').onclick = () => {
    const k = kidById(kidId);   // (looked up again: a sync may have brought a newer profile while the sheet was open)
    if (!k) return close();
    const foods = [...document.querySelectorAll('#sheet [name=alFood]:checked')].map(c => c.value), date = $('#alDate').value, note = $('#alNote').value.trim();
    const severity = (document.querySelector('#sheet [name=alSev]:checked') || {}).value || '', epi = !!document.querySelector('#sheet [name=alEpi]:checked'), kk = kind === 'food' ? '' : kind;
    if (!foods.length) return toast(kind === 'food' ? __('Choose the food') : __('Choose what it is to'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > dkey(Date.now())) return toast(__('Please pick a date'));
    const before = k.allergies || [], fresh = foods.filter(f => !before.some(a => (a.kind || '') === kk && Foods.same(a.food, f)));
    k.allergies = Kids.allergies([...before.map(a => (foods.some(f => (a.kind || '') === kk && Foods.same(a.food, f)) ? { ...a, severity: severity || a.severity, epi: epi || a.epi } : a)), ...foods.map(food => ({ food, date, note, kind: kk, severity, epi }))]);
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

// ---------- Health record ----------
// Each child's vaccines, doctor and dentist visits and measurements, for any age: entries kept like health notes (only people allowed
// to see health notes get them, under the health key). Measurements are compared with the CDC growth charts (growth.js): the
// percentile for the child's age and sex, and a chart with the 3rd, 15th, 50th, 85th and 97th percentile lines.
const lbOz = kg => { const oz = Math.round((kg / LB) * 160) / 10, lb = Math.floor(oz / 16); return [lb, Math.round((oz - lb * 16) * 10) / 10]; };
const fmtIn = (cm, us) => Math.round((us ? cm / IN : cm) * 10) / 10;
/** A child's age in months (with the part of a month) at the time `ts`. */
const ageMonths = (k, ts) => (ts - new Date(k.birth + 'T00:00').getTime()) / (30.4375 * DAY);
const bmiOf = g => (g && g.weight && g.height ? g.weight / (g.height / 100) ** 2 : 0);
const GROWTH = [['weight', N_('Weight')], ['height', N_('Length or height')], ['head', N_('Head')], ['bmi', N_('BMI')]];
/** A percentile in words: "55th percentile" (other languages: their own way of saying it). */
function pctText(p) {
  const n = Math.min(99, Math.max(1, Math.round(p)));
  if (I18n.lang() === 'en') return `${n}${{ one: 'st', two: 'nd', few: 'rd' }[new Intl.PluralRules('en', { type: 'ordinal' }).select(n)] || 'th'} percentile`;
  return __('percentile {n}', { n });
}
/** Where a measurement falls on the growth charts, in words, or why it can't be said. */
function growthNote(k, ts, g) {
  if (!k.birth) return __('Add the birth date in More → Children to compare with the growth charts.');
  if (k.sex !== 'boy' && k.sex !== 'girl') return __('Set boy or girl in More → Children to compare with the growth charts.');
  const m = ageMonths(k, ts), parts = [];
  for (const [kind, label] of GROWTH) { const x = kind === 'bmi' ? bmiOf(g) : g[kind], p = x && Growth.percentile(kind, k.sex, m, x); if (p) parts.push(`${__(label)}: ${pctText(p.pct)}`); }
  return parts.join(' · ');
}
let recordFrom = 'guide', growthKind = 'weight';
/** Open a child's health record (from the Guide, More, a sheet…); its back button goes back there. */
function openRecord(id, from = tab) {
  if (!Sync.can('health')) return toast(__("You don't have access to health notes"));
  if (id && kidById(id)) setKid(id);
  if (from !== 'health') recordFrom = from;
  $('#sheet').hidden = $('#sheetBack').hidden = true; tab = 'health'; render(); window.scrollTo(0, 0);
}
/** A measurement chart: the child's points over the CDC percentile lines, for their age (birth to 3 years, or 2 to 20). */
function growthChart(k, kind, list) {
  const us = usUnits(), val = e => (kind === 'bmi' ? bmiOf(e.data) : +e.data[kind] || 0), conv = v => (kind === 'weight' ? (us ? v / LB : v) : kind === 'bmi' ? v : us ? v / IN : v);
  const unit = kind === 'weight' ? (us ? __('lb') : __('kg')) : kind === 'bmi' ? __('kg/m²') : us ? __('in') : __('cm');
  const now = ageMonths(k, Date.now()), small = kind === 'head' || (kind !== 'bmi' && now <= 36);
  const x0 = small ? 0 : 24, x1 = small ? Math.min(36, Math.max(6, Math.ceil((now + 2) / 6) * 6)) : Math.min(240, Math.max(60, Math.ceil((now + 6) / 12) * 12));   // (a newborn's chart: the first months)
  const pts = list.map(e => [ageMonths(k, e.ts), val(e)]).filter(([m, v]) => v > 0 && m >= x0 - 0.01 && m <= x1).sort((a, b) => a[0] - b[0]);
  const sexed = k.sex === 'boy' || k.sex === 'girl', lines = sexed ? Growth.curves(kind, k.sex, x0, x1, [3, 15, 50, 85, 97], small ? 0.5 : 3) : [];
  const ys = [...lines.flatMap(c => c.pts.map(p => conv(p[1]))), ...pts.map(p => conv(p[1]))];
  if (!ys.length) return '';
  const W = 320, H = 220, L = 34, R = 24, T = 24, B = 26, lo0 = Math.min(...ys), hi0 = Math.max(...ys), pad = (hi0 - lo0) * 0.06 || 1;
  const step = niceMax((hi0 - lo0 + 2 * pad) / 4), lo = Math.floor((lo0 - pad) / step) * step, hi = Math.ceil((hi0 + pad) / step) * step;
  const X = m => L + ((m - x0) / (x1 - x0)) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B), f1 = n => n.toFixed(1);
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += step) g += `<path class="grid" d="M${L} ${f1(Y(v))}H${W - R}"/><text class="ax" x="${L - 4}" y="${f1(Y(v) + 3)}" text-anchor="end">${esc(fmtNum(v, 1))}</text>`;
  const years = !small, ticks = []; for (let m = x0; m <= x1 + 1e-9; m += small ? (x1 <= 6 ? 1 : x1 <= 12 ? 3 : 6) : (x1 - x0 > 120 ? 24 : 12)) ticks.push(m);
  for (const m of ticks) g += `<path class="grid v" d="M${f1(X(m))} ${T}V${H - B}"/><text class="ax" x="${f1(X(m))}" y="${H - B + 13}" text-anchor="middle">${esc(fmtNum(years ? m / 12 : m, 0))}</text>`;
  g += `<text class="ax unit" x="${L - 4}" y="${T - 12}" text-anchor="end">${esc(unit)}</text><text class="ax" x="${W - R}" y="${H - 3}" text-anchor="end">${years ? __h('Age (years)') : __h('Age (months)')}</text>`;
  const path = ps => ps.map((p, i) => `${i ? 'L' : 'M'}${f1(X(p[0]))} ${f1(Y(conv(p[1])))}`).join('');
  if (lines.length) {
    const outer = [...lines[0].pts, ...[...lines[4].pts].reverse()];
    // the percentile at the end of each line, moved apart where the lines run close (3rd at the bottom, 97th at the top)
    const ly = lines.map(c => Y(conv(c.pts[c.pts.length - 1][1])) + 3);
    for (let i = 1; i < ly.length; i++) ly[i] = Math.min(ly[i], ly[i - 1] - 9);
    if (ly[ly.length - 1] < T) { const up = T - ly[ly.length - 1]; for (let i = 0; i < ly.length; i++) ly[i] += up; }
    g += `<path class="band" d="${path(outer)}Z"/>` + lines.map((c, i) => `<path class="pline${c.p === 50 ? ' mid' : ''}" d="${path(c.pts)}"/><text class="plab" x="${W - R + 3}" y="${f1(ly[i])}">${c.p}</text>`).join('');
  }
  if (pts.length) g += `<path class="kline" d="${path(pts)}" style="stroke:${k.color}"/>` + pts.map(p => `<circle class="kdot" cx="${f1(X(p[0]))}" cy="${f1(Y(conv(p[1])))}" r="3.6" style="fill:${k.color}"/>`).join('');
  const last = pts[pts.length - 1], lp = last && sexed && Growth.percentile(kind, k.sex, last[0], last[1]);
  const label = [__(GROWTH.find(x => x[0] === kind)[1]), last && `${fmtNum(conv(last[1]), kind === 'weight' && !us ? 2 : 1)} ${unit}`, lp && pctText(lp.pct)].filter(Boolean).join(', ');
  return `<svg class="chart gchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`;
}
/** The health record page of the child shown: who they are, growth, vaccines, doctor visits. */
/** The allergies in the health record: food, medicines, vaccines, stings and the environment, with how bad each was. */
function allergyCardHtml(k) {
  const can = Sync.can('profile'), list = k.allergies || [];
  return `<div class="card allergies">${list.length ? list.map(a => `<div class="stat alrow ${a.severity === 'serious' ? 'serious' : ''}"><span>⚠️ <b>${__h(a.food)}</b> <small>${esc(__((ALLERGY_KINDS.find(([x]) => x === (a.kind || 'food')) || [])[1]))}</small><br><small>${esc([a.severity === 'serious' ? __('Serious reaction') : a.severity === 'mild' ? __('Mild reaction') : '', a.epi && __('Carries an adrenaline auto-injector'), a.date && __('first reaction {date}', { date: fmtDay(a.date) }), a.note].filter(Boolean).join(' · '))}</small></span></div>`).join('')
    : `<p class="note">${__h('None marked. Food, medicines, vaccines, insect stings and the environment can all go here, so everyone looking after {name} knows.', { name: kidName(k) })}</p>`}
    ${can ? `<button class="btn" data-aladd="${k.id}">⚠️ ${__h('Add an allergy')}</button>` : ''}</div>`;
}
/** The latest of each measurement (weight, length or height, head, BMI from 2) with its date and percentile, as rows. */
function growthLatestHtml(k, growth) {
  return GROWTH.map(([kind, label]) => { const e = growth.find(x => (kind === 'bmi' ? bmiOf(x.data) && ageMonths(k, x.ts) >= 24 : x.data[kind])); if (!e) return '';   // (BMI from 2 years old)
    const v = kind === 'bmi' ? bmiOf(e.data) : e.data[kind];
    const p = (k.sex === 'boy' || k.sex === 'girl') && k.birth && Growth.percentile(kind, k.sex, ageMonths(k, e.ts), v);
    return `<div class="stat"><span>${__h(label)}<br><small>${esc(fmtShort(e.ts))}</small></span><b>${esc(kind === 'weight' ? fmtWeight(v) : kind === 'bmi' ? fmtNum(v, 1) : fmtLength(v))}${p ? `<small>${esc(pctText(p.pct))}</small>` : ''}</b></div>`; }).join('');
}
/** Height & weight on the Stats page: the latest numbers with their percentiles, a button to add a measurement, and the record's charts a tap away. */
function heightWeightCard(k) {
  if (!k || !Sync.can('health')) return '';
  const growth = db.events.filter(e => childOf(e) === k.id && e.type === 'growth').sort((a, b) => b.ts - a.ts), rows = growthLatestHtml(k, growth);
  return `<div class="card scard hw"><b>📏 ${__h('Height & weight')}</b>${rows || `<p class="note">${__h('No measurements yet. Add one after each checkup, or whenever you weigh and measure at home.')}</p>`}
    <div class="row">${Sync.can('add') ? `<button class="btn" data-add="growth">📏 ${__h('Add a measurement')}</button>` : ''}${growth.length ? `<button class="btn" data-record="${k.id}">📈 ${__h('Charts')}</button>` : ''}</div></div>`;
}
function recordView() {
  const k = kidById(viewKid()), name = kidName(k), us = usUnits(), mine = db.events.filter(e => childOf(e) === k.id);
  const of = t => mine.filter(e => e.type === t).sort((a, b) => b.ts - a.ts), growth = of('growth'), vaccines = of('vaccine'), visits = of('visit'), add = Sync.can('add');
  const back = { day: N_('Day'), routine: N_('Routine'), month: N_('Month'), stats: N_('Stats'), guide: N_('Guide'), family: N_('Family'), more: N_('More') }[recordFrom] || N_('Guide');
  const born = k.birth ? new Date(k.birth + 'T00:00').toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const al = (k.allergies || []).map(a => allergyText(a));
  const head = `<div class="card rechead" style="--k:${k.color}">${avatar(k, 'lg')}<span><b>${__h("{name}'s health record", { name })}</b><small>${esc([born && __('Born {date}', { date: born }), k.birth && Stages.age(k.birth, Date.now()), k.sex === 'boy' ? __('Boy') : k.sex === 'girl' ? __('Girl') : ''].filter(Boolean).join(' · '))}</small>${al.length ? `<small class="allergyline">⚠️ ${__h('Allergies: {foods}', { foods: al.join(', ') })}</small>` : ''}</span></div>`;
  // growth: the latest of each measurement with its percentile, a chart per kind, and every measurement in a table
  const latest = growthLatestHtml(k, growth);
  const kinds = GROWTH.map(x => x[0]).filter(kind => growth.some(e => (kind === 'bmi' ? bmiOf(e.data) && ageMonths(k, e.ts) >= 24 : e.data[kind])));
  if (!kinds.includes(growthKind)) growthKind = kinds[0] || 'weight';
  const table = growth.length ? `<details class="tbl"><summary>${__h('Every measurement')}<span class="chev" aria-hidden="true">›</span></summary><div class="tw"><table><thead><tr><th>${__h('Date')}</th><th>${__h('Weight')}</th><th>${__h('Length or height')}</th><th>${__h('Head')}</th></tr></thead><tbody>
    ${growth.map(e => `<tr data-edit="${e.id}"><td>${esc(fmtShort(e.ts))}</td><td>${e.data.weight ? esc(fmtWeight(e.data.weight)) : '–'}</td><td>${e.data.height ? esc(fmtLength(e.data.height)) : '–'}</td><td>${e.data.head ? esc(fmtLength(e.data.head)) : '–'}</td></tr>`).join('')}</tbody></table></div></details>` : '';
  const growthHtml = `<div class="card recgrowth">${latest || `<p class="note">${__h('No measurements yet. Add one after each checkup, or whenever you weigh and measure at home.')}</p>`}
    ${kinds.length > 1 ? `<div class="seg mini gkinds">${kinds.map(x => `<button data-gkind="${x}" class="${x === growthKind ? 'on' : ''}" aria-pressed="${x === growthKind}">${__h(GROWTH.find(g => g[0] === x)[1])}</button>`).join('')}</div>` : ''}
    ${growth.length ? growthChart(k, growthKind, growth) : ''}
    ${growth.length ? `<p class="note">${(k.sex === 'boy' || k.sex === 'girl') && k.birth ? __h('The lines are the 3rd, 15th, 50th, 85th and 97th percentiles of the CDC growth charts. Your doctor may use another chart, such as the WHO\'s.') : esc(growthNote(k, Date.now(), {}))}</p>` : ''}
    ${table}${add ? `<button class="btn" data-add="growth">📏 ${__h('Add a measurement')}</button>` : ''}</div>`;
  // vaccines: by vaccine, each dose with its date
  const byName = new Map(); for (const e of [...vaccines].reverse()) { const n = describe(e)[0]; if (!byName.has(n)) byName.set(n, []); byName.get(n).push(e); }
  const vacHtml = `<div class="card vaccines">${byName.size ? [...byName].map(([n, es]) => `<div class="vrow"><b>💉 ${esc(n)}</b>${es.map(e => `<button class="vdose" data-edit="${e.id}">${esc([e.data.dose && __('dose {n}', { n: e.data.dose }), fmtDay(dkey(e.ts)), e.data.place].filter(Boolean).join(' · '))}</button>`).join('')}</div>`).join('')
    : `<p class="note">${__h('No vaccines saved yet. Your vaccination card or your doctor has the dates.')}</p>`}${add ? `<button class="btn" data-add="vaccine">💉 ${__h('Add a vaccine')}</button>` : ''}</div>`;
  const visHtml = `<div class="card visits">${visits.length ? visits.map(e => { const [a, b] = describe(e); return `<button class="vrow vvisit" data-edit="${e.id}"><b>🏥 ${esc(a)}</b><small>${esc([fmtDay(dkey(e.ts)), b].filter(Boolean).join(' · '))}</small>${e.note ? `<small class="mn">“${esc(e.note)}”</small>` : ''}</button>`; }).join('')
    : `<p class="note">${__h('No visits saved yet: checkups, the dentist, eye and hearing tests, and the times your child was seen when unwell.')}</p>`}${add ? `<button class="btn" data-add="visit">🏥 ${__h('Add a visit')}</button>` : ''}</div>`;
  return `${backBar(back)}${head}
    <h2>${__h('Allergies')}</h2>${allergyCardHtml(k)}<h2>${__h('Height & weight')}</h2>${growthHtml}<h2>${__h('Teeth')}</h2>${teethHtml(k)}<h2>${__h('Vaccines')}</h2>${vacHtml}<h2>${__h('Doctor visits')}</h2>${visHtml}
    <button class="btn pdfbtn" id="pdfBtn">📄 ${__h('Report for the doctor (PDF)')}</button>
    <p class="note">${__h('Only people who may see health notes see the health record. Like everything in the log, it is end-to-end encrypted.')}</p>`;
}
/** The way back from a page of its own (the health record): a bar that stays at the top while the page scrolls, with a big "Back to …"
    to the screen it was opened from and "Today" for today's Day page. The tabs below work as always. */
function backBar(back) {
  return `<div class="backbar"><button class="btn backbtn" data-recback><span class="bk" aria-hidden="true">‹</span><span>${__h('Back to {screen}', { screen: __(back) })}</span></button>
    <button class="btn homebtn" data-home>📅 ${__h('Today')}</button></div>`;
}
/** The button to a child's health record (the Guide, More → Children). */
function recordButton(k) {
  const mine = db.events.filter(e => childOf(e) === k.id), n = t => mine.filter(e => e.type === t).length;
  const sum = [n('vaccine') && __n('{n} vaccine', '{n} vaccines', n('vaccine')), n('visit') && __n('{n} visit', '{n} visits', n('visit')), n('growth') && __n('{n} measurement', '{n} measurements', n('growth'))].filter(Boolean).join(' · ');
  return `<button class="docbtn recbtn" data-record="${k.id}"><span class="di">📋</span><span><b>${kids().length > 1 ? __h("{name}'s health record", { name: kidName(k) }) : __h('Health record')}</b><small>${sum ? esc(sum) : __h('Allergies, vaccines, doctor visits, height and weight')}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}

// ---------- Big moments ----------
// The firsts and the days to remember (the first smile, the first steps, the first day of school) are entries of their own, shared and
// end-to-end encrypted like the rest of the log. They show at the top of their day, with a star on the calendar, and in the Month tab's
// journal, in chapters for each stage of growing up. stages.js has ideas for every age; anything else can be written in.
const momentsOf = ids => { const set = new Set(ids); return db.events.filter(e => e.type === 'moment' && set.has(childOf(e))).sort((a, b) => a.ts - b.ts); };
/** A big moment's pictures and videos, as thumbnails to tap (the thumbnails this phone hasn't got yet are fetched meanwhile). */
function mediaStrip(e) {
  const list = (e.data || {}).media || []; if (!list.length) return '';
  Media.prime(list);
  return `<div class="mstrip">${list.map(m => { const u = Media.url(m.id + '.t'); return `<button type="button" class="mthumb${u ? '' : ' wait'}" data-media="${e.id}:${m.id}" aria-label="${m.kind === 'video' ? __h('Video') : __h('Picture')}">${u ? `<img src="${u}" alt="">` : '<span class="ph">🖼</span>'}${m.kind === 'video' ? '<span class="play" aria-hidden="true">▶</span>' : ''}</button>`; }).join('')}</div>`;
}
/** Tapping a thumbnail opens the picture or video big (on the page, and in a moment's sheet). */
function bindMedia(root) {
  root.querySelectorAll('[data-media]').forEach(b => b.onclick = x => { x.stopPropagation(); const [eid, mid] = b.dataset.media.split(':'); const e = db.events.find(y => y.id === eid); if (e) openMediaView(e, mid); });
}
/** A big moment as a card: what happened, for whom (on a page with several children) and how old they were; in the journal, the day. */
function momentRow(e, inJournal) {
  const k = kidById(childOf(e)), [what] = describe(e), age = k ? Stages.age(k.birth, e.ts) : '';
  const sub = [inJournal && fmtDay(dkey(e.ts)), !inJournal && kids().length > 1 && k && kidName(k), age].filter(Boolean).join(' · ');
  return `<button class="card moment" data-moment="${e.id}"><span class="mi">🌟</span><span class="mb"><b>${esc(what)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${e.note ? `<small class="mn">“${esc(e.note)}”</small>` : ''}${byLine(e)}</span></button>${mediaStrip(e)}`;
}
/** The day's big moments, at the top of the day. */
const momentCards = day => momentsOf(pageKids().map(k => k.id)).filter(e => e.ts >= day && e.ts < day + DAY).map(e => momentRow(e)).join('');
/** At the bottom of the Day page: save a big moment, with a few ideas for the child's age. */
function momentButton() {
  if (!Sync.can('add')) return '';
  const k = pageKids()[0], have = new Set(momentsOf([k.id]).map(e => e.data.what));
  const ideas = Stages.ideas(stageOf(k, Math.min(viewDay, Date.now()))).filter(w => w !== 'Birthday' && !have.has(w)).slice(0, 3);
  return `<button class="momentbtn" data-momentnew><span class="tm">🌟</span><span><b>${__h('Save a big moment')}</b><small>${ideas.length ? ideas.map(w => __h(w)).join(' · ') : __h('A first, or a day to remember')}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}
/** A big moment, for someone who may not change it. */
function momentInfo(e) {
  const k = kidById(childOf(e)), [what] = describe(e);
  popup(`<h3>🌟 ${esc(what)}</h3><p class="note">${esc([fmtDay(dkey(e.ts)), kids().length > 1 && k && kidName(k), k && Stages.age(k.birth, e.ts)].filter(Boolean).join(' · '))}</p>
    ${e.note ? `<p>“${esc(e.note)}”</p>` : ''}${byLine(e)}${mediaStrip(e)}<div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Close')}</button></div>`);
  bindMedia($('#sheet'));
}
/** Save a big moment, or change one: what happened (an idea for the child's age, or in your own words), the day, and a note. */
function openMoment(ev, pre = {}) {
  const editing = !!ev;
  if (editing ? !Sync.can('edit', ev) : !Sync.can('add')) return toast(__("You don't have permission to do that"));
  const multi = kids().length > 1, k = kidById(ev ? childOf(ev) : pre.kid || (dayKid() === 'all' ? kids()[0].id : dayKid())) || kids()[0];
  const d = (ev && ev.data) || {}, day = startOfDay(Math.min(ev ? ev.ts : pre.day ?? Date.now(), Date.now()));
  const have = new Set(momentsOf([k.id]).filter(e => e !== ev && !e.data.own).map(e => e.data.what)), cur = d.own ? '' : d.what || pre.what || '';
  const st = stageOf(k, day), fresh = w => w === 'Birthday' || w === cur || !have.has(w);   // (a first can only happen once)
  const mine = Stages.ideas(st).filter(fresh);
  const others = Stages.IDS.filter(x => x !== st).map(x => [x, (Stages.MOMENTS[x] || []).filter(w => fresh(w) && !mine.includes(w))]).filter(([, l]) => l.length);
  const who = multi ? `<label class="f">${editing ? __h('For') : __h('For (tick everyone it applies to)')}</label><div class="chips kidchips">${kids().map(c => `<label class="chip kidchip" style="--k:${c.color}"><input type="${editing ? 'radio' : 'checkbox'}" name="mmKid" value="${c.id}" ${c.id === k.id ? 'checked' : ''}><span>${avatar(c)}${esc(kidName(c))}</span></label>`).join('')}</div>` : '';
  const ideas = (list, x) => `${x ? `<p class="mh">${__h(Stages.byId(x).name)}</p>` : ''}<div class="chips mmideas">${list.map(w => chip('mmWhat', w, __h(w), w === cur, '', true)).join('')}</div>`;
  const close = popup(`<h3>🌟 ${editing ? __h('Change the big moment') : __h('Save a big moment')}</h3>${who}
    <label class="f" for="mmDay">${__h('Day')}</label><input id="mmDay" type="date" value="${dkey(day)}" max="${dkey(Date.now())}">
    <label class="f">${__h('What happened?')}</label>${ideas(mine)}
    ${others.length ? `<details class="mmmore"><summary>${__h('Ideas for other ages')}<span class="chev" aria-hidden="true">›</span></summary>${others.map(([x, l]) => ideas(l, x)).join('')}</details>` : ''}
    <label class="f" for="mmOwn">${__h('Or in your own words')}</label><input id="mmOwn" type="text" maxlength="80" value="${d.own ? esc(d.what) : ''}" placeholder="${__h('e.g. First time at the beach')}">
    <label class="f" for="mmNote">${__h('Note (optional)')}</label><textarea id="mmNote" rows="3" maxlength="1000" placeholder="${__h('Where you were, who was there, what they did')}">${esc(ev ? ev.note : '')}</textarea>
    <label class="f">${__h('Picture or video')}</label><div class="mmedia" id="mmMedia"></div>
    <div class="row mmpick"><button type="button" class="btn" id="mmPic">📷 ${__h('Add a picture')}</button><button type="button" class="btn" id="mmVid">🎬 ${__h('Add a video')}</button></div>
    <input type="file" id="mmPicFile" accept="image/*" hidden><input type="file" id="mmVidFile" accept="video/*" hidden>
    <p class="note">${__h('Up to {n} pictures and one video of up to a minute.', { n: Media.MAX.photos })}</p>
    <div class="row" style="margin-top:14px">${editing && Sync.can('delete', ev) ? `<button class="btn d" id="mmDel">${__h('Delete')}</button>` : ''}<button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="mmSave">${__h('Save')}</button></div>`);
  const S = $('#sheet');
  if (cur && others.some(([, l]) => l.includes(cur))) S.querySelector('.mmmore').open = true;
  // pictures and videos: one added is kept on this phone at once (and sent with the next sync); one taken off goes with Save
  let media = [...(d.media || [])]; const added = [], dropped = [], limits = () => toast(__('Up to {n} pictures and one video of up to a minute.', { n: Media.MAX.photos }));
  const drawMedia = () => {
    const box = $('#mmMedia'); if (!box) return;
    box.innerHTML = media.map(m => { const u = Media.url(m.id + '.t'); return `<div class="mthumb">${u ? `<img src="${u}" alt="">` : '<span class="ph">🖼</span>'}${m.kind === 'video' ? '<span class="play" aria-hidden="true">▶</span>' : ''}${Sync.linked() && (db.meta.mediaUp || []).includes(m.id) ? `<span class="pend">${__h('Not uploaded yet')}</span>` : ''}<button type="button" class="x" data-mmrm="${m.id}" aria-label="${__h('Remove')}">×</button></div>`; }).join('');
    box.querySelectorAll('[data-mmrm]').forEach(b => b.onclick = () => { const id = b.dataset.mmrm; media = media.filter(m => m.id !== id); if (added.includes(id)) { added.splice(added.indexOf(id), 1); Media.discard([id]); } else dropped.push(id); drawMedia(); });
    $('#mmPic').disabled = media.filter(m => m.kind === 'photo').length >= Media.MAX.photos; $('#mmVid').disabled = media.filter(m => m.kind === 'video').length >= Media.MAX.videos;
  };
  const take = async (input, kind) => {
    const file = input.files && input.files[0]; input.value = ''; if (!file) return;
    if (media.filter(m => m.kind === kind).length >= (kind === 'video' ? Media.MAX.videos : Media.MAX.photos)) return limits();
    const btn = kind === 'video' ? $('#mmVid') : $('#mmPic'), label = btn.innerHTML; btn.disabled = true; btn.textContent = __('Loading…');
    try {
      const prep = kind === 'video' ? await Media.fromVideo(file) : await Media.fromPhoto(file);
      if (prep.error) return toast(prep.error);
      const item = await Media.stage(prep); media.push(item); added.push(item.id); save(true);
    } catch (e) { toast(__("That file isn't a picture or a video Little Log can show.")); }
    finally { btn.innerHTML = label; Icons.paint(btn); drawMedia(); }
  };
  $('#mmPic').onclick = () => $('#mmPicFile').click(); $('#mmVid').onclick = () => $('#mmVidFile').click();
  $('#mmPicFile').onchange = () => take($('#mmPicFile'), 'photo'); $('#mmVidFile').onchange = () => take($('#mmVidFile'), 'video');
  drawMedia();
  const bail = () => { if (added.length) { Media.discard(added); save(true); } close(); };   // (closed without saving: the new pictures go again)
  $('#sheetBack').onclick = bail; S.querySelectorAll('[data-close]').forEach(b => b.onclick = bail);
  $('#mmOwn').oninput = () => { if ($('#mmOwn').value.trim()) S.querySelectorAll('[name=mmWhat]:checked').forEach(r => { r.checked = false; }); };
  S.querySelectorAll('[name=mmWhat]').forEach(r => r.addEventListener('change', () => { if (r.checked) $('#mmOwn').value = ''; }));
  if ($('#mmDel')) $('#mmDel').onclick = () => { if (confirm(__('Delete this entry?'))) { removeEvent(ev); save(); close(); render(); toast(__('Deleted')); } };
  $('#mmSave').onclick = () => {
    const own = $('#mmOwn').value.trim().slice(0, 80), pick = S.querySelector('[name=mmWhat]:checked'), what = own || (pick ? pick.value : '');
    if (!what) return toast(__('Choose what happened, or write it'));
    const dv = $('#mmDay').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dv) || dv > dkey(Date.now())) return toast(__('Please pick a date'));
    const d0 = new Date(dv + 'T00:00').getTime(), ts = editing && dkey(ev.ts) === dv ? ev.ts : d0 === startOfDay(Date.now()) ? Date.now() : d0 + 12 * 60 * MIN;
    const ids = multi ? [...S.querySelectorAll('[name=mmKid]:checked')].map(c => c.value).filter(id => kidById(id)) : [kids()[0].id];
    if (!ids.length) return toast(__('Choose who this is for'));
    const data = own && !Stages.known(own) ? { what: own, own: true } : { what };   // (typed in: shown as typed)
    if (media.length) data.media = media;
    for (const id of ids) {
      const rec = ev || { id: uid(), type: 'moment', by: Auth.id || undefined };
      Object.assign(rec, { ts, data: structuredClone(data), note: $('#mmNote').value.trim(), updated: stamp(), child: id });
      if (!ev) db.events.push(rec);
    }
    if (dropped.length) Media.discard(dropped);
    save(); close(); viewDay = startOfDay(ts); render(); toast(ids.length > 1 ? __n('Saved for {n} child', 'Saved for {n} children', ids.length) : __('Saved'));
  };
}
/** A big moment's picture or video, big: ‹ › through them, and a copy to keep (Save or share). */
async function openMediaView(ev, id) {
  const list = (ev.data || {}).media || []; let i = Math.max(0, list.findIndex(m => m.id === id)), shown = 0;
  const [what] = describe(ev), k = kidById(childOf(ev)), several = list.length > 1;
  popup(`<h3>🌟 ${esc(what)}</h3><p class="note">${esc([fmtDay(dkey(ev.ts)), k && Stages.age(k.birth, ev.ts)].filter(Boolean).join(' · '))}</p><div class="mview" id="mview"></div><p class="note mvn" id="mvn"></p>
    <div class="row" style="margin-top:12px">${several ? `<button type="button" class="btn" id="mvPrev" aria-label="${__h('Back')}">‹</button>` : ''}<button class="btn" data-close>${__h('Close')}</button><button type="button" class="btn" id="mvSave">${__h('Save or share')}</button>${several ? `<button type="button" class="btn" id="mvNext" aria-label="${__h('Next')}">›</button>` : ''}</div>`);
  const show = async () => {
    const m = list[i], box = $('#mview'), n = ++shown; if (!m || !box) return;
    const t = Media.url(m.id + '.t'); box.innerHTML = t ? `<img src="${t}" alt="" class="dim">` : `<span class="ph">${__h('Loading…')}</span>`;
    $('#mvn').textContent = several ? __('{n} of {total}', { n: i + 1, total: list.length }) : '';
    try { const u = await Media.ensure(m.id, m.mime); if (n !== shown || !$('#mview')) return; $('#mview').innerHTML = m.kind === 'video' ? `<video src="${u}" controls playsinline></video>` : `<img src="${u}" alt="">`; }
    catch (e) { if (n === shown) toast(__(e.message)); }
  };
  if (several) { $('#mvPrev').onclick = () => { i = (i + list.length - 1) % list.length; show(); }; $('#mvNext').onclick = () => { i = (i + 1) % list.length; show(); }; }
  $('#mvSave').onclick = async () => {
    const m = list[i];
    try { await Media.ensure(m.id, m.mime); const blob = await Store.blobGet(m.id); if (!blob) throw new Error(N_("Couldn't load it. Check the connection and try again."));
      download(`little-log-${slugOf(what)}-${i + 1}.${m.kind === 'video' ? ((m.mime || '').split('/')[1] || 'mp4').replace(/;.*/, '') : 'jpg'}`, new Uint8Array(await blob.arrayBuffer()), m.mime); }
    catch (e) { toast(__(e.message)); }
  };
  show();
}
/** The Month tab's journal: every big moment of the child, in chapters for each stage of growing up. */
function momentsJournal() {
  const k = kidById(viewKid()); if (!k) return '';
  const list = momentsOf([k.id]);
  let body = '', ch = '';
  for (const e of list) { const st = stageOf(k, e.ts); if (st !== ch) { body += `<p class="mh">${__h(Stages.byId(st).name)}</p>`; ch = st; } body += momentRow(e, true); }
  return `<details class="gd moments" data-grp="moments" ${openGroups.has('moments') ? 'open' : ''}><summary><span class="gi">🌟</span><span class="gt"><b>${__h('Big moments')}</b><small>${list.length ? __hn('{n} big moment', '{n} big moments', list.length) : __h('None saved yet')}</small></span><span class="chev" aria-hidden="true">›</span></summary>
    ${body || `<p class="note">${__h('First smiles, first steps, first days at school: save them as they happen, and they are kept here.')}</p>`}
    ${Sync.can('add') ? `<button class="btn mmadd" data-momentnew>🌟 ${__h('Save a big moment')}</button>` : ''}</details>`;
}

// ---------- Guide ----------
function doctorHtml() {
  const d = (db.baby.doctor || {}), set = d.name || d.phone || d.practice;
  return `<button class="docbtn" id="docBtn"><span class="di">🩺</span><span><b>${__h('Pediatrician')}</b><small>${set ? esc([d.name, d.practice].filter(Boolean).join(' · ')) + (d.phone ? ' · ' + esc(d.phone) : '') : __h('Add their name and number')}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}
/** Not an emergency? The region's health advice line, and the nurse, after-hours and hospital non-emergency numbers saved with the pediatrician, each with a Call button. */
function calmLinesHtml() {
  const d = Guide.cleanDoctor(db.baby.doctor);
  const lines = [[N_('Nurse advice line'), d.nurse], [N_('After hours'), d.after], [d.hospital ? __('{hospital}, non-emergency line', { hospital: d.hospital }) : N_('Hospital non-emergency line'), d.hospPhone]].filter(([, v]) => v);
  return `<div class="note calm"><b>${__h('Not an emergency?')}</b> ${__h(Guide.advice(myRegion()))}
    ${lines.map(([l, v]) => `<div class="stat"><span>${__h(l)}<br><b class="sel">${esc(v)}</b></span>${Guide.tel(v) ? `<a class="btn callbtn" href="${esc(Guide.tel(v))}">📞 ${__h('Call')}</a>` : ''}</div>`).join('')}</div>`;
}
function guideView() {
  const now = Date.now(), everyone = curKid() === 'all';
  // who the Guide is for: the child shown, or with Everyone chosen the whole family (every key part of every age in it)
  const who = everyone ? kids() : pageKids(), months = k => (k.birth ? Stages.months(k.birth, now) : 0), stg = k => stageOf(k, now);
  const ks = (everyone ? kids() : [kidById(viewKid())]).filter(k => k && k.birth), cur = ks.map(k => [k, Guide.monthsOld(k.birth, now)]).filter(([, m]) => m >= 0);
  const all = s => who.length > 0 && who.every(k => Stages.from(stg(k), s)), some = f => who.some(f);
  const ms = Object.entries(Guide.MILESTONES), sos = __(Guide.sos(myRegion())), older = all('toddler'), schoolAge = all('school'), teenAge = all('teen'), ten = some(k => months(k) >= 120);
  // the baby years go at 5 (the newborn worries, the solids, the baby medicines) and the month-by-month milestones at 6 (a 5-year-old's
  // list keeps the preschool years); with Everyone chosen, a younger child in the family keeps them all
  const youngest = who.length ? Math.min(...who.map(months)) : 0, babyDays = youngest < 60, under6 = youngest < 72, msList = ms.filter(([n]) => youngest < 60 || +n >= 36);
  // what is common at the child's age: the milestones until 5, then what the school and teenage years are about
  const nowCard = ([k, m]) => {
    const key = ms.map(([n]) => +n).filter(n => n <= Math.max(1, m)).pop() || 1, M = Guide.MILESTONES[key], st = stageOf(k, now), note = Guide.STAGE_NOTES[st === 'grown' ? 'teen' : st];
    const age = m < 1 ? __n('{n} week', '{n} weeks', Math.max(0, Math.floor((now - new Date(k.birth + 'T00:00').getTime()) / DAY / 7))) : m < 24 ? __n('{n} month', '{n} months', m) : Stages.age(k.birth, now);
    return `<div class="card nowcard" style="--k:${k.color}">${kids().length > 1 ? avatar(k) + ' ' : ''}<b>${__h('{name} is {age} old', { name: kidName(k), age })}</b>
      ${note ? `<p class="note">${__h(note)}</p>` : `<p class="note">${m < 1 ? __h('The first month is mostly feeding, sleeping and getting to know each other. Here is what is common around one month:') : __h('Around {age}:', { age: __(M.title) })}</p><ul>${M.does.map(x => `<li>${__h(x)}</li>`).join('')}</ul>`}</div>`;
  };
  const card = (grp, c) => `<details class="gd" data-grp="${grp}${c.id}" ${openGroups.has(grp + c.id) ? 'open' : ''}><summary><span class="gi">${c.icon}</span><span class="gt"><b>${__h(c.title)}</b></span><span class="chev" aria-hidden="true">›</span></summary>
    <p>${__h(c.body)}</p>${c.call ? `<p class="call">${__h(c.call, { sos })}</p>` : ''}${grp === 'g' ? picsHtml(c.id) : ''}</details>`;
  // each part of the Guide folds (the pediatrician, the health record and Right now stay on the page); open ones stay open while the app runs
  const sec = (id, title, inner, count) => `<details class="sec" data-grp="sec${id}" ${openGroups.has('sec' + id) ? 'open' : ''}><summary><h2>${title}</h2>${count ? `<small>${count}</small>` : ''}<span class="chev" aria-hidden="true">›</span></summary>${inner}</details>`;
  const topics = n => __hn('{n} topic', '{n} topics', n);
  const newborn = sec('newborn', __h('Common with newborns'), Guide.COMMON.map(c => card('g', c)).join(''), topics(Guide.COMMON.length));
  const toddler = sec('toddler', __h('Toddlers and preschoolers'), Guide.TODDLER.map(c => card('t', c)).join(''), topics(Guide.TODDLER.length));
  // tutorials: one twirl-down of videos, a twirl-down per topic inside it, for the ages on the page (every age, when no child has a birth date)
  const tutAges = who.filter(k => k.birth).map(k => months(k)), tuts = Guide.TUTORIALS.filter(t => !tutAges.length || tutAges.some(m => m >= t.ages[0] && m <= t.ages[1]));
  const tutorials = !tuts.length ? '' : `<details class="gd tut" data-grp="videos" ${openGroups.has('videos') ? 'open' : ''}><summary><span class="gi">▶️</span><span class="gt"><b>${__h('Tutorials: videos worth watching')}</b><small>${__h("First meals, snacks, potty training, first aid, safe sleep and more, from health services and children's hospitals")}</small></span><span class="chev" aria-hidden="true">›</span></summary>
    <p class="note">${__h("Short videos in English, chosen from public health bodies and children's hospitals. They open in YouTube. Little Log did not make them, and they can change or disappear.")}</p>
    ${tuts.map(t => `<details class="gd med" data-grp="vid${t.id}" ${openGroups.has('vid' + t.id) ? 'open' : ''}><summary><span class="gi">${t.icon}</span><span class="gt"><b>${__h(t.title)}</b><small>${__hn('{n} video', '{n} videos', t.videos.length)}</small></span><span class="chev" aria-hidden="true">›</span></summary>
      ${t.videos.map(([id, title, who, mins]) => `<button class="vrow video" data-yt="${id}"><b>${esc(title)}</b><small>${esc(who)} · ${__h('{n} min', { n: mins })}</small></button>`).join('')}</details>`).join('')}</details>`;
  // puberty: from 8 (it can start then) until 16, before the teenage topics
  const puberty = some(k => months(k) >= 96 && months(k) < 192) ? sec('puberty', __h('Puberty'), Guide.PUBERTY.map(c => card('pb', c)).join(''), topics(Guide.PUBERTY.length)) : '';
  const school = sec('school', __h('School age'), Guide.SCHOOL.map(c => card('s', c)).join(''), topics(Guide.SCHOOL.length));
  const teens = sec('teens', __h('Teenagers'), Guide.TEEN.map(c => card('n', c)).join(''), topics(Guide.TEEN.length));
  const food = sec('food', __h('Food'), `<details class="gd" data-grp="gsolids" ${openGroups.has('gsolids') ? 'open' : ''}><summary><span class="gi">🥄</span><span class="gt"><b>${__h('Starting solid foods')}</b><small>${__h('From around 6 months, with the key allergens early')}</small></span><span class="chev" aria-hidden="true">›</span></summary>
    ${solidsGuideHtml(sos)}</details>${allergenHtml(kidById(viewKid()))}`, topics(2));
  const meds = sec('meds', __h('Medicines'), medsHtml(), topics(Guide.MEDS.length + 1)), checks = sec('checks', __h('Health checks'), Guide.CHECKS.map(c => card('h', c)).join(''), topics(Guide.CHECKS.length));
  // toys for the ages in the family: each child's age and the one after it (what suits them now, and what comes next); with Everyone, every age in it
  const toyIds = Guide.TOYS.map(t => t.id), want = new Set();
  for (const k of who) { const i = toyIds.indexOf(stg(k) === 'grown' ? 'teen' : stg(k)); if (i >= 0) { want.add(toyIds[i]); if (toyIds[i + 1]) want.add(toyIds[i + 1]); } }
  if (!want.size) { want.add('newborn'); want.add('baby'); }
  const toyCard = t => `<details class="gd" data-grp="y${t.id}" ${openGroups.has('y' + t.id) ? 'open' : ''}><summary><span class="gi">${t.icon}</span><span class="gt"><b>${__h(t.title)}</b></span><span class="chev" aria-hidden="true">›</span></summary>
    <p>${__h(t.body)}</p><ul>${t.toys.map(x => `<li>${__h(x)}</li>`).join('')}</ul><p class="call">${__h(t.safety)}</p></details>`;
  const toys = Guide.TOYS.filter(t => want.has(t.id));
  const play = sec('play', __h('Play and activities'), `${toys.map(toyCard).join('')}${card('a', Guide.SWIM)}`, topics(toys.length + 1));
  const milestones = sec('months', __h('Month by month'), msList.map(([n, M]) => milestoneDetails(+n, M)).join(''), __hn('{n} age', '{n} ages', msList.length));
  const head = `${doctorHtml()}
  ${Sync.can('health') && kidById(viewKid()) ? recordButton(kidById(viewKid())) : ''}
  <p class="note emer"><b>${__h('Emergency?')}</b> ${older ? __h('Call {sos} for blue lips or face, trouble breathing, a child who is hard to wake, or a seizure.', { sos }) : __h('Call {sos} for blue lips or face, trouble breathing, a baby who is hard to wake, or a seizure.', { sos })}</p>
  ${calmLinesHtml()}
  ${cur.length ? `<h2>${__h('Right now')}</h2>${cur.map(nowCard).join('')}` : ''}`;
  const foot = `<p class="note">${__h("General information from AAP, CDC, FDA and NHS parent guidance, not medical advice. Every baby develops at their own pace; if your baby was born early, count from the due date. If you're ever worried, call your pediatrician, you don't need to wait for a checkup.")}</p>
  ${I18n.lang() === 'en' ? '' : `<p class="note">${__h('This translation was made with the help of AI and may have mistakes. In an emergency, call {sos}. If something reads wrong, tell us: More → Language → Report a language issue.', { sos })}</p>`}
  ${babyDays ? picCreditsHtml() : ''}`;
  // Everyone: every key part for the ages in the family, youngest first
  if (everyone && who.length > 1) {
    return `${head}
    ${babyDays ? newborn + food + meds : ''}
    ${some(k => !Stages.from(stg(k), 'school')) ? toddler : ''}
    ${some(k => Stages.from(stg(k), 'school') && !Stages.from(stg(k), 'teen')) || some(k => stg(k) === 'preschool') ? school : ''}
    ${puberty}
    ${some(k => Stages.from(stg(k), 'teen')) || ten ? teens : ''}
    ${play}
    ${tutorials}
    ${checks}
    ${under6 ? milestones : ''}
    ${foot}`;
  }
  // one child: the topics of their stage first; those of the next stage near the end, as what comes next (the school years for a
  // preschooler, the teenage years from 10); a baby's Guide puts the newborn worries first and the toddler years later
  return `${head}
  ${puberty}
  ${teenAge ? teens : schoolAge ? school : older ? toddler : ''}
  ${babyDays ? food : ''}
  ${older ? '' : newborn}
  ${babyDays ? meds : ''}
  ${play}
  ${tutorials}
  ${checks}
  ${older ? '' : toddler}
  ${under6 ? milestones : ''}
  ${!schoolAge && all('preschool') ? school : ''}${schoolAge && !teenAge && ten ? teens : ''}
  ${older && babyDays ? newborn : ''}
  ${foot}`;
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
  return `<details class="gd" data-grp="credits" ${openGroups.has('credits') ? 'open' : ''}><summary><span class="gi">📷</span><span class="gt"><b>${__h('Picture and sound credits')}</b><small>${__h('From Wikimedia Commons, under free licences')}</small></span><span class="chev" aria-hidden="true">›</span></summary>
    <ul class="credits pics">${Guide.credits().map(c => `<li><b>${__h(c.name)}</b>: ${__h(c.drawing ? 'drawing by {by}, {licence}' : 'photo by {by}, {licence}', { by: c.by, licence: __(c.lic) })}${c.licUrl ? ` <span class="url">(${esc(c.licUrl)})</span>` : ''}. ${__h('From')} <span class="url">${esc(c.page)}</span>${c.edit ? `, ${__h(c.edit)}` : ''}.</li>`).join('')}</ul>
    <p class="note">${__h('Our versions of the CC BY-SA pictures are shared under the same licence.')}</p>
    <p class="note"><b>${__h('The birds on the family tree sing when tapped.')}</b> ${__h('Their songs are a few seconds of these recordings:')}</p>
    <ul class="credits songs">${Birdsong.credits().map(c => `<li><b>${__h(c.name)}</b> (${esc(c.species)}${c.note ? ', ' + __h(c.note) : ''}): ${__h('recording by {by}, {licence}', { by: c.by, licence: __(c.lic) })}${c.licUrl ? ` <span class="url">(${esc(c.licUrl)})</span>` : ''}. ${__h('From')} <span class="url">${esc(c.page)}</span>, ${__h('trimmed to a few seconds and re-encoded')}.</li>`).join('')}</ul>
    <p class="note">${__h('Our copies of the CC BY-SA recordings are shared under the same licence.')}</p></details>`;
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
    <div class="artgrid">${Art.THEMES.filter(t => !t.travel).map(t => { const u = Art.peek(t.id, 0.7, dark()); return `<button class="artopt ${t.id === cur ? 'on' : ''}" data-pick="${t.id}" aria-pressed="${t.id === cur}"><span class="thumb" style="background:${dark() ? '#1a2240' : t.base}"><img alt="" data-th="${t.id}"${u ? ` src="${u}"` : ''}><i></i></span><span class="an">${__h(t.name)}</span></button>`; }).join('')}</div>
    ${multi && forId !== 'all' ? `<div class="chips" style="margin-top:12px">${chip('artAll', 1, __h('Use it for every child'), false)}</div>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn" data-close>${__h('Done')}</button></div>`);
  $('#sheet').querySelectorAll('img[data-th]').forEach(img => { if (!img.getAttribute('src')) Art.url(img.dataset.th, 0.7, dark()).then(u => { img.src = u; }); });
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
  const S = $('#sheet'), back = $('#sheetBack'); S.innerHTML = html; S.onchange = S.oninput = null; Icons.paint(S); S.hidden = back.hidden = false;
  const close = () => { S.hidden = back.hidden = true; }; back.onclick = close; S.querySelectorAll('[data-close]').forEach(b => b.onclick = close); sheetX(); return close;
}
/** Every sheet gets a big close button in its top corner that stays put while the sheet scrolls, so the way out is never below the
    fold. It closes the sheet the way tapping outside it does (and so does whatever that sheet does then, like stopping the camera). */
function sheetX() {
  const S = $('#sheet');
  if (!S.querySelector('.sheetx')) S.insertAdjacentHTML('afterbegin', `<div class="sheetxw"><button type="button" class="sheetx" aria-label="${__h('Close')}">×</button></div>`);
  S.querySelector('.sheetx').onclick = () => $('#sheetBack').click();
}
function openDoctor(edit) {
  const d = Guide.cleanDoctor(db.baby.doctor), can = Sync.can('profile');
  const line = (label, v, call) => (v ? `<div class="stat"><span>${__h(label)}<br><b class="sel">${esc(v)}</b></span>${call && Guide.tel(v) ? `<a class="btn callbtn" href="${esc(Guide.tel(v))}">📞 ${__h('Call')}</a>` : ''}</div>` : '');
  if (!edit) {
    const info = [line(N_('Doctor'), d.name), line(N_('Practice'), d.practice), line(N_('Phone'), d.phone, true), line(N_('Nurse advice line'), d.nurse, true), line(N_('After hours'), d.after, true), line(N_('Hospital'), d.hospital), line(N_('Hospital non-emergency line'), d.hospPhone, true), line(N_('Address'), d.address), line(N_('Notes'), d.notes)].join('');
    const close = popup(`<h3>🩺 ${__h('Pediatrician')}</h3>${info || `<p class="note">${__h('No pediatrician saved yet.')} ${can ? __h('Add their details so everyone looking after the baby has the number.') : __h('A parent can add them.')}</p>`}
      <div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Close')}</button>${can ? `<button class="btn p" id="docEdit">${info ? __h('Edit') : __h('Add details')}</button>` : ''}</div>`);
    if ($('#docEdit')) $('#docEdit').onclick = () => { close(); openDoctor(true); };
    return;
  }
  const f = (id, label, v, max, type = 'text') => `<label class="f">${__h(label)}</label><input id="${id}" type="${type}" maxlength="${max}" value="${esc(v)}"${type === 'tel' ? ' inputmode="tel"' : ''}>`;
  const close = popup(`<h3>🩺 ${__h('Pediatrician')}</h3><p class="note">${__h('Shared with everyone in the log, end-to-end encrypted.')}</p>
    ${f('dcName', N_('Doctor'), d.name, 60)}${f('dcPractice', N_('Practice or clinic'), d.practice, 80)}${f('dcPhone', N_('Phone'), d.phone, 30, 'tel')}${f('dcNurse', N_('Nurse advice line'), d.nurse, 30, 'tel')}${f('dcAfter', N_('After hours'), d.after, 30, 'tel')}
    <p class="note">${__h('When it is not an emergency: the nurse line answers questions about fever, rashes or medicine doses; the hospital\'s non-emergency line is for advice and to ask whether to come in.')}</p>
    ${f('dcHosp', N_('Hospital'), d.hospital, 80)}${f('dcHospPhone', N_('Hospital non-emergency line'), d.hospPhone, 30, 'tel')}${f('dcAddr', N_('Address'), d.address, 120)}
    <label class="f">${__h('Notes')}</label><textarea id="dcNotes" rows="2" maxlength="200">${esc(d.notes)}</textarea>
    <div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Cancel')}</button><button class="btn p" id="dcSave">${__h('Save')}</button></div>`);
  $('#dcSave').onclick = () => {
    db.baby.doctor = Guide.cleanDoctor({ name: $('#dcName').value, practice: $('#dcPractice').value, phone: $('#dcPhone').value, nurse: $('#dcNurse').value, after: $('#dcAfter').value, hospital: $('#dcHosp').value, hospPhone: $('#dcHospPhone').value, address: $('#dcAddr').value, notes: $('#dcNotes').value });
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
  // a new stage of growing up: what changes in the app (stages.js); on a birthday, a way to keep it as a big moment
  const grow = { 12: N_('Little Log grows with {name}: Meals and Potty are on the Day page now, milk feeds are called Milk, and the buttons you stop using move behind More. The Guide has topics for toddlers.'),
    36: N_('The preschool years: the Day page and the Guide keep growing with {name}.') }[m];
  const day = new Date(who[0].birth + 'T12:00'); day.setMonth(day.getMonth() + m);
  popup(`<h3>🌟 ${who.length > 1 ? __h('{names} are {age} old', { names: andList(names), age }) : __h('{name} is {age} old', { name: names[0], age })}</h3><p class="note">${m >= 24 ? __h("Every child is different; this is what's common around now.") : __h("Every baby is different; this is what's common around now.")}</p>
    ${grow ? `<p class="grow">🌿 ${__h(grow, { name: andList(names) })}</p>` : ''}${m === 12 ? `<p class="grow">📷 ${__h('Something new on the Stats page: Pictures of {name} has a second row now, one picture for every birthday from one to eighteen. The 12-month picture is the first birthday picture too.', { name: andList(names) })}</p>` : ''}${milestoneBody(M)}
    ${m % 12 === 0 && Sync.can('add') ? `<button class="btn" id="msMoment" style="width:100%;margin-top:12px">🌟 ${__h('Save the birthday as a big moment')}</button>` : ''}
    ${m === 12 ? `<button class="btn" id="picsGo" style="width:100%;margin-top:8px">📷 ${__h('See the pictures')}</button>` : ''}
    ${M.visit && Sync.can('add') && Sync.can('health') ? `<button class="btn" id="msVisit" style="width:100%;margin-top:8px">🏥 ${__h('Save the checkup in the health record')}</button>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Close')}</button><button class="btn p" id="msGuide">${__h('More in the Guide')}</button></div>`);
  $('#msGuide').onclick = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; tab = 'guide'; render(); window.scrollTo(0, 0); };
  if ($('#msMoment')) $('#msMoment').onclick = () => openMoment(null, { kid: who[0].id, what: 'Birthday', day: Math.min(day.getTime(), Date.now()) });
  if ($('#msVisit')) $('#msVisit').onclick = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; setKid(who[0].id); openSheet('visit', null, { kind: 'Checkup' }); };
  if ($('#picsGo')) $('#picsGo').onclick = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; tab = 'stats'; setKid(who[0].id); openGroups.add('mpics'); render(); const d = document.querySelector('details[data-grp=mpics]'); if (d) d.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
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
    <div class="row">${Sync.can('edit', tr) ? `<button class="btn" data-tripedit="${tr.id}">${__h('Change trip')}</button>${live && today ? `<button class="btn" data-triphome>${__h("We're home")}</button>` : ''}` : ''}<button class="btn" data-tripcal="${tr.id}">📅 ${__h('Add to calendar')}</button></div></div>`;
}
/** At the bottom of today's page: switch to travel mode, or the trip coming up. */
function tripButton() {
  if (!Sync.can('add')) return '';
  const up = Travel.upcoming(db.events, Date.now());
  if (up) { const M = Travel.MEANS[Travel.meansOf(up)]; return `<button class="tripbtn" data-tripedit="${up.id}"><span class="tm">${M.icon}</span><span><b>${__h('Trip coming up {by}', { by: __(M.by) })}</b><small>${__h('{from} – {to}. Tap to change it.', { from: fmtShort(up.ts), to: fmtShort(Travel.ends(up) - 1) })}</small></span><span class="chev" aria-hidden="true">›</span></button>`; }
  return `<button class="tripbtn" data-tripnew><span class="tm">🧳</span><span><b>${__h('Travelling?')}</b><small>${__h('Switch to travel mode for the trip: quicker logging and a clock to match the journey')}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}
/** What has a one-tap sheet for travel mode (openQuick). */
const QUICKABLE = ['feed', 'meal', 'diaper', 'potty', 'sleep', 'vomit'];
/** Travel: the (up to) four things a child of this age is logged for most, sleep always among them: { big, rest }. */
function travelTypes() {
  const { shown, more } = dayButtons(), q = shown.filter(t => QUICKABLE.includes(t));
  const big = q.length > 4 ? q.filter(t => t === 'sleep' || q.filter(x => x !== 'sleep').indexOf(t) < 3) : q;
  return { big, rest: [...shown, ...more].filter(t => !big.includes(t)) };
}
/** Travel: the four things logged most, as big buttons with one-tap sheets; the rest are one more tap away. */
function travelQuick() {
  if (!Sync.can('add')) return '';
  const P = Travel.PALETTE.light, { big, rest } = travelTypes(), young = !allFrom('toddler');
  const label = { feed: young ? N_('Feed') : N_('Milk'), diaper: N_('Diaper'), sleep: N_('Asleep'), vomit: young ? N_('Spit-up') : N_('Vomit'), meal: N_('Meal'), potty: N_('Potty') };
  const babyRest = ['wake', 'play', 'health', 'med'], usual = rest.length && rest.every(t => babyRest.includes(t)) && rest.includes('wake') && rest.includes('play');
  const what = usual ? (rest.includes('health') ? __h('More: play, wake-ups, health and medicine') : __h('More: play, wake-ups'))
    : __h('More: {list}', { list: rest.slice(0, 4).map(t => __(tLabel(t))).join(' · ') + (rest.length > 4 ? ' …' : '') });
  return `<div class="quick tq">${big.map(k => `<button data-qadd="${k}" style="--cw:${Kids.rgba(P[groupOf(k).id], 0.3)}"><b>${TYPES[k].icon}</b>${__h(label[k])}</button>`).join('')}</div>
    ${rest.length ? `<button class="qmore" data-qmore="${rest.join(' ')}">${what}</button>` : ''}`;
}
/** The rest of what there is to log, a tap away (the Day page's More, and travel mode's). */
function openMoreTypes(types = travelTypes().rest) {
  types = types.filter(k => TYPES[k] && (Sync.can('health') || !isPrivate(k)));
  const close = popup(`<h3>${__h('More to log')}</h3><div class="quick">${types.map(k => `<button data-more="${k}" style="--cw:${Kids.rgba(TYPES[k].color, 0.3)}"><b>${TYPES[k].icon}</b>${__h(tLabel(k))}</button>`).join('')}</div>
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
  if (type === 'sleep' && resumeIfPaused()) return;
  if (!Sync.can('add')) return toast(__("You don't have permission to do that"));
  const T = TYPES[type], multi = kids().length > 1, page = dayKid(), pre = page === 'all' ? kids().map(k => k.id) : [page];
  const prev = db.events.filter(e => e.type === type && pre.includes(childOf(e))).sort((a, b) => b.ts - a.ts)[0], pd = (prev && prev.data) || {};
  const big = (name, opts, cur, cls = '') => `<div class="chips big ${cls}">${opts.map(([v, l]) => chip(name, v, l, String(v) === String(cur), '', true)).join('')}</div>`;   // (labels come as HTML)
  const near = (v, list) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const who = multi ? `<div class="chips kidchips">${kids().map(k => `<label class="chip kidchip" style="--k:${k.color}"><input type="checkbox" name="qkid" value="${k.id}" ${pre.includes(k.id) ? 'checked' : ''}><span>${avatar(k)}${esc(kidName(k))}</span></label>`).join('')}</div>` : '';
  const ML = volOz() ? [2, 3, 4, 5, 6].map(o => Math.round(o * OZ)) : [60, 90, 120, 150, 180], older = allFrom('toddler');
  let body = '', instant = false, title = __(tLabel(type));
  const ifYouLike = ` <small>${__h('(if you like)')}</small>`;
  if (type === 'feed') body = older ? `<label class="f">${__h('Cup, bottle or breast?')}</label>${big('qkind', [['cup', __h('Cup')], ['bottle', '🍼 ' + __h('Bottle')], ['breast', __h('Breast')]], pd.kind || 'cup')}
    <div id="qBottle"><label class="f">${__h('About how much?')}</label>${big('qml', ML.map(v => [v, esc(fmtVol(v))]), pd.ml ? near(+pd.ml, ML) : ML[2])}${big('qmilk', MILKS_OLDER.map(v => [v, __h(v)]), pd.milk || "Cow's milk")}</div>`
    : `<label class="f">${__h('Bottle or breast?')}</label>${big('qkind', [['bottle', '🍼 ' + __h('Bottle')], ['breast', __h('Breast')]], pd.kind || 'bottle')}
    <div id="qBottle"><label class="f">${__h('About how much?')}</label>${big('qml', ML.map(v => [v, esc(fmtVol(v))]), pd.ml ? near(+pd.ml, ML) : ML[1])}${big('qmilk', [['Formula', __h('Formula')], ['Breast milk', __h('Breast milk')]], pd.milk || 'Formula')}</div>`;
  if (type === 'feed') body += `
    <div id="qBreast"><label class="f">${__h('Side')}${ifYouLike}</label>${big('qside', SIDES.map(v => [v, __h(v)]), '')}
      <label class="f">${__h('About how long?')}${ifYouLike}</label>${big('qmin', [5, 10, 15, 20, 30].map(v => [v, __h('{n} min', { n: v })]), '')}</div>`;
  const texRow = `<label class="f">${__h('Solid or wet?')}${ifYouLike}</label>${big('qtex', STOOL_TEXTURE.map(v => [v, __h(v)]), '')}`;   // (noted for a poo; a pee ignores it)
  if (type === 'diaper') { instant = true; body = `${texRow}<label class="f">${__h('Tap one to save')}</label>${big('qdia', [['pee', '💧 ' + __h('Pee')], ['poo', '💩 ' + __h('Poo')], ['both', __h('Pee + Poo')]], '', 'save')}`; }
  if (type === 'meal') body = `<label class="f">${__h('Which meal?')}</label>${big('qmeal', MEALS.map(v => [v, __h(v)]), mealAt(Date.now()))}
    <label class="f">${__h('How much did they eat?')}${ifYouLike}</label>${big('qeat', EATEN.map(v => [v, __h(v)]), '')}`;
  if (type === 'potty') { instant = true; body = `${texRow}<label class="f">${__h('Tap one to save')}</label>${big('qpot', [['pee', '💧 ' + __h('Pee')], ['poo', '💩 ' + __h('Poo')], ['both', __h('Pee + Poo')], ['accident', __h('Accident')]], '', 'save')}`; }
  if (type === 'vomit') { instant = true; title = older ? __('Vomit') : __('Spit-up'); body = `<label class="f">${__h('Tap one to save')}</label>${big('qvom', [['Spit-up', __h('A little')], ['Large', __h('More than usual')]], '', 'save')}`; }
  if (type === 'sleep') { title = __('Fell asleep'); body = `<label class="f">${__h('Nap or night sleep?')}</label>${big('qnap', [['1', '☀️ ' + __h('Nap')], ['0', '🌙 ' + __h('Night sleep')]], napTime(Date.now()) ? '1' : '0')}<p class="note">${__h('A nap is drawn as a dashed line on the clock, night sleep as a solid one.')}</p>`; }
  const close = popup(`<h3>${T.icon} ${esc(title)}</h3>${who}<label class="f">${__h('When?')}</label>${big('qago', [[0, __h('Just now')], [15, __h('~{n} min ago', { n: 15 })], [30, __h('~{n} min ago', { n: 30 })], [60, __h('~1 hr ago')]], 0)}
    ${body}<div class="row" style="margin-top:16px"><button class="btn" data-close>${__h('Cancel')}</button>${instant ? '' : `<button class="btn p" id="qSave">${__h('Save')}</button>`}</div>`);
  const S = $('#sheet'), val = n => { const c = S.querySelector(`[name=${n}]:checked`); return c ? c.value : ''; };
  const sync = () => { if ($('#qBottle')) { const b = val('qkind') !== 'breast'; $('#qBottle').hidden = !b; $('#qBreast').hidden = b; } };
  S.onchange = sync; sync();
  const commit = () => {
    let ids = multi ? [...S.querySelectorAll('[name=qkid]:checked')].map(c => c.value).filter(id => kidById(id)) : [kids()[0].id];
    if (!ids.length) return toast(__('Choose who this is for'));
    const ago = +val('qago') || 0, ts = Date.now() - ago * MIN, est = ago ? { approx: true } : {};
    let data = { ...est };
    if (type === 'feed') data = val('qkind') === 'breast' ? { kind: 'breast', ...(val('qside') ? { side: val('qside') } : {}), ...(val('qmin') ? { min: +val('qmin') } : {}), ...est } : { kind: val('qkind') === 'cup' ? 'cup' : 'bottle', ml: +val('qml') || 90, milk: val('qmilk') || 'Formula', ...est };
    if (type === 'meal') data = { meal: val('qmeal') || mealAt(ts), foods: [], ...(val('qeat') ? { amount: val('qeat') } : {}), ...est };
    if (type === 'potty') { const v = val('qpot'); data = v === 'accident' ? { pee: false, poo: false, accident: true, ...est } : { pee: v !== 'poo', poo: v !== 'pee', where: 'Potty', ...(v !== 'pee' && val('qtex') ? { texture: val('qtex') } : {}), ...est }; }
    if (type === 'diaper') { const v = val('qdia'); data = { pee: v !== 'poo', poo: v !== 'pee', rash: false, ...(v !== 'pee' && val('qtex') ? { texture: val('qtex') } : {}), ...est }; }
    if (type === 'vomit') data = { amount: val('qvom') || 'Spit-up', projectile: false, ...est };
    if (type === 'sleep') { const paused = ids.filter(id => pausedSleep(id)); for (const id of paused) resumeSleep(pauseOf(activeSleep(id))); ids = ids.filter(id => !paused.includes(id)); if (!ids.length) { save(); close(); render(); return toast(__('Asleep again – the sleep goes on')); } const busy = ids.find(id => activeSleep(id)); if (busy) return toast(__('{name} is already asleep', { name: kidName(kidById(busy)) })); data = { nap: val('qnap') === '1', ...est }; }
    for (const id of ids) {
      const d = structuredClone(data);
      if (type === 'feed' && d.kind !== 'breast' && d.milk === 'Formula') { const f = usualFormula(kidById(id)); if (f) d.formula = f; }
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
  // the first screen: what each choice means, and that Just this phone is not a one-way door (most people start there)
  welcome: [
    { sel: '#wLocal', title: N_('Just this phone'), why: N_("Everything stays on this phone and nothing needs setting up. It is not a one-way door: the Family tab's Share with family signs you in later, and every entry comes along.") },
    { sel: '#wShare', title: N_('Share with family'), why: N_('For more than one phone: sign in with your email, invite the other parent, the grandparents or a babysitter, and everyone sees the same log, end-to-end encrypted.') },
    { sel: '#wRestore', title: N_('Moving from another phone?'), why: N_('Restore the backup file you made on the old phone, with its passphrase.') },
    { sel: '.langmini', title: N_('Your language'), why: N_('Little Log speaks 32 languages. Change it here, or later in More → Language.') },
    { sel: '#helpBtn', title: N_('Help on every screen'), why: N_('Tap ? on any screen for a tour of it.') },
  ],
  day: [
    { sel: '#kidBar', title: N_('A page for each child'), why: N_('Each child has their own page in their own colour. "All" shows everyone together.') },
    { sel: '#view .quick', title: N_('Log it in one tap'), why: N_('Tap what just happened. The time is filled in for you, with shortcuts for a few minutes ago.') },
    { sel: '#view .quick [data-add=care]', title: N_('Drop-off and pick-up'), why: N_('Dropping your child off at daycare, preschool or school, and who picks them up and when. While they are there a banner at the top says so, and whoever collects them taps "Picked up".') },
    { sel: '#view .quick [data-add=study]', title: N_('Homework'), why: N_('Homework, reading and practising, with the subject, the minutes and the pages read. The routine learns the school week from it.') },
    { sel: '#view .quick [data-addmore]', title: N_('The rest'), why: N_('The buttons for your child\'s age come first, and anything you log often moves up by itself. Everything else is behind More.') },
    { sel: '#sleepBanner .brow:not(.care)', title: N_('Asleep right now'), why: N_('While your baby sleeps the timer runs here. Tap "Woke up" when they wake, and say whether they are up for good or will be back to sleep soon: then the sleep goes on, the wake-up is noted, and the button asks "Asleep again".') },
    { sel: '#sleepBanner .brow.care', title: N_('At daycare or school'), why: N_('While your child is away this says where, since when, and who picks them up. Whoever collects them taps "Picked up".') },
    { sel: 'svg.clock', title: N_('The day at a glance'), why: N_('Each entry is a ray out to the time it happened, in its own colour. Tap a dot to see what it was, or a quarter of the dial for just those hours.') },
    { sel: '.clockctl .seg', title: N_('24 or 12 hours'), why: N_('The whole day on one dial, or a classic 12-hour face with AM and PM.') },
    { sel: '.clockctl .nums', title: N_('Roman or plain numbers'), why: N_('The dial\'s numbers as on a carriage clock, or plain ones that are easier to read at 3 a.m.') },
    { sel: '.clockctl .artbtn', title: N_('Choose the painting'), why: N_('Pick the watercolour around the clock, for each child.') },
    { sel: '.clegend', title: N_('What the colours mean'), why: N_('Every kind of entry has its own colour, on the clock and everywhere else, with today\'s count.') },
    { sel: '.datenav', title: N_('Other days'), why: N_('Use the arrows to look back at earlier days.') },
    { sel: '.allergyline', title: N_('Allergies'), why: N_('A child\'s allergies stay in view at the top of every day, for everyone sharing the log. Mark one from a feed or a meal, or in More.') },
    { sel: '.grownote', title: N_('Growing up'), why: N_('Little Log grows with your child: the buttons, the routine and the Guide change with their age, and a note here says what is new at each stage.') },
    { sel: '.grown', title: N_('All the way to 18'), why: N_('At 18 Little Log\'s work is done. Everything stays here, and the book and the record are ready to keep or hand over.') },
    { sel: '.upcoming', title: N_('Coming up'), why: N_('What is on the family calendar in the next week: exams, appointments, matches, lessons and parties. Add to it from the Month tab.') },
    { sel: '#view details.grp', title: N_('Every detail'), why: N_('Everything from the day, grouped: feeds, diapers, sleep and more. Tap a group to open it.') },
    { sel: '.tripbtn', title: N_('Going on a trip?'), why: N_('Travel mode gives you bigger buttons, rough times that are quick to log, and a clock to match the journey.') },
    { sel: '.momentbtn', title: N_('Big moments'), why: N_('Save the firsts as they happen: the first smile, the first steps, the first day of school. They stay in the Month tab, in a journal of their own.') },
    { sel: '#famSw', title: N_('Whose log'), why: N_('The family whose log this is. Looking after children in more than one family? Tap here to switch.') },
    { sel: '#tabs', title: N_('Everything else'), why: N_('The routine, the month with the family calendar, stats, the Guide with medicines and milestones, family sharing, and settings.') },
    { sel: '#helpBtn', title: N_('Help on every screen'), why: N_('Tap ? on any screen for a tour of it.') },
  ],
  travel: [
    { sel: '.tripcard', title: N_('Your trip'), why: N_('How you are travelling and until when. Change it any time, or tap "We\'re home" to end it.') },
    { sel: '.legrow', title: N_('The journey'), why: N_('Tap when you set off and when you stop. Time on the move lights up the clock\'s outer ring, and long drives get a reminder to take a break.') },
    { sel: '.quick.tq', title: N_('Big buttons for busy moments'), why: N_('Each opens a short sheet: tap a rough time and an answer. "About 15 minutes ago" is fine; estimated times show with a ~.') },
    { sel: '.qmore', title: N_('The rest'), why: N_('Play, wake-ups, health notes and medicines are one more tap away.') },
    { sel: 'svg.clock', title: N_('A travel clock'), why: N_('The painting matches how you travel, and travel days have their own colours, so they stand out later in the month view.') },
    { sel: '#helpBtn', title: N_('Help on every screen'), why: N_('Tap ? on any screen for a tour of it.') },
  ],
  month: [
    { sel: '.cal', title: N_('The month'), why: N_('Dots show what was logged each day. Days away travelling are outlined, a star marks a big moment, and ◆ something on the calendar.') },
    { sel: '.cal button.sel', title: N_('Pick a day'), why: N_('Tap a day to see its numbers below.') },
    { sel: '#view .datenav', title: N_('Other months'), why: N_('Use the arrows to look back at earlier months, or ahead at what is planned.') },
    { sel: '#view .legend', title: N_('What the marks mean'), why: N_('The colour of each kind of entry, and the marks for travel days, the calendar, first allergic reactions and big moments.') },
    { sel: '#view .tripbtn', title: N_('Plan a trip'), why: N_('Plan trips ahead: pick the day you leave, then tap here. Travel mode switches on by itself that day.') },
    { sel: '#view .planbtn', title: N_('The family calendar'), why: N_('Exams, appointments, matches, lessons, school holidays and parties, for one child or several, from the day you picked. The next week\'s show on the Day page under "Coming up", and a school holiday gives the routine\'s school week a break.') },
    { sel: '#view .prow', title: N_('On the calendar'), why: N_('What is planned for the day you picked. Tap one to change it, for every child it was made for.') },
    { sel: '#view .tiles', title: N_('The day in numbers'), why: N_('Feeds, diapers, sleep and more for the day you picked.') },
    { sel: 'details[data-grp=mAll]', title: N_('Every entry'), why: N_('Open this to see each entry of that day, and tap one to change it.') },
    { sel: '#view .quick', title: N_('Add to that day'), why: N_('Log something you forgot, on the day you picked.') },
    { sel: 'details[data-grp=moments]', title: N_('Big moments'), why: N_('Every big moment, in chapters for each stage of growing up, with how old they were. A star on the calendar marks the day.') },
  ],
  routine: [
    { sel: '#view .rnext', title: N_('Next in the routine'), why: N_('What usually comes next, and how long until then.') },
    { sel: '#view .routine', title: N_('Your routine'), why: N_('Feeds, sleep, play and medicines that happen at about the same time on most days, and from school age the school week: drop-off, pick-up and homework. A tick shows what is done today.') },
    { sel: '#view .routine.week', title: N_('Other days of the week'), why: N_('What keeps to certain days of the week, like swimming on Tuesdays, with the days it happens on.') },
    { sel: '#view .rhow', title: N_('It keeps up by itself'), why: N_('It is worked out again from the last week every time, so it changes when your baby\'s routine does.') },
  ],
  stats: [
    { sel: '#view .seg', title: N_('How far back'), why: N_('Look at the last 7, 14 or 30 days.') },
    { sel: '#pdfBtn', title: N_('For the doctor'), why: N_('A PDF of everything logged, to share or print for a checkup.') },
    { sel: '#view details[data-grp=mpics]>summary', title: N_('Pictures as they grow'), why: N_('A picture at each month birthday of the first year, then one on every birthday to eighteen. Tap a picture to see it big.') },
    { sel: '#view .recbtn', title: N_('The health record'), why: N_('Vaccines, doctor visits, and weight, height and head size on the growth charts, for each child: a page of its own, with a tour of its own.') },
    { sel: '#view .card.alert', title: N_('Worth mentioning'), why: N_('A card turns red when there is something to tell the doctor: symptoms this week, or too few wet diapers.') },
    { sel: '#view .chart', title: N_('A chart for each section'), why: N_('Drawn to scale, one bar per day. Tap a bar for its numbers.') },
    { sel: '#view details.tbl', title: N_('The exact numbers'), why: N_('Each chart has a table with every day\'s numbers, handy for a checkup.') },
  ],
  guide: [
    { sel: '#docBtn', title: N_('Your pediatrician'), why: N_('Save their details once, and everyone sharing the log gets a Call button.') },
    { sel: '#view .recbtn', title: N_('The health record'), why: N_('Vaccines, doctor visits and growth charts for each child, on a page of their own.') },
    { sel: '.emer', title: N_('Emergencies'), why: N_('The signs that need emergency help straight away.') },
    { sel: '.nowcard', title: N_('Right now'), why: N_('What is common at your child\'s age: the milestones until 5, then what the school and teenage years are about.') },
    { sel: '#view details.sec[data-grp=sectoddler]', title: N_('Toddlers and preschoolers'), why: N_('Potty training, picky eating, tantrums, sleep, teeth, screens and car seats, for 1 to 5 year olds.') },
    { sel: '#view details.sec[data-grp=secschool]', title: N_('School age'), why: N_('Sleep, screens and staying safe online, homework and reading, friends and bullying, teeth, bedwetting, worries, puberty, head lice and getting about safely, for 6 to 12 year olds.') },
    { sel: '#view details.sec[data-grp=secteens]', title: N_('Teenagers'), why: N_('Sleep, mental health, life online, alcohol, vaping and drugs, relationships and consent, periods, skin, food and sport, driving, and growing independence. Shown from 10, as what comes next.') },
    { sel: '#view details.sec[data-grp=secfood]', title: N_('Food'), why: N_('Starting solid foods from around 6 months, the key allergens early, and what to do about a reaction.') },
    { sel: '#view details.sec[data-grp=secnewborn]', title: N_('Common worries'), why: N_('What is normal with a newborn, and when to call. Some have pictures, kept out of sight until you tap them.') },
    { sel: '#view details.sec[data-grp=secmeds]', title: N_('Medicines'), why: N_('Over-the-counter medicines that are safe from what age, remedies parents mention, and what never to give.') },
    { sel: '#view details.sec[data-grp=secplay]', title: N_('Toys and play'), why: N_('The kinds of toy that suit your child\'s age and the next one, with what to watch for.') },
    { sel: 'details[data-grp=aswim]', title: N_('Learning to swim'), why: N_('When swim lessons can begin, what to look for in a class, and staying safe around water.') },
    { sel: '#view details.sec[data-grp=secchecks]', title: N_('Health checks'), why: N_('Vaccines and when to call, what checkups look at, and what the growth chart percentiles mean.') },
    { sel: '#view details.sec[data-grp=secmonths]', title: N_('Month by month'), why: N_('Milestones for every month. A reminder pops up on each month birthday.') },
  ],
  health: [
    { sel: '.backbar', title: N_('Back'), why: N_('This page is a step away from the rest: tap here to go back to where you came from, or "Today" for today\'s page. The tabs below work as always.') },
    { sel: '.rechead', title: N_('The health record'), why: N_('Vaccines, doctor visits and growth for each child, from birth to 18, kept private to the people who may see health notes.') },
    { sel: '#view .gkinds', title: N_('Which chart'), why: N_('Weight, length or height, head size, and from 2 years BMI: pick the one to see.') },
    { sel: '#view svg.gchart', title: N_('Growth charts'), why: N_('Each measurement against the CDC growth charts, with the 3rd, 15th, 50th, 85th and 97th percentile lines. Following their own line matters more than the number.') },
    { sel: '#view details.tbl', title: N_('Every measurement'), why: N_('All the measurements in a table. Tap one to change it.') },
    { sel: '#view [data-add=growth]', title: N_('Add a measurement'), why: N_('After each checkup, or whenever you weigh and measure at home. The percentile shows as you type.') },
    { sel: '#view .vaccines', title: N_('Vaccines'), why: N_('Every dose with its date, by vaccine. Tap one to change it.') },
    { sel: '#view .visits', title: N_('Doctor visits'), why: N_('Checkups, the dentist, eye and hearing tests, and the times your child was seen when unwell.') },
    { sel: '#pdfBtn', title: N_('For the doctor'), why: N_('The report for the doctor has the health record in it too.') },
  ],
  family: [
    { sel: '.ftreeimg', title: N_('Family tree'), why: N_('Your children\'s family tree: their parents, grandparents and great-grandparents, aunts, uncles and cousins. It grows as people are added. Tap someone for their details, or a child for their day; a parent adds people with the +.') },
    { sel: '#famAdd', title: N_('Add a family'), why: N_('Looking after someone else\'s children? Scan the QR code one of their parents shows you. Once they approve it, their family is on this page: in your family tree if you are family, or with the families you help with.') },
    { sel: '#syncNow', title: N_('Your shared log'), why: N_('When this phone last synced. Tap to sync now.') },
    { sel: 'details[data-grp=famlist]', title: N_('Families and relatives'), why: N_('Your family and your relatives\' families, with their children. Open one to switch; requests to join a family you are a parent in wait here for you.') },
    { sel: '#view .pbtn', title: N_('People'), why: N_('Everyone with access and their role. Tap a person for their contact details.') },
    { sel: '#helpers', title: N_('Caregivers and helpers'), why: N_('Caregivers, babysitters, medical assistants and friends, on a list of their own. Tap one for their details; a parent can retire someone who no longer helps.') },
    { sel: 'details[data-grp=secshare]', title: N_('Security and sharing'), why: N_('Invite someone with a one-time QR code (you approve them before they see anything), see who added, changed or deleted what, check the security code everyone sharing the log sees, and manage your phones.') },
    { sel: '#view .card', title: N_('Family sharing'), why: N_('Sign in to share the log with family and caregivers, end-to-end encrypted.') },
  ],
  more: [
    { sel: 'details[data-grp=mlang]', title: N_('Language'), why: N_('The app follows your phone\'s language unless you choose one here. If a translation reads wrong, "Report a language issue" sends it to us.') },
    { sel: 'details[data-grp=macct]', title: N_('Security & account'), why: N_('Who you are signed in as, two-step verification, the app lock with a PIN, Face ID or a fingerprint, and signing out.') },
    { sel: 'details[data-grp=mkids]', title: N_('Your children'), why: N_('Names, birth dates, boy or girl and colours, the usual formula, allergies and the health record. "Add a child" for twins or triplets.') },
    { sel: 'details[data-grp=mregion]', title: N_('Where you are'), why: N_('Formulas sold here come first, and the Guide gives your emergency number and medicine names first.') },
    { sel: 'details[data-grp=mnotify]', title: N_('Notifications'), why: N_('While a child is logged asleep, the phone asks whether they are still asleep, with Woke up on the notification. Set when it asks, and the quiet hours it keeps out of.') },
    { sel: 'details[data-grp=munits]', title: N_('Units'), why: N_('Kilograms and centimetres or pounds and inches for the health record, and ml or fl oz for milk.') },
    { sel: 'details[data-grp=mlook]', title: N_('Appearance and clock art'), why: N_('Light or dark: match your phone, pick one, or follow sunrise and sunset. And the painting around each child\'s clock.') },
    { sel: 'details[data-grp=mcloud]', title: N_('Cloud backup'), why: N_('A private, encrypted copy in your own cloud storage, scrambled with a passphrase only you know. Google Drive, Dropbox and OneDrive need a one-time setup by whoever builds the app: the card has the steps. Save works right away, through the share sheet.') },
    { sel: 'details[data-grp=mdata]', title: N_('Your data'), why: N_('Back up the log as a file, export a copy for your pediatrician, or restore a backup.') },
    { sel: 'details[data-grp=mapp]', title: N_('App updates'), why: N_('New versions come through the app store. This opens Little Log\'s page there.') },
    { sel: '#wipe', title: N_('Starting over'), why: N_('Deletes every entry in this log, for everyone sharing it. Only parents see this button.') },
  ],
};
/** The tour of the screen that is showing: the Day tab on a travel day has its own. */
let gateTour = null;   // the tour of the screen before the app (the first screen's choices), while it shows
const tourPage = () => gateTour || (tab === 'day' && tripOn(viewDay) ? 'travel' : tab);
function startTour() {
  if (document.body.classList.contains('gated') && !gateTour) return;
  const page = tourPage();
  if (!$('#sheet').hidden) $('#sheet').hidden = $('#sheetBack').hidden = true;
  const steps = TOURS[page] || [], skipFamily = page === 'family' && document.querySelector('#syncNow');   // signed in: the "sharing is off" card isn't there
  const shown = (skipFamily ? steps.filter(s => s.sel !== '#view .card') : steps).map(s => ({ ...s, title: __(s.title), why: __(s.why) }));
  if (!Tour.start(shown, () => { if (page === 'day') { Tour.mark('day'); render(); } if (page === 'welcome') Tour.mark('welcome'); })) toast(__('Nothing to show on this screen yet'));
}
/** The home screen's tour starts by itself the first time, once nothing else is open; so does the first screen's, the first time it shows. */
function autoTour() {
  if (gateTour) {
    if (Tour.active() || Tour.seen(gateTour)) return;
    clearTimeout(autoTour.t); autoTour.t = setTimeout(() => { if (gateTour && !Tour.active() && !Tour.seen(gateTour) && $('#sheet').hidden) startTour(); }, 500);
    return;
  }
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
      ${k.birth ? `<p class="note kstage">${esc([__(Stages.byId(stageOf(k)).name), Stages.age(k.birth, Date.now())].filter(Boolean).join(' · '))}</p>` : ''}
      <label class="f">${__h('Birth date')}</label><input type="date" data-kb="${k.id}" value="${esc(k.birth)}" ${dis}>
      <label class="f">${__h('Boy or girl')}</label><div class="chips">${chip('ks-' + k.id, 'boy', __h('Boy'), k.sex === 'boy', '', true)}${chip('ks-' + k.id, 'girl', __h('Girl'), k.sex === 'girl', '', true)}${chip('ks-' + k.id, '', __h('Not set'), !k.sex, '', true)}</div>
      ${Stages.from(stageOf(k), 'teen') ? '' : `<label class="f">${__h('Usual formula')}</label>${formulaPicker({ sel: `data-kfs="${k.id}" aria-label="${__h('Usual formula')}"`, txt: `data-kft="${k.id}" aria-label="${__h('Formula name')}"` }, usualFormula(k), recentFormulas([k]), dis)}
      <p class="note" style="margin:4px 0 0">${learnedFormula(k) && learnedFormula(k) !== k.formula ? __h('Picked up from the feeds: it was given at every formula feed three days running.') : __h('When one formula is given at every formula feed three days running, it becomes the usual one.')}</p>`}
      <label class="f">${__h('Allergies')}</label>${(k.allergies || []).length ? k.allergies.map(a => `<div class="stat alrow"><span>⚠️ <b>${__h(a.food)}</b>${a.kind || a.severity || a.epi ? ` <small>${esc(allergyText(a).replace(/^.*?\(/, '(').replace(/\)$/, ')'))}</small>` : ''}<br><small>${esc([a.date && __('first reaction {date}', { date: fmtDay(a.date) }), a.note].filter(Boolean).join(' · '))}</small></span>${can ? `<button class="btn d" data-alrm="${k.id}" data-food="${esc(a.food)}" data-kind="${esc(a.kind || '')}" aria-label="${__h('Remove {name}', { name: __(a.food) })}" style="padding:6px 12px">✕</button>` : ''}</div>`).join('') : `<p class="note" style="margin:0">${__h('None marked.')}</p>`}
      ${can ? `<button class="btn" data-aladd="${k.id}" style="margin-top:6px">⚠️ ${__h('Mark an allergy')}</button>` : ''}
      ${Sync.can('health') ? recordButton(k) : ''}
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
  const screens = [['day', N_('Day')], ['routine', N_('Routine')], ['month', N_('Month')], ['stats', N_('Stats')], ['guide', N_('Guide')], ['health', N_('Health record')], ['family', N_('Family')], ['more', N_('More')], ['signin', N_('Signing in')], ['other', N_('Somewhere else')]];
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
  return `<div class="card"><b>🎨 ${__h('Clock art')}</b><p class="note">${__h('The watercolour painting around the day clock. Kept on this phone.')} ${__h('In dark mode each painting shows the same scene at night.')}</p>
    ${pages.map(([id, name]) => `<div class="stat"><span>${esc(name)}<br><small>${__h(Art.byId(artOf(id)).name)}</small></span><button class="btn" data-art="${id}" style="padding:6px 12px">${__h('Change')}</button></div>`).join('')}</div>`;
}
/** Light, dark, matching the phone, or following sunrise and sunset (kept on this phone). */
function appearanceHtml() {
  const m = Theme.mode, s = Theme.todaySun();
  const opts = Object.entries(THEME_NAMES);
  const sun = s.polar ? (s.polar === 'day' ? __h("The sun doesn't set here today, so it stays light.") : __h("The sun doesn't rise here today, so it stays dark."))
    : __h('Today: light from {rise}, dark from {set}.', { rise: fmtTime(s.rise), set: fmtTime(s.set) });
  return `<div class="card"><b>🌗 ${__h('Appearance')}</b>
    <div class="chips" style="margin-top:10px">${opts.map(([v, l]) => chip('themeMode', v, __h(l), m === v, '', true)).join('')}</div>
    <p class="note">${m === 'sun' ? sun + ' ' + (s.zone ? __h("Estimated for the {zone} time zone; your location isn't used.", { zone: s.zone }) : __h("Estimated from your time zone; your location isn't used."))
      : m === 'system' ? __h("Follows your phone's light or dark setting.") : __h('Switching plays a little sunrise or sunset.')}</p></div>
    <div class="card"><b>⏰ ${__h('The clock')}</b>
    <label class="f" style="display:block;margin-top:10px">${__h('At the end of each ray')}</label>
    <div class="chips">${chip('dots', 'symbols', __h('A little symbol of the entry'), db.meta.dots !== 'plain', '', true)}${chip('dots', 'plain', __h('A plain dot'), db.meta.dots === 'plain', '', true)}</div>
    <p class="note">${__h('A bottle for a feed, a drop for a diaper, a moon for a sleep… or just a dot in the colour of the entry. The legend under the clock follows. Kept on this phone.')}</p></div>`;
}
/** Weight and length in kg and cm, or in pounds and inches (kept on this phone). */
function unitsHtml() {
  const cur = usUnits() ? 'us' : 'metric';
  return `<div class="card"><b>📏 ${__h('Units')}</b><div class="chips" style="margin-top:10px">${chip('units', 'metric', __h('kg and cm'), cur === 'metric', '', true)}${chip('units', 'us', __h('pounds and inches'), cur === 'us', '', true)}</div>
    <div class="chips" style="margin-top:10px">${chip('vol', 'ml', __h('ml'), !volOz(), '', true)}${chip('vol', 'oz', __h('fl oz'), volOz(), '', true)}</div>
    <p class="note">${__h('Weight and height for the health record; ml or fl oz for milk, in the feed form, the list, the stats and the report. Kept on this phone.')}</p></div>`;
}
/** A settings group on the More page: a twirl-down with the setting's current value on its line, closed until tapped (open ones stay open while the app runs).
    The card inside loses its own title, which the twirl-down carries. */
function fold(id, icon, title, sub, html) {
  const body = html.replace(/^(<div class="card"[^>]*>)<b>[^<]*<\/b>/, '$1');
  return `<details class="gd set" data-grp="m${id}" ${openGroups.has('m' + id) ? 'open' : ''}><summary><span class="gi">${icon}</span><span class="gt"><b>${__h(title)}</b><small>${esc(sub)}</small></span><span class="chev" aria-hidden="true">›</span></summary><div class="gdin">${body}</div></details>`;
}
const THEME_NAMES = { system: N_('Match phone'), light: N_('Light'), dark: N_('Dark'), sun: N_('Sunrise & sunset') };
let appVersion = '';
function moreView() {
  const ks = kids(), acct = Acct.accountHtml();
  const region = Formulas.REGIONS.find(r => r.id === db.meta.region);
  const arts = [...new Set((ks.length > 1 ? [...ks.map(k => k.id), 'all'] : [ks[0].id]).map(id => __(Art.byId(artOf(id)).name)))];
  return `${fold('lang', '🌐', N_('Language'), I18n.chosen() ? I18n.label(I18n.chosen()) : __('Automatic: {language}', { language: I18n.label(I18n.auto()) }), languageHtml())}
  ${acct ? fold('acct', '🔐', N_('Security & account'), Acct.accountSub(), acct) : ''}
  ${fold('kids', '👶', ks.length > 1 ? N_('Children') : N_('Baby'), ks.map(kidName).join(', '), kidsHtml())}
  ${fold('region', '📍', N_('Where you are'), region ? __(region.name) : __('Automatic: {region}', { region: __(Formulas.name(Formulas.regionFor())).replace(/ \(.*\)$/, '') }), regionHtml())}
  ${fold('units', '📏', N_('Units'), `${usUnits() ? __('pounds and inches') : __('kg and cm')} · ${volOz() ? __('fl oz') : __('ml')}`, unitsHtml())}
  ${fold('notify', '🔔', N_('Notifications'), Notify.cfg.on ? __('Sleep check after {time} · quiet {from}–{to}', { time: fmtDur(Notify.cfg.after), from: clockAt(ntfMins(Notify.cfg.quiet[0])), to: clockAt(ntfMins(Notify.cfg.quiet[1])) }) : __('Off'), notifyHtml())}
  ${fold('look', '🌗', N_('Appearance and clock art'), `${__(THEME_NAMES[Theme.mode] || THEME_NAMES.system)} · ${arts.join(', ')}`, appearanceHtml() + artHtml())}
  ${fold('cloud', '☁️', N_('Cloud backup'), Acct.cloudSummary(), Acct.cloudHtml())}
  ${fold('data', '📄', N_('Your data'), __('Backup, export, the report for the doctor, restore'), `<div class="card"><b>${__h('Your data')}</b><p class="note">${Sync.linked() ? __h('Entries are saved on this device and synced to your family log.') : __h('Everything is stored only on this device.')} ${__h('Export a plain-text copy to share with your pediatrician.')}</p>
    <div class="row"><button class="btn" id="expJson">${__h('Backup (JSON)')}</button><button class="btn" id="expCsv">${__h('Export CSV')}</button></div>
    <div class="row"><button class="btn" id="expPdf">📄 ${__h('Report for the doctor (PDF)')}</button></div>
    <div class="row"><button class="btn" id="impJson">${__h('Restore from JSON')}</button></div>
    <input type="file" id="impFile" accept="application/json" hidden></div>`)}
  ${fold('app', '🌟', N_('App updates'), appVersion ? __('Version {version}', { version: appVersion }) : __('Through the app store'), `<div class="card" id="appCard"><b>${__h('App updates')}</b><p class="note"><span id="appVer"></span>${__h('New versions of Little Log come through the app store.')}</p>
    <div class="row"><button class="btn" id="appUpdate">${__h('Update app')}</button></div>${crashHtml()}</div>${Acct.serverNote()}`)}
  ${Sync.isParent() ? `<div class="card"><button class="btn d" id="wipe" style="width:100%">${__h('Delete all entries')}</button></div>` : ''}`;
}
/** More → Notifications: the sleep check ("Is Leo still asleep?" after a while, then again a few times) and the quiet hours it keeps
    out of, kept on this phone. The phone's answer on notifications is filled in once it is known (bindMore). */
const NTF_AFTER = [60, 90, 120, 180], NTF_EVERY = [30, 60], ntfMins = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
function notifyHtml() {
  const c = Notify.cfg;
  return `<div class="card"><b>${__h('Notifications')}</b>
    <p class="note" id="ntfState">${Native.is ? '' : __h('In the phone app.')}</p>
    <div class="stat"><span>${__h('Sleep check')}<br><small>${__h('While a child is logged asleep, the phone asks whether they are still asleep, with Woke up right on the notification, so a sleep nobody closed does not run on for hours.')}</small></span><span class="chips">${[['1', __('On')], ['0', __('Off')]].map(([v, l]) => chip('ntfOn', v, esc(l), (c.on ? '1' : '0') === v, '', true)).join('')}</span></div>
    <div id="ntfMore"${c.on ? '' : ' hidden'}>
      <label class="f">${__h('Ask after')}</label><div class="chips">${NTF_AFTER.map(m => chip('ntfAfter', m, esc(fmtDur(m)), c.after === m, '', true)).join('')}</div>
      <div class="stat"><span>${__h('Once the routine is known')}<br><small>${__h('Ask an hour after the sleep usually ends instead: a nap that usually ends at 2:30 is asked about at 3:30. The notification says when they are usually up.')}</small></span><span class="chips">${[['1', __('On')], ['0', __('Off')]].map(([v, l]) => chip('ntfRoutine', v, esc(l), (c.routine !== false ? '1' : '0') === v, '', true)).join('')}</span></div>
      <label class="f">${__h('Then again every')}</label><div class="chips">${NTF_EVERY.map(m => chip('ntfEvery', m, esc(fmtDur(m)), c.every === m, '', true)).join('')}</div>
      <p class="note">${__hn('Up to {n} time in all, until Woke up is tapped.', 'Up to {n} times in all, until Woke up is tapped.', c.times)}</p>
      <label class="f">${__h('Do not disturb')}</label><div class="row"><input type="time" id="ntfFrom" value="${esc(c.quiet[0])}" aria-label="${__h('From')}"><input type="time" id="ntfTo" value="${esc(c.quiet[1])}" aria-label="${__h('Until')}"></div>
      <p class="note">${__h('No sleep checks between these times (the night); one that falls in them is sent when they end, which also catches a sleep from the evening before. Kept on this phone: each parent sets their own.')}</p></div>
    <div class="row" id="ntfAllowRow" hidden><button class="btn p" id="ntfAllow">${__h('Allow notifications')}</button></div></div>`;
}
/** More → App updates → Crash reports: off until turned on here; what a report says is said here too (crash.js). */
function crashHtml() {
  if (!Crash.can()) return '';
  const on = Crash.on(), n = Crash.list().length;
  return `<div class="stat" style="margin-top:12px"><span>${__h('Crash reports')}<br><small>${__h('When something goes wrong inside the app, tell the Little Log team about it.')}</small></span><span class="chips">${[['1', __('On')], ['0', __('Off')]].map(([v, l]) => chip('crashOn', v, esc(l), on === (v === '1'), '', true)).join('')}</span></div>
    <p class="note">${__h("What a report says: what went wrong and where in the app's own code, the app version, the kind of phone (Android, iPhone or web), the language and the hour. Never an entry, a name, an address, anything typed or anything about your account; and it goes without your sign-in, so it cannot be tied to you.")}</p>
    ${on ? `<div class="row"><button class="btn" id="crashSend"${n ? '' : ' disabled'}>${__h('Send now')}</button><small class="note" id="crashN">${n ? __hn('{n} report waiting', '{n} reports waiting', n) : __h('Nothing waiting to be sent.')}</small></div>` : ''}`;
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
  // the quarter's name and hours in the clock's handle: squeezed to the handle's width when a language's words are wider than it
  for (const t of document.querySelectorAll('.clock .qname, .clock .qtime')) { try { if (t.getComputedTextLength() > 126) { t.setAttribute('textLength', 126); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); } } catch (e) { /* not drawn */ } }
  document.querySelectorAll('[data-face]').forEach(b => b.onclick = () => { db.meta.clock = b.dataset.face; Store.save(db); quad = null; render(); });
  document.querySelectorAll('[data-half]').forEach(b => b.onclick = () => { half = +b.dataset.half; quad = null; render(); });
  document.querySelectorAll('[data-nums]').forEach(b => b.onclick = () => { db.meta.nums = b.dataset.nums; Store.save(db); render(); });
  document.querySelectorAll('[data-info]').forEach(b => b.onclick = () => openEntryInfo(b.dataset.info));
  // pictures as they grow (Stats): choose a file for a slot, open a picture, scroll a carousel (kept where it was scrolled to)
  document.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => pickPicture(b.dataset.pick));
  if ($('#picFile')) $('#picFile').onchange = () => { const f = $('#picFile').files[0]; if (f && picSlot) addPicture(kidById(viewKid()), picSlot, f); };
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openPicView(kidById(viewKid()), b.dataset.view));
  document.querySelectorAll('[data-pscroll]').forEach(b => b.onclick = () => { const r = $('#' + b.dataset.row); if (r) r.scrollBy({ left: +b.dataset.pscroll * 122 * (I18n.rtl() ? -1 : 1), behavior: 'smooth' }); });
  document.querySelectorAll('.pics[id]').forEach(r => {
    const at = picScroll[viewKid() + r.id], c = r.querySelector('.pic.now');
    if (at != null) r.scrollLeft = at; else if (c) { const a = c.getBoundingClientRect(), b = r.getBoundingClientRect(); r.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2); }
    r.onscroll = () => { picScroll[viewKid() + r.id] = r.scrollLeft; };
  });
  // before the birth: contractions and the hospital bag; the milk stash; the allergens
  document.querySelectorAll('[data-cstart]').forEach(b => b.onclick = () => { if (!Sync.can('add')) return toast(__("You don't have permission to do that")); db.events.push({ id: uid(), type: 'contraction', ts: Date.now(), end: null, data: {}, note: '', by: Auth.id || undefined, child: b.dataset.cstart, updated: stamp() }); save(); render(); });
  document.querySelectorAll('[data-cstop]').forEach(b => b.onclick = () => { const e = db.events.find(x => x.id === b.dataset.cstop); if (!e) return; e.end = Math.max(Date.now(), e.ts + 1000); e.updated = stamp(); save(); render(); });
  document.querySelectorAll('[data-bag]').forEach(c => c.onchange = () => { const bag = db.meta.bag || (db.meta.bag = {}), t = bag[c.dataset.kid] || (bag[c.dataset.kid] = {}); if (c.checked) t[c.dataset.bag] = 1; else delete t[c.dataset.bag]; Store.save(db); render(); });
  document.querySelectorAll('[data-used]').forEach(b => b.onclick = () => { const e = db.events.find(x => x.id === b.dataset.used); if (!e || !Sync.can('edit', e)) return; e.data = { ...e.data, used: true }; e.updated = stamp(); save(); render(); });
  document.querySelectorAll('[data-offer]').forEach(b => b.onclick = () => { const a = ALLERGENS.find(x => x[0] === b.dataset.offer); if (!a || !Sync.can('add')) return; db.events.push({ id: uid(), type: 'feed', ts: Date.now(), data: { kind: 'solids', foods: [a[2]], amount: 'A taste' }, note: '', by: Auth.id || undefined, child: b.dataset.kid, updated: stamp() }); save(); render(); toast(__('Logged as a solids feed')); });
  document.querySelectorAll('[data-react]').forEach(b => b.onclick = () => openAllergy(b.dataset.kid, { foods: [b.dataset.react] }));
  document.querySelectorAll('[data-tooth]').forEach(b => b.onclick = () => openTooth(kidById(viewKid()), b.dataset.tooth));
  document.querySelectorAll('[data-pottypdf]').forEach(b => b.onclick = () => pottyPdf(kidById(b.dataset.pottypdf)));
  if ($('#shareDay')) $('#shareDay').onclick = openHandover;
  document.querySelectorAll('#pdfBtn, #expPdf').forEach(b => b.onclick = openDoctorReport);
  document.querySelectorAll('[data-yt]').forEach(b => b.onclick = () => Native.openExternal('https://www.youtube.com/watch?v=' + b.dataset.yt));
  document.querySelectorAll('details[data-grp]').forEach(d => d.ontoggle = () => {
    d.open ? openGroups.add(d.dataset.grp) : openGroups.delete(d.dataset.grp);
    if (!d.open) d.querySelectorAll('details.pix[open]').forEach(p => { p.open = false; });   // closing a card hides its pictures again
  });
  document.querySelectorAll('.bar[data-tip]').forEach(b => b.onclick = () => toast(b.dataset.tip));
  document.querySelectorAll('svg [role=button]').forEach(b => b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  if ($('#docBtn')) $('#docBtn').onclick = () => openDoctor(false);
  document.querySelectorAll('[data-qadd]').forEach(b => b.onclick = () => openQuick(b.dataset.qadd));
  document.querySelectorAll('[data-qmore]').forEach(b => b.onclick = () => openMoreTypes(b.dataset.qmore.split(' ')));
  document.querySelectorAll('[data-addmore]').forEach(b => b.onclick = () => openMoreTypes(b.dataset.addmore.split(' ')));
  document.querySelectorAll('[data-momentnew]').forEach(b => b.onclick = () => openMoment(null, { day: viewDay }));
  bindMedia(document);
  document.querySelectorAll('[data-backupgo]').forEach(b => b.onclick = () => Acct.goCloudCard());
  document.querySelectorAll('[data-backuplater]').forEach(b => b.onclick = () => { db.meta.backupNudgeAt = Date.now(); save(true); render(); });
  document.querySelectorAll('[data-stageok]').forEach(b => b.onclick = () => { const m = db.meta.stageSeen || (db.meta.stageSeen = {}); for (const id of b.dataset.stageok.split(' ')) m[id] = b.dataset.stage; Store.save(db); render(); });
  document.querySelectorAll('[data-noteok]').forEach(b => b.onclick = () => { const m = db.meta.noteSeen || (db.meta.noteSeen = {}); for (const id of b.dataset.noteok.split(' ')) (m[id] || (m[id] = {}))[b.dataset.note] = true; Store.save(db); render(); });
  document.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { const ev = db.events.find(e => e.id === b.dataset.plan); if (ev) openPlan(ev); });
  document.querySelectorAll('[data-plannew]').forEach(b => b.onclick = () => openPlan(null, { day: viewDay }));
  document.querySelectorAll('[data-tripcal]').forEach(b => b.onclick = () => { const ev = db.events.find(e => e.id === b.dataset.tripcal); if (ev) Cal.addToPhone(ev); });
  if ($('#monthIcs')) $('#monthIcs').onclick = () => Cal.shareMonth(calMonth);
  document.querySelectorAll('[data-book]').forEach(b => b.onclick = () => makeBook(b.dataset.book));
  document.querySelectorAll('[data-export]').forEach(b => b.onclick = () => exportRecord(b.dataset.export));
  document.querySelectorAll('[data-record]').forEach(b => b.onclick = () => openRecord(b.dataset.record));
  document.querySelectorAll('[data-recback]').forEach(b => b.onclick = () => { tab = recordFrom; render(); window.scrollTo(0, 0); });
  document.querySelectorAll('[data-home]').forEach(b => b.onclick = () => { tab = 'day'; viewDay = startOfDay(Date.now()); quad = null; render(); window.scrollTo(0, 0); });
  document.querySelectorAll('[data-gkind]').forEach(b => b.onclick = () => { growthKind = b.dataset.gkind; render(); });
  document.querySelectorAll('[data-moment]').forEach(b => b.onclick = () => { const ev = db.events.find(e => e.id === b.dataset.moment); if (ev) Sync.can('edit', ev) ? openMoment(ev) : momentInfo(ev); });
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
  document.querySelectorAll('[name=crashOn]').forEach(r => r.onchange = () => { if (r.checked) { Crash.setOn(r.value === '1'); render(); } });
  const cs = $('#crashSend'); if (cs) cs.onclick = async () => {
    cs.disabled = true; const r = await Crash.flush();
    toast(r === 'sent' ? __('Thank you! Your report was sent.') : r === 'busy' ? __('Thanks, we have had a lot of reports from you lately. Please try again in an hour.') : r === 'nothing' ? __('Nothing waiting to be sent.') : __("Couldn't send it. Check you're online and try again."));
    render();
  };
  Native.version().then(v => { const el = $('#appVer'), sub = document.querySelector('details[data-grp=mapp] .gt small'); if (!v) return; appVersion = v; if (el) el.textContent = __('Version {version}', { version: v }) + ' · '; if (sub) sub.textContent = __('Version {version}', { version: v }); });
  document.querySelectorAll('[name=themeMode]').forEach(r => r.onchange = () => { if (r.checked) { Theme.set(r.value); render(); } });
  document.querySelectorAll('[name=dots]').forEach(r => r.onchange = () => { if (r.checked) { db.meta.dots = r.value; Store.save(db); render(); } });
  document.querySelectorAll('[name=units]').forEach(r => r.onchange = () => { if (r.checked) { db.meta.units = r.value; Store.save(db); render(); } });
  document.querySelectorAll('[name=vol]').forEach(r => r.onchange = () => { if (r.checked) { db.meta.vol = r.value; Store.save(db); render(); } });
  // notifications: the setting is kept on the phone, the phone's checks follow it; the phone's answer on notifications, once known
  const ntfSet = o => { Notify.set(o); render(); Notify.sync(db.events); };
  document.querySelectorAll('[name=ntfOn]').forEach(r => r.onchange = () => { if (r.checked) ntfSet({ on: r.value === '1' }); });
  document.querySelectorAll('[name=ntfAfter]').forEach(r => r.onchange = () => { if (r.checked) ntfSet({ after: +r.value }); });
  document.querySelectorAll('[name=ntfRoutine]').forEach(r => r.onchange = () => { if (r.checked) ntfSet({ routine: r.value === '1' }); });
  document.querySelectorAll('[name=ntfEvery]').forEach(r => r.onchange = () => { if (r.checked) ntfSet({ every: +r.value }); });
  document.querySelectorAll('#ntfFrom, #ntfTo').forEach(el => el.onchange = () => { const q = [$('#ntfFrom').value, $('#ntfTo').value]; if (q.every(t => /^\d\d:\d\d$/.test(t))) ntfSet({ quiet: q }); });
  if ($('#ntfAllow')) $('#ntfAllow').onclick = async () => { await Notify.ask(); render(); Notify.sync(db.events); };
  Notify.permission().then(p => {
    const el = $('#ntfState'), row = $('#ntfAllowRow'); if (!el || !row) return;
    el.textContent = p === 'granted' ? __('Allowed on this phone.') : p === 'denied' ? __("Turned off in the phone's settings: allow Little Log's notifications there.") : p === 'none' ? __('In the phone app.') : __('Not allowed yet: the phone asks the first time there is something to send, or tap below.');
    row.hidden = p !== 'prompt' && p !== 'prompt-with-rationale';
  });
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
    k.allergies = (k.allergies || []).filter(a => !(a.food === b.dataset.food && (a.kind || '') === b.dataset.kind)); commit(__('Removed'));
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
  if (type === 'sleep' && !ev && !pre && resumeIfPaused()) return;   // (up for a moment: back to sleep, no questions)
  if (type === 'bath') { type = 'play'; pre = { activity: 'Bath', ...(pre || {}) }; }   // (the Bath button: a play entry with Bath chosen)
  if (editing ? !Sync.can('edit', ev) : !Sync.can('add')) return toast(__("You don't have permission to do that"));
  if (isPrivate(type) && !Sync.can('health')) return toast(__("You don't have access to health notes"));
  const d = (ev && ev.data) || pre || {}, T = TYPES[type];
  // New entries default to now, or to noon of the viewed day when browsing past days.
  const defTs = ev ? ev.ts : (viewDay === startOfDay(Date.now()) ? Date.now() : viewDay + 12 * 60 * MIN);
  const forKids = ev ? [kidById(childOf(ev))].filter(Boolean) : pageKids(), older = forKids.length > 0 && forKids.every(k => Stages.from(stageOf(k, defTs), 'toddler'));
  const bathy = type === 'play' && d.activity === 'Bath', noun = type === 'feed' && older ? N_('milk') : bathy ? TYPES.bath.noun : T.noun;
  let body = '';
  const L = t => `<label class="f">${__h(t)}</label>`;
  if (type === 'feed') body = `
    ${L(N_('Type'))}${radios('kind', older ? [N_('breast'), N_('bottle'), N_('cup'), ...(d.kind === 'solids' ? ['solids'] : [])] : [N_('breast'), N_('bottle'), N_('solids'), ...(d.kind === 'cup' ? ['cup'] : [])], d.kind || (older ? 'cup' : 'breast'))}
    <div id="fBreast">${L(N_('Side'))}${radios('side', SIDES, d.side)}${L(N_('Minutes'))}${num('min', d.min, N_('e.g. 15'))}</div>
    <div id="fBottle">${L(volOz() ? N_('Amount (fl oz)') : N_('Amount (ml)'))}<div class="volrow">${num('ml', volIn(d.ml), volOz() ? N_('e.g. 3') : N_('e.g. 90'), volOz() ? 0.5 : 1)}<button type="button" class="btn" id="volFlip" aria-label="${__h('Switch between ml and fl oz')}">${volOz() ? __h('→ ml') : __h('→ fl oz')}</button></div>${L(N_('Milk'))}${radios('milk', older || MILKS_OLDER.slice(2).includes(d.milk) ? MILKS_OLDER : MILKS, d.milk)}
      <div id="fFormula">${L(N_('Which formula'))}${formulaPicker({ sel: `id="formulaSel" aria-label="${__h('Which formula')}"`, txt: `id="formula" aria-label="${__h('Formula name')}"` }, ev ? d.formula || '' : usualFormula(feedKid(ev)), recentFormulas(ev ? [feedKid(ev)] : kids()))}</div><p class="note prep" id="prep" hidden></p></div>
    <div id="fSolids">${foodsPicker(d.foods || [], ev ? [childOf(ev)] : dayKid() === 'all' ? kids().map(k => k.id) : [dayKid()])}${L(N_('How much'))}${radios('amount', Foods.PORTIONS, d.amount)}</div>`;
  if (type === 'pump') body = `${L(N_('Side'))}${radios('side', SIDES, d.side || 'Both')}${L(volOz() ? N_('Amount (fl oz)') : N_('Amount (ml)'))}${num('ml', volIn(d.ml), volOz() ? N_('e.g. 3') : N_('e.g. 90'), volOz() ? 0.5 : 1)}${L(N_('Minutes'))}${num('min', d.min, N_('e.g. 15'))}
    ${L(N_('Where is the milk?'))}<div class="chips">${Object.entries(STORES).map(([k, l]) => chip('store', k, __h(l), (d.store || 'now') === k, '', true)).join('')}</div>
    <p class="note">${__h('Expressed milk keeps about 4 hours at room temperature, 4 days in the fridge and 6 months in the freezer. The Milk stash on the Day page counts the days down.')}</p>
    ${editing ? '' : `<button type="button" class="btn" id="pumpStart" style="width:100%;margin-top:8px">⏱ ${__h('Start the timer instead')}</button>`}`;
  if (type === 'diaper') body = `
    ${L(N_('What was in it?'))}<div class="chips">${chip('pee', 1, '💧 ' + __h('Pee'), d.pee ?? !editing)}${chip('poo', 1, '💩 ' + __h('Poo'), d.poo)}${chip('rash', 1, __h('Rash'), d.rash, 'warn')}</div>
    <div id="dColor">${L(N_('Solid or wet?'))}${radios('texture', STOOL_TEXTURE, d.texture, '')}${L(N_('Poo colour'))}${radios('color', STOOL, d.color, '')}</div>`;
  // a nap or a night's sleep (a new entry follows the time it began until one is chosen); a nap is drawn dashed on the clock
  if (type === 'sleep') body = `
    ${L(N_('Nap or night sleep?'))}<div class="chips">${chip('nap', '1', '☀️ ' + __h('Nap'), editing && typeof d.nap === 'boolean' ? d.nap : napTime(defTs), '', true)}${chip('nap', '0', '🌙 ' + __h('Night sleep'), editing && typeof d.nap === 'boolean' ? !d.nap : !napTime(defTs), '', true)}</div>
    <p class="note">${__h('A nap is drawn as a dashed line on the clock, night sleep as a solid one.')}</p>
    <label class="f">${__h('Woke up at')} <small>${__h('(leave empty if still asleep)')}</small></label><input id="end" type="datetime-local" value="${ev && ev.end ? toLocalInput(ev.end) : ''}">
    <div class="mini"><button type="button" data-endnow>${__h('Now')}</button></div>`;
  if (type === 'wake') body = `${L(N_('Awake for (minutes)'))}${num('min', d.min, N_('e.g. 20'))}${L(N_('Why?'))}${radios('why', WAKE_WHY, d.why)}`;
  if (type === 'vomit') body = `${L(N_('Amount'))}${radios('amount', AMOUNTS, d.amount || 'Spit-up')}<div class="chips" style="margin-top:12px">${chip('projectile', 1, __h('Projectile'), d.projectile, 'warn')}</div>`;
  if (type === 'play') { const kinds = playKinds(forKids); body = `${L(N_('Activity'))}${radios('activity', [...new Set([...kinds, ...(d.activity ? [d.activity] : [])])], d.activity || kinds[0])}${L(N_('Minutes'))}${num('min', d.min, N_('e.g. 10'))}`; }
  // a drop-off: where (the place used last time, or the usual one for the age), who dropped off, who picks up and when; a pick-up later
  // on (for a day logged afterwards). A pick-up on its own: where from, and who.
  if (type === 'care' || type === 'pickup') {
    const last = editing ? null : db.events.filter(e => e.type === 'care' && forKids.some(k => k.id === childOf(e))).sort((a, b) => b.ts - a.ts)[0], p = editing ? d : (last && last.data) || {};
    const cur = p.own ? '__other' : p.place || (type === 'care' ? Stages.carePlace(stageOf(forKids[0], defTs)) : ''), names = whoNames();
    const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    body = `${L(type === 'care' ? N_('Where?') : N_('From where?'))}<div class="chips">${Stages.CARE.map(x => chip('cplace', x, __h(x), x === cur, '', true)).join('')}${chip('cplace', '__other', __h('Somewhere else'), cur === '__other', '', true)}</div>
      <input id="cother" type="text" maxlength="40" value="${esc(p.own ? p.place || '' : '')}" placeholder="${__h('Name of the place')}" aria-label="${__h('Name of the place')}"${cur === '__other' ? '' : ' hidden'}>
      ${type === 'care' ? `<div id="cWith"${CARE_WITH[cur] ? '' : ' hidden'}><label class="f" id="cwithL">${__h(careWithLabel(cur))}</label><input id="cwith" type="text" maxlength="60" value="${esc(editing ? d.with || '' : '')}" placeholder="${__h('Their name')}"><div class="mini names" id="cwithNames"></div></div>
      ${L(N_('Location (optional)'))}<input id="cloc" type="text" maxlength="120" value="${esc(editing ? d.location || '' : '')}" placeholder="${__h('Address, or how to find it')}">` : ''}
      ${L(type === 'care' ? N_('Dropped off by (optional)') : N_('Picked up by (optional)'))}<input id="cwho" type="text" maxlength="60" list="cnames" value="${esc(editing ? d.who || '' : myName())}">
      ${type === 'care' ? `${L(N_('Who picks up? (optional)'))}<input id="cplan" type="text" maxlength="60" list="cnames" value="${esc(editing ? d.plan || '' : '')}" placeholder="${__h('e.g. Grandpa')}">
      ${L(N_('Pick-up time (optional)'))}<input id="cat" type="time" value="${editing && Number.isInteger(d.at) ? hhmm(d.at) : ''}">
      ${editing ? '' : `${L(N_('Already picked up? (optional)'))}<input id="cout" type="datetime-local" value="">`}` : ''}
      <datalist id="cnames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
  }
  if (type === 'study') body = `${L(N_('What?'))}${radios('skind', STUDY, d.kind || 'Homework')}
    ${L(N_('Subject (optional)'))}<input id="ssub" type="text" maxlength="60" value="${esc(d.subject || '')}" placeholder="${__h('e.g. maths, spelling')}">
    ${L(N_('Minutes'))}${num('min', d.min, N_('e.g. 20'))}
    <div id="sPages">${L(N_('Pages read (optional)'))}${num('pages', d.pages, N_('e.g. 10'))}</div>`;
  const symList = older ? KID_SYMPTOMS : SYMPTOMS;
  if (type === 'health') body = `${L(N_('Check anything you noticed'))}<div class="chips">${[...symList, ...(d.symptoms || []).filter(x => !symList.includes(x))].map(s => chip('sym', s, __h(s), (d.symptoms || []).includes(s), 'warn')).join('')}</div>${L(N_('Temperature (°)'))}${num('temp', d.temp, N_('optional'), 0.1)}`;
  if (type === 'meal') body = `${L(N_('Which meal?'))}${radios('meal', MEALS, d.meal || mealAt(defTs))}
    ${foodsPicker(d.foods || [], forKids.map(k => k.id), { open: !!(d.foods || []).length, baby: false })}
    ${L(N_('How much did they eat?'))}${radios('amount', EATEN, d.amount)}`;
  if (type === 'potty') {
    const cur = d.dry ? 'dry' : d.pee && d.poo ? 'both' : d.pee ? 'pee' : d.poo ? 'poo' : editing ? 'none' : 'pee';
    body = `${L(N_('What happened?'))}<div class="chips">${POTTY.map(([v, ic, l]) => chip('pwhat', v, ic + __h(l), v === cur, '', true)).join('')}</div>
    <div id="pWhere">${L(N_('Where?'))}${radios('where', POTTY_WHERE, d.accident ? 'Accident' : d.where || 'Potty')}</div>
    <div id="pTexture">${L(N_('Solid or wet?'))}${radios('texture', STOOL_TEXTURE, d.texture, '')}</div>
    <div class="chips" style="margin-top:12px">${chip('asked', 1, __h('Asked to go'), d.asked)}</div>`;
  }
  if (type === 'vaccine') {
    const cur = d.own ? '__other' : d.name || '';
    body = `${L(N_('Which vaccine?'))}<select id="vname" class="fsel" aria-label="${__h('Which vaccine?')}"><option value=""${cur ? '' : ' selected'}>${__h('Choose a vaccine')}</option>${VACCINES.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${__h(v)}</option>`).join('')}<option value="__other"${cur === '__other' ? ' selected' : ''}>${__h('Another vaccine')}</option></select>
      <input id="vother" type="text" maxlength="60" value="${esc(d.own ? d.name : '')}" placeholder="${__h('Name of the vaccine')}" aria-label="${__h('Name of the vaccine')}"${cur === '__other' ? '' : ' hidden'}>
      ${L(N_('Dose (if you know it)'))}<div class="chips">${[1, 2, 3, 4, 5].map(i => chip('vdose', i, String(i), +d.dose === i, '', true)).join('')}</div>
      ${L(N_('Where (optional)'))}<input id="vplace" type="text" maxlength="80" value="${esc(d.place || '')}" placeholder="${__h('e.g. the clinic')}">
      ${L(N_('Batch number (optional)'))}<input id="vbatch" type="text" maxlength="40" value="${esc(d.batch || '')}">`;
  }
  if (type === 'visit') body = `${L(N_('What kind of visit?'))}${radios('vkind', VISITS, d.kind || 'Checkup')}
    ${L(N_('Who (optional)'))}<input id="vwho" type="text" maxlength="80" value="${esc(ev ? d.who || '' : (db.baby.doctor || {}).name || '')}" placeholder="${__h('e.g. Dr Patel')}">
    ${L(N_('Why (optional)'))}<input id="vwhy" type="text" maxlength="120" value="${esc(d.why || '')}" placeholder="${__h('e.g. an ear infection')}">`;
  if (type === 'growth') {
    const us = usUnits(), k = kidById(ev ? childOf(ev) : viewKid()) || forKids[0], head = d.head || !k || !k.birth || Stages.months(k.birth, defTs) < 36, [lb, oz] = d.weight ? lbOz(d.weight) : ['', ''];
    body = `${us ? `${L(N_('Weight'))}<div class="row2"><label class="unitin">${num('gwlb', lb, '')}<span>${__h('lb')}</span></label><label class="unitin">${num('gwoz', oz, '', 0.1)}<span>${__h('oz')}</span></label></div>` : `${L(N_('Weight (kg)'))}${num('gw', d.weight, N_('e.g. 9.5'), 0.01)}`}
      ${L(us ? N_('Length or height (in)') : N_('Length or height (cm)'))}${num('gh', d.height ? fmtIn(d.height, us) : '', us ? N_('e.g. 30.5') : N_('e.g. 76.5'), 0.1)}
      <div id="gHead"${head ? '' : ' hidden'}>${L(us ? N_('Head (in)') : N_('Head (cm)')) + num('gc', d.head ? fmtIn(d.head, us) : '', N_('optional'), 0.1)}</div>
      <p class="note gpct" id="gpct" aria-live="polite"></p>`;
  }
  if (type === 'health') body += `<div class="recadd"><p class="note">${__h('A vaccine, a doctor visit or a measurement? They go in the health record:')}</p><div class="chips">${['vaccine', 'visit', 'growth'].map(t => `<button type="button" class="chip" data-switch="${t}"><span>${TYPES[t].icon} ${__h(TYPES[t].label)}</span></button>`).join('')}</div></div>`;
  if (type === 'med') body = `${L(N_('Medicine / vitamin'))}<input id="mname" type="text" value="${esc(d.name || '')}" placeholder="${__h('e.g. Vitamin D')}"><p class="call" id="medWarn" hidden></p>${L(N_('Dose'))}<input id="mdose" type="text" value="${esc(d.dose || '')}" placeholder="${__h('e.g. 1 ml')}">`;

  // Who is it for? Only asked when the log has more than one child. New entries can be logged for several at once (e.g. all three fed together),
  // except a measurement: that is one child's (the one whose health record is open).
  const multi = kids().length > 1, one = editing || type === 'growth', here = ev ? childOf(ev) : type === 'growth' ? viewKid() : dayKid();
  const forHtml = !multi ? '' : `<label class="f">${one ? __h('For') : __h('For (tick everyone it applies to)')}</label><div class="chips kidchips">${kids().map(k =>
    `<label class="chip kidchip" style="--k:${k.color}"><input type="${one ? 'radio' : 'checkbox'}" name="kid" value="${k.id}" ${k.id === here ? 'checked' : ''}><span>${avatar(k)}${esc(kidName(k))}</span></label>`).join('')}</div>`;
  $('#sheet').innerHTML = `<h3>${bathy ? TYPES.bath.icon : T.icon} ${editing ? __h('Edit {what}', { what: __(noun) }) : __h('Add {what}', { what: __(noun) })}</h3>
    ${forHtml}
    ${L(type === 'sleep' ? N_('Fell asleep at') : N_('Time'))}<input id="ts" type="datetime-local" value="${toLocalInput(defTs)}">${!ev && viewDay !== startOfDay(Date.now()) ? `<p class="note pastday">${__h('This entry goes on {date}, not today.', { date: fmtDate(viewDay) })}</p>` : ''}
    <div class="mini">${[5, 15, 30, 60].map(m => `<button type="button" data-ago="${m}">${m < 60 ? __h('{n} min ago', { n: m }) : __h('1 hr ago')}</button>`).join('')}<button type="button" data-ago="0">${__h('Now')}</button></div>
    ${body}
    ${L(N_('Note (optional)'))}<textarea id="note" rows="2" maxlength="1000" placeholder="${__h('Anything worth remembering')}">${esc(ev ? ev.note : '')}</textarea>
    <div class="row" style="margin-top:16px">${editing && Sync.can('delete', ev) ? `<button class="btn d" id="del">${__h('Delete')}</button>` : ''}<button class="btn" id="cancel">${__h('Cancel')}</button><button class="btn p" id="save">${__h('Save')}</button></div>`;
  Icons.paint($('#sheet')); $('#sheet').hidden = $('#sheetBack').hidden = false; sheetX();

  const S = $('#sheet'), checked = n => S.querySelector(`[name=${n}]:checked`);
  bindFormulaPickers(S);
  /** The child a measurement is for (the one ticked), and the measurement as typed, in kg and cm (from pounds and ounces, and inches). */
  const growthKid = () => (multi ? kidById((S.querySelector('[name=kid]:checked') || {}).value) : kids()[0]);
  const readGrowth = () => {
    const v = id => { const el = $(id), x = el && el.value !== '' ? +el.value : NaN; return Number.isFinite(x) && x > 0 ? x : 0; }, us = usUnits(), o = {};
    const w = us ? (v('#gwlb') + v('#gwoz') / 16) * LB : v('#gw'), h = v('#gh') * (us ? IN : 1), c = $('#gHead').hidden ? 0 : v('#gc') * (us ? IN : 1);
    if (w) o.weight = Math.round(w * 1000) / 1000; if (h) o.height = Math.round(h * 10) / 10; if (c) o.head = Math.round(c * 10) / 10;
    return o;
  };
  const val = n => { const c = checked(n); return c ? c.value : ''; };
  const sync = () => {
    if (S.querySelector('.fsum')) S.querySelector('.fsum').textContent = [...S.querySelectorAll('[name=food]:checked')].map(c => __(c.value)).join(', ');
    if (type === 'potty') { $('#pWhere').hidden = val('pwhat') === 'dry'; $('#pTexture').hidden = !/^(poo|both)$/.test(val('pwhat')); }
    if (type === 'sleep' && !editing && !S.dataset.napPicked) { const n = napTime(fromLocalInput($('#ts').value) || defTs); S.querySelector('[name=nap][value="1"]').checked = n; S.querySelector('[name=nap][value="0"]').checked = !n; }
    if (type === 'vaccine') $('#vother').hidden = $('#vname').value !== '__other';
    if (type === 'care' || type === 'pickup') $('#cother').hidden = val('cplace') !== '__other';
    if (type === 'care') {   // at the grandparents', a babysitter's, a childminder's or a friend's: whose, from the family's own names; and where the place is, as typed last time
      const pl = val('cplace'), own = pl === '__other', w = $('#cWith'); w.hidden = !CARE_WITH[pl];
      if (!w.hidden) {
        $('#cwithL').textContent = __(careWithLabel(pl));
        $('#cwithNames').innerHTML = careNames(pl).map(n => `<button type="button" data-cwith="${esc(n)}" class="${n === $('#cwith').value.trim() ? 'on' : ''}">${esc(n)}</button>`).join('');
        $('#cwithNames').querySelectorAll('[data-cwith]').forEach(b => b.onclick = () => { $('#cwith').value = b.dataset.cwith; sync(); });
      }
      if (!editing && !$('#cloc').dataset.typed) $('#cloc').value = lastLocation(own ? $('#cother').value.trim() : pl, own);
    }
    if (type === 'study') $('#sPages').hidden = val('skind') !== 'Reading';
    if (type === 'growth') {   // (head size until 3 years old, the age of the charts)
      const k = growthKid(), at = fromLocalInput($('#ts').value) || defTs; $('#gHead').hidden = !(d.head || !k || !k.birth || Stages.months(k.birth, at) < 36);
      $('#gpct').textContent = k ? growthNote(k, at, readGrowth()) : '';
    }
    if (type === 'med' && $('#medWarn')) {   // a medicine the child is allergic to, by its name or one of its family's
      const ids = S.querySelector('[name=kid]') ? [...S.querySelectorAll('[name=kid]:checked')].map(c => c.value) : [ev && ev.child || kids()[0].id];
      const hits = medAllergies(ids, $('#mname').value), w = $('#medWarn');
      w.hidden = !hits.length; w.dataset.who = hits.map(h => kidName(h.kid)).join(', ');
      if (hits.length) w.textContent = '⚠️ ' + hits.map(h => __('{child} is allergic to {what}', { child: kidName(h.kid), what: allergyText(h.allergy) })).join(' · ');
    }
    if (type === 'feed' && $('#fBreast')) {
      const kind = val('kind'), b = kind === 'bottle' || kind === 'cup'; $('#fBreast').hidden = kind !== 'breast'; $('#fBottle').hidden = !b; $('#fSolids').hidden = kind !== 'solids'; $('#fFormula').hidden = val('milk') !== 'Formula';
      $('#formula').hidden = $('#formulaSel').value !== '__other';
      // formula prep: level scoops for the amount, with the scoop size the tin says (1 per 30 ml, or 1 per 60 ml as most North American tins), remembered on this phone
      const prep = $('#prep'); if (prep) {
        const v = +$('#ml').value || 0, ml = volOz() ? Math.round(v * OZ) : v, per = db.meta.scoop || (myRegion() === 'na' ? 60 : 30), scoops = Math.round(ml / per * 2) / 2;
        prep.hidden = !(b && val('milk') === 'Formula' && ml > 0);
        const html = ml > 0 ? `${__h('About {n} level scoops in {water} of water', { n: fmtNum(scoops, 1), water: fmtVol(ml) })} <small>${__h('(1 scoop per {per} ml)', { per })}</small><br><small>${__h('Water first, then the powder. Check the tin: scoops differ by brand.')}</small> <button type="button" class="btn mini" id="scoopFlip">${per === 30 ? __h('My tin says 1 per 60 ml') : __h('My tin says 1 per 30 ml')}</button>` : '';
        if (prep.innerHTML !== html) prep.innerHTML = html;   // (redrawn only when it changes: leaving the amount field redraws on blur, and a tap on the button must not be lost to that)
        prep.onclick = e => { if (e.target.closest('#scoopFlip')) { db.meta.scoop = (db.meta.scoop || (myRegion() === 'na' ? 60 : 30)) === 30 ? 60 : 30; Store.save(db); sync(); } };
      }
      // logging for several children: suggest the first ticked child's usual formula, until a formula is picked by hand
      const first = S.querySelector('[name=kid]:checked');
      if (!ev && first && !S.dataset.formulaPicked) { const u = usualFormula(kidById(first.value)); if (u) setPick(S.querySelector('.fpick'), u); }
    }
    if (type === 'diaper' && $('#dColor')) $('#dColor').hidden = !checked('poo');
  };
  S.onchange = e => { if (e && e.target && (e.target.id === 'formulaSel' || e.target.id === 'formula')) S.dataset.formulaPicked = '1'; if (e && e.target && e.target.name === 'nap') S.dataset.napPicked = '1'; sync(); };
  delete S.dataset.formulaPicked; delete S.dataset.napPicked; sync();
  if ($('#cloc')) { delete $('#cloc').dataset.typed; $('#cloc').oninput = () => { $('#cloc').dataset.typed = '1'; }; }
  // ml ⇄ fl oz: the switch changes the unit for the whole app and converts the number already typed
  if ($('#volFlip')) $('#volFlip').onclick = () => {
    const v = $('#ml').value, ml = v === '' ? '' : volOut(+v); db.meta.vol = volOz() ? 'ml' : 'oz'; Store.save(db);
    const lbl = $('#fBottle').querySelector('label'); if (lbl) lbl.textContent = volOz() ? __('Amount (fl oz)') : __('Amount (ml)');
    $('#ml').value = volIn(ml); $('#ml').step = volOz() ? 0.5 : 1; $('#ml').placeholder = volOz() ? __('e.g. 3') : __('e.g. 90'); $('#volFlip').textContent = volOz() ? __('→ ml') : __('→ fl oz');
  };
  S.oninput = type === 'growth' || type === 'med' || type === 'feed' ? sync : null;   // (a measurement: the percentiles as the numbers are typed; a medicine: the allergy warning)
  S.querySelectorAll('[data-switch]').forEach(b => b.onclick = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; openSheet(b.dataset.switch); });
  S.querySelectorAll('[data-ago]').forEach(b => b.onclick = () => { $('#ts').value = toLocalInput(Date.now() - b.dataset.ago * MIN); });
  if ($('#foodAdd')) $('#foodAdd').onclick = () => { const v = $('#foodOther').value.trim().slice(0, 60); if (!v) return; $('#foodOther').value = ''; $('#foodTyped').insertAdjacentHTML('beforeend', chip('food', v, esc(v), true)); sync(); };
  const en = S.querySelector('[data-endnow]'); if (en) en.onclick = () => { $('#end').value = toLocalInput(Date.now()); };
  if ($('#pumpStart')) $('#pumpStart').onclick = () => {   // a pumping session under way: the banner counts the minutes until Done
    const kid = (S.querySelector('[name=kid]:checked') || {}).value || (dayKid() !== 'all' ? dayKid() : kids()[0].id);
    db.events.push({ id: uid(), type: 'pump', ts: Date.now(), end: null, data: { side: val('side') || 'Both', store: 'now' }, note: '', by: Auth.id || undefined, child: kid, updated: stamp() });
    close(); save(); render();
  };
  const close = () => { $('#sheet').hidden = $('#sheetBack').hidden = true; };
  $('#sheetBack').onclick = $('#cancel').onclick = close;
  if ($('#del')) $('#del').onclick = () => { if (confirm(__('Delete this entry?'))) { removeEvent(ev); save(); close(); render(); toast(__('Deleted')); } };
  $('#save').onclick = () => {
    const ts = fromLocalInput($('#ts').value);
    if (!ts) return toast(__('Please pick a time'));
    const n = id => { const v = $(id).value; return v === '' ? undefined : +v; };
    const formulaName = () => { const sel = $('#formulaSel'); return sel ? (sel.value === '__other' ? $('#formula').value : sel.value).trim().slice(0, 60) : ''; };
    let data = {}, end;
    if (type === 'feed') data = val('kind') === 'bottle' || val('kind') === 'cup' ? { kind: val('kind'), ml: volOut(n('#ml')), milk: val('milk'), ...(val('milk') === 'Formula' && formulaName() ? { formula: formulaName() } : {}) }
      : val('kind') === 'solids' ? { kind: 'solids', foods: [...S.querySelectorAll('[name=food]:checked')].map(c => c.value), ...(val('amount') ? { amount: val('amount') } : {}) } : { kind: 'breast', side: val('side'), min: n('#min') };
    if (data.kind === 'solids' && !data.foods.length) return toast(__('Choose at least one food'));
    if (type === 'diaper') {
      data = { pee: !!checked('pee'), poo: !!checked('poo'), rash: !!checked('rash') };
      if (data.poo) { data.color = val('color'); if (val('texture')) data.texture = val('texture'); }
      if (!data.pee && !data.poo && !confirm(__('Save as a dry diaper?'))) return;
    }
    if (type === 'sleep') { end = $('#end').value ? fromLocalInput($('#end').value) : undefined; if (end && end <= ts) return toast(__('Wake time must be after bedtime')); data = { nap: val('nap') === '1' }; }
    if (type === 'pump') { data = { side: val('side') || 'Both', ml: volOut(n('#ml')), min: n('#min'), store: val('store') || 'now' }; if (ev && ev.data && ev.data.used) data.used = true; if (ev && ev.end != null) end = ev.end; }
    if (type === 'wake') data = { min: n('#min'), why: val('why'), ...(ev && ev.data && ev.data.sleep ? { sleep: ev.data.sleep } : {}) };   // (a wake-up that was a pause keeps its sleep)
    if (type === 'vomit') data = { amount: val('amount'), projectile: !!checked('projectile') };
    if (type === 'play') data = { activity: val('activity'), min: n('#min') };
    if (type === 'health') {
      data = { symptoms: [...S.querySelectorAll('[name=sym]:checked')].map(c => c.value), temp: n('#temp') };
      if (!data.symptoms.length && !data.temp && !$('#note').value.trim()) return toast(__('Tick a symptom or add a note'));
    }
    if (type === 'med') { data = { name: $('#mname').value.trim(), dose: $('#mdose').value.trim() }; if (!data.name) return toast(__('Enter a name')); if (!$('#medWarn').hidden && !confirm(__('{child} is allergic to this medicine. Log it anyway?', { child: $('#medWarn').dataset.who }))) return; }
    if (type === 'meal') data = { meal: val('meal') || mealAt(ts), foods: [...S.querySelectorAll('[name=food]:checked')].map(c => c.value), ...(val('amount') ? { amount: val('amount') } : {}) };
    if (type === 'vaccine') {
      const sel = $('#vname').value, own = $('#vother').value.trim().slice(0, 60), name = sel === '__other' ? own : sel, txt = id => $(id).value.trim();
      if (!name) return toast(__('Choose the vaccine'));
      data = { name, ...(sel === '__other' && !VACCINES.includes(own) ? { own: true } : {}), ...(val('vdose') ? { dose: +val('vdose') } : {}), ...(txt('#vplace') ? { place: txt('#vplace').slice(0, 80) } : {}), ...(txt('#vbatch') ? { batch: txt('#vbatch').slice(0, 40) } : {}) };
    }
    if (type === 'visit') { const who = $('#vwho').value.trim().slice(0, 80), why = $('#vwhy').value.trim().slice(0, 120); data = { kind: val('vkind') || 'Checkup', ...(who ? { who } : {}), ...(why ? { why } : {}) }; }
    if (type === 'growth') {
      data = readGrowth();
      if (!data.weight && !data.height && !data.head) return toast(__('Enter at least one measurement'));
      // a typo (102 for 10.2) or the wrong units: far outside what the growth charts know for the age, or not a child's size at all
      const k = growthKid(), m = k && k.birth ? ageMonths(k, ts) : -1, sexed = k && (k.sex === 'boy' || k.sex === 'girl') && m >= 0;
      const far = sexed && ['weight', 'height', 'head'].some(kind => { const p = data[kind] && Growth.percentile(kind, k.sex, m, data[kind]); return p && Math.abs(p.z) > 5; });
      if (far || (data.weight && (data.weight < 0.3 || data.weight > 250)) || (data.height && (data.height < 20 || data.height > 250)) || (data.head && (data.head < 20 || data.head > 70))) return toast(__("That doesn't look right: check the numbers and the units"));
    }
    let pickTs = 0;
    if (type === 'care' || type === 'pickup') {
      const pl = val('cplace'), other = $('#cother').value.trim().slice(0, 40), person = $('#cwho').value.trim().slice(0, 60);
      if (!pl || (pl === '__other' && !other)) return toast(__('Choose where'));
      data = { place: pl === '__other' ? other : pl, ...(pl === '__other' ? { own: true } : {}), ...(person ? { who: person } : {}) };
      if (type === 'care') {
        const w = $('#cWith').hidden ? '' : $('#cwith').value.trim().slice(0, 60), loc = $('#cloc').value.trim().slice(0, 120);
        if (w) data.with = w; if (loc) data.location = loc;
        const plan = $('#cplan').value.trim().slice(0, 60), at = $('#cat').value;
        if (plan) data.plan = plan;
        if (/^\d\d:\d\d$/.test(at)) data.at = +at.slice(0, 2) * 60 + +at.slice(3);
        pickTs = $('#cout') && $('#cout').value ? fromLocalInput($('#cout').value) : 0;
        if (pickTs && pickTs <= ts) return toast(__('The pick-up must be after the drop-off'));
      }
    }
    if (type === 'study') data = { kind: val('skind') || 'Homework', ...($('#ssub').value.trim() ? { subject: $('#ssub').value.trim().slice(0, 60) } : {}), min: n('#min'), ...(val('skind') === 'Reading' && n('#pages') ? { pages: n('#pages') } : {}) };
    if (type === 'potty') {
      const w = val('pwhat') || 'none', where = val('where') || 'Potty';
      data = { pee: w === 'pee' || w === 'both', poo: w === 'poo' || w === 'both', ...(w === 'dry' ? { dry: true } : where === 'Accident' ? { accident: true } : { where }), ...(checked('asked') ? { asked: true } : {}) };
      if (data.poo && val('texture')) data.texture = val('texture');
    }
    if (ev && ev.data && ev.data.approx && Math.floor(ts / MIN) === Math.floor(ev.ts / MIN)) data.approx = true;   // still the estimated time
    let who = multi ? [...S.querySelectorAll('[name=kid]:checked')].map(c => c.value).filter(id => kidById(id)) : [kids()[0].id];
    if (!who.length) return toast(__('Choose who this is for'));
    if (type === 'sleep' && !end && !ev) {   // (a child up for a moment: Sleep means asleep again)
      const paused = who.filter(id => pausedSleep(id));
      for (const id of paused) resumeSleep(pauseOf(activeSleep(id)));
      who = who.filter(id => !paused.includes(id));
      if (!who.length) { save(); close(); render(); return toast(__('Asleep again – the sleep goes on')); }
    }
    if (type === 'sleep' && !end) { for (const id of who) { const cur = activeSleep(id); if (cur && cur !== ev) return toast(multi ? __('{name} is sleeping – tap “Woke up” first', { name: kidName(kidById(id)) }) : __('Already sleeping – tap “Woke up” first')); } }
    const usualBefore = new Map(who.map(id => [id, type === 'feed' ? usualFormula(kidById(id)) : '']));
    for (const id of who) {
      const rec = ev || { id: uid(), type, by: Auth.id || undefined };
      Object.assign(rec, { ts, data: structuredClone(data), note: $('#note').value.trim(), updated: stamp(), child: id });
      if (type === 'sleep') { if (end) endSleep(rec, end); else delete rec.end; }
      if (type === 'wake' && rec.data.sleep && !rec.end && rec.data.min) rec.end = rec.ts + rec.data.min * MIN;   // (a pause given its length: asleep again then)
      if (!ev) db.events.push(rec);
      if (pickTs) db.events.push({ id: uid(), type: 'pickup', ts: pickTs, data: { place: data.place, ...(data.own ? { own: true } : {}) }, note: '', updated: stamp(), by: Auth.id || undefined, child: id });
    }
    if (who.length === 1) { if (dayKid() !== who[0]) setKid(who[0]); } else if (dayKid() !== 'all' && !who.includes(dayKid())) setKid('all');
    save(); close(); viewDay = startOfDay(ts); render(); toast(who.length > 1 ? __n('Saved for {n} child', 'Saved for {n} children', who.length) : __('Saved'));
    const settled = type === 'feed' ? who.filter(id => learnedFormula(kidById(id)) && usualFormula(kidById(id)) !== usualBefore.get(id)) : [];
    if (settled.length) toast(__("{formula} is now {names}'s usual formula", { formula: usualFormula(kidById(settled[0])), names: andList(settled.map(id => kidName(kidById(id)))) }));
    const risky = data.kind === 'solids' || type === 'meal' ? who.flatMap(id => data.foods.filter(f => allergicTo(id, f)).map(f => [id, f])) : [];
    if (risky.length) {
      const a = { name: kidName(kidById(risky[0][0])), food: __(risky[0][1]), sos: __(Guide.sos(myRegion())) };
      setTimeout(() => alert(older ? __('{name} is allergic to {food}. Watch closely, and call {sos} for trouble breathing, or swelling of the lips, tongue or face.', a)
        : __('{name} is allergic to {food}. Watch closely, and call {sos} for trouble breathing, swelling of the lips, tongue or face, or if your baby goes floppy or pale.', a)), 300);
    }
    if (type === 'diaper' && data.poo && STOOL_WARN.includes(data.color)) setTimeout(() => alert(__('Red-streaked or pale / white stools can be a sign of a problem. Please tell your pediatrician (and call straight away if your baby seems unwell).')), 300);
    if (type === 'health' && older && data.symptoms.some(s => KID_URGENT.includes(s))) setTimeout(() => alert(__('One of these symptoms can be urgent. If {name} has trouble breathing, blue lips or face, or is very hard to wake, call {sos} now.', { name: andList(who.map(id => kidName(kidById(id)))), sos: __(Guide.sos(myRegion())) })), 300);
    else if (type === 'health' && !older && data.symptoms.some(s => URGENT.includes(s))) setTimeout(() => alert(__('One of these symptoms can be urgent. If your baby has blue lips/face, trouble breathing, a fever (38°C / 100.4°F+ in a newborn) or is hard to wake, call your pediatrician or emergency services now.')), 300);
  };
}

/** The page follows the calendar. When the app comes back after being paused, or the day changes while it is open, the Day page moves to
    today (and the Month page to this month): at once when the page was "today" as it was drawn (the date moved under it, as it does when
    the app is left open overnight), and after a long pause (half an hour) even when another day was chosen on purpose. True when it moved. */
let shownAt = Date.now();   // when the page was last drawn
function followToday(resumed) {   // (also while the lock screen is up: the page behind it is right once it opens)
  const now = Date.now(), today = startOfDay(now), t = new Date(now), longAway = resumed && now - shownAt > 30 * MIN;
  const moveDay = viewDay !== today && (startOfDay(shownAt) === viewDay || longAway);
  const moveMonth = longAway && (calMonth.getFullYear() !== t.getFullYear() || calMonth.getMonth() !== t.getMonth());
  if (!moveDay && !moveMonth) return false;
  if (moveDay) { viewDay = today; quad = null; if (tab !== 'month' || longAway) calMonth = new Date(today); }
  if (moveMonth) calMonth = new Date(today);
  render(); if (tab === 'day' || tab === 'month') window.scrollTo(0, 0); return true;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) followToday(true); });
setInterval(() => { if (!followToday(false) && (activeSleep() || Travel.moving(db.events)) && tab === 'day') render(); }, 60000);   // (midnight; an open sleep's length)
setInterval(() => { const el = $('#cElapsed'); if (el) el.textContent = __('{n} s', { n: Math.round((Date.now() - +el.dataset.since) / 1000) }); }, 1000);   // (a contraction under way)

// Re-render after a background sync, unless the user is in the middle of typing.
Sync.onChange = () => {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return syncLine();
  if (!$('#sheet').hidden) return syncLine();
  render(); Acct.promptRequests();   // (a request to join the log, on a parent's phone: a sheet with Approve)
};
// Phone app: links opened by the OS (invite links, cloud sign-in returns) and the Android back button.
Native.onUrl(async url => {
  const m = await Cloud.handleOAuthUrl(url);
  if (m) { if (await Acct.cloudReturn(Cloud.lastConnected)) return; tab = 'more'; render(); return toast(__(m)); }
  Acct.receiveJoin(url);
});
Native.onBack(() => {
  if (Tour.active()) { Tour.end(false); return true; }
  if (!$('#sheet').hidden) { $('#sheetBack').click(); return true; }
  if (tab === 'health') { tab = recordFrom; render(); return true; }
  if (tab !== 'day') { tab = 'day'; render(); return true; }
  return false;
});
Lock.onChange = () => render();
/** Keeps the page out from under the phone's status and navigation bars: from Android 15 the app is drawn edge to edge and the web
    view's safe-area values stay at zero, so the layout uses these variables next to env(safe-area-inset-*). */
function applyInsets(i) {
  const st = document.documentElement.style;
  for (const k of ['top', 'bottom', 'left', 'right']) st.setProperty('--sa' + k[0], Math.max(0, Math.round(+(i || {})[k] || 0)) + 'px');
}
Sync.onSessionLost = () => Acct.sessionLost();
(async () => {
  const mark = n => { try { performance.mark('ll:' + n); } catch (e) { /* no timeline */ } };   // (start-up timings, for the speed suite and diagnostics)
  mark('start');
  await Promise.all([I18n.init(), Store.init()]); db = normalize(await Store.load()); mark('loaded');   // before anything reads the log, or shows text
  Media.onChange = () => render();   // (a thumbnail arrived)
  Icons.init(); Icons.paint(document.querySelector('#tabs')); Icons.paint(document.querySelector('#cover')); Icons.paint(document.querySelector('#helpBtn'));
  Theme.onChange = () => { render(); Native.setBarsLight(!Theme.isDark()); };
  Native.watchInsets(applyInsets); Native.setBarsLight(!Theme.isDark());   // the phone's bars: keep out from under them, icons to match
  Store.st.onChange = () => { render(); if (!Store.st.ok) toast(__('Cannot save on this phone – free up space')); };
  if (Store.st.quarantined || Store.st.recovered) setTimeout(() => toast(Store.st.recovered ? __('Your saved log was damaged and has been restored from a recent backup') : __('A damaged copy of the log was set aside; it will be re-downloaded from your family log')), 600);
  if (Native.is) {
    await Promise.all([Auth.init(), Cloud.init()]); await Folder.init(); await Acct.init();   // secrets come from the Keychain / Keystore
    await Lock.init();
    await Notify.init();
    // a tap on the "still asleep?" notification, or on its Woke up / Still asleep buttons
    Notify.onAction((action, x) => {
      const s = db.events.find(e => e.id === x.sleep);
      if (action === 'still') return;
      if (action === 'woke' && s && !s.end) { if (!Sync.can('edit', s)) toast(__("You can't change this entry")); else { endSleep(s); save(); toast(__('Sleep saved')); } }
      tab = 'day'; viewDay = startOfDay(Date.now()); if (s && s.child && kidById(s.child)) setKid(s.child); render();
    });
    Native.onAppState(active => { if (active) { Notify.sync(db.events); followToday(true); } });
  }
  render(); mark('drawn');                             // the gate decides what to show: sign-in, two-step check, lock, or the app
  if (!Native.is) return;
  const launch = await Native.launchUrl();             // app opened from an invite link
  if (launch) { const m = await Cloud.handleOAuthUrl(launch); if (!m) Acct.receiveJoin(launch); }
  if (Auth.configured && Auth.signedIn) { await Acct.refreshAuth(); Cloud.autoBackup(); }
})();
