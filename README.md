# Little Log – from newborn to 18

A **phone app** (Android and iOS; Windows and Mac later) that grows with a child: a newborn's feeds, pee/poo, sleep, night wakings,
vomit, play, health observations and medication; then meals, potty training and the big moments of growing up, with a calendar and
easy-to-read stats, until the child turns 18. Built with plain web code wrapped by Capacitor. The family's log can live in **a folder
in the family's own cloud storage** (Google Drive or Dropbox), shared out from the app with no server anywhere, end-to-end encrypted on
the phones. A family server stays in the code for later; the store build has none.
To install it, or go back to a saved version, see [INSTALL.md](INSTALL.md).

## Features
- **Day view**: one-tap entry buttons, tick-box chips, time defaults to now with "5 min ago" shortcuts; tap an entry to edit/delete.
  The page follows the calendar: back from the background on a new day, or past midnight while open, it shows today (a day gone back
  to on purpose stays through a short pause); an entry added to another day says so in its sheet
- **Growing up**: every child has a stage that comes from their age: newborn, baby, toddler (from 1), preschooler (from 3), school age
  (from the age children start school where the family is: 4 in the UK and Ireland, 5 in North America, Australia and New Zealand, 6
  elsewhere, or from the day a "First day of school" moment is saved), teenager (12) and grown up (18). The Day page's buttons follow it: a
  newborn's nine (three by three, a **Bath** among them: logged as play, with an icon of its own and a water-ripple ray on the clock;
  with more than nine, eight and **More**), then **Meal**, **Milk** (a cup or a bottle, cow's or plant milk) and **Potty** from a year old, and the buttons a child
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
- **Solid or wet**: a poo says how it was (hard, solid, soft, or wet / runny) on the diaper and potty forms, and as an optional row on the
  one-tap pop-ups; it shows in the day's list, in Stats (counts per kind) and in the doctor's report, and three or more wet, runny poos in
  a day get a note in Stats about tummy bugs and when to call
- **Daycare and school** (from 3 months old; the Day page's Drop-off): where the child was dropped off (the usual place for the age,
  daycare, preschool or school, or the last one used: a childminder's, the grandparents', an after-school club, or one typed in), who
  dropped them off, and who will pick them up and when ("Grandpa picks up at 3:15 PM"). At the grandparents', a babysitter's, a
  childminder's or a friend's house the form asks whose, offering the family's own names (the family tree's grandparents and
  great-grandparents, as the children call them; the babysitters, caregivers and friends in the log), and every place can have a
  **location** (an address, or how to find it), remembered for the next drop-off there on every phone. While the child is there, a
  banner says where, with whom and who is coming, and whoever picks them up taps **Picked up**: the pick-up is an entry of their own, so a grandparent who may not
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
- **Day clock**: a French carriage clock (a frame of thin soft-gold lines, a painted panel, a white face that goes dark in dark mode, with
  pale lines and the night palette for the entries,
  with a black rim, Roman numerals, a moon at midnight and a sun at noon, a blued spade hand at the current time). A **24 h / 12 h** switch: the 12-hour face shows the morning or the afternoon half (AM / PM) with all
  twelve numerals and an hour and a minute hand. A **XII / 123** switch beside it swaps the Roman numerals for plain, easy-to-read
  numbers (kept on the phone). Every entry is a ray from the centre to the hour it happened, coloured by group (a snack's ray is dashed,
  a poo's a squiggle, a bath's a water ripple (two wavy lines in water blue), a nap's dashed, an estimated time's dotted; the app icon's rays show the same kinds of line), ending in a small paper disc with a mini symbol of the entry on it (a bottle, a spoon for
  solids, a drop, a poo, a moon, a teddy, a bathtub…), ringed in the entry's colour, or the child's on a shared log; the legend under the
  clock shows the same symbols (More → Appearance and clock art turns them into plain dots, kept on the phone): tapping a symbol
  shows that entry's details (editing stays in the list below, where "Show in the list" takes you); tap a quarter of
  the dial to list just those hours (its name and the hours it covers are written in the clock's carrying handle meanwhile). **Clock art**: eight watercolour paintings to choose from per child (cherry blossoms, Japanese maple, ocean,
  forest, mountains, rose garden, starry night, gilt classic), drawn in the app and kept on the phone; in dark mode each one is its night-time
  scene (a moon and stars, lit windows and lanterns, moonlight on the water), and so are the travel paintings. Details sit below in twirl-down groups (feeding, diapers, sleep, vomit, play, health & meds)
