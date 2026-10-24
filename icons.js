'use strict';
/* Soft watercolour icons, drawn as inline SVG. Each icon is a pale "wash" (a blob of colour with wobbly, bled edges) with a firmer
   outline on top, so it stays easy to see. Colour comes from CSS (`color`), so every icon follows the page's palette.
   `Icons.paint(root)` swaps the emoji that the screens are written with for these icons (text nodes only, never attributes or
   form fields), so the rest of the app doesn't need to know about them. */
const Icons = (() => {
  // [wash shapes, outline strokes] on a 32×32 grid. Outline "dots" are zero-length round-capped strokes.
  const D = {
    feed:    ['<rect x="11" y="13" width="10" height="15" rx="3"/><path d="M13.5 13v-3a2.5 2.5 0 0 1 5 0v3z"/>', '<path d="M11 13h10M13.5 13v-2.8a2.5 2.5 0 0 1 5 0V13M16 5v2.4M11 16.5v9a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-9M11 21h3.5M11 25h3.5"/>'],
    diaper:  ['<path d="M16 5c4.2 5.6 7.5 9.2 7.5 13.2a7.5 7.5 0 0 1-15 0C8.5 14.200 11.800 10.600 16 5z"/>', '<path d="M16 5c4.2 5.6 7.5 9.2 7.5 13.2a7.5 7.5 0 0 1-15 0C8.5 14.200 11.800 10.600 16 5zM12.600 19.500a3.600 3.600 0 0 0 3 3.300"/>'],
    sleep:   ['<path d="M22 21A9.500 9.500 0 0 1 11 7.500 9.500 9.500 0 1 0 22 21z"/>', '<path d="M22 21A9.500 9.500 0 0 1 11 7.500 9.500 9.500 0 1 0 22 21zM21 6h4.500l-4.500 5h4.500"/>'],
    wake:    ['<path d="M14 5c.9 6 2.700 7.800 8.700 8.700C16.700 14.600 14.900 16.400 14 22.400c-.9-6-2.700-7.800-8.700-8.700C11.300 12.800 13.100 11 14 5z"/>', '<path d="M14 5c.9 6 2.700 7.800 8.700 8.700C16.700 14.600 14.900 16.400 14 22.400c-.9-6-2.700-7.800-8.700-8.700C11.300 12.800 13.100 11 14 5zM25 20c.5 2.700 1.300 3.500 4 4-2.700.5-3.500 1.300-4 4-.5-2.700-1.300-3.500-4-4 2.700-.5 3.500-1.300 4-4z"/>'],
    vomit:   ['<path d="M7 15h18l-2 10.500a3 3 0 0 1-3 2.500h-8a3 3 0 0 1-3-2.500z"/>', '<path d="M7 15h18l-2 10.500a3 3 0 0 1-3 2.500h-8a3 3 0 0 1-3-2.500zM10 10.500c1.700-2.200 3.300-2.200 5 0s3.300 2.200 5 0M13 5.500c1-1.300 2-1.300 3 0"/>'],
    play:    ['<circle cx="16" cy="17.500" r="9"/><circle cx="8.500" cy="9.500" r="3.500"/><circle cx="23.500" cy="9.500" r="3.500"/>', '<path d="M7.500 12.500a9 9 0 1 0 17 0M6 8.600a3.500 3.500 0 0 1 5.300-.9M26 8.600a3.500 3.500 0 0 0-5.300-.9M12.500 16.500h.01M19.500 16.500h.01M14.500 21c.8.9 2.200.9 3 0"/>'],
    health:  ['<path d="M16 27S5.500 20.500 5.500 12.800A5.800 5.800 0 0 1 16 9.500a5.800 5.800 0 0 1 10.500 3.300C26.500 20.500 16 27 16 27z"/>', '<path d="M16 27S5.500 20.500 5.500 12.800A5.800 5.800 0 0 1 16 9.500a5.800 5.800 0 0 1 10.500 3.300C26.500 20.500 16 27 16 27zM16 14v7M12.500 17.500h7"/>'],
    med:     ['<g transform="rotate(-45 16 16)"><rect x="5" y="10.500" width="22" height="11" rx="5.500"/></g>', '<g transform="rotate(-45 16 16)"><rect x="5" y="10.500" width="22" height="11" rx="5.500"/><path d="M16 10.500v11"/></g>'],
    poo:     ['<path d="M9 26c-2.200 0-3.500-1.600-3.500-3.500S6.800 19 9 19h14c2.200 0 3.500 1.600 3.500 3.500S25.200 26 23 26z"/><path d="M11 19c-1.700 0-2.800-1.300-2.800-2.800S9.300 13.500 11 13.500h10c1.700 0 2.800 1.300 2.800 2.800S22.700 19 21 19z"/>', '<path d="M9 26c-2.200 0-3.500-1.600-3.500-3.500S6.800 19 9 19h14c2.200 0 3.500 1.600 3.500 3.500S25.200 26 23 26zM11 19c-1.700 0-2.800-1.300-2.800-2.800S9.300 13.500 11 13.500h10c1.700 0 2.800 1.300 2.800 2.800S22.700 19 21 19zM14 13.500c-1.200 0-2-.9-2-2 0-1.600 1.700-2.700 3.200-5 .6 2 3.300 2.700 3.300 5 0 1.100-.8 2-2 2"/>'],
    day:     ['<circle cx="16" cy="16" r="6.500"/>', '<circle cx="16" cy="16" r="6.500"/><path d="M16 4v3M16 25v3M4 16h3M25 16h3M7.500 7.500l2 2M22.500 22.500l2 2M24.500 7.500l-2 2M9.500 22.500l-2 2"/>'],
    month:   ['<rect x="5" y="7" width="22" height="20" rx="4"/>', '<rect x="5" y="7" width="22" height="20" rx="4"/><path d="M5 13h22M11 4v5M21 4v5M11.500 18.500h.01M16 18.500h.01M20.500 18.500h.01M11.500 22.500h.01M16 22.500h.01"/>'],
    stats:   ['<rect x="5" y="16" width="5.500" height="11" rx="2"/><rect x="13.300" y="7" width="5.500" height="20" rx="2"/><rect x="21.500" y="12" width="5.500" height="15" rx="2"/>', '<rect x="5" y="16" width="5.500" height="11" rx="2"/><rect x="13.300" y="7" width="5.500" height="20" rx="2"/><rect x="21.500" y="12" width="5.500" height="15" rx="2"/>'],
    family:  ['<circle cx="11" cy="11" r="4.500"/><circle cx="22" cy="13" r="3.500"/><path d="M3.500 26c0-4.500 3.400-7.500 7.500-7.500s7.500 3 7.500 7.500zM18 26c0-3.600 2.200-6 5-6s5.500 2.400 5.500 6z"/>', '<circle cx="11" cy="11" r="4.500"/><path d="M3.500 26c0-4.500 3.400-7.500 7.500-7.500s7.500 3 7.500 7.500zM19.500 9.700a3.500 3.500 0 1 1 1.500 6.200M21 19.500c3.700-.3 7 2 7 6.500h-6"/>'],
    more:    ['<circle cx="16" cy="16" r="11"/>', '<circle cx="16" cy="16" r="11"/><path d="M10.500 16h.01M16 16h.01M21.500 16h.01" stroke-width="3"/>'],
    lock:    ['<rect x="7" y="14" width="18" height="13" rx="4"/>', '<rect x="7" y="14" width="18" height="13" rx="4"/><path d="M11 14v-3.500a5 5 0 0 1 10 0V14M16 19.500v3"/>'],
    key:     ['<circle cx="11" cy="16" r="6.500"/>', '<circle cx="11" cy="16" r="6.500"/><path d="M17.500 16H28M24 16v4M28 16v3M9 16h.01"/>'],
    camera:  ['<rect x="4" y="9" width="24" height="17" rx="4.500"/>', '<rect x="4" y="9" width="24" height="17" rx="4.500"/><circle cx="16" cy="17.500" r="5"/><path d="M11.500 9l1.500-3h6l1.500 3"/>'],
    link:    ['<rect x="3" y="11" width="14" height="10" rx="5"/><rect x="15" y="11" width="14" height="10" rx="5"/>', '<path d="M13.500 11H9a5 5 0 0 0 0 10h4.500M18.500 11H23a5 5 0 0 1 0 10h-4.500M11.500 16h9"/>'],
    baby:    ['<circle cx="16" cy="16" r="11"/>', '<circle cx="16" cy="16" r="11"/><path d="M11.500 15.500h.01M20.500 15.500h.01M13.500 20c1.500 1.400 3.500 1.400 5 0M16 5c-1.800-1.600-.500-3.200 1.500-2.500"/>'],
    mail:    ['<rect x="4" y="8" width="24" height="17" rx="4"/>', '<rect x="4" y="8" width="24" height="17" rx="4"/><path d="M5 11l11 8 11-8"/>'],
    warn:    ['<path d="M16 5.500l11.500 20h-23z"/>', '<path d="M16 5.500l11.500 20h-23zM16 13v6M16 22.300h.01"/>'],
    check:   ['<circle cx="16" cy="16" r="11.500"/>', '<circle cx="16" cy="16" r="11.500"/><path d="M10.500 16.500l4 4 7-8"/>'],
    clock:   ['<circle cx="16" cy="16" r="11.500"/>', '<circle cx="16" cy="16" r="11.500"/><path d="M16 9v7.500l4.500 3"/>'],
    offline: ['<circle cx="16" cy="16" r="11.500"/>', '<circle cx="16" cy="16" r="11.500"/><path d="M8 8l16 16M11 13.500a8 8 0 0 1 3-1.700M20 13.500a8 8 0 0 0-1.800-1.500M13 18a4.500 4.500 0 0 1 2-1.200M16 22h.01"/>'],
    phone:   ['<path d="M9 5h4l2 6-3 2a14 14 0 0 0 7 7l2-3 6 2v4a3 3 0 0 1-3 3A20 20 0 0 1 6 8a3 3 0 0 1 3-3z"/>', '<path d="M9 5h4l2 6-3 2a14 14 0 0 0 7 7l2-3 6 2v4a3 3 0 0 1-3 3A20 20 0 0 1 6 8a3 3 0 0 1 3-3z"/>'],
    guide:   ['<path d="M4 8c4-2 8-2 12 1 4-3 8-3 12-1v17c-4-2-8-2-12 1-4-3-8-3-12-1z"/>', '<path d="M4 8c4-2 8-2 12 1 4-3 8-3 12-1v17c-4-2-8-2-12 1-4-3-8-3-12-1zM16 9v17M8 13c1.700-.5 3.300-.5 5 .3M8 17.500c1.700-.5 3.300-.5 5 .3M19 13.300c1.700-.8 3.300-.8 5-.3"/>'],
    star:    ['<path d="M16 4.500l3.400 7 7.600 1.100-5.500 5.300 1.300 7.600L16 21.900l-6.800 3.600 1.300-7.600L5 12.600l7.600-1.100z"/>', '<path d="M16 4.500l3.400 7 7.600 1.100-5.500 5.300 1.300 7.600L16 21.900l-6.800 3.600 1.300-7.600L5 12.600l7.600-1.100z"/>'],
    palette: ['<path d="M16 5C9 5 4 10 4 16c0 6 5 11 11 11 2 0 3-1 3-2.500 0-1.500-1-2-1-3.500 0-1.500 1-2.500 2.500-2.500H23c3 0 5-2 5-5C28 8.500 22.500 5 16 5z"/>', '<path d="M16 5C9 5 4 10 4 16c0 6 5 11 11 11 2 0 3-1 3-2.500 0-1.500-1-2-1-3.500 0-1.500 1-2.500 2.500-2.500H23c3 0 5-2 5-5C28 8.500 22.500 5 16 5z"/><circle cx="10.500" cy="15" r="1.600"/><circle cx="13" cy="10" r="1.600"/><circle cx="19" cy="9.500" r="1.600"/><circle cx="23.500" cy="13" r="1.600"/>'],
    cloud:   ['<path d="M9 25a5.500 5.500 0 0 1-.5-11A7.500 7.500 0 0 1 23 12.500 6.300 6.300 0 0 1 23 25z"/>', '<path d="M9 25a5.500 5.500 0 0 1-.5-11A7.500 7.500 0 0 1 23 12.500 6.300 6.300 0 0 1 23 25z"/>'],
  };
  // emoji (without the optional variation selector) → icon name
  const MAP = { '🍼': 'feed', '💧': 'diaper', '😴': 'sleep', '🌙': 'wake', '🤮': 'vomit', '🧸': 'play', '🩺': 'health', '💊': 'med', '💩': 'poo',
    '📅': 'day', '🗓': 'month', '📊': 'stats', '👨‍👩‍👧': 'family', '⚙': 'more', '🔒': 'lock', '🔐': 'lock', '🔑': 'key', '📷': 'camera', '🔗': 'link',
    '👶': 'baby', '📨': 'mail', '⚠': 'warn', '✅': 'check', '⏳': 'clock', '📴': 'offline', '☁': 'cloud', '📞': 'phone', '📖': 'guide', '🌟': 'star', '🎨': 'palette' };
  const RE = new RegExp(Object.keys(MAP).sort((a, b) => b.length - a.length).join('|') + '(?:\\uFE0F)?', 'gu');
  const bare = s => s.replace(/️/g, '');
  /** The icon as an SVG string. `size` is in px (default: 1.15em, so it sits in text). */
  function svg(name, size) {
    const d = D[name]; if (!d) return '';
    const sz = size ? ` width="${size}" height="${size}"` : '';
    return `<svg class="ic" data-n="${name}" viewBox="0 0 32 32"${sz} aria-hidden="true" focusable="false"><g class="wash">${d[0]}</g><g class="ln">${d[1]}</g></svg>`;
  }
  const SKIP = new Set(['TEXTAREA', 'OPTION', 'SCRIPT', 'STYLE', 'TITLE', 'INPUT', 'SVG', 'svg']);
  /** Replace the known emoji in the text of `root` with icons. */
  function paint(root) {
    root = root || document.body; if (!root) return;
    const hits = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentNode && !SKIP.has(n.parentNode.nodeName) && RE.test(n.nodeValue) ? (RE.lastIndex = 0, NodeFilter.FILTER_ACCEPT) : (RE.lastIndex = 0, NodeFilter.FILTER_REJECT)) });
    for (let n = w.nextNode(); n; n = w.nextNode()) hits.push(n);
    for (const n of hits) {
      const frag = document.createDocumentFragment(); let last = 0; const s = n.nodeValue;
      for (const m of s.matchAll(RE)) {
        if (m.index > last) frag.append(s.slice(last, m.index));
        const t = document.createElement('template'); t.innerHTML = svg(MAP[bare(m[0])]); frag.append(t.content); last = m.index + m[0].length;
      }
      if (last < s.length) frag.append(s.slice(last));
      n.replaceWith(frag);
    }
  }
  /** The wobbly-edge filter that gives the washes their watercolour look (referenced from style.css). */
  function init() {
    if (document.getElementById('wcDefs')) return;
    const d = document.createElement('div');
    d.innerHTML = '<svg id="wcDefs" width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="wc" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="0.45"/></filter></svg>';
    document.body.prepend(d.firstChild);
  }
  return { svg, paint, init, names: Object.keys(D) };
})();
