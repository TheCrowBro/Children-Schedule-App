'use strict';
/* Languages. Every piece of text the app shows goes through __() (plain text), __h() (for HTML: escaped, with **bold**) or __n() (a
   count: "1 feed", "3 feeds", in each language's own plural forms). English is the source. Each language has a catalogue
   (lang/<code>.json, turned into lang/<code>.js when the app is built) mapping a short id of the English text to its translation. The id
   is a hash of the English, so when the English changes the old translation drops back to English instead of saying something out of
   date. Text defined as data (the Guide, labels, tour steps) is marked with N_() where it is written and translated where it is shown.

   The language follows the phone unless one is chosen in More → Language (kept on this phone). Dates and times use the language's own
   formats, with the phone's regional variant when it is the same language (an English phone in the UK keeps UK dates), and Western
   digits throughout so numbers read the same everywhere in the app. Arabic, Hebrew, Persian and Urdu run right to left. */
const I18n = (() => {
  // [code, name in the language itself, right to left]
  const LANGS = [
    ['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'],
    ['nl', 'Nederlands'], ['pl', 'Polski'], ['ro', 'Română'], ['ru', 'Русский'], ['uk', 'Українська'], ['tr', 'Türkçe'],
    ['ar', 'العربية', 1], ['he', 'עברית', 1], ['fa', 'فارسی', 1], ['ur', 'اردو', 1],
    ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['mr', 'मराठी'], ['te', 'తెలుగు'], ['ta', 'தமிழ்'],
    ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'], ['ja', '日本語'], ['ko', '한국어'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'],
    ['id', 'Bahasa Indonesia'], ['fil', 'Filipino'], ['sw', 'Kiswahili'], ['am', 'አማርኛ'], ['ha', 'Hausa'],
  ].map(([id, name, rtl]) => ({ id, name, rtl: !!rtl }));
  const KEY = 'll.lang', PSEUDO = 'qps';   // the pseudo-language the tests use: every known string comes back as ⟦…⟧
  const cats = {}, loading = {};
  let cur = 'en', loc = null, rules = null;

  /** The id of an English text in every catalogue: FNV-1a, base 36. */
  function idOf(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
  const pluralId = (one, other) => idOf(one + '\u0004' + other);
  // (in the pseudo-language each filled-in value is also marked «…», so the tests can tell English passed in from translated text)
  const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null ? (cur === PSEUDO ? `«${v[k]}»` : String(v[k])) : m)) : s);
  const known = code => code === PSEUDO || LANGS.some(l => l.id === code);
  /** The best language for this phone: the first of its languages there is a catalogue for (Chinese by script), else English. */
  function auto() {
    for (const raw of (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'])) {
      const l = String(raw || ''), base = l.split('-')[0].toLowerCase();
      if (base === 'zh') return /hant|-tw|-hk|-mo/i.test(l) ? 'zh-Hant' : 'zh-Hans';
      if (base === 'tl') return 'fil';
      if (base === 'iw') return 'he';
      if (LANGS.some(x => x.id === base)) return base;
    }
    return 'en';
  }
  /** The language chosen in More → Language, or '' to follow the phone. */
  const chosen = () => { try { const c = localStorage.getItem(KEY) || ''; return known(c) ? c : ''; } catch (e) { return ''; } };

  /** Text in the current language (English when there is no translation yet), with {placeholders} filled in from `v`. */
  function __(s, v) {
    const c = cats[cur], r = c && typeof c[idOf(s)] === 'string' ? c[idOf(s)] : s;
    return fill(r, v);
  }
  /** A count in the current language's plural forms: __n('{n} feed', '{n} feeds', 3). {n} is the count. */
  function __n(one, other, n, v) {
    const c = cats[cur], e = c && c[pluralId(one, other)];
    let r = '';
    if (e && typeof e === 'object') { if (!rules) rules = new Intl.PluralRules(locale()); r = e[rules.select(n)] || e.other || ''; }
    else if (typeof e === 'string') r = e;
    return fill(r || (n === 1 ? one : other), { n, ...v });
  }
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bold = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  /** __() for HTML: everything escaped (placeholders too), then **bold** made bold. */
  const __h = (s, v) => bold(escape(__(s, v)));
  const __hn = (one, other, n, v) => bold(escape(__n(one, other, n, v)));
  /** Marks text written as data, to be translated where it is shown. */
  const N_ = s => s;

  /** The locale for dates, times and lists: the phone's own variant of the language when it has one, with Western digits. */
  function locale() {
    if (loc) return loc;
    let l = cur === PSEUDO ? 'en-US' : cur;
    if (!/-(Hans|Hant)$/.test(l)) {
      const phone = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).find(x => x && x.split('-')[0].toLowerCase() === l);
      if (phone) l = phone;
    }
    try { l = new Intl.Locale(l, { numberingSystem: 'latn' }).toString(); } catch (e) { /* an old browser: as it is */ }
    return (loc = l);
  }
  /** The first day of the week where the phone is (0 Sunday … 6 Saturday), Sunday when the browser can't tell. */
  function firstDay() {
    try { const L = new Intl.Locale(locale()), w = L.getWeekInfo ? L.getWeekInfo() : L.weekInfo; if (w && w.firstDay) return w.firstDay % 7; } catch (e) { /* not supported */ }
    return 0;
  }
  /** A language's name in the language the app is in ("Deutsch (German)"). */
  function label(id) {
    const L = LANGS.find(x => x.id === id); if (!L) return id;
    let here = '';
    try { here = new Intl.DisplayNames([locale()], { type: 'language' }).of(id) || ''; } catch (e) { /* no DisplayNames */ }
    return here && here.toLowerCase() !== L.name.toLowerCase() ? `${L.name} (${here})` : L.name;
  }

  /** Add a language's catalogue (lang/<code>.js calls this). */
  const add = (code, catalogue) => { cats[code] = Object.assign(cats[code] || {}, catalogue); };
  /** Load a language's catalogue, once; resolves when it is there (or failed: English then). */
  function load(code) {
    if (code === 'en' || cats[code]) return Promise.resolve();
    if (!loading[code]) {
      loading[code] = new Promise(done => {
        const s = document.createElement('script'); s.src = `lang/${code}.js`; s.onload = done;
        s.onerror = () => { delete loading[code]; done(); };   // no catalogue: English, and try again next time
        document.head.appendChild(s);
      });
    }
    return loading[code];
  }
  function apply(code) {
    cur = code; loc = null; rules = null;
    const L = LANGS.find(x => x.id === code), root = document.documentElement;
    root.lang = code === PSEUDO ? 'en' : code; root.dir = L && L.rtl ? 'rtl' : 'ltr';
  }
  /** Start in the chosen language (or the phone's). Resolves once its catalogue is loaded. */
  async function init() { const c = chosen() || auto(); await load(c); apply(cats[c] || c === 'en' ? c : 'en'); }
  /** Choose a language ('' follows the phone again), keep the choice on this phone, and switch. */
  async function set(code) {
    if (code && !known(code)) return;
    try { if (code) localStorage.setItem(KEY, code); else localStorage.removeItem(KEY); } catch (e) { /* kept for this visit only */ }
    const c = code || auto(); await load(c); apply(cats[c] || c === 'en' ? c : 'en');
  }
  /** The text of the elements in the page shell (index.html) marked data-i18n (and data-i18n-label for their aria-label). */
  function paint(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { if (!el.dataset.en) el.dataset.en = el.textContent.trim(); el.textContent = __(el.dataset.en); });
    root.querySelectorAll('[data-i18n-label]').forEach(el => { const en = el.dataset.i18nLabel; el.setAttribute('aria-label', __(en)); if (el.hasAttribute('title')) el.title = __(en); });
  }

  return { LANGS, PSEUDO, idOf, pluralId, __, __n, __h, __hn, N_, init, set, add, load, auto, chosen, label, locale, firstDay, paint, lang: () => cur,
    rtl: () => !!(LANGS.find(x => x.id === cur) || {}).rtl, has: code => code === 'en' || !!cats[code] };
})();
const { __, __n, __h, __hn, N_ } = I18n;
/* exported __, __n, __h, __hn, N_ */
