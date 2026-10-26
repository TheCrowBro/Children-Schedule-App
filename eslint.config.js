// Lint: catches typos and unsafe patterns. The app's scripts share one global scope (plain <script> tags), so the
// names each file defines are listed as globals for the others.
const js = require('@eslint/js'), globals = require('globals');
const shared = ['FamilyTree', 'Stages', 'Growth', 'momentsOf', 'isPrivate', 'Routine', 'Pdf', 'Foods', 'Auth', 'Sync', 'Cloud', 'Lock', 'Acct', 'E2EE', 'Media', 'Native', 'Store', 'db', 'save', 'stamp', 'removeEvent', 'TYPES', 'toast', 'render', 'sheetX', 'tab', '$', 'esc', 'chip', 'radios', 'MIN', 'DAY', 'fmtDur', 'fmtTime', 'qrcode', 'jsQR', 'download', 'uid', 'statDays', 'Kids', 'Icons', 'Guide', 'Art', 'Theme', 'Formulas', 'Travel', 'Tour', 'usualFormula', 'learnedFormula', 'kidById', 'kids', 'viewDay', 'describe', 'artOf', 'tickHands', 'half', 'quad', 'GROUPS', 'scoped', 'childOf', 'dayStats', 'startOfDay', 'eventsOnDay', 'setKid', 'openSheet', 'addDays', 'myRegion', 'andList', 'kidName', 'avatar', 'calMonth', 'openGroups', 'fmtShort', 'I18n', '__', '__n', '__h', '__hn', 'N_'];
const rules = { eqeqeq: ['error', 'always', { null: 'ignore' }], 'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error', 'no-var': 'error', 'no-prototype-builtins': 'off',
  'no-empty': ['warn', { allowEmptyCatch: true }], 'no-constant-condition': ['error', { checkLoops: false }], 'no-redeclare': ['error', { builtinGlobals: false }], 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] };
module.exports = [
  { ignores: ['.claude/**', 'demo/**', 'node_modules/**', 'www/**', 'android/**', 'ios/**', 'vendor/**', 'src/**', 'resources/**'] },
  js.configs.recommended,
  { files: ['i18n.js', 'auth.js', 'sync.js', 'e2ee.js', 'media.js', 'cloud.js', 'lock.js', 'account.js', 'app.js', 'native.js', 'store.js', 'config.js', 'kids.js', 'icons.js', 'guide.js', 'art.js', 'theme.js', 'formulas.js', 'travel.js', 'tour.js', 'routine.js', 'pdf.js', 'foods.js', 'ftree.js', 'stages.js', 'growth.js'],
    languageOptions: { sourceType: 'script', ecmaVersion: 2022, globals: { ...globals.browser, ...Object.fromEntries(shared.map(n => [n, 'writable'])), google: 'readonly', turnstile: 'readonly', LL_CONFIG: 'writable' } }, rules },
  { files: ['supabase/functions/**/*.mjs'], languageOptions: { sourceType: 'module', ecmaVersion: 2022, globals: { ...globals.browser, Deno: 'readonly' } }, rules },
  { files: ['scripts/**', 'tests/**', 'eslint.config.js'], languageOptions: { sourceType: 'commonjs', ecmaVersion: 2022, globals: { ...globals.node, ...globals.browser, ...Object.fromEntries(shared.map(n => [n, 'writable'])), LL_CONFIG: 'writable' } }, rules },
];
