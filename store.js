'use strict';
/* Where the baby log lives on the phone: IndexedDB, not localStorage.
   localStorage holds ~5 MB, which a busy newborn log would fill in about two years; IndexedDB holds hundreds of MB.
   - Writes are coalesced (one in flight; the newest state is always what ends up on disk).
   - A rolling backup copy is kept (at most hourly), and a corrupt main copy is quarantined, not silently discarded:
     the app then starts from the backup, and anything else is re-downloaded from the family log.
   - If saving ever fails (disk full, storage blocked), `Store.st.ok` turns false so the UI can say so loudly.
   - Falls back to localStorage where IndexedDB is unavailable, and imports the pre-IndexedDB localStorage copy once.
   - Someone in more than one family log (a parent who also looks after a sister's children) has one shown at a time; each of the
     others is kept whole under a key of its own ("family.<id>"), unsent changes and all, until it is shown again. */
const Store = (() => {
  const DB_NAME = 'littlelog', OS = 'kv', LEGACY = 'littlelog.v1', BACKUP_EVERY = 3600e3;
  const st = { ok: true, err: '', quarantined: false, recovered: false, onChange: null };
  let idb = null, busy = false, again = false, snap = null, lastBackup = 0, idle = Promise.resolve();
  const valid = d => !!d && typeof d === 'object' && Array.isArray(d.events);

  const open = () => new Promise((ok, no) => {
    let r; try { r = indexedDB.open(DB_NAME, 1); } catch (e) { return no(e); }
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); r.onblocked = () => no(new Error('storage blocked'));
  });
  const tx = (mode, fn) => new Promise((ok, no) => {
    let t, req; try { t = idb.transaction(OS, mode); req = fn(t.objectStore(OS)); } catch (e) { return no(e); }
    t.oncomplete = () => ok(req && req.result); t.onerror = () => no(t.error); t.onabort = () => no(t.error || new Error('write aborted'));
  });
  const get = k => tx('readonly', s => s.get(k));
  const put = (k, v) => tx('readwrite', s => s.put(v, k));

  async function init() { try { idb = await open(); } catch (e) { idb = null; } }

  /** Returns the saved log (or null if there is none). Never throws. */
  async function load() {
    let d = null;
    if (idb) {
      try { d = await get('db'); } catch (e) { d = null; }
      if (d && !valid(d)) { await put('corrupt.' + Date.now(), d).catch(() => {}); st.quarantined = true; d = null; }
      if (!d) { try { const b = await get('db.bak'); if (valid(b)) { d = b; st.recovered = true; } } catch (e) {} }
    }
    if (!d) {   // the copy from before IndexedDB was used
      let raw = null; try { raw = localStorage.getItem(LEGACY); } catch (e) {}
      if (raw) { try { const p = JSON.parse(raw); if (valid(p)) d = p; else throw new Error('shape'); } catch (e) { st.quarantined = true; if (idb) await put('corrupt.' + Date.now(), raw).catch(() => {}); } }
    }
    return d;
  }

  async function write(db) {
    if (idb) {
      await put('db', db);
      if (Date.now() - lastBackup > BACKUP_EVERY) { lastBackup = Date.now(); await put('db.bak', db).catch(() => {}); }
      try { localStorage.removeItem(LEGACY); } catch (e) {}   // now safely in IndexedDB
    } else localStorage.setItem(LEGACY, JSON.stringify(db));
  }
  async function flush() {
    busy = true; let failed = false;
    try { do { again = false; await write(snap); } while (again); }
    catch (e) { failed = true; st.err = (e && e.message) || String(e); }
    finally { busy = false; }
    const was = st.ok; st.ok = !failed; if (!failed) st.err = '';
    if (was !== st.ok && st.onChange) st.onChange();
  }
  /** Queue the current state for saving (the object is copied when the write starts, so keep mutating it freely). */
  function save(db) { snap = db; if (busy) { again = true; return idle; } idle = flush(); return idle; }
  /** Resolves when everything queued so far is on disk. */
  const whenSaved = () => idle;
  /** What is actually on disk right now (for tests and diagnostics). */
  const peek = async () => (idb ? get('db') : JSON.parse(localStorage.getItem(LEGACY) || 'null'));
  const backup = async () => (idb ? get('db.bak') : null);
  const quarantine = async () => (idb ? tx('readonly', s => s.getAllKeys()).then(ks => ks.filter(k => String(k).startsWith('corrupt.'))) : []);

  // ---- the family logs that are not the one shown ----
  const FAM = 'family.', lsKey = id => `${LEGACY}.${FAM}${id}`;
  /** Keep family log `id` on the phone while another one is shown. Throws if it can't be written (then nothing should change). */
  async function park(id, data) { if (idb) await put(FAM + id, data); else localStorage.setItem(lsKey(id), JSON.stringify(data)); }
  /** The kept copy of family log `id`, or null. */
  async function unpark(id) {
    let d = null;
    try { d = idb ? await get(FAM + id) : JSON.parse(localStorage.getItem(lsKey(id)) || 'null'); } catch (e) { d = null; }
    return valid(d) ? d : null;
  }
  /** Delete the kept copy of family log `id` (once it is shown again, or when this person is no longer in it). */
  async function drop(id) { try { if (idb) await tx('readwrite', s => s.delete(FAM + id)); else localStorage.removeItem(lsKey(id)); } catch (e) { /* already gone */ } }
  /** The ids of the family logs kept on the phone besides the one shown. */
  async function parkedIds() {
    if (idb) { try { return (await tx('readonly', s => s.getAllKeys())).map(String).filter(k => k.startsWith(FAM)).map(k => k.slice(FAM.length)); } catch (e) { return []; } }
    const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(lsKey(''))) out.push(k.slice(lsKey('').length)); }
    return out;
  }

  return { st, init, load, save, whenSaved, peek, backup, quarantine, park, unpark, drop, parkedIds, get usingIndexedDB() { return !!idb; } };
})();
