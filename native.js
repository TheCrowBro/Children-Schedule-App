'use strict';
/* Thin wrapper over Capacitor plugins so the rest of the app can stay plain web code.
   In a normal browser `Native.is` is false and nothing here is used. */
const Native = (() => {
  const cap = window.Capacitor, CFG = window.LL_CONFIG || {};
  const is = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const plug = n => cap.Plugins[n];
  return {
    is,
    platform: is ? cap.getPlatform() : 'web',
    /** URL scheme the OS routes back to this app (registered in AndroidManifest / Info.plist). */
    scheme: CFG.appScheme || 'app.littlelog.newborn',
    openUrl: url => plug('Browser').open({ url }),
    closeBrowser: () => plug('Browser').close().catch(() => {}),
    onUrl(cb) { if (is) plug('App').addListener('appUrlOpen', e => cb(e.url)); },
    /** Android back button: return true from cb if it handled the press. */
    onBack(cb) { if (is) plug('App').addListener('backButton', () => { if (!cb()) plug('App').exitApp(); }); },
    /** Write a text file and open the OS share sheet (Save to Files / iCloud Drive / Drive / email …). */
    async saveFile(name, text) {
      const dir = 'CACHE';
      await plug('Filesystem').writeFile({ path: name, data: text, directory: dir, encoding: 'utf8' });
      const { uri } = await plug('Filesystem').getUri({ path: name, directory: dir });
      await plug('Share').share({ title: name, url: uri, dialogTitle: 'Save or share' });
    },
  };
})();
