'use strict';
/* Common infant formulas by region, for the formula list (the region where you are comes first: More → Where you are, or a guess from
   the phone's time zone), and learning a child's usual formula from the feeds: when every formula feed on three days running used the
   same one, that becomes the default until another one is used the same way. These are common brands, not every formula there is;
   anything else can be typed in. */
const Formulas = (() => {
  const REGIONS = [
    { id: 'na', name: N_('North America (US & Canada)'), items: ['Similac 360 Total Care', 'Similac 360 Total Care Sensitive', 'Similac Advance', 'Similac Pro-Advance', 'Similac Sensitive', 'Similac Total Comfort', 'Similac For Spit-Up', 'Similac Soy Isomil', 'Similac Alimentum', 'Similac NeoSure',
      'Enfamil NeuroPro', 'Enfamil NeuroPro Gentlease', 'Enfamil Enspire', 'Enfamil Infant', 'Enfamil Gentlease', 'Enfamil A.R.', 'Enfamil Reguline', 'Enfamil ProSobee', 'Enfamil Nutramigen', 'Enfamil EnfaCare',
      'Gerber Good Start GentlePro', 'Gerber Good Start SoothePro', 'Gerber Good Start Soy', 'Gerber Good Start Extensive HA', 'Nestlé Good Start (Canada)',
      'Bobbie Organic', "Earth's Best Organic", 'Happy Baby Organics', 'Kendamil Classic', 'Kendamil Organic', 'Kabrita Goat Milk',
      'Kirkland Signature ProCare', "Parent's Choice", 'up&up', "Member's Mark", 'Neocate Infant', 'EleCare', 'PurAmino', 'Alfamino Infant'] },
    { id: 'latam', name: N_('Latin America'), items: ['NAN Optipro', 'NAN Supreme Pro', 'NAN AR', 'NAN HA', 'Lactogen', 'Enfamil Premium', 'Enfamil Confort', 'Enfamil A.R.', 'Nutramigen',
      'Similac', 'Similac Total Comfort', 'Nutrilon', 'Aptamil', 'Frisolac Gold', 'S-26 Gold', 'Neocate', 'Alfamino'] },
    { id: 'br', name: N_('Brazil'), items: ['NAN Supreme Pro 1', 'NAN Comfor 1', 'NAN Soy', 'NAN A.R.', 'NAN Sem Lactose', 'Nestogeno 1', 'Aptamil Premium+ 1', 'Aptamil Profutura 1',
      'Aptamil ProExpert Pepti', 'Aptamil ProExpert AR', 'Aptamil ProExpert Sem Lactose', 'Milupa 1', 'Enfamil Premium 1', 'Enfamil Gentlease', 'Enfamil A.R.', 'Nutramigen Premium', 'Similac Advance',
      'Alfaré', 'Althéra', 'Pregomin Pepti', 'Neocate LCP', 'Alfamino'] },
    { id: 'uk', name: N_('UK & Ireland'), items: ['Aptamil First Infant Milk', 'Aptamil Profutura First Infant Milk', 'Aptamil Comfort', 'Aptamil Anti-Reflux', 'Aptamil Pepti',
      'Cow & Gate First Infant Milk', 'Cow & Gate Comfort', 'Cow & Gate Anti-Reflux', 'SMA PRO First Infant Milk', 'SMA Little Steps First Infant Milk', 'SMA Comfort', 'SMA Anti-Reflux', 'SMA Lactose Free',
      'Kendamil Classic First Infant Milk', 'Kendamil Organic First Infant Milk', 'Kendamil Goat First Infant Milk', 'HiPP Organic First Infant Milk', 'Kabrita Goat Milk', 'Mamia (Aldi)',
      'Nutramigen', 'Neocate LCP', 'Similac Alimentum'] },
    { id: 'eu', name: N_('Europe'), items: ['Aptamil Profutura', 'Aptamil Pronutra', 'Aptamil Comfort', 'Aptamil Anti-Reflux', 'Aptamil Pepti', 'HiPP Organic PRE', 'HiPP Organic Combiotic 1', 'HiPP HA', 'HiPP Comfort',
      'Holle Organic PRE', 'Holle Organic Goat', 'Lebenswert Bio', 'NAN Optipro', 'NAN Supreme Pro', 'NAN HA', 'NAN AR', 'BEBA Optipro', 'BEBA Supreme', 'Milupa Milumil', 'Nutrilon', 'Bebilon',
      'Gallia Calisma', 'Guigoz', 'Modilac', 'Novalac', 'Hero Baby', 'Kendamil', 'Neocate', 'Alfamino', 'Nutramigen'] },
    { id: 'anz', name: N_('Australia & New Zealand'), items: ['a2 Platinum Premium', 'Aptamil Gold+', 'Aptamil Profutura', 'Aptamil Essensis', 'Karicare', 'Alula Gold', 'NAN Optipro', 'NAN Supreme Pro',
      "Bellamy's Organic", 'Oli6 Goat', 'Bubs Goat', 'Bubs Organic', 'Kendamil', 'Novalac', 'Neocate', 'Alfamino', 'Nutramigen'] },
    { id: 'asia', name: N_('Asia'), items: ['Meiji Hohoemi', 'Morinaga Hagukumi', 'Glico Icreo', 'Wakodo Haihai', 'Bean Stalk Sukoyaka', 'Feihe', 'Yili', 'Junlebao', 'Beingmate', 'Namyang Imperial', 'Maeil Absolute',
      'Enfamil A+', 'Similac', 'NAN Optipro', 'Lactogen', 'Nestogen', 'S-26 Gold', 'Wyeth Illuma', 'Friso Gold', 'Aptamil', 'a2 Platinum', 'Dexolac', 'Neocate', 'Nutramigen'] },
    { id: 'mea', name: N_('Middle East & Africa'), items: ['Aptamil', 'NAN Optipro', 'NAN Supreme Pro', 'Similac Gold', 'Enfamil A+', 'S-26 Gold', 'Bebelac', 'Novalac', 'Lactogen', 'Nutrilon', 'Hero Baby', 'Blédilait',
      'Infacare', 'Neocate', 'Nutramigen'] },
  ];
  const ALL = new Set(REGIONS.flatMap(r => r.items));
  const LATAM = /^America\/(Argentina\/.*|Mexico_City|Monterrey|Merida|Cancun|Chihuahua|Ciudad_Juarez|Hermosillo|Mazatlan|Tijuana|Matamoros|Bahia_Banderas|Ojinaga|Guatemala|Belize|El_Salvador|Tegucigalpa|Managua|Costa_Rica|Panama|Havana|Santo_Domingo|Port-au-Prince|Jamaica|Bogota|Caracas|Lima|Guayaquil|La_Paz|Santiago|Punta_Arenas|Asuncion|Montevideo|Sao_Paulo|Bahia|Belem|Fortaleza|Recife|Maceio|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Boa_Vista|Araguaina|Santarem|Noronha|Cayenne|Paramaribo|Guyana)$/;
  const BRAZIL = /^America\/(Sao_Paulo|Bahia|Belem|Fortaleza|Recife|Maceio|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Boa_Vista|Araguaina|Santarem|Noronha|Eirunepe)$/;
  const MIDEAST = /^Asia\/(Dubai|Riyadh|Qatar|Kuwait|Bahrain|Muscat|Baghdad|Tehran|Jerusalem|Tel_Aviv|Amman|Beirut|Damascus|Aden|Gaza|Hebron|Nicosia|Famagusta)$/;
  /** Which region's list to show first, from the phone's time zone. */
  function regionFor(tz) {
    if (tz === undefined) { tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* no Intl */ } }
    if (/^Europe\/(London|Dublin|Belfast|Guernsey|Jersey|Isle_of_Man)$/.test(tz)) return 'uk';
    if (/^Europe\//.test(tz) || /^Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$/.test(tz)) return 'eu';
    if (/^(Australia\/|Pacific\/(Auckland|Chatham|Norfolk)$)/.test(tz)) return 'anz';
    if (/^Africa\//.test(tz) || MIDEAST.test(tz)) return 'mea';
    if (/^(Asia|Indian)\//.test(tz)) return 'asia';
    if (BRAZIL.test(tz)) return 'br';
    if (LATAM.test(tz)) return 'latam';
    return 'na';
  }
  /** The regions in the order to show them: `first` (a region id; by default the phone's, from its time zone) first. */
  const ordered = (first = regionFor()) => [...REGIONS].sort((a, b) => (b.id === first) - (a.id === first));
  const name = id => (REGIONS.find(r => r.id === id) || REGIONS[0]).name;
  const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  /** From one child's formula feeds ([{ ts, formula }]): the formula that became the usual one, the latest to be given at every formula
      feed on `days` days running (days without formula feeds don't break the run; a day with two formulas does), or ''. It stays the
      usual one through mixed days until another formula has its own run. The same on every phone, since it comes from the shared log. */
  function learned(feeds, days = 3) {
    const byDay = new Map();
    for (const f of feeds) {
      const name = String(f.formula || '').trim(); if (!name) continue;
      const k = dayKey(f.ts), d = byDay.get(k) || { ts: f.ts, names: new Map() };
      d.ts = Math.max(d.ts, f.ts); d.names.set(name.toLowerCase(), name); byDay.set(k, d);
    }
    let usual = '', key = null, run = 0;
    for (const d of [...byDay.values()].sort((a, b) => a.ts - b.ts)) {
      const one = d.names.size === 1 ? [...d.names.keys()][0] : null;
      run = one !== null && one === key ? run + 1 : one === null ? 0 : 1; key = one;
      if (run >= days) usual = d.names.get(one);   // (spelt as it was last given)
    }
    return usual;
  }
  return { REGIONS, regionFor, ordered, name, learned, known: f => ALL.has(f) };
})();
