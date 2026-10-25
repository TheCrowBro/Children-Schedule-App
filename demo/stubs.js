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
    const fams = demoFamilies(), T = DEMO_TREE, now = Date.now();
    let order = 0;
    const sprout = key => {   // (as in the app: what is new grows in, all of it the first time)
      if (T.grow[key] == null) { if (T.seen && T.seen.has(key)) return null; T.grow[key] = now + Math.min(order++ * 80, 2000); }
      if (now - T.grow[key] > 1000) { delete T.grow[key]; return null; }
      return T.grow[key] - now;
    };
    const { svg, keys } = FamilyTree.draw({ title: 'Family tree', rtl: I18n.rtl(), sprout, families: fams, me: { key: 'me', initial: 'M', label: 'You', title: 'You · Mum' } });
    T.seen = new Set([...(T.seen || []), ...keys]);
    const tree = `<h2>🌳 Family tree</h2><div class="card ftreeimg">${svg}
      <button class="btn" id="demoAddFam" style="width:100%;margin-top:10px">+ Add a family</button>
      <p class="note">Tap a person, a child or a family. Looking after a sister's or a brother-in-law's children? One of their parents shows you an invite QR code and approves you, and their family grows on your tree. Try “Add a family”.</p></div>`;
    const list = `<details class="gd famlist" data-grp="famlist" ${openGroups.has('famlist') ? 'open' : ''}><summary><span class="gi">🌳</span><span class="gt"><b>Families and relatives</b><small>${andList(fams.map(f => f.name))}</small></span><span class="chev" aria-hidden="true">›</span></summary><ul class="fbranches">
      <li class="fam on" data-fam="own"><div class="fhead"><span><b>Your family</b><br><small>Parent</small></span><small class="fshow">Showing</small></div><div class="fkids">${kids().map(k => kid(k.name, k.color)).join('')}</div>
        <div class="fpeople">${person('Mum (you)', 'Parent', [['Relationship', 'Mum'], ['Phone', '(555) 010-1234'], ['Place of work', 'Lakeside Library']])}
        ${person('Dad', 'Parent', [['Relationship', 'Dad'], ['Phone', '(555) 010-4444'], ['Place of work', 'Riverside Fire Station'], ['Work phone', '(555) 010-5555']])}
        ${person('Gran', 'Family member: adds entries, changes her own', [['Relationship', 'Grandma'], ['Phone', '(555) 010-7777'], ['Notes', 'Has a car seat in her car']])}</div></li>
      ${fams.slice(1).map(f => `<li class="fam" data-fam="${f.key}"><div class="fhead"><span><b>${f.name}</b><br><small>Family member</small></span><button class="btn" data-demoopen>Open</button></div><div class="fkids">${f.kids.map(k => kid(k.label, k.color)).join('')}</div><p class="note fkin">Family: ${andList(f.adults.map(a => a.label))}</p></li>`).join('')}</ul></details>`;
    setTimeout(() => {
      document.querySelectorAll('[data-demoopen]').forEach(b => b.onclick = () => toast('In the real app, this opens that family'));
      const add = $('#demoAddFam'); if (add) add.onclick = () => { if (DEMO_TREE.more < DEMO_MORE.length) { DEMO_TREE.more++; render(); toast(`${DEMO_MORE[DEMO_TREE.more - 1].name} joined your tree`); } else toast('In the real app, you scan the QR code a parent of that family shows you'); };
      const pic = document.querySelector('.ftreesvg'); if (pic) pic.onclick = e => { const n = e.target.closest('[data-tk]'); if (n) demoTreeTap(n.dataset.tk); };
    });
    return `${tree}<div class="card"><b>👨‍👩‍👧 Your family log</b><p class="note">In the real app parents invite people with a QR code (valid for two hours, one use) and approve each request. Tap a person to see the details they added. Everything is end-to-end encrypted.</p></div>
    ${list}
    <h2>Caregivers and helpers</h2>
    ${person('Jess', 'Babysitter: adds entries, no health notes', [['Relationship', 'Babysitter'], ['Phone', '(555) 010-8888']])}
    ${person('Amy', 'Medical assistant: health notes and medicines', [['Relationship', 'Visiting nurse'], ['Phone', '(555) 010-2468'], ['Place of work', 'Westside Pediatrics']])}
    <div class="card"><div class="stat"><span>A parent can <b>retire</b> a caregiver, babysitter or medical assistant who moves away or stops helping: their access ends, and they stay on the Retired list with their details.</span><button class="btn" data-demoopen style="flex:none">Retire</button></div></div>
    <details class="more retired"><summary>Retired (1)<span class="chev" aria-hidden="true">›</span></summary>${person('Kim', 'Babysitter · retired Mar 3, 2026 · Moved away', [['Phone', '(555) 010-1357']])}</details>`;
  },
};
// The demo's family tree: your family, your sister's and your brother-in-law's; "Add a family" grows it by one more family at a time.
const DEMO_TREE = { seen: null, grow: {}, more: 0 };
const dP = (key, name, role) => ({ key, initial: name[0], label: name, title: `${name} · ${role}`, role });
const dK = (key, name, color, birth = '') => ({ key, initial: name[0], label: name, title: name, color, birth });
const DEMO_MORE = [
  { key: 'f:ann', name: "Ann and Raj's family", title: "Open Ann and Raj's family", adults: [dP('p:ann', 'Ann', 'Parent'), dP('p:raj', 'Raj', 'Parent')], kids: [dK('k:zoe', 'Zoe', '#8a5cc2'), dK('k:eli', 'Eli', '#3f78b5')] },
  { key: 'f:lucy', name: "Lucy's family", title: "Open Lucy's family", adults: [dP('p:lucy', 'Lucy', 'Parent')], kids: [dK('k:ivy', 'Ivy', '#2f8f83')] }];
