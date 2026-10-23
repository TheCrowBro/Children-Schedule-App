// Registers the app's custom URL schemes in the native projects (idempotent). The OS uses them to hand the app
// back control after cloud sign-in (Dropbox / OneDrive / Google) and for invite links.
// Reads config.js: appScheme, plus Google's reverse-client-id scheme when googleNativeClientId is set.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), sandbox);
const cfg = sandbox.window.LL_CONFIG || {};
const schemes = [cfg.appScheme || 'app.littlelog.newborn'];
if (cfg.googleNativeClientId) schemes.push('com.googleusercontent.apps.' + cfg.googleNativeClientId.replace('.apps.googleusercontent.com', ''));

function patch(file, build) {
  const f = path.join(root, file);
  if (!fs.existsSync(f)) return;
  const s = fs.readFileSync(f, 'utf8');
  const re = /([ \t]*)<!-- ll:schemes:begin[^>]*-->[\s\S]*?<!-- ll:schemes:end -->/;
  const m = re.exec(s);
  if (!m) throw new Error('marker not found in ' + file);
  const ind = m[1];
  const block = `${ind}<!-- ll:schemes:begin (managed by scripts/native-config.js) -->\n${build(schemes, ind)}${ind}<!-- ll:schemes:end -->`;
  fs.writeFileSync(f, s.replace(re, block));
}
patch('android/app/src/main/AndroidManifest.xml', (sc, i) =>
  `${i}<intent-filter>\n${i}    <action android:name="android.intent.action.VIEW" />\n${i}    <category android:name="android.intent.category.DEFAULT" />\n${i}    <category android:name="android.intent.category.BROWSABLE" />\n` +
  sc.map(x => `${i}    <data android:scheme="${x}" />\n`).join('') + `${i}</intent-filter>\n`);
patch('ios/App/App/Info.plist', (sc, i) =>
  `${i}<key>CFBundleURLTypes</key>\n${i}<array>\n${i}\t<dict>\n${i}\t\t<key>CFBundleURLSchemes</key>\n${i}\t\t<array>\n` +
  sc.map(x => `${i}\t\t\t<string>${x}</string>\n`).join('') + `${i}\t\t</array>\n${i}\t</dict>\n${i}</array>\n`);
console.log('URL schemes registered:', schemes.join(', '));
