# Building the phone apps (Android + iOS)

The phone apps are the same web app wrapped with [Capacitor](https://capacitorjs.com): one codebase, native
shells in `android/` and `ios/`. Web files are copied into `www/` by `npm run build:web` (no bundler).

```bash
npm install
npm run sync        # copy web app into both native projects + register URL schemes
npm run android     # open in Android Studio       npm run ios   # open in Xcode (Mac only)
npm run apk         # command-line debug APK  →  android/app/build/outputs/apk/debug/app-debug.apk
```

## Before your first release
1. **Pick the final app id** and change it everywhere *before* publishing (it can't change afterwards):
   `capacitor.config.json` (`appId`), `config.js` (`appScheme`), then in `android/app/build.gradle`
   (`applicationId`, `namespace`) and the Xcode target's *Bundle Identifier*. Currently `app.littlelog.newborn`.
2. Fill in `config.js` (see [SETUP.md](SETUP.md)) and set `publicUrl` to where the web app is hosted so invite
   QR codes also work for people without the app.
3. Register the **native redirect URIs** with each cloud provider (the web redirects in SETUP.md are for browsers):

   | Provider | Redirect / client type for the phone app |
   |---|---|
   | Dropbox | add redirect URI `app.littlelog.newborn://oauth` |
   | OneDrive | Azure → Authentication → add platform **Mobile and desktop** → custom URI `app.littlelog.newborn://oauth` |
   | Google Drive | create an OAuth client of type **iOS** (bundle id = your app id); put it in `googleNativeClientId`. `npm run sync` registers its reverse-client-id scheme automatically. |

4. App icon / splash: edit `scripts/make-icons.js`, run `node scripts/make-icons.js && npx @capacitor/assets generate`.

## Android release
```bash
cd android && ./gradlew bundleRelease     # → app/build/outputs/bundle/release/app-release.aab
```
Create an upload keystore once (`keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`),
keep it **out of git** (already in `.gitignore`) and back it up, then configure signing in `android/app/build.gradle` or let
Play App Signing handle it. Upload the `.aab` in the Play Console (one-off $25 developer fee).

## iOS release (needs a Mac)
`npm run ios`, set your Team and Bundle Identifier in Xcode (*Signing & Capabilities*), then *Product → Archive →
Distribute App → App Store Connect*. Needs an Apple Developer account ($99/year). The iOS project is generated and
configured (camera description, URL scheme) but has **not** been compiled in this repo's CI/dev sandbox – expect to
open it once on a Mac, let Xcode resolve the Swift packages, and fix any signing prompts.

## Store requirements already handled
* In-app **account deletion** (Apple 5.1.1(v), Google Play) – More → Account → Delete.
* Camera permission string (QR scanner only) and Android `CAMERA` permission, marked optional hardware.
* Android auto-backup disabled so sign-in tokens and baby data don't leave the device via Google backup.
* Cloud backups are encrypted client-side.

## Still needed from you for the stores
* A **privacy policy** URL (this app handles children's health-related data: say what is stored in Supabase, who can
  see it, and how to delete it).
* Store listing: screenshots, description, content rating, and the *App Privacy* (Apple) / *Data safety* (Google) forms.
  Declare: email address, health/fitness-type data entered by the user; no tracking, no ads.
* Apple reviews web-wrapper apps strictly (guideline 4.2). The camera scanner, native sharing, offline use and
  account system help; adding **local reminder notifications** would strengthen the case and is a useful feature anyway.

## Known limits / next steps
* Invite links open the app only if you add Universal Links / App Links, which need a domain you control. Until then
  people scan the QR code inside the app (works today) or the link opens the web app.
* Not yet verified on real devices or an emulator: camera permission prompt, Google Drive sign-in on the phone, OneDrive
  sign-in on the phone. Test these first on a physical Android and iPhone.
* **Windows / Mac** (next phase): the same `www/` can be wrapped with Tauri or Electron. Today the web app is already
  installable on desktop Chrome/Edge (install icon in the address bar) and Safari (*File → Add to Dock*).
