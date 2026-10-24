# Testing

## What is automated (`npm test`)
| Suite | What it proves | How |
|---|---|---|
| `npm run lint` | no undefined names, `eval`, loose comparisons | ESLint |
| `tests/db.test.js` | every database rule: roles, permissions, MFA gating, invites/approvals, key grants, rotation, recovery, validation, deletion | the real `schema.sql` on a throwaway Postgres, acting as different people |
| `tests/e2e.test.js` | the real built app, end to end: sign-in, CAPTCHA, MFA, QR scan, approvals, every permission, key changes, tamper attempts (swapped/planted/forged), recovery, app lock, backups, account deletion, plus a search of **every** database table for plaintext | real app + real CSP in Chromium with a fake native layer, against the real SQL |
| `tests/robust.test.js` | hostile text can't inject markup; three phones doing random things (offline, server errors, restarts, concurrent edits and deletes) always converge and lose nothing; disk-full, corrupted storage, captive-portal responses, slow/fast clocks, expired tokens, double taps, 10 parallel syncs, 12,000 entries | same harness, with fault injection |
| `tests/children.test.js` | several children in one log: adding children, boy/girl colour groups and no repeated shade, parent-only colour changes that sync, per-child pages and stats, one entry for several children, two children asleep at once, removing a child, nothing readable on the server, hostile input, no emoji left, readable contrast on every child's colours | same harness |
| `tests/features.test.js` | the day clock (ray positions and colours, tap and keyboard, quarters, the thin soft-gold line frame, the white face with its black rim in light and dark mode, Roman numerals with moon and sun, or easy-to-read upright numbers instead (24-hour ones where the language writes times that way; the choice kept on the phone), the hand only on today and never in the way of a dot, the painting loads; a tapped dot shows that entry without a way to change it, with "Show in the list"; the 12-hour face with AM / PM halves, its 3-hour quarters, hour and minute hands, and the choice kept on the phone), every clock painting draws quickly, choosing clock art per page, twirl-down groups that stay open, the month day counts, a chart in every stats section drawn to scale, group colours readable in light and dark, formula (filled in, synced, never readable on the server; the list with usual and recent formulas on top, a twirl-down per region with where you are first and open, and "Other" for any name; three days running of the same formula make it the default on every phone, worked out from the feeds with the server's profile untouched; it stays through a mixed day until another formula has its own run; a parent's choice in More wins over earlier feeds), the Guide and its emergency line, the Guide's pictures (a twirl-down of their own, shut until tapped and shut again when the card closes or the Guide is left; every picture loads from the app itself at its stated size, with a description, a caption and a credit; the full credits with licence and source addresses), the pediatrician (parents edit, others call), people's contact details (shown only to people allowed to see the family list, bound to their owner, size-capped, never readable on the server), the monthly milestone sheet, the Appearance setting (match phone, light, dark, sunrise & sunset; applied from the first paint after a restart), the sunset / sunrise transition and its absence with reduced motion, sunrise and sunset times against known values (New York, London, Sydney, polar night and midnight sun), the Guide's medicines drop-down (US and UK ages, the evidence on homeopathic remedies, what never to give, no doses), "Where you are" (automatic or chosen: its formulas first, and its emergency number, medicine names and ages first in the Guide), travel mode (the button at the bottom of today, planning ahead from the calendar from the day picked (a family member can plan one, but isn't offered to change a parent's), overlapping trips refused, the trip sheet, the travel page with its painting and colours, one-tap sheets and estimated times drawn dashed, the journey on the clock's track and the 2-hour car seat reminder, shared and encrypted, "We're home", past trips in the day and month views, a trip coming up, the journey between home and away covering the page as it changes, none with reduced motion, and no "Welcome home" for a trip deleted or moved to a later date), and the tutorial (starts by itself once on a new phone before the milestone sheet, the box moves to each button, Back, Done, ? on every screen, Escape, not again after a restart, no gliding with reduced motion) | same harness |
| `tests/routine.test.js` | the routine: a time that comes back within 45 minutes on more than half of the last 7 days logged (and on at least 3) is part of it, 7:30 and 8:15 are one time but 7:30 and 8:20 are not, two days are not enough, diapers, night wakings, vomiting and health notes never are, naps, night sleep, each kind of play and each medicine have times of their own, a time can cross midnight, it follows the baby when the times move, today's times are ticked off as they are logged with what is due now and next (tomorrow's first once today's are done), the Routine tab laid out like a day in a calendar with a line at the time now, one routine per child, and its tour | same harness |
| `tests/report.test.js` | the doctor's PDF: Stats → Report for the doctor asks which days, whether to put in every entry and for questions to the doctor; the file is a real PDF that poppler reads (page count, size, title) and renders page by page; what is in it (the child, the questions, the averages, every day of the period, the health notes and medicines, every entry); US Letter in North America; right to left in Arabic with the text drawn from the right; on the phone it is written as a file and the share sheet opens; More → Update app opens Google Play on Android and the App Store on an iPhone (once its number is set) and shows the installed version | same harness, plus `pdfinfo` / `pdftoppm` |
| `tests/solids.test.js` | solid foods and allergies: the sheet in the month a child turns 6 months (not at 5 or 7, not once solids are logged, once only); Feed → Solids with the foods by group, the key allergens first and marked; a meal saved with its foods, readable only on the family's phones and synced; an allergy marked with the date of the first reaction (the earliest date kept), end-to-end encrypted in the profile, marked on the calendar and in its legend, shown on another phone, flagged in the foods and warned about when logged, marked from a meal on the clock, removed by a parent only; a sync bringing the profile while the allergy sheet is open, or while the phone saves a change, loses nothing, and a change that fails to send while offline goes with the next sync; solid meals counted apart from milk feeds (day tiles, Stats, the report); the report's allergies and foods tried; hostile allergy data cleaned up | same harness |
| `tests/languages.test.js` | every language: the English source is up to date and each catalogue is complete and correct (placeholders, bold, the language's plural forms); a pseudo-language that marks every translated text shows that no screen, sheet, tour step, toast, sign-in step or spreadsheet export has English left in it, and a check of the code finds no text that skips translation; choosing a language (all at once, kept after a restart) and "Automatic" following the phone; right to left for Arabic, Hebrew, Persian and Urdu (the tabs, arrows and colour bars mirrored); on a 320 px phone every tab name fits its tab in every language (a long one drawn a little smaller, never cut off); plural forms, dates and 24-hour times with Western digits; English when a text has no translation; **Report a language issue** (sent to the server and emailed on, the limits, no address anywhere in the app or in what it sends or receives, no real address in any published file) | same harness, with the report function's own code |

**What these cannot cover:** they run in desktop Chromium with a *simulated* Capacitor layer. They do not exercise the real WebView, the real
Keychain/Keystore plugins, the camera permission prompt, Face ID / fingerprint, deep links from the OS, the OAuth browsers (Dropbox, Google, OneDrive),
Cloudflare Turnstile inside a WebView, the iOS project (never compiled in the dev sandbox), or real network conditions. **Use the checklist below
before every release, on at least one Android phone and one iPhone** (two of each is better: several items need a second phone).

## Physical-device checklist
Use a test Supabase project and throwaway email addresses. Tick each box per platform; any failure blocks the release.

### Install & start
- [ ] Fresh install opens; no crash; icon and splash look right (light and dark)
- [ ] Camera permission text and Face ID text are shown when first needed, in plain language
- [ ] Release build (not debug): no WebView inspector available, no cleartext traffic

### Sign-in & two-step verification
- [ ] Email code arrives; the 8 digits work; wrong code shows an error; five wrong codes force a new code
- [ ] The CAPTCHA (Turnstile) appears and completes inside the app; sign-in is refused without it
- [ ] A parent is forced to set up an authenticator (Google Authenticator / Authy / 1Password); the code works; a wrong code is refused
- [ ] Phone clock set wrong by 2 minutes: authenticator codes still work or fail clearly
- [ ] Sign out, sign in again: asked for the authenticator code

### Creating a log, recovery code
- [ ] Recovery code screen can't be skipped without ticking the box; code can be copied / shared
- [ ] Kill the app on that screen: Family → Encryption warns that no recovery code was confirmed, and "Create a new recovery code" works

### Inviting & joining (needs a second phone)
- [ ] Parent creates an invite; QR is scannable in bright light and from a distance; the second phone's camera asks permission
- [ ] Deny the camera permission: the scanner explains and the typed code still works
- [ ] Scan → parent sees "Verified: they scanned your QR code" and just approves; the joiner gets in with no security-code step
- [ ] Typed code → parent must compare security codes; the codes match on both screens; approve is blocked until ticked
- [ ] The joiner sees nothing before approval; "Waiting for approval" updates by itself
- [ ] Invite expires after 2 hours; rescinding an open invite works; an invite works only once
- [ ] Opening an invite **link** (paste `app.littlelog.newborn://join?join=…` in Notes/Messages) opens the app, cold and warm

### New phone, lost phone, recovery
- [ ] Sign in on a second phone as an existing parent: asked for MFA, then "Approve this phone"; the first phone approves after comparing codes
- [ ] Remove a phone from Family → Encryption: it can no longer sync or read new entries; the log's keys change
- [ ] Brand-new phone with only the recovery code: unlocks and shows all entries; a wrong code is refused
- [ ] Remove a person: their phone returns to the start and clears the log

### Roles & permissions (each box is a role/permission pair; check both the buttons and what the server accepts)
- [ ] Family member: can edit/delete only their own entries; cannot change the baby's profile or invite
- [ ] Caregiver/Babysitter/Friend: each check box takes effect after the next sync, including removing "see health notes" (buttons and old health entries disappear)
- [ ] Parent changing someone to "see health notes": their phone now shows health entries
- [ ] Activity log (parents only) lists who did what; never shows entry contents

### Offline & interruptions
- [ ] Airplane mode: add, edit and delete entries; kill the app; reopen; turn the network on: everything syncs, nothing duplicated
- [ ] Kill the app during a sync (add 200 entries first); reopen: no loss, no duplicates
- [ ] Switch away mid-edit and return after minutes; rotate the screen; low-battery mode
- [ ] Fill the phone's storage nearly full: the app warns loudly instead of failing silently

### App lock & secure storage
- [ ] Cold start asks for Face ID / fingerprint; failure keeps it locked; "Sign out" is available on the lock screen
- [ ] Return after the chosen time away: locked; return sooner: not locked; the app switcher shows the logo, not baby data
- [ ] Phone with no screen lock set: app lock explains it can't be turned on
- [ ] Biometrics changed (new fingerprint added / Face ID reset): passcode fallback still unlocks
- [ ] **iOS:** delete and reinstall the app: Keychain items survive, so the phone can still sign in and read the log; **Android:** reinstall loses keys and needs approval/recovery code

### Cloud backup & sharing
- [ ] Dropbox, OneDrive, Google Drive: connect (browser opens and returns to the app), back up, restore; disconnect
- [ ] Save to Files / iCloud Drive via the share sheet and restore from the saved file
- [ ] Wrong backup passphrase is refused; a generated passphrase can be written down and used
- [ ] CSV / JSON exports open the share sheet

### Time, display, accessibility
- [ ] Change the phone's time zone and clock (±1 h, across midnight, DST change): entries stay sensible, nothing disappears
- [ ] Dark mode, 200% font size, small phone, large phone/tablet, landscape: nothing is cut off; sheets are not hidden by the keyboard; notch and gesture bar are respected
- [ ] More → Appearance → Match phone: with the app open, turn the phone's dark mode on and off (quick settings / Control Centre): the sunset or sunrise plays and the app follows, also after coming back from the background; with Reduce Motion on it switches without the sky
- [ ] The formula list opens under the field: usual and recent formulas on top, then a twirl-down per region with More → Where you are first and open; the buttons are easy to tap, and "Other" brings up the keyboard
- [ ] Starting a trip and tapping "We're home" play the journey smoothly, also on an older phone; with Reduce Motion (iOS) or Remove animations (Android) on, the page switches straight over
- [ ] Travel mode on a real trip (or with the phone's date changed): the travel page appears on the start date and goes back to normal after the return date; the journey timer keeps counting with the screen off; the Android back button closes the tutorial before anything else
- [ ] The tutorial with TalkBack / VoiceOver: each step is read out, and the Next / Back / Skip buttons can be reached
- [ ] Guide → a card → Pictures: the photos show at once and look sharp on the phone's screen; TalkBack / VoiceOver reads each picture's description and caption
- [ ] TalkBack / VoiceOver can reach the main buttons; Android back button closes sheets, then returns to Day, then exits
- [ ] Set the phone to Arabic (or Hebrew): the app opens right to left, with the tabs, arrows and sheets mirrored and nothing overlapping. Set it to a language with long words (German, Tamil) at 200% font size: tab names and buttons are not cut off mid-word in a way that hides their meaning
- [ ] More → Language: switching changes every screen at once and survives a restart; Automatic follows a change of the phone's language. TalkBack / VoiceOver reads the app in that language
- [ ] More → Language → Report a language issue: the email arrives at the address set on the server, with the language, screen and text, and nothing about who sent it
- [ ] Stats → Report for the doctor (PDF): the share sheet opens with the file; it saves to Files / Drive, prints, and opens in the phone's PDF viewer and in a desktop one (Acrobat, Preview) looking the same; in Arabic, Hindi, Chinese and Thai every letter is drawn (no empty boxes), right to left where it should be
- [ ] More → Update app: on Android it opens Little Log in Google Play; on an iPhone (with `appStoreId` set) it opens the App Store page; the version under it matches the installed build
- [ ] The clock's XII / 123 switch: the plain numbers are easy to read on a small phone in light and dark mode, and the choice stays after a restart; tapping a dot shows the entry without an edit button, and "Show in the list" scrolls to it
- [ ] A child whose birthday puts them at 6 months: the solid-food sheet appears once on the day it's due; Feed → Solids lists the foods with the key allergens marked; a marked allergy shows on the calendar on the day of the first reaction, at the top of the Day tab, and on the other phones in the log after they sync
- [ ] The Routine tab after a week of real use: the times it shows are the ones the family recognises, and today's are ticked off as they're logged
- [ ] A log with ~10,000 entries on an older phone: month view and stats open in under a couple of seconds

### Before submitting to a store
- [ ] Privacy policy URL live; Data safety / App Privacy forms match what the app really does
- [ ] Account deletion works from inside the app (and as the only parent, warns that the log is deleted)
- [ ] The release build is signed with the real keystore / certificate; version codes bumped

## Hardening notes

- **Storage**: the log lives in IndexedDB (`store.js`), written in coalesced batches with an hourly backup copy. A damaged copy is set aside (never deleted), the backup is restored, and with neither the log is re-downloaded. A failed write shows a loud warning.
- **Sync**: failures back off (5 s doubling to 5 min); manual actions always try. Every request has a timeout (`netTimeoutMs`, default 30 s). A captive-portal or garbage reply is treated as "offline", never as "your access was removed".
- **Clocks**: edits are ordered by a hybrid logical clock, so a slow or fast phone never makes edits vanish. The server caps edit times at its own clock + 60 s and tells the phone (`ceiling`), so a fast phone cannot pin an entry against later edits.
- **Untrusted entries**: every decrypted entry is sanitised to a fixed set of fields, types and lengths before any screen sees it.
- **Not verifiable here**: real iOS/Android hardware (Face ID, Keychain/Keystore, camera, share sheet), WebKit, real provider logins and the iOS compile. Use the device checklist above.
- `npm audit` reports one advisory (`uuid`) in a build-only dependency that does not ship in the app.
