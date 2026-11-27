/* Summitide Learning (OwlCrest Academy) — service worker (offline cache + update detection).
   BUMP THE VERSION every time you upload changed files; that is what makes
   installed copies show the "Update available" notice. */
const VERSION = 'summitide-v77';
const FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo.png',
  './crest.png',
  './opendyslexic-400.woff2',
  './opendyslexic-700.woff2',
  './nunito.woff2',
  './lexend.woff2',
  './patrick-hand.woff2',
  './styles.css',
  './mathcore.js',
  './mathtools.js',
  './math.css',
  './calculator.html',
  './storage.js',
  './util.js',
  './badges.js',
  './games.js',
  './print.js',
  './tables.js',
  './media.js',
  './drive.js',
  './overlay.js',
  './dashboard.js',
  './marking.js',
  './banner.js',
  './marks.js',
  './classes.js',
  './curriculum.js',
  './live.js',
  './privacy.js',
  './records.js',
  './coins.js',
  './app.js',
  './pwa.js',
  './report.js',
  './html2canvas.min.js',
  './cloud-config.js',
  './cloud.js',
  './courseloader.js',
  './firebase-app-compat.js',
  './firebase-auth-compat.js',
  './firebase-firestore-compat.js'
];

self.addEventListener('install', e => {
  // Fetch fresh copies and cache each file on its own, so one missing file cannot break the install.
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(f =>
    fetch(new Request(f, { cache: 'reload' })).then(r => { if (r.ok) return c.put(f, r); }).catch(() => null)
  ))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

// Network first (always fresh when online), cache fallback (works offline).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;                                   // the cloud goes straight to the network
  if (/\/(sw\.js|version\.json|cloud\.json)$/.test(url.pathname)) return;      // update checks always hit the website
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
