// Sustituto de virtual:pwa-register/react para Vitest. No hay service worker en jsdom.
import { useState } from 'react';

export function useRegisterSW() {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return { needRefresh, offlineReady, updateServiceWorker: () => Promise.resolve() };
}
