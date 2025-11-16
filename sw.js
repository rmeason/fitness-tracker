// A simple, "cache-first" service worker
const CACHE_NAME = 'hypertrophy-pwa-cache-v1';

// ---
// 💡💡💡 THIS IS THE FIX 💡💡💡
// We must *only* cache local files. Caching external CDN links
// via addAll() will fail due to CORS.
// ---
const FILES_TO_CACHE = [
  '/',
  'index.html',
  'app.js',
  'manifest.json'
  // DO NOT add the CDN links (e.g., unpkg.com, cdn.tailwindcss.com) here.
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
        // --- 💡 MORE CLARITY AS REQUESTED 💡 ---
        console.error('Service Worker: Failed to cache core app files during install.', err);
        console.error('This is often a typo in the FILES_TO_CACHE array, a network error, or an attempt to cache a cross-origin (CDN) file.');
        console.log('Files attempted to cache:', FILES_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Fetch event: serve from cache first, then network
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // ---
  // This strategy lets network requests for CDNs pass through
  // while caching our local app files (same origin).
  // ---
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // Cache hit - return response
          if (response) {
            return response;
          }
          
          // Not in cache - fetch from network
          return fetch(event.request).then(
            (response) => {
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
            }
          );
        })
    );
  }
  // Let all other requests (CDNs, etc.) go directly to the network
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
