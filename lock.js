'use strict';
/* App lock: the phone's own lock (Face ID / fingerprint, the device passcode as fallback) or a PIN chosen in Little Log, when opening
   the app and when coming back after a while. Also covers the screen while the app is in the background so nothing shows in the app
   switcher. Which lock and the minutes are not secrets, so they live in ordinary local storage. The PIN is kept only as a salted hash
   (PBKDF2) in the Keychain / Keystore, never as typed, and wrong tries are slowed down: after five, a wait that doubles each time. */
const Lock = (() => {
  const K = 'll.lock', PK = 'll.pin', PIN = /^\d{4,8}$/, TRIES = 5, WAIT = 30000, WAIT_MAX = 3600000, ITER = 100000;
  const cfg = { mode: null, minutes: 1, bioToo: true };   // mode: 'off', 'bio' (the phone's lock) or 'pin'; null: not decided yet
  try {   // (older phones kept { enabled })
    const v = JSON.parse(localStorage.getItem(K));
    if (v && typeof v === 'object') { if (v.mode) Object.assign(cfg, v); else { if (typeof v.enabled === 'boolean') cfg.mode = v.enabled ? 'bio' : 'off'; if (v.minutes != null) cfg.minutes = v.minutes; } }
  } catch (e) {}
  const store = () => { try { localStorage.setItem(K, JSON.stringify(cfg)); } catch (e) {} };
  let locked = false, away = 0, trying = false, bioOk = false, pin = null;   // pin: { salt, hash, len, iter, tries, until }
  const cover = on => { const el = document.getElementById('cover'); if (el) el.hidden = !on; };
  const b64 = a => btoa(String.fromCharCode(...a)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function hash(code, salt, iter) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('ll1/pin/' + code), 'PBKDF2', false, ['deriveBits']);
    return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256)));
  }
  const loadPin = async () => { try { const v = JSON.parse(await Native.Secure.get(PK)); pin = v && v.hash && v.salt ? v : null; } catch (e) { pin = null; } };
  const savePin = () => (pin ? Native.Secure.set(PK, JSON.stringify(pin)) : Native.Secure.remove(PK)).catch(() => {});
  const bioAvail = async () => { try { return !!(Native.Biometric && await Native.Biometric.available()); } catch (e) { return false; } };
  const mode = () => cfg.mode || 'off';
  const bioAllowed = () => mode() === 'bio' || (mode() === 'pin' && cfg.bioToo !== false && bioOk);

  return {
    onChange: null,
    get mode() { return mode(); },
    get enabled() { return mode() !== 'off'; },
    get minutes() { return cfg.minutes; },
    get bioToo() { return cfg.bioToo !== false; },
    get bioAvailable() { return bioOk; },
    get bioAllowed() { return bioAllowed(); },
    get locked() { return locked; },
    get pinLength() { return pin ? pin.len : 0; },
    /** Milliseconds until a PIN may be tried again (0: now). */
    get wait() { return pin && pin.until ? Math.max(0, pin.until - Date.now()) : 0; },
    async init() {
      bioOk = await bioAvail(); await loadPin();
      if (cfg.mode === null) { cfg.mode = bioOk ? 'bio' : 'off'; store(); }   // on by default when the phone has a screen lock
      if (cfg.mode === 'pin' && !pin) { cfg.mode = 'off'; store(); }          // (a PIN gone with the phone's secure storage: open, rather than lock out)
      locked = mode() !== 'off';
      Native.onAppState(active => {
        if (trying) return;                         // the Face ID / fingerprint prompt itself pauses the app
        if (!active) { away = Date.now(); cover(true); return; }
        cover(false);
        if (mode() !== 'off' && !locked && Date.now() - away >= cfg.minutes * 60000) { locked = true; if (Lock.onChange) Lock.onChange(); }
      });
    },
    /** The phone's own lock. Returns an error message, or null on success. */
    async useBio() {
      if (!await bioAvail()) return N_('Set a screen lock (passcode, Face ID or fingerprint) in your phone settings first.');
      trying = true; const ok = await Native.Biometric.authenticate(__('Turn on app lock')); trying = false;
      if (!ok) return N_('App lock was not turned on.');
      cfg.mode = 'bio'; store(); pin = null; await savePin(); locked = false; return null;
    },
    /** A PIN of 4 to 8 digits, kept as a salted hash. Returns an error message, or null on success. */
    async setPin(code) {
      code = String(code || ''); if (!PIN.test(code)) return N_('A PIN is 4 to 8 digits.');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      pin = { salt: b64(salt), hash: await hash(code, salt, ITER), len: code.length, iter: ITER, tries: 0, until: 0 };
      await savePin(); cfg.mode = 'pin'; store(); locked = false; return null;
    },
    /** Checks a PIN: { ok: true }, or { ok: false, wait } with the milliseconds to wait before the next try (0: straight away). */
    async checkPin(code) {
      if (!pin) return { ok: false, wait: 0 };
      if (pin.until && Date.now() < pin.until) return { ok: false, wait: pin.until - Date.now() };
      code = String(code || '');
      const ok = PIN.test(code) && (await hash(code, unb64(pin.salt), pin.iter || ITER)) === pin.hash;
      if (ok) { pin.tries = 0; pin.until = 0; await savePin(); locked = false; away = Date.now(); return { ok: true }; }
      pin.tries = (pin.tries || 0) + 1;
      if (pin.tries >= TRIES) pin.until = Date.now() + Math.min(WAIT_MAX, WAIT * 2 ** (pin.tries - TRIES));
      await savePin(); return { ok: false, wait: pin.until ? Math.max(0, pin.until - Date.now()) : 0 };
    },
    async off() { cfg.mode = 'off'; store(); pin = null; await savePin(); locked = false; },
    setMinutes(m) { cfg.minutes = m; store(); },
    setBioToo(v) { cfg.bioToo = !!v; store(); },
    /** Face ID / fingerprint: the phone's lock, or the PIN's shortcut when that is allowed. */
    async unlock() {
      if (trying || !bioAllowed()) return false;
      trying = true;
      try { const ok = await Native.Biometric.authenticate(__('Unlock')); if (ok) { locked = false; away = Date.now(); } return ok; }
      finally { trying = false; }
    },
    reset() { locked = false; },
    /** Everything off and forgotten (the phone is being cleared): the next start decides again. */
    async clear() { cfg.mode = null; cfg.minutes = 1; cfg.bioToo = true; store(); pin = null; await savePin(); locked = false; },
  };
})();
