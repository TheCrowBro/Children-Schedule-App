# Setup: accounts, family sync, security and cloud backup

Little Log is a **phone app only** (iOS and Android; desktop apps later). Without any setup it works as a private,
on-device tracker ("Use on this device only"). To turn on sign-in, family sharing and cloud backup, do the steps below
once, then fill in `config.js` (all values are public client IDs, not secrets) and rebuild (`npm run sync`).

> ⚠️ The app's network access is locked down by a Content-Security-Policy that `npm run build:web` generates **from
> `config.js`**. Fill in `config.js` *before* building, or the app can't reach your Supabase project.

## 1. Supabase project (free tier is fine)
1. Create a project at <https://supabase.com>.
2. **SQL Editor** → paste and run [`supabase/schema.sql`](supabase/schema.sql) on a fresh project. This is version 3 (end-to-end
   encryption, roles, permissions, approvals, audit log); a project from the v1 or v2 file, before 1.0.0, has no upgrade path: drop its
   tables first. It also holds people's encrypted contact details (`members.details`, written only through `set_my_details`) and room
   for the larger encrypted profile (children, formula, allergies, pediatrician; 8 KB, which is why a child can have at most 12
   allergies). Its last section makes the private storage bucket `media` and its rules, for the pictures and short videos that go with
   big moments (encrypted on the phones before upload, like the entries).
   **A project that already runs the file from an earlier release runs [`supabase/upgrade.sql`](supabase/upgrade.sql) instead**,
   after each app update that changed the database: see *Upgrading an existing project* at the end. The app says when that is due.
3. **Project Settings → API**: copy the *Project URL* and *anon public* key into `supabaseUrl` / `supabaseKey`.

### Lock down sign-in (dashboard settings)
| Setting | Where | Value |
|---|---|---|
| One-time code shows in the email | Authentication → Email Templates → *Magic Link* **and** *Confirm signup* | body contains `{{ .Token }}` |
| Code lifetime | Authentication → Providers → Email → *Email OTP Expiration* | **600** seconds (10 min) |
| Code length | same page → *Email OTP Length* | **8** |
| Two-step verification | Authentication → Multi-Factor → *TOTP* | **Enabled** (enrol + verify) |
| Bot protection | Authentication → Attack Protection → *Enable CAPTCHA protection* → **Cloudflare Turnstile** | add the *secret* here; put the *site key* in `config.js` → `captchaSiteKey`. In Cloudflare, add `localhost` to the widget's allowed hostnames (the app runs from `localhost` inside the phone). |
| Short-lived access tokens | Project Settings → Auth → JWT expiry | **900** seconds. "Sign out everywhere" ends refresh tokens at once, but an access token already issued keeps working until it expires. |
| Refresh-token rotation | Authentication → Sessions | leave **on** |
| Sending email | Authentication → SMTP Settings | your own provider (Resend, Postmark, SES…) with SPF/DKIM/DMARC set up; the built-in sender is heavily rate-limited |
| Rate limits | Authentication → Rate Limits | keep the defaults or lower them |

Parents *must* use two-step verification: the database gives a parent no access at all without an MFA session, so even a
stolen email code isn't enough. Everyone else can opt in from More → Security.
**Lost authenticator?** Another parent can reset it (Family tab → person → *Reset two-step verification*). If the only
parent loses it, remove their factor in Supabase → Authentication → Users.

## 2. Who can do what
Parents are admins. Everyone else gets a role plus check boxes that the parents control per person (and can change later):

| | Parent | Family member | Caregiver / Babysitter / Medical assistant / Friend |
|---|---|---|---|
| Add entries | ✅ | ✅ | ☑️ choose |
| Edit / delete their **own** entries | ✅ | ✅ | ☑️ choose |
| Edit / delete **others'** entries | ✅ | ❌ never | ☑️ choose |
| See health notes & medications | ✅ | ☑️ choose | ☑️ choose |
| See who else has access (emails, roles) | ✅ | ☑️ choose | ☑️ choose |
| Change the children's names, birthdays, colours and allergies | ✅ | ❌ never | ☑️ choose |
| Invite, approve, change or remove people; see the **activity log** | ✅ | ❌ | ❌ |
| **Retire** a caregiver, babysitter, medical assistant or friend (their access ends; a note of them stays) | ✅ | ❌ | ❌ |
| See the children's **family tree** | ✅ | ✅ | ❌ never |
| Add, change or remove people on the family tree | ✅ | ❌ | ❌ |

