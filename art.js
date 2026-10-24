'use strict';
/* Watercolour paintings for the day clock's porcelain panel, like the painted French carriage clocks. Each painting is drawn as SVG
   (soft washes with wobbly, pigment-darkened edges, wet-in-wet skies, paper grain), turned into a picture once, and reused, so the
   clock stays quick however often the screen refreshes. The dial sits over the middle of the panel; the paintings keep their detail
   in the corners and along the bottom, where it shows. */
const Art = (() => {
  const W = 264, H = 336, DIAL = { x: 132, y: 132, r: 122 };   // the panel, and where the dial sits on it (the clock uses the same numbers)
  const THEMES = [
    { id: 'blossom', name: 'Cherry blossoms', base: '#f3e3e6' }, { id: 'maple', name: 'Japanese maple', base: '#f4e2c8' }, { id: 'ocean', name: 'Ocean', base: '#cfe3ec' },
    { id: 'forest', name: 'Forest', base: '#e2eadb' }, { id: 'mountains', name: 'Mountains', base: '#dbe1ee' }, { id: 'garden', name: 'Rose garden', base: '#f2efe2' },
    { id: 'night', name: 'Starry night', base: '#22325e', edge: 0.86 }, { id: 'classic', name: 'Gilt classic', base: '#d9b04f', edge: 0.97 },
    // shown only while travelling, never in the art picker
    { id: 'car', name: 'Road trip', base: '#e3ebd5', travel: true }, { id: 'plane', name: 'In the air', base: '#d9e7f1', travel: true },
    { id: 'train', name: 'By train', base: '#e4e9da', travel: true }, { id: 'ship', name: 'At sea', base: '#cde2ec', travel: true },
  ];
  const byId = id => THEMES.find(t => t.id === id) || THEMES[0];

  // ---- drawing helpers ----------------------------------------------------------------------------------------------------------------
  const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const f = n => Math.round(n * 10) / 10;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v * (1 - t) + hex(b)[i] * t).toString(16).padStart(2, '0')).join('');
  const P = (x, y) => `${f(x)} ${f(y)}`;
  /** A smooth curve through points (Catmull-Rom as cubic Béziers); closed shapes end in Z. */
  function smooth(pts, closed = true) {
    const n = pts.length, at = i => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${P(...pts[0])}`;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      d += `C${P(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)} ${P(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)} ${P(...p2)}`;
    }
    return closed ? d + 'Z' : d;
  }
  /** An irregular round blob. */
  const blob = (R, cx, cy, rx, ry, jit = 0.18, n = 9, rot = 0) => smooth(Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * 2 * Math.PI, k = 1 + (R() * 2 - 1) * jit; return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]; }));
  /** A watercolour wash: a transparent fill whose pigment gathers along a slightly darker, wobbly edge. */
  const wash = (d, c, op = 0.5, edge = 0.55, filt = 'wc') => `<g filter="url(#${filt})"><path d="${d}" fill="${c}" fill-opacity="${op}"/><path d="${d}" fill="none" stroke="${mix(c, '#2a1f17', 0.3)}" stroke-opacity="${f(op * edge)}" stroke-width="1.2"/></g>`;
  /** Wet-in-wet colour: big soft blooms that melt into each other. */
  const sky = (R, list) => `<g filter="url(#wet)">${list.map(([c, x, y, rx, ry, op]) => `<path d="${blob(R, x, y, rx, ry, 0.25, 8)}" fill="${c}" fill-opacity="${op}"/>`).join('')}</g>`;
  /** A tapered stroke (branches, stems): wide at the first point, thin at the last. */
  function branch(pts, w0, w1, c, op = 0.9) {
    const n = pts.length, L = [], Rr = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2, nx = -dy / len, ny = dx / len;
      L.push([p[0] + nx * w, p[1] + ny * w]); Rr.push([p[0] - nx * w, p[1] - ny * w]);
    });
    const d = smooth(L, false) + smooth(Rr.reverse(), false).replace(/^M/, 'L') + 'Z';
    return `<g filter="url(#wcs)"><path d="${d}" fill="${c}" fill-opacity="${op}"/><path d="${smooth(L, false)}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width=".8"/></g>`;
  }
  /** A side twig off a branch, heading roughly in direction `a` (radians). */
  const twig = (R, x, y, a, len, w, c) => { const pts = [[x, y]]; let ang = a; for (let i = 1; i <= 3; i++) { ang += (R() - 0.5) * 0.5; pts.push([pts[i - 1][0] + Math.cos(ang) * len / 3, pts[i - 1][1] + Math.sin(ang) * len / 3]); } return branch(pts, w, 0.8, c); };
  const ring = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');

  // cherry blossom: five notched petals, a dark centre and stamens
  function flower(R, cx, cy, r, c, rot = R() * 6.28) {
    const dk = mix(c, '#7a2440', 0.35);
    const petals = ring(5, i => {
      const a = rot + (i * 2 * Math.PI) / 5, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca, w = r * 0.5;
      const b = [cx + ca * r * 0.12, cy + sa * r * 0.12], tip = (k, s) => [cx + ca * r * k + nx * w * s, cy + sa * r * k + ny * w * s];
      const tl = tip(0.98, 0.42), tr = tip(0.98, -0.42), notch = tip(0.84, 0);
      return `<path d="M${P(...b)}C${P(...tip(0.45, 1.25))} ${P(...tip(0.85, 0.95))} ${P(...tl)}L${P(...notch)}L${P(...tr)}C${P(...tip(0.85, -0.95))} ${P(...tip(0.45, -1.25))} ${P(...b)}Z" fill="${c}" fill-opacity=".86" stroke="${dk}" stroke-opacity=".35" stroke-width=".4"/>`;
    });
    const stamens = ring(7, i => { const a = rot + i * 0.9, x = cx + Math.cos(a) * r * 0.42, y = cy + Math.sin(a) * r * 0.42; return `<path d="M${P(cx, cy)}L${P(x, y)}" stroke="${dk}" stroke-width=".35" stroke-opacity=".7"/><circle cx="${f(x)}" cy="${f(y)}" r=".7" fill="#e3b54e"/>`; });
    return `<g filter="url(#wcs)">${petals}<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.2)}" fill="${dk}" fill-opacity=".8"/>${stamens}</g>`;
  }
  const bud = (cx, cy, r, rot, c) => `<g transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})" filter="url(#wcs)"><ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r * 0.6)}" ry="${f(r)}" fill="${c}" fill-opacity=".9"/><path d="M${P(cx - r * 0.5, cy + r * 0.7)}Q${P(cx, cy + r * 1.3)} ${P(cx + r * 0.5, cy + r * 0.7)}" fill="#8aa35e" fill-opacity=".8"/></g>`;
  const petal = (cx, cy, r, rot, c) => `<path transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})" d="M${P(cx, cy + r)}C${P(cx - r, cy + r * 0.3)} ${P(cx - r * 0.7, cy - r)} ${P(cx - r * 0.15, cy - r)}L${P(cx, cy - r * 0.7)}L${P(cx + r * 0.15, cy - r)}C${P(cx + r * 0.7, cy - r)} ${P(cx + r, cy + r * 0.3)} ${P(cx, cy + r)}Z" fill="${c}" fill-opacity=".8" filter="url(#wcs)"/>`;
  // a palmate maple leaf with seven pointed lobes, veins and a stem
  function mapleLeaf(cx, cy, s, rot, c) {
    const tips = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5], len = [0.5, 0.78, 0.95, 1, 0.95, 0.78, 0.5], ax = rot - Math.PI / 2, pts = [];
    const pt = (a, r) => [cx + Math.cos(ax + a) * s * r, cy + Math.sin(ax + a) * s * r];
    pts.push(pt(-2.2, 0.16));
    tips.forEach((a, i) => { pts.push(pt(a - 0.12, len[i] * 0.72)); pts.push(pt(a, len[i])); pts.push(pt(a + 0.12, len[i] * 0.72)); if (i < 6) pts.push(pt(a + 0.25, 0.34 + (i === 2 || i === 3 ? 0.04 : 0))); });
    pts.push(pt(2.2, 0.16));
    const d = 'M' + pts.map(p => P(...p)).join('L') + 'Z', dk = mix(c, '#3b0d0d', 0.4);
    const veins = tips.map((a, i) => `M${P(cx, cy)}L${P(...pt(a, len[i] * 0.85))}`).join('');
    return `<g filter="url(#wcs)"><path d="${d}" fill="${c}" fill-opacity=".85" stroke="${dk}" stroke-opacity=".45" stroke-width=".5" stroke-linejoin="round"/><path d="${veins}" stroke="${dk}" stroke-opacity=".35" stroke-width=".45" fill="none"/><path d="M${P(cx, cy)}L${P(...pt(Math.PI, 0.55))}" stroke="${dk}" stroke-width=".8" stroke-opacity=".7"/></g>`;
  }
  /** An evergreen: a jagged tiered silhouette with a darker shadow side. */
  function pine(R, x, base, h, w, c, op = 0.85) {
    const tiers = Math.max(4, Math.round(h / 16)), top = base - h, step = (h * 0.86) / tiers, L = [[x, top]], Rr = [];
    for (let k = 0; k < tiers; k++) {
      const y = top + step * (k + 1), ww = w * (0.25 + (0.75 * (k + 1)) / tiers) * (0.85 + R() * 0.3);
      L.push([x - ww, y + R() * 2]); L.push([x - ww * 0.42, y - step * 0.15]);
      Rr.push([x + ww * 0.42, y - step * 0.15]); Rr.push([x + ww, y + R() * 2]);
    }
    const trunk = `<path d="M${P(x - w * 0.06, base - h * 0.14)}L${P(x - w * 0.08, base)}L${P(x + w * 0.08, base)}L${P(x + w * 0.06, base - h * 0.14)}Z" fill="#5a4636" fill-opacity="${op}"/>`;
    const outline = [...L, ...Rr.reverse()];
    const d = 'M' + outline.map(p => P(...p)).join('L') + 'Z', shade = 'M' + [[x, top], ...outline.slice(L.length)].map(p => P(...p)).join('L') + `L${P(x, base - h * 0.14)}Z`;
    return `<g filter="url(#wc)">${trunk}<path d="${d}" fill="${c}" fill-opacity="${op}"/><path d="${shade}" fill="${mix(c, '#0f1f18', 0.35)}" fill-opacity="${f(op * 0.45)}"/></g>`;
  }
  /** A mountain range through peaks [[x, y]…], filled down to the bottom; `snow` caps the peaks higher than that y. */
  function range(R, peaks, c, op, snow) {
    const pts = [];
    for (let i = 0; i < peaks.length - 1; i++) {
      const [x0, y0] = peaks[i], [x1, y1] = peaks[i + 1], n = Math.max(2, Math.round((x1 - x0) / 7));
      for (let k = 0; k < n; k++) { const t = k / n; pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + (k && k < n ? (R() - 0.5) * 6 : 0)]); }
    }
    pts.push(peaks[peaks.length - 1]);
    const d = 'M' + pts.map(p => P(...p)).join('L') + `L${P(W + 12, H + 12)}L${P(-12, H + 12)}Z`;
    let caps = '';
    if (snow) for (let i = 1; i < peaks.length - 1; i++) {
      const [px, py] = peaks[i]; if (py > snow) continue;
      const lx = px - (px - peaks[i - 1][0]) * 0.28, ly = py + (peaks[i - 1][1] - py) * 0.28, rx = px + (peaks[i + 1][0] - px) * 0.28, ry = py + (peaks[i + 1][1] - py) * 0.28;
      const zig = ring(4, k => { const t = (k + 1) / 5; return `L${P(rx + (lx - rx) * t, ry + (ly - ry) * t + (k % 2 ? -3 : 3))}`; });
      caps += `<path d="M${P(px, py)}L${P(rx, ry)}${zig}L${P(lx, ly)}Z" fill="#fff" fill-opacity=".9"/><path d="M${P(px, py)}L${P(rx, ry)}L${P(px + 2, ry + 4)}Z" fill="#dce4f2" fill-opacity=".8"/>`;
    }
    return `<g filter="url(#wc)"><path d="${d}" fill="${c}" fill-opacity="${op}"/><path d="${d}" fill="none" stroke="${mix(c, '#1e2238', 0.3)}" stroke-opacity="${f(op * 0.5)}" stroke-width="1"/>${caps}</g>`;
  }
  /** A band of sea, its crest rolling at height y; white foam along the top. */
  function wave(R, y, amp, len, c, op, foam = true) {
    const ph = R() * 6.28, pts = [];
    for (let x = -12; x <= W + 12; x += 6) pts.push([x, y + amp * Math.sin((x / len) * 2 * Math.PI + ph) + (R() - 0.5) * 1.6]);
    const top = smooth(pts, false), d = top + `L${P(W + 12, H + 12)}L${P(-12, H + 12)}Z`;
    const dash = Array.from({ length: 8 }, () => `${Math.round(10 + R() * 34)} ${Math.round(4 + R() * 12)}`).join(' ');
    return `<g filter="url(#wc)"><path d="${d}" fill="${c}" fill-opacity="${op}"/><path d="${top}" fill="none" stroke="${mix(c, '#0e2a44', 0.35)}" stroke-width="3" stroke-opacity=".25" transform="translate(0 3)"/>${foam ? `<path d="${top}" fill="none" stroke="#fff" stroke-width="3.2" stroke-opacity=".35"/><path d="${top}" fill="none" stroke="#fff" stroke-width="1.5" stroke-opacity=".9" stroke-dasharray="${dash}" stroke-dashoffset="${Math.round(R() * 40)}" stroke-linecap="round"/>` : ''}</g>`;
  }
  const curl = (x, y, s) => `<path d="M${P(x - s, y + s * 0.2)}C${P(x - s * 0.6, y - s)} ${P(x + s * 0.7, y - s)} ${P(x + s * 0.5, y - s * 0.1)}C${P(x + s * 0.35, y + s * 0.35)} ${P(x - s * 0.1, y + s * 0.15)} ${P(x + s * 0.05, y - s * 0.25)}" fill="none" stroke="#fff" stroke-width="1.3" stroke-opacity=".9" stroke-linecap="round" filter="url(#wcs)"/>`;
  const cloud = (R, x, y, w) => `<g filter="url(#wc)">${ring(5, i => `<path d="${blob(R, x - w / 2 + (i + 0.5) * (w / 5), y - Math.sin((i + 0.5) / 5 * Math.PI) * w * 0.16, w * 0.17, w * 0.13, 0.15, 7)}" fill="#fff" fill-opacity=".8"/>`)}<ellipse cx="${f(x)}" cy="${f(y + w * 0.06)}" rx="${f(w * 0.48)}" ry="${f(w * 0.07)}" fill="#a9b9d4" fill-opacity=".35"/></g>`;
  const bird = (x, y, s, c = '#4a4a55') => `<path d="M${P(x - s, y)}Q${P(x - s / 2, y - s * 0.6)} ${P(x, y)}Q${P(x + s / 2, y - s * 0.6)} ${P(x + s, y)}" fill="none" stroke="${c}" stroke-width="1" stroke-linecap="round" stroke-opacity=".75"/>`;
  const leaf = (cx, cy, len, rot, c) => `<g transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})" filter="url(#wcs)"><path d="M${P(cx, cy)}C${P(cx + len * 0.3, cy - len * 0.32)} ${P(cx + len * 0.75, cy - len * 0.25)} ${P(cx + len, cy)}C${P(cx + len * 0.75, cy + len * 0.25)} ${P(cx + len * 0.3, cy + len * 0.32)} ${P(cx, cy)}Z" fill="${c}" fill-opacity=".85"/><path d="M${P(cx, cy)}L${P(cx + len * 0.92, cy)}" stroke="${mix(c, '#14240c', 0.4)}" stroke-width=".5" stroke-opacity=".6"/></g>`;
  // a cabbage rose: a soft blob with petals spiralling in
  function rose(R, cx, cy, r, c) {
    const dk = mix(c, '#5a1426', 0.4), hi = mix(c, '#ffffff', 0.45);
    const arcs = ring(5, i => { const rr = r * (0.85 - i * 0.15), a0 = R() * 6.28 + i * 1.3, a1 = a0 + 2.1 + R() * 0.8; return `<path d="M${P(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr)}A${f(rr)} ${f(rr * 0.85)} 0 0 1 ${P(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr)}" fill="none" stroke="${i % 2 ? hi : dk}" stroke-width="${f(1.6 - i * 0.2)}" stroke-opacity=".75" stroke-linecap="round"/>`; });
    return `<g filter="url(#wcs)"><path d="${blob(R, cx, cy, r, r * 0.92, 0.12, 9)}" fill="${c}" fill-opacity=".88"/>${arcs}<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.16)}" fill="${dk}" fill-opacity=".6"/></g>`;
  }
  const forgetMeNot = (cx, cy, r) => `<g filter="url(#wcs)">${ring(5, i => { const a = (i * 2 * Math.PI) / 5; return `<circle cx="${f(cx + Math.cos(a) * r * 0.55)}" cy="${f(cy + Math.sin(a) * r * 0.55)}" r="${f(r * 0.48)}" fill="#7ea4dc" fill-opacity=".9"/>`; })}<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.28)}" fill="#f2d16b"/></g>`;
  const star4 = (x, y, r, op = 0.9) => `<path d="M${P(x, y - r)}L${P(x + r * 0.22, y - r * 0.22)}L${P(x + r, y)}L${P(x + r * 0.22, y + r * 0.22)}L${P(x, y + r)}L${P(x - r * 0.22, y + r * 0.22)}L${P(x - r, y)}L${P(x - r * 0.22, y - r * 0.22)}Z" fill="#fff6d2" fill-opacity="${op}"/>`;

  // ---- for the travel paintings: rolling land, roads, heaped clouds and the little vehicles ----------------------------------------------
  /** Rolling land: a soft crest through [[x, y]…], washed down to the bottom of the panel. */
  const hill = (pts, c, op = 0.55, edge = 0.45) => wash(`${smooth(pts, false)}L${P(W + 12, H + 12)}L${P(-12, H + 12)}Z`, c, op, edge);
  /** The outline of a band along a path, w0 wide at the first point and w1 at the last: a road, a river, a vapour trail. */
  function ribbon(pts, w0, w1) {
    const n = pts.length, L = [], Rr = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2, nx = ((a[1] - b[1]) / len) * w, ny = ((b[0] - a[0]) / len) * w;
      L.push([p[0] + nx, p[1] + ny]); Rr.push([p[0] - nx, p[1] - ny]);
    });
    return smooth(L, false) + smooth(Rr.reverse(), false).replace(/^M/, 'L') + 'Z';
  }
  /** A broadleaf tree, round, or tall like a poplar when h ≫ w: a trunk under a soft crown lit from the upper left. */
  function tree(R, x, base, h, w, c, op = 0.85) {
    const rx = w / 2, ry = Math.max(rx, h * 0.36), cy = base - h + ry, dk = mix(c, '#1c2a14', 0.4), crown = blob(R, x, cy, rx, ry, 0.12, 9);
    return `<g filter="url(#wc)"><path d="M${P(x - w * 0.08, base)}L${P(x - w * 0.03, cy)}L${P(x + w * 0.03, cy)}L${P(x + w * 0.08, base)}Z" fill="#6b5442" fill-opacity="${op}"/><path d="${crown}" fill="${c}" fill-opacity="${op}"/><path d="${blob(R, x + rx * 0.28, cy + ry * 0.3, rx * 0.66, ry * 0.6, 0.2, 7)}" fill="${dk}" fill-opacity="${f(op * 0.35)}"/><path d="${blob(R, x - rx * 0.3, cy - ry * 0.36, rx * 0.4, ry * 0.3, 0.2, 7)}" fill="#fffbe6" fill-opacity=".25"/><path d="${crown}" fill="none" stroke="${dk}" stroke-opacity="${f(op * 0.45)}" stroke-width="1"/></g>`;
  }
  /** A heaped cumulus cloud: billowing puffs on a flat base, shaded lavender underneath. */
  function heap(R, x, y, w, op = 0.88, c = '#fff') {
    const puffs = [];
    for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, r = w * (0.08 + 0.1 * Math.sin(t * Math.PI)) * (0.85 + R() * 0.3); puffs.push([x - w * 0.42 + t * w * 0.84, y - r * 0.55, r]); }
    for (let i = 0; i < 3; i++) { const r = w * (0.1 + (i === 1 ? 0.05 : 0)) * (0.8 + R() * 0.4); puffs.push([x - w * 0.2 + i * w * 0.2 + (R() - 0.5) * w * 0.06, y - w * 0.16 - r * 0.55, r]); }
    const body = puffs.map(([px, py, r]) => `<path d="${blob(R, px, py, r, r * 0.92, 0.1, 8)}" fill="${c}" fill-opacity="${op}"/>`).join('');
    const shade = puffs.slice(0, 6).map(([px, py, r]) => `<path d="${blob(R, px + r * 0.12, py + r * 0.5, r * 0.78, r * 0.36, 0.15, 7)}" fill="#c6cfe4" fill-opacity="${f(op * 0.4)}"/>`).join('');
    return `<g filter="url(#wc)"><path d="${blob(R, x, y, w * 0.5, w * 0.075, 0.1, 9)}" fill="#aebbd6" fill-opacity="${f(op * 0.5)}"/>${body}${shade}</g>`;
  }
  /** A gull gliding on bent wings. */
  const gull = (x, y, s) => `<path d="M${P(x - s, y)}Q${P(x - s * 0.5, y - s * 0.55)} ${P(x, y + s * 0.15)}Q${P(x + s * 0.5, y - s * 0.55)} ${P(x + s, y)}Q${P(x + s * 0.5, y - s * 0.3)} ${P(x, y + s * 0.38)}Q${P(x - s * 0.5, y - s * 0.3)} ${P(x - s, y)}Z" fill="#fff" fill-opacity=".95" stroke="#59606b" stroke-width=".6" stroke-opacity=".75" stroke-linejoin="round"/>`;
  // The vehicles are drawn facing right in their own little drawing, standing (or floating) on y = 0; a scene places and scales them.
  /** A rounded vintage car with luggage strapped on the roof. */
  function vintageCar(c) {
    const dk = mix(c, '#2a1f17', 0.4), ink = '#3a3432', glass = '#e3eef3';
    return `<ellipse cx="0" cy=".6" rx="21" ry="1.8" fill="#4a3f35" fill-opacity=".28"/>` +
      `<path d="M-11 -25.4H6M-9 -25.4V-24M4 -25.4V-24" stroke="#5a4636" stroke-width=".9" stroke-linecap="round"/>` +
      `<rect x="-10.5" y="-31.6" width="11.5" height="6.2" rx="1.2" fill="#9b6a45"/><path d="M-7.2 -31.6V-25.4M-2.4 -31.6V-25.4" stroke="#5f3f2a" stroke-width=".7"/><path d="M-6.2 -31.6V-33H-3.4V-31.6" fill="none" stroke="#5f3f2a" stroke-width=".6"/>` +
      `<rect x="1.4" y="-29.8" width="6.4" height="4.4" rx="1" fill="#79a3a4"/><path d="M4.6 -29.8V-25.4" stroke="#4e7071" stroke-width=".6"/>` +
      `<path d="M-20.5 -6C-23 -8 -23 -13 -19 -15C-16 -22 -9 -25.2 -2 -25.2C5 -25.2 9 -22 11 -16C15 -15.5 20 -14.5 21.6 -11C23 -8 22.6 -6.4 21 -6H17.6C17.6 -11.6 7.4 -11.6 7.4 -6H-7.4C-7.4 -11.6 -17.6 -11.6 -17.6 -6Z" fill="${c}" stroke="${dk}" stroke-width=".8" stroke-opacity=".7"/>` +
      `<path d="M-15.6 -16C-13 -21 -9 -22.6 -4 -22.6V-16ZM-2 -22.6C3 -22.6 6.6 -21 8.6 -16H-2Z" fill="${glass}" stroke="${dk}" stroke-width=".5" stroke-opacity=".5"/>` +
      `<path d="M-16.5 -22C-12 -24.6 -4 -25.4 3 -24.2" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1" stroke-linecap="round"/>` +
      `<path d="M-3 -15.4V-7.4M-1.2 -13.2H1" stroke="${dk}" stroke-width=".6" stroke-opacity=".6" stroke-linecap="round"/>` +
      `<circle cx="20.2" cy="-11.4" r="1.6" fill="#f8e6a6" stroke="${dk}" stroke-width=".4"/><circle cx="-21.4" cy="-11" r=".9" fill="#e9806a"/>` +
      `<path d="M20.4 -6.2Q23 -6.2 23.4 -8M-20 -6.2Q-22.6 -6.2 -23 -8" fill="none" stroke="#cfc6b6" stroke-width="1.3" stroke-linecap="round"/>` +
      ring(2, i => { const x = i ? 12.5 : -12.5; return `<circle cx="${x}" cy="-4.5" r="4.5" fill="${ink}"/><circle cx="${x}" cy="-4.5" r="1.9" fill="#e6dfd2"/><circle cx="${x}" cy="-4.5" r=".6" fill="${ink}"/>`; });
  }
  /** A small friendly propeller plane, centred on its own origin. */
  function propPlane(c) {
    const dk = mix(c, '#3a2412', 0.4), red = '#d2654f', ink = '#4a3d38', glass = '#dcebf4';
    return `<ellipse cx="-24" cy="-6.6" rx="6.4" ry="1.7" fill="${mix(c, '#7a4a20', 0.2)}"/>` +
      `<path d="M-19 -8.6L-26.4 -21C-27.4 -23 -30.6 -22.6 -30.6 -20L-29.6 -11.6Z" fill="${red}" stroke="${mix(red, '#2a1f17', 0.4)}" stroke-width=".6" stroke-opacity=".6"/>` +
      `<path d="M22 -4.5C22 -8.5 17 -10.5 9 -10.5C1 -10.5 -10 -9 -18 -8.6C-22 -8.3 -25 -10 -28 -12.5L-30 -12C-29.5 -7 -27 -2.5 -19 -1C-8 0.6 4 2.6 12 2.6C18 2.6 22 0 22 -4.5Z" fill="${c}" stroke="${dk}" stroke-width=".7" stroke-opacity=".6"/>` +
      `<path d="M-24 -4.2C-12 -2.8 4 -1.8 21.6 -2" fill="none" stroke="${red}" stroke-width="1.6" stroke-opacity=".85"/>` +
      `<path d="M7 -10C10.5 -10 13.6 -8.5 15.6 -5.6H7Z" fill="${glass}" stroke="${dk}" stroke-width=".5" stroke-opacity=".5"/>` +
      ring(3, i => `<circle cx="${f(1 - i * 6)}" cy="${f(-6.6 - i * 0.1)}" r="1.5" fill="${glass}" stroke="${dk}" stroke-width=".4" stroke-opacity=".5"/>`) +
      `<path d="M-16 -9.8C-6 -11 4 -11 10 -10.4" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1" stroke-linecap="round"/>` +
      `<path d="M5.6 2.4L6.8 8.4" stroke="${ink}" stroke-width=".9"/><circle cx="6.8" cy="9.4" r="2.1" fill="${ink}"/><circle cx="6.8" cy="9.4" r=".7" fill="#e9e1d2"/>` +
      `<path d="M-8 -1.4L10 -2.4C12.6 -2.4 12.8 0.4 11 1.6L-1 12.4C-2.4 13.6 -6 13.4 -6.6 11.6Z" fill="${mix(c, '#fff8e0', 0.2)}" stroke="${dk}" stroke-width=".7" stroke-opacity=".6"/><path d="M-6.4 9.4L1.6 10" stroke="${red}" stroke-width="1.5" stroke-opacity=".85"/>` +
      `<ellipse cx="26.4" cy="-4.2" rx="1.6" ry="10.5" fill="#fff" fill-opacity=".45" stroke="#7d8594" stroke-width=".4" stroke-opacity=".4"/>` +
      `<ellipse cx="26.2" cy="-9.4" rx=".9" ry="4.6" fill="${ink}" fill-opacity=".55"/><ellipse cx="26.6" cy="1" rx=".9" ry="4.6" fill="${ink}" fill-opacity=".55"/>` +
      `<path d="M21.6 -8.6C25 -8 27.6 -5.6 27.6 -4.2C27.6 -2.8 25 -0.4 21.6 0.2Z" fill="${red}"/>`;
  }
  /** A little steam engine: a cab, a round boiler with a tall chimney, and red wheels. */
  function engine(c) {
    const ink = '#3d3633', gold = '#e0bf5c', red = '#c0493c';
    return `<rect x="-1" y="-7.6" width="48" height="3.6" rx=".8" fill="${ink}"/>` +
      `<path d="M0 -7V-24.5H15V-7Z" fill="${c}"/><path d="M-2 -24.3H17L16.5 -27.3Q7.5 -29.6 -1.5 -27.3Z" fill="${ink}"/><rect x="3.2" y="-21.8" width="8.6" height="7" rx="1.4" fill="#f6e3a6"/>` +
      `<path d="M15 -7.5V-19.5H40.5C43.5 -19.5 44 -15 44 -13.5C44 -12 43.5 -7.5 40.5 -7.5Z" fill="${c}"/><path d="M40 -19.5H40.5C43.5 -19.5 44 -15 44 -13.5C44 -12 43.5 -7.5 40.5 -7.5H40Z" fill="${ink}" fill-opacity=".85"/>` +
      `<path d="M23 -19.5V-7.5M31 -19.5V-7.5" stroke="${gold}" stroke-width="1.1"/><path d="M16 -17.6H39" stroke="#fff" stroke-opacity=".3" stroke-width="1"/>` +
      `<path d="M33.6 -19.5L34.3 -26H33.2V-28.6H40.2V-26H39.1L39.8 -19.5Z" fill="${ink}"/><path d="M24.5 -19.5Q24.5 -23.6 27.5 -23.6Q30.5 -23.6 30.5 -19.5Z" fill="${gold}"/>` +
      `<circle cx="42.6" cy="-22" r="1.5" fill="#f8e6a6" stroke="${ink}" stroke-width=".5"/><rect x="44.5" y="-9" width="2.6" height="4.2" fill="${red}"/><path d="M47 -8.2H49" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>` +
      [[8, 5], [20, 5], [37, 3.4]].map(([x, r]) => `<circle cx="${x}" cy="${-r}" r="${r}" fill="${red}" stroke="${ink}" stroke-width="1"/><circle cx="${x}" cy="${-r}" r="1.2" fill="${ink}"/>`).join('') +
      `<path d="M8 -3.6H20" stroke="#ddd5c6" stroke-width="1.3" stroke-linecap="round"/>`;
  }
  /** A railway carriage with warm lit windows, 38 long. */
  function carriage(c) {
    const ink = '#3d3633';
    return `<path d="M-3.5 -6.4H0" stroke="${ink}" stroke-width="1.2"/><rect x="2" y="-7.6" width="34" height="2.6" fill="${ink}"/><rect x="0" y="-21" width="38" height="14.4" rx="2" fill="${c}"/>` +
      `<path d="M-1.2 -20.4Q19 -26.4 39.2 -20.4Z" fill="#5d524c"/><path d="M1 -9.8H37" stroke="#fff" stroke-opacity=".45" stroke-width="1"/>` +
      ring(4, i => `<rect x="${f(3.6 + i * 8.4)}" y="-18.3" width="5.8" height="6" rx="1.2" fill="#f6e7b4" stroke="${mix(c, '#2a1f17', 0.4)}" stroke-width=".5"/>`) +
      [6, 12, 26, 32].map(x => `<circle cx="${x}" cy="-2.9" r="2.9" fill="${ink}"/><circle cx="${x}" cy="-2.9" r="1" fill="#cdbfa8"/>`).join('');
  }
  /** Little triangle flags strung on a sagging line from (x0, y0) to (x1, y1). */
  function bunting(x0, y0, x1, y1, n) {
    const cs = ['#e3c25a', '#c4473b', '#7aa6c8', '#f4efe6'], mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + Math.abs(x1 - x0) * 0.12;
    const at = t => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1];
    return `<path d="M${P(x0, y0)}Q${P(mx, my)} ${P(x1, y1)}" fill="none" stroke="#4a3f3a" stroke-width=".4"/>` + ring(n, i => { const [a, b] = at((i + 0.3) / n), [c, d] = at((i + 0.8) / n); return `<path d="M${P(a, b)}L${P(c, d)}L${P((a + c) / 2, (b + d) / 2 + 2.4)}Z" fill="${cs[i % 4]}"/>`; });
  }
  /** A small passenger ship: a dark hull with portholes, white decks, a red funnel and bunting. */
  function ferry() {
    const ink = '#2f3d52', red = '#c4473b', white = '#f8f4ec', glass = '#cfe3ee';
    return `<path d="M-1 -13C30 -11.5 80 -12 112 -18L104 -3.5C96 -0.5 60 0.6 8 0C3 -1 0 -5 -1 -13Z" fill="#3f5c84"/><path d="M8 0C60 0.6 96 -0.5 104 -3.5L105.4 -6.2C96 -3 60 -2.2 5.4 -2.6Z" fill="${red}"/>` +
      `<path d="M-0.6 -12.2C30 -10.7 80 -11.2 111 -17.2" fill="none" stroke="${white}" stroke-width="1.3"/>` + ring(11, i => `<circle cx="${14 + i * 8}" cy="-7.6" r="1.25" fill="#f3e6bf"/>`) +
      `<path d="M14 -12V-19.5Q14 -21.5 16 -21.5H86Q89 -21.5 90 -18.5L92 -12Z" fill="${white}"/>` + ring(10, i => `<rect x="${18 + i * 7}" y="-18.6" width="4.2" height="3.4" rx=".8" fill="${glass}"/>`) +
      `<path d="M24 -21.5V-27.5Q24 -29.5 26 -29.5H72Q75 -29.5 76 -27L78 -21.5Z" fill="${white}"/>` + ring(7, i => `<rect x="${f(28 + i * 6.5)}" y="-27" width="3.6" height="3" rx=".7" fill="${glass}"/>`) +
      `<path d="M60 -29.5V-34Q60 -35 61 -35H74Q77 -35 78 -32L79 -29.5Z" fill="${white}"/><path d="M63 -33H76.5" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M40 -29.5L43 -46H54L52.5 -29.5Z" fill="${red}"/><path d="M42.6 -43.8L43 -46H54L53.8 -43.8Z" fill="#2f2f35"/><path d="M41.6 -38.2H53.2" stroke="${white}" stroke-width="1.2"/>` +
      `<ellipse cx="19" cy="-22.8" rx="4" ry="1.5" fill="#e59a4e"/><ellipse cx="84" cy="-22.8" rx="4" ry="1.5" fill="#e59a4e"/>` +
      `<path d="M99 -16L100 -40M2 -12.6L0 -26" stroke="#4a3f3a" stroke-width=".8"/><path d="M0 -26L-6.5 -24L0 -22Z" fill="${red}"/>` + bunting(100, -40, 111.6, -17.6, 4) + bunting(54, -46, 100, -40, 7);
  }

  // ---- the paintings -------------------------------------------------------------------------------------------------------------------
  const ground = (y, c, op = 0.45) => wash(`M-12 ${H + 12}L-12 ${y}C60 ${y - 6} 130 ${y + 4} 200 ${y - 4}C240 ${y - 8} 262 ${y - 6} ${W + 12} ${y - 10}L${W + 12} ${H + 12}Z`, c, op, 0.3);
  const SCENES = {
    blossom(R) {
      let s = sky(R, [['#f6d4dc', 30, 30, 140, 110, 0.6], ['#dbe8f3', 230, 50, 130, 100, 0.65], ['#fbe7d8', 140, 330, 180, 80, 0.5], ['#e4ecf6', 0, 230, 100, 140, 0.5], ['#f7dbe3', 260, 290, 100, 90, 0.5]]);
      s += wash('M-12 348L-12 318C40 306 96 288 140 264C160 253 174 245 186 241L198 241C210 245 224 253 244 264C258 272 266 276 276 280L276 348Z', '#c7cfe4', 0.55, 0.4);
      s += `<path d="M186 241L198 241C205 245 211 249 217 254L209 252L203 258L196 251L188 259L182 252L173 257C177 251 181 246 186 241Z" fill="#fff" fill-opacity=".85" filter="url(#wcs)"/>`;
      s += `<g filter="url(#wet)"><ellipse cx="132" cy="298" rx="190" ry="18" fill="#fff" opacity=".55"/></g>` + ground(318, '#e8d6c4');
      const ink = '#4b3a34';
      s += branch([[-14, 340], [6, 304], [20, 266], [22, 226], [16, 182], [18, 136], [28, 92], [48, 56], [80, 30], [124, 14], [172, 6], [214, 8], [246, 18]], 15, 2.5, ink);
      s += twig(R, 20, 268, 3.5, 26, 4, ink) + twig(R, 18, 182, 3.3, 20, 3.5, ink) + twig(R, 48, 56, 4.1, 26, 4, ink) + twig(R, 124, 14, 4.4, 22, 3, ink) + twig(R, 200, 7, -0.1, 30, 2.6, ink);
      s += branch([[278, 22], [258, 32], [240, 48], [228, 66], [224, 86]], 7, 1.6, ink) + twig(R, 240, 48, -0.4, 20, 2.4, ink);
      const pinks = ['#f4a9bb', '#f7c3cf', '#ee93ab', '#f9d0da'];
      s += `<g filter="url(#wet)">${[[30, 50], [100, 14], [190, 6], [248, 36], [8, 170], [14, 266]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26" fill="#f4b3c4" opacity=".35"/>`).join('')}</g>`;
      for (const [x, y] of [[24, 62], [38, 40], [62, 24], [96, 14], [134, 7], [176, 4], [212, 8], [240, 18], [256, 40], [236, 60], [226, 84], [10, 128], [6, 176], [10, 222], [24, 266], [8, 300], [-2, 250], [40, 284], [250, 4]]) {
        for (let k = 0; k < 3; k++) s += flower(R, x + (R() - 0.5) * 18, y + (R() - 0.5) * 14, 6 + R() * 3.5, pinks[Math.floor(R() * 4)]);
        s += bud(x + (R() - 0.5) * 22, y + (R() - 0.5) * 18, 2.6, R() * 360, '#e07a98');
      }
      for (let i = 0; i < 16; i++) s += petal(16 + R() * 232, 262 + R() * 66, 2.6 + R() * 2.2, R() * 360, pinks[i % 4]);
      return s;
    },
    maple(R) {
      let s = sky(R, [['#f6dcb4', 40, 30, 150, 110, 0.55], ['#f3c9b2', 240, 50, 120, 100, 0.5], ['#fbeedd', 140, 180, 160, 120, 0.4], ['#efe0c8', 20, 260, 90, 90, 0.45]]);
      s += wash(`M-12 ${H + 12}L-12 284C60 278 200 280 ${W + 12} 286L${W + 12} ${H + 12}Z`, '#b9d6e2', 0.55, 0.35);
      s += ring(7, i => `<path d="M${P(20 + i * 34, 300 + (i % 3) * 9)}h${18 + (i % 2) * 10}" stroke="#fff" stroke-width="1.2" stroke-opacity=".7" stroke-linecap="round"/>`);
      // a red arched bridge, mirrored in the pond
      const br = (o, y0, flip) => `<g opacity="${o}" ${flip ? `transform="translate(0 ${2 * y0}) scale(1 -1)"` : ''}><path d="M56 ${y0}Q132 ${y0 - 40} 208 ${y0}" fill="none" stroke="#b8322a" stroke-width="5" stroke-linecap="round"/><path d="M60 ${y0 - 9}Q132 ${y0 - 49} 204 ${y0 - 9}" fill="none" stroke="#c43a2f" stroke-width="2.4" stroke-linecap="round"/>${ring(9, i => { const x = 66 + i * 16.5, t = (x - 56) / 152, yd = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 - 40) + t * t * y0; return `<path d="M${P(x, yd - 9)}L${P(x, yd)}" stroke="#a52a24" stroke-width="1.6"/>`; })}</g>`;
      s += `<g filter="url(#wcs)">${br(1, 292, false)}</g><g filter="url(#wet)">${br(0.35, 292, true)}</g>`;
      const ink = '#4a3527';
      s += branch([[-14, 76], [14, 58], [44, 38], [84, 20], [126, 10], [170, 10]], 10, 2, ink) + twig(R, 44, 38, 4.4, 20, 3, ink) + twig(R, 84, 20, 4.5, 18, 2.4, ink) + twig(R, 14, 58, 1.6, 26, 3.4, ink);
      s += branch([[278, 128], [262, 100], [250, 72], [244, 44], [248, 16]], 9, 2, ink) + twig(R, 250, 72, 3.6, 22, 2.6, ink) + twig(R, 262, 100, 1.8, 22, 3, ink);
      const reds = ['#c8342b', '#de4b33', '#ea7a3b', '#e9a23f', '#b72a35'];
      for (const [x, y] of [[20, 52], [40, 30], [68, 18], [100, 10], [140, 6], [176, 14], [8, 92], [244, 16], [232, 40], [256, 64], [240, 94], [262, 120], [258, 150], [6, 140], [16, 270], [250, 262]]) {
        for (let k = 0; k < 3; k++) s += mapleLeaf(x + (R() - 0.5) * 22, y + (R() - 0.5) * 16, 7 + R() * 5, (R() - 0.5) * 2.4, reds[Math.floor(R() * 5)]);
      }
      for (let i = 0; i < 9; i++) s += mapleLeaf(14 + R() * 236, 262 + R() * 66, 4 + R() * 3, R() * 6.28, reds[i % 5]);
      return s;
    },
    ocean(R) {
      let s = sky(R, [['#d6e9f4', 40, 30, 160, 90, 0.7], ['#f8e2c4', 230, 40, 90, 70, 0.7], ['#e9f1f7', 132, 120, 180, 60, 0.5]]);
      s += `<g filter="url(#wet)"><circle cx="232" cy="36" r="24" fill="#f9d9a6" opacity=".55"/></g><circle cx="232" cy="36" r="12" fill="#f6cf92" fill-opacity=".85" filter="url(#wc)"/>`;
      s += cloud(R, 46, 38, 70) + cloud(R, 200, 70, 56) + cloud(R, 24, 92, 44);
      s += bird(196, 22, 5) + bird(212, 14, 4) + bird(184, 32, 3.5) + bird(60, 18, 3.5);
      s += wash(`M-12 ${H + 12}L-12 150L${W + 12} 150L${W + 12} ${H + 12}Z`, '#a7d0de', 0.5, 0.2);
      [[178, 2, 90, '#8fc2d4', 0.45], [206, 3.5, 66, '#6fadc7', 0.5], [236, 5, 58, '#5a9cbd', 0.5], [262, 7, 50, '#4688ad', 0.55], [290, 8, 62, '#3a77a0', 0.55], [316, 9, 46, '#2f6690', 0.6]].forEach(([y, a, l, c, o]) => { s += wave(R, y, a, l, c, o); });
      for (let i = 0; i < 6; i++) s += curl(30 + i * 42 + R() * 10, 286 + (i % 2) * 24, 6 + R() * 3);
      // a little sailboat, and a lighthouse on its rocks
      s += `<g filter="url(#wcs)"><path d="M28 280L72 280L66 288L36 288Z" fill="#a8463a" fill-opacity=".9"/><path d="M50 279L50 238" stroke="#5a4636" stroke-width="1.2"/><path d="M51 240L51 277L70 277Z" fill="#fff" fill-opacity=".95"/><path d="M49 246L49 277L33 277Z" fill="#f1ede4" fill-opacity=".95"/><path d="M51 240L56 243L51 245Z" fill="#c8453a"/></g>`;
      s += `<g filter="url(#wet)"><path d="M36 292L66 292" stroke="#fff" stroke-width="3" opacity=".6"/></g>`;
      s += `<g filter="url(#wc)"><path d="${blob(R, 236, 318, 44, 16, 0.2, 9)}" fill="#6d6259" fill-opacity=".85"/><path d="${blob(R, 214, 324, 22, 9, 0.2, 7)}" fill="#81776d" fill-opacity=".8"/></g>`;
      s += `<g filter="url(#wcs)"><path d="M228 306L231 254L245 254L248 306Z" fill="#f4efe6"/><path d="M229.6 290L246.6 290L247 298L229.2 298Z M230.5 272L245.6 272L246 280L230.2 280Z" fill="#c4473b"/><rect x="229" y="246" width="18" height="8" fill="#3d3a3a"/><rect x="232" y="247" width="12" height="6" fill="#f8d77a"/><path d="M227 246L238 236L249 246Z" fill="#c4473b"/></g>`;
      s += `<g filter="url(#wet)"><circle cx="238" cy="250" r="16" fill="#fbe7a6" opacity=".45"/></g>`;
      return s;
    },
    forest(R) {
      let s = sky(R, [['#f5ecd4', 132, 30, 200, 90, 0.6], ['#f8dca0', 226, 34, 60, 50, 0.6], ['#e3eddf', 40, 150, 120, 120, 0.5], ['#e9efe1', 220, 200, 110, 120, 0.5]]);
      s += `<g filter="url(#wet)"><circle cx="226" cy="34" r="20" fill="#fbe6b4" opacity=".6"/></g>`;
      s += bird(52, 24, 4) + bird(66, 16, 3) + bird(40, 32, 3);
      for (let x = -10; x < W + 10; x += 13) s += pine(R, x + R() * 6, 196 + R() * 8, 46 + R() * 26, 13, '#b4cbb6', 0.55);
      s += `<g filter="url(#wet)"><rect x="-20" y="186" width="${W + 40}" height="26" fill="#fff" opacity=".55"/></g>`;
      for (let x = -12; x < W + 12; x += 19) s += pine(R, x + R() * 8, 262 + R() * 10, 66 + R() * 40, 18, '#7da488', 0.6);
      s += ground(296, '#a2bb7c', 0.55);
      [[10, 345, 300, 30], [34, 345, 250, 26], [254, 345, 310, 30], [232, 345, 236, 24]].forEach(([x, b, h, w]) => { s += pine(R, x, b, h, w, '#3f6b54', 0.82); });
      // ferns and a family of mushrooms on the forest floor
      const fern = (x, y, len, a) => { let d = '', px = x, py = y; for (let i = 0; i < 9; i++) { const t = i / 9, ang = a - t * 0.9, nx = px + Math.cos(ang) * len / 9, ny = py + Math.sin(ang) * len / 9, l = (1 - t) * 7 + 2; d += leaf(nx, ny, l, (ang * 180) / Math.PI - 70, '#6f9a4f') + leaf(nx, ny, l, (ang * 180) / Math.PI + 70 - 180, '#7aa65a'); px = nx; py = ny; } return `<path d="M${P(x, y)}Q${P(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 - 6)} ${P(px, py)}" stroke="#5b7f3f" stroke-width="1" fill="none"/>` + d; };
      s += fern(56, 334, 44, -1.9) + fern(78, 336, 36, -1.4) + fern(40, 336, 30, -2.4);
      const shroom = (x, y, r) => `<g filter="url(#wcs)"><path d="M${P(x - r * 0.28, y)}L${P(x - r * 0.22, y - r * 1.1)}L${P(x + r * 0.22, y - r * 1.1)}L${P(x + r * 0.28, y)}Z" fill="#f2e8d5"/><path d="M${P(x - r, y - r)}C${P(x - r, y - r * 2.1)} ${P(x + r, y - r * 2.1)} ${P(x + r, y - r)}Z" fill="#c8453a" fill-opacity=".92"/>${ring(4, i => `<circle cx="${f(x - r * 0.55 + i * r * 0.36)}" cy="${f(y - r * 1.42 - (i % 2) * r * 0.22)}" r="${f(r * 0.12)}" fill="#fff"/>`)}</g>`;
      s += shroom(196, 330, 9) + shroom(214, 334, 6) + shroom(182, 336, 5);
      return s;
    },
    mountains(R) {
      let s = sky(R, [['#cfe0ef', 132, 10, 220, 80, 0.7], ['#f7e0cc', 132, 150, 220, 70, 0.6], ['#f3d6c6', 40, 120, 90, 60, 0.5]]);
      s += `<g filter="url(#wet)"><circle cx="38" cy="58" r="22" fill="#fbdcae" opacity=".6"/></g><circle cx="38" cy="58" r="11" fill="#f7cf9a" fill-opacity=".85" filter="url(#wc)"/>`;
      s += bird(214, 92, 4) + bird(228, 84, 3) + bird(200, 100, 3);
      s += range(R, [[-12, 120], [24, 44], [62, 100], [104, 70], [150, 106], [196, 56], [238, 22], [W + 12, 92]], '#b8c1dc', 0.6, 75);
      s += `<g filter="url(#wet)"><rect x="-20" y="130" width="${W + 40}" height="30" fill="#fff" opacity=".5"/></g>`;
      s += range(R, [[-12, 176], [30, 124], [82, 176], [140, 150], [200, 184], [250, 132], [W + 12, 168]], '#8f9fc4', 0.6, 140);
      s += range(R, [[-12, 254], [40, 228], [100, 262], [170, 246], [230, 232], [W + 12, 248]], '#6b7fa6', 0.6);
      s += wash(`M-12 ${H + 12}L-12 282L${W + 12} 282L${W + 12} ${H + 12}Z`, '#b7d3e5', 0.6, 0.25);
      s += `<g filter="url(#wet)" opacity=".35" transform="translate(0 564) scale(1 -1)">${range(R, [[-12, 254], [40, 228], [100, 262], [170, 246], [230, 232], [W + 12, 248]], '#6b7fa6', 0.6)}</g>`;
      s += ring(6, i => `<path d="M${P(14 + i * 44, 300 + (i % 3) * 10)}h${22 + (i % 2) * 8}" stroke="#fff" stroke-width="1.2" stroke-opacity=".75" stroke-linecap="round"/>`);
      [[8, 296, 46, 11], [22, 300, 36, 9], [36, 298, 28, 8], [246, 298, 44, 11], [260, 300, 34, 9], [228, 300, 26, 7]].forEach(([x, b, h, w]) => { s += pine(R, x, b, h, w, '#3d5a4f', 0.85); });
      return s;
    },
    garden(R) {
      let s = sky(R, [['#dce9f1', 132, 20, 200, 90, 0.55], ['#e7efd4', 132, 320, 200, 70, 0.55], ['#f6e0e2', 10, 10, 80, 80, 0.5], ['#f6e0e2', 254, 326, 80, 70, 0.5]]);
      const greens = ['#7f9f5f', '#5d7f47', '#93b06c'], pinks = ['#e9a0ad', '#d9788c', '#f2c3cb', '#f2c76b'];
      const bouquet = (x, y, sc, aim) => {
        let b = '';
        for (let i = 0; i < 9; i++) b += leaf(x, y, (14 + R() * 8) * sc, aim + (R() - 0.5) * 150, greens[i % 3]);
        for (let i = 0; i < 3; i++) b += rose(R, x + (R() - 0.5) * 22 * sc, y + (R() - 0.5) * 16 * sc, (7 + R() * 4) * sc, pinks[Math.floor(R() * 4)]);
        for (let i = 0; i < 6; i++) b += forgetMeNot(x + (R() - 0.5) * 40 * sc, y + (R() - 0.5) * 30 * sc, 2.8 * sc);
        for (let i = 0; i < 2; i++) b += bud(x + (R() - 0.5) * 34 * sc, y + (R() - 0.5) * 28 * sc, 3 * sc, R() * 360, '#e58fa2');
        return b;
      };
      // vines along the sides, then a bouquet in each corner and one at the bottom
      for (const side of [0, 1]) { const x = side ? W - 4 : 4; let v = `<path d="M${P(x, 40)}C${P(x + (side ? -10 : 10), 110)} ${P(x + (side ? 8 : -8), 170)} ${P(x, 270)}" stroke="#6d8c50" stroke-width="1" fill="none" filter="url(#wcs)"/>`; for (let i = 0; i < 9; i++) { const y = 56 + i * 24; v += leaf(x + (side ? -2 : 2), y, 8, side ? 200 + R() * 40 : -20 + R() * 40, greens[i % 3]) + (i % 3 === 1 ? forgetMeNot(x + (side ? -6 : 6), y + 8, 2.6) : ''); } s += v; }
      for (let i = 0; i < 44; i++) { const a = (i / 44) * 2 * Math.PI, r = DIAL.r + 9 + (i % 2) * 3, x = DIAL.x + Math.cos(a) * r, y = DIAL.y + Math.sin(a) * r; s += leaf(x, y, 9, (a * 180) / Math.PI + 90 + (i % 2 ? 25 : -25), greens[i % 3]); if (i % 4 === 0) s += rose(R, x, y, 5.5, pinks[(i / 4) % 4]); else if (i % 4 === 2) s += forgetMeNot(x, y, 3); }
      s += bouquet(24, 26, 1.45, 135) + bouquet(240, 26, 1.45, 45) + bouquet(22, 308, 1.45, -135) + bouquet(242, 310, 1.45, -45);
      s += `<g filter="url(#wcs)"><path d="M132 300C118 288 100 290 104 302C108 312 124 306 132 300C140 306 156 312 160 302C164 290 146 288 132 300Z" fill="#9fc0e6" fill-opacity=".85"/><path d="M130 302L118 326M134 302L148 326" stroke="#9fc0e6" stroke-width="3" stroke-linecap="round"/></g>`;
      s += bouquet(132, 286, 1.15, -90);
      return s;
    },
    night(R) {
      let s = `<rect width="${W}" height="${H}" fill="#22325e"/>` + sky(R, [['#2c4478', 132, 150, 170, 140, 0.8], ['#16234a', 10, 10, 110, 90, 0.8], ['#16234a', 254, 10, 110, 90, 0.7], ['#5b6fa8', 132, 300, 190, 60, 0.6]]);
      for (let i = 0; i < 70; i++) s += `<circle cx="${f(R() * W)}" cy="${f(R() * 250)}" r="${f(0.5 + R() * 0.9)}" fill="#fff6d2" fill-opacity="${f(0.45 + R() * 0.5)}"/>`;
      for (const [x, y, r] of [[230, 24, 5], [252, 66, 3.5], [214, 54, 2.6], [70, 18, 3.2], [16, 104, 3], [250, 120, 2.6], [12, 196, 2.4], [256, 210, 3], [100, 8, 2.4]]) s += star4(x, y, r);
      s += `<path d="M196 20L222 34" stroke="#fff6d2" stroke-width="1" stroke-opacity=".6" stroke-linecap="round"/>`;
      // the moon, with a soft glow
      s += `<g filter="url(#wet)"><circle cx="40" cy="44" r="34" fill="#f6e7b0" opacity=".28"/></g><mask id="mn"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="50" cy="36" r="19" fill="#000"/></mask><circle cx="40" cy="44" r="21" fill="#f6e7b0" mask="url(#mn)" filter="url(#wcs)"/>`;
      s += cloud(R, 60, 282, 90) + cloud(R, 206, 272, 80);
      s += wash(`M-12 ${H + 12}L-12 300C40 288 90 296 132 304C176 312 220 294 ${W + 12} 290L${W + 12} ${H + 12}Z`, '#18244a', 0.9, 0.3);
      const house = (x, y, w, h) => `<g filter="url(#wcs)"><path d="M${P(x, y)}L${P(x, y - h)}L${P(x + w / 2, y - h - w * 0.45)}L${P(x + w, y - h)}L${P(x + w, y)}Z" fill="#101a38"/><rect x="${f(x + w * 0.3)}" y="${f(y - h * 0.7)}" width="${f(w * 0.24)}" height="${f(h * 0.3)}" fill="#f6d78a"/></g>`;
      s += house(34, 312, 18, 14) + house(58, 318, 14, 11) + house(200, 316, 16, 13) + house(222, 312, 20, 15);
      return s;
    },
    classic(R) {
      const C = DIAL;
      let s = `<rect width="${W}" height="${H}" fill="url(#gilt)"/>`;
      for (let r = C.r + 4, i = 0; r < 260; r += 2.6, i++) s += `<circle cx="${C.x}" cy="${C.y}" r="${f(r)}" fill="none" stroke="${i % 2 ? '#fbe8a6' : '#a77a27'}" stroke-opacity=".32" stroke-width=".9"/>`;
      for (let a = 0; a < 360; a += 2) { const t = (a * Math.PI) / 180; s += `<path d="M${P(C.x + Math.cos(t) * (C.r + 4), C.y + Math.sin(t) * (C.r + 4))}L${P(C.x + Math.cos(t) * 260, C.y + Math.sin(t) * 260)}" stroke="#fff3c4" stroke-opacity=".14" stroke-width=".7"/>`; }
      const scroll = (x, y, sx, sy) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy})" fill="none" stroke="#7d5a1c" stroke-opacity=".6" stroke-width="1.1" stroke-linecap="round"><path d="M4 30C4 12 20 4 36 6C50 8 52 24 40 26C32 27 30 18 36 16"/><path d="M30 4C38 -2 54 2 58 12"/><path d="M4 30C10 36 20 38 26 34"/></g>`;
      s += scroll(4, 4, 1, 1) + scroll(W - 4, 4, -1, 1) + scroll(4, H - 4, 1, -1) + scroll(W - 4, H - 4, -1, -1);
      s += `<rect x="5" y="5" width="${W - 10}" height="${H - 10}" rx="4" fill="none" stroke="#7d5a1c" stroke-opacity=".5"/>`;
      return s;
    },
    // ---- travel: shown only while travelling ----
    car(R) {
      let s = sky(R, [['#d6e6f1', 50, 24, 170, 90, 0.7], ['#f8e2c0', 226, 40, 90, 70, 0.65], ['#f2efd9', 132, 190, 200, 90, 0.5], ['#e4edd6', 132, 320, 200, 70, 0.4]]);
      s += `<g filter="url(#wet)"><circle cx="226" cy="38" r="22" fill="#fbdcae" opacity=".6"/></g><circle cx="226" cy="38" r="11" fill="#f7cf9a" fill-opacity=".85" filter="url(#wc)"/>`;
      s += cloud(R, 42, 34, 66) + cloud(R, 18, 86, 38) + cloud(R, 246, 92, 36);
      s += bird(72, 16, 4) + bird(86, 9, 3) + bird(60, 23, 3);
      // hills fading into the distance, the far end of the road winding over them
      s += hill([[-12, 200], [36, 186], [94, 198], [156, 186], [214, 196], [W + 12, 184]], '#b9cab7', 0.5);
      s += `<g filter="url(#wet)"><rect x="-20" y="198" width="${W + 40}" height="16" fill="#fff" opacity=".45"/></g>`;
      s += hill([[-12, 226], [40, 212], [104, 228], [172, 214], [226, 228], [W + 12, 214]], '#a9c290', 0.55);
      s += wash(ribbon([[-14, 233], [10, 227], [32, 224], [58, 228]], 3.4, 2), '#efe3c6', 0.85, 0.5);
      s += tree(R, 12, 228, 24, 18, '#7c9d5f') + tree(R, 32, 233, 15, 11, '#8fab6c') + tree(R, 244, 226, 36, 13, '#6b9056') + tree(R, 257, 230, 21, 15, '#85a566');
      s += hill([[-12, 258], [56, 250], [128, 262], [196, 248], [W + 12, 254]], '#9dbc7d', 0.55);
      s += tree(R, 6, 292, 46, 32, '#6f975a') + tree(R, 202, 277, 30, 22, '#80a263');
      // two sheep in the field
      s += `<g filter="url(#wcs)">${[[34, 279, 1], [52, 275, -1]].map(([x, y, d]) => `<path d="M${P(x - 2.4, y + 2)}V${f(y + 5)}M${P(x + 2.4, y + 2)}V${f(y + 5)}" stroke="#4a4040" stroke-width=".9"/><path d="${blob(R, x, y, 5, 3.4, 0.16, 9)}" fill="#fbf8f0" stroke="#9a948a" stroke-width=".5"/><ellipse cx="${f(x + d * 5)}" cy="${f(y - 1)}" rx="1.8" ry="1.4" fill="#4a4040"/>`).join('')}</g>`;
      // the road winds down to us, with a fence along it and a fingerpost at the bend
      const road = [[198, 236], [216, 244], [230, 258], [226, 274], [200, 287], [150, 297], [100, 304], [50, 312], [4, 320], [-16, 324]], wAt = i => 3.5 + (20.5 * i) / 9;
      const along = x => { for (let i = 4; i < road.length - 1; i++) { const [x0, y0] = road[i], [x1, y1] = road[i + 1]; if (x <= x0 && x >= x1) { const t = (x0 - x) / (x0 - x1); return [y0 + (y1 - y0) * t, wAt(i + t)]; } } return [road[4][1], wAt(4)]; };
      s += wash(ribbon(road, 3.5, 24), '#eadcbf', 0.9, 0.45);
      s += `<path d="${smooth(road.slice(4), false)}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.1" stroke-dasharray="7 6" stroke-linecap="round" filter="url(#wcs)"/>`;
      const posts = [2, 16, 30, 44, 58].map(x => { const [cy, w] = along(x); return [x, cy - w / 2 - 1, 9 + (100 - x) * 0.04]; });
      let fence = posts.map(([x, b, h]) => `<path d="M${P(x - 1.1, b)}L${P(x - 1, b - h)}L${P(x + 1, b - h - 0.6)}L${P(x + 1.1, b)}Z" fill="#8b6e52"/>`).join('');
      for (const k of [0.82, 0.45]) fence += `<path d="M${posts.map(([x, b, h]) => P(x, b - h * k)).join('L')}" fill="none" stroke="#8b6e52" stroke-width="1.1"/>`;
      s += `<g filter="url(#wcs)">${fence}</g>`;
      s += `<g filter="url(#wcs)"><path d="M244.6 324L245 286H247.4L247.8 324Z" fill="#7d5f45"/><path d="M244.2 286.4L246.2 284L248.2 286.4Z" fill="#6b5340"/>` +
        `<path d="M245 289H230L227 291.6L230 294.2H245Z" fill="#f2e8d4" stroke="#6b5340" stroke-width=".6"/><path d="M247.4 296H259L262 298.6L259 301.2H247.4Z" fill="#f2e8d4" stroke="#6b5340" stroke-width=".6"/>` +
        `<path d="M232 291.6H242M250 298.6H257" stroke="#8a7a68" stroke-width=".8" stroke-dasharray="2 1"/></g>`;
      // wild flowers and tufts of grass on the verge
      let verge = '';
      for (let i = 0; i < 44; i++) {
        const x = 4 + R() * (W - 8), [cy, w] = along(Math.min(200, x)), top = x > 200 ? 300 : cy + w / 2 + 4, y = top + R() * (334 - top);
        verge += i % 4 === 3 ? `<path d="M${P(x - 2, y)}L${P(x - 2.6, y - 4)}M${P(x, y)}L${P(x, y - 5)}M${P(x + 2, y)}L${P(x + 2.8, y - 3.6)}" stroke="#6c9450" stroke-width=".7" stroke-linecap="round"/>`
          : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + R() * 0.7)}" fill="${['#fff', '#f6d36b', '#eaa3b4'][i % 4]}" fill-opacity=".9"/>`;
      }
      s += `<g filter="url(#wcs)">${verge}</g>`;
      // the little car, a puff of exhaust behind it
      s += `<g filter="url(#wcs)"><g transform="translate(112 305) rotate(-8) scale(1.15)">${vintageCar('#c95f4c')}${[[-26, -5, 1.8, 0.8], [-31, -7, 2.5, 0.6], [-37.5, -9, 3.2, 0.4]].map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity="${o}"/>`).join('')}</g></g>`;
      return s;
    },
    plane(R) {
      let s = sky(R, [['#cde1f0', 132, 24, 220, 110, 0.75], ['#f9e2c4', 228, 44, 90, 70, 0.6], ['#f2dfe4', 16, 180, 90, 110, 0.45], ['#cfe3f0', 132, 252, 200, 56, 0.7], ['#f5e9d4', 132, 330, 200, 50, 0.5]]);
      s += `<g filter="url(#wet)"><circle cx="228" cy="40" r="22" fill="#fbdcae" opacity=".6"/></g><circle cx="228" cy="40" r="11" fill="#f7cf9a" fill-opacity=".85" filter="url(#wc)"/>`;
      s += heap(R, 30, 56, 64) + cloud(R, 246, 96, 38) + cloud(R, 14, 112, 30);
      s += bird(72, 16, 4) + bird(86, 9, 3) + bird(62, 24, 3);
      // far below: patchwork fields, a winding river and the coast, softened by haze
      const rows = [295, 298, 302, 307, 313, 320, 328, 337, 347], tints = ['#b8cb8f', '#d5cd95', '#a5c18c', '#cbd9a5', '#e1cf9c', '#9dbb7d', '#c2d49a'];
      let fields = '';
      for (let k = 0; k < rows.length - 1; k++) {
        const y0 = rows[k], y1 = rows[k + 1], sx = (u, y) => 132 + ((u - 132) * (y - 236)) / 100;
        for (let u = -70 - R() * 30; u < W + 70;) {
          const du = 24 + R() * 28;
          fields += `<path d="M${P(sx(u, y0), y0)}L${P(sx(u + du, y0), y0)}L${P(sx(u + du, y1), y1)}L${P(sx(u, y1), y1)}Z" fill="${tints[Math.floor(R() * tints.length)]}" fill-opacity=".65" stroke="#7c9a5c" stroke-opacity=".4" stroke-width=".6"/>`;
          u += du;
        }
      }
      s += `<g filter="url(#wc)">${fields}</g>`;
      s += wash(ribbon([[98, 295], [92, 302], [104, 311], [84, 322], [66, 336], [58, 348]], 1, 6), '#a9d1df', 0.9, 0.4);
      s += wash('M188 294C204 302 214 316 236 348L276 348L276 294Z', '#9fcadb', 0.9, 0.35);
      s += `<g filter="url(#wet)"><rect x="-20" y="286" width="${W + 40}" height="14" fill="#fff" opacity=".6"/></g>`;
      // layered clouds: lavender ones far off, white ones close by
      s += heap(R, 18, 226, 96, 0.75, '#e4e3f1') + heap(R, 252, 212, 84, 0.75, '#e4e3f1') + heap(R, 6, 246, 70) + heap(R, 260, 238, 66);
      s += heap(R, 26, 318, 78) + heap(R, 238, 324, 60) + `<g filter="url(#wet)"><ellipse cx="140" cy="314" rx="70" ry="5" fill="#fff" opacity=".55"/></g>`;
      // a few birds, and the plane climbing to the right with a faint vapour trail behind it
      s += bird(44, 266, 4) + bird(58, 259, 3.2) + bird(30, 273, 3);
      const trail = [[-26, -7], [-90, -8], [-160, -12], [-240, -18]];
      s += `<g transform="translate(216 279) rotate(-6) scale(1.15)"><linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="-26" y1="0" x2="-240" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<g filter="url(#wc)"><path d="${ribbon(trail, 3, 12)}" fill="url(#trail)"/><path d="${smooth(trail, false)}" fill="none" stroke="url(#trail)" stroke-width="1"/></g><g filter="url(#wcs)">${propPlane('#e8b84e')}</g></g>`;
      return s;
    },
    train(R) {
      let s = sky(R, [['#d5e5f0', 160, 18, 210, 90, 0.7], ['#f8e1bf', 36, 44, 90, 70, 0.65], ['#eef0e1', 132, 200, 200, 90, 0.5]]);
      s += `<g filter="url(#wet)"><circle cx="36" cy="42" r="22" fill="#fbdcae" opacity=".6"/></g><circle cx="36" cy="42" r="11" fill="#f7cf9a" fill-opacity=".85" filter="url(#wc)"/>`;
      s += cloud(R, 218, 34, 64) + cloud(R, 248, 84, 34) + cloud(R, 16, 96, 34);
      s += bird(188, 16, 4) + bird(202, 9, 3) + bird(176, 22, 3);
      // hills and trees beyond the valley
      s += hill([[-12, 194], [38, 180], [96, 194], [156, 182], [216, 192], [W + 12, 178]], '#b7c5c6', 0.5);
      s += `<g filter="url(#wet)"><rect x="-20" y="194" width="${W + 40}" height="16" fill="#fff" opacity=".45"/></g>`;
      s += hill([[-12, 224], [44, 210], [110, 224], [176, 212], [232, 224], [W + 12, 208]], '#a8c08b', 0.55);
      s += tree(R, 10, 226, 26, 18, '#7b9b5e') + pine(R, 30, 230, 26, 7, '#5f8466') + tree(R, 250, 222, 34, 13, '#6c9056') + tree(R, 236, 228, 18, 13, '#87a567');
      s += hill([[-12, 262], [60, 250], [140, 262], [210, 248], [W + 12, 256]], '#97b679', 0.55);
      s += tree(R, 14, 292, 48, 34, '#6f975a') + tree(R, 44, 290, 30, 22, '#82a465') + tree(R, 256, 288, 50, 16, '#68905a');
      // the river, and the stone viaduct striding over it
      s += wash(`M-12 ${H + 12}L-12 322C60 318 180 326 ${W + 12} 320L${W + 12} ${H + 12}Z`, '#a7cfdd', 0.75, 0.35);
      s += ring(6, i => `<path d="M${P(8 + i * 44, 328 + (i % 2) * 4)}h${12 + (i % 3) * 5}" stroke="#fff" stroke-width="1.1" stroke-opacity=".75" stroke-linecap="round"/>`);
      const arches = [-22, 22, 66, 110, 154, 198, 242, 286], vd = `M-12 290H${W + 12}V${H + 20}H-12Z` + arches.map(x => `M${x - 15} ${H + 14}V321A15 15 0 0 1 ${x + 15} 321V${H + 14}Z`).join('');
      let stones = '';
      for (let i = 0; i < 46; i++) {
        const x = R() * W, y = 296 + R() * 38, a = arches.reduce((m, v) => (Math.abs(v - x) < Math.abs(m - x) ? v : m));
        if (Math.abs(x - a) < 18 && (y > 321 || Math.hypot(x - a, y - 321) < 18)) continue;
        stones += `<path d="M${P(x, y)}h${f(3 + R() * 4)}" stroke="#9c8566" stroke-width=".7" stroke-opacity=".5"/>`;
      }
      s += `<g filter="url(#wc)"><path d="${vd}" fill-rule="evenodd" fill="#d6c4a6" fill-opacity=".95"/><path d="${vd}" fill="none" stroke="#8d7759" stroke-opacity=".5" stroke-width="1"/>` +
        arches.map(x => `<path d="M${x - 15} 321A15 15 0 0 1 ${x + 15} 321L${x + 13} 322A13 13 0 0 0 ${x - 13} 322Z" fill="#8a7458" fill-opacity=".35"/><path d="M${x - 17.2} 321A17.2 17.2 0 0 1 ${x + 17.2} 321" fill="none" stroke="#a48d6c" stroke-width="3.2" stroke-dasharray="2.2 1.3" stroke-opacity=".55"/>`).join('') +
        `<path d="M-12 290H${W + 12}V294.5H-12Z" fill="#bba889" fill-opacity=".85"/>${stones}<path d="M-12 289.4H${W + 12}" stroke="#5a4a40" stroke-width="1"/></g>`;
      s += ring(6, i => `<path d="M${P(arches[i + 1] - 26, 334)}h10" stroke="#fff" stroke-width="1.2" stroke-opacity=".7" stroke-linecap="round" filter="url(#wcs)"/>`);
      // the little train, steam rolling back over its carriages
      s += `<g filter="url(#wcs)"><g transform="translate(198 289)">${engine('#4f8068')}</g>${[[157, '#c66a58'], [116, '#d8a94f'], [75, '#6f9fa0']].map(([x, c]) => `<g transform="translate(${x} 289)">${carriage(c)}</g>`).join('')}</g>`;
      const puffs = [[236, 258, 3.2], [233, 252, 4.6], [226, 246, 6], [215, 242, 7.2], [202, 240, 8.2], [188, 241, 9]];
      s += `<g filter="url(#wc)">${puffs.map(([x, y, r], i) => `<path d="${blob(R, x + r * 0.1, y + r * 0.25, r, r * 0.8, 0.15, 8)}" fill="#c3cadc" fill-opacity="${f(0.55 - i * 0.06)}"/><path d="${blob(R, x - r * 0.1, y - r * 0.1, r * 0.92, r * 0.8, 0.15, 8)}" fill="#fff" fill-opacity="${f(0.95 - i * 0.09)}"/>`).join('')}</g>`;
      // a signal at the end of the line, its arm raised for the train
      s += `<g filter="url(#wcs)"><path d="M62.4 289V259.5H63.8V289Z" fill="#4a3f3a"/><path d="M63.1 262.5L52.6 258.4L53.4 256.2L63.6 260.6Z" fill="#c4473b"/><path d="M55.4 257.8L57.4 258.6" stroke="#fff" stroke-width="1.2"/><circle cx="63.1" cy="258.6" r="1.2" fill="#3d3633"/><path d="M60.4 289H65.8" stroke="#4a3f3a" stroke-width="1.4"/></g>`;
      return s;
    },
    ship(R) {
      let s = sky(R, [['#cfe3f1', 150, 14, 220, 90, 0.7], ['#f9e2c2', 36, 40, 90, 70, 0.65], ['#f4dfe0', 240, 150, 70, 70, 0.4], ['#e9f2f7', 132, 170, 200, 60, 0.5]]);
      s += `<g filter="url(#wet)"><circle cx="36" cy="40" r="22" fill="#fbdcae" opacity=".6"/></g><circle cx="36" cy="40" r="11" fill="#f7cf9a" fill-opacity=".85" filter="url(#wc)"/>`;
      s += cloud(R, 216, 30, 66) + cloud(R, 246, 80, 36) + cloud(R, 18, 96, 34);
      s += `<g filter="url(#wcs)">${gull(196, 18, 6) + gull(212, 30, 4.5) + gull(68, 14, 4)}</g>`;
      // the open sea: a harbour far off to the left, a lighthouse on its headland to the right
      s += wash(`M-12 ${H + 12}L-12 197L${W + 12} 197L${W + 12} ${H + 12}Z`, '#a5cfdc', 0.5, 0.2);
      s += wash('M224 199C232 192 240 188 250 187C258 186 266 188 276 186L276 199Z', '#8e9c8a', 0.75, 0.4);
      s += `<g filter="url(#wcs)"><path d="M255.6 188L256.2 174H259.4L260 188Z" fill="#f4efe6"/><path d="M255.9 180H259.7V183H255.8Z" fill="#c4473b"/><rect x="255.6" y="171" width="4.4" height="3" fill="#3d3a3a"/><path d="M255 171L257.8 168L260.6 171Z" fill="#c4473b"/></g><g filter="url(#wet)"><circle cx="258" cy="172" r="8" fill="#fbe7a6" opacity=".5"/></g>`;
      s += wash('M-12 199L-12 190C0 189 14 191 24 194C30 196 32 198 34 199Z', '#9aa58e', 0.75, 0.4);
      s += `<g filter="url(#wcs)">${[[-2, '#e9d8b4', 5, 5], [5, '#d9a38e', 4, 6], [11, '#f1ece2', 5, 4.5], [18, '#c9d7de', 4, 5]].map(([x, c, w, h]) => `<path d="M${x} 192V${192 - h}L${x + w / 2} ${192 - h - 2.6}L${x + w} ${192 - h}V192Z" fill="${c}"/>`).join('')}` +
        `<path d="M16 214L26 214L24 216.5L18 216.5Z" fill="#a8463a"/><path d="M21 213.5V204L26 213.5Z" fill="#fff"/><path d="M20.5 205.5V213.5L16.5 213.5Z" fill="#f1ede4"/></g>`;
      // gentle swells with little wavelets on them, bigger as they come nearer
      const ripple = (x, y) => { const k = (y - 196) / 140, w = 1.6 + k * 5; return `<path d="M${P(x - w, y)}Q${P(x - w / 2, y - w * 0.42)} ${P(x, y)}T${P(x + w, y)}" fill="none" stroke="#fff" stroke-width="${f(0.6 + k * 0.7)}" stroke-opacity="${f(0.55 + k * 0.3)}" stroke-linecap="round"/>`; };
      const ripples = Array.from({ length: 70 }, () => [R() * W, 204 + R() * 130]);
      [[206, 1, 90, '#9bc9d6', 0.4], [224, 1.6, 80, '#85bbcc', 0.45], [244, 2.2, 72, '#70abc1', 0.45], [266, 2.8, 64, '#5d9cb6', 0.5], [290, 3.2, 60, '#4c8cab', 0.5]].forEach(([y, a, l, c, o]) => { s += wave(R, y, a, l, c, o, false); });
      s += `<g filter="url(#wcs)">${ripples.filter(p => p[1] < 306).map(p => ripple(...p)).join('')}</g>`;
      // the ship, sailing left, smoke drifting back from its funnel and gulls following
      s += `<g filter="url(#wet)"><ellipse cx="137" cy="312" rx="58" ry="5" fill="#26405e" opacity=".35"/></g>`;
      s += `<g filter="url(#wc)">${[[147, 263, 2.6], [152, 259, 3.4], [159, 256, 4.2], [168, 254, 5], [179, 253, 5.6], [191, 253, 6]].map(([x, y, r], i) => `<path d="${blob(R, x + r * 0.1, y + r * 0.25, r, r * 0.8, 0.15, 8)}" fill="#b9c0d0" fill-opacity="${f(0.5 - i * 0.06)}"/><path d="${blob(R, x - r * 0.1, y - r * 0.1, r * 0.92, r * 0.78, 0.15, 8)}" fill="#f3f4f7" fill-opacity="${f(0.92 - i * 0.1)}"/>`).join('')}</g>`;
      s += `<g filter="url(#wcs)"><g transform="translate(190 310) scale(-.95 .95)">${ferry()}</g><path d="M192 308C204 310 218 309 234 312M190 304C208 303 226 304 244 306M86 309C82 307 81 304 83 301M90 310C88 308.5 88 306.5 89.4 305" fill="none" stroke="#fff" stroke-width="1.4" stroke-opacity=".85" stroke-linecap="round"/></g>`;
      [[314, 3.6, 60, '#3f7ca0', 0.55], [328, 4, 52, '#346d92', 0.55]].forEach(([y, a, l, c, o]) => { s += wave(R, y, a, l, c, o, false); });
      s += `<g filter="url(#wcs)">${ripples.filter(p => p[1] >= 306).map(p => ripple(...p)).join('')}${gull(214, 276, 5.5) + gull(234, 265, 4.2)}</g>`;
      return s;
    },
  };
  const DEFS = `<defs>
    <filter id="wc" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="3" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="6" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="0.45"/></filter>
    <filter id="wcs" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="2" seed="9" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="0.25"/></filter>
    <filter id="wet" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="11"/></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 .38  0 0 0 0 .3  0 0 0 0 .22  0 0 0 .14 0"/></filter>
    <filter id="mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="3" seed="5"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .32  0 0 0 0 .22  .5 0 0 0 -.18"/></filter>
    <linearGradient id="gilt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4d98a"/><stop offset=".35" stop-color="#d9b04f"/><stop offset=".6" stop-color="#f1d184"/><stop offset="1" stop-color="#b8892e"/></linearGradient></defs>`;
  const SEEDS = { blossom: 11, maple: 23, ocean: 37, forest: 41, mountains: 53, garden: 67, night: 71, classic: 83, car: 89, plane: 97, train: 101, ship: 107 };
  /** The painting as SVG markup, `scale` × the panel size in pixels. */
  function svg(id, scale = 2.5) {
    const t = byId(id), R = rng(SEEDS[t.id]), paper = t.id === 'night' ? '#22325e' : '#fbf6ec';
    const grain = t.id === 'classic' ? '' : `<rect width="${W}" height="${H}" filter="url(#mottle)"/><rect width="${W}" height="${H}" filter="url(#grain)"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="0 0 ${W} ${H}">${DEFS}<rect width="${W}" height="${H}" fill="${paper}"/>${SCENES[t.id](R)}${grain}</svg>`;
  }
  // The clock is 340 × 436; the painting sits in its panel at (x, y), scaled by k.
  const FRAME = { W: 340, H: 436, x: 30, y: 48, k: 280 / W };

  // Pictures are drawn once (into a blob URL), then reused. Anything that fails falls back to the SVG itself.
  const cache = {}, pending = {};
  function raster(k, make) {
    if (cache[k]) return Promise.resolve(cache[k]);
    if (pending[k]) return pending[k];
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(make());
    return (pending[k] = (async () => {
      try {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const blobOut = await new Promise(res => { try { c.toBlob(res, 'image/png'); } catch (e) { res(null); } });
        cache[k] = blobOut ? URL.createObjectURL(blobOut) : c.toDataURL('image/png');
      } catch (e) { cache[k] = src; }
      delete pending[k];
      return cache[k];
    })());
  }
  const key = (id, scale) => `${byId(id).id}@${scale}`;
  const peek = (id, scale = 2.5) => cache[key(id, scale)] || null;
  const url = (id, scale = 2.5) => raster(key(id, scale), () => svg(id, scale));
  return { THEMES, byId, DIAL, W, H, FRAME, svg, url, peek };
})();
