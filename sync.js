'use strict';
/* Family sync. Local-first: the app always works from localStorage; this module merges changes with
   the shared baby log in Supabase (pull, then push). Conflicts: newest `updated` timestamp wins.
   Relies on the globals `db` and `save()` from app.js (read lazily, at call time). */
const Sync = (() => {
  const st = { state: 'idle', at: 0, err: '', memberships: [], members: [] };
  const PAGE = 500, OVERLAP_MS = 5000;
  let busy = false, again = false, timer = null;

  const enabled = () => Auth.configured && Auth.signedIn;
  const linked = () => enabled() && !!db.meta.babyId;
  const canEdit = () => !linked() || ['owner', 'caregiver'].includes(db.meta.role);
  const notify = () => { if (Sync.onChange) Sync.onChange(); };
  const q = encodeURIComponent;

  // ---- local merge -------------------------------------------------------------------------
  /** Merge event rows (local shape, plus `deleted`) into db. Returns how many changed. */
  function merge(rows, touch) {
    const live = new Map(db.events.map(e => [e.id, e]));
    const tomb = new Map(db.deleted.map(t => [t.id, t]));
    const drop = new Set();
    let n = 0;
    for (const r of rows) {
      const cur = live.get(r.id) || tomb.get(r.id);
      if (cur && (cur.updated || 0) >= r.updated) continue;
      if (r.deleted) { if (live.has(r.id)) { drop.add(r.id); live.delete(r.id); n++; } continue; }
      const rec = { id: r.id, type: r.type, ts: r.ts, data: r.data || {}, note: r.note || '', updated: touch ? Date.now() : r.updated };
      if (r.end != null) rec.end = r.end;
      const mine = live.get(r.id);
      if (mine) { for (const k of Object.keys(mine)) delete mine[k]; Object.assign(mine, rec); }   // edit in place so open sheets stay valid
      else { db.events.push(rec); live.set(r.id, rec); }
      if (tomb.has(r.id)) { db.deleted = db.deleted.filter(t => t.id !== r.id); tomb.delete(r.id); }
      n++;
    }
    if (drop.size) db.events = db.events.filter(e => !drop.has(e.id));
    return n;
  }
  const fromRow = r => ({ id: r.id, type: r.type, ts: +r.ts, end: r.end_ts == null ? null : +r.end_ts, data: r.data, note: r.note, updated: +r.updated, deleted: r.deleted });
  const toRow = (e, baby, deleted) => ({ baby_id: baby, id: e.id, type: e.type, ts: e.ts, end_ts: e.end ?? null, data: e.data || {}, note: e.note || '', updated: e.updated, deleted });

  function reset() { db.events = []; db.deleted = []; db.meta.pulledAt = ''; db.meta.pushedAt = 0; }

  // ---- remote operations -------------------------------------------------------------------
  async function pullBaby() {
    const b = db.meta.babyId;
    if (db.meta.babyDirty) {
      await Auth.api(`/babies?id=eq.${b}`, { method: 'PATCH', body: { name: db.baby.name, birth: db.baby.birth || null }, headers: { Prefer: 'return=minimal' } });
      db.meta.babyDirty = false;
    }
    const [baby, mem] = await Promise.all([
      Auth.api(`/babies?id=eq.${b}&select=name,birth`),
      Auth.api(`/members?baby_id=eq.${b}&user_id=eq.${Auth.id}&select=role`),
    ]);
    if (!baby.length || !mem.length) { lostAccess(); return false; }
    db.baby = { name: baby[0].name || '', birth: baby[0].birth || '' };
    db.meta.role = mem[0].role;
    return true;
  }
  function lostAccess() { reset(); db.meta.babyId = null; db.meta.role = null; db.baby = { name: '', birth: '' }; save(true); }

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
      ...db.events.filter(e => e.updated > since && e.updated <= cut).map(e => toRow(e, b, false)),
      ...db.deleted.filter(t => t.updated > since && t.updated <= cut).map(t => toRow(t, b, true)),
    ];
    for (let i = 0; i < out.length; i += 200) {
      await Auth.api('/events?on_conflict=baby_id,id', { method: 'POST', body: out.slice(i, i + 200), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    }
    db.meta.pushedAt = cut;
    db.deleted = db.deleted.filter(t => t.updated > cut);   // tombstones now live on the server
  }

  async function run() {
    if (!linked()) return;
    if (busy) { again = true; return; }
    busy = true; st.state = 'syncing'; notify();
    let changed = 0;
    try {
      if (await pullBaby()) {
        changed = await pull();
        if (canEdit()) await push();
        st.state = 'ok'; st.at = Date.now(); st.err = '';
      } else st.state = 'idle';   // access was removed; lostAccess() already reset this device
    } catch (e) {
      st.state = (e instanceof TypeError || navigator.onLine === false) ? 'offline' : 'error';
      st.err = e.message;
    } finally {
      busy = false; save(true);
      notify(changed > 0);
      if (again) { again = false; schedule(1500); }
    }
  }
  function schedule(ms = 2000) { if (!linked()) return; clearTimeout(timer); timer = setTimeout(run, ms); }

  // ---- baby / membership management ---------------------------------------------------------
  async function loadMemberships() {
    const rows = await Auth.api(`/members?user_id=eq.${Auth.id}&select=baby_id,role,babies(name,birth)`);
    st.memberships = rows.map(r => ({ id: r.baby_id, role: r.role, name: (r.babies && r.babies.name) || '', birth: (r.babies && r.babies.birth) || '' }));
    return st.memberships;
  }
  /** Make `id` the baby shown on this device. Clears the local cache when switching to a different baby. */
  function choose(id) {
    const m = st.memberships.find(x => x.id === id);
    if (!m) return;
    if (db.meta.babyId !== id) { reset(); db.meta.babyDirty = false; }
    db.meta.babyId = id; db.meta.role = m.role; db.baby = { name: m.name, birth: m.birth };
    save(true); run();
  }
  async function createBaby(name, birth) {
    const id = await Auth.rpc('create_baby', { p_name: name, p_birth: birth || null });
    // Existing local entries (from before sign-in) are adopted by the new baby and uploaded.
    db.meta.babyId = id; db.meta.role = 'owner'; db.meta.pulledAt = ''; db.meta.pushedAt = 0; db.meta.babyDirty = false;
    db.baby = { name, birth: birth || '' };
    save(true); await loadMemberships(); run();
  }
  async function join(code) {
    const id = await Auth.rpc('redeem_invite', { p_code: code });
    await loadMemberships();
    choose(id);
  }
  async function members() {
    st.members = await Auth.api(`/members?baby_id=eq.${db.meta.babyId}&select=user_id,email,role,joined_at&order=joined_at.asc`);
    return st.members;
  }
  const invite = role => Auth.rpc('create_invite', { p_baby: db.meta.babyId, p_role: role });
  async function removeMember(userId) {
    await Auth.api(`/members?baby_id=eq.${db.meta.babyId}&user_id=eq.${userId}`, { method: 'DELETE' });
    if (userId === Auth.id) { lostAccess(); await loadMemberships(); }
  }
  function inviteUrl(code) { return location.origin + location.pathname + '?join=' + code; }
  function pushBaby() { db.meta.babyDirty = true; save(); schedule(500); }

  let started = false;
  function start() {
    if (started) return run();
    started = true;
    setInterval(() => { if (!document.hidden) run(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    window.addEventListener('online', run);
    run();
  }

  return { st, enabled, linked, canEdit, merge, run, schedule, start, loadMemberships, choose, createBaby, join, members, invite, removeMember, inviteUrl, pushBaby, onChange: null };
})();
