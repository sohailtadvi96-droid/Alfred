// ALFRED service worker. Deliberately empty of behaviour for now: no fetch
// handler and no caching (Alfred is useless offline, and a cache is how a
// PWA gets stuck on an old build), no push handler yet (phone track P2).
// It exists so the installed app has a worker to subscribe push through.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