- **Month view** with a day's counts at a glance (and the entries in a twirl-down); a day with a big moment is ringed and washed in
  gold, like the big-moment cards and buttons, and so is the **Big moments** journal at the bottom of the page (gold and dashed, like
  Plan a trip and Add to the calendar above it); **stats** for the last 7, 14 or 30 days, 3 months, 6
  months or a year (over 30 days the charts show an average day for each week, over a year for each month), the key numbers on each card and
  every chart in a twirl-down of its own, drawn small; a **Height & weight** card with the latest measurements and their percentiles
  ; **Pictures as they grow**, in a twirl-down: a carousel for the first year (a tile for the newborn and for each month birthday, the
  reached ones open to a picture, the rest dimmed with their dates, the one for now ringed) and one for every birthday from one to
  eighteen, veiled until the first birthday, when the 12-month sheet says it has opened; the 12-month and first-birthday slots are one picture.
  A picture is an entry of its own (shrunk, kept on the phone, encrypted and synced like a big moment's pictures, off the Day page and
  the report); tap one to see it big, replace it, remove it or save it; ‹ › or a swipe moves along a carousel
- **Routine** tab: the times of day that keep coming back, laid out like a day in a calendar from morning to night (morning, afternoon,
  evening, then the night, which counts with the evening before it: the routine's day runs from 6 AM to 6 AM) with a line at the time now. A feed, a meal of solid food, a nap, a kind of play or a medicine that happened within 45 minutes of the same time
  on most of the last 7 days (and on at least 3) is part of the routine, with what it usually is (how long, how much, which medicine and
  dose). Nothing is set by hand and nothing is stored: it's worked out from the log every time, so it moves when the baby's day does.
  Today's times are ticked off as they're logged, and the next one is shown on top; what was logged today at another time (a nap at
  an unusual hour) is listed under **Also today**, and before there is a routine everything logged today shows under **Today so far**,
  so a nap just added is on the page at once. Diapers, wake-ups, vomiting and health notes are
  left out: they don't keep to a clock. Daycare, school, homework, and lessons and clubs keep to the days of the week instead: they are
  worked out for each day of the week over the last 4 weeks (school at 8:30, Mon – Fri; swimming on Tuesdays), come back on those days
  only, and the other days' times are listed under the day's
- **Report for the doctor** (Stats → PDF): a clean PDF to hand over or email: the child's age, allergies, pediatrician and usual
  formula, the parents' questions for the doctor, then the last 7, 14, 30 or 90 days at a glance (feeds, diapers, sleep, wake-ups,
  vomiting, the highest temperature, symptoms, medicines, foods tried), day by day, health notes and medicines, and optionally every
  entry. It's made on the phone (nothing is uploaded), in the app's language (right to left for Arabic, Hebrew, Persian and Urdu), on A4
  or US Letter by where you are
- **Solid foods**: in the month a child turns 6 months old, a sheet says it's time, with the signs a baby is ready, how to start, the key
  allergens to give early and often, what not to give yet, and when to call for help (it shows once, and not if solids are already in
  the log; the Guide keeps it under Food). Feed → **Solids** has a twirl-down of common first foods by group (key allergens first and
  open, then grains, vegetables, fruit, and meat, fish and beans), each food that is or contains a common allergen marked "key
  allergen", or type in any other food, plus how much was eaten. Meals have a routine time of their own
