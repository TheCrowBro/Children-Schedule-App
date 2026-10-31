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
1. Make the **upload key** once, somewhere outside the repository, and back it up (a lost upload key can be reset in the Play Console,
   but only with Google's help; the Play Console itself holds the key that signs what phones install):
   ```bash
   keytool -genkeypair -v -keystore ~/keys/littlelog-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. Tell the build where it is: copy `android/keystore.properties.example` to `android/keystore.properties` (git-ignored) and fill in
   the path, the passwords and the alias; or set `LL_KEYSTORE`, `LL_KEYSTORE_PASSWORD`, `LL_KEY_ALIAS` and `LL_KEY_PASSWORD` in the
   environment (what a build machine would do). `android/app/build.gradle` signs the release build with it when either is present,
   and makes an unsigned bundle otherwise, which the Play Console refuses.
3. Build the bundle:
   ```bash
   npm run aab   # → android/app/build/outputs/bundle/release/app-release.aab
   jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab   # "jar verified"
   ```
4. Upload the `.aab` in the Play Console (one-off $25 developer fee), with Play App Signing on (the default for new apps): Google keeps
   the app signing key and your upload key only has to match what you registered. [LAUNCH.md](LAUNCH.md) has the order of everything
   around this (the account, the closed test, the listing).

`versionCode` goes up by one with every upload (`scripts/`-free: it is set by hand in `build.gradle` beside `versionName`); the Play
Console refuses a bundle whose code it has seen.

## iOS release (needs a Mac)
`npm run ios`, set your Team and Bundle Identifier in Xcode (*Signing & Capabilities*), then *Product → Archive → Distribute App → App Store Connect*.
Needs an Apple Developer account ($99/year). The iOS project is generated and configured (camera + Face ID descriptions, URL scheme)
but has **not** been compiled in this repo's dev sandbox; expect to open it once on a Mac, let Xcode resolve the Swift packages and
sort out signing.

Two things in the project that App Store Connect asks about:
* **Export compliance.** `Info.plist` sets `ITSAppUsesNonExemptEncryption` to `false`: the app's cryptography is the operating
  system's own standard algorithms (WebKit's Web Crypto for the end-to-end encryption, the Keychain for the keys) and HTTPS, nothing
  proprietary, which Apple's questionnaire treats as exempt from export documentation (no ERN or CCATS). The US rules can still ask
  the developer for a yearly *self-classification report* to the BIS for mass-market encryption; read Apple's *Complying with
  Encryption Export Regulations* page when you first submit and, if your reading differs, set the key to `true` and answer the
  questionnaire in App Store Connect instead.
* **Backups.** `AppDelegate` keeps `Library/WebKit` (where the WebView holds the decrypted log) out of iCloud and computer backups
  (SECURITY.md, finding 7). Not yet verified on a device.

## Store requirements already handled
* In-app **account deletion** (Apple 5.1.1(v), Google Play). A sole parent's deletion removes the log (the app warns first).
* Camera permission text (QR scanner) and Face ID text; Android `CAMERA` (optional hardware) and `USE_BIOMETRIC`.
* Cloud backups encrypted on the phone.

## Still needed from you for the stores
The whole order, with the accounts, waits and costs, is in [LAUNCH.md](LAUNCH.md). In short:
* A **privacy policy** at a web address: [PRIVACY.md](PRIVACY.md) is the draft for the store build (no server of ours; the family's
  own cloud folder; what the cloud sees; deletion; the recovery code). Publish it, put the address in `config.js` as `privacyUrl`
  (More → App updates then shows a *Privacy policy* link) and give the same address to both stores.
* The **listing**: [store/listing.md](store/listing.md) has the title, descriptions, category, keywords and the suggested
  *Data safety* (Google) / *App Privacy* (Apple) and content-rating answers; `store/android` and `store/ios` hold the screenshots and
  the feature graphic (`node scripts/store-shots.js <demo.html>` remakes them from the demo).
* A **support email address** that is not your personal one: both stores and the Google consent screen show it to users.
* Apple reviews web-wrapper apps strictly (guideline 4.2). Camera scanning, biometrics, Keychain, native sharing, offline use and the
  local sleep-check notifications are the case that this is an app, not a website.

## Known limits / next steps
* **CSP and Capacitor-Android:** Capacitor injects its bridge as an inline `<script>` right after `<head>`. The policy is a `<meta>` tag
  *after* that point, so the bridge runs and everything later is held to `script-src 'self'` (the end-to-end tests reproduce this).
  Keep `index.html`'s opening tag a plain `<head>`, and re-check after upgrading Capacitor. iOS injects its bridge natively, outside CSP.
* **Not yet verified on real devices:** the camera permission prompt, Face ID / fingerprint, the Keychain/Keystore plugins, Google/OneDrive
  sign-in, Turnstile inside the WebView. These are tested against fakes of the native layer; try them first on a physical Android phone and iPhone.
* **The Files-app folder plugin** (`ios/App/App/FolderPlugin.swift`, for iCloud Drive as the family folder, [FOLDER.md](FOLDER.md)) was
  written without Xcode at hand and has not been built or run: build it, then try on two iPhones: *Connect iCloud Drive* → the picker
  (where the Little Log folder goes) → *Create log*; on the Family tab *Share in Files and make a join code* (the share sheet should
  offer *Collaborate* for an iCloud Drive folder); on the other phone *Choose the shared folder…* (the shared folder appears under
  iCloud Drive → Shared in the picker), the join code, approval; entries both ways; a picture; the app in the background for a while
  (iCloud syncs the files itself; the app lists the folder every 30 s while open). Things to watch: whether iCloud placeholders
  (files not yet downloaded) list under their own names and download on a coordinated read, as the plugin assumes; whether the
  share sheet's *Collaborate* appears for a folder the app holds a bookmark to; the person id in the iCloud Keychain surviving a
  reinstall and reaching the person's other devices.
* Invite links only open the installed app (custom scheme); people scan the QR code *inside* the app, or type the code. Universal Links /
  App Links would need a domain you control.
* The local copy of the log is not encrypted with a Keystore key (it relies on the OS sandbox and the app lock).
* **Languages:** the app's text follows the phone's language, in 32 languages (see [lang/README.md](lang/README.md)).
  * An iPhone only hands an app the phone's language if the app says it has that language. `Info.plist` therefore lists them all in
    `CFBundleLocalizations`. Keep that list in step with `LANGS` in `i18n.js`; the languages test checks it.
  * The two permission texts that iOS shows itself, the camera and Face ID texts in `Info.plist`, are still English only. Translating
    them needs `InfoPlist.strings` files added to the project in Xcode.
* **Windows / Mac** (next phase): the same `www/` can be wrapped with Tauri or Electron (OS keychain for secrets, app-only like the phones).
