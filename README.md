# Little Log – newborn tracker

A simple, offline-first web app for tracking a newborn's day: feeds, pee/poo, sleep, night wakings,
vomit, play, health observations and medication — with a calendar and easy-to-read stats.

## Run
No build step or dependencies. Open `index.html`, or serve the folder (needed for install/offline):

    python3 -m http.server 8000

Then open it on your phone and choose **Add to Home Screen**.

## Features
- **Day view** – one-tap entry buttons, tick-box chips, time defaults to now with "5 min ago" shortcuts; tap any entry to edit/delete
- **Sleep timer** – start sleep, tap "Woke up" later
- **Month calendar** – coloured dots show what was logged each day
- **Stats (7/14/30 days)** – feeds/day and gap between feeds, wet/dirty diapers, poo colours, sleep totals and longest stretch, night wakings, vomit, play, health-note counts
- **Health checklist** – blue hands/feet, clicking joints, belly bulge, jaundice, etc.; urgent items trigger a "call your doctor" prompt
- **Backup/restore (JSON), CSV export** for sharing with a pediatrician
- **Email sign-in** (one-time code, no password), **family sync** across phones, and **QR-code invites** for partners and
  relatives (caregiver = can log, or view-only). Owner can remove people.
- **Encrypted cloud backup** to Google Drive, Dropbox, OneDrive, or iCloud Drive / Files
- Works offline; changes sync when you're back online. Without setup, all data stays on the device (localStorage)

See **[SETUP.md](SETUP.md)** to enable sign-in, sync and cloud backup.

*Not medical advice.*
