'use strict';
/* The children's family tree, drawn like a storybook tree. The children sit on the grass at the foot of the trunk; their parents, a
   couple joined by a heart, sit where it forks; each parent's brothers and sisters (the aunts and uncles) with their partners sit
   beside them, and their children (the cousins) on the grass below; the grandparents grow above each parent and the great-grandparents
   above them, at the top of the crown. That is as far as it grows (an extended tree can come later). The parents add relatives by
   tapping the buds where someone is missing; whoever is new since this phone last showed the tree sprouts in.
   This file holds the tree as the parents keep it (checked, and changed one person at a time) and draws it. account.js says what each
   tap does; e2ee.js seals the tree, which reaches only the children's relatives. */
const FamilyTree = (() => {
  // ---- the tree as the parents keep it ---------------------------------------------------------------------------------------
  // { v: 1, parents: [Parent] }: the children's parents (one or two), each with
  //   gp:   their own parents, the children's grandparents (up to two), each with gp: theirs, the great-grandparents (up to two)
  //   sibs: their brothers and sisters, the children's aunts and uncles (up to eight), each with a partner and children (the cousins)
  // A person: { id, name, call (what the children call them), user (their Little Log account), gone (in loving memory) }. An aunt or
  // uncle may carry family (their own family log), and a cousin kid (the child's id in that log), to open it from the tree.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, ID = /^[a-z0-9]{4,16}$/, KID = /^[A-Za-z0-9_-]{1,24}$/;
  const MAX_SIBS = 8, MAX_KIDS = 8;
  const str = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const newId = () => (Math.random().toString(36).slice(2) + '00000000').slice(0, 8);
  function person(p, seen) {
    if (!p || typeof p !== 'object') return null;
    const name = str(p.name, 40); if (!name) return null;
    let id = typeof p.id === 'string' && ID.test(p.id) ? p.id : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    const o = { id, name }, call = str(p.call, 24);
    if (call) o.call = call;
    if (typeof p.user === 'string' && UUID.test(p.user)) o.user = p.user.toLowerCase();
    if (p.gone === true) o.gone = true;
    if (typeof p.kid === 'string' && KID.test(p.kid)) o.kid = p.kid;
    return o;
  }
  /** A tree as it may be kept: anything else in it is dropped. */
  function clean(t) {
    const seen = new Set(), list = (a, n, f) => (Array.isArray(a) ? a : []).slice(0, n * 2).map(f).filter(Boolean).slice(0, n);
    const parents = list(t && t.parents, 2, p => {
      const o = person(p, seen); if (!o) return null;
      o.gp = list(p.gp, 2, g => { const x = person(g, seen); if (x) x.gp = list(g.gp, 2, q => person(q, seen)); return x; });
      o.sibs = list(p.sibs, MAX_SIBS, s => {
        const x = person(s, seen); if (!x) return null;
        const partner = person(s.partner, seen); if (partner) x.partner = partner;
        if (typeof s.family === 'string' && UUID.test(s.family)) x.family = s.family.toLowerCase();
        x.kids = list(s.kids, MAX_KIDS, q => person(q, seen));
        return x;
      });
      return o;
    });
    return { v: 1, parents };
  }
  /** Everyone on the tree, with where they are: kind (parent, gp, ggp, sib, partner or cousin), side (the children's parent whose side
      of the family it is), up (who they hang from) and list (the list they are in). */
  function walk(t) {
    const out = [];
    for (const s of t.parents) {
      out.push({ p: s, kind: 'parent', side: s, up: null, list: t.parents });
      for (const g of s.gp) {
        out.push({ p: g, kind: 'gp', side: s, up: s, list: s.gp });
        for (const q of g.gp) out.push({ p: q, kind: 'ggp', side: s, up: g, list: g.gp });
      }
      for (const b of s.sibs) {
        out.push({ p: b, kind: 'sib', side: s, up: s, list: s.sibs });
        if (b.partner) out.push({ p: b.partner, kind: 'partner', side: s, up: b, list: null });
        for (const k of b.kids) out.push({ p: k, kind: 'cousin', side: s, up: b, list: b.kids });
      }
    }
    return out;
  }
  const find = (t, id) => walk(t).find(w => w.p.id === id) || null;
  /** Add `p` where someone is missing: kind parent (the children's other parent), gp (a parent `at`'s parent), ggp (a grandparent
      `at`'s parent), sib (a parent `at`'s brother or sister), partner or cousin (an aunt or uncle `at`'s). False when there is no
      room there (any more). */
  function add(t, kind, at, p) {
    if (kind === 'parent') { if (t.parents.length >= 2) return false; t.parents.push({ ...p, gp: [], sibs: [] }); return true; }
    const w = find(t, at); if (!w) return false;
    if (kind === 'gp' && w.kind === 'parent' && w.p.gp.length < 2) { w.p.gp.push({ ...p, gp: [] }); return true; }
    if (kind === 'ggp' && w.kind === 'gp' && w.p.gp.length < 2) { w.p.gp.push({ ...p }); return true; }
    if (kind === 'sib' && w.kind === 'parent' && w.p.sibs.length < MAX_SIBS) { w.p.sibs.push({ kids: [], ...p }); return true; }
    if (kind === 'partner' && w.kind === 'sib' && !w.p.partner) { w.p.partner = { ...p }; return true; }
    if (kind === 'cousin' && w.kind === 'sib' && w.p.kids.length < MAX_KIDS) { w.p.kids.push({ ...p }); return true; }
    return false;
  }
  /** Change someone's name, what the children call them, their account, or whether they are remembered (in loving memory). */
  function update(t, id, f) {
    const w = find(t, id); if (!w) return false;
    for (const k of ['name', 'call', 'user', 'gone']) if (k in f) { if (f[k]) w.p[k] = f[k]; else delete w.p[k]; }
    return true;
  }
  /** Take someone off the tree, and everyone added through them (a grandparent's parents, an aunt's partner and children). */
  function remove(t, id) {
    const w = find(t, id); if (!w) return false;
    if (w.kind === 'partner') delete w.up.partner; else w.list.splice(w.list.indexOf(w.p), 1);
    return true;
  }

  // ---- the picture -----------------------------------------------------------------------------------------------------------
  const CELL = 62, KCELL = 54, GCELL = 50, GAP = 16, RA = 17, RK = 15, RG = 14, KPR = 6, CPR = 4;
  const x = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cut = (s, n) => { const a = [...String(s)]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
  /** A long label on two lines, broken at the space or slash nearest its middle. */
  function lines(s, n) {
    const a = [...String(s)]; if (a.length <= n) return [s];
    let at = -1; a.forEach((c, i) => { if (/[\s/・、]/.test(c) && (at < 0 || Math.abs(i - a.length / 2) < Math.abs(at - a.length / 2))) at = i; });
    if (at < 0) return [cut(s, n + 4)];
    return [cut(a.slice(0, at + (a[at] === '/' ? 1 : 0)).join('').trim(), n + 4), cut(a.slice(at + 1).join('').trim(), n + 4)];
  }
  const rowsOf = (xs, per) => { const out = []; for (let i = 0; i < xs.length; i += per) out.push(xs.slice(i, i + per)); return out; };
  const spread = (n, cell, cx) => Array.from({ length: n }, (_, i) => cx + (i - (n - 1) / 2) * cell);
  const r1 = v => Math.round(v * 10) / 10;
  const heart = (hx, hy, s) => `M${r1(hx)} ${r1(hy + s * 0.55)}C${r1(hx - s * 1.25)} ${r1(hy - s * 0.2)} ${r1(hx - s * 0.6)} ${r1(hy - s * 1.15)} ${r1(hx)} ${r1(hy - s * 0.5)}C${r1(hx + s * 0.6)} ${r1(hy - s * 1.15)} ${r1(hx + s * 1.25)} ${r1(hy - s * 0.2)} ${r1(hx)} ${r1(hy + s * 0.55)}Z`;
  const leaf = (lx, ly, s, a, c = 'lf') => `<path class="${c}" d="M0 0C${r1(s * 0.35)} ${r1(-s * 0.55)} ${r1(s * 0.95)} ${r1(-s * 0.45)} ${s} 0C${r1(s * 0.6)} ${r1(s * 0.45)} ${r1(s * 0.2)} ${r1(s * 0.35)} 0 0Z" transform="translate(${r1(lx)} ${r1(ly)}) rotate(${a})"/>`;
  const star = (sx, sy, s) => `<path class="star" d="M${r1(sx)} ${r1(sy - s)}L${r1(sx + s * 0.3)} ${r1(sy - s * 0.3)}L${r1(sx + s)} ${r1(sy)}L${r1(sx + s * 0.3)} ${r1(sy + s * 0.3)}L${r1(sx)} ${r1(sy + s)}L${r1(sx - s * 0.3)} ${r1(sy + s * 0.3)}L${r1(sx - s)} ${r1(sy)}L${r1(sx - s * 0.3)} ${r1(sy - s * 0.3)}Z"/>`;

  /** The picture. The model says what to show, already in the app's language:
        { title, rtl, edit (show the buds), text: { parent, gp, ggp, sib } (a bud's label), adds: { … } (what tapping it does),
          kids: [Node], parents: [Node & { gp: [Node & { gp: [Node] }], sibs: [Node & { partner, kids: [Node] }] }],
          sprout: key → null, or the ms until that new part starts to grow in (below 0: it is already growing) }
      with Node = { key, label, initial, title, gone, color (a child's) }. A bud's key is +parent, +gp:<parent's key>,
      +ggp:<grandparent's key> or +sib:<parent's key>. → { svg, keys (every person drawn), width, height, center (the trunk's x) } */
  function draw(m) {
    const P = m.parents || [], kids = m.kids || [], edit = !!m.edit, keys = [], when = {};
    const sibsOf = p => p.sibs || [], gpOf = p => p.gp || [];
    // what grows in, and when: asked from the grass up, so that the first time it grows in that order
    for (const n of [...kids, ...P, ...P.flatMap(p => sibsOf(p).flatMap(s => [s, ...(s.partner ? [s.partner] : []), ...(s.kids || [])])),
      ...P.flatMap(gpOf), ...P.flatMap(p => gpOf(p).flatMap(gpOf))]) { keys.push(n.key); when[n.key] = m.sprout ? m.sprout(n.key) : null; }
    const grow = (key, cls) => (when[key] == null ? `class="${cls}"` : `class="${cls} sprout" style="--d:${Math.round(when[key])}ms"`);

    // where everyone goes: x from the parents' heart (0), and a row (3 great-grandparents … 0 the children)
    const nodes = [], hearts = [], couple = P.length === 2 || (edit && P.length === 1);
    const bud = (key, kind) => ({ key, label: m.text[kind], title: m.adds[kind] });
    const homeX = P.length === 2 ? [-CELL / 2, CELL / 2] : P.length === 1 ? [couple ? -CELL / 2 : 0] : [];
    P.forEach((p, i) => nodes.push({ n: p, x: homeX[i], row: 1, r: RA }));
    if (edit && P.length < 2) nodes.push({ bud: bud('+parent', 'parent'), x: P.length ? CELL / 2 : 0, row: 1, r: RA });
    if (couple) hearts.push({ x: 0, row: 1, faint: P.length < 2, big: true });
    const kidRows = rowsOf(kids, KPR);
    kidRows.forEach((r, i) => spread(r.length, KCELL, 0).forEach((kx, j) => nodes.push({ n: r[j], x: kx, row: 0, sub: i, r: RK, kid: true, home: true })));
    const homeHalf = Math.max(couple ? CELL : CELL / 2, ...kidRows.map(r => (r.length * KCELL) / 2));

    const sides = P.map((p, si) => {
      const dir = si === 0 ? -1 : 1, px = homeX[si], units = [];   // the first parent's side of the family to the left, the second's to the right
      let edge = dir * (homeHalf + GAP);
      for (const s of sibsOf(p)) {
        const cRows = rowsOf(s.kids || [], CPR), uw = Math.max(s.partner ? 2 * CELL : CELL, ...cRows.map(r => r.length * KCELL));
        const cx = edge + (dir * uw) / 2, sx = s.partner ? cx - (dir * CELL) / 2 : cx;   // the aunt or uncle nearer the parent, a partner outside
        nodes.push({ n: s, x: sx, row: 1, r: RA });
        if (s.partner) { nodes.push({ n: s.partner, x: cx + (dir * CELL) / 2, row: 1, r: RA }); hearts.push({ x: cx, row: 1 }); }
        cRows.forEach((r, i) => spread(r.length, KCELL, cx).forEach((kx, j) => nodes.push({ n: r[j], x: kx, row: 0, sub: i, r: RK, kid: true, cousin: true, from: cx })));
        units.push({ sx, cx });
        edge += dir * (uw + GAP);
      }
      if (edit && sibsOf(p).length < MAX_SIBS) { nodes.push({ bud: bud('+sib:' + p.key, 'sib'), x: edge + (dir * CELL) / 2, row: 1, r: RA }); }
      // the grandparents: above this parent and their brothers and sisters, on this side of the trunk
      const gpItems = [...gpOf(p).map(g => ({ n: g })), ...(edit && gpOf(p).length < 2 ? [{ bud: bud('+gp:' + p.key, 'gp') }] : [])];
      const below = [px, ...units.map(u => u.sx)];
      let gx = (Math.min(...below) + Math.max(...below)) / 2;
      const gw = gpItems.length * CELL;
      if (couple) gx = dir < 0 ? Math.min(gx, -GAP / 2 - gw / 2) : Math.max(gx, GAP / 2 + gw / 2);
      spread(gpItems.length, CELL, gx).forEach((gxx, i) => { gpItems[i].x = gxx; nodes.push({ ...gpItems[i], row: 2, r: RA }); });
      if (gpItems.length === 2) hearts.push({ x: gx, row: 2, faint: !gpItems[1].n });
      // the great-grandparents: above their grandparent, side by side
      const gg = gpItems.filter(it => it.n).map(it => {
        const items = [...gpOf(it.n).map(q => ({ n: q })), ...(edit && gpOf(it.n).length < 2 ? [{ bud: bud('+ggp:' + it.n.key, 'ggp') }] : [])];
        return { gx: it.x, items, w: items.length * GCELL };
      }).filter(u => u.items.length);
      if (gg.length === 2) { const mid = (gg[0].gx + gg[1].gx) / 2; gg[0].cx = mid - GAP / 2 - gg[0].w / 2; gg[1].cx = mid + GAP / 2 + gg[1].w / 2; }
      else if (gg.length === 1) gg[0].cx = gg[0].gx;
      if (gg.length && couple) {
        const lo = Math.min(...gg.map(u => u.cx - u.w / 2)), hi = Math.max(...gg.map(u => u.cx + u.w / 2));
        const shift = dir < 0 ? Math.min(0, -GAP / 2 - hi) : Math.max(0, GAP / 2 - lo);
        gg.forEach(u => { u.cx += shift; });
      }
      for (const u of gg) {
        spread(u.items.length, GCELL, u.cx).forEach((xx, i) => { u.items[i].x = xx; nodes.push({ ...u.items[i], row: 3, r: RG, small: true }); });
        if (u.items.length === 2) hearts.push({ x: u.cx, row: 3, faint: !u.items[1].n, small: true });
      }
      return { p, dir, px, units, gx, gpItems, gg, edge };
    });

    // the rows, from the top: room for the sun, the crown, the parents, the grass
    const has = r => nodes.some(n => n.row === r), Y = {};
    let y = 46;
    if (has(3)) { Y[3] = y; y += 88; }
    if (has(2)) { Y[2] = y; y += 94; }
    Y[1] = y; Y[0] = y + 106;
    const subs = Math.max(1, ...nodes.filter(n => n.row === 0).map(n => (n.sub || 0) + 1));
    const yOf = n => (n.row === 0 ? Y[0] + (n.sub || 0) * 64 : Y[n.row]), ground = Y[0] + (subs - 1) * 64 + RK + 30, H = ground + 40;
    // the width it needs (at least the screen's), and where the trunk stands in it
    const xs = [...nodes.map(n => [n.x - (n.small ? GCELL : n.kid ? KCELL : CELL) / 2, n.x + (n.small ? GCELL : n.kid ? KCELL : CELL) / 2]).flat(), -110, 110];
    const lo = Math.min(...xs), hi = Math.max(...xs), W = Math.max(360, Math.ceil(hi - lo + 64)), ox = (W - (hi - lo)) / 2 - lo;
    const X = v => r1(m.rtl ? W - (v + ox) : v + ox), cx0 = X(0);
    const people = nodes.filter(n => n.n).length, tw = Math.min(30, 16 + people * 0.7);

    const out = [];
    // sky: a sun by day, a moon and stars at night (the theme's colours decide which shows), a cloud drifting by
    const sunX = m.rtl ? W - 30 : 30;
    out.push(`<g class="ftsky"><g class="sun"><g class="rays">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path d="M${sunX} 12v-6" transform="rotate(${a} ${sunX} 30)"/>`).join('')}</g><circle cx="${sunX}" cy="30" r="12"/>`
      + `<circle class="eye" cx="${sunX - 4}" cy="28" r="1.3"/><circle class="eye" cx="${sunX + 4}" cy="28" r="1.3"/><path class="smile" d="M${sunX - 4.5} 33q4.5 4 9 0"/></g>`
      + `<g class="moon"><path d="M${sunX + 6} 18a13 13 0 1 0 0 24a10 10 0 1 1 0-24z"/>${star(sunX + 24, 16, 3)}${star(sunX + 16, 44, 2.2)}${star(W - sunX, 22, 2.6)}</g>`
      + `<g class="cloud"><path d="M${r1(W * 0.62)} 34a9 9 0 0 1 14-9a12 12 0 0 1 22 2a8 8 0 0 1 3 15h-36a8 8 0 0 1-3-8z"/></g></g>`);
    // the hill, with flowers and tufts of grass
    const hcx = W / 2, hry = 120, hrx = W * 0.78, hcy = ground + hry - 16, hillY = hx => hcy - hry * Math.sqrt(Math.max(0, 1 - ((hx - hcx) / hrx) ** 2));
    out.push(`<g class="hill"><ellipse class="far" cx="${r1(W * 0.2)}" cy="${r1(ground + 112)}" rx="${r1(W * 0.5)}" ry="${hry}"/><ellipse class="far" cx="${r1(W * 0.85)}" cy="${r1(ground + 108)}" rx="${r1(W * 0.45)}" ry="${hry}"/>`
      + `<ellipse cx="${r1(hcx)}" cy="${r1(hcy)}" rx="${r1(hrx)}" ry="${hry}"/>`
      + [0.08, 0.2, 0.33, 0.67, 0.8, 0.93].map((f, i) => { const fx = W * f, fy = hillY(fx) + 9 + (i % 2) * 5; return i % 3 === 1 ? `<path class="tuft" d="M${r1(fx - 5)} ${r1(fy)}q3-9 5-1q1-9 4 0q2-7 4 1"/>`
        : `<g class="flower f${i % 3}"><path class="stem" d="M${r1(fx)} ${r1(fy + 6)}v-7"/>${[0, 72, 144, 216, 288].map(a => `<circle cx="${r1(fx)}" cy="${r1(fy - 4)}" r="2.6" transform="rotate(${a} ${r1(fx)} ${r1(fy - 1)})"/>`).join('')}<circle class="mid" cx="${r1(fx)}" cy="${r1(fy - 1)}" r="1.8"/></g>`; }).join('') + '</g>');

    // the crown: soft, leafy clouds behind the grown-ups, growing with them
    const blobs = [];
    let bi = 0;
    const blob = (bx, by, rx, ry) => {
      blobs.push(`<ellipse cx="${X(bx)}" cy="${r1(by)}" rx="${r1(rx)}" ry="${r1(ry)}"/><circle cx="${X(bx - rx * 0.55)}" cy="${r1(by - ry * 0.35)}" r="${r1(ry * 0.72)}"/><circle cx="${X(bx + rx * 0.5)}" cy="${r1(by - ry * 0.45)}" r="${r1(ry * 0.68)}"/>`);
      for (const [fx, fy, a] of [[-0.85, 0.1, 200], [0.82, -0.05, -30], [-0.2, -0.95, 250], [0.35, 0.8, 20]]) blobs.push(leaf(X(bx + fx * rx), by + fy * ry, 8, a + (bi++ % 3) * 25, 'ftlf2'));
    };
    blob(0, Y[1] - 12, couple ? 92 : 62, 56);
    for (const s of sides) {
      for (const u of s.units) blob(u.cx, Y[1] - 10, 58, 48);
      if (s.gpItems.length) blob(s.gx, Y[2] - 10, s.gpItems.length * CELL / 2 + 34, 58);
      for (const u of s.gg) blob(u.cx, Y[3] - 8, u.w / 2 + 26, 48);
    }
    out.push(`<g class="crown" style="transform-origin:${cx0}px ${Y[1]}px">${blobs.join('')}</g>`);
    const top = has(2) ? Y[2] : Y[1];
    out.push(`<g class="ftfall">${[[-70, 0], [64, 1]].map(([dx, i]) => `<g class="fall f${i}" style="transform-origin:${X(dx)}px ${r1(top + 10)}px">${leaf(X(dx), top + 10, 9, 30 + i * 120)}</g>`).join('')}</g>`);

    // the trunk (it thickens as the family grows), with roots, a knot hole and a carved heart, and the branches
    const bark = [], twigs = [], lv = [];
    const tTop = Y[1] - 4, tBot = ground + 10, w1 = tw / 2, w2 = Math.max(6, tw * 0.3);
    bark.push(`<path class="trunk" d="M${X(-w1)} ${tBot}C${X(-w1 * 0.6)} ${r1(tBot - 34)} ${X(-w2 - 4)} ${r1((tTop + tBot) / 2)} ${X(-w2)} ${tTop}L${X(w2)} ${tTop}C${X(w2 + 3)} ${r1((tTop + tBot) / 2)} ${X(w1 * 0.6)} ${r1(tBot - 34)} ${X(w1)} ${tBot}Z"/>`
      + `<path class="root" d="M${X(-w1 + 2)} ${tBot - 4}q-14 4-24 14M${X(w1 - 2)} ${tBot - 4}q14 4 26 12M${X(-3)} ${tBot - 2}q-4 8-12 14"/>`
      + `<ellipse class="knot" cx="${X(w2 * 0.3)}" cy="${r1(tTop + (tBot - tTop) * 0.36)}" rx="3.2" ry="4.6"/><path class="carve" d="${heart(X(-w2 * 0.2), tTop + (tBot - tTop) * 0.58, 4.2)}"/>`);
    const curve = (ax, ay, bx, by, cls, wdt) => { const my = (ay + by) / 2; return `<path class="${cls}" d="M${X(ax)} ${r1(ay)}C${X(ax)} ${r1(my)} ${X(bx)} ${r1(my)} ${X(bx)} ${r1(by)}"${wdt ? ` stroke-width="${r1(wdt)}"` : ''}/>`; };
    /** The point a share `t` along such a curve. */
    const along = (ax, ay, bx, by, t) => { const my = (ay + by) / 2, u = 1 - t, a = u * u * u + 3 * u * u * t, b = 3 * u * t * t + t * t * t; return [ax * a + bx * b, ay * u * u * u + my * 3 * u * t + by * t * t * t]; };
    const leafAt = (ax, ay, bx, by, i) => { const [lx, ly] = along(ax, ay, bx, by, 0.62); lv.push(leaf(X(lx), ly, 9, (i % 2 ? -40 : 220) + (m.rtl ? 180 : 0))); };
    // the children, on the grass: each holds on to the trunk
    for (const n of nodes.filter(k => k.home)) { const ky = yOf(n) - RK; if (Math.abs(n.x) > 4) twigs.push(curve(n.x, ky, Math.sign(n.x) * w2 * 0.6, Math.min(ky - 24, Y[1] + 52), 'twig', 3)); }
    let li = 0;
    for (const s of sides) {
      // to the grandparents: a limb from this parent, and a branch from each brother and sister
      const target = s.gpItems.length ? [s.gx, Y[2] + RA + 2] : null;
      if (target) {
        bark.push(curve(s.px, Y[1] - RA, target[0], target[1], 'limb', Math.max(5, tw * 0.42))); leafAt(s.px, Y[1] - RA, target[0], target[1], li++);
        for (const u of s.units) { bark.push(curve(u.sx, Y[1] - RA, target[0], target[1], 'branch', Math.max(3.5, tw * 0.26))); leafAt(u.sx, Y[1] - RA, target[0], target[1], li++); }
      } else for (const u of s.units) {   // no grandparents yet: an arching bough from the parent to each brother and sister
        bark.push(`<path class="branch" d="M${X(s.px)} ${Y[1] - RA}Q${X((s.px + u.sx) / 2)} ${r1(Y[1] - RA - 50)} ${X(u.sx)} ${Y[1] - RA}" stroke-width="${r1(Math.max(3.5, tw * 0.26))}"/>`);
        lv.push(leaf(X((s.px + u.sx) / 2), Y[1] - RA - 26, 9, li++ % 2 ? -50 : 200));
      }
      // to the great-grandparents: twigs
      for (const u of s.gg) { bark.push(curve(u.gx, Y[2] - RA, u.cx, Y[3] + RG + 2, 'twig', 3)); leafAt(u.gx, Y[2] - RA, u.cx, Y[3] + RG + 2, li++); }
    }
    // the cousins: a vine from their parents down to each of them
    for (const n of nodes.filter(k => k.cousin)) twigs.push(`<path class="vine" d="M${X(n.from)} ${Y[1] + RA + 4}C${X(n.from)} ${r1(Y[1] + 50)} ${X(n.x + (n.x > n.from ? -10 : 10))} ${r1(yOf(n) - 46)} ${X(n.x)} ${r1(yOf(n) - RK)}"/>`);
    out.push(`<g class="bark">${bark.join('')}</g><g class="twigs">${twigs.join('')}</g><g class="leaves">${lv.join('')}</g>`);

    // a bird on a branch, and a butterfly over the grass
    const bs = sides.find(s => s.gpItems.length) || sides.find(s => s.units.length);
    if (bs) {
      const [ax, ay] = bs.gpItems.length ? along(bs.px, Y[1] - RA, bs.gx, Y[2] + RA + 2, 0.32) : [(bs.px + bs.units[0].sx) / 2, Y[1] - RA - 25];
      const bx = X(ax), by = r1(ay - 12), f = (bs.dir < 0) !== !!m.rtl ? -1 : 1;   // (facing the trunk)
      out.push(`<g transform="translate(${bx} ${by}) scale(${f} 1)"><g class="bird"><path class="tail" d="M-9 2l-6 2l6 2z"/><ellipse class="body" cx="0" cy="3" rx="9" ry="6.5"/><circle class="body" cx="6" cy="-3" r="5"/>`
        + `<path class="beak" d="M10.5 -3.5l4.5 1.5l-4.5 1.5z"/><circle class="eye" cx="7.5" cy="-4" r="1.1"/><path class="wing" d="M-4 2q5 7 9 0q-4 -3 -9 0z"/><path class="leg" d="M-1 9v3M3 9v3"/></g></g>`);
    }
    const low = nodes.filter(n => n.row === 0).map(n => X(n.x)), free = f => Math.min(Infinity, ...low.map(v => Math.abs(v - W * f)));
    const spot = [0.9, 0.1, 0.78, 0.22].find(f => free(f) > 40), fx = r1(W * (spot || 0.9)), fy = r1(spot ? ground - 26 : (Y[1] + Y[0]) / 2);
    out.push(`<g transform="translate(${fx} ${fy})"><g class="butterfly"><g class="wings"><ellipse cx="-4.5" cy="-2" rx="5" ry="6.5"/><ellipse cx="4.5" cy="-2" rx="5" ry="6.5"/><ellipse class="lower" cx="-3.5" cy="5" rx="3.4" ry="4"/><ellipse class="lower" cx="3.5" cy="5" rx="3.4" ry="4"/></g><path class="feel" d="M0 -6q-2-5-5-6M0 -6q2-5 5-6"/><ellipse class="bod" cx="0" cy="1" rx="1.3" ry="7"/></g></g>`);

    // hearts between couples
    out.push(`<g class="hearts">${hearts.map(h => `<path class="heart${h.faint ? ' faint' : ''}" d="${heart(X(h.x), Y[h.row] + 1, h.big ? 8 : h.small ? 5 : 6.5)}"/>`).join('')}</g>`);

    // everyone, and the buds where someone can be added
    const person = n => {
      const px = X(n.x), py = r1(yOf(n)), r = n.r, d = n.n, label = cut(d.label, n.small ? 10 : 12);
      const extra = n.kid ? `<path class="curl" d="M${px} ${r1(py - r)}q-1-6 4-8"/>${leaf(px + 3, py - r - 7, 7, -30)}` : `${leaf(px + r * 0.55, py - r * 0.8, 8, -50)}`;
      return `<g ${grow(d.key, `tnode${n.kid ? ' kid' : ''}${n.small ? ' small' : ''}${d.gone ? ' gone' : ''}`)} role="button" tabindex="0" data-tk="${x(d.key)}" aria-label="${x(d.title)}">`
        + `<circle class="hit" cx="${px}" cy="${r1(py + 6)}" r="${r + 10}"/>${extra}<circle class="disc" cx="${px}" cy="${py}" r="${r}"${n.kid && d.color ? ` style="fill:${x(d.color)}"` : ''}/>`
        + `<text x="${px}" y="${r1(py + (n.small ? 4 : 5))}" class="fti">${x(d.initial)}</text>${d.gone ? star(px - r * 0.8, py - r * 0.8, n.small ? 3.4 : 4) : ''}`
        + `<text x="${px}" y="${r1(py + r + 13)}" class="ftl">${x(label)}</text></g>`;
    };
    const budNode = n => {
      const px = X(n.x), py = r1(yOf(n)), r = n.r, b = n.bud;
      return `<g class="tbud${n.small ? ' small' : ''}" role="button" tabindex="0" data-tk="${x(b.key)}" aria-label="${x(b.title)}"><circle class="hit" cx="${px}" cy="${r1(py + 6)}" r="${r + 10}"/>`
        + `<circle class="disc" cx="${px}" cy="${py}" r="${r - 1}"/><path class="plus" d="M${px - 5} ${py}h10M${px} ${py - 5}v10"/>${n.small ? '' : `<text x="${px}" y="${r1(py + r + 12)}" class="ftl">${lines(b.label, 11).map((l, i) => `<tspan x="${px}" dy="${i ? 10.5 : 0}">${x(l)}</tspan>`).join('')}</text>`}</g>`;
    };
    out.push(`<g class="people">${nodes.filter(n => n.bud).map(budNode).join('')}${nodes.filter(n => n.n).map(person).join('')}</g>`);
    return { svg: `<svg class="ftreesvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${x(m.title || '')}">${out.join('')}</svg>`, keys, width: W, height: H, center: cx0 };
  }
  return { clean, walk, find, add, update, remove, draw, newId, MAX_SIBS, MAX_KIDS };
})();