- **Allergies**: a parent marks what the child reacted to: a food, a **medicine or medical thing** (penicillin, amoxicillin, ibuprofen,
  latex, plasters…), a **vaccine** or an ingredient, an **insect sting**, something in the **environment** (pollen, dust mites, cats…) or
  anything else, with how bad it was (mild, or serious: trouble breathing, swelling, emergency care), whether the child carries an adrenaline
  auto-injector, the date of the first reaction and what happened (More → Children, the health record's **Allergies** section, or "Mark an
  allergy" on a meal tapped on the clock, which fills in its foods and date). It's kept in the child's profile, end-to-end encrypted, and
  seen by everyone sharing the log: the first date is marked on the calendar like a trip, the Day tab shows the child's allergies at the
  top, the foods list flags them, logging an allergen warns straight away, the medicine form warns when the medicine (or one of its family:
  Augmentin for a penicillin allergy, Tylenol for paracetamol) is one the child is allergic to and asks before logging it, and the doctor's
  report lists them
- **Guide tab**: every part of it (the newborn worries, toddlers and preschoolers, school age, teenagers, puberty, food, medicines, play,
  health checks, month by month, tutorials) is a twirl-down of its own, closed to start with and saying how much is inside; only the
  pediatrician, the health record and **Right now** stay open on the page. For 8-to-16-year-olds, **puberty**: what to expect and when (and when to see the doctor), how to talk about it, and their
  privacy (some things are theirs to share; ask before writing about their body, periods or feelings in a log the family shares). For
  teenagers, sleep, mental health (and what to do at once if they talk about hurting themselves), phones and life
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
  [img/guide/CREDITS.md](img/guide/CREDITS.md). **Tutorials**, a twirl-down of short videos worth watching for the ages on the page, from
  public health bodies and children's hospitals (first meals and starting solids, healthy snacks, potty training, first aid for a choking or
  unresponsive baby or child, safe sleep, newborn care, teeth, fever, tantrums, car seats), each a tap that opens YouTube. The Guide's
  emergency note is followed by **Not an emergency?**: the region's health advice line (NHS 111, 811 in Canada, healthdirect…) and the
  **nurse advice line**, **after-hours** number and **hospital non-emergency line** saved with the pediatrician, each with a Call button
- **ml or fl oz** for milk: a switch in the feed form (→ fl oz / → ml) converts the number already typed and sets the unit for the whole
  app (the list, the Day tiles, Stats, the routine, travel's quick amounts and the doctor's report), or choose it in More → Units; amounts are
  stored in ml, so phones set differently agree. ml until switched
- **Woke up**: the night-waking entry is "Woke up" (a wake-up), with Pain among the reasons beside hungry, diaper, gas and unknown;
  Stats count wake-ups per night
- **The birds sing one at a time**: tapping a second bird while the first still sings makes it take over (one song, one bob), a
  tap gives a bird no keyboard focus (nothing scrolls to it), and the birds and the falling leaves live in a layer of their own, so
  their animations repaint neither the painting nor the people. The tutorial opens a twirl-down only for the step that needs it
  and closes it again when it moves on, so a page is left as the tour found it
- **Who someone is can be changed from Edit**: a person's sheet on the tree has *Who they are to the children*, a list of every
  place on the tree with room, grouped by side and saying whose relative they would be (Step-brother or step-sister · Pat's child,
  Great-aunt or great-uncle · Rose's brother or sister, Grandparent · Jo's parent…). Choosing one moves them there, with the picture
  and their card following: an aunt or uncle's partner and children come along to a great-aunt or great-uncle's place and back, a
  parent's or grandparent's parents and siblings to the other of those two; anyone else with people added through them is asked to
  move those first. Nobody can be hung from themselves or from someone added through them
