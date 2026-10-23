# Setup: sign-in, family sync and cloud backup

Little Log works with **no setup** as a private, on-device tracker (choose "Use on this device only").
To turn on email sign-in, family sharing and cloud backup, fill in `config.js` (all values are public
client IDs, not secrets). You only do this once, whoever hosts the app.

> **HTTPS is required.** Sign-in, the camera (QR scanner) and install-to-home-screen only work from an
> `https://` address (or `localhost`). Static hosts such as GitHub Pages, Netlify or Cloudflare Pages all work.

## 1. Email sign-in + family sync (Supabase, free tier)
1. Create a project at <https://supabase.com>.
2. **SQL Editor** → paste and run [`supabase/schema.sql`](supabase/schema.sql). This creates the tables and the
   row-level-security rules (only people you invite can read the log; "view only" people can't write).
3. **Authentication → Email Templates → Magic Link** (and "Confirm signup"): make sure the body contains
   `{{ .Token }}` so the email shows the 6-digit code, e.g. `Your Little Log code is {{ .Token }}`.
4. **Authentication → Providers → Email**: keep "Confirm email" on. Optional: set OTP length to 6.
5. **Authentication → URL Configuration**: set *Site URL* to where you host the app.
6. **Project Settings → API**: copy the *Project URL* and the *anon public* key into `supabaseUrl` / `supabaseKey`.
7. Supabase's built-in email sender is rate-limited (a few emails/hour). For real use, add your own SMTP under
   *Authentication → SMTP Settings* (Resend, Postmark, SES, … all have free tiers).

## 2. Cloud backup providers (optional – each is independent)
Backups are encrypted in the browser with the user's passphrase before upload. Only the providers you configure
appear as available. In each case the redirect/origin URI is the exact address where the app is hosted.

| Provider | Where | What to fill in |
|---|---|---|
| **Dropbox** | <https://www.dropbox.com/developers/apps> → *Scoped access* → *App folder*. Permissions: `files.content.write`, `files.content.read`. Add your app URL under *Redirect URIs*. | `dropboxKey` = App key |
| **Google Drive** | Google Cloud Console → *APIs & Services* → enable *Google Drive API* → *Credentials* → *OAuth client ID* → **Web application**, add your app origin under *Authorized JavaScript origins*. Add the scope `drive.appdata` on the consent screen. | `googleClientId` |
| **OneDrive** | Azure Portal → *App registrations* → New → *Single-page application* redirect URI = your app URL. API permissions: Microsoft Graph delegated `Files.ReadWrite.AppFolder`. | `msClientId` = Application (client) ID |
| **iCloud Drive** | Nothing to configure. Web apps cannot talk to iCloud directly, so "Save" opens the iOS/macOS share sheet → *Save to Files* → iCloud Drive. | – |

Dropbox and OneDrive can back up silently every day; Google Drive needs a tap (Google issues short-lived tokens
to web apps).

## 3. Tests
* `tests/e2e.js` – browser test with a fake Supabase/Dropbox (sign-in, invites, QR generate + camera scan, two-device
  sync, conflicts, viewer role, removal, encryption, Dropbox OAuth).
* `tests/rls.sh` + `tests/rls-stub.sql` – runs the real `schema.sql` on a local Postgres and tries to break the
  security rules as different users.

## Privacy notes
* Entries are stored in your Supabase project and readable only by invited members. They are **not** end-to-end
  encrypted in Supabase (that is what makes multi-parent sync simple); the cloud *backups* are.
* Sign-in tokens, and the backup passphrase if you set one, are kept in the browser's local storage on that device.
* Signing out clears the log from the device.
* Third-party code in `vendor/`: qrcode-generator (MIT) and jsQR (Apache-2.0).
