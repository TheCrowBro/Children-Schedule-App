// A stand-in for the app's Files-app folder plugin (ios/App/App/FolderPlugin.swift), as far as the family folder (folder.js) uses it:
// a folder in iCloud Drive that a parent makes where they choose, shares from the Files app (Collaborate, by Apple ID), and that each
// relative picks in the Files app's picker. In memory, shared by every phone in a test; each phone's Playwright context gets the
// bridge bound to the Apple ID it belongs to, so three phones are three people sharing one folder, as in life. The person's id is
// what the real plugin keeps in the iCloud Keychain (the same on all of one person's devices).
function createFakeFiles() {
  const folders = {}, people = {}, calls = [], pickNext = {};   // pickNext: which folder the Files app's picker "returns" for a person
  let ids = 0, revs = 0;
  const person = email => people[email] || (people[email] = { email, id: 'icloud-' + Buffer.from(email).toString('hex').slice(0, 12), name: email.split('@')[0].replace(/^./, c => c.toUpperCase()), bookmarks: new Map() });
  const access = (fo, email) => !!fo && (fo.owner === email || fo.shared.has(email));
  const folderOf = (email, bm) => { const id = person(email).bookmarks.get(bm), fo = id && folders[id]; if (!fo) throw new Error('missing: no such folder'); if (!access(fo, email)) throw new Error('denied: the folder is not shared with you any more'); return fo; };
  const rev = () => 'r' + (++revs);
  function api(email, a) {
    calls.push(a.op);
    const u = person(email);
    switch (a.op) {
      case 'account': return { id: u.id, name: u.name };
      case 'pick': { const id = pickNext[email]; if (!id || !folders[id] || !access(folders[id], email)) return null; delete pickNext[email]; const bm = 'bm' + (++ids); u.bookmarks.set(bm, id); return { id: bm, name: folders[id].name }; }
      case 'create': {
        let name = String(a.name || 'Folder'), n = 1; const base = name;
        while (Object.values(folders).some(f => f.owner === email && f.name === name)) name = `${base} ${++n}`;
        const id = 'fo' + (++ids), bm = 'bm' + (++ids);
        folders[id] = { id, name, owner: email, shared: new Set(), files: new Map() }; u.bookmarks.set(bm, id);
        return { id: bm, name };
      }
      case 'list': {
        const fo = folderOf(email, a.id), entries = [], dirs = new Set();
        for (const f of fo.files.values()) { entries.push({ path: f.path, rev: f.rev, folder: false }); const segs = f.path.split('/'); for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join('/')); }
        for (const d of dirs) entries.push({ path: d, rev: null, folder: true });
        return { entries };
      }
      case 'read': { const fo = folderOf(email, a.id), f = fo.files.get(String(a.path).toLowerCase()); return { data: f ? f.bytes.toString('base64') : null }; }
      case 'write': {
        const fo = folderOf(email, a.id), k = String(a.path).toLowerCase(), cur = fo.files.get(k);
        if (a.mode === 'add' && cur) throw new Error('conflict: the file exists');
        if (a.mode === 'update' && (!cur || cur.rev !== a.rev)) throw new Error('conflict: the file changed');
        const f = { path: String(a.path), bytes: Buffer.from(a.data || '', 'base64'), rev: rev(), by: email, at: Date.now() }; fo.files.set(k, f);
        return { rev: f.rev };
      }
      case 'remove': { const fo = folderOf(email, a.id); fo.files.delete(String(a.path).toLowerCase()); return {}; }
      case 'share': { folderOf(email, a.id); calls.push('share-sheet'); return {}; }   // (the Files app's sharing opened: the test adds the people, as the parent would there)
      case 'forget': { u.bookmarks.delete(a.id); return {}; }
      default: throw new Error('unknown op ' + a.op);
    }
  }
  /** The bridge for one phone, belonging to the person signed in to iCloud as `email`. */
  async function install(ctx, email) {
    email = email.toLowerCase();
    await ctx.exposeBinding('__icloud', (src, a) => api(email, a));
    await ctx.addInitScript(() => {
      const call = (op, a) => window.__icloud({ op, ...(a || {}) });
      window.LLPlugins.Folder = { account: () => call('account'), pick: () => call('pick'), create: a => call('create', a), list: a => call('list', a), read: a => call('read', a), write: a => call('write', a), remove: a => call('remove', a), share: a => call('share', a), forget: a => call('forget', a) };
    });
  }
  const only = () => { const ks = Object.values(folders); if (ks.length !== 1) throw new Error(`${ks.length} folders`); return ks[0]; };
  return {
    install, folders, people, calls, label: 'iCloud Drive',
    /** The one family folder of a test: its owner and name. */
    only: () => { const f = only(); return { owner: f.owner, name: f.name }; },
    paths: () => [...only().files.values()].map(f => f.path).sort(),
    text: p => { const f = only().files.get(p.toLowerCase()); return f ? f.bytes.toString('utf8') : null; },
    by: p => { const f = only().files.get(p.toLowerCase()); return f ? f.by : null; },
    access: email => access(only(), email.toLowerCase()),
    /** What the parent does in the Files app: Share → Collaborate → add a person by their Apple ID; and taking someone off it. */
    shareWith: email => { only().shared.add(email.toLowerCase()); },
    unshareWith: email => { only().shared.delete(email.toLowerCase()); },
    /** What a person picks in the Files app's picker next: the family folder. */
    willPick: email => { pickNext[email.toLowerCase()] = only().id; },
    account: email => person(email.toLowerCase()).id,
    /** A file deleted by someone with access. */
    damage: p => { const fo = only(), k = p.toLowerCase(); if (!fo.files.has(k)) throw new Error('no ' + p); fo.files.delete(k); },
    /** The calls a sync with nothing new makes. */
    idle: ['list'],
  };
}
module.exports = { createFakeFiles };
