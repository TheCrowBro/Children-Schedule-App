'use strict';
/* The Guide tab: things parents commonly run into with a newborn, over-the-counter medicines, month-by-month milestones, and the
   pediatrician's details. General information only, written from AAP / CDC / FDA and NHS parent guidance; it is not medical advice and
   every card says when to call. */
const Guide = (() => {
  // Each item: what it is, what's normal, and when to call. `urgent` lines are the "call now / emergency" signs.
  const COMMON = [
    { id: 'blue', icon: '💧', title: 'Blue hands and feet', body: 'Very common in the first days. A newborn\'s circulation is still settling, so hands and feet can look bluish or purple, especially when cold, while the lips, tongue and face stay pink.',
      call: 'Call 911 if the lips, tongue or face look blue or grey, or your baby is struggling to breathe.' },
    { id: 'belly', icon: '🩺', title: 'A bulge in the belly', body: 'A soft bulge at the belly button that gets bigger when crying is usually an umbilical hernia. It often closes on its own in the first years. A ridge down the middle of the tummy when straining is the belly muscles not yet joined (diastasis recti) and usually goes away as your baby grows.',
      call: 'Call your pediatrician straight away if a bulge is hard, tender or discoloured, can\'t be gently pushed back, or comes with vomiting.' },
    { id: 'hips', icon: '🧸', title: 'Clicking joints and hips', body: 'Soft clicks from knees, shoulders and hips are common as ligaments stretch. Doctors check the hips at every early checkup.',
      call: 'Mention it at the next visit if you feel a "clunk" in a hip, the skin folds on the thighs look uneven, the legs look different lengths, or one leg moves less.' },
    { id: 'jaundice', icon: '🩺', title: 'Yellow skin (jaundice)', body: 'Mild yellowing of the skin and eyes is common between days 2 and 5 and usually fades within two weeks. Frequent feeds help.',
      call: 'Call if yellow appears in the first 24 hours, spreads to the belly or legs, lasts more than two weeks, or your baby is very sleepy or feeding poorly. Pale or chalky poop or dark urine also needs a call.' },
    { id: 'cord', icon: '🩺', title: 'Umbilical cord stump', body: 'Keep it clean and dry and let it fall off by itself, usually in 1 to 3 weeks. A little crust or a spot of blood when it comes off is normal.',
      call: 'Call if the skin around it turns red, there is pus or a bad smell, bleeding doesn\'t stop with gentle pressure, or your baby has a fever.' },
    { id: 'spit', icon: '🤮', title: 'Spit-up', body: 'Most babies spit up, often after feeds or with burps. If your baby is growing and content, it is usually just "laundry".',
      call: 'Call if vomiting is forceful or projectile (especially between 2 and 8 weeks), contains blood, or your baby has fewer wet diapers. Green vomit needs a doctor straight away.' },
    { id: 'poop', icon: '💩', title: 'Poop colours', body: 'The first poops are black and sticky (meconium), then green, then yellow and seedy for breastfed babies or tan and firmer with formula. How often varies a lot.',
      call: 'Call about white, pale grey or chalky poop, red or bloody poop, or black poop after the first few days.' },
    { id: 'diapers', icon: '💧', title: 'How many wet diapers', body: 'Expect about one wet diaper per day of age for the first few days, then at least 6 wet diapers a day from about day 5.',
      call: 'Call if there are fewer than 6 wet diapers a day after the first week, a dry diaper for 6 hours or more, or a sunken soft spot.' },
    { id: 'breathing', icon: '😴', title: 'Noisy or irregular breathing', body: 'Sneezing, snuffly noses, hiccups and breathing that speeds up and slows down with short pauses (under about 10 seconds) are normal in newborns.',
      call: 'Call 911 for pauses of 20 seconds or more, blue colour, or hard work to breathe: skin pulling in between the ribs, flaring nostrils, or grunting with every breath.' },
    { id: 'fever', icon: '🩺', title: 'Fever under 3 months', body: 'Take the temperature rectally for an accurate reading in young babies. A fever is 100.4°F (38°C) or higher.',
      call: 'Under 3 months, any fever of 100.4°F (38°C) or higher means calling your pediatrician or going to the emergency room now, even if your baby seems well.' },
    { id: 'skin', icon: '🧸', title: 'Spots, rashes and peeling', body: 'Tiny white bumps (milia), baby acne, blotchy red newborn rash, dry peeling skin and cradle cap are common and harmless. Gentle washing is all they need.',
      call: 'Call about blisters, pus-filled spots, a rash with a fever, or purple-red spots that don\'t fade when pressed.' },
    { id: 'crying', icon: '🌙', title: 'Crying and colic', body: 'Crying usually peaks around 6 weeks and eases by 3 to 4 months. Colic is crying for 3 hours or more a day, on 3 or more days a week, in a healthy baby. Swaddling, rocking, white noise and walks can help.',
      call: 'Never shake a baby. If you feel overwhelmed, put your baby down safely on their back and take a break. Call if the cry sounds unusual or high-pitched, or comes with fever, vomiting or poor feeding.' },
    { id: 'jerks', icon: '😴', title: 'Startles, jerks and a trembling chin', body: 'The startle (Moro) reflex, jerky arm movements and a quivering chin are normal as the nervous system matures.',
      call: 'Call if there is rhythmic jerking that doesn\'t stop when you gently hold the limb, or jerking with staring or not responding.' },
    { id: 'eyes', icon: '🧸', title: 'Crossed or wandering eyes', body: 'Eyes that cross or drift now and then are common in the first months while the eye muscles strengthen.',
      call: 'Mention it if an eye turns in or out all the time, or still wanders after about 4 months.' },
    { id: 'hormones', icon: '🩺', title: 'Swollen breasts or genitals', body: 'Hormones from pregnancy can cause swollen breasts (even a little milky fluid) and swollen genitals. Baby girls may have a little white or blood-tinged discharge. It settles in a few weeks.',
      call: 'Call if a breast is red, hot or tender.' },
    { id: 'weight', icon: '🍼', title: 'Weight in the first weeks', body: 'Losing some weight (up to about 7 to 10%) in the first days is normal. Most babies are back to birth weight by 10 to 14 days.',
      call: 'Call if your baby isn\'t feeding well, seems weak or very sleepy, or the scale at checkups is worrying.' },
    { id: 'sleep', icon: '😴', title: 'Safe sleep', body: 'Every sleep: on the back, on a firm flat mattress, in their own crib or bassinet in your room, with nothing else in it. No pillows, bumpers, blankets or soft toys, and never on a couch or armchair.',
      call: '' },
    { id: 'fontanelle', icon: '🩺', title: 'Soft spots', body: 'The soft spots on the head are normal and protected by tough tissue. They may pulse or bulge slightly when your baby cries.',
      call: 'Call if a soft spot looks sunken (a sign of dehydration) or bulges while your baby is calm and upright.' },
  ];

  // Month-by-month. CDC milestone checklists exist for 2, 4, 6, 9, 12, 15, 18 and 24 months; other months describe what is common.
  const MILESTONES = {
    1: { title: '1 month', does: ['Lifts head briefly during tummy time', 'Focuses on faces about 8 to 12 inches away', 'Startles at loud sounds'],
      notice: ['Growth spurts around 2 to 3 weeks and 6 weeks: more frequent "cluster" feeds', 'Fussiness often builds towards a peak around 6 weeks'], visit: '1-month checkup' },
    2: { title: '2 months', does: ['Calms down when spoken to or picked up', 'Smiles when you talk or smile', 'Makes sounds other than crying (cooing)', 'Holds head up during tummy time'],
      notice: ['Longer awake times and more eye contact'], visit: '2-month checkup and vaccines', ask: 'Ask your pediatrician if your baby doesn\'t respond to loud sounds, doesn\'t watch things as they move, or doesn\'t smile at people.' },
    3: { title: '3 months', does: ['Follows moving things with the eyes', 'Brings hands to mouth', 'Pushes up on forearms during tummy time', 'May start laughing'],
      notice: ['Some babies sleep longer stretches at night', 'Lots of hand-watching and swiping at toys'] },
    4: { title: '4 months', does: ['Chuckles when you try to make them laugh', 'Holds head steady without support when held', 'Holds a toy put in their hand', 'Brings hands to mouth and may roll from tummy to back'],
      notice: ['Sleep often changes around now (the "4-month sleep regression")', 'Drooling and chewing on everything'], visit: '4-month checkup and vaccines', ask: 'Ask your pediatrician if your baby doesn\'t hold their head steady, doesn\'t coo or make sounds, or doesn\'t bring things to their mouth.' },
    5: { title: '5 months', does: ['Rolls from tummy to back, and maybe back to tummy', 'Reaches for and grabs toys', 'Blows raspberries and squeals'],
      notice: ['Lots of drooling (not always teething)', 'More interest in what you are eating'] },
    6: { title: '6 months', does: ['Laughs and knows familiar people', 'Rolls from tummy to back', 'Leans on hands to support themselves when sitting', 'Puts things in the mouth to explore them'],
      notice: ['Solid foods often start around now: ask your pediatrician', 'First teeth arrive for many babies between 6 and 10 months'], visit: '6-month checkup and vaccines', ask: 'Ask your pediatrician if your baby doesn\'t reach for things, doesn\'t show affection for caregivers, or doesn\'t make vowel sounds.' },
    7: { title: '7 months', does: ['Sits without support for a moment or longer', 'Babbles strings like "ba-ba-ba"', 'Moves toys from one hand to the other'],
      notice: ['May become wary of strangers', 'Time to start baby-proofing: low cupboards, cords, outlets'] },
    8: { title: '8 months', does: ['Crawls, scoots or rolls to get around', 'Starts picking up small things between thumb and finger', 'Responds to their name'],
      notice: ['Separation anxiety: upset when you leave the room', 'Night waking can return for a while'] },
    9: { title: '9 months', does: ['Sits without support', 'Looks for things you drop or hide', 'Makes sounds like "mamamama" and "babababa"', 'May be shy or clingy with strangers'],
      notice: ['Pulling up on furniture is common soon'], visit: '9-month checkup', ask: 'Ask your pediatrician if your baby doesn\'t sit with help, doesn\'t respond to their name, or doesn\'t babble.' },
    10: { title: '10 months', does: ['Pulls up to stand', 'Cruises along furniture', 'Waves bye-bye or claps'],
      notice: ['Gates on stairs and anchored furniture matter now'] },
    11: { title: '11 months', does: ['Stands alone for a few seconds', 'Says "mama" or "dada" with meaning', 'Understands "no"'],
      notice: ['Lots of throwing and dropping things to see what happens'] },
    12: { title: '12 months', does: ['Waves bye-bye', 'Calls a parent "mama", "dada" or another special name', 'Pulls up to stand and walks holding on to furniture', 'Picks up small things with thumb and finger'],
      notice: ['Many babies move to whole milk around now: ask your pediatrician', 'First steps can come any time from about 9 to 18 months'], visit: '12-month checkup and vaccines', ask: 'Ask your pediatrician if your baby doesn\'t crawl, can\'t stand with support, doesn\'t say single words like "mama", or doesn\'t point.' },
    15: { title: '15 months', does: ['Takes a few steps alone', 'Says one or two words besides "mama" or "dada"', 'Points to ask for something'], notice: [], visit: '15-month checkup' },
    18: { title: '18 months', does: ['Walks without holding on', 'Tries to say three or more words', 'Follows one-step directions', 'Scribbles'], notice: [], visit: '18-month checkup' },
    24: { title: '2 years', does: ['Kicks a ball', 'Says at least two words together, like "more milk"', 'Points to things in a book when you ask'], notice: [], visit: '2-year checkup' },
  };
  // Over-the-counter medicines: what is generally considered safe for babies, from what age, and what to watch for. No doses: they go by
  // weight and come from the pediatrician or pharmacist. Where the US (AAP / FDA) and the UK (NHS) set different ages, both are shown.
  const MEDS_INTRO = ['Under 3 months, call your pediatrician before giving any medicine, and straight away for a fever of 100.4°F (38°C) or more.',
    'Doses go by weight, not age: ask your pediatrician or pharmacist, use the syringe that comes with the medicine (never a kitchen spoon), and log every dose under Health & meds so nobody gives a second one by mistake.'];
  const MEDS = [
    { id: 'fever', icon: '💊', title: 'Fever and pain', items: [
      { name: 'Acetaminophen (paracetamol)', brands: 'Infants\' Tylenol · Calpol · Panadol', age: 'US: from 12 weeks, younger only if your pediatrician says. UK: from 2 months.',
        body: 'For fever or pain, for example after vaccines. Never give more doses in 24 hours than the label or your doctor allows, and check other medicines for the same ingredient so it isn\'t doubled.' },
      { name: 'Ibuprofen', brands: 'Infants\' Motrin · Infants\' Advil · Nurofen for Children', age: 'US: from 6 months. UK: from 3 months and over 5 kg (11 lb).',
        body: 'For fever or pain, best given with a feed. Not for a baby who is dehydrated (few wet diapers, vomiting) or has chickenpox; with asthma, ask first.' },
    ] },
    { id: 'colic', icon: '🍼', title: 'Gas and colic', items: [
      { name: 'Simethicone gas drops', brands: 'Mylicon · Infacol · Ovol', age: 'From birth (check the label).',
        body: 'It stays in the gut and isn\'t absorbed, so it is considered safe. Studies haven\'t shown it eases colic, but many parents find it helps a gassy baby.' },
      { name: 'Probiotic drops (L. reuteri)', brands: 'BioGaia Protectis', age: 'From birth.',
        body: 'Studies found less crying after two to three weeks in breastfed babies with colic. For formula-fed babies the evidence is unclear.' },
      { name: 'Gripe water', brands: 'Mommy\'s Bliss · Woodward\'s', age: 'Usually from 1 month; check the label.',
        body: 'A herbal mix, often dill, fennel or ginger, with little evidence that it works. Choose one without alcohol or sugar. Some contain sodium bicarbonate (baking soda), which is not for regular use.' },
    ] },
    { id: 'nose', icon: '💧', title: 'Stuffy nose and colds', items: [
      { name: 'Saline (salt water) drops or spray', brands: 'Little Remedies · Ocean · Sterimar', age: 'Any age.',
        body: 'A drop or two in each nostril loosens mucus. Follow with a bulb syringe or nasal aspirator, especially before feeds and sleep.' },
      { name: 'Cool-mist humidifier', brands: '', age: 'Any age.', body: 'Moist air can ease a blocked nose. Clean it as the maker says.' },
    ], warn: 'Cough and cold medicines (decongestants, cough syrups) are not for babies: the FDA says not under 2 years, the UK not under 6.' },
    { id: 'skin', icon: '👶', title: 'Diaper rash and skin', items: [
      { name: 'Zinc oxide or petroleum jelly cream', brands: 'Desitin · Sudocrem · Aquaphor · Vaseline · Bepanthen', age: 'From birth.',
        body: 'A thick layer at each change protects sore skin. Let it air-dry when you can.' },
      { name: 'Fragrance-free moisturizer', brands: 'Aquaphor · Cetaphil Baby · CeraVe Baby', age: 'From birth.', body: 'For dry or peeling skin and baby eczema.' },
      { name: 'Hydrocortisone 1% cream', brands: 'Cortizone-10', age: 'Under 2 years, only if a doctor says.',
        body: 'A mild steroid for itchy rashes. Doctors sometimes suggest it for a short time for eczema or a stubborn diaper rash.' },
    ] },
    { id: 'teething', icon: '🧸', title: 'Teething', items: [
      { name: 'Teething ring', brands: 'Firm rubber, cooled in the fridge (not frozen)', age: 'Any age.',
        body: 'Something cool and firm to chew on, or a clean finger rubbing the gums, is what pediatricians and the FDA suggest first.' },
      { name: 'Pain relief', brands: 'Acetaminophen or ibuprofen', age: 'At the ages under Fever and pain.', body: 'For a baby who is really unsettled.' },
    ], warn: 'Avoid numbing gels with benzocaine or lidocaine (Orajel, Anbesol): the FDA warns against them under 2 because of a rare, dangerous blood reaction. Avoid amber or teething necklaces and bracelets too: they can choke or strangle.' },
    { id: 'vitamins', icon: '☀️', title: 'Vitamins', items: [
      { name: 'Vitamin D drops', brands: 'D-Vi-Sol · Baby Ddrops · Abidec', age: 'From soon after birth.',
        body: 'Breastfed and partly breastfed babies need vitamin D every day: 400 IU in the US, 8.5 to 10 micrograms in the UK. Babies having more than about 500 ml of formula a day get enough from the formula in the UK; in the US, ask your pediatrician.' },
      { name: 'Iron drops', brands: '', age: 'Only if your pediatrician advises.', body: 'Some breastfed or premature babies need extra iron from around 4 months.' },
    ] },
    { id: 'herbal', icon: '🌿', title: 'Homeopathic and herbal remedies',
      note: 'Many parents tell of good results with these. Studies haven\'t found homeopathic remedies to work better than a placebo, and they aren\'t tested for safety and strength the way medicines are. Treat them as optional extras, tell your pediatrician, and never use one instead of seeing a doctor when your baby is unwell.',
      items: [
        { name: 'Chamomilla teething drops', brands: 'Camilia (Boiron)', age: 'Check the label.', body: 'One of the remedies parents mention most for teething. Stop if your baby seems unwell or unusually sleepy.' },
        { name: 'Homeopathic colic drops', brands: 'Colic Calm', age: 'Check the label.',
          body: 'Popular for gas and fussiness. It contains vegetable charcoal, which turns poop dark grey or black for a while: harmless, but easy to mistake for blood.' },
        { name: 'Calendula cream', brands: 'Weleda · Boiron', age: 'From birth.',
          body: 'A gentle herbal cream parents like for diaper rash and dry skin. It is in the daisy family and rarely causes an allergy: stop if the rash gets worse.' },
        { name: 'Arnica', brands: 'Pellets or gel', age: 'Check the label.', body: 'Used for bumps and bruises. The gel only goes on unbroken skin.' },
      ],
      warn: 'Don\'t use homeopathic teething tablets or gels: the FDA warned against them in 2016 and 2017 after some were found to contain far more belladonna than the label said, with reports of seizures.' },
  ];
  /** Never give a baby these. */
  const NEVER = ['Aspirin, or anything containing it (it can cause Reye\'s syndrome)', 'Cough and cold medicines', 'Numbing teething gels (benzocaine, lidocaine)',
    'Honey before 12 months, even in a remedy (it can cause infant botulism)', 'Adult medicines, or more than the label or your doctor says',
    'Antihistamines (like Benadryl) or melatonin to make a baby sleep', 'Rubs with camphor or menthol (like Vicks VapoRub) under 2, or strong essential oils such as peppermint or eucalyptus near a baby\'s face',
    'Teething necklaces and bracelets', 'Anything containing alcohol'];

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
  return { COMMON, MILESTONES, MEDS_INTRO, MEDS, NEVER, monthsOld, cleanDoctor, cleanDetails, tel };
})();