- **Step-families on the tree**: a parent's or a grandparent's **later partner** sits just outside them, joined by a small open
  heart (the original couple stays as it is). A grandparent's later partner is the children's step-grandparent; an aunt or uncle can
  be said to be **whose child** (the grandparent couple's, that grandparent's with the later partner: a half-brother or half-sister of
  the parent, or the partner's from before: a step-brother or step-sister), and is drawn beyond the parent's own brothers and sisters,
  rooted to whoever's child they are. A parent's later partner is the children's step-parent, and their own children sit on the
  grass beside the children as step-brothers and step-sisters. On the tree family is family: the cards say who is whose. Added from a
  person's card (+ Add a later partner, + Add a child of theirs); removing a later partner takes their own children, not a half-sibling
- **The family tree's watercolour is painted once**: its filters (turbulence, displacement, blur) take seconds to rasterize at a
  phone's pixel density and used to run again for every tile a sideways scroll or a redraw uncovered, which showed as flashing
  while the tree was moved. The painting is now rendered once into a picture, kept on the phone for the next time the same
  drawing is shown; what scrolls is a bitmap, only the people and the birds stay live, and the birds hold still while the tree moves
- **Woke up at the top** (the sleep banner) asks whether they are **up for good** (the sleep ends now) or **back to sleep soon**: then
  the wake-up is noted with its reason and drawn as a dashed moon on the clock while the sleep goes on, and the button becomes
  **Asleep again**, which continues the sleep as it was; Up for good while they are up ends the sleep at the moment they woke. The
  Sleep button while they are up means asleep again, the sleep check waits, and the pause shows on every phone
- **The day of the week** on the day clock, above the hands
- **The family calendar on the phone**: an event on the Month tab (an exam, an appointment, a lesson, a trip) goes straight into the
  phone's own calendar (**Add to phone calendar**: the calendar app's new-event screen on Android, the system's on iOS, no calendar
  permission needed) or travels as a calendar file (.ics) through the share sheet, to email, messages or Files, which Google Calendar,
  Apple Calendar and Outlook all open; **Share this month's calendar** sends everything in the month as one file. All on the phone: there
  is no calendar server, and nothing leaves unless you send it
- **Travel mode**: plan a trip ahead from the Month page (always there: it leaves on the day picked) or with the "Travelling?" button at
  the bottom of today; it asks how (car, plane, train, ship) and the dates, and refuses overlapping trips. For those days the Day tab
  becomes a travel page on every phone in the log: a clock painted to match the journey, its own set of colours (checked for colour-blind
  separation and contrast like the home set), big buttons whose sheets take a tap or two, rough times ("about 15 minutes ago") kept as
  estimates and drawn dashed, a journey timer per way of travelling (time on the move lights up the clock's outer track; long drives get a
  reminder to take the baby out of the car seat), and tips for each kind of trip. Travel days stay outlined in the month view. Leaving
  and coming home play a short journey across the screen (from the house, or back to it) while the page changes under it
- **Notifications** (the phone app): while a child is logged asleep, the phone asks whether they are still asleep ("Is Leo still
  asleep? Asleep since 1:10 PM (2h)"), with **Woke up** and **Still asleep** right on the notification, so a sleep nobody closed does
  not run on for hours. It asks after a while (1 to 3 hours, 2 to start with), then again every 30 minutes or an hour, up to three
  times; once the routine knows how long a sleep at that time usually lasts, the first check comes an hour after the usual end instead
  (a nap that usually ends at 2:30 is asked about at 3:30, and the notification says when they are usually up; More → Notifications can
  turn that off), and never in the **do-not-disturb** hours each parent sets on their own phone (7 PM to 7 AM to start with): a check that falls
  in them is sent when they end, which also catches a sleep from the evening before. Woke up on the notification ends the sleep then
  (closing a wake-up still open) and opens the day; the checks are planned from the log on the phone and cancelled when the sleep ends on any phone. More →
  Notifications has the settings and asks the phone for permission (it is asked the first time there is something to send)
- **Tutorial**: a ? on every screen starts a short tour of it: a highlight box glides from button to button with a line on why it's there.
  The home screen's tour starts by itself the first time, and so does the first screen's: what Just this phone, Share with family and
  Moving from another phone mean, and that Just this phone is not a one-way door (the Family tab's Share with family signs you in later,
  entries and all). Every part of every screen is in its tour, including what only shows up as a
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
- **More** is a page of twirl-downs, one per setting, each with its current value on its line (Language, Security & account, Children,
  Where you are, Units, Appearance and clock art, Cloud backup, Your data, App updates), closed until tapped
- **Where you are** (More): automatic from the phone's time zone, or one of the eight regions. The formula list puts its formulas first,
  and the Guide gives its emergency number (911, 999, 112, 000 / 111, 192 (SAMU) in Brazil, or "your local emergency number"), medicine
  names and ages first
- **People's contact details** (phone, work, notes) that each person adds for themselves, visible to those allowed to see the family list
- **Appearance**: match the phone, light, dark, or automatic by **sunrise and sunset** (worked out from the phone's time zone, no location
  needed); switching plays a short sunset into dark or sunrise into light
- **Sleep timer**, **month calendar** with coloured dots, **stats** (7/14/30 days). A sleep is a **nap or a night's sleep**: the
  "Fell asleep" pop-up and the sleep form have the two chips, set from the time it began (from 6 AM to 6 PM, a nap) until one is chosen;
  on the day clock a nap is a dashed ray and a dashed arc, a night's sleep a solid one, and the list and the banner say Napped / Napping
- **Health checklist** (blue hands/feet, clicking hips, belly bulge, jaundice…) with "call your doctor" prompts
- **Security and sharing** (Family tab): invites, the activity log, encryption, the security code and your phones in one twirl-down,
  which opens by itself when something needs checking
- **One file upgrades the cloud project**: after an app update that changed the database, whoever set up the Supabase project runs
  `supabase/upgrade.sql` in its SQL editor; it brings a project from any release since 1.0.0 to the current one, keeps every row and
  is safe to run again. The app asks the project which release its database is from and, when it is behind, a parent sees *The cloud
  project needs an update* on the Family tab and under More → App updates; a feature the project lacks stops with the same plain
  words, naming the function, instead of the server's "schema cache" reply
- **Family sharing with roles**: *Parents* (admins), *Family members*, *Caregivers*, *Babysitters*, *Medical assistants* and *Friends*; per-person check boxes for exactly what
  they can do. (With a family server, kept for later: joining needs a QR invite (2 hours, one use, rescindable) **and a parent's approval**: a request to join pops up on the
  parent's phone as it arrives, with the security check and **Approve** / **Deny** there and then, or **Later** (it stays on the Family tab,
  with the badge). Parents get a private **activity log** of who did what.)
