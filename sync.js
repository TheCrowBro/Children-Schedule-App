'use strict';
/* Family sync. Local-first: the app always works from local storage; this module merges changes with the shared baby
   log in Supabase (pull, then push). Everything is END-TO-END ENCRYPTED: entries and the baby's profile are encrypted on the
   phone before upload and decrypted after download (see e2ee.js); the server only sees ciphertext. All writes go through the
   server's push_events(), which enforces each person's role and permissions. Conflicts: newest `updated` timestamp wins.
   Relies on the globals `db` and `save()` from app.js (read lazily, at call time). */
const Sync = (() => {
  const st = { state: 'idle', at: 0, err: '', denied: 0, needMfa: false, needsAccess: false, rotateNeeded: false, bad: 0, memberships: [], people: [], requests: [], invites: [], myRequests: [], devices: [], familyRequests: {}, familyPeople: {}, retired: [] };
  const PAGE = 500, OVERLAP_MS = 5000;
  let busy = false, busyAt = 0, again = false, timer = null, started = false, peopleAt = 0, failures = 0, retryAt = 0;
  let flight = Promise.resolve(), switching = false;   // (the sync under way, and a switch to another family log)
  // What belongs to one family log; the rest of db.meta belongs to the phone (language, clock face, region, the sync clock …)
  const OWN = ['role', 'perms', 'pulledAt', 'pushedAt', 'babyDirty', 'stash', 'unverified', 'recoveryAck', 'art', 'solids', 'ms', 'kid'];

  const enabled = () => Auth.configured && Auth.signedIn;
  const linked = () => enabled() && !!db.meta.babyId;
  const notify = changed => { if (Sync.onChange) Sync.onChange(changed); };
  const q = encodeURIComponent;
  /** Server lists must really be lists. Anything else is a broken or foreign reply: fail (and retry later) instead of acting on it. */
  const list = r => { if (!Array.isArray(r)) throw new TypeError(N_('Unexpected reply from the server')); return r; };

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
  const nameOf = id => {   // (a retired helper's entries still say who added them)
    const p = st.people.find(x => x.user_id === id); if (p) return p.is_you ? __('you') : p.display_name;
    const r = st.retired.find(x => x.user_id === id); return r ? r.display_name : '';
  };

  // ---- local merge -------------------------------------------------------------------------
  /** Merge event rows (local shape, plus `deleted`) into db. `force` ignores timestamps (used to restore the server's
      version after a write was refused). Returns how many changed. */
  function merge(rows, touch, force) {
    const live = new Map(db.events.map(e => [e.id, e]));
    const tomb = new Map(db.deleted.map(t => [t.id, t]));
    const drop = new Set();
    let n = 0;
    for (const r of rows) {
      if (!touch && r.updated > (db.meta.hlc || 0)) db.meta.hlc = r.updated;   // learn the log's clock, so our next edit is newer than anything seen
      const cur = live.get(r.id) || tomb.get(r.id);
      if (!force && cur && (cur.updated || 0) >= r.updated) continue;
      if (r.deleted) { if (live.has(r.id)) { drop.add(r.id); live.delete(r.id); n++; } if (force && tomb.has(r.id)) { db.deleted = db.deleted.filter(t => t.id !== r.id); tomb.delete(r.id); } continue; }
      const rec = { id: r.id, type: r.type, ts: r.ts, data: r.data || {}, note: r.note || '', updated: touch ? stamp() : r.updated };
      if (r.end != null) rec.end = r.end;
      if (r.by) rec.by = r.by;
      if (r.child) rec.child = r.child;
      const mineRec = live.get(r.id);
      if (mineRec) { for (const k of Object.keys(mineRec)) delete mineRec[k]; Object.assign(mineRec, rec); }   // edit in place so open sheets stay valid
      else { db.events.push(rec); live.set(r.id, rec); }
      if (tomb.has(r.id)) { db.deleted = db.deleted.filter(t => t.id !== r.id); tomb.delete(r.id); }
      n++;
    }
    if (drop.size) db.events = db.events.filter(e => !drop.has(e.id));
    return n;
  }
  /** Decrypt server rows. Rows whose key we don't have yet are kept in meta.stash and retried after the next key refresh. */
  async function decode(rows) {
    const b = db.meta.babyId, out = [], stash = db.meta.stash || (db.meta.stash = {});
    for (const r of rows) {
      if (r.deleted) { out.push({ id: r.id, deleted: true, updated: +r.updated }); delete stash[r.id]; continue; }
      const d = await E2EE.decryptRow(b, r);
      if (d.entry) { out.push({ ...d.entry, deleted: false }); delete stash[r.id]; }
      else if (d.locked) { if (Object.keys(stash).length < 5000) stash[r.id] = { id: r.id, blob: r.blob, epoch: r.epoch, sensitive: r.sensitive, updated: r.updated, deleted: false, created_by: r.created_by }; }
      else st.bad++;   // failed authentication: tampered with, moved, or planted by someone without the right key – ignored
    }
    return out;
  }
  async function retryStash() {
    const stash = db.meta.stash || {}, rows = Object.values(stash);
    if (!rows.length) return 0;
    const n = merge(await decode(rows)); if (!Object.keys(db.meta.stash || {}).length) delete db.meta.stash; return n;
  }
  const isSens = type => type === 'health' || type === 'med';
  async function encodeRows(b) {
    const cut = Math.max(Date.now(), db.meta.hlc || 0), since = db.meta.pushedAt || 0, rows = [];
    for (const e of db.events) if (e.updated > since && e.updated <= cut) { const x = await E2EE.encryptEntry(b, e); rows.push({ id: e.id, ...x, updated: e.updated, deleted: false }); }
    for (const t of db.deleted) if (t.updated > since && t.updated <= cut) rows.push({ id: t.id, blob: '', epoch: E2EE.epoch(b) || 1, sensitive: isSens(t.type), updated: t.updated, deleted: true });
    return { rows, cut };
  }

  function reset() { db.events = []; db.deleted = []; db.meta.pulledAt = ''; db.meta.pushedAt = 0; }
  /** How many changes in `d` (the log shown, or the kept copy of another) have not reached the server yet. */
  function unsent(d = db) { const m = d.meta || {}, since = m.pushedAt || 0, n = xs => (xs || []).filter(e => e.updated > since).length; return n(d.events) + n(d.deleted) + (m.babyDirty ? 1 : 0); }

  // ---- remote operations -------------------------------------------------------------------
  async function pullBaby() {
    const b = db.meta.babyId;
    const mem = list(await Auth.api(`/members?baby_id=eq.${b}&user_id=eq.${Auth.id}&select=role,perms`));
    if (!mem.length) { lostAccess(); return false; }   // an empty, well-formed list: our membership really is gone
    db.meta.role = mem[0].role; db.meta.perms = mem[0].perms || {};
    st.needMfa = false;
    const baby = list(await Auth.api(`/babies?id=eq.${b}&select=profile,epoch,rotate_needed`));
    if (!baby.length) { st.needMfa = true; st.state = 'error'; st.err = N_('Two-step verification is required'); return false; }   // a parent without an MFA session
    st.rotateNeeded = !!baby[0].rotate_needed;
    // Encryption keys: fetch them if this phone has none, or the log moved to a newer key epoch.
    await E2EE.load(b);
    const wantHealth = db.meta.role === 'parent' || !!db.meta.perms.view_health;   // e.g. just given health access: fetch the health key
    const hadHealth = E2EE.hasHealthKey(b);
    if (!E2EE.hasKeys(b) || E2EE.epoch(b) < baby[0].epoch || (wantHealth && !hadHealth)) await E2EE.refresh(b, db.meta, { health: wantHealth });
    if (!hadHealth && E2EE.hasHealthKey(b)) db.meta.pulledAt = '';   // health entries were invisible until now, so the sync cursor skipped them: fetch everything again
    if (!E2EE.hasKeys(b) || E2EE.epoch(b) < baby[0].epoch) { st.needsAccess = true; st.state = 'needs-access'; st.err = ''; return false; }
    st.needsAccess = false;
    if (db.meta.babyDirty) {
      db.meta.babyDirty = false;
      try { await Auth.rpc('update_baby', { p_baby: b, p_profile: await E2EE.encryptProfile(b, db.baby), p_epoch: E2EE.epoch(b) }); baby[0] = { ...baby[0], profile: null }; }
      catch (e) { if (!e.status || e.status === 401 || e.status === 429 || e.status >= 500) { db.meta.babyDirty = true; throw e; } st.denied++; }   // offline, signed out or a server fault: kept for the next sync; refused: the server's copy stands
    }
    // the server's profile, unless this phone changed its own since this sync began (that change goes up next time, not lost under the older copy)
    if (baby[0].profile && !db.meta.babyDirty) { const p = await E2EE.decryptProfile(b, baby[0].profile, baby[0].epoch); if (p && !db.meta.babyDirty) db.baby = p; }
    if (db.meta.role !== 'parent' && !db.meta.perms.view_health) db.events = db.events.filter(e => !isSens(e.type));   // access to health notes was taken away
    return true;
  }
  function lostAccess() { const b = db.meta.babyId; if (b) E2EE.forget(b); reset(); db.meta.babyId = null; db.meta.role = null; db.meta.perms = null; db.baby = { name: '', birth: '', kids: Kids.clean([]) }; st.people = []; save(true); }

  async function pull() {
    const b = db.meta.babyId;
    let since = db.meta.pulledAt ? new Date(new Date(db.meta.pulledAt).getTime() - OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z';
    let changed = 0;
    for (;;) {
      const rows = list(await Auth.api(`/events?baby_id=eq.${b}&synced_at=gt.${q(since)}&order=synced_at.asc&limit=${PAGE}&select=*`));
      changed += merge(await decode(rows));
      if (rows.length) { since = rows[rows.length - 1].synced_at; db.meta.pulledAt = since; }
      if (rows.length < PAGE) break;
    }
    return changed;
  }

  async function push() {
    const b = db.meta.babyId;
    let { rows, cut } = await encodeRows(b), denied = [], ceiling = Infinity;
    for (let attempt = 0; ; attempt++) {
      denied = []; let stale = null; ceiling = Infinity;
      for (let i = 0; i < rows.length; i += 200) {
        const r = await Auth.rpc('push_events', { p_baby: b, p_rows: rows.slice(i, i + 200) });
        denied.push(...((r && r.denied) || [])); if (r && r.stale) stale = r.stale;
        if (r && Number.isFinite(r.ceiling)) ceiling = Math.min(ceiling, r.ceiling);
      }
      if (!stale) break;
      // The log moved to newer keys than this phone used: fetch them and send again (nothing is lost).
      await E2EE.refresh(b, db.meta);
      if (E2EE.epoch(b) < stale || attempt) throw new Error(N_('Waiting for the new encryption keys'));
      ({ rows, cut } = await encodeRows(b));
    }
    if (cut > ceiling) {   // this phone's clock runs fast: the server stored these edits no later than its ceiling, so do the same here
      for (const x of db.events.concat(db.deleted)) if (x.updated > ceiling) x.updated = ceiling;
      cut = ceiling; if ((db.meta.hlc || 0) > ceiling) db.meta.hlc = ceiling;
    }
    db.meta.pushedAt = cut;
    db.deleted = db.deleted.filter(t => t.updated > cut);   // tombstones now live on the server
    if (denied.length) await restore(denied);
  }
  /** The server refused these changes (permissions changed, or a rule was broken): put the server's version back. */
  async function restore(ids) {
    const b = db.meta.babyId, safe = ids.filter(i => /^[A-Za-z0-9_-]{1,64}$/.test(i));
    st.denied += ids.length;
    const rows = safe.length ? await decode(list(await Auth.api(`/events?baby_id=eq.${b}&id=in.(${safe.join(',')})&select=*`))) : [];
    const have = new Set(rows.map(r => r.id));
    merge(rows, false, true);
    merge(safe.filter(i => !have.has(i)).map(id => ({ id, deleted: true, updated: 0 })), false, true);   // never existed on the server: drop the local copy
  }

  /** `manual` (a button, an edit, coming back online) ignores the backoff that follows failures. */
  async function run(manual) {
    if (!linked() || switching) return;
    if (manual !== true && Date.now() < retryAt) return;
    if (db.meta.role === 'parent' && Auth.aal !== 'aal2') { st.needMfa = true; st.state = 'error'; st.err = N_('Two-step verification is required'); return notify(); }
    if (busy && Date.now() - busyAt < 120000) { again = true; return; }   // (a sync stuck for 2 minutes is treated as dead)
    busy = true; busyAt = Date.now(); st.state = 'syncing'; notify();
    let changed = 0, done; flight = new Promise(r => { done = r; });
    try {
      if (await pullBaby()) {
        if (st.rotateNeeded && db.meta.role === 'parent' && Auth.aal === 'aal2') { await E2EE.rotate(db.meta.babyId, db.baby); st.rotateNeeded = false; }
        changed = await pull() + await retryStash();
        await push();
        if (Date.now() - peopleAt > 120000 || db.events.some(e => e.by && !st.people.some(p => p.user_id === e.by))) { await loadPeople().catch(() => {}); }
        await loadDevices().catch(() => {});
        if (db.meta.role === 'parent') await loadAdmin().catch(() => {});
        st.state = 'ok'; st.at = Date.now(); st.err = ''; failures = 0; retryAt = 0;
      } else if (!st.needMfa && !st.needsAccess) st.state = 'idle';   // access was removed; lostAccess() already reset this device
    } catch (e) {
      st.state = (e instanceof TypeError || e.name === 'AbortError' || navigator.onLine === false) ? 'offline' : 'error';
      st.err = e.message; failures++; retryAt = Date.now() + Math.min(300000, 5000 * 2 ** failures);   // 10s, 20s, 40s … up to 5 minutes
      if (!Auth.signedIn && Sync.onSessionLost) { busy = false; Sync.onSessionLost(); }
    } finally {
      busy = false; save(true); done();
      notify(changed > 0);
      if (again) { again = false; schedule(1500); }
    }
  }
  function schedule(ms = 2000) { if (!linked()) return; clearTimeout(timer); timer = setTimeout(() => run(true), ms); }

  // ---- people, requests, invites, activity -------------------------------------------------
  async function loadPeople() {
    const b = db.meta.babyId, people = list(await Auth.rpc('list_people', { p_baby: b }));
    for (const p of people) p.info = p.details ? await E2EE.openDetails(b, p.user_id, p.details, p.details_epoch) : null;   // contact details: decrypted here, never readable on the server
    st.people = people; peopleAt = Date.now();
    // my own details were sealed with older keys (someone left since): seal them again with the current ones
    const me = people.find(p => p.is_you);
    if (me && me.info && me.details_epoch < (E2EE.epoch(b) || 0)) setMyDetails(me.info).catch(() => {});
    return st.people;
  }
  async function setMyDetails(d) {
    const b = db.meta.babyId, { blob, epoch } = await E2EE.sealDetails(b, Auth.id, d);
    await Auth.rpc('set_my_details', { p_baby: b, p_blob: blob, p_epoch: epoch });
    const me = st.people.find(p => p.is_you); if (me) { me.info = Guide.cleanDetails(d); me.details_epoch = epoch; }
  }
  async function loadAdmin() {   // parents only
    const [reqs, inv] = await Promise.all([Auth.rpc('list_requests', { p_baby: db.meta.babyId }), Auth.rpc('list_invites', { p_baby: db.meta.babyId })]);
    for (const r of reqs) { r.baby_id = db.meta.babyId; r.qrVerified = await E2EE.verifyRequest(r); r.fingerprint = r.device_pub ? await E2EE.fingerprint(r.device_pub) : ''; }
    st.requests = reqs; st.invites = inv;
  }
  /** Phones of people in this log (parents see everyone's) and whether they hold keys yet. Phones without keys are waiting for approval. */
  async function loadDevices() {
    const rows = await Auth.rpc('list_devices', { p_baby: db.meta.babyId });
    for (const d of rows) d.fingerprint = await E2EE.fingerprint(d.pubkey);
    st.devices = rows; return rows;
  }
  const pendingPhones = () => st.devices.filter(d => !d.has_grant && !(E2EE.device && d.grantee === 'd:' + E2EE.device.id));
  async function approvePhone(d) { await E2EE.approveDevice(db.meta.babyId, d); await loadDevices(); }
  const myDevices = () => Auth.rpc('my_devices');
  async function removePhone(id) { await Auth.rpc('remove_device', { p_id: id }); if (E2EE.device && E2EE.device.id === id) return; await loadDevices().catch(() => {}); schedule(300); }
  async function recover(code) {
    await E2EE.unlockWithRecovery(db.meta.babyId, code, db.meta);
    st.needsAccess = false; save(true); run();
  }
  async function newRecoveryCode() { return E2EE.replaceRecovery(db.meta.babyId); }
  const securityCode = () => E2EE.securityCode(db.meta.babyId);
  const activity = (before) => Auth.rpc('activity_log', { p_baby: db.meta.babyId, p_limit: 50, p_before: before || null });
  /** The QR code carries `secret` too; it never goes to the server, and lets the joiner and the parent authenticate each other. */
  const createInvite = async (role, perms) => {
    const code = await Auth.rpc('create_invite', { p_baby: db.meta.babyId, p_role: role, p_perms: perms });
    const secret = E2EE.newSecret(); await E2EE.rememberInvite(code, secret); await loadAdmin(); return { code, secret };
  };
  const rescind = async code => { await Auth.rpc('rescind_invite', { p_code: code }); await loadAdmin(); };
  /** `req` is a row from list_requests. Approving shares the log's encryption keys with the person's phone, so the parent must have
      verified it really is their phone (QR proof, or {manualOk:true} after comparing security codes). */
  const decide = async (req, approve, opts = {}) => {
    const b = req.baby_id || db.meta.babyId;   // (a request to join another of this parent's family logs is decided from the family tree)
    const grant = approve ? await E2EE.grantForRequest(b, req, opts) : null;
    await Auth.rpc('decide_request', { p_id: req.id, p_approve: approve, p_role: null, p_perms: null, p_grant: grant });
    if (b === db.meta.babyId) await Promise.all([loadAdmin(), loadPeople(), loadDevices().catch(() => {})]);
    else await loadFamilyRequests();
  };
  /** Requests to join the other family logs this person is a parent in (the log shown has its own, in st.requests): { id: [...] }. */
  async function loadFamilyRequests() {
    const out = {};
    for (const m of st.memberships) {
      if (m.role !== 'parent' || m.id === db.meta.babyId) continue;
      try {
        const reqs = list(await Auth.rpc('list_requests', { p_baby: m.id }));
        for (const r of reqs) { r.baby_id = m.id; r.qrVerified = await E2EE.verifyRequest(r); r.fingerprint = r.device_pub ? await E2EE.fingerprint(r.device_pub) : ''; }
        if (reqs.length) out[m.id] = reqs;
      } catch (e) { /* offline, or this sign-in has no two-step verification yet: shown next time */ }
    }
    st.familyRequests = out; return out;
  }
  /** The relatives in each family log (its parents and family members, not you), to name it in the family tree ("Sarah's family") and
      show who is in it, where this person may see who has which role: { id: [{ name, role }] }. */
  async function loadFamilyPeople() {
    const out = {};
    for (const m of st.memberships) {
      try { out[m.id] = list(await Auth.rpc('list_people', { p_baby: m.id })).filter(p => (p.role === 'parent' || p.role === 'family') && !p.is_you).map(p => ({ name: p.display_name, role: p.role })); } catch (e) { /* named after the children instead */ }
    }
    st.familyPeople = out; return out;
  }
  /** Retire a helper who no longer helps (moved away, stopped, died): their access ends like removing them, a note of them stays. */
  async function retireMember(user, reason) {
    await Auth.rpc('retire_member', { p_baby: db.meta.babyId, p_user: user, p_reason: reason || '' });
    await Promise.all([loadPeople(), loadRetired()]); schedule(300);   // (the keys change on the next sync)
  }
  /** The retired helpers of the log shown (for people who may see the family list), with their contact details opened. */
  async function loadRetired() {
    const b = db.meta.babyId; let rows = [];
    try { rows = list(await Auth.rpc('list_retired', { p_baby: b })); } catch (e) { rows = []; }
    for (const r of rows) r.info = r.details ? await E2EE.openDetails(b, r.user_id, r.details, r.details_epoch).catch(() => null) : null;
    st.retired = rows; return rows;
  }
  const forgetRetired = async id => { await Auth.rpc('forget_retired', { p_id: id }); await loadRetired(); };
  async function setMember(user, role, perms) {
    // Someone newly allowed to see health notes needs the health key for each of their phones.
    const p = st.people.find(x => x.user_id === user), had = !!p && (p.role === 'parent' || !!(p.perms && p.perms.view_health));
    const will = role === 'parent' || !!perms.view_health;
    const grants = will && !had ? await E2EE.healthGrants(db.meta.babyId, user) : [];
    await Auth.rpc('set_member', { p_baby: db.meta.babyId, p_user: user, p_role: role, p_perms: perms, p_health_grants: grants });
    await loadPeople(); schedule(300);   // losing health access asks for new keys: a parent's phone does that on the next sync
  }
  const resetMfa = user => Auth.rpc('reset_member_mfa', { p_baby: db.meta.babyId, p_user: user });
  const setDisplayName = async name => { await Auth.rpc('set_display_name', { p_name: name }); await loadPeople().catch(() => {}); };
  async function removeMember(userId) {
    await Auth.rpc('remove_member', { p_baby: db.meta.babyId, p_user: userId });
    if (userId === Auth.id) { lostAccess(); await loadMemberships(); } else { await loadPeople(); schedule(300); }   // the keys are changed on the next sync
  }

  // ---- baby / membership management ---------------------------------------------------------
  async function loadMemberships() {
    const rows = list(await Auth.api(`/members?user_id=eq.${Auth.id}&select=baby_id,role,perms`));
    // Baby names are encrypted: show the ones this phone already has the key for.
    let profiles = [];
    try { profiles = list(await Auth.api('/babies?select=id,profile,epoch')); } catch (e) { /* names only: fine to skip */ }
    st.memberships = [];
    for (const r of rows) {
      const b = profiles.find(x => x.id === r.baby_id); let p = null;
      if (b && b.profile) {
        await E2EE.load(r.baby_id);
        if (!E2EE.hasKeys(r.baby_id) || E2EE.epoch(r.baby_id) < b.epoch) await fetchKeys(r);
        p = await E2EE.decryptProfile(r.baby_id, b.profile, b.epoch);
      }
      st.memberships.push({ id: r.baby_id, role: r.role, perms: r.perms || {}, name: p ? p.name : '', birth: p ? p.birth : '', kids: p ? p.kids : null });
    }
    for (const id of await Store.parkedIds()) if (!st.memberships.some(m => m.id === id)) await Store.drop(id);   // (no longer in it: nothing of it stays on the phone)
    return st.memberships;
  }
  /** The keys of a family log this phone was just approved for (or that changed keys), fetched outside its own sync so the family
      tree can show its children. Joined with a typed code instead of the QR code, the security code still has to be compared: that is
      noted, and asked for when the family is first opened. */
  async function fetchKeys(r) {
    if (r.baby_id === db.meta.babyId) return;   // (the log shown gets its keys in its own sync)
    const flags = {};
    try { await E2EE.refresh(r.baby_id, flags, { health: r.role === 'parent' || !!(r.perms && r.perms.view_health) }); } catch (e) { return; }   // (any problem shows when it is opened)
    if (flags.unverified) { (db.meta.unverifiedIn || (db.meta.unverifiedIn = {}))[r.baby_id] = true; save(true); }
  }
  async function loadMyRequests() { st.myRequests = await Auth.rpc('my_requests'); return st.myRequests; }
  /** Make family log `id` the one shown on this phone. The one shown until now is first synced (when there is a connection), then
      kept whole on the phone, unsent changes and all, so switching back is instant, works offline and loses nothing. Resolves true
      once `id` is shown. */
  async function choose(id) {
    const m = st.memberships.find(x => x.id === id), from = db.meta.babyId;
    if (!m || switching) return false;
    if (from === id) {   // the same log again (after signing in): its role may have changed; its profile, unless a change of ours is waiting to go up
      db.meta.role = m.role; db.meta.perms = m.perms;
      if ((m.name || m.kids) && !db.meta.babyDirty) db.baby = { name: m.name, birth: m.birth, kids: Kids.clean(m.kids, m.name, m.birth) };
      save(true); run(); return true;
    }
    if (from && unsent() && navigator.onLine !== false) await run(true);   // send what is waiting first, while it is the log shown
    switching = true;
    try {
      await flight;   // (a sync under way finishes first)
      // keep the log shown until now (if this person is still in it); this throws if it can't be written, and then nothing changes
      if (from && st.memberships.some(x => x.id === from)) await Store.park(from, { events: db.events, deleted: db.deleted, baby: db.baby, meta: Object.fromEntries(OWN.filter(k => k in db.meta).map(k => [k, db.meta[k]])) });
      const kept = await Store.unpark(id);
      for (const k of OWN) delete db.meta[k];
      if (kept) { db.events = kept.events; db.deleted = kept.deleted || []; db.baby = kept.baby; Object.assign(db.meta, kept.meta); }
      else { reset(); db.baby = { name: m.name || '', birth: m.birth || '', kids: Kids.clean(m.kids, m.name, m.birth) }; }
      if (db.meta.unverifiedIn && db.meta.unverifiedIn[id]) { db.meta.unverified = true; delete db.meta.unverifiedIn[id]; }   // (its keys came with the family tree)
      db.meta.babyId = id; db.meta.role = m.role; db.meta.perms = m.perms;
      st.people = []; st.devices = []; st.requests = []; st.invites = []; st.retired = []; st.needsAccess = false; st.denied = 0; peopleAt = 0;
      save(true); await Store.whenSaved();
      if (kept) await Store.drop(id);   // (it is the main copy now)
    } finally { switching = false; }
    run(true); return true;
  }
  /** Changes not sent yet in the family logs kept on the phone (not the one shown): { id: count }. */
  async function unsentKept() { const out = {}; for (const id of await Store.parkedIds()) { const d = await Store.unpark(id); if (d && unsent(d)) out[id] = unsent(d); } return out; }
  /** Forget every family log kept on the phone (signing out). */
  async function dropKept() { for (const id of await Store.parkedIds()) await Store.drop(id); }
  /** Creates the log with fresh encryption keys. Returns the one-time recovery code (shown to the parent once, never stored). */
  async function createBaby(name, birth, displayName, sex) {
    db.meta.recoveryAck = false; save(true);   // set first: if the app dies before the code is shown, the reminder is still there
    let created;
    try { created = await E2EE.createLog({ kids: Kids.clean([{ id: 'c1', name, birth: birth || '', sex }]) }, displayName); } catch (e) { delete db.meta.recoveryAck; save(true); throw e; }
    const { babyId: id, code } = created;
    // Existing local entries (from before sign-in) are adopted by the new baby and uploaded.
    db.meta.babyId = id; db.meta.role = 'parent'; db.meta.perms = null; db.meta.pulledAt = ''; db.meta.pushedAt = 0; db.meta.babyDirty = false; db.meta.unverified = false;
    db.events.forEach(e => { e.by = Auth.id; });
    { const kids = Kids.clean([{ id: 'c1', name, birth: birth || '', sex }]); db.baby = { name: kids[0].name, birth: kids[0].birth, kids }; }
    save(true); await loadMemberships(); run();
    return code;
  }
  /** Redeem an invite code. This only sends a request; a parent has to approve it. */
  async function requestJoin(code, displayName, secret) {
    const dev = await E2EE.ensureDevice();
    await E2EE.setJoinSecret(secret || null);
    const proof = secret ? await E2EE.joinProof(secret, dev.id, dev.pub) : null;
    const r = await Auth.rpc('redeem_invite', { p_code: code, p_display_name: displayName || '', p_device: dev.id, p_proof: proof });
    if (!r || r.status !== 'pending') throw new Error(N_('This invite is invalid or has expired'));
    await loadMyRequests();
  }
  /** Check whether a pending request was approved; if so, switch to that log. */
  async function checkApproval() {
    await Promise.all([loadMyRequests(), loadMemberships()]);
    if (!db.meta.babyId && st.memberships.length) { await choose(st.memberships[0].id); return true; }
    return false;
  }
  const cancelRequest = async id => { await Auth.rpc('cancel_my_request', { p_id: id }); await loadMyRequests(); };
  const pendingRequest = () => st.myRequests.find(r => r.status === 'pending');

  // Invite links only open the installed app (custom URL scheme); people without the app scan the QR code inside it.
  const inviteUrl = (code, secret) => Native.scheme + '://join?join=' + code + (secret ? '&s=' + secret : '');
  function pushBaby() { db.meta.babyDirty = true; save(); schedule(500); }

  function start() {
    if (started) return run(true);
    started = true;
    setInterval(() => { if (!document.hidden) run(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    window.addEventListener('online', () => run(true));
    run(true);
  }

  return { st, enabled, linked, isParent, can, nameOf, merge, run, loadDevices, pendingPhones, approvePhone, myDevices, removePhone, recover, newRecoveryCode, securityCode, schedule, start, loadMemberships, loadMyRequests, loadPeople, loadAdmin, activity,
    createInvite, rescind, decide, setMember, resetMfa, setDisplayName, removeMember, choose, createBaby, requestJoin, checkApproval, cancelRequest,
    pendingRequest, inviteUrl, pushBaby, setMyDetails, unsent, unsentKept, dropKept, loadFamilyRequests, loadFamilyPeople, retireMember, loadRetired, forgetRetired, get switching() { return switching; }, onChange: null, onSessionLost: null };
})();
