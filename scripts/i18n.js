// The language catalogues (see i18n.js).
//   node scripts/i18n.js extract        every text the app shows → lang/en.json (the English source, with ids and where each is used)
//   node scripts/i18n.js check [code…]  each lang/<code>.json against the source: missing or stale ids, placeholders, **bold**, plural forms
//   node scripts/i18n.js status         how complete each language is
// build-web.js and build-demo.js turn lang/<code>.json into the catalogues the app loads (catalogue() below).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), langDir = path.join(root, 'lang');
// The files whose text is shown to people, in the order they are listed for translators.
const SOURCES = ['index.html', 'app.js', 'account.js', 'guide.js', 'stages.js', 'travel.js', 'calendar.js', 'formulas.js', 'foods.js', 'art.js', 'tour.js', 'sync.js', 'e2ee.js', 'media.js', 'cloud.js', 'auth.js', 'lock.js', 'native.js', 'notify.js'];
const TEXT = new Set(['__', '__h', 'N_']), PLURAL = new Set(['__n', '__hn']);

function idOf(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
const pluralId = (one, other) => idOf(one + '\u0004' + other);
const lit = n => (n && n.type === 'Literal' && typeof n.value === 'string' ? n.value : n && n.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null);
const holders = s => (s.match(/\{\w+\}/g) || []).sort().join(' ');
const bolds = s => (s.match(/\*\*/g) || []).length;

/** Every string the app shows, from the sources: [{ id, en } or { id, one, other }, with `where` and any `note` for translators]. */
function extract() {
  const espree = require('espree'), out = new Map(), problems = [];
  const put = (e, where) => {
    const had = out.get(e.id);
    if (had && (had.en !== e.en || had.one !== e.one || had.other !== e.other)) problems.push(`id ${e.id} is used by two different texts: "${had.en || had.one}" and "${e.en || e.one}"`);
    if (had) had.uses++; else out.set(e.id, { ...e, where, uses: 1 });
  };
  for (const f of SOURCES) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    if (f.endsWith('.html')) {
      for (const m of src.matchAll(/<(\w+)[^>]*\sdata-i18n(?=[\s>])[^>]*>([^<]*)</g)) { const en = m[2].trim(); if (en) put({ id: idOf(en), en }, `${f}`); }
      for (const m of src.matchAll(/data-i18n-label="([^"]+)"/g)) put({ id: idOf(m[1]), en: m[1] }, `${f}`);
      continue;
    }
    const ast = espree.parse(src, { ecmaVersion: 2023, loc: true });
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
        const name = n.callee.name, where = `${f}:${n.loc.start.line}`;
        // the text itself, or each text a ?: chooses between
        const texts = a => (a && a.type === 'ConditionalExpression' ? [...texts(a.consequent), ...texts(a.alternate)] : lit(a) !== null ? [lit(a)] : []);
        if (TEXT.has(name)) for (const en of texts(n.arguments[0])) { if (!en.trim()) problems.push(`${where}: empty text`); else put({ id: idOf(en), en }, where); }
        if (PLURAL.has(name)) {
          const one = lit(n.arguments[0]), other = lit(n.arguments[1]);
          if (one === null || other === null) problems.push(`${where}: ${name}() needs both forms written out`);
          else put({ id: pluralId(one, other), one, other }, where);
        }
      }
      for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string' && k !== 'loc') walk(v); }
    })(ast);
  }
  // the notes for translators (lang/notes.json, by English text) go next to their text
  const notes = fs.existsSync(path.join(langDir, 'notes.json')) ? JSON.parse(fs.readFileSync(path.join(langDir, 'notes.json'), 'utf8')).notes : {};
  const strings = [...out.values()].map(s => { const note = notes[s.en] ?? notes[s.other] ?? notes[s.one]; return note ? { ...s, note } : s; });
  const shown = new Set(strings.flatMap(s => [s.en, s.one, s.other]));
  for (const k of Object.keys(notes)) if (!shown.has(k)) problems.push(`lang/notes.json: "${k}" is not a text the app shows any more`);
  return { strings, problems };
}

const source = () => JSON.parse(fs.readFileSync(path.join(langDir, 'en.json'), 'utf8')).strings;
/** Plural categories a language uses (Intl), e.g. ['few', 'many', 'one', 'other'] for Polish. */
const categories = code => new Intl.PluralRules(code).resolvedOptions().pluralCategories;

