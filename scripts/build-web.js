// Builds www/ (Capacitor's webDir): copies the app files, bundles the native plugins with esbuild, and writes a strict
// Content-Security-Policy into index.html derived from config.js (so only the services you configured are reachable).
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
// LL_CONFIG / LL_OUT let tests build against a different config into a temp folder.
const out = process.env.LL_OUT || path.join(root, 'www'), configFile = process.env.LL_CONFIG || path.join(root, 'config.js');
const cfg = (() => { const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(configFile, 'utf8'), sb); return sb.window.LL_CONFIG || {}; })();

const files = ['style.css', 'config.js', 'theme.js', 'kids.js', 'icons.js', 'guide.js', 'formulas.js', 'travel.js', 'tour.js', 'art.js', 'store.js', 'native.js', 'auth.js', 'e2ee.js', 'sync.js', 'cloud.js', 'lock.js', 'account.js', 'app.js'];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
for (const f of files) fs.copyFileSync(f === 'config.js' ? configFile : path.join(root, f), path.join(out, f));
for (const f of fs.readdirSync(path.join(root, 'vendor'))) fs.copyFileSync(path.join(root, 'vendor', f), path.join(out, 'vendor', f));
// the Guide's pictures
fs.mkdirSync(path.join(out, 'img', 'guide'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'img', 'guide'))) if (/\.(jpe?g|png)$/.test(f)) fs.copyFileSync(path.join(root, 'img', 'guide', f), path.join(out, 'img', 'guide', f));

const origin = u => { try { return new URL(u).origin; } catch (e) { return ''; } };
const connect = ["'self'", origin(cfg.supabaseUrl),
  cfg.dropboxKey && 'https://api.dropboxapi.com https://content.dropboxapi.com',
  cfg.msClientId && 'https://login.microsoftonline.com https://graph.microsoft.com',
  cfg.googleClientId && 'https://oauth2.googleapis.com https://www.googleapis.com',
  cfg.captchaSiteKey && 'https://challenges.cloudflare.com'].filter(Boolean).join(' ');
const csp = [
  "default-src 'none'",
  `script-src 'self'${cfg.captchaSiteKey ? ' https://challenges.cloudflare.com' : ''}`,
  "style-src 'self' 'unsafe-inline'",            // the UI uses inline style attributes
  "img-src 'self' data: blob:", "media-src 'self' blob:",
  `connect-src ${connect}`,
  cfg.captchaSiteKey ? 'frame-src https://challenges.cloudflare.com' : "frame-src 'none'",
  "base-uri 'none'", "form-action 'none'", "object-src 'none'",
].join('; ');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
fs.writeFileSync(path.join(out, 'index.html'), html);

require('esbuild').buildSync({ entryPoints: [path.join(root, 'src/native-bundle.js')], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: path.join(out, 'native-plugins.js'), logLevel: 'error' });
console.log('web assets →', path.relative(root, out) || out, '(CSP connect-src:', connect + ')');
