import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installErrorReporter } from './app/errorReporter';
// Fuentes servidas desde la app para que funcionen sin conexión (D-061)
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource-variable/lexend';
import '@fontsource-variable/source-serif-4';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('No existe el elemento raíz #root en index.html');
}

// Escucha los errores desde el principio. Los manda solo con el permiso del alumno (D-107)
installErrorReporter();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
