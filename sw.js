// A simple, "cache-first" service worker
const CACHE_NAME = 'hypertrophy-pwa-cache-v1';

// ---
// 💡 FIX: Removed all CDN URLs. The service worker should only cache
// local files. The browser will handle caching CDN assets.
// ---
const FILES_TO_CACHE = [
  '/',
  'index.html',
  'app.js',
  'manifest.json'
];

// Install event: cache all core files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        // Use addAll with a catch block to prevent a single failed asset from
        // stopping the entire service worker installation.
        return cache.addAll(FILES_TO_CACHE).catch(err => {
          console.error('Failed to cache files during install:', err);
        });
      })
  );
  self.skipWaiting();
});

// Fetch event: serve from cache first, then network
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests for our local assets
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Only handle requests for files we would cache (local files)
  // This lets all other requests (CDNs, etc.) pass through to the network
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

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
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
