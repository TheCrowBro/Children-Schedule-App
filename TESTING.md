# Testing

## What is automated (`npm test`)
| Suite | What it proves | How |
|---|---|---|
| `npm run lint` | no undefined names, `eval`, loose comparisons | ESLint |
| `tests/db.test.js` | every database rule: roles, permissions, MFA gating, invites/approvals, key grants, rotation, recovery, validation, deletion | the real `schema.sql` on a throwaway Postgres, acting as different people |
| `tests/e2e.test.js` | the real built app, end to end: sign-in, CAPTCHA, MFA, QR scan, approvals, every permission, key changes, tamper attempts (swapped/planted/forged), recovery, app lock, backups, account deletion, plus a search of **every** database table for plaintext | real app + real CSP in Chromium with a fake native layer, against the real SQL |
| `tests/robust.test.js` | hostile text can't inject markup; three phones doing random things (offline, server errors, restarts, concurrent edits and deletes) always converge and lose nothing; disk-full, corrupted storage, captive-portal responses, slow/fast clocks, expired tokens, double taps, 10 parallel syncs, 12,000 entries | same harness, with fault injection |
| `tests/children.test.js` | several children in one log: adding children, boy/girl colour groups and no repeated shade, parent-only colour changes that sync, per-child pages and stats, one entry for several children, two children asleep at once, removing a child, nothing readable on the server, hostile input, no emoji left, readable contrast on every child's colours | same harness |
| `tests/features.test.js` | the day clock (ray positions and colours, tap and keyboard, quarters, the thin soft-gold line frame, the white face with its black rim in light and dark mode, Roman numerals with moon and sun, the hand only on today, the painting loads; the 12-hour face with AM / PM halves, its 3-hour quarters, hour and minute hands, and the choice kept on the phone), every clock painting draws quickly, choosing clock art per page, twirl-down groups that stay open, the month day counts, a chart in every stats section drawn to scale, group colours readable in light and dark, formula (filled in, synced, never readable on the server), the Guide and its emergency line, the pediatrician (parents edit, others call), people's contact details (shown only to people allowed to see the family list, bound to their owner, size-capped, never readable on the server), the monthly milestone sheet, the Appearance setting (match phone, light, dark, sunrise & sunset; applied from the first paint after a restart), the sunset / sunrise transition and its absence with reduced motion, sunrise and sunset times against known values (New York, London, Sydney, polar night and midnight sun) | same harness |

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
- [ ] TalkBack / VoiceOver can reach the main buttons; Android back button closes sheets, then returns to Day, then exits
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
