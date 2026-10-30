// A stand-in for the Dropbox API, as far as the family folder (folder.js) uses it: shared folders addressed as ns:<id>, files with
// revisions and the add / overwrite / update upload modes, a delta cursor, sharing by email (invite, accept, remove, leave), the
// account. In memory, shared by every phone in a test; each phone's Playwright context gets its own routes, bound to the Dropbox
// account it signed in with, so three phones are three accounts sharing one folder, as in life.
function createFakeDropbox() {
  const users = {}, folders = {}, calls = [], offline = new Set(), expired = new Set();   // offline: accounts whose phone has no connection right now; expired: whose token Dropbox rejects
  let revs = 0, ids = 0;
  const J = (status, body) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: body === null ? 'null' : JSON.stringify(body) });
  const fail = (status, tag) => J(status, { error_summary: tag + '/..', error: { '.tag': tag.split('/')[0] } });
  const user = email => users[email] || (users[email] = { email, account_id: 'dbid:' + Buffer.from(email).toString('hex').slice(0, 20), name: email.split('@')[0].replace(/^./, c => c.toUpperCase()), mounted: new Set(), personal: new Map() });
  const parse = p => { const m = /^ns:([^/]+)\/?(.*)$/.exec(p || ''); return m ? { id: m[1], rel: m[2] } : null; };
  const meta = (f, rel) => ({ '.tag': 'file', name: rel.split('/').pop(), path_lower: '/' + rel.toLowerCase(), path_display: '/' + rel, rev: f.rev, size: f.bytes.length, client_modified: new Date(f.at).toISOString() });
  const access = (fo, email) => !!fo && fo.members.has(email);
  function api(email, ep, arg, body) {
    calls.push(ep);
    const u = user(email);
    switch (ep) {
      case 'oauth2/token': return J(200, { access_token: 'tok-' + email, refresh_token: 'rt-' + email, expires_in: 14400, token_type: 'bearer' });
      case 'users/get_current_account': return J(200, { account_id: u.account_id, email: u.email, name: { display_name: u.name, given_name: u.name } });
      case 'files/create_folder_v2': {
        let name = arg.path.replace(/^\//, ''), n = 1; const base = name;
        while (u.personal.has(name.toLowerCase())) name = `${base} (${n++})`;
        u.personal.set(name.toLowerCase(), { name });
        return J(200, { metadata: { '.tag': 'folder', name, path_lower: '/' + name.toLowerCase(), path_display: '/' + name } });
      }
      case 'sharing/share_folder': {
        const name = (u.personal.get(arg.path.replace(/^\//, '').toLowerCase()) || {}).name || arg.path.replace(/^\//, ''), id = 'sf' + (++ids);
        folders[id] = { id, owner: email, name, files: new Map(), log: [], seq: 0, members: new Map([[email, 'owner']]), pending: new Set() };
        u.mounted.add(id);
        return J(200, { '.tag': 'complete', shared_folder_id: id, name, path_lower: '/' + name.toLowerCase() });
      }
      case 'sharing/add_folder_member': {
        const fo = folders[arg.shared_folder_id]; if (!access(fo, email)) return fail(409, 'no_permission');
        for (const m of arg.members) { const e = m.member.email.toLowerCase(); if (!fo.members.has(e)) { fo.members.set(e, 'editor'); fo.pending.add(e); } }
        return J(200, null);
      }
      case 'sharing/list_mountable_folders': return J(200, { entries: Object.values(folders).filter(f => f.members.has(email) && !u.mounted.has(f.id)).map(f => ({ shared_folder_id: f.id, name: f.name })), cursor: 'x', has_more: false });
      case 'sharing/list_folders': return J(200, { entries: Object.values(folders).filter(f => f.members.has(email)).map(f => ({ shared_folder_id: f.id, name: f.name, ...(u.mounted.has(f.id) ? { path_lower: '/' + f.name.toLowerCase() } : {}) })), has_more: false });
      case 'sharing/mount_folder': {
        const fo = folders[arg.shared_folder_id]; if (!access(fo, email)) return fail(409, 'no_permission');
        if (u.mounted.has(fo.id)) return fail(409, 'already_mounted');
        u.mounted.add(fo.id); fo.pending.delete(email);
        return J(200, { '.tag': 'folder', name: fo.name, path_lower: '/' + fo.name.toLowerCase(), shared_folder_id: fo.id });
      }
      case 'sharing/remove_folder_member': {
        const fo = folders[arg.shared_folder_id]; if (!access(fo, email)) return fail(409, 'no_permission');
        const e = arg.member.email.toLowerCase(); if (!fo.members.has(e)) return fail(409, 'member_error/no_member');
        fo.members.delete(e); fo.pending.delete(e); if (users[e]) users[e].mounted.delete(fo.id);
        return J(200, { '.tag': 'complete' });
      }
      case 'sharing/relinquish_folder_membership': {
        const fo = folders[arg.shared_folder_id]; if (!access(fo, email)) return fail(409, 'no_permission');
        if (fo.owner === email) return fail(409, 'folder_owner');
        fo.members.delete(email); u.mounted.delete(fo.id);
        return J(200, { '.tag': 'complete' });
      }
      case 'files/list_folder': {
        const p = parse(arg.path), fo = p && folders[p.id]; if (!access(fo, email)) return fail(409, 'path/not_found');
        const entries = [], dirs = new Set();
        for (const f of fo.files.values()) { entries.push(meta(f, f.path)); const segs = f.path.split('/'); for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join('/')); }
        for (const d of dirs) entries.push({ '.tag': 'folder', name: d.split('/').pop(), path_lower: '/' + d.toLowerCase(), path_display: '/' + d });
        return J(200, { entries, cursor: `c:${fo.id}:${fo.seq}`, has_more: false });
      }
      case 'files/list_folder/continue': {
        const m = /^c:([^:]+):(\d+)$/.exec(arg.cursor || ''), fo = m && folders[m[1]]; if (!fo) return fail(409, 'reset');
        if (!access(fo, email)) return fail(409, 'path/not_found');
        const since = +m[2];
        const entries = fo.log.filter(l => l.seq > since).map(l => (l.deleted || !fo.files.get(l.path.toLowerCase()) ? { '.tag': 'deleted', name: l.path.split('/').pop(), path_lower: '/' + l.path.toLowerCase(), path_display: '/' + l.path } : meta(fo.files.get(l.path.toLowerCase()), l.path)));
        return J(200, { entries, cursor: `c:${fo.id}:${fo.seq}`, has_more: false });
      }
      case 'files/delete_v2': {
        const p = parse(arg.path), fo = p && folders[p.id]; if (!access(fo, email)) return fail(409, 'path_lookup/not_found');
        const k = p.rel.toLowerCase(), f = fo.files.get(k); if (!f) return fail(409, 'path_lookup/not_found');
        fo.files.delete(k); fo.log.push({ seq: ++fo.seq, path: f.path, deleted: true });
        return J(200, { metadata: meta(f, f.path) });
      }
      case 'files/upload': {
        const p = parse(arg.path), fo = p && folders[p.id]; if (!access(fo, email)) return fail(409, 'path/no_write_permission');
        const k = p.rel.toLowerCase(), cur = fo.files.get(k), mode = arg.mode, tag = typeof mode === 'string' ? mode : (mode && mode['.tag']);
        if (cur && tag === 'add') return fail(409, 'path/conflict/file');
        if (tag === 'update' && (!cur || cur.rev !== mode.update)) return fail(409, 'path/conflict/file');
        const f = { path: p.rel, bytes: body || Buffer.alloc(0), rev: 'r' + (++revs), at: Date.now(), by: email };
        fo.files.set(k, f); fo.log.push({ seq: ++fo.seq, path: p.rel, deleted: false });
        return J(200, meta(f, p.rel));
      }
      case 'files/download': {
        const p = parse(arg.path), fo = p && folders[p.id]; if (!access(fo, email)) return fail(409, 'path/not_found');
        const f = fo.files.get(p.rel.toLowerCase()); if (!f) return fail(409, 'path/not_found');
        return { status: 200, contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*', 'dropbox-api-result': JSON.stringify(meta(f, f.path)) }, body: f.bytes };
      }
      default: return fail(400, 'unknown_endpoint/' + ep);
    }
  }
  /** Routes for one phone, signed in to Dropbox as `email`. */
  async function install(ctx, email) {
    email = email.toLowerCase();
    await ctx.route('https://api.dropboxapi.com/**', r => {
      if (offline.has(email)) return r.abort('internetdisconnected');
      const q = r.request(), ep = new URL(q.url()).pathname.replace(/^\/2\//, '').replace(/^\//, '');
      if (expired.has(email) && ep !== 'oauth2/token') return r.fulfill(J(401, { error_summary: 'expired_access_token/...', error: { '.tag': 'expired_access_token' } }));
      let arg = null; try { arg = JSON.parse(q.postData() || 'null'); } catch (e) { arg = null; }
      return r.fulfill(api(email, ep, arg));
    });
    await ctx.route('https://content.dropboxapi.com/**', r => {
      if (offline.has(email)) return r.abort('internetdisconnected');
      const q = r.request(), ep = new URL(q.url()).pathname.replace(/^\/2\//, '');
      if (expired.has(email)) return r.fulfill(J(401, { error_summary: 'expired_access_token/...', error: { '.tag': 'expired_access_token' } }));
      let arg = {}; try { arg = JSON.parse(q.headers()['dropbox-api-arg'] || '{}'); } catch (e) { arg = {}; }
      const b = q.postDataBuffer();
      return r.fulfill(api(email, ep, arg, b ? Buffer.from(b) : Buffer.alloc(0)));
    });
  }
  const only = () => { const ks = Object.keys(folders); if (ks.length !== 1) throw new Error(`${ks.length} folders`); return folders[ks[0]]; };
  return {
    install, users, folders, calls, offline, expired, label: 'Dropbox',
    /** The one family folder of a test. */
    only,
    /** Whether this account is a member of the family folder. */
    access: email => only().members.has(email.toLowerCase()),
    /** Invited, not yet accepted (Dropbox asks people to accept a shared folder). */
    pending: email => only().pending.has(email.toLowerCase()),
    /** The calls a sync with nothing new makes. */
    idle: ['files/list_folder/continue'],
    /** The paths in it (display case), sorted. */
    paths: fo => [...(fo || only()).files.values()].map(f => f.path).sort(),
    /** A file's text. */
    text: (p, fo) => { const f = (fo || only()).files.get(p.toLowerCase()); return f ? f.bytes.toString('utf8') : null; },
    /** Who wrote a file. */
    by: (p, fo) => { const f = (fo || only()).files.get(p.toLowerCase()); return f ? f.by : null; },
  };
}
module.exports = { createFakeDropbox };