These are enforced **in the database** (see `schema.sql`), not just hidden in the app: a modified app is refused and the
phone is put back to the server's version. Joining takes an invite (valid **2 hours**, one use, rescindable) **and** a parent's approval.
The activity log (who added / edited / deleted what, who joined / left, role changes) can't be edited by anyone and is visible to parents only.
Relatives (parents and family members) are never retired; retiring a helper is removing them plus a note in the `retired` table (name, role,
dates, reason, and their contact details as they were, still encrypted), which the people who may see the family list can read and a parent
can delete. Deleting an account deletes the notes about that person too.
The children's family tree is one row per log in the `trees` table: a blob sealed on a parent's phone with the log's keys (names
included), handed by `get_tree` only to parents and family members and written by `set_tree` only by parents, with the current keys.
The activity log records *that* something happened, never the contents of entries (nor who is on the family tree).

## 3. Cloud backup providers (optional; each is independent)
Backups are encrypted on the phone with the user's passphrase (12+ characters, PBKDF2 600,000 rounds, AES-GCM) before
upload. Only configured providers appear; with none configured, the Cloud backup card says so and offers **Save**, which puts the
encrypted file in any cloud app on the phone through the share sheet. Redirect URIs and client types for the **phone app** are in [MOBILE.md](MOBILE.md).

| Provider | Create | `config.js` key |
|---|---|---|
| Dropbox | App folder app; permissions `files.content.write/read` | `dropboxKey` |
| Google Drive | OAuth client of type **iOS** (bundle id = app id), Drive API enabled, scope `drive.appdata` | `googleClientId` |
| OneDrive | Azure app registration, *Mobile and desktop* platform, Graph `Files.ReadWrite.AppFolder` | `msClientId` |
| iCloud Drive | nothing to configure: "Save" opens the share sheet → *Save to Files* | – |

The app itself has these steps too: More → Cloud backup → *How to set up Google Drive, Dropbox or OneDrive*. Each is done once,
on a computer, by whoever builds the app. The app id is `app.littlelog.newborn` unless you changed it (MOBILE.md), and its redirect
address is `app.littlelog.newborn://oauth`.

**Dropbox** → `dropboxKey`
1. Go to <https://www.dropbox.com/developers/apps> and choose **Create app**: *Scoped access*, *App folder*, any name (people see it when they sign in).
2. **Permissions**: tick `files.content.write` and `files.content.read`, then *Submit*.
3. **Settings** → *OAuth 2* → *Redirect URIs*: add `app.littlelog.newborn://oauth`.
4. Copy the **App key** into `config.js` as `dropboxKey`.

**Google Drive** → `googleClientId`
1. In the [Google Cloud console](https://console.cloud.google.com) create a project and turn on the **Google Drive API** (*APIs & Services → Library*).
2. *APIs & Services → OAuth consent screen*: **External**, the app's name and your email; add the scope `…/auth/drive.appdata`; add yourself (and the
   other parent) as **test users**. While the app is unpublished only test users can sign in; publishing a personal app is a short form.
3. *Credentials → Create credentials → OAuth client ID*, type **iOS**, bundle id = the app id. No client secret is needed.
4. Copy the client ID (it ends in `.apps.googleusercontent.com`) into `config.js` as `googleClientId`. `npm run sync` registers its
   reverse-client-id redirect scheme in the app for you.

