# Security

How Little Log keeps a family's log private, what was reviewed in October 2026 (version 1.13.0), what was found, what was changed
and what is still open. The setup side (dashboard settings, secrets, roles) is in [SETUP.md](SETUP.md); the tests that enforce the
rules are in [TESTING.md](TESTING.md).

## Reporting a vulnerability
Please open a **private security advisory** on the GitHub repository (Security → Advisories → Report a vulnerability) rather than a
public issue, and say which version and platform. Reports of language problems and opt-in crash reports from the app go to the
maintainers by email through the Edge Functions; the address is a server secret and is not published anywhere.

## The model in short
* **Keys.** Each phone has a P-256 key pair in the iOS Keychain / Android Keystore (`whenUnlockedThisDeviceOnly`, no iCloud sync).
  Each family log has a random 256-bit main key and a separate health key. The server holds them only wrapped to approved phones
  (`key_grants`, ECIES) and to a recovery key pair whose private half is sealed under the 160-bit recovery code.
* **Data.** Entries, the children's profile, people's contact details, the family tree and pictures are AES-256-GCM ciphertext whose
  associated data binds the log, the entry id, the key epoch and the key class; the author and the edit time are sealed inside and
  checked against the server's copy when decrypting, so rearranged, re-classed or back-dated ciphertext is rejected.
* **Trust in a phone.** A phone's public key is trusted through the QR secret of an invite (an HMAC proof on joining, and an HMAC over
  the first key grant), through a MAC chain under the previous main key when keys change, and through a main-key tag that gates which
  phones a key rotation is re-wrapped to. Joining a log needs a single-use invite that expires in two hours **and** a parent's approval.
* **Server.** Clients can only read `babies`, their own `members` row and `events` (health rows only with the permission); every write
  goes through `security definer` functions that check the role and the permission, cap sizes, keep the health key exactly with the
  people allowed to see health notes, and require a session that passed two-step verification (TOTP, `aal2`) for parents. Everything
  else is revoked. The server knowingly sees emails, display names, roles and permissions, public keys, who wrote what and when, how
  many entries and how big, and whether an entry is a health one.
* **Phone.** The decrypted log is in the app's private storage behind the app lock (the phone's lock or a PIN kept as a salted hash);
  Android excludes it from backups. Signing out, being removed and deleting the account clear it (from 1.13.0 the decrypted pictures,
  the hourly backup copy and quarantined copies too).
* **Reports.** Language reports and crash reports go to Edge Functions that only email them on, under a database-backed limit (5 an
  hour from one sender, 200 a day in all), with the sender hashed under a secret salt and nothing about who sent them in the email.
  Crash reports are off until turned on, go without the sign-in, and blank anything that looks like an address, a web address or a
  quoted value before leaving the phone (and again on the server).
* **Code.** The web layer has a strict Content-Security-Policy (`script-src 'self'`, no inline or evaluated scripts; the lint forbids
  `eval`), every string shown is escaped through one helper, and the only key that has ever been committed is the public anon key.
* **The family folder** (the store build; [FOLDER.md](FOLDER.md)). With no server, the same sealed documents live as files in a folder
  in the family's own cloud. The cloud's sharing is the floor: anyone the folder is shared with can read every sealed file, and only
  the keys decide what opens; roles and permissions are applied by the apps rather than enforced by a server. First keys still need a
  parent's spoken security-code check, a key change still needs a key holder's signature, and the health key still goes only to the
  phones allowed health notes. There is no activity log yet. The cloud sees file names, sizes and who wrote what, nothing else.

## The review
A static review of the whole code base in October 2026 by the people building it, plus an independent second reading of the schema,
the encryption, sign-in, sync, media, the app lock, cloud backups, the account flows, the report functions and the native settings.
No live project was attacked and no real phones were used: the findings come from reading the code and from the automated tests
(which run the real schema on a real Postgres and the real app in Chromium with a simulated native layer).

### Findings and what was done

