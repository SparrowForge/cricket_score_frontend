/* Firebase Cloud Messaging service worker — receives pushes while the site
 * is closed or backgrounded. Config must match src/lib/firebase.ts. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDFAkGdqS_quhB7y34DblhmVrC8NXpXamI',
  authDomain: 'cricket-livescore-78442.firebaseapp.com',
  projectId: 'cricket-livescore-78442',
  storageBucket: 'cricket-livescore-78442.firebasestorage.app',
  messagingSenderId: '669089233409',
  appId: '1:669089233409:web:1ef9b6592ff8593463de00',
});

const messaging = firebase.messaging();

// Notification-type payloads are displayed by the browser automatically;
// this handler covers data-only messages so they still surface.
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const title = (payload.data && payload.data.title) || 'CricLive';
  const body = (payload.data && payload.data.body) || '';
  self.registration.showNotification(title, { body, icon: '/favicon.ico', data: payload.data });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const matchId = event.notification.data && event.notification.data.match_id;
  event.waitUntil(clients.openWindow(matchId ? `/matches/${matchId}` : '/'));
});
