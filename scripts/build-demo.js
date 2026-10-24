// Builds a single-file, clickable demo of the real screens (sample family, nothing saved) for sharing as a web page:
//   node scripts/build-demo.js out.html
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const out = process.argv[2] || path.join(root, 'demo', 'little-log-demo.html');
let css = rd('style.css');
// colour tokens follow the viewer's light / dark choice as well as the system setting
css = css.replace(/@media\(prefers-color-scheme:dark\)\{:root\{([^}]*)\}\}/, (m, v) => `@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${v};color-scheme:dark}}\n:root[data-theme="dark"]{${v};color-scheme:dark}`);
css = css.replace('body::before{', '#phone::before{');
let app = rd('app.js').replace(/^const dark = .*$/m, "const dark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); };");
const html = rd('index.html'), body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="native-plugins.js">')).trim();
const [head, rest] = (() => { const i = body.indexOf('<nav class="tabs"'); return [body.slice(0, i), body.slice(i)]; })();
const frame = `
:root{--stage:#e9e4dc}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--stage:#0f0e0d}}
:root[data-theme="dark"]{--stage:#0f0e0d}
html,body{height:auto}
#phone{position:relative;isolation:isolate}
.card:has(#expJson),.card:has(#wipe){display:none}
@media(min-width:600px){
  body{background:var(--stage);padding:0;display:flex;justify-content:center}
  #phone{transform:translateZ(0);width:410px;height:min(840px,calc(100dvh - 32px));margin:16px 0;overflow:hidden;border-radius:42px;border:8px solid #1d1b19;background:var(--bg)}
  #scroll{height:100%;overflow-y:auto;overflow-x:hidden;padding-bottom:96px}
  #phone .tabs,#phone .sheet,#phone .sheet-back,#phone .toast,#phone .cover{position:absolute}
  #phone .sheet{max-height:86%}
}`;
const page = `<title>Little Log Demo</title>
<style>${css}\n${frame}</style>
<div id="phone"><div id="scroll">${head}</div>${rest}</div>
${['kids.js', 'icons.js', 'guide.js', 'demo/stubs.js'].map(f => `<script>\n${rd(f).replace(/<\/script/gi, '<\\/script')}\n</script>`).join('\n')}
<script>\n${app.replace(/<\/script/gi, '<\\/script')}\n</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, page); console.log('wrote', out, (page.length / 1024).toFixed(0) + ' KB');
