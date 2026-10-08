// Matchers de Testing Library (toBeInTheDocument, toHaveTextContent y demás)
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Las pruebas de pantalla corren decenas a la vez en máquinas con poca CPU, y una espera de 1 segundo
// se queda corta aunque la pantalla esté bien. Con 5 segundos de paciencia una pantalla sana pasa
// siempre y una rota sigue fallando, solo que unos segundos después (D-092)
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
