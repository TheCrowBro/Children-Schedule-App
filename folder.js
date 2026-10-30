'use strict';
/* The family folder: a family's log kept in THEIR OWN cloud storage (a folder in a parent's Dropbox or Google Drive, shared with the family), with
   no server of ours anywhere. Everything is end-to-end encrypted on the phones exactly as in server mode (e2ee.js): the cloud sees
   file names, sizes and who wrote what, nothing else. The folder plays the server's part:

     littlelog.json              the family's id (plain)
     keyring.json                the key epoch, the older keys sealed under the newest, the health key's check, rotate_needed
     recovery.json               the recovery key, and the log's keys wrapped to it
     devices/<phone>.json        a phone's public key (public by nature), whose it is, what it is called
     keys/<phone>.json           the log's keys wrapped to that phone: its approval
     join/<phone>.json           a phone asking to be let in (a new person, or a member's new phone), until a parent decides
     members.json                who is in the family and what each may do, the invitations by email, the retired helpers (sealed)
     profile.json                the children (sealed)
     tree.json                   the family tree (sealed)
     events/<phone>/<n>.json     the entries each phone wrote, in order: a phone appends only its own files, so nothing conflicts
     media/<id>, media/<id>.t    pictures and videos (sealed)

   Each phone merges what the others wrote (the newest edit wins, as in server mode), writes its own, and asks the cloud only for
   what changed since last time (a delta cursor), so a sync with nothing new is one small call. Roles and permissions live in
   members.json and are enforced by the apps; the cloud's own sharing (who may edit the folder) is the floor beneath them, and a
   parent's approval is what hands a phone the keys. FOLDER.md tells the whole story.
   Relies on db / save() from app.js (read at call time), on E2EE and on ServerSync's merge helpers. */
