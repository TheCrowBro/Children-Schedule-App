'use strict';
/* The birds on the family tree sing when tapped: a few seconds of each bird's own song or call, from recordings on Wikimedia Commons
   under free licences (CREDITS below, audio/birds/CREDITS.md, and in the app under Guide → Picture and sound credits). One bird sings
   at a time; a tap while one sings starts the new one. The files are small MP3s in audio/birds (the single-page demo embeds them). */
const Birdsong = (() => {
  // the birds of each tree (ftree.js), by the key the tree uses, with the name shown to people and the species recorded
  const NAMES = {
    robin: N_('European robin'), bluetit: N_('Blue tit'), cardinal: N_('Northern cardinal'), bluebird: N_('Eastern bluebird'), greattit: N_('Great tit'),
    bullfinch: N_('Bullfinch'), goldfinch: N_('Goldfinch'), sparrow: N_('House sparrow'), rosella: N_('Crimson rosella'), fairywren: N_('Superb fairywren'),
    whiteeye: N_('Warbling white-eye'), parakeet: N_('Rose-ringed parakeet'), myna: N_('Common myna'), sunbird: N_('Purple sunbird'), oriole: N_('Golden oriole'),
    roller: N_('Lilac-breasted roller'), weaver: N_('Village weaver'), kiskadee: N_('Great kiskadee'), hummingbird: N_('Sparkling violetear (a hummingbird)'),
  };
  // who recorded each song, under which licence, and where it comes from (filled in from the recordings chosen: see audio/birds/CREDITS.md)
  const CREDITS = [
    { key: 'bluebird', species: 'Sialia sialis', by: "Jonathon Jongsma", lic: 'CC BY-SA 3.0', page: "https://commons.wikimedia.org/wiki/File:Sialia_sialis_-_Eastern_Bluebird_-_XC79976.ogg" },
    { key: 'bluetit', species: 'Cyanistes caeruleus', by: "Marie-Lan Taÿ Pamart", lic: 'CC BY-SA 4.0', page: "https://commons.wikimedia.org/wiki/File:Cyanistes_caeruleus_-_Eurasian_Blue_Tit_XC510545.mp3" },
    { key: 'bullfinch', species: 'Pyrrhula pyrrhula', by: "The British Library", lic: 'CC BY-SA 4.0', page: "https://commons.wikimedia.org/wiki/File:Bullfinch_(Pyrrhula_pyrrhula)_(W1CDR0001509_BD14).ogg" },
    { key: 'cardinal', species: 'Cardinalis cardinalis', by: "Jonathon Jongsma", lic: 'CC BY-SA 3.0', page: "https://commons.wikimedia.org/wiki/File:Cardinalis_cardinalis_cardinalis_-_Northern_Cardinal_-_XC112830.ogg" },
    { key: 'fairywren', species: 'Malurus coronatus', note: N_("a purple-crowned fairywren, its close cousin"), by: "Hall M, Kingma S, Peters A (PLOS ONE)", lic: 'CC BY 2.5', page: "https://commons.wikimedia.org/wiki/File:Male-Songbird-Indicates-Body-Size-with-Low-Pitched-Advertising-Songs-pone.0056717.s003.oga" },
    { key: 'goldfinch', species: 'Carduelis carduelis', by: "Sander Pieterse", lic: 'CC BY-SA 4.0', page: "https://commons.wikimedia.org/wiki/File:XC101464_-_Putter_-_Carduelis_carduelis.ogg" },
    { key: 'greattit', species: 'Parus major', by: "Gavin Vella", lic: 'CC BY-SA 3.0', page: "https://commons.wikimedia.org/wiki/File:Parus_major_-_Great_Tit_XC129643.ogg" },
    { key: 'hummingbird', species: 'Colibri coruscans', by: "Dballesterosr", lic: 'CC BY-SA 4.0', page: "https://commons.wikimedia.org/wiki/File:Colibri_Coruscans.wav" },
    { key: 'kiskadee', species: 'Pitangus sulphuratus', by: "Eurico Zimbres", lic: 'CC BY-SA 2.5', page: "https://commons.wikimedia.org/wiki/File:Pitangus_sulphuratus_call.ogg" },
    { key: 'myna', species: 'Acridotheres tristis', by: "L. Shyamal", lic: 'CC BY-SA 2.5', page: "https://commons.wikimedia.org/wiki/File:CommonMynaCalls.ogg" },
    { key: 'oriole', species: 'Oriolus oriolus', by: "Vladimir Yu. Arkhipov, Arkhivov", lic: 'CC BY-SA 3.0', page: "https://commons.wikimedia.org/wiki/File:Oriolus_oriolus_voice.ogg" },
    { key: 'parakeet', species: 'Psittacula krameri', by: "Sander Pieterse", lic: 'CC BY-SA 3.0', page: "https://commons.wikimedia.org/wiki/File:Psittacula_krameri_-_Rose-ringed_Parakeet_XC35091.mp3" },
    { key: 'robin', species: 'Erithacus rubecula', by: "Joost van Bruggen", lic: 'CC BY-SA 4.0', page: "https://commons.wikimedia.org/wiki/File:Erithacus_rubecula_-_European_Robin_XC436940.mp3" },
    { key: 'roller', species: 'Coracias caudatus', by: "unknown (public domain)", lic: 'Public domain', page: "https://commons.wikimedia.org/wiki/File:Coracias_caudatus_caudatus%2C_roep_in_vlug_te_Krokodilspruit%2C_2022-05-28_13h18%2C_a.ogg" },
    { key: 'rosella', species: 'Platycercus eximius', note: N_("an eastern rosella, its close cousin"), by: "Oceancetaceen Alice Chodura", lic: 'CC BY-SA 3.0', page: "https://commons.wikimedia.org/wiki/File:EasternRosella_singing.ogg" },
    { key: 'sparrow', species: 'Passer domesticus', by: "Jonathon Jongsma", lic: 'CC BY-SA 3.0', page: "https://commons.wikimedia.org/wiki/File:Passer_domesticus_-_House_Sparrow_-_XC86749.ogg" },
    { key: 'sunbird', species: 'Cinnyris asiaticus', by: "Sharadapte", lic: 'CC BY-SA 4.0', page: "https://commons.wikimedia.org/wiki/File:Purple_sunbird_song_recorded_in_April_2023_at_Sangli.wav" },
    { key: 'weaver', species: 'Ploceus cucullatus', by: "Anne Ndung'u", lic: 'CC BY-SA 4.0', page: "https://commons.wikimedia.org/wiki/File:Ploceus_cucullatus_-_Village_Weaver_XC405117.mp3" },
    { key: 'whiteeye', species: 'Zosterops japonicus', by: "National Institute of Biological Resources, Korea (국립생물자원관)", lic: 'KOGL Type 1', page: "https://commons.wikimedia.org/wiki/File:%EB%8F%99%EB%B0%95%EC%83%88.ogg" },
  ];
  const LICENCES = { 'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/', 'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
    'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/', 'CC BY-SA 2.5': 'https://creativecommons.org/licenses/by-sa/2.5/', 'CC BY 2.5': 'https://creativecommons.org/licenses/by/2.5/',
    'KOGL Type 1': 'https://www.kogl.or.kr/info/licenseType1.do', 'Public domain': '' };
  /** Where a bird's song file is (the single-page demo swaps this for copies embedded in the page). */
  let src = key => 'audio/birds/' + key + '.mp3';
  let playing = null;
  /** Play a bird's song (a few seconds). Resolves when it starts, or quietly does nothing where sound is not available. */
  async function play(key) {
    if (!NAMES[key]) return false;
    try {
      if (playing) { playing.pause(); playing = null; }
      const a = new window.Audio(src(key)); a.preload = 'auto'; playing = a;
      a.onended = () => { if (playing === a) playing = null; };
      await a.play(); return true;
    } catch (e) { playing = null; return false; }   // (no sound here, or the file is missing: the bird still bobs)
  }
  const names = () => Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [k, __(v)]));
  const credits = () => CREDITS.map(c => ({ ...c, name: NAMES[c.key], licUrl: LICENCES[c.lic] || '' }));
  return { NAMES, play, names, credits, get src() { return src; }, set src(f) { src = f; }, get playing() { return playing; } };
})();
