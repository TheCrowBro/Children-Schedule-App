'use strict';
/* Stand-ins for the parts of the app that need a phone (sign-in, encryption, sync, Keychain), so the real screens run in a plain page.
   Everything lives in memory: a reload starts again from the sample family. Used only by scripts/build-demo.js. */
const Store = { st: { ok: true, err: '', quarantined: false, recovered: false, onChange: null }, init: async () => {}, load: async () => demoDb(), save() {}, whenSaved: async () => {}, peek: async () => null, backup() {}, quarantine: () => [], usingIndexedDB: false,
  blobPut: async (n, b) => { demoBlobs.set(n, b); }, blobGet: async n => demoBlobs.get(n) || null, blobDel: async n => { demoBlobs.delete(n); } };
const demoBlobs = new Map();   // (pictures added in the demo live in memory)
const Native = { is: false, onBack() {}, onUrl() {}, launchUrl() {}, saveFile: () => Promise.reject(new Error('cancelled')), storeUrl: () => null, openExternal() {}, version: async () => '' };
const Auth = { id: 'demo', signedIn: false, configured: false, init: async () => {} };
const Sync = { st: { people: [{ display_name: 'Mum', is_you: true }, { display_name: 'Dad' }, { display_name: 'Grandpa Joe' }] }, setMyDetails: async () => {}, can: () => true, linked: () => false, isParent: () => true, nameOf: () => '', schedule() {}, pushBaby() {}, onChange: null, onSessionLost: null };
const Cloud = { init: async () => {}, autoBackup() {}, handleOAuthUrl() {} };
const Lock = { init: async () => {}, onChange: null, mode: 'off', enabled: false, minutes: 1, bioToo: true, bioAvailable: false, bioAllowed: false, locked: false, pinLength: 0, wait: 0,
  useBio: async () => 'The app lock is in the phone app, not in this demo.', setPin: async () => 'The app lock is in the phone app, not in this demo.', checkPin: async () => ({ ok: true }), off: async () => {}, setMinutes() {}, setBioToo() {}, unlock: async () => true, reset() {}, clear: async () => {} };
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
    const T = DEMO_TREE, now = Date.now();
    let order = 0;
    const sprout = key => {   // (as in the app: what is new grows in, all of it the first time)
      if (T.grow[key] == null) { if (T.seen && T.seen.has(key)) return null; T.grow[key] = now + Math.min(order++ * 80, 2000); }
      if (now - T.grow[key] > 1000) { delete T.grow[key]; return null; }
      return T.grow[key] - now;
    };
    const kind = T.kind || FamilyTree.speciesFor(myRegion(), I18n.lang(), Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    const { html, keys, width, center } = FamilyTree.draw({ ...demoTreeModel(), sprout, species: kind, dark: Theme.isDark() });
    T.seen = new Set([...(T.seen || []), ...keys]); T.width = width; T.center = center;
    const sw = k => { const c = FamilyTree.look(k); return `<i class="ftsw" style="background:${c.crown};border-color:${c.bark}" aria-hidden="true"></i>`; };
    const tree = `<h2>🌳 Family tree</h2><div class="card ftreeimg"><div class="ftreewrap">${html}</div>
      <div class="ftfoot"><p class="note fkind">${sw(kind)}${DEMO_TREES[kind][0]} · ${DEMO_TREES[kind][1]} <button class="btn ftchange" id="demoKind">Change tree</button></p>
      <p class="note fhint">The tree is the one most common where your family comes from. Tap someone to see who they are, or a child for their day. Parents add grandparents, great-grandparents, aunts, uncles and cousins with the +: try it, and watch the tree grow.</p>
      <button class="btn" data-demoopen style="width:100%;margin-top:10px">+ Add a family</button></div></div>`;
    const list = `<details class="gd famlist" data-grp="famlist" ${openGroups.has('famlist') ? 'open' : ''}><summary><span class="gi">🌳</span><span class="gt"><b>Families and relatives</b><small>Your family, Sarah's family and Tom's family</small></span><span class="chev" aria-hidden="true">›</span></summary><ul class="fbranches">
      <li class="fam on" data-fam="own"><div class="fhead"><span><b>Your family</b><br><small>Parent</small></span><small class="fshow">Showing</small></div><div class="fkids">${kids().map(k => kid(k.name, k.color)).join('')}</div>
        <div class="fpeople">${person('Mum (you)', 'Parent', [['Relationship', 'Mum'], ['Phone', '(555) 010-1234'], ['Place of work', 'Lakeside Library']])}
        ${person('Dad', 'Parent', [['Relationship', 'Dad'], ['Phone', '(555) 010-4444'], ['Place of work', 'Riverside Fire Station'], ['Work phone', '(555) 010-5555']])}
        ${person('Gran', 'Family member: adds entries, changes her own', [['Relationship', 'Grandma'], ['Phone', '(555) 010-7777'], ['Notes', 'Has a car seat in her car']])}</div></li>
      <li class="fam"><div class="fhead"><span><b>Sarah's family</b><br><small>Family member</small></span><button class="btn" data-demoopen>Open</button></div><div class="fkids">${kid('Ava', '#c2577a')}${kid('Jack', '#3f78b5')}</div><p class="note fkin">Family: Sarah and Ben</p></li>
      <li class="fam"><div class="fhead"><span><b>Tom's family</b><br><small>Family member</small></span><button class="btn" data-demoopen>Open</button></div><div class="fkids">${kid('Noah', '#2f8f83')}</div><p class="note fkin">Family: Tom and Priya</p></li></ul></details>`;
    setTimeout(() => {
      document.querySelectorAll('[data-demoopen]').forEach(b => b.onclick = () => toast('In the real app, this opens that family (or adds one)'));
      const pic = document.querySelector('.ftreesvg'), wrap = pic && pic.closest('.ftreewrap');
      const kb = $('#demoKind'); if (kb) kb.onclick = demoPickTree;
      if (pic) {
        pic.onclick = e => { const n = e.target.closest('[data-tk]'); if (n) demoTreeTap(n.dataset.tk); };
        wrap.scrollLeft = T.scroll != null ? T.scroll : Math.max(0, (T.center * pic.clientWidth) / T.width - wrap.clientWidth / 2); wrap.onscroll = () => { T.scroll = wrap.scrollLeft; };
      }
    });
    return `${tree}<div class="card"><b>👨‍👩‍👧 Your family log</b><p class="note">In the real app parents invite people with a QR code (valid for two hours, one use) and approve each request. Tap a person to see the details they added. Everything is end-to-end encrypted, the family tree too, and only relatives see the tree.</p></div>
    ${list}
    <h2>Caregivers and helpers</h2>
    ${person('Jess', 'Babysitter: adds entries, no health notes', [['Relationship', 'Babysitter'], ['Phone', '(555) 010-8888']])}
    ${person('Amy', 'Medical assistant: health notes and medicines', [['Relationship', 'Visiting nurse'], ['Phone', '(555) 010-2468'], ['Place of work', 'Westside Pediatrics']])}
    <div class="card"><div class="stat"><span>A parent can <b>retire</b> a caregiver, babysitter or medical assistant who moves away or stops helping: their access ends, and they stay on the Retired list with their details.</span><button class="btn" data-demoopen style="flex:none">Retire</button></div></div>
    <details class="more retired"><summary>Retired (1)<span class="chev" aria-hidden="true">›</span></summary>${person('Kim', 'Babysitter · retired Mar 3, 2026 · Moved away', [['Phone', '(555) 010-1357']])}</details>`;
  },
};
// The demo's family tree, kept in memory: Mum's side (Nana and Grandpa Joe, Nana's parents remembered, Aunt Sarah with Ben, Ava and
// Jack) and Dad's (Gran and Grandad, Uncle Tom with Priya and Noah). The + adds people, as a parent does in the app.
const DEMO_TREE = { seen: null, grow: {}, scroll: null, tree: FamilyTree.clean({ parents: [
  { id: 'mum00001', name: 'Mum', gp: [{ id: 'nana0001', name: 'Rose', call: 'Nana', gp: [{ id: 'edith001', name: 'Edith', gone: true }, { id: 'arthur01', name: 'Arthur', gone: true }] }, { id: 'joe00001', name: 'Joe', call: 'Grandpa Joe', gp: [] }],
    sibs: [{ id: 'sarah001', name: 'Sarah', call: 'Auntie Sarah', partner: { id: 'ben00001', name: 'Ben' }, kids: [{ id: 'ava00001', name: 'Ava' }, { id: 'jack0001', name: 'Jack' }] }] },
  { id: 'dad00001', name: 'Dad', gp: [{ id: 'gran0001', name: 'Gran', gp: [] }, { id: 'grandad1', name: 'Grandad', gp: [] }],
    sibs: [{ id: 'tom00001', name: 'Tom', call: 'Uncle Tom', partner: { id: 'priya001', name: 'Priya' }, kids: [{ id: 'noah0001', name: 'Noah' }] }] }] }) };
