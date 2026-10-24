# Little Log – newborn tracker

A **phone app** (Android and iOS; Windows and Mac later) for tracking a newborn's day: feeds, pee/poo, sleep, night wakings,
vomit, play, health observations and medication, with a calendar and easy-to-read stats. Built with plain web code wrapped by Capacitor.

## Features
- **Day view**: one-tap entry buttons, tick-box chips, time defaults to now with "5 min ago" shortcuts; tap an entry to edit/delete
- **More than one child**: up to 8 children in one shared log. Each has a page of their own with their own colour (blues for boys, reds for girls, a different shade for each; parents can change any colour), an "All" view, and entries can be logged for several children at once. Names, colours and which child an entry belongs to are end-to-end encrypted like everything else
- **Watercolour look**: soft washes in the open child's colour and hand-painted style icons, with dark outlines and text kept at readable contrast (light and dark mode)
- **Day clock**: a French carriage clock (a frame of thin soft-gold lines, a painted panel, a white face
  with a black rim, Roman numerals, a moon at midnight and a sun at noon, a blued spade hand at the current time). A **24 h / 12 h** switch: the 12-hour face shows the morning or the afternoon half (AM / PM) with all
  twelve numerals and an hour and a minute hand. Every entry is a ray from the centre to the hour it happened, coloured by group, with a tappable dot; tap a quarter of
  the dial to list just those hours. **Clock art**: eight watercolour paintings to choose from per child (cherry blossoms, Japanese maple, ocean,
  forest, mountains, rose garden, starry night, gilt classic), drawn in the app and kept on the phone. Details sit below in twirl-down groups (feeding, diapers, sleep, vomit, play, health & meds)
- **Month view** with a day's counts at a glance (and the entries in a twirl-down); **stats** with a chart for every section
- **Guide tab**: common newborn worries (blue hands, belly bulge, clicking hips, jaundice, cord, spit-up, poop colours, fever…) with when to call,
  month-by-month milestones (a reminder pops up on each month birthday), and the **pediatrician's details** with a Call button
- **Formula**: each child's usual formula, filled in on bottle feeds
- **People's contact details** (phone, work, notes) that each person adds for themselves, visible to those allowed to see the family list
- **Sleep timer**, **month calendar** with coloured dots, **stats** (7/14/30 days)
- **Health checklist** (blue hands/feet, clicking hips, belly bulge, jaundice…) with "call your doctor" prompts
- **Family sharing with roles**: *Parents* (admins), *Family members*, *Caregivers*, *Babysitters* and *Friends*; per-person check boxes for exactly what
  they can do. Joining needs a QR invite (2 hours, one use, rescindable) **and a parent's approval**. Parents get a private **activity log** of who did what.
- **Locked-down accounts**: email one-time code + security check (CAPTCHA), **two-step verification** (required for parents), Face ID / fingerprint
  **app lock**, secrets in the **Keychain / Keystore**, "sign out everywhere", in-app account deletion
- **End-to-end encryption**: the server can't read the baby's name, entries, notes or health data. Phones hold the keys (Keychain / Keystore); a recovery code
  protects against losing every phone; keys change automatically when someone leaves or loses a phone
- **Encrypted cloud backup** to Google Drive, Dropbox, OneDrive, or iCloud Drive / Files
- Works offline; changes sync when you're back online

## Build and test
```bash
npm install && npm run sync     # then npm run android / npm run ios / npm run apk
npm test                        # database rules + end-to-end tests
```
- **[SETUP.md](SETUP.md)**: Supabase, sign-in hardening, roles and permissions, cloud providers, privacy notes
- **[TESTING.md](TESTING.md)**: what the automated tests prove, what they can't, and the physical-device release checklist
- **[MOBILE.md](MOBILE.md)**: building and releasing the Android and iOS apps, store checklist

*Not medical advice.*
