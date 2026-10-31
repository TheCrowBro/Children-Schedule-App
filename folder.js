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
     README.txt                  a note for the family, in plain words: what the folder is, and not to rename or delete what is in it

   Each phone merges what the others wrote (the newest edit wins, as in server mode), writes its own, and asks the cloud only for
   what changed since last time (a delta cursor), so a sync with nothing new is one small call. Roles and permissions live in
   members.json and are enforced by the apps; the cloud's own sharing (who may edit the folder) is the floor beneath them, and a
   parent's approval is what hands a phone the keys. Every phone signs what it writes (members.json, tree.json, keys/, events/),
   and a phone believes a file only when the chain of approvals from the folder's creator (littlelog.json's root) reaches the phone
   that signed it, with the role the file needs (FolderSync's trust section). FOLDER.md tells the whole story.
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
  const accts = new Map();   // Dropbox account id → email, as asked once
  const safeName = n => String(n || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'family';
  /** The same person on every phone: an id made from the cloud account, never the email itself. */
  async function memberId(provider, account) {
    const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('ll1|member|' + provider + '|' + account))), b => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }

  // ---- Dropbox: full-Dropbox access, the family folder a shared folder addressed by its namespace, the same for everyone ----
  // Every files call carries the Dropbox-API-Path-Root header naming the shared folder's namespace, so paths are relative to the
  // family folder itself ("/littlelog.json"): where a member mounts it, what they call it and what the folders around it are named
  // never enter into it. (Should Dropbox ever refuse the namespace, the older addressing, ns:<id>/path with paths worked out from
  // the member's own listing, is used instead: c.legacy.)
  const SCOPES = { dropbox: 'account_info.read files.metadata.read files.content.read files.content.write sharing.read sharing.write', google: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata' };
  const fail = (status, j, text) => {
    const e = new Error((j && (j.error_summary || j.error_description || (typeof j.error === 'string' && j.error))) || (text || '').slice(0, 200) || __('Request failed ({status})', { status }));
    e.status = status; e.tag = (j && j.error_summary) || ''; e.conflict = /conflict/.test(e.tag); e.missing = /not_found/.test(e.tag); e.denied = status === 403 || /no_permission|access_error|insufficient|no_write_permission/.test(e.tag); e.auth = status === 401;
    return e;
  };
  const ascii = s => s.replace(/[\u007f-￿]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));   // (HTTP headers carry ASCII only)
  const nsRoot = () => !!(c && c.id && !c.legacy);   // (files calls rooted at the family folder's namespace)
  async function call(url, { arg, body, json, files } = {}) {
    const h = { Authorization: 'Bearer ' + await Cloud.token('dropbox') };
    if (files && nsRoot()) h['Dropbox-API-Path-Root'] = JSON.stringify({ '.tag': 'namespace_id', namespace_id: String(c.id) });
    let b;
    if (arg) { h['Dropbox-API-Arg'] = ascii(JSON.stringify(arg)); if (body) { h['Content-Type'] = 'application/octet-stream'; b = body; } }
    else { h['Content-Type'] = 'application/json'; b = JSON.stringify(json === undefined ? null : json); }
    const r = await Native.fetch(url, { method: 'POST', headers: h, body: b }, arg ? 180000 : 30000);
    if (!r.ok) { const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) { /* plain text */ } throw fail(r.status, j, text); }
    return r;
  }
  const rpc = async (ep, json) => (await call('https://api.dropboxapi.com/2/' + ep, { json, files: ep.startsWith('files/') })).json();
  const full = p => (nsRoot() ? (p ? '/' + p : '') : (p ? `${c.root}/${p}` : c.root));
  /** A listing entry's path inside the family folder: relative to the folder's namespace (or, the older addressing, worked out from where
      the member mounted it: the cloud reports it under the folder's name, which differs per phone). */
  const rel = p => { if (nsRoot()) return String(p || '').replace(/^\/+/, '') || null; const seg = String(p || '').split('/').filter(Boolean); const i = seg.findIndex(s => TOP.includes(s.toLowerCase())); return i < 0 ? null : seg.slice(i).join('/'); };
  const DBX = {
    root: id => 'ns:' + id,
    async account() { const j = await rpc('users/get_current_account', null); return { account: j.account_id, email: String(j.email || '').toLowerCase(), name: (j.name && (j.name.display_name || j.name.given_name)) || '' }; },
    /** Everything in the folder (cursor null), or only what changed since `cursor`: { entries: [{ path, rev, deleted, folder }], cursor }, or { reset: true }. */
    async list(cursor) {
      let j; const entries = [], x0 = db.meta.fidx;
      if (cursor && x0 && !!x0.pr !== nsRoot()) return { reset: true };   // (a cursor from the other addressing: list everything again)
      try { j = cursor ? await rpc('files/list_folder/continue', { cursor }) : await rpc('files/list_folder', { path: full(''), recursive: true, include_deleted: true, limit: 2000 }); }
      catch (e) {
        if (cursor && e.status === 409 && !e.denied && !e.missing) return { reset: true };   // (a cursor the cloud no longer knows: start over)
        if (!cursor && e.status === 422 && nsRoot()) { c.legacy = true; await persist(); return DBX.list(null); }   // (the namespace refused: the older addressing from now on)
        throw e;
      }
      for (;;) {
        for (const x of j.entries || []) { const p = rel(x.path_display || x.path_lower); if (p) entries.push({ path: p, rev: x.rev || null, deleted: x['.tag'] === 'deleted', folder: x['.tag'] === 'folder' }); }
        if (!j.has_more) { if (x0) x0.pr = nsRoot() ? 1 : 0; return { entries, cursor: j.cursor }; }
        j = await rpc('files/list_folder/continue', { cursor: j.cursor });
      }
    },
    async get(p) { try { const r = await call('https://content.dropboxapi.com/2/files/download', { arg: { path: full(p) }, files: true }); return new Uint8Array(await r.arrayBuffer()); } catch (e) { if (e.missing) return null; throw e; } },
    /** mode: 'add' (fails when the file exists), 'overwrite', or { update: rev } (fails when someone wrote it since). */
    async put(p, bytes, mode = 'overwrite') {
      const m = typeof mode === 'string' ? mode : { '.tag': 'update', update: mode.update };
      const r = await call('https://content.dropboxapi.com/2/files/upload', { arg: { path: full(p), mode: m, autorename: false, mute: true }, body: bytes, files: true });
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
    /** Who last wrote a file, by Dropbox's own record: the account (as the app names people, see memberId) and its email. */
    async writer(p) {
      const j = await rpc('files/get_metadata', { path: full(p) });
      const acct = j && j.sharing_info && j.sharing_info.modified_by; if (!acct) return null;
      let email = accts.get(acct);
      if (email === undefined) { try { const u = await rpc('users/get_account', { account_id: acct }); email = String(u.email || '').toLowerCase(); } catch (e) { email = ''; } accts.set(acct, email); }
      return { account: acct, email };
    },
    /** Who may share the folder on: everyone with edit access, or its owner only (the owner's setting); and whether this account owns it. */
    async policy() { const j = await rpc('sharing/get_folder_metadata', { shared_folder_id: c.id }); const t = o => (o && o['.tag']) || ''; return { owner: t(j.access_type) === 'owner', ownerOnly: t(j.policy && j.policy.acl_update_policy) === 'owner' }; },
    setPolicy: ownerOnly => rpc('sharing/update_folder_policy', { shared_folder_id: c.id, acl_update_policy: ownerOnly ? 'owner' : 'editors' }),
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
    e.auth = status === 401;
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
    /** Who last wrote a file, by Drive's own record (the account as the app names people, and its email). */
    async writer(p) {
      const m = GD.ids(), k = p.toLowerCase(); let id = m.files[k];
      if (!id) { const f = await GD.meta(p); if (!f) return null; id = f.id; }
      const j = await gjson('GET', GAPI + `files/${id}?fields=lastModifyingUser(emailAddress,permissionId),owners(emailAddress,permissionId)`);
      const u = (j && j.lastModifyingUser && j.lastModifyingUser.permissionId) ? j.lastModifyingUser : (j && j.owners && j.owners[0]) || null;
      return u && u.permissionId ? { account: u.permissionId, email: String(u.emailAddress || '').toLowerCase() } : null;
    },
    /** Who may share the folder on: everyone with edit access, or its owner only (writersCanShare); and whether this account owns it. */
    async policy() { const j = await gjson('GET', GAPI + `files/${c.root}?fields=ownedByMe,writersCanShare`); return { owner: !!j.ownedByMe, ownerOnly: j.writersCanShare === false }; },
    setPolicy: ownerOnly => gjson('PATCH', GAPI + `files/${c.root}?fields=id`, { json: { writersCanShare: !ownerOnly } }),
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

  // ---- a note for the family, in the folder itself: people open their drive and see it before they rename anything ----
  const README = [N_('Little Log – please read'),
    N_("This folder holds your family's Little Log. Everything in it is encrypted: only the family's phones can read it."),
    N_('You may move this folder anywhere in your drive, and rename it, as long as its name still starts with "Little Log": that is how a relative\'s phone finds it when they join.'),
    N_('Please do not rename, move or delete anything inside this folder: the files, and the folders named devices, events, join, keys and media. The phones find them by name. A renamed folder makes entries vanish from everyone\'s phones, and deleted files can lose the log for good.'),
    N_('Do not share this folder from your drive: share it from the Family tab in Little Log, which also gives the person their join code.'),
    N_("If something was changed by mistake, put it back (your drive's trash or version history can help): a parent's phone repairs what it can at its next sync.")];
  const readmeText = () => { const own = README.map(s => __(s)), en = README; return (own.join('\n\n') + (own[0] === en[0] && own[3] === en[3] ? '' : '\n\n— ' + en.join('\n\n')) + '\n').replace(/\n/g, '\r\n'); };   // (the family's language, then English for the relative who reads that)
  /** Writes README.txt unless it is there (`add`: a copy someone kept is not touched). */
  async function writeReadme() {
    try { const r = await B().put('README.txt', enc.encode(readmeText()), 'add'); if (typeof FolderSync !== 'undefined') FolderSync.noteRev('README.txt', r.rev); return true; }
    catch (e) { if (e.conflict) return false; throw e; }
  }

  // ---- signatures: a shared file says which phone wrote it, provably (e2ee.js's signing keys; who is believed: FolderSync's trust) ----
  const sigMsg = (baby, kind, p, body) => `ll1|sig|${baby}|${kind}|${p.toLowerCase()}|${JSON.stringify(body)}`;
  const bodyOf = j => { const b = {}; for (const [k, v] of Object.entries(j)) if (k !== 's') b[k] = v; return b; };
  /** `o` with this phone's signature in `s` (`by` 'recovery': the recovery key's, for a phone let in with the recovery code).
      Unsigned when this phone has no signing key yet (an older app). */
  async function signed(baby, kind, p, o, by) {
    const body = bodyOf(o), dev = E2EE.device || await E2EE.ensureDevice().catch(() => null), rs = E2EE.recoverySigner;
    if (by === 'recovery' && rs) return { ...body, s: { d: 'recovery', u: null, v: await E2EE.sign(rs.priv, sigMsg(baby, kind, p, body)) } };
    if (dev && dev.spriv && dev.id) return { ...body, s: { d: dev.id, u: dev.user, v: await E2EE.sign(dev.spriv, sigMsg(baby, kind, p, body)) } };
    return body;
  }
  const checkSig = (baby, kind, p, j, pub) => (j && j.s && j.s.v && pub ? E2EE.verify(pub, sigMsg(baby, kind, p, bodyOf(j)), j.s.v) : Promise.resolve(false));
  /** The folder's root (its creator's phone, or the first parent's phone to sign an older folder), as this phone was given it. */
  const rootNow = () => (db.meta.ftrust && db.meta.ftrust.root) || null;
  /** What a grant says about the phone it is for, under the grant's proof: whose it is, its role, its signing key, and the root. */
  const extOf = (user, role, spub, pub) => JSON.stringify({ user, role, sig: spub && spub.x ? { x: spub.x, y: spub.y } : null, pub: pub && pub.x ? { x: pub.x, y: pub.y } : null, root: rootNow() });
  /** The recovery.json this phone believes: the folder's when a parent's phone signed it (or the folder has no root yet), else the last good copy a parent's phone kept. */
  async function recoveryRecord() {
    const r = await read('recovery.json'), FS = typeof FolderSync !== 'undefined' ? FolderSync : null;
    if (!FS || !FS.trust()) return r;
    if (r && FS.recoveryOk()) return { ...r, verified: true };
    const g = db.meta.fgood && db.meta.fgood['recovery.json'];
    return g ? { ...g, verified: true } : r;
  }

  // ---- the key directory for e2ee.js: what the server's functions did, as files in the folder ----
  const dir = {
    async registerDevice(name, pub, spub) { const id = E2EE.uuid(); await write(`devices/${id}.json`, { v: 2, id, user: c.me.id, pub, sig: spub || null, name, created: Date.now() }, 'add'); return id; },
    /** An older phone's record learns its signing key (its own record only). */
    async addSigningKey(id, spub) { const d = await read(`devices/${id}.json`); if (!d || d.user !== c.me.id || d.id !== id) return; await write(`devices/${id}.json`, { ...d, v: 2, sig: spub }, 'overwrite'); },
    async myDevices() { if (typeof FolderSync !== 'undefined') await FolderSync.refreshIndex(); return (await readAll('devices/')).filter(d => d.user === c.me.id).map(d => ({ id: d.id, name: d.name, created_at: d.created, pubkey: d.pub, spub: d.sig || null })); },
    async getKeyring() { const k = await read('keyring.json'); return k ? [k] : []; },
    async myGrant(baby, device) { const g = await read(`keys/${device}.json`); return g ? [g] : []; },
    /** A phone's keys (its approval), signed by this phone (`by` 'recovery': by the recovery key, for a phone let in with the code). */
    grantDevice: async (baby, device, g, by) => write(`keys/${device}.json`, await signed(baby, 'grant', `keys/${device}.json`, { v: 2, epoch: E2EE.epoch(baby), wrap_main: g.wrap_main, wrap_health: g.wrap_health || null, auth: g.auth || null, tag: g.tag, ext: g.ext || null }, by)),
    /** What this phone's own grant says about it: the folder's root when it creates the log ('root'), else the root it was given. */
    async selfExt(dev, mode) { return JSON.stringify({ user: c.me.id, role: 'parent', sig: dev.spub || null, pub: dev.pub, root: mode === 'root' ? { d: dev.id, u: c.me.id, k: dev.spub } : rootNow() }); },
    async createBaby(a) {
      const dev = E2EE.device, root = { d: dev.id, u: c.me.id, k: dev.spub };
      db.meta.ftrust = { root, mseq: 0, tseq: 0 };   // (this phone is the folder's root: what it signs, and what it approves, is believed)
      await write('littlelog.json', await signed(a.baby, 'root', 'littlelog.json', { v: 2, family: a.baby, created: Date.now(), root }), 'add');
      await write('keyring.json', { epoch: 1, keyring_main: null, keyring_health: null, health_check: a.health_check, rotate_needed: false });
      await write('recovery.json', await signed(a.baby, 'recovery', 'recovery.json', { v: 2, epoch: 1, recovery_pub: a.recovery_pub, recovery_priv_wrapped: a.recovery_priv_wrapped, recovery_spub: a.recovery_spub || null, recovery_spriv_wrapped: a.recovery_spriv_wrapped || null, wrap_main: a.recovery_grant.wrap_main, wrap_health: a.recovery_grant.wrap_health, tag: a.recovery_grant.tag }));
      await write(`keys/${a.device}.json`, await signed(a.baby, 'grant', `keys/${a.device}.json`, { v: 2, epoch: 1, wrap_main: a.grant.wrap_main, wrap_health: a.grant.wrap_health, auth: null, tag: a.grant.tag, ext: a.grant.ext || null }));
      await write('profile.json', { epoch: 1, blob: a.profile, updated: Date.now() });
      await writeReadme().catch(() => {});   // (the note for the family: not worth failing the log over)
      return a.baby;
    },
    async listDevices() {
      const [ds, mem] = [await readAll('devices/'), typeof FolderSync !== 'undefined' ? FolderSync.members() : null];
      const tr = typeof FolderSync !== 'undefined' ? FolderSync.trusted() : null, out = [];
      for (const d of ds) {
        if (!d || typeof d.id !== 'string' || !d.pub) continue;
        const g = await read(`keys/${d.id}.json`), m = mem && mem.members[d.user], role = m ? m.role : 'caregiver';
        const t = tr && tr[d.id], pub = (t && t.p) || d.pub;   // (the key the approving parent saw, when the chain reaches it)
        out.push({ grantee: 'd:' + d.id, pubkey: pub, spub: d.sig || null, user_id: d.user, has_grant: !!g, epoch: g ? g.epoch : null, tag: g ? g.tag : null, view_health: !!m && (m.role === 'parent' || !!(m.perms && m.perms.view_health)), device_name: d.name, person: m ? m.name : '',
          verified: tr ? !!t : undefined, ext: extOf(d.user, role, d.sig, pub) });   // verified: the chain of approvals reaches it (undefined in a folder from before signing)
      }
      for (const [id, t] of Object.entries(tr || {})) {   // (a phone this phone remembers whose record someone deleted: still one of the family's)
        if (id === 'recovery' || !t.p || out.some(o => o.grantee === 'd:' + id)) continue;
        const g = await read(`keys/${id}.json`), m = mem && mem.members[t.u], role = m ? m.role : (t.parent ? 'parent' : 'caregiver');
        out.push({ grantee: 'd:' + id, pubkey: t.p, spub: t.k, user_id: t.u, has_grant: !!g, epoch: g ? g.epoch : null, tag: g ? g.tag : null, view_health: !!m && (m.role === 'parent' || !!(m.perms && m.perms.view_health)), device_name: '', person: m ? m.name : '', verified: true, ext: extOf(t.u, role, t.k, t.p) });
      }
      return out;
    },
    async listRecovery() { const r = await recoveryRecord(); return r ? [{ recovery_pub: r.recovery_pub, tag: r.tag, epoch: r.epoch, verified: !!r.verified }] : []; },
    async getRecovery() { const r = await recoveryRecord(); if (r) delete r.verified; return r ? [r] : []; },
    async rotateKeys(baby, a) {
      for (const g of a.grants) {
        if (g.grantee === 'recovery') { const r = (await recoveryRecord()) || {}; delete r.verified; await write('recovery.json', await signed(baby, 'recovery', 'recovery.json', { ...r, v: 2, epoch: a.epoch, wrap_main: g.wrap_main, wrap_health: g.wrap_health, tag: g.tag })); }
        else { const p = `keys/${g.grantee.slice(2)}.json`; await write(p, await signed(baby, 'grant', p, { v: 2, epoch: a.epoch, wrap_main: g.wrap_main, wrap_health: g.wrap_health || null, auth: g.auth || null, tag: g.tag, ext: g.ext || null })); }
      }
      await write('profile.json', { epoch: a.epoch, blob: a.profile, updated: Date.now() });
      await write('keyring.json', { epoch: a.epoch, keyring_main: a.keyring_main, keyring_health: a.keyring_health, health_check: a.health_check, rotate_needed: false });
    },
    setRecovery: async (baby, a) => write('recovery.json', await signed(baby, 'recovery', 'recovery.json', { v: 2, epoch: E2EE.epoch(baby), recovery_pub: a.pub, recovery_priv_wrapped: a.priv_wrapped, recovery_spub: a.spub || null, recovery_spriv_wrapped: a.spriv_wrapped || null, wrap_main: a.wrap_main, wrap_health: a.wrap_health, tag: a.tag })),
  };
  /** Pictures and videos, as files in the folder (media.js). */
  const media = { up: (b, name, bytes) => B().put('media/' + name, bytes, 'overwrite'), down: (b, name) => B().get('media/' + name), del: (b, name) => B().del('media/' + name) };

  return {
    NAMES, SCOPES, available, label: p => NAMES[p] || p, dir, media, read, write, readAll, backend, safeName, memberId, signed, checkSig, extOf, rootNow, writeReadme, readmeText,
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
  const st = { state: 'idle', at: 0, err: '', denied: 0, needMfa: false, reconnect: false, needsAccess: false, rotateNeeded: false, bad: 0, memberships: [], people: [], requests: [], invites: [], myRequests: [], devices: [], familyRequests: {}, familyPeople: {}, retired: [], server: null, tree: undefined,
    warns: {}, warn: '', repaired: 0, forgedEpoch: 0, policy: null, policyAt: 0 };   // warns: what this phone would not believe, by subject; repaired: files a parent's phone put back
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
  const nameOf = id => { const p = st.people.find(x => x.user_id === id); if (p) return p.is_you ? __('you') : p.display_name; const r = st.retired.find(x => x.user_id === id); return r ? r.display_name : (mem && mem.names && mem.names[id]) || ''; };   // (names: people from before a move to the folder)

  // ---- who is believed: a chain of signatures from the folder's creator (the root) through every parent's approval ----
  // Every member's phone holds the main key, so what is sealed is not thereby trustworthy: a phone could rewrite the family list
  // or the tree, hand keys to a phone, or write entries in another's name. So a phone believes a shared file only when it is
  // signed by a phone the chain reaches: the root (given to this phone with its first keys, under the join code's proof or the
  // security code read out), then every phone whose grant a parent's phone signed, with the person and role the grant names.
  // members.json and tree.json count only when a parent's phone signed them and they are not older than what this phone accepted
  // (seq); an entries file counts only when its own phone signed it, and its rows only in that person's name unless they may edit
  // others' entries. What this phone would not believe is said on the Family tab, and a parent's phone puts the last good copy back.
  const trust = () => db.meta.ftrust || null;   // { root: { d: device, u: user, k: signing key }, mseq, tseq, devs }
  const pin = root => { db.meta.ftrust = { root, mseq: 0, tseq: 0, devs: {} }; save(true); };
  let trusted = null;   // { [device]: { u: user (null: the recovery key), k: signing key | null, p: ECDH key as approved, parent } } from the verified grants, this sync
  let recOk = false;   // recovery.json signed by a phone the chain trusts as a parent's
  const vcache = new Map();   // '<path>|<rev>|<signer>' → verified?
  let runNo = 0;   // (a warning raised in one sync stays until a later sync finds the subject in order: what was put back is shown at least once)
  const warnOn = (k, m) => { st.warns[k] = { m, at: runNo }; st.warn = Object.values(st.warns).map(w => w.m).join(' '); };
  const warnOff = k => { const w = st.warns[k]; if (w && w.at < runNo) { delete st.warns[k]; st.warn = Object.values(st.warns).map(w => w.m).join(' '); } };
  async function checkSig(kind, p, j, signer) {
    if (!signer || !signer.k) return false;
    const key = `${low(p)}|${revOf(p)}|${j.s && j.s.d}|${signer.k.x}`;
    if (vcache.has(key)) return vcache.get(key);
    const ok = await Folder.checkSig(db.meta.babyId, kind, p, j, signer.k);
    if (vcache.size > 2000) vcache.clear();
    vcache.set(key, ok); return ok;
  }
  /** The phones the chain reaches: from the root, through the signed grants (and the recovery key, once a parent's phone signed
      recovery.json). This phone remembers them (ftrust.devs): a phone the chain reached keeps its standing when someone else
      overwrites its grant, since its signing key is its own; it is forgotten when a parent's phone leaves it out of a change of
      keys (its grant gone), or its person is no longer in the family list. */
  async function deriveTrusted() {
    const T = trust(); if (!T) { recOk = false; return (trusted = null); }
    const R = T.devs || (T.devs = {}), D = { [T.root.d]: { u: T.root.u, k: T.root.k, p: null, parent: true } }, grants = [];
    const rec = await Folder.read('recovery.json'), any = id => D[id] || R[id];
    for (const p of paths('keys/')) { const m = /^keys\/([^/]+)\.json$/.exec(p); const j = m && await Folder.read(p); if (j && j.s && j.s.d) grants.push({ id: m[1], p, j }); }
    for (let more = true; more;) {
      more = false;
      if (rec && rec.s && !D.recovery) { const sg = any(rec.s.d); if (sg && sg.parent && await checkSig('recovery', 'recovery.json', rec, sg)) { D.recovery = { u: null, k: rec.recovery_spub || null, p: null, parent: true }; more = true; } }
      for (const g of grants) {
        if (D[g.id]) continue;
        const sg = any(g.j.s.d); if (!sg || !sg.parent || !await checkSig('grant', g.p, g.j, sg)) continue;
        let x = null; try { x = JSON.parse(g.j.ext || 'null'); } catch (e) { x = null; }
        if (!x || typeof x.user !== 'string') continue;
        D[g.id] = { u: x.user, k: x.sig && x.sig.x ? x.sig : null, p: x.pub && x.pub.x ? x.pub : null, parent: x.role === 'parent' }; more = true;
      }
    }
    // a change of keys a parent's phone made (this phone's own grant is a parent's) settles who is in: a remembered phone without a grant now is out
    const me = E2EE.device && E2EE.device.id, og = me && grants.find(g => g.id === me);
    let legit = false; if (og) { const sg = any(og.j.s.d); legit = !!(sg && sg.parent && await checkSig('grant', og.p, og.j, sg)); }
    for (const [id, r] of Object.entries(R)) {
      if (D[id]) continue;
      if (id !== 'recovery' && mem && r.u != null && !mem.members[r.u]) { delete R[id]; continue; }
      if (id !== 'recovery' && legit && !revOf(`keys/${id}.json`)) delete R[id];
    }
    Object.assign(R, D);
    recOk = !!D.recovery; if (recOk && rec.recovery_pub && rec.recovery_priv_wrapped) good('recovery.json', rec);
    return (trusted = { ...R });
  }
  const trustedDev = id => (trusted && trusted[id]) || null;
  /** A phone that may change the family list, the tree and the keys: a parent's by its grant, and still a parent in the family list this phone accepted. */
  const parentDev = id => { const t = trustedDev(id); if (!t || !t.parent) return false; if (t.u === null || id === trust().root.d) return true; const m = mem && mem.members[t.u]; return !m || m.role === 'parent'; };
  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  /** Someone who is not a parent may change the family list only on their own line: name and details. */
  function ownLineOnly(prev, next, u) {
    if (!same(prev.invites, next.invites) || !same(prev.retired, next.retired) || !same(prev.names, next.names)) return false;
    for (const id of new Set([...Object.keys(prev.members), ...Object.keys(next.members)])) {
      const a = prev.members[id], b = next.members[id];
      if (id !== u) { if (!same(a, b)) return false; continue; }
      if (!a || !b || a.role !== b.role || !same(a.perms, b.perms) || a.email !== b.email || !same(a.since, b.since)) return false;
    }
    return true;
  }
  /** members.json / tree.json: signed by a phone the chain trusts as a parent's (the family list: or by anyone, for their own line),
      and not older than what this phone accepted. `opened`: the document's contents, for the own-line check. */
  async function docOk(kind, p, j, opened) {
    if (!trust()) return true;   // (a folder from before signing, until upgrade() signs it)
    if (!j || !j.s || !trusted) return false;
    const t = trustedDev(j.s.d); if (!t) return false;
    if (j.s.u != null && t.u != null && j.s.u !== t.u) return false;
    if (!await checkSig(kind, p, j, t)) return false;
    if ((+j.seq || 0) < (kind === 'members' ? trust().mseq : trust().tseq)) return false;   // (an older copy put back)
    if (parentDev(j.s.d)) return true;
    return kind === 'members' && !!mem && t.u != null && !!opened && ownLineOnly(mem, opened, t.u);
  }
  /** The last good copy of a file that matters, kept on a parent's phone to put back (repair()). */
  const good = (p, j) => { if (!isParent()) return; (db.meta.fgood || (db.meta.fgood = {}))[p] = j; };
  let readmeTried = false;
  /** A parent's phone puts back the files the folder cannot do without when one is gone, unreadable or rolled back. */
  async function repair() {
    const b = db.meta.babyId, g = db.meta.fgood; if (!isParent() || !g || !E2EE.hasKeys(b)) return;
    if (!g['littlelog.json']) { const j = revOf('littlelog.json') ? await Folder.read('littlelog.json') : null; if (j && j.family === b && (!trust() || (j.root && j.root.d === trust().root.d))) good('littlelog.json', j); }
    if (!revOf('README.txt') && !readmeTried) { readmeTried = true; await Folder.writeReadme().catch(() => {}); }   // (a folder from before the note, or one whose note was deleted: once per run of the app)
    for (const p of ['littlelog.json', 'keyring.json', 'recovery.json']) {
      if (!g[p]) continue;
      const j = revOf(p) ? await Folder.read(p) : null;
      let bad = !j;
      if (j && p === 'keyring.json' && (+j.epoch || 0) < (+g[p].epoch || 0)) bad = true;
      if (j && p === 'recovery.json' && (!(j.recovery_pub && j.recovery_priv_wrapped && j.wrap_main) || (trust() && !recOk))) bad = true;   // (or not a parent's: see deriveTrusted)
      if (j && p === 'littlelog.json' && (j.family !== b || (trust() && !(j.root && j.root.d === trust().root.d)))) bad = true;
      if (!bad) continue;
      await Folder.write(p, g[p], 'overwrite'); st.repaired++;
    }
    if (!trusted || st.forgedEpoch) return;   // (forged keys: rotateNow makes every grant again)
    for (const [id, t] of Object.entries(trusted)) {   // a phone's grant overwritten by someone who may not: made again, from what this phone remembers of the approval
      if (id === 'recovery' || id === trust().root.d || !t.p || (E2EE.device && id === E2EE.device.id)) continue;
      const p = `keys/${id}.json`, j = revOf(p) ? await Folder.read(p) : null; if (!j) continue;
      const sg = j.s && trustedDev(j.s.d);
      if (sg && sg.parent && +j.epoch === E2EE.epoch(b) && await checkSig('grant', p, j, sg)) continue;
      const m = mem && mem.members[t.u], role = m ? m.role : (t.parent ? 'parent' : 'caregiver');
      await E2EE.approveDevice(b, { grantee: 'd:' + id, pubkey: t.p, view_health: role === 'parent' || !!(m && m.perms && m.perms.view_health) }, { ext: Folder.extOf(t.u, role, t.k, t.p) });
      st.repaired++;
    }
  }

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
  const docOf = m => (m && m.members ? { members: m.members, retired: m.retired || [], invites: m.invites || {}, names: m.names || {} } : null);
  async function pullMembers() {
    const b = db.meta.babyId; if (!E2EE.hasKeys(b)) return false;
    if (!mem || fresh('members.json')) {
      const j = await Folder.read('members.json');
      if (j && j.blob) {
        const cur = docOf(await E2EE.openDoc(b, 'members', j.blob, j.epoch));
        if (cur && await docOk('members', 'members.json', j, cur)) { mem = cur; if (trust()) trust().mseq = +j.seq || 0; good('members.json', j); warnOff('members'); }
        else if (cur) { warnOn('members', N_("The family list in the folder was changed by a phone that may not, so it was ignored.")); if (isParent() && mem && trust()) await restoreMembers(j); }
        mark('members.json');
      }
    } else warnOff('members');
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
      let cur = j && j.blob ? docOf(await E2EE.openDoc(b, 'members', j.blob, j.epoch)) : null;
      if (cur && trust() && !(await docOk('members', 'members.json', j, cur))) cur = mem ? JSON.parse(JSON.stringify(mem)) : null;   // (a copy no phone may have written: start from the last one this phone accepted)
      if (!cur) cur = { members: {}, retired: [], invites: {}, names: {} };
      if (fn(cur) === false) return cur;
      const { blob, epoch } = await E2EE.sealDoc(b, 'members', cur), seq = Math.max(+(j && j.seq) || 0, trust() ? trust().mseq : 0) + 1;
      const file = await Folder.signed(b, 'members', 'members.json', { v: 2, epoch, blob, updated: Date.now(), by: Auth.id, seq });
      try { await Folder.write('members.json', file, rev ? { update: rev } : 'add'); }
      catch (e) { if (e.conflict) continue; throw e; }
      mem = cur; if (trust()) trust().mseq = seq; good('members.json', file); await peopleRows(); return cur;
    }
    throw new Error(N_('The family list changed meanwhile: try again'));
  }
  /** A parent's phone puts the family list it accepted back over a copy it would not believe. */
  async function restoreMembers(bad) {
    const b = db.meta.babyId, rev = revOf('members.json');
    const { blob, epoch } = await E2EE.sealDoc(b, 'members', mem), seq = Math.max(+(bad && bad.seq) || 0, trust().mseq) + 1;
    const file = await Folder.signed(b, 'members', 'members.json', { v: 2, epoch, blob, updated: Date.now(), by: Auth.id, seq });
    try { await Folder.write('members.json', file, rev ? { update: rev } : 'add'); trust().mseq = seq; good('members.json', file); st.repaired++; warnOff('members'); } catch (e) { if (!e.conflict) throw e; }
  }

  // ---- keys ----
  async function pullKeys() {
    const b = db.meta.babyId; await E2EE.load(b);
    let kr = await Folder.read('keyring.json');
    if (!kr && isParent() && db.meta.fgood && db.meta.fgood['keyring.json'] && E2EE.hasKeys(b)) { kr = db.meta.fgood['keyring.json']; await Folder.write('keyring.json', kr, 'overwrite'); st.repaired++; }   // (gone from the folder: this phone's last good copy goes back)
    if (!kr) { st.needsAccess = true; st.state = 'needs-access'; return false; }
    st.rotateNeeded = !!kr.rotate_needed;
    const want = db.meta.role === 'parent' || !!(db.meta.perms && db.meta.perms.view_health), had = E2EE.hasHealthKey(b);
    const own = E2EE.device ? `keys/${E2EE.device.id}.json` : null, moved = E2EE.hasKeys(b) && E2EE.epoch(b) < kr.epoch;
    if (moved && trust()) {   // a change of keys must come from a parent's phone: this phone's grant for it, signed by one the chain reaches
      await deriveTrusted();
      const g = own ? await Folder.read(own) : null, sg = g && g.s ? trustedDev(g.s.d) : null;
      if (!g || !sg || !parentDev(g.s.d) || !(await checkSig('grant', own, g, sg))) {
        const who = sg && sg.u != null ? nameOf(sg.u) : '';
        warnOn('keys', who ? __("The folder's keys were changed by {who}'s phone, which may not. This phone keeps its keys; a parent's phone sets new ones.", { who }) : N_("The folder's keys were changed by a phone that may not, so this phone keeps its keys; a parent's phone sets new ones."));
        if (isParent()) st.forgedEpoch = +kr.epoch || 0;   // (rotateNow goes past it)
        st.needsAccess = false; return true;   // (carries on with the keys it has)
      }
    }
    if (!moved) warnOff('keys');
    if (!E2EE.hasKeys(b) || moved || (want && !had && own && fresh(own))) { await E2EE.refresh(b, db.meta, { health: want }); if (own) mark(own); }
    if (!had && E2EE.hasHealthKey(b)) forgetSeen('events/');   // health entries were skipped until now: read everything again
    if (db.meta.kinds !== E2EE.KINDS) forgetSeen('events/');   // the app was updated and knows new kinds of entry
    if (!E2EE.hasKeys(b) || E2EE.epoch(b) < kr.epoch) { st.needsAccess = true; st.state = 'needs-access'; st.err = ''; return false; }
    if (+kr.epoch === E2EE.epoch(b)) good('keyring.json', kr);
    st.needsAccess = false; return true;
  }
  async function rotateNow() { const b = db.meta.babyId; if (!E2EE.hasKeys(b)) return; await E2EE.rotate(b, db.baby, { from: st.forgedEpoch }); st.rotateNeeded = false; st.forgedEpoch = 0; }

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
  const devOfPath = p => (/^events\/([^/]+)\//.exec(p) || [])[1] || '';
  /** An entry (or a deletion) from a phone's file, by whose phone it is: in its own person's name, or in another's only when that person may edit (delete) others' entries. */
  function authorOk(e, devId) {
    if (!trust()) return true;
    const t = trustedDev(devId); if (!t) return false;
    const m = mem && mem.members[t.u], parent = m ? m.role === 'parent' : t.parent, perms = (m && m.perms) || {};
    if (e.deleted) { const cur = db.events.find(x => x.id === e.id); return !cur || !cur.by || cur.by === t.u || parent || !!perms.delete_others; }
    return !e.by || e.by === t.u || parent || !!perms.edit_others;
  }
  /** The rows of one phone's entries file, when the file is that phone's: signed by it, in a folder with a root. */
  async function readRows(p) {
    const j = await Folder.read(p); if (!j || !Array.isArray(j.rows)) return [];
    const d = devOfPath(p);
    if (trust()) {
      const t = trustedDev(d); if (!t) { st.bad++; return []; }   // (a phone no parent's phone approved)
      if (t.k && !(await checkSig('events', p, j, t))) { st.bad++; return []; }   // (not written by that phone)
    }
    return j.rows.filter(okRow).slice(0, 2000).map(r => ({ ...r, dev: d }));
  }
  async function decodeRows(rows) { const keep = []; for (const e of await ServerSync.decode(rows)) { if (authorOk(e, e.dev)) keep.push(e); else st.bad++; } return keep; }
  async function retryStash() { const rows = Object.values(db.meta.stash || {}); if (!rows.length) return 0; const n = ServerSync.merge(await decodeRows(rows)); if (!Object.keys(db.meta.stash || {}).length) delete db.meta.stash; return n; }
  async function pullEvents() {
    let n = 0;
    for (const p of paths('events/').filter(p => isEvents(p) && !ownEvents(p) && fresh(p)).sort()) {
      const rows = await readRows(p);
      if (rows.length) n += ServerSync.merge(await decodeRows(rows));
      mark(p);
    }
    n += await retryStash();
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
        try { await Folder.write(p, await Folder.signed(b, 'events', p, { v: 2, device: me, by: Auth.id, at: Date.now(), rows: rows.slice(i, i + 500).map(r => ({ ...r, created_by: Auth.id })) }), 'add'); db.meta.fseq = seq; break; }
        catch (e) { if (e.conflict && t < 20) { seq++; continue; } throw e; }
      }
    }
    db.meta.pushedAt = cut;
    db.deleted = db.deleted.filter(t => t.updated > cut);
  }
  async function loadTree() {
    const b = db.meta.babyId; if (!b) return null;
    const j = await Folder.read('tree.json');
    let t = j && j.blob ? await E2EE.openTree(b, j.blob, j.epoch) : null;
    if (j && j.blob && !(await docOk('tree', 'tree.json', j))) {   // (changed by a phone that may not: the tree this phone had stays)
      warnOn('tree', N_("The family tree in the folder was changed by a phone that may not, so it was ignored."));
      t = st.tree !== undefined ? st.tree : (db.meta.tree || null);
      if (isParent() && trust() && t) await restoreTree(j, t);
    } else { if (j && trust()) trust().tseq = +j.seq || 0; warnOff('tree'); }
    mark('tree.json'); st.tree = t;
    if (JSON.stringify(db.meta.tree || null) !== JSON.stringify(t)) { if (t) db.meta.tree = t; else delete db.meta.tree; save(true); }
    return t;
  }
  const treeFile = async (b, t, seq) => { const { blob, epoch } = await E2EE.sealTree(b, t); if (blob.length > TREE_MAX) throw new Error(N_('There is no room on the family tree for more people: take someone off it, or shorten the names')); return Folder.signed(b, 'tree', 'tree.json', { v: 2, epoch, blob, updated: Date.now(), seq }); };
  async function editTree(fn, start) {
    const b = db.meta.babyId;
    for (let i = 0; i < 6; i++) {
      await refreshIndex();
      const j = await Folder.read('tree.json'), rev = revOf('tree.json');
      let base = j && j.blob ? await E2EE.openTree(b, j.blob, j.epoch) : null;
      if (base && trust() && !(await docOk('tree', 'tree.json', j))) base = st.tree || db.meta.tree || null;   // (a copy no phone may have written: from the last one this phone accepted)
      const t = FamilyTree.clean(base || start);
      if (fn(t) === false) throw new Error(N_('The family tree changed meanwhile: try again'));
      const seq = Math.max(+(j && j.seq) || 0, trust() ? trust().tseq : 0) + 1;
      try { await Folder.write('tree.json', await treeFile(b, t, seq), rev ? { update: rev } : 'add'); }
      catch (e) { if (e.conflict) continue; throw e; }
      if (trust()) trust().tseq = seq; warnOff('tree');
      st.tree = t; db.meta.tree = t; save(true); return t;
    }
    throw new Error(N_('The family tree changed meanwhile: try again'));
  }
  /** A parent's phone puts the tree it accepted back over a copy it would not believe. */
  async function restoreTree(bad, t) {
    const b = db.meta.babyId, rev = revOf('tree.json'), seq = Math.max(+(bad && bad.seq) || 0, trust().tseq) + 1;
    try { await Folder.write('tree.json', await treeFile(b, t, seq), rev ? { update: rev } : 'add'); trust().tseq = seq; st.repaired++; warnOff('tree'); } catch (e) { if (!e.conflict) throw e; }
  }

  // ---- requests to join, phones, people (parents) ----
  const wcache = new Map();   // join request path|rev → who wrote it, by the cloud
  async function loadAdmin() {
    if (!isParent() || !mem) return;
    const reqs = [];
    for (const p of paths('join/')) {
      const j = await Folder.read(p); if (!j || !j.device || !j.pub) continue;
      if (mem.members[j.user]) continue;   // (a member's new phone: see loadDevices)
      // Who wrote the request is the cloud's word, not the file's: its account must be the person the file claims, and its email is the one shown.
      const wk = `${low(p)}|${revOf(p)}`; let w = wcache.get(wk);
      if (w === undefined) { try { w = (B().writer ? await B().writer(p) : null) || null; } catch (e) { w = null; } if (wcache.size > 200) wcache.clear(); wcache.set(wk, w); }
      const writerId = w ? await Folder.memberId(Folder.provider, w.account) : null, claimed = String(j.email || '').toLowerCase();
      const email = (w && w.email) || claimed, forged = !!writerId && writerId !== j.user;
      const inv = mem.invites[email] || null;
      const r = { id: j.device, device_id: j.device, device_pub: j.pub, device_spub: j.sig || null, user: j.user, email, claimed, display_name: j.name || '', role: inv ? inv.role : 'caregiver', perms: inv ? inv.perms : null,
        proof: j.proof || null, invite_code: email, attested: !!w, forged, qrVerified: false, fingerprint: await E2EE.fingerprint(j.pub, j.sig || null), baby_id: db.meta.babyId, platform: j.platform };
      r.qrVerified = !forged && await E2EE.verifyRequest(r);   // (they typed the join code this phone gave them)
      reqs.push(r);
    }
    st.requests = reqs;
  }
  async function loadDevices() {
    const rows = await Folder.dir.listDevices();
    for (const d of rows) d.fingerprint = await E2EE.fingerprint(d.pubkey, d.spub);
    // (a phone without keys is waiting: a member's new phone, or someone not let in yet; only members' show as phones)
    st.devices = rows.filter(d => d.has_grant || (mem && mem.members[d.user_id]));
    return st.devices;
  }
  /** Phones waiting for a parent's approval: without keys, or (a folder with a root) with keys no parent's phone signed, such as a phone from before signing. */
  const pendingPhones = () => st.devices.filter(d => (!d.has_grant || (trust() && d.verified === false)) && !(E2EE.device && d.grantee === 'd:' + E2EE.device.id));
  const roleOf = user => { const m = mem && mem.members[user]; return m ? m.role : 'caregiver'; };
  async function approvePhone(d) { await E2EE.approveDevice(db.meta.babyId, d, { ext: Folder.extOf(d.user_id, roleOf(d.user_id), d.spub, d.pubkey) }); await B().del(`join/${d.grantee.slice(2)}.json`); await refreshIndex(); await deriveTrusted(); await loadDevices(); }
  const myDevices = () => Folder.dir.myDevices();
  async function removePhone(id) {
    await B().del(`keys/${id}.json`); await B().del(`devices/${id}.json`); await refreshIndex();
    if (E2EE.device && E2EE.device.id === id) return;
    if (isParent() && E2EE.hasKeys(db.meta.babyId)) await rotateNow(); else await askRotation();
    await loadDevices().catch(() => {}); schedule(300);
  }
  /** Someone who cannot change the keys (not a parent) asks the parents' phones to, on their next sync. */
  async function askRotation() { const kr = (await Folder.read('keyring.json')) || {}; await Folder.write('keyring.json', { ...kr, rotate_needed: true }); }
  async function recover(code) { await pinFromFolder(); await E2EE.unlockWithRecovery(db.meta.babyId, code, db.meta); st.needsAccess = false; save(true); run(true); }
  const newRecoveryCode = () => E2EE.replaceRecovery(db.meta.babyId);
  const securityCode = async () => E2EE.securityCode(db.meta.babyId, trust() ? await E2EE.fpRaw(trust().root.k) : null);
  const activity = async () => [];
  /** Approve (keys for their phone, a line in the family list) or deny a request to join. */
  async function decide(req, approve, opts = {}) {
    const b = db.meta.babyId;
    if (approve) {
      if (req.forged) throw new Error(N_('This request was written by another account than the one it claims. Deny it.'));
      const g = await E2EE.grantForRequest(b, req, { ...opts, ext: Folder.extOf(req.user, req.role, req.device_spub, req.device_pub) });
      await Folder.dir.grantDevice(b, req.device_id, g);
      await saveMembers(m => { if (!m.members[req.user]) m.members[req.user] = { name: req.display_name || req.email, email: req.email, role: req.role, perms: req.perms || null, since: Date.now() }; });
    }
    await B().del(`join/${req.device_id}.json`);
    await refreshIndex(); await loadAdmin(); await loadDevices().catch(() => {});
  }
  /** Share the family folder with someone (their cloud email), with the role they will get once they ask to join and are approved. */
  /** Share the family folder with someone (their cloud email), with the role they will get once they ask to join and are approved.
      Each gets a join code, kept on this phone: typed on their phone, it proves their request to this phone and this phone's keys to theirs. */
  async function shareWith(emails, role, perms, message) {
    emails = emails.map(e => String(e).trim().toLowerCase()).filter(e => /^\S+@\S+\.\S+$/.test(e));
    if (!emails.length) throw new Error(N_('Enter a valid email address'));
    await B().share(emails, message);
    const codes = db.meta.fcodes || (db.meta.fcodes = {});
    for (const e of emails) { const code = E2EE.newJoinCode(); await E2EE.rememberInvite(e, E2EE.joinCodeSecret(code)); codes[e] = code; }
    await saveMembers(m => { for (const e of emails) m.invites[e] = { role, perms: perms || null, by: Auth.id, at: Date.now(), code: true }; });
    return emails.map(e => codes[e]);
  }
  const joinCodeFor = email => (db.meta.fcodes || {})[email] || '';
  async function rescind(email) { await B().unshare(email); if (db.meta.fcodes) delete db.meta.fcodes[email]; await saveMembers(m => { delete m.invites[email]; }); }
  async function setMember(user, role, perms) {
    const b = db.meta.babyId, p = mem && mem.members[user]; if (!p) return;
    const had = p.role === 'parent' || !!(p.perms && p.perms.view_health), will = role === 'parent' || !!(perms && perms.view_health);
    await saveMembers(m => { if (m.members[user]) { m.members[user].role = role; m.members[user].perms = role === 'parent' ? null : perms; } });
    // their phones' grants say the new role (and carry the health key when it is theirs now): made again by this phone, signed
    for (const d of await Folder.dir.listDevices()) if (d.user_id === user && d.has_grant && d.verified !== false) await E2EE.approveDevice(b, { ...d, view_health: will }, { ext: Folder.extOf(user, role, d.spub, d.pubkey) });
    if (had && !will) await rotateNow();   // (their phones keep the old health key: a new one for everyone else)
    await refreshIndex(); await deriveTrusted(); schedule(300);
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
    db.meta.recoveryAck = false; delete db.meta.ftrust; delete db.meta.fgood; trusted = null;
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
  /** A log moved here from a family server (account.js): the folder is made from what is on this phone: the children, every entry,
      the tree, the pictures and videos (sent again, sealed with the new keys) and the family's names, so entries by people who have
      not joined the folder yet still say who wrote them. This phone becomes the parent; `oldMe` is its id on the server, which its
      own entries carry. Returns the recovery code. */
  async function adoptLog({ mine, oldMe, names }) {
    if (!Folder.attached) throw new Error(N_('Connect your cloud first'));
    const kids = Kids.clean(db.baby.kids && db.baby.kids.length ? db.baby.kids : [{ id: 'c1', name: db.baby.name, birth: db.baby.birth || '' }]);
    await Folder.createFamily(kids[0].name);
    db.meta.recoveryAck = false; delete db.meta.ftrust; delete db.meta.fgood; trusted = null;
    let created;
    try { created = await E2EE.createLog({ ...db.baby, kids }, mine); } catch (e) { delete db.meta.recoveryAck; await Folder.disconnect(); save(true); throw e; }
    const { babyId: id, code } = created, me = Auth.id;
    const tree = db.meta.tree ? JSON.parse(oldMe ? JSON.stringify(db.meta.tree).split(oldMe).join(me) : JSON.stringify(db.meta.tree)) : null;
    if (oldMe) { for (const e of db.events) if (e.by === oldMe) e.by = me; for (const t of db.deleted || []) if (t.by === oldMe) t.by = me; }
    db.meta.babyId = id; db.meta.role = 'parent'; db.meta.perms = null; db.meta.pulledAt = ''; db.meta.pushedAt = 0; db.meta.babyDirty = true; db.meta.unverified = false;
    for (const k of ['fidx', 'fseq', 'gdid', 'stash', 'mediaDel']) delete db.meta[k];
    db.baby = { ...db.baby, name: kids[0].name, birth: kids[0].birth, kids };
    db.meta.mediaUp = [...new Set(db.events.flatMap(e => ((e.data || {}).media || []).map(m => m.id)))];   // (every picture and video goes up again, under the new keys)
    if (tree) db.meta.tree = tree; else delete db.meta.tree;
    await saveMembers(m => { m.members[me] = { name: String(mine || Folder.me.name || '').trim().slice(0, 60), email: Folder.me.email, role: 'parent', perms: null, since: Date.now() }; m.names = { ...(m.names || {}), ...(names || {}) }; delete m.names[me]; });
    if (tree) await editTree(t => t, tree);
    save(true); await loadMemberships(); start();
    return code;
  }
  /** Ask to join a family folder shared with this account: this phone's key goes in, and a parent decides. */
  async function requestJoin(cand, displayName, code) {
    const secret = code ? E2EE.joinCodeSecret(code) : null;
    if (code && !secret) throw new Error(N_('A join code is 8 letters or numbers'));
    const family = await Folder.join(cand);
    await refreshIndex(true);
    const dev = await E2EE.ensureDevice();
    const proof = secret ? await E2EE.joinProof(secret, dev.id, dev.pub, dev.spub) : null;   // (the join code the parent gave: proves this request is theirs)
    await E2EE.setJoinSecret(secret);   // (and, when the keys come, that they came from that parent's phone)
    if (!revOf(`keys/${dev.id}.json`)) await Folder.write(`join/${dev.id}.json`, { v: 2, device: dev.id, user: Auth.id, pub: dev.pub, sig: dev.spub || null, name: String(displayName || Folder.me.name || '').trim().slice(0, 60), email: Folder.me.email, platform: Native.platform, created: Date.now(), proof }, 'overwrite');
    db.meta.fjoin = { family, device: dev.id }; st.myRequests = [{ id: dev.id, status: 'pending' }]; save(true);
  }
  /** Before a phone is let in with the recovery code: the root it will check the chain against, from the folder's own marker. */
  async function pinFromFolder() { if (trust()) return; const ll = await Folder.read('littlelog.json'); if (ll && ll.root && ll.root.d && ll.root.k) pin(ll.root); }
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
    try { await pinFromFolder(); await E2EE.unlockWithRecovery(family, code, db.meta); }
    catch (e) { db.meta.babyId = null; delete db.meta.ftrust; throw e; }
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
    for (const k of ['babyId', 'role', 'perms', 'pulledAt', 'pushedAt', 'babyDirty', 'stash', 'unverified', 'recoveryAck', 'tree', 'fidx', 'fseq', 'fjoin', 'gdid', 'mediaUp', 'mediaDel', 'ftrust', 'fgood', 'fcodes']) delete db.meta[k];
    db.baby = { name: '', birth: '', kids: Kids.clean([]) };
    st.people = []; st.requests = []; st.devices = []; st.myRequests = []; st.memberships = []; st.invites = []; st.retired = []; st.tree = undefined; st.needsAccess = false; mem = null;
    trusted = null; vcache.clear(); wcache.clear(); st.warns = {}; st.warn = ''; st.repaired = 0; st.forgedEpoch = 0; st.policy = null;
    Folder.disconnect().catch(() => {}); save(true); notify();
  }

  // ---- the sync itself ----
  async function run(manual) {
    if (!linked()) return;
    if (manual !== true && Date.now() < retryAt) return;
    if (busy && Date.now() - busyAt < 120000) { again = true; return; }
    busy = true; busyAt = Date.now(); st.state = 'syncing'; runNo++; notify();
    let changed = 0, done; flight = new Promise(r => { done = r; });
    try {
      await refreshIndex();
      if (!E2EE.device) await E2EE.ensureDevice().catch(() => {});   // (this phone's keys, the signing one too, before it writes anything)
      if (await pullKeys()) {
        await deriveTrusted();
        await pullMembers();
        if (!trust() && mem) { await upgrade(); if (trust()) await pullMembers(); }   // (a folder from before signing: the first parent's phone signs it; the others take its root)
        if (db.meta.babyId) {
          if (mem && db.meta.role && (db.meta.role === 'parent' || db.meta.perms.view_health) && !E2EE.hasHealthKey(db.meta.babyId)) await pullKeys();   // (allowed to see health notes: the health key too)
          if ((st.rotateNeeded || st.forgedEpoch) && isParent()) await rotateNow();
          if (isParent()) { await repair(); await loadPolicy(); }
          await pullProfile();
          changed = await pullEvents();
          await pushEvents();
          await Media.flush();
          if (fresh('tree.json') || st.tree === undefined) await loadTree().catch(() => {}); else warnOff('tree');
          if (isParent()) { await loadAdmin(); await loadDevices().catch(() => {}); }
          if (db.meta.role !== 'parent' && !(db.meta.perms || {}).view_health) db.events = db.events.filter(e => !E2EE.isSensitive(e.type));
          st.state = 'ok'; st.at = Date.now(); st.err = ''; st.reconnect = false; failures = 0; retryAt = 0;
        } else if (!st.needsAccess) st.state = 'idle';
      }
    } catch (e) {
      if (e && e.auth) { st.state = 'error'; st.err = e.message; st.reconnect = true; }   // the cloud's sign-in lapsed: sign in again, nothing is cleared
      else if (e && (e.denied || (e.status === 409 && e.missing)) && !e.conflict) {   // the folder is no longer shared with this account
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
  /** A folder from before signing (no root in littlelog.json): the first parent's phone to run this version becomes its root and signs
      what is there; every other phone takes the root from littlelog.json once it names a parent of the family list it holds. */
  async function upgrade() {
    if (trust() || !mem) return;
    const b = db.meta.babyId, ll = await Folder.read('littlelog.json'), dev = E2EE.device;
    if (ll && ll.root && ll.root.d && ll.root.k) {
      const m = mem.members[ll.root.u];
      if (m && m.role === 'parent') { pin(ll.root); await deriveTrusted(); warnOff('root'); } else warnOn('root', N_("The folder names a root phone that is not a parent's. A parent's phone should open Little Log first."));
      return;
    }
    if (!isParent() || !dev || !dev.spub || !E2EE.hasKeys(b)) return;
    const root = { d: dev.id, u: Auth.id, k: dev.spub };
    pin(root);
    const marker = await Folder.signed(b, 'root', 'littlelog.json', { v: 2, family: b, created: (ll && ll.created) || Date.now(), root });
    await Folder.write('littlelog.json', marker, 'overwrite'); good('littlelog.json', marker);
    const devs = await Folder.readAll('devices/');   // every phone's grant, signed: whose it is from its record, its role from the family list, its signing key when its record has one
    for (const p of paths('keys/')) {
      const id = (/^keys\/([^/]+)\.json$/.exec(p) || [])[1], k = id && await Folder.read(p), d = devs.find(x => x && x.id === id); if (!k || !d) continue;
      await Folder.write(p, await Folder.signed(b, 'grant', p, { ...k, v: 2, ext: JSON.stringify({ user: d.user, role: roleOf(d.user), sig: d.sig && d.sig.x ? d.sig : null, pub: d.pub, root }) }), 'overwrite');
    }
    const rec = await Folder.read('recovery.json'); if (rec) { const r2 = await Folder.signed(b, 'recovery', 'recovery.json', { ...rec, v: 2 }); await Folder.write('recovery.json', r2, 'overwrite'); good('recovery.json', r2); }
    await refreshIndex(); await deriveTrusted();
    const { blob, epoch } = await E2EE.sealDoc(b, 'members', mem), file = await Folder.signed(b, 'members', 'members.json', { v: 2, epoch, blob, updated: Date.now(), by: Auth.id, seq: 1 });
    await Folder.write('members.json', file, 'overwrite'); trust().mseq = 1; good('members.json', file);
    const t = st.tree || db.meta.tree; if (t) { await Folder.write('tree.json', await treeFile(b, t, 1), 'overwrite'); trust().tseq = 1; }
    await refreshIndex(); mark('members.json'); mark('tree.json');
  }
  /** Who may share the folder on (the cloud's setting), for parents' phones: asked now and then, and when it is changed. */
  async function loadPolicy(force) {
    if (!isParent() || !B().policy) return st.policy;
    if (!force && st.policy && Date.now() - st.policyAt < 600000) return st.policy;
    try { st.policy = await B().policy(); st.policyAt = Date.now(); } catch (e) { /* not known: nothing shown */ }
    return st.policy;
  }
  async function setOwnerOnly(v) { await B().setPolicy(!!v); await loadPolicy(true); }
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
    pendingRequest, inviteUrl, pushBaby, setMyDetails, unsent, unsentKept, dropKept, loadFamilyRequests, loadFamilyPeople, retireMember, loadRetired, forgetRetired, loadTree, editTree, adoptLog,
    refreshIndex, revOf, noteRev, paths, members, trusted: () => trusted, trust, deriveTrusted, recoveryOk: () => recOk, loadPolicy, setOwnerOnly, joinCodeFor, get switching() { return false; }, get flight() { return flight; }, onChange: null, onSessionLost: null };
})();
