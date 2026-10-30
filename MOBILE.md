# Building the phone apps (Android + iOS)

Little Log is **app-only**: the same web code wrapped with [Capacitor](https://capacitorjs.com) in native shells
(`android/`, `ios/`). Opened in an ordinary browser it only shows a "get the app" message. `npm run build:web` copies the
app into `www/`, bundles the native plugins with esbuild, and writes the Content-Security-Policy from `config.js`.

```bash
npm install
npm run sync        # build web assets + copy into both native projects + register URL schemes
npm run android     # open in Android Studio       npm run ios   # open in Xcode (Mac only)
npm run apk         # command-line debug APK  →  android/app/build/outputs/apk/debug/app-debug.apk
npm test            # database + end-to-end tests
```

## Before your first release
1. **Pick the final app id** and change it everywhere *before* publishing (it can't change afterwards):
   `capacitor.config.json` (`appId`), `config.js` (`appScheme`), then `android/app/build.gradle`
   (`applicationId`, `namespace`) and the Xcode target's *Bundle Identifier*. Currently `app.littlelog.newborn`.
2. Do the setup in [SETUP.md](SETUP.md), fill in `config.js`, then `npm run sync`. The **store build** is *The family's own cloud*
   only: `dropboxKey` and/or `googleClientId` set and `supabaseUrl` empty, so each family's log lives in their own Dropbox or Google
   Drive and no server of yours is involved.
   A build for a family that runs its own server sets `supabaseUrl` and `supabaseKey` instead (or as well).
3. Register the **phone redirect URIs** with each cloud provider:

   | Provider | Redirect / client type |
   |---|---|
   | Dropbox | redirect URI `app.littlelog.newborn://oauth` |
   | OneDrive | Azure → Authentication → platform **Mobile and desktop** → custom URI `app.littlelog.newborn://oauth` |
   | Google Drive | OAuth client of type **iOS**; put it in `googleClientId`. `npm run sync` registers its reverse-client-id scheme. |

4. Icons / splash: edit `scripts/make-icons.js`, then `npm run icons`.
5. **Update app** (More): on Android it opens the app's Google Play page from the app id (`appScheme` in `config.js`), so it
   works as soon as the app is on Google Play. On iPhones it needs the app's number in the App Store: once the app is published,
   put the number from its address (`apps.apple.com/app/id…`) in `appStoreId` in `config.js` and `npm run sync`. Until then the
   button says to look in the App Store.

## Security features in the app
* **Keychain / Keystore** (`@aparajita/capacitor-secure-storage`): sign-in session, cloud tokens, backup passphrase. Items stay
  on the device (no iCloud Keychain sync) and are readable only while unlocked.
* **App lock** (`@aparajita/capacitor-biometric-auth`): Face ID / fingerprint with the passcode as fallback; on by default when the
  phone has a screen lock; the screen is covered in the app switcher.
* **Strict CSP**, no web storage for secrets, Android auto-backup disabled, native HTTP.
* **Two-step verification** (TOTP) required for parents, optional for others; CAPTCHA at sign-in when configured.
* **End-to-end encryption** with per-phone keys, a recovery code and key rotation (see [SETUP.md](SETUP.md) §5). Test the whole key flow on two real phones:
  create a log, scan an invite, approve a second phone, remove a phone, and restore with the recovery code.

## Android release
```bash
npm run aab   # → android/app/build/outputs/bundle/release/app-release.aab
```
Create an upload keystore once (`keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`),
keep it **out of git** (already ignored) and back it up, configure signing in `android/app/build.gradle` or use Play App Signing.
Upload the `.aab` in the Play Console (one-off $25 developer fee).

## iOS release (needs a Mac)
`npm run ios`, set your Team and Bundle Identifier in Xcode (*Signing & Capabilities*), then *Product → Archive → Distribute App → App Store Connect*.
Needs an Apple Developer account ($99/year). The iOS project is generated and configured (camera + Face ID descriptions, URL scheme)
but has **not** been compiled in this repo's dev sandbox; expect to open it once on a Mac, let Xcode resolve the Swift packages and
sort out signing.

## Store requirements already handled
* In-app **account deletion** (Apple 5.1.1(v), Google Play). A sole parent's deletion removes the log (the app warns first).
* Camera permission text (QR scanner) and Face ID text; Android `CAMERA` (optional hardware) and `USE_BIOMETRIC`.
* Cloud backups encrypted on the phone.

## Still needed from you for the stores
* A **privacy policy** URL covering: email address, children's health-related entries (end-to-end encrypted; the provider cannot read them), who can see them (roles),
  the activity log, Supabase as processor, and how to delete everything. Say plainly that a lost recovery code means unrecoverable data.
* Store listing, screenshots, content rating, *App Privacy* (Apple) / *Data safety* (Google): email + health/fitness-type data entered by
  the user; no tracking, no ads.
* Apple reviews web-wrapper apps strictly (guideline 4.2). Camera scanning, biometrics, Keychain, native sharing and offline use help;
  local reminder notifications would strengthen the case.

## Known limits / next steps
* **CSP and Capacitor-Android:** Capacitor injects its bridge as an inline `<script>` right after `<head>`. The policy is a `<meta>` tag
  *after* that point, so the bridge runs and everything later is held to `script-src 'self'` (the end-to-end tests reproduce this).
  Keep `index.html`'s opening tag a plain `<head>`, and re-check after upgrading Capacitor. iOS injects its bridge natively, outside CSP.
* **Not yet verified on real devices:** the camera permission prompt, Face ID / fingerprint, the Keychain/Keystore plugins, Google/OneDrive
  sign-in, Turnstile inside the WebView. These are tested against fakes of the native layer; try them first on a physical Android phone and iPhone.
* Invite links only open the installed app (custom scheme); people scan the QR code *inside* the app, or type the code. Universal Links /
  App Links would need a domain you control.
* The local copy of the log is not encrypted with a Keystore key (it relies on the OS sandbox and the app lock).
* **Languages:** the app's text follows the phone's language, in 32 languages (see [lang/README.md](lang/README.md)).
  * An iPhone only hands an app the phone's language if the app says it has that language. `Info.plist` therefore lists them all in
    `CFBundleLocalizations`. Keep that list in step with `LANGS` in `i18n.js`; the languages test checks it.
  * The two permission texts that iOS shows itself, the camera and Face ID texts in `Info.plist`, are still English only. Translating
    them needs `InfoPlist.strings` files added to the project in Xcode.
* **Windows / Mac** (next phase): the same `www/` can be wrapped with Tauri or Electron (OS keychain for secrets, app-only like the phones).
