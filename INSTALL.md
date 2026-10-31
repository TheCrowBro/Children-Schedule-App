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
| 1.5.2 | `v1.5.2` | 26 October 2026 | Brazilian Portuguese, named so: More → Language says Português (Brasil), the app is tagged pt-BR (a phone set to European Portuguese gets it too), and Brazil is a region of its own in More → Where you are, chosen by itself in a Brazilian time zone: its formulas first, 192 (SAMU) as the Guide's emergency number, A4 reports, school at 6 and a jacaranda family tree. Nothing changes in the data or on the server. |
| 1.5.3 | `v1.5.3` | 27 October 2026 | Play and activities in the Guide: the toys that suit each age (newborn to teenager, kinds not brands, with what to watch for), shown for each child's age and the next one, and Learning to swim (when lessons can begin, what to look for, water safety). From a child's first birthday the Day page says it is a good time to begin swim lessons, until closed. Nothing changes in the data or on the server. |
| 1.5.4 | `v1.5.4` | 27 October 2026 | The app lock can be a PIN: More → App lock offers Off, Face ID / fingerprint (the phone's own lock, on by default when the phone has one) or a PIN of 4 to 8 digits chosen in the app, kept only as a salted hash in the Keychain / Keystore, with Face ID / fingerprint as an optional shortcut; five wrong PINs start a wait that doubles. Nothing changes in the data or on the server. |
| 1.6.0 | `v1.6.0` | 27 October 2026 | The fix list: edge to edge on Android 15 (nothing cut off at the bottom of any page), the More page and Security and sharing as twirl-downs, Stats for 3 months, 6 months and a year with every chart in its own small twirl-down and a Height & weight card, ml or fl oz for milk, "Woke up" with Pain as a reason, the day of the week on the clock, nurse and hospital non-emergency lines, allergies to medicines, vaccines, stings and the environment (with the medicine form warning), puberty in the Guide, tutorial videos, the family calendar into the phone's calendar or as a calendar file, the Japanese garden and mountain paintings redone, the family as the roots of a more detailed tree, a new app icon, and emails styled like the app (paste the templates: §4). The lock screen says Little Log once. Nothing changes on the server; a phone still on 1.5.x keeps working. |
| 1.8.2 | `v1.8.2` | 28 October 2026 | On the day clock a snack's ray is dashed and a poo's is a squiggle (a nap's dashed and an estimated time's dotted, as before); the app icon's rays show the clock's kinds of line (plain, dashed, dotted, a squiggle, a zigzag, a line ending in its dot), on the icon and on the first screens. |
| 1.9.0 | `v1.9.0` | 28 October 2026 | Pictures as they grow, in a twirl-down on the Stats page: a carousel for the first year (newborn and each month birthday) and one for every birthday to eighteen, veiled until the first birthday, when the 12-month sheet says it has opened; the 12-month and first-birthday slots are one picture. A picture is an entry of its own (encrypted and synced like a big moment's pictures), so a phone still on 1.8.x simply does not show them. Nothing changes on the server. |
| 1.10.0 | `v1.10.0` | 28 October 2026 | A Bath button on the Day page for the baby years (logged as play with Bath, so every phone understands it; its own icon, a water-ripple ray in water blue on the clock); nine buttons fit three by three, eight and More beyond that. The Big moments journal on the Month page has the two pictures carousels at its top. Nothing changes on the server. |
| 1.11.0 | `v1.11.0` | 28 October 2026 | On the day clock every ray ends in a small paper disc with a mini symbol of the entry on it (a bottle, a spoon, a drop, a poo, a moon, a teddy, a bathtub…) instead of a plain dot, ringed in the entry's colour; the legend under the clock shows the same symbols. Nothing changes on the server. |
| 1.12.0 | `v1.12.0` | 28 October 2026 | In dark mode the day clock's face goes dark, with pale lines and the night palette for the entries and their symbols. More → Appearance and clock art has a setting for the end of each ray: a little symbol of the entry, or a plain dot (kept on the phone). The pictures carousels are no longer in the Big moments journal (they stay on the Stats page). Nothing changes on the server. |
| 1.13.0 | `v1.13.0` | 28 October 2026 | Before the birth (a due date as the date of birth: the countdown, the contraction timer, the hospital bag), wake windows in the banner, pumping with the milk stash, the formula prep helper, the allergen introduction tracker, a teething chart in the health record, the potty chart with a reward chart to print, the handover card (the day so far as text or a picture), opt-in crash reports through a second Edge Function (deploy `crash-report`, and `language-report` again: they share code now), and the security review (SECURITY.md) with its fixes: run the latest `schema.sql` (deleting the account and removing a phone now need a session that passed two-step verification; invite codes come from a cryptographic source), layouts for tablets and phones on their side, and the tests in GitHub Actions. Phones on older versions keep working: the new kinds of entry are simply not shown there. |
| 1.13.1 | `v1.13.1` | 28 October 2026 | The page follows the calendar: when the app comes back after being paused (overnight in the background, as phones keep it) or the day changes while it is open, the Day page moves to today and the Month page to this month, at once when the page was on today and after half an hour away even when another day had been chosen. Before, the app showed the day it was first opened on until Today was tapped, and a new entry on that page defaulted to noon of that day; the sheet now says when an entry goes on another day than today. Nothing changes on the server. |
| 1.14.0 | `v1.14.0` | 28 October 2026 | Every clock painting has a night-time version, shown in dark mode: the same scene after dark, with a moon and stars, lit windows and lanterns, headlights and lighthouse beams, moonlight on the water (the cherry blossoms, the maple bridge, the ocean, the forest, the mountains, the rose garden and the gilt classic, and the four travel scenes; the starry night is itself). The daytime paintings are unchanged, and the dark wash the clock used to lay over them is gone. The clock art chooser shows the night scenes in dark mode too. Nothing changes on the server. |
| 1.18.0 | `v1.18.0` | 29 October 2026 | More → Cloud backup has a step-by-step tutorial for registering the app with Dropbox, Google Drive and OneDrive (the redirect address, each config.js key, the rebuild), in every language; SETUP.md has the same walkthrough. A speed pass with a ten-thousand-entry log: the page's view of the log is built once and reused, so the Stats page over a year draws in under 100 ms instead of a second and the Month page in half the time; start-up marks; storage asked to persist; a speed suite with budgets (tests/perf.test.js) and PERFORMANCE.md; the lock screen keeps its message when a sync redraws it. Nothing changes on the server. |
| 1.19.0 | `v1.19.0` | 29 October 2026 | Woke up at the top asks whether the child is up for good or back to sleep soon: a pause notes a wake-up with its reason (a dashed moon on the clock) while the sleep goes on, Asleep again continues the sleep as it was, Up for good ends it at the moment they woke; the sleep check waits while they are up; the Sleep button while they are up means asleep again. Thirteen texts in all 31 languages. Nothing changes on the server. |
| 1.19.1 | `v1.19.1` | 29 October 2026 | The family tree no longer flashes when it is moved: its watercolour (17 slow SVG filters, rendered again for every tile a scroll or a redraw uncovered) is painted once into a picture kept on the phone; the birds hold still while the tree scrolls. Nothing changes on the server. |
| 1.20.0 | `v1.20.0` | 29 October 2026 | Step-families on the family tree: a parent's or a grandparent's later partner beside them with a small open heart; a grandparent's later partner as the children's step-grandparent, with their children from before (step-aunts and step-uncles) and the grandparent's children with them (half-aunts and half-uncles) drawn beyond the others, rooted to whoever's child they are; a parent's later partner as the children's step-parent, their own children on the grass as step-brothers and step-sisters; the cards say who is whose. Fifteen texts in all 31 languages. The demo's tree shows one. Nothing changes on the server. |
| 1.20.1 | `v1.20.1` | 29 October 2026 | The birds sing one at a time (a second one tapped takes over), a tap gives a bird no keyboard focus, and the birds and falling leaves animate in a layer of their own, apart from the people; the tutorial opens a twirl-down only for its step and closes it again, so the More page is left as the tour found it. Nothing changes on the server. |
| 1.21.0 | `v1.21.0` | 30 October 2026 | One file, `supabase/upgrade.sql`, brings a cloud project set up with any earlier release (1.0.0 on) to the current database: it adds or replaces only what changed, keeps every row and is safe to run again. The app asks the project which release its database is from (`schema_version()`), and when it is behind, a parent sees *The cloud project needs an update* on the Family tab and under More → App updates; a feature the project lacks (Rename, from 1.16.0) says so in the same plain words instead of showing the server's "schema cache" reply. Going back to an older app on an upgraded project is fine: nothing older is removed. |
| 1.22.0 | `v1.22.0` | 30 October 2026 | Who someone is on the family tree can be changed from Edit: *Who they are to the children* lists every place with room, grouped by side and saying whose relative they would be; choosing one moves them there (an aunt or uncle's partner and children come along to a great-aunt or great-uncle's place and back, a parent's or grandparent's parents and siblings to the other's), and the picture and their card follow. |`
| 1.23.0 | `v1.23.0` | 30 October 2026 | The family's own cloud: the log can live in a folder in a parent's own Dropbox, with no server anywhere. A parent connects Dropbox on the first screen, starts the log and shares the folder with each relative's Dropbox email from the Family tab; relatives connect their own Dropbox, ask to join and are approved on a parent's phone, with the same security-code check, roles and check boxes. Everything in the folder is end-to-end encrypted as on a server; removing someone, leaving, a lost phone, a parent's new phone and the recovery code work as before (the activity log and the QR invite stay server-only). Needs one Dropbox app registered by whoever builds the app (SETUP.md, *The family's own cloud*: Full Dropbox access); the store build is that key with no Supabase project. Design in FOLDER.md; a new suite walks three phones through a family folder's whole life against a fake Dropbox. |
| 1.23.1 | `v1.23.1` | 30 October 2026 | In a build that has both a family server and Dropbox, the first screen's *Share with family* tile and the Family tab's *Family sharing is off* card now describe the sign-in they lead to (the family's own cloud stays one tap away on the sign-in screen), as a build with only Dropbox describes the folder. No change for a build with one or the other. |
| 1.24.0 | `v1.24.0` | 30 October 2026 | Google Drive beside Dropbox as a cloud the family folder can live in: a parent connects Google Drive on the first screen, the *Little Log* folder is made in their Drive and shared with each relative's Google email; the same joining, approving, roles, removing, leaving, new-phone and recovery-code steps as with Dropbox. Drive's changes feed is the delta, a shared document is checked against the file's revision list after writing (two parents changing the family tree at once both get their change in), and a file another member owns is emptied rather than deleted. Needs a Google OAuth client registered by whoever builds the app (SETUP.md, *The family's own cloud*: the full Drive scope, test users while in Testing, Google's verification for the public). The folder suite now runs against a fake of each cloud. |
| 1.25.0 | `v1.25.0` | 30 October 2026 | The family's own cloud comes first on the first screen when config.js says so (`firstScreen: 'cloud'`; the server sign-in stays one tap away), and this build carries the publisher's Google client, so *Connect Google Drive* is offered. A lapsed cloud sign-in (Google renews it weekly while an app is in testing; a revoked app) no longer looks like a lost folder: the phone keeps the log and shows *Reconnect* on the Family tab and under More, which signs in again and carries on. |
| 1.26.0 | `v1.26.0` | 30 October 2026 | A family on a family server moves into the family's own cloud: More → *Security & account* → *Move this log to the family's own cloud*. The parent's phone syncs, fetches every picture and video with the server's keys, signs in to the cloud, ends its server session and makes the folder from what it holds: a new log with new keys, every entry (the parent's under their new identity), the tree, the pictures sent again, and the family's names for the entries of those who have not joined the folder yet; the recovery code shows. The others sign out of the server and join through their cloud; the server's copy stays until the project is deleted. The server sync now runs only with a real server session. A new suite walks a server family through the move on a fake Google Drive. |
| 1.29.0 | `v1.29.0` | 31 October 2026 | iCloud Drive prepared as a family-folder cloud for iPhones and iPads: a third backend over a folder in the Files app (the app's own plugin, `ios/App/App/FolderPlugin.swift`: picker, bookmark, coordinated reads and writes, the share sheet's Collaborate, a person id in the iCloud Keychain), no sign-in (Connect attaches at once), *Choose the shared folder…* to join, sharing by name with the join code (invitations filed under the code: `E2EE.inviteKey`), the start screen and share card saying what the Files app does; a fake of the plugin and a third folder-suite run (eight steps); FOLDER.md, SETUP.md, MOBILE.md (the plugin is written but not yet built or tried on a device). |
| 1.28.1 | `v1.28.1` | 31 October 2026 | A README.txt for the family in the folder itself, in the family's language and English: what the folder is, that it may be moved or renamed as long as its name starts with *Little Log*, and not to rename, move or delete anything inside it; written with a new folder and added to an older one by a parent's phone. Dropbox paths are addressed relative to the shared folder's namespace (the path-root header), so a member who mounts the folder inside a folder of theirs named like one of the app's (Media, Events, Keys, Join, Devices) no longer confuses that phone. Two folder tests per cloud: the folder moved (Drive) or mounted under a folder named Media (Dropbox), and the note present. |
| 1.28.0 | `v1.28.0` | 31 October 2026 | The family folder hardened: every phone has a signing key and signs what it writes; the family list, the tree, every grant, recovery.json and every entries file are believed only when a chain of approvals from the folder's creator (the root in littlelog.json) reaches the phone that signed them, with the role the file needs; sequence numbers stop an old copy from being put back; a parent's phone restores a forged family list or tree, a grant someone overwrote, forged keys (new keys of its own, naming whose phone did it) and a deleted keyring, recovery file or folder marker. A join code per person, made when the folder is shared and typed on the joining phone (*Verified*, keys proven to the joiner); the cloud's own record of who wrote a join request, with a request claiming another account marked and unapprovable; entries counted only in the writing phone's person's name unless they may edit others'; *Only my phone can share this folder* for the folder's owner; 2-step verification asked for on the cloud account. A folder from before 1.28 is signed by the first parent's phone to update. Seven new folder tests per cloud (a hostile member's phone, repair, the join code, a forged request, the sharing policy, the legacy folder); FOLDER.md and SECURITY.md updated; 27 texts in 31 languages. |
| 1.27.0 | `v1.27.0` | 30 October 2026 | The store build: no family server in config.js (the Supabase code stays in the app for later, off until a project is named), so the first screen offers only the family's own cloud. A detailed in-app tutorial for registering the app with Google Drive (the console's wizard, the two scopes pasted by hand, the iOS client type, test users, the unverified page, the weekly sign-in) and Dropbox (Full Dropbox), a *How sharing works* twirl-down for families on the first screen, the start-or-join screen and the Family tab, and the same walkthrough in SETUP.md. Names on the family tree no longer overlap: a long name goes on two lines and is fitted to its place. SECURITY.md lists what to harden next in the family folder. |
| 1.17.0 | `v1.17.0` | 29 October 2026 | The birds on the family tree sing their own songs when tapped (a few seconds of freely licensed recordings, credited under Guide → Picture and sound credits). The Cloud backup card explains, when no drive is registered in config.js, that Google Drive, Dropbox and OneDrive need the app registered with each service (SETUP.md §3), and that Save puts the encrypted file in any cloud app on the phone through the share sheet; its line on the More page counts a file backup. Nothing changes on the server. |
| 1.16.0 | `v1.16.0` | 29 October 2026 | Tap a quarter of the clock and its name and hours (Morning · 6 AM – 12 PM) are written in the clock's carrying handle, fitted to it in every language. A parent can rename anyone in the log, other parents included, from Edit: the name the family sees here; the activity log says who renamed whom. Needs the new `rename_member` function on the server: see SETUP.md, Upgrading an existing project. |
| 1.15.0 | `v1.15.0` | 28 October 2026 | The family tree reaches the parents' aunts and uncles: beside each grandparent a + adds their brothers and sisters (the children's great-aunts and great-uncles), each with a partner and children (the parents' cousins), drawn on the grandparents' row further out, with the children on the parents' row below them; tapped, their card says who they are and lets a parent add the partner and children or remove them (and everyone added through them). Sealed and shared like the rest of the tree; the phone says when the tree has no room left. Nothing changes on the server. |
| 1.8.1 | `v1.8.1` | 27 October 2026 | The sleep check follows the routine: once it knows how long a sleep at that time usually lasts, the first check comes an hour after the usual end (a nap that usually ends at 2:30 is asked about at 3:30), the notification says when they are usually up, and More → Notifications can turn that off. |
| 1.8.0 | `v1.8.0` | 27 October 2026 | Notifications: while a child is logged asleep the phone asks whether they are still asleep, with Woke up and Still asleep on the notification (after 1 to 3 hours, then every 30 minutes or an hour, up to three times), never in the do-not-disturb hours each parent sets on their phone (7 PM to 7 AM to start with; a check that falls in them is sent when they end). More → Notifications has the settings; the phone asks for permission the first time there is something to send. 31 languages updated. |
| 1.7.2 | `v1.7.2` | 27 October 2026 | The Big moments journal at the bottom of the Month page is gold and dashed, like Plan a trip and Add to the calendar above it and the big-moment cards, with a gold star; so is its Save a big moment button. |
| 1.7.1 | `v1.7.1` | 27 October 2026 | Days with a big moment are ringed and washed in gold on the calendar, like the big-moment cards and buttons. The first screen has a tour of its own that starts by itself on a new phone: what Just this phone, Share with family and Moving from another phone mean, and that Just this phone is not a one-way door (the Family tab's Share with family signs you in later, entries and all); ? restarts it. 31 languages updated. |
| 1.7.0 | `v1.7.0` | 27 October 2026 | The second fix list: a poo says whether it was hard, solid, soft or wet / runny (forms, pop-ups, list, Stats, the report, a tummy-bug note); a sleep is a nap or a night's sleep, a nap drawn dashed on the clock; the Routine page shows today's entries at once (Today so far, Also today); the drop-off at the grandparents', a babysitter's, a childminder's or a friend's offers the family's own names, and every place keeps a location; a request to join pops up on the parent's phone with Approve; the phone's Face ID / fingerprint prompt says "Just checking it's you" and one warm line; every part of the Guide is a twirl-down (not the pediatrician, the health record or Right now); the first screens look like the app (badge, painted tiles); Backspace works in the sign-in email field. 31 languages updated. |
| 1.5.5 | `v1.5.5` | 27 October 2026 | The same app, built for the family's own Supabase project (`config.js` now has its URL and public key): sign-in, family sharing and the cloud log work in this build. Nothing changes in the app itself. |

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

### The emails look like the app
Supabase → Authentication → Email Templates: paste [supabase/email/magic-link.html](supabase/email/magic-link.html) into **Magic link** (and **OTP**, if
listed separately) with the subject *Your Little Log sign-in code*, and [supabase/email/confirm-signup.html](supabase/email/confirm-signup.html) into
**Confirm sign up** with the subject *Welcome to Little Log: your code*. Both keep `{{ .Token }}` (the 8-digit code) and `{{ .Email }}`; the
templates are plain inline-styled tables in the app's colours, so every mail app shows them the same.

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
The tests start a throwaway Postgres of their own, or use the one in `PGURL`. The same suites run in GitHub Actions on every push
([`.github/workflows/tests.yml`](.github/workflows/tests.yml)). [TESTING.md](TESTING.md) says what each suite proves and
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
says what going back needs. After an app update that changed the database, run `supabase/upgrade.sql` on the project (SETUP.md,
*Upgrading an existing project*): the app tells a parent when.
