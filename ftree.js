'use strict';
/* The family tree as a picture: you at the foot of the trunk, your own family as its crown, and the family of each relative on a
   branch of its own, with its grown-ups and children as round leaves (the children in their own colours). It grows with the
   family: from a seedling while it is only you, then each new family is another branch, the trunk gets taller and thicker, and
   each new person fills out a cluster. Every person and family can be tapped (and reached with the keyboard). Only relatives are
   in it: caregivers and the like have a list of their own.
   FamilyTree.draw(model) → { svg, keys }. The model holds what to show, already in the app's language:
     { title, rtl, me: { key, initial, label, title },
       families: [{ key, name, title, crown, on, adults: [{ key, initial, label, title }], kids: [{ key, initial, label, title, color }] }],
       sprout: key → null, or the ms until that new part starts to grow in (below 0: it is already growing) }
   `keys` lists every part drawn, so the caller knows what was shown. */
const FamilyTree = (() => {
  const W = 360, RA = 17, RK = 14, CELL_A = 56, CELL_K = 50, ROW_A = 50, ROW_K = 46, HEAD = 26, PAD = 10;
  const x = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cut = (s, n) => { const a = [...String(s)]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
  const rows = (xs, per) => { const out = []; for (let i = 0; i < xs.length; i += per) out.push(xs.slice(i, i + per)); return out; };

  /** The size of one family's cluster when it may be `maxW` wide. */
  function measure(f, maxW) {
    const a = rows(f.adults, Math.max(1, Math.floor(maxW / CELL_A))), k = rows(f.kids, Math.max(1, Math.floor(maxW / CELL_K)));
    const w = Math.min(maxW, Math.max(110, ...a.map(r => r.length * CELL_A), ...k.map(r => r.length * CELL_K)));
    return { f, w, h: HEAD + a.length * ROW_A + k.length * ROW_K + PAD, a, k };
  }

  function draw(m) {
    const fams = m.families, crown = fams.find(f => f.crown) || fams[0], sides = fams.filter(f => f !== crown), keys = [];
    const people = fams.reduce((n, f) => n + f.adults.length + f.kids.length, 0);
    // what grows in, and when: asked from the root up (you, your family, then each branch with its people), so that the first
    // time, it grows in that order
    const when = {};
    for (const k of [m.me.key, ...[crown, ...sides].filter(Boolean).flatMap(f => [f.key, ...f.adults.map(p => p.key), ...f.kids.map(p => p.key)])]) {
      keys.push(k); when[k] = m.sprout ? m.sprout(k) : null;
    }
    const grow = (key, cls) => (when[key] == null ? `class="${cls}"` : `class="${cls} sprout" style="--d:${Math.round(when[key])}ms"`);
    const mir = v => (m.rtl ? W - v : v);   // (right to left: the first branch goes the other way)

    // the crown on top, then the other families in pairs, a branch to each side
    const c = crown && measure(crown, W - 40);
    let y = 22;
    if (c) { c.cx = W / 2; c.top = y; y += c.h + 34; }
    const levels = rows(sides.map(f => measure(f, W / 2 - 34)), 2);
    for (const lv of levels) {
      lv.forEach((s, i) => { s.cx = mir(i ? W * 0.75 : W * 0.25); s.top = y; });
      y += Math.max(...lv.map(s => s.h)) + 30;
    }
    const rootY = c ? y + 40 : 96, H = rootY + 46, tw = Math.min(22, 9 + people * 0.6), out = [];

    out.push('<g class="bark">');
    if (c) {
      // the trunk (it thickens as the family grows) and its roots, under everything else
      const top = c.top + c.h + 2, mid = (rootY + top) / 2;
      out.push(`<path class="trunk" d="M${W / 2} ${rootY - 18}C${W / 2 - 4} ${mid} ${W / 2 + 4} ${mid} ${W / 2} ${top}" stroke-width="${tw}"/>`
        + `<path class="root" d="M${W / 2} ${rootY - 14}q-18 10 -44 14M${W / 2} ${rootY - 14}q18 10 44 14M${W / 2} ${rootY - 16}q-6 12 -17 21M${W / 2} ${rootY - 16}q6 12 17 21" stroke-width="${Math.max(3, tw / 3)}"/>`);
      // a branch out to each of the other families, into the foot of its canopy (clear of its people)
      for (const s of levels.flat()) {
        const dir = s.cx < W / 2 ? -1 : 1, ty = s.top + s.h - 6, ex = s.cx - dir * (s.w / 2 - 14);
        out.push(`<path ${grow(s.f.key, 'branch')} pathLength="1" d="M${W / 2 + dir * tw / 4} ${ty + 26}Q${(W / 2 + ex) / 2} ${ty + 22} ${ex} ${ty}" stroke-width="${Math.max(4, tw * 0.55)}"/>`);
      }
    } else {
      // only you so far: a seedling
      out.push(`<path class="trunk" d="M${W / 2} ${rootY - 18}q-3 -26 0 -50" stroke-width="5"/><path class="root" d="M${W / 2} ${rootY - 16}q-10 8 -26 10M${W / 2} ${rootY - 16}q10 8 26 10" stroke-width="3"/>`
        + `<g class="canopy seed"><ellipse cx="${W / 2 - 15}" cy="${rootY - 72}" rx="16" ry="8" transform="rotate(-28 ${W / 2 - 15} ${rootY - 72})"/><ellipse cx="${W / 2 + 15}" cy="${rootY - 76}" rx="16" ry="8" transform="rotate(28 ${W / 2 + 15} ${rootY - 76})"/></g>`);
    }
    out.push('</g>');

    // each family: a soft canopy behind, its name, its grown-ups, then its children
    const cluster = s => {
      const f = s.f, cy = s.top + s.h / 2, parts = [`<g ${grow(f.key, 'tcl')}>`], wide = s.w > 200, name = cut(f.name, wide ? 40 : 24);
      parts.push(`<g class="canopy${f.on ? ' on' : ''}"><ellipse cx="${s.cx}" cy="${cy}" rx="${s.w / 2 + 10}" ry="${s.h / 2 + 10}"/>`
        + `<ellipse cx="${s.cx - s.w / 4}" cy="${cy - 6}" rx="${s.w / 3 + 6}" ry="${s.h / 2}"/><ellipse cx="${s.cx + s.w / 4}" cy="${cy + 4}" rx="${s.w / 3 + 6}" ry="${s.h / 2 - 2}"/></g>`);
      parts.push(`<g class="tfam" role="button" tabindex="0" data-tk="${x(f.key)}" aria-label="${x(f.title)}"><rect class="hit" x="${s.cx - s.w / 2}" y="${s.top}" width="${s.w}" height="22" rx="8"/>`
        + `<text x="${s.cx}" y="${s.top + 16}" class="tfname${[...name].length > (wide ? 32 : 18) ? ' sm' : ''}">${x(name)}</text></g></g>`);
      const row = (r, i, y0, cell, rad, kid) => r.forEach((p, j) => {
        const px = s.cx - (r.length * cell) / 2 + cell / 2 + j * cell, py = y0 + i * (kid ? ROW_K : ROW_A) + rad;
        parts.push(`<g ${grow(p.key, kid ? 'tnode kid' : 'tnode')} role="button" tabindex="0" data-tk="${x(p.key)}" aria-label="${x(p.title)}">`
          + `<circle class="hit" cx="${px}" cy="${py + 6}" r="${cell / 2 - 1}"/><circle cx="${px}" cy="${py}" r="${rad}"${kid ? ` style="fill:${x(p.color)}"` : ''}/>`
          + `<text x="${px}" y="${py + 4.5}" class="fti">${x(p.initial)}</text><text x="${px}" y="${py + rad + 12}" class="ftl">${x(cut(p.label, 10))}</text></g>`);
      });
      s.a.forEach((r, i) => row(r, i, s.top + HEAD, CELL_A, RA, false));
      s.k.forEach((r, i) => row(r, i, s.top + HEAD + s.a.length * ROW_A, CELL_K, RK, true));
      return parts.join('');
    };
    if (c) out.push(cluster(c));
    for (const s of levels.flat()) out.push(cluster(s));

    // you, at the foot of the trunk
    out.push(`<g ${grow(m.me.key, 'tnode me')} role="button" tabindex="0" data-tk="${x(m.me.key)}" aria-label="${x(m.me.title)}"><circle class="hit" cx="${W / 2}" cy="${rootY + 12}" r="28"/><circle cx="${W / 2}" cy="${rootY + 4}" r="20"/>`
      + `<text x="${W / 2}" y="${rootY + 10}" class="fti">${x(m.me.initial)}</text><text x="${W / 2}" y="${rootY + 39}" class="ftl me">${x(m.me.label)}</text></g>`);
    return { svg: `<svg class="ftreesvg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${x(m.title || '')}">${out.join('')}</svg>`, keys };
  }
  return { draw };
})();
