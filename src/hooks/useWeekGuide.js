import { useEffect } from 'react';
import { driver } from 'driver.js';

const DISMISSED_KEY = 'fluxtime.week-guide-dismissed';

export function useWeekGuide(boardMode, boardReady) {
  useEffect(() => {
    if (boardMode !== 'week') return;
    if (!boardReady) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const timer = setTimeout(() => {
      const anchor = document.querySelector('.lane__alarm');
      if (!anchor) return;

      const driverObj = driver({
        overlayOpacity: 0.65,
        popoverClass: 'notif-guide',
        allowClose: false,
        disableActiveInteraction: true,
      });

      driverObj.highlight({
        element: '.lane__alarm',
        popover: {
          title: 'Alarmes por dia',
          description:
            'Toque no sino de qualquer coluna para configurar um alarme personalizado para aquele dia. Ele dispara mesmo com a aba em segundo plano.',
          showButtons: [],
          onPopoverRender: (popoverEl) => {
            const footer = popoverEl.querySelector('.driver-popover-footer');
            if (!footer) return;
            footer.innerHTML = '';

            const btn = document.createElement('button');
            btn.textContent = 'Entendi';
            btn.className = 'notif-guide-btn notif-guide-btn--primary';
            btn.addEventListener('click', () => {
              localStorage.setItem(DISMISSED_KEY, '1');
              driverObj.destroy();
            });

            footer.appendChild(btn);
          },
        },
      });
    }, 600);

    return () => clearTimeout(timer);
  }, [boardMode, boardReady]);
}
