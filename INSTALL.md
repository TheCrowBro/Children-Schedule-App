# Installing Little Log

The short path from nothing to the app on a phone, and back to a saved version. The details are in [SETUP.md](SETUP.md) (the server
and sign-in), [MOBILE.md](MOBILE.md) (store releases) and [TESTING.md](TESTING.md) (the tests and the checklist for real phones).

## Saved versions
Each saved version is a git tag. A backup zip holds the same version ready to use (§7).

| Version | Tag | Saved | What it is |
|---|---|---|---|
| 1.0.0 | `v1.0.0` | 25 October 2026 | The newborn tracker: feeds, sleep, diapers, solids and allergies, the routine, the day clock, travel, the doctor's report, several children and families, the watercolour family tree, 32 languages. Saved before the app grows with the child up to 18. |

Android shows version 1.0.0 as "1.0".

## 1. Try it without installing
`npm run demo` writes `demo/little-log-demo.html`: one page that runs in any browser with made-up data. It needs no account and sends
nothing anywhere. A backup zip has it ready made.

## 2. Install on an Android phone
You need the app file (`.apk`), from a backup zip (§7) or built yourself (§5).
1. Copy the `.apk` to the phone (by email to yourself, a USB cable or a cloud drive) and tap it.
2. Android asks whether the app you opened it with (Files, Chrome, Gmail…) may install apps. Allow it, go back and tap **Install**.
   With the phone plugged into a computer and USB debugging on, `adb install -r <file>.apk` does the same.
3. Open Little Log. Until a server is set up (§4) it offers **Use on this device only**: a private log on the phone.

Needs Android 7.0 or newer.

**Updates.** Android only installs a new version over an old one when both are signed with the same key. These `.apk` files are *debug*
builds, signed with the debug key of the computer that built them. When a build from another computer won't install over the app,
Android wants it uninstalled first, and **uninstalling deletes the log on that phone** unless it is in a family (synced) or in a cloud
backup. Sync or back up first. A backup zip has the key its `.apk` was signed with (§7). For real use, sign with your own release key
([MOBILE.md → Android release](MOBILE.md#android-release)).

## 3. Install on an iPhone
Apple only lets an app onto an iPhone through Xcode, TestFlight or the App Store, so you need a Mac.
- **Your own iPhone, to try it:** build from source (§5), plug the iPhone in, pick it in Xcode and press Run. With a free Apple ID the
  app stops opening after 7 days until you run it from Xcode again. With an Apple Developer account ($99 a year) it lasts a year.
- **Other people's iPhones:** with a developer account, *Product → Archive → Distribute App → TestFlight*, then invite them in App Store
  Connect. They install Apple's TestFlight app and get Little Log from it.

Needs iOS 15 or newer.

## 4. Sign-in, families and cloud backup (optional)
On its own the app keeps everything on the phone. For a family to share a log you need a Supabase project (the free tier is fine):
1. Follow [SETUP.md §1](SETUP.md#1-supabase-project-free-tier-is-fine): create the project, run `supabase/schema.sql` in its SQL
   Editor, and make the sign-in settings in its table (the emailed code, two-step verification, CAPTCHA, token lifetime, your own
   email sender).
2. Put the project's *Project URL* and *anon public* key in `config.js` (`supabaseUrl`, `supabaseKey`). They are public values, not
   secrets.
3. Cloud backup to Dropbox, Google Drive or OneDrive, if you want it:
   [SETUP.md §3](SETUP.md#3-cloud-backup-providers-optional-each-is-independent).
4. Language reports, if you want them: deploy the `language-report` function and set its secrets
   ([SETUP.md §6](SETUP.md#6-language-reports-optional)). The address the reports go to is the `REPORT_TO` secret. Type it only into
   the terminal or the Supabase dashboard, never into a file in this repository.
5. Build again (`npm run sync`, §5) and install the new build. The app's network rules are made from `config.js` when it is built, so
   an older build can't reach the project.

## 5. Build from source
You need:
- [Node.js](https://nodejs.org) 22 or newer (npm comes with it) and git;
- for Android, [Android Studio](https://developer.android.com/studio), which brings the Android SDK and the Java 21 the build uses;
- for iPhones, a Mac with the current Xcode.

```bash
git clone https://github.com/TheCrowBro/Children-Schedule-App.git
cd Children-Schedule-App
git checkout v1.0.0     # a saved version; leave this out for the latest
npm ci                  # installs exactly the packages in package-lock.json
                        # fill in config.js now if you did §4
npm run sync            # builds the app and copies it into android/ and ios/
```
- **Android, to try it:** `npm run apk` writes `android/app/build/outputs/apk/debug/app-debug.apk`; install it as in §2. If the build
  can't find the Android SDK, open the project once in Android Studio (`npm run android`) or set `ANDROID_HOME`
  (`export ANDROID_HOME=$HOME/Android/Sdk` on Linux, `$HOME/Library/Android/sdk` on a Mac).
- **Android, for Google Play:** `npm run aab`, signed with your release key ([MOBILE.md](MOBILE.md#android-release)).
- **iPhone:** `npm run ios` opens Xcode. Under *Signing & Capabilities* pick your Team, and your own Bundle Identifier if
  `app.littlelog.newborn` is taken. Choose the iPhone and press Run. The first time, let Xcode fetch its Swift packages.

Pick the app's final id before the first store release: [MOBILE.md → Before your first release](MOBILE.md#before-your-first-release).

## 6. Run the tests
`npm test` runs ESLint, the database tests and the end-to-end tests: the real app in a real browser against the real database rules
on a real Postgres. On Debian or Ubuntu:
```bash
sudo apt install postgresql ffmpeg poppler-utils
npm install --no-save playwright && npx playwright install --with-deps chromium
npm test
```
The tests start a throwaway Postgres of their own, or use the one in `PGURL`. [TESTING.md](TESTING.md) says what each suite proves and
has the checklist to go through on real phones before a release.

## 7. Restore a saved version
**From git.** Nothing is lost: later work stays on its own branch.
```bash
git fetch --tags
git switch -c restore-1.0.0 v1.0.0    # a new branch at the saved version
npm ci && npm run sync                # then build it as in §5
```

**From a backup zip** (`LittleLog-v1.0.0-backup.zip`):

| File | What it is |
|---|---|
| `LittleLog-v1.0.0-source.zip` | the source at tag `v1.0.0`, without `node_modules` (`npm ci` fetches those) |
| `LittleLog-v1.0.0-android-debug.apk` | the Android app, ready to install (§2) |
| `LittleLog-v1.0.0-demo.html` | the demo (§1) |
| `android-debug.keystore` | the debug key the `.apk` is signed with |
| `SHA256SUMS.txt` | a checksum of each file |

1. Unzip it and check that nothing has changed: `sha256sum -c SHA256SUMS.txt` (on a Mac, `shasum -a 256 -c SHA256SUMS.txt`). Every
   line should say OK.
2. Install the `.apk` (§2), open the demo in a browser, or unzip the source and build it (§5).
3. To build an `.apk` that installs over one from this backup, first put `android-debug.keystore` on the build computer as
   `~/.android/debug.keystore`, after saving the one already there.

**A backup holds the app, not anyone's logs.** Logs stay on the phones and, end-to-end encrypted, in your Supabase project. Going back
to an older version of the app doesn't touch them. When a later version changes `supabase/schema.sql`, its row in *Saved versions*
says what going back needs.
