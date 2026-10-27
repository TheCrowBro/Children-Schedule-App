# Little Log – from newborn to 18

A **phone app** (Android and iOS; Windows and Mac later) that grows with a child: a newborn's feeds, pee/poo, sleep, night wakings,
vomit, play, health observations and medication; then meals, potty training and the big moments of growing up, with a calendar and
easy-to-read stats, until the child turns 18. Built with plain web code wrapped by Capacitor.
To install it, or go back to a saved version, see [INSTALL.md](INSTALL.md).

## Features
- **Day view**: one-tap entry buttons, tick-box chips, time defaults to now with "5 min ago" shortcuts; tap an entry to edit/delete
- **Growing up**: every child has a stage that comes from their age: newborn, baby, toddler (from 1), preschooler (from 3), school age
  (from the age children start school where the family is: 4 in the UK and Ireland, 5 in North America, Australia and New Zealand, 6
  elsewhere, or from the day a "First day of school" moment is saved), teenager (12) and grown up (18). The Day page's buttons follow it: a
  newborn's eight, then **Meal**, **Milk** (a cup or a bottle, cow's or plant milk) and **Potty** from a year old, and the buttons a child
  no longer needs behind **More** (anything the family has logged three times in two weeks keeps its button). The groups are named for the
  children's ages (Feeding becomes Meals, Diapers becomes Potty), the day starts "2 years 3 months", a toddler's health notes have an older
  child's symptoms (and a fever alone is no longer flagged as an emergency), and the Routine, Stats and the doctor's report count meals and
  the potty. On the month birthday a new stage starts, the milestone sheet says what changed and offers to keep the birthday as a big moment.
  From 5 the Guide leaves the baby years out (the newborn worries, the solids, the baby medicines); the month-by-month milestones go at
  6, and a 5-year-old's list keeps the preschool years. From the teenage years the Day page follows: no Feed, Diaper, Potty or Night
  waking buttons, no diapers or potty in the legends, and no formula setting. With Everyone chosen, the Guide has a card for each child
  and every key part for the ages in the family, and the Day page keeps every button while a younger child needs it
- **Meals**: breakfast, lunch, dinner or a snack (guessed from the time), the foods (from the same list as a baby's first foods, with
  allergies flagged), and how much was eaten; each meal of the day keeps its own time in the routine
- **Potty training**: pee, poo, both, nothing yet or stayed dry; on the potty, the toilet or an accident; and whether they asked to go.
  Stats show the potty and the accidents per day
- **Daycare and school** (from 3 months old; the Day page's Drop-off): where the child was dropped off (the usual place for the age,
  daycare, preschool or school, or the last one used: a childminder's, the grandparents', an after-school club, or one typed in), who
  dropped them off, and who will pick them up and when ("Grandpa picks up at 3:15 PM"). While the child is there, a banner says where
  and who is coming, and whoever picks them up taps **Picked up**: the pick-up is an entry of their own, so a grandparent who may not
  change other people's entries can log it too. The stay lights up the clock's outer track; a day can be logged afterwards in one go;
  Stats show the days there and the time there
- **The family calendar** (Month tab → Add to the calendar): exams, appointments, matches or games, lessons, school holidays and parties
  for one child or several, on a day (with a time, or all day) or over several days. The next week's are under **Coming up** on the Day
  page, their days are marked on the Month tab and listed on the day, and a school holiday gives the routine's school week a break.
  Shared and end-to-end encrypted like the rest
- **Turning 18**: on a child's 18th birthday a sheet celebrates it (once) and offers to keep it as a big moment. Their Day page then says
  Little Log's work is done, with **their book** (a PDF: every big moment in chapters for each stage of growing up, how they grew and their
  vaccines) and **their record as a file** (every entry, to keep or hand over). Logging goes on for anyone who wants it
- **Homework and activities** (the school years): homework, reading and practising, with the subject, the minutes and the pages read;
  a school child's play is an activity (sport, swimming, dance, music, games, a club). When a child reaches school age, a note on the
  Day page says what changes
