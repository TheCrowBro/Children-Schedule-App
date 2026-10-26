# Installing Little Log

The short path from nothing to the app on a phone, and back to a saved version. The details are in [SETUP.md](SETUP.md) (the server
and sign-in), [MOBILE.md](MOBILE.md) (store releases) and [TESTING.md](TESTING.md) (the tests and the checklist for real phones).

## Saved versions
Each saved version is a git tag, and a backup zip holds the same version ready to use (§7).

| Version | Tag | Saved | What it is |
|---|---|---|---|
| 1.0.0 | `v1.0.0` | 25 October 2026 | The newborn tracker: feeds, sleep, diapers, solids and allergies, the routine, the day clock, travel, the doctor's report, several children and families, the watercolour family tree, 32 languages. Saved before the app grows with the child up to 18. |
| 1.1.0 | `v1.1.0` | 25 October 2026 | Growing up, phase 1: stages from newborn to 18, the Day page by age (meals, milk from a cup, potty training, the rest behind More), big moments, the Guide's toddler topics and milestones to 5. A phone still on 1.0.0 skips meals, the potty and big moments; once it is updated it fetches them. Going back to 1.0.0 needs nothing on the server. |
| 1.2.0 | `v1.2.0` | 25 October 2026 | Growing up, phase 2: a health record for every age, private like health notes: vaccines, doctor and dentist visits, and weight, height and head size against the CDC growth charts (percentiles, and a chart with the percentile lines), in kg and cm or pounds and inches; in the doctor's report; the Guide's health checks. A phone still on 1.1.0 skips the health record; once it is updated it fetches it. Going back to 1.1.0 needs nothing on the server. |
| 1.3.0 | `v1.3.0` | 25 October 2026 | Growing up, phase 3: daycare, preschool and school. Drop-off and pick-up (who dropped off, who picks up and when, a banner while the child is there), homework, reading and practising, a school child's activities, the routine of the school week, and the Guide for school children. A phone still on 1.2.0 skips drop-offs, pick-ups and homework; once it is updated it fetches them. Going back to 1.2.0 needs nothing on the server. |
| 1.4.0 | `v1.4.0` | 25 October 2026 | Growing up, phase 4: the teenage years and 18. The family calendar (exams, appointments, matches, lessons, school holidays, parties; coming up on the Day page, marked on the Month tab), the Guide for teenagers, and at 18 a celebration, the child's book (a PDF of their big moments, growth and vaccines) and their record as a file. A phone still on 1.3.0 skips the calendar; once it is updated it fetches it. Going back to 1.3.0 needs nothing on the server. |
| 1.4.1 | `v1.4.1` | 25 October 2026 | Easier to find the way back, and tours that cover everything: the health record has a bar at the top ("Back to …" and "Today") that stays put while you scroll, every sheet has a big close button in its corner, and every screen's tour now points at every part of it (drop-off, homework, the calendar, turning 18, the settings, the health record's charts). Nothing changes in the data. |
| 1.4.2 | `v1.4.2` | 25 October 2026 | A teenager's pages leave the baby days out: no feed, diaper, potty or night-waking buttons, no diapers or potty in the legends, no formula setting, and a Guide without the solids, the baby medicines, the milestones and the newborn worries. The Everyone page keeps all of it while a younger child is in the family. Nothing changes in the data. |
| 1.4.3 | `v1.4.3` | 25 October 2026 | The Guide matches each age: from 5 it leaves the baby years out (newborn worries, solids, baby medicines), from 6 the month-by-month milestones too (a 5-year-old's list keeps the preschool years). With Everyone chosen it has a card for each child and every key part for the ages in the family. Nothing changes in the data. |
| 1.5.0 | `v1.5.0` | 26 October 2026 | Pictures and short videos with big moments: up to 4 pictures and a video of up to a minute per moment, encrypted on the phone and kept in the family's private storage bucket, shown under the moment's card, in a viewer, and in the child's book. **Needs the database:** run the *pictures and videos* section at the end of `supabase/schema.sql` once (SETUP.md §1). Going back to an older version leaves the files where they are; the older app shows the moments without them. |
| 1.5.1 | `v1.5.1` | 26 October 2026 | A clearer first screen: **Just this phone**, **Share with family** (sign in) or **Moving from another phone?** (restore a backup file with its passphrase). A log kept on the phone only is offered a cloud backup straight away, the Day page reminds until one is made, and the Family tab offers to share later, keeping the entries. Nothing changes in the data or on the server. |

Android shows the version without its last number: 1.1.0 as "1.1". All the phones in a family should run the same version.

## 1. Try it without installing
`npm run demo` writes `demo/little-log-demo.html`: one page that runs in any browser with made-up data. It needs no account and sends
nothing anywhere. A backup zip has it ready made.

## 2. Install on an Android phone
You need the app file (`.apk`), from a backup zip (§7) or built yourself (§5).
1. Copy the `.apk` to the phone (by email to yourself, a USB cable or a cloud drive) and tap it.
2. Android asks whether the app you opened it with (Files, Chrome, Gmail…) may install apps. Allow it, go back and tap **Install**.
   With the phone plugged into a computer and USB debugging on, `adb install -r <file>.apk` does the same.
3. Open Little Log. The first screen asks how you'd like to use it: **Just this phone**, **Share with family** (needs a server, §4) or
   **Moving from another phone?** (restore a backup file). Until a server is set up (§4) it offers **Use on this device only** instead:
   a private log on the phone.

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
On its own the app keeps everything on the phone (**Just this phone** on the first screen), with an encrypted backup to the owner's own
cloud drive or Files (More → Cloud backup) for moving phones. For a family to share a log you need a Supabase project (the free tier is
fine):
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
If GitHub doesn't have the tag yet (a cloud coding session can only push its own branch, not tags), add it once from the backup zip:
copy `LittleLog-v1.0.0.bundle` into your copy of the repository and run
```bash
git fetch LittleLog-v1.0.0.bundle 'refs/tags/*:refs/tags/*'
git push origin v1.0.0
```

**From a backup zip** (`LittleLog-v1.0.0-backup.zip`):

| File | What it is |
|---|---|
| `INSTALL.md` | this guide |
| `LittleLog-v1.0.0-source.zip` | the source at tag `v1.0.0`, without `node_modules` (`npm ci` fetches those) |
| `LittleLog-v1.0.0.bundle` | the whole git history up to this version, with the tag: `git clone LittleLog-v1.0.0.bundle little-log` makes a working copy without GitHub |
| `LittleLog-v1.0.0-android-debug.apk` | the Android app, ready to install (§2) |
| `LittleLog-v1.0.0-demo.html` | the demo (§1) |
| `android-debug.keystore` | the debug key the `.apk` is signed with |
| `SHA256SUMS.txt` | a checksum of each file |

1. Unzip it and check that nothing has changed: `sha256sum -c SHA256SUMS.txt` (on a Mac, `shasum -a 256 -c SHA256SUMS.txt`). Every
   line should say OK.
2. Install the `.apk` (§2), open the demo in a browser, or unzip the source (or clone the bundle) and build it (§5).
3. To build an `.apk` that installs over one from this backup, first put `android-debug.keystore` on the build computer as
   `~/.android/debug.keystore`, after saving the one already there.

**A backup holds the app, not anyone's logs.** Logs stay on the phones and, end-to-end encrypted, in your Supabase project. Going back
to an older version of the app doesn't touch them. When a later version changes `supabase/schema.sql`, its row in *Saved versions*
says what going back needs.
