'use client';
import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;

    // Register (or re-register) the service worker
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {}); // silently ignore if blocked (e.g. incognito)

    // When a new SW takes over (skipWaiting + clients.claim), reload immediately
    // so the page picks up fresh HTML and new JS chunk hashes.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }, []);

  return null;
}
