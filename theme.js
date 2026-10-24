'use strict';
/* Light or dark: chosen, matching the phone, or following sunrise and sunset where the phone is (estimated from its time zone, so no
   location permission is needed). Switching plays a short sunset (into dark) or sunrise (into light) across the screen. Loaded in <head>
   so the very first paint is already in the right theme. The choice is kept on this phone. */
const Theme = (() => {
  const KEY = 'll.theme', MODES = ['system', 'light', 'dark', 'sun'], root = document.documentElement;
  let mode = 'system';
  try { const m = localStorage.getItem(KEY); if (MODES.includes(m)) mode = m; } catch (e) { /* storage blocked: follow the phone */ }
  const mq = q => (window.matchMedia ? matchMedia(q) : null), darkMq = mq('(prefers-color-scheme: dark)'), calmMq = mq('(prefers-reduced-motion: reduce)');
  // (a page hosting the app, like the shared demo, may say light or dark itself; otherwise the phone decides)
  const systemDark = () => { const t = root.dataset.theme; return t ? t === 'dark' : !!(darkMq && darkMq.matches); };

  // ---- sunrise and sunset (NOAA's approximation) on the local date of `t`, for a place --------------------------------------------
  function sunTimes(t, lat, lon) {
    const d = new Date(t), y = d.getFullYear(), m = d.getMonth(), day = d.getDate(), base = Date.UTC(y, m, day), rad = Math.PI / 180;
    const g = ((2 * Math.PI) / 365) * (Math.round((base - Date.UTC(y, 0, 0)) / 864e5) - 1);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const cosH = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
    if (cosH > 1) return { polar: 'night' };   // the sun doesn't rise today
    if (cosH < -1) return { polar: 'day' };    // or doesn't set
    const H = Math.acos(cosH) / rad;
    return { rise: base + (720 - 4 * (lon + H) - eq) * 6e4, set: base + (720 - 4 * (lon - H) - eq) * 6e4, polar: null };
  }
  // Where the phone roughly is: the main city of its time zone ([latitude, longitude]); otherwise a guess from the clock's UTC offset.
  const ZONES = {
    'America/New_York': [40.71, -74.01], 'America/Detroit': [42.33, -83.05], 'America/Toronto': [43.65, -79.38], 'America/Montreal': [45.5, -73.57], 'America/Indiana/Indianapolis': [39.77, -86.16],
    'America/Chicago': [41.88, -87.63], 'America/Winnipeg': [49.9, -97.14], 'America/Regina': [50.45, -104.61], 'America/Denver': [39.74, -104.99], 'America/Edmonton': [53.55, -113.49],
    'America/Boise': [43.62, -116.2], 'America/Phoenix': [33.45, -112.07], 'America/Los_Angeles': [34.05, -118.24], 'America/Vancouver': [49.28, -123.12], 'America/Tijuana': [32.51, -117.04],
    'America/Anchorage': [61.22, -149.9], 'Pacific/Honolulu': [21.31, -157.86], 'America/Halifax': [44.65, -63.57], 'America/St_Johns': [47.56, -52.71], 'America/Puerto_Rico': [18.47, -66.11],
    'America/Mexico_City': [19.43, -99.13], 'America/Monterrey': [25.69, -100.32], 'America/Guatemala': [14.63, -90.51], 'America/Panama': [8.98, -79.52], 'America/Havana': [23.11, -82.37],
    'America/Bogota': [4.71, -74.07], 'America/Lima': [-12.05, -77.04], 'America/Caracas': [10.48, -66.9], 'America/Santiago': [-33.45, -70.67], 'America/Argentina/Buenos_Aires': [-34.6, -58.38],
    'America/Sao_Paulo': [-23.55, -46.63], 'Atlantic/Reykjavik': [64.15, -21.94], 'Europe/London': [51.51, -0.13], 'Europe/Dublin': [53.35, -6.26], 'Europe/Lisbon': [38.72, -9.14],
    'Europe/Madrid': [40.42, -3.7], 'Europe/Paris': [48.86, 2.35], 'Europe/Brussels': [50.85, 4.35], 'Europe/Amsterdam': [52.37, 4.9], 'Europe/Berlin': [52.52, 13.4], 'Europe/Zurich': [47.38, 8.54],
    'Europe/Rome': [41.9, 12.5], 'Europe/Vienna': [48.21, 16.37], 'Europe/Prague': [50.08, 14.44], 'Europe/Warsaw': [52.23, 21.01], 'Europe/Budapest': [47.5, 19.04], 'Europe/Stockholm': [59.33, 18.07],
    'Europe/Oslo': [59.91, 10.75], 'Europe/Copenhagen': [55.68, 12.57], 'Europe/Helsinki': [60.17, 24.94], 'Europe/Athens': [37.98, 23.73], 'Europe/Bucharest': [44.43, 26.1], 'Europe/Belgrade': [44.79, 20.45],
    'Europe/Istanbul': [41.01, 28.98], 'Europe/Kyiv': [50.45, 30.52], 'Europe/Kiev': [50.45, 30.52], 'Europe/Moscow': [55.76, 37.62], 'Africa/Cairo': [30.04, 31.24], 'Africa/Casablanca': [33.57, -7.59],
    'Africa/Algiers': [36.75, 3.06], 'Africa/Lagos': [6.52, 3.38], 'Africa/Accra': [5.6, -0.19], 'Africa/Nairobi': [-1.29, 36.82], 'Africa/Addis_Ababa': [9.03, 38.74], 'Africa/Johannesburg': [-26.2, 28.05],
    'Asia/Jerusalem': [31.77, 35.21], 'Asia/Tel_Aviv': [32.09, 34.78], 'Asia/Baghdad': [33.31, 44.37], 'Asia/Riyadh': [24.71, 46.68], 'Asia/Kuwait': [29.38, 47.99], 'Asia/Qatar': [25.29, 51.53],
    'Asia/Dubai': [25.2, 55.27], 'Asia/Tehran': [35.69, 51.39], 'Asia/Karachi': [24.86, 67.01], 'Asia/Kolkata': [21.15, 79.09], 'Asia/Calcutta': [21.15, 79.09], 'Asia/Colombo': [6.93, 79.86],
    'Asia/Kathmandu': [27.72, 85.32], 'Asia/Dhaka': [23.81, 90.41], 'Asia/Almaty': [43.24, 76.89], 'Asia/Bangkok': [13.76, 100.5], 'Asia/Ho_Chi_Minh': [10.82, 106.63], 'Asia/Jakarta': [-6.21, 106.85],
    'Asia/Singapore': [1.35, 103.82], 'Asia/Kuala_Lumpur': [3.14, 101.69], 'Asia/Manila': [14.6, 120.98], 'Asia/Hong_Kong': [22.32, 114.17], 'Asia/Shanghai': [30.59, 114.31], 'Asia/Taipei': [25.03, 121.57],
    'Asia/Seoul': [37.57, 126.98], 'Asia/Tokyo': [35.68, 139.69], 'Australia/Perth': [-31.95, 115.86], 'Australia/Darwin': [-12.46, 130.84], 'Australia/Adelaide': [-34.93, 138.6],
    'Australia/Brisbane': [-27.47, 153.03], 'Australia/Sydney': [-33.87, 151.21], 'Australia/Melbourne': [-37.81, 144.96], 'Australia/Hobart': [-42.88, 147.33], 'Pacific/Auckland': [-36.85, 174.76],
  };
  function place(tz) {
    if (tz === undefined) { tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* no Intl */ } }
    if (ZONES[tz]) return { lat: ZONES[tz][0], lon: ZONES[tz][1], zone: tz.split('/').pop().replace(/_/g, ' ') };
    const south = /^(Australia|Antarctica|Pacific\/(Auckland|Chatham|Fiji))|America\/(Argentina|Santiago|Sao_Paulo|Montevideo|Asuncion)|Africa\/(Johannesburg|Maputo|Harare|Windhoek)/.test(tz);
    return { lat: south ? -33 : 40, lon: -new Date().getTimezoneOffset() / 4, zone: '' };
  }
  /** Today's sunrise and sunset for this phone (or `polar` when the sun stays up or down all day), with the time zone it was estimated for. */
  const todaySun = (now = Date.now()) => { const p = place(); return { ...sunTimes(now, p.lat, p.lon), zone: p.zone }; };
  /** Light or dark for a mode at a moment. */
  function resolve(m = mode, now = Date.now()) {
    if (m === 'light' || m === 'dark') return m;
    if (m === 'sun') { const s = todaySun(now); return s.polar ? (s.polar === 'day' ? 'light' : 'dark') : (now >= s.rise && now < s.set ? 'light' : 'dark'); }
    return systemDark() ? 'dark' : 'light';
  }

  // ---- switching, with a sunset or a sunrise ------------------------------------------------------------------------------------
  let onChange = null, playing = null;
  const current = () => root.dataset.mode || 'light';
  function show(m) { root.dataset.mode = m; root.style.colorScheme = m; if (onChange) onChange(m); }
  /** Bring the screen in line with the chosen mode; `animate` plays the sky when the change happens while someone is looking. */
  function apply(animate) {
    const want = resolve();
    if (want === current()) return;
    if (!animate || document.hidden || (calmMq && calmMq.matches) || !document.body) return show(want);
    if (playing) { clearTimeout(playing.swap); clearTimeout(playing.done); playing.el.remove(); }
    const el = document.createElement('div');
    el.className = `sky ${want === 'dark' ? 'sunset' : 'sunrise'}`; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<i class="glow"></i><i class="stars"></i><i class="sun"></i><i class="hills"></i>';
    document.body.appendChild(el);
    playing = { el, swap: setTimeout(() => show(want), 1150), done: setTimeout(() => { el.remove(); playing = null; }, 2700) };   // the theme changes while the sky covers the screen
  }
  function set(m) { if (!MODES.includes(m)) return; mode = m; try { localStorage.setItem(KEY, m); } catch (e) { /* kept for this visit only */ } apply(true); }
  // the first paint: no animation
  root.dataset.mode = resolve(); root.style.colorScheme = root.dataset.mode;
  // follow the phone's setting, and the sun (checked every minute, and when the app comes back to the front)
  if (darkMq && darkMq.addEventListener) darkMq.addEventListener('change', () => { if (mode === 'system') apply(true); });
  setInterval(() => { if (mode === 'sun') apply(true); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(false); });
  return {
    MODES, sunTimes, place, todaySun, resolve, apply, set,
    get mode() { return mode; }, isDark: () => current() === 'dark', set onChange(fn) { onChange = fn; },
  };
})();
