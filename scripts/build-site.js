// The publisher's web pages at crowmade.app, written into site/ as plain files for Cloudflare Pages (or any static host):
//   node scripts/build-site.js
// site/index.html (Crowmade, the apps), site/littlelog/index.html (the app's page) and site/littlelog/privacy/index.html
// (PRIVACY.md rendered), with the icon, the feature graphic and two screenshots copied beside them. No dependencies:
// the Markdown the policy uses (headings, paragraphs, bullet lists, bold, italics, links, code) is rendered here.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'site');
const SUPPORT = 'support@crowmade.app', HOME = 'https://crowmade.app';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline Markdown: code, bold, italics, links; everything else escaped. */
function inline(s) {
  const parts = []; let rest = esc(s);
  rest = rest.replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`);
  rest = rest.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => `<a href="${u}">${t}</a>`);
  rest = rest.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  parts.push(rest); return parts.join('');
}
/** Block Markdown: #/## headings, * lists, paragraphs; the editorial note in italics at the top of PRIVACY.md is left out. */
function markdown(md) {
  const lines = md.split('\n'), html = []; let para = [], list = null, first = true;
  const flush = () => { if (para.length) { const t = para.join(' ').trim(); if (!(first && /^\*.*\*$/.test(t))) html.push(`<p>${inline(t)}</p>`); first = false; para = []; } if (list) { html.push(`<ul>${list.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`); list = null; } };
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, '');
    if (/^#{1,3} /.test(l)) { flush(); const n = l.match(/^#+/)[0].length; html.push(`<h${n}>${inline(l.replace(/^#+ /, ''))}</h${n}>`); }
    else if (/^\* /.test(l)) { if (para.length) flush(); (list || (list = [])).push(l.slice(2)); }
    else if (/^\s+\S/.test(l) && list) list[list.length - 1] += ' ' + l.trim();   // (a list item wrapped onto the next line)
    else if (l === '') flush();
    else { if (list) flush(); para.push(l); }
  }
  flush(); return html.join('\n');
}

const CSS = `:root{--bg:#f6f2ec;--card:#fffdf9;--ink:#4a4337;--mute:#6b6354;--brand:#64759f;--line:#e8e1d5}
@media (prefers-color-scheme:dark){:root{--bg:#1e1b17;--card:#2a2621;--ink:#f1ebe2;--mute:#b8ad9d;--brand:#9fb0d8;--line:#3b352d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--brand)}h1,h2,h3{font-family:Georgia,"Iowan Old Style","Palatino Linotype",serif;font-weight:normal;line-height:1.2;margin:1.4em 0 .4em}
h1{font-size:2.3em;margin-top:.4em}h2{font-size:1.5em}.wrap{max-width:760px;margin:0 auto;padding:24px 16px 48px}
header.top{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}header.top a{text-decoration:none;color:var(--ink);font-family:Georgia,serif;font-size:1.15em}
header.top nav{margin-left:auto;display:flex;gap:16px}header.top nav a{font-size:.95em;color:var(--mute)}
.hero{display:flex;gap:20px;align-items:center;margin:8px 0 20px}.hero img{width:112px;height:112px;border-radius:26px;box-shadow:0 10px 28px rgba(0,0,0,.12)}
.hero p{margin:4px 0 0;color:var(--mute);font-size:1.1em}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin:14px 0}
.shots{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin:18px 0}.shots img{width:min(46%,250px);border-radius:18px;box-shadow:0 10px 28px rgba(0,0,0,.14)}
.wide{width:100%;border-radius:14px;margin:8px 0 18px}.note{color:var(--mute);font-size:.95em}footer{border-top:1px solid var(--line);margin-top:36px;padding-top:16px;color:var(--mute);font-size:.92em}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em;background:rgba(127,127,127,.12);padding:1px 5px;border-radius:5px}ul{padding-left:1.3em}li{margin:.3em 0}`;

const page = (title, body, { desc = '', path: p = '' } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${desc ? `<meta name="description" content="${esc(desc)}">` : ''}<link rel="icon" href="/littlelog/icon.png">
<style>${CSS}</style></head><body>
<header class="top"><a href="/">Crowmade</a><nav><a href="/littlelog/">Little Log</a><a href="/littlelog/privacy/">Privacy</a><a href="mailto:${SUPPORT}">Support</a></nav></header>
<main class="wrap">${body}
<footer><p>Crowmade · <a href="mailto:${SUPPORT}">${SUPPORT}</a> · <a href="/littlelog/privacy/">Privacy policy</a></p></footer></main></body></html>
`;

const home = page('Crowmade', `
<h1>Crowmade</h1>
<p class="note">Small, careful apps and tools, made by one person. Nothing here collects your data.</p>
<div class="card hero"><img src="/littlelog/icon.png" alt=""><div><h2 style="margin:0"><a href="/littlelog/" style="text-decoration:none">Little Log</a></h2>
<p>Your child's days, logged by the whole family. Encrypted, in your own cloud.</p></div></div>
<p class="note">Questions, problems, or something that reads wrong in your language: <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>`,
{ desc: 'Crowmade: small, careful apps. Little Log, the family log of a child, encrypted in your own cloud.' });

const littlelog = page('Little Log', `
<div class="hero"><img src="icon.png" alt=""><div><h1 style="margin:0">Little Log</h1><p>Your child's days, logged by the whole family. Encrypted, in your own cloud.</p></div></div>
<p><b>The day as a clock.</b> Feeds, sleep, nappies, play, baths and medicines go around a clock of the day, so you see at a glance when the last feed was and how long the nap has run. Big buttons for busy moments: a tap, a rough time, done.</p>
<p><b>The whole family, one log.</b> Parents, grandparents, a babysitter, the daycare: each gets a role and sees what that role may see, and health notes stay with the people you choose.</p>
<p><b>Your own cloud, encrypted.</b> There is no account with us and no server of ours. The log lives on your phones and, if you choose, in a folder in your own Dropbox, Google Drive or iCloud Drive, encrypted on your phone before it leaves it.</p>
<p><b>Grows with the child.</b> The Day page, the Guide and the entries follow the child's age, from newborn to teenager, in 32 languages.</p>
<div class="shots"><img src="shot-day.jpg" alt="The Day page: the clock of the day and the big buttons"><img src="shot-guide.jpg" alt="The Guide"></div>
<div class="card"><p style="margin:0"><b>Coming to Google Play and the App Store.</b> Until then, write to <a href="mailto:${SUPPORT}">${SUPPORT}</a> to hear when it is out.</p></div>
<p class="note">Little Log gives general information from the NHS, the AAP, the CDC and the WHO. It is not medical advice: for your child, ask your pediatrician, and in an emergency call your local emergency number. <a href="privacy/">Privacy policy</a>.</p>`,
{ desc: "Little Log: the family's log of a child's days, from the first feed to the teenage years, end-to-end encrypted in your own cloud." });

const privacyMd = fs.readFileSync(path.join(root, 'PRIVACY.md'), 'utf8');
const privacy = page('Little Log privacy policy', markdown(privacyMd), { desc: 'The privacy policy of Little Log: no server, no accounts, the family\'s own cloud folder, everything encrypted on the phone.' });

fs.mkdirSync(path.join(out, 'littlelog', 'privacy'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), home);
fs.writeFileSync(path.join(out, 'littlelog', 'index.html'), littlelog);
fs.writeFileSync(path.join(out, 'littlelog', 'privacy', 'index.html'), privacy);
for (const [from, to] of [['resources/icon-only.png', 'littlelog/icon.png'], ['store/android/1-day.jpg', 'littlelog/shot-day.jpg'], ['store/android/5-guide.jpg', 'littlelog/shot-guide.jpg']]) fs.copyFileSync(path.join(root, from), path.join(out, to));
console.log(`site/ written: ${HOME}, ${HOME}/littlelog/, ${HOME}/littlelog/privacy/`);
