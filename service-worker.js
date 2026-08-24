const CACHE_NAME = 'meow-meow-pwa-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './offline.html',
  './icon-192.png',
  './icon-512.png'
];

const NETWORK_ONLY_PATHS = [
  '/login.html',
  '/admin.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if(request.method !== 'GET') return;

  const url = new URL(request.url);

  // Do not touch Supabase, Gemini, fonts, CDN or any other external request.
  if(url.origin !== self.location.origin) return;

  if(NETWORK_ONLY_PATHS.some(path => url.pathname.endsWith(path))){
    event.respondWith(fetch(request));
    return;
  }

  // HTML/navigation: network first so lessons stay fresh after GitHub updates.
  if(request.mode === 'navigate'){
    event.respondWith(
      fetch(request)
        .then(response => {
          if(response && response.ok){
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          return (await caches.match(request)) ||
                 (await caches.match('./index.html')) ||
                 (await caches.match('./offline.html'));
        })
    );
    return;
  }

  // Same-origin static assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request)
        .then(response => {
          if(response && response.ok){
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
