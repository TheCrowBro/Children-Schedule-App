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
  **over-the-counter medicines** (a drop-down by kind: what's considered safe from what age, with US and UK ages where they differ; the
  homeopathic and herbal remedies parents mention, with what the evidence says; what never to give; no doses, which go by weight and come
  from the pediatrician), month-by-month milestones (a reminder pops up on each month birthday), and the **pediatrician's details** with a Call button.
  Six of the common worries (skin, jaundice, the belly button, the cord stump, poop and the soft spots) have **pictures**: 10 photos and 2
  drawings with what they show, kept in a twirl-down of their own inside the card that stays shut until tapped, and shuts again when the card
  closes or you leave the Guide, so nobody sees them by surprise. They're from Wikimedia Commons under free licences, credited in the app and in
  [img/guide/CREDITS.md](img/guide/CREDITS.md)
- **Travel mode**: plan a trip ahead from the Month page (always there: it leaves on the day picked) or with the "Travelling?" button at
  the bottom of today; it asks how (car, plane, train, ship) and the dates, and refuses overlapping trips. For those days the Day tab
  becomes a travel page on every phone in the log: a clock painted to match the journey, its own set of colours (checked for colour-blind
  separation and contrast like the home set), big buttons whose sheets take a tap or two, rough times ("about 15 minutes ago") kept as
  estimates and drawn dashed, a journey timer per way of travelling (time on the move lights up the clock's outer track; long drives get a
  reminder to take the baby out of the car seat), and tips for each kind of trip. Travel days stay outlined in the month view. Leaving
  and coming home play a short journey across the screen (from the house, or back to it) while the page changes under it
- **Tutorial**: a ? on every screen starts a short tour of it: a highlight box glides from button to button with a line on why it's there.
  The home screen's tour starts by itself the first time
- **Formula**: pick from a list with the usual and recent formulas on top, then a twirl-down of common formulas for each region (North
  America, Latin America, UK & Ireland, Europe, Australia & New Zealand, Asia, Middle East & Africa; where you are comes first and open),
  or type in any other.
  Each child's usual formula is filled in on bottle feeds. When every formula feed on three days running used the same one, it becomes
  that child's default and stays so until another formula is used the same way; each phone works this out from the shared log, so nobody
  has to save it. A parent can also choose it in More → Children
- **Where you are** (More): automatic from the phone's time zone, or one of the seven regions. The formula list puts its formulas first,
  and the Guide gives its emergency number (911, 999, 112, 000 / 111, or "your local emergency number"), medicine names and ages first
- **People's contact details** (phone, work, notes) that each person adds for themselves, visible to those allowed to see the family list
- **Appearance**: match the phone, light, dark, or automatic by **sunrise and sunset** (worked out from the phone's time zone, no location
  needed); switching plays a short sunset into dark or sunrise into light
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
- **32 languages**: the app follows the phone's language, or one chosen in More → Language:
  - English, Spanish, Portuguese, French, German, Italian, Dutch, Polish, Romanian, Russian, Ukrainian and Turkish;
  - Arabic, Hebrew, Persian and Urdu, laid out right to left;
  - Hindi, Bengali, Marathi, Telugu and Tamil;
  - Chinese (simplified and traditional), Japanese, Korean, Vietnamese, Thai, Indonesian and Filipino;
  - Swahili, Amharic and Hausa.

  Each language has its own plural forms, date and time formats, and first day of the week, with the phone's regional variant (UK
  English keeps UK dates). Entries are saved in one form and shown in each phone's language, so a family can use different languages
  in one log. The translations were made with the help of AI, and the Guide says so.

  **Report a language issue** (More → Language) emails a wrong or clumsy text to the maintainers without saying who sent it. Where it
  goes is a secret on the server, never in the app (see [SETUP.md](SETUP.md) §6). To translate or add a language, see
  [lang/README.md](lang/README.md).

## Build and test
```bash
npm install && npm run sync     # then npm run android / npm run ios / npm run apk
npm test                        # database rules + end-to-end tests
```
- **[SETUP.md](SETUP.md)**: Supabase, sign-in hardening, roles and permissions, cloud providers, privacy notes
- **[TESTING.md](TESTING.md)**: what the automated tests prove, what they can't, and the physical-device release checklist
- **[MOBILE.md](MOBILE.md)**: building and releasing the Android and iOS apps, store checklist
- **[lang/README.md](lang/README.md)**: translating, checking the catalogues and adding a language

*Not medical advice.*
