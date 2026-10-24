// Lint: catches typos and unsafe patterns. The app's scripts share one global scope (plain <script> tags), so the
// names each file defines are listed as globals for the others.
const js = require('@eslint/js'), globals = require('globals');
const shared = ['Auth', 'Sync', 'Cloud', 'Lock', 'Acct', 'E2EE', 'Native', 'Store', 'db', 'save', 'stamp', 'removeEvent', 'TYPES', 'toast', 'render', 'tab', '$', 'esc', 'chip', 'radios', 'MIN', 'DAY', 'fmtDur', 'fmtTime', 'qrcode', 'jsQR', 'download', 'uid', 'statDays'];
const rules = { eqeqeq: ['error', 'always', { null: 'ignore' }], 'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error', 'no-var': 'error', 'no-prototype-builtins': 'off',
  'no-empty': ['warn', { allowEmptyCatch: true }], 'no-constant-condition': ['error', { checkLoops: false }], 'no-redeclare': ['error', { builtinGlobals: false }], 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] };
module.exports = [
  { ignores: ['node_modules/**', 'www/**', 'android/**', 'ios/**', 'vendor/**', 'src/**', 'resources/**'] },
  js.configs.recommended,
  { files: ['auth.js', 'sync.js', 'e2ee.js', 'cloud.js', 'lock.js', 'account.js', 'app.js', 'native.js', 'store.js', 'config.js'],
    languageOptions: { sourceType: 'script', ecmaVersion: 2022, globals: { ...globals.browser, ...Object.fromEntries(shared.map(n => [n, 'writable'])), google: 'readonly', turnstile: 'readonly', LL_CONFIG: 'writable' } }, rules },
  { files: ['scripts/**', 'tests/**', 'eslint.config.js'], languageOptions: { sourceType: 'commonjs', ecmaVersion: 2022, globals: { ...globals.node, ...globals.browser, ...Object.fromEntries(shared.map(n => [n, 'writable'])), LL_CONFIG: 'writable' } }, rules },
];
