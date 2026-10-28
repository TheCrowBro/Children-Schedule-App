// Renders the app icon and splash screens from inline SVG with headless Chromium (needs playwright): resources/*.png, the Android
// launcher icons (every density, plus the adaptive layers) and splash screens, and the iOS icon.   node scripts/make-icons.js
// The icon: the baby in the centre, rays in the day clock's colours and kinds of line around it, on soft creamy white.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const CREAM = '#fbf7ef', DARK = '#1d1b19', INK = '#4a4337';
const RAYS = ['#d9a066', '#7fb0a6', '#8a94c0', '#a89bc4', '#d49aa6', '#c9756e', '#7fa6c4', '#a3b17a'];   // feed, diaper, sleep, wake, play, health, meds, vomit
/** The badge, 512 wide, centred on (256, 256). */
// The rays carry the kinds of line the day clock draws. Most are plain; here and there one is dashed (a snack in the feed colour, a nap in
// the sleep colour), dotted (an estimated time), a squiggle (a poo in the diaper colour), a zigzag, or a line ending in its dot (an
// entry's dot). KIND says which ray is which. (account.js draws the same badge on the first screens.)
const KIND = { 1: 'wave', 4: 'dots', 6: 'tip', 8: 'dash', 10: 'dash', 13: 'zig', 15: 'dots', 17: 'wave', 19: 'tip', 22: 'zig' };
const ray = (i, c) => {
  const t = `transform="rotate(${i * 15} 256 256)"`, k = KIND[i] || 'plain';
  if (k === 'dash') return `<rect x="245" y="10" width="22" height="32" rx="11" fill="${c}" ${t}/><rect x="245" y="54" width="22" height="32" rx="11" fill="${c}" ${t}/>`;
  if (k === 'dots') return [20, 48, 76].map(y => `<circle cx="256" cy="${y}" r="10" fill="${c}" ${t}/>`).join('');
  if (k === 'wave') return `<path d="M256 16q11 9 0 18t0 18t0 18t0 12" fill="none" stroke="${c}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" ${t}/>`;
  if (k === 'zig') return `<path d="M256 16l9 12-18 14 18 14-18 14 9 10" fill="none" stroke="${c}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" ${t}/>`;
  if (k === 'tip') return `<circle cx="256" cy="23" r="13" fill="${c}" ${t}/><rect x="248" y="42" width="16" height="44" rx="8" fill="${c}" ${t}/>`;
  return `<rect x="245" y="10" width="22" height="76" rx="11" fill="${c}" ${t}/>`;
};
const badge = () => {
  let r = '';
  for (let i = 0; i < 24; i++) r += ray(i, RAYS[i % 8]);
  return `<g>${r}</g><circle cx="256" cy="256" r="128" fill="#ffffff" stroke="#e8e1d5" stroke-width="5"/>
  <circle cx="196" cy="282" r="17" fill="#f3b9b2" opacity=".75"/><circle cx="316" cy="282" r="17" fill="#f3b9b2" opacity=".75"/>
  <circle cx="212" cy="246" r="13" fill="${INK}"/><circle cx="300" cy="246" r="13" fill="${INK}"/>
  <path d="M216 292q40 36 80 0" stroke="${INK}" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M256 130q-18-24 12-34" stroke="${INK}" stroke-width="11" fill="none" stroke-linecap="round"/>`;
};
const svg = (w, h, bg, scale, round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${round ? `<clipPath id="c"><circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}"/></clipPath>` : ''}
  <g ${round ? 'clip-path="url(#c)"' : ''}>${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}<g transform="translate(${w / 2} ${h / 2}) scale(${scale}) translate(-256 -256)">${badge()}</g></g></svg>`;
const png = (w, h) => {   // the size of an existing PNG
  const b = fs.readFileSync(w); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
const jobs = [];
const add = (file, w, h, bg, scale, round = false) => jobs.push({ file, w, h, markup: svg(w, h, bg, scale, round) });
add('resources/icon-only.png', 1024, 1024, CREAM, 2);
add('resources/icon-foreground.png', 1024, 1024, null, 2 * 0.72);
add('resources/icon-background.png', 1024, 1024, CREAM, 0);
add('resources/splash.png', 2732, 2732, CREAM, 1.6);
add('resources/splash-dark.png', 2732, 2732, DARK, 1.6);
add('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 1024, CREAM, 2);
for (const [d, k] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
  const dir = `android/app/src/main/res/mipmap-${d}`;
  add(`${dir}/ic_launcher.png`, 48 * k, 48 * k, CREAM, (48 * k) / 512);
  add(`${dir}/ic_launcher_round.png`, 48 * k, 48 * k, CREAM, (48 * k) / 512, true);
  add(`${dir}/ic_launcher_foreground.png`, 108 * k, 108 * k, null, ((108 * k) / 512) * 0.72);
  add(`${dir}/ic_launcher_background.png`, 108 * k, 108 * k, CREAM, 0);
}
for (const dir of fs.readdirSync('android/app/src/main/res').filter(d => /^drawable/.test(d))) {   // the splash screens keep their sizes
  const f = `android/app/src/main/res/${dir}/splash.png`; if (!fs.existsSync(f)) continue;
  const { w, h } = png(f); add(f, w, h, /night/.test(dir) ? DARK : CREAM, Math.min(w, h) / 1024);
}
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  for (const j of jobs) {
    const p = await b.newPage({ viewport: { width: Math.round(j.w), height: Math.round(j.h) } });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${j.markup}`);
    await p.screenshot({ path: path.join(root, j.file), omitBackground: true, clip: { x: 0, y: 0, width: Math.round(j.w), height: Math.round(j.h) } });
    await p.close();
  }
  await b.close(); console.log(`${jobs.length} images written`);
})();
