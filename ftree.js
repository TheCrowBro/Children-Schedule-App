'use strict';
/* The children's family tree, painted like a soft watercolour of the tree most common where the family comes from (an oak, a red
   maple, a eucalyptus, a banyan, cherry blossom…), with birds of that place on its branches and its own leaves falling. The children
   sit on the grass at the foot of the trunk; their parents, a couple joined by a heart, sit where it forks; each parent's brothers and sisters (the aunts and uncles) with their partners sit
   beside them, and their children (the cousins) on the grass below; the grandparents grow above each parent and the great-grandparents
   above them, at the top of the crown; each grandparent's brothers and sisters (the great-aunts and great-uncles) sit beside the
   grandparents, further out, with their partners, and their children (the parents' cousins) on the parents' row below them. The parents add relatives by
   tapping the buds where someone is missing; whoever is new since this phone last showed the tree sprouts in.
   This file holds the tree as the parents keep it (checked, and changed one person at a time) and draws it. account.js says what each
   tap does; e2ee.js seals the tree, which reaches only the children's relatives. */
const FamilyTree = (() => {
  // ---- the tree as the parents keep it ---------------------------------------------------------------------------------------
  // { v: 1, parents: [Parent], species (the kind of tree, when a parent chose one) }: the children's parents (one or two), each with
  //   gp:   their own parents, the children's grandparents (up to two), each with gp: theirs, the great-grandparents (up to two), and
  //         sibs: their brothers and sisters, the children's great-aunts and great-uncles (up to eight), each with a partner and children
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
    // a brother or sister (of a parent, or of a grandparent): with a partner, children, and the family log they came from
    const sibOf = s => {
      const x = person(s, seen); if (!x) return null;
      const partner = person(s.partner, seen); if (partner) x.partner = partner;
      if (typeof s.family === 'string' && UUID.test(s.family)) x.family = s.family.toLowerCase();
      x.kids = list(s.kids, MAX_KIDS, q => person(q, seen));
      return x;
    };
    const parents = list(t && t.parents, 2, p => {
      const o = person(p, seen); if (!o) return null;
      o.gp = list(p.gp, 2, g => { const x = person(g, seen); if (x) { x.gp = list(g.gp, 2, q => person(q, seen)); x.sibs = list(g.sibs, MAX_SIBS, sibOf); } return x; });
      o.sibs = list(p.sibs, MAX_SIBS, sibOf);
      return o;
    });
    return { v: 1, parents, ...(t && SPECIES[t.species] ? { species: t.species } : {}) };
  }
  /** Everyone on the tree, with where they are: kind (parent, gp, ggp, sib, partner, cousin, or a grandparent's gsib, gpartner and
      gcousin), side (the children's parent whose side of the family it is), up (who they hang from) and list (the list they are in). */
  function walk(t) {
    const out = [];
    for (const s of t.parents) {
      out.push({ p: s, kind: 'parent', side: s, up: null, list: t.parents });
      for (const g of s.gp) {
        out.push({ p: g, kind: 'gp', side: s, up: s, list: s.gp });
        for (const q of g.gp) out.push({ p: q, kind: 'ggp', side: s, up: g, list: g.gp });
        for (const b of g.sibs || []) {
          out.push({ p: b, kind: 'gsib', side: s, up: g, list: g.sibs });
          if (b.partner) out.push({ p: b.partner, kind: 'gpartner', side: s, up: b, list: null });
          for (const k of b.kids) out.push({ p: k, kind: 'gcousin', side: s, up: b, list: b.kids });
        }
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
      `at`'s parent), sib (a parent `at`'s brother or sister), partner or cousin (an aunt or uncle `at`'s), gsib (a grandparent `at`'s
      brother or sister), gpartner or gcousin (a great-aunt or great-uncle `at`'s). False when there is no room there (any more). */
  function add(t, kind, at, p) {
    if (kind === 'parent') { if (t.parents.length >= 2) return false; t.parents.push({ ...p, gp: [], sibs: [] }); return true; }
    const w = find(t, at); if (!w) return false;
    if (kind === 'gp' && w.kind === 'parent' && w.p.gp.length < 2) { w.p.gp.push({ ...p, gp: [], sibs: [] }); return true; }
    if (kind === 'ggp' && w.kind === 'gp' && w.p.gp.length < 2) { w.p.gp.push({ ...p }); return true; }
    if (kind === 'sib' && w.kind === 'parent' && w.p.sibs.length < MAX_SIBS) { w.p.sibs.push({ kids: [], ...p }); return true; }
    if (kind === 'partner' && w.kind === 'sib' && !w.p.partner) { w.p.partner = { ...p }; return true; }
    if (kind === 'cousin' && w.kind === 'sib' && w.p.kids.length < MAX_KIDS) { w.p.kids.push({ ...p }); return true; }
    if (kind === 'gsib' && w.kind === 'gp' && (w.p.sibs || (w.p.sibs = [])).length < MAX_SIBS) { w.p.sibs.push({ kids: [], ...p }); return true; }
    if (kind === 'gpartner' && w.kind === 'gsib' && !w.p.partner) { w.p.partner = { ...p }; return true; }
    if (kind === 'gcousin' && w.kind === 'gsib' && w.p.kids.length < MAX_KIDS) { w.p.kids.push({ ...p }); return true; }
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
    if (w.kind === 'partner' || w.kind === 'gpartner') delete w.up.partner; else w.list.splice(w.list.indexOf(w.p), 1);
    return true;
  }

  // ---- the picture: a soft watercolour of the family's tree ------------------------------------------------------------------
  // Each kind of tree has its bark, crown, leaves (the ones that fall), ground and two of the birds that sit in it where it grows.
  const SPECIES = {
    oak: { bark: ['#8d6c4e', '#5c4331'], crown: 'round', wash: ['#a7c588', '#86ad6a', '#64905a'], leaf: 'oak', fall: ['#b5a45e', '#c4955a', '#86ad6a'], ground: 'meadow', birds: ['robin', 'bluetit'], marks: 'gnarled' },
    maple: { bark: ['#85705f', '#584a3f'], crown: 'round', wash: ['#b3c985', '#91b06c', '#cf7f5c'], leaf: 'maple', fall: ['#d9694a', '#e89a48', '#c9473f'], ground: 'meadow', birds: ['cardinal', 'bluebird'], dabs: ['#d97352', '#e8a24f', '#c9573f'], marks: 'lines' },
    beech: { bark: ['#a7a8a0', '#76776f'], crown: 'round', wash: ['#abc98a', '#8bb16d', '#6c955a'], leaf: 'oval', fall: ['#c69a5a', '#a9b46a', '#b07a48'], ground: 'meadow', birds: ['robin', 'greattit'], marks: 'smooth' },
    birch: { bark: ['#f1ede5', '#3e3c38'], crown: 'airy', wash: ['#cbdd96', '#afcc80', '#8fb267'], leaf: 'oval', fall: ['#e3c55a', '#cbdd96', '#d9b04a'], ground: 'meadow', birds: ['bullfinch', 'greattit'], marks: 'birch' },
    olive: { bark: ['#968a72', '#695e4c'], crown: 'airy', wash: ['#bcc7a6', '#a3b08d', '#84957a'], leaf: 'slender', fall: ['#a3b08d', '#bcc7a6', '#8c9a7a'], ground: 'dry', birds: ['goldfinch', 'sparrow'], fruit: ['#5d5a3c', '#7a6a4a'], marks: 'twisted' },
    eucalyptus: { bark: ['#e8e1cf', '#a89a80'], crown: 'clumps', wash: ['#b0c7b6', '#93b29f', '#749784'], leaf: 'slender', fall: ['#93b29f', '#c9b38f', '#b0c7b6'], ground: 'dry', birds: ['rosella', 'fairywren'], marks: 'patches', patches: ['#d6c1a3', '#c3b29b', '#b9c4bd'] },
    cherry: { bark: ['#71503f', '#4a322a'], crown: 'round', wash: ['#f6d3dd', '#efbacb', '#e3a0b6'], under: '#c9d9a8', leaf: 'petal', fall: ['#f4c4d3', '#f9dde6', '#eaa9be'], ground: 'meadow', birds: ['whiteeye', 'sparrow'], blossom: ['#fbe6ec', '#f1b9ca', '#ffffff', '#e9a3b9'], marks: 'bands' },
    banyan: { bark: ['#8f7a65', '#665649'], crown: 'wide', wash: ['#98bd80', '#77a362', '#5b874d'], leaf: 'oval', fall: ['#98bd80', '#c9b25a', '#77a362'], ground: 'meadow', birds: ['parakeet', 'myna'], marks: 'lines', roots: true },
    mango: { bark: ['#806349', '#584432'], crown: 'round', wash: ['#88b36f', '#679657', '#4d7743'], leaf: 'slender', fall: ['#88b36f', '#b7a24f', '#679657'], ground: 'meadow', birds: ['sunbird', 'oriole'], fruit: ['#f2b64c', '#e99a3f'], marks: 'lines' },
    acacia: { bark: ['#8e735a', '#65513f'], crown: 'umbrella', wash: ['#bfca85', '#a3b36d', '#869856'], leaf: 'tiny', fall: ['#bfca85', '#d9c46a', '#a3b36d'], ground: 'savanna', birds: ['roller', 'weaver'], marks: 'lines' },
    jacaranda: { bark: ['#80705f', '#5a4d42'], crown: 'round', wash: ['#cfc3f0', '#b2a1e6', '#9584d6'], under: '#b8cf9a', leaf: 'petal', fall: ['#c9bbf0', '#b2a1e6', '#dcd3f7'], ground: 'meadow', birds: ['kiskadee', 'hummingbird'], blossom: ['#e4dcf8', '#b8a6ea', '#9a87da', '#f6f3fd'], marks: 'lines' },
  };
  const KINDS = Object.keys(SPECIES);
  const GROUND = { meadow: ['#cfe3b1', '#b4d495', '#f3b5c4', '#f6d77c'], dry: ['#dcdcb0', '#c6c893', '#e8cf8a', '#d9b98a'], savanna: ['#ecdba4', '#d9c37f', '#c9a95c', '#b9b36a'] };
  /** The tree most common where a family comes from: by the app's language when it tells (Japanese, Hindi, Arabic, Swahili…), else
      by where the phone is (the region chosen in More, and the time zone). */
  function speciesFor(region, lang, tz = '') {
    const l = String(lang || '').split('-')[0];
    if (['ja', 'ko', 'zh'].includes(l)) return 'cherry';
    if (['hi', 'bn', 'mr', 'ta', 'te', 'ur'].includes(l)) return 'banyan';
    if (['th', 'vi', 'id', 'fil'].includes(l)) return 'mango';
    if (['ar', 'fa', 'he'].includes(l)) return 'olive';
    if (['am', 'ha', 'sw'].includes(l)) return 'acacia';
    if (region === 'na') return 'maple';
    if (region === 'uk') return 'oak';
    if (region === 'anz') return 'eucalyptus';
    if (region === 'latam' || region === 'br') return 'jacaranda';
    if (region === 'eu') return ['it', 'es', 'pt', 'el'].includes(l) ? 'olive' : ['ru', 'uk', 'pl'].includes(l) ? 'birch' : 'beech';
    if (region === 'asia') return /Kolkata|Calcutta|Dhaka|Karachi|Colombo|Kathmandu/.test(tz) ? 'banyan' : /Bangkok|Ho_Chi_Minh|Saigon|Jakarta|Manila|Kuala_Lumpur|Singapore/.test(tz) ? 'mango' : /Dubai|Riyadh|Tehran|Jerusalem|Tel_Aviv|Baghdad|Amman|Beirut|Qatar|Kuwait|Muscat/.test(tz) ? 'olive' : 'cherry';
    if (region === 'mea') return /^Africa\//.test(tz) ? 'acacia' : 'olive';
    return 'oak';
  }
  // the birds, facing right with their feet at (0, 0): back, breast, belly, head, beak; and what marks them out
  const BIRDS = {
    robin: { back: '#8f7a5c', breast: '#e57a4c', belly: '#f2ede3', head: '#8f7a5c', beak: '#3b3530' },
    bluetit: { back: '#a3b67c', breast: '#f2d45c', belly: '#f2d45c', head: '#5b8fd1', beak: '#3b3530', cheek: '#ffffff' },
    cardinal: { back: '#c9473f', breast: '#d9554a', belly: '#d9554a', head: '#c9473f', beak: '#f0a24a', mask: '#3a2a28', crest: true },
    bluebird: { back: '#5f8fd0', breast: '#e39256', belly: '#f2ede3', head: '#5f8fd0', beak: '#3b3530' },
    greattit: { back: '#9aae74', breast: '#efd35a', belly: '#efd35a', head: '#2f2f33', beak: '#3b3530', cheek: '#ffffff' },
    bullfinch: { back: '#8f9198', breast: '#e0796c', belly: '#e0796c', head: '#2f2f33', beak: '#2f2f33' },
    goldfinch: { back: '#b38d5f', breast: '#e8d6b8', belly: '#f2ede3', head: '#f2ede3', beak: '#e8d3b0', mask: '#d9443c', bar: '#f2d04a' },
    sparrow: { back: '#9c7d5b', breast: '#cfc1aa', belly: '#e9e1d3', head: '#8f8b85', beak: '#4a4038', cheek: '#ece6dc' },
    rosella: { back: '#c9413c', breast: '#d84a43', belly: '#d84a43', head: '#c9413c', beak: '#efe6d2', cheek: '#5a8fd8', wing: '#3d6fc4', long: true },
    fairywren: { back: '#9d8266', breast: '#ebe3d6', belly: '#ebe3d6', head: '#3f8fe0', beak: '#2f2f33', up: true, small: true },
    whiteeye: { back: '#a2b85d', breast: '#d4de8c', belly: '#f0efdd', head: '#a2b85d', beak: '#3b3530', ring: '#ffffff', small: true },
    parakeet: { back: '#6fbf5a', breast: '#8fd06f', belly: '#8fd06f', head: '#6fbf5a', beak: '#d9443c', long: true },
    myna: { back: '#7c5e49', breast: '#6f5343', belly: '#ebe3d6', head: '#2f2f33', beak: '#f2c94c', ring: '#f2c94c' },
    sunbird: { back: '#8f9a4a', breast: '#f2cf3f', belly: '#f2cf3f', head: '#4a6fb0', beak: '#2f2f33', bill: true, small: true },
    oriole: { back: '#f0c23a', breast: '#f5cf48', belly: '#f5cf48', head: '#f0c23a', beak: '#e58a6b', mask: '#2f2f33', wing: '#3a3a3a' },
    roller: { back: '#6aa58c', breast: '#c49ad6', belly: '#8fc4e6', head: '#86b37a', beak: '#2f2f33', wing: '#3e7fc8', long: true },
    weaver: { back: '#d9b43c', breast: '#f2d14a', belly: '#f2d14a', head: '#f2d14a', beak: '#2f2f33', mask: '#3a2a28' },
    kiskadee: { back: '#8f7757', breast: '#f2cf48', belly: '#f2cf48', head: '#2f2f33', beak: '#2f2f33', cheek: '#ffffff' },
    hummingbird: { back: '#4fa37a', breast: '#62b88c', belly: '#dbe9d6', head: '#4fa37a', beak: '#2f2f33', bill: true, small: true },
  };
  // the shapes of their leaves (and petals), pointing up, one unit long
  const LEAVES = {
    oak: 'M0 -1C.2 -.95 .1 -.75 .28 -.7C.45 -.65 .4 -.45 .25 -.4C.45 -.35 .5 -.15 .3 -.1C.5 -.02 .45 .2 .25 .2C.3 .35 .15 .45 .05 .5L.04 .9L-.04 .9L-.05 .5C-.15 .45 -.3 .35 -.25 .2C-.45 .2 -.5 -.02 -.3 -.1C-.5 -.15 -.45 -.35 -.25 -.4C-.4 -.45 -.45 -.65 -.28 -.7C-.1 -.75 -.2 -.95 0 -1Z',
    maple: 'M0 -1L.16 -.58L.46 -.82L.38 -.38L.92 -.44L.64 -.06L.84 .26L.34 .2L.12 .46L.04 .46L.04 .95L-.04 .95L-.04 .46L-.12 .46L-.34 .2L-.84 .26L-.64 -.06L-.92 -.44L-.38 -.38L-.46 -.82L-.16 -.58Z',
    oval: 'M0 -1C.52 -.6 .52 .4 0 .9C-.52 .4 -.52 -.6 0 -1Z',
    slender: 'M0 -1C.24 -.5 .24 .5 0 1C-.24 .5 -.24 -.5 0 -1Z',
    petal: 'M0 -.72L.14 -.9C.62 -.78 .64 .18 0 .9C-.64 .18 -.62 -.78 -.14 -.9Z',
    tiny: 'M0 -.55C.32 -.55 .32 .55 0 .55C-.32 .55 -.32 -.55 0 -.55Z',
  };

  const CELL = 62, KCELL = 54, GCELL = 58, GAP = 16, RA = 17, RK = 15, RG = 14, KPR = 6, CPR = 4;
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
  const star = (sx, sy, s) => `<path class="star" d="M${r1(sx)} ${r1(sy - s)}L${r1(sx + s * 0.3)} ${r1(sy - s * 0.3)}L${r1(sx + s)} ${r1(sy)}L${r1(sx + s * 0.3)} ${r1(sy + s * 0.3)}L${r1(sx)} ${r1(sy + s)}L${r1(sx - s * 0.3)} ${r1(sy + s * 0.3)}L${r1(sx - s)} ${r1(sy)}L${r1(sx - s * 0.3)} ${r1(sy - s * 0.3)}Z"/>`;
  /** One of the tree's leaves (drawn once, in the painting's defs, and used again and again). */
  const leafOf = (lx, ly, s, a, fill, op = 1) => `<use href="#ftleaf" transform="translate(${r1(lx)} ${r1(ly)}) rotate(${Math.round(a)}) scale(${r1(s)})" fill="${fill}"${op < 1 ? ` opacity="${r1(op)}"` : ''}/>`;
  /** The same painting each time the same tree is drawn: a little random, from a seed. */
  const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hashOf = s => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
  /** A colour blended towards another (`t` of the way): the paints are a little deeper on dark paper. */
  const mixHex = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
  /** A soft, irregular blob: a ring of jittered points joined by a smooth curve. */
  function blobPath(cx, cy, rx, ry, R) {
    const n = 18, pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = 0.8 + R() * 0.36; pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    return d + 'Z';
  }
  /** A bird (see BIRDS), facing right, feet at (0, 0). */
  function birdSvg(b) {
    const wing = b.wing || mixHex(b.back, '#2a2420', 0.25), tail = b.up ? 'M-7 -11L-13 -21L-4 -12Z' : b.long ? 'M-7 -8L-21 0L-19 2L-6 -5Z' : 'M-7 -8L-15 -3L-13 -1L-6 -5Z';
    return `<path d="${tail}" fill="${wing}"/><ellipse cx="0" cy="-8.5" rx="9" ry="6.6" fill="${b.back}"/><ellipse cx="1.8" cy="-6" rx="6.4" ry="4" fill="${b.belly}"/>`
      + `<ellipse cx="4.6" cy="-9" rx="4.3" ry="4.6" fill="${b.breast}"/><circle cx="6" cy="-15" r="5" fill="${b.head}"/>`
      + (b.crest ? `<path d="M2.5 -18.5L4.5 -25L8 -19Z" fill="${b.head}"/>` : '') + (b.cheek ? `<ellipse cx="6.2" cy="-13.6" rx="2.7" ry="1.9" fill="${b.cheek}"/>` : '')
      + (b.mask ? `<ellipse cx="8.6" cy="-14.6" rx="2.6" ry="2.1" fill="${b.mask}"/>` : '') + `<path d="M-6 -10.5Q0 -13 4.5 -8.5Q-1 -4.5 -7 -7.5Z" fill="${wing}"/>`
      + (b.bar ? `<path d="M-4 -8.6L2.5 -9.6" stroke="${b.bar}" stroke-width="1.8" stroke-linecap="round"/>` : '')
      + (b.ring ? `<circle cx="7.7" cy="-16" r="2" fill="${b.ring}"/>` : '') + `<circle cx="7.7" cy="-16" r="1.1" fill="#2b2420"/>`
      + `<path d="${b.bill ? 'M10.6 -15.6L19 -14.4L10.6 -13.6Z' : 'M10.6 -16.3L15.2 -14.8L10.6 -13.4Z'}" fill="${b.beak}"/><path d="M-1 -2.6V0M2.6 -2.6V0" stroke="#6b5240" stroke-width="1.1" stroke-linecap="round"/>`;
  }

  /** The picture. The model says what to show, already in the app's language:
        { title, rtl, dark, species, edit (show the buds), text: { parent, gp, ggp, sib, gsib } (a bud's label), adds: { … } (what tapping it
          does), kids: [Node], parents: [Node & { gp: [Node & { gp: [Node], sibs: [Node & { partner, kids: [Node] }] }], sibs: [Node & { partner, kids: [Node] }] }],
          sprout: key → null, or the ms until that new part starts to grow in (below 0: it is already growing) }
      with Node = { key, label, initial, title, gone, color (a child's) }. A bud's key is +parent, +gp:<parent's key>,
      +ggp:<grandparent's key>, +sib:<parent's key> or +gsib:<grandparent's key>. It is two layers: the painting, which stays still (so its watercolour is
      painted once), and over it everyone, the buds, the birds and the falling leaves. → { html, keys (every person drawn), width,
      height, center (the trunk's x) } */
  function draw(m) {
    const P = m.parents || [], kids = m.kids || [], edit = !!m.edit, keys = [], when = {};
    const sibsOf = p => p.sibs || [], gpOf = p => p.gp || [];
    // what grows in, and when: asked from the grass up, so that the first time it grows in that order
    for (const n of [...kids, ...P, ...P.flatMap(p => sibsOf(p).flatMap(s => [s, ...(s.partner ? [s.partner] : []), ...(s.kids || [])])),
      ...P.flatMap(gpOf), ...P.flatMap(p => gpOf(p).flatMap(gpOf)), ...P.flatMap(p => gpOf(p).flatMap(g => sibsOf(g).flatMap(s => [s, ...(s.partner ? [s.partner] : []), ...(s.kids || [])])))]) { keys.push(n.key); when[n.key] = m.sprout ? m.sprout(n.key) : null; }
    const grow = (key, cls) => (when[key] == null ? `class="${cls}"` : `class="${cls} sprout" style="--d:${Math.round(when[key])}ms"`);

    // where everyone goes: x from the parents' heart (0), and a row (3 great-grandparents … 0 the children)
    const nodes = [], hearts = [], couple = P.length === 2 || (edit && P.length === 1);
    const bud = (key, kind, who) => ({ key, label: m.text[kind], title: who ? `${m.adds[kind]} · ${who}` : m.adds[kind] });
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
      // each grandparent's brothers and sisters (the great-aunts and great-uncles) beside the grandparents, further out, with their
      // partners; their children (the parents' cousins) on the parents' row under them, beyond the aunts and uncles
      const gunits = [];
      let e1 = edge + (edit && sibsOf(p).length < MAX_SIBS ? dir * (CELL + GAP) : 0), e2 = gpItems.length ? gx + dir * (gw / 2 + GAP) : e1;   // the free end of the parents' row, and of the grandparents'
      for (const it of gpItems.filter(k => k.n)) {
        for (const s of sibsOf(it.n)) {
          const kidsOf = s.kids || [], uw = Math.max(s.partner ? 2 * CELL : CELL, kidsOf.length * CELL);
          const need = Math.max(Math.abs(e1), Math.abs(e2)) + uw / 2, cx = dir * need, sx = s.partner ? cx - (dir * CELL) / 2 : cx;
          nodes.push({ n: s, x: sx, row: 2, r: RA });
          if (s.partner) { nodes.push({ n: s.partner, x: cx + (dir * CELL) / 2, row: 2, r: RA }); hearts.push({ x: cx, row: 2 }); }
          spread(kidsOf.length, CELL, cx).forEach((kx, j) => nodes.push({ n: kidsOf[j], x: kx, row: 1, r: RA, pcousin: true, from: cx }));
          gunits.push({ sx, cx, g: it });
          e1 = e2 = dir * (need + uw / 2 + GAP);
        }
      }
      for (const it of gpItems.filter(k => k.n && edit && sibsOf(k.n).length < MAX_SIBS)) { nodes.push({ bud: bud('+gsib:' + it.n.key, 'gsib', it.n.label), x: e2 + (dir * CELL) / 2, row: 2, r: RA }); e2 += dir * (CELL + GAP); }
      return { p, dir, px, units, gx, gpItems, gg, edge, gunits };
    });

    // the rows: the tree stands above the ground, and the family is its roots below it: the children just under the trunk (the newest
    // roots, not grown yet), the parents below them, the grandparents deeper, the great-grandparents deepest
    const has = r => nodes.some(n => n.row === r), Y = {};
    const subs = Math.max(1, ...nodes.filter(n => n.row === 0).map(n => (n.sub || 0) + 1));
    const ground = 236;
    Y[0] = ground + 50; let y = Y[0] + (subs - 1) * 64 + 98;
    Y[1] = y; y += 96;
    if (has(2)) { Y[2] = y; y += 90; }
    if (has(3)) { Y[3] = y; y += 84; }
    const yOf = n => (n.row === 0 ? Y[0] + (n.sub || 0) * 64 : Y[n.row]), deepest = has(3) ? Y[3] : has(2) ? Y[2] : Y[1], H = deepest + RA + 44;
    // the width it needs (at least the screen's), and where the trunk stands in it
    const xs = [...nodes.map(n => [n.x - (n.small ? GCELL : n.kid ? KCELL : CELL) / 2, n.x + (n.small ? GCELL : n.kid ? KCELL : CELL) / 2]).flat(), -150, 150];
    const lo = Math.min(...xs), hi = Math.max(...xs), W = Math.max(360, Math.ceil(hi - lo + 72)), ox = (W - (hi - lo)) / 2 - lo;
    const X = v => r1(m.rtl ? W - (v + ox) : v + ox), cx0 = X(0);
    const people = nodes.filter(n => n.n).length, tw = Math.min(36, 18 + people * 0.9);
    const kind = SPECIES[m.species] ? m.species : 'oak', sp = SPECIES[kind], dark = !!m.dark, R = rng(hashOf(`${kind}|${W}|${H}|${people}`));
    const paper = dark ? '#21252c' : '#fbf8f1', deep = c => (dark ? mixHex(c, paper, 0.3) : c);   // (on dark paper the paints are a little deeper)
    /** The point a share `t` along a curve from (ax, ay) to (bx, by). */
    const along = (ax, ay, bx, by, t) => { const my = (ay + by) / 2, u = 1 - t, a = u * u * u + 3 * u * u * t, b = 3 * u * t * t + t * t * t; return [ax * a + bx * b, ay * u * u * u + my * 3 * u * t + by * t * t * t]; };
    const branch = (ax, ay, bx, by) => { const my = (ay + by) / 2; return `M${X(ax)} ${r1(ay)}C${X(ax)} ${r1(my)} ${X(bx)} ${r1(my)} ${X(bx)} ${r1(by)}`; };

    // the crown, above the ground: it fills out as the family grows, shaped like this kind of tree
    const shape = { round: [1, 1], airy: [0.86, 0.86], clumps: [0.82, 1.04], wide: [1.28, 0.95], umbrella: [1.32, 0.64] }[sp.crown], blobs = [];
    const blob = (bx, by, rx, ry) => blobs.push([bx, by - (sp.crown === 'umbrella' ? ry * 0.25 : 0), rx * shape[0], ry * shape[1]]);
    const cW = 84 + Math.min(56, people * 4), cH = 60 + Math.min(26, people * 2), cY = ground - 138 - Math.min(24, people * 1.5);
    blob(0, cY, cW, cH); blob(-cW * 0.72, cY + 26, cW * 0.6, cH * 0.72); blob(cW * 0.74, cY + 22, cW * 0.58, cH * 0.7);
    blob(-cW * 0.3, cY - cH * 0.6, cW * 0.5, cH * 0.6); blob(cW * 0.34, cY - cH * 0.55, cW * 0.5, cH * 0.58);
    if (people > 6) { blob(-cW * 1.12, cY + 44, cW * 0.4, cH * 0.5); blob(cW * 1.14, cY + 40, cW * 0.4, cH * 0.5); }
    // ---- the painting: paper, sky, hill, crown, trunk, boughs, then the soil and the roots (still, in a layer of its own) ----
    const A = [], wash = (fill, op, d) => `<path fill="${deep(fill)}" opacity="${op}" d="${d}"/>`;
    A.push(`<rect width="${W}" height="${H}" fill="${paper}"/>`);
    // the sky: a pale wash, and the sun (or, at night, the moon and a few stars) in the corner the crown leaves free
    const sx = m.rtl ? W - 46 : 46;
    A.push(`<g filter="url(#ftsky)">${wash(dark ? '#34435a' : '#d3e6f3', dark ? 0.7 : 0.75, blobPath(W / 2, 8, W * 0.7, 80, R))}</g>`);
    if (!dark) A.push(`<g filter="url(#ftsky)" opacity=".8">${[[W * (m.rtl ? 0.3 : 0.7), 34, 34, 11], [W * (m.rtl ? 0.16 : 0.84), 58, 24, 8]].map(([a, b, rx, ry]) => wash('#ffffff', 0.95, blobPath(a, b, rx, ry, R))).join('')}</g>`);
    A.push(dark ? `<g filter="url(#ftglow)"><circle cx="${sx}" cy="46" r="25" fill="#f3e7b5" opacity=".22"/></g><path d="M${sx + 6} 33a13 13 0 0 0 0 26a6 13 0 0 1 0-26z" fill="#f6ecc4" opacity=".95"/>`
      + [[W * 0.3, 24, 1.6], [W * 0.62, 16, 1.2], [W * 0.82, 38, 1.4], [W * 0.46, 46, 1]].map(([a, b, r]) => `<circle cx="${r1(a)}" cy="${b}" r="${r}" fill="#f3e7b5" opacity=".75"/>`).join('')
      : `<g filter="url(#ftglow)"><circle cx="${sx}" cy="46" r="27" fill="#fbd88a" opacity=".55"/></g><g filter="url(#ftbrush)"><circle cx="${sx}" cy="46" r="15" fill="#f8c862" opacity=".85"/></g>`);
    // the hill the tree stands on, its flowers (or dry grass), and the soil beneath, deeper in colour the further down
    const gr = GROUND[sp.ground], hill = (f, lift, op) => wash(gr[f], op, `M-20 ${r1(ground + 6)}L-20 ${r1(ground - 4 + lift)}C${r1(W * 0.22)} ${r1(ground - 22 + lift)} ${r1(W * 0.62)} ${r1(ground - 30 + lift)} ${W + 20} ${r1(ground - 6 + lift)}L${W + 20} ${r1(ground + 6)}Z`);
    A.push(`<g class="wash" filter="url(#ftwash)">${hill(1, -10, 0.55)}${hill(0, 2, 0.8)}</g>`);
    const soil = dark ? ['#4a3f33', '#3d3328', '#33291f'] : ['#e6d8bf', '#d6c3a2', '#c6ae88'];
    A.push(`<g class="wash" filter="url(#ftwash)">${wash(soil[0], 0.75, `M-20 ${ground + 4}L${W + 20} ${ground + 4}L${W + 20} ${H + 20}L-20 ${H + 20}Z`)}${wash(soil[1], 0.55, `M-20 ${r1(Y[1] - 46)}C${r1(W * 0.3)} ${r1(Y[1] - 60)} ${r1(W * 0.7)} ${r1(Y[1] - 34)} ${W + 20} ${r1(Y[1] - 50)}L${W + 20} ${H + 20}L-20 ${H + 20}Z`)}${has(2) ? wash(soil[2], 0.45, `M-20 ${r1(Y[2] - 40)}C${r1(W * 0.35)} ${r1(Y[2] - 56)} ${r1(W * 0.7)} ${r1(Y[2] - 30)} ${W + 20} ${r1(Y[2] - 46)}L${W + 20} ${H + 20}L-20 ${H + 20}Z`) : ''}</g>`);
    A.push(`<path d="M-20 ${r1(ground + 3)}C${r1(W * 0.3)} ${r1(ground - 2)} ${r1(W * 0.7)} ${r1(ground + 6)} ${W + 20} ${r1(ground + 1)}" fill="none" stroke="${deep(dark ? '#5a4d3e' : '#a98f6c')}" stroke-width="1.6" opacity=".6" filter="url(#ftbrush)"/>`);
    const stones = [];
    for (let i = 0; i < 14; i++) { const px = R() * W, py = ground + 20 + R() * (H - ground - 40); if (nodes.every(n => Math.hypot(X(n.x) - px, yOf(n) - py) > 42)) stones.push(`<ellipse cx="${r1(px)}" cy="${r1(py)}" rx="${r1(2.5 + R() * 4)}" ry="${r1(1.6 + R() * 2.4)}" fill="${deep(dark ? '#6a5c4b' : '#b8a384')}" opacity=".55" transform="rotate(${r1((R() - 0.5) * 50)} ${r1(px)} ${r1(py)})"/>`); }
    A.push(`<g filter="url(#ftbrush)">${stones.join('')}</g>`);
    const tufts = [];
    for (let i = 0; i < 11; i++) {
      const fx = W * (0.04 + 0.92 * (i / 10)) + (R() - 0.5) * 20, fy = ground - 8 + R() * 10, c = gr[2 + (i % 2)];
      tufts.push(sp.ground === 'meadow' ? [0, 72, 144, 216, 288].map(a => `<circle cx="${r1(fx)}" cy="${r1(fy - 2.6)}" r="2.4" fill="${deep(c)}" opacity=".75" transform="rotate(${a} ${r1(fx)} ${r1(fy)})"/>`).join('') + `<circle cx="${r1(fx)}" cy="${r1(fy)}" r="1.6" fill="${deep('#f6d26b')}"/>`
        : `<path d="M${r1(fx - 5)} ${r1(fy)}q2-${sp.ground === 'savanna' ? 14 : 9} 4-1q2-${sp.ground === 'savanna' ? 16 : 10} 3 0q3-${sp.ground === 'savanna' ? 12 : 8} 5 1" fill="none" stroke="${deep(c)}" stroke-width="1.4" stroke-linecap="round"/>`);
    }
    A.push(`<g filter="url(#ftbrush)">${tufts.join('')}</g>`);

    const tufted = (cx, cy, rx, ry) => {   // a blob with smaller ones round its edge: a leafy outline
      const out = [blobPath(cx, cy, rx, ry, R)], k = sp.crown === 'umbrella' ? 0 : 5;
      for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2 + R() * 1.2, f = 0.3 + R() * 0.16; out.push(blobPath(cx + Math.cos(a) * rx * 0.86, cy + Math.sin(a) * ry * 0.8, rx * f, ry * f * 1.2, R)); }
      return out.join('');
    };
    const crown = (fill, op, dx, dy, k) => `<g class="wash" filter="url(#ftwash)"><path fill="${deep(fill)}" opacity="${op}" d="${blobs.map(([bx, by, rx, ry]) => (sp.crown === 'clumps'
      ? [-0.5, 0.05, 0.55].map((f, i) => tufted(X(bx + f * rx) + dx, by + dy + (i === 1 ? -10 : 6), rx * 0.52 * k, ry * 0.78 * k)).join('')
      : tufted(X(bx) + dx, by + dy, rx * k, ry * k))).join('')}"/></g>`;
    if (sp.under) A.push(crown(sp.under, 0.22, 0, 12, 0.85));   // (a little green under the blossom)
    A.push(crown(sp.wash[0], 0.6, 0, 0, 1));

    // the trunk (it thickens as the family grows) and the boughs into the crown: brush strokes in the bark's colours
    const T = [], tTop = ground - 92, tBot = ground + 16, w1 = tw / 2, w2 = Math.max(6, tw * 0.3), bark = deep(sp.bark[0]), line = deep(sp.bark[1]);
    T.push(`<path fill="${bark}" d="M${X(-w1 - 4)} ${tBot}C${X(-w1 * 0.6)} ${r1(tBot - 40)} ${X(-w2 - 4)} ${r1((tTop + tBot) / 2)} ${X(-w2)} ${tTop}L${X(w2)} ${tTop}C${X(w2 + 3)} ${r1((tTop + tBot) / 2)} ${X(w1 * 0.6)} ${r1(tBot - 40)} ${X(w1 + 4)} ${tBot}Z"/>`);
    const limb = (d, wdt) => `<path d="${d}" fill="none" stroke="${bark}" stroke-width="${r1(wdt)}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${line}" stroke-width="${r1(Math.max(1, wdt * 0.28))}" stroke-linecap="round" opacity=".55"/>`;
    const perches = [];   // (where birds may sit: a point on a bough)
    blobs.forEach(([bx, by, rx, ry], i) => {   // boughs fanning up from the trunk into each part of the crown, and twigs off them
      const low = i === 1 || i === 2, sy = low ? tTop + 26 : tTop + 4, ex = bx * 0.86, ey = by - ry * (low ? 0.05 : 0.25), wdt = i === 0 ? Math.max(7, tw * 0.5) : Math.max(4, tw * 0.3);
      const bow = (tTop - ey) * 0.5, d = `M${X(0)} ${r1(sy)}C${X(bx * 0.25)} ${r1(sy - bow)} ${X(ex * 0.7)} ${r1(ey + bow * 0.6)} ${X(ex)} ${r1(ey)}`;
      T.push(limb(d, wdt));
      const at = t => { const u = 1 - t; return [u * u * u * 0 + 3 * u * u * t * bx * 0.25 + 3 * u * t * t * ex * 0.7 + t * t * t * ex, u * u * u * sy + 3 * u * u * t * (sy - bow) + 3 * u * t * t * (ey + bow * 0.6) + t * t * t * ey]; };
      perches.push(at(0.45), at(0.75));
      for (let k = 0; k < 2; k++) { const [tx0, ty0] = at(0.55 + k * 0.3), dir = (bx || (k ? 1 : -1)) > 0 ? 1 : -1; T.push(limb(`M${X(tx0)} ${r1(ty0)}q${r1(dir * 10)} ${r1(-14 - k * 4)} ${r1(dir * 20)} ${r1(-30 - k * 6)}`, Math.max(2, wdt * 0.38))); }
    });
    // a low branch with leaves on it, off the trunk, to the side the sun is not
    const lx = m.rtl ? -1 : 1, ly = ground - 56;
    T.push(limb(`M${X(lx * w2 * 0.6)} ${r1(ly + 10)}Q${X(lx * (w1 + 36))} ${r1(ly + 2)} ${X(lx * (w1 + 64))} ${r1(ly - 14)}`, Math.max(3, tw * 0.22)));
    perches.push([lx * (w1 + 40), ly - 2]);
    // the bark's own marks
    const tx = f => X(f * w2), ty = f => r1(tTop + (tBot - tTop) * f);
    if (sp.marks === 'birch') for (let i = 0; i < 7; i++) { const f = 0.1 + i * 0.12, l = 3 + R() * 6, o = (R() - 0.5) * w2; T.push(`<path d="M${r1(X(0) + o - l / 2)} ${ty(f)}h${r1(l)}" stroke="${line}" stroke-width="${r1(1.4 + R() * 1.4)}" stroke-linecap="round" opacity=".8"/>`); }
    else if (sp.marks === 'patches') for (let i = 0; i < 6; i++) T.push(`<ellipse cx="${r1(X(0) + (R() - 0.5) * w2 * 1.2)}" cy="${ty(0.12 + i * 0.13)}" rx="${r1(2 + R() * 3)}" ry="${r1(4 + R() * 5)}" fill="${deep(sp.patches[i % 3])}" opacity=".7"/>`);
    else if (sp.marks === 'bands') for (let i = 0; i < 6; i++) T.push(`<path d="M${tx(-0.7)} ${ty(0.12 + i * 0.13)}h${r1(w2 * 1.3)}" stroke="${line}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>`);
    else if (sp.marks === 'twisted') T.push(`<path d="M${tx(-0.5)} ${ty(0.95)}C${tx(0.9)} ${ty(0.7)} ${tx(-0.9)} ${ty(0.4)} ${tx(0.4)} ${ty(0.05)}" fill="none" stroke="${line}" stroke-width="1.6" opacity=".55"/><ellipse cx="${tx(0.2)}" cy="${ty(0.5)}" rx="2.5" ry="3.5" fill="${line}" opacity=".6"/>`);
    else if (sp.marks !== 'smooth') T.push(`<path d="M${tx(-0.45)} ${ty(0.92)}C${tx(-0.2)} ${ty(0.6)} ${tx(-0.6)} ${ty(0.35)} ${tx(-0.3)} ${ty(0.08)}M${tx(0.4)} ${ty(0.85)}C${tx(0.6)} ${ty(0.55)} ${tx(0.25)} ${ty(0.3)} ${tx(0.45)} ${ty(0.06)}" fill="none" stroke="${line}" stroke-width="1.3" opacity=".5"/>`
      + (sp.marks === 'gnarled' ? `<ellipse cx="${tx(0.25)}" cy="${ty(0.38)}" rx="3" ry="4.4" fill="${line}" opacity=".7"/>` : ''));
    T.push(`<path d="${heart(X(-w2 * 0.15), tTop + (tBot - tTop) * 0.62, 4)}" fill="none" stroke="${line}" stroke-width="1.2" opacity=".6"/>`);   // (initials of love, carved long ago)
    if (sp.roots) for (const off of [-1, 1]) T.push(`<path d="M${X(off * cW * 0.5)} ${r1(cY + cH * 0.7)}C${X(off * (cW * 0.5 + 6))} ${r1(ground - 60)} ${X(off * (cW * 0.5 - 8))} ${r1(ground - 20)} ${X(off * (cW * 0.52))} ${r1(ground + 2)}" fill="none" stroke="${bark}" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>`);   // (a banyan's hanging roots)
    A.push(`<g filter="url(#ftbrush)">${T.join('')}</g>`);
    // more washes over the boughs, lit from the sun's side; then leaves, and the tree's own touches: blossom, fruit, autumn
    const lit = m.rtl ? 6 : -6;
    A.push(crown(sp.wash[1], sp.blossom ? 0.34 : 0.42, lit, -8, 0.8), crown(sp.wash[2], sp.blossom ? 0.18 : 0.28, -lit, 10, 0.64));
    A.push(`<g filter="url(#ftwash)">${blobs.map(([bx, by, rx, ry]) => wash(paper, dark ? 0.12 : 0.3, blobPath(X(bx - rx * 0.3), by - ry * 0.3, rx * 0.22, ry * 0.2, R))).join('')}</g>`);   // (blooms, where the water spread)
    const dabs = [];
    for (const [bx, by, rx, ry] of blobs) {
      const n = Math.round((rx * ry) / 150);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.94, lx2 = X(bx + Math.cos(a) * rx * d), ly2 = by + Math.sin(a) * ry * d, pick = R();
        if (sp.blossom && pick < 0.72) dabs.push(`<circle cx="${r1(lx2)}" cy="${r1(ly2)}" r="${r1(1.8 + R() * 2.6)}" fill="${deep(sp.blossom[Math.floor(R() * sp.blossom.length)])}" opacity="${r1(0.55 + R() * 0.4)}"/>`);
        else if (sp.dabs && pick < 0.32) dabs.push(`<circle cx="${r1(lx2)}" cy="${r1(ly2)}" r="${r1(2.4 + R() * 3)}" fill="${deep(sp.dabs[Math.floor(R() * sp.dabs.length)])}" opacity=".6"/>`);
        else dabs.push(leafOf(lx2, ly2, 4 + R() * 3, R() * 360, deep(sp.wash[2 - (i % 2)]), 0.5));
      }
      if (sp.fruit) for (let i = 0; i < 3; i++) { const fx = X(bx + (R() - 0.5) * rx), fy = by + ry * (0.25 + R() * 0.3); dabs.push(`<ellipse cx="${r1(fx)}" cy="${r1(fy)}" rx="${kind === 'mango' ? 3.4 : 2}" ry="${kind === 'mango' ? 4.6 : 2}" fill="${deep(sp.fruit)}" opacity=".85"/>`); }
    }
    for (let i = 0; i < 5; i++) dabs.push(leafOf(X(lx * (w1 + 24 + i * 9)), ly - 2 - (i % 2) * 6 - i * 2.4, 5 + R() * 2, (lx > 0 ? 300 : 60) + R() * 50, deep(sp.wash[1 + (i % 2)]), 0.8));   // (leaves on the low branch)
    A.push(`<g filter="url(#ftbrush)">${dabs.join('')}</g>`);
    // the roots: from the foot of the trunk to each parent, on down to the grandparents and great-grandparents; brothers and
    // sisters as side roots off the same root; the children as the newest root tips, just under the trunk
    const RT = [], rootStroke = (d, wdt, op = 1) => `<path d="${d}" fill="none" stroke="${bark}" stroke-width="${r1(wdt)}" stroke-linecap="round" opacity="${op}"/><path d="${d}" fill="none" stroke="${line}" stroke-width="${r1(Math.max(0.8, wdt * 0.25))}" stroke-linecap="round" opacity=".45"/>`;
    for (const s of sides) {
      RT.push(rootStroke(branch(Math.sign(s.px || s.dir) * w2 * 0.5, tBot - 4, s.px, Y[1] - RA), Math.max(6, tw * 0.42)));
      const target = s.gpItems.length ? [s.gx, Y[2] - RA - 2] : null;
      if (target) {   // on down to the grandparents, and up again to each brother and sister
        RT.push(rootStroke(branch(s.px, Y[1] + RA, target[0], target[1]), Math.max(5, tw * 0.3)));
        for (const u of s.units) RT.push(rootStroke(branch(target[0], target[1], u.sx, Y[1] + RA), Math.max(3, tw * 0.2)));
      } else for (const u of s.units) RT.push(rootStroke(`M${X(s.px)} ${Y[1] + RA}Q${X((s.px + u.sx) / 2)} ${r1(Y[1] + RA + 44)} ${X(u.sx)} ${Y[1] + RA}`, Math.max(3, tw * 0.2)));   // (no grandparents yet: a side root)
      for (const u of s.gg) RT.push(rootStroke(branch(u.gx, Y[2] + RA, u.cx, Y[3] - RG - 2), 2.6));
      for (const u of s.gunits) {   // a grandparent's brothers and sisters: off their parents' root when it is there, else a side root from the grandparent
        const gg = s.gg.find(v => v.gx === u.g.x);
        if (gg) RT.push(rootStroke(branch(gg.cx, Y[3] - RG - 2, u.sx, Y[2] + RA), 2.6));
        else RT.push(rootStroke(`M${X(u.g.x)} ${Y[2] + RA}Q${X((u.g.x + u.sx) / 2)} ${r1(Y[2] + RA + 40)} ${X(u.sx)} ${Y[2] + RA}`, 2.6));
      }
    }
    if (!sides.length) RT.push(rootStroke(branch(0, tBot - 4, 0, Y[1] - RA), Math.max(6, tw * 0.42), 0.5));
    for (const n of nodes.filter(k => k.home)) RT.push(rootStroke(branch(Math.sign(n.x || 1) * w2 * 0.3, tBot - 6, n.x, yOf(n) - RK - 2), 2.4, 0.9));   // (the children: new root tips)
    for (const n of nodes.filter(k => k.pcousin)) RT.push(rootStroke(`M${X(n.from)} ${Y[2] - RA}C${X(n.from)} ${r1(Y[2] - 48)} ${X(n.x)} ${r1(Y[1] + 48)} ${X(n.x)} ${r1(Y[1] + RA + 2)}`, 2));   // (the parents' cousins: from their parents)
    for (const n of nodes.filter(k => k.cousin)) RT.push(rootStroke(`M${X(n.from)} ${Y[1] - RA}C${X(n.from)} ${r1(Y[1] - 50)} ${X(n.x)} ${r1(yOf(n) + 50)} ${X(n.x)} ${r1(yOf(n) + RK + 2)}`, 2));   // (cousins: from their parents)
    for (let i = 0; i < 6; i++) { const rx0 = (R() - 0.5) * 60, ry0 = tBot + 6 + R() * 30; RT.push(`<path d="M${X(rx0 * 0.4)} ${r1(tBot - 4)}Q${X(rx0 * 0.8)} ${r1(ry0 - 10)} ${X(rx0)} ${r1(ry0)}" fill="none" stroke="${bark}" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>`); }   // (fine hair roots at the foot)
    A.push(`<g filter="url(#ftbrush)">${RT.join('')}</g>`);
    // and the paper's grain over all of it
    A.push(`<rect width="${W}" height="${H}" filter="url(#ftgrain)" opacity="${dark ? 0.35 : 0.5}"/>`);
    const defs = `<defs><path id="ftleaf" d="${LEAVES[sp.leaf]}"/><filter id="ftwash" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="3" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feGaussianBlur in="d" stdDeviation="1.3" result="b"/><feMorphology in="b" operator="erode" radius="2" result="e"/><feComposite in="b" in2="e" operator="out" result="rim"/>
      <feColorMatrix in="rim" type="matrix" values=".72 0 0 0 0 0 .72 0 0 0 0 0 .72 0 0 0 0 0 .55 0" result="edge"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="9" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -.6 1.08" result="ga"/>
      <feComposite in="b" in2="ga" operator="in" result="grain"/><feMerge><feMergeNode in="grain"/><feMergeNode in="edge"/></feMerge></filter>
      <filter id="ftbrush" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/></filter>
      <filter id="ftglow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="ftsky" x="-20%" y="-40%" width="140%" height="180%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="6" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G"/></filter>
      <filter id="ftgrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="1" result="n"/>
      <feColorMatrix in="n" type="matrix" values="${dark ? '0 0 0 0 .9 0 0 0 0 .9 0 0 0 0 .95 0 0 0 -1.6 .9' : '0 0 0 0 .42 0 0 0 0 .36 0 0 0 0 .28 0 0 0 -1.5 .82'}"/></filter></defs>`;

    // ---- over it: hearts, birds, everyone, the buds, and leaves falling ----
    const B = [];
    B.push(`<g class="hearts">${hearts.map(h => `<path class="heart${h.faint ? ' faint' : ''}" d="${heart(X(h.x), Y[h.row] + 1, h.big ? 8 : h.small ? 5 : 6.5)}"/>`).join('')}</g>`);
    // birds of this place on the boughs, well apart (one at least)
    const seats = [];
    for (const p of perches) if (p[1] < ground - 30 && seats.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 70) && seats.length < 3) seats.push(p);
    if (!seats.length) seats.push([lx * (w1 + 40), ly - 2]);
    seats.forEach(([bx, by], i) => {
      const b = BIRDS[sp.birds[i % 2]], face = (bx < 0) !== !!m.rtl ? 1 : -1;   // (facing the trunk)
      B.push(`<g transform="translate(${X(bx)} ${r1(by + 2)}) scale(${face * (b.small ? 0.82 : 1)} ${b.small ? 0.82 : 1})"><g class="ftbird b${i}">${birdSvg(b)}</g></g>`);
    });
    // everyone, and the buds where someone can be added
    const person = n => {
      const px = X(n.x), py = r1(yOf(n)), r = n.r, d = n.n, label = cut(d.label, n.small ? 10 : 12), ring = n.kid ? (d.color ? mixHex(d.color, '#2a2420', 0.3) : '#888') : deep(sp.bark[0]);
      return `<g ${grow(d.key, `tnode${n.kid ? ' kid' : ''}${n.small ? ' small' : ''}${d.gone ? ' gone' : ''}`)} role="button" tabindex="0" data-tk="${x(d.key)}" aria-label="${x(d.title)}">`
        + `<circle class="hit" cx="${px}" cy="${r1(py + 6)}" r="${r + 10}"/>${n.kid && d.color ? `<circle class="bleed" cx="${r1(px + 1.2)}" cy="${r1(py + 0.8)}" r="${r + 2}" style="fill:${x(d.color)}"/>` : ''}`
        + `<circle class="disc" cx="${px}" cy="${py}" r="${r}"${n.kid && d.color ? ` style="fill:${x(d.color)}"` : ''}/><circle class="ring" cx="${r1(px + 0.6)}" cy="${r1(py - 0.5)}" r="${r1(r + 0.6)}" stroke="${ring}"/>`
        + `<text x="${px}" y="${r1(py + (n.small ? 4 : 5))}" class="fti">${x(d.initial)}</text>${d.gone ? star(px - r * 0.8, py - r * 0.8, n.small ? 3.4 : 4) : ''}`
        + `<text x="${px}" y="${r1(py + r + 13)}" class="ftl">${x(label)}</text></g>`;
    };
    const budNode = n => {
      const px = X(n.x), py = r1(yOf(n)), r = n.r, b = n.bud;
      return `<g class="tbud${n.small ? ' small' : ''}" role="button" tabindex="0" data-tk="${x(b.key)}" aria-label="${x(b.title)}"><circle class="hit" cx="${px}" cy="${r1(py + 6)}" r="${r + 10}"/>`
        + `<circle class="disc" cx="${px}" cy="${py}" r="${r - 1}"/><path class="plus" d="M${px - 5} ${py}h10M${px} ${py - 5}v10"/>${n.small ? '' : `<text x="${px}" y="${r1(py + r + 12)}" class="ftl">${lines(b.label, 11).map((l, i) => `<tspan x="${px}" dy="${i ? 11 : 0}">${x(l)}</tspan>`).join('')}</text>`}</g>`;
    };
    B.push(`<g class="people">${nodes.filter(n => n.bud).map(budNode).join('')}${nodes.filter(n => n.n).map(person).join('')}</g>`);
    // its own leaves (or petals) falling from the crown
    const falls = blobs.slice(0, 4).map(([bx, by, rx], i) => {
      const fx = X(bx + (i % 2 ? 0.4 : -0.45) * rx), fy = r1(by - 8);
      return `<g class="ftfall" style="--fd:${i * 3.1}s;--fdur:${10 + i * 1.7}s;transform-origin:${fx}px ${fy}px">${leafOf(fx, fy, 6.5, 20 + i * 70, deep(sp.fall[i % sp.fall.length]), 0.9)}</g>`;
    });
    B.push(`<g class="fallen" aria-hidden="true">${falls.join('')}</g>`);
    const box = `viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"`;
    return { html: `<div class="ftstage" style="width:max(100%, ${Math.round(W * (m.scale || 0.9))}px)"><svg class="ftpaint" ${box} aria-hidden="true" focusable="false">${defs}${A.join('')}</svg>`
      + `<svg class="ftreesvg${dark ? ' dark' : ''}" ${box} role="group" aria-label="${x(m.title || '')}">${B.join('')}</svg></div>`, keys, width: W, height: H, center: cx0, species: kind };
  }
  /** A kind of tree's colours, for a little swatch: its crown (or blossom) and its bark. */
  const look = kind => { const k = SPECIES[kind] || SPECIES.oak; return { crown: k.blossom ? k.blossom[1] : k.wash[1], bark: k.bark[0] }; };
  return { clean, walk, find, add, update, remove, draw, newId, speciesFor, look, KINDS, MAX_SIBS, MAX_KIDS };
})();
