# Setup: accounts, family sync, security and cloud backup

Little Log is a **phone app only** (iOS and Android; desktop apps later). Without any setup it works as a private,
on-device tracker ("Use on this device only"). To turn on sign-in, family sharing and cloud backup, do the steps below
once, then fill in `config.js` (all values are public client IDs, not secrets) and rebuild (`npm run sync`).

> ⚠️ The app's network access is locked down by a Content-Security-Policy that `npm run build:web` generates **from
> `config.js`**. Fill in `config.js` *before* building, or the app can't reach your Supabase project.

## 1. Supabase project (free tier is fine)
1. Create a project at <https://supabase.com>.
2. **SQL Editor** → paste and run [`supabase/schema.sql`](supabase/schema.sql). This is version 2 (roles, permissions,
   approvals, audit log). If you ran an earlier version, drop its tables first; there is no data migration.
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

| | Parent | Family member | Caregiver / Babysitter / Friend |
|---|---|---|---|
| Add entries | ✅ | ✅ | ☑️ choose |
| Edit / delete their **own** entries | ✅ | ✅ | ☑️ choose |
| Edit / delete **others'** entries | ✅ | ❌ never | ☑️ choose |
| See health notes & medications | ✅ | ☑️ choose | ☑️ choose |
| See who else has access (emails, roles) | ✅ | ☑️ choose | ☑️ choose |
| Change the baby's name / birthday | ✅ | ❌ never | ☑️ choose |
| Invite, approve, change or remove people; see the **activity log** | ✅ | ❌ | ❌ |

These are enforced **in the database** (see `schema.sql`), not just hidden in the app: a modified app is refused and the
phone is put back to the server's version. Joining takes an invite (valid **2 hours**, one use, rescindable) **and** a parent's approval.
The activity log (who added / edited / deleted what, who joined / left, role changes) can't be edited by anyone and is visible to parents only.
It records *that* something happened, never the contents of entries.

## 3. Cloud backup providers (optional; each is independent)
Backups are encrypted on the phone with the user's passphrase (12+ characters, PBKDF2 600,000 rounds, AES-GCM) before
upload. Only configured providers appear. Redirect URIs and client types for the **phone app** are in [MOBILE.md](MOBILE.md).

| Provider | Create | `config.js` key |
|---|---|---|
| Dropbox | App folder app; permissions `files.content.write/read` | `dropboxKey` |
| Google Drive | OAuth client of type **iOS** (bundle id = app id), Drive API enabled, scope `drive.appdata` | `googleClientId` |
| OneDrive | Azure app registration, *Mobile and desktop* platform, Graph `Files.ReadWrite.AppFolder` | `msClientId` |
| iCloud Drive | nothing to configure: "Save" opens the share sheet → *Save to Files* | – |

## 4. Tests
```bash
npm test          # database rules + end-to-end (needs postgres, playwright + chromium, ffmpeg)
```
* `tests/db.test.js` runs the real `schema.sql` on a throwaway Postgres and tries to break every rule as different people
  (strangers, each role, parents with/without MFA, tampering, invite guessing, account deletion).
* `tests/e2e.test.js` runs the real built app (with its real CSP) against a shim that executes the same SQL, including
  real TOTP: sign-in, CAPTCHA, MFA, invites, QR scan with a fake camera, approvals, every permission, the audit log,
  app lock, secure-storage, backups, account deletion, sign-out-everywhere.

## 5. Privacy and what is *not* protected
* Entries are stored in your Supabase project, readable only by approved members (and, for health notes, only those
  with that permission). They are **not** end-to-end encrypted in Supabase, so whoever administers the project can read them.
  Cloud *backups* are encrypted.
* Sign-in tokens, cloud tokens and the backup passphrase are in the iOS Keychain / Android Keystore. The local copy of the
  log is in the app's private storage (protected by the phone's own encryption, excluded from device backups, and behind the
  app lock), but it is not separately encrypted with a Keystore key.
* Signing out clears the log from the phone.
* Third-party code in `vendor/`: qrcode-generator (MIT) and jsQR (Apache-2.0).
