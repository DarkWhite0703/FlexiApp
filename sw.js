const CACHE_NAME = 'Rudo-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './favicon.svg'
];

// Installation du Service Worker et mise en cache des fichiers essentiels
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Distribution des fichiers mis en cache si réseau indisponible
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});