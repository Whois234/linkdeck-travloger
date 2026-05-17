'use client';
/**
 * Firebase client SDK — browser only.
 *
 * IMPORTANT: Firebase config is fetched from the server at runtime via
 * /api/v1/notifications/vapid-key to avoid NEXT_PUBLIC_ build-time
 * embedding issues where the client bundle may have stale/empty values.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';

// These are baked at build time — kept as fallback if fetch fails
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? '',
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? '',
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? '',
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              ?? '',
};

function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

// Initialise (or reuse) Firebase Messaging — only works in browser
function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  try {
    return getMessaging(getFirebaseApp());
  } catch {
    return null;
  }
}

/** Fetch the VAPID key from the server at runtime — bypasses build-time embedding. */
async function fetchVapidKey(): Promise<string> {
  try {
    const res = await fetch('/api/v1/notifications/vapid-key');
    const data = await res.json();
    if (data.vapidKey) return data.vapidKey as string;
  } catch { /* fall through */ }
  // Fallback to build-time value (works if the build was done with env vars set)
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';
}

/**
 * Asks the browser for notification permission, registers the service worker,
 * and returns the FCM registration token.
 *
 * Strategy: try to reuse the existing service worker first (preserves the
 * current FCM token so we don't accumulate stale device rows in the DB).
 * Only does a full SW tear-down + re-register when the existing SW fails
 * (mismatched VAPID key, stale subscription, etc.).
 *
 * Throws with a descriptive message on any unrecoverable failure.
 */
export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const messaging = getFirebaseMessaging();
  if (!messaging) throw new Error('Firebase Messaging could not be initialised. Check NEXT_PUBLIC_FIREBASE_* env vars.');

  const vapidKey = await fetchVapidKey();
  if (!vapidKey) throw new Error('VAPID key is not configured on the server. Check NEXT_PUBLIC_FIREBASE_VAPID_KEY in Vercel env vars.');

  // ── Step 1: Try with the existing service worker ────────────────────────
  // If the SW and VAPID key are still valid, getToken() returns the same
  // token — no new DB row, no token churn.
  try {
    const existingReg = await navigator.serviceWorker.getRegistration('/');
    if (existingReg) {
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: existingReg,
      });
      if (token) return token;
    }
  } catch {
    // SW may be stale (mismatched VAPID key, expired push subscription, etc.)
    // Fall through to full re-registration below.
  }

  // ── Step 2: Full re-registration (only when existing SW fails) ───────────
  // Unsubscribe any existing push subscription so Chrome doesn't hold the
  // old one when we register a new SW.
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const sub = await reg.pushManager.getSubscription().catch(() => null);
      if (sub) await sub.unsubscribe().catch(() => {});
      await reg.unregister().catch(() => {});
    }
  } catch { /* ignore — proceed anyway */ }

  await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });

  // .ready resolves once the SW is active.  PushManager.subscribe() requires
  // state === 'activated', so wait explicitly rather than assuming .ready === activated.
  const activeRegistration = await navigator.serviceWorker.ready;

  if (activeRegistration.active && activeRegistration.active.state !== 'activated') {
    await new Promise<void>((resolve) => {
      const sw = activeRegistration.active!;
      const onStateChange = () => {
        if (sw.state === 'activated') {
          sw.removeEventListener('statechange', onStateChange);
          resolve();
        }
      };
      sw.addEventListener('statechange', onStateChange);
    });
  }

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: activeRegistration,
  });

  if (!token) throw new Error('getToken() returned empty — VAPID key may be wrong or Firebase project config mismatch.');
  return token;
}

/**
 * Returns a Promise that resolves with the next foreground message payload.
 */
export function onMessageListener(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const messaging = getFirebaseMessaging();
    if (!messaging) return reject(new Error('Messaging not available'));
    onMessage(messaging, (payload) => resolve(payload));
  });
}

/**
 * Returns the current FCM token without requesting permission.
 * Returns null if permission is not already granted, no SW is registered, or on error.
 * Will NOT create a new service worker or generate a new token.
 */
export async function getCurrentFcmToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const messaging = getFirebaseMessaging();
    if (!messaging) return null;

    const vapidKey = await fetchVapidKey();
    if (!vapidKey) return null;

    // Only use an already-registered SW. If none exists, return null rather
    // than letting Firebase register one (which would generate a new token).
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return null;

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    return token ?? null;
  } catch {
    return null;
  }
}
