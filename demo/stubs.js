'use strict';
/* Stand-ins for the parts of the app that need a phone (sign-in, encryption, sync, Keychain), so the real screens run in a plain page.
   Everything lives in memory: a reload starts again from the sample family. Used only by scripts/build-demo.js. */
const Store = { st: { ok: true, err: '', quarantined: false, recovered: false, onChange: null }, init: async () => {}, load: async () => demoDb(), save() {}, whenSaved: async () => {}, peek: async () => null, backup() {}, quarantine: () => [], usingIndexedDB: false };
const Native = { is: false, onBack() {}, onUrl() {}, launchUrl() {}, saveFile: () => Promise.reject(new Error('cancelled')), storeUrl: () => null, openExternal() {}, version: async () => '' };
const Auth = { id: 'demo', signedIn: false, configured: false, init: async () => {} };
const Sync = { setMyDetails: async () => {}, can: () => true, linked: () => false, isParent: () => true, nameOf: () => '', schedule() {}, pushBaby() {}, onChange: null, onSessionLost: null };
const Cloud = { init: async () => {}, autoBackup() {}, handleOAuthUrl() {} };
const Lock = { init: async () => {}, onChange: null };
const Acct = {
  gate: () => null, init: async () => {}, syncLine: () => 'Demo: tap around, nothing here is saved', accountHtml: () => '', cloudHtml: () => '', bindMoreAccount() {}, bindFamily() {},
  updateBadge() {}, applyBackup() {}, receiveJoin() {}, refreshAuth() {}, sessionLost() {},
  // the family tree, as it looks for someone who also looks after a sister's and a brother-in-law's children (switching needs the real app)
  famLabel: () => 'Your family',
  familySwitcher() {
    const S = $('#sheet'), B = $('#sheetBack');
    S.innerHTML = `<h3>🌳 Switch family</h3>${DEMO_FAMILIES.map(([name, who, role], i) => `<button class="card fampick${i ? '' : ' on'}" data-demofam="${i}"><span><b>${name}</b><br><small>${who} · ${role}</small></span>${i ? '' : '<small class="fshow">Showing</small>'}</button>`).join('')}
      <p class="note">In the real app this switches the whole app to that family: its children, entries and routine. Each family stays on the phone, so it's instant and works offline.</p>
      <div class="row"><button class="btn" data-close>Close</button></div>`;
    Icons.paint(S); S.hidden = B.hidden = false;
    const close = () => { S.hidden = B.hidden = true; }; B.onclick = close; S.querySelector('[data-close]').onclick = close;
    S.querySelectorAll('[data-demofam]').forEach(b => b.onclick = () => { close(); if (+b.dataset.demofam) toast('In the real app, this opens that family'); });
  },
  familyHtml: () => {
    const person = (name, role, d) => `<details class="gd"><summary><span class="gt"><b>${name}</b><small>${role}</small></span><span class="chev" aria-hidden="true">›</span></summary>
      ${d.map(([l, v]) => `<div class="stat" style="margin:0 14px"><span>${l}<br><b class="sel">${v}</b></span></div>`).join('')}<p></p></details>`;
    const kid = (n, c) => `<span class="fkid"><span class="av" style="--k:${c}">${n[0]}</span>${n}</span>`;
    const tree = `<h2>🌳 Family tree</h2><div class="card ftree"><div class="froot"><span class="av lg">M</span><span><b>You</b><br><small>Mum</small></span></div><ul class="fbranches">
      <li class="fam on"><div class="fhead"><span><b>Your family</b><br><small>Parent</small></span><small class="fshow">Showing</small></div><div class="fkids">${kids().map(k => kid(k.name, k.color)).join('')}</div></li>
      <li class="fam"><div class="fhead"><span><b>Sarah's family</b><br><small>Caregiver</small></span><button class="btn" data-demoopen>Open</button></div><div class="fkids">${kid('Ava', '#c2577a')}${kid('Jack', '#3f78b5')}</div></li>
      <li class="fam"><div class="fhead"><span><b>Tom's family</b><br><small>Babysitter</small></span><button class="btn" data-demoopen>Open</button></div><div class="fkids">${kid('Noah', '#2f8f83')}</div></li></ul>
      <button class="btn" data-demoopen style="width:100%;margin-top:10px">+ Add a family</button>
      <p class="note">Looking after a sister's or a brother-in-law's children? One of their parents shows you an invite QR code and approves you, and their family joins your tree.</p></div>`;
    setTimeout(() => document.querySelectorAll('[data-demoopen]').forEach(b => b.onclick = () => toast('In the real app, this opens that family (or adds one)')));
    return `${tree}<div class="card"><b>👨‍👩‍👧 Your family log</b><p class="note">In the real app parents invite people with a QR code (valid for two hours, one use) and approve each request. Tap a person to see the details they added. Everything is end-to-end encrypted.</p></div>
    ${person('Mum (you)', 'Parent', [['Relationship', 'Mum'], ['Phone', '(555) 010-1234'], ['Place of work', 'Lakeside Library']])}
    ${person('Dad', 'Parent', [['Relationship', 'Dad'], ['Phone', '(555) 010-4444'], ['Place of work', 'Riverside Fire Station'], ['Work phone', '(555) 010-5555']])}
    ${person('Gran', 'Family member: adds entries, changes her own', [['Relationship', 'Grandma'], ['Phone', '(555) 010-7777'], ['Notes', 'Has a car seat in her car']])}
    ${person('Jess', 'Babysitter: adds entries, no health notes', [['Relationship', 'Babysitter'], ['Phone', '(555) 010-8888']])}`;
  },
};
const DEMO_FAMILIES = [['Your family', 'Leo, Mia, Sam', 'Parent'], ["Sarah's family", 'Ava, Jack', 'Caregiver'], ["Tom's family", 'Noah', 'Babysitter']];
window.confirm = () => true; window.alert = () => {};
function demoDb() {
  const h = 3600e3, DAYMS = 864e5, t0 = new Date().setHours(0, 0, 0, 0);
  const kids = [{ id: 'c1', name: 'Leo', birth: '', sex: 'boy', color: '', formula: 'Similac 360 Total Care' }, { id: 'k2', name: 'Mia', birth: '', sex: 'girl', color: '' }, { id: 'k3', name: 'Sam', birth: '', sex: 'boy', color: '' }];
  const ks = Kids.clean(kids), born = new Date(t0); born.setMonth(born.getMonth() - 2); const iso = `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-${String(born.getDate()).padStart(2, '0')}`;
  ks.forEach(k => { k.birth = iso; });
  const events = [], FORMULA = { c1: 'Similac 360 Total Care', k2: 'Enfamil NeuroPro' }; let n = 0;   // (Mia's usual formula is learned from her feeds)
  const add = (type, ts, data, kid, extra = {}) => { if (ts > Date.now()) return; events.push({ id: 'd' + (n++), type, ts, data, note: '', updated: Date.now(), child: kid.id, ...extra }); };
  for (let day = 6; day >= 0; day--) {
    const b = t0 - day * DAYMS;
    ks.forEach((k, i) => {
      const o = i * 0.15;
      [0.8, 3.6, 6.4, 9.3, 12.2, 15.1, 18, 21].forEach((x, j) => add('feed', b + (x + o) * h, j % 3 ? { kind: 'bottle', ml: 70 + ((j * 7 + i * 5) % 30), milk: 'Formula', ...(FORMULA[k.id] ? { formula: FORMULA[k.id] } : {}) } : { kind: 'breast', side: j % 2 ? 'Left' : 'Right', min: 12 + j }, k));
      [1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5].forEach((x, j) => add('diaper', b + (x + o) * h, { pee: true, poo: j % 2 === 0, rash: false, color: j % 2 === 0 ? 'Yellow' : undefined }, k));
      add('sleep', b + (0.3 + o) * h, {}, k, { end: b + (3.2 + o) * h }); add('sleep', b + (10.4 + o) * h, {}, k, { end: b + (12 + o) * h }); add('sleep', b + (14.2 + o) * h, {}, k, { end: b + (15.9 + o) * h });
      if ((day + i) % 3 === 0) add('vomit', b + (8 + o) * h, { amount: 'Spit-up', projectile: false }, k);
      add('play', b + (11 + o) * h, { activity: 'Tummy time', min: 10 }, k);
    });
  }
  // a car trip earlier in the week, with two stretches on the road (travel days keep their own look)
  const away = t0 - 4 * DAYMS, leg = (a, b) => ({ id: 'd' + (n++), type: 'leg', ts: away + a * h, end: away + b * h, data: { means: 'car' }, note: '', updated: Date.now() });
  events.push({ id: 'd' + (n++), type: 'trip', ts: away, end: t0 - 2 * DAYMS, data: { means: 'car' }, note: '', updated: Date.now() }, leg(9, 11.5), leg(13.5, 15.8));
  return { baby: { name: ks[0].name, birth: ks[0].birth, kids: ks }, events, deleted: [], meta: { kid: 'k2' } };
}
// the page's own scroll box stands in for the window on wide screens
{ const sc = () => document.getElementById('scroll'), real = window.scrollTo.bind(window);
  window.scrollTo = (x, y) => { const s = sc(), top = typeof x === 'object' ? x.top : y; if (s && getComputedStyle(s).overflowY === 'auto') s.scrollTop = top || 0; else real(x, y); }; }
new MutationObserver(() => Theme.apply(true)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });   // the viewer's light / dark switch
