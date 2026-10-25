# Little Log – newborn tracker

A **phone app** (Android and iOS; Windows and Mac later) for tracking a newborn's day: feeds, pee/poo, sleep, night wakings,
vomit, play, health observations and medication, with a calendar and easy-to-read stats. Built with plain web code wrapped by Capacitor.

## Features
- **Day view**: one-tap entry buttons, tick-box chips, time defaults to now with "5 min ago" shortcuts; tap an entry to edit/delete
- **More than one child**: up to 8 children in one shared log. Each has a page of their own with their own colour (blues for boys, reds for girls, a different shade for each; parents can change any colour), an "All" view, and entries can be logged for several children at once. Names, colours and which child an entry belongs to are end-to-end encrypted like everything else
- **Watercolour look**: soft washes in the open child's colour and hand-painted style icons, with dark outlines and text kept at readable contrast (light and dark mode)
- **Day clock**: a French carriage clock (a frame of thin soft-gold lines, a painted panel, a white face
  with a black rim, Roman numerals, a moon at midnight and a sun at noon, a blued spade hand at the current time). A **24 h / 12 h** switch: the 12-hour face shows the morning or the afternoon half (AM / PM) with all
  twelve numerals and an hour and a minute hand. A **XII / 123** switch beside it swaps the Roman numerals for plain, easy-to-read
  numbers (kept on the phone). Every entry is a ray from the centre to the hour it happened, coloured by group, with a dot: tapping a dot
  shows that entry's details (editing stays in the list below, where "Show in the list" takes you); tap a quarter of
  the dial to list just those hours. **Clock art**: eight watercolour paintings to choose from per child (cherry blossoms, Japanese maple, ocean,
  forest, mountains, rose garden, starry night, gilt classic), drawn in the app and kept on the phone. Details sit below in twirl-down groups (feeding, diapers, sleep, vomit, play, health & meds)
- **Month view** with a day's counts at a glance (and the entries in a twirl-down); **stats** with a chart for every section
- **Routine** tab: the times of day that keep coming back, laid out like a day in a calendar from morning to night (morning, afternoon,
  evening, then the night, which counts with the evening before it: the routine's day runs from 6 AM to 6 AM) with a line at the time now. A feed, a meal of solid food, a nap, a kind of play or a medicine that happened within 45 minutes of the same time
  on most of the last 7 days (and on at least 3) is part of the routine, with what it usually is (how long, how much, which medicine and
  dose). Nothing is set by hand and nothing is stored: it's worked out from the log every time, so it moves when the baby's day does.
  Today's times are ticked off as they're logged, and the next one is shown on top. Diapers, night wakings, vomiting and health notes are
  left out: they don't keep to a clock
- **Report for the doctor** (Stats → PDF): a clean PDF to hand over or email: the child's age, allergies, pediatrician and usual
  formula, the parents' questions for the doctor, then the last 7, 14, 30 or 90 days at a glance (feeds, diapers, sleep, night wakings,
  vomiting, the highest temperature, symptoms, medicines, foods tried), day by day, health notes and medicines, and optionally every
  entry. It's made on the phone (nothing is uploaded), in the app's language (right to left for Arabic, Hebrew, Persian and Urdu), on A4
  or US Letter by where you are
- **Solid foods**: in the month a child turns 6 months old, a sheet says it's time, with the signs a baby is ready, how to start, the key
  allergens to give early and often, what not to give yet, and when to call for help (it shows once, and not if solids are already in
  the log; the Guide keeps it under Food). Feed → **Solids** has a twirl-down of common first foods by group (key allergens first and
  open, then grains, vegetables, fruit, and meat, fish and beans), each food that is or contains a common allergen marked "key
  allergen", or type in any other food, plus how much was eaten. Meals have a routine time of their own
- **Allergies**: a parent marks a food the child reacted to, with the date of the first reaction and what happened (More → Children, or
  "Mark an allergy" on a meal tapped on the clock, which fills in its foods and date). It's kept in the child's profile, end-to-end
  encrypted, and seen by everyone sharing the log: the first date is marked on the calendar like a trip, the Day tab shows the child's
  allergies at the top, the foods list flags them, logging one warns straight away, and the doctor's report lists them
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
- **Family sharing with roles**: *Parents* (admins), *Family members*, *Caregivers*, *Babysitters*, *Medical assistants* and *Friends*; per-person check boxes for exactly what
  they can do. Joining needs a QR invite (2 hours, one use, rescindable) **and a parent's approval**. Parents get a private **activity log** of who did what.
- **Family tree** (Family tab): for someone in more than one family, such as a parent who also looks after a sister's children and now
  and then a brother-in-law's. It's drawn as a picture of a tree that grows as people join: you at the foot of the trunk, your own
  family as its crown, and each relative's family on a branch of its own, with its grown-ups and children as round leaves (the
  children in their own colours). The trunk gets taller and thicker as the family grows, and whoever is new since the phone last
  showed it sprouts in. Tap a person for their details, a child for their day (in their family), or a family to switch to it. Below
  it, the twirl-down **Families and relatives**, where the family list was, lists your relatives' families (the ones you're a parent
  or family member in): yours, and the others named after their parents ("Sarah's family"), each with its children, its relatives
  ("Family: Sarah and Ben", or everyone in the family shown, to tap) and your role there. Families you look after as a caregiver, babysitter, medical assistant or friend are listed apart, under **Families you help
  with** (named after the children when you may not see who the parents are). **Add a family** scans an invite from one of its parents,
  who approves it; your request waits under the tree until then. Requests to join any family you're a parent in wait in the families
  list (it opens by itself for a new one), to approve without leaving the family you're looking at. Switch with **Open**, or
  from the family's name at the top of every screen: each family is kept whole on the phone, so switching is instant, works offline
  and loses nothing (a change made offline goes when that family is next open, and the families list says it's waiting). Leaving a family, or
  being removed from it, takes it off the phone; signing out clears them all, after a warning if anything hasn't synced
- **Caregivers and helpers**: in the family shown, its family (parents and family members) and its caregivers, babysitters, medical
  assistants and friends are two lists; tap anyone for their details (phone with a Call button, work, notes). A parent can **Retire** a
  helper who moved away, stopped, or died: their access ends at once (as if removed, and the log changes its keys), but they stay on a
  **Retired** list with their role, dates, the reason and their details (still end-to-end encrypted), and their past entries still say
  who added them. To have them back, invite them again; a parent can also delete the note
- **Locked-down accounts**: email one-time code + security check (CAPTCHA), **two-step verification** (required for parents), Face ID / fingerprint
  **app lock**, secrets in the **Keychain / Keystore**, "sign out everywhere", in-app account deletion
- **End-to-end encryption**: the server can't read the baby's name, entries, notes or health data. Phones hold the keys (Keychain / Keystore); a recovery code
  protects against losing every phone; keys change automatically when someone leaves or loses a phone
- **Encrypted cloud backup** to Google Drive, Dropbox, OneDrive, or iCloud Drive / Files
- Works offline; changes sync when you're back online
- **Update app** (More): opens Little Log's page in the App Store or Google Play, where an update is one tap, and shows the version
  that's installed
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
