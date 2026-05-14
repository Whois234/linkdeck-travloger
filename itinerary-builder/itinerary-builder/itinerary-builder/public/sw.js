// KILL SWITCH — wipes all caches and unregisters this SW permanently.
// Deployed because a previous SW version was caching stale JS chunks.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_KILLED' }));
        return self.registration.unregister();
      })
  );
});
