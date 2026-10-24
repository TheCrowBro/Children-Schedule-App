'use strict';
/* Stand-ins for the parts of the app that need a phone (sign-in, encryption, sync, Keychain), so the real screens run in a plain page.
   Everything lives in memory: a reload starts again from the sample family. Used only by scripts/build-demo.js. */
const Store = { st: { ok: true, err: '', quarantined: false, recovered: false, onChange: null }, init: async () => {}, load: async () => demoDb(), save() {}, whenSaved: async () => {}, peek: async () => null, backup() {}, quarantine: () => [], usingIndexedDB: false };
const Native = { is: false, onBack() {}, onUrl() {}, launchUrl() {}, saveFile: () => Promise.reject(new Error('cancelled')) };
const Auth = { id: 'demo', signedIn: false, configured: false, init: async () => {} };
const Sync = { can: () => true, linked: () => false, isParent: () => true, nameOf: () => '', schedule() {}, pushBaby() {}, onChange: null, onSessionLost: null };
const Cloud = { init: async () => {}, autoBackup() {}, handleOAuthUrl() {} };
const Lock = { init: async () => {}, onChange: null };
const Acct = {
  gate: () => null, init: async () => {}, syncLine: () => 'Demo: tap around, nothing here is saved', accountHtml: () => '', cloudHtml: () => '', bindMoreAccount() {}, bindFamily() {},
  updateBadge() {}, applyBackup() {}, receiveJoin() {}, refreshAuth() {}, sessionLost() {},
  familyHtml: () => `<div class="card"><b>👨‍👩‍👧 Your family log</b><p class="note">In the real app this is where parents invite people with a QR code (valid for two hours, one use) and approve each request. Parents also get a private activity log of who did what.</p>
    <div class="stat"><span>Mum<br><small>Parent</small></span><b>you</b></div>
    <div class="stat"><span>Dad<br><small>Parent</small></span></div>
    <div class="stat"><span>Gran<br><small>Family member: can add entries and change her own</small></span></div>
    <div class="stat"><span>Jess<br><small>Babysitter: can add entries, no health notes</small></span></div></div>
    <div class="card"><b>🔒 Locked and encrypted</b><p class="note">Everything in the log is end-to-end encrypted. The server only stores scrambled data, and phones hold the keys.</p></div>`,
};
window.confirm = () => true; window.alert = () => {};
function demoDb() {
  const h = 3600e3, DAYMS = 864e5, t0 = new Date().setHours(0, 0, 0, 0);
  const kids = [{ id: 'c1', name: 'Leo', birth: '', sex: 'boy', color: '' }, { id: 'k2', name: 'Mia', birth: '', sex: 'girl', color: '' }, { id: 'k3', name: 'Sam', birth: '', sex: 'boy', color: '' }];
  const ks = Kids.clean(kids), born = new Date(t0 - 12 * DAYMS), iso = `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-${String(born.getDate()).padStart(2, '0')}`;
  ks.forEach(k => { k.birth = iso; });
  const events = []; let n = 0;
  const add = (type, ts, data, kid, extra = {}) => { if (ts > Date.now()) return; events.push({ id: 'd' + (n++), type, ts, data, note: '', updated: Date.now(), child: kid.id, ...extra }); };
  for (let day = 6; day >= 0; day--) {
    const b = t0 - day * DAYMS;
    ks.forEach((k, i) => {
      const o = i * 0.15;
      [0.8, 3.6, 6.4, 9.3, 12.2, 15.1, 18, 21].forEach((x, j) => add('feed', b + (x + o) * h, j % 3 ? { kind: 'bottle', ml: 70 + ((j * 7 + i * 5) % 30), milk: 'Formula' } : { kind: 'breast', side: j % 2 ? 'Left' : 'Right', min: 12 + j }, k));
      [1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5].forEach((x, j) => add('diaper', b + (x + o) * h, { pee: true, poo: j % 2 === 0, rash: false, color: j % 2 === 0 ? 'Yellow' : undefined }, k));
      add('sleep', b + (0.3 + o) * h, {}, k, { end: b + (3.2 + o) * h }); add('sleep', b + (10.4 + o) * h, {}, k, { end: b + (12 + o) * h }); add('sleep', b + (14.2 + o) * h, {}, k, { end: b + (15.9 + o) * h });
      if ((day + i) % 3 === 0) add('vomit', b + (8 + o) * h, { amount: 'Spit-up', projectile: false }, k);
      add('play', b + (11 + o) * h, { activity: 'Tummy time', min: 10 }, k);
    });
  }
  return { baby: { name: ks[0].name, birth: ks[0].birth, kids: ks }, events, deleted: [], meta: { kid: 'k2' } };
}
// the page's own scroll box stands in for the window on wide screens
{ const sc = () => document.getElementById('scroll'), real = window.scrollTo.bind(window);
  window.scrollTo = (x, y) => { const s = sc(), top = typeof x === 'object' ? x.top : y; if (s && getComputedStyle(s).overflowY === 'auto') s.scrollTop = top || 0; else real(x, y); }; }
new MutationObserver(() => { if (typeof render === 'function') render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