const Folder = (() => {
  const K = 'folder.v1';
  const enc = new TextEncoder(), dec = new TextDecoder();
  let c = null;   // { provider, root ('ns:<shared folder id>'), id, name, me: { id, email, name } }
  const persist = () => (c ? Native.Secure.set(K, JSON.stringify(c)) : Native.Secure.remove(K));
  const NAMES = { dropbox: 'Dropbox', google: 'Google Drive' };
  const available = () => Object.keys(NAMES).filter(p => Cloud.available()[p]);
  const TOP = ['littlelog.json', 'keyring.json', 'recovery.json', 'profile.json', 'members.json', 'tree.json', 'devices', 'keys', 'join', 'events', 'media'];
  const J = o => enc.encode(JSON.stringify(o));
  const safeName = n => String(n || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'family';
  /** The same person on every phone: an id made from the cloud account, never the email itself. */
  async function memberId(provider, account) {
    const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('ll1|member|' + provider + '|' + account))), b => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }

  // ---- Dropbox: full-Dropbox access, the family folder a shared folder addressed by its namespace (ns:<id>), the same for everyone ----
  const SCOPES = { dropbox: 'account_info.read files.metadata.read files.content.read files.content.write sharing.read sharing.write', google: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata' };
  const fail = (status, j, text) => {
    const e = new Error((j && (j.error_summary || j.error_description || (typeof j.error === 'string' && j.error))) || (text || '').slice(0, 200) || __('Request failed ({status})', { status }));
    e.status = status; e.tag = (j && j.error_summary) || ''; e.conflict = /conflict/.test(e.tag); e.missing = /not_found/.test(e.tag); e.denied = status === 403 || /no_permission|access_error|insufficient|no_write_permission/.test(e.tag);
    return e;
  };
  const ascii = s => s.replace(/[\u007f-￿]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));   // (HTTP headers carry ASCII only)
  async function call(url, { arg, body, json } = {}) {
    const h = { Authorization: 'Bearer ' + await Cloud.token('dropbox') };
    let b;
    if (arg) { h['Dropbox-API-Arg'] = ascii(JSON.stringify(arg)); if (body) { h['Content-Type'] = 'application/octet-stream'; b = body; } }
    else { h['Content-Type'] = 'application/json'; b = JSON.stringify(json === undefined ? null : json); }
    const r = await Native.fetch(url, { method: 'POST', headers: h, body: b }, arg ? 180000 : 30000);
    if (!r.ok) { const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) { /* plain text */ } throw fail(r.status, j, text); }
    return r;
  }
  const rpc = async (ep, json) => (await call('https://api.dropboxapi.com/2/' + ep, { json })).json();
  const full = p => `${c.root}/${p}`;
  /** A listing entry's path inside the family folder (the cloud reports it under the folder's name, which differs per phone). */
  const rel = p => { const seg = String(p || '').split('/').filter(Boolean); const i = seg.findIndex(s => TOP.includes(s.toLowerCase())); return i < 0 ? null : seg.slice(i).join('/'); };
  const DBX = {
    root: id => 'ns:' + id,
    async account() { const j = await rpc('users/get_current_account', null); return { account: j.account_id, email: String(j.email || '').toLowerCase(), name: (j.name && (j.name.display_name || j.name.given_name)) || '' }; },
    /** Everything in the folder (cursor null), or only what changed since `cursor`: { entries: [{ path, rev, deleted, folder }], cursor }, or { reset: true }. */
    async list(cursor) {
      let j; const entries = [];
      try { j = cursor ? await rpc('files/list_folder/continue', { cursor }) : await rpc('files/list_folder', { path: c.root, recursive: true, include_deleted: true, limit: 2000 }); }
      catch (e) { if (cursor && e.status === 409 && !e.denied && !e.missing) return { reset: true }; throw e; }   // (a cursor the cloud no longer knows: start over)
      for (;;) {
        for (const x of j.entries || []) { const p = rel(x.path_display || x.path_lower); if (p) entries.push({ path: p, rev: x.rev || null, deleted: x['.tag'] === 'deleted', folder: x['.tag'] === 'folder' }); }
        if (!j.has_more) return { entries, cursor: j.cursor };
        j = await rpc('files/list_folder/continue', { cursor: j.cursor });
      }
    },
    async get(p) { try { const r = await call('https://content.dropboxapi.com/2/files/download', { arg: { path: full(p) } }); return new Uint8Array(await r.arrayBuffer()); } catch (e) { if (e.missing) return null; throw e; } },
    /** mode: 'add' (fails when the file exists), 'overwrite', or { update: rev } (fails when someone wrote it since). */
    async put(p, bytes, mode = 'overwrite') {
      const m = typeof mode === 'string' ? mode : { '.tag': 'update', update: mode.update };
      const r = await call('https://content.dropboxapi.com/2/files/upload', { arg: { path: full(p), mode: m, autorename: false, mute: true }, body: bytes });
      return { rev: (await r.json()).rev };
    },
    async del(p) { try { await rpc('files/delete_v2', { path: full(p) }); } catch (e) { if (!e.missing) throw e; } },
    /** A parent's new family folder: made in their Dropbox and shared (with nobody yet), so every phone can address it the same way. */
    async create(name) {
      const f = await rpc('files/create_folder_v2', { path: '/' + safeName(name), autorename: true });
      let s = await rpc('sharing/share_folder', { path: f.metadata.path_lower, force_async: false });
      for (let i = 0; s['.tag'] === 'async_job_id' && i < 30; i++) { await new Promise(r => setTimeout(r, 1000)); s = await rpc('sharing/check_share_job_status', { async_job_id: s.async_job_id }); }
      if (!s.shared_folder_id) throw new Error(N_('Dropbox could not share the folder. Please try again.'));
      return { id: s.shared_folder_id, name: f.metadata.name };
    },
    share: (emails, message) => rpc('sharing/add_folder_member', { shared_folder_id: c.id, members: emails.map(email => ({ member: { '.tag': 'email', email }, access_level: { '.tag': 'editor' } })), quiet: false, custom_message: message || null }),
    async unshare(email) { try { await rpc('sharing/remove_folder_member', { shared_folder_id: c.id, member: { '.tag': 'email', email }, leave_a_copy: false }); } catch (e) { if (e.status !== 409) throw e; } },
    async leave() { try { await rpc('sharing/relinquish_folder_membership', { shared_folder_id: c.id, leave_a_copy: false }); } catch (e) { /* already out, or the owner: the folder stays theirs */ } },
    /** The Little Log family folders shared with this account: already in its Dropbox, or waiting to be accepted. */
    async candidates() {
      const out = [], add = (e, mounted) => { if (/^little log/i.test(e.name || '') && e.shared_folder_id && !out.some(x => x.id === e.shared_folder_id)) out.push({ id: e.shared_folder_id, name: e.name, mounted }); };
      for (const e of (await rpc('sharing/list_folders', { limit: 100 })).entries || []) add(e, !!e.path_lower);
      for (const e of (await rpc('sharing/list_mountable_folders', { limit: 100 })).entries || []) add(e, !!e.path_lower);
      return out;
    },
    async mount(id) { try { await rpc('sharing/mount_folder', { shared_folder_id: id }); } catch (e) { if (!/already_mounted/.test(e.tag) && e.status !== 409) throw e; } },
  };

  // ---- Google Drive: the family folder a folder in a parent's Drive, shared with the family, addressed by its id (the same for everyone) ----
  // Drive has no "write only if nobody wrote since": a shared document is written, then the file's revision list says whether another
  // phone wrote in between; if so, that copy is kept for the next read of the path and the write reports a conflict, so FolderSync
  // applies its change again on top of theirs. Deleting a file is its owner's: another phone empties it instead, and an empty file
  // counts as gone everywhere. Drive's ids for the paths are kept with the log on the phone (db.meta.gdid).
  const GAPI = 'https://www.googleapis.com/drive/v3/', GUP = 'https://www.googleapis.com/upload/drive/v3/', FOLDER_MIME = 'application/vnd.google-apps.folder';
  const GFIELDS = 'id,name,mimeType,size,headRevisionId,md5Checksum,parents,trashed,capabilities(canDelete,canTrash)';
  const gfail = (status, j, text) => {
    const err = j && j.error, reason = (err && err.errors && err.errors[0] && err.errors[0].reason) || (err && err.status) || '';
    const e = new Error((err && err.message) || (text || '').slice(0, 200) || __('Request failed ({status})', { status }));
    e.status = status; e.tag = reason; e.missing = status === 404; e.conflict = false;
    e.denied = status === 403 && !/rate|quota|limit/i.test(reason);   // (403 is also how Drive says "slow down")
    return e;
  };
  async function gcall(method, url, { json, body, type } = {}) {
    const h = { Authorization: 'Bearer ' + await Cloud.token('google') };
    let b;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; b = JSON.stringify(json); }
    else if (body !== undefined) { h['Content-Type'] = type || 'application/octet-stream'; b = body; }
    const r = await Native.fetch(url, { method, headers: h, body: b }, body !== undefined ? 180000 : 30000);
    if (!r.ok) { const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) { /* plain text */ } throw gfail(r.status, j, text); }
    return r;
  }
  const gjson = async (method, url, opts) => { const t = await (await gcall(method, url, opts)).text(); return t ? JSON.parse(t) : null; };
  const gq = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const gone = () => { const e = new Error(N_('The family folder is no longer shared with this account.')); e.status = 403; e.denied = true; return e; };
  const gstash = new Map(), gmine = new Set();   // a copy lost a race to, kept for the next read of its path; the revisions this phone wrote
  const GD = {
    root: id => id,
    /** The paths' Drive ids, kept with the log on the phone (and dropped when the folder changes). */
    ids() { let m = db.meta.gdid; if (!m || m.root !== c.root) m = db.meta.gdid = { root: c.root, files: {}, dirs: {} }; return m; },
    async account() { const u = (await gjson('GET', GAPI + 'about?fields=user')).user || {}; return { account: u.permissionId, email: String(u.emailAddress || '').toLowerCase(), name: u.displayName || '' }; },
    dirOf: p => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); },
    nameOf: p => p.slice(p.lastIndexOf('/') + 1),
    /** A folder's id by path ('' is the family folder), made when `make`. */
    async dirId(d, make) {
      if (!d) return c.root;
      const m = GD.ids(), k = d.toLowerCase(); if (m.dirs[k]) return m.dirs[k];
      const pid = await GD.dirId(GD.dirOf(d), make); if (!pid) return null;
      const name = GD.nameOf(d);
      const j = await gjson('GET', GAPI + `files?q=${encodeURIComponent(`'${pid}' in parents and name = '${gq(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`)}&fields=files(id)&pageSize=5`);
      let id = j.files && j.files[0] && j.files[0].id;
      if (!id && make) id = (await gjson('POST', GAPI + 'files?fields=id', { json: { name, mimeType: FOLDER_MIME, parents: [pid] } })).id;
      if (id) m.dirs[k] = id;
      return id || null;
    },
    /** A file's metadata by path (null when there is none): by its remembered id, else by name in its folder. */
    async meta(p) {
      const m = GD.ids(), k = p.toLowerCase();
      if (m.files[k]) { try { const j = await gjson('GET', GAPI + `files/${m.files[k]}?fields=${GFIELDS}`); if (!j.trashed) return j; } catch (e) { if (!e.missing) throw e; } delete m.files[k]; }
      const pid = await GD.dirId(GD.dirOf(p)); if (!pid) return null;
      const j = await gjson('GET', GAPI + `files?q=${encodeURIComponent(`'${pid}' in parents and name = '${gq(GD.nameOf(p))}' and trashed = false`)}&fields=files(${GFIELDS})&pageSize=5`);
      const f = (j.files || []).find(x => x.mimeType !== FOLDER_MIME) || null;
      if (f) m.files[k] = f.id;
      return f;
    },
    async get(p) {
      const m = GD.ids(), k = p.toLowerCase(), s = gstash.get(k);
      if (s) { if (s.heads.includes(revOf(p))) return s.bytes; gstash.delete(k); }
      let id = m.files[k];
      if (!id) { const f = await GD.meta(p); if (!f) return null; id = f.id; }
      try { const b = new Uint8Array(await (await gcall('GET', GAPI + `files/${id}?alt=media`)).arrayBuffer()); return b.length ? b : null; }
      catch (e) { if (e.missing) { delete m.files[k]; return null; } throw e; }
    },
    async upload(id, bytes) { const rev = (await gjson('PATCH', GUP + `files/${id}?uploadType=media&fields=id,headRevisionId`, { body: bytes })).headRevisionId || null; if (rev) gmine.add(rev); return rev; },
    async make(p, bytes) {
      const pid = await GD.dirId(GD.dirOf(p), true);
      const id = (await gjson('POST', GAPI + 'files?fields=id', { json: { name: GD.nameOf(p), parents: [pid] } })).id;
      GD.ids().files[p.toLowerCase()] = id;
      return { rev: await GD.upload(id, bytes) };
    },
    /** mode: 'add' (fails when the file exists), 'overwrite', or { update: rev }: written, then checked against the revision list; when
        another phone wrote in between, its copy is what the next read of this path returns, and the write reports a conflict. */
    async put(p, bytes, mode = 'overwrite') {
      const conflict = () => { const e = new Error('conflict'); e.conflict = true; e.status = 409; return e; };
      if (mode === 'overwrite') { const id = GD.ids().files[p.toLowerCase()]; if (id) { try { return { rev: await GD.upload(id, bytes) }; } catch (e) { if (!e.missing) throw e; } } }
      const f = await GD.meta(p);
      if (mode === 'add') { if (f && +f.size > 0) throw conflict(); return f ? { rev: await GD.upload(f.id, bytes) } : GD.make(p, bytes); }
      if (mode === 'overwrite') return f ? { rev: await GD.upload(f.id, bytes) } : GD.make(p, bytes);
      const want = mode.update || null, head = f ? f.headRevisionId || null : null;
      if (!f || (head !== want && !gmine.has(head))) throw conflict();   // (a head this phone wrote is fine: the copy being written was read past it)
      const rev = await GD.upload(f.id, bytes);
      const rs = ((await gjson('GET', GAPI + `files/${f.id}/revisions?fields=revisions(id,modifiedTime)&pageSize=1000`)).revisions || []).slice().sort((a, b) => String(a.modifiedTime || '').localeCompare(String(b.modifiedTime || '')));
      const i = rs.findIndex(r => r.id === rev), prev = i > 0 ? rs[i - 1].id : null;
      if (i > 0 && prev !== want && !gmine.has(prev)) {   // lost the race: their copy is what this path reads as until someone else writes
        const b = new Uint8Array(await (await gcall('GET', GAPI + `files/${f.id}/revisions/${prev}?alt=media`)).arrayBuffer());
        gstash.set(p.toLowerCase(), { heads: [want, rev], bytes: b });
        throw conflict();
      }
      return { rev };
    },
    async del(p) {
      const f = await GD.meta(p); if (!f) return;
      const cap = f.capabilities || {};
      try {
        if (cap.canDelete) await gcall('DELETE', GAPI + `files/${f.id}`);
        else if (cap.canTrash) await gjson('PATCH', GAPI + `files/${f.id}?fields=id`, { json: { trashed: true } });
        else await GD.upload(f.id, new Uint8Array(0));   // (another member's file: emptied, which counts as gone)
      } catch (e) { if (!e.missing) throw e; }
      delete GD.ids().files[p.toLowerCase()];
    },
    /** Everything in the folder (cursor null), or what changed since: Drive's changes feed, kept to this folder's files. */
    async list(cursor) {
      const m = GD.ids(), entries = [];
      if (!cursor) {
        let root; try { root = await gjson('GET', GAPI + `files/${c.root}?fields=id,name,trashed`); } catch (e) { if (e.missing) throw gone(); throw e; }
        if (root.trashed) throw gone();
        const start = (await gjson('GET', GAPI + 'changes/startPageToken')).startPageToken;
        m.files = {}; m.dirs = {};
        const queue = [['', c.root]];
        while (queue.length) {
          const [d, id] = queue.shift();
          let page = null;
          do {
            const j = await gjson('GET', GAPI + `files?q=${encodeURIComponent(`'${id}' in parents and trashed = false`)}&fields=nextPageToken,files(${GFIELDS})&pageSize=1000${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
            for (const f of j.files || []) {
              const p = d ? d + '/' + f.name : f.name;
              if (f.mimeType === FOLDER_MIME) { if (!m.dirs[p.toLowerCase()]) { m.dirs[p.toLowerCase()] = f.id; queue.push([p, f.id]); } entries.push({ path: p, rev: null, deleted: false, folder: true }); }
              else { m.files[p.toLowerCase()] = f.id; entries.push({ path: p, rev: f.headRevisionId || f.md5Checksum || null, deleted: !(+f.size > 0), folder: false }); }
            }
            page = j.nextPageToken || null;
          } while (page);
        }
        return { entries, cursor: start };
      }
      let token = cursor, next;
      for (;;) {
        let j;
        try { j = await gjson('GET', GAPI + `changes?pageToken=${encodeURIComponent(token)}&includeRemoved=true&pageSize=1000&spaces=drive&fields=nextPageToken,newStartPageToken,changes(fileId,removed,file(${GFIELDS}))`); }
        catch (e) { if (e.status === 404 || e.status === 410 || (e.status === 400 && /token/i.test(e.message))) return { reset: true }; throw e; }
        const ch = j.changes || [], paths = {}, dirs = {};
        for (const [k, v] of Object.entries(m.files)) paths[v] = k;
        for (const [k, v] of Object.entries(m.dirs)) dirs[v] = k;
        for (const x of ch) if (x.fileId === c.root && (x.removed || (x.file && x.file.trashed))) throw gone();
        for (const x of ch) {   // folders first: a file's folder may be new in the same page
          const f = x.file; if (x.removed || !f || f.mimeType !== FOLDER_MIME || f.trashed) continue;
          const pd = f.parents && f.parents[0], d = pd === c.root ? '' : dirs[pd];
          if (d === undefined) continue;
          const p = (d ? d + '/' : '') + f.name; m.dirs[p.toLowerCase()] = f.id; dirs[f.id] = p.toLowerCase(); entries.push({ path: p, rev: null, deleted: false, folder: true });
        }
        for (const x of ch) {
          const f = x.file, known = paths[x.fileId];
          if (x.removed || !f || f.trashed) { if (known) { entries.push({ path: known, rev: null, deleted: true, folder: false }); delete m.files[known]; } continue; }
          if (f.mimeType === FOLDER_MIME) continue;
          const pd = f.parents && f.parents[0], d = pd === c.root ? '' : dirs[pd];
          if (d === undefined) { if (known) { entries.push({ path: known, rev: null, deleted: true, folder: false }); delete m.files[known]; } continue; }   // (moved out of the folder)
          const p = (d ? d + '/' : '') + f.name; m.files[p.toLowerCase()] = f.id;
          entries.push({ path: p, rev: f.headRevisionId || f.md5Checksum || null, deleted: !(+f.size > 0), folder: false });
        }
        if (j.newStartPageToken) { next = j.newStartPageToken; break; }
        token = j.nextPageToken; if (!token) { next = cursor; break; }
      }
      return { entries, cursor: next };
    },
    /** A parent's new family folder: made in their Drive (shared with nobody yet). */
    async create(name) { const j = await gjson('POST', GAPI + 'files?fields=id,name', { json: { name, mimeType: FOLDER_MIME } }); return { id: j.id, name: j.name }; },
    async share(emails, message) { for (const emailAddress of emails) await gjson('POST', GAPI + `files/${c.root}/permissions?sendNotificationEmail=true${message ? '&emailMessage=' + encodeURIComponent(message) : ''}&fields=id`, { json: { role: 'writer', type: 'user', emailAddress } }); },
    perms: async () => (await gjson('GET', GAPI + `files/${c.root}/permissions?fields=permissions(id,emailAddress,role)&pageSize=100`)).permissions || [],
    async unshare(email) { for (const p of await GD.perms()) if (String(p.emailAddress || '').toLowerCase() === email && p.role !== 'owner') await gcall('DELETE', GAPI + `files/${c.root}/permissions/${p.id}`).catch(e => { if (!e.missing) throw e; }); },
    async leave() { try { await gcall('DELETE', GAPI + `files/${c.root}/permissions/${c.me.acct}`); } catch (e) { /* the owner, or already out: the folder stays theirs */ } },
    /** The Little Log family folders this account can open: shared with it, or its own. */
    async candidates() {
      const out = [], q = async cond => (await gjson('GET', GAPI + `files?q=${encodeURIComponent(`${cond} and mimeType = '${FOLDER_MIME}' and name contains 'Little Log' and trashed = false`)}&fields=files(id,name)&pageSize=100`)).files || [];
      for (const f of [...await q('sharedWithMe = true'), ...await q("'me' in owners")]) if (/^little log/i.test(f.name || '') && !out.some(x => x.id === f.id)) out.push({ id: f.id, name: f.name, mounted: true });
      return out;
    },
    mount: async () => {},
  };
  const BY = { dropbox: DBX, google: GD };
  const backend = () => BY[(c && c.provider) || 'dropbox'];
  const B = () => backend();

  // ---- files, read and written as JSON, with a small cache by revision ----
  const cache = new Map();   // path (lower) → { rev, json }
  const revOf = p => (typeof FolderSync !== 'undefined' ? FolderSync.revOf(p) : null);
  async function read(p) {
    const r = revOf(p), hit = cache.get(p.toLowerCase());
    if (hit && r && hit.rev === r) return hit.json;
    const b = await B().get(p); if (!b) return null;
    let j = null; try { j = JSON.parse(dec.decode(b)); } catch (e) { return null; }
    cache.set(p.toLowerCase(), { rev: r, json: j });
    return j;
  }
  async function write(p, o, mode = 'overwrite') {
    let r; try { r = await B().put(p, J(o), mode); } catch (e) { if (e.conflict) cache.delete(p.toLowerCase()); throw e; }   // (lost a race: the next read is the newer copy)
    cache.set(p.toLowerCase(), { rev: r.rev, json: o }); if (typeof FolderSync !== 'undefined') FolderSync.noteRev(p, r.rev); return r;
  }
  const paths = prefix => (typeof FolderSync !== 'undefined' ? FolderSync.paths(prefix) : []);
  async function readAll(prefix) { const out = []; for (const p of paths(prefix)) { const j = await read(p); if (j) out.push(j); } return out; }

  // ---- the key directory for e2ee.js: what the server's functions did, as files in the folder ----
  const dir = {
    async registerDevice(name, pub) { const id = E2EE.uuid(); await write(`devices/${id}.json`, { v: 1, id, user: c.me.id, pub, name, created: Date.now() }, 'add'); return id; },
    async myDevices() { if (typeof FolderSync !== 'undefined') await FolderSync.refreshIndex(); return (await readAll('devices/')).filter(d => d.user === c.me.id).map(d => ({ id: d.id, name: d.name, created_at: d.created, pubkey: d.pub })); },
    async getKeyring() { const k = await read('keyring.json'); return k ? [k] : []; },
    async myGrant(baby, device) { const g = await read(`keys/${device}.json`); return g ? [g] : []; },
    grantDevice: (baby, device, g) => write(`keys/${device}.json`, { epoch: E2EE.epoch(baby), wrap_main: g.wrap_main, wrap_health: g.wrap_health || null, auth: g.auth || null, tag: g.tag }),
    async createBaby(a) {
      await write('littlelog.json', { v: 1, family: a.baby, created: Date.now() }, 'add');
      await write('keyring.json', { epoch: 1, keyring_main: null, keyring_health: null, health_check: a.health_check, rotate_needed: false });
      await write('recovery.json', { epoch: 1, recovery_pub: a.recovery_pub, recovery_priv_wrapped: a.recovery_priv_wrapped, wrap_main: a.recovery_grant.wrap_main, wrap_health: a.recovery_grant.wrap_health, tag: a.recovery_grant.tag });
      await write(`keys/${a.device}.json`, { epoch: 1, wrap_main: a.grant.wrap_main, wrap_health: a.grant.wrap_health, auth: null, tag: a.grant.tag });
      await write('profile.json', { epoch: 1, blob: a.profile, updated: Date.now() });
      return a.baby;
    },
    async listDevices() {
      const [ds, mem] = [await readAll('devices/'), typeof FolderSync !== 'undefined' ? FolderSync.members() : null];
      const out = [];
      for (const d of ds) {
        const g = await read(`keys/${d.id}.json`), m = mem && mem.members[d.user];
        out.push({ grantee: 'd:' + d.id, pubkey: d.pub, user_id: d.user, has_grant: !!g, epoch: g ? g.epoch : null, tag: g ? g.tag : null, view_health: !!m && (m.role === 'parent' || !!(m.perms && m.perms.view_health)), device_name: d.name, person: m ? m.name : '' });
      }
      return out;
    },
    async listRecovery() { const r = await read('recovery.json'); return r ? [{ recovery_pub: r.recovery_pub, tag: r.tag, epoch: r.epoch }] : []; },
    async getRecovery() { const r = await read('recovery.json'); return r ? [r] : []; },
    async rotateKeys(baby, a) {
      for (const g of a.grants) {
        if (g.grantee === 'recovery') { const r = (await read('recovery.json')) || {}; await write('recovery.json', { ...r, epoch: a.epoch, wrap_main: g.wrap_main, wrap_health: g.wrap_health, tag: g.tag }); }
        else await write(`keys/${g.grantee.slice(2)}.json`, { epoch: a.epoch, wrap_main: g.wrap_main, wrap_health: g.wrap_health || null, auth: g.auth || null, tag: g.tag });
      }
      await write('profile.json', { epoch: a.epoch, blob: a.profile, updated: Date.now() });
      await write('keyring.json', { epoch: a.epoch, keyring_main: a.keyring_main, keyring_health: a.keyring_health, health_check: a.health_check, rotate_needed: false });
    },
    setRecovery: (baby, a) => write('recovery.json', { epoch: E2EE.epoch(baby), recovery_pub: a.pub, recovery_priv_wrapped: a.priv_wrapped, wrap_main: a.wrap_main, wrap_health: a.wrap_health, tag: a.tag }),
  };
  /** Pictures and videos, as files in the folder (media.js). */
  const media = { up: (b, name, bytes) => B().put('media/' + name, bytes, 'overwrite'), down: (b, name) => B().get('media/' + name), del: (b, name) => B().del('media/' + name) };

  return {
    NAMES, SCOPES, available, label: p => NAMES[p] || p, dir, media, read, write, readAll, backend, safeName,
    async init() { try { const v = await Native.Secure.get(K); c = v ? JSON.parse(v) : null; } catch (e) { c = null; } if (c) E2EE.setDir(dir); },
    /** In a family folder (or waiting to be let into one). */
    get on() { return !!(c && c.root); },
    /** A cloud account connected, the family folder chosen or not. */
    get attached() { return !!(c && c.me); },
    get me() { return c ? c.me : null; },
    get provider() { return c ? c.provider : null; },
    get name() { return c ? c.name : ''; },
    /** Starts the cloud sign-in (it comes back through the app's URL: Cloud.handleOAuthUrl, then attach). */
    connect: p => Cloud.connect(p, SCOPES[p]),
    /** The cloud account just signed in becomes this phone's identity for the family folder. */
    async attach(p) {
      const a = await BY[p].account();
      c = { provider: p, root: null, id: null, name: '', me: { id: await memberId(p, a.account), acct: a.account, email: a.email, name: a.name } };
      await persist(); E2EE.setDir(dir); cache.clear();
    },
    /** A parent's new family folder in their cloud. */
    async createFamily(name) { const f = await B().create('Little Log (' + safeName(name) + ')'); c.root = B().root(f.id); c.id = f.id; c.name = f.name; await persist(); cache.clear(); },
    candidates: () => B().candidates(),
    /** Use a family folder shared with this account: returns the family's id, or throws when it is not one of ours. */
    async join(cand) {
      if (!cand.mounted) await B().mount(cand.id);
      c.root = B().root(cand.id); c.id = cand.id; c.name = cand.name; cache.clear();
      let mk = null; try { mk = await read('littlelog.json'); } catch (e) { c.root = null; c.id = null; throw e; }
      if (!mk || typeof mk.family !== 'string') { c.root = null; c.id = null; throw new Error(N_('That folder is not a Little Log family folder (yet). Ask the parent to open their Little Log once.')); }
      await persist(); return mk.family;
    },
    /** Leave the folder behind (the cloud stays connected: the next screen offers the folders shared with this account). */
    async disconnect() { if (c) { c.root = null; c.id = null; c.name = ''; } cache.clear(); await persist(); },
    /** Forget the cloud account and the folder (this phone is cleared). */
    async forget() { c = null; cache.clear(); await persist(); E2EE.setDir(null); },
  };
})();

/* The sync for a family folder: what ServerSync is for a family server, over files (see the top of this file). The app talks to
   `Sync`, which is whichever of the two this phone uses. */
const FolderSync = (() => {
  const st = { state: 'idle', at: 0, err: '', denied: 0, needMfa: false, needsAccess: false, rotateNeeded: false, bad: 0, memberships: [], people: [], requests: [], invites: [], myRequests: [], devices: [], familyRequests: {}, familyPeople: {}, retired: [], server: null, tree: undefined };
  let busy = false, busyAt = 0, again = false, timer = null, started = false, failures = 0, retryAt = 0, mem = null, flight = Promise.resolve();
  const notify = changed => { if (FolderSync.onChange) FolderSync.onChange(changed); };
  const B = () => Folder.backend();
  const enabled = () => Folder.on;
  const linked = () => enabled() && !!db.meta.babyId;
  const TREE_MAX = 32768;

  // ---- permissions (the apps enforce them; the cloud's sharing is the floor) ----
  const isParent = () => !linked() || db.meta.role === 'parent';
  const mine = e => !e || !e.by || e.by === Auth.id;
  function can(action, ev) {
    if (!linked() || db.meta.role === 'parent') return true;
    const p = db.meta.perms || {};
    switch (action) {
      case 'add': return !!p.add_entries;
      case 'edit': return !!(mine(ev) ? p.edit_own : p.edit_others);
      case 'delete': return !!(mine(ev) ? p.delete_own : p.delete_others);
      case 'health': return !!p.view_health;
      case 'profile': return !!p.edit_profile;
      case 'people': return !!p.view_people;
    }
    return false;
  }
  const nameOf = id => { const p = st.people.find(x => x.user_id === id); if (p) return p.is_you ? __('you') : p.display_name; const r = st.retired.find(x => x.user_id === id); return r ? r.display_name : ''; };

  // ---- the index: what is in the folder, by path, and what this phone has read ----
  const idx = () => db.meta.fidx || (db.meta.fidx = { cursor: null, files: {}, seen: {} });
  const low = p => String(p).toLowerCase();
  const revOf = p => idx().files[low(p)] || null;
  const fresh = p => !!revOf(p) && idx().seen[low(p)] !== revOf(p);
  const mark = p => { if (revOf(p)) idx().seen[low(p)] = revOf(p); };
  const noteRev = (p, rev) => { idx().files[low(p)] = rev; idx().seen[low(p)] = rev; };
  const paths = prefix => Object.keys(idx().files).filter(p => p.startsWith(low(prefix)));
  const forgetSeen = prefix => { const s = idx().seen; for (const k of Object.keys(s)) if (k.startsWith(low(prefix))) delete s[k]; };
  /** Brings the index up to date: one small call when nothing changed. `full` lists everything again. */
  async function refreshIndex(full) {
    if (!Folder.on) return;
    const x = idx(); let r = await B().list(full ? null : x.cursor);
    if (r.reset) { x.cursor = null; x.files = {}; r = await B().list(null); }
    else if (full) x.files = {};
    for (const e of r.entries) { if (e.folder) continue; if (e.deleted) delete x.files[low(e.path)]; else x.files[low(e.path)] = e.rev; }
    x.cursor = r.cursor;
  }

  // ---- members.json: who is in, what they may do; sealed under the main key ----
  const members = () => mem;
  async function pullMembers() {
    const b = db.meta.babyId; if (!E2EE.hasKeys(b)) return false;
    if (!mem || fresh('members.json')) {
      const j = await Folder.read('members.json');
      if (j && j.blob) { const m = await E2EE.openDoc(b, 'members', j.blob, j.epoch); if (m && m.members) { mem = { members: m.members, retired: m.retired || [], invites: m.invites || {} }; mark('members.json'); } }
    }
    if (!mem) return false;   // (the creator writes it a moment after the keys)
    const me = mem.members[Auth.id];
    if (!me) { lostAccess(); return false; }
    db.meta.role = me.role; db.meta.perms = me.perms || {};
    await peopleRows();
    return true;
  }
  async function peopleRows() {
    const b = db.meta.babyId, all = can('people'), rows = [];
    for (const [id, m] of Object.entries(mem.members)) {
      const you = id === Auth.id;
      if (!all && !you) { rows.push({ user_id: id, display_name: m.name, is_you: false, role: null, perms: null, info: null }); continue; }
      rows.push({ user_id: id, display_name: m.name, email: m.email, role: m.role, perms: m.perms, is_you: you, details_epoch: m.details ? m.details.epoch : 0, info: m.details ? await E2EE.openDetails(b, id, m.details.blob, m.details.epoch) : null });
    }
    st.people = rows;
    st.invites = Object.entries(mem.invites).filter(([e]) => !Object.values(mem.members).some(m => m.email === e)).map(([email, i]) => ({ email, code: email, role: i.role, perms: i.perms, at: i.at }));
    st.retired = [];
    for (const r of mem.retired) st.retired.push({ ...r, info: r.details ? await E2EE.openDetails(b, r.user_id, r.details.blob, r.details.epoch).catch(() => null) : null });
  }
  /** Change members.json (parents, or your own line): the newest copy is read, changed by `fn` and written back; written again when
      someone else wrote it meanwhile. */
  async function saveMembers(fn) {
    const b = db.meta.babyId;
    for (let i = 0; i < 6; i++) {
      await refreshIndex();
      const j = await Folder.read('members.json'), rev = revOf('members.json');
      const m = j && j.blob ? await E2EE.openDoc(b, 'members', j.blob, j.epoch) : null;
      const cur = m && m.members ? { members: m.members, retired: m.retired || [], invites: m.invites || {} } : { members: {}, retired: [], invites: {} };
      if (fn(cur) === false) return cur;
      const { blob, epoch } = await E2EE.sealDoc(b, 'members', cur);
      try { await Folder.write('members.json', { v: 1, epoch, blob, updated: Date.now(), by: Auth.id }, rev ? { update: rev } : 'add'); }
      catch (e) { if (e.conflict) continue; throw e; }
      mem = cur; await peopleRows(); return cur;
    }
    throw new Error(N_('The family list changed meanwhile: try again'));
  }

  // ---- keys ----
  async function pullKeys() {
    const b = db.meta.babyId; await E2EE.load(b);
    const kr = await Folder.read('keyring.json');
    if (!kr) { st.needsAccess = true; st.state = 'needs-access'; return false; }
    st.rotateNeeded = !!kr.rotate_needed;
    const want = db.meta.role === 'parent' || !!(db.meta.perms && db.meta.perms.view_health), had = E2EE.hasHealthKey(b);
    const own = E2EE.device ? `keys/${E2EE.device.id}.json` : null;
    if (!E2EE.hasKeys(b) || E2EE.epoch(b) < kr.epoch || (want && !had && own && fresh(own))) { await E2EE.refresh(b, db.meta, { health: want }); if (own) mark(own); }
    if (!had && E2EE.hasHealthKey(b)) forgetSeen('events/');   // health entries were skipped until now: read everything again
    if (db.meta.kinds !== E2EE.KINDS) forgetSeen('events/');   // the app was updated and knows new kinds of entry
    if (!E2EE.hasKeys(b) || E2EE.epoch(b) < kr.epoch) { st.needsAccess = true; st.state = 'needs-access'; st.err = ''; return false; }
    st.needsAccess = false; return true;
  }
  async function rotateNow() { const b = db.meta.babyId; if (!E2EE.hasKeys(b)) return; await E2EE.rotate(b, db.baby); st.rotateNeeded = false; }

  // ---- the children, the entries, the tree ----
  async function pullProfile() {
    const b = db.meta.babyId;
    if (db.meta.babyDirty) {
      db.meta.babyDirty = false;
      try { const blob = await E2EE.encryptProfile(b, db.baby); await Folder.write('profile.json', { epoch: E2EE.epoch(b), blob, updated: Date.now() }); return; }
      catch (e) { db.meta.babyDirty = true; throw e; }
    }
    if (!fresh('profile.json')) return;
    const j = await Folder.read('profile.json');
    if (j && j.blob) { const p = await E2EE.decryptProfile(b, j.blob, j.epoch); if (p && !db.meta.babyDirty) db.baby = p; }
    mark('profile.json');
  }
  const okRow = r => r && typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.id) && Number.isFinite(+r.updated) && (r.deleted === true || typeof r.blob === 'string');
  const isEvents = p => /^events\/[^/]+\/\d+\.json$/.test(p);
  const ownEvents = p => !!E2EE.device && p.startsWith(low(`events/${E2EE.device.id}/`));
  async function pullEvents() {
    let n = 0;
    for (const p of paths('events/').filter(p => isEvents(p) && !ownEvents(p) && fresh(p)).sort()) {
      const j = await Folder.read(p);
      if (j && Array.isArray(j.rows)) n += ServerSync.merge(await ServerSync.decode(j.rows.filter(okRow).slice(0, 2000)));
      mark(p);
    }
    n += await ServerSync.retryStash();
    db.meta.kinds = E2EE.KINDS;
    return n;
  }
  const nextSeq = me => { let m = 0; for (const p of paths(`events/${me}/`)) { const x = /\/(\d+)\.json$/.exec(p); if (x) m = Math.max(m, +x[1]); } return Math.max(m, db.meta.fseq || 0) + 1; };
  async function pushEvents() {
    const b = db.meta.babyId, me = E2EE.device.id, { rows, cut } = await ServerSync.encodeRows(b);
    for (let i = 0; i < rows.length; i += 500) {
      let seq = nextSeq(me);
      for (let t = 0; ; t++) {
        const p = `events/${me}/${String(seq).padStart(6, '0')}.json`;
        try { await Folder.write(p, { v: 1, device: me, by: Auth.id, at: Date.now(), rows: rows.slice(i, i + 500).map(r => ({ ...r, created_by: Auth.id })) }, 'add'); db.meta.fseq = seq; break; }
        catch (e) { if (e.conflict && t < 20) { seq++; continue; } throw e; }
      }
    }
    db.meta.pushedAt = cut;
    db.deleted = db.deleted.filter(t => t.updated > cut);
  }
  async function loadTree() {
    const b = db.meta.babyId; if (!b) return null;
    const j = await Folder.read('tree.json');
    const t = j && j.blob ? await E2EE.openTree(b, j.blob, j.epoch) : null;
    mark('tree.json'); st.tree = t;
    if (JSON.stringify(db.meta.tree || null) !== JSON.stringify(t)) { if (t) db.meta.tree = t; else delete db.meta.tree; save(true); }
    return t;
  }
  async function editTree(fn, start) {
    const b = db.meta.babyId;
    for (let i = 0; i < 6; i++) {
      await refreshIndex();
      const j = await Folder.read('tree.json'), rev = revOf('tree.json');
      const t = FamilyTree.clean((j && j.blob ? await E2EE.openTree(b, j.blob, j.epoch) : null) || start);
      if (fn(t) === false) throw new Error(N_('The family tree changed meanwhile: try again'));
      const { blob, epoch } = await E2EE.sealTree(b, t);
      if (blob.length > TREE_MAX) throw new Error(N_('There is no room on the family tree for more people: take someone off it, or shorten the names'));
      try { await Folder.write('tree.json', { v: 1, epoch, blob, updated: Date.now() }, rev ? { update: rev } : 'add'); }
      catch (e) { if (e.conflict) continue; throw e; }
      st.tree = t; db.meta.tree = t; save(true); return t;
    }
    throw new Error(N_('The family tree changed meanwhile: try again'));
  }

  // ---- requests to join, phones, people (parents) ----
  async function loadAdmin() {
    if (!isParent() || !mem) return;
    const reqs = [];
    for (const p of paths('join/')) {
      const j = await Folder.read(p); if (!j || !j.device || !j.pub) continue;
      if (mem.members[j.user]) continue;   // (a member's new phone: see loadDevices)
      const inv = mem.invites[String(j.email || '').toLowerCase()] || null;
      reqs.push({ id: j.device, device_id: j.device, device_pub: j.pub, user: j.user, email: j.email || '', display_name: j.name || '', role: inv ? inv.role : 'caregiver', perms: inv ? inv.perms : null, qrVerified: false, fingerprint: await E2EE.fingerprint(j.pub), baby_id: db.meta.babyId, platform: j.platform });
    }
    st.requests = reqs;
  }
  async function loadDevices() {
    const rows = await Folder.dir.listDevices();
    for (const d of rows) d.fingerprint = await E2EE.fingerprint(d.pubkey);
    // (a phone without keys is waiting: a member's new phone, or someone not let in yet; only members' show as phones)
    st.devices = rows.filter(d => d.has_grant || (mem && mem.members[d.user_id]));
    return st.devices;
  }
  const pendingPhones = () => st.devices.filter(d => !d.has_grant && !(E2EE.device && d.grantee === 'd:' + E2EE.device.id));
  async function approvePhone(d) { await E2EE.approveDevice(db.meta.babyId, d); await B().del(`join/${d.grantee.slice(2)}.json`); await refreshIndex(); await loadDevices(); }
  const myDevices = () => Folder.dir.myDevices();
  async function removePhone(id) {
    await B().del(`keys/${id}.json`); await B().del(`devices/${id}.json`); await refreshIndex();
    if (E2EE.device && E2EE.device.id === id) return;
    if (isParent() && E2EE.hasKeys(db.meta.babyId)) await rotateNow(); else await askRotation();
    await loadDevices().catch(() => {}); schedule(300);
  }
  /** Someone who cannot change the keys (not a parent) asks the parents' phones to, on their next sync. */
  async function askRotation() { const kr = (await Folder.read('keyring.json')) || {}; await Folder.write('keyring.json', { ...kr, rotate_needed: true }); }
  async function recover(code) { await E2EE.unlockWithRecovery(db.meta.babyId, code, db.meta); st.needsAccess = false; save(true); run(true); }
  const newRecoveryCode = () => E2EE.replaceRecovery(db.meta.babyId);
  const securityCode = () => E2EE.securityCode(db.meta.babyId);
  const activity = async () => [];
  /** Approve (keys for their phone, a line in the family list) or deny a request to join. */
  async function decide(req, approve, opts = {}) {
    const b = db.meta.babyId;
    if (approve) {
      const g = await E2EE.grantForRequest(b, req, opts);
      await Folder.dir.grantDevice(b, req.device_id, g);
      await saveMembers(m => { if (!m.members[req.user]) m.members[req.user] = { name: req.display_name || req.email, email: req.email, role: req.role, perms: req.perms || null, since: Date.now() }; });
    }
    await B().del(`join/${req.device_id}.json`);
    await refreshIndex(); await loadAdmin(); await loadDevices().catch(() => {});
  }
  /** Share the family folder with someone (their cloud email), with the role they will get once they ask to join and are approved. */
  async function shareWith(emails, role, perms, message) {
    emails = emails.map(e => String(e).trim().toLowerCase()).filter(e => /^\S+@\S+\.\S+$/.test(e));
    if (!emails.length) throw new Error(N_('Enter a valid email address'));
    await B().share(emails, message);
    await saveMembers(m => { for (const e of emails) m.invites[e] = { role, perms: perms || null, by: Auth.id, at: Date.now() }; });
  }
  async function rescind(email) { await B().unshare(email); await saveMembers(m => { delete m.invites[email]; }); }
  async function setMember(user, role, perms) {
    const b = db.meta.babyId, p = mem && mem.members[user]; if (!p) return;
    const had = p.role === 'parent' || !!(p.perms && p.perms.view_health), will = role === 'parent' || !!(perms && perms.view_health);
    if (will && !had) for (const g of await E2EE.healthGrants(b, user)) { const k = await Folder.read(`keys/${g.device}.json`); if (k) await Folder.write(`keys/${g.device}.json`, { ...k, wrap_health: g.wrap_health }); }
    await saveMembers(m => { if (m.members[user]) { m.members[user].role = role; m.members[user].perms = role === 'parent' ? null : perms; } });
    if (had && !will) await rotateNow();   // (their phones keep the old health key: a new one for everyone else)
    schedule(300);
  }
  const renameMember = (user, name) => saveMembers(m => { if (m.members[user]) m.members[user].name = String(name || '').trim().slice(0, 60); });
  const setDisplayName = name => renameMember(Auth.id, name);
  async function setMyDetails(d) { const { blob, epoch } = await E2EE.sealDetails(db.meta.babyId, Auth.id, d); await saveMembers(m => { if (m.members[Auth.id]) m.members[Auth.id].details = { blob, epoch }; }); }
  const resetMfa = async () => {};
  /** Their phones' keys and lines go, the folder is unshared with them, and the keys change (a parent's phone does that now). */
  async function dropUser(user, email) {
    for (const d of await Folder.dir.listDevices()) if (d.user_id === user) { await B().del(`keys/${d.grantee.slice(2)}.json`); await B().del(`devices/${d.grantee.slice(2)}.json`); }
    for (const p of paths('join/')) { const j = await Folder.read(p); if (j && j.user === user) await B().del(p); }
    if (email) await B().unshare(email);
    await refreshIndex();
  }
  async function removeMember(user) {
    if (user === Auth.id) {   // leaving: this phone's keys go, the parents' phones change the keys, and the folder leaves this cloud account
      const me = E2EE.device;
      if (me) { await B().del(`keys/${me.id}.json`).catch(() => {}); await B().del(`devices/${me.id}.json`).catch(() => {}); }
      await askRotation().catch(() => {});
      await B().leave();
      lostAccess(); return;
    }
    const p = mem && mem.members[user], email = p ? p.email : '';
    await saveMembers(m => { delete m.members[user]; if (email) delete m.invites[email]; });
    await dropUser(user, email);
    await rotateNow(); schedule(300);
  }
  async function retireMember(user, reason) {
    const p = mem && mem.members[user]; if (!p) return;
    await saveMembers(m => { const q = m.members[user]; if (!q) return; delete m.members[user]; if (q.email) delete m.invites[q.email]; m.retired.push({ id: E2EE.uuid(), user_id: user, display_name: q.name, role: q.role, retired_at: new Date().toISOString(), reason: reason || '', details: q.details || null }); });
    await dropUser(user, p.email);
    await rotateNow(); schedule(300);
  }
  const loadRetired = async () => st.retired;
  const forgetRetired = id => saveMembers(m => { m.retired = m.retired.filter(r => r.id !== id); });
  const loadPeople = async () => { await refreshIndex(); await pullMembers(); return st.people; };

  // ---- the family (one per phone), joining, starting ----
  async function loadMemberships() {
    st.memberships = linked() ? [{ id: db.meta.babyId, role: db.meta.role, perms: db.meta.perms || {}, name: db.baby.name, birth: db.baby.birth, kids: db.baby.kids }] : [];
    return st.memberships;
  }
  const loadMyRequests = async () => st.myRequests;
  const loadFamilyRequests = async () => st.familyRequests;
  const loadFamilyPeople = async () => st.familyPeople;
  const choose = async id => { if (id !== db.meta.babyId) return false; run(true); return true; };
  const unsent = d => ServerSync.unsent(d);
  const unsentKept = async () => ({});
  const dropKept = async () => {};
  function pushBaby() { db.meta.babyDirty = true; save(); schedule(500); }
  /** A parent starts the family's log: the folder in their cloud, the keys, the recovery code (returned, shown once). */
  async function createBaby(name, birth, mine, sex) {
    if (!Folder.attached) throw new Error(N_('Connect your cloud first'));
    await Folder.createFamily(name);
    db.meta.recoveryAck = false;
    let created;
    try { created = await E2EE.createLog({ kids: Kids.clean([{ id: 'c1', name, birth: birth || '', sex }]) }, mine); } catch (e) { delete db.meta.recoveryAck; await Folder.disconnect(); save(true); throw e; }
    const { babyId: id, code } = created;
    db.meta.babyId = id; db.meta.role = 'parent'; db.meta.perms = null; db.meta.pulledAt = ''; db.meta.pushedAt = 0; db.meta.babyDirty = false; db.meta.unverified = false; delete db.meta.fidx; delete db.meta.fseq;
    db.events.forEach(e => { e.by = Auth.id; });
    { const kids = Kids.clean([{ id: 'c1', name, birth: birth || '', sex }]); db.baby = { name: kids[0].name, birth: kids[0].birth, kids }; }
    await saveMembers(m => { m.members[Auth.id] = { name: String(mine || Folder.me.name || '').trim().slice(0, 60), email: Folder.me.email, role: 'parent', perms: null, since: Date.now() }; });
    save(true); await loadMemberships(); start();
    return code;
  }
  /** Ask to join a family folder shared with this account: this phone's key goes in, and a parent decides. */
  async function requestJoin(cand, displayName) {
    const family = await Folder.join(cand);
    await refreshIndex(true);
    const dev = await E2EE.ensureDevice();
    if (!revOf(`keys/${dev.id}.json`)) await Folder.write(`join/${dev.id}.json`, { v: 1, device: dev.id, user: Auth.id, pub: dev.pub, name: String(displayName || Folder.me.name || '').trim().slice(0, 60), email: Folder.me.email, platform: Native.platform, created: Date.now() }, 'overwrite');
    db.meta.fjoin = { family, device: dev.id }; st.myRequests = [{ id: dev.id, status: 'pending' }]; save(true);
  }
  /** Were we let in? Then the family is this phone's. */
  async function checkApproval() {
    const j = db.meta.fjoin; if (!j) return !!db.meta.babyId;
    await refreshIndex(true);
    if (revOf(`keys/${j.device}.json`)) { letIn(j.family); await run(true); return true; }
    if (!revOf(`join/${j.device}.json`)) { delete db.meta.fjoin; st.myRequests = []; save(true); await Folder.disconnect(); throw new Error(N_('Your request was turned down.')); }
    return false;
  }
  function letIn(family) {
    delete db.meta.fjoin; st.myRequests = []; st.needsAccess = false;
    db.meta.babyId = family; db.meta.role = null; db.meta.perms = null; db.meta.pulledAt = ''; db.meta.pushedAt = 0; db.meta.babyDirty = false; delete db.meta.fseq;
    db.events = []; db.deleted = []; save(true); start();
  }
  /** Waiting to be let in, with the recovery code to hand (a parent's new phone): in at once. */
  async function recoverJoin(code) {
    const j = db.meta.fjoin; if (!j) return;
    const family = j.family;
    db.meta.babyId = family;
    try { await E2EE.unlockWithRecovery(family, code, db.meta); }
    catch (e) { db.meta.babyId = null; throw e; }
    await B().del(`join/${j.device}.json`).catch(() => {});
    letIn(family); await run(true);
  }
  async function cancelRequest() { const j = db.meta.fjoin; if (j) { await B().del(`join/${j.device}.json`).catch(() => {}); delete db.meta.fjoin; } st.myRequests = []; await Folder.disconnect(); save(true); }
  const pendingRequest = () => st.myRequests.find(r => r.status === 'pending') || (db.meta.fjoin ? { id: db.meta.fjoin.device, status: 'pending' } : undefined);
  const inviteUrl = () => '';
  const createInvite = async () => { throw new Error(N_('Share the family folder instead (Family tab).')); };
  function lostAccess() {
    const b = db.meta.babyId; if (b) E2EE.forget(b);
    db.events = []; db.deleted = []; Store.purge().catch(() => {});
    for (const k of ['babyId', 'role', 'perms', 'pulledAt', 'pushedAt', 'babyDirty', 'stash', 'unverified', 'recoveryAck', 'tree', 'fidx', 'fseq', 'fjoin', 'gdid', 'mediaUp', 'mediaDel']) delete db.meta[k];
    db.baby = { name: '', birth: '', kids: Kids.clean([]) };
    st.people = []; st.requests = []; st.devices = []; st.myRequests = []; st.memberships = []; st.invites = []; st.retired = []; st.tree = undefined; st.needsAccess = false; mem = null;
    Folder.disconnect().catch(() => {}); save(true); notify();
  }

  // ---- the sync itself ----
  async function run(manual) {
    if (!linked()) return;
    if (manual !== true && Date.now() < retryAt) return;
    if (busy && Date.now() - busyAt < 120000) { again = true; return; }
    busy = true; busyAt = Date.now(); st.state = 'syncing'; notify();
    let changed = 0, done; flight = new Promise(r => { done = r; });
    try {
      await refreshIndex();
      if (await pullKeys()) {
        await pullMembers();
        if (db.meta.babyId) {
          if (mem && db.meta.role && (db.meta.role === 'parent' || db.meta.perms.view_health) && !E2EE.hasHealthKey(db.meta.babyId)) await pullKeys();   // (allowed to see health notes: the health key too)
          if (st.rotateNeeded && isParent()) await rotateNow();
          await pullProfile();
          changed = await pullEvents();
          await pushEvents();
          await Media.flush();
          if (fresh('tree.json') || st.tree === undefined) await loadTree().catch(() => {});
          if (isParent()) { await loadAdmin(); await loadDevices().catch(() => {}); }
          if (db.meta.role !== 'parent' && !(db.meta.perms || {}).view_health) db.events = db.events.filter(e => !E2EE.isSensitive(e.type));
          st.state = 'ok'; st.at = Date.now(); st.err = ''; failures = 0; retryAt = 0;
        } else if (!st.needsAccess) st.state = 'idle';
      }
    } catch (e) {
      if (e && (e.status === 401 || e.denied || (e.status === 409 && e.missing)) && !e.conflict) {   // the folder is no longer shared with this account
        lostAccess(); st.state = 'idle'; st.err = '';
      } else {
        st.state = (e instanceof TypeError || e.name === 'AbortError' || navigator.onLine === false) ? 'offline' : 'error';
        st.err = e.message; failures++; retryAt = Date.now() + Math.min(300000, 5000 * 2 ** failures);
      }
    } finally {
      busy = false; save(true); done();
      notify(changed > 0);
      if (again) { again = false; schedule(1500); }
    }
  }
  function schedule(ms = 2000) { if (!linked()) return; clearTimeout(timer); timer = setTimeout(() => run(true), ms); }
  function start() {
    if (started) return run(true);
    started = true;
    setInterval(() => { if (!document.hidden) run(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    window.addEventListener('online', () => run(true));
    run(true);
  }
  const checkServer = async () => null;

  return { st, SCHEMA: ServerSync.SCHEMA, checkServer, enabled, linked, isParent, can, nameOf, merge: ServerSync.merge, run, loadDevices, pendingPhones, approvePhone, myDevices, removePhone, recover, recoverJoin, newRecoveryCode, securityCode, schedule, start,
    loadMemberships, loadMyRequests, loadPeople, loadAdmin, activity, createInvite, rescind, decide, shareWith, setMember, renameMember, resetMfa, setDisplayName, removeMember, choose, createBaby, requestJoin, checkApproval, cancelRequest,
    pendingRequest, inviteUrl, pushBaby, setMyDetails, unsent, unsentKept, dropKept, loadFamilyRequests, loadFamilyPeople, retireMember, loadRetired, forgetRetired, loadTree, editTree,
    refreshIndex, revOf, noteRev, paths, members, get switching() { return false; }, get flight() { return flight; }, onChange: null, onSessionLost: null };
})();