**OneDrive** → `msClientId`
1. In the [Azure portal](https://portal.azure.com) go to *Microsoft Entra ID → App registrations → New registration*: any name; *Accounts in any
   organizational directory and personal Microsoft accounts*.
2. *Authentication → Add a platform → Mobile and desktop applications*: custom redirect URI `app.littlelog.newborn://oauth`; under *Advanced settings*
   allow public client flows.
3. *API permissions → Add a permission → Microsoft Graph → Delegated*: `Files.ReadWrite.AppFolder` and `offline_access`.
4. Copy the **Application (client) ID** into `config.js` as `msClientId`.

Then `npm run sync` and run the app from Android Studio or Xcode. On the phone, More → Cloud backup shows **Connect** for each service you set up;
signing in opens in the browser and returns to the app. **iCloud Drive** needs nothing: *Save* opens the share sheet → *Save to Files*.

## 4. Tests
```bash
npm test          # database rules + end-to-end (needs postgres, playwright + chromium, ffmpeg)
```
* `tests/db.test.js` runs the real `schema.sql` on a throwaway Postgres and tries to break every rule as different people
  (strangers, each role, parents with/without MFA, tampering, invite guessing, account deletion).
* `tests/e2e.test.js` runs the real built app (with its real CSP) against a shim that executes the same SQL, including
  real TOTP: sign-in, CAPTCHA, MFA, invites, QR scan with a fake camera, approvals, every permission, the audit log,
  app lock, secure-storage, backups, account deletion, sign-out-everywhere.

## 5. End-to-end encryption: what it protects, and what it doesn't

**The server can't read the baby's data.** The baby's name and birthday, and every entry's type, time, contents and notes, are encrypted
on the phones (AES-256-GCM) before they are uploaded. Supabase, its staff, and anyone who breaches your database see only ciphertext.
Cloud *backups* are separately encrypted with your passphrase.

**How the keys work** (see the top of `e2ee.js` for the full design)
* Each log has a **main key** and a separate **health key**. The health key (health notes and medication) goes only to people allowed
  to see health notes; without it that data is mathematically unreadable to them, on top of the database refusing to send it.
* Each phone has its own key pair, kept in the Keychain / Keystore. The log's keys are stored on the server only as copies **wrapped to
  each approved phone**; the server cannot open them.
* **Joining:** a QR invite carries a secret the server never sees. It lets the joiner prove their phone's key and lets the parent
  authenticate the keys they hand back, so a malicious server cannot swap in its own. If someone types the code instead of scanning,
  the parent compares a security code with them before approving. A "log security code" in the Family tab lets everyone confirm they share the same keys.
* **New phone for an existing person:** it shows a security code; a parent (or their other phone) compares it and approves it. Nobody
  can add a phone just by having a stolen email code: keys only come from someone who already holds them.
* **Recovery code:** shown once when the log is created, never stored anywhere. If you lose every phone, it restores your access.
  Parents can create a new one at any time (Family → Encryption).
* **Key changes:** when someone is removed or leaves, a phone is removed, or someone loses health access, a parent's phone creates new keys
  and sends them only to the remaining phones. That person's old keys can't open anything written afterwards, even with help from the server.
  Older entries stay readable through an encrypted key history.

**Protections against a dishonest server** (all covered by tests that play the attacker)
* *Substituted keys.* Anyone can wrap keys to a phone's public key, so every grant is authenticated: a QR joiner requires the inviting parent's proof (a stripped
  proof is rejected too), and a key change must carry a MAC under keys the phone already trusts, or the phone ignores it. The health key must match a fingerprint
  signed with the main key, so a made-up health key is refused.
* *Added phones.* A rotating parent only re-wraps keys to phones whose grant carries a MAC from a real key holder, so a stolen sign-in or a phone slipped in by the
  server never receives keys.
* *Rearranged or forged data.* Each ciphertext is bound to its entry, key epoch and key class: swapped, moved or mis-classed entries fail authentication. Entries
  seal their own edit time and author, so the server can't pass an old version off as new or mislabel who wrote it.
* A health note planted by someone without the health key (encrypted with the main key) is rejected by every phone.

**What the server still sees:** account emails and display names, who has which role and permission, which phones belong to whom (public keys only),
that someone wrote an entry, who, and when it was uploaded, entry counts and sizes, and whether an entry is in the private health class.
(That last flag lets the database enforce the "see health notes" permission as well; it does not say what the entry is.) The parents-only
activity log therefore says "added an entry" or "added a private (health) entry", never what it was.

**What encryption can't do**
* It can't stop a malicious server from *withholding*, deleting or replaying data. It can detect rearranged or forged entries and ignores them.
* A person who legitimately had access keeps whatever they already downloaded (and the old keys); only future data is protected.
* **Lose every phone and the recovery code and the data is gone for good.** There is no back door. That is the point.
* The local copy of the log on each phone is in the app's private storage (protected by the phone's encryption, excluded from device backups
  on Android, behind the app lock) but is not separately encrypted with a Keystore key. On iOS the WebView's storage is not yet excluded
  from iCloud / iTunes backups ([SECURITY.md](SECURITY.md), finding 7).
* Sign-in tokens, cloud tokens, the backup passphrase, the phone's private key and the log keys are in the iOS Keychain / Android Keystore.
  Signing out clears the log, the pictures kept beside it and the backup copy from the phone but leaves the keys there, so you can sign
  back in; deleting your account erases them.
* Third-party code in `vendor/`: qrcode-generator (MIT) and jsQR (Apache-2.0).

## 6. Language and crash reports (optional)
More → Language → **Report a language issue** lets anyone tell you about a wrong or clumsy translation. The report goes to a Supabase
Edge Function, [`supabase/functions/language-report`](supabase/functions/language-report), which emails it to you.

**Where reports go is kept secret.** The address is never in the app or in this repository. It is a secret of the function, which
Supabase keeps encrypted, and nothing the function sends back mentions it.

1. Run the latest [`supabase/schema.sql`](supabase/schema.sql). It adds `report_limits` and `language_report_allow`, which only the
   function (the service role) can use.