- **Health record** (for every age, from the Guide, Stats or More → Children): **growth** (weight, length or height, head size, and
  BMI from 2 years) compared with the CDC growth charts: the percentile for the child's age and sex as it is typed, the latest
  measurements, and a chart of the child's own line over the 3rd, 15th, 50th, 85th and 97th percentile lines (birth to 3 years, then 2
  to 20); a number far outside the charts for the age (a typo, or the wrong units) is caught. **Vaccines** from a list or typed in, with
  the dose, where and the batch number, grouped by vaccine; **doctor visits** (checkups, unwell, the dentist, eyes, hearing, a
  specialist, hospital, urgent care) with who and why. In kg and cm, or pounds and inches (More → Units; North America by default).
  It's kept private like health notes: only people who may see health notes get it, under the health key. The doctor's report
  includes it, the health note sheet leads to it, the milestone sheet offers to save the checkup in it, and the Guide explains
  vaccines, checkups and growth chart percentiles
- **Big moments**: the firsts and the days to remember, with ideas for every age from "Born" and "First smile" to "First day of school" and
  "Passed the driving test", or in your own words, with a note. A first can be saved only once (a birthday every year), for one child or
  several. They show at the top of their day, with a star on the calendar, in the Month tab's journal (in chapters for each stage of
  growing up, with how old the child was), and on the family tree when someone taps a child. Shared and end-to-end encrypted like
  every entry
- **Pictures and videos with a big moment**: up to 4 pictures and one video of up to a minute, from the camera roll or the camera.
  Pictures are shrunk to 1600 px on the phone; everything is encrypted on the phone with the log's key before it goes to the family's
  private storage bucket, so the server sees sizes and nothing else. Thumbnails show under the moment's card and in the journal; tap one
  to see it big, step through them, and keep a copy (Save or share). A picture added offline goes up with the next sync; the other phones
  fetch thumbnails by themselves and the full picture or video when tapped, and keep what they have shown. Removing a picture or
  deleting the moment removes the files too (a moment saved for several children shares them until the last copy goes). The child's
  book prints the pictures under each moment
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
  left out: they don't keep to a clock. Daycare, school, homework, and lessons and clubs keep to the days of the week instead: they are
  worked out for each day of the week over the last 4 weeks (school at 8:30, Mon – Fri; swimming on Tuesdays), come back on those days
  only, and the other days' times are listed under the day's
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
- **Guide tab**: for teenagers, sleep, mental health (and what to do at once if they talk about hurting themselves), phones and life
  online, alcohol, vaping and drugs, relationships, sex and consent, periods, spots and acne, food, body image and sport (and a knock to
  the head), driving and growing independence come first (from 10, after the milestones, as what comes next). For school children, sleep, screens and staying safe online, homework and reading, friends and bullying, food and staying
  active, teeth, bedwetting, worries and feelings, puberty, head lice and safety out and about come first (for a preschooler, after the
  milestones, as what comes next). For toddlers and preschoolers, potty training, picky eating, tantrums, sleep, teeth and the dentist, screens and car
  seats come first; milestones go on to 30 months and 3, 4 and 5 years, and after that "Right now" says what the school or teenage years
  are about. Common newborn worries (blue hands, belly bulge, clicking hips, jaundice, cord, spit-up, poop colours, fever…) with when to call,
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
  The home screen's tour starts by itself the first time. Every part of every screen is in its tour, including what only shows up as a
  child grows (drop-off, homework, the calendar, turning 18) and the health record, which has a tour of its own
- **Easy to find the way back**: the health record (a page of its own) has a bar that stays at the top while you scroll, with a big
  "Back to Guide" (or Stats, or More) and "Today"; every sheet has a big close button in its corner that stays put while the sheet
  scrolls; and the tabs at the bottom are always there
- **Formula**: pick from a list with the usual and recent formulas on top, then a twirl-down of common formulas for each region (North
  America, Latin America, Brazil, UK & Ireland, Europe, Australia & New Zealand, Asia, Middle East & Africa; where you are comes first and
  open),
  or type in any other.
  Each child's usual formula is filled in on bottle feeds. When every formula feed on three days running used the same one, it becomes
  that child's default and stays so until another formula is used the same way; each phone works this out from the shared log, so nobody
  has to save it. A parent can also choose it in More → Children
- **Where you are** (More): automatic from the phone's time zone, or one of the eight regions. The formula list puts its formulas first,
  and the Guide gives its emergency number (911, 999, 112, 000 / 111, 192 (SAMU) in Brazil, or "your local emergency number"), medicine
  names and ages first
