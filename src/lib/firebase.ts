import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { api } from './api';

// Public web-app config (safe to ship to the client).
// Must match the copy in public/firebase-messaging-sw.js.
const firebaseConfig = {
  apiKey: 'AIzaSyDFAkGdqS_quhB7y34DblhmVrC8NXpXamI',
  authDomain: 'cricket-livescore-78442.firebaseapp.com',
  projectId: 'cricket-livescore-78442',
  storageBucket: 'cricket-livescore-78442.firebasestorage.app',
  messagingSenderId: '669089233409',
  appId: '1:669089233409:web:1ef9b6592ff8593463de00',
  measurementId: 'G-61V5FJD4TY',
};

const PUSH_FLAG = 'criclive_push_enabled';

function app() {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

/**
 * Fetch (or refresh) the FCM token and register it with the backend.
 * Requires notification permission to already be granted.
 */
async function registerToken(): Promise<boolean> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn('NEXT_PUBLIC_FIREBASE_VAPID_KEY is not set — push disabled');
    return false;
  }
  const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const messaging = getMessaging(app());
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: sw });
  if (!token) return false;
  await api('/me/devices', { method: 'POST', body: { platform: 'web', push_token: token } });

  // Foreground messages don't hit the service worker — surface them ourselves.
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? 'CricLive';
    const body = payload.notification?.body ?? '';
    new Notification(title, { body, icon: '/favicon.ico', data: payload.data });
  });
  localStorage.setItem(PUSH_FLAG, '1');
  return true;
}

export type PushStatus = 'granted' | 'denied' | 'unsupported' | 'error';

/** Ask for permission and register this browser for push. Call from a user gesture. */
export async function enablePush(): Promise<PushStatus> {
  try {
    if (typeof window === 'undefined' || !(await isSupported())) return 'unsupported';
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    return (await registerToken()) ? 'granted' : 'error';
  } catch (err) {
    console.warn('enablePush failed', err);
    return 'error';
  }
}

/** Silent re-registration on app load — FCM tokens rotate, so refresh ours. */
export async function initPushIfEnabled(): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(PUSH_FLAG) !== '1') return;
    if (Notification.permission !== 'granted' || !(await isSupported())) return;
    await registerToken();
  } catch { /* best effort */ }
}

export function pushEnabled(): boolean {
  return typeof window !== 'undefined'
    && localStorage.getItem(PUSH_FLAG) === '1'
    && typeof Notification !== 'undefined'
    && Notification.permission === 'granted';
}
