// Installs a fake Capacitor bridge + plugins into a Playwright context, before the app's scripts run, so the
// app-only product can be tested in desktop Chromium. Secure storage is backed by localStorage under MOCKSECURE:
// (so it survives reloads, and tests can prove secrets are NOT in the app's own storage keys).
async function installFakeNative(ctx, { launchUrl = null, biometric = true } = {}) {
  await ctx.addInitScript(({ launchUrl, biometric }) => {
    const listeners = {}, calls = [];
    window.__calls = calls; window.__bio = { ok: true, available: biometric, prompts: 0 };
    window.__emit = (ev, data) => (listeners[ev] || []).forEach(f => f(data));
    window.LLPlugins = {
      KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
      SecureStorage: {
        setSynchronize: async () => {}, setDefaultKeychainAccess: async () => {},
        get: async k => { const v = localStorage.getItem('MOCKSECURE:' + k); return v === null ? null : v; },
        set: async (k, v) => { localStorage.setItem('MOCKSECURE:' + k, v); },
        remove: async k => { localStorage.removeItem('MOCKSECURE:' + k); },
      },
      BiometricAuth: {
        checkBiometry: async () => ({ isAvailable: window.__bio.available, deviceIsSecure: window.__bio.available }),
        authenticate: async () => { window.__bio.prompts++; if (!window.__bio.ok || localStorage.getItem('MOCK_BIO_FAIL') === '1') throw new Error('cancelled'); },
      },
      Browser: { open: async o => calls.push(['Browser.open', o.url]), close: async () => calls.push(['Browser.close']) },
      App: { addListener: (ev, f) => (listeners[ev] = listeners[ev] || []).push(f), exitApp: () => calls.push(['App.exitApp']), getLaunchUrl: async () => (launchUrl ? { url: launchUrl } : null) },
      Filesystem: { writeFile: async o => calls.push(['writeFile', o.path, o.data.length]), getUri: async o => ({ uri: 'file:///cache/' + o.path }) },
      Share: { share: async o => calls.push(['share', o.url]) },
    };
    // The bundled Capacitor core replaces window.Capacitor; its custom-platform hook makes it report "android".
    window.CapacitorCustomPlatform = { name: 'android', plugins: {} };
  }, { launchUrl, biometric });
}
module.exports = { installFakeNative };