- **The family's own cloud** (the store build; [FOLDER.md](FOLDER.md)): the log lives in a folder named *Little Log* in a parent's own
  Dropbox or Google Drive, with no server anywhere. The parent connects the cloud on the first screen, starts the log and shares the
  folder with each relative's email from the Family tab; relatives connect their own account with the same cloud, ask to join and are
  approved on a parent's phone, with the same security-code check, roles and check boxes. Everything in the folder is end-to-end
  encrypted as it is on a server; the family can look at, back up or delete the folder from the cloud's own apps. Removing someone,
  leaving, a lost phone, a parent's new phone and the recovery code all work as they do with a server; the activity log and the QR
  invite are server-only. A lapsed cloud sign-in asks for a one-tap *Reconnect* and loses nothing. A family on a family server moves
  into a folder from More (*Move this log to the family's own cloud*): entries, pictures, tree and names come along under new keys,
  and the phone leaves the server. Every phone signs what it writes, and a phone believes the family list, the tree, a change of
  keys or an entries file only when a chain of approvals from the folder's creator reaches the phone that signed it; a parent's
  phone puts back what it would not believe and the files the folder cannot do without, and says whose phone tried. A join code,
  made when the folder is shared and typed on the joining phone, shows the parent *Verified* without a security code read out, and
  the parent's phone takes who wrote a request from the cloud's own record. The folder's owner can keep sharing to their own phone
  (*Only my phone can share this folder*). The folder holds a README.txt for the family, in their language: it may be moved or renamed
  (its name starting with *Little Log*), but nothing inside it should be renamed, moved or deleted. **iCloud Drive** is prepared for
  iPhones and iPads: the folder lives in the Files app through the app's own plugin, is shared from the Files app, people are invited
  by name with a join code, and everyone in the family needs an Apple device; the plugin still has to be built and tried in Xcode.
  OneDrive is next
- **Family tree** (Family tab): the family as the tree's **roots**: a detailed tree above the ground (its crown, boughs and birds, the
  sun or the moon, the hill with its flowers) and below it the children as the newest root tips just under the trunk, the parents
  below them, the grandparents deeper and the great-grandparents deepest, aunts and uncles as side roots with their children, and each
  grandparent's brothers and sisters (the great-aunts and great-uncles) beside them with their partners and children (the parents'
  cousins). The birds on its boughs sing their own songs when tapped: a few seconds of recordings from Wikimedia Commons, credited under Guide → Picture and sound credits. Painted as a soft watercolour (washes with pigment edges, paper grain) of
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
  assistants and friends are two lists; tap anyone for their details (phone with a Call button, work, notes). A parent's **Edit** on anyone, other parents included, changes the name the family sees here, their role and what they may do. A parent can **Retire** a
  helper who moved away, stopped, or died: their access ends at once (as if removed, and the log changes its keys), but they stay on a
  **Retired** list with their role, dates, the reason and their details (still end-to-end encrypted), and their past entries still say
  who added them. To have them back, invite them again; a parent can also delete the note
