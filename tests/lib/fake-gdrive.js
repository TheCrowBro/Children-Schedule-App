// A stand-in for the Google Drive API (v3), as far as the family folder (folder.js) uses it: files and folders by id with parents,
// content revisions and headRevisionId, the changes feed with page tokens, permissions by email on the family folder (inherited by
// everything in it), "shared with me", capabilities (only the owner may delete or trash), who last wrote a file and who owns it,
// writersCanShare (the owner's setting: whether others with edit access may share the folder on), the account. In memory, shared by every
// phone in a test; each phone's Playwright context gets its own routes, bound to the Google account it signed in with, so three
// phones are three accounts sharing one folder, as in life.
function createFakeGoogleDrive() {
  const users = {}, files = {}, log = [], calls = [], offline = new Set(), expired = new Set();   // log: the changes feed, one line per write, trash, delete, access gained or lost; expired: accounts whose token Drive rejects
  let seq = 0, ids = 0, revs = 0, clock = Date.now();
  const FOLDER = 'application/vnd.google-apps.folder';
  const J = (status, body) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: body === null ? '' : JSON.stringify(body) });
  const fail = (status, reason, message) => J(status, { error: { code: status, message: message || reason, errors: [{ reason, message: message || reason }] } });
  const user = email => users[email] || (users[email] = { email, permissionId: 'p' + Buffer.from(email).toString('hex').slice(0, 16), name: email.split('@')[0].replace(/^./, c => c.toUpperCase()) });
  const chain = f => { const out = [f]; while (f.parents[0] && files[f.parents[0]]) { f = files[f.parents[0]]; out.push(f); } return out; };   // (the file, its folder, that folder's folder…)
  const role = (f, email) => {   // (a folder's permissions reach everything in it, wherever the folder is moved; the folder's owner may edit what others put in it, not delete it)
    if (!f) return null; if (f.owner === email) return 'owner';
    if (chain(f).slice(1).some(a => a.owner === email)) return 'writer';
    for (const a of chain(f)) { const p = a.perms && a.perms.get(email); if (p) return p.role; }
    return null;
  };
  const canWrite = (f, email) => ['owner', 'writer'].includes(role(f, email));
  const who = e => ({ emailAddress: e, permissionId: user(e).permissionId });
  // How a file's last writer is reported (lastModifyingUser): as is, or with the quirks the real Drive has shown: `id: 'odd'` names the
  // writer by an id other than the one about.get gave that user; `email: false` leaves the address out.
  let quirk = null;
  const whoWrote = e => { const u = who(e); if (!quirk) return u; if (quirk.id === 'odd') u.permissionId = 'odd' + u.permissionId; if (quirk.email === false) delete u.emailAddress; return u; };
  const meta = (f, email) => ({ id: f.id, name: f.name, mimeType: f.mime, size: String(f.bytes.length), headRevisionId: f.head || undefined, md5Checksum: f.head ? 'md5-' + f.head : undefined, parents: f.parents.slice(), trashed: f.trashed, capabilities: { canDelete: f.owner === email, canTrash: f.owner === email },
    lastModifyingUser: whoWrote(f.by || f.owner), owners: [who(f.owner)], ownedByMe: f.owner === email, writersCanShare: f.writersCanShare !== false });
  const subtree = f => { const out = [f]; for (const x of Object.values(files)) if (x.parents[0] === f.id) out.push(...subtree(x)); return out; };
  const unq = s => s.replace(/\\(.)/g, '$1');
  function query(email, q) {
    const tests = [];
    for (const c of q.split(/\s+and\s+/)) {
      let m;
      if ((m = /^'([^']+)' in parents$/.exec(c))) tests.push(f => f.parents[0] === m[1]);
      else if ((m = /^name = '((?:\\.|[^'\\])*)'$/.exec(c))) { const n = unq(m[1]); tests.push(f => f.name === n); }
      else if ((m = /^name contains '((?:\\.|[^'\\])*)'$/.exec(c))) { const n = unq(m[1]).toLowerCase(); tests.push(f => f.name.toLowerCase().includes(n)); }
      else if ((m = /^mimeType = '([^']+)'$/.exec(c))) tests.push(f => f.mime === m[1]);
      else if (c === 'trashed = false') tests.push(f => !f.trashed);
      else if (c === 'sharedWithMe = true') tests.push(f => f.owner !== email && !!role(f, email));
      else if (c === "'me' in owners") tests.push(f => f.owner === email);
      else return null;
    }
    return Object.values(files).filter(f => role(f, email) && tests.every(t => t(f)));
  }
  function api(email, method, u, body) {
    const url = new URL(u), path = url.pathname, q = url.searchParams;
    let m;
    if (url.host === 'oauth2.googleapis.com') { calls.push('token'); return J(200, { access_token: 'tok-' + email, refresh_token: 'rt-' + email, expires_in: 3600, token_type: 'Bearer' }); }
    if (path === '/drive/v3/about') { calls.push('about'); const x = user(email); return J(200, { user: { permissionId: x.permissionId, emailAddress: x.email, displayName: x.name } }); }
    if (path === '/drive/v3/changes/startPageToken') { calls.push('changes.start'); return J(200, { startPageToken: String(seq) }); }
    if (path === '/drive/v3/changes') {
      calls.push('changes.list');
      const t = +q.get('pageToken'); if (!(t >= 0) || t > seq) return fail(404, 'notFound', 'Invalid page token');
      const changes = [];
      for (const l of log) {
        if (l.seq <= t) continue;
        if (l.lost) { if (l.lost === email) changes.push({ fileId: l.fileId, removed: true }); continue; }
        if (l.gained && l.gained !== email) continue;
        const f = files[l.fileId];
        if (!f) { if (l.seen.has(email)) changes.push({ fileId: l.fileId, removed: true }); continue; }   // (deleted: those who could see it are told)
        if (!role(f, email)) continue;
        changes.push({ fileId: f.id, removed: false, file: meta(f, email) });
      }
      return J(200, { changes, newStartPageToken: String(seq) });
    }
    if (path === '/drive/v3/files' && method === 'GET') {
      calls.push('files.list');
      const r = query(email, q.get('q') || ''); if (!r) return fail(400, 'invalid', 'Invalid query: ' + q.get('q'));
      return J(200, { files: r.map(f => meta(f, email)) });
    }
    if (path === '/drive/v3/files' && method === 'POST') {
      calls.push('files.create');
      let j; try { j = JSON.parse(body.toString('utf8') || '{}'); } catch (e) { return fail(400, 'parseError'); }
      const pid = j.parents && j.parents[0], parent = pid ? files[pid] : null;
      if (pid && (!parent || !role(parent, email))) return fail(404, 'notFound', 'File not found: ' + pid);
      if (parent && !canWrite(parent, email)) return fail(403, 'insufficientFilePermissions');
      const f = { id: 'f' + (++ids), name: String(j.name || 'Untitled'), mime: j.mimeType === FOLDER ? FOLDER : 'application/octet-stream', parents: pid ? [pid] : [], owner: email, by: email, trashed: false, bytes: Buffer.alloc(0), head: null, revisions: [], perms: j.mimeType === FOLDER ? new Map() : null };
      files[f.id] = f; log.push({ seq: ++seq, fileId: f.id, seen: new Set([email]) });
      return J(200, meta(f, email));
    }
    if ((m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(path)) && method === 'PATCH') {
      calls.push('files.upload');
      const f = files[m[1]]; if (!f || !role(f, email)) return fail(404, 'notFound', 'File not found: ' + m[1]);
      if (!canWrite(f, email)) return fail(403, 'insufficientFilePermissions');
      const rev = 'r' + (++revs); f.bytes = Buffer.from(body || Buffer.alloc(0)); f.head = rev; f.by = email; f.revisions.push({ id: rev, bytes: f.bytes, time: new Date(clock += 7).toISOString() });
      log.push({ seq: ++seq, fileId: f.id, seen: new Set([email]) });
      return J(200, meta(f, email));
    }
    if ((m = /^\/drive\/v3\/files\/([^/]+)\/revisions$/.exec(path))) {
      calls.push('revisions.list');
      const f = files[m[1]]; if (!f || !role(f, email)) return fail(404, 'notFound');
      return J(200, { revisions: f.revisions.map(r => ({ id: r.id, modifiedTime: r.time })) });
    }
    if ((m = /^\/drive\/v3\/files\/([^/]+)\/revisions\/([^/]+)$/.exec(path))) {
      calls.push('revisions.get');
      const f = files[m[1]], r = f && f.revisions.find(x => x.id === m[2]); if (!f || !role(f, email) || !r) return fail(404, 'notFound');
      return { status: 200, contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: r.bytes };
    }
    if ((m = /^\/drive\/v3\/files\/([^/]+)\/permissions$/.exec(path))) {
      const f = files[m[1]]; if (!f || !role(f, email)) return fail(404, 'notFound');
      if (method === 'POST') {
        calls.push('permissions.create');
        if (!canWrite(f, email)) return fail(403, 'insufficientFilePermissions');
        if (f.writersCanShare === false && f.owner !== email) return fail(403, 'insufficientFilePermissions', 'The owner has not allowed others to share this file');
        let j; try { j = JSON.parse(body.toString('utf8') || '{}'); } catch (e) { return fail(400, 'parseError'); }
        const e = String(j.emailAddress || '').toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(e)) return fail(400, 'invalidSharingRequest');
        if (!f.perms) f.perms = new Map();
        if (f.owner !== e && !f.perms.has(e)) { f.perms.set(e, { id: user(e).permissionId, role: j.role === 'reader' ? 'reader' : 'writer', message: q.get('emailMessage') || '' }); for (const x of subtree(f)) log.push({ seq: ++seq, fileId: x.id, gained: e, seen: new Set() }); }
        return J(200, { id: user(e).permissionId });
      }
      calls.push('permissions.list');
      return J(200, { permissions: [{ id: user(f.owner).permissionId, emailAddress: f.owner, role: 'owner', type: 'user' }, ...[...(f.perms || new Map()).entries()].map(([e, p]) => ({ id: p.id, emailAddress: e, role: p.role, type: 'user' }))] });
    }
    if ((m = /^\/drive\/v3\/files\/([^/]+)\/permissions\/([^/]+)$/.exec(path)) && method === 'DELETE') {
      calls.push('permissions.delete');
      const f = files[m[1]]; if (!f || !role(f, email)) return fail(404, 'notFound');
      const e = [...(f.perms || new Map()).entries()].find(([, p]) => p.id === m[2]); if (!e) return fail(404, 'notFound', 'Permission not found');
      if (e[0] !== email && !canWrite(f, email)) return fail(403, 'insufficientFilePermissions');
      f.perms.delete(e[0]);
      for (const x of subtree(f)) if (x.owner !== e[0]) log.push({ seq: ++seq, fileId: x.id, lost: e[0] });
      return J(204, null);
    }
    if ((m = /^\/drive\/v3\/files\/([^/]+)$/.exec(path))) {
      const f = files[m[1]]; if (!f || !role(f, email)) { calls.push('files.get'); return fail(404, 'notFound', 'File not found: ' + m[1]); }
      if (method === 'GET') {
        if (q.get('alt') === 'media') { calls.push('files.download'); return { status: 200, contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: f.bytes }; }
        calls.push('files.get'); return J(200, meta(f, email));
      }
      if (method === 'PATCH') {
        calls.push('files.update');
        let j; try { j = JSON.parse(body.toString('utf8') || '{}'); } catch (e) { return fail(400, 'parseError'); }
        if (j.trashed !== undefined) { if (f.owner !== email) return fail(403, 'insufficientFilePermissions'); f.trashed = !!j.trashed; log.push({ seq: ++seq, fileId: f.id, seen: new Set([email]) }); }
        if (j.writersCanShare !== undefined) { if (f.owner !== email) return fail(403, 'insufficientFilePermissions'); f.writersCanShare = !!j.writersCanShare; }
        return J(200, meta(f, email));
      }
      if (method === 'DELETE') {
        calls.push('files.delete');
        if (f.owner !== email) return fail(403, 'insufficientFilePermissions');
        for (const x of subtree(f)) { const seen = new Set([x.owner, ...chain(x).flatMap(a => (a.perms ? [...a.perms.keys()] : []))]); delete files[x.id]; log.push({ seq: ++seq, fileId: x.id, seen }); }
        return J(204, null);
      }
    }
    return fail(400, 'unknown', 'unknown endpoint ' + method + ' ' + path);
  }
  /** Routes for one phone, signed in to Google as `email`. */
  async function install(ctx, email) {
    email = email.toLowerCase();
    const handle = r => {
      if (offline.has(email)) return r.abort('internetdisconnected');
      const q = r.request(), b = q.postDataBuffer();
      if (expired.has(email) && !/oauth2\.googleapis\.com/.test(q.url())) return r.fulfill(fail(401, 'authError', 'Invalid Credentials'));
      return r.fulfill(api(email, q.method(), q.url(), b ? Buffer.from(b) : Buffer.alloc(0)));
    };
    await ctx.route('https://www.googleapis.com/**', handle);
    await ctx.route('https://oauth2.googleapis.com/**', handle);
  }
  const only = () => { const ks = Object.values(files).filter(f => f.mime === FOLDER && Object.values(files).some(x => x.parents[0] === f.id && x.name === 'littlelog.json')); if (ks.length !== 1) throw new Error(`${ks.length} folders`); return ks[0]; };   // (the family folder: the one with the marker in it, wherever it was moved)
  const walk = (f, d, out) => { for (const x of Object.values(files)) { if (x.parents[0] !== f.id || x.trashed) continue; const p = d ? d + '/' + x.name : x.name; if (x.mime === FOLDER) walk(x, p, out); else if (x.bytes.length) out.push({ path: p, file: x }); } return out; };
  const find = p => (walk(only(), '', []).find(x => x.path.toLowerCase() === p.toLowerCase()) || {}).file || null;
  return {
    install, users, files, log, calls, offline, expired, label: 'Google Drive',
    /** The one family folder of a test: its owner and name. */
    only: () => { const f = only(); return { owner: f.owner, name: f.name }; },
    /** The paths in it, sorted (an emptied file counts as gone, as it does for the app). */
    paths: () => walk(only(), '', []).map(x => x.path).sort(),
    /** A file's text. */
    text: p => { const f = find(p); return f ? f.bytes.toString('utf8') : null; },
    /** Who last wrote a file. */
    by: p => { const f = find(p); return f ? f.by || f.owner : null; },
    /** An account's id, as Drive names it (what the app derives a person's id from). */
    account: email => user(email.toLowerCase()).permissionId,
    writerQuirk: q => { quirk = q || null; },   // (how lastModifyingUser is reported from now on: { id: 'odd' }, { email: false }, both, or null)
    /** A file emptied by someone with edit access (as another member's "delete" leaves it): gone, as far as the app is concerned. */
    damage: p => { const f = find(p); if (!f) throw new Error('no ' + p); f.bytes = Buffer.alloc(0); f.head = 'r' + (++revs); f.revisions.push({ id: f.head, bytes: f.bytes, time: new Date(clock += 7).toISOString() }); log.push({ seq: ++seq, fileId: f.id, seen: new Set([f.owner]) }); },
    /** The folder as an app from before signing left it: no signatures, no root, no signing keys, no ext on the grants. */
    strip: () => { for (const { path: p, file: f } of walk(only(), '', [])) { if (!/\.json$/.test(p)) continue; let j; try { j = JSON.parse(f.bytes.toString('utf8')); } catch (e) { continue; } delete j.s; if (p === 'littlelog.json') delete j.root; if (/^keys\//.test(p)) delete j.ext; if (/^devices\//.test(p)) delete j.sig; if (p === 'recovery.json') { delete j.recovery_spub; delete j.recovery_spriv_wrapped; } f.bytes = Buffer.from(JSON.stringify(j)); f.by = f.owner; f.head = 'r' + (++revs); f.revisions.push({ id: f.head, bytes: f.bytes, time: new Date(clock += 7).toISOString() }); log.push({ seq: ++seq, fileId: f.id, seen: new Set([f.owner]) }); } },
    /** Whether only the owner may share the folder on. */
    ownerOnly: () => only().writersCanShare === false,
    /** The owner moves the family folder into a new folder of theirs (its id, and its sharing, stay). */
    relocate: email => { email = email.toLowerCase(); const fo = only(); const nf = { id: 'f' + (++ids), name: 'Family stuff', mime: FOLDER, parents: [], owner: email, by: email, trashed: false, bytes: Buffer.alloc(0), head: null, revisions: [], perms: new Map() }; files[nf.id] = nf; fo.parents = [nf.id]; log.push({ seq: ++seq, fileId: nf.id, seen: new Set([email]) }); log.push({ seq: ++seq, fileId: fo.id, seen: new Set([email]) }); },
    /** Whether this account can open the family folder. */
    access: email => !!role(only(), email.toLowerCase()),
    /** Drive shares at once: nobody is "invited but not in". */
    pending: () => null,
    /** The calls a sync with nothing new makes. */
    idle: ['changes.list'],
  };
}
module.exports = { createFakeGoogleDrive };
