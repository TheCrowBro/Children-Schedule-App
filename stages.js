'use strict';
/* Growing up: the stages of a child's life from birth to 18, and what Little Log offers at each. The Day page's buttons, the Guide and
   the reports follow each child's stage, so the app grows with them: feeds and diapers in the first year, then meals and potty
   training, the preschool and school years, and the teenage years, until 18, when Little Log's work is done.
   A stage starts at an age. The school years start at the age children usually start school where the family is (4 in the UK and
   Ireland, 5 in North America, Australia and New Zealand, 6 elsewhere), or on the day of a "First day of school" moment.
   Big moments (the first smile, the first steps, the first day of school…) are entries of their own: the ideas offered for each one
   are below, by stage. */
const Stages = (() => {
  const LIST = [
    { id: 'newborn', from: 0, name: N_('Newborn') },
    { id: 'baby', from: 3, name: N_('Baby') },
    { id: 'toddler', from: 12, name: N_('Toddler') },
    { id: 'preschool', from: 36, name: N_('Preschooler') },
    { id: 'school', from: null, name: N_('School age') },   // from the age children start school where the family is
    { id: 'teen', from: 144, name: N_('Teenager') },
    { id: 'grown', from: 216, name: N_('Grown up') },
  ];
  const IDS = LIST.map(s => s.id);
  const SCHOOL = { uk: 4, na: 5, anz: 5 };
  /** The age (in years) children usually start school in a region (Formulas.REGIONS). */
  const schoolAge = region => SCHOOL[region] || 6;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  /** Whole months between a birth date (YYYY-MM-DD) and `t`, or -1 without a birth date. */
  function months(birth, t = Date.now()) {
    if (!DATE.test(birth || '')) return -1;
    const [y, m, d] = birth.split('-').map(Number), n = new Date(t);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDate() !== d) return -1;   // (not a real day, like February 30th)
    let x = (n.getFullYear() - y) * 12 + (n.getMonth() + 1 - m);
    if (n.getDate() < d) x--;
    return x;
  }
  /** A child's stage id at `t`. `school` is the day (YYYY-MM-DD) of their first day of school, if it was saved as a moment (it counts
      from 3 years old); without a birth date a child counts as a newborn. */
  function of(birth, { t = Date.now(), region = '', school = '' } = {}) {
    const m = months(birth, t);
    if (m < 0) return 'newborn';
    if (m >= 216) return 'grown';
    if (m >= 144) return 'teen';
    const d = new Date(t), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (m >= 36 && (school ? school <= today : m >= schoolAge(region) * 12)) return 'school';   // (school can start at 3 in some countries)
    return m >= 36 ? 'preschool' : m >= 12 ? 'toddler' : m >= 3 ? 'baby' : 'newborn';
  }
  const at = id => Math.max(0, IDS.indexOf(id));
  /** Whether stage `a` is `b` or later. */
  const from = (a, b) => at(a) >= at(b);
  const byId = id => LIST[at(id)];
  /** How old a child is on the day `day`, the way parents say it: day 3, 5 weeks, 14 months, 2 years 3 months, 7 years. */
  function age(birth, day) {
    if (!DATE.test(birth || '')) return '';
    const b = new Date(birth + 'T00:00'), d0 = new Date(day); d0.setHours(0, 0, 0, 0);
    const days = Math.round((d0 - b) / 864e5), m = months(birth, d0.getTime());
    if (days < 0) return '';
    if (days < 14) return __('day {n}', { n: days + 1 });
    if (days < 91) return __n('{n} week', '{n} weeks', Math.floor(days / 7));
    if (m < 24) return __n('{n} month', '{n} months', m);
    const y = Math.floor(m / 12), rest = m % 12;
    if (y >= 5 || !rest) return __n('{n} year', '{n} years', y);
    return __('{years} {months}', { years: __n('{n} year', '{n} years', y), months: __n('{n} month', '{n} months', rest) });
  }

  // The Day page's buttons at each stage, most useful first. Up to eight fit; when there are more, the first seven are shown (with
  // any the family has used lately moved up) and the rest are behind More.
  // (daycare, preschool or school: a drop-off, from 3 months old; homework from the school years)
  const DAY = {
    newborn: ['feed', 'diaper', 'sleep', 'wake', 'vomit', 'play', 'health', 'med'],
    baby: ['feed', 'diaper', 'sleep', 'wake', 'vomit', 'play', 'health', 'med', 'care'],
    toddler: ['meal', 'feed', 'diaper', 'potty', 'sleep', 'health', 'care', 'med', 'wake', 'play', 'vomit'],
    preschool: ['meal', 'potty', 'sleep', 'care', 'play', 'health', 'med', 'wake', 'vomit', 'diaper', 'feed'],
    school: ['meal', 'care', 'sleep', 'play', 'study', 'health', 'med', 'wake', 'vomit', 'potty', 'diaper', 'feed'],
  };
  DAY.teen = DAY.grown = DAY.school;
  /** The buttons for the stages `ids` (several children: everything any of them needs, each at its best place). `used` counts each
      type's entries lately; `allowed` says which types this person may log. Returns { shown, more } (lists of types). */
  function buttons(ids, used = {}, allowed = () => true) {
    const rank = new Map();
    for (const s of ids) DAY[s].forEach((t, i) => { if (!rank.has(t) || rank.get(t) > i) rank.set(t, i); });
    const list = [...rank.keys()].filter(allowed).sort((a, b) => rank.get(a) - rank.get(b) || DAY.toddler.indexOf(a) - DAY.toddler.indexOf(b));
    if (list.length <= 8) return { shown: list, more: [] };
    const busy = list.filter(t => (used[t] || 0) >= 3).sort((a, b) => used[b] - used[a]).slice(0, 7);
    const pick = new Set(busy);
    for (const t of list) if (pick.size < 7) pick.add(t);
    return { shown: list.filter(t => pick.has(t)), more: list.filter(t => !pick.has(t)) };
  }

  // Big moments worth keeping, by the stage they usually come in. They are saved in English and shown in each phone's language.
  const MOMENTS = {
    newborn: [N_('Born'), N_('Came home'), N_('First bath'), N_('First smile'), N_('Cord stump fell off'), N_('First walk outside'), N_('First checkup'), N_('Met the grandparents')],
    baby: [N_('First laugh'), N_('Rolled over'), N_('Slept through the night'), N_('First solid food'), N_('Sat up alone'), N_('First tooth'), N_('Crawled'), N_('Pulled up to stand'),
      N_('First word'), N_('Waved bye-bye'), N_('First haircut'), N_('First steps'), N_('First trip')],
    toddler: [N_('Walked alone'), N_('First sentence'), N_('Last bottle'), N_('Goodbye pacifier'), N_('First time on the potty'), N_('Out of diapers in the day'), N_('Dry at night'),
      N_('Big-kid bed'), N_('First day at daycare'), N_('First dentist visit'), N_('Ate with a spoon alone'), N_('First drawing')],
    preschool: [N_('First day of preschool'), N_('Rode a tricycle'), N_('Wrote their name'), N_('First best friend'), N_('First sleepover'), N_('Swam without floaties'),
      N_('Got dressed alone'), N_('Counted to 10'), N_('First show or recital')],
    school: [N_('First day of school'), N_('Lost a first tooth'), N_('Rode a bike without training wheels'), N_('Read a book alone'), N_('Tied their shoelaces'), N_('Learned to swim'),
      N_('First school trip'), N_('First sports team'), N_('First instrument lesson'), N_('Started a new school year')],
    teen: [N_('First day at secondary school'), N_('Braces on'), N_('Braces off'), N_('First phone'), N_('First job'), N_('Passed the driving test'), N_('Prom or formal'),
      N_('Exams finished'), N_('Graduated'), N_('Turned 18')],
  };
  MOMENTS.grown = [N_('Left home'), N_('Turned 18')];
  const ALL_MOMENTS = [...new Set([N_('Birthday'), ...Object.values(MOMENTS).flat()])];
  /** The moment that starts the school years. */
  const SCHOOL_DAY = 'First day of school';
  /** Whether a moment's name is one of the ideas above (otherwise it was typed in, and is shown as typed). */
  const known = what => ALL_MOMENTS.includes(what);
  /** Ideas for a child at stage `id`: the birthday, the stage's own, then the next stage's (children are often early). */
  const ideas = id => [...new Set([N_('Birthday'), ...(MOMENTS[id] || []), ...(MOMENTS[IDS[at(id) + 1]] || [])])];

  // Where a child goes when they are dropped off, by stage (the first is the usual one). Saved in English, shown in each phone's language.
  const CARE = [N_('Daycare'), N_('Preschool'), N_('School'), N_('Childminder'), N_('Grandparents'), N_('After-school club'), N_('Babysitter'), N_('Friend\'s house')];
  const carePlace = id => (from(id, 'school') ? 'School' : id === 'preschool' ? 'Preschool' : 'Daycare');

  return { LIST, IDS, schoolAge, months, of, from, byId, age, DAY, buttons, MOMENTS, ALL_MOMENTS, SCHOOL_DAY, known, ideas, CARE, carePlace };
})();