- **People's contact details** (phone, work, notes) that each person adds for themselves, visible to those allowed to see the family list
- **Appearance**: match the phone, light, dark, or automatic by **sunrise and sunset** (worked out from the phone's time zone, no location
  needed); switching plays a short sunset into dark or sunrise into light
- **Sleep timer**, **month calendar** with coloured dots, **stats** (7/14/30 days)
- **Health checklist** (blue hands/feet, clicking hips, belly bulge, jaundice…) with "call your doctor" prompts
- **Family sharing with roles**: *Parents* (admins), *Family members*, *Caregivers*, *Babysitters*, *Medical assistants* and *Friends*; per-person check boxes for exactly what
  they can do. Joining needs a QR invite (2 hours, one use, rescindable) **and a parent's approval**. Parents get a private **activity log** of who did what.
- **Family tree** (Family tab): the children's family tree, painted as a soft watercolour (washes with pigment edges, paper grain) of
  the tree most common where the family comes from: an English oak (UK & Ireland), a red maple (North America), a European beech, a
  silver birch, an olive tree, a eucalyptus (Australia & New Zealand), cherry blossom (East Asia), a banyan with its hanging roots
  (South Asia), a mango tree, an umbrella acacia (Africa) or a jacaranda (Latin America and Brazil), each with its own bark, crown, leaves
  and
  ground, two birds of that place on its branches and its own leaves (or petals) drifting down. It follows the app's language and the
  region in More (and the time zone), and a parent can choose another for the whole family (**Change tree**). The children sit on the grass at the foot of
  the trunk; their parents, a couple joined by a heart, where it forks; each parent's brothers and sisters (the aunts and uncles) with
  their partners beside them, and their children (the cousins) on the grass below; the grandparents grow above each parent, and the
  great-grandparents at the top of the crown, as far as it goes (an extended tree can come later). A parent adds people by tapping the
  round **+** buds where someone is missing: a name, what the children call them ("Nana", "Grandpa Joe") and, for someone who has died,
  *In loving memory* (a little star). Someone already in Little Log can be picked instead of typed, and an aunt or uncle picked from
  their own family log brings their partner and children along (as cousins, in their own colours, to open). The trunk thickens and the
  crown spreads as the family grows, and whoever is new since the phone last showed it sprouts in; the birds hop and look about and
  the leaves drift down (all of it still with *Reduce Motion*; at night there's a moon and stars). The painting is a layer of its own,
  painted once, so the little movements stay smooth. A tree wider than the screen scrolls sideways. Tap someone
  for who they are to the children and, when they share the log, their phone and work details; tap a child for their day. The tree is
  end-to-end encrypted like the rest of the log, kept by the parents (only they change it; each change is in the activity log) and
  shown only to the children's relatives (parents and family members), never to caregivers, babysitters, medical assistants or
  friends.
- **Families and relatives** (Family tab, a twirl-down where the family list was): for someone in more than one family, such as a
  parent who also looks after a sister's children and now and then a brother-in-law's. It lists your relatives' families (the ones
  you're a parent or family member in): yours, and the others named after their parents ("Sarah's family"), each with its children,
  its relatives ("Family: Sarah and Ben", or everyone in the family shown, to tap) and your role there. Families you look after as a
  caregiver, babysitter, medical assistant or friend are listed apart, under **Families you help with** (named after the children when
  you may not see who the parents are). **Add a family** (under the tree) scans an invite from one of its parents, who approves it;
  your request waits there until then. Requests to join any family you're a parent in wait in the families list (it opens by itself for
  a new one), to approve without leaving the family you're looking at. Switch with **Open**, or from the family's name at the top of
  every screen: each family is kept whole on the phone, so switching is instant, works offline and loses nothing (a change made offline
  goes when that family is next open, and the families list says it's waiting). Leaving a family, or being removed from it, takes it off
  the phone; signing out clears them all, after a warning if anything hasn't synced
- **Caregivers and helpers**: in the family shown, its family (parents and family members) and its caregivers, babysitters, medical
  assistants and friends are two lists; tap anyone for their details (phone with a Call button, work, notes). A parent can **Retire** a
  helper who moved away, stopped, or died: their access ends at once (as if removed, and the log changes its keys), but they stay on a
  **Retired** list with their role, dates, the reason and their details (still end-to-end encrypted), and their past entries still say
  who added them. To have them back, invite them again; a parent can also delete the note
- **Play and activities** (Guide): the kinds of toy that suit each age, from the first 3 months to the teenage years, with what
  children do at that age, kinds rather than brands, and what to watch for (small parts, magnets and button batteries, baby walkers,
  helmets, trampolines, screens). The Guide shows each child's age and the next one, and every age in the family with Everyone.
  **Learning to swim**: when lessons can begin (around 1, and formal lessons by 4), what to look for in a class, and water safety;
  from a child's first birthday a note on the Day page says it is a good time to begin, until closed
- **The first screen**: a new phone asks how you'd like to use Little Log. **Just this phone** keeps everything on the phone, with no
  account; **Share with family** signs in with an email to start a log the family shares, or to join one; **Moving from another phone?**
  restores the backup file made on the old phone, with its passphrase. The choice is remembered. A log kept on the phone only can share
  later from the Family tab (**Share with family**), and its entries wait to be taken into the new log
- **Locked-down accounts**: email one-time code + security check (CAPTCHA), **two-step verification** (required for parents), an
  **app lock** (More → App lock: Face ID / fingerprint with the phone passcode as fallback, on by default on a phone with a screen lock,
  or a PIN of 4 to 8 digits chosen in the app, kept only as a salted hash in the Keychain / Keystore, with Face ID / fingerprint as an
  optional shortcut; five wrong PINs start a wait that doubles; it locks when the app opens and after a chosen time away), secrets in
  the **Keychain / Keystore**, "sign out everywhere", in-app account deletion
- **End-to-end encryption**: the server can't read the baby's name, entries, notes or health data. Phones hold the keys (Keychain / Keystore); a recovery code
  protects against losing every phone; keys change automatically when someone leaves or loses a phone
- **Encrypted cloud backup** (More → Cloud backup) to Google Drive, Dropbox, OneDrive, or iCloud Drive / Files, with a passphrase only
  you know. A log kept on the phone only is offered it straight after the first screen (**Set it up**, or **Not now**), and until a backup
  is made a note on the Day page reminds you once something is logged (put off, it comes back a month later). To move phones, the new
  phone restores the backup file at its first screen; a backup in a drive is restored from More → Cloud backup after connecting the drive
- Works offline; changes sync when you're back online
- **Update app** (More): opens Little Log's page in the App Store or Google Play, where an update is one tap, and shows the version
  that's installed
- **32 languages**: the app follows the phone's language, or one chosen in More → Language:
  - English, Spanish, Portuguese (Brazilian Portuguese, which a phone set to European Portuguese gets too), French, German, Italian,
    Dutch, Polish, Romanian, Russian, Ukrainian and Turkish;
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

## Growing to 18
Little Log grows with the child in phases. Each finished phase is saved as a version you can go back to ([INSTALL.md](INSTALL.md)).

| Phase | Ages | What it adds | |
|---|---|---|---|
| 1 | 1 to 5 | Stages by age, meals, milk from a cup, potty training, big moments, toddler topics and milestones to 5 | done |
| 2 | every age | A health record: vaccines, checkups, the dentist and other visits, weight, height and head size against the CDC growth charts, and all of it in the doctor's report | done |
| 3 | 3 months to 12 | Daycare, preschool and school: drop-off and pick-up (who has the child today), the school week in the routine, activities, homework and reading, the Guide for school children | done |
| 4 | 12 to 18 | The teenage years: a family calendar (school holidays too), the Guide for teenagers, and at 18 their book and their record to hand over, when Little Log's work is done | done |

Not there yet: entries a teenager keeps private (everyone a log is shared with sees all of it, as the encryption keys belong to the family's
log, not to each child), and reminders for what is on the calendar.

## Build and test
```bash
npm install && npm run sync     # then npm run android / npm run ios / npm run apk
npm test                        # database rules + end-to-end tests
```
- **[INSTALL.md](INSTALL.md)**: installing on Android phones and iPhones, building from source, running the tests, and the saved
  versions with how to restore one
- **[SETUP.md](SETUP.md)**: Supabase, sign-in hardening, roles and permissions, cloud providers, privacy notes
- **[TESTING.md](TESTING.md)**: what the automated tests prove, what they can't, and the physical-device release checklist
- **[MOBILE.md](MOBILE.md)**: building and releasing the Android and iOS apps, store checklist
- **[lang/README.md](lang/README.md)**: translating, checking the catalogues and adding a language

*Not medical advice.*
