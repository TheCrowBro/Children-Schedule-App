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
  };
  const DEFS = `<defs>
    <filter id="wc" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="3" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="6" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="0.45"/></filter>
    <filter id="wcs" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="2" seed="9" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="0.25"/></filter>
    <filter id="wet" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="11"/></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 .38  0 0 0 0 .3  0 0 0 0 .22  0 0 0 .14 0"/></filter>
    <filter id="mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="3" seed="5"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .32  0 0 0 0 .22  .5 0 0 0 -.18"/></filter>
    <linearGradient id="gilt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4d98a"/><stop offset=".35" stop-color="#d9b04f"/><stop offset=".6" stop-color="#f1d184"/><stop offset="1" stop-color="#b8892e"/></linearGradient></defs>`;
  const SEEDS = { blossom: 11, maple: 23, ocean: 37, forest: 41, mountains: 53, garden: 67, night: 71, classic: 83 };
  /** The painting as SVG markup, `scale` × the panel size in pixels. */
  function svg(id, scale = 2.5) {
    const t = byId(id), R = rng(SEEDS[t.id]), paper = t.id === 'night' ? '#22325e' : '#fbf6ec';
    const grain = t.id === 'classic' ? '' : `<rect width="${W}" height="${H}" filter="url(#mottle)"/><rect width="${W}" height="${H}" filter="url(#grain)"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="0 0 ${W} ${H}">${DEFS}<rect width="${W}" height="${H}" fill="${paper}"/>${SCENES[t.id](R)}${grain}</svg>`;
  }
  // Paintings are drawn once into a picture (blob URL), then reused. Anything that fails falls back to the SVG itself.
  const cache = {}, pending = {};
  const key = (id, scale) => `${byId(id).id}@${scale}`;
  const peek = (id, scale = 2.5) => cache[key(id, scale)] || null;
  function url(id, scale = 2.5) {
    const k = key(id, scale);
    if (cache[k]) return Promise.resolve(cache[k]);
    if (pending[k]) return pending[k];
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(id, scale));
    return (pending[k] = (async () => {
      try {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.naturalWidth || Math.round(W * scale); c.height = img.naturalHeight || Math.round(H * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const blobOut = await new Promise(res => { try { c.toBlob(res, 'image/png'); } catch (e) { res(null); } });
        cache[k] = blobOut ? URL.createObjectURL(blobOut) : c.toDataURL('image/png');
      } catch (e) { cache[k] = src; }
      delete pending[k];
      return cache[k];
    })());
  }
  return { THEMES, byId, DIAL, W, H, svg, url, peek };
})();