/** Problems with one language's translations: [{ id, problem }], and how many strings are translated. `file` is lang/<code>.json unless given. */
function check(code, file = path.join(langDir, code + '.json')) {
  if (!fs.existsSync(file)) return { done: 0, total: source().length, issues: [{ id: '-', problem: 'no catalogue yet' }] };
  let t; try { t = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { done: 0, total: source().length, issues: [{ id: '-', problem: 'not valid JSON: ' + e.message }] }; }
  const src = source(), ids = new Set(src.map(s => s.id)), issues = [], cats = categories(code);
  let done = 0;
  for (const s of src) {
    const v = t[s.id];
    if (v === undefined) { issues.push({ id: s.id, problem: 'missing' }); continue; }
    if (s.en !== undefined) {
      if (typeof v !== 'string' || !v.trim()) { issues.push({ id: s.id, problem: 'should be a non-empty string' }); continue; }
      if (holders(v) !== holders(s.en)) issues.push({ id: s.id, problem: `placeholders differ: "${holders(s.en)}" in English, "${holders(v)}" here` });
      if (bolds(v) !== bolds(s.en)) issues.push({ id: s.id, problem: '**bold** markers differ from the English' });
      if (/<\/?[a-z][^>]*>/i.test(v)) issues.push({ id: s.id, problem: 'contains HTML' });
    } else {
      const forms = typeof v === 'string' ? { other: v } : v;
      if (!forms || typeof forms !== 'object') { issues.push({ id: s.id, problem: 'should be an object of plural forms' }); continue; }
      for (const c of cats) if (typeof forms[c] !== 'string' || !forms[c].trim()) issues.push({ id: s.id, problem: `plural form "${c}" missing (${code} uses ${cats.join(', ')})` });
      for (const [c, f] of Object.entries(forms)) {
        if (!cats.includes(c)) issues.push({ id: s.id, problem: `"${c}" is not a plural form of ${code} (${cats.join(', ')})` });
        else if (typeof f === 'string' && holders(f).replace('{n}', '').trim() !== holders(s.other).replace('{n}', '').trim()) issues.push({ id: s.id, problem: `placeholders differ in "${c}"` });
      }
    }
    done++;
  }
  for (const id of Object.keys(t)) if (!ids.has(id)) issues.push({ id, problem: 'not in the English source any more (stale)' });
  return { done, total: src.length, issues };
}

/** A language's catalogue as the app loads it: `I18n.add('<code>', {...})` (stale ids dropped). For 'qps', the pseudo-language. */
function catalogue(code) {
  const src = source(), ids = new Set(src.map(s => s.id));
  let t;
  const pseudo = s => s.split('**').map(p => (p.trim() ? `⟦${p}⟧` : p)).join('**');   // (each **bold** part marked on its own)
  if (code === 'qps') t = Object.fromEntries(src.map(s => [s.id, s.en !== undefined ? pseudo(s.en) : { one: pseudo(s.one), other: pseudo(s.other) }]));
  else t = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(langDir, code + '.json'), 'utf8'))).filter(([id]) => ids.has(id)));
  return `I18n.add(${JSON.stringify(code)}, ${JSON.stringify(t)});\n`;
}
/** The languages that have a catalogue file (other than the English source). */
const languages = () => (fs.existsSync(langDir) ? fs.readdirSync(langDir).filter(f => /^[a-z]{2,3}(-[A-Za-z]+)?\.json$/.test(f) && f !== 'en.json').map(f => f.slice(0, -5)) : []);

module.exports = { extract, check, catalogue, languages, idOf, pluralId, categories };

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'extract') {
    const { strings, problems } = extract();
    fs.mkdirSync(langDir, { recursive: true });
    const words = strings.reduce((a, s) => a + ((s.en || `${s.one} ${s.other}`).match(/[\p{L}']+/gu) || []).length, 0);
    fs.writeFileSync(path.join(langDir, 'en.json'), JSON.stringify({ note: 'English source of every text the app shows. Generated by `node scripts/i18n.js extract`; do not edit by hand.', strings: strings.map(({ uses, ...s }) => s) }, null, 1) + '\n');
    console.log(`${strings.length} texts (${strings.filter(s => s.one).length} with plural forms), ${words} words → lang/en.json`);
    if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
  } else if (cmd === 'check' || cmd === 'status') {
    let bad = 0;
    for (const code of args.length ? args : languages()) {
      const r = check(code), pct = Math.round((100 * r.done) / r.total);
      console.log(`${code.padEnd(8)} ${String(pct).padStart(3)}%  ${r.done}/${r.total}${r.issues.length ? `  ${r.issues.length} problem(s)` : ''}`);
      if (cmd === 'check') for (const i of r.issues.slice(0, 40)) console.log(`   ${i.id}: ${i.problem}`);
      if (r.issues.some(i => i.problem !== 'missing')) bad++;
    }
    if (bad) process.exitCode = 1;
  } else console.log('usage: node scripts/i18n.js extract | check [code…] | status');
}
