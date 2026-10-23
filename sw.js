const CACHE = 'little-log-v2';
const FILES = ['./', 'index.html', 'style.css', 'config.js', 'auth.js', 'sync.js', 'cloud.js', 'account.js', 'app.js', 'vendor/qrcode.js', 'vendor/jsqr.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  // Only cache this app's own files. API calls (baby data, auth, cloud storage) must never be cached.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
