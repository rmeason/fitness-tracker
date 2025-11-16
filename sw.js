// A simple, "cache-first" service worker
const CACHE_NAME = 'hypertrophy-pwa-cache-v2'; // Note: Version bump to force update

// ---
// 💡💡💡 THIS IS THE FIX 💡💡💡
// We are using explicit relative paths './' to avoid any
// pathing ambiguity with GitHub Pages.
// ---
const FILES_TO_CACHE = [
  './',
  './index.html',
  './app.js',
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
        console.error('This is often a typo in the FILES_TO_CACHE array, a network error, or one of the files returning a 404.');
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
            // Check if we received a valid response
            if (!response || response.status !== 200) {
              return response;
            }

            // Clone the response and cache it
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
