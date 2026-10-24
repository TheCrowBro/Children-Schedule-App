'use strict';
/* The phone-app layer. The product only runs inside the native app (Capacitor); in a browser the app shows a
   "get the app" screen. Plugins come from native-plugins.js (window.LLPlugins). */
const Native = (() => {
  const cap = window.Capacitor, CFG = window.LL_CONFIG || {};
  const is = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const P = () => window.LLPlugins || {};
  let secureReady = null;
  const prep = () => secureReady || (secureReady = (async () => {
    const S = P().SecureStorage;
    // Keychain items stay on this device only (no iCloud Keychain sync) and are readable only while unlocked.
    try { await S.setSynchronize(false); await S.setDefaultKeychainAccess(P().KeychainAccess.whenUnlockedThisDeviceOnly); } catch (e) {}
  })());
  return {
    /** fetch() that gives up (and reports a network error) instead of hanging forever. */
    fetch(url, opt = {}, ms = CFG.netTimeoutMs || 30000) {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; let timer;
      const timeout = new Promise((_, no) => { timer = setTimeout(() => { no(new TypeError(N_('Network timeout'))); try { if (ctl) ctl.abort(); } catch (e) { /* ignore */ } }, ms); });   // reject first, so the timeout (not the abort) is what callers see
      return Promise.race([fetch(url, ctl ? { ...opt, signal: ctl.signal } : opt), timeout]).finally(() => clearTimeout(timer));
    },
    is,
    platform: is ? cap.getPlatform() : 'web',
    /** URL scheme the OS routes back to this app (registered in AndroidManifest / Info.plist). */
    scheme: CFG.appScheme || 'app.littlelog.newborn',
    openUrl: url => P().Browser.open({ url }),
    closeBrowser: () => Promise.resolve(P().Browser.close()).catch(() => {}),
    onUrl(cb) { if (is) P().App.addListener('appUrlOpen', e => cb(e.url)); },
    /** Android back button: return true from cb if it handled the press. */
    /** URL the app was launched with (cold start from a link), or null. */
    async launchUrl() { if (!is) return null; try { const r = await P().App.getLaunchUrl(); return (r && r.url) || null; } catch (e) { return null; } },
    onBack(cb) { if (is) P().App.addListener('backButton', () => { if (!cb()) P().App.exitApp(); }); },
    onAppState(cb) { if (is) P().App.addListener('appStateChange', e => cb(e.isActive)); },
    /** Share text through the OS share sheet (the Web Share API is missing from Android's WebView). */
    async shareText(title, text) { await P().Share.share({ title, text, dialogTitle: title }); },
    /** Write a text file and open the OS share sheet (Save to Files / iCloud Drive / Drive / email …). */
    async saveFile(name, text) {
      const dir = 'CACHE';
      await P().Filesystem.writeFile({ path: name, data: text, directory: dir, encoding: 'utf8' });
      const { uri } = await P().Filesystem.getUri({ path: name, directory: dir });
      await P().Share.share({ title: name, url: uri, dialogTitle: __('Save or share') });
    },
    /** iOS Keychain / Android Keystore-backed storage for secrets (sign-in tokens, backup passphrase, cloud tokens). */
    Secure: {
      async get(k) { await prep(); try { const v = await P().SecureStorage.get(k); return v == null ? null : String(v); } catch (e) { return null; } },
      async set(k, v) { await prep(); await P().SecureStorage.set(k, String(v)); },
      async remove(k) { await prep(); try { await P().SecureStorage.remove(k); } catch (e) {} },
    },
    /** Face ID / fingerprint, with the device passcode as fallback. */
    Biometric: {
      async available() { try { const r = await P().BiometricAuth.checkBiometry(); return !!(r.isAvailable || r.deviceIsSecure); } catch (e) { return false; } },
      async authenticate(reason) {
        try { await P().BiometricAuth.authenticate({ reason, cancelTitle: __('Cancel'), allowDeviceCredential: true, iosFallbackTitle: __('Use passcode'), androidTitle: 'Little Log', androidSubtitle: reason }); return true; }
        catch (e) { return false; }
      },
    },
  };
})();