- **Play and activities** (Guide): the kinds of toy that suit each age, from the first 3 months to the teenage years, with what
  children do at that age, kinds rather than brands, and what to watch for (small parts, magnets and button batteries, baby walkers,
  helmets, trampolines, screens). The Guide shows each child's age and the next one, and every age in the family with Everyone.
  **Learning to swim**: when lessons can begin (around 1, and formal lessons by 4), what to look for in a class, and water safety;
  from a child's first birthday a note on the Day page says it is a good time to begin, until closed
- **The first screen**: the first screens (welcome, sign-in, join) look like the rest of the app: the app's badge and a line on top, the
  choices as painted tiles in the day clock's colours. A new phone asks how you'd like to use Little Log. **Just this phone** keeps everything on the phone, with no
  account; **Share with family** signs in with an email to start a log the family shares, or to join one; **Moving from another phone?**
  restores the backup file made on the old phone, with its passphrase. The choice is remembered. A log kept on the phone only can share
  later from the Family tab (**Share with family**), and its entries wait to be taken into the new log
- **Locked-down accounts**: email one-time code + security check (CAPTCHA), **two-step verification** (required for parents), an
  **app lock** (More → App lock: Face ID / fingerprint with the phone passcode as fallback, on by default on a phone with a screen lock,
  or a PIN of 4 to 8 digits chosen in the app, kept only as a salted hash in the Keychain / Keystore, with Face ID / fingerprint as an
  optional shortcut; five wrong PINs start a wait that doubles; it locks when the app opens and after a chosen time away; the phone's
  own prompt says "Just checking it's you" and one warm line naming the app once), secrets in
  the **Keychain / Keystore**, "sign out everywhere", in-app account deletion
- **End-to-end encryption**: the server can't read the baby's name, entries, notes or health data. Phones hold the keys (Keychain / Keystore); a recovery code
  protects against losing every phone; keys change automatically when someone leaves or loses a phone
- **Quick with a big log**: measured with ten thousand entries, every page draws in well under a tenth of a second on a build server; the budgets are held by a speed suite, and [PERFORMANCE.md](PERFORMANCE.md) has the numbers and the reasoning.
- **Encrypted cloud backup** (More → Cloud backup) to Google Drive, Dropbox or OneDrive (once the app is registered with each service, SETUP.md §3; until then the card says so, and its *How to set up* twirl-down walks through the three registrations step by step) or to iCloud Drive, Files or any cloud app on the phone through the share sheet, with a passphrase only
  you know. A log kept on the phone only is offered it straight after the first screen (**Set it up**, or **Not now**), and until a backup
  is made a note on the Day page reminds you once something is logged (put off, it comes back a month later). To move phones, the new
  phone restores the backup file at its first screen; a backup in a drive is restored from More → Cloud backup after connecting the drive
- Works offline; changes sync when you're back online
- **Update app** (More): opens Little Log's page in the App Store or Google Play, where an update is one tap, and shows the version
  that's installed
- **Edge to edge on Android 15 and later**: the page keeps clear of the status and navigation bars (a plugin reports their size), the tab
  bar grows by the bar below it, and the bar icons follow light or dark mode
- **The app icon**: the baby in the centre, rays in the day clock's colours around it, on soft creamy white; the rays are drawn in the
  clock's kinds of line: most plain, some dashed, dotted, a squiggle, a zigzag or ending in a dot (`npm run icons` draws every size)
