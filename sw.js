/* Summitide Learning (OwlCrest Academy) — service worker (offline cache + update detection).
   BUMP THE VERSION every time you upload changed files; that is what makes
   installed copies show the "Update available" notice. */
const VERSION = 'summitide-v62';
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
  './olc4o.js',
  './colouring.js',
  './hrf3o.js',
  './snc1l2l.js',
  './eng3u.js',
  './mth1w.js',
  './mathcore.js',
  './mathtools.js',
  './math.css',
  './calculator.html',
  // v62: the MTH1W graphs and diagrams (from the teacher's decks and worksheets)
  './mth1w-fig-3-1-a.png',
  './mth1w-fig-3-2-a.png',
  './mth1w-fig-3-2-b.png',
  './mth1w-fig-3-4-a.png',
  './mth1w-fig-3-5-a.png',
  './mth1w-fig-4-1-a.png',
  './mth1w-fig-4-2-a.png',
  './mth1w-fig-4-3-a.png',
  './mth1w-fig-4-3-b.png',
  './mth1w-fig-4-4-a.png',
  './mth1w-fig-4-5-a.png',
  './mth1w-fig-4-5-b.png',
  './mth1w-fig-4-5-c.png',
  './mth1w-fig-4-6-a.png',
  './mth1w-fig-4-6-b.png',
  './mth1w-fig-4-6-c.png',
  './mth1w-fig-4-6-d.png',
  './mth1w-fig-4-7-a.png',
  './mth1w-fig-5-1-a.png',
  './mth1w-fig-5-1-b.png',
  './mth1w-fig-5-1-c.png',
  './mth1w-fig-5-3-a.png',
  './mth1w-fig-5-3-b.png',
  './mth1w-fig-5-4-a.png',
  './mth1w-fig-5-5-a.png',
  './mth1w-fig-5-6-a.png',
  './mth1w-fig-6-1-a.png',
  './mth1w-fig-6-2-a.png',
  './mth1w-fig-6-2-b.png',
  './mth1w-fig-6-3-a.png',
  './mth1w-fig-6-3-b.png',
  './mth1w-fig-6-4-a.png',
  './mth1w-fig-6-4-b.png',
  './mth1w-fig-6-5-a.png',
  './mth1w-fig-7-2-a.png',
  './mth1w-fig-7-2-b.png',
  './mth1w-fig-7-3-a.png',
  './mth1w-fig-7-4-a.png',
  './mth1w-grid.png',
  './mth1w-ws-1-5-q11.png',
  './mth1w-ws-3-1-q4.png',
  './mth1w-ws-4-1-q3.png',
  './mth1w-ws-4-2-q4.png',
  './mth1w-ws-4-4-q2.png',
  './mth1w-ws-4-7-q1.png',
  './mth1w-ws-5-3-q8.png',
  './mth1w-ws-6-1-q5.png',
  './mth1w-ws-6-2-q3.png',
  './mth1w-ws-6-2-q4.png',
  './mth1w-ws-6-2-q5.png',
  './mth1w-ws-6-3-q2.png',
  './mth1w-ws-6-3-q3.png',
  './mth1w-ws-6-3-q5.png',
  './mth1w-ws-6-4-q2.png',
  './mth1w-ws-6-4-q5.png',
  './mth1w-ws-7-2-q4.png',
  './mth1w-ws-7-4-q5.png',
  './storage.js',
  './util.js',
  './badges.js',
  './games.js',
  './print.js',
  './media.js',
  './drive.js',
  './overlay.js',
  './dashboard.js',
  './marking.js',
  './live.js',
  './privacy.js',
  './coins.js',
  './app.js',
  './pwa.js',
  './report.js',
  './html2canvas.min.js',
  './glc2o.js',
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
