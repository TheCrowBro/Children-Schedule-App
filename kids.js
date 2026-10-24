'use strict';
/* The children in a log. Every child has a name, birth date, boy/girl, a colour and (optionally) the formula they drink; the colour themes that child's
   pages. Boys get blues and girls get reds; the shades are all dark enough for white text (contrast 4.5:1 or better) and far enough
   apart to tell at a glance. A log's children are kept inside its encrypted profile. */
const Kids = (() => {
  const PALETTE = {
    boy:   ['#3f6fb5', '#1c3f73', '#1f7a8c', '#6a6fc0', '#4f6b8a'],   // cornflower, navy, teal-blue, periwinkle, steel
    girl:  ['#c24d58', '#8f2d3a', '#b8402c', '#b83a7a', '#9a4a5e'],   // rose red, wine, brick, raspberry-pink, dusty mulberry
    other: ['#4d7c50', '#7d5a8a', '#8a6320', '#6b7a2f'],              // sage, plum, ochre, olive
  };
  const MAX = 8, HEX = /^#[0-9a-f]{6}$/i, ID = /^[A-Za-z0-9_-]{1,24}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
  /** A real day written YYYY-MM-DD (not 2026-13-45 or February 30th). */
  const isDay = d => { if (typeof d !== 'string' || !DATE.test(d)) return false; const [y, m, n] = d.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, n)); return t.getUTCMonth() === m - 1 && t.getUTCDate() === n; };
  const group = sex => (sex === 'boy' ? PALETTE.boy : sex === 'girl' ? PALETTE.girl : PALETTE.other);
  /** The first shade for this sex that no other child is using (cycling when they are all taken). */
  function auto(kids, sex, except) {
    const used = new Set(kids.filter(k => k.id !== except).map(k => (k.color || '').toLowerCase())), g = group(sex);
    return g.find(c => !used.has(c)) || g[kids.filter(k => k.id !== except && k.sex === sex).length % g.length];
  }
  /** Swatches to offer, the child's own group first. */
  const swatches = sex => [...new Set([...group(sex), ...PALETTE.boy, ...PALETTE.girl, ...PALETTE.other])];
  /** A child's allergies: { food, date (of the first reaction, YYYY-MM-DD), note }, one per food, at most 12 (the whole profile, all
      children and the pediatrician, has to fit the server's limit for it). */
  function allergies(list) {
    const out = [];
    for (const a of Array.isArray(list) ? list : []) {
      if (!a || typeof a.food !== 'string' || !a.food.trim() || out.length >= 12) continue;
      const food = a.food.trim().slice(0, 60), date = isDay(a.date) ? a.date : '';
      const had = out.find(x => x.food.toLowerCase() === food.toLowerCase());
      if (had) { if (date && (!had.date || date < had.date)) had.date = date; continue; }   // (the first reaction is the one that counts)
      out.push({ food, date, note: typeof a.note === 'string' ? a.note.slice(0, 120) : '' });
    }
    return out;
  }
  const rid = () => 'k' + Math.random().toString(36).slice(2, 8);
  /** Whatever came out of storage or a backup, a valid list of 1–8 children (a log always has at least one). */
  function clean(list, name, birth) {
    const out = [], seen = new Set();
    for (const k of (Array.isArray(list) ? list : []).slice(0, MAX)) {
      if (!k || typeof k !== 'object' || typeof k.id !== 'string' || !ID.test(k.id) || seen.has(k.id)) continue;
      seen.add(k.id);
      const sex = k.sex === 'boy' || k.sex === 'girl' ? k.sex : '';
      out.push({ id: k.id, name: typeof k.name === 'string' ? k.name.slice(0, 60) : '', birth: isDay(k.birth) ? k.birth : '', sex,
        color: typeof k.color === 'string' && HEX.test(k.color) ? k.color.toLowerCase() : '', formula: typeof k.formula === 'string' ? k.formula.trim().slice(0, 60) : '', formulaAt: Number.isFinite(k.formulaAt) && k.formulaAt > 0 ? Math.floor(k.formulaAt) : 0, allergies: allergies(k.allergies) });
    }
    if (!out.length) out.push({ id: 'c1', name: typeof name === 'string' ? name.slice(0, 60) : '', birth: isDay(birth) ? birth : '', sex: '', color: '', formula: '', formulaAt: 0, allergies: [] });
    out.forEach((k, i) => { if (!k.color) k.color = auto(out.slice(0, i), k.sex, k.id); });
    return out;
  }
  // colour maths for the themes (plain hex in, plain hex/rgba out, so older WebViews need no color-mix support)
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return '#' + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join(''); };
  const rgba = (h, a) => `rgba(${rgb(h).join(',')},${a})`;
  const make = (kids, name = '', sex = '', birth = '') => ({ id: rid(), name, birth, sex, color: auto(kids, sex), formula: '', formulaAt: 0, allergies: [] });
  return { PALETTE, MAX, auto, swatches, clean, make, group, mix, rgba, allergies };
})();
