const CACHE_NAME = 'hypertrophy-pwa-cache-v23'; // Force re-run migration v5 to fix cycleDay values

const FILES_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './coach.js',
  './manifest.json'
];

// Install event: cache all core files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Opened cache');
        return cache.addAll(FILES_TO_CACHE);
      })
      .catch((err) => {
        console.error('Service Worker: Failed to cache core app files during install.', err);
        console.log('Files attempted to cache:', FILES_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Fetch event: serve from cache first, then network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. If it's an AI call, go to network ONLY.
  if (url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. If it's a local file, use cache-first.
  if (event.request.method === 'GET' && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request).then((response) => {
            if (!response || response.status !== 200) {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            return response;
          });
        })
    );
  }
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

