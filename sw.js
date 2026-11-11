/* Minglo Selfie — service worker: boothen starter og kører uden internet. */
const CACHE = 'minglo-selfie-v1';
const SHELL = [
  './',
  './index.html',
  './foto.html',
  './galleri.html',
  './manifest.webmanifest',
  './css/minglo.css',
  './css/booth.css',
  './css/guest.css',
  './js/booth.js',
  './js/admin.js',
  './js/cloud.js',
  './js/compose.js',
  './js/config.js',
  './js/fx.js',
  './js/guest.js',
  './js/qr.js',
  './js/store.js',
  './js/zip.js',
  './vendor/qrcode.mjs',
  './fonts/instrument-serif-latin-400-italic.woff2',
  './fonts/instrument-serif-latin-400-normal.woff2',
  './fonts/outfit-latin-wght-normal.woff2',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Egne filer: svar straks fra cachen og hent en frisk kopi i baggrunden,
// så en opdatering slår igennem næste gang appen åbnes.
// Alt andet (uploads og billeder hos Supabase) går direkte på nettet.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req.url.split('?')[0], res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
