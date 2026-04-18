const CACHE = 'teknoblog-radar-v1';
const ASSETS = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
