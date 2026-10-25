// Builds a single-file, clickable demo of the real screens (sample family, nothing saved) for sharing as a web page:
//   node scripts/build-demo.js out.html
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const out = process.argv[2] || path.join(root, 'demo', 'little-log-demo.html');
let css = rd('style.css');
// colour tokens follow the viewer's light / dark choice as well as the system setting
css = css.replace('body::before{', '#phone::before{');
const app = rd('app.js');
/** Files the demo makes (the doctor's PDF, the spreadsheet export): in the claude.ai page viewer a plain download link does nothing,
    so they are offered through its downloads capability, which asks the viewer first; anywhere else they download as usual. */
const saving = `const plainDownload = download;
download = async (name, data, type) => {
  let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { /* not in the viewer */ }
  if (!dl) return plainDownload(name, data, type);
  try { await dl.save({ filename: name, data: typeof data === 'string' ? data : new Blob([data], { type }) }); }
  catch (e) { if (!e || e.code !== 'declined') toast(__('Could not share the file')); }
};`;
/** Every language's catalogue, embedded in the page (it is a single file), so each can be tried in the demo. */
const languages = () => { const I18n = require('./i18n.js'); return I18n.languages().map(code => I18n.catalogue(code)).join(''); };
/** The Guide's pictures, embedded in the page (it is a single file). */
const pictures = () => {
  const dir = path.join(root, 'img', 'guide'), type = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
  const map = Object.fromEntries(fs.readdirSync(dir).filter(f => type[path.extname(f)]).map(f => [f, `data:${type[path.extname(f)]};base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}`]));
  return `const GUIDE_PICS = ${JSON.stringify(map)};\nGuide.picSrc = f => GUIDE_PICS[f] || '';`;
};
const html = rd('index.html'), body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="native-plugins.js">')).trim();
const [head, rest] = (() => { const i = body.indexOf('<nav class="tabs"'); return [body.slice(0, i), body.slice(i)]; })();
const frame = `
:root{--stage:#e9e4dc}
:root[data-mode="dark"]{--stage:#0f0e0d}
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
<script>\n${rd('theme.js')}\n</script>
<script>\n${rd('i18n.js')}\n${languages()}\n</script>
<div id="phone"><div id="scroll">${head}</div>${rest}</div>
${['kids.js', 'icons.js', 'guide.js', 'formulas.js', 'travel.js', 'tour.js', 'routine.js', 'pdf.js', 'foods.js', 'art.js', 'ftree.js', 'demo/stubs.js'].map(f => `<script>\n${rd(f).replace(/<\/script/gi, '<\\/script')}\n</script>`).join('\n')}
<script>\n${pictures()}\n</script>
<script>\n${app.replace(/<\/script/gi, '<\\/script')}\n</script>
<script>\n// The demo has no server: reports of language problems are not sent anywhere.\nReport.can = () => true; Report.send = async () => 'sent';\n</script>
<script>\n${saving}\n</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, page); console.log('wrote', out, (page.length / 1024).toFixed(0) + ' KB');
