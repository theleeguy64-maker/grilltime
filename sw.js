'use strict';
/* GrillTime service worker — cache-first app shell for offline use.
 * Only ever runs when served over https/localhost (file:// can't register a SW). */
const CACHE = 'grilltime-v0.1.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './timing.js',
  './storage.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((resp) => {
      // Runtime-cache same-origin GETs so the shell stays fresh.
      const copy = resp.clone();
      caches.open(CACHE).then((c) => { try { c.put(e.request, copy); } catch (_) {} });
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
