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
    /** Leave the app for another one (the store, a phone call): the app's web view hands such links to the OS. */
    openExternal(url) { location.href = url; },
    /** Where this app is in its store, to update it: Google Play, or the App Store once its number is in config.js; null elsewhere. */
    storeUrl() {
      if (!is) return null;
      if (cap.getPlatform() === 'android') return `https://play.google.com/store/apps/details?id=${encodeURIComponent(CFG.appScheme || 'app.littlelog.newborn')}`;
      return CFG.appStoreId ? `https://apps.apple.com/app/id${encodeURIComponent(CFG.appStoreId)}` : null;
    },
    /** The version of the app on this phone ("1.2 (14)"), or '' when it can't tell. */
    async version() { if (!is) return ''; try { const i = await P().App.getInfo(); return i.build && i.build !== i.version ? `${i.version} (${i.build})` : i.version || ''; } catch (e) { return ''; } },
    closeBrowser: () => Promise.resolve(P().Browser.close()).catch(() => {}),
    onUrl(cb) { if (is) P().App.addListener('appUrlOpen', e => cb(e.url)); },
    /** Android back button: return true from cb if it handled the press. */
    /** URL the app was launched with (cold start from a link), or null. */
    async launchUrl() { if (!is) return null; try { const r = await P().App.getLaunchUrl(); return (r && r.url) || null; } catch (e) { return null; } },
    onBack(cb) { if (is) P().App.addListener('backButton', () => { if (!cb()) P().App.exitApp(); }); },
    onAppState(cb) { if (is) P().App.addListener('appStateChange', e => cb(e.isActive)); },
    /** An event into the phone's own calendar through its "new event" screen (Android: the calendar app's; iOS: the system's), where the
        user picks the calendar and saves: true. False when they cancelled there; null when the app can't do that here (a browser, or a
        build without the plugin), so the caller shares a calendar file instead. */
    async calendarInsert(item) { const C = is && P().Calendar; if (!C) return null; const r = await C.insert(item); return !(r && r.added === false); },
    /** Share text through the OS share sheet (the Web Share API is missing from Android's WebView). */
    async shareText(title, text) { await P().Share.share({ title, text, dialogTitle: title }); },
    /** Write a file (text, or bytes such as a PDF) and open the OS share sheet (Save to Files / iCloud Drive / Drive / email …). */
    async saveFile(name, data) {
      const dir = 'CACHE', bytes = typeof data !== 'string';
      let b64 = ''; if (bytes) for (let i = 0; i < data.length; i += 0x8000) b64 += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
      await P().Filesystem.writeFile({ path: name, data: bytes ? btoa(b64) : data, directory: dir, ...(bytes ? {} : { encoding: 'utf8' }) });
      const { uri } = await P().Filesystem.getUri({ path: name, directory: dir });
      await P().Share.share({ title: name, url: uri, dialogTitle: __('Save or share') });
    },
    /** The phone's status and navigation bars over the page (Android 15 and later draw the app edge to edge): cb gets { top, bottom,
        left, right } in CSS pixels now and whenever they change. Elsewhere (iOS, a browser) nothing happens: env(safe-area-inset-*) does it. */
    watchInsets(cb) {
      const I = P().Insets; if (!is || !I) return;
      I.get().then(cb).catch(() => {});
      try { I.addListener('change', cb); } catch (e) { /* no events: the first answer stands */ }
    },
    /** Dark icons on light bars (light: true) or light icons on dark bars, to match the app's theme. */
    setBarsLight(light) { const I = P().Insets; if (is && I && I.setBars) I.setBars({ light: !!light }).catch(() => {}); },
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
