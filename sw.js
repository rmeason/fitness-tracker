const CACHE_NAME = 'hypertrophy-pwa-cache-v4'; //  Version bumped to v4

const FILES_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './coach.js', // <-- NEW FILE ADDED
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
  if (event.request.method !== 'GET') {
    return;
  }
  
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
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
