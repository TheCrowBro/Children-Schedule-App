'use strict';
/* The Guide tab: things parents commonly run into with a newborn, over-the-counter medicines, month-by-month milestones, and the
   pediatrician's details. General information only, written from AAP / CDC / FDA and NHS parent guidance; it is not medical advice and
   every card says when to call. */
const Guide = (() => {
  // Each item: what it is, what's normal, and when to call. `urgent` lines are the "call now / emergency" signs.
  const COMMON = [
    { id: 'blue', icon: '💧', title: N_('Blue hands and feet'), body: N_('Very common in the first days. A newborn\'s circulation is still settling, so hands and feet can look bluish or purple, especially when cold, while the lips, tongue and face stay pink.'),
      call: N_('Call {sos} if the lips, tongue or face look blue or grey, or your baby is struggling to breathe.') },
    { id: 'belly', icon: '🩺', title: N_('A bulge in the belly'), body: N_('A soft bulge at the belly button that gets bigger when crying is usually an umbilical hernia. It often closes on its own in the first years. A ridge down the middle of the tummy when straining is the belly muscles not yet joined (diastasis recti) and usually goes away as your baby grows.'),
      call: N_('Call your pediatrician straight away if a bulge is hard, tender or discoloured, can\'t be gently pushed back, or comes with vomiting.') },
    { id: 'hips', icon: '🧸', title: N_('Clicking joints and hips'), body: N_('Soft clicks from knees, shoulders and hips are common as ligaments stretch. Doctors check the hips at every early checkup.'),
      call: N_('Mention it at the next visit if you feel a "clunk" in a hip, the skin folds on the thighs look uneven, the legs look different lengths, or one leg moves less.') },
    { id: 'jaundice', icon: '🩺', title: N_('Yellow skin (jaundice)'), body: N_('Mild yellowing of the skin and eyes is common between days 2 and 5 and usually fades within two weeks. Frequent feeds help.'),
      call: N_('Call if yellow appears in the first 24 hours, spreads to the belly, arms or legs, lasts more than two weeks, or your baby is very sleepy or feeding poorly. Pale or chalky poop or dark urine also needs a call.') },
    { id: 'cord', icon: '🩺', title: N_('Umbilical cord stump'), body: N_('Keep it clean and dry and let it fall off by itself, usually in 1 to 3 weeks. A little crust or a spot of blood when it comes off is normal.'),
      call: N_('Call if the skin around it turns red, there is pus or a bad smell, bleeding doesn\'t stop with gentle pressure, or your baby has a fever.') },
    { id: 'spit', icon: '🤮', title: N_('Spit-up'), body: N_('Most babies spit up, often after feeds or with burps. If your baby is growing and content, it is usually just "laundry".'),
      call: N_('Call if vomiting is forceful or projectile (especially between 2 and 8 weeks), contains blood, or your baby has fewer wet diapers. Green vomit needs a doctor straight away.') },
    { id: 'poop', icon: '💩', title: N_('Poop colours'), body: N_('The first poops are black and sticky (meconium), then green, then yellow and seedy for breastfed babies or tan and firmer with formula. How often varies a lot.'),
      call: N_('Call about white, pale grey or chalky poop, red or bloody poop, or black poop after the first few days.') },
    { id: 'diapers', icon: '💧', title: N_('How many wet diapers'), body: N_('Expect about one wet diaper per day of age for the first few days, then at least 6 wet diapers a day from about day 5.'),
      call: N_('Call if there are fewer than 6 wet diapers a day after the first week, a dry diaper for 6 hours or more, or a sunken soft spot.') },
    { id: 'breathing', icon: '😴', title: N_('Noisy or irregular breathing'), body: N_('Sneezing, snuffly noses, hiccups and breathing that speeds up and slows down with short pauses (under about 10 seconds) are normal in newborns.'),
      call: N_('Call {sos} for pauses of 20 seconds or more, blue colour, or hard work to breathe: skin pulling in between the ribs, flaring nostrils, or grunting with every breath.') },
    { id: 'fever', icon: '🩺', title: N_('Fever under 3 months'), body: N_('Take the temperature rectally for an accurate reading in young babies. A fever is 100.4°F (38°C) or higher.'),
      call: N_('Under 3 months, any fever of 100.4°F (38°C) or higher means calling your pediatrician or going to the emergency room now, even if your baby seems well.') },
    { id: 'skin', icon: '🧸', title: N_('Spots, rashes and peeling'), body: N_('Tiny white bumps (milia), baby acne, blotchy red newborn rash, dry peeling skin and cradle cap are common and harmless. Gentle washing is all they need.'),
      call: N_('Call about blisters, pus-filled spots, a rash with a fever, or purple-red spots that don\'t fade when pressed.') },
    { id: 'crying', icon: '🌙', title: N_('Crying and colic'), body: N_('Crying usually peaks around 6 weeks and eases by 3 to 4 months. Colic is crying for 3 hours or more a day, on 3 or more days a week, in a healthy baby. Swaddling, rocking, white noise and walks can help.'),
      call: N_('Never shake a baby. If you feel overwhelmed, put your baby down safely on their back and take a break. Call if the cry sounds unusual or high-pitched, or comes with fever, vomiting or poor feeding.') },
    { id: 'jerks', icon: '😴', title: N_('Startles, jerks and a trembling chin'), body: N_('The startle (Moro) reflex, jerky arm movements and a quivering chin are normal as the nervous system matures.'),
      call: N_('Call if there is rhythmic jerking that doesn\'t stop when you gently hold the limb, or jerking with staring or not responding.') },
    { id: 'eyes', icon: '🧸', title: N_('Crossed or wandering eyes'), body: N_('Eyes that cross or drift now and then are common in the first months while the eye muscles strengthen.'),
      call: N_('Mention it if an eye turns in or out all the time, or still wanders after about 4 months.') },
    { id: 'hormones', icon: '🩺', title: N_('Swollen breasts or genitals'), body: N_('Hormones from pregnancy can cause swollen breasts (even a little milky fluid) and swollen genitals. Baby girls may have a little white or blood-tinged discharge. It settles in a few weeks.'),
      call: N_('Call if a breast is red, hot or tender.') },
    { id: 'weight', icon: '🍼', title: N_('Weight in the first weeks'), body: N_('Losing some weight (up to about 7 to 10%) in the first days is normal. Most babies are back to birth weight by 10 to 14 days.'),
      call: N_('Call if your baby isn\'t feeding well, seems weak or very sleepy, or the scale at checkups is worrying.') },
    { id: 'sleep', icon: '😴', title: N_('Safe sleep'), body: N_('Every sleep: on the back, on a firm flat mattress, in their own crib or bassinet in your room, with nothing else in it. No pillows, bumpers, blankets or soft toys, and never on a couch or armchair.'),
      call: '' },
    { id: 'fontanelle', icon: '🩺', title: N_('Soft spots'), body: N_('The soft spots on the head are normal and protected by tough tissue. They may pulse or bulge slightly when your baby cries.'),
      call: N_('Call if a soft spot looks sunken (a sign of dehydration) or bulges while your baby is calm and upright.') },
  ];

  // Month-by-month. CDC milestone checklists exist for 2, 4, 6, 9, 12, 15, 18 and 24 months; other months describe what is common.
  // Pictures for some of them. Each card keeps them in a twirl-down of their own, shut until someone chooses to look. All come from
  // Wikimedia Commons under free licences: `by`, `lic` and `src` (the Commons file) are credited under each picture and in full under
  // "Picture credits". `edit` says how our copy differs; those under CC BY-SA are shared on the same terms. `drawing` marks a drawing,
  // and `max` its widest size on screen (px).
  const PICS = {
    skin: [
      { file: 'milia.jpg', w: 634, h: 558, name: N_('Milia'), by: 'Serephine', lic: 'CC0 1.0', src: 'Newborn_Milia_(Milk_Spots).jpg',
        alt: N_('Close-up of a sleeping newborn\'s nose dotted with tiny white spots.'),
        text: N_('Milia: tiny white dots, here on the nose of a 1-week-old. Harmless; they go by themselves within a few weeks. Don\'t squeeze them.') },
      { file: 'acne.jpg', w: 711, h: 554, name: N_('Baby acne'), by: 'Fragegeist', lic: N_('Public domain'), src: 'Babyakne.jpg',
        alt: N_('A sleeping baby\'s cheek with a patch of small red bumps.'),
        text: N_('Baby acne at 3 weeks: small red bumps on the cheeks and forehead. It clears without treatment; wash with plain water. On brown or black skin the bumps can look darker rather than red.') },
      { file: 'cradle-cap.jpg', w: 409, h: 418, name: N_('Cradle cap'), by: 'Starfoxy', lic: 'CC BY-SA 3.0', src: 'Baby_With_Cradle_Cap.jpg', edit: N_('cropped'),
        alt: N_('The back of a baby\'s head with a patch of crusty, yellowish scales.'),
        text: N_('Cradle cap: greasy, yellowish scales on the scalp. Harmless and not itchy. Washing the hair and gently loosening the scales with a soft brush helps; don\'t pick them off.') },
    ],
    jaundice: [
      { file: 'jaundice.jpg', w: 700, h: 975, name: N_('Jaundice'), by: 'Dr. Hudson, CDC', lic: N_('Public domain'), src: 'Jaundice_in_newborn.jpg', edit: N_('cropped'),
        alt: N_('A baby whose face, chest and belly look yellow.'),
        text: N_('Jaundice: the skin and the whites of the eyes look yellow. This baby was 6 weeks old. Jaundice lasting more than two weeks needs a check; here it came from an underactive thyroid, which treatment put right. On brown or black skin, look for yellow in the whites of the eyes, the gums, palms and soles.') },
      { file: 'jaundice-zones.png', w: 400, h: 829, max: 200, drawing: true, name: N_('How jaundice spreads'), by: 'Manco Capac', lic: 'CC BY-SA 3.0', src: 'Neonatal_jaundice.png', edit: N_('saved with fewer colours'),
        alt: N_('Drawing of a child\'s body in five zones: I the head and neck, II the chest and upper belly, III the lower belly and thighs, IV the arms and lower legs, V the hands and feet.'),
        text: N_('Jaundice shows first on the face and moves down the body as it gets stronger (zones I to V). Call if it spreads to the belly, arms or legs. To check, press gently on the forehead or nose in daylight: skin that looks yellow where you pressed means jaundice.') },
    ],
    belly: [
      { file: 'hernia-6-weeks.jpg', w: 720, h: 521, name: N_('Umbilical hernia at 6 weeks'), by: 'Jpogi', lic: N_('Public domain'), src: 'Umbilical_Hernia.JPG',
        alt: N_('A baby\'s belly with the belly button poking out as a small, soft bump.'),
        text: N_('An umbilical hernia at 6 weeks: the belly button pokes out, and more so when the baby cries or strains.') },
      { file: 'hernia.jpg', w: 720, h: 485, name: N_('A bigger umbilical hernia'), by: 'Ibrahim Husain Meraj', lic: 'CC BY-SA 4.0', src: 'Umbilical_hernia_20250118_094342.jpg',
        alt: N_('A baby\'s belly above the diaper, with a rounded bulge at the belly button.'),
        text: N_('A bigger one. Soft hernias that go back in when the baby is calm are common and usually close by themselves; call straight away if one turns hard, tender or discoloured.') },
    ],
    cord: [
      { file: 'cord-7-days.jpg', w: 720, h: 579, name: N_('Cord stump at 7 days'), by: 'Stagiryta', lic: 'CC BY-SA 4.0', src: 'Pępek.jpg',
        alt: N_('Close-up of a baby\'s belly button with a dark, dried cord stump, the diaper just below it.'),
        text: N_('A cord stump at 7 days: dark, dry and shrivelled, nearly ready to fall off. Keeping the diaper below it helps it stay dry.') },
      { file: 'cord-newborn.jpg', w: 720, h: 539, name: N_('Cord stump in the first days'), by: 'Evan-Amos', lic: N_('Public domain'), src: 'Human-Male-Newborn-Infant-Baby.jpg',
        alt: N_('A newborn\'s belly with a small dark cord stump just above the diaper.'),
        text: N_('A few days old. Around a healthy stump the skin looks like the rest of the belly; redness spreading onto the belly, pus or a bad smell need a call.') },
    ],
    poop: [
      { file: 'meconium.jpg', w: 710, h: 577, name: N_('Meconium'), by: 'Tonicthebrown', lic: 'CC BY-SA 3.0', src: 'Meconium_vs_poo.jpg',
        alt: N_('An open diaper with a black-green, tar-like poop.'),
        text: N_('Meconium: the first poops, in the first 2 or 3 days. Black-green and sticky like tar.') },
      { file: 'breastfed-poo.jpg', w: 720, h: 624, name: N_('A breastfed baby\'s poop'), by: 'Tonicthebrown', lic: 'CC BY-SA 3.0', src: 'Meconium_vs_poo.jpg',
        alt: N_('An open diaper with a runny, yellow-green poop with small curds.'),
        text: N_('A few days on, a breastfed baby\'s poop: mustard yellow to green, runny and seedy. Formula poop is usually tan to brown and firmer. White, pale grey or chalky poop needs a call.') },
    ],
    fontanelle: [
      { file: 'soft-spots.png', w: 350, h: 476, max: 260, drawing: true, name: N_('The soft spots'), by: 'Henry Vandyke Carter, Gray\'s Anatomy (1918)', lic: N_('Public domain'), src: 'Gray197.png', edit: '',
        alt: N_('Old anatomy drawing of a newborn\'s skull from above, with a large diamond-shaped soft spot at the front and a small one at the back.'),
        text: N_('The soft spots seen from above, with the front of the head at the top: the large one usually closes by 12 to 18 months, the small one at the back by about 2 months.') },
    ],
  };
  const LICENCES = { 'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/', 'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/' };
  /** Where a picture's file is (the single-page demo swaps this for copies embedded in the page). */
  const picSrc = f => 'img/guide/' + f;
  /** Every picture with its full credit: licence and source addresses, and what was changed. */
  const credits = () => Object.values(PICS).flat().map(p => ({ ...p, licUrl: LICENCES[p.lic] || '', page: 'https://commons.wikimedia.org/wiki/File:' + p.src,
    edit: p.edit !== undefined ? p.edit : N_('cropped and resized') }));
  const MILESTONES = {
    1: { title: N_('1 month'), does: [N_('Lifts head briefly during tummy time'), N_('Focuses on faces about 8 to 12 inches away'), N_('Startles at loud sounds')],
      notice: [N_('Growth spurts around 2 to 3 weeks and 6 weeks: more frequent "cluster" feeds'), N_('Fussiness often builds towards a peak around 6 weeks')], visit: N_('1-month checkup') },
    2: { title: N_('2 months'), does: [N_('Calms down when spoken to or picked up'), N_('Smiles when you talk or smile'), N_('Makes sounds other than crying (cooing)'), N_('Holds head up during tummy time')],
      notice: [N_('Longer awake times and more eye contact')], visit: N_('2-month checkup and vaccines'), ask: N_('Ask your pediatrician if your baby doesn\'t respond to loud sounds, doesn\'t watch things as they move, or doesn\'t smile at people.') },
    3: { title: N_('3 months'), does: [N_('Follows moving things with the eyes'), N_('Brings hands to mouth'), N_('Pushes up on forearms during tummy time'), N_('May start laughing')],
      notice: [N_('Some babies sleep longer stretches at night'), N_('Lots of hand-watching and swiping at toys')] },
    4: { title: N_('4 months'), does: [N_('Chuckles when you try to make them laugh'), N_('Holds head steady without support when held'), N_('Holds a toy put in their hand'), N_('Brings hands to mouth and may roll from tummy to back')],
      notice: [N_('Sleep often changes around now (the "4-month sleep regression")'), N_('Drooling and chewing on everything')], visit: N_('4-month checkup and vaccines'), ask: N_('Ask your pediatrician if your baby doesn\'t hold their head steady, doesn\'t coo or make sounds, or doesn\'t bring things to their mouth.') },
    5: { title: N_('5 months'), does: [N_('Rolls from tummy to back, and maybe back to tummy'), N_('Reaches for and grabs toys'), N_('Blows raspberries and squeals')],
      notice: [N_('Lots of drooling (not always teething)'), N_('More interest in what you are eating')] },
    6: { title: N_('6 months'), does: [N_('Laughs and knows familiar people'), N_('Rolls from tummy to back'), N_('Leans on hands to support themselves when sitting'), N_('Puts things in the mouth to explore them')],
      notice: [N_('Solid foods often start around now: ask your pediatrician'), N_('First teeth arrive for many babies between 6 and 10 months')], visit: N_('6-month checkup and vaccines'), ask: N_('Ask your pediatrician if your baby doesn\'t reach for things, doesn\'t show affection for caregivers, or doesn\'t make vowel sounds.') },
    7: { title: N_('7 months'), does: [N_('Sits without support for a moment or longer'), N_('Babbles strings like "ba-ba-ba"'), N_('Moves toys from one hand to the other')],
      notice: [N_('May become wary of strangers'), N_('Time to start baby-proofing: low cupboards, cords, outlets')] },
    8: { title: N_('8 months'), does: [N_('Crawls, scoots or rolls to get around'), N_('Starts picking up small things between thumb and finger'), N_('Responds to their name')],
      notice: [N_('Separation anxiety: upset when you leave the room'), N_('Night waking can return for a while')] },
    9: { title: N_('9 months'), does: [N_('Sits without support'), N_('Looks for things you drop or hide'), N_('Makes sounds like "mamamama" and "babababa"'), N_('May be shy or clingy with strangers')],
      notice: [N_('Pulling up on furniture is common soon')], visit: N_('9-month checkup'), ask: N_('Ask your pediatrician if your baby doesn\'t sit with help, doesn\'t respond to their name, or doesn\'t babble.') },
    10: { title: N_('10 months'), does: [N_('Pulls up to stand'), N_('Cruises along furniture'), N_('Waves bye-bye or claps')],
      notice: [N_('Gates on stairs and anchored furniture matter now')] },
    11: { title: N_('11 months'), does: [N_('Stands alone for a few seconds'), N_('Says "mama" or "dada" with meaning'), N_('Understands "no"')],
      notice: [N_('Lots of throwing and dropping things to see what happens')] },
    12: { title: N_('12 months'), does: [N_('Waves bye-bye'), N_('Calls a parent "mama", "dada" or another special name'), N_('Pulls up to stand and walks holding on to furniture'), N_('Picks up small things with thumb and finger')],
      notice: [N_('Many babies move to whole milk around now: ask your pediatrician'), N_('First steps can come any time from about 9 to 18 months')], visit: N_('12-month checkup and vaccines'), ask: N_('Ask your pediatrician if your baby doesn\'t crawl, can\'t stand with support, doesn\'t say single words like "mama", or doesn\'t point.') },
    15: { title: N_('15 months'), does: [N_('Takes a few steps alone'), N_('Says one or two words besides "mama" or "dada"'), N_('Points to ask for something')], notice: [], visit: N_('15-month checkup') },
    18: { title: N_('18 months'), does: [N_('Walks without holding on'), N_('Tries to say three or more words'), N_('Follows one-step directions'), N_('Scribbles')], notice: [], visit: N_('18-month checkup') },
    24: { title: N_('2 years'), does: [N_('Kicks a ball'), N_('Says at least two words together, like "more milk"'), N_('Points to things in a book when you ask')], notice: [], visit: N_('2-year checkup') },
    30: { title: N_('30 months'), does: [N_('Plays next to other children, and sometimes with them'), N_('Says about 50 words'), N_('Names things in a book when you point and ask "What is this?"'), N_('Pretends, like feeding a doll with a block'), N_('Jumps off the ground with both feet'), N_('Takes some clothes off by themselves')],
      notice: [N_('Saying "no" and wanting to do it alone are part of growing up')], visit: N_('30-month checkup'), ask: N_('Ask your pediatrician if your child loses skills they once had, or if you are worried about how they talk, play, learn or move. You don\'t need to wait for a checkup.') },
    36: { title: N_('3 years'), does: [N_('Calms down within about 10 minutes after you leave them at daycare or preschool'), N_('Joins other children to play'), N_('Talks with you, taking turns at least twice'), N_('Asks "who", "what", "where" or "why" questions'), N_('Says their first name when asked'), N_('Draws a circle when you show how'), N_('Uses a fork')],
      notice: [N_('Many children are out of diapers in the day by 3; staying dry at night often comes later'), N_('Lots of "why" questions, and sometimes an imaginary friend')], visit: N_('3-year checkup, with a vision check'), ask: N_('Ask your pediatrician if your child loses skills they once had, or if you are worried about how they talk, play, learn or move. You don\'t need to wait for a checkup.') },
    48: { title: N_('4 years'), does: [N_('Pretends to be something else in play, like a teacher, a superhero or a dog'), N_('Comforts others who are hurt or sad'), N_('Says sentences of four or more words'), N_('Talks about something that happened during their day'), N_('Names a few colours'), N_('Draws a person with three or more body parts'), N_('Catches a large ball most of the time')],
      notice: [N_('Games with rules are fun now, though losing can be hard')], visit: N_('4-year checkup, with vision and hearing checks, and boosters in many countries'), ask: N_('Ask your pediatrician if your child loses skills they once had, or if you are worried about how they talk, play, learn or move. You don\'t need to wait for a checkup.') },
    60: { title: N_('5 years'), does: [N_('Follows rules and takes turns in games with other children'), N_('Sings, dances or acts for you'), N_('Helps with simple chores, like matching socks'), N_('Tells a story with at least two events in it'), N_('Counts to 10'), N_('Writes some letters of their name'), N_('Hops on one foot')],
      notice: [N_('Getting ready for school: dressing, using the toilet and washing hands alone, and listening to a story')], visit: N_('5-year checkup before school, with the vaccines due in many countries'), ask: N_('Ask your pediatrician if your child loses skills they once had, or if you are worried about how they talk, play, learn or move. You don\'t need to wait for a checkup.') },
  };
  // Growing up: topics for toddlers and preschoolers (from 1 to 5 years), in the Guide's own section; and, for older children, what
  // each stage is about (the Guide's "Right now" card once the milestones end at 5).
  const TODDLER = [
    { id: 'potty', icon: '🚽', title: N_('Potty training'), body: N_('Most children are ready between about 18 months and 3 years. Signs: staying dry for about 2 hours, telling you about a wet or dirty diaper, being curious about the toilet, and pulling pants up and down. Keep it relaxed: praise every try, expect accidents, and never punish. Staying dry at night often comes months or years later; wetting the bed is common until about 5, and later in some children.'),
      call: N_('Talk to your pediatrician if peeing or pooing hurts, or if a child who was dry starts having accidents again.') },
    { id: 'eating', icon: '🍽', title: N_('Picky eating'), body: N_('Toddlers grow more slowly than babies, so they often eat less and refuse new foods. Offer three meals and two or three snacks at regular times, put one food they like next to each new one, and let them decide how much to eat. It can take 10 or more tries before a new food is accepted. Milk: about 2 cups (500 ml) a day at most, to leave room for food.'),
      call: N_('Choking risks under 4: whole grapes, nuts, popcorn, hard sweets and round slices of sausage. Cut round foods into quarters, and stay with them while they eat.') },
    { id: 'tantrums', icon: '🧸', title: N_('Tantrums'), body: N_('Tantrums are normal between about 1 and 3 years, when feelings are big and words are few. Keep your child safe, stay calm and close, and let it pass; name the feeling afterwards ("You were angry"). Being tired or hungry makes them more likely, so routines help. Praise the times they cope.'),
      call: N_('Talk to your pediatrician if tantrums are very frequent or long, if your child hurts themselves or others, or if they are still frequent after 4.') },
    { id: 'sleep', icon: '😴', title: N_('Toddler sleep'), body: N_('Children of 1 to 2 need 11 to 14 hours of sleep in 24 hours, naps included, and 3 to 5 year olds 10 to 13. Most go down to one nap between 15 and 18 months and stop napping between 3 and 5. A calm bedtime routine at the same time every night helps. Move to a bed when they start climbing out of the crib, usually between 2 and 3½.') },
    { id: 'teeth', icon: '🩺', title: N_('Teeth and the dentist'), body: N_('Brush twice a day: a smear of fluoride toothpaste the size of a grain of rice until 3, then a pea-sized amount. See a dentist when the first tooth comes or by the first birthday, then about every 6 months. Water and milk are the best drinks, and no bottle in bed.') },
    { id: 'screens', icon: '📖', title: N_('Screens'), body: N_('Under 18 months, no screens apart from video calls. From 18 months to 2 years, a little good content watched together. From 2 to 5, up to an hour a day of good programmes, ideally with you. Keep screens out of the bedroom and off for an hour before bed.') },
    { id: 'car', icon: '🚗', title: N_('Car seats'), body: N_('Keep your child rear-facing for as long as the seat allows: it protects the head and neck best. Then a forward-facing seat with a harness, then a booster seat until the adult seat belt fits, usually between 8 and 12 years. Check the seat\'s limits and the rules where you live.') },
  ];
  // Health checks, for every age: what vaccines, checkups and growth charts are about (the health record keeps the child's own).
  const CHECKS = [
    { id: 'vaccines', icon: '💉', title: N_('Vaccines'), body: N_('Vaccines protect children from serious illnesses, and work best on time, following your country\'s schedule: your doctor, nurse or health visitor has it. A sore, red spot where the needle went in, a mild fever, or a fussy or sleepy day or two are common afterwards. Keep each dose in the health record.'),
      call: N_('Call {sos} straight away for trouble breathing, swelling of the face or throat, or a child who is floppy or hard to wake after a vaccine. Call your doctor for a fever of 40°C (104°F) or more, crying for 3 hours or more, or anything that worries you.') },
    { id: 'checkups', icon: '🏥', title: N_('Checkups'), body: N_('Regular checkups follow how your child grows and develops, check their hearing and eyes, and give the vaccines that are due. There are several in the first year, and they get further apart after that. In the US they are usually at 3 to 5 days, 1, 2, 4, 6, 9, 12, 15, 18, 24 and 30 months, then every year from 3; other countries have their own. The dentist every 6 months from the first tooth. Write your questions down before you go.') },
    { id: 'growth', icon: '📏', title: N_('Growth charts'), body: N_('Each measurement is compared with children of the same age and sex. The 50th percentile is the middle: half of children are smaller and half are bigger. Anywhere from the 3rd to the 97th is usual. What matters most is that your child keeps growing along their own line. The app uses the CDC growth charts; your doctor may use another, such as the WHO\'s.'),
      call: N_('Talk to your doctor if your child crosses two of the lines on the chart, stops growing, or loses weight.') },
  ];
  // School-age topics (6 to 12): AAP, AASM, WHO, NHS and CDC parent guidance.
  const SCHOOL = [
    { id: 'sleep', icon: '😴', title: N_('Sleep for school children'), body: N_('Children of 6 to 12 need 9 to 12 hours of sleep a night. A regular bedtime, at weekends too, and an hour to wind down without screens help. A tired child can seem restless, moody or unable to focus rather than sleepy. Tell your doctor about loud snoring most nights or pauses in breathing while asleep.') },
    { id: 'screens', icon: '🔒', title: N_('Screens and staying safe online'), body: N_('Agree on screen time together, so it doesn\'t crowd out sleep, homework, play and family meals, and keep devices out of the bedroom at night. Know the apps and games they use and set up parental controls. Teach them never to share personal details or photos, never to meet someone they only know online, and to tell you about anything that upsets them.') },
    { id: 'homework', icon: '📚', title: N_('Homework and reading'), body: N_('Reading together, or listening to them read, for 10 to 20 minutes most days helps more than anything else. Give homework a regular time and a quiet place, with you nearby but not doing it for them, and praise the effort more than the marks. If reading, writing or numbers are much harder for them than for their classmates, or they dread school, talk to the teacher.') },
    { id: 'friends', icon: '👨‍👩‍👧', title: N_('Friends and bullying'), body: N_('Friends matter more and more at this age: ask about their day, their friends and break times. Not wanting to go to school, lost or broken things, unexplained bruises, poor sleep or a change in mood can be signs of bullying. Listen calmly, tell them it isn\'t their fault, and talk to the school together.') },
    { id: 'active', icon: '🍽', title: N_('Food and staying active'), body: N_('Breakfast every day, three meals and one or two healthy snacks, water or milk rather than sugary drinks, and fruit or vegetables at every meal. Children need at least 60 minutes of activity a day that gets them out of breath: running, cycling, swimming, sports or active play.') },
    { id: 'teeth', icon: '🦷', title: N_('Teeth'), body: N_('Brush twice a day with a pea-sized amount of fluoride toothpaste, and keep helping or checking until they brush well on their own, often at 7 or 8. Baby teeth start to fall out at about 6, and the first adult back teeth come in behind them: ask the dentist about sealants. A mouthguard for contact sports.') },
    { id: 'wetting', icon: '🌙', title: N_('Bedwetting'), body: N_('Wetting the bed is common in young children, often runs in the family, and isn\'t their fault: they can\'t help it. A waterproof cover, the toilet before bed and no blame or punishment help most. Most children grow out of it.'),
      call: N_('Talk to your doctor if it still happens often after 7 or upsets your child, if a child who had been dry for months starts wetting again, or if there is pain when peeing, a fever, or wetting in the day.') },
    { id: 'worries', icon: '💛', title: N_('Worries and feelings'), body: N_('Worries are part of growing up. Look out for changes that last more than a couple of weeks: trouble sleeping, tummy aches before school, losing interest in friends or things they enjoyed, or being unusually tearful or angry. Make time to listen without rushing to fix it, and talk to your doctor if it goes on or gets in the way of school, friends or sleep.'),
      call: N_('If your child talks about hurting themselves or not wanting to be alive, take it seriously: stay with them and call your doctor or {sos} now.') },
    { id: 'puberty', icon: '🌿', title: N_('Puberty'), body: N_('Puberty usually starts between 8 and 13 in girls (breasts start to grow first) and between 9 and 14 in boys (the testicles get bigger first). Talk about the changes before they happen: periods, wet dreams, body hair, spots, body odour and feelings.'),
      call: N_('Talk to your doctor if the signs start before 8 in a girl or 9 in a boy, or haven\'t started by 13 in a girl or 14 in a boy.') },
    { id: 'lice', icon: '🔍', title: N_('Head lice'), body: N_('Head lice are common in school children and have nothing to do with being clean. To check, comb wet hair with conditioner and a fine-toothed detection comb. Treat only when you find a live louse: wet combing every few days for 2 weeks, or a treatment from the pharmacy, and check everyone at home.') },
    { id: 'safe', icon: '🚗', title: N_('Out and about'), body: N_('A helmet on bikes and scooters. A booster seat until the adult seat belt fits, usually between 8 and 12 years. Swimming lessons, and an adult watching near water. Practise crossing roads together: most children can\'t judge traffic safely on their own until about 10.') },
  ];
  // The teenage years (12 to 18): AAP, CDC, NHS and ACOG parent guidance.
  const TEEN = [
    { id: 'sleep', icon: '😴', title: N_('Sleep for teenagers'), body: N_('Teenagers need 8 to 10 hours of sleep. Their body clock moves later, so they feel awake at night and tired in the morning: a regular wake-up time, at weekends too, helps, and so does daylight in the morning. Phones and screens out of the bedroom at night make the biggest difference.') },
    { id: 'mind', icon: '💛', title: N_('Mental health'), body: N_('Moods swing in the teenage years, but sadness, worry, anger or withdrawal that lasts more than two weeks, falling marks, sleeping or eating much more or less, or self-harm (cuts, burns) need help. Ask how they are, listen without judging, and see your doctor together.'),
      call: N_('If your teenager talks about suicide or hurting themselves, take it seriously: stay with them, remove anything they could use to hurt themselves, and call {sos} or a crisis line now.') },
    { id: 'online', icon: '🔒', title: N_('Phones and life online'), body: N_('Agree on the rules together: no phones at meals or at night, and time for sleep, homework and friends. Talk about what they see online, about privacy and about photos: once sent, a picture can be shared. Tell them they can always come to you, without blame, if anything goes wrong or someone threatens them.') },
    { id: 'drugs', icon: '⚠', title: N_('Alcohol, vaping and drugs'), body: N_('Talk early and often, with facts rather than scare stories, and say what you expect. The teenage brain is still growing and is more easily harmed by alcohol, nicotine and cannabis. Offer a lift home at any hour, with no questions that night.') },
    { id: 'love', icon: '👨‍👩‍👧', title: N_('Relationships, sex and consent'), body: N_('Talk about respect and consent in friendships and relationships, about contraception and sexually transmitted infections, and about where they can get confidential advice and care. Teenagers who can talk to their parents tend to start later and stay safer. The HPV vaccine protects against several cancers.') },
    { id: 'periods', icon: '🩺', title: N_('Periods'), body: N_('Periods usually start at around 12, about two years after the breasts start to grow, but anywhere from 8 to 16 can be normal. Talk about them before they begin, and keep pads or period underwear ready.'),
      call: N_('Talk to your doctor if periods haven\'t started by 15, or if they are very heavy, very painful, or keep your teenager off school.') },
    { id: 'skin', icon: '🌿', title: N_('Spots and acne'), body: N_('Spots are common from puberty. Wash gently twice a day, don\'t squeeze, and try a pharmacy cream with benzoyl peroxide. See your doctor if acne is severe, leaves scars or upsets your teenager: there are treatments that work.') },
    { id: 'food', icon: '🍽', title: N_('Food, body image and sport'), body: N_('Regular meals, breakfast included, and an hour of activity a day. Notice comments about weight, skipped meals, a lot of exercise, or weight lost fast: eating disorders are easier to treat early, so see your doctor if you are worried.'),
      call: N_('After a knock to the head in sport, stop playing if there is a headache, dizziness, confusion or vomiting, and see a doctor the same day. Call {sos} if they pass out, have a seizure or keep vomiting.') },
    { id: 'driving', icon: '🚗', title: N_('Driving and getting about'), body: N_('New drivers have the most crashes in their first year. Practise together in all kinds of weather, agree on rules (no phone, no alcohol, a seat belt on every trip, few friends in the car at first), and keep wearing a helmet on bikes and scooters.') },
    { id: 'own', icon: '🔑', title: N_('Growing independence'), body: N_('Give them more say and more to do: their own money, cooking, booking their own appointments and seeing the doctor on their own for part of the visit. Respect their privacy while keeping them safe, and keep talking: at dinner, in the car, late at night.') },
  ];
  const STAGE_NOTES = {
    school: N_('The school years: friends, learning and growing independence. Children of 6 to 12 need 9 to 12 hours of sleep and at least an hour of active play a day. A yearly checkup, the dentist every 6 months, and the vaccines on your country\'s schedule.'),
    teen: N_('The teenage years: growing fast, more independence, and big changes in body and mood. Teenagers need 8 to 10 hours of sleep and at least an hour of activity a day. A yearly checkup, the dentist every 6 months, and the vaccines due on your country\'s schedule. Talk openly, and give them more say as they grow.'),
  };
  // Over-the-counter medicines: what is generally considered safe for babies, from what age, and what to watch for. No doses: they go by
  // weight and come from the pediatrician or pharmacist. Where the US (AAP / FDA) and the UK (NHS) set different ages, `age` has both
  // ({ us, uk }) and the one for where the phone is comes first. `where` says which regions a brand is mostly sold in, so the brands
  // people will find on their shelves are named first; brands not listed there are sold widely.
  const MEDS_INTRO = [N_('Under 3 months, call your pediatrician before giving any medicine, and straight away for a fever of 100.4°F (38°C) or more.'),
    N_('Doses go by weight, not age: ask your pediatrician or pharmacist, use the syringe that comes with the medicine (never a kitchen spoon), and log every dose under Health & meds so nobody gives a second one by mistake.')];
  const MEDS = [
    { id: 'fever', icon: '💊', title: N_('Fever and pain'), items: [
      { name: N_('Acetaminophen (paracetamol)'), brands: 'Infants\' Tylenol · Calpol · Panadol', where: { 'Infants\' Tylenol': 'na latam asia', Calpol: 'uk mea asia', Panadol: 'anz asia mea uk' },
        age: { us: N_('from 12 weeks, younger only if your pediatrician says'), uk: N_('from 2 months') },
        body: N_('For fever or pain, for example after vaccines. Never give more doses in 24 hours than the label or your doctor allows, and check other medicines for the same ingredient so it isn\'t doubled.') },
      { name: N_('Ibuprofen'), brands: 'Infants\' Motrin · Infants\' Advil · Nurofen for Children', where: { 'Infants\' Motrin': 'na', 'Infants\' Advil': 'na', 'Nurofen for Children': 'uk eu anz asia mea' },
        age: { us: N_('from 6 months'), uk: N_('from 3 months and over 5 kg (11 lb)') },
        body: N_('For fever or pain, best given with a feed. Not for a baby who is dehydrated (few wet diapers, vomiting) or has chickenpox; with asthma, ask first.') },
    ] },
    { id: 'colic', icon: '🍼', title: N_('Gas and colic'), items: [
      { name: N_('Simethicone gas drops'), brands: 'Mylicon · Infacol · Ovol', where: { Mylicon: 'na', Infacol: 'uk anz mea', Ovol: 'na' }, age: N_('From birth (check the label).'),
        body: N_('It stays in the gut and isn\'t absorbed, so it is considered safe. Studies haven\'t shown it eases colic, but many parents find it helps a gassy baby.') },
      { name: N_('Probiotic drops (L. reuteri)'), brands: 'BioGaia Protectis', age: N_('From birth.'),
        body: N_('Studies found less crying after two to three weeks in breastfed babies with colic. For formula-fed babies the evidence is unclear.') },
      { name: N_('Gripe water'), brands: 'Mommy\'s Bliss · Woodward\'s', where: { 'Mommy\'s Bliss': 'na', 'Woodward\'s': 'uk mea asia' }, age: N_('Usually from 1 month; check the label.'),
        body: N_('A herbal mix, often dill, fennel or ginger, with little evidence that it works. Choose one without alcohol or sugar. Some contain sodium bicarbonate (baking soda), which is not for regular use.') },
    ] },
    { id: 'nose', icon: '💧', title: N_('Stuffy nose and colds'), items: [
      { name: N_('Saline (salt water) drops or spray'), brands: 'Little Remedies · Ocean · Sterimar', where: { 'Little Remedies': 'na', Ocean: 'na', Sterimar: 'uk eu anz' }, age: N_('Any age.'),
        body: N_('A drop or two in each nostril loosens mucus. Follow with a bulb syringe or nasal aspirator, especially before feeds and sleep.') },
      { name: N_('Cool-mist humidifier'), brands: '', age: N_('Any age.'), body: N_('Moist air can ease a blocked nose. Clean it as the maker says.') },
    ], warn: N_('Cough and cold medicines (decongestants, cough syrups) are not for babies: the FDA says not under 2 years, the UK not under 6.') },
    { id: 'skin', icon: '👶', title: N_('Diaper rash and skin'), items: [
      { name: N_('Zinc oxide or petroleum jelly cream'), brands: 'Desitin · Sudocrem · Aquaphor · Vaseline · Bepanthen', where: { Desitin: 'na', Sudocrem: 'uk eu anz', Aquaphor: 'na', Bepanthen: 'uk eu anz asia mea' }, age: N_('From birth.'),
        body: N_('A thick layer at each change protects sore skin. Let it air-dry when you can.') },
      { name: N_('Fragrance-free moisturizer'), brands: 'Aquaphor · Cetaphil Baby · CeraVe Baby', where: { Aquaphor: 'na', 'CeraVe Baby': 'na uk' }, age: N_('From birth.'), body: N_('For dry or peeling skin and baby eczema.') },
      { name: N_('Hydrocortisone 1% cream'), brands: 'Cortizone-10', age: N_('Under 2 years, only if a doctor says.'),
        body: N_('A mild steroid for itchy rashes. Doctors sometimes suggest it for a short time for eczema or a stubborn diaper rash.') },
    ] },
    { id: 'teething', icon: '🧸', title: N_('Teething'), items: [
      { name: N_('Teething ring'), brands: N_('Firm rubber, cooled in the fridge (not frozen)'), age: N_('Any age.'),
        body: N_('Something cool and firm to chew on, or a clean finger rubbing the gums, is what pediatricians and the FDA suggest first.') },
      { name: N_('Pain relief'), brands: N_('Acetaminophen or ibuprofen'), age: N_('At the ages under Fever and pain.'), body: N_('For a baby who is really unsettled.') },
    ], warn: N_('Avoid numbing gels with benzocaine or lidocaine (Orajel, Anbesol): the FDA warns against them under 2 because of a rare, dangerous blood reaction. Avoid amber or teething necklaces and bracelets too: they can choke or strangle.') },
    { id: 'vitamins', icon: '☀️', title: N_('Vitamins'), items: [
      { name: N_('Vitamin D drops'), brands: 'D-Vi-Sol · Baby Ddrops · Abidec', where: { 'D-Vi-Sol': 'na', 'Baby Ddrops': 'na uk', Abidec: 'uk' }, age: N_('From soon after birth.'),
        body: N_('Breastfed and partly breastfed babies need vitamin D every day: 400 IU in the US, 8.5 to 10 micrograms in the UK. Babies having more than about 500 ml of formula a day get enough from the formula in the UK; in the US, ask your pediatrician.') },
      { name: N_('Iron drops'), brands: '', age: N_('Only if your pediatrician advises.'), body: N_('Some breastfed or premature babies need extra iron from around 4 months.') },
    ] },
    { id: 'herbal', icon: '🌿', title: N_('Homeopathic and herbal remedies'),
      note: N_('Many parents tell of good results with these. Studies haven\'t found homeopathic remedies to work better than a placebo, and they aren\'t tested for safety and strength the way medicines are. Treat them as optional extras, tell your pediatrician, and never use one instead of seeing a doctor when your baby is unwell.'),
      items: [
        { name: N_('Chamomilla teething drops'), brands: 'Camilia (Boiron)', age: N_('Check the label.'), body: N_('One of the remedies parents mention most for teething. Stop if your baby seems unwell or unusually sleepy.') },
        { name: N_('Homeopathic colic drops'), brands: 'Colic Calm', age: N_('Check the label.'),
          body: N_('Popular for gas and fussiness. It contains vegetable charcoal, which turns poop dark grey or black for a while: harmless, but easy to mistake for blood.') },
        { name: N_('Calendula cream'), brands: 'Weleda · Boiron', where: { Weleda: 'eu uk anz', Boiron: 'na eu' }, age: N_('From birth.'),
          body: N_('A gentle herbal cream parents like for diaper rash and dry skin. It is in the daisy family and rarely causes an allergy: stop if the rash gets worse.') },
        { name: N_('Arnica'), brands: N_('Pellets or gel'), age: N_('Check the label.'), body: N_('Used for bumps and bruises. The gel only goes on unbroken skin.') },
      ],
      warn: N_('Don\'t use homeopathic teething tablets or gels: the FDA warned against them in 2016 and 2017 after some were found to contain far more belladonna than the label said, with reports of seizures.') },
  ];
  // The emergency number where the phone is, for the regions that share one; elsewhere it differs from country to country.
  const SOS = { na: '911', uk: '999', eu: '112', anz: N_('000 (Australia) or 111 (New Zealand)') };
  const sos = region => SOS[region] || N_('your local emergency number');
  /** Guide text for a region: {sos} becomes its emergency number. */
  const local = (text, region) => text.replace(/\{sos\}/g, sos(region));
  /** Never give a baby these. */
  const NEVER = [N_('Aspirin, or anything containing it (it can cause Reye\'s syndrome)'), N_('Cough and cold medicines'), N_('Numbing teething gels (benzocaine, lidocaine)'),
    N_('Honey before 12 months, even in a remedy (it can cause infant botulism)'), N_('Adult medicines, or more than the label or your doctor says'),
    N_('Antihistamines (like Benadryl) or melatonin to make a baby sleep'), N_('Rubs with camphor or menthol (like Vicks VapoRub) under 2, or strong essential oils such as peppermint or eucalyptus near a baby\'s face'),
    N_('Teething necklaces and bracelets'), N_('Anything containing alcohol')];

  /** Whole months between the birth date (YYYY-MM-DD) and `now`. */
  function monthsOld(birth, now = Date.now()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return -1;
    const [y, m, d] = birth.split('-').map(Number), t = new Date(now);
    let n = (t.getFullYear() - y) * 12 + (t.getMonth() + 1 - m);
    if (t.getDate() < d) n--;
    return n;
  }
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  /** The pediatrician's details, kept in the encrypted profile. */
  const cleanDoctor = d => { d = d && typeof d === 'object' ? d : {}; return { name: str(d.name, 60), practice: str(d.practice, 80), phone: str(d.phone, 30), after: str(d.after, 30), address: str(d.address, 120), notes: str(d.notes, 200) }; };
  /** A person's own contact details, sealed with the log's key. */
  const cleanDetails = d => { d = d && typeof d === 'object' ? d : {}; return { relation: str(d.relation, 40), phone: str(d.phone, 30), work: str(d.work, 80), workPhone: str(d.workPhone, 30), notes: str(d.notes, 300) }; };
  /** A tel: link target, or '' when the text has no usable number. */
  const tel = p => { const n = String(p || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, ''); return n.replace(/\D/g, '').length >= 3 ? 'tel:' + n : ''; };
  return { COMMON, PICS, picSrc, credits, MILESTONES, TODDLER, CHECKS, SCHOOL, TEEN, STAGE_NOTES, MEDS_INTRO, MEDS, NEVER, sos, local, monthsOld, cleanDoctor, cleanDetails, tel };
})();