| # | Severity | What | Status |
|---|---|---|---|
| 1 | High | `delete_my_account()` only checked for a signed-in session, not for two-step verification, so a parent session obtained with just an email code (phished, or read off a lock screen) could delete a family's whole log by calling the function directly | **Fixed in 1.13.0**: the function refuses a session that has not passed two-step verification when the account has it set up (`Two-step verification is required`); the database tests cover it. A project from before 1.13.0 gets it by running `supabase/upgrade.sql` (SETUP.md, Upgrading an existing project) |
| 2 | Medium | `remove_device()` had the same gap: an email-code session could cut a parent's phones off (and force a key rotation that leaves them out) | **Fixed in 1.13.0** the same way. `register_device()`, `my_devices()` and `set_display_name()` still run without it, because the app calls the first two right after signing in and before the two-step check; a planted phone still needs a parent to approve it on another phone after comparing the fingerprint, which the app shows. Open: require a verified session for those too once sign-in registers the phone after the two-step check |
| 3 | Medium | Deleting an account (or a log) leaves that log's encrypted pictures and videos in storage, unreachable but present, and the deleted person's email in the activity log of other logs they asked to join | **Open.** Recommended: a service-role cleanup job that removes objects under a `baby_id` that no longer exists, and `delete_my_account()` blanking the email in other logs' activity rows. The README says what remains |
| 4 | Medium | Signing out, being removed from a log, and deleting the account cleared the log but not the decrypted pictures and videos kept beside it, the hourly backup copy of the log, or quarantined copies, so a retired helper's phone (or one handed on) kept photos and possibly a whole log | **Fixed in 1.13.0**: `Store.purge()` removes them whenever the log leaves the phone; the app suite checks it after a sign-out |
| 5 | Low | The report functions fell back to the service-role key as the hash salt when `REPORT_SALT` was not set, and the per-sender limit key trusts the (gateway-verified) token's subject and the first forwarded address | **Fixed in 1.13.0**: without `REPORT_SALT` the functions answer 503 and send nothing. Keep the gateway's JWT check on (the default); the daily cap bounds any flood |
| 6 | Low | Invite codes came from PostgreSQL's `random()`, which is not cryptographic (the rate limit, the two-hour expiry, single use and the approval step kept this impractical) | **Fixed in 1.13.0**: the code's symbols come from the random bytes of a v4 UUID |
| 7 | Low | On iOS the WebView's storage (the decrypted log and pictures) is not excluded from iCloud / iTunes backups; the Keychain items are device-only, so keys and sessions are not in a backup, but the plaintext log is | **Open**: set `NSURLIsExcludedFromBackupKey` on the WebKit storage directory in `AppDelegate`. Until then, treat an iOS backup as holding the log |
| 8 | Low | The app lock fails open when the PIN cannot be read back from secure storage (a transient Keystore error turns the lock off rather than locking the person out) | **Open, by choice** for now: the lock is a screen over data the phone's own encryption already protects. Recommended: fall back to the phone's lock when one exists |
| 9 | Low | For a member without a display name, the first part of their email address stands in as their name, which members without permission to see the family list can still see on entries and in the activity log | **Open**: use a neutral label for callers without that permission, and ask for a name when a log is created |
| 10 | Low | A crash report's error message could carry a fragment of data (a value `JSON.parse` quotes in its error, a server reply) | **Fixed in 1.13.0**: anything in quotes is blanked on the phone and again on the server, along with addresses and web addresses |
| 11 | Low | Invite links carry the QR secret in a custom-scheme URL; another app on the phone can claim that scheme, so a QR scanned with the system camera could reach it. Inside the app the code is shared without the secret, and a parent still has to approve the request | **Open, design limit** until the app has a domain for App Links / Universal Links ([MOBILE.md](MOBILE.md)) |
| 12 | Info | Entry and picture ids encode the creation time and use `Math.random()`; the server already sees the edit time, so little is learnt | Open: `crypto.getRandomValues` without the timestamp, in a later version (ids are shared between phones, so the change needs care) |
| 13 | Info | Which phones get the health key follows the server's copy of the permissions; the main key's distribution is authenticated end to end, the health key's scope is not (a dishonest server could hand the health key to a member it should not, within the documented model) | Open: keep a copy of the permissions a parent set, authenticated under the main key, and check it on rotation |
| 14 | Info | Members can read three more ciphertext columns of `babies` than the functions hand out (the recovery wrapping, the health keyring, the health check); all under keys they do not have | Open: column-level grants |
| 15 | Info | A parent of any shared log can reset the two-step verification of any member of that log, which also ends that person's sessions in their other logs; and a session that already exists lives until its token expires (keep the token lifetime short, [SETUP.md](SETUP.md)) | By design; say so in the confirmation |
| 16 | Low | Restoring a backup file skips the sanitizer that synced entries go through (the file is the person's own, under their passphrase) | Open: run the same checks on restored rows |
| 17 | Low | On the phone apps, requests made through the native HTTP bridge are not subject to the web layer's `connect-src` policy; the valuable part (`script-src 'self'`) is unaffected | Open: an origin allowlist in `Native.fetch`, or turn the native bridge off |
| 18 | Info | Pictures are re-encoded (so their metadata is stripped); videos are uploaded as they are, with whatever metadata the phone wrote | Open: strip, or warn |
| 19 | Low | There is no per-log quota on pictures and videos (entries are capped), so a helper with permission to add entries could fill the storage | Open: a counter in the storage policy, or a bucket quota |
| 20 | Info | One pending-join secret is kept at a time, so two overlapping joins (one by QR, one typed) make the second fail safe with "keys did not come from the parent" | Open: key the secret by invite |

### What the review found sound
* The ciphertext is bound to its place (log, entry, epoch, key class) and carries its author and edit time; a planted "health" entry
  under the main key is rejected; key epochs keep history readable; the recovery code is 160 bits; grants are authenticated (the QR
  secret, or the previous key's MAC chain; a missing proof counts as a wrong one); rotation is gated by the main-key tag; a substituted
  health key is refused by the health check; the recovery key is verified before a rotation.
* Server side: default deny (everything revoked, then exactly the reads and functions the app needs), read-only policies, every write a
  `security definer` function with a fixed `search_path`, row locks where races matter, monotonic key epochs, the health key going to
  exactly the people allowed, a mandatory recovery grant, protection of the last parent, hard limits on what a family member can be
  given, rate-limited single-use invites plus approval, size caps on everything, clamped clocks, an append-only activity log for parents
  only, a private media bucket with no update policy.
* On the phone: one escaping helper everywhere, phone numbers reduced to digits before dialling, no `eval` (the lint forbids it), a
  strict Content-Security-Policy, Keychain items that never leave the device, Android backups and clear-text traffic off, PKCE and a
  state check for the cloud providers' sign-in, PBKDF2 (600 000 rounds for backups, 100 000 for the PIN) with a slowdown after wrong
  PINs, pictures re-encoded, a captive-portal check before treating a reply as "you were removed", type checks on what the server sends.
* The report functions: anonymous by design, strict allow-lists and size caps, plain-text emails built from checked fields only, the
  destination never echoed, the limits in the database and callable by the service role only.

## Deployment checklist
These depend on the project, not on the code; the tests cannot see them.
- [ ] Supabase Auth: TOTP on; email codes of 8 digits that expire in 10 minutes; CAPTCHA on; access tokens of 15 minutes with refresh
      token rotation; your own SMTP with SPF and DKIM; the default rate limits left in place ([SETUP.md](SETUP.md) §1).
- [ ] `schema.sql` run as `postgres` on a fresh project, and `supabase/upgrade.sql` after every app update that changes the database (the app
      tells a parent when); after adding any function of your own, re-run the `revoke` block,
      because Supabase grants `execute` on new functions to `anon` and `authenticated` by default.
- [ ] Edge Functions deployed with the gateway's JWT check on; `REPORT_SALT`, `REPORT_TO`, `REPORT_FROM` and `RESEND_API_KEY` set as
      secrets, the Resend key limited to sending; the service-role key never leaves Supabase.
- [ ] Storage: the `media` bucket private (the schema forces it); a cleanup job for objects whose log no longer exists (finding 3).
- [ ] Database backups and point-in-time recovery hold emails, display names and the activity log in clear beside the ciphertext: set
      their retention accordingly.
- [ ] The Supabase dashboard account behind two-step verification: whoever can use it can read the metadata and, for someone who joins
      with a typed code and never compares the security code, could substitute keys.
- [ ] Store builds: WebView debugging and logging off, navigation not widened, signing keys outside the repository; on iOS, the backup
      exclusion of finding 7.
- [ ] People: the recovery code is the only way back after every phone is lost; someone who joins with a typed code should compare the
      security code (the app keeps reminding them until they do).
