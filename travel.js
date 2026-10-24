'use strict';
/* Travel mode. A trip (from one date to another, by car, plane, train or ship) turns the Day tab into a travel page for those days: a
   clock painted to match, its own set of colours, and one-tap logging, since there's rarely time to be exact on the move. The trip and
   the legs of the journey ("on the road since 1:05") are entries in the shared, end-to-end encrypted log, so every phone shows the same. */
const Travel = (() => {
  const MEANS = {
    car: { icon: '🚗', label: 'Car', by: 'by car', art: 'car', go: 'Set off', stop: 'Stopped for a break', moving: 'On the road', still: 'Not driving right now' },
    plane: { icon: '✈️', label: 'Plane', by: 'by plane', art: 'plane', go: 'Taking off', stop: 'Landed', moving: 'In the air', still: 'Not flying right now' },
    train: { icon: '🚆', label: 'Train', by: 'by train', art: 'train', go: 'Boarded', stop: 'Got off', moving: 'On the train', still: 'Not on the train right now' },
    ship: { icon: '🚢', label: 'Ship', by: 'by ship', art: 'ship', go: 'Set sail', stop: 'Docked', moving: 'At sea', still: 'In port' },
  };
  const KINDS = Object.keys(MEANS);
  // A few things worth knowing for each way of travelling (general guidance, as in the Guide).
  const TIPS = {
    car: ['Many car seat makers advise taking young babies out of the seat at least every 2 hours: plan stops for a stretch, a feed and a fresh diaper.',
      'Keep the straps snug, with no bulky coat or blanket under them; tuck a blanket over the top instead.',
      'Sleeping in the car seat is fine on the move. Once you arrive, move a sleeping baby onto a firm, flat surface.',
      'Never leave a baby alone in the car, even for a minute.'],
    plane: ['Feed, or offer a bottle or pacifier, during takeoff and landing: swallowing helps their ears.',
      'On longer flights, ask the airline for a bassinet seat.',
      'Baby milk, formula and food are allowed in hand luggage in sensible amounts; keep them ready to show at security.',
      'Pack a spare set of clothes for the baby, and a spare top for you.'],
    train: ['Use longer stops to walk around and stretch, and change diapers while the train is standing still.',
      'A sling or carrier keeps your hands free on platforms and stairs.',
      'Sit near the toilets or a changing area if you can.'],
    ship: ['Young babies rarely get seasick, but you may see more spit-up in rough water.',
      'Keep out of strong sun and wind on deck: shade, a hat and layers.',
      'Ask about a crib for the cabin, and where the medical centre is.'],
  };
  // The colours of a travel day's entries: the same six groups in their own set, visibly different from the home colours and checked the
  // same way (colour-blind separation of neighbouring rings, 3:1 or more on both clock faces, and on the dark cards for the dark steps).
  const PALETTE = {
    light: { sleep: '#12648f', feed: '#8b5f18', diaper: '#089772', vomit: '#116b1a', play: '#6032bb', health: '#e64887', poo: '#5c4033' },
    dark: { sleep: '#0a7fa9', feed: '#9b611b', diaper: '#41a986', vomit: '#3f7e10', play: '#7359db', health: '#de4d8e', poo: '#e6c9a8' },
  };
  const ACCENT = { light: '#0f6f78', dark: '#4fb3bd' };   // the trip card and the journey along the clock's outer track

  const isTravel = t => t === 'trip' || t === 'leg';
  const meansOf = e => (e && e.data && MEANS[e.data.means] ? e.data.means : 'car');
  /** When a trip ends (the morning after the return date); a broken one lasts a day. */
  const ends = e => (Number.isFinite(e.end) && e.end > e.ts ? e.end : e.ts + 864e5);
  const latest = list => list.sort((a, b) => (b.updated || 0) - (a.updated || 0))[0] || null;
  /** The trip going on at moment t (the last one changed, if two overlap). */
  const at = (events, t) => latest(events.filter(e => e.type === 'trip' && e.ts <= t && t < ends(e)));
  /** A trip covering any part of [from, to). */
  const during = (events, from, to) => latest(events.filter(e => e.type === 'trip' && e.ts < to && ends(e) > from));
  /** The next trip that hasn't started yet. */
  const upcoming = (events, now) => events.filter(e => e.type === 'trip' && e.ts > now).sort((a, b) => a.ts - b.ts)[0] || null;
  /** Legs of the journey overlapping [from, to); one still under way counts up to `now`. */
  const legs = (events, from, to, now) => events.filter(e => e.type === 'leg' && e.ts < to && (Number.isFinite(e.end) ? e.end : now) > from);
  /** The leg under way, if any. */
  const moving = events => latest(events.filter(e => e.type === 'leg' && !Number.isFinite(e.end)));
  return { MEANS, KINDS, TIPS, PALETTE, ACCENT, isTravel, meansOf, ends, at, during, upcoming, legs, moving };
})();
