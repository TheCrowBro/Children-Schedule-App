'use strict';
/* App lock: Face ID / fingerprint (device passcode as fallback) when opening the app, and when coming back after a while.
   Also covers the screen while the app is in the background so nothing shows in the app switcher.
   These preferences are not secrets, so they live in ordinary local storage. */
const Lock = (() => {
  const K = 'll.lock';
  const cfg = { enabled: null, minutes: 1 };      // enabled === null: not decided yet
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(K))); } catch (e) {}
  const store = () => { try { localStorage.setItem(K, JSON.stringify(cfg)); } catch (e) {} };
  let locked = false, away = 0, trying = false;
  const cover = on => { const el = document.getElementById('cover'); if (el) el.hidden = !on; };

  return {
    onChange: null,
    get enabled() { return !!cfg.enabled; },
    get minutes() { return cfg.minutes; },
    get locked() { return locked; },
    async init() {
      if (cfg.enabled === null) { cfg.enabled = await Native.Biometric.available(); store(); }   // on by default when the phone has a screen lock
      locked = !!cfg.enabled;
      Native.onAppState(active => {
        if (trying) return;                         // the Face ID / fingerprint prompt itself pauses the app
        if (!active) { away = Date.now(); cover(true); return; }
        cover(false);
        if (cfg.enabled && !locked && Date.now() - away >= cfg.minutes * 60000) { locked = true; if (Lock.onChange) Lock.onChange(); }
      });
    },
    /** Turn the lock on/off. Returns an error message, or null on success. */
    async set(on) {
      if (on) {
        if (!await Native.Biometric.available()) return N_('Set a screen lock (passcode, Face ID or fingerprint) in your phone settings first.');
        trying = true; const ok = await Native.Biometric.authenticate(__('Turn on app lock')); trying = false;
        if (!ok) return N_('App lock was not turned on.');
      }
      cfg.enabled = on; store(); locked = false; return null;
    },
    setMinutes(m) { cfg.minutes = m; store(); },
    async unlock() {
      if (trying) return false;
      trying = true;
      try { const ok = await Native.Biometric.authenticate(__('Unlock Little Log')); if (ok) { locked = false; away = Date.now(); } return ok; }
      finally { trying = false; }
    },
    reset() { locked = false; },
  };
})();