function demoFamilies() {
  return [{ key: 'f:own', name: 'Your family', title: 'Your family, showing', crown: true, on: true, adults: [dP('p:dad', 'Dad', 'Parent'), dP('p:gran', 'Gran', 'Family member')],
    kids: kids().map(k => ({ ...dK('k:' + k.id, k.name, k.color, k.birth), id: k.id })) },
  { key: 'f:sarah', name: "Sarah's family", title: "Open Sarah's family", adults: [dP('p:sarah', 'Sarah', 'Parent'), dP('p:ben', 'Ben', 'Parent')], kids: [dK('k:ava', 'Ava', '#c2577a'), dK('k:jack', 'Jack', '#3f78b5')] },
  { key: 'f:tom', name: "Tom's family", title: "Open Tom's family", adults: [dP('p:tom', 'Tom', 'Parent')], kids: [dK('k:noah', 'Noah', '#2f8f83')] },
  ...DEMO_MORE.slice(0, DEMO_TREE.more)];
}
/** A tap on the demo's tree: a child's card (your own children's day opens), a person's role, a family. */
function demoTreeTap(key) {
  const fams = demoFamilies(), f = fams.find(x => x.key === key || x.adults.some(p => p.key === key) || x.kids.some(k => k.key === key));
  if (key === 'me') return toast('You (Mum): tap your own name in the list below to add your phone number and work details');
  if (!f) return;
  if (f.key === key) {
    if (f.on) { const d = document.querySelector('details[data-grp=famlist]'); if (d) { d.open = true; d.scrollIntoView({ block: 'center', behavior: 'smooth' }); } return; }
    return toast(`In the real app, this opens ${f.name}`);
  }
  const p = f.adults.find(x => x.key === key);
  if (p) return toast(`${p.label} · ${p.role} · ${f.name}`);
  const k = f.kids.find(x => x.key === key), S = $('#sheet'), B = $('#sheetBack');
  S.innerHTML = `<h3 class="kidhead"><span class="av lg" style="--k:${k.color}">${k.initial}</span>${k.label}</h3><p class="note" style="margin-top:0">${f.name}</p>
    <div class="row" style="margin-top:16px"><button class="btn" data-close>Close</button><button class="btn p" id="demoDay">Show ${k.label}'s day</button></div>`;
  S.hidden = B.hidden = false;
  const close = () => { S.hidden = B.hidden = true; }; B.onclick = close; S.querySelector('[data-close]').onclick = close;
  $('#demoDay').onclick = () => { close(); if (!f.on) return toast(`In the real app, this opens ${f.name} at ${k.label}'s day`); setKid(k.id); tab = 'day'; viewDay = startOfDay(Date.now()); render(); window.scrollTo(0, 0); };
}
const DEMO_FAMILIES = [['Your family', 'Leo, Mia, Sam', 'Parent'], ["Sarah's family", 'Ava, Jack', 'Family member'], ["Tom's family", 'Noah', 'Family member']];
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
