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
    meal:    ['<circle cx="16" cy="16.500" r="7.500"/>', '<circle cx="16" cy="16.500" r="7.500"/><circle cx="16" cy="16.500" r="4.200"/><path d="M3.800 6v6a2 2 0 0 0 4 0V6M5.800 6v21M27.500 6c-2 1.500-2.700 4.500-2.700 8.500h2.700V27"/>'],
    potty:   ['<path d="M7 15h18v3a7.500 7.500 0 0 1-7.500 7.500h-3A7.500 7.500 0 0 1 7 18z"/><rect x="18.500" y="6" width="6.500" height="9" rx="2.500"/>', '<path d="M5.500 15h21M7 15v3a7.500 7.500 0 0 0 7.500 7.500h3A7.500 7.500 0 0 0 25 18v-3M18.500 15V8.500A2.500 2.500 0 0 1 21 6h1.500A2.500 2.500 0 0 1 25 8.500V15M11.500 25.500L10 28h12l-1.500-2.500"/>'],
    vaccine: ['<g transform="rotate(-45 16 16)"><rect x="8" y="12.500" width="13" height="7" rx="1.500"/></g>', '<g transform="rotate(-45 16 16)"><rect x="8" y="12.500" width="13" height="7" rx="1.500"/><path d="M21 16h7M4 16h4M4 13v6M11.500 12.500v3M14.500 12.500v3M17.500 12.500v3"/></g>'],
    clinic:  ['<path d="M6 27V11l10-5 10 5v16z"/>', '<path d="M4.500 12L16 6l11.500 6M6.500 11v16h19V11M16 12.500v7M12.500 16h7M13.500 27v-4h5v4"/>'],
    school:  ['<path d="M6.500 27V14.500L16 9l9.500 5.500V27z"/>', '<path d="M4.500 15.500L16 8.800l11.500 6.700M6.500 14.300V27h19V14.300M13.500 27v-5.500h5V27M16 8.800V4h4.500v2.800H16M16 13.200a2.300 2.300 0 1 1 0 4.600a2.300 2.300 0 1 1 0-4.600"/>'],
    bag:     ['<rect x="8" y="10" width="16" height="17.500" rx="4.500"/>', '<rect x="8" y="10" width="16" height="17.500" rx="4.500"/><path d="M12.500 10V8.200a3.500 3.500 0 0 1 7 0V10M11.500 18.500h9v5.500h-9zM16 18.500v2"/>'],
    books:   ['<path d="M5.500 8h6v19h-6zM12.500 8h6v19h-6z"/><path d="M20.200 9.300l5-1.400 4.300 17.400-5 1.400z"/>', '<path d="M5.500 8h6v19h-6zM12.500 8h6v19h-6zM20.200 9.300l5-1.400 4.300 17.400-5 1.400zM5.500 12h6M12.500 12h6M5.500 23h6M12.500 23h6M21.200 13.200l5-1.300M23.700 23.400l5-1.300"/>'],
    ruler:   ['<g transform="rotate(-45 16 16)"><rect x="3" y="11.500" width="26" height="9" rx="2"/></g>', '<g transform="rotate(-45 16 16)"><rect x="3" y="11.500" width="26" height="9" rx="2"/><path d="M7.500 11.500V15M11.500 11.500v2.300M15.500 11.500V15M19.500 11.500v2.300M23.500 11.500V15"/></g>'],
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
    theme:   ['<circle cx="16" cy="16" r="11"/>', '<circle cx="16" cy="16" r="11"/><path d="M16 5a11 11 0 0 1 0 22z" fill="currentColor" stroke="none" fill-opacity=".55"/>'],
    cloud:   ['<path d="M9 25a5.500 5.500 0 0 1-.5-11A7.500 7.500 0 0 1 23 12.500 6.300 6.300 0 0 1 23 25z"/>', '<path d="M9 25a5.500 5.500 0 0 1-.5-11A7.500 7.500 0 0 1 23 12.500 6.300 6.300 0 0 1 23 25z"/>'],
    leaf:    ['<path d="M6 26C6 14 13.500 6 27 5c0 13.500-8 21-21 21z"/>', '<path d="M6 26C6 14 13.500 6 27 5c0 13.500-8 21-21 21zM6 26L21 11M13 19l-1-5M17 15l-1-5M15 17l5 1M19 13l5 1"/>'],
    car:     ['<path d="M4 22v-4.500l3.500-1.200 3.200-5h10.600l4 5 3 1.200V22z"/>', '<path d="M4.500 22h2.500M12 22h8M25 22h2.500v-4.500l-3-1.200-4-5H10.700l-3.200 5L4 17.500V22M10 16.300h15M16.300 11.300v5"/><circle cx="9.500" cy="22.500" r="2.500"/><circle cx="22.500" cy="22.500" r="2.500"/>'],
    plane:   ['<path d="M16 3c1.400 0 2 1.600 2 3.200V12l9 5.200v3l-9-2.600v5.800l3 2.200v2.600l-5-1.500-5 1.500v-2.600l3-2.200v-5.800l-9 2.600v-3l9-5.200V6.200C14 4.600 14.600 3 16 3z"/>', '<path d="M16 3c1.400 0 2 1.600 2 3.200V12l9 5.200v3l-9-2.600v5.800l3 2.200v2.600l-5-1.500-5 1.500v-2.600l3-2.200v-5.800l-9 2.600v-3l9-5.200V6.200C14 4.600 14.600 3 16 3z"/>'],
    train:   ['<rect x="7.500" y="4.500" width="17" height="19.500" rx="5"/>', '<rect x="7.500" y="4.500" width="17" height="19.500" rx="5"/><path d="M7.500 15h17M12 9h8M11.500 19.500h.01M20.500 19.500h.01M11 24l-3 4.500M21 24l3 4.500M9.300 26.500h13.400"/>'],
    ship:    ['<path d="M4 19.500h24l-3.500 6.500h-17z"/><rect x="9" y="12.500" width="13" height="7" rx="1"/>', '<path d="M4 19.500h24l-3.500 6.500h-17zM9 19.500v-7h13v7M13.500 12.500V8.500h5v4M12.500 16h.01M15.500 16h.01M18.500 16h.01M4 29.500c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1 2 1 4 1"/>'],
    trip:    ['<rect x="5" y="10" width="22" height="16" rx="3.500"/>', '<rect x="5" y="10" width="22" height="16" rx="3.500"/><path d="M12 10V7.500A1.500 1.500 0 0 1 13.500 6h5A1.500 1.500 0 0 1 20 7.500V10M11 10v16M21 10v16"/>'],
    home:    ['<path d="M5.500 15.500L16 6.500l10.500 9V27h-21z"/>', '<path d="M4 16L16 6l12 10M7.500 13.500V27h17V13.500M13.500 27v-6.500h5V27"/>'],
    globe:   ['<circle cx="16" cy="16" r="11.500"/>', '<circle cx="16" cy="16" r="11.500"/><path d="M4.500 16h23M16 4.500c3.200 3.200 4.800 7 4.800 11.500S19.200 24.300 16 27.500C12.800 24.300 11.200 20.500 11.200 16S12.800 7.700 16 4.500z"/>'],
    pin:     ['<path d="M16 28.500s-8.500-8.400-8.500-14.700a8.500 8.500 0 0 1 17 0c0 6.300-8.500 14.700-8.500 14.700z"/>', '<path d="M16 28.500s-8.500-8.400-8.500-14.700a8.500 8.500 0 0 1 17 0c0 6.300-8.500 14.700-8.500 14.700z"/><circle cx="16" cy="13.800" r="3.200"/>'],
    help:    ['<circle cx="16" cy="16" r="11.500"/>', '<circle cx="16" cy="16" r="11.500"/><path d="M12.500 12.700a3.600 3.600 0 1 1 5.100 3.200c-1 .5-1.600 1.300-1.600 2.400v.7M16 22.300h.01"/>'],
    tree:    ['<circle cx="16" cy="11.500" r="7.500"/><circle cx="9.500" cy="16.500" r="5"/><circle cx="22.500" cy="16.500" r="5"/>', '<path d="M16 28v-9M16 22.500l-3.500-3M16 21l3-2.500M9.500 21.500a5 5 0 0 1-.9-9.700 7.500 7.500 0 0 1 14.800 0 5 5 0 0 1-.9 9.700z"/>'],
    doc:     ['<path d="M8 4.500h11l6 6v17H8z"/>', '<path d="M8 4.500h11l6 6v17H8zM19 4.500v6h6M12 15.500h9M12 19.500h9M12 23.500h5.500"/>'],
    spoon:   ['<ellipse cx="10.500" cy="10.500" rx="5.300" ry="7.300" transform="rotate(-45 10.500 10.500)"/><path d="M15.900 14.100L27.400 25.600a1.300 1.300 0 0 1-1.800 1.800L14.100 15.900z"/>', '<ellipse cx="10.500" cy="10.500" rx="5.300" ry="7.300" transform="rotate(-45 10.500 10.500)"/><path d="M15.900 14.100L27.400 25.600a1.300 1.300 0 0 1-1.800 1.800L14.100 15.900M7.300 10c.4-1.400 1.300-2.400 2.600-3"/>'],
  };
  // emoji (without the optional variation selector) → icon name
  const MAP = { '🍼': 'feed', '💧': 'diaper', '😴': 'sleep', '🌙': 'wake', '🤮': 'vomit', '🧸': 'play', '🩺': 'health', '💊': 'med', '💩': 'poo', '🍽': 'meal', '🚽': 'potty', '💉': 'vaccine', '🏥': 'clinic', '📏': 'ruler', '📋': 'doc', '🏫': 'school', '🎒': 'bag', '📚': 'books',
    '📅': 'day', '🗓': 'month', '📊': 'stats', '👨‍👩‍👧': 'family', '⚙': 'more', '🔒': 'lock', '🔐': 'lock', '🔑': 'key', '📷': 'camera', '🔗': 'link',
    '👶': 'baby', '📨': 'mail', '⚠': 'warn', '✅': 'check', '⏳': 'clock', '📴': 'offline', '☁': 'cloud', '📞': 'phone', '📖': 'guide', '🌟': 'star', '🎨': 'palette', '🌗': 'theme',
    '🌿': 'leaf', '☀': 'day', '🚗': 'car', '✈': 'plane', '🚆': 'train', '🚢': 'ship', '🧳': 'trip', '❓': 'help', '📍': 'pin', '🌐': 'globe', '⏰': 'clock', '📄': 'doc', '🥄': 'spoon', '🌳': 'tree' };
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
