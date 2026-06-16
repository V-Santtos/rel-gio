import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { syncPushSubscription } from '../lib/pushSubscription';

const DISMISSED_KEY = 'fluxtime.notif-guide-dismissed';

export function useNotificationGuide(userId) {
  useEffect(() => {
    if (!userId) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const timer = setTimeout(() => {
      const anchor = document.getElementById('notif-guide-anchor');
      if (!anchor) return;

      const driverObj = driver({
        overlayOpacity: 0.65,
        popoverClass: 'notif-guide',
        allowClose: false,
        disableActiveInteraction: true,
      });

      driverObj.highlight({
        element: '#notif-guide-anchor',
        popover: {
          title: 'Notificações',
          description:
            'Receba avisos de fim de sessão e alertas de alarme das tarefas mesmo com a aba fechada.',
          showButtons: [],
          onPopoverRender: (popoverEl) => {
            const footer = popoverEl.querySelector('.driver-popover-footer');
            if (!footer) return;
            footer.innerHTML = '';

            const btnAtivar = document.createElement('button');
            btnAtivar.textContent = 'Ativar notificações';
            btnAtivar.className = 'notif-guide-btn notif-guide-btn--primary';
            btnAtivar.addEventListener('click', async () => {
              localStorage.setItem(DISMISSED_KEY, '1');
              driverObj.destroy();
              const permission = await Notification.requestPermission();
              if (permission === 'granted') {
                syncPushSubscription(userId);
              }
            });

            const btnDismiss = document.createElement('button');
            btnDismiss.textContent = 'Agora não';
            btnDismiss.className = 'notif-guide-btn notif-guide-btn--ghost';
            btnDismiss.addEventListener('click', () => {
              localStorage.setItem(DISMISSED_KEY, '1');
              driverObj.destroy();
            });

            footer.appendChild(btnAtivar);
            footer.appendChild(btnDismiss);
          },
        },
      });
    }, 900);

    return () => clearTimeout(timer);
  }, [userId]);
}
