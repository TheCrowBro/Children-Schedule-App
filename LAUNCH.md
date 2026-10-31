# Getting Little Log into the stores

What stands between the repository and a phone in a stranger's hand, in order, with the waits and the costs. The code is ready:
the 24 suites pass, the family folder is hardened and signed, and the store build runs without any server of ours. What remains is
mostly accounts, keys and approvals that only the publisher can hold. Costs are as published in late 2026; check them when you pay.

## Already done in the repository

* Release signing from an upload key kept outside the repository (`android/keystore.properties` or the `LL_KEYSTORE*` environment,
  [MOBILE.md](MOBILE.md)); `npm run aab` makes the bundle the Play Console takes.
* Android: `targetSdk` 36, app data out of device backups, cleartext traffic off, WebView debugging and logging off.
* iOS: the export-compliance key in `Info.plist`, the WebView's storage kept out of backups, the permission texts, every language
  declared. The project has never been compiled: see *iOS* below.
* The privacy policy draft ([PRIVACY.md](PRIVACY.md)), the *Privacy policy* link in More once `privacyUrl` is set in `config.js`,
  the "not medical advice" line at the top of the Guide and the sources at its foot, the credits for pictures and bird songs.
* The listing text and the suggested store-form answers ([store/listing.md](store/listing.md)), the screenshots and the feature
  graphic (`store/`), remade with `node scripts/store-shots.js <demo.html>`.
* Continuous integration on every push (GitHub Actions, the lint and all the suites).

## Decide first

1. **The name.** Search both stores and a trademark register for *Little Log* before the listing goes up; a store name cannot be
   changed without a new app. The app id `app.littlelog.newborn` is also final once published (MOBILE.md, *Before your first release*).
