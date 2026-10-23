'use strict';
/* Family sync. Local-first: the app always works from local storage; this module merges changes with the shared baby
   log in Supabase (pull, then push). All writes go through the server's push_events(), which enforces each person's
   role and permissions. Conflicts: newest `updated` timestamp wins.
   Relies on the globals `db` and `save()` from app.js (read lazily, at call time). */
const Sync = (() => {
  const st = { state: 'idle', at: 0, err: '', denied: 0, needMfa: false, memberships: [], people: [], requests: [], invites: [], myRequests: [] };
  const PAGE = 500, OVERLAP_MS = 5000;
  let busy = false, again = false, timer = null, started = false, peopleAt = 0;

  const enabled = () => Auth.configured && Auth.signedIn;
  const linked = () => enabled() && !!db.meta.babyId;
  const notify = changed => { if (Sync.onChange) Sync.onChange(changed); };
  const q = encodeURIComponent;

  // ---- permissions (UI only – the server enforces the same rules) -----------------------------
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
  const nameOf = id => { const p = st.people.find(x => x.user_id === id); return p ? (p.is_you ? 'you' : p.display_name) : ''; };

  // ---- local merge -------------------------------------------------------------------------
  /** Merge event rows (local shape, plus `deleted`) into db. `force` ignores timestamps (used to restore the server's
      version after a write was refused). Returns how many changed. */
  function merge(rows, touch, force) {
    const live = new Map(db.events.map(e => [e.id, e]));
    const tomb = new Map(db.deleted.map(t => [t.id, t]));
    const drop = new Set();
    let n = 0;
    for (const r of rows) {
      const cur = live.get(r.id) || tomb.get(r.id);
      if (!force && cur && (cur.updated || 0) >= r.updated) continue;
      if (r.deleted) { if (live.has(r.id)) { drop.add(r.id); live.delete(r.id); n++; } if (force && tomb.has(r.id)) { db.deleted = db.deleted.filter(t => t.id !== r.id); tomb.delete(r.id); } continue; }
      const rec = { id: r.id, type: r.type, ts: r.ts, data: r.data || {}, note: r.note || '', updated: touch ? Date.now() : r.updated };
      if (r.end != null) rec.end = r.end;
      if (r.by) rec.by = r.by;
      const mineRec = live.get(r.id);
      if (mineRec) { for (const k of Object.keys(mineRec)) delete mineRec[k]; Object.assign(mineRec, rec); }   // edit in place so open sheets stay valid
      else { db.events.push(rec); live.set(r.id, rec); }
      if (tomb.has(r.id)) { db.deleted = db.deleted.filter(t => t.id !== r.id); tomb.delete(r.id); }
      n++;
    }
    if (drop.size) db.events = db.events.filter(e => !drop.has(e.id));
    return n;
  }
  const fromRow = r => ({ id: r.id, type: r.type, ts: +r.ts, end: r.end_ts == null ? null : +r.end_ts, data: r.data, note: r.note, updated: +r.updated, deleted: r.deleted, by: r.created_by });
  const toRow = (e, deleted) => ({ id: e.id, type: e.type, ts: e.ts, end_ts: e.end ?? null, data: e.data || {}, note: e.note || '', updated: e.updated, deleted });

  function reset() { db.events = []; db.deleted = []; db.meta.pulledAt = ''; db.meta.pushedAt = 0; }

  // ---- remote operations -------------------------------------------------------------------
  async function pullBaby() {
    const b = db.meta.babyId;
    const mem = await Auth.api(`/members?baby_id=eq.${b}&user_id=eq.${Auth.id}&select=role,perms`);
    if (!mem.length) { lostAccess(); return false; }
    db.meta.role = mem[0].role; db.meta.perms = mem[0].perms || {};
    st.needMfa = false;
    const baby = await Auth.api(`/babies?id=eq.${b}&select=name,birth`);
    if (!baby.length) { st.needMfa = true; st.state = 'error'; st.err = 'Two-step verification is required'; return false; }   // a parent without an MFA session
    if (db.meta.babyDirty) {
      db.meta.babyDirty = false;
      try { await Auth.rpc('update_baby', { p_baby: b, p_name: db.baby.name, p_birth: db.baby.birth || null }); baby[0] = { name: db.baby.name, birth: db.baby.birth }; } catch (e) { st.denied++; }
    }
    db.baby = { name: baby[0].name || '', birth: baby[0].birth || '' };
    if (db.meta.role !== 'parent' && !db.meta.perms.view_health) db.events = db.events.filter(e => e.type !== 'health' && e.type !== 'med');   // access to health notes was taken away
    return true;
  }
  function lostAccess() { reset(); db.meta.babyId = null; db.meta.role = null; db.meta.perms = null; db.baby = { name: '', birth: '' }; st.people = []; save(true); }

  async function pull() {
    const b = db.meta.babyId;
    let since = db.meta.pulledAt ? new Date(new Date(db.meta.pulledAt).getTime() - OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z';
    let changed = 0;
    for (;;) {
      const rows = await Auth.api(`/events?baby_id=eq.${b}&synced_at=gt.${q(since)}&order=synced_at.asc&limit=${PAGE}&select=*`);
      changed += merge(rows.map(fromRow));
      if (rows.length) { since = rows[rows.length - 1].synced_at; db.meta.pulledAt = since; }
      if (rows.length < PAGE) break;
    }
    return changed;
  }

  async function push() {
    const b = db.meta.babyId, cut = Date.now(), since = db.meta.pushedAt || 0;
    const out = [
      ...db.events.filter(e => e.updated > since && e.updated <= cut).map(e => toRow(e, false)),
      ...db.deleted.filter(t => t.updated > since && t.updated <= cut).map(t => toRow(t, true)),
    ];
    const denied = [];
    for (let i = 0; i < out.length; i += 200) {
      const r = await Auth.rpc('push_events', { p_baby: b, p_rows: out.slice(i, i + 200) });
      denied.push(...((r && r.denied) || []));
    }
    db.meta.pushedAt = cut;
    db.deleted = db.deleted.filter(t => t.updated > cut);   // tombstones now live on the server
    if (denied.length) await restore(denied);
  }
  /** The server refused these changes (permissions changed, or a rule was broken): put the server's version back. */
  async function restore(ids) {
    const b = db.meta.babyId, safe = ids.filter(i => /^[A-Za-z0-9_-]{1,64}$/.test(i));
    st.denied += ids.length;
    const rows = safe.length ? (await Auth.api(`/events?baby_id=eq.${b}&id=in.(${safe.join(',')})&select=*`)).map(fromRow) : [];
    const have = new Set(rows.map(r => r.id));
    merge(rows, false, true);
    merge(safe.filter(i => !have.has(i)).map(id => ({ id, deleted: true, updated: 0 })), false, true);   // never existed on the server: drop the local copy
  }

  async function run() {
    if (!linked()) return;
    if (db.meta.role === 'parent' && Auth.aal !== 'aal2') { st.needMfa = true; st.state = 'error'; st.err = 'Two-step verification is required'; return notify(); }
    if (busy) { again = true; return; }
    busy = true; st.state = 'syncing'; notify();
    let changed = 0;
    try {
      if (await pullBaby()) {
        changed = await pull();
        await push();
        if (Date.now() - peopleAt > 120000 || db.events.some(e => e.by && !st.people.some(p => p.user_id === e.by))) { await loadPeople().catch(() => {}); }
        if (db.meta.role === 'parent') await loadAdmin().catch(() => {});
        st.state = 'ok'; st.at = Date.now(); st.err = '';
      } else if (!st.needMfa) st.state = 'idle';   // access was removed; lostAccess() already reset this device
    } catch (e) {
      st.state = (e instanceof TypeError || navigator.onLine === false) ? 'offline' : 'error';
      st.err = e.message;
      if (!Auth.signedIn && Sync.onSessionLost) { busy = false; Sync.onSessionLost(); }
    } finally {
      busy = false; save(true);
      notify(changed > 0);
      if (again) { again = false; schedule(1500); }
    }
  }
  function schedule(ms = 2000) { if (!linked()) return; clearTimeout(timer); timer = setTimeout(run, ms); }

  // ---- people, requests, invites, activity -------------------------------------------------
  async function loadPeople() { st.people = await Auth.rpc('list_people', { p_baby: db.meta.babyId }); peopleAt = Date.now(); return st.people; }
  async function loadAdmin() {   // parents only
    [st.requests, st.invites] = await Promise.all([Auth.rpc('list_requests', { p_baby: db.meta.babyId }), Auth.rpc('list_invites', { p_baby: db.meta.babyId })]);
  }
  const activity = (before) => Auth.rpc('activity_log', { p_baby: db.meta.babyId, p_limit: 50, p_before: before || null });
  const createInvite = async (role, perms) => { const c = await Auth.rpc('create_invite', { p_baby: db.meta.babyId, p_role: role, p_perms: perms }); await loadAdmin(); return c; };
  const rescind = async code => { await Auth.rpc('rescind_invite', { p_code: code }); await loadAdmin(); };
  const decide = async (id, approve, role, perms) => { await Auth.rpc('decide_request', { p_id: id, p_approve: approve, p_role: role || null, p_perms: perms || null }); await Promise.all([loadAdmin(), loadPeople()]); };
  const setMember = async (user, role, perms) => { await Auth.rpc('set_member', { p_baby: db.meta.babyId, p_user: user, p_role: role, p_perms: perms }); await loadPeople(); };
  const resetMfa = user => Auth.rpc('reset_member_mfa', { p_baby: db.meta.babyId, p_user: user });
  const setDisplayName = async name => { await Auth.rpc('set_display_name', { p_name: name }); await loadPeople().catch(() => {}); };
  async function removeMember(userId) {
    await Auth.rpc('remove_member', { p_baby: db.meta.babyId, p_user: userId });
    if (userId === Auth.id) { lostAccess(); await loadMemberships(); } else await loadPeople();
  }

  // ---- baby / membership management ---------------------------------------------------------
  async function loadMemberships() {
    const rows = await Auth.api(`/members?user_id=eq.${Auth.id}&select=baby_id,role,perms,babies(name,birth)`);
    st.memberships = rows.map(r => ({ id: r.baby_id, role: r.role, perms: r.perms || {}, name: (r.babies && r.babies.name) || '', birth: (r.babies && r.babies.birth) || '' }));
    return st.memberships;
  }
  async function loadMyRequests() { st.myRequests = await Auth.rpc('my_requests'); return st.myRequests; }
  /** Make `id` the baby shown on this device. Clears the local cache when switching to a different baby. */
  function choose(id) {
    const m = st.memberships.find(x => x.id === id);
    if (!m) return;
    if (db.meta.babyId !== id) { reset(); db.meta.babyDirty = false; st.people = []; peopleAt = 0; }
    db.meta.babyId = id; db.meta.role = m.role; db.meta.perms = m.perms; if (m.name) db.baby = { name: m.name, birth: m.birth };
    save(true); run();
  }
  async function createBaby(name, birth, displayName) {
    const id = await Auth.rpc('create_baby', { p_name: name, p_birth: birth || null, p_display_name: displayName || '' });
    // Existing local entries (from before sign-in) are adopted by the new baby and uploaded.
    db.meta.babyId = id; db.meta.role = 'parent'; db.meta.perms = null; db.meta.pulledAt = ''; db.meta.pushedAt = 0; db.meta.babyDirty = false;
    db.events.forEach(e => { e.by = Auth.id; });
    db.baby = { name, birth: birth || '' };
    save(true); await loadMemberships(); run();
  }
  /** Redeem an invite code. This only sends a request; a parent has to approve it. */
  async function requestJoin(code, displayName) {
    const r = await Auth.rpc('redeem_invite', { p_code: code, p_display_name: displayName || '' });
    if (!r || r.status !== 'pending') throw new Error('This invite is invalid or has expired');
    await loadMyRequests();
  }
  /** Check whether a pending request was approved; if so, switch to that log. */
  async function checkApproval() {
    await Promise.all([loadMyRequests(), loadMemberships()]);
    if (!db.meta.babyId && st.memberships.length) { choose(st.memberships[0].id); return true; }
    return false;
  }
  const cancelRequest = async id => { await Auth.rpc('cancel_my_request', { p_id: id }); await loadMyRequests(); };
  const pendingRequest = () => st.myRequests.find(r => r.status === 'pending');

  // Invite links only open the installed app (custom URL scheme); people without the app scan the QR code inside it.
  const inviteUrl = code => Native.scheme + '://join?join=' + code;
  function pushBaby() { db.meta.babyDirty = true; save(); schedule(500); }

  function start() {
    if (started) return run();
    started = true;
    setInterval(() => { if (!document.hidden) run(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    window.addEventListener('online', run);
    run();
  }

  return { st, enabled, linked, isParent, can, nameOf, merge, run, schedule, start, loadMemberships, loadMyRequests, loadPeople, loadAdmin, activity,
    createInvite, rescind, decide, setMember, resetMfa, setDisplayName, removeMember, choose, createBaby, requestJoin, checkApproval, cancelRequest,
    pendingRequest, inviteUrl, pushBaby, onChange: null, onSessionLost: null };
})();