const DEMO_TREES = { oak: ['English oak', 'UK & Ireland'], maple: ['Red maple', 'North America'], beech: ['European beech', 'Central Europe'], birch: ['Silver birch', 'Northern and Eastern Europe'],
  olive: ['Olive tree', 'The Mediterranean and the Middle East'], eucalyptus: ['Eucalyptus', 'Australia & New Zealand'], cherry: ['Cherry blossom', 'East Asia'], banyan: ['Banyan', 'South Asia'],
  mango: ['Mango tree', 'Southeast Asia'], acacia: ['Umbrella acacia', 'Africa'], jacaranda: ['Jacaranda', 'Latin America'] };
/** Try each kind of tree (in the app a parent picks it for the whole family). */
function demoPickTree() {
  const S = $('#sheet'), B = $('#sheetBack'), close = () => { S.hidden = B.hidden = true; }, cur = DEMO_TREE.kind || '';
  const sw = k => { const c = FamilyTree.look(k); return `<i class="ftsw" style="background:${c.crown};border-color:${c.bark}" aria-hidden="true"></i>`; };
  S.innerHTML = `<h3>🌳 Your family's tree</h3><p class="note" style="margin-top:0">Pick the tree that grows most where your family comes from. Everyone in the family sees it.</p>
    <div class="chips ftkinds"><label class="chip"><input type="radio" name="dmKind" value=""${cur ? '' : ' checked'}><span>Automatic (for where you are)</span></label>${FamilyTree.KINDS.map(k => `<label class="chip"><input type="radio" name="dmKind" value="${k}"${cur === k ? ' checked' : ''}><span>${sw(k)}${DEMO_TREES[k][0]} <small>${DEMO_TREES[k][1]}</small></span></label>`).join('')}</div>
    <div class="row" style="margin-top:14px"><button class="btn" data-close>Cancel</button><button class="btn p" id="dmKindSave">Show it</button></div>`;
  S.hidden = B.hidden = false; B.onclick = close; S.querySelector('[data-close]').onclick = close;
  $('#dmKindSave').onclick = () => { DEMO_TREE.kind = (S.querySelector('[name=dmKind]:checked') || {}).value || ''; DEMO_TREE.scroll = null; close(); render(); };
}
const DEMO_KIN = { parent: 'Parent', gp: 'Grandparent', ggp: 'Great-grandparent', sib: 'Aunt or uncle', partner: 'Aunt or uncle', cousin: 'Cousin' };
const DEMO_ADDS = { parent: "Add the children's other parent", gp: 'Add a grandparent', ggp: 'Add a great-grandparent', sib: 'Add an aunt or uncle', partner: 'Add a partner', cousin: 'Add a cousin' };
const COUSIN_COLOURS = ['#c2577a', '#3f78b5', '#2f8f83', '#8a5cc2', '#c98a3d'];
function demoTreeModel() {
  const node = (p, kind) => ({ key: 'p:' + p.id, label: p.call || p.name, initial: p.name[0].toUpperCase(), title: [p.name, p.call, DEMO_KIN[kind]].filter(Boolean).join(' · '), gone: !!p.gone });
  return { title: 'Family tree', rtl: I18n.rtl(), edit: true, text: { parent: 'Parent', gp: 'Grandparent', ggp: 'Great-grandparent', sib: 'Aunt or uncle' }, adds: DEMO_ADDS,
    kids: kids().map(k => ({ key: 'k:' + k.id, label: k.name, initial: k.name[0], title: k.name, color: k.color })),
    parents: DEMO_TREE.tree.parents.map(par => ({ ...node(par, 'parent'),
      gp: par.gp.map(g => ({ ...node(g, 'gp'), gp: g.gp.map(q => node(q, 'ggp')) })),
      sibs: par.sibs.map(sb => ({ ...node(sb, 'sib'), partner: sb.partner ? node(sb.partner, 'partner') : null, kids: sb.kids.map((c, i) => ({ ...node(c, 'cousin'), color: COUSIN_COLOURS[(i + sb.name.length) % COUSIN_COLOURS.length] })) })) })) };
}
/** A tap on the demo's tree: someone's card, a child's day, or adding someone (as a parent would). */
function demoTreeTap(key) {
  const S = $('#sheet'), B = $('#sheetBack'), close = () => { S.hidden = B.hidden = true; }, show = html => { S.innerHTML = html; S.hidden = B.hidden = false; B.onclick = close; S.querySelector('[data-close]').onclick = close; };
  if (key.startsWith('k:')) {
    const k = kidById(key.slice(2)); if (!k) return;
    show(`<h3 class="kidhead"><span class="av lg" style="--k:${k.color}">${k.name[0]}</span>${k.name}</h3><p class="note" style="margin-top:0">Your family</p>
      <div class="row" style="margin-top:16px"><button class="btn" data-close>Close</button><button class="btn p" id="demoDay">Show ${k.name}'s day</button></div>`);
    $('#demoDay').onclick = () => { close(); setKid(k.id); tab = 'day'; viewDay = startOfDay(Date.now()); render(); window.scrollTo(0, 0); };
    return;
  }
  const t = DEMO_TREE.tree;
  if (key.startsWith('+')) {   // a bud: add someone there
    const [kind, at] = key.slice(1).split(':p:'), up = at ? FamilyTree.find(t, at) : null;
    show(`<h3>🌱 ${DEMO_ADDS[kind]}</h3>${up ? `<p class="note" style="margin-top:0">${kind === 'sib' ? `${up.p.name}'s brother or sister` : `${up.p.name}'s parent`}</p>` : ''}
      <label class="f" for="dmName">Name</label><input id="dmName" type="text" maxlength="40">
      <label class="f" for="dmCall">What the children call them</label><input id="dmCall" type="text" maxlength="24" placeholder="e.g. Nana, Grandpa Joe">
      <div class="chips" style="margin-top:12px"><label class="chip"><input type="checkbox" id="dmGone"><span>In loving memory</span></label></div>
      <p class="note">In the real app you can also pick someone already in Little Log: an aunt picked from her own family brings her partner and children along.</p>
      <div class="row" style="margin-top:14px"><button class="btn" data-close>Cancel</button><button class="btn p" id="dmAdd">Add</button></div>`);
    $('#dmAdd').onclick = () => {
      const name = $('#dmName').value.trim(); if (!name) return toast('Enter a name');
      if (!FamilyTree.add(t, kind, at || null, { id: FamilyTree.newId(), name, call: $('#dmCall').value.trim(), gone: $('#dmGone').checked })) return toast('There is no room for more there');
      DEMO_TREE.tree = FamilyTree.clean(t); close(); render(); toast(`${name} is on the tree`);
    };
    return;
  }
  const w = FamilyTree.find(t, key.slice(2)); if (!w) return;
  show(`<h3>${w.p.name}</h3><p class="note" style="margin-top:0">${DEMO_KIN[w.kind]}${w.kind === 'parent' ? '' : ` · ${w.side.name}'s side`}</p>
    ${w.p.call ? `<div class="stat"><span>What the children call them<br><b>${w.p.call}</b></span></div>` : ''}${w.p.gone ? '<p class="note">✦ In loving memory</p>' : ''}
    <p class="note">In the real app a parent can change or remove them here, and someone in Little Log shows their phone number and work details.</p>
    <div class="row" style="margin-top:16px"><button class="btn" data-close>Close</button>${w.kind === 'parent' ? '' : '<button class="btn d" id="dmRemove">Remove from the tree</button>'}</div>`);
  if ($('#dmRemove')) $('#dmRemove').onclick = () => { FamilyTree.remove(t, w.p.id); DEMO_TREE.tree = FamilyTree.clean(t); close(); render(); };
}
const DEMO_FAMILIES = [['Your family', 'Sophie, Lily, Ella, Leo, Mia, Sam', 'Parent'], ["Sarah's family", 'Ava, Jack', 'Family member'], ["Tom's family", 'Noah', 'Family member']];
window.confirm = () => true; window.alert = () => {};
function demoDb() {
  const h = 3600e3, DAYMS = 864e5, t0 = new Date().setHours(0, 0, 0, 0);
  const kids = [{ id: 'c1', name: 'Leo', birth: '', sex: 'boy', color: '', formula: 'Similac 360 Total Care' }, { id: 'k2', name: 'Mia', birth: '', sex: 'girl', color: '' }, { id: 'k3', name: 'Sam', birth: '', sex: 'boy', color: '' }, { id: 'k4', name: 'Ella', birth: '', sex: 'girl', color: '' }, { id: 'k5', name: 'Lily', birth: '', sex: 'girl', color: '' }, { id: 'k6', name: 'Sophie', birth: '', sex: 'girl', color: '' }];
  const ks = Kids.clean(kids), day0 = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const born = new Date(t0); born.setMonth(born.getMonth() - 2); const iso = day0(born);
  ks.slice(0, 3).forEach(k => { k.birth = iso; });
  const ella = ks[3], eb = new Date(t0); eb.setFullYear(eb.getFullYear() - 3); eb.setMonth(eb.getMonth() - 2); ella.birth = day0(eb);   // the triplets' big sister, a preschooler
  const lily = ks[4], lb = new Date(t0); lb.setFullYear(lb.getFullYear() - 8); lb.setMonth(lb.getMonth() - 5); lily.birth = day0(lb);   // at school
  const sophie = ks[5], sb = new Date(t0); sb.setFullYear(sb.getFullYear() - 18); sb.setDate(sb.getDate() - 12); sophie.birth = day0(sb);   // and the eldest, just 18
  const events = [], FORMULA = { c1: 'Similac 360 Total Care', k2: 'Enfamil NeuroPro' }; let n = 0;   // (Mia's usual formula is learned from her feeds)
  const add = (type, ts, data, kid, extra = {}) => { if (ts > Date.now()) return; events.push({ id: 'd' + (n++), type, ts, data, note: '', updated: Date.now(), child: kid.id, ...extra }); };
  for (let day = 6; day >= 0; day--) {
    const b = t0 - day * DAYMS;
    ks.slice(0, 3).forEach((k, i) => {   // (the triplets)
      const o = i * 0.15;
      [0.8, 3.6, 6.4, 9.3, 12.2, 15.1, 18, 21].forEach((x, j) => add('feed', b + (x + o) * h, j % 3 ? { kind: 'bottle', ml: 70 + ((j * 7 + i * 5) % 30), milk: 'Formula', ...(FORMULA[k.id] ? { formula: FORMULA[k.id] } : {}) } : { kind: 'breast', side: j % 2 ? 'Left' : 'Right', min: 12 + j }, k));
      [1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5].forEach((x, j) => add('diaper', b + (x + o) * h, { pee: true, poo: j % 2 === 0, rash: false, color: j % 2 === 0 ? 'Yellow' : undefined }, k));
      add('sleep', b + (0.3 + o) * h, {}, k, { end: b + (3.2 + o) * h }); add('sleep', b + (10.4 + o) * h, {}, k, { end: b + (12 + o) * h }); add('sleep', b + (14.2 + o) * h, {}, k, { end: b + (15.9 + o) * h });
      if ((day + i) % 3 === 0) add('vomit', b + (8 + o) * h, { amount: 'Spit-up', projectile: false }, k);
      add('play', b + (11 + o) * h, { activity: 'Tummy time', min: 10 }, k);
    });
  }
  // Ella's week: meals, milk from a cup, the potty (an accident now and then), a nap, play; and her big moments, and the triplets' first ones
  for (let day = 6; day >= 0; day--) {
    const b = t0 - day * DAYMS, A = ['Most', 'All of it', 'Some', 'Hardly any'];
    add('feed', b + 7 * h, { kind: 'cup', ml: 150, milk: "Cow's milk" }, ella); add('feed', b + 19 * h, { kind: 'cup', ml: 150, milk: "Cow's milk" }, ella);
    add('meal', b + 7.5 * h, { meal: 'Breakfast', foods: ['Oats', 'Banana'], amount: A[day % 2] }, ella); add('meal', b + 10 * h, { meal: 'Snack', foods: ['Apple'], amount: 'All of it' }, ella);
    add('meal', b + 12.25 * h, { meal: 'Lunch', foods: ['Pasta', 'Peas', 'Cheese'], amount: A[(day + 2) % 4] }, ella); add('meal', b + 15.5 * h, { meal: 'Snack', foods: ['Yogurt'], amount: 'All of it' }, ella);
    add('meal', b + 17.75 * h, { meal: 'Dinner', foods: ['Chicken', 'Rice', 'Broccoli'], amount: A[(day + 1) % 4] }, ella);
    [6.9, 9.5, 12, 14.75, 18.5].forEach((x, j) => add('potty', b + x * h, j === 3 && day % 2 ? { pee: true, poo: false, accident: true } : { pee: true, poo: j === 1, where: j === 1 ? 'Toilet' : 'Potty', ...(j === 2 ? { asked: true } : {}) }, ella));
    add('sleep', b + 13 * h, {}, ella, { end: b + 14.5 * h }); add('sleep', b - 4.5 * h, {}, ella, { end: b + 6.75 * h });
    add('play', b + 10.5 * h, { activity: 'Play', min: 30 }, ella);
  }
  // four weeks of school days: Ella at preschool (Grandpa Joe picks up on Wednesdays), Lily at school, with homework, reading and
  // swimming on Tuesdays; a weekend at home
  for (let day = 27; day >= 0; day--) {
    const b = t0 - day * DAYMS, wd = new Date(b).getDay(), school = wd >= 1 && wd <= 5;
    if (school) {
      add('care', b + 8.67 * h, { place: 'Preschool', who: 'Dad', plan: wd === 3 ? 'Grandpa Joe' : 'Mum', at: 15 * 60 + 15 }, ella);
      add('pickup', b + (15.25 + (day % 3) * 0.05) * h, { place: 'Preschool', who: wd === 3 ? 'Grandpa Joe' : 'Mum' }, ella);
      add('care', b + 8.5 * h, { place: 'School', who: 'Dad' }, lily);
      add('pickup', b + (wd === 4 ? 17.5 : 15.5) * h, { place: wd === 4 ? 'After-school club' : 'School', who: wd === 3 ? 'Grandpa Joe' : 'Mum' }, lily);
      add('study', b + 16.5 * h, { kind: 'Homework', subject: ['Spelling', 'Maths', 'Reading log', 'Maths', 'Project'][wd - 1], min: 20 + (day % 3) * 5 }, lily);
    }
    if (wd === 2) add('play', b + 17 * h, { activity: 'Swimming', min: 45 }, lily);
    if (wd === 6) add('play', b + 10 * h, { activity: 'Sport', min: 60 }, lily);
    if (day < 7) {
      add('meal', b + 7.25 * h, { meal: 'Breakfast', foods: ['Oats', 'Banana'], amount: 'All of it' }, lily); add('meal', b + 18 * h, { meal: 'Dinner', foods: ['Fish', 'Potato', 'Peas'], amount: day % 3 ? 'Most' : 'All of it' }, lily);
      add('sleep', b - 4.25 * h, {}, lily, { end: b + 7 * h });
    }
    add('study', b + 19.5 * h, { kind: 'Reading', min: 15, pages: 12 + (day % 9) }, lily);
  }
  const at = (d, x) => { const t = new Date(d); t.setHours(x, 0, 0, 0); return t.getTime(); }, plus = (d, m, dd = 0) => { const t = new Date(d); t.setMonth(t.getMonth() + m); t.setDate(t.getDate() + dd); return t; };
  const moment = (kid, t, what, note = '') => events.push({ id: 'd' + (n++), type: 'moment', ts: t, data: { what }, note, updated: Date.now(), child: kid.id });
  moment(ella, at(plus(eb, 0), 9), 'Born', '3.4 kg, just before breakfast'); moment(ella, at(plus(eb, 2, 3), 10), 'First smile'); moment(ella, at(plus(eb, 11, 20), 18), 'First steps', 'Three wobbly steps to Grandpa');
  moment(ella, at(plus(eb, 12), 15), 'Birthday'); moment(ella, at(plus(eb, 31, 5), 9), 'Out of diapers in the day'); moment(ella, at(plus(eb, 36), 16), 'Birthday', 'Unicorn cake, and a nap at the party');
  moment(ella, at(new Date(t0 - 20 * DAYMS), 9), 'First day of preschool', 'Waved goodbye at the gate'); moment(ella, at(new Date(t0 - 5 * DAYMS), 17), 'Rode a tricycle');
  ks.slice(0, 3).forEach(k => { moment(k, at(born, 6), 'Born'); moment(k, at(plus(born, 0, 4), 14), 'Came home'); });
  moment(lily, at(plus(lb, 0), 4), 'Born'); moment(lily, at(plus(lb, 60, 3), 9), 'First day of school', 'Brand-new shoes'); moment(lily, at(plus(lb, 74, 10), 19), 'Lost a first tooth', 'The tooth fairy left a coin');
  moment(lily, at(plus(lb, 90), 11), 'Rode a bike without training wheels'); moment(lily, at(new Date(t0 - 40 * DAYMS), 16), 'Learned to swim', '25 metres, all the way');
  moment(ks[1], at(plus(born, 1, 12), 8), 'First smile', 'At Ella, of course');
  // the health record: Ella's measurements, vaccines and visits since birth, and the triplets' first ones
  const rec = (kid, t, type, data, note = '') => events.push({ id: 'd' + (n++), type, ts: t, data, note, updated: Date.now(), child: kid.id });
  [[0, 3.4, 50, 34.5], [2, 5.1, 57, 38.5], [4, 6.4, 62, 40.5], [6, 7.3, 65.5, 42], [9, 8.2, 70, 43.5], [12, 9, 74, 44.8], [18, 10.4, 80.5, 46.3], [24, 11.6, 86, 47.2], [30, 12.7, 91, 47.8], [36, 13.9, 95.5, 48.4]]
    .forEach(([m, weight, height, head]) => rec(ella, at(plus(eb, m, m ? 2 : 0), 10), 'growth', { weight, height, head }));
  [[0, 'Hepatitis B', 1], [2, '6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B)', 1], [2, 'Pneumococcal (PCV)', 1], [2, 'Rotavirus', 1], [4, '6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B)', 2],
    [4, 'Rotavirus', 2], [6, '6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B)', 3], [12, 'Measles, mumps and rubella (MMR)', 1], [12, 'Pneumococcal (PCV)', 2], [12, 'Chickenpox (varicella)', 1], [30, 'Flu', 1]]
    .forEach(([m, name, dose]) => rec(ella, at(plus(eb, m, m ? 2 : 1), 11), 'vaccine', { name, dose, place: 'Riverside Clinic' }));
  [[0.5, 'Checkup', 'Dr Lee', ''], [2, 'Checkup', 'Dr Lee', ''], [6, 'Checkup', 'Dr Lee', ''], [12, 'Checkup', 'Dr Lee', ''], [20, 'Unwell', 'Dr Lee', 'Ear infection'], [24, 'Checkup', 'Dr Lee', ''], [30, 'Dentist', 'Dr Okafor', 'First visit'], [36, 'Checkup', 'Dr Lee', '']]
    .forEach(([m, kind, who, why]) => rec(ella, at(plus(eb, Math.floor(m), m % 1 ? 14 : 2), 10), 'visit', { kind, who, ...(why ? { why } : {}) }, kind === 'Unwell' ? 'Antibiotics for a week; better in two days' : ''));
  ks.slice(0, 3).forEach((k, i) => { rec(k, at(born, 7), 'growth', { weight: [2.4, 2.6, 2.3][i], height: [45, 46.5, 44.5][i], head: [32, 32.5, 31.5][i] }); rec(k, at(born, 9), 'vaccine', { name: 'Hepatitis B', dose: 1 }); rec(k, at(plus(born, 0, 10), 10), 'visit', { kind: 'Checkup', who: 'Dr Lee' }); });
  // Sophie's 18 years in big moments, measurements and vaccines (her book is on her Day page), and the family's calendar
  [[0, 'Born', '3.2 kg'], [2, 'First smile'], [11, 'First steps'], [12, 'Birthday'], [30, 'First day at daycare'], [61, 'First day of school', 'Plaits and a red backpack'], [75, 'Lost a first tooth'],
    [84, 'Rode a bike without training wheels'], [133, 'First day at secondary school'], [150, 'Braces off', 'Finally!'], [204, 'Passed the driving test', 'First time, no minors'], [215, 'Exams finished'], [216, 'Turned 18', 'Pizza and karaoke']]
    .forEach(([m, what, note]) => moment(sophie, at(plus(sb, m, m ? 3 : 0), m ? 15 : 6), what, note || ''));
  [[0, 3.2, 49], [12, 9.2, 74], [36, 14, 95], [72, 20.5, 116], [120, 31, 138], [168, 52, 161], [204, 58, 166]].forEach(([m, weight, height]) => rec(sophie, at(plus(sb, m, m ? 5 : 0), 11), 'growth', { weight, height }));
  [[0, 'Hepatitis B', 1], [2, '6-in-1 (diphtheria, tetanus, whooping cough, polio, Hib, hepatitis B)', 1], [12, 'Measles, mumps and rubella (MMR)', 1], [48, 'Measles, mumps and rubella (MMR)', 2], [144, 'HPV', 1],
    [168, 'Tetanus, diphtheria and whooping cough booster (Tdap)', 1], [192, 'MenACWY', 1]].forEach(([m, name, dose]) => rec(sophie, at(plus(sb, m, 4), 10), 'vaccine', { name, dose, place: 'Riverside Clinic' }));
  const plan = (kid, day, h, kind, title, days = 0) => { const s0 = new Date(t0 + day * DAYMS); if (h) s0.setHours(h, 0, 0, 0);
    events.push({ id: 'd' + (n++), type: 'plan', ts: s0.getTime(), ...(days ? { end: t0 + (day + days) * DAYMS } : {}), data: { kind, ...(title ? { title } : {}), ...(h ? {} : { allday: true }) }, note: '', updated: Date.now(), child: kid.id }); };
  const sat = (6 - new Date(t0).getDay() + 7) % 7 || 7, mon = (8 - new Date(t0).getDay()) % 7 || 7;
  plan(lily, sat, 10, 'Match or game', 'Swimming gala'); plan(lily, mon + 7, 0, 'School holiday', 'Half term', 5); plan(ella, mon + 7, 0, 'School holiday', 'Half term', 5);
  plan(ella, 2, 15, 'Appointment', 'Dentist'); plan(sophie, 3, 19, 'Party', 'Leaving party'); plan(lily, 4, 16, 'Lesson', 'Piano');
  // a car trip earlier in the week, with two stretches on the road (travel days keep their own look)
  const away = t0 - 4 * DAYMS, leg = (a, b) => ({ id: 'd' + (n++), type: 'leg', ts: away + a * h, end: away + b * h, data: { means: 'car' }, note: '', updated: Date.now() });
  events.push({ id: 'd' + (n++), type: 'trip', ts: away, end: t0 - 2 * DAYMS, data: { means: 'car' }, note: '', updated: Date.now() }, leg(9, 11.5), leg(13.5, 15.8));
  return { baby: { name: ks[0].name, birth: ks[0].birth, kids: ks }, events, deleted: [], meta: { kid: 'k2', grownSeen: { k6: 1 } } };
}
// the page's own scroll box stands in for the window on wide screens
{ const sc = () => document.getElementById('scroll'), real = window.scrollTo.bind(window);
  window.scrollTo = (x, y) => { const s = sc(), top = typeof x === 'object' ? x.top : y; if (s && getComputedStyle(s).overflowY === 'auto') s.scrollTop = top || 0; else real(x, y); }; }
new MutationObserver(() => Theme.apply(true)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });   // the viewer's light / dark switch