2. **A domain and a support mailbox.** Both stores show a support email to everyone, the Google consent screen shows one to every
   person who signs in, and the European trader rules can add a postal address. Use a dedicated address on a domain you own, never a
   personal mailbox. The same domain carries the privacy policy and the home page Google's verification looks at.
   *Done: crowmade.app, registered at Cloudflare. The pages are in `site/` (`scripts/build-site.js`): the home page, the app's page
   and the privacy policy at https://crowmade.app/littlelog/privacy/, which `config.js` already carries. Still to do there: the
   mailbox support@crowmade.app (a Google Workspace user on the domain is the cleanest: it is a real Google account, so it also
   serves as the consent screen's support email), and connecting the repository to Cloudflare Pages with `site` as the output
   directory so the pages go live.*
3. **Google Drive's scope.** The app asks for the full Drive scope so a relative's phone can find the folder shared with them.
   That is a *restricted* scope: before the consent screen can leave Testing, Google verifies the app and requires a CASA Tier 2
   security assessment by an authorised lab, renewed every year. Until then only the test users listed in the Cloud console can
   sign in, and their sign-in lapses every seven days. The alternative is to rework joining around the narrower `drive.file`
   scope and Google's file picker, which needs no assessment but is a change to build and test.
4. **Which languages at launch.** The 31 translations were machine-written. Have a native speaker read the ones you launch in,
   or launch with fewer and add the rest as they are checked (`lang/README.md`).
5. **A licence**, if the repository is to be public: there is no LICENSE file. That is a legal choice, not a technical one.
6. **A clinician's read of the Guide.** The content cites the NHS, the AAP, the CDC and the WHO and sends dosing questions to the
   pediatrician, but nobody with a medical licence has read it.

## Android, in order

**Step 1. Open the Google Play developer account.** play.google.com/console: a one-off $25, identity verification (a personal
account needs an ID document and a phone number; an organisation needs a D-U-N-S number), and the support address from *Decide
first* as the contact email. Nothing else on Android can start before this exists, and the closed test below has a clock on it,
so open the account on day one.

2. **Make the upload key and the bundle.** MOBILE.md, *Android release*: the key with `keytool` outside the repository, backed up;
   `android/keystore.properties`; `npm run aab`; `jarsigner -verify` says "jar verified". Create the app in the Play Console with
   Play App Signing on.
3. **Internal testing.** Upload the bundle to the *Internal testing* track and install it on your own phones from the Play link.
   Walk [TESTING.md](TESTING.md)'s physical-device checklist here: the real Google sign-in returning into the app, two phones
   sharing one Drive folder, the app in the background, notifications, the app lock, the camera, the PDF.
4. **Closed testing, 12 testers for 14 days.** A personal developer account opened after November 2023 must run a closed test with
   at least twelve opted-in testers for fourteen continuous days before it may apply for production. Twelve installed phones that
   stay opted in, not twelve invitations. Then apply for production access and answer Google's questions about the test.
5. **The listing.** Title, descriptions, screenshots, the feature graphic and the 512-pixel icon from `store/`; category
   *Parenting*; the privacy policy address; the content rating questionnaire; the *Data safety* form; the declarations (ads: no;
   app access: everything available without a login; target audience: adults, not children; health: the log holds health
   information the user enters, nothing collected by us). The suggested answers are in `store/listing.md`; read the form's own
   definitions before ticking.
6. **Production.** Once production access is granted, promote the tested bundle; a staged rollout of a few percent for the first days
   shows crashes before everyone has them.
7. **Google Cloud, in parallel from day one** (it is the slowest wait). In the project behind `googleClientId`: finish the consent
   screen (home page and privacy policy on your domain, the support email), add an *Android* OAuth client with the package name and
   the SHA-1 of the Play app-signing key beside the existing client, then submit for verification with the Drive scope and start the
   CASA assessment, or build the `drive.file` alternative instead. Until this is through, keep every tester's Google account in the
   *Test users* list.
8. **Dropbox, if you want it in the build.** Create the app in the Dropbox App Console (*Full Dropbox*, the six permissions in
   SETUP.md), paste its key into `config.js` as `dropboxKey`, rebuild. The app may link fifty accounts in development status; after
   that there are two weeks to apply for and receive production status, or new links freeze.

## iOS, in order

1. **Apple Developer Program**, $99 a year, and a Mac with Xcode. Trader status (the European Digital Services Act) is declared in
   App Store Connect; a trader's address and contact details are shown on the store.
2. **Build the project once.** `npm run ios`, let Xcode resolve the packages, set the team and the bundle identifier, fix what the
   compiler says: `FolderPlugin.swift` and the backup exclusion in `AppDelegate` have never been compiled.
3. **Try iCloud Drive on two iPhones** (MOBILE.md, *The Files-app folder plugin*, and ICLOUD.md): the picker, *Collaborate* in the
   share sheet, the join code, entries both ways, the app in the background.
4. **TestFlight** for the testers, then the listing in App Store Connect: screenshots from `store/ios`, the *App Privacy* answers from
   `store/listing.md`, the export-compliance answer (MOBILE.md, *iOS release*), the privacy policy and support addresses. Apple's
   guideline 4.2 is strict with web-wrapper apps: the camera, Face ID, the Keychain, the share sheet, notifications and offline use
   are the case that this is an app.

## Before the first public build, on both

* The physical-device checklist in TESTING.md, on at least one low-end Android phone and one iPhone, with TalkBack and VoiceOver on
  for a few screens.
* Crash reporting is off in this build. The stores report native crashes; errors inside the web code will be invisible. Decide
  whether that is acceptable for the first months, or turn the opt-in crash reports back on by running the small server in
  `supabase/` (SETUP.md).
* Protect the default branch on GitHub, push the version tags (they are made by the release script and live only on the build
  machine until pushed), and keep the backup zip of each release somewhere other than the build machine.

## Costs and waits

| What | Cost | Wait |
|---|---|---|
| Google Play developer account | $25 once | identity check, days |
| Closed test before production (personal account) | twelve testers' time | 14 days, then Google's review |
| Google OAuth verification with the full Drive scope | CASA Tier 2, about $540 a year at the discounted lab | weeks |
| Dropbox production status | free | review after the fiftieth linked account, within two weeks |
| Apple Developer Program | $99 a year | a day or two, plus a Mac |
| App Review (Apple) | free | typically a day or two per build |

## After launch

* CASA and the OAuth verification renew yearly; Dropbox production status is permanent; the upload key must be kept for the life of
  the app.
* `versionCode` goes up with every bundle; `versionName` and the App Store version follow INSTALL.md.
* Keep PRIVACY.md true: if a version ever sends anything anywhere new, change the policy first.