2. Create an account with [Resend](https://resend.com), the email service the function uses.
   - Verify a domain to send from, and create an API key.
   - To try it out first, use `onboarding@resend.dev` as the sender: Resend only delivers those emails to your own Resend address.
3. Deploy the function and set its secrets with the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase functions deploy language-report --project-ref <project-ref>
   supabase secrets set --project-ref <project-ref> \
     REPORT_TO='<the address reports go to>' \
     REPORT_FROM='Little Log <reports@your-domain>' \
     RESEND_API_KEY='<your Resend API key>' \
     REPORT_SALT="$(openssl rand -hex 32)"
   ```
   You can also set the secrets in the dashboard, under Edge Functions → Secrets.

   Type the address only into the terminal or the dashboard, never into a file in this repository.

   `supabase secrets list` shows only a digest of each value.

   Keep the function's JWT check on, which is the default. The app calls the function with the project's anon key, or with the
   person's session when they are signed in.

What a report contains:

- the language;
- the screen the person picked;
- what the text says and what it should say, each up to 500 characters;
- whether it was sent from Android, iOS or the web.

**It never contains who sent it.** To limit each sender to 5 reports an hour, the function keeps a salted hash of the account (or of
the network address, when the person is not signed in). All reports together are capped at 200 a day.

### Crash reports
More → App updates → **Crash reports** is off until a person turns it on. While on, errors the app did not expect are sent to a second
Edge Function, [`supabase/functions/crash-report`](supabase/functions/crash-report), which emails them to the same address with the same
secrets. Both functions share [`supabase/functions/_shared/report.mjs`](supabase/functions/_shared/report.mjs), so deploy both:
```bash
supabase functions deploy language-report --project-ref <project-ref>
supabase functions deploy crash-report --project-ref <project-ref>
```
The database is unchanged: crash reports use the same `language_report_allow` limits (5 an hour from one sender, 200 a day in all,
shared with language reports), with the sender hashed under a different salt.

What a crash report contains: what went wrong (the error's own words, cut at 300 characters) and where in the app's own code (file, line
and column, and the first lines of the stack), the app version, the kind of phone, the language and the hour. **It never contains an
entry, a name, an address, the account or anything typed**: anything that looks like an email address or a web address is blanked on
the phone and again on the server, and the app sends it with the project's public key only, never with the person's sign-in, so the
server cannot tell whose phone it came from (the limit's hash is of the network address). At most 20 crashes wait on a phone, the same
one only once, and turning the setting off forgets them.

The button only appears when `config.js` has a Supabase project. If the function isn't deployed yet, it says the report couldn't be
sent.

## Upgrading an existing project

`schema.sql` is written for a fresh project; on one that already has the tables it stops at the first of them. After an app update
that changed the database, paste and run [`supabase/upgrade.sql`](supabase/upgrade.sql) in the SQL editor instead. It only adds or
replaces what changed since 1.0.0, keeps every row, and is safe to run again (on a project that is already current it changes
nothing). Whatever release the project was set up with, the one file brings it to the current one; going back to an older app
afterwards is fine too, since nothing older is removed.

**The app tells you when it is due.** After sign-in it asks the project which release its database is from (`schema_version()`), and
when that is behind the release the app was built for, a parent sees **The cloud project needs an update** at the top of the Family
tab and under More → App updates, with the file to run. A project from before 1.21.0 has no `schema_version()` at all, which says the
same. Until the file is run, a newer feature that needs something the project lacks stops with the same words, naming the function
(for example Rename, from 1.16.0: *The cloud project is missing rename_member: whoever set it up needs to run supabase/upgrade.sql in
its SQL editor…*), and nothing else changes. If the words are still there a minute after running it, run `notify pgrst, 'reload
schema';` (the file ends with it, but a busy API layer can take a moment to notice).

What changed, by release (the file carries all of it):

| Release | Change |
|---|---|
| 1.5.0 | the private storage bucket `media` and its rules, for the pictures and short videos that go with a big moment |
| 1.13.0 | removing a phone or deleting an account needs a session that passed two-step verification; invite codes come from cryptographic randomness (`gen_random_uuid`), not `random()` |
| 1.16.0 | `rename_member`: a parent renames anyone in the log |
| 1.21.0 | `schema_version()`, which lets the app tell when this file is due |

The database tests prove that a 1.0.0 project plus `upgrade.sql` is the same as a fresh `schema.sql` (functions, rules, grants,
tables; its entries kept) and that running it twice is harmless, so a release that changes `schema.sql` has to carry the change into
`upgrade.sql` and raise `schema_version()` too.
