// Copies the web app into www/ (Capacitor's webDir). No bundler: the app is plain files.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
const files = ['index.html', 'style.css', 'config.js', 'native.js', 'auth.js', 'sync.js', 'cloud.js', 'account.js', 'app.js', 'icon.svg'];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
for (const f of files) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const f of fs.readdirSync(path.join(root, 'vendor'))) fs.copyFileSync(path.join(root, 'vendor', f), path.join(out, 'vendor', f));
console.log('web assets →', path.relative(root, out));