- **Before the birth**: a date of birth still to come makes the child *expecting*. Until the baby is here their Day page is a countdown
  to the due date, a **contraction timer** (tap when one starts and again when it ends; each one is listed with how long it lasted and how
  far apart they are, the last hour is summed up, and once they are about five minutes apart, a minute long, for an hour, it says it is
  time to call the midwife or the hospital) and a **hospital bag** checklist (for you, for the baby, for your partner; the ticks stay on
  the phone). Contractions are entries, so the other parent's phone shows them too, encrypted like everything else; once the baby is here
  they stay off the day's lists and the doctor's report. Set the date of birth under More when the baby arrives and the log begins
- **Wake windows**: once a sleep today has ended, the banner says how long the baby has been awake and when a nap is usually due for
  their age (35 to 60 minutes for a newborn, one to two hours by 3 months, up to five to seven hours at 2; nothing from 3 years)
- **Pumping and the milk stash**: a **Pumping** entry (the side, the amount, the minutes, and whether the milk was given now, put in the
  fridge or in the freezer), or a timer in the banner (**Done** opens the entry to finish it). The **Milk stash** on the Day page lists the
  bottles waiting, oldest first, with how long each keeps (about 4 days in the fridge, 6 months in the freezer); **Used** takes one out.
  Pumping stays out of the doctor's report
- **Formula prep helper**: on a bottle of formula, the level scoops for the water (1 scoop per 30 ml, or per 60 ml where that is the
  usual tin; a button says what your tin does, remembered on the phone). Water first, then the powder
- **Allergen introduction** (the Guide's Food section): the nine key allergens (peanut, egg, milk, wheat, soy, tree nuts, sesame, fish,
  shellfish), each with when it was first offered and how often; **Offered today** logs a taste as a solids feed, a nudge says when to
  offer one again, and **Reaction** notes an allergy
- **Teeth** (in the health record): a mouth of the 20 first teeth to tap; each tooth is dated the day it came in and the day it fell out,
  with when that usually happens, on every phone like the rest
- **Potty chart** (Stats, while potty training): the last two weeks with a star for each time on the potty, a dot for each accident and
  a moon for a dry night; the streak of days with a star and no accident; and a **reward chart to print** (a PDF: four weeks of stars so
  far and four empty weeks to fill in by hand, with stickers if you like)
- **Handover card** (the Day page's **Share today so far**): the day in a few lines (feeds, diapers, sleep, medicines, notes, allergies)
  for a babysitter or a grandparent, shared as text or as a picture
- **Account deletion** in the app: More → Security & account → **Delete account** erases the account, the logs nobody else is in
  (entries, members, keys and devices) and the keys on the phone; it needs a session that passed two-step verification. What the
  server still holds afterwards, and the rest of the security review, is in [SECURITY.md](SECURITY.md)
- **Crash reports** (More → App updates; off until turned on): when something goes wrong inside the app, a report goes to the Little
  Log team through an Edge Function and on by email, like language reports: what went wrong and where in the app's own code, the app
  version, the kind of phone, the language and the hour. Never an entry, a name, an address, anything typed or anything about the
  account: anything that looks like an address is blanked before it leaves the phone, and it is sent without the sign-in, so it cannot be
  tied to anyone ([SETUP.md](SETUP.md) §6)
- **Tablets, and phones on their side**: on a wide screen the Day page puts the clock beside the entries, and the Stats, Guide, Month
  and More pages use two columns
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
Every push and pull request runs the lint and all the suites in GitHub Actions ([`.github/workflows/tests.yml`](.github/workflows/tests.yml)).
- **[INSTALL.md](INSTALL.md)**: installing on Android phones and iPhones, building from source, running the tests, and the saved
  versions with how to restore one
- **[SETUP.md](SETUP.md)**: the family's own cloud (the Dropbox app and the Google client to register), Supabase, sign-in hardening, roles and permissions,
  cloud providers, privacy notes
- **[FOLDER.md](FOLDER.md)**: the family folder: what each file holds, how a sync goes, who may do what, leaving and recovery, the clouds
- **[TESTING.md](TESTING.md)**: what the automated tests prove, what they can't, and the physical-device release checklist
- **[MOBILE.md](MOBILE.md)**: building and releasing the Android and iOS apps, store checklist
- **[lang/README.md](lang/README.md)**: translating, checking the catalogues and adding a language
- **[SECURITY.md](SECURITY.md)**: the security model, the October 2026 review with its findings, and the deployment checklist

*Not medical advice.*
