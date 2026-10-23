// Renders resources/*.png (app icon, Android adaptive layers, splash screens) from inline SVG using headless
// Chromium (needs playwright). Then run: npx @capacitor/assets generate
const { chromium } = require('playwright');
const path = require('path');
const face = `<circle cx="256" cy="270" r="130" fill="#fff"/><circle cx="212" cy="260" r="14" fill="#5b7cfa"/><circle cx="300" cy="260" r="14" fill="#5b7cfa"/><path d="M215 314q41 38 82 0" stroke="#5b7cfa" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M256 140q-26-40 14-48" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round"/>`;
const sq = (inner, bg, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1024" height="1024">${bg ? `<rect width="512" height="512" fill="${bg}"/>` : ''}<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${inner}</g></svg>`;
const splash = bg => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732"><rect width="2732" height="2732" fill="${bg}"/><g transform="translate(1166 1166) scale(0.8)"><rect width="512" height="512" rx="110" fill="#5b7cfa"/>${face}</g></svg>`;
const jobs = {
  'icon-only': [sq(face, '#5b7cfa'), 1024],
  'icon-foreground': [sq(face, null, 0.72), 1024],   // inside Android's adaptive-icon safe zone
  'icon-background': [sq('', '#5b7cfa'), 1024],
  'splash': [splash('#f5f6fb'), 2732],
  'splash-dark': [splash('#12141f'), 2732],
};
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  for (const [name, [svg, size]] of Object.entries(jobs)) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
    await p.screenshot({ path: path.join(__dirname, '..', 'resources', name + '.png'), omitBackground: true });
    await p.close();
  }
  await b.close(); console.log('icons written to resources/');
})();
