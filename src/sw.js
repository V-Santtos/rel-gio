import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

// Sem isto, o SW novo fica "esperando" e o antigo continua servindo o cache
// velho -> as mudancas so apareciam ao fechar todas as instancias do app.
// skipWaiting + clientsClaim fazem o SW novo assumir na hora; com
// registerType:"autoUpdate" a pagina recarrega sozinha na versao nova.
self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Flux Time', {
      body: data.body ?? 'Alarme do Kanban',
      icon: data.icon ?? '/icon.svg',
      badge: '/icon.svg',
      tag: 'flux-time-alarm',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow('/');
      })
  );
});
